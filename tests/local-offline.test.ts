import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { localRequest, validateLocalOutput, scoreLocalBinding, LOCAL_MODEL, type LocalTask, type LocalLabel, type LocalResult } from "../src/evaluation/local-offline.ts";
import { prepareLocalStudy, runLocalStudy, scoreLocalStudy, verifyLocalStudy, selectValidation } from "../scripts/local-offline-study.ts";

const task: LocalTask = { id: "hidden-control-id", kind: "binding", split: "development", input: { patient: "The rash is itchy.", claim: "Fever is unreported.", sourceText: null } };
const output = { verdict: "supported", claimQuote: task.input.claim, patientQuotes: ["The rash is itchy."], sourceQuotes: [], explanation: "The text says nothing about fever." };

test("request projects patient/claim/source only and rejects oversized UTF-8 inputs without truncation", () => {
  const contaminated = { ...task, expected: "SECRET_GOLD", family: "SECRET_FAMILY", input: { ...task.input, acceptedRoutes: ["SECRET_ROUTE"], expected: "SECRET_EXPECTED" } };
  const request = localRequest(contaminated);
  const text = JSON.stringify(request);
  for (const secret of ["SECRET_GOLD", "SECRET_FAMILY", "SECRET_ROUTE", "SECRET_EXPECTED", task.id]) assert.equal(text.includes(secret), false);
  assert.equal(request.model, LOCAL_MODEL.name);
  assert.equal(request.think, true);
  assert.throws(() => localRequest({ ...task, input: { ...task.input, patient: "😄".repeat(3000) } }), /CONTEXT_BUDGET/);
  assert.throws(() => localRequest({ ...task, input: { ...task.input, patient: "x".repeat(3000) } }), /CONTEXT_BUDGET/);
  assert.equal(task.input.patient, "The rash is itchy.");
});

test("literal quotation checks do not confer semantic correctness or forgive invented quotes", () => {
  assert.equal(validateLocalOutput(task, output).integrity.valid, true);
  const falseQuote = validateLocalOutput(task, { ...output, patientQuotes: ["No fever."] });
  assert.deepEqual(falseQuote.integrity.errors, ["PATIENT_QUOTE_NOT_FOUND"]);
  assert.equal(validateLocalOutput(task, { ...output, sourceQuotes: ["Guideline"] }).integrity.valid, false);
  assert.equal(validateLocalOutput(task, { ...output, claimQuote: "Different target" }).integrity.valid, false);
  assert.equal(validateLocalOutput(task, { ...output, verdict: "unsupported" }).integrity.valid, true);
});

test("mined quotes and proposed negatives must bind to the unchanged source packet", () => {
  const seed: LocalTask = { id: "seed", kind: "mine", split: "mining", input: { patient: "I have one tablet.", draft: "One tablet remains.", sourceText: null } };
  const issue = { draftQuote: "One tablet remains.", patientQuotes: ["one tablet"], sourceQuotes: [], explanation: "A narrow hypothesis, not clinical validation." };
  assert.equal(validateLocalOutput(seed, { issues: [issue], limitations: "Only these supplied texts were examined." }).integrity.valid, true);
  assert.equal(validateLocalOutput(seed, { issues: [{ ...issue, draftQuote: "No tablet remains." }], limitations: "Only supplied text reviewed." }).integrity.valid, false);
  const negative = { controlClaim: "One tablet remains.", defectClaim: "No tablets remain.", patientQuotes: ["one tablet"], sourceQuotes: [], explanation: "The proposed mutation contradicts the remaining count." };
  assert.equal(validateLocalOutput({ ...seed, kind: "hard_negative" }, negative).integrity.valid, true);
  assert.equal(validateLocalOutput({ ...seed, kind: "hard_negative" }, { ...negative, defectClaim: negative.controlClaim }).integrity.valid, false);
});

test("fixed denominators retain absent, abstaining and invalid-quote responses", () => {
  const tasks = Array.from({ length: 24 }, (_, i) => ({ ...task, id: `t${i}` }));
  const labels: LocalLabel[] = tasks.map((t, i) => ({ id: t.id, family: `family${Math.floor(i / 2)}`, variant: i % 2 ? "defect" : "control", expected: i % 2 ? "unsupported" : "supported" }));
  const results: LocalResult[] = tasks.map((t, i) => ({ id: t.id, status: "ok", output: { ...output, verdict: labels[i].expected }, wallSeconds: 1 }));
  assert.equal(scoreLocalBinding(tasks, labels, results).offlineUtilityGate, true);
  results[0].output = { ...output, verdict: "unsupported" };
  results[2].output = { ...output, verdict: "uncertain" };
  results[3].output = { ...output, verdict: "unsupported", patientQuotes: ["invented"] };
  results.pop();
  const scored = scoreLocalBinding(tasks, labels, results);
  assert.equal(scored.summary.planned, 24);
  assert.equal(scored.summary.defectDenominator, 12);
  assert.equal(scored.summary.controlDenominator, 12);
  assert.equal(scored.summary.falseAlarms, 1);
  assert.equal(scored.summary.abstentions, 1);
  assert.equal(scored.summary.invalidQuotes, 1);
  assert.equal(scored.rows.find(r => r.id === "t3")?.correct, false);
  assert.equal(scored.rows.at(-1)?.status, "unattempted");
  assert.equal(scored.releasePromotion, false);
  assert.throws(() => scoreLocalBinding(tasks, labels, [...results, results[0]]), /DUPLICATE_LOCAL_ID/);
});

test("first attempts preserve errors, resume never generates again, and score binds success to raw output", async () => {
  const parent = mkdtempSync(join(tmpdir(), "counsel-local-study-test-")), dir = join(parent, "study");
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    prepareLocalStudy(dir);
    assert.throws(() => prepareLocalStudy(dir), /ALREADY_EXISTS/);
    await assert.rejects(runLocalStudy(dir, "validation"), /SELECT_FROZEN_PROMPT/);
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      assert.equal(new URL(String(url)).origin, "http://127.0.0.1:11434");
      assert.equal(init?.redirect, "error");
      const path = new URL(String(url)).pathname;
      if (path === "/api/tags") return Response.json({ models: [{ name: `${LOCAL_MODEL.name}:latest`, digest: LOCAL_MODEL.digest }] });
      if (path !== "/api/chat") return Response.json({ version: "test", models: [] });
      calls++;
      const req = JSON.parse(String(init?.body)), input = JSON.parse(req.messages[0].content.split("INPUT_JSON:\n")[1]);
      if (calls === 2) throw new Error("Simulated interrupted transport");
      // Native JSON-schema output can order keys differently from Zod's object.
      const reordered = Object.fromEntries(Object.entries({ ...output, claimQuote: input.claim, patientQuotes: [] }).reverse());
      return Response.json({ done: true, done_reason: "stop", message: { content: JSON.stringify(reordered) }, load_duration: 0, total_duration: 1e9, prompt_eval_count: 100, eval_count: 50, eval_duration: 1e9 });
    }) as typeof fetch;
    await runLocalStudy(dir, "development");
    assert.equal(calls, 24);
    await runLocalStudy(dir, "development");
    assert.equal(calls, 24);
    const report = scoreLocalStudy(dir);
    assert.equal(report.binding.development.summary.recorded, 24);
    assert.equal(report.binding.development.rows.filter(r => r.status === "error").length, 1);
    assert.equal(report.binding.validation.summary.recorded, 0);
    assert.throws(() => selectValidation(dir), /DEVELOPMENT_UTILITY_GATE_FAILED/);
    assert.equal(existsSync(join(dir, "validation-selection.json")), false);
    assert.throws(() => verifyLocalStudy(dir, "--bad-ref"), /SOURCE_COMMIT_INVALID/);
    const { plan } = verifyLocalStudy(dir);
    const successful = plan.tasks.find(t => t.split === "development" && JSON.parse(readFileSync(join(dir, `${t.id}-result.json`), "utf8")).status === "ok")!;
    const path = join(dir, `${successful.id}-result.json`), saved = JSON.parse(readFileSync(path, "utf8"));
    // A started row is not terminal while its result artifact is absent.
    rmSync(path);
    assert.throws(() => selectValidation(dir), /DEVELOPMENT_INCOMPLETE/);
    assert.equal(existsSync(join(dir, "validation-selection.json")), false);
    writeFileSync(path, JSON.stringify(saved), { flag: "wx" });
    saved.output.verdict = "unsupported"; writeFileSync(path, JSON.stringify(saved));
    assert.throws(() => scoreLocalStudy(dir), /RAW_MISMATCH/);
    assert.equal(existsSync(join(tmpdir(), "counsel-local-offline-ollama.lock")), false);
  } finally { globalThis.fetch = originalFetch; rmSync(parent, { recursive: true, force: true }); }
});
