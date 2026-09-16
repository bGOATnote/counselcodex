/** Read-only diagnostics, never an admission path or a replacement score.
 * A typed route may exist in a rejected response. Inspecting those unchanged
 * fields does not repair that response, publish care, or validate clinical truth. */
import { draftSchema, wireDraftSchema } from "../disposition/graph-output.ts";
import { routingBriefSchema, wireRoutingBriefSchema, checkRoutingProposal, patientBasisIdentity } from "../disposition/routing-brief.ts";
import { resolveSourceQuoteReferences } from "../disposition/source-quote-refs.ts";
import type { SafetyNotice } from "../disposition/contract.ts";

export const ROUTING_BRIEF_FAILURE_AUDIT = "routing-brief-failure-diagnostic/v1";
const coreFields = ["disposition", "reviewPriority", "workType", "transportIntent"] as const;
const coreSchema = routingBriefSchema.pick({ disposition: true, reviewPriority: true, workType: true, transportIntent: true })
  .extend({ transportIntent: routingBriefSchema.shape.transportIntent.removeDefault() }).strict();
const object = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const own = (v: Record<string, unknown> | null, key: string) => v && Object.hasOwn(v, key) ? v[key] : null;

export function auditRoutingBriefFailure(input: {
  arm: "full" | "brief";
  contract?: "full" | "brief";
  patient: string;
  issued: SafetyNotice[];
  sources: { id: string; text: string }[];
  execution: { output?: unknown; failure?: string | null } | null;
  evaluation: unknown;
}) {
  const stored = object(input.evaluation), raw = object(input.execution?.output);
  const wireSchema = (input.contract ?? input.arm) === "full" ? wireDraftSchema : wireRoutingBriefSchema;
  const wire = wireSchema.safeParse(input.execution?.output);
  const coreValues = Object.fromEntries(coreFields.map(key => [key, raw?.[key]]));
  const core = coreSchema.safeParse(coreValues);
  const checked = core.success ? checkRoutingProposal(core.data, input.patient, input.issued) : null;
  const dispositionPresent = draftSchema.shape.disposition.safeParse(raw?.disposition).success;
  const flags = Array.isArray(raw?.redFlags) ? raw.redFlags : null;
  const flagChecks = flags?.map((value, index) => {
    const parsed = draftSchema.shape.redFlags.element.safeParse(value);
    return { index, schemaValid: parsed.success,
      schemaIssues: parsed.success ? [] : parsed.error.issues,
      exactPatientSpan: parsed.success ? patientBasisIdentity([parsed.data], input.patient) : null,
      finding: value };
  }) ?? [];
  const basisIdentity = flags === null || flagChecks.some(f => !f.schemaValid) ? null : flagChecks.every(f => f.exactPatientSpan);
  const citations = Array.isArray(raw?.citations) ? raw.citations : null;
  const references = citations?.map((value, index) => {
    const citation = object(value);
    const reference = wireDraftSchema.shape.citations.element.pick({ passageId: true, quoteId: true }).safeParse({
      passageId: citation?.passageId, quoteId: citation?.quoteId,
    });
    if (!reference.success) return { index, status: "invalid_reference_fields" as const,
      issues: reference.error.issues, passageId: own(citation, "passageId"), quoteId: own(citation, "quoteId"), quote: null };
    try {
      const resolved = resolveSourceQuoteReferences({ citations: [reference.data] }, input.sources).citations[0];
      return { index, status: "exact_quote_bound" as const, issues: [],
        passageId: reference.data.passageId, quoteId: reference.data.quoteId, quote: resolved.quote };
    } catch (error) {
      return { index, status: "unbound_reference" as const, issues: [],
        passageId: reference.data.passageId, quoteId: reference.data.quoteId, quote: null,
        failure: error instanceof Error ? error.message : "QUOTE_REFERENCE_FAILED" };
    }
  }) ?? [];
  const issues = wire.success ? [] : wire.error.issues;
  const transport = object(raw?.transportIntent);
  const activationQuoteMisuse = Boolean(transport && ["activate_ems", "ed_now"].includes(String(transport.mode))
    && Object.hasOwn(transport, "activationQuote") && transport.activationQuote !== null);
  const categories: string[] = [];
  if (input.execution?.failure) categories.push("provider_failure");
  if (!raw) categories.push("raw_output_unavailable");
  else {
    if (!dispositionPresent) categories.push("route_disposition_missing_or_invalid");
    if (!core.success) categories.push("typed_core_schema_failure");
    if (issues.some(i => i.path[0] === "citations")) categories.push("citation_serialization_failure");
    if (issues.some(i => ![...coreFields, "citations"].includes(String(i.path[0]) as typeof coreFields[number] | "citations"))) categories.push("auxiliary_serialization_failure");
    if (references.some(r => r.status !== "exact_quote_bound")) categories.push("citation_reference_failure");
    if (activationQuoteMisuse) categories.push("activation_quote_used_outside_continue_ems");
    if (basisIdentity === false) categories.push("exact_patient_basis_identity_failure");
    if (checked?.lowerThanIssued) categories.push("issued_care_reduction");
  }
  return {
    protocol: ROUTING_BRIEF_FAILURE_AUDIT, arm: input.arm,
    original: {
      evaluationPresent: stored !== null, providerFailure: input.execution?.failure ?? null,
      storedFailure: own(stored, "failure"), storedError: own(stored, "error"),
      storedEligibleRoutingProposal: own(stored, "eligibleRoutingProposal"),
      storedProposal: own(stored, "proposal"), storedBasisIdentity: own(stored, "basisIdentity"),
    },
    categories, rawOutputAvailable: raw !== null, rawDispositionPresent: dispositionPresent,
    wireSchema: { valid: wire.success, issues },
    hypotheticalTypedCore: {
      interpretation: "Diagnostic inspection of unchanged raw routing fields while ignoring auxiliary-field validation. NOT restored eligibility or a clinical release.",
      fields: coreValues, fieldPresence: Object.fromEntries(coreFields.map(key => [key, Boolean(raw && Object.hasOwn(raw, key))])),
      schemaValid: core.success, schemaIssues: core.success ? [] : core.error.issues,
      route: checked?.route ?? null, failures: checked?.failures ?? [],
      passesTypedCoreOnly: checked?.eligibleRoutingProposal ?? false,
      earlyFinalDisagreement: checked?.earlyFinalDisagreement ?? null,
      issuedCareReductionBlocked: checked?.lowerThanIssued ?? null,
      valuesChanged: false, clinicalApproval: false,
    },
    patientBasis: { identity: basisIdentity, findings: flagChecks,
      interpretation: "Exact span membership only; not attribution, negation, completeness, or clinical correctness." },
    citationReferences: { count: citations?.length ?? null, references,
      claimSupport: "not_assessed", applicability: "not_assessed" },
    unsafe_advice: "not_assessed", unsupported_claims: "not_assessed", clinicalApproval: false,
    patientAdvicePublished: false, originalEligibilityChanged: false, originalScoresChanged: false,
  };
}
