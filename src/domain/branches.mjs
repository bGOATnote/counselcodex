import { classifyIntent, checkRedFlags } from "./rules.mjs";
import { EMERGENCY_NOW } from "./constants.mjs";
import { guidelineFor } from "./policy.mjs";
import { assertContextOnlyRetrieval } from "./retrieval-contract.mjs";

export async function runEmergencyBranch(message, checker = checkRedFlags) {
  try {
    return await checker(message);
  } catch (error) {
    return {
      status: "degraded",
      fired: true,
      name: "safety_system_failure",
      disposition: EMERGENCY_NOW,
      subtype: "safety_system_failure",
      evidence: [],
      directive: "The automated safety check could not complete. Route this message for immediate human safety review; do not send self-care guidance.",
      errorCode: "EMERGENCY_CHECK_UNAVAILABLE",
    };
  }
}

export async function runIntentBranch(message, classifier = classifyIntent, retriever = guidelineFor) {
  try {
    const detail = await classifier(message);
    return {
      status: "ok",
      ...detail,
      questions: [],
      guideline: assertContextOnlyRetrieval(await retriever(detail.intent)),
    };
  } catch {
    return {
      status: "degraded",
      intent: "clinical",
      phenotype: null,
      subtype: null,
      evidence: [],
      questions: [],
      guideline: guidelineFor("clinical"),
      errorCode: "INTENT_CHECK_UNAVAILABLE",
    };
  }
}
