// One setting contract shared by intake and final reasoning. This is project
// routing policy, not proof that a prescription is appropriate or authorized.
export const PRESCRIPTION_REVIEW_OPENING = "A prescribing clinician needs to review this medication request. I’m also checking whether your symptoms require in-person care. The assessment is not complete.";

// Shared by the emitter and browser verifier; accepting arbitrary opening prose
// would bypass the patient-facing response contract.
export function prescriptionReviewOpening(quote: unknown, message: string) {
  if (typeof quote !== "string" || quote.trim().length < 3 || quote.length > 160 || !message.includes(quote)) return null;
  return { kind: "opening" as const, quote, text: PRESCRIPTION_REVIEW_OPENING };
}

// Transport contract for action-first instructions, shared by the server and
// stream reader. This recognizes the directive, not the patient's symptoms.
export function hasUnconditional911Opening(text: string): boolean {
  const opening = text.trim().match(/^(?:please\s+)?call\s+9[\s\p{Pd}]*1[\s\p{Pd}]*1\s+(?:now|immediately)\b([^.!?\n]*)/iu);
  if (!opening) return false;
  // Scope conditions to the CALL clause. "Call now — stay with someone if
  // possible" does not condition calling; "Call now — only if worse" does.
  // This narrow directive recognizer is not semantic review of later prose.
  const remainder = opening[1], boundary = /[,;:\p{Pd}]|\b(?:and|but)\b/iu.exec(remainder);
  const callClause = boundary ? remainder.slice(0, boundary.index) : remainder;
  if (/\b(?:if|unless|when)\b/iu.test(callClause)) return false;
  const followingClause = boundary ? remainder.slice(boundary.index + boundary[0].length).replace(/^[\s,;:\p{Pd}]*(?:(?:and|but)\s+)?/iu, "") : "";
  return !/^(?:(?:only|even)\s+)?(?:if|unless|when)\b/iu.test(followingClause);
}
export type ReviewedEmergencyTransport = { mode: "activate_ems" | "continue_ems" | "ed_now"; activationQuote: string | null; directive: string; review: "independent_model" };
export const CONTINUE_EMS_DIRECTIVE = "Continue with the emergency response you reported activating. Follow the dispatcher's instructions; do not drive yourself or wait for a message reply.";
export function isEmsInstruction(directive: string): boolean {
  // Exact app-owned rendering, not symptom/keyword classification.
  return directive === CONTINUE_EMS_DIRECTIVE || hasUnconditional911Opening(directive);
}
export const PRESERVED_CARE_COPY = Object.freeze({
  reason: "The care instruction is retained; the complete explanation still needs clinician review.",
  correctedReason: "Independent model review corrected the earlier care instruction. The full explanation still needs clinician review.",
  vitalSigns: "The automated assessment has not established the vital-sign context.",
  evidenceLimitations: "No model-reviewed clinical explanation has been released. The draft and review outcome are retained for clinician assessment.",
});
/** Canonical care-only rendering, shared by server and browser verification. */
export function urgentCareDirective(disposition: string, patientMessage: string, transport?: ReviewedEmergencyTransport): string | null {
  if (disposition === "SAME_DAY_IN_PERSON") return "An in-person assessment is recommended today; do not wait for an asynchronous reply.";
  if (disposition !== "EMERGENCY_NOW") return null;
  if (transport?.mode === "continue_ems") return CONTINUE_EMS_DIRECTIVE;
  return (transport ? transport.mode === "activate_ems" : hasUnconditional911Opening(patientMessage))
    ? "Call 911 now. Do not drive yourself or wait for a message reply."
    : "Seek emergency department assessment now. Do not wait for a message reply; call 911 if you cannot travel safely.";
}
export function boundEmergencyTransport(value: ReviewedEmergencyTransport | undefined, directive: string, patientMessage?: string): boolean {
  return Boolean(value && value.review === "independent_model" && value.directive === directive &&
    (value.mode === "continue_ems" ? typeof value.activationQuote === "string" && value.activationQuote.trim().length >= 3 && (patientMessage === undefined || patientMessage.includes(value.activationQuote)) : ["activate_ems", "ed_now"].includes(value.mode) && value.activationQuote === null));
}
type TransportCare = { disposition: string; directive: string; emergencyTransport?: ReviewedEmergencyTransport };
export function reducesEmergencyTransport(from: TransportCare | null, to: TransportCare | null): boolean {
  const ems = (care: TransportCare) => boundEmergencyTransport(care.emergencyTransport, care.directive)
    ? care.emergencyTransport!.mode !== "ed_now" : isEmsInstruction(care.directive);
  return Boolean(from?.disposition === "EMERGENCY_NOW" && to?.disposition === "EMERGENCY_NOW" && ems(from) && !ems(to));
}

export const CARE_SETTING_POLICY = `CARE SETTING IS NOT THE SAME AS REVIEW SPEED.
ASYNC_PHYSICIAN means a clinician can initially assess the thread remotely, including history, medication reconciliation and refill eligibility. That review can be needed today. It does not approve a prescription or promise a completed handoff.
SAME_DAY_IN_PERSON means reported clinical features already justify a physical examination, testing or treatment that cannot reasonably be provided in the messaging thread today. State that specific need. A refill request, unknown contraindication history, missing routine blood pressure, or inability of this AI to prescribe does not by itself establish that need.
A potentially useful examination is not automatically an examination required TODAY. Identify the reported feature making delay for prompt clinician messaging assessment inappropriate; inability to examine through chat and unasked history alone do not establish that urgency. For hand tingling, neither needing sensory/reflex testing eventually nor unknown onset/risk factors alone mandates physical care today. Assess onset and associated features without declaring an unasked stroke screen negative.
EMERGENCY_NOW means immediate emergency care, not a same-day appointment. New time-critical symptoms override a refill request. Missing history is unknown, never a denial; missing information is also not automatically an abnormal finding.
For an established treatment renewal with the patient's usual unchanged symptom pattern, clinician-led asynchronous review is the initial channel unless reported features justify in-person care. A clinician can check diagnosis, prior response, dose/use frequency, interactions, pregnancy and contraindications before deciding whether to renew or arrange an examination. Do not require all prescribing checks before routing to that clinician.
For migraine, a usual unchanged attack and triptan refill do not alone mandate an in-person visit. New thunderclap onset, neurological deficit, concerning fever/neck stiffness, significant trauma or other concerning context can change urgency. Do not generalize a label's evaluation requirement for a specified risk group to every refill, or assume unknown risk factors are present. Do not assume all refills are benign: withdrawal, severe symptoms and time-sensitive interruption still require independent assessment. Differences in care setting must be justified by the patient context, not by the word 'refill'.`;
