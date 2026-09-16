import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { buildRequest, parseDisposition, PROTOCOL } from "./protocol.ts";
import type { StrippedRun } from "./contract.ts";

const WORKFLOW_ID = "stripped-fable-5-1";
const STEP_ID = "one-disposition";
const inputSchema = z.object({ message: z.string().min(1).max(12_000) });
const outputSchema = z.custom<StrippedRun>();

/** One native provider call. Mastra orchestrates; it never rewrites the prompt. */
export function createStrippedWorkflow(options: { apiKey: string; fetch?: typeof fetch }) {
  const fetchProvider = options.fetch ?? fetch;
  const step = createStep({
    id: STEP_ID, inputSchema, outputSchema, retries: 0,
    execute: async ({ inputData, runId }): Promise<StrippedRun> => {
      const request = buildRequest(inputData.message);
      const started = performance.now();
      const run: StrippedRun = {
        id: runId, status: "error", createdAt: new Date().toISOString(), completedAt: "",
        message: inputData.message, protocol: PROTOCOL, result: null, error: null,
        trace: { workflowId: WORKFLOW_ID, stepId: STEP_ID, providerCalls: 1,
          providerRequestId: null, latencyMs: 0, usage: null, estimatedUSD: null,
          request, response: null },
      };
      try {
        const response = await fetchProvider("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": options.apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify(request), signal: AbortSignal.timeout(180_000),
        });
        run.trace.providerRequestId = response.headers.get("request-id");
        if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
        const raw = await response.json() as Record<string, unknown>;
        // Explicit projection: traces contain final text, never hidden reasoning or signatures.
        const content = Array.isArray(raw.content) ? raw.content.flatMap((block) =>
          block?.type === "text" && typeof block.text === "string" ? [{ type: "text", text: block.text }] : []) : [];
        const validCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
        const count = (value: unknown) => validCount(value) ? value : 0;
        const usage = raw.usage as Record<string, unknown> | undefined;
        if (usage && validCount(usage.input_tokens) && validCount(usage.output_tokens)
          && (usage.cache_read_input_tokens === undefined || validCount(usage.cache_read_input_tokens))
          && (usage.cache_creation_input_tokens === undefined || validCount(usage.cache_creation_input_tokens))) {
          run.trace.usage = { inputTokens: count(usage.input_tokens), outputTokens: count(usage.output_tokens),
            cacheReadTokens: count(usage.cache_read_input_tokens), cacheWriteTokens: count(usage.cache_creation_input_tokens) };
          const u = run.trace.usage;
          run.trace.estimatedUSD = (u.inputTokens * 10 + u.outputTokens * 50 + u.cacheReadTokens * 0.25 + u.cacheWriteTokens * 20) / 1e6;
        }
        run.trace.response = {
          id: typeof raw.id === "string" ? raw.id : null,
          model: typeof raw.model === "string" ? raw.model : null,
          stop_reason: typeof raw.stop_reason === "string" ? raw.stop_reason : null,
          content, usage: run.trace.usage,
        };
        run.result = parseDisposition(raw);
        run.status = "complete";
      } catch (error) {
        // Never return arbitrary transport error text, which can contain request credentials.
        run.error = error instanceof Error && /^Provider HTTP \d{3}$/.test(error.message)
          ? error.message : "The provider call failed or returned invalid disposition JSON. No retry was made.";
      }
      run.completedAt = new Date().toISOString();
      run.trace.latencyMs = Math.round(performance.now() - started);
      return run;
    },
  });
  return createWorkflow({ id: WORKFLOW_ID, inputSchema, outputSchema, retryConfig: { attempts: 0 } }).then(step).commit();
}
