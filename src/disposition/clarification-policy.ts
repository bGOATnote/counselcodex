import { z } from "zod";
import { operationalRoutes } from "./routing-policy.ts";

export const routingConsequenceSchema = z.object({
  alternatives: z.array(z.object({ answer: z.string().min(3).max(160), route: z.enum(operationalRoutes) }).strict()).length(2),
}).strict();
export const clarificationAssessmentSchema = z.object({
  decision: z.enum(["not_needed", "collect_during_review", "block"]),
  reason: z.string().min(15).max(240),
}).strict();
export const PENDING_INSTRUCTION = "No final route or clinician acceptance is confirmed. For severe trouble breathing, new one-sided weakness or trouble speaking, call 911 now; do not wait for this question or a message reply.";
export function hasRoutingConsequence(question: { routingConsequence?: unknown } | null | undefined): boolean {
  const parsed = routingConsequenceSchema.safeParse(question?.routingConsequence);
  return parsed.success && parsed.data.alternatives[0].route !== parsed.data.alternatives[1].route &&
    parsed.data.alternatives[0].answer.trim().toLowerCase() !== parsed.data.alternatives[1].answer.trim().toLowerCase();
}
export function pendingInstructionFor(question: { routingConsequence?: unknown } | null | undefined): string {
  const parsed = routingConsequenceSchema.safeParse(question?.routingConsequence);
  if (!parsed.success || !hasRoutingConsequence(question)) return PENDING_INSTRUCTION;
  const actions = parsed.data.alternatives.flatMap(branch => branch.route === "EMERGENCY_NOW"
    ? [`If the answer “${branch.answer}” describes you, call 911 now; do not drive yourself or wait to reply here.`]
    : branch.route === "SAME_DAY_IN_PERSON"
      ? [`If the answer “${branch.answer}” describes you, seek in-person assessment today; do not wait for a reply here.`] : []);
  return [...actions, PENDING_INSTRUCTION].join(" ");
}
export const CLARIFICATION_POLICY = `A question must earn any delay. For routing-critical clarification, the question states the unknown; why gives ONE short sentence explaining why routing cannot proceed first. routingConsequence contains two brief plausible answer-to-route alternatives with DIFFERENT routes (SELF_CARE, PRIORITY_ASYNC, STANDARD_ASYNC, EMERGENCY_NOW, SAME_DAY_IN_PERSON). These are proposed counterfactuals, not findings or validated conclusions. Never invent differences to justify asking. Each proposed answer must itself justify its route; do not assign an urgent route to a broad answer that would require further questions to establish urgency. Recent surgery or injury of any kind does not uniformly establish urgent physical care; relevant procedure/injury and symptom characteristics matter. A routing consequence is necessary but NOT sufficient to block: prefer collecting the question during prompt clinician review when that review can proceed without the answer. Explain the specific harm of routing first, not merely that the answer could alter the diagnosis. If a question only refines diagnosis, finger distribution, counseling or routine prescribing checks without changing route/priority, use routingConsequence=null; collect it during clinician review, never block. For unilateral numbness, several days of symptoms and absence of weakness do NOT establish gradual onset or exclude a stroke pathway; sudden versus gradual onset can change routing. Whole-hand distribution alone does not require emergency care. Already-required emergency/in-person care proceeds without questions. Never call unknown findings absent. Keep clarificationAssessment.reason to ONE short sentence, not repeated case history.`;
