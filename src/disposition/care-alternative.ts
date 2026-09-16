import { z } from "zod";
import { isEmsInstruction } from "./care-setting.ts";
import { draftSchema } from "./graph-output.ts";
import { exactStructuredJudgeAnchor } from "./judge-anchors.ts";

export const CARE_ALTERNATIVE_POLICY = "explicit-ed-same-day-alternative/v1";
const criterionIds = ["undertriage", "overtriage", "patient_grounding", "claim_support", "safety_net", "clarification_delay", "ownership"] as const;
const quote = z.string().min(3).max(600);
/** Separate from whether earlier care was defensible; these are MODEL judgments. */
export const careAlternativeReviewSchema = z.object({
  decision: z.enum(["use_final_alternative", "unresolved"]),
  reason: z.string().min(20).max(600),
  earlyDirectiveQuote: quote,
  patientQuotes: z.array(quote).min(1).max(3),
  finalDirectiveQuote: quote,
  timing: z.object({ verdict: z.enum(["meets_required_timing", "unresolved"]), quote }).strict(),
  capability: z.object({ verdict: z.enum(["meets_required_capability", "unresolved"]), requirement: z.string().min(10).max(300), quote }).strict(),
  access: z.object({ verdict: z.enum(["fallback_preserves_required_care", "unresolved"]), fallbackQuote: quote }).strict(),
  decisiveUnresolvedPrerequisites: z.array(z.string().min(3).max(300)).max(6),
}).strict();
export type CareAlternativeReview = z.infer<typeof careAlternativeReviewSchema>;
const judgeSchema = z.object({
  reviewScope: z.literal("draft-and-issued-question/v2"), verdict: z.literal("accept"),
  earlyAction: z.literal("supported"), earlyCorrection: z.null(),
  criteria: z.array(z.object({ id: z.enum(criterionIds), verdict: z.literal("pass"),
    anchors: z.array(z.object({ unit: z.string(), quote }).strict()).min(1).max(3),
  }).passthrough()).length(7),
  alternativeReconciliation: careAlternativeReviewSchema,
}).passthrough();
const noticeSchema = z.object({ disposition: z.enum(["EMERGENCY_NOW", "SAME_DAY_IN_PERSON"]), directive: z.string().min(10), source: z.enum(["initial_screen", "emergency_agent"]) }).strict();
const packetSchema = z.object({ units: z.array(z.object({ id: z.string(), text: z.string() }).strict()).min(3), hasIssuedEarlyAction: z.literal(true) }).passthrough();
const checkSchema = z.object({ id: z.string().min(1), status: z.enum(["pass", "fail", "not_assessed"]), detail: z.string().optional() }).strict();
const requiredChecks = ["quoted_patient_evidence", "citation_provenance", "action_timing_present", "no_blanket_clearance", "no_unconfirmed_handoff", "rag_source_integrity"];
export type CareAlternativeInput = {
  patient: string;
  draft: unknown;
  issued: { notice: z.infer<typeof noticeSchema>; sequence: number };
  reviewPacket: unknown;
  // Caller supplies chronological records, including failed/incomplete reviews.
  // Never filter to the last successful review or reuse a pre-repair approval.
  reviews: readonly {
    failure: string | null;
    output: unknown;
    binding: { patientHash: string; draftHash: string; noticeHash: string; noticeSequence: number; packetHash: string; judgeHash: string };
  }[];
  mechanical: { draftHash: string; checks: readonly { id: string; status: "pass" | "fail" | "not_assessed"; detail?: string }[] };
  cancelled: boolean;
};
export type CareAlternativeDiagnostic = "CANCELLED" | "INVALID_INPUT" | "OUTSIDE_NARROW_TRANSITION" | "EMS_PROTECTED" | "LATEST_REVIEW_UNAVAILABLE"
  | "REVIEW_BINDING_MISMATCH" | "PACKET_CONTENT_MISMATCH" | "EXPLICIT_ACCEPTANCE_MISSING" | "UNRESOLVED_REQUIREMENTS" | "QUOTE_BINDING_FAILED" | "MECHANICAL_CHECK_FAILED";
export type BoundCareAlternative = {
  policy: typeof CARE_ALTERNATIVE_POLICY;
  status: "revised";
  kind: "defensible_alternative";
  from: { disposition: "EMERGENCY_NOW"; directive: string };
  to: { disposition: "SAME_DAY_IN_PERSON"; directive: string };
  reason: string;
  review: "independent_model";
  clinicalApproval: false;
  binding: CareAlternativeInput["reviews"][number]["binding"] & { mechanicalChecksHash: string };
  assessment: CareAlternativeReview;
};

/** Hash inputs are explicit so the same validator can run with server SHA-256
 * or browser Web Crypto. No Node or provider dependency enters the client. */
export function careAlternativeHashInputs(input: CareAlternativeInput): string[] {
  return [input.patient, JSON.stringify(input.draft), JSON.stringify(input.issued.notice),
    JSON.stringify(input.reviewPacket), JSON.stringify(input.reviews.at(-1)?.output), JSON.stringify(input.mechanical.checks)];
}

/** Admits a complete, explicitly reviewed alternative, never care-only
 * release after evidence failure. Identity checks cannot prove medical safety,
 * real service availability, model attribution, or publisher claim entailment.
 * The caller must still validate/emit the bound care_revision before the reply.
 */
export function reconcileCareAlternative(input: CareAlternativeInput, sha256: (text: string) => string):
  { ok: true; reconciliation: BoundCareAlternative } | { ok: false; diagnostic: CareAlternativeDiagnostic; clinicalApproval: false } {
  const fail = (diagnostic: CareAlternativeDiagnostic) => ({ ok: false as const, diagnostic, clinicalApproval: false as const });
  try {
    if (input.cancelled) return fail("CANCELLED");
    if (typeof input.cancelled !== "boolean" || !input.patient.trim() || !Number.isSafeInteger(input.issued.sequence) || input.issued.sequence < 1) return fail("INVALID_INPUT");
    const notice = noticeSchema.parse(input.issued.notice), draft = draftSchema.parse(input.draft);
    if (isEmsInstruction(notice.directive)) return fail("EMS_PROTECTED");
    if (notice.disposition !== "EMERGENCY_NOW" || draft.disposition !== "SAME_DAY_IN_PERSON" || draft.reviewPriority !== null || draft.workType !== null || draft.transportIntent !== null) return fail("OUTSIDE_NARROW_TRANSITION");
    const last = input.reviews.at(-1);
    if (!last || last.failure !== null || !last.output) return fail("LATEST_REVIEW_UNAVAILABLE");
    const patientHash = sha256(input.patient), draftHash = sha256(JSON.stringify(input.draft)), noticeHash = sha256(JSON.stringify(input.issued.notice));
    const packetHash = sha256(JSON.stringify(input.reviewPacket)), judgeHash = sha256(JSON.stringify(last.output));
    if (last.binding.patientHash !== patientHash || last.binding.draftHash !== draftHash || last.binding.noticeHash !== noticeHash
      || last.binding.noticeSequence !== input.issued.sequence || last.binding.packetHash !== packetHash || last.binding.judgeHash !== judgeHash) return fail("REVIEW_BINDING_MISMATCH");
    const packet = packetSchema.parse(input.reviewPacket), units = packet.units;
    if (new Set(units.map(unit => unit.id)).size !== units.length || units.find(unit => unit.id === "patient")?.text !== input.patient
      || units.find(unit => unit.id === "draft")?.text !== JSON.stringify(input.draft)
      || JSON.stringify(JSON.parse(units.find(unit => unit.id === "early")?.text ?? "null")?.notice) !== JSON.stringify(input.issued.notice)) return fail("PACKET_CONTENT_MISMATCH");
    const parsed = judgeSchema.safeParse(last.output);
    if (!parsed.success || new Set(parsed.data.criteria.map(criterion => criterion.id)).size !== 7) return fail("EXPLICIT_ACCEPTANCE_MISSING");
    const judgment = parsed.data, alternative = judgment.alternativeReconciliation;
    if (alternative.decision !== "use_final_alternative" || alternative.timing.verdict !== "meets_required_timing" || alternative.capability.verdict !== "meets_required_capability"
      || alternative.access.verdict !== "fallback_preserves_required_care" || alternative.decisiveUnresolvedPrerequisites.length) return fail("UNRESOLVED_REQUIREMENTS");
    const draftQuotes = [alternative.finalDirectiveQuote, alternative.timing.quote, alternative.capability.quote, alternative.access.fallbackQuote];
    if (alternative.earlyDirectiveQuote !== notice.directive || alternative.patientQuotes.some(value => !input.patient.includes(value))
      || draftQuotes.some(value => !draft.patientMessage.includes(value))
      || judgment.criteria.some(criterion => criterion.anchors.some(anchor => !["patient", "draft", "issued_question"].includes(anchor.unit) && !anchor.unit.startsWith("source:")
        || !units.some(unit => unit.id === anchor.unit && exactStructuredJudgeAnchor(unit, anchor.quote))))
      || !judgment.criteria.find(criterion => criterion.id === "claim_support")?.anchors.some(anchor => anchor.unit.startsWith("source:"))) return fail("QUOTE_BINDING_FAILED");
    const checks = z.array(checkSchema).parse(input.mechanical.checks);
    if (input.mechanical.draftHash !== draftHash || !draft.citations.length || new Set(checks.map(check => check.id)).size !== checks.length
      || !requiredChecks.every(id => checks.find(check => check.id === id)?.status === "pass")
      || checks.some(check => check.status === "fail" && check.id !== "response_concision")) return fail("MECHANICAL_CHECK_FAILED");
    return { ok: true, reconciliation: {
      policy: CARE_ALTERNATIVE_POLICY, status: "revised", kind: "defensible_alternative",
      from: { disposition: "EMERGENCY_NOW", directive: notice.directive }, to: { disposition: "SAME_DAY_IN_PERSON", directive: draft.patientMessage },
      reason: alternative.reason, review: "independent_model", clinicalApproval: false,
      binding: { patientHash, draftHash, noticeHash, noticeSequence: input.issued.sequence, packetHash, judgeHash, mechanicalChecksHash: sha256(JSON.stringify(checks)) },
      assessment: alternative,
    } };
  } catch { return fail("INVALID_INPUT"); }
}
