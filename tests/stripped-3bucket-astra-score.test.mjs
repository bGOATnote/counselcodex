import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseCsv } from "../src/lib/csv.mjs";
import { SYSTEM_PROMPT } from "../scripts/stripped-3bucket-baseline.mjs";
import { IDS, comparePair, loadFrozenRun, parseRawDisposition, scoreComparison, scorePhysician, verifyFreeze } from "../scripts/score-stripped-3bucket-astra.mjs";

const sha256 = value => createHash("sha256").update(value).digest("hex");
const writeJSON = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
const cases = IDS.map((id, i) => ({ id, message: `Synthetic case ${i + 1}.`, inputSHA256: sha256(`Synthetic case ${i + 1}.`) }));
const parsed = disposition => ({ disposition, rationale: "Synthetic short explanation." });
const predictions = () => cases.map(({ id }) => ({ id, parsed: parsed("SELF_CARE") }));
const reference = () => ({
  datasetSha256: "synthetic-source-hash",
  cases: cases.map(c => ({ id: c.id, message: c.message, inputHash: c.inputSHA256,
    originalSuppliedLabel: "DO_NOT_SCORE_SYNTHETIC_CSV_LABEL",
    reference: { acceptedRoutes: c.id === "C25" ? null : ["SELF_CARE"] } })),
});

function makeRun(directory, provider, effort, changes = {}) {
  mkdirSync(directory, { recursive: true });
  const model = provider === "openai" ? "gpt-6-astra" : "claude-fable-5-1";
  const settings = provider === "openai"
    ? { model, max_output_tokens: 4096, reasoning: { effort }, store: false }
    : { model, max_tokens: 4096, thinking: { type: "adaptive" }, output_config: { effort } };
  const manifest = { cases, systemPrompt: SYSTEM_PROMPT, promptSHA256: sha256(SYSTEM_PROMPT), settings,
    csvSHA256: "synthetic-source-hash", csvPath: join(directory, "must-not-be-opened.csv"),
    pricing: { inputUSDPerMillion: 1, outputUSDPerMillion: 2, note: "Synthetic only" } };
  writeJSON(join(directory, "manifest.json"), manifest);
  writeFileSync(join(directory, "system-prompt.txt"), SYSTEM_PROMPT + "\n");
  const failedCases = [], artifactHashes = {};
  for (const [index, c] of cases.entries()) {
    const disposition = Object.hasOwn(changes, c.id) ? changes[c.id] : "SELF_CARE";
    const failure = disposition === null ? "Synthetic provider failure." : null;
    const result = disposition === null ? null : parsed(disposition);
    const usage = { input_tokens: 100, output_tokens: 20, ...(provider === "openai" ? { output_tokens_details: { reasoning_tokens: 10 } } : {}) };
    const response = provider === "openai"
      ? { id: `${provider}-${effort}-${c.id}`, model, status: "completed", usage, reasoning: { effort },
        output: [{ type: "reasoning", summary: [{ type: "summary_text", text: "Ignored synthetic summary." }] },
          { type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(result) }] }] }
      : { id: `${provider}-${effort}-${c.id}`, model, stop_reason: "end_turn", usage, content: [{ type: "text", text: JSON.stringify(result) }] };
    const body = provider === "openai"
      ? { ...settings, instructions: SYSTEM_PROMPT, input: [{ role: "user", content: c.message }] }
      : { ...settings, system: SYSTEM_PROMPT, messages: [{ role: "user", content: c.message }] };
    const documents = {
      request: { id: c.id, inputSHA256: c.inputSHA256, body },
      raw: { id: c.id, status: failure ? 503 : 200, requestId: `request-${provider}-${effort}-${c.id}`,
        latencyMs: 100 + index, responseText: JSON.stringify(response) },
      parsed: { id: c.id, parsed: result, failure, usage: failure ? null : usage, providerCalls: 1,
        ...(provider === "openai" ? { model: failure ? null : model, responseId: failure ? null : response.id, responseEffort: failure ? null : effort } : {}) },
    };
    if (failure) failedCases.push(c.id);
    for (const [kind, value] of Object.entries(documents)) {
      const name = `${c.id}-${kind}.json`;
      writeJSON(join(directory, name), value);
      artifactHashes[name] = sha256(readFileSync(join(directory, name)));
    }
  }
  const completion = { completedAt: "2026-09-15T12:00:00.000Z", providerCalls: 50,
    validDispositions: 50 - failedCases.length, failedCases, artifactHashes, estimatedUSD: .1,
    accountedUSD: .2, usage: { inputTokens: 5000, outputTokens: 1000 } };
  writeJSON(join(directory, "generation-complete.json"), completion);
  return manifest;
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "astra-score-test-"));
  const paths = { xhigh: join(directory, "xhigh"), max: join(directory, "max"), fable: join(directory, "fable"), reference: join(directory, "physician.json"), output: join(directory, "derived") };
  makeRun(paths.xhigh, "openai", "xhigh", { C01: "ASYNC_PHYSICIAN", C02: null });
  makeRun(paths.max, "openai", "max", { C03: "URGENT_ESCALATION" });
  makeRun(paths.fable, "anthropic", "low", { C02: "ASYNC_PHYSICIAN", C03: "URGENT_ESCALATION", C25: "ASYNC_PHYSICIAN" });
  writeJSON(paths.reference, reference());
  return { directory, paths, close: () => rmSync(directory, { recursive: true, force: true }) };
}

test("physician scoring retains 49 denominator, counts failed cases and excludes only unresolved C25", () => {
  const rows = predictions();
  rows[0].parsed = null;
  rows[24].parsed = null;
  const score = scorePhysician(rows, reference());
  assert.equal(score.denominator, 49);
  assert.equal(score.agree, 48);
  assert.deepEqual(score.missIds, ["C01"]);
  assert.equal(score.rows[24].included, false);
  assert.equal(score.rows[24].agrees, null);
  assert.deepEqual(score.excludedIds, ["C25"]);
  const resolved = reference();
  resolved.cases[24].reference.acceptedRoutes = ["SELF_CARE"];
  assert.throws(() => scorePhysician(rows, resolved), /C25 must remain unresolved/);
  const empty = reference();
  empty.cases[24].reference.acceptedRoutes = [];
  assert.equal(scorePhysician(rows, empty).agree, 48);
});

test("omitted, duplicate and missing physician cases cannot shrink the denominator", () => {
  assert.throws(() => scorePhysician(predictions().filter(row => row.id !== "C25"), reference()), /50 cases/);
  const duplicate = predictions();
  duplicate[24] = duplicate[0];
  assert.throws(() => scorePhysician(duplicate, reference()), /duplicate/);
  const missing = reference();
  missing.cases.pop();
  assert.throws(() => scorePhysician(predictions(), missing), /50 cases/);
  const unresolved = reference();
  unresolved.cases[0].reference.acceptedRoutes = null;
  assert.throws(() => scorePhysician(predictions(), unresolved), /Missing physician routes/);
  const unknown = reference();
  unknown.cases[0].reference.acceptedRoutes = ["UNKNOWN_ROUTE"];
  assert.throws(() => scorePhysician(predictions(), unknown), /Unknown physician route/);
});

test("OpenAI raw parsing requires a completed exact disposition and never uses reasoning summary", () => {
  const response = { status: "completed", output: [
    { type: "reasoning", summary: [{ text: JSON.stringify(parsed("URGENT_ESCALATION")) }] },
    { type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(parsed("SELF_CARE")) }] },
  ] };
  assert.deepEqual(parseRawDisposition(response, "openai"), parsed("SELF_CARE"));
  assert.throws(() => parseRawDisposition({ ...response, status: "incomplete" }, "openai"), /Incomplete/);
  assert.throws(() => parseRawDisposition({ status: "completed", output: [] }, "openai"));
  const extra = structuredClone(response);
  extra.output[1].content[0].text = JSON.stringify({ ...parsed("SELF_CARE"), evidence: "Unexpected" });
  assert.throws(() => parseRawDisposition(extra, "openai"), /output contract/);
  assert.throws(() => parseRawDisposition({ ...response, error: { message: "Synthetic failure" } }, "openai"), /has an error/);
  assert.throws(() => parseRawDisposition({ ...response, output: [...response.output, response.output[1]] }, "openai"), /one final assistant message/);
  assert.throws(() => parseRawDisposition({ ...response, output: [...response.output, { type: "function_call" }] }, "openai"), /Unexpected tool/);
  const refusal = structuredClone(response);
  refusal.output[1].content.push({ type: "refusal", refusal: "Synthetic refusal" });
  assert.throws(() => parseRawDisposition(refusal, "openai"), /Refusal/);
});

test("both completion files and every artifact hash must verify before any physician file can be opened", () => {
  const f = fixture();
  try {
    const missing = { ...f.paths, max: join(f.directory, "not-complete"), reference: join(f.directory, "unreadable-gold.json") };
    assert.throws(() => scoreComparison(missing), error => error.code === "ENOENT" && error.path === join(missing.max, "generation-complete.json"));
    writeFileSync(join(f.paths.xhigh, "C01-raw.json"), "altered frozen response");
    assert.throws(() => scoreComparison({ ...f.paths, reference: missing.reference }), /Frozen artifact drift: C01-raw.json/);
    assert.equal(existsSync(f.paths.output), false);
  } finally { f.close(); }
});

test("missing hashes and unsafe manifest artifact names fail closed", () => {
  const f = fixture();
  try {
    const completePath = join(f.paths.xhigh, "generation-complete.json");
    const complete = JSON.parse(readFileSync(completePath, "utf8"));
    const valid = structuredClone(complete);
    delete complete.artifactHashes["C25-parsed.json"];
    writeJSON(completePath, complete);
    assert.throws(() => verifyFreeze(f.paths.xhigh), /Unfrozen C25-parsed/);
    valid.artifactHashes["../outside.json"] = "0".repeat(64);
    writeJSON(completePath, valid);
    assert.throws(() => verifyFreeze(f.paths.xhigh), /Invalid frozen artifact path/);
  } finally { f.close(); }
});

test("request verification rejects extra context despite matching output artifacts", () => {
  const f = fixture();
  try {
    const frozen = verifyFreeze(f.paths.xhigh);
    const requestPath = join(f.paths.xhigh, "C01-request.json");
    const request = JSON.parse(readFileSync(requestPath, "utf8"));
    request.body.input.push({ role: "user", content: "FORBIDDEN_GOLD_SENTINEL" });
    writeJSON(requestPath, request);
    assert.throws(() => loadFrozenRun(frozen, { provider: "openai", effort: "xhigh" }), /one exact patient message/);
  } finally { f.close(); }
});

test("canonical and dated Astra model IDs are recorded; arbitrary model aliases and changed effort fail", () => {
  const f = fixture();
  try {
    const frozen = verifyFreeze(f.paths.max);
    const rawPath = join(f.paths.max, "C01-raw.json"), recordPath = join(f.paths.max, "C01-parsed.json");
    const raw = JSON.parse(readFileSync(rawPath, "utf8"));
    const response = JSON.parse(raw.responseText);
    const record = JSON.parse(readFileSync(recordPath, "utf8"));
    response.model = "gpt-6-astra-2026-09-15";
    record.model = response.model;
    raw.responseText = JSON.stringify(response);
    writeJSON(rawPath, raw); writeJSON(recordPath, record);
    assert.deepEqual(loadFrozenRun(frozen, { provider: "openai", effort: "max" }).returnedModels, ["gpt-6-astra", "gpt-6-astra-2026-09-15"]);
    response.model = "gpt-6-astra-arbitrary";
    raw.responseText = JSON.stringify(response); writeJSON(rawPath, raw);
    assert.throws(() => loadFrozenRun(frozen, { provider: "openai", effort: "max" }), /Unrecorded failed response/);
    response.model = record.model;
    response.reasoning.effort = "xhigh";
    raw.responseText = JSON.stringify(response); writeJSON(rawPath, raw);
    assert.throws(() => loadFrozenRun(frozen, { provider: "openai", effort: "max" }), /Unrecorded failed response/);
  } finally { f.close(); }
});

test("comparison reports exact pairwise bucket disagreements, gains, losses, failures and C25 separately", () => {
  const f = fixture();
  try {
    const { comparison, audit } = scoreComparison(f.paths);
    assert.equal(comparison.metrics.astraXhigh.physicianAgree, 47);
    assert.equal(comparison.metrics.astraMax.physicianAgree, 48);
    assert.equal(comparison.metrics.fable.physicianAgree, 47);
    assert.deepEqual(comparison.pairwise.astraXhighVsFable.disagreementIds, ["C01", "C02", "C03", "C25"]);
    assert.deepEqual(comparison.pairwise.astraXhighVsFable.gainsForLeftIds, ["C03"]);
    assert.deepEqual(comparison.pairwise.astraXhighVsFable.lossesForLeftIds, ["C01"]);
    assert.deepEqual(comparison.pairwise.astraXhighVsFable.bothMissDifferentBucketIds, ["C02"]);
    assert.deepEqual(comparison.pairwise.astraXhighVsFable.excludedDisagreementIds, ["C25"]);
    assert.deepEqual(comparison.pairwise.astraMaxVsFable.disagreementIds, ["C02", "C25"]);
    assert.equal(comparison.pairwise.astraMaxVsFable.physicianAgreeDelta, 1);
    assert.deepEqual(comparison.pairwise.astraMaxVsXhigh.gainsForLeftIds, ["C01", "C02"]);
    assert.deepEqual(comparison.pairwise.astraMaxVsXhigh.lossesForLeftIds, ["C03"]);
    assert.deepEqual(comparison.allDisagreementIds, ["C01", "C02", "C03", "C25"]);
    assert.equal(comparison.metrics.astraXhigh.medianLatencyMs, 124.5);
    assert.equal(comparison.metrics.astraXhigh.p95NearestRankLatencyMs, 147);
    assert.equal(audit.frozenArtifactCount, 450);
    assert.equal(audit.assignmentCSVFileRead, false);
    assert.equal(audit.csvLabelsUsedForScoring, false);
    assert.equal(audit.csvAgreementScored, false);
    assert.equal(audit.uniqueProviderRequestIds, 150);
    assert.equal(audit.uniqueProviderResponseIds, 149);
    assert.equal(comparison.rows.length, 50);
    const csv = parseCsv(readFileSync(join(f.paths.output, "all-case-comparison.csv"), "utf8"));
    assert.equal(csv.length, 50);
    assert.equal(csv[0].message, cases[0].message);
    assert.equal(csv[0].astraXhighRationale, "Synthetic short explanation.");
    assert.equal(csv[24].astraXhighPhysicianAgrees, "UNSCORED");
    assert.equal(csv[1].astraXhighDisposition, "FAILED");
    const differences = parseCsv(readFileSync(join(f.paths.output, "disagreements.csv"), "utf8"));
    assert.deepEqual(differences.map(row => row.id), ["C01", "C02", "C03", "C25"]);
    assert.equal(differences[0].message, cases[0].message);
    const markdown = readFileSync(join(f.paths.output, "COMPARISON.md"), "utf8");
    for (const c of cases) assert.ok(markdown.includes(c.message));
    assert.doesNotMatch(markdown, /DO_NOT_SCORE_SYNTHETIC_CSV_LABEL/);
    const hashes = Object.fromEntries(readdirSync(f.paths.output).map(name => [name, sha256(readFileSync(join(f.paths.output, name)))]));
    scoreComparison(f.paths);
    for (const [name, hash] of Object.entries(hashes)) assert.equal(sha256(readFileSync(join(f.paths.output, name))), hash);
    writeFileSync(join(f.paths.output, "COMPARISON.md"), "Existing derived content must not be overwritten.");
    assert.throws(() => scoreComparison(f.paths), /Existing derived artifact differs/);
    assert.equal(readFileSync(join(f.paths.output, "COMPARISON.md"), "utf8"), "Existing derived content must not be overwritten.");
  } finally { f.close(); }
});

test("different buckets can both agree when the physician explicitly accepts both", () => {
  const rows = [{ id: "C04", included: true, astraXhigh: { disposition: "ASYNC_PHYSICIAN", agrees: true }, fable: { disposition: "SELF_CARE", agrees: true } }];
  const metrics = { astraXhigh: { physicianAgree: 49, estimatedUSD: null, medianLatencyMs: 200, p95NearestRankLatencyMs: 400 },
    fable: { physicianAgree: 49, estimatedUSD: .1, medianLatencyMs: 100, p95NearestRankLatencyMs: 200 } };
  const pair = comparePair("astraXhigh", "fable", rows, metrics);
  assert.deepEqual(pair.disagreementIds, ["C04"]);
  assert.deepEqual(pair.bothAgreeDespiteDifferentBucketIds, ["C04"]);
  assert.deepEqual(pair.gainsForLeftIds, []);
  assert.deepEqual(pair.lossesForLeftIds, []);
  assert.equal(pair.estimatedUSDDelta, null);
  assert.equal(pair.estimatedUSDRatio, null);
  assert.equal(pair.medianLatencyRatio, 2);
});
