import { Agent } from "@mastra/core/agent";
import { CLAIM_JUDGE_INSTRUCTIONS, judgmentSchema, evaluateClaimJudgment, validateClaimPacket, type ClaimPacket } from "./claims.ts";
import { abortable } from "../disposition/transport.ts";

// Explicit retrospective invocation only; never imported into the patient path.
// No provider call is possible without a caller-supplied budget reservation.
export function createEvidenceJudge(model = "openai/gpt-6-astra") {
  return new Agent({ id: "evidence-claim-judge", name: "Independent evidence auditor", model, instructions: CLAIM_JUDGE_INSTRUCTIONS, maxRetries: 0 });
}
export async function judgeEvidence(packet: ClaimPacket, options: { model: string; reserve: () => void; signal: AbortSignal; calibrationId?: string; generate?: (prompt: string, signal: AbortSignal) => Promise<{ object: unknown; usage?: unknown }> }) {
  const frozenPacket = structuredClone(packet);
  validateClaimPacket(frozenPacket);
  if (!/^(openai|anthropic|google)\/[^/]+$/.test(options.model) || !/^(openai|anthropic|google)\/[^/]+$/.test(frozenPacket.generationModel) || frozenPacket.generationModel.split("/")[0] === options.model.split("/")[0]) throw new Error("INDEPENDENT_JUDGE_REQUIRED");
  const prompt = JSON.stringify(frozenPacket);
  if (Buffer.byteLength(prompt) > 70_000) throw new Error("JUDGE_PACKET_TOO_LARGE");
  options.signal.throwIfAborted(); options.reserve();
  const signal = AbortSignal.any([options.signal, AbortSignal.timeout(30_000)]);
  // Construct from the recorded model: a caller cannot attach another vendor's
  // label to an arbitrary Agent instance. Injection is explicitly simulated.
  // Bound our wait even if a transport ignores abort. Cancellation cannot prove
  // that remote execution/billing stopped; the consumed reservation remains.
  const response = await abortable<{ object: unknown; usage?: unknown }>(() => options.generate ? options.generate(prompt, signal) : createEvidenceJudge(options.model).generate(prompt, {
    abortSignal: signal, maxSteps: 1,
    modelSettings: { maxRetries: 0, maxOutputTokens: 5000 },
    structuredOutput: { schema: judgmentSchema, errorStrategy: "strict" },
    tracingOptions: { hideInput: true, hideOutput: true, tags: ["retrospective-evidence", "not-clinical-approval"] },
  }), signal);
  return { ...evaluateClaimJudgment(frozenPacket, response.object, options.model, options.calibrationId ?? null), execution: options.generate ? "simulated" : "provider", usage: response.usage ?? null };
}
