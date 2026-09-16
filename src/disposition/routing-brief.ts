/** Isolated producer experiment. Not imported by V25 or a patient-facing route.
 * A routing brief is not a completed clinical response or prescribing approval. */
import { z } from "zod";
import { draftSchema, wireDraftSchema } from "./graph-output.ts";
import { GRAPH_INSTRUCTIONS } from "./graph-prompts.ts";
import { routingFieldsValid, operationalRoute } from "./routing-policy.ts";
import { CONTINUE_EMS_DIRECTIVE, reducesEmergencyTransport } from "./care-setting.ts";
import type { SafetyNotice } from "./contract.ts";

export const ROUTING_BRIEF_VERSION = "routing-brief/v1";
export const routingBriefSchema = draftSchema.pick({ disposition: true, reviewPriority: true, workType: true,
  transportIntent: true, reason: true, redFlags: true, citations: true, evidenceLimitations: true }).extend({
  reason: z.string().min(12).max(450),
  redFlags: draftSchema.shape.redFlags.max(4),
  citations: draftSchema.shape.citations.max(2),
  evidenceLimitations: z.string().min(8).max(350),
}).strict();
export const wireRoutingBriefSchema = routingBriefSchema.extend({ citations: wireDraftSchema.shape.citations.max(2) });
export type RoutingBrief = z.infer<typeof routingBriefSchema>;

/** Exact patient-span identity only. A matching quotation does not establish
 * attribution, negation, clinical interpretation, or completeness of findings. */
export function patientBasisIdentity(findings: RoutingBrief["redFlags"], patient: string): boolean {
  return findings.every(finding => finding.status === "unknown" && finding.quote === ""
    || finding.quote.trim().length > 0 && patient.includes(finding.quote));
}

// Keep the original patient-boundary and routing policy verbatim. Only OUTPUT
// responsibilities change; the experiment does not quietly amend clinical policy.
const boundary = GRAPH_INSTRUCTIONS.disposition.split("OUTPUT:");
if (boundary.length !== 2) throw new Error("DISPOSITION_OUTPUT_BOUNDARY_CHANGED");
export const ROUTING_BRIEF_INSTRUCTIONS = `${boundary[0]}OUTPUT: Return a clinician-facing routing brief, not a complete patient response. Choose the care setting/priority and transport from the original patient facts. In reason, give one short sentence naming the reported need and, when needed, the specific clinician task or physical capability. Do not generate treatment advice, a differential, a separate vital-sign narrative, questions, or promises about sending, booking, clinician acceptance or response time. The application owns operational wording; a route proposal is not an executed handoff.
Use redFlags for up to four DECISION-RELEVANT findings only: reported, specifically denied or unknown, with exact original patient quotes (empty quote permitted only for unknown). This is not an exhaustive checklist and absence from the list is not clinical clearance. State a decision-critical missing measurement in an unknown finding rather than inventing normal physiology.
EVIDENCE: Cite up to two supplied passageId + quoteId pairs supporting material clinical reasoning. Each claim must fit the selected quote and patient applicability; preserve qualifiers and limitations. A source title or matching topic does not prove the proposed setting or timing. Compiled summaries are not primary guidelines. Do not cite sources for patient facts or internal queue policy. EvidenceLimitations briefly identifies missing support or applicability uncertainty. If no supplied passage supports the material claim, return citations=[] and explicitly state the gap; never invent a citation. No numerical risk estimates. No independent judge runs and no clinical approval is implied. Return only the schema.`;

type RouteFields = Pick<RoutingBrief, "disposition" | "reviewPriority" | "workType" | "transportIntent">;
const acuity = { SELF_CARE: 0, ASYNC_PHYSICIAN: 1, SAME_DAY_IN_PERSON: 2, EMERGENCY_NOW: 3 };
/** SAME typed-routing checks for both study arms. No interpretation of clinical
 * correctness, source entailment, patient denials or transport appropriateness. */
export function checkRoutingProposal(draft: RouteFields, patient: string, issued: SafetyNotice[]) {
  const failures: string[] = [];
  if (!routingFieldsValid(draft)) failures.push("routing_fields_invalid");
  let directive = "";
  const transport = draft.transportIntent;
  if (draft.disposition === "EMERGENCY_NOW") {
    if (!transport) failures.push("emergency_transport_missing");
    else if (transport.mode === "continue_ems") {
      if (!transport.activationQuote || !patient.includes(transport.activationQuote)
        || !issued.some(n => n.directive === CONTINUE_EMS_DIRECTIVE)) failures.push("active_ems_not_bound");
      directive = CONTINUE_EMS_DIRECTIVE;
    } else {
      if (transport.activationQuote !== null) failures.push("unexpected_activation_quote");
      directive = transport.mode === "activate_ems" ? "Call 911 now." : "Go to the emergency department now.";
    }
  } else if (transport !== null) failures.push("nonemergency_transport");
  const earlyFinalDisagreement = issued.length ? issued.some(n => n.disposition !== draft.disposition) : null;
  const lowerThanIssued = issued.some(n => acuity[draft.disposition] < acuity[n.disposition]
    || reducesEmergencyTransport(n, { disposition: draft.disposition, directive }));
  if (lowerThanIssued) failures.push("issued_care_conflict");
  return { route: operationalRoute(draft), failures, eligibleRoutingProposal: failures.length === 0,
    earlyFinalDisagreement, lowerThanIssued, patientAdvicePublished: false, clinicalApproval: false };
}
