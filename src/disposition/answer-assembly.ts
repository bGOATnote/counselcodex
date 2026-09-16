import type { DispositionAnswer } from "./contract.ts";
import { hasImmediateEmsDirective } from "./contract.ts";
import { emergencyDirective } from "./workflow.ts";
import { SAME_DAY_DIRECTIVE } from "./progressive.ts";
import { asyncAction } from "./routing-policy.ts";

/** Explicit action is an application-owned rendering of the model's route,
 * not another clinical prediction. The unchanged model output remains logged.
 */
export function assembleCareAction(answer: DispositionAnswer, requiredAction: string | null): DispositionAnswer {
  // Do not prepend a new conditional-911 instruction to an already explicit
  // emergency-now choice. Transport disagreements are reviewed separately;
  // this renderer must not manufacture one or infer a safer transport option.
  const explicitEmergencyChoice = /^(?:please\s+)?call\s+911\s+or\s+(?:go to|get to)\s+(?:(?:an?|the nearest)\s+)?emergency department\s+now[.!]/i.test(answer.patientMessage.trim());
  const action = answer.disposition === "ASYNC_PHYSICIAN" ? asyncAction(answer)
    : answer.disposition === "SAME_DAY_IN_PERSON" ? SAME_DAY_DIRECTIVE
    : answer.disposition === "EMERGENCY_NOW" ? requiredAction ?? (explicitEmergencyChoice ? null : emergencyDirective(hasImmediateEmsDirective(answer.patientMessage))) : null;
  if (!action || answer.patientMessage.startsWith(action)) return answer;
  return { ...answer, patientMessage: `${action}\n\n${answer.patientMessage}` };
}

/** Recover only whitespace drift introduced when copying source text. Case,
 * punctuation, digits and all non-whitespace characters must match. Return the
 * original substring, never a reconstructed or semantically repaired quote.
 */
export function exactSourceSubstring(text: string, quote: string): string | null {
  if (text.includes(quote)) return quote;
  const offsets: number[] = [];
  let compact = "";
  for (let i = 0; i < text.length; i++) if (!/\s/.test(text[i])) { compact += text[i]; offsets.push(i); }
  const target = quote.replace(/\s/g, "");
  if (target.length < 10) return null;
  const at = compact.indexOf(target);
  return at < 0 ? null : text.slice(offsets[at], offsets[at + target.length - 1] + 1);
}
