import type { DispositionResult } from "../../../src/mastra/schemas.ts";
import type { ResponseSafetyReview } from "../../../src/clinical/response-safety.ts";
import type { EvidencePacket } from "./evidence-contract.ts";

export type V0Sample = { id: string; message: string };
export type V0Run = {
  version: "v0-gui/v1";
  runId: string;
  completedAt: string;
  durationMs: number;
  message: string;
  workflowId: "counsel-disposition-v0";
  executionMode: "deterministic_mastra";
  modelCalls: 0;
  route: DispositionResult;
  safetyReview: ResponseSafetyReview;
  steps: { id: string; status: string; durationMs: number | null }[];
  matchedCaseId: string | null;
  clinicalEvidence: EvidencePacket | null;
};

export function currentV0Run(result: V0Run | null, message: string): V0Run | null {
  return result?.message === message ? result : null;
}

export const routePresentation = {
  EMERGENCY_NOW: { title: "Emergency now", timing: "Immediate emergency assessment", tone: "border-[#e4b6ad] bg-[#fff0eb] text-[#8f3028]" },
  SAME_DAY_IN_PERSON: { title: "Same-day in person", timing: "In-person assessment today", tone: "border-[#e4cc94] bg-[#fff6df] text-[#75490b]" },
  ASYNC_PHYSICIAN: { title: "Async physician", timing: "Clinician-owned asynchronous review", tone: "border-[#b7c9df] bg-[#eef3fb] text-[#243866]" },
  SELF_CARE: { title: "Self care", timing: "Guidance and return precautions", tone: "border-[#cbd4b0] bg-[#f0f4e4] text-[#445329]" },
} as const;
