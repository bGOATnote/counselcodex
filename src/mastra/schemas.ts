import { z } from "zod";
import { safetyReviewSchema } from "../clinical/response-safety.ts";

export const dispositionSchema = z.enum(["SELF_CARE", "ASYNC_PHYSICIAN", "SAME_DAY_IN_PERSON", "EMERGENCY_NOW"]);
export const confidenceSchema = z.enum(["high", "medium", "indeterminate"]);

function isEscalated(disposition: string | null): boolean {
  return disposition === "SAME_DAY_IN_PERSON" || disposition === "EMERGENCY_NOW";
}

export const inboundSchema = z.object({
  message: z.string().trim().min(1).max(12_000),
});

export const conversationTurnSchema = z.object({
  role: z.enum(["patient", "clinician"]),
  content: z.string().trim().min(1).max(12_000),
});

export const MAX_EPISODE_CHARS = 12_000;

export const clinicalIntakeInputSchema = z.object({
  turns: z.array(conversationTurnSchema).min(1).max(20),
}).superRefine(({ turns }, context) => {
  if (turns.at(-1)?.role !== "patient") {
    context.addIssue({
      code: "custom",
      path: ["turns", turns.length - 1, "role"],
      message: "the latest turn must be from the patient",
    });
  }
  const patientTurns = turns.filter(({ role }) => role === "patient");
  const patientCharacters = patientTurns.reduce((total, { content }) => total + content.length, 0);
  const separatorCharacters = Math.max(0, patientTurns.length - 1);
  if (patientCharacters + separatorCharacters > MAX_EPISODE_CHARS) {
    context.addIssue({
      code: "custom",
      path: ["turns"],
      message: `combined patient turns must not exceed ${MAX_EPISODE_CHARS} characters`,
    });
  }
});

export const guidelineSchema = z.object({
  id: z.string(),
  summary: z.string(),
  source: z.literal("local_demo_policy"),
  retrievedAt: z.null(),
  retrieval: z.object({
    schemaVersion: z.literal("counsel-retrieval-context/v1"),
    mode: z.literal("exact_policy_lookup"),
    authority: z.literal("context_only"),
    corpusVersion: z.literal("demo-policy-v0"),
    provenanceRequired: z.literal(true),
    canChangeDisposition: z.literal(false),
    canDowngradeUrgency: z.literal(false),
    sourceId: z.string().min(1),
  }),
});

export const emergencyResultSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  fired: z.boolean(),
  name: z.string().nullable(),
  disposition: z.enum(["SAME_DAY_IN_PERSON", "EMERGENCY_NOW"]).nullable(),
  subtype: z.string().nullable(),
  evidence: z.array(z.string()),
  directive: z.string().nullable(),
  errorCode: z.string().optional(),
}).superRefine((value, context) => {
  if (value.fired !== (value.disposition !== null)) {
    context.addIssue({ code: "custom", path: ["disposition"], message: "a fired safety rule requires an operational disposition, and a clear rule cannot carry one" });
  }
});

export const intentResultSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  intent: z.enum(["refill", "results", "navigation", "self_care", "clinical"]),
  phenotype: z.string().nullable(),
  subtype: z.string().nullable(),
  evidence: z.array(z.string()),
  questions: z.array(z.string()).max(2),
  guideline: guidelineSchema,
  errorCode: z.string().optional(),
});

export const gatedDispositionSchema = z.object({
  locked: z.boolean(),
  overrideBlocked: z.boolean(),
  disposition: dispositionSchema.nullable(),
  subtype: z.string().nullable(),
  confidence: confidenceSchema.nullable(),
  redFlags: z.array(z.string()),
  rationale: z.string().nullable(),
  patientDirective: z.string().nullable(),
  layer: z.enum(["hard_escalation_gate", "gate_clear"]),
  history: intentResultSchema,
}).superRefine((value, context) => {
  if (value.locked !== value.overrideBlocked) {
    context.addIssue({ code: "custom", path: ["overrideBlocked"], message: "locked and overrideBlocked must agree" });
  }
  const escalated = isEscalated(value.disposition);
  if (value.locked !== escalated) {
    context.addIssue({ code: "custom", path: ["locked"], message: "only a same-day or emergency gate result may be locked" });
  }
  if ((value.layer === "hard_escalation_gate") !== escalated) {
    context.addIssue({ code: "custom", path: ["layer"], message: "hard gate origin and escalated disposition must agree" });
  }
});

export const dispositionResultSchema = z.object({
  locked: z.boolean(),
  overrideBlocked: z.boolean(),
  disposition: dispositionSchema,
  subtype: z.string(),
  confidence: confidenceSchema,
  redFlags: z.array(z.string()),
  rationale: z.string(),
  patientDirective: z.string(),
  layer: z.enum(["hard_escalation_gate", "intent_router", "self_care_router", "policy_default"]),
  questions: z.array(z.string()).max(2),
  guideline: guidelineSchema.nullable(),
}).superRefine((value, context) => {
  const escalated = isEscalated(value.disposition);
  if (value.locked !== value.overrideBlocked || value.locked !== escalated) {
    context.addIssue({ code: "custom", path: ["locked"], message: "same-day/emergency disposition, lock, and override block must agree" });
  }
  if ((value.layer === "hard_escalation_gate") !== escalated) {
    context.addIssue({ code: "custom", path: ["layer"], message: "hard gate origin and escalated disposition must agree" });
  }
});

const boundedText = z.string().trim().min(1).max(1_000);

export const differentialItemSchema = z.object({
  hypothesis: z.string().trim().min(1).max(160),
  importance: z.enum(["common", "must_not_miss"]),
  supportingEvidence: z.array(boundedText).max(5),
  missingOrContradictingEvidence: z.array(boundedText).min(1).max(5),
});

export const decisionCriticalQuestionSchema = z.object({
  question: z.string().trim().min(1).max(300),
  decisionImpact: z.string().trim().min(1).max(500),
});

export const clinicalIntakeSynthesisSchema = z.object({
  summary: z.string().trim().min(1).max(1_200),
  intent: z.enum(["new_symptom", "follow_up", "medication", "results", "navigation", "other"]),
  differential: z.array(differentialItemSchema).max(5),
  decisionCriticalQuestions: z.array(decisionCriticalQuestionSchema).max(3),
  uncertainties: z.array(boundedText).max(5),
  safetyConcern: z.boolean(),
  safetyConcernReason: z.string().trim().min(1).max(500).nullable(),
  informationSufficient: z.boolean(),
  sourceIds: z.array(z.string().trim().min(1).max(200)).min(1).max(5),
}).superRefine((value, context) => {
  if (value.safetyConcern !== (value.safetyConcernReason !== null)) {
    context.addIssue({
      code: "custom",
      path: ["safetyConcernReason"],
      message: "safetyConcernReason must be present exactly when safetyConcern is true",
    });
  }
  if (value.intent === "new_symptom" && value.differential.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["differential"],
      message: "new symptoms require at least one differential hypothesis",
    });
  }
  if (value.safetyConcern && !value.differential.some(({ importance }) => importance === "must_not_miss")) {
    context.addIssue({
      code: "custom",
      path: ["differential"],
      message: "a safety concern requires a must-not-miss hypothesis",
    });
  }
});

export const clinicianHandoffSchema = z.object({
  reviewState: z.enum(["READY_FOR_PHYSICIAN", "IMMEDIATE_CLINICIAN_REVIEW"]),
  owner: z.literal("licensed_clinician"),
  priority: z.enum(["immediate", "same_day", "routine"]),
  summary: z.string().trim().min(1).max(1_200),
  differential: z.array(differentialItemSchema).max(5),
  decisionCriticalQuestions: z.array(decisionCriticalQuestionSchema).max(3),
  uncertainties: z.array(boundedText).max(5),
  sourceIds: z.array(z.string().trim().min(1).max(200)).min(1).max(5),
  dispositionAuthority: z.literal("deterministic_supervisor"),
  patientFacingAutomation: z.literal(false),
});

export const clinicalIntakeResultSchema = z.object({
  safetyReview: safetyReviewSchema,
  baseDisposition: dispositionResultSchema,
  finalDisposition: dispositionSchema,
  routingLocked: z.boolean(),
  escalationSource: z.enum(["deterministic_safety_rule", "agent_safety_signal", "base_policy"]),
  agentStatus: z.enum(["completed", "bypassed_same_day", "bypassed_emergency", "bypassed_self_care", "degraded"]),
  agentInvoked: z.boolean(),
  toolCalls: z.number().int().min(0).max(3),
  handoff: clinicianHandoffSchema.nullable(),
  patientDirective: z.string().trim().min(1).max(1_000),
  evidenceBoundary: z.object({
    clinicalPerformanceEstimated: z.literal(false),
    generatedPatientMessage: z.literal(false),
    wroteChartOrPlacedOrder: z.literal(false),
  }),
  degradedReason: z.enum([
    "AGENT_UNAVAILABLE",
    "AGENT_TIMEOUT",
    "STRUCTURED_OUTPUT_INVALID",
    "RETRIEVAL_REQUIRED",
    "RETRIEVAL_FAILED",
    "RETRIEVAL_GROUNDING_FAILED",
    "UNSUPPORTED_SAFETY_CLEARANCE",
  ]).nullable(),
}).superRefine((value, context) => {
  const finalEscalated = value.finalDisposition === "SAME_DAY_IN_PERSON" || value.finalDisposition === "EMERGENCY_NOW";
  if (value.routingLocked !== finalEscalated) {
    context.addIssue({ code: "custom", path: ["routingLocked"], message: "every same-day or emergency final route must be locked and only escalated routes may be locked" });
  }
  const invokedStatus = value.agentStatus === "completed" || value.agentStatus === "degraded";
  if (value.agentInvoked !== invokedStatus) {
    context.addIssue({ code: "custom", path: ["agentInvoked"], message: "agentInvoked must agree with agentStatus" });
  }
  if (value.agentStatus === "completed" && value.toolCalls !== 1) {
    context.addIssue({ code: "custom", path: ["toolCalls"], message: "completed agent output requires exactly one tool call" });
  }
  const bypassed = value.agentStatus === "bypassed_same_day" || value.agentStatus === "bypassed_emergency" || value.agentStatus === "bypassed_self_care";
  if (bypassed && value.toolCalls !== 0) {
    context.addIssue({ code: "custom", path: ["toolCalls"], message: "a bypassed agent cannot have tool calls" });
  }
  if ((value.agentStatus === "degraded") !== (value.degradedReason !== null)) {
    context.addIssue({ code: "custom", path: ["degradedReason"], message: "degradedReason must be present exactly when the agent degraded" });
  }
  if (bypassed !== (value.handoff === null)) {
    context.addIssue({ code: "custom", path: ["handoff"], message: "only bypassed routes may omit a clinician handoff" });
  }
  if (value.escalationSource === "base_policy" && value.finalDisposition !== value.baseDisposition.disposition) {
    context.addIssue({ code: "custom", path: ["finalDisposition"], message: "base policy cannot change the base disposition" });
  }
  if (value.escalationSource === "deterministic_safety_rule"
      && (!(["SAME_DAY_IN_PERSON", "EMERGENCY_NOW"] as string[]).includes(value.baseDisposition.disposition)
        || value.finalDisposition !== value.baseDisposition.disposition
        || !value.baseDisposition.locked
        || value.agentInvoked)) {
    context.addIssue({ code: "custom", path: ["escalationSource"], message: "a deterministic safety rule must preserve its locked operational route and bypass the agent" });
  }
  if (value.escalationSource === "agent_safety_signal"
      && (value.baseDisposition.disposition !== "ASYNC_PHYSICIAN"
        || value.finalDisposition !== "EMERGENCY_NOW"
        || !invokedStatus
        || value.handoff?.reviewState !== "IMMEDIATE_CLINICIAN_REVIEW"
        || value.handoff.priority !== "immediate")) {
    context.addIssue({ code: "custom", path: ["escalationSource"], message: "agent safety signals may only promote an async base route to EMERGENCY_NOW with immediate clinician review" });
  }
});

export type DispositionResult = z.infer<typeof dispositionResultSchema>;
export type ClinicalIntakeInput = z.infer<typeof clinicalIntakeInputSchema>;
export type ClinicalIntakeSynthesis = z.infer<typeof clinicalIntakeSynthesisSchema>;
export type ClinicalIntakeResult = z.infer<typeof clinicalIntakeResultSchema>;
