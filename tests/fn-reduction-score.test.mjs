import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { SETTINGS, PROMPTS, accountUsage } from "../scripts/fn-reduction-protocol.mjs";
import { computeMetrics, compareArms, manualReviewTemplate, pairedOperations, scoreFnReduction, sha256, verifyArtifactHashes, verifyGeneration, verifyRecord } from "../scripts/score-fn-reduction.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
function writeJSON(path, value) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2) + "\n"); }
const prediction = (id, disposition, message = `Message ${id}`) => ({ id, message, parsed: disposition ? { disposition, rationale: `Rationale ${id}` } : null, failure: disposition ? null : "Provider failed" });
const reference = (id, acceptedBuckets) => ({ id, acceptedBuckets });

test("clinician sensitivity and false omission use different denominators; failures never become benign predictions", () => {
  const predictions = [prediction("a", "ASYNC_PHYSICIAN"), prediction("b", "SELF_CARE"), prediction("c", null), prediction("d", "SELF_CARE"), prediction("e", null), prediction("f", "URGENT_ESCALATION")];
  const refs = [reference("a", ["ASYNC_PHYSICIAN"]), reference("b", ["ASYNC_PHYSICIAN"]), reference("c", ["URGENT_ESCALATION"]), reference("d", ["SELF_CARE"]), reference("e", ["SELF_CARE"]), reference("f", ["SELF_CARE"])];
  const score = computeMetrics(predictions, refs);
  assert.equal(score.denominator, 6); assert.equal(score.agree, 2); assert.equal(score.failedOutputs, 2);
  assert.equal(score.clinicianAction.TP, 1); assert.equal(score.clinicianAction.FN, 2);
  assert.equal(score.clinicianAction.positiveDenominator, 3); assert.equal(score.clinicianAction.sensitivity, 1 / 3);
  assert.equal(score.clinicianAction.positiveReferenceFailures, 1); assert.equal(score.clinicianAction.negativeReferenceFailures, 1);
  assert.equal(score.clinicianAction.TN, 1); assert.equal(score.clinicianAction.FP, 1);
  assert.deepEqual(score.falseOmission, { numerator: 1, denominator: 2, rate: .5, ambiguousReferenceSelfCare: 0 });
  assert.equal(score.urgentAction.sensitivity, 0); assert.equal(score.emergencyTiming.measured, false);
  assert.equal(score.routeConfusion.SELF_CARE.FAILED_OUTPUT, 1);
});

test("set-valued references preserve route agreement and explicitly identify ambiguous binary endpoints", () => {
  const score = computeMetrics([prediction("a", "SELF_CARE"), prediction("b", "URGENT_ESCALATION")], [reference("a", ["SELF_CARE", "ASYNC_PHYSICIAN"]), reference("b", ["ASYNC_PHYSICIAN", "URGENT_ESCALATION"])]);
  assert.equal(score.agree, 2); assert.equal(score.clinicianAction.ambiguousReferenceCount, 1);
  assert.equal(score.clinicianAction.TP, 1); assert.equal(score.urgentAction.ambiguousReferenceCount, 1);
  assert.equal(score.falseOmission.denominator, 0); assert.equal(score.falseOmission.rate, null);
  assert.equal(score.falseOmission.ambiguousReferenceSelfCare, 1);
  assert.throws(() => computeMetrics([prediction("a", "SELF_CARE"), prediction("a", "SELF_CARE")], [reference("a", ["SELF_CARE"])]), /Duplicate/);
});

test("paired comparison includes exact messages and both rationales and separates new referrals from unnecessary referrals", () => {
  const baseline = [prediction("C22", "SELF_CARE", "Exact ankle message."), prediction("C01", "SELF_CARE", "Exact benign message."), prediction("C02", "URGENT_ESCALATION")];
  const candidate = [prediction("C22", "ASYNC_PHYSICIAN", "Exact ankle message."), prediction("C01", "ASYNC_PHYSICIAN", "Exact benign message."), prediction("C02", "SELF_CARE")];
  candidate[0].parsed.rationale = "Decision-critical examination is unknown.";
  const result = compareArms(baseline, candidate, [reference("C22", ["ASYNC_PHYSICIAN"]), reference("C01", ["SELF_CARE"]), reference("C02", ["URGENT_ESCALATION"])], "Historical control");
  assert.deepEqual(result.resolvedMissIds, ["C22"]); assert.deepEqual(result.newMissIds, ["C01", "C02"]);
  assert.deepEqual(result.newReferralIds, ["C22", "C01"]); assert.deepEqual(result.newUnnecessaryReferralIds, ["C01"]);
  assert.deepEqual(result.resolvedClinicianActionFnIds, ["C22"]); assert.deepEqual(result.newClinicianActionFnIds, ["C02"]);
  assert.equal(result.changedCases[0].message, "Exact ankle message.");
  assert.equal(result.changedCases[0].baseline.rationale, "Rationale C22");
  assert.equal(result.changedCases[0].candidate.rationale, candidate[0].parsed.rationale);
  const review = manualReviewTemplate({ known: result });
  assert.equal(review.status, "not_reviewed"); assert.equal(review.rows[0].unsupportedNegativeAssertions, null);
  assert.equal(review.rows[0].reviewer, null); assert.match(review.instruction, /No automated rule or model/);
});

function makeRecord(id = "C01", disposition = "SELF_CARE", arm = "candidate") {
  const message = `Synthetic message ${id}.`;
  const response = { id: `msg_${arm}_${id}`, model: SETTINGS.model, stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ disposition, rationale: "Synthetic rationale." }) }], usage: { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
  const request = { id, inputSHA256: sha256(message), body: { ...SETTINGS, system: PROMPTS[arm], messages: [{ role: "user", content: message }] } };
  const raw = { id, status: 200, requestId: `req_${arm}_${id}`, responseText: JSON.stringify(response), latencyMs: 10 };
  const parsed = { id, parsed: { disposition, rationale: "Synthetic rationale." }, failure: null, model: SETTINGS.model, usage: response.usage, providerCalls: 1 };
  return { id, message, request, raw, parsed, settings: SETTINGS, systemPrompt: PROMPTS[arm] };
}

test("raw/parsed parity and exact message-only provider envelopes are enforced", () => {
  const record = makeRecord();
  assert.equal(verifyRecord(record).parsed.disposition, "SELF_CARE");
  const tampered = structuredClone(record); tampered.parsed.parsed.disposition = "ASYNC_PHYSICIAN";
  assert.throws(() => verifyRecord(tampered), /Raw\/parsed mismatch/);
  const label = structuredClone(record); label.request.body.messages[0].content += "\nExpected: SELF_CARE";
  assert.throws(() => verifyRecord(label), /exact message-only/);
  const context = structuredClone(record); context.request.body.gold = "SELF_CARE";
  assert.throws(() => verifyRecord(context), /exact message-only/);
  const retry = structuredClone(record); retry.parsed.providerCalls = 2;
  assert.throws(() => verifyRecord(retry), /provider-call count/);
});

test("provider and output failures remain terminal records rather than fabricated valid dispositions", () => {
  const record = makeRecord();
  record.raw.status = 500; record.raw.responseText = "Error";
  record.parsed = { ...record.parsed, parsed: null, failure: "Provider failed", usage: null, model: null };
  assert.equal(verifyRecord(record).parsed, null);
  record.parsed.parsed = { disposition: "SELF_CARE", rationale: "Fallback" };
  assert.throws(() => verifyRecord(record), /Failed response cannot/);
});

test("hash verification rejects missing required files and path traversal", (t) => {
  const root = mkdtempSync(join(tmpdir(), "fn-score-hash-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "raw.json"), "original");
  assert.equal(verifyArtifactHashes(root, { "raw.json": sha256("original") }, ["raw.json"]), 1);
  assert.throws(() => verifyArtifactHashes(root, {}, ["raw.json"]), /Unfrozen/);
  assert.throws(() => verifyArtifactHashes(root, { "../raw.json": sha256("original") }), /escapes/);
  writeFileSync(join(root, "raw.json"), "changed");
  assert.throws(() => verifyArtifactHashes(root, { "raw.json": sha256("original") }), /Frozen artifact drift/);
});

test("operational comparisons retain paired observations and do not impute missing usage", () => {
  const baseline = [{ id: "a", latencyMs: 10, usage: { input_tokens: 10, output_tokens: 5 } }, { id: "b", latencyMs: 20, usage: null }];
  const candidate = [{ id: "b", latencyMs: 15, usage: { input_tokens: 9, output_tokens: 4 } }, { id: "a", latencyMs: 25, usage: { input_tokens: 12, output_tokens: 7 } }];
  const result = pairedOperations(baseline, candidate, "Historical observations; not a controlled latency comparison.");
  assert.equal(result.pairedMedianLatencyDeltaMs, 5); assert.equal(result.baseline.incompleteUsage, true);
  assert.equal(result.baseline.usageRecords, 1); assert.equal(result.pairs[0].latencyDeltaMs, -5);
});

function fixtureArm(root, directory, cases, arm, archived = false) {
  const messagesPath = `inputs/${arm}-${archived ? "archived" : directory.split("/").at(-1)}.json`;
  writeJSON(join(root, messagesPath), cases);
  writeJSON(join(root, "budget.json"), { fixture: true });
  const sourceHashes = Object.fromEntries(["scripts/fn-reduction-experiment.mjs", "scripts/fn-reduction-protocol.mjs"].map((name) => {
    mkdirSync(dirname(join(root, name)), { recursive: true }); writeFileSync(join(root, name), readFileSync(join(ROOT, name)));
    return [name, sha256(readFileSync(join(root, name)))];
  }));
  const path = join(root, directory), runId = directory;
  const manifest = { protocol: "fn-reduction-one-call/v1", runId, arm, frozenAt: "2026-09-16T06:05:00.000Z", settings: SETTINGS, systemPrompt: PROMPTS[arm], promptSHA256: sha256(PROMPTS[arm]), cases,
    messagesPath, messagesSHA256: sha256(readFileSync(join(root, messagesPath))), sourceHashes,
    callPolicy: { callsPerCase: 1, automaticRetries: 0, fallbacks: 0, judgeCalls: 0, concurrency: 4 },
    budget: { path: "budget.json", sha256: sha256(readFileSync(join(root, "budget.json"))), reservedUSD: cases.length * .2, perCase: cases.map(({ id }) => ({ id, reservedUSD: .2 })) }, pricing: { note: "Test fixture" } };
  writeJSON(join(path, "manifest.json"), manifest); writeFileSync(join(path, "system-prompt.txt"), PROMPTS[arm]);
  writeJSON(join(path, "preflight.json"), { runId, model: SETTINGS.model, generationCalls: 0, modelInfo: { id: SETTINGS.model, capabilities: { effort: { low: { supported: true } }, thinking: { types: { adaptive: { supported: true } } } } } });
  const names = [], records = [];
  for (const item of cases) {
    const record = makeRecord(item.id, "SELF_CARE", arm);
    record.message = item.message; record.request.body.messages[0].content = item.message; record.request.inputSHA256 = sha256(item.message);
    record.raw.requestId = `req_${directory}_${item.id}`;
    const response = JSON.parse(record.raw.responseText); response.id = `msg_${directory}_${item.id}`; record.raw.responseText = JSON.stringify(response);
    record.request.arm = arm; record.request.reservedUSD = .2;
    writeJSON(join(path, `${item.id}-request.json`), record.request); writeJSON(join(path, `${item.id}-raw.json`), record.raw);
    Object.assign(record.parsed, { arm, responseId: response.id, latencyMs: record.raw.latencyMs, ...accountUsage(record.parsed.usage, .2), requestSHA256: sha256(readFileSync(join(path, `${item.id}-request.json`))), rawSHA256: sha256(readFileSync(join(path, `${item.id}-raw.json`))) });
    writeJSON(join(path, `${item.id}-parsed.json`), record.parsed); records.push(record.parsed);
    names.push(...["request", "raw", "parsed"].map((kind) => `${item.id}-${kind}.json`));
  }
  if (!archived) names.unshift("manifest.json", "system-prompt.txt", "preflight.json");
  writeJSON(join(path, "generation-complete.json"), { protocol: manifest.protocol, runId, arm, completedAt: "2026-09-16T06:06:00.000Z", plannedCases: cases.length, providerCalls: cases.length, validDispositions: cases.length, failedCases: [], promptSHA256: manifest.promptSHA256, sourceHashes,
    accountedUSD: records.reduce((sum, row) => sum + row.accountedUSD, 0), estimatedUSD: records.reduce((sum, row) => sum + row.estimatedUSD, 0), reservedUSD: manifest.budget.reservedUSD,
    artifactHashes: Object.fromEntries(names.map((name) => [name, sha256(readFileSync(join(path, name)))])) });
  return path;
}

test("complete experiment verifies before reference access and produces separate repeatable scorecards", (t) => {
  const root = mkdtempSync(join(tmpdir(), "fn-score-full-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const known = Array.from({ length: 50 }, (_, i) => ({ id: `C${String(i + 1).padStart(2, "0")}`, message: `Known synthetic message ${i + 1}.` }));
  const challenge = Array.from({ length: 24 }, (_, i) => ({ id: `F${String(i + 1).padStart(2, "0")}`, message: `Authored synthetic message ${i + 1}.` }));
  const archivedPath = fixtureArm(root, "archive", known, "baseline", true);
  fixtureArm(root, "experiment/known-regression-candidate", known, "candidate");
  fixtureArm(root, "experiment/authored-challenge-baseline", challenge, "baseline");
  const lastArm = fixtureArm(root, "experiment/authored-challenge-candidate", challenge, "candidate");
  const physicianPath = join(root, "physician.json"), proposedReferencePath = join(root, "proposed.json");
  const options = { root, archivedPath, physicianPath, proposedReferencePath };
  const rawPath = join(lastArm, "F01-raw.json"), originalRaw = readFileSync(rawPath);
  writeFileSync(rawPath, "tampered");
  assert.throws(() => scoreFnReduction(join(root, "experiment"), options), /Frozen artifact drift/, "Must detect generation failure before attempting missing reference files");
  writeFileSync(rawPath, originalRaw);
  writeJSON(physicianPath, { schemaVersion: "physician-adjudication/3", provenance: { blinded: false, heldOutValidation: false }, cases: known.map((row) => ({ ...row, inputSHA256: sha256(row.message), acceptedBuckets: ["SELF_CARE"] })) });
  const authoredManifest = json(join(lastArm, "manifest.json"));
  writeJSON(proposedReferencePath, { status: "ai_authored_unreviewed", frozenAt: "2026-09-16T06:00:00.000Z", caseSetSha256: authoredManifest.messagesSHA256, cases: challenge.map((row) => ({ id: row.id, acceptedBuckets: ["SELF_CARE"] })) });
  writeJSON(join(root, "freeze-manifest.json"), { schemaVersion: "fn-reduction-authored-freeze/1", status: "ai_authored_unreviewed", frozenAt: "2026-09-16T06:00:00.000Z", generationStartedAtFreeze: false, artifacts: {
    "messages.json": { sha256: authoredManifest.messagesSHA256, bytes: readFileSync(join(root, authoredManifest.messagesPath)).length },
    "proposed-reference.json": { sha256: sha256(readFileSync(proposedReferencePath)), bytes: readFileSync(proposedReferencePath).length },
  } });
  const first = scoreFnReduction(join(root, "experiment"), options);
  assert.equal(first.audit.newProviderCalls, 98); assert.equal(first.knownDevelopment.baseline.agree, 50);
  assert.equal(first.authoredChallenge.candidate.denominator, 24); assert.equal(first.authoredChallenge.physicianApproved, false);
  assert.equal(first.audit.independentClinicalValidation, false); assert.equal(first.audit.csvScored, false);
  assert.deepEqual(scoreFnReduction(join(root, "experiment"), options), first);
  const review = json(join(root, "experiment/manual-rationale-review-template.json"));
  assert.equal(review.rows.length, 74); assert.ok(review.rows.every((row) => row.reviewStatus === "not_reviewed"));
});

test("archived frozen evidence reproduces 48/50, 41/43 clinician sensitivity, and 2/9 false omission", () => {
  const frozen = verifyGeneration(join(ROOT, "outputs/stripped-3bucket-fable-2026-09-15"), { expectedArm: "baseline", expectedCount: 50, archived: true });
  const physician = json(join(ROOT, "data/evaluation/physician-adjudication-v3-2026-09-15.json"));
  const score = computeMetrics(frozen.records, physician.cases);
  assert.equal(score.agree, 48); assert.equal(score.denominator, 50);
  assert.equal(score.clinicianAction.TP, 41); assert.equal(score.clinicianAction.positiveDenominator, 43);
  assert.deepEqual(score.falseOmission, { numerator: 2, denominator: 9, rate: 2 / 9, ambiguousReferenceSelfCare: 0 });
  assert.deepEqual(score.clinicianActionFalseNegativeIds, ["C22", "C47"]);
  assert.equal(score.urgentAction.TP, 25); assert.equal(score.urgentAction.FN, 0);
});
