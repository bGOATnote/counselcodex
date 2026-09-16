/** Offline scoring of a frozen conditional subtype experiment. No inference or CSV access. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BUCKETS } from "./stripped-3bucket-baseline.mjs";
import { IDS, ROUTE_TO_BUCKET, loadFrozenRun, verifyFreeze } from "./score-stripped-3bucket-astra.mjs";
import { buildRequest, parseSubdisposition, mapSubdisposition, STRATIFICATION_SETTINGS,
  STRATIFICATION_PROMPTS, STRATIFICATION_PROMPT_HASHES } from "./stripped-stratification-fable.mjs";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_OUTPUT = join(ROOT, "outputs/stripped-stratification-fable-2026-09-15");
export const DEFAULT_PARENT = join(ROOT, "outputs/stripped-3bucket-fable-2026-09-15");
export const DEFAULT_REFERENCE = join(ROOT, "data/evaluation/physician-adjudication-v3-2026-09-15.json");
const sha256 = value => createHash("sha256").update(value).digest("hex");
const readJSON = path => JSON.parse(readFileSync(path, "utf8"));
const verifyIds = (rows, label) => assert.deepEqual(rows.map(row => row.id), IDS, `${label}: expected all 50 ordered unique cases`);
const uniqueSorted = values => [...new Set(values)].sort();
const ROUTE_ORDER = Object.freeze({ SELF_CARE: 0, STANDARD_ASYNC: 1, PRIORITY_ASYNC: 2, SAME_DAY_IN_PERSON: 3, EMERGENCY_NOW: 4 });

/** Use the existing finer reference unless the physician explicitly changed the parent bucket.
 * SELF_CARE has one finer route. An urgent parent label alone cannot establish an emergency subtype.
 */
export function buildFineReference(base, adjudication) {
  verifyIds(base.cases, "Base reference");
  verifyIds(adjudication.cases, "Adjudication");
  const cases = adjudication.cases.map((row, index) => {
    const previous = base.cases[index];
    assert.equal(row.message, previous.message);
    assert.equal(row.inputSHA256, previous.inputHash);
    assert.equal(row.inputSHA256, sha256(row.message));
    assert.ok(row.acceptedBuckets.length && row.acceptedBuckets.every(value => BUCKETS.includes(value)), `Invalid accepted parent bucket: ${row.id}`);
    assert.deepEqual(row.previousAcceptedRoutes, previous.reference.acceptedRoutes, `Untracked base reference change: ${row.id}`);
    let acceptedRoutes, source;
    if (row.id === "C25") {
      assert.equal(previous.reference.acceptedRoutes, null, "C25 has no finer adjudication in the frozen reference");
      assert.deepEqual(row.acceptedBuckets, ["URGENT_ESCALATION"]);
      acceptedRoutes = null;
      source = "physician-v3-parent-only; finer urgency not adjudicated";
    } else {
      const previousRoutes = previous.reference.acceptedRoutes;
      assert.ok(Array.isArray(previousRoutes) && previousRoutes.length, `Missing finer reference: ${row.id}`);
      assert.ok(previousRoutes.every(route => Object.hasOwn(ROUTE_TO_BUCKET, route)), `Unknown finer reference: ${row.id}`);
      const previousBuckets = uniqueSorted(previousRoutes.map(route => ROUTE_TO_BUCKET[route]));
      if (JSON.stringify(uniqueSorted(row.acceptedBuckets)) !== JSON.stringify(previousBuckets)) {
        assert.deepEqual(row.acceptedBuckets, ["SELF_CARE"], `Parent revision requires an explicit finer adjudication: ${row.id}`);
        acceptedRoutes = ["SELF_CARE"];
        source = "physician-v3-self-care-correction";
      } else {
        acceptedRoutes = previousRoutes;
        source = "physician-v2-finer-routes-carried-forward";
      }
      assert.deepEqual(uniqueSorted(acceptedRoutes.map(route => ROUTE_TO_BUCKET[route])), uniqueSorted(row.acceptedBuckets));
    }
    return { id: row.id, message: row.message, inputSHA256: row.inputSHA256,
      acceptedBuckets: row.acceptedBuckets, acceptedRoutes, source, amendmentId: row.amendmentId ?? null };
  });
  assert.deepEqual(cases.filter(row => row.acceptedRoutes === null).map(row => row.id), ["C25"]);
  return { parentReferenceId: adjudication.referenceId, finerReferenceBasis: "physician-system-reference-v2 acceptedRoutes plus physician-v3 parent corrections", cases };
}

const summarize = rows => ({ agree: rows.filter(row => row.agrees).length, denominator: rows.length,
  agreement: rows.length ? rows.filter(row => row.agrees).length / rows.length : null,
  missIds: rows.filter(row => !row.agrees).map(row => row.id) });

/** Predictions retain the original parent disposition. Subtype failures never drop a case. */
export function scoreStratification(predictions, reference) {
  verifyIds(predictions, "Predictions");
  verifyIds(reference.cases, "Reference");
  const rows = predictions.map((prediction, index) => {
    const gold = reference.cases[index];
    assert.equal(prediction.message, gold.message);
    assert.equal(prediction.inputSHA256, gold.inputSHA256);
    assert.ok(BUCKETS.includes(prediction.parentDisposition), `Invalid frozen parent: ${prediction.id}`);
    const finalRoute = prediction.finalRoute;
    if (finalRoute !== null) {
      assert.ok(Object.hasOwn(ROUTE_TO_BUCKET, finalRoute), `Invalid final route: ${prediction.id}`);
      assert.equal(ROUTE_TO_BUCKET[finalRoute], prediction.parentDisposition, `Subtype changed parent bucket: ${prediction.id}`);
      assert.equal(prediction.failure, null);
    } else assert.ok(prediction.failure, `Unrecorded subtype failure: ${prediction.id}`);
    const passthrough = prediction.parentDisposition === "SELF_CARE";
    if (passthrough) {
      assert.equal(finalRoute, "SELF_CARE");
      assert.equal(prediction.providerCalls, 0, `SELF_CARE must pass through: ${prediction.id}`);
    } else assert.equal(prediction.providerCalls, 1, `Expected one subtype attempt: ${prediction.id}`);
    const parentAgrees = gold.acceptedBuckets.includes(prediction.parentDisposition);
    const finerIncluded = gold.acceptedRoutes !== null;
    const finerAgrees = finerIncluded ? gold.acceptedRoutes.includes(finalRoute) : null;
    let mismatchDirection = null;
    if (finerIncluded && !finerAgrees) {
      if (finalRoute === null) mismatchDirection = "provider_or_output_failure";
      else {
        const acceptedRanks = gold.acceptedRoutes.map(route => ROUTE_ORDER[route]);
        mismatchDirection = ROUTE_ORDER[finalRoute] < Math.min(...acceptedRanks) ? "less_urgent_than_accepted"
          : ROUTE_ORDER[finalRoute] > Math.max(...acceptedRanks) ? "more_urgent_than_accepted" : "between_accepted_routes";
      }
    }
    return { ...prediction, acceptedBuckets: gold.acceptedBuckets, acceptedRoutes: gold.acceptedRoutes,
      referenceSource: gold.source, parentAgrees, finerIncluded, finerAgrees,
      conditionalIncluded: !passthrough && parentAgrees && finerIncluded,
      mismatchDirection,
      errorStage: !parentAgrees ? "parent" : (finerIncluded && !finerAgrees ? "subtype" : null) };
  });
  const finerRows = rows.filter(row => row.finerIncluded);
  assert.equal(finerRows.length, 49, "Finer denominator excludes only C25");
  const conditionalRows = rows.filter(row => row.conditionalIncluded);
  const parent = summarize(rows.map(row => ({ ...row, agrees: row.parentAgrees })));
  const endToEnd = { ...summarize(finerRows.map(row => ({ ...row, agrees: row.finerAgrees }))), excludedIds: ["C25"] };
  const conditional = { ...summarize(conditionalRows.map(row => ({ ...row, agrees: row.finerAgrees }))),
    definition: "Finer-eligible cases with a correct frozen ASYNC_PHYSICIAN or URGENT_ESCALATION parent; failures retained",
    byParent: Object.fromEntries(["ASYNC_PHYSICIAN", "URGENT_ESCALATION"].map(bucket => [bucket,
      summarize(conditionalRows.filter(row => row.parentDisposition === bucket).map(row => ({ ...row, agrees: row.finerAgrees }))) ])) };
  return { parentReferenceId: reference.parentReferenceId, finerReferenceBasis: reference.finerReferenceBasis,
    parent, endToEnd, conditional,
    coverage: { cases: 50, subtypeCalls: rows.reduce((sum, row) => sum + row.providerCalls, 0),
      passthroughCases: rows.filter(row => row.parentDisposition === "SELF_CARE").length,
      failedSubtypeIds: rows.filter(row => row.failure !== null).map(row => row.id),
      parentMissIds: rows.filter(row => !row.parentAgrees).map(row => row.id),
      subtypeMissIds: rows.filter(row => row.errorStage === "subtype").map(row => row.id),
      parentChangedBySubtypeIds: [] },
    interpretation: [
      "The first stage reuses frozen predictions; unchanged parent agreement is a preservation check, not a fresh replication.",
      "Conditional subtype agreement omits known parent errors by definition; end-to-end agreement retains them.",
      "Physician-v3 corrections were made after reviewing model outputs and are not blinded independent validation.",
      "Route agreement does not establish clinical advice quality or deployment readiness.",
      "Historical five-way Opus35/49 used physician-v2; it is not directly comparable to a v3-adjusted numerator.",
    ], csvLabelsRead: false, csvAgreementScored: false, rows };
}

export function writeUnchangedOrNew(path, value) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n";
  if (existsSync(path)) assert.equal(readFileSync(path, "utf8"), text, `Existing derived artifact differs: ${path}`);
  else writeFileSync(path, text, { flag: "wx" });
}

/** Verify every new artifact before inspecting either physician reference. */
export function verifyStratificationFreeze(directory) {
  const completionPath = join(directory, "generation-complete.json");
  const complete = readJSON(completionPath);
  assert.equal(complete.plannedCases, 50);
  assert.equal(complete.providerCalls, 41);
  assert.equal(complete.eligibleCalls, 41);
  assert.equal(complete.newParentCalls, 0);
  assert.equal(complete.selfCarePassThrough, 9);
  assert.ok(Number.isFinite(Date.parse(complete.completedAt)), "Missing generation completion time");
  assert.ok(Array.isArray(complete.failedCases));
  assert.equal(new Set(complete.failedCases).size, complete.failedCases.length);
  assert.equal(complete.validSubdispositions + complete.failedCases.length, 50);
  assert.equal(complete.validSubtypeCalls + complete.failedCases.length, 41);
  const hashes = complete.artifactHashes;
  assert.ok(hashes && typeof hashes === "object", "Missing frozen artifact hashes");
  assert.match(hashes["manifest.json"] ?? "", /^[a-f0-9]{64}$/, "Unfrozen subtype manifest");
  for (const [name, hash] of Object.entries(hashes)) {
    assert.ok(name && !name.includes("/") && !name.includes("\\") && name !== "..", "Unsafe frozen artifact path");
    assert.match(hash, /^[a-f0-9]{64}$/, "Invalid frozen artifact hash");
    assert.equal(sha256(readFileSync(join(directory, name))), hash, `Frozen subtype artifact drift: ${name}`);
  }
  const manifest = readJSON(join(directory, "manifest.json"));
  assert.equal(manifest.protocol, "stripped-conditional-stratification/v1");
  assert.deepEqual(manifest.settings, STRATIFICATION_SETTINGS);
  assert.deepEqual(manifest.prompts, STRATIFICATION_PROMPTS);
  assert.deepEqual(manifest.promptSHA256, STRATIFICATION_PROMPT_HASHES);
  verifyIds(manifest.cases, "Subtype manifest");
  const expectedArtifacts = ["manifest.json", ...Object.keys(STRATIFICATION_PROMPTS).map(parent => `system-prompt-${parent}.txt`),
    ...manifest.cases.flatMap(row => (row.parentDisposition === "SELF_CARE" ? ["parsed"] : ["request", "raw", "parsed"])
      .map(kind => `${row.id}-${kind}.json`))];
  assert.equal(expectedArtifacts.length, 135, "Expected 41 subtype attempts and 9 pass-through records");
  assert.deepEqual(Object.keys(hashes).sort(), expectedArtifacts.sort(), "Unfrozen or unexpected subtype artifact");
  for (const [parent, prompt] of Object.entries(STRATIFICATION_PROMPTS)) {
    assert.equal(readFileSync(join(directory, `system-prompt-${parent}.txt`), "utf8"), prompt + "\n");
  }
  return { directory, complete, manifest, completionSHA256: sha256(readFileSync(completionPath)), verifiedArtifacts: expectedArtifacts.length };
}

export function loadFrozenStratification({ directory = DEFAULT_OUTPUT, parentDirectory = DEFAULT_PARENT } = {}) {
  const frozen = verifyStratificationFreeze(directory);
  const parent = loadFrozenRun(verifyFreeze(parentDirectory), { provider: "anthropic", effort: "low" });
  const { complete, manifest } = frozen;
  assert.equal(manifest.parent.completionSHA256, parent.completionSHA256, "Frozen parent completion changed");
  assert.equal(manifest.parent.manifestSHA256, sha256(readFileSync(join(parentDirectory, "manifest.json"))), "Frozen parent manifest changed");
  assert.equal(manifest.parent.promptSHA256, parent.manifest.promptSHA256);
  assert.deepEqual(manifest.cases, parent.predictions.map(row => ({ id: row.id, message: row.message,
    inputSHA256: sha256(row.message), parentDisposition: row.parsed.disposition })), "Frozen parent predictions changed");
  assert.deepEqual(manifest.callPolicy, { plannedCases: 50, newParentCalls: 0, subtypeCalls: 41, callsPerEligibleCase: 1,
    selfCarePassThrough: 9, concurrency: 4, automaticRetries: 0, fallbacks: 0, judgeCalls: 0 });
  const requestIds = [], responseIds = [];
  const predictions = manifest.cases.map((row, index) => {
    const record = readJSON(join(directory, `${row.id}-parsed.json`));
    assert.equal(record.id, row.id);
    assert.equal(record.parentDisposition, row.parentDisposition);
    let latencyMs = 0;
    if (row.parentDisposition === "SELF_CARE") {
      assert.equal(record.providerCalls, 0);
      assert.equal(record.parsed, null);
      assert.equal(record.subdisposition, "SELF_CARE");
      assert.equal(record.failure, null);
      assert.equal(record.model, null);
      assert.equal(record.usage, null);
      for (const kind of ["request", "raw"]) assert.equal(existsSync(join(directory, `${row.id}-${kind}.json`)), false, `Unexpected SELF_CARE call: ${row.id}`);
    } else {
      const request = readJSON(join(directory, `${row.id}-request.json`));
      const raw = readJSON(join(directory, `${row.id}-raw.json`));
      assert.equal(request.id, row.id);
      assert.equal(request.parentDisposition, row.parentDisposition);
      assert.equal(request.inputSHA256, row.inputSHA256);
      assert.deepEqual(request.body, buildRequest(row), `Unexpected subtype provider context: ${row.id}`);
      assert.equal(raw.id, row.id);
      assert.equal(record.providerCalls, 1);
      assert.ok(Number.isFinite(raw.latencyMs) && raw.latencyMs >= 0);
      latencyMs = raw.latencyMs;
      let expected = null, response = null;
      try {
        assert.equal(raw.status, 200);
        response = JSON.parse(raw.responseText);
        assert.equal(response.model, STRATIFICATION_SETTINGS.model);
        expected = parseSubdisposition(response, row.parentDisposition);
      } catch { assert.ok(record.failure, `Unrecorded failed subtype response: ${row.id}`); }
      assert.deepEqual(record.parsed, expected, `Subtype parsed output differs from raw: ${row.id}`);
      assert.equal(record.subdisposition, expected ? mapSubdisposition(row.parentDisposition, expected) : null);
      assert.equal(record.failure === null, expected !== null);
      if (expected) {
        assert.ok(raw.requestId, `Missing subtype request ID: ${row.id}`);
        assert.ok(response.id, `Missing subtype response ID: ${row.id}`);
      }
      if (raw.requestId) requestIds.push(raw.requestId);
      if (response?.id) responseIds.push(response.id);
      if (response) {
        assert.equal(record.model, response.model);
        assert.equal(record.responseId, response.id);
        assert.deepEqual(record.usage, response.usage);
      }
    }
    return { ...row, parentRationale: parent.predictions[index].parsed.rationale,
      choice: record.parsed?.choice ?? null, rationale: record.parsed?.rationale ?? null,
      finalRoute: record.subdisposition, failure: record.failure, providerCalls: record.providerCalls,
      subtypeLatencyMs: latencyMs, parentLatencyMs: parent.predictions[index].latencyMs,
      sequentialLatencyMs: parent.predictions[index].latencyMs + latencyMs };
  });
  assert.deepEqual(predictions.filter(row => row.failure !== null).map(row => row.id), complete.failedCases);
  assert.equal(predictions.filter(row => row.finalRoute !== null).length, complete.validSubdispositions);
  assert.equal(new Set([...parent.requestIds, ...requestIds]).size, parent.requestIds.length + requestIds.length, "Reused provider request ID");
  assert.equal(new Set([...parent.responseIds, ...responseIds]).size, parent.responseIds.length + responseIds.length, "Reused provider response ID");
  return { ...frozen, parent, predictions, requestIds, responseIds };
}

function latencySummary(values) {
  const sorted = [...values].sort((a, b) => a - b), n = sorted.length;
  return { count: n, medianMs: n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
    p95NearestRankMs: sorted[Math.ceil(.95 * n) - 1] };
}

function reportMarkdown(scorecard, summary, audit, originalV2) {
  const percent = score => `${score.agree}/${score.denominator} (${(100 * score.agreement).toFixed(1)}%)`;
  const money = value => Number.isFinite(value) ? value.toFixed(6) : "unavailable";
  const misses = scorecard.rows.filter(row => row.finerIncluded && !row.finerAgrees);
  const upperBound = scorecard.endToEnd.denominator - scorecard.rows.filter(row => row.finerIncluded && !row.parentAgrees).length;
  const lines = ["# Conditional disposition stratification: Fable 5.1 low", "", "Study date: September 15, 2026. Generation freeze recorded in UTC: " + audit.subtypeGenerationCompletedAt + ".", "",
    "## Result", "",
    `The frozen three-bucket decisions remain **${percent(scorecard.parent)}** by construction. Adding a conditional subtype call produces **${percent(scorecard.endToEnd)}** end-to-end five-way agreement. Among correct-parent cases with an existing finer reference, subtype agreement is **${percent(scorecard.conditional)}**.`, "",
    `The end-to-end maximum imposed by the frozen parent predictions is ${upperBound}/${scorecard.endToEnd.denominator}. C22 and C47 are frozen SELF_CARE parent errors, and this experiment cannot reconsider that branch. The unchanged parent score preserves existing outputs; it is not a repeat demonstration of model reliability.`, "",
    "| Measurement | Agreement | Denominator |", "|---|---:|---|",
    `| Frozen parent, physician-v3 | ${scorecard.parent.agree}/50 | All 50 messages |`,
    `| End-to-end five-way, v3-adjusted finer reference | ${scorecard.endToEnd.agree}/49 | All finer-eligible messages, retaining parent and subtype errors |`,
    `| Conditional subtype | ${scorecard.conditional.agree}/${scorecard.conditional.denominator} | Correct ASYNC/URGENT parent and finer reference available |`,
    `| Async subtype | ${scorecard.conditional.byParent.ASYNC_PHYSICIAN.agree}/${scorecard.conditional.byParent.ASYNC_PHYSICIAN.denominator} | Correct async parent |`,
    `| Urgent subtype | ${scorecard.conditional.byParent.URGENT_ESCALATION.agree}/${scorecard.conditional.byParent.URGENT_ESCALATION.denominator} | Correct urgent parent, excluding C25 |`, "",
    `${scorecard.coverage.subtypeCalls - scorecard.coverage.failedSubtypeIds.length}/${scorecard.coverage.subtypeCalls} new subtype calls returned valid decisions. ${scorecard.coverage.passthroughCases} SELF_CARE records passed through without a call. No retry, fallback, judge, retrieval, parent correction or new reference label was introduced. Failures remain in the applicable denominators.`, "",
    "## Prompt and reference provenance", "",
    "The first-stage Fable 5.1 low prompt and predictions are unchanged. The second stage receives only the original patient message as user content. The fixed parent selects a two-option system prompt; the model returns a numeric choice and short rationale. Parent rationale, case ID, physician reference and CSV labels are absent from the provider request.", "",
    "The finer score carries forward physician-system-reference-v2 acceptedRoutes. Physician-v3 changed C32, C34 and C38 to SELF_CARE, so those single-route corrections supersede their former async references. C25 has an accepted urgent parent, but no adjudicated emergency-versus-same-day subtype; its subtype is reported and excluded from both finer denominators. Physician-v3 is a post-output physician reassessment, not independent blinded validation.", "",
    `A separate sensitivity score applies the unchanged original v2 finer reference to these same outputs: **${percent(originalV2)}**. Historical five-way Opus was 35/49 on that original v2 reference. This is a reference-consistent descriptive comparison of different protocols and single runs, not evidence of clinical superiority. The primary v3-adjusted ${scorecard.endToEnd.agree}/49 numerator must not be directly contrasted with original-v2 Opus 35/49 as if their references were identical.`, "",
    "## Interpretation of the subtype disagreements", "",
    "- Four refill cases—C06, C18, C24 and C46—follow the explicit subtype prompt by choosing PRIORITY_ASYNC, while the carried-forward physician reference accepts STANDARD_ASYNC. These are prompt/reference policy disagreements and remain counted as misses; the score is not adjusted to remove them.",
    "- C13 chooses STANDARD_ASYNC where the reference accepts PRIORITY_ASYNC.",
    "- C12, C16, C28 and C44 choose SAME_DAY_IN_PERSON where the reference accepts EMERGENCY_NOW. The preserved urgent parent conceals these finer timing disagreements when results are viewed only at three-bucket resolution.",
    "- C22 and C47 remain first-stage undertriage relative to the physician reference. They receive no subtype call and are retained in the end-to-end score.",
    "- Several rationales cite the absence of reported features when selecting a lower urgency. Unreported findings are not verified negative findings. The saved rationale is model output, not a clinician attestation or a completed assessment.", "",
    "No clinical-reference revisions or prompt iterations were performed after inspecting this run. The result supports retaining the existing three-bucket demonstration while treating the finer labels as an evaluated research extension. Route agreement alone does not validate advice quality; C38 pregnancy precautions remain a separate concern from its self-care route.", "",
    "## Exact misses", "",
    "| Case | Error stage | Frozen parent | Final route | Accepted finer route | Direction relative to reference |",
    "|---|---|---|---|---|---|",
    ...misses.map(row => `| ${row.id} | ${row.errorStage} | ${row.parentDisposition} | ${row.finalRoute ?? "FAILED"} | ${row.acceptedRoutes.join(" or ")} | ${row.mismatchDirection.replaceAll("_", " ")} |`), "",
    ...misses.flatMap(row => [`### ${row.id}: ${row.errorStage} disagreement`, "", `**Patient message:** ${row.message}`, "",
      `**Frozen parent rationale:** ${row.parentRationale}`, "",
      `**Subtype rationale:** ${row.rationale ?? "No subtype call: frozen SELF_CARE passed through."}`, "",
      `**Reference:** ${row.acceptedRoutes.join(" or ")}. **Final route:** ${row.finalRoute ?? "FAILED"}.`, ""]),
    "## C25: parent accepted, finer urgency unscored", "",
    `**Patient message:** ${scorecard.rows[24].message}`, "",
    `**Model subtype:** ${scorecard.rows[24].finalRoute}.`, "",
    `**Subtype rationale:** ${scorecard.rows[24].rationale}`, "",
    "The user's physician reassessment established URGENT_ESCALATION only. The model's finer choice is not assigned a correct/incorrect score.", "",
    "## Latency and accounting", "",
    `The new subtype calls had a median latency of ${(summary.timing.subtypeCallsOnly.medianMs / 1000).toFixed(3)} seconds and p95 of ${(summary.timing.subtypeCallsOnly.p95NearestRankMs / 1000).toFixed(3)} seconds. Adding each saved parent latency to its subtype latency gives an estimated sequential median of ${(summary.timing.sequentialPipelineEstimate.medianMs / 1000).toFixed(3)} seconds and p95 of ${(summary.timing.sequentialPipelineEstimate.p95NearestRankMs / 1000).toFixed(3)} seconds. These sums combine separate runs and are not measured live end-to-end latency.`, "",
    `The new subtype run's token estimate is USD ${money(summary.accounting.newSubtypeEstimatedUSD)}; conservative accounting is USD ${money(summary.accounting.newSubtypeAccountedUSD)}. These values cover only this extension and are not provider invoices. Financial figures are not presentation content.`, "",
    "## Reproduction and evidence", "", "```sh", "node scripts/score-stripped-stratification.mjs", "node --test tests/stripped-stratification-score.test.mjs", "```", "",
    "The offline scorer verifies both generation freezes, all request bodies, raw-to-parsed consistency, original parent identity, 135 subtype artifacts and 150 original parent artifacts before loading physician references. It never opens the assignment CSV. Re-running it verifies existing derived artifacts and performs no provider calls.", "",
    "- [Primary physician scorecard](scorecard-physician.json)", "- [Original-v2 sensitivity score](scorecard-original-v2.json)",
    "- [Summary and timing](summary.json)", "- [Scoring audit](scoring-audit.json)",
    "- [All case records](all-case-scorecard.csv)", "- [Exact misses](misses.csv)", "",
    `Async subtype prompt SHA256: \`${audit.subtypePromptSHA256.ASYNC_PHYSICIAN}\`.`, "",
    `Urgent subtype prompt SHA256: \`${audit.subtypePromptSHA256.URGENT_ESCALATION}\`.`, "",
    `Generation-complete SHA256: \`${audit.subtypeCompletionSHA256}\`.`, ""];
  return lines.join("\n");
}

export function scoreFrozenStratification({ directory = DEFAULT_OUTPUT, parentDirectory = DEFAULT_PARENT,
  referencePath = DEFAULT_REFERENCE, baseReferencePath, output = directory } = {}) {
  // Both generation freezes and all provider contexts must verify before any reference is read.
  const run = loadFrozenStratification({ directory, parentDirectory });
  const adjudicationBytes = readFileSync(referencePath);
  const adjudication = JSON.parse(adjudicationBytes);
  const basePath = baseReferencePath ?? join(ROOT, adjudication.baseReference.path);
  const baseBytes = readFileSync(basePath), base = JSON.parse(baseBytes);
  assert.equal(sha256(baseBytes), adjudication.baseReference.sha256, "Base physician reference changed");
  assert.equal(base.datasetSha256, run.parent.manifest.csvSHA256, "Patient dataset differs from physician reference");
  const reference = buildFineReference(base, adjudication);
  const scorecard = scoreStratification(run.predictions, reference);
  const audit = { referencePath: relative(ROOT, referencePath), referenceSHA256: sha256(adjudicationBytes),
    baseReferencePath: relative(ROOT, basePath), baseReferenceSHA256: sha256(baseBytes),
    subtypeGenerationCompletedAt: run.complete.completedAt, subtypeCompletionSHA256: run.completionSHA256,
    subtypeManifestSHA256: sha256(readFileSync(join(directory, "manifest.json"))),
    parentCompletionSHA256: run.parent.completionSHA256, verifiedParentArtifacts: run.parent.verifiedArtifactCount,
    verifiedSubtypeArtifacts: run.verifiedArtifacts, subtypePromptSHA256: run.manifest.promptSHA256,
    newParentCalls: 0, newSubtypeCalls: 41, exactMessageOnlySubtypeRequestsVerified: 41,
    parsedSubtypeOutputsMatchRaw: 41, selfCarePassThrough: 9,
    assignmentCSVFileRead: false, csvLabelsUsedForScoring: false,
    referencesReadOnlyAfterBothFreezesVerified: true,
    uniqueSubtypeRequestIds: run.requestIds.length, uniqueSubtypeResponseIds: run.responseIds.length };
  const timing = { parent: latencySummary(run.predictions.map(row => row.parentLatencyMs)),
    subtypeCallsOnly: latencySummary(run.predictions.filter(row => row.providerCalls).map(row => row.subtypeLatencyMs)),
    sequentialPipelineEstimate: latencySummary(run.predictions.map(row => row.sequentialLatencyMs)),
    interpretation: "Sequential latency adds the saved parent latency to the new subtype latency per case. This is an estimate across separate runs, not a live end-to-end measurement." };
  const summary = { ...scorecard, rows: undefined, model: run.manifest.settings.model, effort: run.manifest.settings.output_config.effort,
    timing, accounting: { newSubtypeEstimatedUSD: run.complete.estimatedUSD, newSubtypeAccountedUSD: run.complete.accountedUSD,
      interpretation: "New subtype run only. Estimates use the existing accounting convention and are not provider invoices." } };
  mkdirSync(output, { recursive: true });
  writeUnchangedOrNew(join(output, "scorecard-physician.json"), scorecard);
  writeUnchangedOrNew(join(output, "summary.json"), summary);
  writeUnchangedOrNew(join(output, "scoring-audit.json"), audit);
  const fields = ["id", "message", "parentDisposition", "finalRoute", "acceptedBuckets", "acceptedRoutes", "parentAgrees", "finerIncluded", "finerAgrees", "conditionalIncluded", "errorStage", "mismatchDirection", "rationale", "failure"];
  const quote = value => `"${String(Array.isArray(value) ? value.join("|") : value ?? "").replaceAll('"', '""')}"`;
  const toCSV = rows => [fields.join(","), ...rows.map(row => fields.map(field => quote(row[field])).join(","))].join("\r\n") + "\r\n";
  writeUnchangedOrNew(join(output, "all-case-scorecard.csv"), toCSV(scorecard.rows));
  writeUnchangedOrNew(join(output, "misses.csv"), toCSV(scorecard.rows.filter(row => row.finerIncluded && !row.finerAgrees)));
  const originalRows = scorecard.rows.map((row, index) => ({ id: row.id, finalRoute: row.finalRoute,
    acceptedRoutes: base.cases[index].reference.acceptedRoutes,
    included: base.cases[index].reference.acceptedRoutes !== null,
    agrees: base.cases[index].reference.acceptedRoutes?.includes(row.finalRoute) ?? null }));
  const originalV2 = { reference: "physician-system-reference-v2 acceptedRoutes, unchanged",
    ...summarize(originalRows.filter(row => row.included)), excludedIds: ["C25"], rows: originalRows };
  writeUnchangedOrNew(join(output, "scorecard-original-v2.json"), originalV2);
  writeUnchangedOrNew(join(output, "REPORT.md"), reportMarkdown(scorecard, summary, audit, originalV2));
  const sourceHashes = run.manifest.sourceHashes ?? {};
  assert.deepEqual(run.complete.sourceHashes ?? {}, sourceHashes, "Completion producer source hashes differ from manifest");
  for (const [path, expected] of Object.entries(sourceHashes)) {
    assert.ok(!path.startsWith("/") && !path.split("/").includes(".."), "Unsafe producer source path");
    assert.equal(sha256(readFileSync(join(ROOT, path))), expected, `Frozen producer source changed: ${path}`);
  }
  writeUnchangedOrNew(join(output, "scorer-integrity.json"), {
    producerSourceHashes: sourceHashes, verifiedProducerSourceFiles: Object.keys(sourceHashes).length,
    scorerSourceHashes: Object.fromEntries(["scripts/score-stripped-stratification.mjs", "tests/stripped-stratification-score.test.mjs"]
      .map(path => [path, sha256(readFileSync(join(ROOT, path)))])),
    subtypeCompletionSHA256: run.completionSHA256,
    interpretation: "Producer hashes were frozen before generation. Scorer and test hashes identify the offline scoring implementation; the scorer reads physician references only after generation and artifact verification.",
  });
  return { scorecard, summary, audit };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { summary, audit } = scoreFrozenStratification();
  console.log(JSON.stringify({ summary, audit }, null, 2));
}
