/** Independent Astra effort experiment. Generation never imports a scorer or opens physician labels. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { BUCKETS, SYSTEM_PROMPT, loadCases, readJSON, sha256, writeJSON } from "./stripped-3bucket-baseline.mjs";

export { BUCKETS, SYSTEM_PROMPT };
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const EFFORTS = Object.freeze(["xhigh", "max"]);
export const MODEL = "gpt-6-astra";
export const OUTPUTS = Object.fromEntries(EFFORTS.map(e => [e, join(ROOT, `outputs/stripped-3bucket-astra-${e}-2026-09-15`)]));
export const ACCESS = join(ROOT, "outputs/stripped-3bucket-astra-access-2026-09-15");
export const PRICING = Object.freeze({ inputUSDPerMillion: 10, outputUSDPerMillion: 50, cachedInputUSDPerMillion: 1, cacheWriteUSDPerMillion: 12.5, source: "https://developers.openai.com/api/docs/models/gpt-6-astra", checkedAt: "2026-09-15" });

export function buildRequest({ message }, effort) {
  assert(EFFORTS.includes(effort), "Only the verified xhigh and max API efforts are registered");
  assert(typeof message === "string" && message.trim(), "A patient message is required");
  return { model: MODEL, max_output_tokens: 4096, reasoning: { effort }, instructions: SYSTEM_PROMPT, input: [{ role: "user", content: message }], store: false };
}

export function parseDisposition(response) {
  assert.equal(response?.status, "completed", `Incomplete provider response: ${response?.status}`);
  assert.equal(response.error ?? null, null, "Provider response has an error");
  const messages = (response.output ?? []).filter(item => item.type === "message");
  assert.equal(messages.length, 1, "Expected one final assistant message");
  assert.equal(messages[0].role, "assistant");
  assert(!(response.output ?? []).some(item => !["reasoning", "message"].includes(item.type)), "Unexpected tool or output item");
  assert(messages[0].content.every(block => block.type === "output_text"), "Refusal or non-text output");
  const text = messages[0].content.map(block => block.text).join("\n").trim();
  const parsed = JSON.parse(text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```$/, ""));
  assert(BUCKETS.includes(parsed?.disposition), "Invalid three-bucket disposition");
  assert(typeof parsed.rationale === "string" && parsed.rationale.trim(), "Missing rationale");
  assert.deepEqual(Object.keys(parsed).sort(), ["disposition", "rationale"], "Unexpected output fields");
  return parsed;
}

export function reservationUSD(body) {
  // Byte length overestimates text tokens; extra envelope and doubled cache-write input rate.
  return ((Buffer.byteLength(JSON.stringify(body)) + 2048) * 25 + body.max_output_tokens * 50) / 1e6;
}

export function usageCost(usage, reservedUSD) {
  const known = usage && [usage.input_tokens, usage.output_tokens].every(n => Number.isInteger(n) && n >= 0);
  return known ? {
    estimatedUSD: (usage.input_tokens * 10 + usage.output_tokens * 50) / 1e6,
    accountedUSD: (usage.input_tokens * 25 + usage.output_tokens * 50) / 1e6,
  } : { estimatedUSD: null, accountedUSD: reservedUSD };
}

function protectedFiles() {
  const paths = execFileSync("git", ["ls-files", "src", "apps", "package.json", "package-lock.json"], { cwd: ROOT, encoding: "utf8" }).trim().split("\n").filter(Boolean);
  return Object.fromEntries(paths.map(p => [p, sha256(readFileSync(join(ROOT, p)))]));
}

function verifyFrozen(manifest, output) {
  assert.equal(manifest.model, MODEL);
  assert.equal(manifest.sourceSHA256, sha256(readFileSync(fileURLToPath(import.meta.url))), "Generator changed after freeze");
  assert.equal(manifest.promptSHA256, sha256(SYSTEM_PROMPT));
  assert.equal(manifest.csvSHA256, sha256(readFileSync(manifest.csvPath)));
  for (const [p, hash] of Object.entries(manifest.protectedFiles)) assert.equal(sha256(readFileSync(join(ROOT, p))), hash, `Application changed: ${p}`);
  for (const c of manifest.cases) {
    assert.equal(c.inputSHA256, sha256(c.message));
    assert.equal(manifest.requestHashes[c.id], sha256(JSON.stringify(buildRequest(c, manifest.effort))));
  }
  if (existsSync(join(output, "generation-complete.json"))) {
    for (const [p, hash] of Object.entries(readJSON(join(output, "generation-complete.json")).artifactHashes)) assert.equal(sha256(readFileSync(join(output, p))), hash, `Frozen record changed: ${p}`);
  }
}

function freezePlans(csvPath) {
  const cases = loadCases(readFileSync(csvPath, "utf8"));
  const fable = readJSON(join(ROOT, "outputs/stripped-3bucket-fable-2026-09-15/manifest.json"));
  assert.equal(fable.systemPrompt, SYSTEM_PROMPT, "Frozen Fable prompt differs");
  assert.equal(fable.promptSHA256, sha256(SYSTEM_PROMPT));
  const priorPath = join(ROOT, "outputs/stripped-3bucket-fable-max-2026-09-15/generation-complete.json");
  const prior = readJSON(priorPath);
  const guiDir = join(ROOT, "apps/evaluation/.local/stripped-disposition");
  const gui = existsSync(guiDir) ? readdirSync(guiDir).filter(p => p.endsWith("-started.json")).map(p => {
    const start = readJSON(join(guiDir, p)), endPath = join(guiDir, p.replace("-started.json", "-complete.json"));
    return { id: start.id, accountedOrOutstandingUSD: existsSync(endPath) ? readJSON(endPath).accountedUSD : start.reservedUSD };
  }) : [];
  const guiAccounted = gui.reduce((sum, r) => sum + r.accountedOrOutstandingUSD, 0);
  // Reserve the entire independent GUI allowance so concurrent manual demos cannot overspend the balance.
  const guiAllowanceReserve = Math.max(2, guiAccounted);
  const totalReservedUSD = EFFORTS.reduce((sum, effort) => sum + cases.reduce((n, c) => n + reservationUSD(buildRequest(c, effort)), 0), 0);
  assert(totalReservedUSD <= 35, "Experiment exceeds its $35 maximum reservation");
  assert(totalReservedUSD + guiAllowanceReserve <= prior.remainingAllocationUSD, "Insufficient reconciled budget");
  const modelInfo = readJSON(join(ACCESS, "model-preflight.json"));
  const ultra = readJSON(join(ACCESS, "ultra-capability.json"));
  assert.equal(modelInfo.status, 200); assert.equal(modelInfo.body.id, MODEL);
  assert.equal(ultra.status, 400); assert.equal(ultra.response.error.param, "reasoning.effort");
  const protectedSnapshot = protectedFiles();
  for (const effort of EFFORTS) {
    const output = OUTPUTS[effort], manifestPath = join(output, "manifest.json");
    if (existsSync(manifestPath)) { verifyFrozen(readJSON(manifestPath), output); continue; }
    assert(!existsSync(output), "Use a fresh output directory");
    const settings = buildRequest({ message: "placeholder" }, effort);
    delete settings.instructions; delete settings.input;
    const manifest = {
      protocol: "stripped-3bucket-astra/v1", frozenAt: new Date().toISOString(), provider: "OpenAI Responses API", endpoint: "https://api.openai.com/v1/responses", model: MODEL, effort, settings,
      systemPrompt: SYSTEM_PROMPT, promptSHA256: sha256(SYSTEM_PROMPT), csvPath, csvSHA256: sha256(readFileSync(csvPath)),
      sourceSHA256: sha256(readFileSync(fileURLToPath(import.meta.url))), sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(),
      cases: cases.map(c => ({ ...c, inputSHA256: sha256(c.message) })), requestHashes: Object.fromEntries(cases.map(c => [c.id, sha256(JSON.stringify(buildRequest(c, effort)))])),
      callPolicy: { cases: 50, callsPerCase: 1, automaticRetries: 0, fallbackCalls: 0, judgeCalls: 0, sharedConcurrencyAcrossArms: 4, dispatchOrder: "case order, alternating xhigh and max", timeoutMs: 300000 },
      comparison: { fableSource: "outputs/stripped-3bucket-fable-2026-09-15", promptUnchanged: true, outputTokenCeilingUnchanged: true, providerTransportChanged: true, csvScored: false, purpose: "Physician-development reference agreement and exact disagreements with Fable. No gold or CSV labels in provider context." },
      requestedUltra: { available: false, evidence: "outputs/stripped-3bucket-astra-access-2026-09-15/ultra-capability.json", alternative: "max", note: "Max is the highest accepted direct API effort; it is not represented as Codex Ultra." },
      pricing: { ...PRICING, interpretation: "EstimatedUSD is a standard uncached token estimate, not an invoice. AccountedUSD charges all input at $25/M to conservatively cover caching. Unknown usage reserves full case cost." },
      budget: { ceilingUSD: 95, priorSource: priorPath, priorAccountedUSD: prior.priorAccountedUSD + prior.accountedUSD, priorRemainingUSD: prior.remainingAllocationUSD, guiAccountedAtFreezeUSD: guiAccounted, guiRecords: gui, guiAllowanceReservedUSD: guiAllowanceReserve, bothArmsReservedUSD: totalReservedUSD, experimentCeilingUSD: 35, armReservedUSD: cases.reduce((sum, c) => sum + reservationUSD(buildRequest(c, effort)), 0), authorization: "User explicitly requested these Astra effort comparisons; existing ledgers are not rewritten." },
      protectedFiles: protectedSnapshot,
    };
    mkdirSync(output, { recursive: true }); writeJSON(manifestPath, manifest);
    writeFileSync(join(output, "system-prompt.txt"), SYSTEM_PROMPT + "\n", { flag: "wx" });
  }
}

export async function generate() {
  const env = { ...parseEnv(readFileSync(join(ROOT, ".env"), "utf8")), ...process.env };
  assert(env.OPENAI_API_KEY, "OPENAI_API_KEY is required");
  const csvPath = join(ROOT, "data/patient_messages.csv");
  freezePlans(csvPath);
  const manifests = Object.fromEntries(EFFORTS.map(e => [e, readJSON(join(OUTPUTS[e], "manifest.json"))]));
  const jobs = manifests.xhigh.cases.flatMap(c => EFFORTS.map(effort => ({ c, effort })));
  // Refuse to duplicate any interrupted request before dispatching another job.
  for (const { c, effort } of jobs) {
    const prefix = join(OUTPUTS[effort], c.id);
    assert(!existsSync(`${prefix}-request.json`) || existsSync(`${prefix}-parsed.json`), `Already started ${effort}/${c.id}; no automatic retry`);
  }
  let next = 0;
  const one = async ({ c, effort }) => {
    const prefix = join(OUTPUTS[effort], c.id);
    if (existsSync(`${prefix}-parsed.json`)) return;
    const body = buildRequest(c, effort), beganAt = new Date().toISOString(), began = performance.now();
    const reservedUSD = reservationUSD(body);
    writeJSON(`${prefix}-request.json`, { id: c.id, beganAt, inputSHA256: sha256(c.message), reservedUSD, body });
    let raw;
    try {
      const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(300000) });
      raw = { id: c.id, beganAt, completedAt: new Date().toISOString(), latencyMs: Math.round(performance.now() - began), status: response.status, requestId: response.headers.get("x-request-id"), responseText: await response.text() };
      raw.completedAt = new Date().toISOString(); raw.latencyMs = Math.round(performance.now() - began);
    } catch (error) { raw = { id: c.id, beganAt, completedAt: new Date().toISOString(), latencyMs: Math.round(performance.now() - began), status: null, requestId: null, responseText: null, error: String(error) }; }
    writeJSON(`${prefix}-raw.json`, raw);
    let parsed = null, failure = null, usage = null, model = null, responseId = null, responseEffort = null;
    try {
      assert.equal(raw.status, 200, `Provider HTTP ${raw.status}`);
      const response = JSON.parse(raw.responseText);
      usage = response.usage ?? null; model = response.model; responseId = response.id; responseEffort = response.reasoning?.effort ?? null;
      assert(typeof model === "string" && /^gpt-6-astra(?:-\d{4}-\d{2}-\d{2})?$/.test(model), "Unexpected response model");
      assert.equal(responseEffort, effort, "Unexpected response effort");
      parsed = parseDisposition(response);
    } catch (error) { failure = String(error); }
    const costs = usageCost(usage, reservedUSD);
    writeJSON(`${prefix}-parsed.json`, { id: c.id, parsed, failure, model, responseId, responseEffort, usage, providerCalls: 1, ...costs });
    console.log(JSON.stringify({ effort, id: c.id, completed: !!parsed, latencyMs: raw.latencyMs, outputTokens: usage?.output_tokens ?? null, failure }));
  };
  await Promise.all(Array.from({ length: 4 }, async () => { while (next < jobs.length) await one(jobs[next++]); }));
  for (const effort of EFFORTS) {
    const output = OUTPUTS[effort], manifest = manifests[effort]; verifyFrozen(manifest, output);
    if (existsSync(join(output, "generation-complete.json"))) continue;
    const records = manifest.cases.map(c => readJSON(join(output, `${c.id}-parsed.json`)));
    const raws = manifest.cases.map(c => readJSON(join(output, `${c.id}-raw.json`)));
    const accountedUSD = records.reduce((sum, r) => sum + r.accountedUSD, 0);
    assert(accountedUSD <= manifest.budget.armReservedUSD, "Usage exceeded reservation");
    writeJSON(join(output, "generation-complete.json"), {
      completedAt: new Date().toISOString(), plannedCases: 50, providerCalls: records.length, validDispositions: records.filter(r => r.parsed).length, failedCases: records.filter(r => !r.parsed).map(r => r.id),
      estimatedUSD: records.every(r => r.estimatedUSD !== null) ? records.reduce((sum, r) => sum + r.estimatedUSD, 0) : null, accountedUSD,
      priorAccountedUSD: manifest.budget.priorAccountedUSD, remainingAllocationUSD: manifest.budget.priorRemainingUSD - manifest.budget.guiAllowanceReservedUSD - EFFORTS.reduce((sum, e) => sum + manifests[e].cases.reduce((n, c) => n + readJSON(join(OUTPUTS[e], `${c.id}-parsed.json`)).accountedUSD, 0), 0),
      usage: records.reduce((sum, r) => ({ inputTokens: sum.inputTokens + (r.usage?.input_tokens ?? 0), outputTokens: sum.outputTokens + (r.usage?.output_tokens ?? 0), reasoningTokens: sum.reasoningTokens + (r.usage?.output_tokens_details?.reasoning_tokens ?? 0) }), { inputTokens: 0, outputTokens: 0, reasoningTokens: 0 }),
      latencyMs: raws.map(r => ({ id: r.id, latencyMs: r.latencyMs })),
      artifactHashes: Object.fromEntries(manifest.cases.flatMap(c => ["request", "raw", "parsed"].map(kind => { const name = `${c.id}-${kind}.json`; return [name, sha256(readFileSync(join(output, name)))]; }))),
    });
    console.log(JSON.stringify({ effort, frozen: true, validDispositions: records.filter(r => r.parsed).length, accountedUSD }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await generate();
