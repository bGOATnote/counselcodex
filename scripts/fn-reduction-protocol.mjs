/** Independent experimental protocol. No clinical runtime or reference imports. */
import { createHash } from "node:crypto";

export const sha256 = value => createHash("sha256").update(value).digest("hex");
export const BASELINE_PROMPT = `Choose exactly one bucket for the patient message:
1. SELF_CARE
2. ASYNC_PHYSICIAN
3. URGENT_ESCALATION

Medication refill → ASYNC_PHYSICIAN unless clear emergency/same-day red flags → URGENT_ESCALATION.
Return only JSON with "disposition" (one exact bucket name) and "rationale" (short).`;
export const CANDIDATE_PARAGRAPH = "Use only findings stated in the message. An unreported finding is unknown, not absent. Choose SELF_CARE only when the supplied information supports no clinician assessment now. If missing information could materially change that decision, choose ASYNC_PHYSICIAN unless reported findings warrant URGENT_ESCALATION. Missing information alone does not establish an emergency.";
export const PROMPTS = Object.freeze({
  baseline: BASELINE_PROMPT,
  candidate: BASELINE_PROMPT.replace("\nReturn only JSON", `\n\n${CANDIDATE_PARAGRAPH}\n\nReturn only JSON`),
});
export const SETTINGS = Object.freeze({ model: "claude-fable-5-1", max_tokens: 4096, thinking: Object.freeze({ type: "adaptive" }), output_config: Object.freeze({ effort: "low" }) });
export const BUCKETS = Object.freeze(["SELF_CARE", "ASYNC_PHYSICIAN", "URGENT_ESCALATION"]);
export function validateMessages(value) {
  if (!Array.isArray(value) || !value.length) throw new Error("Messages must be a nonempty array");
  const ids = new Set();
  for (const row of value) {
    if (!row || Object.keys(row).sort().join(",") !== "id,message") throw new Error("Only id and message are allowed; labels and other metadata are prohibited");
    if (typeof row.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(row.id) || ids.has(row.id)) throw new Error("Invalid or duplicate case ID");
    if (typeof row.message !== "string" || !row.message.trim() || Buffer.byteLength(row.message) > 100_000) throw new Error("Invalid message");
    ids.add(row.id);
  }
  return value;
}
export function buildRequest(message, arm) {
  if (!Object.hasOwn(PROMPTS, arm)) throw new Error("Arm must be baseline or candidate");
  if (typeof message !== "string" || !message.trim()) throw new Error("Missing patient message");
  return { ...SETTINGS, system: PROMPTS[arm], messages: [{ role: "user", content: message }] };
}
export function parseDisposition(response) {
  if (response?.stop_reason !== "end_turn") throw new Error("Incomplete provider response");
  const text = (response.content ?? []).filter(block => block.type === "text").map(block => block.text).join("\n").trim();
  const parsed = JSON.parse(text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```$/, ""));
  if (!BUCKETS.includes(parsed?.disposition)) throw new Error("Invalid three-bucket disposition");
  if (typeof parsed.rationale !== "string" || !parsed.rationale.trim()) throw new Error("Missing short rationale");
  if (Object.keys(parsed).sort().join(",") !== "disposition,rationale") throw new Error("Unexpected output field");
  return parsed;
}
export function reserveUSD(body) {
  // Prospective upper allowance uses byte count rather than an optimistic token estimate.
  return ((Buffer.byteLength(JSON.stringify(body)) + 2048) * 20 + body.max_tokens * 50) / 1e6;
}
export function accountUsage(usage, reservation) {
  const valid = x => Number.isSafeInteger(x) && x >= 0;
  if (!usage || !valid(usage.input_tokens) || !valid(usage.output_tokens) || !valid(usage.cache_creation_input_tokens ?? 0) || !valid(usage.cache_read_input_tokens ?? 0)) return { estimatedUSD: null, accountedUSD: reservation, usageKnown: false };
  const { input_tokens: i, output_tokens: o, cache_creation_input_tokens: w = 0, cache_read_input_tokens: r = 0 } = usage;
  return { estimatedUSD: (i * 10 + o * 50 + w * 20 + r * .25) / 1e6, accountedUSD: ((i + w + r) * 20 + o * 50) / 1e6, usageKnown: true };
}
