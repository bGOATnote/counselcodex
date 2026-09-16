import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, openSync, writeFileSync, fsyncSync, closeSync } from "node:fs";
import { join } from "node:path";
import { Agent } from "@mastra/core/agent";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { Mastra } from "@mastra/core/mastra";
import { noopLogger } from "@mastra/core/logger";
import { LibSQLStore } from "@mastra/libsql";
import { Observability, MastraStorageExporter } from "@mastra/observability";
import { z } from "zod";
import { consumeStructuredStream, persistTraceWithinDeadline } from "../disposition/transport.ts";
import { EXECUTION_POLICY, requestDeadline } from "../disposition/execution-policy.ts";
import { evaluateReview, judgmentSchema, packetSchema, REVIEW_INSTRUCTIONS, REVIEW_MODEL, validateReviewPacket, type ReviewPacket, type ClinicalReview } from "./response-review.ts";

export const REVIEW_PROMPT_HASH = createHash("sha256").update(REVIEW_INSTRUCTIONS).digest("hex");
export type ReviewExecution = { review: ClinicalReview; promptHash?: string; workflowRunId: string; traceId: string; tracePersisted: boolean; durationMs: number; usage: { inputTokens: number | null; outputTokens: number | null }; estimatedUsd: number | null };
export function createResponseReviewer(directory: string) {
  const attemptsDirectory = join(directory, "attempts"); mkdirSync(attemptsDirectory, { recursive: true, mode: 0o700 });
  const record = (name: string, value: unknown) => { const fd = openSync(join(attemptsDirectory, name), "wx", 0o600); try { writeFileSync(fd, JSON.stringify(value)); fsyncSync(fd); } finally { closeSync(fd); } };
  const agent = new Agent({ id: "independent-response-auditor", name: "Independent response auditor", model: REVIEW_MODEL, instructions: REVIEW_INSTRUCTIONS, maxRetries: 0 });
  const auditStep = createStep({
    id: "grade-issued-response", inputSchema: packetSchema, outputSchema: z.custom<{ review: ClinicalReview; usage: ReviewExecution["usage"] }>(),
    execute: async ({ inputData, tracingContext }) => {
      validateReviewPacket(inputData);
      const attemptId = randomUUID();
      record(`${attemptId}-started.json`, { runId: inputData.runId, packetHash: inputData.packetHash, model: REVIEW_MODEL, promptHash: REVIEW_PROMPT_HASH, executionPolicy: EXECUTION_POLICY, at: new Date().toISOString() });
      const deadline = requestDeadline(new AbortController().signal, EXECUTION_POLICY.reviewTimeoutMs);
      let result;
      try {
        result = await consumeStructuredStream({ signal: deadline.signal, start: signal => agent.stream(JSON.stringify(inputData), {
          abortSignal: signal, tracingContext, maxSteps: 1, modelSettings: { maxRetries: 0, maxOutputTokens: 6000 },
          structuredOutput: { schema: judgmentSchema, errorStrategy: "strict" },
          tracingOptions: { hideInput: true, hideOutput: true, tags: ["independent-review", "not-clinical-approval"] },
        }) });
      } finally { deadline.dispose(); }
      // Preserve malformed judge outputs and usage before contract validation.
      // Never expose unvalidated judgments in the UI or raw provider errors.
      record(`${attemptId}-output.json`, { runId: inputData.runId, packetHash: inputData.packetHash, object: result.output, usage: result.usage, failure: result.failure, streamProgress: result.streamProgress, durationMs: result.durationMs, at: new Date().toISOString() });
      if (result.failure) throw new Error(result.failure);
      return { review: evaluateReview(inputData, result.output), usage: result.usage };
    },
  });
  const workflow = createWorkflow({ id: "independent-response-review", inputSchema: packetSchema, outputSchema: auditStep.outputSchema }).then(auditStep).commit();
  const storage = new LibSQLStore({ id: "response-review-storage", url: `file:${join(directory, "traces.db")}` });
  const observability = new Observability({ configs: { default: { serviceName: "counsel-independent-review", exporters: [new MastraStorageExporter({ customSpanFormatter: span => ({ ...span, input: undefined, output: undefined, errorInfo: span.errorInfo ? { message: "REDACTED_REVIEW_ERROR" } : undefined }) })], includeInternalSpans: false, logging: { enabled: false } } } });
  const mastra = new Mastra({ agents: { responseAuditor: agent }, workflows: { responseReview: workflow }, storage, observability, logger: noopLogger });
  return async (packet: ReviewPacket): Promise<ReviewExecution> => {
    validateReviewPacket(packet);
    const started = performance.now();
    const run = await mastra.getWorkflow("responseReview").createRun();
    const traceId = randomBytes(16).toString("hex");
    const result = await run.start({ inputData: packet, tracingOptions: { traceId, hideInput: true, hideOutput: true, tags: ["independent-review", packet.runId] } });
    if (result.status !== "success") throw new Error("REVIEW_EXECUTION_FAILED");
    const persisted = await persistTraceWithinDeadline({ flush: () => observability.flush(), verify: async () => Boolean(await (await storage.getStore("observability"))?.getTrace({ traceId })) });
    const { review, usage } = result.result;
    return { review, usage, promptHash: REVIEW_PROMPT_HASH, workflowRunId: run.runId, traceId, tracePersisted: persisted.persisted, durationMs: Math.round(performance.now() - started),
      estimatedUsd: usage.inputTokens === null || usage.outputTokens === null ? null : (usage.inputTokens * 10 + usage.outputTokens * 50) / 1_000_000 };
  };
}
