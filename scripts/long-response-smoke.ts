import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createV0Handler } from "../apps/evaluation/lib/v0-handler.ts";
import { readDispositionStream } from "../apps/evaluation/lib/disposition-stream.ts";
import { recoverGeneration } from "../src/disposition/recovery.ts";
import { EXECUTION_POLICY } from "../src/disposition/execution-policy.ts";
import { abortable } from "../src/disposition/transport.ts";
import { fixtureRun } from "../tests/response-review-fixtures.ts";

// Real 110-second wall-clock fault injection through the production request
// handler, recovery policy and GUI stream decoder. No provider calls or patient
// inference: this proves transport behavior, not model latency/clinical quality.
const fixture = fixtureRun();
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const before = hash(fixture);
let calls = 0;
const start = performance.now();
const handler = createV0Handler(async (_message, _emit, signal) => {
  const recovery = await recoverGeneration({ signal: signal!, invoke: async attemptSignal => {
    calls++;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await abortable(() => new Promise<void>(resolve => { timer = setTimeout(resolve, 110_000); }), attemptSignal); }
    finally { clearTimeout(timer); }
    return { role: "disposition", model: "synthetic-delayed-transport", modelCalls: 0, output: fixture, failure: null, usage: { inputTokens: 0, outputTokens: 0 } };
  } });
  assert.equal(recovery.attempts.length, 1);
  return recovery.selected.output;
}, { stream: true, eventType: "response_event", cancelOnDisconnect: true, heartbeatMs: EXECUTION_POLICY.heartbeatMs });
const response = await handler(new Request("http://localhost:4120/api/disposition", { method: "POST", headers: { Host: "localhost:4120", Origin: "http://localhost:4120", "Content-Type": "application/json", "x-counsel-review": "local-v1" }, body: JSON.stringify({ message: fixture.message, syntheticOnly: true }) }));
assert.equal(response.status, 200);
const [audit, browser] = response.body!.tee();
const decoder = new TextDecoder(); const reader = audit.getReader();
const frames: { type: string; elapsedMs?: number; receivedMs: number }[] = [];
const auditJob = (async () => {
  let buffer = "";
  for (;;) {
    const chunk = await reader.read(); if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true }); let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const frame = JSON.parse(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
      frames.push({ type: frame.type, elapsedMs: frame.elapsedMs, receivedMs: Math.round(performance.now() - start) });
    }
  }
})();
const result = await readDispositionStream(new Response(browser, { headers: response.headers }), fixture.message, () => assert.fail("Transport cannot fabricate an instruction"));
await auditJob;
assert.equal(hash(result), before, "slow completion must retain the exact response");
assert.equal(calls, 1); assert.equal(frames.at(-1)!.type, "result");
assert.ok(frames.at(-1)!.receivedMs >= 110_000);
assert.ok(frames.some(frame => frame.type === "heartbeat" && frame.receivedMs > 100_000));
console.log(JSON.stringify({ kind: "synthetic-wall-clock-transport-test", providerCalls: 0, injectedDelayMs: 110_000, executionPolicy: EXECUTION_POLICY, calls, exactResponsePreserved: true, frames, passed: true }, null, 2));
