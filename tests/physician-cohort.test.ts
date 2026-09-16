import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { candidateInputs, modelRoutingReview, readPhysicianReference, scorePhysicianCohort } from "../src/evaluation/physician-cohort.ts";
import type { DispositionRun } from "../src/disposition/contract.ts";
import { sha256, buildCorpus, type ClinicalDocument, type Hit, type Retrieval } from "../src/evidence/rag/model.ts";
import { CLINICAL_POLICY_VERSION } from "../src/disposition/clinical-policy.ts";

const raw = readFileSync("data/evaluation/physician-system-reference-v2.json", "utf8"), csv = readFileSync("data/patient_messages.csv", "utf8");
const reference = readPhysicianReference(raw, csv), hash = "a".repeat(64);
function attempt(id: string, status: "complete" | "review_required", runId = "test-1", completedAt = "2026-09-14T00:00:00Z"): DispositionRun {
  const c = reference.cases.find(c => c.id === id)!;
  return { message: c.message, inputHash: c.inputHash, runId, promptHash: hash, completedAt, status,
    answer: { disposition: "ASYNC_PHYSICIAN", reviewPriority: "priority" }, checks: [], modelCalls: 1,
    durationMs: 10, firstActionMs: null, responseEvents: [], usage: { inputTokens: null, outputTokens: null },
  } as unknown as DispositionRun;
}
const criteriaIds = ["undertriage", "overtriage", "patient_grounding", "claim_support", "safety_net", "clarification_delay", "ownership"] as const;
const sourceText = "Synthetic source assertion for software testing only.";
const document: ClinicalDocument = { id: "scorer-source", title: "Synthetic source", url: "https://example.org/scorer-source", publisher: "Software test", kind: "patient_summary", license: "CC0-1.0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", attribution: "Synthetic test fixture", sourceVersion: "test-v1", rawHash: sha256(sourceText), retrievedAt: "2026-09-14T00:00:00Z", publicationDate: null, reviewDate: null, reviewStatus: "publisher_reviewed", currency: "not_assessed", scope: "Software test only; not clinical evidence", aliases: [], concepts: [], related: [], sections: [{ title: "Fixture", text: sourceText }] };
const corpus = buildCorpus([document]), { sections: _sections, ...metadata } = document;
const hit: Hit = { document: metadata, chunk: corpus.chunks[0], score: 1, channels: ["lexical"], context: { before: "", after: "" } };
const retrieval: Retrieval = { query: "synthetic source", corpusHash: corpus.hash, mode: "lexical", hits: [hit], timings: { totalMs: 0 }, warnings: [], embeddingTokens: 0, embeddingCacheHit: false };
function reviewed(run: DispositionRun) {
  // Explicitly exercise the actual pre-v12 literal-anchor contract. An
  // invented/unspecified version must not authorize legacy scoring.
  run.graph = { version: "evidence-graph/v11", mode: "hybrid", context: null, safety: null, retrieval: structuredClone([retrieval]),
    release: "model_reviewed", clinicalApproval: false, corrections: 0, careCorrectionReleased: false, sourceIntegrity: true,
    citations: [{ passageId: hit.chunk.id, quote: sourceText, claim: "Synthetic model assessment", applicability: "applicable", limitation: "Software test only" }],
    judge: { reviewScope: "draft-and-issued-question/v2", verdict: "accept", earlyAction: "none", earlyCorrection: null, correction: "", evidenceQueries: [],
      criteria: criteriaIds.map(id => ({ id, verdict: "pass", reason: "Synthetic stored model assessment for software testing only.", anchors: [{ unit: id === "claim_support" ? `source:${hit.chunk.id}` : "patient", quote: id === "claim_support" ? sourceText : run.message.slice(0, 20) }] })),
    } };
  return run;
}
const first = (run: DispositionRun, id: string) => scorePhysicianCohort(reference, [run], hash).cases.find(c => c.id === id)!.firstAttempt!;
test("reference uses the physician-designated system, not original supplied labels", () => {
  assert.equal(reference.cases.length, 50);
  assert.equal(reference.cases.find(c => c.id === "C04")?.originalSuppliedLabel, "ASYNC_PHYSICIAN");
  assert.deepEqual(reference.cases.find(c => c.id === "C04")?.reference.acceptedRoutes, ["SAME_DAY_IN_PERSON"]);
  assert.equal(reference.cases.find(c => c.id === "C25")?.reference.acceptedRoutes, null);
  assert.equal(reference.cases.find(c => c.id === "C03")?.reference.prioritySpecific, false);
  assert.deepEqual(Object.keys(candidateInputs(reference)[0]), ["id", "message", "inputHash"]);
});
test("changed source data and duplicate references are rejected", () => {
  assert.throws(() => readPhysicianReference(raw, csv + "\n"), /DATASET_CHANGED/);
  const altered = JSON.parse(raw); altered.cases[1] = altered.cases[0];
  assert.throws(() => readPhysicianReference(JSON.stringify(altered), csv), /DUPLICATE_CASE/);
  const textChanged = JSON.parse(raw); textChanged.cases[0].message += " added history"; textChanged.cases[0].inputHash = sha256(textChanged.cases[0].message);
  assert.throws(() => readPhysicianReference(JSON.stringify(textChanged), csv), /SOURCE_MISMATCH/);
});
test("failure before success remains the first-attempt result and unknown spend stays unknown", () => {
  const failed = attempt("C50", "review_required"), passed = attempt("C50", "complete", "test-2", "2026-09-14T00:01:00Z");
  const report = scorePhysicianCohort(reference, [passed, failed], hash);
  assert.equal(report.firstAttemptCompleteAgreements, 0);
  assert.equal(report.firstAttemptDenominator, 1);
  assert.equal(report.plannedReferenceDenominator, 49);
  assert.equal(report.casesAttempted, 1);
  assert.equal(report.unattemptedCaseIds.length, 49);
  assert.equal(report.allAttempts, 2);
  assert.equal(report.unknownCostAttempts, 2);
  assert.equal(report.cases.find(c => c.id === "C50")?.attempts[1].completeAgreement, true);
});
test("early over-escalation is counted even when final route agrees", () => {
  const run = attempt("C50", "complete");
  run.responseEvents = [{ kind: "action", notice: { disposition: "EMERGENCY_NOW", directive: "Call 911 now.", source: "emergency_agent" } }];
  const result = scorePhysicianCohort(reference, [run], hash).cases.find(c => c.id === "C50")!.firstAttempt!;
  assert.equal(result.completeAgreement, true); assert.equal(result.earlyEscalationAboveReference, true);
});
test("overlapping trials are ordered by start rather than whichever completes first", () => {
  const slowFailure = { ...attempt("C50", "review_required", "slow", "2026-09-14T00:02:00Z"), durationMs: 120_000 };
  const fastSuccess = { ...attempt("C50", "complete", "fast", "2026-09-14T00:01:00Z"), durationMs: 10_000 };
  assert.equal(scorePhysicianCohort(reference, [fastSuccess, slowFailure], hash).firstAttemptCompleteAgreements, 0);
});
test("preserved emergency instructions do not count as a completed response or an emergency miss", () => {
  const run = attempt("C02", "review_required");
  run.answer = { ...run.answer!, disposition: "EMERGENCY_NOW", reviewPriority: null };
  const result = scorePhysicianCohort(reference, [run], hash).cases.find(c => c.id === "C02")!.firstAttempt!;
  assert.equal(result.completeAgreement, false); assert.equal(result.emergencyMiss, false);
});
test("qualified DVT, different versions and off-cohort stress cases cannot inflate agreement", () => {
  const otherVersion = { ...attempt("C50", "complete"), promptHash: "b".repeat(64), runId: "other" };
  const report = scorePhysicianCohort(reference, [attempt("C25", "complete"), otherVersion], hash);
  assert.equal(report.firstAttemptDenominator, 0); assert.equal(report.excludedVersionAttempts, 1);
  assert.equal(report.cases.find(c => c.id === "C25")?.firstAttempt?.completeAgreement, null);
  assert.throws(() => scorePhysicianCohort(reference, [otherVersion, otherVersion], hash), /DUPLICATE_ATTEMPT/);
  assert.throws(() => scorePhysicianCohort(reference, [{ ...otherVersion, message: "changed" }], hash), /HASH_MISMATCH/);
});
test("C49 model-supported alternative remains a different label, not physician agreement or clinical approval", () => {
  const before = JSON.stringify(reference), run = reviewed(attempt("C49", "complete"));
  run.answer = { ...run.answer!, disposition: "EMERGENCY_NOW", reviewPriority: null };
  const report = scorePhysicianCohort(reference, [run], hash), result = report.cases.find(c => c.id === "C49")!.firstAttempt!;
  assert.equal(result.completeAgreement, false); assert.equal(result.labelComparison, "different");
  assert.equal(result.modelRoutingReview.status, "supported");
  assert.equal(result.modelRoutingReview.assessment, "model_supported_alternative");
  assert.equal(result.modelRoutingReview.provenance.clinicalApproval, false);
  assert.equal(result.modelRoutingReview.provenance.reviewedUnderPolicy, "legacy_unspecified");
  assert.equal(result.modelRoutingReview.provenance.currentPolicyAppliedRetrospectively, false);
  assert.equal(report.clinicalPolicyVersion, CLINICAL_POLICY_VERSION);
  assert.equal(report.firstAttemptCompleteAgreements, 0); assert.equal(report.firstAttemptModelReview.supportedAlternatives, 1);
  assert.equal(JSON.stringify(reference), before);
});
test("qualified C25 model review never turns a qualified reference into an agreement denominator", () => {
  const run = reviewed(attempt("C25", "complete")); run.graph!.clinicalPolicyVersion = CLINICAL_POLICY_VERSION;
  const report = scorePhysicianCohort(reference, [run], hash), result = report.cases.find(c => c.id === "C25")!.firstAttempt!;
  assert.equal(result.labelComparison, "qualified"); assert.equal(result.completeAgreement, null);
  assert.equal(result.modelRoutingReview.assessment, "model_supported_qualified_case");
  assert.equal(result.modelRoutingReview.provenance.reviewedUnderPolicy, CLINICAL_POLICY_VERSION);
  assert.equal(report.firstAttemptDenominator, 0); assert.equal(report.firstAttemptModelReview.supportedAlternatives, 0);
  assert.equal(report.firstAttemptModelReview.supported, 1);
});
test("an unreviewed route mismatch is not automatically a clinical failure", () => {
  const result = first(attempt("C49", "complete"), "C49");
  assert.equal(result.labelComparison, "different"); assert.equal(result.modelRoutingReview.status, "not_assessed");
  assert.equal(result.modelRoutingReview.assessment, null); assert.deepEqual(result.modelRoutingReview.failedCriteria, []);
});
test("matching routes cannot override any stored clinical, evidence, safety or ownership concern", () => {
  for (const id of criteriaIds) {
    const run = reviewed(attempt("C50", "complete"));
    run.graph!.judge!.criteria.find(c => c.id === id)!.verdict = "fail";
    run.graph!.judge!.verdict = "revise";
    const result = first(run, "C50");
    assert.equal(result.completeAgreement, true); assert.equal(result.labelComparison, "match");
    assert.equal(result.modelRoutingReview.status, "model_concern");
    assert.deepEqual(result.modelRoutingReview.failedCriteria, [id]); assert.equal(result.modelRoutingReview.assessment, null);
  }
});
test("incomplete, abstaining and unresolved early-action reviews cannot count as supported alternatives", () => {
  const incomplete = reviewed(attempt("C50", "review_required"));
  assert.equal(first(incomplete, "C50").labelComparison, "not_completed");
  assert.equal(first(incomplete, "C50").modelRoutingReview.status, "unresolved");
  for (const id of criteriaIds) {
    const run = reviewed(attempt("C49", "complete"));
    run.graph!.judge!.criteria.find(c => c.id === id)!.verdict = "abstain";
    assert.equal(first(run, "C49").modelRoutingReview.status, "unresolved");
  }
  const early = reviewed(attempt("C49", "complete")); early.graph!.judge!.earlyAction = "unresolved";
  assert.equal(first(early, "C49").modelRoutingReview.status, "unresolved");
});
test("malformed, duplicate and unsupported-source review packets remain unresolved", () => {
  const malformed = reviewed(attempt("C49", "complete")); malformed.graph!.judge!.criteria[0].reason = "";
  assert.equal(first(malformed, "C49").modelRoutingReview.status, "unresolved");
  const duplicate = reviewed(attempt("C49", "complete")); duplicate.graph!.judge!.criteria[1] = duplicate.graph!.judge!.criteria[0];
  assert.equal(first(duplicate, "C49").modelRoutingReview.status, "unresolved");
  const missing = reviewed(attempt("C49", "complete")); missing.graph!.judge!.criteria.pop();
  assert.equal(first(missing, "C49").modelRoutingReview.status, "unresolved");
  for (const criteria of [null, {}, "pass"]) {
    const run = reviewed(attempt("C49", "complete")); Object.assign(run.graph!.judge!, { criteria });
    assert.equal(first(run, "C49").modelRoutingReview.status, "unresolved");
    assert.equal(first(run, "C49").claimSupport, "not_assessed");
  }
  for (const flaw of ["integrity", "citations", "source_anchor"] as const) {
    const run = reviewed(attempt("C49", "complete"));
    if (flaw === "integrity") run.graph!.sourceIntegrity = false;
    if (flaw === "citations") run.graph!.citations = [];
    if (flaw === "source_anchor") run.graph!.judge!.criteria.find(c => c.id === "claim_support")!.anchors[0].unit = "patient";
    assert.equal(first(run, "C49").modelRoutingReview.status, "unresolved");
  }
});
test("exact anchors and source hashes are required even when stored review flags say pass", () => {
  for (const flaw of ["patient_anchor", "source_id", "source_quote", "source_hash", "citation_quote", "draft_anchor"] as const) {
    const run = reviewed(attempt("C49", "complete"));
    if (flaw === "patient_anchor") run.graph!.judge!.criteria[0].anchors[0].quote = "Unreported family history";
    if (flaw === "source_id") run.graph!.judge!.criteria[3].anchors[0].unit = "source:invented";
    if (flaw === "source_quote") run.graph!.judge!.criteria[3].anchors[0].quote = "The publisher never said this";
    if (flaw === "source_hash") run.graph!.retrieval[0].hits[0].chunk.hash = "0".repeat(64);
    if (flaw === "citation_quote") run.graph!.citations[0].quote = "An invented source quotation";
    if (flaw === "draft_anchor") run.graph!.judge!.criteria[0].anchors[0] = { unit: "draft", quote: "Invented draft advice" };
    assert.equal(first(run, "C49").modelRoutingReview.status, "unresolved", flaw);
  }
});
test("an unsupported early action requires a bound correction and remains a recorded model concern after correction", () => {
  const run = reviewed(attempt("C50", "complete")); run.answer!.patientMessage = "Priority clinician review in this thread is recommended today.";
  const notice = { disposition: "EMERGENCY_NOW" as const, directive: "Call 911 now.", source: "emergency_agent" as const };
  run.responseEvents = [{ kind: "action", notice, elapsedMs: 1_000 }];
  run.graph!.judge!.earlyAction = "unsupported";
  assert.equal(first(run, "C50").modelRoutingReview.status, "unresolved");
  run.graph!.judge!.earlyCorrection = { reason: "Synthetic test: the early trigger was misattributed to the present episode.", patientQuotes: [run.message.slice(0, 20)], triggerMisattributedOrCorrected: true };
  assert.equal(first(run, "C50").modelRoutingReview.status, "unresolved");
  run.reconciliation = { policy: "issued-care-reconciliation/v1", status: "revised", from: notice, to: { disposition: run.answer!.disposition, directive: run.answer!.patientMessage }, reason: "Synthetic test correction of the early issued instruction." };
  const result = first(run, "C50");
  assert.equal(result.modelRoutingReview.status, "supported");
  assert.equal(result.modelRoutingReview.earlyActionReview, "corrected_model_concern");
  assert.equal(result.earlyEscalationAboveReference, true); assert.equal(result.correctedEarlyAction, true);
  run.graph!.judge!.earlyCorrection.triggerMisattributedOrCorrected = false;
  assert.equal(first(run, "C50").modelRoutingReview.status, "unresolved");
});
test("bound model-reviewed EMS-to-ED transport correction retains emergency care without a misattributed trigger", () => {
  const run = reviewed(attempt("C49", "complete"));
  run.answer = { ...run.answer!, disposition: "EMERGENCY_NOW", reviewPriority: null, patientMessage: "Go to an emergency department now. Call 911 if you cannot travel safely." };
  const notice = { disposition: "EMERGENCY_NOW" as const, directive: "Call 911 now.", source: "emergency_agent" as const };
  run.responseEvents = [{ kind: "action", notice, elapsedMs: 1_000 }];
  run.graph!.judge!.earlyAction = "unsupported";
  run.graph!.judge!.earlyCorrection = { reason: "Synthetic transport-only correction retains immediate emergency assessment.", patientQuotes: [run.message.slice(0, 20)], triggerMisattributedOrCorrected: false };
  assert.equal(first(run, "C49").modelRoutingReview.status, "unresolved", "A transport change still needs reconciliation");
  run.reconciliation = { policy: "issued-care-reconciliation/v1", status: "revised", from: notice, to: { disposition: run.answer.disposition, directive: run.answer.patientMessage }, reason: "Synthetic model-reviewed emergency transport correction." };
  const result = first(run, "C49");
  assert.equal(result.modelRoutingReview.status, "supported");
  assert.equal(result.modelRoutingReview.earlyActionReview, "corrected_model_concern");
  assert.equal(result.labelComparison, "different");
  assert.equal(result.completeAgreement, false);
  assert.equal(result.modelRoutingReview.provenance.clinicalApproval, false);
  assert.equal(result.modelRoutingReview.provenance.currentPolicyAppliedRetrospectively, false);
  run.reconciliation.to.directive = "An unrelated unbound directive.";
  assert.equal(first(run, "C49").modelRoutingReview.status, "unresolved");
});
test("transport-only allowance does not weaken full emergency downgrade or seven-criterion gates", () => {
  for (const disposition of ["ASYNC_PHYSICIAN", "SAME_DAY_IN_PERSON"] as const) {
    const run = reviewed(attempt("C50", "complete"));
    run.answer = { ...run.answer!, disposition, reviewPriority: disposition === "ASYNC_PHYSICIAN" ? "priority" : null, patientMessage: "Synthetic clinician assessment recommendation today." };
    const notice = { disposition: "EMERGENCY_NOW" as const, directive: "Call 9-1-1 now.", source: "emergency_agent" as const };
    run.responseEvents = [{ kind: "action", notice, elapsedMs: 1_000 }];
    run.graph!.judge!.earlyAction = "unsupported";
    run.graph!.judge!.earlyCorrection = { reason: "Synthetic current-case correction without an established misattributed trigger.", patientQuotes: [run.message.slice(0, 20)], triggerMisattributedOrCorrected: false };
    run.reconciliation = { policy: "issued-care-reconciliation/v1", status: "revised", from: notice, to: { disposition, directive: run.answer.patientMessage }, reason: "Synthetic full emergency-setting correction." };
    assert.equal(first(run, "C50").modelRoutingReview.status, "unresolved", disposition);
    run.graph!.judge!.earlyCorrection.triggerMisattributedOrCorrected = true;
    assert.equal(first(run, "C50").modelRoutingReview.status, "supported", disposition);
    run.graph!.judge!.criteria.find(c => c.id === "undertriage")!.verdict = "abstain";
    assert.equal(first(run, "C50").modelRoutingReview.status, "unresolved", disposition);
  }
});
const boundReviewVersions = ["evidence-graph/v12", "evidence-graph/v13", "evidence-graph/v14", "evidence-graph/v15", "evidence-graph/v16", "evidence-graph/v17", "evidence-graph/v18", "evidence-graph/v19", "evidence-graph/v20", "evidence-graph/v21", "evidence-graph/v22"];
test("version-bound structured anchors preserve stored verdicts and reject invented quotations", () => {
  const statement = 'Patient states "No fever" but this is self-assessed, not a measured temperature.';
  for (const version of boundReviewVersions) {
    const run = reviewed(attempt("C01", "complete")); run.graph!.version = version;
    run.answer = { ...run.answer!, vitalSigns: statement };
    const criterion = run.graph!.judge!.criteria.find(c => c.id === "patient_grounding")!;
    criterion.anchors = [{ unit: "draft", quote: statement }];
    const original = JSON.stringify(run);
    assert.equal(modelRoutingReview(run, "match").status, "supported", `${version}: exact leaf binding, not clinical validation`);
    assert.equal(JSON.stringify(run), original, "Stored artifacts are not modified by compatibility parsing");
    criterion.verdict = "fail"; run.graph!.judge!.verdict = "revise";
    assert.equal(modelRoutingReview(run, "match").status, "model_concern", `${version}: a genuine concern remains a concern`);
    criterion.anchors[0].quote = 'Patient states "No pain" but this is self-assessed, not a measured temperature.';
    assert.equal(modelRoutingReview(run, "match").status, "unresolved", `${version}: invented quotations still fail`);
  }
});
test("decoded issued-question anchors are admitted only for explicit compatible versions", () => {
  const statement = 'Which medicine do you mean by "rescue"?\nPlease name the medication.';
  for (const version of [...boundReviewVersions, "evidence-graph/v11", "evidence-graph/v99", "unknown-version"]) {
    const run = reviewed(attempt("C50", "complete")); run.graph!.version = version;
    run.responseEvents = [{ kind: "intake_question", questionId: "test-question", quote: run.message.slice(0, 20), text: statement }];
    run.graph!.judge!.criteria.find(c => c.id === "clarification_delay")!.anchors = [{ unit: "issued_question", quote: statement }];
    assert.equal(modelRoutingReview(run, "match").status, boundReviewVersions.includes(version) ? "supported" : "unresolved", version);
  }
});
test("known older versions retain literal draft-anchor semantics", () => {
  for (const version of ["evidence-graph/v1", "evidence-graph/v11"]) {
    const run = reviewed(attempt("C01", "complete")); run.graph!.version = version;
    const statement = 'Patient states "No fever"; measurement status is unknown.';
    run.answer = { ...run.answer!, vitalSigns: statement };
    const criterion = run.graph!.judge!.criteria.find(c => c.id === "patient_grounding")!;
    criterion.anchors = [{ unit: "draft", quote: statement }];
    assert.equal(modelRoutingReview(run, "match").status, "unresolved", `${version}: no retrospective JSON decoding`);
    criterion.anchors[0].quote = "measurement status is unknown";
    assert.equal(modelRoutingReview(run, "match").status, "supported", `${version}: existing literal binding remains`);
  }
});
test("unknown, unspecified and future versions never inherit permissive historical scoring", () => {
  for (const version of [undefined, "", "offline-scoring-test", "unknown-version", "evidence-graph/v0", "evidence-graph/v25", "evidence-graph/v99"]) {
    const run = reviewed(attempt("C01", "complete")); Object.assign(run.graph!, { version });
    run.answer = { ...run.answer!, vitalSigns: "No vital signs reported." };
    run.graph!.judge!.criteria.find(c => c.id === "patient_grounding")!.anchors = [{ unit: "draft", quote: "No vital signs reported." }];
    const before = JSON.stringify(run), result = modelRoutingReview(run, "match");
    assert.equal(result.status, "unresolved", String(version));
    assert.equal(result.assessment, null, String(version));
    assert.equal(JSON.stringify(run), before, "Unknown stored results are not rewritten");
  }
});
test("version-bound transport consumes only admitted matching independent activation evidence", () => {
  const run = reviewed(attempt("C02", "complete"));
  const activationQuote = "I have called 911 and an ambulance is on the way.";
  run.message += ` ${activationQuote}`; run.inputHash = sha256(run.message);
  const directive = "Continue with the ambulance response you reported. Follow dispatcher instructions.";
  const binding = { mode: "continue_ems" as const, activationQuote, directive, review: "independent_model" as const };
  run.answer = { ...run.answer!, disposition: "EMERGENCY_NOW", reviewPriority: null, patientMessage: directive, emergencyTransport: binding };
  run.graph!.transportAdmission = { status: "admitted", code: "TRANSPORT_ADMITTED", binding: { ...binding }, clinicalValidation: false };
  run.graph!.judge!.transportReview = { mode: "continue_ems", verdict: "supported", draftQuote: directive, activation: { quote: activationQuote, currentPatient: true, currentEpisode: true, active: true } };
  run.responseEvents = [{ kind: "action", notice: { disposition: "EMERGENCY_NOW", directive: "Call 911 now.", source: "emergency_agent" } }];
  run.graph!.judge!.earlyAction = "supported";
  for (const version of boundReviewVersions) {
    run.graph!.version = version;
    assert.equal(modelRoutingReview(run, "match").status, "supported", version);
    for (const mutate of [
      (r: DispositionRun) => { delete r.graph!.transportAdmission; },
      (r: DispositionRun) => { r.graph!.transportAdmission!.status = "rejected"; },
      (r: DispositionRun) => { r.graph!.transportAdmission!.binding!.directive = "An unrelated directive."; },
      (r: DispositionRun) => { r.graph!.judge!.transportReview = null; },
      (r: DispositionRun) => { r.graph!.judge!.transportReview!.verdict = "unresolved"; },
      (r: DispositionRun) => { r.graph!.judge!.transportReview!.mode = "ed_now"; },
      (r: DispositionRun) => { r.graph!.judge!.transportReview!.activation!.active = false; },
      (r: DispositionRun) => { r.graph!.judge!.transportReview!.activation!.currentPatient = false; },
      (r: DispositionRun) => { r.graph!.judge!.transportReview!.activation!.currentEpisode = false; },
      (r: DispositionRun) => { r.graph!.judge!.transportReview!.draftQuote = "Invented draft instruction."; },
      (r: DispositionRun) => { r.graph!.judge!.transportReview!.activation!.quote = "Unreported ambulance activation."; },
      (r: DispositionRun) => { r.graph!.judge!.criteria.find(c => c.id === "safety_net")!.verdict = "abstain"; },
    ]) { const changed = structuredClone(run); mutate(changed); assert.equal(modelRoutingReview(changed, "match").status, "unresolved", version); }
  }
  // Only explicitly known legacy versions retain the old transport behavior.
  for (const version of ["evidence-graph/v1", "evidence-graph/v11"]) {
    const legacy = structuredClone(run); legacy.graph!.version = version;
    legacy.graph!.judge!.transportReview = null;
    assert.equal(modelRoutingReview(legacy, "match").status, "supported", `${version}: historical interpretation is unchanged`);
  }
  for (const version of ["evidence-graph/v25", "evidence-graph/v99", "unknown-version"]) {
    const unknown = structuredClone(run); unknown.graph!.version = version;
    unknown.graph!.judge!.transportReview = null;
    assert.equal(modelRoutingReview(unknown, "match").status, "unresolved", `${version}: no fallback to weaker transport interpretation`);
  }
});
test("C02 final emergency agreement cannot hide a missing early action or the 82-second reply delay", () => {
  const run = attempt("C02", "complete"); run.answer = { ...run.answer!, disposition: "EMERGENCY_NOW", reviewPriority: null };
  run.durationMs = 82_422;
  run.responseEvents = [{ kind: "intake_question", questionId: "q", quote: run.message.slice(0, 20), text: "Synthetic nonblocking question", elapsedMs: 3_822 },
    { kind: "patient_reply", disposition: "EMERGENCY_NOW", text: "Call 911 now.", elapsedMs: 82_258 }];
  const result = first(run, "C02");
  assert.equal(result.completeAgreement, true); assert.equal(result.emergencyMiss, false);
  assert.equal(result.emergencyDelivery.referenceRequiresEmergency, true);
  assert.equal(result.emergencyDelivery.earlyEmergencyActionAbsent, true);
  assert.equal(result.emergencyDelivery.firstEarlyEmergencyActionMs, null);
  assert.equal(result.emergencyDelivery.firstEmergencyPatientReplyMs, 82_258);
  assert.equal(result.emergencyDelivery.deadlineApplied, null);
  run.responseEvents.unshift({ kind: "action", notice: { disposition: "EMERGENCY_NOW", directive: "Call 911 now.", source: "emergency_agent" }, elapsedMs: 1_400 });
  assert.equal(first(run, "C02").emergencyDelivery.firstEarlyEmergencyActionMs, 1_400);
  assert.equal(first(run, "C02").emergencyDelivery.earlyEmergencyActionAbsent, false);
  delete run.responseEvents;
  assert.equal(first(run, "C02").emergencyDelivery.earlyEmergencyActionAbsent, null);
  assert.equal(first(attempt("C50", "complete"), "C50").emergencyDelivery.earlyEmergencyActionAbsent, null);
});
