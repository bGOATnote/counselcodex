export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Explicitly disable the old simulator, including callers from stale tabs.
// Historical queue files remain on disk; this endpoint never opens them.
export function GET() {
  return Response.json({ error: "QUEUE_INTEGRATION_NOT_CONNECTED", mode: "stub", detail: "Priority and standard async share the intended Counsel clinician queue. No request was sent or accepted." },
    { status: 501, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
export const POST = GET;
