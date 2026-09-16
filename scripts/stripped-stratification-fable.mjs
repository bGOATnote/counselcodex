/** Conditional subtype ablation over frozen model predictions. No reference or CSV read. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { verifyFreeze, loadFrozenRun } from "./score-stripped-3bucket-astra.mjs";
import { buildRequest, parseSubdisposition, mapSubdisposition, STRATIFICATION_SETTINGS, STRATIFICATION_PROMPTS, STRATIFICATION_PROMPT_HASHES } from "../src/stripped/stratification.ts";
export { buildRequest, parseSubdisposition, mapSubdisposition, STRATIFICATION_SETTINGS, STRATIFICATION_PROMPTS, STRATIFICATION_PROMPT_HASHES };
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const PARENT = join(ROOT, "outputs/stripped-3bucket-fable-2026-09-15");
export const OUTPUT = join(ROOT, "outputs/stripped-stratification-fable-2026-09-15");
const BUDGET = join(ROOT, "outputs/stripped-3bucket-astra-comparison-2026-09-15/budget-reconciliation.json");
const sha256 = value => createHash("sha256").update(value).digest("hex");
const readJSON = path => JSON.parse(readFileSync(path, "utf8"));
const writeJSON = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
const byteHash = path => sha256(readFileSync(path));
const sourcePaths = ["scripts/stripped-stratification-fable.mjs", "src/stripped/stratification.ts",
  "scripts/score-stripped-3bucket-astra.mjs", "scripts/stripped-3bucket-baseline.mjs", "src/lib/csv.mjs"];
function environment() {
  const envPath = join(ROOT, ".env");
  return { ...(existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : {}), ...process.env };
}
export function reserveUSD(body) {
  return ((Buffer.byteLength(JSON.stringify(body)) + 2048) * 20 + body.max_tokens * 50) / 1e6;
}
export function accountUsage(usage, reservation) {
  const valid = x => Number.isSafeInteger(x) && x >= 0;
  if (!usage || !valid(usage.input_tokens) || !valid(usage.output_tokens)
    || !valid(usage.cache_creation_input_tokens ?? 0) || !valid(usage.cache_read_input_tokens ?? 0)) {
    return { estimatedUSD: null, accountedUSD: reservation, usageKnown: false };
  }
  const { input_tokens: i, output_tokens: o, cache_creation_input_tokens: w = 0, cache_read_input_tokens: r = 0 } = usage;
  return { estimatedUSD: (i * 10 + o * 50 + w * 20 + r * .25) / 1e6,
    accountedUSD: Math.max((i + w + r) * 20 / 1e6 + o * 50 / 1e6, 0), usageKnown: true };
}
function guiAccounting() {
  const dir = join(ROOT, "apps/evaluation/.local/stripped-disposition");
  if (!existsSync(dir)) throw new Error("Missing existing GUI accounting records");
  return readdirSync(dir).filter(name => name.endsWith("-started.json")).map(name => {
    const startPath = join(dir, name), start = readJSON(startPath);
    const completePath = startPath.replace(/-started\.json$/, "-complete.json");
    const end = existsSync(completePath) ? readJSON(completePath) : null;
    const value = end?.accountedUSD ?? start.reservedUSD;
    assert(Number.isFinite(value) && value >= 0, "Invalid GUI accounting");
    return { id: name.replace(/-started\.json$/, ""), accountedOrOutstandingUSD: value };
  });
}
function budgetReceipt() {
  const previous = readJSON(BUDGET);
  for (const [path, hash] of Object.entries(previous.sources)) assert.equal(byteHash(join(ROOT, path)), hash, "Budget source changed");
  const guiRecords = guiAccounting();
  for (const prior of previous.guiRecords) assert(guiRecords.some(r => r.id === prior.id && r.accountedOrOutstandingUSD >= prior.accountedOrOutstandingUSD), "GUI accounting record lost");
  const guiAccountedUSD = guiRecords.reduce((n, r) => n + r.accountedOrOutstandingUSD, 0);
  const priorNonGUIAccountedUSD = previous.accountedAndOutstandingUSD - previous.guiAccountedOrOutstandingUSD;
  const guiReservedUSD = Math.max(previous.guiAllowanceUSD, guiAccountedUSD);
  const availableUSD = previous.allocationUSD - priorNonGUIAccountedUSD - guiReservedUSD;
  assert(availableUSD >= 16, "Insufficient reconciled remaining allocation");
  return { source: relative(ROOT, BUDGET), sourceSHA256: byteHash(BUDGET), allocationUSD: previous.allocationUSD,
    priorNonGUIAccountedUSD, guiAccountedUSD, guiReservedUSD, guiRecords, availableUSD, runCeilingUSD: 16 };
}
function protectedFiles() {
  const paths = execFileSync("git", ["ls-files", "src", "apps", "package.json", "package-lock.json"], { cwd: ROOT, encoding: "utf8" }).trim().split("\n").filter(Boolean);
  return Object.fromEntries(paths.map(path => [path, byteHash(join(ROOT, path))]));
}
export function verifyManifest(manifest) {
  assert.equal(manifest.protocol, "stripped-conditional-stratification/v1");
  assert.deepEqual(manifest.settings, STRATIFICATION_SETTINGS);
  assert.deepEqual(manifest.prompts, STRATIFICATION_PROMPTS);
  assert.deepEqual(manifest.promptSHA256, STRATIFICATION_PROMPT_HASHES);
  for (const [path, hash] of Object.entries({ ...manifest.sourceHashes, ...manifest.protectedFiles })) assert.equal(byteHash(join(ROOT, path)), hash, `Frozen source changed: ${path}`);
  const parent = loadFrozenRun(verifyFreeze(PARENT), { provider: "anthropic", effort: "low" });
  assert.equal(byteHash(join(PARENT, "generation-complete.json")), manifest.parent.completionSHA256);
  assert.equal(byteHash(join(PARENT, "manifest.json")), manifest.parent.manifestSHA256);
  assert.deepEqual(manifest.cases, parent.predictions.map(r => ({ id: r.id, message: r.message, inputSHA256: sha256(r.message), parentDisposition: r.parsed.disposition })));
  return parent;
}
export async function prepare() {
  if (existsSync(OUTPUT)) throw new Error("Use existing frozen run only through generate; prepare requires a new directory");
  const parent = loadFrozenRun(verifyFreeze(PARENT), { provider: "anthropic", effort: "low" });
  const cases = parent.predictions.map(r => ({ id: r.id, message: r.message, inputSHA256: sha256(r.message), parentDisposition: r.parsed.disposition }));
  const eligible = cases.filter(r => r.parentDisposition !== "SELF_CARE");
  assert.equal(eligible.length, 41);
  const budget = budgetReceipt();
  const reservedUSD = eligible.reduce((n, row) => n + reserveUSD(buildRequest(row)), 0);
  assert(reservedUSD <= budget.runCeilingUSD && reservedUSD <= budget.availableUSD, "Reservation exceeds allocation");
  const env = environment();
  assert(env.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY required");
  const response = await fetch(`https://api.anthropic.com/v1/models/${STRATIFICATION_SETTINGS.model}`, {
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" }, signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Model access preflight HTTP ${response.status}`);
  const modelInfo = await response.json();
  const manifest = { protocol: "stripped-conditional-stratification/v1", frozenAt: new Date().toISOString(), provider: "Anthropic Messages API",
    settings: STRATIFICATION_SETTINGS, modelInfo, prompts: STRATIFICATION_PROMPTS, promptSHA256: STRATIFICATION_PROMPT_HASHES,
    sourceHashes: Object.fromEntries(sourcePaths.map(path => [path, byteHash(join(ROOT, path))])),
    protectedFiles: protectedFiles(), parent: { directory: relative(ROOT, PARENT), manifestSHA256: byteHash(join(PARENT, "manifest.json")), completionSHA256: parent.completionSHA256, promptSHA256: parent.manifest.promptSHA256 },
    cases, callPolicy: { plannedCases: 50, newParentCalls: 0, subtypeCalls: eligible.length, callsPerEligibleCase: 1, selfCarePassThrough: 9, concurrency: 4, automaticRetries: 0, fallbacks: 0, judgeCalls: 0 },
    contextPolicy: "Fixed parent determines the two options in the system prompt. User content is only the original message. No first-stage rationale, case ID, reference, CSV label or retrieval context enters a request.",
    interpretation: "Conditional subtype ablation over saved first-stage outputs. Parent preservation is structural, not a new replication of parent agreement. Self-care routes cannot be reconsidered.",
    operationalAssumption: "Prompt async review includes time-sensitive tasks and medication refill/prescribing assessment, consistent with the previously requested priority-async taxonomy. No exact service-level deadline is assumed.",
    authorization: "User requested finer triage within each fixed async/urgent category and natural-language choices. A single same-input conditional experiment is authorized; current GUI and V25 are unchanged.",
    budget: { ...budget, reservedUSD }, pricing: { inputUSDPerMillion: 10, outputUSDPerMillion: 50, cacheReadUSDPerMillion: .25, cacheWriteUSDPerMillion: 20, conservativeInputUSDPerMillion: 20, source: "Frozen Fable settings and accounting in the existing baseline and GUI. Token estimate, not invoice." },
  };
  mkdirSync(OUTPUT, { recursive: true });
  writeJSON(join(OUTPUT, "manifest.json"), manifest);
  for (const [parent, prompt] of Object.entries(STRATIFICATION_PROMPTS)) writeFileSync(join(OUTPUT, `system-prompt-${parent}.txt`), prompt + "\n", { flag: "wx" });
  console.log(JSON.stringify({ prepared: true, output: OUTPUT, parentCounts: Object.fromEntries(["SELF_CARE", "ASYNC_PHYSICIAN", "URGENT_ESCALATION"].map(p => [p, cases.filter(r => r.parentDisposition === p).length])), promptSHA256: STRATIFICATION_PROMPT_HASHES, reservedUSD }));
  return manifest;
}
export async function generate() {
  const manifest = readJSON(join(OUTPUT, "manifest.json"));
  verifyManifest(manifest);
  if (existsSync(join(OUTPUT, "generation-complete.json"))) throw new Error("Run is already frozen; no further inference permitted");
  // Refuse an interrupted run before any worker can dispatch a further case.
  for (const row of manifest.cases) {
    const prefix = join(OUTPUT, row.id);
    if (!existsSync(`${prefix}-parsed.json`) && (existsSync(`${prefix}-request.json`) || existsSync(`${prefix}-raw.json`))) {
      throw new Error(`Previously started ${row.id} has no terminal record; no new calls permitted`);
    }
  }
  const currentBudget = budgetReceipt();
  assert(manifest.budget.reservedUSD <= currentBudget.availableUSD, "Current allocation cannot cover reservation");
  const env = environment(); assert(env.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY required");
  const runOne = async row => {
    const prefix = join(OUTPUT, row.id), requestPath = `${prefix}-request.json`, rawPath = `${prefix}-raw.json`, parsedPath = `${prefix}-parsed.json`;
    if (existsSync(parsedPath)) return;
    if (existsSync(requestPath) || existsSync(rawPath)) throw new Error(`Already started ${row.id}; no retry permitted`);
    if (row.parentDisposition === "SELF_CARE") {
      writeJSON(parsedPath, { id: row.id, parentDisposition: row.parentDisposition, parsed: null, subdisposition: "SELF_CARE", failure: null, model: null, usage: null, providerCalls: 0, estimatedUSD: 0, accountedUSD: 0 });
      return;
    }
    const body = buildRequest(row), reservedUSD = reserveUSD(body), beganAt = new Date().toISOString(), began = performance.now();
    writeJSON(requestPath, { id: row.id, parentDisposition: row.parentDisposition, inputSHA256: row.inputSHA256, beganAt, reservedUSD, body });
    let raw;
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: {
        "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01",
      }, body: JSON.stringify(body), signal: AbortSignal.timeout(180_000) });
      raw = { id: row.id, beganAt, completedAt: new Date().toISOString(), latencyMs: Math.round(performance.now() - began), status: response.status, requestId: response.headers.get("request-id"), responseText: await response.text() };
    } catch { raw = { id: row.id, beganAt, completedAt: new Date().toISOString(), latencyMs: Math.round(performance.now() - began), status: null, requestId: null, responseText: null, error: "Transport failure or timeout; no retry." }; }
    // Measure through receipt of the full response body, not just headers.
    raw.latencyMs = Math.round(performance.now() - began);
    raw.completedAt = new Date().toISOString();
    writeJSON(rawPath, raw);
    let parsed = null, subdisposition = null, usage = null, model = null, failure = null, responseId = null;
    try {
      if (raw.status !== 200) throw new Error(`Provider HTTP ${raw.status}`);
      const response = JSON.parse(raw.responseText); usage = response.usage; model = response.model; responseId = response.id;
      assert.equal(model, STRATIFICATION_SETTINGS.model);
      parsed = parseSubdisposition(response, row.parentDisposition);
      subdisposition = mapSubdisposition(row.parentDisposition, parsed);
    } catch (error) { failure = String(error); }
    const accounting = accountUsage(usage, reservedUSD);
    writeJSON(parsedPath, { id: row.id, parentDisposition: row.parentDisposition, parsed, subdisposition, failure, model, responseId, usage, providerCalls: 1, ...accounting });
    console.log(JSON.stringify({ id: row.id, parent: row.parentDisposition, subdisposition, latencyMs: raw.latencyMs, failure }));
  };
  let next = 0;
  await Promise.all(Array.from({ length: manifest.callPolicy.concurrency }, async () => { while (next < manifest.cases.length) await runOne(manifest.cases[next++]); }));
  verifyManifest(manifest);
  const records = manifest.cases.map(row => readJSON(join(OUTPUT, `${row.id}-parsed.json`)));
  const accountedUSD = records.reduce((n, r) => n + r.accountedUSD, 0);
  assert(accountedUSD <= manifest.budget.reservedUSD, "Usage exceeded prospective reservation");
  const artifactNames = ["manifest.json", ...Object.keys(STRATIFICATION_PROMPTS).map(p => `system-prompt-${p}.txt`),
    ...manifest.cases.flatMap(row => (row.parentDisposition === "SELF_CARE" ? ["parsed"] : ["request", "raw", "parsed"]).map(kind => `${row.id}-${kind}.json`))];
  const complete = { completedAt: new Date().toISOString(), plannedCases: 50, providerCalls: records.reduce((n, r) => n + r.providerCalls, 0), newParentCalls: 0,
    eligibleCalls: 41, selfCarePassThrough: 9, validSubdispositions: records.filter(r => r.subdisposition).length,
    validSubtypeCalls: records.filter(r => r.providerCalls === 1 && r.subdisposition).length, failedCases: records.filter(r => !r.subdisposition).map(r => r.id),
    estimatedUSD: records.every(r => r.estimatedUSD !== null) ? records.reduce((n, r) => n + r.estimatedUSD, 0) : null, accountedUSD,
    availableAfterGUIReservationUSD: manifest.budget.availableUSD - accountedUSD,
    sourceHashes: manifest.sourceHashes, artifactHashes: Object.fromEntries(artifactNames.map(name => [name, byteHash(join(OUTPUT, name))])) };
  writeJSON(join(OUTPUT, "generation-complete.json"), complete);
  console.log(JSON.stringify({ frozen: true, providerCalls: complete.providerCalls, validSubtypeCalls: complete.validSubtypeCalls, selfCarePassThrough: 9, failedCases: complete.failedCases, output: OUTPUT }));
  return complete;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const action = process.argv[2];
  if (action === "prepare") await prepare();
  else if (action === "generate") await generate();
  else throw new Error("Use prepare to freeze protocol, or generate to execute the single frozen run");
}
