import { getClinicalGraphRuntime } from "../../../../../src/disposition/graph-runtime";
import { EXECUTION_POLICY } from "../../../../../src/disposition/execution-policy";
import type { DispositionRun, ResponseEvent } from "../../../../../src/disposition/contract";
import { createV0Handler } from "@/lib/v0-handler";

export const runtime = "nodejs";
export const POST = createV0Handler<DispositionRun, ResponseEvent>(async (message, emit, signal, reference) => {
  // Candidate clarification is nonblocking. Never accept a reference pointing
  // to an incumbent review or a different model's question as patient evidence.
  if (reference) throw new Error("CANDIDATE_REFERENCE_NOT_SUPPORTED");
  return (await getClinicalGraphRuntime()).assess(message, emit, signal);
}, { stream: true, eventType: "response_event", cancelOnDisconnect: true, heartbeatMs: EXECUTION_POLICY.heartbeatMs });
