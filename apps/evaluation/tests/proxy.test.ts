import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { NextRequest } from "next/server.js";

import { proxy } from "../proxy.ts";

test("request-specific CSP is paired with dynamic document rendering", () => {
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /export const dynamic = "force-dynamic"/);
  const request = new NextRequest("http://localhost:4120/");
  const first = proxy(request).headers.get("content-security-policy") ?? "";
  const second = proxy(request).headers.get("content-security-policy") ?? "";
  assert.match(first, /'nonce-[A-Za-z0-9+/=]+'/);
  assert.notEqual(first, second);
  assert.match(first, /'strict-dynamic'/);
});

test("proxy never redirects loopback origins", () => {
  const request = new NextRequest("http://localhost:4120/review?case=C14", {
    headers: { host: "127.0.0.1:4120" },
  });
  const response = proxy(request);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'self'/);
});

test("the explicit recovery origin remains reachable without redirect", () => {
  const request = new NextRequest("http://localhost:4120/?originRecovery=1", {
    headers: { host: "127.0.0.1:4120" },
  });
  const response = proxy(request);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
});
