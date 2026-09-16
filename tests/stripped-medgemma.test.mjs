import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT, MODEL, SETTINGS, SYSTEM_PROMPT, CSV_SHA256, PROMPT_SHA256, PROVENANCE,
  buildRequest, deriveRecord, parseOllama, verifyGeneration } from "../scripts/stripped-3bucket-medgemma.mjs";
import { sha256, loadCases } from "../scripts/stripped-3bucket-baseline.mjs";

const answer = (content = '{"disposition":"ASYNC_PHYSICIAN","rationale":"A clinician should review this request."}', overrides = {}) => ({
  model: MODEL, done: true, done_reason: "stop", message: { role: "assistant", content }, ...overrides,
});

test("MedGemma request projects message only, retains frozen prompt, and omits grammar and tool context", () => {
  const request = buildRequest({ message: "Please review my symptom.", id: "C99", disposition: "SECRET_REFERENCE" });
  assert.deepEqual(request.messages, [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: "Please review my symptom." }]);
  assert.equal(sha256(SYSTEM_PROMPT), PROMPT_SHA256);
  assert.equal(JSON.stringify(request).includes("SECRET_REFERENCE"), false);
  assert.deepEqual(request.options, SETTINGS);
  assert.equal("format" in request, false);
  assert.equal("tools" in request, false);
});

test("parser rejects truncation, wrong model, tools and unexpected fields", () => {
  for (const response of [answer(undefined, { done: false }), answer(undefined, { done_reason: "length" }),
    answer(undefined, { model: "different-model" }), answer('{"disposition":"SELF_CARE","rationale":"fine","extra":true}'),
    answer(undefined, { message: { role: "assistant", content: "{}", tool_calls: [{}] } }),
    answer('{"disposition":"SELF_CARE","rationale":""}'), answer("Some prose before the JSON {}")]) {
    assert.throws(() => parseOllama(response));
  }
  assert.equal(parseOllama(answer()).disposition, "ASYNC_PHYSICIAN");
  assert.equal(parseOllama(answer('```json\n{"disposition":"SELF_CARE","rationale":"No review required."}\n```')).disposition, "SELF_CARE");
});

test("transport and invalid-output failures stay null instead of becoming self-care", () => {
  for (const raw of [{ status: null, transportError: "TIMEOUT" }, { status: 503 },
    { status: 200, responseText: "not-json" }, { status: 200, responseText: JSON.stringify(answer(undefined, { done_reason: "length" })) }]) {
    const result = deriveRecord({ id: "C01", attemptId: "attempt", latencyMs: 1, ...raw });
    assert.equal(result.parsed, null);
    assert.ok(result.failure);
    assert.equal(result.inferenceAttempts, 1);
  }
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "medgemma-audit-"));
  const write = (path, value) => writeFileSync(join(directory, path), JSON.stringify(value) + "\n");
  const cases = loadCases(readFileSync(join(ROOT, "data/patient_messages.csv"), "utf8")).map(row => ({ ...row, inputSHA256: sha256(row.message) }));
  const timestamp = new Date().toISOString();
  const runtime = { template: "{{ .System }}", templateSHA256: sha256("{{ .System }}"), weightsBlobSHA256: PROVENANCE.importedBlobSHA256 };
  const sourcePaths = ["scripts/stripped-3bucket-medgemma.mjs", "scripts/stripped-3bucket-baseline.mjs", "src/lib/csv.mjs"];
  write("manifest.json", { schema: "stripped-medgemma/v1", model: MODEL, startedAt: timestamp, csvSHA256: CSV_SHA256, systemPrompt: SYSTEM_PROMPT,
    promptSHA256: PROMPT_SHA256, settings: SETTINGS, provenance: PROVENANCE, runtime, cases,
    sourceSHA256: Object.fromEntries(sourcePaths.map(path => [path, sha256(readFileSync(join(ROOT, path)))])) });
  writeFileSync(join(directory, "system-prompt.txt"), SYSTEM_PROMPT + "\n");
  for (const [i, row] of cases.entries()) {
    const body = buildRequest(row), attemptId = `attempt-${row.id}`;
    write(`${row.id}-request.json`, { id: row.id, inputSHA256: row.inputSHA256, body });
    write(`${row.id}-started.json`, { id: row.id, attemptId, startedAt: timestamp, requestSHA256: sha256(JSON.stringify(body)) });
    const raw = { id: row.id, attemptId, status: 200, responseText: JSON.stringify(answer(undefined, i === 49 ? { done_reason: "length" } : {})),
      latencyMs: 1, transportError: null, completedAt: timestamp };
    write(`${row.id}-raw.json`, raw);
    write(`${row.id}-parsed.json`, deriveRecord(raw));
  }
  const paths = ["manifest.json", "system-prompt.txt", ...cases.flatMap(row => ["request", "started", "raw", "parsed"].map(kind => `${row.id}-${kind}.json`))];
  const refreeze = () => write("generation-complete.json", { completedAt: timestamp, caseCount: 50, inferenceAttempts: 50, validOutputs: 49, runtimeAfter: runtime,
    artifactHashes: Object.fromEntries(paths.map(path => [path, sha256(readFileSync(join(directory, path)))])) });
  refreeze();
  return { directory, write, refreeze };
}

test("frozen audit preserves all 50 cases including a failure and detects artifact edits", () => {
  const { directory, write } = fixture();
  try {
    const run = verifyGeneration(directory);
    assert.equal(run.predictions.length, 50);
    assert.equal(run.predictions[49].parsed, null);
    assert.equal(run.verifiedArtifactCount, 202);
    write("C01-parsed.json", {});
    assert.throws(() => verifyGeneration(directory), /Frozen artifact changed/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("audit rejects reference leakage and parsed-output repairs even if hashes are recomputed", () => {
  for (const kind of ["request", "parsed"]) {
    const { directory, write, refreeze } = fixture();
    try {
      const file = `C01-${kind}.json`, content = JSON.parse(readFileSync(join(directory, file), "utf8"));
      if (kind === "request") content.body.messages.push({ role: "user", content: "Reference answer: SELF_CARE" });
      else content.parsed.disposition = "SELF_CARE";
      write(file, content); refreeze();
      assert.throws(() => verifyGeneration(directory));
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }
});

test("audit rejects invented input provenance and impossible completion chronology", () => {
  for (const kind of ["message", "time"]) {
    const { directory, write, refreeze } = fixture();
    try {
      if (kind === "message") {
        const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
        manifest.cases[0].message = "A substituted message.";
        manifest.cases[0].inputSHA256 = sha256(manifest.cases[0].message);
        write("manifest.json", manifest);
      } else {
        const raw = JSON.parse(readFileSync(join(directory, "C01-raw.json"), "utf8"));
        raw.completedAt = "2000-01-01T00:00:00.000Z";
        write("C01-raw.json", raw);
      }
      refreeze();
      assert.throws(() => verifyGeneration(directory));
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }
});
