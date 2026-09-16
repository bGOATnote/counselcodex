import type { AgentExecution } from "./contract.ts";
import { toStandardSchema, type StandardSchemaWithJSON } from "@mastra/core/schema";
import type { z } from "zod";

/** Request a fully typed provider grammar, then preserve the independently
 * validated safety envelope until the caller checks the complete local contract.
 * These deliberately separate provider output guidance from clinical admission.
 */
export function safetyEnvelopeTransport(requested: z.ZodType, envelope: z.ZodType) {
  const transport: StandardSchemaWithJSON = { "~standard": {
    version: 1, vendor: "counsel-safety-envelope/v1",
    jsonSchema: toStandardSchema(requested)["~standard"].jsonSchema,
    validate: (value) => envelope["~standard"].validate(value),
  } };
  return { ...transport, toJSONSchema: () => requested.toJSONSchema(), safeParse: (value: unknown) => envelope.safeParse(value) };
}

/** Observe abandoned work, but do not dispatch a lazy operation after cancellation. */
export async function abortable<T>(work: (() => Promise<T>) | Promise<T>, signal: AbortSignal): Promise<T> {
  const pending = typeof work === "function"
    ? Promise.resolve().then(() => { signal.throwIfAborted(); return work(); })
    : work;
  // An existing promise may reject even when the signal was already aborted.
  // Observe it before the early throw; a late rejection must never be unhandled.
  void pending.catch(() => {});
  signal.throwIfAborted();
  let cancel: (() => void) | undefined;
  try {
    return await Promise.race([pending, new Promise<never>((_, reject) => {
      cancel = () => reject(signal.reason ?? new Error("RUN_CANCELLED"));
      signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) cancel();
    })]);
  } finally { if (cancel) signal.removeEventListener("abort", cancel); }
}

/** Public Mastra 1.64 output surface; no private SDK state is used. */
export type StructuredStream = {
  fullStream: AsyncIterable<{ type: string; payload?: unknown }>;
  object: Promise<unknown>;
  usage: Promise<{ inputTokens?: number; outputTokens?: number; cachedInputTokens?: number; cacheCreationInputTokens?: number }>;
  finishReason: Promise<string | undefined>;
  error?: unknown;
  tripwire?: unknown;
};
/** Locally observed fulfillment times, relative to transport invocation. These
 * are not provider dispatch/network timestamps. Null means not observed before
 * returning (including rejection); streamEndMs requires normal stream exhaustion.
 */
export type TransportTimings = {
  startResolvedMs: number | null;
  objectResolvedMs: number | null;
  usageResolvedMs: number | null;
  finishReasonResolvedMs: number | null;
  streamEndMs: number | null;
};
/** Public Mastra cache counts, kept separate from total usage. Unknown is not zero;
 * these counts are not added to totals or used to change the cost ledger.
 */
export type TransportCacheUsage = { cachedInputTokens: number | null; cacheCreationInputTokens: number | null };
export type ModelTransportResult = Pick<AgentExecution, "output" | "usage" | "failure" | "firstTextDeltaMs" | "durationMs" | "failureDetails" | "streamProgress"> & {
  transportTimings: TransportTimings;
  cacheUsage: TransportCacheUsage;
};
const tokenCount = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const safeStatus = (error: unknown) => error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number" && Number.isInteger(error.statusCode) && error.statusCode >= 100 && error.statusCode <= 599 ? error.statusCode : null;

/**
 * Stream for transport accounting, not for publishing unvalidated clinical text.
 * The caller must pass this signal through to the provider's stream invocation.
 * Cancellation bounds our wait; it cannot guarantee a remote provider stopped billing.
 */
export async function consumeStructuredStream({ start, signal }: {
  start: (signal: AbortSignal) => Promise<StructuredStream>;
  signal: AbortSignal;
}): Promise<ModelTransportResult> {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  let stage = "dispatch", firstTextDeltaMs: number | null = null, finishReason: string | null = null;
  let usage: AgentExecution["usage"] = { inputTokens: null, outputTokens: null };
  const streamProgress = { lastTextDeltaMs: null as number | null, textDeltaCount: 0, textCharacters: 0 };
  const transportTimings: TransportTimings = { startResolvedMs: null, objectResolvedMs: null, usageResolvedMs: null, finishReasonResolvedMs: null, streamEndMs: null };
  const cacheUsage: TransportCacheUsage = { cachedInputTokens: null, cacheCreationInputTokens: null };
  // Snapshot each nested value: abandoned provider work can settle after abort.
  const telemetry = () => ({ transportTimings: { ...transportTimings }, cacheUsage: { ...cacheUsage } });
  try {
    const value = await abortable(async () => {
      const stream = await start(signal);
      transportTimings.startResolvedMs = elapsed();
      stage = "stream";
      // Attach all handlers immediately. Schema and transport promises may reject
      // before stream iteration finishes; observed usage survives those failures.
      const object = Promise.resolve(stream.object).then((value) => {
        transportTimings.objectResolvedMs = elapsed();
        return { ok: true as const, value };
      }, () => ({ ok: false as const }));
      const measuredUsage = Promise.resolve(stream.usage).then((value) => {
        transportTimings.usageResolvedMs = elapsed();
        usage = { inputTokens: tokenCount(value.inputTokens), outputTokens: tokenCount(value.outputTokens) };
        cacheUsage.cachedInputTokens = tokenCount(value.cachedInputTokens);
        cacheUsage.cacheCreationInputTokens = tokenCount(value.cacheCreationInputTokens);
      }, () => {});
      const finish = Promise.resolve(stream.finishReason).then((value) => { transportTimings.finishReasonResolvedMs = elapsed(); finishReason = value ?? null; }, () => {});
      let chunkError: unknown, sawErrorChunk = false;
      for await (const chunk of stream.fullStream) {
        signal.throwIfAborted();
        if (chunk.type === "text-delta") {
          streamProgress.lastTextDeltaMs = Math.round(performance.now() - started);
          firstTextDeltaMs ??= streamProgress.lastTextDeltaMs;
          streamProgress.textDeltaCount++;
          // Counts only: never retain or release incomplete clinical prose.
          if (chunk.payload && typeof chunk.payload === "object" && "text" in chunk.payload && typeof chunk.payload.text === "string") streamProgress.textCharacters += chunk.payload.text.length;
        }
        if (chunk.type === "error") {
          sawErrorChunk = true;
          if (chunk.payload && typeof chunk.payload === "object" && "error" in chunk.payload) chunkError = chunk.payload.error;
        }
      }
      transportTimings.streamEndMs = elapsed();
      stage = "structured-output";
      const [parsed] = await Promise.all([object, measuredUsage, finish]);
      signal.throwIfAborted();
      if (stream.error) throw stream.error;
      if (sawErrorChunk) throw chunkError ?? new Error("MODEL_STREAM_ERROR");
      if (stream.tripwire) throw new Error("MODEL_TRIPWIRE");
      if (finishReason !== "stop") throw new Error("INCOMPLETE_MODEL_STREAM");
      if (!parsed.ok || parsed.value === undefined) throw new Error("MODEL_OUTPUT_INVALID");
      return parsed.value;
    }, signal);
    return { output: value, usage: { ...usage }, failure: null, firstTextDeltaMs, streamProgress: { ...streamProgress }, ...telemetry(), durationMs: Math.round(performance.now() - started) };
  } catch (error) {
    const reason = signal.aborted ? signal.reason : error;
    const failure = signal.aborted
      ? reason instanceof Error && /timeout/i.test(reason.name + " " + reason.message) ? "MODEL_TIMEOUT" : reason instanceof Error && reason.message === "GENERATION_SUPERSEDED" ? "GENERATION_SUPERSEDED" : "RUN_CANCELLED"
      : safeStatus(error) === 400 ? "PROVIDER_REQUEST_REJECTED"
      : safeStatus(error) === 401 || safeStatus(error) === 403 ? "PROVIDER_AUTH_FAILED"
      : safeStatus(error) === 429 ? "PROVIDER_RATE_LIMITED"
      : error instanceof Error && ["INCOMPLETE_MODEL_STREAM", "MODEL_OUTPUT_INVALID", "MODEL_TRIPWIRE"].includes(error.message) ? error.message : "MODEL_OR_SCHEMA_FAILURE";
    return { output: null, usage: { ...usage }, failure, firstTextDeltaMs, streamProgress: { ...streamProgress }, ...telemetry(), durationMs: Math.round(performance.now() - started), failureDetails: { stage, finishReason, httpStatus: safeStatus(error) } };
  }
}

/** A slow trace exporter must not hold clinical completion or admission indefinitely. */
export async function persistTraceWithinDeadline({ flush, verify, timeoutMs = 1000 }: {
  flush: () => Promise<void>;
  verify: () => Promise<boolean>;
  timeoutMs?: number;
}): Promise<{ persisted: boolean; durationMs: number }> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("INVALID_TRACE_TIMEOUT");
  const started = performance.now(), deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(new Error("TRACE_PERSISTENCE_TIMEOUT")), timeoutMs);
  try {
    const persisted = await abortable(async () => {
      await flush(); deadline.signal.throwIfAborted();
      return await verify();
    }, deadline.signal);
    return { persisted, durationMs: Math.round(performance.now() - started) };
  } catch { return { persisted: false, durationMs: Math.round(performance.now() - started) }; }
  finally { clearTimeout(timer); }
}
