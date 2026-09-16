import test from "node:test";
import assert from "node:assert/strict";
import { responseReviewHandlers } from "../lib/response-review-handler.ts";
const id = "a0000000-0000-4000-8000-000000000001";
function request(body?: unknown, overrides = {}) { return new Request(`http://localhost:4120/api/response-review?runId=${id}`, { method: body ? "POST" : "GET", headers: { host: "localhost:4120", origin: "http://localhost:4120", "x-counsel-review": "local-v1", "content-type": "application/json", ...overrides }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
test("foreign origins, forged clinical packets and invalid IDs reject before opening the service", async () => {
  let opened = 0;
  const handlers = responseReviewHandlers(() => { opened++; throw new Error("must not open"); }, () => {});
  assert.equal((await handlers.POST(request({ action: "review", runId: id }, { origin: "https://attacker.invalid" }))).status, 400);
  assert.equal((await handlers.POST(request({ action: "review", runId: id, packet: { answer: "forged" } }))).status, 400);
  assert.equal((await handlers.POST(request({ action: "review", runId: "../../.env" }))).status, 400);
  assert.equal((await handlers.GET(request(undefined, { "x-counsel-review": "" }))).status, 400); assert.equal(opened, 0);
});
test("GET never spends; POST schedules after responding and does not await the provider", async () => {
  let calls = 0, loads = 0; const scheduled: (() => Promise<void>)[] = [];
  const service = { store: { get: () => null, feedbackFor: () => [], budget: () => ({ allocatedUsd: 0, capUsd: 20 }) }, enqueue: () => {}, loadRun: () => { loads++; return {}; }, process: async () => { calls++; } };
  const handlers = responseReviewHandlers(() => service as never, work => scheduled.push(work));
  assert.equal((await handlers.GET(request())).status, 200); assert.equal(calls, 0); assert.equal(loads, 0);
  const response = await handlers.POST(request({ action: "review", runId: id })); assert.equal(response.status, 200); assert.equal(calls, 0); assert.equal(loads, 1); assert.equal(scheduled.length, 1);
  await scheduled[0](); assert.equal(calls, 1); assert.equal(response.headers.get("cache-control"), "no-store");
});
