/** Offline exploratory scorecards. No provider calls and no clinical adjudication. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SETTINGS, PROMPTS, validateMessages, accountUsage } from "./fn-reduction-protocol.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const BUCKETS = Object.freeze(["SELF_CARE", "ASYNC_PHYSICIAN", "URGENT_ESCALATION"]);
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const readJSON = (path) => JSON.parse(readFileSync(path, "utf8"));
const ratio = (numerator, denominator) => denominator === 0 ? null : numerator / denominator;

export function parseResponse(response) {
  assert.equal(response?.stop_reason, "end_turn", "Incomplete provider response");
  const text = (response.content ?? []).filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
  const parsed = JSON.parse(text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```$/, ""));
  assert.deepEqual(Object.keys(parsed).sort(), ["disposition", "rationale"]);
  assert.ok(BUCKETS.includes(parsed.disposition), "Unknown disposition");
  assert.ok(typeof parsed.rationale === "string" && parsed.rationale.trim(), "Missing rationale");
  return parsed;
}

/** Failures count as missed required action; they are never assigned SELF_CARE. */
export function computeMetrics(predictions, referenceCases) {
  assert.equal(new Set(predictions.map((row) => row.id)).size, predictions.length, "Duplicate prediction ID");
  assert.equal(new Set(referenceCases.map((row) => row.id)).size, referenceCases.length, "Duplicate reference ID");
  assert.equal(predictions.length, referenceCases.length, "Reference and prediction counts differ");
  const references = new Map(referenceCases.map((row) => [row.id, row]));
  const clinician = { TP: 0, FN: 0, FP: 0, TN: 0, negativeReferenceFailures: 0, ambiguousReferenceCount: 0, positiveReferenceFailures: 0 };
  const urgent = { TP: 0, FN: 0, FP: 0, TN: 0, negativeReferenceFailures: 0, ambiguousReferenceCount: 0, positiveReferenceFailures: 0 };
  const confusion = {};
  const endpoint = (accepted, predicted, positive, tally) => {
    const values = new Set(accepted.map(positive));
    if (values.size !== 1) { tally.ambiguousReferenceCount++; return "AMBIGUOUS_REFERENCE"; }
    const required = [...values][0];
    if (predicted === null) {
      if (required) { tally.FN++; tally.positiveReferenceFailures++; return "FN_FAILED_OUTPUT"; }
      tally.negativeReferenceFailures++;
      return "FAILED_OUTPUT_NEGATIVE_REFERENCE";
    }
    const cell = required ? (positive(predicted) ? "TP" : "FN") : (positive(predicted) ? "FP" : "TN");
    tally[cell]++;
    return cell;
  };
  const rows = predictions.map((prediction) => {
    const ref = references.get(prediction.id);
    assert.ok(ref, `Missing reference ${prediction.id}`);
    assert.ok(Array.isArray(ref.acceptedBuckets) && ref.acceptedBuckets.length > 0 && ref.acceptedBuckets.every((bucket) => BUCKETS.includes(bucket)), `Invalid reference buckets ${prediction.id}`);
    const acceptedBuckets = [...new Set(ref.acceptedBuckets)];
    const disposition = prediction.parsed?.disposition ?? null;
    assert.ok(disposition === null || BUCKETS.includes(disposition), `Invalid prediction ${prediction.id}`);
    const expectedKey = [...acceptedBuckets].sort().join(" | ");
    confusion[expectedKey] ??= Object.fromEntries([...BUCKETS, "FAILED_OUTPUT"].map((bucket) => [bucket, 0]));
    confusion[expectedKey][disposition ?? "FAILED_OUTPUT"]++;
    return {
      id: prediction.id, message: prediction.message ?? ref.message ?? null, acceptedBuckets,
      disposition, rationale: prediction.parsed?.rationale ?? null, failure: prediction.failure ?? null,
      agrees: disposition !== null && acceptedBuckets.includes(disposition),
      clinicianAction: endpoint(acceptedBuckets, disposition, (bucket) => bucket !== "SELF_CARE", clinician),
      urgentAction: endpoint(acceptedBuckets, disposition, (bucket) => bucket === "URGENT_ESCALATION", urgent),
    };
  });
  const positiveDenominator = clinician.TP + clinician.FN;
  const selfCare = rows.filter((row) => row.disposition === "SELF_CARE");
  const scoredSelfCare = selfCare.filter((row) => row.clinicianAction !== "AMBIGUOUS_REFERENCE");
  const falseOmissions = scoredSelfCare.filter((row) => row.clinicianAction === "FN").length;
  const summarizeEndpoint = (tally) => ({
    ...tally, positiveDenominator: tally.TP + tally.FN,
    sensitivity: ratio(tally.TP, tally.TP + tally.FN),
    falseNegativeRate: ratio(tally.FN, tally.TP + tally.FN),
    failureHandling: "Failed outputs on positive reference cases remain in the sensitivity denominator as missed required action. Failed outputs on negative reference cases are reported separately and never treated as benign predictions.",
  });
  return {
    denominator: rows.length, agree: rows.filter((row) => row.agrees).length,
    agreement: ratio(rows.filter((row) => row.agrees).length, rows.length),
    failedOutputs: rows.filter((row) => row.disposition === null).length,
    missIds: rows.filter((row) => !row.agrees).map((row) => row.id),
    routeConfusion: confusion, clinicianAction: summarizeEndpoint(clinician), urgentAction: summarizeEndpoint(urgent),
    predictedSelfCare: selfCare.length,
    falseOmission: { numerator: falseOmissions, denominator: scoredSelfCare.length, rate: ratio(falseOmissions, scoredSelfCare.length), ambiguousReferenceSelfCare: selfCare.length - scoredSelfCare.length },
    clinicianActionFalseNegativeIds: rows.filter((row) => row.clinicianAction.startsWith("FN")).map((row) => row.id),
    urgentFalseNegativeIds: rows.filter((row) => row.urgentAction.startsWith("FN")).map((row) => row.id),
    emergencyTiming: { measured: false, reason: "URGENT_ESCALATION collapses same-day and emergency routing. Three-bucket agreement does not establish timely emergency action." },
    positiveEndpoint: "Any clinician action: ASYNC_PHYSICIAN or URGENT_ESCALATION.",
    allPositiveCasesRetained: positiveDenominator === rows.filter((row) => row.acceptedBuckets.every((bucket) => bucket !== "SELF_CARE")).length,
    rows,
  };
}

export function compareArms(baseline, candidate, referenceCases, controlDescription) {
  const baselineMetrics = computeMetrics(baseline, referenceCases);
  const candidateMetrics = computeMetrics(candidate, referenceCases);
  const oldRows = new Map(baselineMetrics.rows.map((row) => [row.id, row]));
  const pairs = candidateMetrics.rows.map((row) => ({ id: row.id, message: row.message, acceptedBuckets: row.acceptedBuckets, baseline: oldRows.get(row.id), candidate: row }));
  return {
    controlDescription, baseline: baselineMetrics, candidate: candidateMetrics,
    agreementDelta: candidateMetrics.agree - baselineMetrics.agree,
    changedCases: pairs.filter((pair) => pair.baseline.disposition !== pair.candidate.disposition),
    resolvedMissIds: pairs.filter((pair) => !pair.baseline.agrees && pair.candidate.agrees).map((pair) => pair.id),
    newMissIds: pairs.filter((pair) => pair.baseline.agrees && !pair.candidate.agrees).map((pair) => pair.id),
    resolvedClinicianActionFnIds: pairs.filter((pair) => pair.baseline.clinicianAction.startsWith("FN") && pair.candidate.clinicianAction === "TP").map((pair) => pair.id),
    newClinicianActionFnIds: pairs.filter((pair) => pair.baseline.clinicianAction === "TP" && pair.candidate.clinicianAction.startsWith("FN")).map((pair) => pair.id),
    newReferralIds: pairs.filter((pair) => pair.baseline.disposition === "SELF_CARE" && ["ASYNC_PHYSICIAN", "URGENT_ESCALATION"].includes(pair.candidate.disposition)).map((pair) => pair.id),
    newUnnecessaryReferralIds: pairs.filter((pair) => pair.baseline.disposition === "SELF_CARE" && pair.candidate.clinicianAction === "FP").map((pair) => pair.id),
  };
}

export function manualReviewTemplate(comparisons) {
  return {
    schemaVersion: "fn-reduction-manual-review/1", status: "not_reviewed",
    instruction: "A qualified clinical reviewer must inspect each exact message and rationale. No automated rule or model has judged whether a negative assertion is unsupported or whether a disposition is clinically safe. Record verbatim assertion spans, supporting input spans if any, uncertainty, severity, and reviewer identity/date. This is a review template, not adjudication.",
    criteria: ["Unsupported assertion that a symptom or risk factor is absent", "Decision-critical unknown treated as absent", "Rationale contradicts message", "Required precautions omitted", "Potential delay or harm mechanism"],
    rows: Object.entries(comparisons).flatMap(([cohort, comparison]) => comparison.candidate.rows.map((row) => {
      const prior = comparison.baseline.rows.find((entry) => entry.id === row.id);
      return { cohort, id: row.id, message: row.message, baselineDisposition: prior.disposition, baselineRationale: prior.rationale, candidateDisposition: row.disposition, candidateRationale: row.rationale, reviewStatus: "not_reviewed", reviewer: null, reviewedAt: null, unsupportedNegativeAssertions: null, sourceEvidenceSpans: null, decisionCriticalUnknowns: null, potentialHarm: null, notes: null };
    })),
  };
}

const median = (values) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2 : null; };
export function summarizeOperations(records) {
  const latencies = records.map((row) => row.latencyMs).filter(Number.isFinite);
  return {
    attempts: records.length, latencyObservations: latencies.length, medianLatencyMs: median(latencies), meanLatencyMs: latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : null,
    usageRecords: records.filter((row) => row.usage !== null && row.usage !== undefined).length,
    usage: records.reduce((sum, row) => ({ inputTokens: sum.inputTokens + (row.usage?.input_tokens ?? 0), outputTokens: sum.outputTokens + (row.usage?.output_tokens ?? 0), cacheReadInputTokens: sum.cacheReadInputTokens + (row.usage?.cache_read_input_tokens ?? 0), cacheCreationInputTokens: sum.cacheCreationInputTokens + (row.usage?.cache_creation_input_tokens ?? 0) }), { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 }),
    incompleteUsage: records.some((row) => row.usage === null || row.usage === undefined),
  };
}

export function pairedOperations(baseline, candidate, interpretation) {
  const previous = new Map(baseline.map((row) => [row.id, row]));
  const pairs = candidate.map((row) => {
    const prior = previous.get(row.id);
    assert.ok(prior, `Missing paired baseline ${row.id}`);
    return { id: row.id, baselineLatencyMs: prior.latencyMs, candidateLatencyMs: row.latencyMs, latencyDeltaMs: Number.isFinite(prior.latencyMs) && Number.isFinite(row.latencyMs) ? row.latencyMs - prior.latencyMs : null, baselineUsage: prior.usage ?? null, candidateUsage: row.usage ?? null };
  });
  const deltas = pairs.map((row) => row.latencyDeltaMs).filter(Number.isFinite);
  return { interpretation, baseline: summarizeOperations(baseline), candidate: summarizeOperations(candidate), pairedMedianLatencyDeltaMs: median(deltas), pairs };
}

function artifactPath(directory, name) {
  assert.ok(typeof name === "string" && name.length > 0 && !isAbsolute(name), "Artifact name must be relative");
  const path = resolve(directory, name);
  assert.ok(path.startsWith(resolve(directory) + sep), "Artifact path escapes generation directory");
  return path;
}

export function verifyArtifactHashes(directory, hashes, requiredNames = []) {
  assert.ok(hashes && typeof hashes === "object" && !Array.isArray(hashes), "Missing artifact hashes");
  for (const name of requiredNames) assert.ok(Object.hasOwn(hashes, name), `Unfrozen required artifact: ${name}`);
  for (const [name, hash] of Object.entries(hashes)) {
    assert.match(hash, /^[a-f0-9]{64}$/, `Invalid hash for ${name}`);
    assert.equal(sha256(readFileSync(artifactPath(directory, name))), hash, `Frozen artifact drift: ${name}`);
  }
  return Object.keys(hashes).length;
}

export function verifyRecord({ id, message, request, raw, parsed, settings, systemPrompt }) {
  assert.equal(request.id, id); assert.equal(raw.id, id); assert.equal(parsed.id, id);
  assert.equal(request.inputSHA256, sha256(message));
  assert.deepEqual(request.body, { ...settings, system: systemPrompt, messages: [{ role: "user", content: message }] }, `Request differs from exact message-only frozen protocol: ${id}`);
  assert.equal(parsed.providerCalls, 1, `Unexpected provider-call count ${id}`);
  let response = null, reparsed = null, parseError = null;
  try {
    assert.equal(raw.status, 200, "Unsuccessful provider status");
    response = JSON.parse(raw.responseText);
    assert.equal(response.model, settings.model, "Unexpected provider model");
    assert.ok(typeof response.id === "string" && response.id, "Missing response ID");
    assert.ok(typeof raw.requestId === "string" && raw.requestId, "Missing provider request ID");
    reparsed = parseResponse(response);
  } catch (error) { parseError = String(error); }
  if (parseError) {
    assert.equal(parsed.parsed, null, `Failed response cannot have a parsed disposition: ${id}`);
    assert.ok(typeof parsed.failure === "string" && parsed.failure, `Missing failure record: ${id}`);
  } else {
    assert.equal(parsed.failure, null, `Valid response marked failed: ${id}`);
    assert.deepEqual(parsed.parsed, reparsed, `Raw/parsed mismatch: ${id}`);
  }
  if (response) {
    assert.deepEqual(parsed.usage, response.usage, `Usage differs from raw response: ${id}`);
    assert.equal(parsed.model, response.model, `Parsed model differs from raw response: ${id}`);
  }
  assert.ok(Number.isFinite(raw.latencyMs) && raw.latencyMs >= 0, `Invalid latency ${id}`);
  return { id, message, parsed: reparsed, failure: parsed.failure, usage: parsed.usage, latencyMs: raw.latencyMs, requestId: raw.requestId, responseId: response?.id ?? null };
}

function writeNewOrVerify(path, value) {
  if (existsSync(path)) assert.deepEqual(readJSON(path), value, `Existing score artifact differs: ${path}`);
  else writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}

export function verifyGeneration(directory, { root = ROOT, expectedArm, expectedCount, archived = false } = {}) {
  directory = resolve(directory);
  // The completion marker must exist before any clinical reference can be opened.
  const complete = readJSON(join(directory, "generation-complete.json"));
  const manifest = readJSON(join(directory, "manifest.json"));
  const cases = archived ? manifest.cases.map(({ id, message }) => ({ id, message })) : manifest.cases;
  validateMessages(cases);
  assert.equal(cases.length, expectedCount, "Unexpected cohort size");
  const arm = archived ? "baseline" : manifest.arm;
  assert.equal(arm, expectedArm, "Unexpected experimental arm");
  assert.deepEqual(manifest.settings, SETTINGS, "Provider settings differ from registered experiment");
  assert.equal(manifest.systemPrompt, PROMPTS[arm], "Prompt differs from registered experiment");
  assert.equal(manifest.promptSHA256, sha256(PROMPTS[arm]), "Prompt hash differs");
  const required = cases.flatMap(({ id }) => ["request", "raw", "parsed"].map((kind) => `${id}-${kind}.json`));
  if (!archived) required.unshift("manifest.json", "system-prompt.txt", "preflight.json");
  assert.deepEqual(Object.keys(complete.artifactHashes).sort(), [...required].sort(), "Unexpected generation artifact set");
  const artifactCount = verifyArtifactHashes(directory, complete.artifactHashes, required);
  assert.ok(Number.isFinite(Date.parse(complete.completedAt)) && Date.parse(complete.completedAt) >= Date.parse(manifest.frozenAt), "Invalid generation freeze timestamps");
  assert.equal(complete.plannedCases, cases.length);
  assert.equal(complete.providerCalls, cases.length);
  if (!archived) {
    assert.equal(manifest.protocol, "fn-reduction-one-call/v1");
    assert.equal(complete.protocol, manifest.protocol); assert.equal(complete.runId, manifest.runId); assert.equal(complete.arm, manifest.arm);
    assert.equal(complete.promptSHA256, manifest.promptSHA256);
    assert.deepEqual(manifest.callPolicy, { callsPerCase: 1, automaticRetries: 0, fallbacks: 0, judgeCalls: 0, concurrency: 4 });
    assert.equal(readFileSync(join(directory, "system-prompt.txt"), "utf8"), manifest.systemPrompt);
    const messagesPath = artifactPath(root, manifest.messagesPath);
    assert.equal(sha256(readFileSync(messagesPath)), manifest.messagesSHA256, "Source messages changed");
    assert.deepEqual(readJSON(messagesPath), cases, "Manifest differs from labels-free source messages");
    assert.deepEqual(Object.keys(manifest.sourceHashes).sort(), ["scripts/fn-reduction-experiment.mjs", "scripts/fn-reduction-protocol.mjs"]);
    assert.deepEqual(complete.sourceHashes, manifest.sourceHashes);
    for (const [name, hash] of Object.entries(manifest.sourceHashes)) assert.equal(sha256(readFileSync(artifactPath(root, name))), hash, `Runner changed after generation: ${name}`);
    const preflight = readJSON(join(directory, "preflight.json"));
    assert.equal(preflight.runId, manifest.runId); assert.equal(preflight.model, SETTINGS.model); assert.equal(preflight.generationCalls, 0);
    assert.equal(preflight.modelInfo.id, SETTINGS.model);
    assert.equal(preflight.modelInfo.capabilities?.effort?.low?.supported, true);
    assert.equal(preflight.modelInfo.capabilities?.thinking?.types?.adaptive?.supported, true);
    assert.equal(sha256(readFileSync(artifactPath(root, manifest.budget.path))), manifest.budget.sha256, "Budget reconciliation changed");
  }
  const records = cases.map(({ id, message }) => {
    const request = readJSON(join(directory, `${id}-request.json`));
    const raw = readJSON(join(directory, `${id}-raw.json`));
    const parsed = readJSON(join(directory, `${id}-parsed.json`));
    const record = verifyRecord({ id, message, request, raw, parsed, settings: manifest.settings, systemPrompt: manifest.systemPrompt });
    if (!archived) {
      assert.equal(request.arm, arm); assert.equal(parsed.arm, arm);
      assert.equal(parsed.requestSHA256, sha256(readFileSync(join(directory, `${id}-request.json`))));
      assert.equal(parsed.rawSHA256, sha256(readFileSync(join(directory, `${id}-raw.json`))));
      assert.equal(parsed.responseId, record.responseId);
      assert.equal(parsed.latencyMs, raw.latencyMs);
      const reservation = manifest.budget.perCase.find((row) => row.id === id);
      assert.ok(reservation, `Missing budget reservation ${id}`);
      assert.equal(request.reservedUSD, reservation.reservedUSD);
      const accounting = accountUsage(parsed.usage, reservation.reservedUSD);
      for (const [key, value] of Object.entries(accounting)) assert.equal(parsed[key], value, `Accounting mismatch ${id}/${key}`);
      Object.assign(record, accounting);
    }
    return record;
  });
  assert.equal(complete.validDispositions, records.filter((row) => row.parsed).length);
  assert.deepEqual(complete.failedCases, records.filter((row) => !row.parsed).map((row) => row.id));
  const requestIds = records.map((row) => row.requestId).filter(Boolean), responseIds = records.map((row) => row.responseId).filter(Boolean);
  assert.equal(new Set(requestIds).size, requestIds.length, "Provider request IDs repeated within arm");
  assert.equal(new Set(responseIds).size, responseIds.length, "Provider response IDs repeated within arm");
  if (!archived) {
    assert.equal(complete.accountedUSD, records.reduce((sum, row) => sum + row.accountedUSD, 0));
    assert.equal(complete.estimatedUSD, records.every((row) => row.estimatedUSD !== null) ? records.reduce((sum, row) => sum + row.estimatedUSD, 0) : null);
  }
  return { directory, manifest, complete, cases, records, audit: { artifactCount, exactMessageOnlyRequests: records.length, rawParsedParity: records.length, uniqueRequestIds: requestIds.length, uniqueResponseIds: responseIds.length, completeSHA256: sha256(readFileSync(join(directory, "generation-complete.json"))), manifestSHA256: sha256(readFileSync(join(directory, "manifest.json"))) } };
}

/** All four generations are verified before reference files are read by this function. */
export function scoreFnReduction(outputRoot, {
  root = ROOT,
  archivedPath = join(root, "outputs/stripped-3bucket-fable-2026-09-15"),
  physicianPath = join(root, "data/evaluation/physician-adjudication-v3-2026-09-15.json"),
  proposedReferencePath = join(root, "data/research/fn-reduction-v1/proposed-reference.json"),
  proposedFreezePath = join(dirname(proposedReferencePath), "freeze-manifest.json"),
} = {}) {
  outputRoot = resolve(outputRoot);
  const arms = {
    knownBaseline: verifyGeneration(archivedPath, { root, expectedArm: "baseline", expectedCount: 50, archived: true }),
    knownCandidate: verifyGeneration(join(outputRoot, "known-regression-candidate"), { root, expectedArm: "candidate", expectedCount: 50 }),
    authoredBaseline: verifyGeneration(join(outputRoot, "authored-challenge-baseline"), { root, expectedArm: "baseline", expectedCount: 24 }),
    authoredCandidate: verifyGeneration(join(outputRoot, "authored-challenge-candidate"), { root, expectedArm: "candidate", expectedCount: 24 }),
  };
  assert.deepEqual(arms.knownBaseline.cases, arms.knownCandidate.cases, "Known cohort messages changed");
  assert.deepEqual(arms.authoredBaseline.cases, arms.authoredCandidate.cases, "Authored cohort messages differ across arms");
  assert.equal(arms.authoredBaseline.manifest.messagesSHA256, arms.authoredCandidate.manifest.messagesSHA256);
  const newArms = [arms.knownCandidate, arms.authoredBaseline, arms.authoredCandidate];
  const newRecords = newArms.flatMap((arm) => arm.records);
  assert.equal(newRecords.length, 98);
  for (const key of ["requestId", "responseId"]) {
    const ids = newRecords.map((row) => row[key]).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, `Duplicate provider ${key} across arms`);
  }

  // Clinical reference reads are deliberately below all generation verification.
  const referenceReadAt = new Date().toISOString();
  const physicianText = readFileSync(physicianPath, "utf8"), physician = JSON.parse(physicianText);
  const proposedText = readFileSync(proposedReferencePath, "utf8"), proposed = JSON.parse(proposedText);
  const proposedFreezeText = readFileSync(proposedFreezePath, "utf8"), proposedFreeze = JSON.parse(proposedFreezeText);
  assert.equal(physician.schemaVersion, "physician-adjudication/3");
  assert.equal(physician.provenance.blinded, false);
  assert.equal(physician.provenance.heldOutValidation, false);
  assert.equal(physician.cases.length, 50);
  for (const row of arms.knownCandidate.cases) {
    const reference = physician.cases.find((entry) => entry.id === row.id);
    assert.equal(reference?.message, row.message, `Physician reference message mismatch ${row.id}`);
    assert.equal(reference.inputSHA256, sha256(row.message));
  }
  assert.equal(proposed.status, "ai_authored_unreviewed", "Challenge reference must remain explicitly unreviewed");
  assert.equal(proposedFreeze.schemaVersion, "fn-reduction-authored-freeze/1");
  assert.equal(proposedFreeze.status, "ai_authored_unreviewed");
  assert.equal(proposedFreeze.generationStartedAtFreeze, false);
  assert.equal(proposedFreeze.frozenAt, proposed.frozenAt);
  assert.equal(proposedFreeze.artifacts["proposed-reference.json"].sha256, sha256(proposedText), "Proposed reference changed after freeze");
  assert.equal(proposedFreeze.artifacts["proposed-reference.json"].bytes, Buffer.byteLength(proposedText));
  assert.equal(proposedFreeze.artifacts["messages.json"].sha256, arms.authoredBaseline.manifest.messagesSHA256);
  assert.equal(proposedFreeze.artifacts["messages.json"].bytes, readFileSync(artifactPath(root, arms.authoredBaseline.manifest.messagesPath)).length);
  assert.equal(proposed.caseSetSha256, arms.authoredBaseline.manifest.messagesSHA256, "Proposed reference targets a different case set");
  assert.equal(proposed.cases.length, 24);
  assert.ok(Number.isFinite(Date.parse(proposed.frozenAt)), "Missing authored reference freeze time");
  for (const arm of [arms.authoredBaseline, arms.authoredCandidate]) assert.ok(Date.parse(proposed.frozenAt) <= Date.parse(arm.manifest.frozenAt), "Proposed labels were not frozen before experiment planning");
  for (const arm of Object.values(arms)) assert.ok(Date.parse(referenceReadAt) >= Date.parse(arm.complete.completedAt), "Scoring precedes generation freeze");
  const known = {
    referenceStatus: "single_physician_post_output_reassessment_of_known_development_set",
    independentClinicalValidation: false,
    ...compareArms(arms.knownBaseline.records, arms.knownCandidate.records, physician.cases, "Historical frozen Fable baseline versus new candidate on the same known 50 messages. Time, model-service changes, and single-sample stochastic variation may confound differences; this is not a contemporaneous randomized experiment."),
  };
  const authored = {
    referenceStatus: proposed.status, independentClinicalValidation: false, physicianApproved: false,
    ...compareArms(arms.authoredBaseline.records, arms.authoredCandidate.records, proposed.cases, "Paired single-call baseline and candidate on 24 AI-authored challenge messages with pre-frozen AI-authored, clinically unreviewed target labels. Results assess authored regression behavior, not clinical accuracy, prevalence, or independent generalization."),
  };
  const scorecards = { knownDevelopment: known, authoredChallenge: authored };
  const operations = {
    knownDevelopment: pairedOperations(arms.knownBaseline.records, arms.knownCandidate.records, known.controlDescription),
    authoredChallenge: pairedOperations(arms.authoredBaseline.records, arms.authoredCandidate.records, authored.controlDescription),
    newRunLedger: Object.fromEntries(newArms.map((arm) => [arm.directory.split(sep).at(-1), { providerCalls: arm.complete.providerCalls, estimatedUSD: arm.complete.estimatedUSD, accountedUSD: arm.complete.accountedUSD, reservedUSD: arm.complete.reservedUSD, pricing: arm.manifest.pricing }])),
    note: "Token and latency observations describe these calls. Monetary values are neutral usage estimates/reservations, not provider invoices. Archived-baseline latency is not a controlled contemporaneous comparison.",
  };
  const auditPath = join(outputRoot, "scoring-audit.json");
  const scoredAt = existsSync(auditPath) ? readJSON(auditPath).scoredAt : referenceReadAt;
  const audit = {
    schemaVersion: "fn-reduction-scoring-audit/1", scoredAt,
    generationIntegrityVerifiedBeforeReferenceRead: true, newProviderCalls: 98, archivedProviderCalls: 50,
    arms: Object.fromEntries(Object.entries(arms).map(([key, value]) => [key, { ...value.audit, completedAt: value.complete.completedAt }])),
    physicianReferenceSHA256: sha256(physicianText), proposedReferenceSHA256: sha256(proposedText),
    proposedFreezeSHA256: sha256(proposedFreezeText),
    proposedReferenceStatus: proposed.status, physicianReferenceBlinded: false,
    independentClinicalValidation: false, csvScored: false, scorerSHA256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    limitations: ["The 50-case reference was revised by one physician after seeing model outputs.", "Challenge targets were authored by AI and have not been clinically reviewed.", "One call per message per new arm does not establish repeatability.", "Three buckets do not measure emergency-versus-same-day timing.", "No automated clinical judgment of rationale quality or unsupported negative assertions was performed.", "This experiment does not change the GUI or establish a deployment recommendation."],
  };
  for (const [name, value] of [
    ["scorecard-known-development.json", known], ["scorecard-authored-challenge.json", authored],
    ["operations-ledger.json", operations], ["manual-rationale-review-template.json", manualReviewTemplate(scorecards)],
    ["scoring-audit.json", audit],
  ]) writeNewOrVerify(join(outputRoot, name), value);
  return { ...scorecards, operations, audit };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 3, "Usage: node scripts/score-fn-reduction.mjs <experiment-output-directory>");
  const result = scoreFnReduction(process.argv[2]);
  console.log(JSON.stringify({ knownDevelopment: { baseline: result.knownDevelopment.baseline.agree, candidate: result.knownDevelopment.candidate.agree, denominator: 50 }, authoredChallenge: { baseline: result.authoredChallenge.baseline.agree, candidate: result.authoredChallenge.candidate.agree, denominator: 24, physicianApproved: false }, newProviderCalls: result.audit.newProviderCalls, independentClinicalValidation: false }, null, 2));
}
