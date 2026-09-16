import { z } from "zod";
import { requireLocalReviewRequest, readBoundedReviewBody } from "./review-backup-store.ts";
import type { createReviewService } from "../../../src/evaluation/response-review-service.ts";
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("review"), runId: z.uuid() }).strict(),
  z.object({ action: z.literal("feedback"), runId: z.uuid(), packetHash: z.string().regex(/^[a-f0-9]{64}$/), criterion: z.string().max(50), verdict: z.enum(["agree", "disagree", "unable"]), note: z.string().max(2000) }).strict(),
]);
export function responseReviewHandlers(getService: () => ReturnType<typeof createReviewService>, schedule: (work: () => Promise<void>) => void) {
  return {
    async GET(request: Request) {
      try {
        requireLocalReviewRequest(request);
        const id = z.uuid().parse(new URL(request.url).searchParams.get("runId"));
        const service = getService();
        return Response.json({ job: service.store.get(id), feedback: service.store.feedbackFor(id), budget: service.store.budget() }, { headers: { "Cache-Control": "no-store" } });
      } catch { return Response.json({ error: "REVIEW_READ_FAILED" }, { status: 400 }); }
    },
    async POST(request: Request) {
      try {
        requireLocalReviewRequest(request);
        const body = requestSchema.parse(JSON.parse(await readBoundedReviewBody(request)));
        const service = getService();
        if (body.action === "review") {
          service.enqueue(service.loadRun(body.runId));
          schedule(async () => { try { await service.process(body.runId); } catch { /* queued, no paid retry; error preserved by service */ } });
        } else service.store.feedback(body.runId, body.packetHash, body.criterion, body.verdict, body.note);
        return Response.json({ job: service.store.get(body.runId), feedback: service.store.feedbackFor(body.runId) }, { headers: { "Cache-Control": "no-store" } });
      } catch { return Response.json({ error: "REVIEW_REQUEST_REJECTED" }, { status: 400 }); }
    },
  };
}
