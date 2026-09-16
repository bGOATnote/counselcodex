import { graphJudgeSchema, validateGraphJudge } from "../disposition/clinical-graph.ts";
import type { SafetyNotice } from "../disposition/contract.ts";
import { exactStructuredJudgeAnchor } from "../disposition/judge-anchors.ts";

export type GraphJudgeDiagnosticCode =
  | "SCHEMA_INVALID" | "DUPLICATE_CRITERION" | "MISSING_CRITERION"
  | "ANCHOR_UNIT_DISALLOWED" | "ANCHOR_UNIT_MISSING" | "ANCHOR_QUOTE_MISMATCH"
  | "SOURCE_ANCHOR_QUOTE_MISMATCH" | "CLAIM_PASS_WITHOUT_EVIDENCE" | "CLAIM_PASS_WITHOUT_SOURCE_ANCHOR"
  | "EARLY_ACTION_PRESENCE_MISMATCH" | "EARLY_CORRECTION_MISSING" | "EARLY_CORRECTION_PATIENT_QUOTE_MISMATCH"
  | "ACCEPT_WITH_NONPASS_CRITERION" | "ACCEPT_WITH_UNRESOLVED_EARLY_ACTION";

export type GraphJudgeDiagnostic = {
  code: GraphJudgeDiagnosticCode;
  path: (string | number)[];
  detail: string;
  criterion?: string;
  unit?: string;
  schemaCode?: string;
};

/** Offline contract diagnostics only. No repair, admission, clinical scoring,
 * network, filesystem writes, or patient/source text normalization occurs here.
 * Callers must provide the exact review packet's units and runtime arguments;
 * this helper does NOT verify the packet's patient/draft/execution hash binding.
 * In particular, hasEvidence retains validateGraphJudge's caller semantics
 * (draft citations present), not a new assertion that research is sufficient.
 */
export function diagnoseGraphJudge(
  raw: unknown,
  units: { id: string; text: string }[],
  hasEvidence: boolean,
  notice: SafetyNotice | null,
) {
  const issues: GraphJudgeDiagnostic[] = [];
  const parsed = graphJudgeSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) issues.push({
      code: "SCHEMA_INVALID", path: issue.path.map(part => typeof part === "number" ? part : String(part)),
      schemaCode: issue.code, detail: issue.message,
    });
  } else {
    const j = parsed.data;
    const expected = graphJudgeSchema.shape.criteria.element.shape.id.options;
    const seen = new Set<string>();
    j.criteria.forEach((criterion, i) => {
      if (seen.has(criterion.id)) issues.push({ code: "DUPLICATE_CRITERION", path: ["criteria", i, "id"], criterion: criterion.id, detail: "A criterion ID occurs more than once." });
      seen.add(criterion.id);
      criterion.anchors.forEach((anchor, n) => {
        const path = ["criteria", i, "anchors", n];
        if (!["patient", "draft", "issued_question"].includes(anchor.unit) && !anchor.unit.startsWith("source:")) {
          issues.push({ code: "ANCHOR_UNIT_DISALLOWED", path: [...path, "unit"], criterion: criterion.id, unit: anchor.unit, detail: "This unit cannot support a draft criterion, even if present in the packet." });
        }
        const matchingUnits = units.filter(unit => unit.id === anchor.unit);
        if (!matchingUnits.length) {
          issues.push({ code: "ANCHOR_UNIT_MISSING", path: [...path, "unit"], criterion: criterion.id, unit: anchor.unit, detail: "The named anchor unit is absent from the supplied review packet." });
        } else if (!matchingUnits.some(unit => exactStructuredJudgeAnchor(unit, anchor.quote))) {
          issues.push({ code: anchor.unit.startsWith("source:") ? "SOURCE_ANCHOR_QUOTE_MISMATCH" : "ANCHOR_QUOTE_MISMATCH", path: [...path, "quote"], criterion: criterion.id, unit: anchor.unit, detail: "The exact quote is absent from the named unit. Text in another unit does not satisfy this binding." });
        }
      });
    });
    for (const id of expected) if (!seen.has(id)) issues.push({ code: "MISSING_CRITERION", path: ["criteria"], criterion: id, detail: "A required criterion ID is absent." });
    const researchIndex = j.criteria.findIndex(criterion => criterion.id === "claim_support");
    const research = j.criteria[researchIndex];
    if (research?.verdict === "pass") {
      if (!hasEvidence) issues.push({ code: "CLAIM_PASS_WITHOUT_EVIDENCE", path: ["criteria", researchIndex, "verdict"], criterion: "claim_support", detail: "Claim support passed despite the runtime hasEvidence argument being false." });
      if (!research.anchors.some(anchor => anchor.unit.startsWith("source:"))) issues.push({ code: "CLAIM_PASS_WITHOUT_SOURCE_ANCHOR", path: ["criteria", researchIndex, "anchors"], criterion: "claim_support", detail: "A passing claim-support criterion requires a source-unit anchor." });
    }
    if (Boolean(notice) !== (j.earlyAction !== "none")) issues.push({ code: "EARLY_ACTION_PRESENCE_MISMATCH", path: ["earlyAction"], detail: "The early-action verdict does not match whether an action notice was supplied." });
    if (j.earlyAction === "unsupported") {
      if (!j.earlyCorrection) issues.push({ code: "EARLY_CORRECTION_MISSING", path: ["earlyCorrection"], detail: "An unsupported early action requires a correction record." });
      else j.earlyCorrection.patientQuotes.forEach((quote, i) => {
        // Match the runtime's first patient unit exactly, not a more permissive
        // any-unit search or decoded patient JSON.
        if (!units.find(unit => unit.id === "patient")?.text.includes(quote)) issues.push({ code: "EARLY_CORRECTION_PATIENT_QUOTE_MISMATCH", path: ["earlyCorrection", "patientQuotes", i], unit: "patient", detail: "The correction quote is absent from the original patient unit." });
      });
    }
    if (j.verdict === "accept") {
      j.criteria.forEach((criterion, i) => {
        if (criterion.verdict !== "pass") issues.push({ code: "ACCEPT_WITH_NONPASS_CRITERION", path: ["criteria", i, "verdict"], criterion: criterion.id, detail: "An accept verdict conflicts with a failed or abstained criterion." });
      });
      if (j.earlyAction === "unresolved") issues.push({ code: "ACCEPT_WITH_UNRESOLVED_EARLY_ACTION", path: ["earlyAction"], detail: "An accept verdict cannot leave an issued early action unresolved." });
    }
  }
  // Runtime remains the authority on its contract. Keep a visible parity bit
  // so future validator changes cannot silently turn this diagnostic mirror
  // into a competing admission policy. No validated packet is returned.
  const runtimeContractConformant = validateGraphJudge(raw, units, hasEvidence, notice) !== null;
  return {
    version: "graph-judge-diagnostics/v1" as const,
    diagnosticOnly: true as const,
    clinicalValidation: false as const,
    bindingVerificationPerformed: false as const,
    runtimeContractConformant,
    diagnosticParity: runtimeContractConformant === (issues.length === 0),
    issues,
  };
}
