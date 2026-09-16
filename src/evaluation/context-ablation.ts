/** Offline input ablation; not imported by the live workflow.
 * Retrieval has already run. Removing its model-authored context from the final
 * producer does not remove the original patient or change the evidence packet.
 */
import { sha256 } from "../evidence/rag/model.ts";

export const CONTEXT_ABLATION_PROTOCOL = "fixed-packet-generated-context/v1";
export function contextAblationInputs<T extends {
  patient: string; context: unknown; outputInstructions: string; sources: unknown[];
}>(packet: T) {
  if (Object.keys(packet).sort().join(",") !== "context,outputInstructions,patient,sources"
    || typeof packet.patient !== "string" || typeof packet.outputInstructions !== "string"
    || !Array.isArray(packet.sources)) throw new Error("UNEXPECTED_PRODUCER_INPUT");
  const { context: _context, ...withoutContext } = structuredClone(packet);
  return {
    withContext: structuredClone(packet), withoutContext,
    commonInputHash: sha256(JSON.stringify(withoutContext)),
    removed: ["context.queries", "context.findings", "context.question"],
    interpretation: "One input-field ablation: removes all generated context from the producer, not from retrieval or traces. Same original patient, frozen passages and output instruction. No route reference is supplied.",
  };
}
