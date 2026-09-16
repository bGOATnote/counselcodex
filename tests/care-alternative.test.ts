import test from "node:test";
import assert from "node:assert/strict";
import { sha256 } from "../src/evidence/rag/model.ts";
import { CONTINUE_EMS_DIRECTIVE } from "../src/disposition/care-setting.ts";
import { draftSchema } from "../src/disposition/graph-output.ts";
import { reconcileCareAlternative as reconcile, type CareAlternativeInput } from "../src/disposition/care-alternative.ts";
const reconcileCareAlternative = (input: CareAlternativeInput) => reconcile(input, sha256);

// Contract-only synthetic fixture; neither label nor assertions are clinical gold.
function fixture() {
  const patient = "There is a new concerning symptom. Other features have not been assessed.";
  const finalDirective = "An in-person assessment is recommended today for a hands-on examination. If prompt suitable care is unavailable, go to the emergency department now. Do not wait for a message reply.";
  const source = "Synthetic reference statement used solely for exact quotation testing.";
  const draft = draftSchema.parse({ disposition: "SAME_DAY_IN_PERSON", reviewPriority: null, workType: null,
    patientMessage: finalDirective, reason: "The reported new symptom needs an examination today in this synthetic test.", differential: ["Possible explanation requiring examination"],
    redFlags: [{ concern: "New symptom", status: "reported", quote: "new concerning symptom" }, { concern: "Other features", status: "unknown", quote: "" }],
    vitalSigns: "No vital-sign measurements are reported; their context is unknown.", questions: [],
    evidenceLimitations: "Synthetic contract fixture; no clinical validation.",
    citations: [{ passageId: "test-source", quote: source, claim: "This is a synthetic reference statement, not medical guidance.", applicability: "uncertain", limitation: "Contract test only." }],
  });
  const notice = { disposition: "EMERGENCY_NOW" as const, directive: "Seek emergency department assessment now. Do not wait for a message reply; call 911 if you cannot travel safely.", source: "emergency_agent" as const };
  const alternative = { decision: "use_final_alternative", reason: "The earlier ED alternative is defensible; the final pathway preserves the judged necessary examination and timing with an immediate fallback.",
    earlyDirectiveQuote: notice.directive, patientQuotes: ["new concerning symptom"], finalDirectiveQuote: "An in-person assessment is recommended today",
    timing: { verdict: "meets_required_timing", quote: "assessment is recommended today" },
    capability: { verdict: "meets_required_capability", requirement: "A hands-on examination is judged necessary.", quote: "for a hands-on examination" },
    access: { verdict: "fallback_preserves_required_care", fallbackQuote: "If prompt suitable care is unavailable, go to the emergency department now." }, decisiveUnresolvedPrerequisites: [],
  };
  const output = { reviewScope: "draft-and-issued-question/v2", verdict: "accept", earlyAction: "supported", earlyCorrection: null,
    alternativeReconciliation: alternative,
    criteria: ["undertriage", "overtriage", "patient_grounding", "claim_support", "safety_net", "clarification_delay", "ownership"].map(id => ({ id, verdict: "pass", reason: "Synthetic supplied criterion passes.", anchors: [{ unit: id === "claim_support" ? "source:test-source" : "patient", quote: id === "claim_support" ? source : "new concerning symptom" }] })),
  };
  const reviewPacket = { units: [{ id: "patient", text: patient }, { id: "draft", text: JSON.stringify(draft) }, { id: "early", text: JSON.stringify({ notice, basis: [] }) }, { id: "source:test-source", text: source }], hasIssuedEarlyAction: true };
  const checks: CareAlternativeInput["mechanical"]["checks"][number][] = ["quoted_patient_evidence", "citation_provenance", "action_timing_present", "no_blanket_clearance", "no_unconfirmed_handoff", "rag_source_integrity"].map(id => ({ id, status: "pass" }));
  const input = { patient, draft, issued: { notice, sequence: 1 }, reviewPacket, reviews: [{ failure: null as string | null, output, binding: { patientHash: "", draftHash: "", noticeHash: "", noticeSequence: 1, packetHash: "", judgeHash: "" } }], mechanical: { draftHash: "", checks }, cancelled: false };
  return rebind(input);
}
function rebind<T extends CareAlternativeInput>(input: T): T {
  const last = input.reviews.at(-1)!;
  last.binding = { patientHash: sha256(input.patient), draftHash: sha256(JSON.stringify(input.draft)), noticeHash: sha256(JSON.stringify(input.issued.notice)), noticeSequence: input.issued.sequence, packetHash: sha256(JSON.stringify(input.reviewPacket)), judgeHash: sha256(JSON.stringify(last.output)) };
  input.mechanical.draftHash = last.binding.draftHash;
  return input;
}
test("explicit supported ED alternative can replace care only after complete bound review without changing earlier verdict", () => {
  const input = fixture(), before = JSON.stringify(input), result = reconcileCareAlternative(input);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.reconciliation.from.disposition, "EMERGENCY_NOW");
  assert.equal(result.reconciliation.to.disposition, "SAME_DAY_IN_PERSON");
  assert.equal(result.reconciliation.to.directive, input.draft.patientMessage);
  assert.equal(result.reconciliation.binding.judgeHash, sha256(JSON.stringify(input.reviews[0].output)));
  assert.equal(result.reconciliation.clinicalApproval, false);
  assert.equal(input.reviews[0].output.earlyAction, "supported");
  assert.equal(JSON.stringify(input), before);
});
test("EMS activation and active-response continuation cannot cross via this alternative path", () => {
  for (const directive of ["Call 911 now. Do not drive.", "Please call 9-1-1 immediately.", CONTINUE_EMS_DIRECTIVE]) {
    const input = fixture(); input.issued.notice.directive = directive;
    assert.deepEqual(reconcileCareAlternative(rebind(input)), { ok: false, diagnostic: "EMS_PROTECTED", clinicalApproval: false });
  }
});
test("unresolved clinical timing, capability or access cannot become a negative finding or release", () => {
  for (const field of ["decision", "timing", "capability", "access", "decisiveUnresolvedPrerequisites"] as const) {
    const input = fixture(), a = input.reviews[0].output.alternativeReconciliation;
    if (field === "decision") a.decision = "unresolved";
    else if (field === "decisiveUnresolvedPrerequisites") Object.assign(a, { decisiveUnresolvedPrerequisites: ["Required capability has not been established."] });
    else a[field].verdict = "unresolved";
    assert.equal(reconcileCareAlternative(rebind(input)).ok, false);
  }
});
test("historical free text, evidence-only failure and adverse or absent criteria cannot authorize a downgrade", () => {
  const archived = fixture();
  Object.assign(archived.reviews[0].output, { alternativeReconciliation: undefined, correction: "No repair required. ED was a defensible alternative." });
  assert.equal(reconcileCareAlternative(rebind(archived)).ok, false);
  for (const verdict of ["revise", "human_review"]) {
    const input = fixture(); input.reviews[0].output.verdict = verdict;
    assert.equal(reconcileCareAlternative(rebind(input)).ok, false);
  }
  for (const criterion of fixture().reviews[0].output.criteria) {
    const input = fixture(); input.reviews[0].output.criteria.find(c => c.id === criterion.id)!.verdict = "fail";
    assert.equal(reconcileCareAlternative(rebind(input)).ok, false);
  }
  const duplicate = fixture(); duplicate.reviews[0].output.criteria[6] = duplicate.reviews[0].output.criteria[0];
  assert.equal(reconcileCareAlternative(rebind(duplicate)).ok, false);
});
test("every current binding matters; a historical successful review cannot rescue a later failed or adverse review", () => {
  for (const key of ["patientHash", "draftHash", "noticeHash", "packetHash", "judgeHash"] as const) {
    const input = fixture(); input.reviews[0].binding[key] = "0".repeat(64);
    assert.equal(reconcileCareAlternative(input).ok, false);
  }
  const sequence = fixture(); sequence.issued.sequence++;
  assert.equal(reconcileCareAlternative(sequence).ok, false);
  const failed = fixture(); failed.reviews.push({ ...failed.reviews[0], failure: "INCOMPLETE_MODEL_STREAM" });
  assert.equal(reconcileCareAlternative(failed).ok, false);
  const adverse = fixture(); adverse.reviews.push(structuredClone(adverse.reviews[0])); adverse.reviews[1].output.verdict = "human_review";
  assert.equal(reconcileCareAlternative(rebind(adverse)).ok, false);
  const cancelled = fixture(); cancelled.cancelled = true;
  assert.equal(reconcileCareAlternative(cancelled).ok, false);
});
test("quote and packet binding reject other patient/draft/early notice and invented fallback", () => {
  for (const id of ["patient", "draft", "early"]) {
    const input = fixture(); input.reviewPacket.units.find(unit => unit.id === id)!.text = id === "early" ? JSON.stringify({ notice: { ...input.issued.notice, directive: "Other notice" } }) : "Other content";
    assert.equal(reconcileCareAlternative(rebind(input)).ok, false);
  }
  for (const field of ["earlyDirectiveQuote", "finalDirectiveQuote"] as const) {
    const input = fixture(); input.reviews[0].output.alternativeReconciliation[field] = "An invented quotation";
    assert.equal(reconcileCareAlternative(rebind(input)).ok, false);
  }
  const fallback = fixture(); fallback.reviews[0].output.alternativeReconciliation.access.fallbackQuote = "An appointment is confirmed tomorrow.";
  assert.equal(reconcileCareAlternative(rebind(fallback)).ok, false);
  const patient = fixture(); patient.reviews[0].output.alternativeReconciliation.patientQuotes = ["No red flags are present"];
  assert.equal(reconcileCareAlternative(rebind(patient)).ok, false);
});
test("mechanical failures or missing evidence cannot become care-only release; concision remains a presentation check", () => {
  for (const check of fixture().mechanical.checks) {
    const input = fixture(); input.mechanical.checks = input.mechanical.checks.filter(item => item.id !== check.id);
    assert.equal(reconcileCareAlternative(input).ok, false);
  }
  const failed = fixture(); failed.mechanical.checks.push({ id: "research_support", status: "fail" });
  assert.equal(reconcileCareAlternative(failed).ok, false);
  const stale = fixture(); stale.mechanical.draftHash = "0".repeat(64);
  assert.equal(reconcileCareAlternative(stale).ok, false);
  const concise = fixture(); concise.mechanical.checks.push({ id: "response_concision", status: "fail" });
  assert.equal(reconcileCareAlternative(concise).ok, true);
});
test("self-care and async routes, empty evidence, altered patient quotes and foreign review scope remain outside authorization", () => {
  for (const disposition of ["SELF_CARE", "ASYNC_PHYSICIAN", "EMERGENCY_NOW"] as const) {
    const input = fixture(); input.draft.disposition = disposition;
    assert.equal(reconcileCareAlternative(rebind(input)).ok, false);
  }
  const noEvidence = fixture(); noEvidence.draft.citations = []; noEvidence.reviewPacket.units.find(unit => unit.id === "draft")!.text = JSON.stringify(noEvidence.draft);
  assert.equal(reconcileCareAlternative(rebind(noEvidence)).ok, false);
  const foreignScope = fixture(); foreignScope.reviews[0].output.reviewScope = "other-review-scope/v1";
  assert.equal(reconcileCareAlternative(rebind(foreignScope)).ok, false);
  const wrongCriterionQuote = fixture(); wrongCriterionQuote.reviews[0].output.criteria[0].anchors[0].quote = "Normal vital signs were reported.";
  assert.equal(reconcileCareAlternative(rebind(wrongCriterionQuote)).ok, false);
});
