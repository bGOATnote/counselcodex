import { checkAnswerForFullReview as checkAnswer, onsetPatternCheck, type DispositionRun } from "../disposition/contract.ts";
import { assessEmergencyTransport, graphJudgePacket, graphSourceIntegrity, reviewHandoffLanguage } from "../disposition/clinical-graph.ts";
import { routingFieldsValid } from "../disposition/routing-policy.ts";
import { sameRepairValue } from "../disposition/repair-values.ts";
import { sha256, type Hit } from "../evidence/rag/model.ts";
import type { draftSchema } from "../disposition/graph-output.ts";
import { verifyJudgeSourceRepairBindingSteps } from "../disposition/judge-source-repair-binding.ts";

/** V24 changes producer instructions, not the v23 packet/admission contract.
 * Register compatibility explicitly; a future version never inherits it. */
export const EXACT_REVIEW_CONTRACT_VERSIONS = Object.freeze(["evidence-graph/v23", "evidence-graph/v24"] as const);
export const LEGACY_REVIEW_CONTRACT_VERSIONS = Object.freeze(Array.from({ length: 22 }, (_, i) => `evidence-graph/v${i + 1}`));
export const usesExactReviewContract = (version: string | undefined) => typeof version === "string" && (EXACT_REVIEW_CONTRACT_VERSIONS as readonly string[]).includes(version);
export const knownReviewContract = (version: string | undefined) => usesExactReviewContract(version) || typeof version === "string" && LEGACY_REVIEW_CONTRACT_VERSIONS.includes(version);

/** Exact registered packet reconstruction, not clinical re-grading. These
 * shared packet/check functions retain the v23 admission semantics. A future
 * protocol needs explicit review; v1-v22 are not reinterpreted here.
 * No agent generation, provider, retrieval or workflow execution is invoked. */
export function reconstructV23ReviewPacket(run: DispositionRun, draft: ReturnType<typeof draftSchema.parse>, producerIndex: number, criticIndex: number) {
  if (!run.graph || !usesExactReviewContract(run.graph.version) || !run.guidance || !run.responseEvents || !run.agents) return null;
  const hits: Hit[] = [];
  for (const guidance of run.guidance) {
    const hit = run.graph.retrieval.flatMap(retrieval => retrieval.hits).find(hit => hit.chunk.id === guidance.id && hit.chunk.text === guidance.summary);
    if (!hit || sha256(hit.chunk.text) !== hit.chunk.hash || !guidance.retrievedPassages?.some(p => p.id === hit.chunk.id && p.excerpt === hit.chunk.text && p.excerptSha256 === hit.chunk.hash)
      || hits.some(selected => selected.chunk.id === hit.chunk.id)) return null;
    hits.push(hit);
  }
  if (producerIndex >= criticIndex) return null;
  // Runtime clears BOTH judge and reviewedDraftHash before applying a patch.
  // Every first/fresh review packet therefore uses null review context. Never
  // carry prior transport or ownership approval into a repaired draft.
  const transport = assessEmergencyTransport(draft, run.message, null).binding;
  const { citations, transportIntent: _intent, ...rest } = draft;
  const answer = { ...rest, ...(transport ? { emergencyTransport: transport } : {}), evidence: citations.map(citation => ({ sourceId: citation.passageId, claim: citation.claim })) };
  const contractFindings = [
    ...checkAnswer(answer, run.message, run.guidance, null).map(check => check.id === "no_unconfirmed_handoff" ? reviewHandoffLanguage(draft, null, null, check).check : check).filter(check => check.status === "fail" && check.id !== "response_concision"),
    ...(!routingFieldsValid(draft) ? [{ id: "routing_fields", status: "fail", detail: "Disposition and priority/work-type fields are inconsistent." }] : []),
    ...(!graphSourceIntegrity(draft, hits) ? [{ id: "exact_source_quote", status: "fail", detail: "A cited quotation or source identity does not match its supplied passage." }] : []),
  ];
  const notice = run.responseEvents.filter(event => event.kind === "action").at(-1)?.notice ?? null;
  const packet = graphJudgePacket({ patient: run.message, draft, hits, notice, basis: run.graph.safety?.basis,
    questions: run.responseEvents.filter(event => event.kind === "intake_question"), contractFindings });
  const critic = run.agents[criticIndex];
  if (!critic || critic.reviewInputBinding?.packetHash !== sha256(JSON.stringify(packet))) return null;
  const repairSteps = verifyJudgeSourceRepairBindingSteps(critic, packet);
  let repairState = repairSteps.next(); while (!repairState.done) repairState = repairSteps.next(sha256(repairState.value));
  if (!repairState.value) return null;
  const retained = run.graph.careAlternative?.packet ?? run.graph.careReviewPacket;
  if (retained && !sameRepairValue(retained, packet)) return null;
  return packet;
}

// Explicitly retain the recorded v23 release gates. An absent check is not a
// pass, and clinical_correctness/research_support remain unassessed here.
export const V23_REQUIRED_PASS_CHECKS = [
  "escalation_floor", "quoted_patient_evidence", "citation_provenance", "no_blanket_clearance",
  "unreported_symptoms_not_denied", "usual_pattern_not_onset_denial", "action_timing_present", "no_unconfirmed_handoff",
  "no_unauthorized_medication_change", "denial_scope", "intake_is_not_hydration_exam", "guideline_deadline_fidelity",
  "no_unsupported_statistics", "no_unsupported_risk_timeline", "source_interpretation_boundary", "unknown_breathing_not_cleared",
  "no_unverified_inhaler_plan", "no_patient_wound_probing", "wakefulness_not_neurologic_clearance", "atraumatic_leak_not_excluded",
  "no_nosebleed_positioning_in_penetration", "worsening_not_deferred_ten_days", "unmeasured_vitals_not_dismissed", "irrigation_support_missing",
  "rag_source_integrity", "independent_review",
] as const;

export function completeV23ReleaseChecks(run: DispositionRun): boolean {
  if (!Array.isArray(run.checks) || new Set(run.checks.map(check => check.id)).size !== run.checks.length) return false;
  if (!V23_REQUIRED_PASS_CHECKS.every(id => {
    const recorded = run.checks.find(check => check.id === id);
    if (id === "usual_pattern_not_onset_denial") {
      if (!run.answer) return false;
      const replayed = onsetPatternCheck(run.answer.redFlags);
      // Derive the required state from the reviewed answer, not mutable saved
      // status/detail. Changing both fields must not turn a deferred check into
      // a deterministic pass. Older policy states need their archived scorer;
      // this current replay cannot silently attest compatibility with them.
      return replayed.status !== "fail" && replayed.status === recorded?.status && replayed.detail === recorded.detail;
    }
    if (recorded?.status === "pass") return true;
    // A targeted language guard cannot establish clinical onset semantics.
    // Permit only its exact, freshly reconstructed deferred state. The caller
    // separately requires the complete accepting review and exact packet/draft
    // binding; no other mechanical check gains an unassessed exception here.
    return false;
  })) return false;
  if (!["research_support", "clinical_correctness"].every(id => run.checks.find(check => check.id === id)?.status === "not_assessed")) return false;
  const transport = run.checks.find(check => check.id === "emergency_transport")?.status;
  if (transport !== (run.answer?.emergencyTransport ? "pass" : "not_assessed")) return false;
  if (!["pass", "not_assessed"].includes(run.checks.find(check => check.id === "care_reconciliation")?.status ?? "")) return false;
  return !run.checks.some(check => !["pass", "fail", "not_assessed"].includes(check.status) || check.status === "fail" && check.id !== "response_concision");
}
