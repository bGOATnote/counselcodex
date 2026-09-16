import { createHash } from "node:crypto";

export type ParentDisposition = "SELF_CARE" | "ASYNC_PHYSICIAN" | "URGENT_ESCALATION";
export type Subdisposition = "SELF_CARE" | "PRIORITY_ASYNC" | "STANDARD_ASYNC" | "SAME_DAY_IN_PERSON" | "EMERGENCY_NOW";
export type SubtypeDecision = { choice: 1 | 2; rationale: string };

// A separate conditional experiment. These prompts never replace the frozen
// three-bucket prompt, and they do not contain reference labels or case examples.
export const STRATIFICATION_PROMPTS = Object.freeze({
  ASYNC_PHYSICIAN: `The fixed care setting for this patient message is asynchronous physician review.
Choose the timing of that review:
1. Needs prompt physician review: a time-sensitive clinician task, including a medication refill or prescribing assessment.
2. Can wait for routine physician review: clinician review is appropriate, with no time-sensitive task apparent.

Keep the assigned care setting. Choose exactly one of these two options.
Return only JSON with "choice" (1 or 2) and "rationale" (short).`,
  URGENT_ESCALATION: `The fixed care setting for this patient message is urgent in-person care.
Choose how soon the patient needs to act:
1. Needs emergency action now: immediate emergency assessment or emergency services; do not wait for a routine same-day appointment.
2. Needs in-person assessment today: same-day care is needed, but immediate emergency action is not indicated by the message.

Keep the assigned care setting. Choose exactly one of these two options.
Return only JSON with "choice" (1 or 2) and "rationale" (short).`,
});
export const STRATIFICATION_SETTINGS = Object.freeze({
  model: "claude-fable-5-1", max_tokens: 4096,
  thinking: { type: "adaptive" as const }, output_config: { effort: "low" as const },
});
export const SUBTYPE_MAP = Object.freeze({
  ASYNC_PHYSICIAN: Object.freeze({ 1: "PRIORITY_ASYNC", 2: "STANDARD_ASYNC" }),
  URGENT_ESCALATION: Object.freeze({ 1: "EMERGENCY_NOW", 2: "SAME_DAY_IN_PERSON" }),
});
export const STRATIFICATION_PROMPT_HASHES = Object.fromEntries(Object.entries(STRATIFICATION_PROMPTS)
  .map(([parent, prompt]) => [parent, createHash("sha256").update(prompt).digest("hex")]));

export function buildRequest({ message, parentDisposition }: { message: string; parentDisposition: ParentDisposition }) {
  if (typeof message !== "string" || !message.trim()) throw new Error("Missing patient message");
  if (parentDisposition !== "ASYNC_PHYSICIAN" && parentDisposition !== "URGENT_ESCALATION") {
    throw new Error("SELF_CARE has no subtype provider call");
  }
  return { ...STRATIFICATION_SETTINGS, system: STRATIFICATION_PROMPTS[parentDisposition], messages: [{ role: "user" as const, content: message }] };
}

export function parseSubdisposition(response: unknown, parentDisposition: ParentDisposition): SubtypeDecision {
  if (parentDisposition !== "ASYNC_PHYSICIAN" && parentDisposition !== "URGENT_ESCALATION") throw new Error("Invalid subtype parent");
  const raw = response as { stop_reason?: unknown; content?: { type?: unknown; text?: unknown }[] } | null;
  if (raw?.stop_reason !== "end_turn") throw new Error("Incomplete subtype response");
  const text = (raw.content ?? []).filter(block => block.type === "text").map(block => block.text).join("\n").trim();
  const parsed = JSON.parse(text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```$/, ""));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
    || Object.keys(parsed).sort().join(",") !== "choice,rationale"
    || ![1, 2].includes(parsed.choice)
    || typeof parsed.rationale !== "string" || !parsed.rationale.trim()) throw new Error("Invalid subtype decision");
  return parsed;
}

export function mapSubdisposition(parentDisposition: ParentDisposition, decision: SubtypeDecision | null): Subdisposition {
  if (parentDisposition === "SELF_CARE") {
    if (decision !== null) throw new Error("SELF_CARE must pass through without a subtype decision");
    return "SELF_CARE";
  }
  if (!Object.hasOwn(SUBTYPE_MAP, parentDisposition) || !decision || ![1, 2].includes(decision.choice)) throw new Error("Invalid subtype mapping");
  return SUBTYPE_MAP[parentDisposition][decision.choice] as Subdisposition;
}
