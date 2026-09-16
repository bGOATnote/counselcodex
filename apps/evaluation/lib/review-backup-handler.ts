import { readBoundedReviewBody, requireLocalReviewRequest, type reviewBackupStore } from "./review-backup-store.ts";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

// Inject the store so the complete HTTP boundary can be tested without ever
// writing simulated review answers into the clinician's actual recovery folder.
export function createReviewBackupHandler(store: ReturnType<typeof reviewBackupStore>) {
  return async (request: Request) => {
    try {
      requireLocalReviewRequest(request);
      if (request.method === "POST") return Response.json(await store.save(await readBoundedReviewBody(request)), { headers });
      if (request.method !== "GET") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405, headers: { ...headers, Allow: "GET, POST" } });
      const id = new URL(request.url).searchParams.get("id");
      if (id) return new Response(await store.load(id), { headers: { ...headers, "Content-Type": "application/json" } });
      return Response.json(await store.list(), { headers });
    } catch (error) {
      const message = error instanceof Error ? error.message : "BACKUP_UNAVAILABLE";
      const codes: Record<string, number> = { LOCAL_ORIGIN_REQUIRED: 403, JSON_REQUIRED: 415, BODY_REQUIRED: 400, BACKUP_TOO_LARGE: 413, BACKUP_NOT_FOUND: 404, BACKUP_ID_INVALID: 400, BACKUP_CAPACITY_REACHED: 507 };
      return Response.json({ error: codes[message] ? message : "BACKUP_UNAVAILABLE_OR_INVALID" }, { status: codes[message] ?? 503, headers });
    }
  };
}
