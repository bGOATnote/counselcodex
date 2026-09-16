import { z } from "zod";
import type { StrippedRun } from "../../../src/stripped/contract.ts";

const schema = z.object({ message: z.string().min(1).max(12_000).refine((value) => Boolean(value.trim())) }).strict();

export function createStrippedHandler(execute: (message: string) => Promise<StrippedRun>) {
  let active = 0;
  return async (request: Request): Promise<Response> => {
    const headers = { "Cache-Control": "no-store" };
    const fail = (error: string, status: number) => Response.json({ error }, { status, headers });
    const url = new URL(request.url);
    if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url.origin)
      || request.headers.get("host") !== url.host || request.headers.get("origin") !== url.origin
      || request.headers.get("x-counsel-review") !== "local-v1"
      || (request.headers.has("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin")) return fail("Local, same-origin requests are required.", 403);
    if (active >= 2) return fail("Two calls are already running. Wait for one to finish.", 429);
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return fail("JSON is required.", 400);
    let message: string;
    try {
      if (!request.body || Number(request.headers.get("content-length")) > 64_000) return fail("Message is too large.", 400);
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; void reader.cancel(); }, 5_000);
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 64_000) { await reader.cancel(); throw new Error("Too large"); }
          chunks.push(value);
        }
      } finally { clearTimeout(timer); reader.releaseLock(); }
      if (timedOut) throw new Error("Body timed out");
      message = schema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8"))).message;
    } catch { return fail("Enter one nonempty message of at most 12,000 characters.", 400); }
    // Recheck after reading the body, before dispatch. There is no queue or retry.
    if (active >= 2) return fail("Two calls are already running. Wait for one to finish.", 429);
    active++;
    try {
      const run = await execute(message);
      return Response.json(run, { status: run.status === "complete" ? 200 : 502, headers });
    } catch (error) {
      const safe = error instanceof Error && /^(ANTHROPIC_API_KEY is not configured|The local demo's \$2 allowance is exhausted|The disposition workflow failed)/.test(error.message);
      return fail(safe ? (error as Error).message : "The local run could not complete. Check the server configuration and saved trace.", 503);
    } finally { active--; }
  };
}
