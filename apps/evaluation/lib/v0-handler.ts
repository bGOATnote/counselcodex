import { z } from "zod";
import { requireLocalReviewRequest } from "./review-backup-store.ts";
import { clarificationReferenceSchema, type ClarificationReference } from "../../../src/disposition/conversation.ts";

const inputSchema = z.object({ message: z.string().min(1).max(12_000).refine((value) => value.trim().length > 0), syntheticOnly: z.literal(true), clarificationReference: clarificationReferenceSchema.optional(), episodeId: z.string().uuid().optional() }).strict();
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
const MAX_BYTES = 64 * 1024;

async function readInput(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") throw new Error("JSON_REQUIRED");
  if (Number(request.headers.get("content-length")) > MAX_BYTES) throw new Error("INPUT_TOO_LARGE");
  if (!request.body) throw new Error("INVALID_INPUT");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => { for (;;) { const { value, done } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > MAX_BYTES) throw new Error("INPUT_TOO_LARGE"); chunks.push(value); } })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { void reader.cancel().catch(() => {}); reject(new Error("INPUT_TIMEOUT")); }, 5000); }),
    ]);
    return inputSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } finally { clearTimeout(timer); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

// Dependency injection permits HTTP-boundary tests without touching review data.
export function createV0Handler<T, N = never>(execute: (message: string, emit: (notice: N) => void, signal?: AbortSignal, clarificationReference?: ClarificationReference, episodeId?: string) => Promise<T>, options?: { stream: boolean; eventType?: "response_event"; cancelOnDisconnect?: boolean; heartbeatMs?: number }) {
  if (options?.heartbeatMs !== undefined && (!Number.isSafeInteger(options.heartbeatMs) || options.heartbeatMs <= 0)) throw new Error("INVALID_HEARTBEAT_POLICY");
  let active = 0;
  return async (request: Request) => {
    let admitted = false;
    let streaming = false;
    try {
      requireLocalReviewRequest(request);
      if (request.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405, headers: { ...headers, Allow: "POST" } });
      if (active >= 2) return Response.json({ error: "V0_BUSY" }, { status: 429, headers: { ...headers, "Retry-After": "2" } });
      active++; admitted = true;
      const input = await readInput(request);
      if (options?.stream) {
        streaming = true;
        let connected = true;
        let heartbeat: ReturnType<typeof setInterval> | undefined;
        const stopHeartbeat = () => clearInterval(heartbeat);
        const controllerAbort = new AbortController();
        const disconnect = () => { stopHeartbeat(); if (options.cancelOnDisconnect) controllerAbort.abort(new Error("RUN_CANCELLED")); };
        request.signal.addEventListener("abort", disconnect, { once: true });
        if (request.signal.aborted) disconnect();
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            const send = (event: unknown) => { if (connected) { try { controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")); } catch { connected = false; disconnect(); } } };
            send({ type: "started" });
            // Connection liveness only: not model progress, care advice, or a
            // clinical audit event. Never release partial medical prose here.
            const started = performance.now();
            if (options.heartbeatMs && !request.signal.aborted) heartbeat = setInterval(() => send({ type: "heartbeat", elapsedMs: Math.round(performance.now() - started) }), options.heartbeatMs);
            // Cancellation reaches providers when enabled. Keep admission occupied
            // until the workflow has returned and saved the canceled attempt.
            void Promise.resolve().then(() => execute(input.message, (notice) => send(options.eventType === "response_event" ? { type: "response_event", event: notice } : { type: "safety_notice", notice }), controllerAbort.signal, input.clarificationReference, input.episodeId))
              .then((result) => { stopHeartbeat(); send({ type: "result", result }); })
              .catch(() => { stopHeartbeat(); send({ type: "error", error: "ASSESSMENT_UNAVAILABLE" }); })
              .finally(() => { stopHeartbeat(); request.signal.removeEventListener("abort", disconnect); active--; if (connected) { connected = false; controller.close(); } });
          },
          cancel() { connected = false; disconnect(); },
        });
        return new Response(stream, { headers: { ...headers, "Content-Type": "application/x-ndjson", "X-Accel-Buffering": "no" } });
      }
      return Response.json(await execute(input.message, () => {}, request.signal, input.clarificationReference, input.episodeId), { headers });
    } catch (error) {
      const message = error instanceof Error ? error.message : "V0_UNAVAILABLE";
      const codes: Record<string, number> = { LOCAL_ORIGIN_REQUIRED: 403, JSON_REQUIRED: 415, INPUT_TOO_LARGE: 413, INPUT_TIMEOUT: 408, INVALID_INPUT: 400 };
      const invalid = error instanceof z.ZodError || error instanceof SyntaxError;
      return Response.json({ error: invalid ? "INVALID_INPUT" : codes[message] ? message : "V0_UNAVAILABLE" }, { status: invalid ? 400 : codes[message] ?? 503, headers });
    } finally { if (admitted && !streaming) active--; }
  };
}
