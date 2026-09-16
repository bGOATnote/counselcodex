import "server-only";
import { createV0Handler } from "@/lib/v0-handler";
import { getDispositionRuntime } from "../../../../../src/disposition/runtime.ts";
import type { DispositionRun, ResponseEvent } from "../../../../../src/disposition/contract.ts";
import { after } from "next/server";
import { getResponseReview } from "@/lib/response-review";
import { EXECUTION_POLICY } from "../../../../../src/disposition/execution-policy.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createV0Handler<DispositionRun, ResponseEvent>(async (message, notify, signal, reference) => {
    // The router ends at a recommendation. Queue delivery, acceptance and
    // follow-up are integration stubs, not simulated care operations.
    const result = await getDispositionRuntime("manual-gui").assess(message, undefined, notify, signal, reference);
    // Independent grading starts AFTER the response stream closes. Neither its
    // provider latency nor its verdict can block/rewrite issued care guidance.
    after(async () => {
      try { const review = getResponseReview(); review.enqueue(result); await review.process(result.runId); }
      catch { /* assessment remains available; UI offers explicit recovery */ }
    });
    return result;
}, { stream: true, eventType: "response_event", cancelOnDisconnect: true, heartbeatMs: EXECUTION_POLICY.heartbeatMs });
