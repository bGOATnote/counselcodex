import { z } from "zod";

// Project policy, not a measured Counsel SLA or a maximum safe clinical delay.
export const ROUTING_POLICY_VERSION = "five-route-queue/v2";
// Admission identity only: queue availability is already displayed separately.
// Explicit same-day timing and clinician ownership are still required; this
// token check never verifies availability, acceptance or clinical suitability.
export const ACTION_TIMING_ADMISSION_POLICY = Object.freeze({ version: "action-timing-admission/v1", standardAsync: "clinician-owner-and-explicit-today-or-same-day", availability: "separate-queue-policy-and-handoff-checks" });
// Five operational routes; the legacy disposition + priority encoding stays
// lossless so original labels and immutable historical runs need no migration.
export const operationalRoutes = ["SELF_CARE", "PRIORITY_ASYNC", "STANDARD_ASYNC", "EMERGENCY_NOW", "SAME_DAY_IN_PERSON"] as const;
export const routeLabels: Record<typeof operationalRoutes[number], string> = {
  SELF_CARE: "Self care", PRIORITY_ASYNC: "Priority async", STANDARD_ASYNC: "Standard async",
  EMERGENCY_NOW: "Emergency assessment now", SAME_DAY_IN_PERSON: "In-person today",
};
export const QUEUE_POLICY = {
  version: ROUTING_POLICY_VERSION,
  intendedOwner: "Counsel clinical team",
  target: "Prompt same-day review during service hours; priority requests are reviewed first. No response time is guaranteed.",
  availability: "Service availability not connected. No live clinician acceptance or response ETA is available.",
  followUp: "Clinician-planned check-ins in this thread. SMS/push delivery and shift handoff are not connected.",
} as const;
export function operationalRoute(answer: RoutingAnswer): typeof operationalRoutes[number] | null {
  if (answer.disposition === "ASYNC_PHYSICIAN") return answer.reviewPriority === "priority" ? "PRIORITY_ASYNC" : answer.reviewPriority === "routine" ? "STANDARD_ASYNC" : null;
  return operationalRoutes.includes(answer.disposition as typeof operationalRoutes[number]) ? answer.disposition as typeof operationalRoutes[number] : null;
}
export function routingLabel(answer: RoutingAnswer) { const route = operationalRoute(answer); return route ? routeLabels[route] : "Async review · priority not recorded"; }
export function asyncTimingPresent(answer: RoutingAnswer, text: string) {
  const clinicianOwner = /\b(clinician|physician|prescriber|doctor)\b/i.test(text) || /\breview by Counsel\b/i.test(text);
  return clinicianOwner && (answer.reviewPriority === "routine" ? /\b(today|same-day)\b/i.test(text) : answer.reviewPriority === "priority" ? /\b(today|same-day)\b/i.test(text) : /\b(24 hours|today|within (?:about )?(?:a|one|1) day)\b/i.test(text));
}
export const reviewPrioritySchema = z.enum(["priority", "routine"]);
export const workTypeSchema = z.enum(["medication_request", "clinical_review"]);
export type ReviewPriority = z.infer<typeof reviewPrioritySchema>;
export type RoutingAnswer = { disposition: string; reviewPriority?: ReviewPriority | null; workType?: z.infer<typeof workTypeSchema> | null };
export function routingFieldsValid(answer: RoutingAnswer) {
  return answer.disposition === "ASYNC_PHYSICIAN"
    ? reviewPrioritySchema.safeParse(answer.reviewPriority).success && workTypeSchema.safeParse(answer.workType).success
    : answer.reviewPriority === null && answer.workType === null;
}
export function asyncAction(answer: RoutingAnswer) {
  if (answer.reviewPriority === "priority") return "Priority review by the Counsel clinician in this thread is needed today. This recommendation does not confirm a clinician has accepted the request.";
  if (answer.reviewPriority === "routine") return "Standard async review by the Counsel clinician in this thread is recommended, with a same-day service-hours target. Availability and acceptance are not confirmed; this is not permission to wait if symptoms change.";
  // Historical answers must not silently acquire a newly inferred priority.
  return "Counsel clinician review in this thread is recommended; priority and service availability have not been established.";
}
export function routingTiming(answer: RoutingAnswer, legacy: string) {
  if (answer.disposition !== "ASYNC_PHYSICIAN") return legacy;
  return answer.reviewPriority === "priority" ? "Priority async · Counsel clinician · time-sensitive messaging care"
    : answer.reviewPriority === "routine" ? "Standard async · Counsel clinician · same-day service-hours target · messaging care"
    : legacy;
}
export const PRIORITY_POLICY = `Policy ${ROUTING_POLICY_VERSION}: FIVE operational routes are self care, priority async, standard async, emergency now/911, and in-person today. Encode priority/standard async as disposition=ASYNC_PHYSICIAN plus reviewPriority=priority/routine respectively. Both async routes target prompt same-day review during service hours; priority means higher internal queue priority for time-sensitive assessment or prescribing, NOT a physical visit. Routine is the stored name for standard async, NOT a two-day wait. Priority depends on risk, trajectory, function and imminent medication interruption, never duration or drug name alone. Two weeks of symptoms can still require urgent care; a request for antibiotics does not establish their indication. Set workType=medication_request for a prescribing/refill task, otherwise clinical_review. Other routes have both fields null. Explain using reported facts. An active usual migraine with requested medication exhausted merits priority remote prescribing review absent an independent in-person indication. Being out of one named medicine does NOT mean no other treatment is available. Finasteride renewal is often standard; albuterol depends on symptoms and remaining rescue access. Counsel is the intended clinician in this thread. Service availability is unconnected: do not promise an ETA, invent opening hours or claim acceptance, delivery, prescribing or scheduled follow-up. The clinician must own any follow-up plan; a response does not establish resolution. Emergency transport remains explicit: 911 when EMS indicated, immediate ED when clinically appropriate. Do not invent a clinical deadline or allow queue processing to delay required care.`;
