import test from "node:test";
import assert from "node:assert/strict";
import { createStrippedHandler } from "../lib/stripped-handler.ts";
import type { StrippedRun } from "../../../src/stripped/contract.ts";

function request(body: unknown = { message: "Synthetic message" }, headers: Record<string, string> = {}, url = "http://localhost:4120/api/stripped") {
  return new Request(url, {
    method: "POST",
    headers: { host: "localhost:4120", origin: "http://localhost:4120", "x-counsel-review": "local-v1", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function fixture(message: string, status: "complete" | "error" = "complete"): StrippedRun {
  return {
    id: "run-handler-test", status, createdAt: "2026-09-15T12:00:00.000Z", completedAt: "2026-09-15T12:00:01.000Z", message,
    protocol: { model: "claude-fable-5-1", effort: "low", promptSHA256: "test-prompt" },
    result: status === "complete" ? { disposition: "SELF_CARE", rationale: "Synthetic fixture rationale." } : null,
    error: status === "error" ? "Provider HTTP 503" : null,
    trace: { workflowId: "stripped-fable-5-1", stepId: "one-disposition", providerCalls: 1, providerRequestId: "req-test", latencyMs: 1000, usage: null, estimatedUSD: null, request: { messages: [{ role: "user", content: message }] }, response: null },
  };
}

test("stripped HTTP endpoint accepts only local same-origin requests before executing", async () => {
  let calls = 0;
  const handler = createStrippedHandler(async (message) => { calls++; return fixture(message); });
  const invalidHeaders: Array<Record<string, string>> = [
    { origin: "https://attacker.invalid" },
    { origin: "" },
    { host: "attacker.invalid" },
    { "x-counsel-review": "" },
    { "sec-fetch-site": "cross-site" },
    { "sec-fetch-site": "same-site" },
  ];
  for (const headers of invalidHeaders) {
    const response = await handler(request(undefined, headers));
    assert.equal(response.status, 403, JSON.stringify(headers));
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal((await handler(request(undefined, { host: "example.com:4120", origin: "http://example.com:4120" }, "http://example.com:4120/api/stripped"))).status, 403);
  assert.equal(calls, 0);
  assert.equal((await handler(request(undefined, { host: "127.0.0.1:4120", origin: "http://127.0.0.1:4120", "sec-fetch-site": "same-origin" }, "http://127.0.0.1:4120/api/stripped"))).status, 200);
  assert.equal(calls, 1);
});

test("stripped HTTP input rejects extra metadata, blank, missing, wrong-type and oversized messages", async () => {
  let calls = 0;
  const handler = createStrippedHandler(async (message) => { calls++; return fixture(message); });
  for (const body of [
    {}, null, [], { message: 1 }, { message: "" }, { message: " \r\n\t " }, { message: "x".repeat(12_001) },
    { message: "Synthetic message", caseId: "C01" },
    { message: "Synthetic message", disposition: "SELF_CARE" },
    { message: "Synthetic message", model: "different-model" },
    { message: "Synthetic message", syntheticOnly: true },
    { message: "Synthetic message", priorResult: { rationale: "Do not forward" } },
  ]) assert.equal((await handler(request(body))).status, 400, JSON.stringify(body).slice(0, 100));
  assert.equal((await handler(request(undefined, { "content-type": "text/plain" }))).status, 400);
  assert.equal((await handler(request(undefined, { "content-length": "64001" }))).status, 400);
  const malformed = request();
  assert.equal((await handler(new Request(malformed, { body: "{broken json" }))).status, 400);
  const streamedOversize = request();
  assert.equal((await handler(new Request(streamedOversize, { body: JSON.stringify({ message: "x".repeat(64_001) }) }))).status, 400);
  assert.equal(calls, 0);
});

test("stripped HTTP endpoint preserves exact message bytes and final result", async () => {
  const message = " \r\nCafé ‘quoted’ 🩺\t\n ";
  const seen: string[] = [];
  const handler = createStrippedHandler(async (input) => { seen.push(input); return fixture(input); });
  const response = await handler(request({ message }, { "content-type": "application/json; charset=utf-8" }));
  assert.equal(response.status, 200);
  assert.deepEqual(seen, [message]);
  assert.deepEqual(await response.json(), fixture(message));
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("stripped HTTP body timeout rejects an unfinished stream even when its prefix is valid JSON", async () => {
  let calls = 0;
  let canceled = false;
  const handler = createStrippedHandler(async (message) => { calls++; return fixture(message); });
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify({ message: "Valid JSON in an unfinished request" }))); },
    cancel() { canceled = true; },
  });
  const init: RequestInit & { duplex: "half" } = { body, duplex: "half" };
  const response = await handler(new Request(request(), init));
  assert.equal(response.status, 400);
  assert.equal(canceled, true);
  assert.equal(calls, 0);
});

test("stripped HTTP provider failure keeps its trace and does not masquerade as a disposition", async () => {
  let calls = 0;
  const handler = createStrippedHandler(async (message) => { calls++; return fixture(message, "error"); });
  const response = await handler(request());
  assert.equal(response.status, 502);
  const result = await response.json() as StrippedRun;
  assert.equal(result.status, "error");
  assert.equal(result.result, null);
  assert.equal(result.trace.providerRequestId, "req-test");
  assert.equal(calls, 1);
});

test("stripped HTTP service errors are sanitized and release the active slot", async () => {
  let calls = 0;
  const handler = createStrippedHandler(async (message) => {
    calls++;
    if (calls <= 2) throw new Error("transport failed with x-api-key: TEST_SECRET_CANARY");
    return fixture(message);
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await handler(request());
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /TEST_SECRET_CANARY|x-api-key/);
  }
  assert.equal((await handler(request())).status, 200);
  assert.equal(calls, 3);
});

test("stripped HTTP admission allows two concurrent calls, rejects the third, and resumes after completion", async () => {
  const finish: Array<() => void> = [];
  let calls = 0;
  const handler = createStrippedHandler(async (message) => {
    calls++;
    await new Promise<void>((resolve) => finish.push(resolve));
    return fixture(message);
  });
  const first = handler(request({ message: "First synthetic message" }));
  const second = handler(request({ message: "Second synthetic message" }));
  // Let both body readers reach execute without waiting for their unresolved calls.
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(calls, 2);
  assert.equal((await handler(request({ message: "Third synthetic message" }))).status, 429);
  assert.equal(calls, 2);
  finish[0]();
  assert.equal((await first).status, 200);
  const next = handler(request({ message: "Fourth synthetic message" }));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(calls, 3);
  finish[1](); finish[2]();
  assert.deepEqual((await Promise.all([second, next])).map((response) => response.status), [200, 200]);
});
