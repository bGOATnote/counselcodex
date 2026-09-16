/** Isolated local MedGemma experiment. This module never reads scoring references. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, SYSTEM_PROMPT, loadCases, parseDisposition, sha256 } from "./stripped-3bucket-baseline.mjs";

export { ROOT, SYSTEM_PROMPT };
export const OUTPUT = join(ROOT, "outputs/stripped-3bucket-medgemma-27b-q5-2026-09-16");
export const MODEL = "counsel-medgemma-27b-text-q5:latest";
export const CSV_SHA256 = "d17771ed706c6866d2b13f2d7f5344824acf51aaf281b8af6368637586d71a15";
export const PROMPT_SHA256 = "80810b85df956d779709a71dbc0d85534f5847e2563b0be5235048cb254a03ce";
export const SETTINGS = Object.freeze({ temperature: 0, seed: 42, num_ctx: 8192, num_predict: 4096, repeat_penalty: 1 });
export const PROVENANCE = Object.freeze({
  upstreamModel: "google/medgemma-27b-text-it",
  sourceRepository: "unsloth/medgemma-27b-text-it-GGUF",
  revision: "334fbf6811c963d223f6ac107a459347353f068d",
  filename: "medgemma-27b-text-it-Q5_K_M.gguf",
  quantization: "Q5_K_M", bytes: 19271392256,
  sha256: "27069242c6640da27b35d11ca00490e599030290b455012ace0939dd59e84cb5",
  importedBlobSHA256: "e7389f6aa475ce85a16803cb22317848d869f797c2c77b374d215da7fa65aeca",
  importTransformation: "Ollama 0.32.1 rewrote the GGUF during import. Source and installed files were independently hashed; tensor-by-tensor equivalence was not assessed.",
  upstreamWeightRevision: "not independently verified",
});
const ENDPOINT = "http://127.0.0.1:11434";
const TIMEOUT_MS = 300000;
const SOURCE_PATHS = ["scripts/stripped-3bucket-medgemma.mjs", "scripts/stripped-3bucket-baseline.mjs", "src/lib/csv.mjs"];
const readJSON = path => JSON.parse(readFileSync(path, "utf8"));
const writeJSON = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
const hashesFor = paths => Object.fromEntries(paths.map(path => [path, sha256(readFileSync(join(ROOT, path)))]));
const TELEMETRY_KEYS = ["total_duration", "load_duration", "prompt_eval_count", "prompt_eval_duration", "eval_count", "eval_duration"];

export function buildRequest({ message }) {
  assert.ok(typeof message === "string" && message.trim(), "Missing patient message");
  return { model: MODEL, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: message }],
    stream: false, keep_alive: "15m", options: { ...SETTINGS } };
}

export function parseOllama(response) {
  assert.equal(response?.model, MODEL, "Unexpected local model identity");
  assert.equal(response.done, true, "Incomplete local response");
  assert.equal(response.done_reason, "stop", "Truncated local response");
  assert.equal(response.message?.role, "assistant");
  assert.equal(response.message?.tool_calls?.length ?? 0, 0, "Unexpected tool call");
  assert.ok(typeof response.message?.content === "string", "Missing response text");
  return parseDisposition({ stop_reason: "end_turn", content: [{ type: "text", text: response.message.content }] });
}

export function deriveRecord(raw) {
  let parsed = null, failure = null, telemetry = null;
  if (raw.transportError) failure = raw.transportError;
  else if (raw.status !== 200) failure = `HTTP_${raw.status}`;
  else {
    try {
      const response = JSON.parse(raw.responseText);
      telemetry = Object.fromEntries(TELEMETRY_KEYS.filter(key => Number.isFinite(response[key])).map(key => [key, response[key]]));
      parsed = parseOllama(response);
    } catch { failure = "INVALID_OR_INCOMPLETE_RESPONSE"; }
  }
  return { id: raw.id, attemptId: raw.attemptId, inferenceAttempts: 1, parsed, failure, latencyMs: raw.latencyMs, telemetry };
}

async function api(path, body) {
  const response = await fetch(ENDPOINT + path, { ...(body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}), redirect: "error", signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200, `Runtime identity check failed: ${path}`);
  return response.json();
}

async function runtimeIdentity() {
  const [version, tags, show] = await Promise.all([api("/api/version"), api("/api/tags"), api("/api/show", { model: MODEL })]);
  const model = tags.models.find(row => row.name === MODEL);
  assert.ok(model?.digest, "MedGemma model alias unavailable");
  assert.equal(version.version, "0.32.1", "Unregistered Ollama version");
  assert.equal(show.details.quantization_level, "Q5_K_M");
  assert.equal(show.details.family, "gemma3");
  const weightsBlobSHA256 = show.modelfile?.match(/^FROM .*sha256-([a-f0-9]{64})\s*$/m)?.[1];
  assert.equal(weightsBlobSHA256, PROVENANCE.importedBlobSHA256, "Installed weights differ from verified Ollama import");
  assert.equal(show.model_info?.["general.base_model.0.repo_url"], "https://huggingface.co/" + PROVENANCE.upstreamModel);
  const parameterCount = show.model_info?.["general.parameter_count"];
  assert.ok(parameterCount >= 27e9 && parameterCount < 28e9, "Expected 27B model");
  assert.ok(!show.system, "Unexpected default system instructions");
  assert.equal(show.messages?.length ?? 0, 0, "Unexpected default conversation");
  assert.match(show.template, /System/);
  const chip = execFileSync("sysctl", ["-n", "machdep.cpu.brand_string"], { encoding: "utf8" }).trim();
  const memoryBytes = Number(execFileSync("sysctl", ["-n", "hw.memsize"], { encoding: "utf8" }).trim());
  return { version: version.version, modelDigest: model.digest, details: show.details, template: show.template,
    templateSHA256: sha256(show.template), parameters: show.parameters ?? "", weightsBlobSHA256, parameterCount,
    defaultSystem: show.system ?? "", defaultMessages: show.messages ?? [], hardware: { chip, memoryBytes } };
}

function verifyManifest(manifest) {
  assert.equal(manifest.schema, "stripped-medgemma/v1");
  assert.equal(manifest.model, MODEL);
  assert.equal(manifest.csvSHA256, CSV_SHA256);
  assert.equal(manifest.systemPrompt, SYSTEM_PROMPT);
  assert.equal(manifest.promptSHA256, PROMPT_SHA256);
  assert.equal(sha256(SYSTEM_PROMPT), PROMPT_SHA256);
  assert.deepEqual(manifest.settings, SETTINGS);
  assert.deepEqual(manifest.provenance, PROVENANCE);
  assert.equal(manifest.runtime.weightsBlobSHA256, PROVENANCE.importedBlobSHA256);
  assert.deepEqual(manifest.sourceSHA256, hashesFor(SOURCE_PATHS));
  assert.equal(manifest.runtime.templateSHA256, sha256(manifest.runtime.template));
  assert.equal(manifest.cases.length, 50);
  manifest.cases.forEach((row, i) => {
    assert.equal(row.id, `C${String(i + 1).padStart(2, "0")}`);
    assert.deepEqual(Object.keys(row).sort(), ["id", "inputSHA256", "message"]);
    assert.equal(row.inputSHA256, sha256(row.message));
  });
}

/** Offline audit; no model calls and no reference reads. */
export function verifyGeneration(directory = OUTPUT) {
  directory = resolve(directory);
  const complete = readJSON(join(directory, "generation-complete.json"));
  const manifest = readJSON(join(directory, "manifest.json"));
  verifyManifest(manifest);
  const csv = readFileSync(join(ROOT, "data/patient_messages.csv"));
  assert.equal(sha256(csv), CSV_SHA256);
  assert.deepEqual(manifest.cases, loadCases(csv.toString()).map(row => ({ ...row, inputSHA256: sha256(row.message) })));
  const required = ["manifest.json", "system-prompt.txt", ...manifest.cases.flatMap(row => ["request", "started", "raw", "parsed"].map(kind => `${row.id}-${kind}.json`))];
  assert.deepEqual(Object.keys(complete.artifactHashes).sort(), required.sort());
  for (const path of required) assert.equal(sha256(readFileSync(join(directory, path))), complete.artifactHashes[path], `Frozen artifact changed: ${path}`);
  assert.equal(readFileSync(join(directory, "system-prompt.txt"), "utf8"), SYSTEM_PROMPT + "\n");
  assert.equal(complete.caseCount, 50);
  assert.equal(complete.inferenceAttempts, 50);
  const preparedAt = Date.parse(manifest.startedAt), completedAt = Date.parse(complete.completedAt);
  assert.ok(Number.isFinite(preparedAt) && Number.isFinite(completedAt) && preparedAt <= completedAt && completedAt <= Date.now());
  const attemptIds = new Set();
  const records = [], predictions = [];
  for (const row of manifest.cases) {
    const request = readJSON(join(directory, `${row.id}-request.json`));
    assert.deepEqual(request, { id: row.id, inputSHA256: row.inputSHA256, body: buildRequest(row) });
    const started = readJSON(join(directory, `${row.id}-started.json`));
    const raw = readJSON(join(directory, `${row.id}-raw.json`));
    const record = readJSON(join(directory, `${row.id}-parsed.json`));
    assert.equal(started.id, row.id);
    assert.equal(started.requestSHA256, sha256(JSON.stringify(request.body)));
    assert.equal(raw.id, row.id);
    assert.equal(raw.attemptId, started.attemptId);
    if (raw.transportError === "INTERRUPTED_ATTEMPT_OUTCOME_UNKNOWN") assert.equal(raw.latencyMs, null);
    else assert.ok(Number.isFinite(raw.latencyMs) && raw.latencyMs >= 0);
    const attemptStartedAt = Date.parse(started.startedAt), responseCompletedAt = Date.parse(raw.completedAt);
    assert.ok(preparedAt <= attemptStartedAt && attemptStartedAt <= responseCompletedAt && responseCompletedAt <= completedAt, `Invalid attempt chronology: ${row.id}`);
    assert.ok(!attemptIds.has(started.attemptId), "Duplicate inference attempt");
    attemptIds.add(started.attemptId);
    assert.deepEqual(record, deriveRecord(raw), `Parsed output differs from raw: ${row.id}`);
    records.push(record);
    predictions.push({ ...row, parsed: record.parsed, failure: record.failure });
  }
  assert.equal(complete.validOutputs, records.filter(row => row.parsed !== null).length);
  assert.deepEqual(complete.runtimeAfter, manifest.runtime);
  return { manifest, complete, predictions, records, verifiedArtifactCount: required.length };
}

export async function generate() {
  if (existsSync(join(OUTPUT, "generation-complete.json"))) return verifyGeneration();
  // One active process per experiment, outside publication artifacts.
  const lockPath = join(tmpdir(), "counsel-medgemma-27b-2026-09-16.lock");
  if (existsSync(lockPath)) {
    const owner = readJSON(lockPath);
    let active = true;
    try { process.kill(owner.pid, 0); } catch (error) { if (error.code === "ESRCH") active = false; else throw error; }
    assert.equal(active, false, "Another generation process owns this experiment");
    unlinkSync(lockPath);
  }
  writeJSON(lockPath, { pid: process.pid });
  try {
    mkdirSync(OUTPUT, { recursive: true });
    const csv = readFileSync(join(ROOT, "data/patient_messages.csv"));
    assert.equal(sha256(csv), CSV_SHA256);
    const cases = loadCases(csv.toString()).map(row => ({ ...row, inputSHA256: sha256(row.message) }));
    const runtime = await runtimeIdentity();
    const manifestPath = join(OUTPUT, "manifest.json");
    if (!existsSync(manifestPath)) {
      assert.equal(readdirSync(OUTPUT).length, 0, "Unexpected files before preparation");
      writeJSON(manifestPath, { schema: "stripped-medgemma/v1", model: MODEL, startedAt: new Date().toISOString(),
        authorization: "Separate user-requested MedGemma scoring run; local inference only.",
        csvSHA256: CSV_SHA256, systemPrompt: SYSTEM_PROMPT, promptSHA256: PROMPT_SHA256,
        settings: SETTINGS, provenance: PROVENANCE, runtime, sourceSHA256: hashesFor(SOURCE_PATHS), cases,
        protocol: { endpoint: ENDPOINT + "/api/chat", timeoutMs: TIMEOUT_MS, concurrency: 1, maxInferenceAttempts: 50,
          retries: 0, tools: false, retrieval: false, structuredDecoding: false, referenceAccessDuringGeneration: false,
          serialization: "Native Gemma template folds unchanged system text into first user turn. Serialized provider input differs from Anthropic.",
          failureHandling: "Retain errors and incomplete outputs; no repair, fallback or repeat inference. Interrupted attempts are never redispatched." } });
    }
    const manifest = readJSON(manifestPath);
    verifyManifest(manifest);
    assert.deepEqual(manifest.cases, cases);
    assert.deepEqual(manifest.runtime, runtime);
    const promptPath = join(OUTPUT, "system-prompt.txt");
    if (!existsSync(promptPath)) writeFileSync(promptPath, SYSTEM_PROMPT + "\n", { flag: "wx" });
    assert.equal(readFileSync(promptPath, "utf8"), SYSTEM_PROMPT + "\n");
    // Freeze every message-only request before the first generation.
    for (const row of cases) {
      const path = join(OUTPUT, `${row.id}-request.json`);
      const request = { id: row.id, inputSHA256: row.inputSHA256, body: buildRequest(row) };
      if (!existsSync(path)) writeJSON(path, request);
      assert.deepEqual(readJSON(path), request);
    }
    for (const row of cases) {
      const rawPath = join(OUTPUT, `${row.id}-raw.json`), parsedPath = join(OUTPUT, `${row.id}-parsed.json`);
      const startedPath = join(OUTPUT, `${row.id}-started.json`);
      if (!existsSync(rawPath)) {
        if (existsSync(startedPath)) {
          const started = readJSON(startedPath);
          writeJSON(rawPath, { id: row.id, attemptId: started.attemptId, status: null, responseText: null,
            transportError: "INTERRUPTED_ATTEMPT_OUTCOME_UNKNOWN", latencyMs: null, completedAt: new Date().toISOString() });
        } else {
          // Validate the alias and runtime before each dispatch; no extra inference calls.
          assert.deepEqual(await runtimeIdentity(), manifest.runtime);
          const request = readJSON(join(OUTPUT, `${row.id}-request.json`));
          assert.deepEqual(request, { id: row.id, inputSHA256: row.inputSHA256, body: buildRequest(row) });
          const attemptId = randomUUID();
          writeJSON(startedPath, { id: row.id, attemptId, startedAt: new Date().toISOString(), requestSHA256: sha256(JSON.stringify(request.body)) });
          const start = performance.now();
          let status = null, responseText = null, transportError = null;
          try {
            const response = await fetch(ENDPOINT + "/api/chat", { method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify(request.body), redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) });
            status = response.status;
            responseText = await response.text();
          } catch (error) { transportError = error.name === "TimeoutError" ? "TIMEOUT" : "TRANSPORT_ERROR"; }
          writeJSON(rawPath, { id: row.id, attemptId, status, responseText, transportError, latencyMs: Math.round(performance.now() - start), completedAt: new Date().toISOString() });
        }
      }
      const record = deriveRecord(readJSON(rawPath));
      if (!existsSync(parsedPath)) writeJSON(parsedPath, record);
      assert.deepEqual(readJSON(parsedPath), record);
      console.log(`${row.id}: ${record.failure ?? "saved valid output"}`);
    }
    const runtimeAfter = await runtimeIdentity();
    assert.deepEqual(runtimeAfter, runtime);
    const paths = ["manifest.json", "system-prompt.txt", ...cases.flatMap(row => ["request", "started", "raw", "parsed"].map(kind => `${row.id}-${kind}.json`))];
    const records = cases.map(row => readJSON(join(OUTPUT, `${row.id}-parsed.json`)));
    writeJSON(join(OUTPUT, "generation-complete.json"), { completedAt: new Date().toISOString(), caseCount: 50,
      inferenceAttempts: 50, validOutputs: records.filter(row => row.parsed !== null).length, runtimeAfter,
      artifactHashes: Object.fromEntries(paths.map(path => [path, sha256(readFileSync(join(OUTPUT, path)))])) });
    return verifyGeneration();
  } finally { unlinkSync(lockPath); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const command = process.argv[2];
  if (command === "generate") { const run = await generate(); console.log(JSON.stringify({ output: relative(ROOT, OUTPUT), attempts: run.records.length, valid: run.complete.validOutputs })); }
  else if (command === "verify") { const run = verifyGeneration(); console.log(JSON.stringify({ verifiedArtifacts: run.verifiedArtifactCount, attempts: run.records.length })); }
  else throw new Error("Usage: node scripts/stripped-3bucket-medgemma.mjs generate|verify");
}
