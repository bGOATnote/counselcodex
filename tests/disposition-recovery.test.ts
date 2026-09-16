import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { recoverGeneration } from "../src/disposition/recovery.ts";
import { consumeStructuredStream } from "../src/disposition/transport.ts";
import { EXECUTION_POLICY } from "../src/disposition/execution-policy.ts";
import type { AgentExecution } from "../src/disposition/contract.ts";

const policy = { attemptTimeoutMs: 100, retryDelayMs: 1, maxAttempts: 2 };
const run = (failure: string | null = null, output: unknown = { answer: { disposition: "ASYNC_PHYSICIAN" } }): AgentExecution => ({ role: "disposition", model: "synthetic", modelCalls: 1, output: failure ? null : output, failure, usage: { inputTokens: failure ? null : 10, outputTokens: failure ? null : 10 } });
const stalled = async (signal: AbortSignal): Promise<AgentExecution> => ({ ...run(), ...await consumeStructuredStream({ signal, start: async () => ({ fullStream: { async *[Symbol.asyncIterator]() { yield { type: "text-delta", payload: { text: "incomplete medical prose" } }; await new Promise(() => {}); } }, object: new Promise(() => {}), usage: new Promise(() => {}), finishReason: new Promise(() => {}) }) }) });
test("fast complete response does not dispatch a duplicate request", async () => {
  let calls = 0;
  const r = await recoverGeneration({ policy, signal: new AbortController().signal, invoke: async () => { calls++; return run(); } });
  await delay(30); assert.equal(calls, 1); assert.equal(r.attempts.length, 1); assert.equal(r.selected.attempt?.selected, true);
});
test("retry only follows an actual request timeout; incomplete prose and unknown usage remain accounted", async () => {
  const r = await recoverGeneration({ policy, signal: new AbortController().signal, invoke: (s, n) => n === 1 ? stalled(s) : Promise.resolve(run()) });
  assert.equal(r.selected.attempt?.number, 2); assert.equal(r.attempts.length, 2);
  assert.equal(r.attempts[0].failure, "MODEL_TIMEOUT"); assert.equal(r.attempts[0].output, null);
  assert.equal(r.attempts[0].usage.outputTokens, null); assert.equal(r.attempts[0].modelCalls, 1);
  assert.ok(r.attempts[0].streamProgress!.textCharacters > 0);
});
test("slow original completes without a speculative duplicate", async () => {
  const r = await recoverGeneration({ policy, signal: new AbortController().signal, invoke: async () => { await delay(60); return run(); } });
  assert.equal(r.selected.attempt?.number, 1); assert.equal(r.attempts.length, 1);
});
test("two stalls terminate with failure; never fabricate a clinical success", async () => {
  const started = performance.now();
  const r = await recoverGeneration({ policy, signal: new AbortController().signal, invoke: stalled });
  assert.ok(performance.now()-started < 350); assert.equal(r.attempts.length, 2); assert.equal(r.selected.failure, "MODEL_TIMEOUT");
  assert.ok(r.attempts.every(a => a.output === null));
});
test("early transport failure starts at most one recovery", async () => {
  const r = await recoverGeneration({ policy, signal: new AbortController().signal, invoke: async (_,n) => run(n === 1 ? "MODEL_OR_SCHEMA_FAILURE" : null) });
  assert.equal(r.selected.attempt?.number, 2); assert.equal(r.attempts[0].failure, "MODEL_OR_SCHEMA_FAILURE");
});
test("known authentication, invalid-request and rate-limit failures do not trigger a retry storm", async () => {
  for (const code of ["PROVIDER_AUTH_FAILED", "PROVIDER_REQUEST_REJECTED", "PROVIDER_RATE_LIMITED", "PROMPT_LIMIT_EXCEEDED"]) {
    const r = await recoverGeneration({ policy, signal: new AbortController().signal, invoke: async () => run(code) });
    assert.equal(r.attempts.length,1); assert.equal(r.selected.failure,code);
  }
});
test("complete clinical candidate is selected without fishing for a different diagnosis", async () => {
  const invalid = { answer: { disposition: "SELF_CARE", patientMessage: "normal vitals" } };
  const r = await recoverGeneration({ policy, signal: new AbortController().signal, invoke: async () => run(null, invalid) });
  assert.deepEqual(r.selected.output, invalid); assert.equal(r.attempts.length,1);
  // Clinical validation belongs to the workflow and must reject this candidate.
});
test("caller cancellation terminates active work and prevents recovery dispatch", async () => {
  const controller = new AbortController(); let calls=0;
  const pending = recoverGeneration({ policy, signal: controller.signal, invoke: s => { calls++; return stalled(s); } });
  setTimeout(() => controller.abort(new Error("RUN_CANCELLED")), 5);
  const r = await pending; await delay(30);
  assert.equal(calls,1); assert.equal(r.selected.failure,"RUN_CANCELLED");
});
test("already cancelled and invalid configurations dispatch nothing", async () => {
  let calls=0; const invoke = async () => { calls++; return run(); };
  await assert.rejects(recoverGeneration({ policy, signal: AbortSignal.abort(new Error("RUN_CANCELLED")), invoke }));
  await assert.rejects(recoverGeneration({ policy: {...policy,maxAttempts:3}, signal: new AbortController().signal, invoke }));
  assert.equal(calls,0);
});
test("unexpected executor rejection cannot leave recovery waiting indefinitely", async () => {
  await assert.rejects(recoverGeneration({ policy, signal: new AbortController().signal, invoke: async () => { throw new Error("executor defect"); } }), /executor defect/);
});

test("a valid response at 110 seconds survives 50 and 100 seconds unchanged (virtual clock)", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let providerSignal!: AbortSignal, calls = 0, release!: (value: AgentExecution) => void;
  const pending = recoverGeneration({ signal: new AbortController().signal, invoke: signal => {
    calls++; providerSignal = signal; return new Promise(resolve => { release = resolve; });
  } });
  t.mock.timers.tick(50_000); assert.equal(providerSignal.aborted, false); assert.equal(calls, 1);
  t.mock.timers.tick(50_000); assert.equal(providerSignal.aborted, false); assert.equal(calls, 1);
  t.mock.timers.tick(10_000); release(run());
  const result = await pending;
  assert.equal(result.attempts.length, 1); assert.equal(result.selected.failure, null);
  t.mock.timers.tick(EXECUTION_POLICY.modelTimeoutMs);
  assert.equal(providerSignal.aborted, false, "completed request's deadline must be disposed");
});

test("600-second allowance is enforced, not the former 24/32/50-second policy (virtual clock)", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let providerSignal!: AbortSignal;
  const pending = recoverGeneration({ policy: { ...policy, attemptTimeoutMs: EXECUTION_POLICY.modelTimeoutMs, maxAttempts: 1 }, signal: new AbortController().signal,
    invoke: signal => { providerSignal = signal; return stalled(signal); } });
  await Promise.resolve(); await Promise.resolve();
  t.mock.timers.tick(599_999); assert.equal(providerSignal.aborted, false);
  t.mock.timers.tick(1); assert.equal(providerSignal.aborted, true);
  const result = await pending; assert.equal(result.selected.failure, "MODEL_TIMEOUT");
});

test("cancel during recovery backoff never starts a replacement", async () => {
  const controller = new AbortController(); let calls = 0;
  const pending = recoverGeneration({ policy: { ...policy, retryDelayMs: 100 }, signal: controller.signal, invoke: async () => { calls++; return run("MODEL_OR_SCHEMA_FAILURE"); } });
  setTimeout(() => controller.abort(new Error("RUN_CANCELLED")), 5);
  const result = await pending;
  assert.equal(calls, 1); assert.equal(result.attempts.length, 1); assert.equal(result.selected.failure, "MODEL_OR_SCHEMA_FAILURE");
});
