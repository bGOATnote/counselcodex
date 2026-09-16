import type { CorsOptions, Middleware } from "@mastra/core/server";

const localOrigins = new Set(["http://127.0.0.1:4111", "http://localhost:4111"]);
const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

// This header is an explicit local CLI opt-in, not a credential. A foreign
// browser origin is rejected even when the header is supplied.
export const LOCAL_CLI_HEADER = "x-counsel-local";
export const LOCAL_CLI_VALUE = "native-v1";

export const localServerPolicy = {
  host: "127.0.0.1",
  port: 4111,
  cors: {
    origin: (origin, context) => {
      const url = new URL(context.req.url);
      return localOrigins.has(origin) && origin === url.origin ? origin : undefined;
    },
    credentials: false,
    allowHeaders: [LOCAL_CLI_HEADER],
  } satisfies CorsOptions,
};

export const localServerRequestGuard = (async (context: { req: { raw: Request } }, next: () => Promise<void>): Promise<Response | void> => {
  const request = context.req.raw;
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  const denied = !localOrigins.has(url.origin)
    || request.headers.get("host") !== url.host
    || (origin !== null && origin !== url.origin)
    || (site !== null && site !== "same-origin" && site !== "none")
    || (!safeMethods.has(request.method) && origin === null
      && request.headers.get(LOCAL_CLI_HEADER) !== LOCAL_CLI_VALUE);
  if (denied) return Response.json({ error: "LOCAL_ORIGIN_REQUIRED" }, { status: 403, headers: {
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  } });
  await next();
}) satisfies Middleware;
