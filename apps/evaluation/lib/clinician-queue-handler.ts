import { z } from "zod";
import { requireLocalReviewRequest, readBoundedReviewBody } from "./review-backup-store.ts";
import type { clinicianQueueStore } from "./clinician-queue-store.ts";
const input = z.object({ episodeId: z.string().uuid(), revision: z.number().int().positive(), version: z.number().int().positive().nullable(), action: z.enum(["enqueue", "accept", "respond", "resolve", "follow_up"]), note: z.string().max(2000).default(""), followUp: z.object({ state: z.enum(["planned", "completed", "not_needed"]), dueAt: z.iso.datetime().nullable() }).strict().optional() }).strict().refine(v => (v.action === "follow_up") === Boolean(v.followUp));
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
export function queueHandler(getStore: () => ReturnType<typeof clinicianQueueStore>) {
  return async (request: Request) => {
    try {
      requireLocalReviewRequest(request);
      if (request.method === "GET") return Response.json({ tasks: getStore().list(), service: getStore().service() }, { headers });
      if (request.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405, headers });
      const value = input.parse(JSON.parse(await readBoundedReviewBody(request)));
      return Response.json({ task: getStore().act(value.episodeId, value.revision, value.action, value.version, value.note, value.followUp) }, { headers });
    } catch (error) {
      const code = error instanceof Error ? error.message : "QUEUE_UNAVAILABLE";
      const conflict = ["STALE_TASK", "STALE_ASSESSMENT", "ASYNC_ASSESSMENT_REQUIRED", "INVALID_TRANSITION", "NOTE_REQUIRED", "FOLLOW_UP_OPEN", "FOLLOW_UP_INVALID"].includes(code);
      return Response.json({ error: conflict || code === "LOCAL_ORIGIN_REQUIRED" ? code : error instanceof z.ZodError || error instanceof SyntaxError ? "INVALID_INPUT" : "QUEUE_UNAVAILABLE" }, { status: conflict ? 409 : code === "LOCAL_ORIGIN_REQUIRED" ? 403 : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 503, headers });
    }
  };
}
