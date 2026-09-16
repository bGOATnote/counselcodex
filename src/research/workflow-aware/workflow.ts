/** A research-only fixed Mastra graph. It is never registered in the live application. */
import assert from "node:assert/strict";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import type { RawResponse, Transport, TransportInput } from "./transport.ts";

export function createResearchWorkflow(transport: Transport) {
  const schema = z.object({ model: z.enum(["fable", "nano"]), body: z.record(z.string(), z.unknown()), timeoutMs: z.number().int().positive().max(300_000) }).strict();
  const step = createStep({ id: "one-native-decision-call", inputSchema: schema, outputSchema: z.custom<RawResponse>(), retries: 0,
    execute: async ({ inputData }) => transport(inputData) });
  return createWorkflow({ id: "workflow-aware-disposition-research", inputSchema: schema, outputSchema: z.custom<RawResponse>(), retryConfig: { attempts: 0 } }).then(step).commit();
}

export async function executeOneCall(input: TransportInput, transport: Transport, runId: string): Promise<RawResponse> {
  let calls = 0;
  const workflow = createResearchWorkflow(async request => { assert.equal(++calls, 1, "More than one transport call attempted"); return transport(request); });
  const run = await workflow.createRun({ runId, disableScorers: true });
  const execution = await run.start({ inputData: input, tracingOptions: { hideInput: true, hideOutput: true } });
  assert.equal(execution.status, "success", "Research workflow failed; the started job must not be retried");
  assert.equal(calls, 1, "Research workflow did not issue exactly one call");
  if (execution.status !== "success") throw new Error("Research workflow did not complete");
  return execution.result;
}
