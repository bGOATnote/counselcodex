export const SELF_CARE = "SELF_CARE";
export const ASYNC_PHYSICIAN = "ASYNC_PHYSICIAN";
export const SAME_DAY_IN_PERSON = "SAME_DAY_IN_PERSON";
export const EMERGENCY_NOW = "EMERGENCY_NOW";

// The take-home's supplied labels combine both escalated routes. Keep that
// vocabulary at the evidence boundary, never as an operational output.
export const LEGACY_URGENT_ESCALATION = "URGENT_ESCALATION";

export const DISPOSITIONS = Object.freeze([
  SELF_CARE,
  ASYNC_PHYSICIAN,
  SAME_DAY_IN_PERSON,
  EMERGENCY_NOW,
]);

export const ESCALATED_DISPOSITIONS = Object.freeze([
  SAME_DAY_IN_PERSON,
  EMERGENCY_NOW,
]);

export function isEscalatedDisposition(disposition) {
  return ESCALATED_DISPOSITIONS.includes(disposition);
}

export function toLegacyDisposition(disposition) {
  return isEscalatedDisposition(disposition) ? LEGACY_URGENT_ESCALATION : disposition;
}
