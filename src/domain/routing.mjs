import {
  ASYNC_PHYSICIAN,
  EMERGENCY_NOW,
  SELF_CARE,
  isEscalatedDisposition,
} from "./constants.mjs";
import { guidelineFor } from "./policy.mjs";
import { assertContextOnlyRetrieval } from "./retrieval-contract.mjs";

export function applyHardGate({ emergency, history }) {
  if (!emergency || typeof emergency.fired !== "boolean") {
    throw new TypeError("hard gate requires a structured emergency result");
  }
  if (emergency.fired) {
    const disposition = isEscalatedDisposition(emergency.disposition)
      ? emergency.disposition
      : EMERGENCY_NOW;
    return {
      locked: true,
      overrideBlocked: true,
      disposition,
      subtype: emergency.subtype ?? "safety_system_failure",
      confidence: emergency.status === "degraded" ? "indeterminate" : "high",
      redFlags: [emergency.name ?? "safety_system_failure"],
      rationale: `Safety routing gate assigned ${disposition} for '${emergency.name ?? "safety_system_failure"}'. ${emergency.directive ?? "Immediate human safety review is required."}`,
      patientDirective: emergency.directive ?? "Seek immediate human safety review.",
      layer: "hard_escalation_gate",
      history,
    };
  }
  return {
    locked: false,
    overrideBlocked: false,
    disposition: null,
    subtype: null,
    confidence: null,
    redFlags: [],
    rationale: null,
    patientDirective: null,
    layer: "gate_clear",
    history,
  };
}

export function routeResidual(input) {
  if (input.locked) return assertDispositionInvariants(input);
  const history = input.history;
  if (!history) {
    return assertDispositionInvariants({
      ...input,
      disposition: ASYNC_PHYSICIAN,
      subtype: "async_safety_fallback",
      confidence: "indeterminate",
      rationale: "Intent processing was unavailable, so the message requires human review.",
      patientDirective: "A physician will review this thread. Seek urgent in-person care if symptoms worsen before they reply.",
      layer: "policy_default",
    });
  }

  let guideline;
  try {
    guideline = assertContextOnlyRetrieval(history.guideline);
  } catch {
    const safeHistory = {
      ...history,
      status: "degraded",
      guideline: guidelineFor("clinical"),
      errorCode: "RETRIEVAL_CONTRACT_VIOLATION",
    };
    return assertDispositionInvariants({
      ...input,
      history: safeHistory,
      disposition: ASYNC_PHYSICIAN,
      subtype: "async_safety_fallback",
      confidence: "indeterminate",
      rationale: "Retrieved context failed its safety contract, so the message requires human review.",
      patientDirective: "A physician will review this thread. Seek urgent in-person care if symptoms worsen before they reply.",
      layer: "policy_default",
    });
  }

  if (history.status === "degraded") {
    return assertDispositionInvariants({
      ...input,
      disposition: ASYNC_PHYSICIAN,
      subtype: "async_safety_fallback",
      confidence: "indeterminate",
      rationale: "Intent processing was unavailable, so the message requires human review.",
      patientDirective: "A physician will review this thread. Seek urgent in-person care if symptoms worsen before they reply.",
      layer: "policy_default",
    });
  }

  const { intent, phenotype, subtype } = history;
  if (["refill", "results", "navigation"].includes(intent)) {
    return assertDispositionInvariants({
      ...input,
      disposition: ASYNC_PHYSICIAN,
      subtype: intent,
      confidence: "high",
      rationale: guideline.summary,
      patientDirective: "A physician will review this request on the asynchronous bench.",
      layer: "intent_router",
    });
  }
  if (intent === "self_care" && phenotype) {
    return assertDispositionInvariants({
      ...input,
      disposition: SELF_CARE,
      subtype,
      confidence: "high",
      rationale: `Named low-risk phenotype matched: ${phenotype}. ${guideline.summary}`,
      patientDirective: "Home care is reasonable. Seek in-person care if symptoms worsen, severe symptoms develop, or recovery is not as expected.",
      layer: "self_care_router",
    });
  }
  return assertDispositionInvariants({
    ...input,
    disposition: ASYNC_PHYSICIAN,
    subtype: "async_default",
    confidence: "medium",
    rationale: guideline.summary,
    patientDirective: "A physician will review this thread. Seek in-person care if symptoms rapidly worsen before they reply.",
    layer: "policy_default",
  });
}

export function assertDispositionInvariants(result) {
  const escalated = isEscalatedDisposition(result.disposition);
  if (result.locked !== result.overrideBlocked) throw new Error("locked and overrideBlocked must agree");
  if (result.locked !== escalated) throw new Error("only same-day or emergency dispositions may be locked");
  if (escalated && result.layer !== "hard_escalation_gate") throw new Error("escalated disposition must originate at the hard gate");
  if (!escalated && result.layer === "hard_escalation_gate") throw new Error("hard gate output must be escalated");
  return result;
}
