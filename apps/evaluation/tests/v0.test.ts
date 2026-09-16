import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { evaluationCases } from "../lib/cases.ts";
import { runV0Message } from "../lib/v0-service.ts";
import { createV0Handler } from "../lib/v0-handler.ts";
import * as contract from "../lib/v0-contract.ts";

function request(body: unknown = { message: "Fictional symptom question.", syntheticOnly: true }, overrides: { method?: string; origin?: string; host?: string; marker?: string; contentType?: string } = {}) {
  const method = overrides.method ?? "POST";
  return new Request("http://localhost:4120/api/v0", { method,
    headers: { host: overrides.host ?? "localhost:4120", origin: overrides.origin ?? "http://localhost:4120", "x-counsel-review": overrides.marker ?? "local-v1", "Content-Type": overrides.contentType ?? "application/json" },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
}

test("V0 GUI executes the actual Mastra graph for all 50 samples without model calls or prediction lookup", async () => {
  const runIds = new Set<string>();
  for (const sample of evaluationCases) {
    const result = await runV0Message(sample.message);
    assert.equal(result.route.disposition, sample.v0.disposition, sample.id);
    assert.equal(result.executionMode, "deterministic_mastra");
    assert.equal(result.modelCalls, 0);
    assert.equal(result.matchedCaseId, sample.id);
    assert.equal(result.clinicalEvidence?.caseId, sample.id);
    assert.deepEqual(result.steps.map((step) => step.id), ["red-flag-checklist", "intent-history", "hard-escalation-gate", "disposition-router"]);
    assert.ok(result.steps.every((step) => step.status === "success" && step.durationMs !== null && step.durationMs >= 0));
    assert.equal(result.safetyReview.clinicalClearanceEstablished, false);
    runIds.add(result.runId);
  }
  assert.equal(runIds.size, 50);
});

test("edits cannot inherit sample-specific differential evidence or retain an old displayed result", async () => {
  const original = evaluationCases[1].message;
  const result = await runV0Message(original);
  assert.equal(contract.currentV0Run(result, original), result);
  assert.equal(contract.currentV0Run(result, `${original} Additional symptoms.`), null);
  assert.equal(contract.currentV0Run(null, original), null);
  const modified = await runV0Message(`${original} Additional symptoms.`);
  assert.equal(modified.matchedCaseId, null);
  assert.equal(modified.clinicalEvidence, null);
  assert.notEqual(modified.runId, result.runId);
  assert.equal(modified.route.disposition, "EMERGENCY_NOW");
});

test("local V0 HTTP boundary rejects foreign origins, rebinding and missing local marker before execution", async () => {
  let calls = 0;
  const handler = createV0Handler(async () => { calls++; throw new Error("must not execute"); });
  for (const overrides of [{ origin: "https://attacker.example" }, { host: "attacker.example" }, { marker: "" }]) assert.equal((await handler(request(undefined, overrides))).status, 403);
  assert.equal(calls, 0);
});

test("V0 input requires synthetic acknowledgement and a bounded nonempty message", async () => {
  let calls = 0;
  const handler = createV0Handler(async () => { calls++; throw new Error("must not execute"); });
  for (const body of [{ message: " ", syntheticOnly: true }, { message: "hello" }, { message: "hello", syntheticOnly: false }, { message: "x".repeat(12_001), syntheticOnly: true }, { message: "hello", syntheticOnly: true, suppliedDisposition: "SELF_CARE" }]) assert.equal((await handler(request(body))).status, 400);
  assert.equal((await handler(request({ message: "x".repeat(70_000), syntheticOnly: true }))).status, 413);
  assert.equal((await handler(request(undefined, { contentType: "text/plain" }))).status, 415);
  assert.equal((await handler(request(undefined, { method: "GET" }))).status, 405);
  assert.equal(calls, 0);
});

test("V0 returns the actual result without caching and sanitizes failures without a substitute route", async () => {
  const handler = createV0Handler(runV0Message);
  const response = await handler(request({ message: evaluationCases[1].message, syntheticOnly: true }));
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(result.route.disposition, "EMERGENCY_NOW");
  const fail = createV0Handler(async () => { throw new Error("PRIVATE_ERROR_CANARY"); });
  const failure = await fail(request());
  assert.equal(failure.status, 503);
  assert.deepEqual(await failure.json(), { error: "V0_UNAVAILABLE" });
});

test("V0 concurrency is bounded and releases admission after completion", async () => {
  const result = await runV0Message(evaluationCases[0].message);
  const releases: Array<() => void> = [];
  const handler = createV0Handler(async () => { await new Promise<void>((resolve) => releases.push(resolve)); return result; });
  const one = handler(request());
  const two = handler(request());
  assert.equal((await handler(request())).status, 429);
  while (releases.length < 2) await new Promise<void>((resolve) => setImmediate(resolve));
  releases.forEach((release) => release());
  assert.equal((await one).status, 200);
  assert.equal((await two).status, 200);
});

test("real V0 UI contains the official local logo and runnable form without implying an official service", async () => {
  const { V0Workbench, V0Result } = await renderedComponents();
  const html = renderToStaticMarkup(createElement(V0Workbench, { samples: evaluationCases.map(({ id, message }) => ({ id, message })) }));
  assert.match(html, /src="\/counsel-symbol.svg"/);
  assert.doesNotMatch(html, /src="\/counsel-logo.svg"|counsel-flow-waves/);
  assert.match(html, /Assess message/);
  assert.match(html, /role="status"[^>]*>Ready</);
  assert.match(html, /Browse all 50 cases/);
  assert.doesNotMatch(html, /From message to next step|Sample inbox|The next step, with its reasoning/);
  assert.match(html, /Not a Counsel service/);
  assert.match(html, /rules-based Mastra workflow/);
  assert.match(html, /No model calls/);
  const result = await runV0Message(evaluationCases[1].message);
  {
    const output = renderToStaticMarkup(createElement(V0Result, { result }));
    assert.match(output, /Emergency now/);
    assert.match(output, /Call 911 now/);
    assert.match(output, /Escalation locked · downgrade blocked/);
    assert.match(output, /Safety &amp; sources/);
    assert.match(output, /Execution details/);
    assert.doesNotMatch(output, /High confidence|New comparison exports/);
    assert.match(output, /does not record a clinician review/);
  }
  const logo = readFileSync(new URL("../public/counsel-symbol.svg", import.meta.url), "utf8");
  assert.match(logo, /viewBox="0 0 50 51"/);
  assert.match(logo, /#243866/i);
  assert.doesNotMatch(logo, /<(?:script|foreignObject|image)\b|\bon\w+=|(?:href|xlink:href)=/i);
  assert.equal((logo.match(/<path /g) ?? []).length, 6);
  // Only the fill changes from ivory to brand blue; all official path data is preserved.
  assert.equal(createHash("sha256").update(logo.replaceAll("#243866", "#F9F8F5")).digest("hex"), "4de2ef5d61939237ee1f1e934d37aeac29e1577322aecf063035f8d6e529f9d7");
});

test("concise answer preserves every route, exact action, uncertainty and research provenance before collapsed details", async () => {
  const { V0Result } = await renderedComponents();
  const routes = new Set<string>();
  const escape = (value: string) => renderToStaticMarkup(createElement("span", null, value)).replace(/^<span>|<\/span>$/g, "");
  for (const sample of evaluationCases) {
    const result = await runV0Message(sample.message);
    routes.add(result.route.disposition);
    const html = renderToStaticMarkup(createElement(V0Result, { result }));
    const firstDetails = html.indexOf('<details class="v0-detail"');
    assert.ok(firstDetails > 0);
    const visible = html.slice(0, firstDetails);
    assert.ok(visible.includes(escape(result.route.patientDirective)), sample.id);
    assert.ok(visible.includes(escape(result.route.rationale)), sample.id);
    assert.match(visible, /Safety is not established by this limited screen/);
    assert.match(visible, /curated research, not V0 reasoning/);
    for (const item of result.clinicalEvidence?.differential ?? []) assert.ok(visible.includes(escape(item)), sample.id);
    assert.doesNotMatch(html, /<details class="v0-detail"[^>]*\bopen\b|role="tablist"|High confidence/);
    if (result.route.disposition === "EMERGENCY_NOW") assert.match(visible, /Do not delay emergency action/);
  }
  assert.equal(routes.size, 4);
});

test("edited input cannot display a sample differential and vital mentions never become normal readings", async () => {
  const { V0Result } = await renderedComponents();
  const result = await runV0Message("Fictional message. I have chest pain. My BP is 80/50.");
  const html = renderToStaticMarkup(createElement(V0Result, { result }));
  assert.match(html, /No case-bound differential for this message/);
  assert.match(html, /Vital mentions to verify: Blood pressure/);
  assert.doesNotMatch(html, /curated research, not V0 reasoning|Vitals are normal/);
  assert.equal(contract.currentV0Run(result, `${result.message} Changed.`), null);
});

test("Counsel fingerprint C is static without a playback control", async () => {
  const { CounselFlowLogo } = await renderedComponents();
  const html = renderToStaticMarkup(createElement(CounselFlowLogo));
  assert.match(html, /src="\/counsel-symbol.svg"[^>]*alt="Counsel C symbol"/);
  assert.doesNotMatch(html, /<button|data-paused|counsel-c-flow|Pause|Play/);
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /counsel-c-wave|counsel-flow-toggle|counsel-c-flow/);
  const base = css.match(/\.counsel-c-art > img \{[^}]+\}/)?.[0];
  assert.ok(base);
  assert.doesNotMatch(base, /animation|transform/);
});

// Compile actual components for server rendering; no screenshot/DOM automation.
async function renderedComponents() {
  const require = createRequire(import.meta.url);
  const { transform, loadBindings } = require("next/dist/build/swc");
  await loadBindings();
  const cache: Record<string, unknown> = { "../lib/v0-contract": contract };
  for (const name of ["clinical-evidence-panel", "response-safety-panel", "v0-workbench"]) {
    const { code } = await transform(readFileSync(new URL(`../components/${name}.tsx`, import.meta.url), "utf8"), { filename: `${name}.tsx`, jsc: { parser: { syntax: "typescript", tsx: true }, target: "es2022", transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
    const module = { exports: {} };
    new Function("require", "module", "exports", code)((id: string) => cache[id] ?? require(id), module, module.exports);
    cache[`./${name}`] = module.exports;
  }
  return cache["./v0-workbench"] as Record<string, (props: Record<string, unknown>) => ReturnType<typeof createElement>>;
}
