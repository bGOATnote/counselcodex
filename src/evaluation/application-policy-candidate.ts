/** Unpublished, fixed-packet candidate. No live-path import or gold input.
 * Source rules constrain citation use; they do not choose a disposition. */
import { z } from "zod";
import { draftSchema, wireDraftSchema } from "../disposition/graph-output.ts";
import type { Hit } from "../evidence/rag/model.ts";
import { applicationContractsForHits, applicationSidecar, auditSourceApplications, auditApplicationBindings } from "../evidence/rag/source-application.ts";

export const sourceApplicationSchema = z.object({
  citationIndex: z.number().int().min(0).max(3), ruleId: z.string(),
  use: z.enum(["general_information", "conditional_precaution", "patient_application"]),
  conditions: z.array(z.object({ conditionId: z.string(), state: z.enum(["reported_met", "reported_not_met", "unknown"]),
    patientSpans: z.array(z.object({ start: z.number().int().min(0), end: z.number().int().min(1) }).strict()).max(4),
  }).strict()).max(8),
}).strict();
// Same full clinical fields. The added audit bindings are not patient prose,
// a second producer, a diagnosis, or a change to the frozen V25 wire schema.
const wireSourceApplicationSchema = sourceApplicationSchema.extend({ conditions: z.array(sourceApplicationSchema.shape.conditions.element.omit({ patientSpans: true }).extend({
  patientQuotes: z.array(z.string().min(3).max(600)).max(4),
}).strict()).max(8) });
export const wireApplicationDraftSchema = wireDraftSchema.extend({ sourceApplications: z.array(wireSourceApplicationSchema).max(8).default([]) });
export const applicationDraftSchema = draftSchema.extend({ sourceApplications: z.array(sourceApplicationSchema).max(8).default([]) });
export function resolveApplicationPatientReferences<T extends { sourceApplications: z.infer<typeof wireSourceApplicationSchema>[] }>(wire: T, patient: string) {
  return { ...wire, sourceApplications: wire.sourceApplications.map(application => ({ ...application, conditions: application.conditions.map(condition => {
    const { patientQuotes, ...rest } = condition;
    return { ...rest, patientSpans: patientQuotes.map(quote => {
      const start = patient.indexOf(quote);
      if (start < 0 || patient.indexOf(quote, start + 1) >= 0) throw new Error("APPLICATION_PATIENT_QUOTE_MISSING_OR_AMBIGUOUS");
      return { start, end: start + quote.length };
    }) };
  }) })) };
}

export const APPLICATION_POLICY_VERSION = "disposition-application-policy/v1";
export const GUIDANCE_SCOPE_POLICY = `NECESSARY CLINICIAN TASK: Resolve the actual request, not just the likely diagnosis. General OTC options and verified product-label education can be SELF_CARE; first-person wording, a dose question, or unreported optional history alone does not require a clinician. For an individual product, combination, dose or duration recommendation, establish the applicable product information and decision-relevant warnings before saying it is suitable; do not substitute generic comfort measures for an unanswered treatment decision and call the request complete. If a necessary individualized assessment or treatment decision remains unresolved, name that task for the Counsel clinician: Standard async unless a concrete time-sensitive consequence warrants Priority async. Missing eligibility for one guideline does not itself establish a clinician task, physical-care requirement or emergency; independently decide the least burdensome pathway that can complete the request. Symptom burden and diagnostic thresholds are separate: continued activities do not negate reported symptoms, and not meeting a chronic-disease definition is not a reason to defer otherwise indicated assessment.`;

export const SOURCE_APPLICATION_POLICY = `EVIDENCE: Use usually 1–2 citations from the supplied passages only. Select passageId and quoteId verbatim. Before applying a recommendation, identify its IF conditions (population, diagnosis, examination/test, severity, timeframe and care arrangement); match each necessary condition to the original patient's reported facts, not to the source, generated context or an assumed negative finding. Unmet or unknown prerequisites mean that source does not establish this patient's eligibility. Do not substitute partial function for a complete examination or a diagnostic rule, or infer absence of impairment from continued activities. General education and conditional precautions can still be given, clearly as such, without claiming the patient currently satisfies their conditions. Use symptom-level support when diagnosis-specific eligibility is unresolved.
The sourceApplicationRules sidecar contains engineer-authored, source-hash-bound application constraints, not new clinical evidence or publisher approval. Keep the complete qualifying clause in the selected quote and respect its population. A source category, exact quote, or applicability="uncertain" label cannot justify a contradictory patient-specific claim elsewhere in the response. Set applicability="uncertain" and explain the unresolved condition when appropriate; do not assert that conditional management is established for this patient. Source absence is neither safety nor an automatic escalation. Patient facts and project queue policy do not need invented research citations. Omit unsupported dose, risk, timing or examination claims; preserve the actual unresolved clinician task rather than inventing an answer. Claim support and clinical correctness remain independently assessable; never say the source has been clinically verified by this pipeline.
For each citation to a contracted source, emit sourceApplications with its zero-based citationIndex and ruleId. Distinguish general_information, conditional_precaution and patient_application. Include every contract condition exactly once: unknown with empty patientQuotes when unestablished; otherwise reported_met/reported_not_met and exact, uniquely identifying quotations copied from the original patient. The server binds quote offsets; do not calculate them. A quote is only a report, not a verified examination. Unknown or unmet prerequisites forbid claiming established patient eligibility; do not mark a condition met just to complete the response. No contracted citation means sourceApplications=[]. These bindings do not replace the citation or permit unsupported claims elsewhere.`;

function replaceSection(prompt: string, startLabel: string, endLabel: string, replacement: string) {
  const start = prompt.indexOf(startLabel), end = prompt.indexOf(endLabel, start);
  if (start < 0 || end <= start || prompt.indexOf(startLabel, start + startLabel.length) >= 0) throw new Error("APPLICATION_POLICY_BOUNDARY_CHANGED");
  return prompt.slice(0, start) + replacement + prompt.slice(end);
}
export function applicationPolicyPrompt(baseline: string) {
  const ownership = replaceSection(baseline, "NECESSARY CLINICIAN TASK:", "\nSAFETY-NET LOGIC:", GUIDANCE_SCOPE_POLICY);
  return replaceSection(ownership, "EVIDENCE:", "\nOMIT unnecessary", SOURCE_APPLICATION_POLICY);
}
export function applicationPolicyPacket<T extends object>(packet: T, hits: Hit[]) {
  return { ...packet, sourceApplicationRules: applicationSidecar(applicationContractsForHits(hits)) };
}
export function evaluateApplicationPolicy(draft: z.infer<typeof draftSchema> & { sourceApplications?: z.infer<typeof sourceApplicationSchema>[] }, patient: string, hits: Hit[]) {
  const contracts = applicationContractsForHits(hits);
  const audit = auditSourceApplications({ patient, hits, draft, contracts });
  const bindings = auditApplicationBindings({ patient, hits, contracts, applications: draft.sourceApplications ?? [], citations: draft.citations });
  return { ...audit, status: audit.status === "fail" || bindings.status === "fail" ? "fail" as const : "not_assessed" as const, bindings };
}
