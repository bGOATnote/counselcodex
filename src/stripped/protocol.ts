import { createHash } from "node:crypto";
import type { DispositionResult } from "./contract.ts";

// Frozen low-effort three-bucket protocol. Keep these bytes and the provider
// request unchanged; GUI presentation and traces belong outside this module.
export const SYSTEM_PROMPT = `Choose exactly one bucket for the patient message:
1. SELF_CARE
2. ASYNC_PHYSICIAN
3. URGENT_ESCALATION

Medication refill → ASYNC_PHYSICIAN unless clear emergency/same-day red flags → URGENT_ESCALATION.
Return only JSON with "disposition" (one exact bucket name) and "rationale" (short).`;

export const PROTOCOL = Object.freeze({
  model: "claude-fable-5-1" as const,
  effort: "low" as const,
  promptSHA256: createHash("sha256").update(SYSTEM_PROMPT).digest("hex"),
});

const BUCKETS = ["SELF_CARE", "ASYNC_PHYSICIAN", "URGENT_ESCALATION"];

export function buildRequest(message: string) {
  if (typeof message !== "string" || !message.trim()) throw new Error("Missing patient message");
  return {
    model: PROTOCOL.model,
    max_tokens: 4096,
    thinking: { type: "adaptive" as const },
    output_config: { effort: PROTOCOL.effort },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user" as const, content: message }],
  };
}

export function parseDisposition(response: unknown): DispositionResult {
  // The cast changes no runtime behavior: this is the experiment's exact
  // parser, including its rejection of malformed content and extra fields.
  const raw = response as { stop_reason?: unknown; content?: { type?: unknown; text?: unknown }[] } | null | undefined;
  if (raw?.stop_reason !== "end_turn") throw new Error(`Incomplete provider response: ${raw?.stop_reason}`);
  const text = (raw.content ?? []).filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
  const parsed = JSON.parse(text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```$/, ""));
  if (!BUCKETS.includes(parsed?.disposition)) throw new Error("Invalid three-bucket disposition");
  if (typeof parsed.rationale !== "string" || !parsed.rationale.trim()) throw new Error("Missing short rationale");
  if (Object.keys(parsed).sort().join(",") !== "disposition,rationale") throw new Error("Unexpected output field");
  return parsed;
}
