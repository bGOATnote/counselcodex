import { executeV0Demo } from "../../../src/mastra/v0-demo.ts";
import { dataset, evaluationCases } from "./cases.ts";
import { evidenceForCase } from "./clinical-evidence.ts";
import type { V0Run } from "./v0-contract.ts";

export async function runV0Message(message: string): Promise<V0Run> {
  const result = await executeV0Demo(message);
  // Exact-message match only: edits must never inherit a case's curated DDx.
  const matched = evaluationCases.find((item) => item.message === message);
  return { ...result, matchedCaseId: matched?.id ?? null, clinicalEvidence: matched ? evidenceForCase(matched.id, dataset.sourceHash, message) : null };
}
