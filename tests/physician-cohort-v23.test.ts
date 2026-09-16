import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { modelRoutingReview, readPhysicianReference, scorePhysicianCohort } from "../src/evaluation/physician-cohort.ts";
import { sha256 } from "../src/evidence/rag/model.ts";
import { draftSchema, wireDraftSchema } from "../src/disposition/graph-output.ts";
import { createRepairContract } from "../src/disposition/graph-repair.ts";
import { reconcileCareAlternative } from "../src/disposition/care-alternative.ts";
import { CONTINUE_EMS_DIRECTIVE } from "../src/disposition/care-setting.ts";
import { checkAnswerForFullReview as checkAnswer, type DispositionRun, type ResponseEvent, type Guidance } from "../src/disposition/contract.ts";
import { graphJudgePacket } from "../src/disposition/clinical-graph.ts";
import { V23_REQUIRED_PASS_CHECKS, EXACT_REVIEW_CONTRACT_VERSIONS, knownReviewContract, usesExactReviewContract } from "../src/evaluation/v23-review-packet.ts";
import type { Hit } from "../src/evidence/rag/model.ts";
import { buildJudgeSourceAnchorRepairAuditSteps } from "../src/disposition/judge-source-anchor-repair.ts";

const reference = readPhysicianReference(readFileSync("data/evaluation/physician-system-reference-v2.json", "utf8"), readFileSync("data/patient_messages.csv", "utf8"));
const promptHash = "a".repeat(64), source = "A synthetic retained passage for serialization tests only, not clinical guidance.";
const criteria = ["undertriage", "overtriage", "patient_grounding", "claim_support", "safety_net", "clarification_delay", "ownership"];
type Options = { final?: "SAME_DAY_IN_PERSON" | "EMERGENCY_NOW"; early?: "SAME_DAY_IN_PERSON" | "EMERGENCY_NOW"; directive?: string; unsupported?: boolean; alternative?: boolean; continueEms?: boolean; noEarly?: boolean; sourceId?: string; gradualOnset?: boolean };

// All verdicts are authored contract controls, not physician adjudications.
function fixture(options: Options = {}) {
  const sourceId = options.sourceId ?? "test-source";
  const final = options.final ?? "SAME_DAY_IN_PERSON", early = options.early ?? "EMERGENCY_NOW";
  const onsetQuote = "It came on gradually, like my usual migraines";
  const patient = reference.cases.find(c => c.id === "C50")!.message + (options.continueEms ? " An ambulance is coming for me now." : "")
    + (options.gradualOnset ? `\n\nAdditional patient information: ${onsetQuote}.` : "");
  const patientQuote = patient.slice(0, 30);
  const patientMessage = final === "SAME_DAY_IN_PERSON"
    ? "Seek in-person assessment today for a hands-on examination. If suitable prompt care is unavailable, go to the emergency department now. Do not wait for a message reply."
    : options.continueEms ? CONTINUE_EMS_DIRECTIVE : "Call 911 now. Do not drive yourself or wait for a message reply.";
  const draft = draftSchema.parse({ disposition: final, reviewPriority: null, workType: null,
    transportIntent: final === "EMERGENCY_NOW" ? { mode: options.continueEms ? "continue_ems" : "activate_ems", activationQuote: options.continueEms ? "An ambulance is coming for me now." : null } : null,
    patientMessage, reason: "A synthetic exact-draft explanation used for a software contract test.", differential: ["Synthetic differential for software testing"],
    redFlags: [{ concern: "Reported text", status: "reported", quote: patientQuote }, { concern: "Other features", status: "unknown", quote: "" },
      ...(options.gradualOnset ? [{ concern: "Sudden maximal-onset headache", status: "denied", quote: onsetQuote }] : [])],
    vitalSigns: "No vital measurements are available in this synthetic fixture.", questions: [], evidenceLimitations: "Synthetic source; no clinical validation.",
    citations: [{ passageId: sourceId, quote: source, claim: "A synthetic reference statement, not medical guidance.", applicability: "uncertain", limitation: "Software test only." }] });
  const notice = { disposition: early, directive: options.directive ?? (early === "EMERGENCY_NOW"
    ? "Seek emergency department assessment now. Do not wait for a message reply; call 911 if you cannot travel safely."
    : "An in-person assessment is recommended today; do not wait for an asynchronous reply."), source: "emergency_agent" as const };
  const correctionReason = "The independent synthetic review explicitly corrects the earlier instruction for this exact response.";
  const judge = { reviewScope: "draft-and-issued-question/v2", verdict: "accept", earlyAction: options.noEarly ? "none" : options.unsupported ? "unsupported" : "supported",
    earlyCorrection: options.unsupported ? { reason: correctionReason, patientQuotes: [patientQuote], triggerMisattributedOrCorrected: false } : null,
    transportReview: draft.transportIntent ? { mode: draft.transportIntent.mode, verdict: "supported", draftQuote: patientMessage,
      activation: options.continueEms ? { quote: draft.transportIntent.activationQuote, currentPatient: true, currentEpisode: true, active: true } : null } : null,
    criteria: criteria.map(id => ({ id, verdict: "pass", reason: "Synthetic exact-bound criterion for a contract control.", anchors: [{ unit: id === "claim_support" ? `source:${sourceId}` : "patient", quote: id === "claim_support" ? source : patientQuote }] })),
    alternativeReconciliation: options.alternative ? { decision: "use_final_alternative", reason: "The earlier ED pathway remains defensible; this synthetic alternative preserves the necessary examination and timing with an immediate fallback.",
      earlyDirectiveQuote: notice.directive, patientQuotes: [patientQuote], finalDirectiveQuote: "Seek in-person assessment today",
      timing: { verdict: "meets_required_timing", quote: "assessment today" }, capability: { verdict: "meets_required_capability", requirement: "A hands-on examination is necessary.", quote: "for a hands-on examination" },
      access: { verdict: "fallback_preserves_required_care", fallbackQuote: "If suitable prompt care is unavailable, go to the emergency department now." }, decisiveUnresolvedPrerequisites: [] } : null };
  const guidance = [{ id: sourceId, summary: source, retrievedPassages: [{ id: sourceId, excerpt: source, excerptSha256: sha256(source) }] }] as Guidance[];
  const hit = { chunk: { id: sourceId, text: source, hash: sha256(source) }, document: { kind: "patient_summary", scope: "Software test", publicationDate: null } } as Hit;
  const transport = draft.transportIntent ? { ...draft.transportIntent, directive: patientMessage, review: "independent_model" } : undefined;
  const { citations, transportIntent: _intent, ...rest } = draft;
  const answer = { ...rest, ...(transport ? { emergencyTransport: transport } : {}), evidence: citations.map(c => ({ sourceId: c.passageId, claim: c.claim })) };
  const beforeReviewAnswer = { ...rest, evidence: citations.map(c => ({ sourceId: c.passageId, claim: c.claim })) };
  const packet = graphJudgePacket({ patient, draft, hits: [hit], notice: options.noEarly ? null : notice, basis: [],
    contractFindings: checkAnswer(beforeReviewAnswer, patient, guidance, null).filter(check => check.status === "fail" && check.id !== "response_concision") });
  const binding = { patientHash: sha256(patient), draftHash: sha256(JSON.stringify(draft)), packetHash: sha256(JSON.stringify(packet)) };
  const checks = [...checkAnswer(answer as NonNullable<DispositionRun["answer"]>, patient, guidance, null), { id: "emergency_transport", status: transport ? "pass" as const : "not_assessed" as const }, { id: "rag_source_integrity", status: "pass" as const }];
  const run = { version: "disposition-agent/v3", workflowId: "clinical-evidence-graph", profile: "evidence-graph-opus", runId: "a00e72bb-a9b5-45eb-879d-4f83071e36fe", promptHash,
    message: patient, inputHash: binding.patientHash, answerHash: sha256(JSON.stringify(answer)), status: "complete", origin: "agent", failure: null, safetyFloor: null, answer,
    completedAt: "2026-09-14T23:00:00Z", durationMs: 12_345, modelCalls: 4, usage: { inputTokens: null, outputTokens: null },
    guidance,
    graph: { version: "evidence-graph/v23", safety: { basis: [] }, judge, release: "model_reviewed", clinicalApproval: false, careCorrectionReleased: false, sourceIntegrity: true, corrections: 0, citations,
      retrieval: [{ hits: [hit] }],
      ...(transport ? { transportAdmission: { status: "admitted", code: "TRANSPORT_ADMITTED", binding: transport, clinicalValidation: false } } : {}) },
    agents: [{ role: "disposition", failure: null, output: draft }, { role: "critic", failure: null, output: judge, reviewInputBinding: binding, model: "independent-test-reviewer" }],
    checks: [...checks, { id: "independent_review", status: "pass" }, { id: "care_reconciliation", status: options.alternative ? "pass" : "not_assessed" }],
    responseEvents: options.noEarly ? [] : [{ kind: "action", notice, sequence: 1, elapsedMs: 100 }] } as unknown as DispositionRun;
  if (options.alternative) {
    const admitted = reconcileCareAlternative({ patient, draft, issued: { notice, sequence: 1 }, reviewPacket: packet,
      reviews: [{ failure: null, output: judge, binding: { ...binding, noticeHash: sha256(JSON.stringify(notice)), noticeSequence: 1, judgeHash: sha256(JSON.stringify(judge)) } }], mechanical: { draftHash: binding.draftHash, checks }, cancelled: false }, sha256);
    assert.ok(admitted.ok); run.graph!.careAlternative = { proof: admitted.reconciliation, packet, checks } as NonNullable<DispositionRun["graph"]>["careAlternative"];
    run.reconciliation = { policy: "issued-care-reconciliation/v1", status: "revised", from: admitted.reconciliation.from, to: admitted.reconciliation.to, reason: admitted.reconciliation.reason };
  } else if (options.unsupported) {
    run.graph!.careReviewPacket = packet as NonNullable<DispositionRun["graph"]>["careReviewPacket"];
    run.reconciliation = { policy: "issued-care-reconciliation/v1", status: "revised", from: { disposition: notice.disposition, directive: notice.directive }, to: { disposition: final, directive: patientMessage }, reason: correctionReason };
  }
  if (run.reconciliation) run.responseEvents!.push({ kind: "care_revision", reconciliation: run.reconciliation, sequence: run.responseEvents!.length + 1, elapsedMs: 12_000 });
  run.responseEvents!.push({ kind: "patient_reply", disposition: final, text: patientMessage, ...(transport ? { emergencyTransport: transport } : {}), sequence: run.responseEvents!.length + 1, elapsedMs: 12_300 } as ResponseEvent);
  return run;
}

test("v23 supported alternative is not counted as physician-reference agreement", () => {
  const run = fixture({ alternative: true }), before = JSON.stringify(reference);
  const score = scorePhysicianCohort(reference, [run], promptHash), result = score.cases.find(c => c.id === "C50")!.firstAttempt!;
  assert.equal(result.labelComparison, "different"); assert.equal(result.completeAgreement, false);
  assert.equal(result.modelRoutingReview.status, "supported"); assert.equal(result.modelRoutingReview.assessment, "model_supported_alternative");
  assert.equal(score.firstAttemptCompleteAgreements, 0); assert.equal(score.firstAttemptModelReview.supportedAlternatives, 1);
  assert.equal(result.modelRoutingReview.provenance.clinicalApproval, false); assert.equal(JSON.stringify(reference), before);
});

test("v24 explicitly shares the exact review contract; unsupported versions cannot fall back", () => {
  assert.deepEqual(EXACT_REVIEW_CONTRACT_VERSIONS, ["evidence-graph/v23", "evidence-graph/v24"]);
  for (const version of EXACT_REVIEW_CONTRACT_VERSIONS) {
    const baseline = fixture({ final: "EMERGENCY_NOW", noEarly: true, gradualOnset: true }); baseline.graph!.version = version;
    assert.equal(modelRoutingReview(baseline, "match").status, "supported", version);
    for (const mutate of [
      (run: DispositionRun) => { run.checks = []; },
      (run: DispositionRun) => { run.checks = run.checks.filter(c => c.id !== "independent_review"); },
      (run: DispositionRun) => { run.agents!.at(-1)!.reviewInputBinding!.packetHash = "0".repeat(64); },
      (run: DispositionRun) => { run.agents!.at(-1)!.failure = "JUDGE_CONTRACT_FAILED"; },
      (run: DispositionRun) => { run.graph!.transportAdmission!.status = "rejected"; },
      (run: DispositionRun) => { const c = run.checks.find(c => c.id === "usual_pattern_not_onset_denial")!; c.status = "pass"; c.detail = "Forged deterministic pass."; },
      (run: DispositionRun) => { run.responseEvents = []; },
    ]) { const copy = structuredClone(baseline); mutate(copy); assert.equal(modelRoutingReview(copy, "match").status, "unresolved", version); }
    const alternative = fixture({ alternative: true }); alternative.graph!.version = version;
    assert.equal(modelRoutingReview(alternative, "different").status, "supported"); delete alternative.graph!.careAlternative;
    assert.equal(modelRoutingReview(alternative, "different").status, "unresolved");
  }
  for (const version of ["evidence-graph/v25", "evidence-graph/v99", "evidence-graph/v0", "evidence-graph/v023", "unknown", ""]) {
    assert.equal(knownReviewContract(version), false); const run = fixture({ final: "EMERGENCY_NOW", noEarly: true }); run.graph!.version = version;
    assert.equal(modelRoutingReview(run, "match").status, "unresolved", version);
  }
  assert.equal(knownReviewContract("evidence-graph/v22"), true); assert.equal(usesExactReviewContract("evidence-graph/v22"), false, "legacy versions do not inherit new replay semantics");
});

test("v23 ordinary release replays source-ID repair without changing raw clinical verdicts", () => {
  const run = fixture({ final: "EMERGENCY_NOW", noEarly: true, sourceId: "a".repeat(64) });
  const critic = run.agents!.at(-1)!, draft = draftSchema.parse(run.agents![0].output);
  const packet = graphJudgePacket({ patient: run.message, draft, hits: run.graph!.retrieval[0].hits, notice: null, basis: [],
    contractFindings: checkAnswer({ ...run.answer!, emergencyTransport: undefined } as NonNullable<DispositionRun["answer"]>, run.message, run.guidance, null)
      .filter(check => check.status === "fail" && check.id !== "response_concision") });
  assert.equal(sha256(JSON.stringify(packet)), critic.reviewInputBinding!.packetHash);
  const raw = structuredClone(run.graph!.judge!); raw.criteria.find(c => c.id === "claim_support")!.anchors[0].unit = `source:${"b".repeat(58)}`;
  const steps = buildJudgeSourceAnchorRepairAuditSteps(raw, critic.output, packet);
  let state = steps.next(); while (!state.done) state = steps.next(sha256(state.value));
  assert.ok(state.value); critic.rawOutput = raw; critic.judgeSourceRepair = state.value;
  assert.equal(modelRoutingReview(run, "match").status, "supported");
  for (const mutate of [
    (copy: DispositionRun) => { delete copy.agents!.at(-1)!.judgeSourceRepair; },
    (copy: DispositionRun) => { delete copy.agents!.at(-1)!.rawOutput; },
    (copy: DispositionRun) => { copy.agents!.at(-1)!.judgeSourceRepair!.rawHash = "0".repeat(64); },
    (copy: DispositionRun) => { copy.agents!.at(-1)!.judgeSourceRepair!.repairs[0].to = `source:${"c".repeat(64)}`; },
    (copy: DispositionRun) => { (copy.agents!.at(-1)!.rawOutput as { verdict: string }).verdict = "revise"; },
    (copy: DispositionRun) => { copy.agents!.at(-1)!.failure = "INCOMPLETE_MODEL_STREAM"; },
    (copy: DispositionRun) => { copy.agents!.at(-1)!.judgeSourceRepair!.packet.units.find(u => u.id === "patient")!.text += " Invented information."; },
  ]) {
    const copy = structuredClone(run); mutate(copy);
    assert.equal(modelRoutingReview(copy, "match").status, "unresolved");
  }
});

test("v23 lowering without an explicit valid proof remains unresolved despite seven passes", () => {
  assert.equal(modelRoutingReview(fixture(), "different").status, "unresolved");
  const mutations: ((run: DispositionRun) => void)[] = [
    run => { delete run.graph!.careAlternative; },
    run => { run.graph!.careAlternative!.proof.binding.judgeHash = "0".repeat(64); },
    run => { run.graph!.careAlternative!.checks.pop(); },
    run => { run.graph!.careAlternative!.packet.units.find(unit => unit.id === "early")!.text = "{}"; },
    run => { run.responseEvents!.splice(1, 1); },
    run => { run.agents!.push({ ...run.agents!.at(-1)!, failure: "JUDGE_CONTRACT_FAILED" }); },
    run => { run.agents!.push({ ...run.agents![0] }); },
    run => { run.answer = { ...run.answer!, reason: "A different unreviewed explanation." }; run.answerHash = sha256(JSON.stringify(run.answer)); },
  ];
  for (const mutate of mutations) { const run = fixture({ alternative: true }); mutate(run); assert.equal(modelRoutingReview(run, "different").status, "unresolved"); }
});

test("v23 exact-draft field-local repair supports review only after its fresh critic", () => {
  const run = fixture({ alternative: true }), draft = draftSchema.parse(run.agents![0].output), base = { ...draft, reason: "An older explanation which the field-local repair replaces." };
  const repair = createRepairContract(draftSchema, wireDraftSchema), sources = [{ id: "test-source", kind: "patient_summary", scope: "Software test", text: source }];
  const prepared = repair.prepare(base, sources, ["reason", "questions"]), patch = { baseDraftHash: prepared.baseDraftHash, evidenceHash: prepared.evidenceHash, edits: [{ field: "reason", value: draft.reason }, { field: "questions", value: [] }] };
  const applied = repair.apply(base, sources, prepared.allowedFields, patch); assert.ok(applied.output); run.graph!.repair = applied.audit;
  const critic = run.agents!.at(-1)!;
  run.agents = [{ ...run.agents![0], output: base }, { ...run.agents![0], output: patch, repairInputBinding: { ...prepared } }, critic];
  assert.equal(modelRoutingReview(run, "different").status, "supported");
  critic.reviewInputBinding!.draftHash = prepared.baseDraftHash;
  assert.equal(modelRoutingReview(run, "different").status, "unresolved");
});

test("repaired CONTINUE_EMS packet never borrows the prior draft's transport review", () => {
  const run = fixture({ final: "EMERGENCY_NOW", directive: CONTINUE_EMS_DIRECTIVE, continueEms: true });
  const draft = draftSchema.parse(run.agents![0].output), base = { ...draft, reason: "An older explanation being corrected without changing EMS instructions." };
  const repair = createRepairContract(draftSchema, wireDraftSchema), sources = [{ id: "test-source", kind: "patient_summary", scope: "Software test", text: source }];
  const prepared = repair.prepare(base, sources, ["reason"]), patch = { baseDraftHash: prepared.baseDraftHash, evidenceHash: prepared.evidenceHash, edits: [{ field: "reason", value: draft.reason }] };
  const applied = repair.apply(base, sources, prepared.allowedFields, patch); assert.ok(applied.output); run.graph!.repair = applied.audit;
  const currentCritic = run.agents!.at(-1)!, priorCritic = structuredClone(currentCritic);
  priorCritic.reviewInputBinding = { ...priorCritic.reviewInputBinding!, draftHash: prepared.baseDraftHash };
  run.agents = [{ ...run.agents![0], output: base }, priorCritic, { ...run.agents![0], output: patch, repairInputBinding: prepared }, currentCritic];
  // Fixture's final packet contains pre-review action_timing_present failure
  // because the new draft has not yet received its own transport approval.
  // Its final checks pass only after the current critic binds CONTINUE_EMS.
  assert.equal(modelRoutingReview(run, "match").status, "supported");
  currentCritic.failure = "JUDGE_CONTRACT_FAILED";
  assert.equal(modelRoutingReview(run, "match").status, "unresolved");
});

test("v23 actual model concerns stay model concerns and failures are not silently upgraded", () => {
  const run = fixture({ final: "EMERGENCY_NOW", noEarly: true });
  assert.equal(modelRoutingReview(run, "match").status, "supported");
  run.graph!.judge!.criteria[0].verdict = "fail"; run.graph!.judge!.verdict = "revise";
  assert.equal(modelRoutingReview(run, "match").status, "model_concern");
  run.agents!.at(-1)!.failure = "MODEL_OR_SCHEMA_FAILURE";
  assert.equal(modelRoutingReview(run, "match").status, "unresolved");
});

test("ordinary v23 acceptance requires the complete unique recorded release-check set", () => {
  const baseline = fixture({ final: "EMERGENCY_NOW", noEarly: true });
  assert.equal(modelRoutingReview(baseline, "match").status, "supported");
  const empty = structuredClone(baseline); empty.checks = [];
  assert.equal(modelRoutingReview(empty, "match").status, "unresolved");
  for (const id of [...V23_REQUIRED_PASS_CHECKS, "research_support", "clinical_correctness", "emergency_transport", "care_reconciliation"]) {
    const run = structuredClone(baseline); run.checks = run.checks.filter(check => check.id !== id);
    assert.equal(modelRoutingReview(run, "match").status, "unresolved", `missing ${id}`);
  }
  const duplicate = structuredClone(baseline); duplicate.checks.push({ ...duplicate.checks[0] });
  assert.equal(modelRoutingReview(duplicate, "match").status, "unresolved");
});

test("ordinary v23 acceptance replays the exact complete packet rather than accepting a hash-shaped value", () => {
  const baseline = fixture({ final: "EMERGENCY_NOW", noEarly: true });
  for (const mutate of [
    (run: DispositionRun) => { run.agents!.at(-1)!.reviewInputBinding!.packetHash = "0".repeat(64); },
    (run: DispositionRun) => { run.graph!.retrieval[0].hits[0].document.scope = "A different source scope."; },
    (run: DispositionRun) => { run.responseEvents!.unshift({ kind: "intake_question", questionId: "new", text: "A new question not in the reviewed packet?", quote: run.message.slice(0, 30), why: "Different exposure after the original review.", blocksRouting: false, sequence: 1, elapsedMs: 1 }); },
  ]) { const run = structuredClone(baseline); mutate(run); assert.equal(modelRoutingReview(run, "match").status, "unresolved"); }
});

test("deferred onset semantics require the exact state and full bound accepting review", () => {
  const run = fixture({ final: "EMERGENCY_NOW", noEarly: true, gradualOnset: true });
  const check = run.checks.find(c => c.id === "usual_pattern_not_onset_denial")!;
  assert.equal(check.status, "not_assessed", "a regex did not clinically validate the onset claim");
  assert.equal(modelRoutingReview(run, "match").status, "supported", "authored contract review, not physician validation");
  for (const mutate of [
    (copy: DispositionRun) => { copy.checks.find(c => c.id === "usual_pattern_not_onset_denial")!.status = "pass"; },
    (copy: DispositionRun) => {
      const recorded = copy.checks.find(c => c.id === "usual_pattern_not_onset_denial")!;
      recorded.status = "pass";
      recorded.detail = "A usual symptom pattern does not explicitly deny thunderclap onset. Targeted observed-error regression, not a complete semantic verifier.";
    },
    (copy: DispositionRun) => { copy.checks.find(c => c.id === "usual_pattern_not_onset_denial")!.detail = "Unbound semantic approval"; },
    (copy: DispositionRun) => { copy.checks.find(c => c.id === "quoted_patient_evidence")!.status = "not_assessed"; },
    (copy: DispositionRun) => { copy.agents!.at(-1)!.failure = "JUDGE_CONTRACT_FAILED"; },
    (copy: DispositionRun) => { copy.agents!.at(-1)!.reviewInputBinding!.packetHash = "0".repeat(64); },
    (copy: DispositionRun) => { copy.answer!.redFlags.at(-1)!.quote = "My usual migraine"; },
    (copy: DispositionRun) => { copy.answer!.redFlags.at(-1)!.quote = "I never said this"; },
  ]) { const copy = structuredClone(run); mutate(copy); assert.equal(modelRoutingReview(copy, "match").status, "unresolved"); }
  const clinicalConcern = structuredClone(run);
  clinicalConcern.graph!.judge!.criteria.find(c => c.id === "patient_grounding")!.verdict = "fail";
  clinicalConcern.graph!.judge!.verdict = "revise";
  assert.equal(modelRoutingReview(clinicalConcern, "match").status, "model_concern");
});

test("v23 accepted upward correction requires its actual emitted revision and packet", () => {
  const run = fixture({ final: "EMERGENCY_NOW", early: "SAME_DAY_IN_PERSON", unsupported: true });
  assert.equal(modelRoutingReview(run, "different").status, "supported");
  assert.equal(modelRoutingReview(run, "different").earlyActionReview, "corrected_model_concern");
  for (const mutate of [
    (copy: DispositionRun) => { delete copy.graph!.careReviewPacket; },
    (copy: DispositionRun) => { copy.responseEvents!.splice(1, 1); },
    (copy: DispositionRun) => { copy.reconciliation!.reason = "Unbound revision reason from another review."; },
    (copy: DispositionRun) => { copy.agents!.at(-1)!.reviewInputBinding!.packetHash = "0".repeat(64); },
  ]) { const copy = structuredClone(run); mutate(copy); assert.equal(modelRoutingReview(copy, "different").status, "unresolved"); }
});

test("v23 EMS and continue-EMS cannot become lower care without corrected trigger attribution", () => {
  for (const directive of ["Call 911 now. Do not drive yourself.", CONTINUE_EMS_DIRECTIVE]) {
    const run = fixture({ unsupported: true, directive });
    assert.equal(modelRoutingReview(run, "different").status, "unresolved");
    run.graph!.judge!.earlyCorrection!.triggerMisattributedOrCorrected = true;
    assert.equal(modelRoutingReview(run, "different").status, "supported");
  }
});

test("v23 EMS continuation requires current patient activation and matching transport review", () => {
  const run = fixture({ final: "EMERGENCY_NOW", directive: CONTINUE_EMS_DIRECTIVE, continueEms: true });
  assert.equal(modelRoutingReview(run, "match").status, "supported");
  for (const mutate of [
    (copy: DispositionRun) => { copy.graph!.judge!.transportReview!.activation!.active = false; },
    (copy: DispositionRun) => { copy.graph!.judge!.transportReview!.activation!.currentEpisode = false; },
    (copy: DispositionRun) => { copy.graph!.transportAdmission!.status = "rejected"; },
    (copy: DispositionRun) => { copy.graph!.judge!.transportReview!.draftQuote = "An invented transport quotation."; },
  ]) { const copy = structuredClone(run); mutate(copy); assert.equal(modelRoutingReview(copy, "match").status, "unresolved"); }
});
