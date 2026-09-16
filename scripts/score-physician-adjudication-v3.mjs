/** Offline post-output adjudication. Historical references and model outputs are read-only. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BUCKETS, SYSTEM_PROMPT } from "./stripped-3bucket-baseline.mjs";
import { SYSTEM_PROMPT as FIVE_WAY_PROMPT, parseDisposition as parseFiveWay } from "./stripped-disposition-baseline.mjs";
import { IDS, ROUTE_TO_BUCKET, parseRawDisposition, verifyFreeze } from "./score-stripped-3bucket-astra.mjs";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REFERENCE = join(ROOT, "data/evaluation/physician-adjudication-v3-2026-09-15.json");
export const OUTPUT = join(ROOT, "outputs/physician-adjudication-v3-2026-09-15");
export const RUNS = Object.freeze([
  { key: "fableLow", path: "outputs/stripped-3bucket-fable-2026-09-15", provider: "anthropic", model: "claude-fable-5-1", effort: "low", taxonomy: "three_bucket" },
  { key: "astraXhigh", path: "outputs/stripped-3bucket-astra-xhigh-2026-09-15", provider: "openai", model: "gpt-6-astra", effort: "xhigh", taxonomy: "three_bucket" },
  { key: "astraMax", path: "outputs/stripped-3bucket-astra-max-2026-09-15", provider: "openai", model: "gpt-6-astra", effort: "max", taxonomy: "three_bucket" },
  { key: "opusLow", path: "outputs/stripped-3bucket-opus-2026-09-15", provider: "anthropic", model: "claude-opus-5", effort: "low", taxonomy: "three_bucket" },
  { key: "fableMax", path: "outputs/stripped-3bucket-fable-max-2026-09-15", provider: "anthropic", model: "claude-fable-5-1", effort: "max", taxonomy: "three_bucket" },
  { key: "historicalOpusFiveWayCollapsed", path: "outputs/stripped-baseline-2026-09-15", provider: "anthropic", model: "claude-opus-5", effort: "low", taxonomy: "five_way_collapsed_after_generation" },
]);
const sha256 = value => createHash("sha256").update(value).digest("hex");
const readJSON = path => JSON.parse(readFileSync(path, "utf8"));
const idsEqual = (rows, label) => assert.deepEqual(rows.map(row => row.id), IDS, `${label}: expected all 50 unique ordered case IDs`);

export function validateAdjudication(adjudication, baseReference, baseBytes) {
  assert.equal(adjudication.schemaVersion, "physician-adjudication/3");
  assert.equal(adjudication.baseReference.sha256, sha256(baseBytes), "Base reference hash changed");
  assert.equal(adjudication.baseReference.datasetSha256, baseReference.datasetSha256);
  assert.deepEqual(adjudication.baseReference.mapping, ROUTE_TO_BUCKET);
  assert.deepEqual(adjudication.taxonomy, BUCKETS);
  assert.equal(adjudication.scoring.denominator, 50);
  assert.equal(adjudication.provenance.blinded, false);
  assert.equal(adjudication.provenance.independentConsensus, false);
  assert.equal(adjudication.provenance.heldOutValidation, false);
  idsEqual(adjudication.cases, "Adjudication");
  idsEqual(baseReference.cases, "Base reference");
  const corrections = { C25: ["URGENT_ESCALATION"], C32: ["SELF_CARE"], C34: ["SELF_CARE"], C38: ["SELF_CARE"] };
  for (const [index, row] of adjudication.cases.entries()) {
    const previous = baseReference.cases[index];
    const mapped = previous.reference.acceptedRoutes === null ? null : [...new Set(previous.reference.acceptedRoutes.map(route => {
      assert.ok(Object.hasOwn(ROUTE_TO_BUCKET, route), "Unmapped prior route");
      return ROUTE_TO_BUCKET[route];
    }))];
    assert.equal(row.message, previous.message);
    assert.equal(row.inputSHA256, previous.inputHash);
    assert.equal(row.inputSHA256, sha256(row.message));
    assert.deepEqual(row.previousAcceptedRoutes, previous.reference.acceptedRoutes);
    assert.deepEqual(row.previousAcceptedBuckets, mapped);
    assert.deepEqual(row.acceptedBuckets, corrections[row.id] ?? mapped, `Unapproved adjudication change: ${row.id}`);
    assert.ok(row.acceptedBuckets.length > 0 && row.acceptedBuckets.every(value => BUCKETS.includes(value)));
  }
  assert.deepEqual(adjudication.amendments.map(row => row.id), ["C22", "C25", "C32", "C34", "C38", "C47"]);
  return adjudication;
}

/** Verify frozen requests and raw responses before reading either physician reference. */
export function loadRun(config) {
  const directory = join(ROOT, config.path);
  const frozen = verifyFreeze(directory);
  const manifest = readJSON(join(directory, "manifest.json"));
  const fiveWay = config.taxonomy === "five_way_collapsed_after_generation";
  const prompt = fiveWay ? FIVE_WAY_PROMPT : SYSTEM_PROMPT;
  const settings = config.provider === "openai"
    ? { model: config.model, max_output_tokens: 4096, reasoning: { effort: config.effort }, store: false }
    : { model: config.model, max_tokens: 4096, thinking: { type: "adaptive" }, output_config: { effort: config.effort } };
  assert.deepEqual(manifest.settings, settings);
  assert.equal(manifest.systemPrompt, prompt);
  assert.equal(manifest.promptSHA256, sha256(prompt));
  assert.equal(readFileSync(join(directory, "system-prompt.txt"), "utf8"), prompt + "\n");
  idsEqual(manifest.cases, "Frozen manifest");
  const requestIds = [], responseIds = [];
  const predictions = manifest.cases.map(row => {
    assert.deepEqual(Object.keys(row).sort(), ["id", "inputSHA256", "message"]);
    assert.equal(row.inputSHA256, sha256(row.message));
    const request = readJSON(join(directory, `${row.id}-request.json`));
    assert.equal(request.id, row.id);
    assert.equal(request.inputSHA256, row.inputSHA256);
    const expectedBody = config.provider === "openai"
      ? { ...settings, instructions: prompt, input: [{ role: "user", content: row.message }] }
      : { ...settings, system: prompt, messages: [{ role: "user", content: row.message }] };
    assert.deepEqual(request.body, expectedBody, `Unexpected provider context: ${row.id}`);
    const raw = readJSON(join(directory, `${row.id}-raw.json`));
    const record = readJSON(join(directory, `${row.id}-parsed.json`));
    assert.equal(raw.id, row.id);
    assert.equal(record.id, row.id);
    assert.equal(raw.status, 200);
    assert.equal(record.failure, null);
    assert.equal(record.providerCalls, 1);
    assert.ok(raw.requestId);
    const response = JSON.parse(raw.responseText);
    assert.ok(response.id);
    if (config.provider === "openai") {
      assert.match(response.model, /^gpt-6-astra(?:-\d{4}-\d{2}-\d{2})?$/);
      assert.equal(response.reasoning.effort, config.effort);
      assert.equal(record.responseId, response.id);
      assert.equal(record.responseEffort, config.effort);
    } else assert.equal(response.model, config.model);
    const parsed = fiveWay ? parseFiveWay(response) : parseRawDisposition(response, config.provider);
    assert.deepEqual(record.parsed, parsed, `Parsed output differs from raw: ${row.id}`);
    assert.deepEqual(record.usage, response.usage);
    requestIds.push(raw.requestId);
    responseIds.push(response.id);
    return { id: row.id, message: row.message, inputSHA256: row.inputSHA256,
      originalDisposition: fiveWay ? parsed.disposition_name : parsed.disposition,
      disposition: fiveWay ? ROUTE_TO_BUCKET[parsed.disposition_name] : parsed.disposition,
      rationale: parsed.rationale };
  });
  assert.equal(new Set(requestIds).size, 50);
  assert.equal(new Set(responseIds).size, 50);
  return { config, frozen, manifest, predictions, requestIds, responseIds };
}

/** Binary terminology is separate from exact three-bucket agreement. */
export function clinicianActionClassification(disposition, acceptedBuckets) {
  assert.ok(BUCKETS.includes(disposition));
  assert.ok(acceptedBuckets.length > 0 && acceptedBuckets.every(value => BUCKETS.includes(value)));
  const requiredActions = [...new Set(acceptedBuckets.map(value => value !== "SELF_CARE"))];
  if (requiredActions.length !== 1) return "AMBIGUOUS_ENDPOINT";
  const predictedPositive = disposition !== "SELF_CARE";
  return requiredActions[0] ? (predictedPositive ? "TP" : "FN") : (predictedPositive ? "FP" : "TN");
}

export function scoreRun(predictions, adjudication) {
  idsEqual(predictions, "Predictions");
  idsEqual(adjudication.cases, "Adjudication");
  const rows = predictions.map((prediction, index) => {
    const reference = adjudication.cases[index];
    assert.ok(BUCKETS.includes(prediction.disposition), `Invalid prediction: ${prediction.id}`);
    assert.equal(prediction.message, reference.message);
    assert.equal(prediction.inputSHA256, reference.inputSHA256);
    const previous = reference.previousAcceptedBuckets;
    return { ...prediction, acceptedBuckets: reference.acceptedBuckets,
      previousAcceptedBuckets: previous, agrees: reference.acceptedBuckets.includes(prediction.disposition),
      previousAgrees: previous === null ? null : previous.includes(prediction.disposition),
      clinicianAction: clinicianActionClassification(prediction.disposition, reference.acceptedBuckets),
      amendmentId: reference.amendmentId };
  });
  const previousRows = rows.filter(row => row.previousAgrees !== null);
  assert.equal(previousRows.length, 49, "Original v2 denominator must remain 49");
  const confusion = Object.fromEntries(["TP", "TN", "FP", "FN", "AMBIGUOUS_ENDPOINT"].map(key => [key, rows.filter(row => row.clinicianAction === key).length]));
  return { referenceId: adjudication.referenceId, agree: rows.filter(row => row.agrees).length, denominator: 50,
    missIds: rows.filter(row => !row.agrees).map(row => row.id),
    previousV2: { agree: previousRows.filter(row => row.previousAgrees).length, denominator: 49 },
    revisedCommon49: { agree: previousRows.filter(row => row.agrees).length, denominator: 49 },
    adjudicationGainsOnCommon49: previousRows.filter(row => !row.previousAgrees && row.agrees).map(row => row.id),
    adjudicationLossesOnCommon49: previousRows.filter(row => row.previousAgrees && !row.agrees).map(row => row.id),
    newlyIncludedIds: rows.filter(row => row.previousAgrees === null).map(row => row.id),
    clinicianActionEndpoint: adjudication.scoring.positiveEndpoint, clinicianActionConfusion: confusion,
    urgencyMismatchWithBothPositiveIds: rows.filter(row => !row.agrees && row.clinicianAction === "TP").map(row => row.id), rows };
}

export function writeUnchangedOrNew(path, text) {
  if (existsSync(path)) assert.equal(readFileSync(path, "utf8"), text, `Existing derived artifact differs: ${path}`);
  else writeFileSync(path, text, { flag: "wx" });
}

const csvQuote = value => `"${String(value ?? "").replaceAll('"', '""')}"`;
function comparisonCSV(rows, keys) {
  const columns = ["id", "message", "acceptedBuckets", "previousAcceptedBuckets", "amendmentId",
    ...keys.flatMap(key => [`${key}Disposition`, `${key}Rationale`, `${key}Agrees`, `${key}ClinicianAction`])];
  return [columns.join(","), ...rows.map(row => columns.map(column => csvQuote(row[column])).join(","))].join("\r\n") + "\r\n";
}

export function scoreAdjudication({ output = OUTPUT } = {}) {
  const runs = RUNS.map(loadRun);
  const referenceBytes = readFileSync(REFERENCE);
  const reference = JSON.parse(referenceBytes);
  const baseBytes = readFileSync(join(ROOT, reference.baseReference.path));
  validateAdjudication(reference, JSON.parse(baseBytes), baseBytes);
  for (const run of runs) assert.equal(run.manifest.csvSHA256, reference.baseReference.datasetSha256);
  const scorecards = Object.fromEntries(runs.map(run => [run.config.key, { run: run.config, ...scoreRun(run.predictions, reference) }]));
  const rows = reference.cases.map((row, index) => ({ id: row.id, message: row.message,
    acceptedBuckets: row.acceptedBuckets.join("|"), previousAcceptedBuckets: row.previousAcceptedBuckets?.join("|") ?? "UNRESOLVED_IN_V2", amendmentId: row.amendmentId,
    ...Object.fromEntries(runs.flatMap(({ config }) => {
      const scored = scorecards[config.key].rows[index];
      return [[`${config.key}Disposition`, scored.disposition], [`${config.key}Rationale`, scored.rationale],
        [`${config.key}Agrees`, scored.agrees], [`${config.key}ClinicianAction`, scored.clinicianAction]];
    })) }));
  const pairwise = Object.fromEntries(["astraXhigh", "astraMax"].map(key => [key + "VsFableLow", {
    disagreementIds: rows.filter(row => row[key + "Disposition"] !== row.fableLowDisposition).map(row => row.id),
    astraAgreesFableMisses: rows.filter(row => row[key + "Agrees"] && !row.fableLowAgrees).map(row => row.id),
    fableAgreesAstraMisses: rows.filter(row => row.fableLowAgrees && !row[key + "Agrees"]).map(row => row.id),
  }]));
  const summary = { referenceId: reference.referenceId, interpretation: reference.limitations,
    physicianReassessment: reference.provenance, csvAgreementScored: false,
    scores: Object.fromEntries(Object.entries(scorecards).map(([key, { rows: ignored, ...score }]) => [key, score])), pairwise };
  const allRequestIds = runs.flatMap(run => run.requestIds), allResponseIds = runs.flatMap(run => run.responseIds);
  assert.equal(new Set(allRequestIds).size, 300);
  assert.equal(new Set(allResponseIds).size, 300);
  const audit = { referencePath: relative(ROOT, REFERENCE), referenceSHA256: sha256(referenceBytes),
    baseReferencePath: reference.baseReference.path, baseReferenceSHA256: sha256(baseBytes),
    assignmentCSVFileRead: false, csvLabelsUsedForScoring: false, newProviderCalls: 0,
    frozenArtifactCount: runs.reduce((sum, run) => sum + run.frozen.verifiedArtifactCount, 0),
    exactMessageOnlyRequestsVerified: 300, parsedOutputsMatchRaw: 300,
    uniqueProviderRequestIds: new Set(allRequestIds).size, uniqueProviderResponseIds: new Set(allResponseIds).size,
    sourceRuns: runs.map(run => ({ ...run.config, manifestSHA256: sha256(readFileSync(join(ROOT, run.config.path, "manifest.json"))),
      completedAt: run.frozen.complete.completedAt, completionSHA256: run.frozen.completionSHA256, promptSHA256: run.manifest.promptSHA256 })) };
  mkdirSync(output, { recursive: true });
  const writeJSON = (name, value) => writeUnchangedOrNew(join(output, name), JSON.stringify(value, null, 2) + "\n");
  for (const [key, value] of Object.entries(scorecards)) writeJSON(`scorecard-${key}.json`, value);
  writeJSON("comparison.json", summary);
  writeJSON("scoring-audit.json", audit);
  writeUnchangedOrNew(join(output, "all-case-comparison.csv"), comparisonCSV(rows, runs.map(run => run.config.key)));
  writeUnchangedOrNew(join(output, "astra-fable-disagreements.csv"), comparisonCSV(rows.filter(row => row.astraXhighDisposition !== row.fableLowDisposition || row.astraMaxDisposition !== row.fableLowDisposition), ["fableLow", "astraXhigh", "astraMax"]));
  return { summary, scorecards, audit };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = scoreAdjudication();
  console.log(JSON.stringify({ scores: Object.fromEntries(Object.entries(result.summary.scores).map(([key, score]) => [key, { agree: score.agree, denominator: score.denominator, missIds: score.missIds }])), audit: result.audit }, null, 2));
}
