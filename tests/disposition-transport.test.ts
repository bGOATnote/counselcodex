import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { abortable, consumeStructuredStream, persistTraceWithinDeadline, type StructuredStream } from "../src/disposition/transport.ts";
import { createDispositionRuntime } from "../src/disposition/runtime.ts";
import { compactAnswerTransport, planTransportSchema, adaptiveOutputSchema, planSchema } from "../src/disposition/adaptive.ts";
import { referencedPlanTransport } from "../src/disposition/plan-references.ts";
import { SEARCH_VERSION, digest } from "../src/evidence/search.ts";
import type { z } from "zod";
import { Agent } from "@mastra/core/agent";
import { MODEL, FAST_MODEL } from "../src/disposition/workflow.ts";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => { resolve = fulfill; });
  return { promise, resolve };
};
const stream = (overrides: Partial<StructuredStream> = {}): StructuredStream => ({
  fullStream: (async function* () { yield { type: "text-delta" }; })(),
  object: Promise.resolve({ disposition: "EMERGENCY_NOW", auxiliary: { malformed: true } }),
  usage: Promise.resolve({ inputTokens: 21, outputTokens: 34 }),
  finishReason: Promise.resolve("stop"),
  ...overrides,
});

test("pre-aborted lazy work is never dispatched", async () => {
  const controller = new AbortController(); controller.abort(new Error("RUN_CANCELLED"));
  let calls = 0;
  await assert.rejects(abortable(async () => { calls++; return true; }, controller.signal), /RUN_CANCELLED/);
  await tick(); assert.equal(calls, 0);
});
test("pre-aborted legacy promises and late rejected work are observed", async () => {
  const controller = new AbortController(); controller.abort(new Error("RUN_CANCELLED"));
  await assert.rejects(abortable(Promise.reject(new Error("LATE_PROVIDER_FAILURE")), controller.signal), /RUN_CANCELLED/);
  let rejectWork!: (error: Error) => void;
  const other = new AbortController();
  const pending = abortable(() => new Promise<never>((_resolve, reject) => { rejectWork = reject; }), other.signal);
  await tick(); other.abort(new Error("RUN_CANCELLED"));
  await assert.rejects(pending, /RUN_CANCELLED/); rejectWork(new Error("LATE_PROVIDER_FAILURE"));
  await tick(); // node:test fails if either promise produces an unhandled rejection.
});
test("synchronous abort during dispatch does not leak a rejected provider promise", async () => {
  const controller = new AbortController();
  await assert.rejects(abortable(() => {
    controller.abort(new Error("RUN_CANCELLED"));
    return Promise.reject(new Error("REJECTED_AFTER_DISPATCH"));
  }, controller.signal), /RUN_CANCELLED/);
  await tick();
});
test("structured stream consumes deltas for timing, returning only the complete object", async () => {
  const controller = new AbortController();
  const result = await consumeStructuredStream({ start: async (signal) => { assert.equal(signal, controller.signal); return stream(); }, signal: controller.signal });
  assert.equal(result.failure, null);
  // The transport does not pretend to perform clinical/full-answer validation.
  assert.deepEqual(result.output, { disposition: "EMERGENCY_NOW", auxiliary: { malformed: true } });
  assert.deepEqual(result.usage, { inputTokens: 21, outputTokens: 34 });
  assert.equal(typeof result.firstTextDeltaMs, "number");
  assert.equal("text" in result, false); assert.equal("partial" in result, false);
  for (const timing of Object.values(result.transportTimings)) assert.ok(typeof timing === "number" && timing >= 0 && timing <= result.durationMs!);
  assert.deepEqual(result.cacheUsage, { cachedInputTokens: null, cacheCreationInputTokens: null });
});

test("transport milestones observe independent promises without publishing before stream and metadata completion", async () => {
  const object = deferred<unknown>(), streamEnd = deferred<void>(), finish = deferred<string>(), usage = deferred<Awaited<StructuredStream["usage"]>>();
  let returned = false;
  const pending = consumeStructuredStream({ signal: new AbortController().signal, start: async () => stream({
    object: object.promise, usage: usage.promise, finishReason: finish.promise,
    fullStream: (async function* () { yield { type: "text-delta" }; await streamEnd.promise; })(),
  }) }).then((result) => { returned = true; return result; });
  await tick(); object.resolve({ complete: true }); await tick();
  assert.equal(returned, false, "an object alone must not bypass stream failure checks");
  streamEnd.resolve(); await tick();
  assert.equal(returned, false, "normal stream end still waits for usage and finish reason");
  finish.resolve("stop"); await tick();
  assert.equal(returned, false, "usage accounting is still awaited");
  usage.resolve({ inputTokens: 21, outputTokens: 34, cachedInputTokens: 13, cacheCreationInputTokens: 5 });
  const result = await pending;
  assert.equal(result.failure, null);
  const times = result.transportTimings;
  for (const timing of Object.values(times)) assert.ok(typeof timing === "number" && timing >= 0 && timing <= result.durationMs!);
  assert.ok(times.startResolvedMs! <= times.objectResolvedMs!);
  assert.ok(times.objectResolvedMs! <= times.streamEndMs!);
  assert.ok(times.streamEndMs! <= times.finishReasonResolvedMs!);
  assert.ok(times.finishReasonResolvedMs! <= times.usageResolvedMs!);
  assert.deepEqual(result.usage, { inputTokens: 21, outputTokens: 34 }, "cache counters must not be added to existing totals");
  assert.deepEqual(result.cacheUsage, { cachedInputTokens: 13, cacheCreationInputTokens: 5 });
});

test("cache telemetry retains zero and rejects invalid counts instead of inventing usage", async () => {
  for (const [cachedInputTokens, cacheCreationInputTokens, expected] of [
    [0, 0, { cachedInputTokens: 0, cacheCreationInputTokens: 0 }],
    [-1, Number.NaN, { cachedInputTokens: null, cacheCreationInputTokens: null }],
    [Number.POSITIVE_INFINITY, undefined, { cachedInputTokens: null, cacheCreationInputTokens: null }],
  ] as const) {
    const result = await consumeStructuredStream({ signal: new AbortController().signal, start: async () => stream({ usage: Promise.resolve({ inputTokens: 21, outputTokens: 34, cachedInputTokens, cacheCreationInputTokens }) }) });
    assert.equal(result.failure, null); assert.deepEqual(result.cacheUsage, expected);
    assert.deepEqual(result.usage, { inputTokens: 21, outputTokens: 34 });
  }
});

test("rejected promises and interrupted streams do not claim fulfilled or ended milestones", async () => {
  const schema = await consumeStructuredStream({ signal: new AbortController().signal, start: async () => stream({ object: Promise.reject(new Error("private schema payload")) }) });
  assert.equal(schema.failure, "MODEL_OUTPUT_INVALID"); assert.equal(schema.transportTimings.objectResolvedMs, null);
  assert.equal(typeof schema.transportTimings.streamEndMs, "number");
  const interrupted = await consumeStructuredStream({ signal: new AbortController().signal, start: async () => stream({
    fullStream: (async function* () { yield { type: "text-delta" }; throw new Error("private stream payload"); })(),
    usage: Promise.reject(new Error("private usage payload")), finishReason: Promise.reject(new Error("private finish payload")),
  }) });
  assert.equal(interrupted.failure, "MODEL_OR_SCHEMA_FAILURE");
  assert.equal(interrupted.transportTimings.streamEndMs, null);
  assert.equal(interrupted.transportTimings.usageResolvedMs, null);
  assert.equal(interrupted.transportTimings.finishReasonResolvedMs, null);
  assert.deepEqual(interrupted.cacheUsage, { cachedInputTokens: null, cacheCreationInputTokens: null });
  assert.doesNotMatch(JSON.stringify([schema, interrupted]), /private/);
});

test("cancelled transport telemetry is a snapshot even if abandoned promises later fulfill", async () => {
  const controller = new AbortController(), object = deferred<unknown>(), usage = deferred<Awaited<StructuredStream["usage"]>>(), finish = deferred<string>(), streamEnd = deferred<void>();
  const pending = consumeStructuredStream({ signal: controller.signal, start: async () => stream({
    object: object.promise, usage: usage.promise, finishReason: finish.promise,
    fullStream: (async function* () { yield { type: "text-delta" }; await streamEnd.promise; })(),
  }) });
  await tick(); controller.abort(new Error("MODEL_TIMEOUT"));
  const result = await pending, snapshot = JSON.stringify(result);
  assert.equal(result.failure, "MODEL_TIMEOUT"); assert.equal(typeof result.transportTimings.startResolvedMs, "number");
  assert.equal(result.transportTimings.objectResolvedMs, null); assert.equal(result.transportTimings.streamEndMs, null);
  object.resolve({ private: "late output" }); usage.resolve({ inputTokens: 21, outputTokens: 34, cachedInputTokens: 10, cacheCreationInputTokens: 5 }); finish.resolve("stop"); streamEnd.resolve();
  await tick(); assert.equal(JSON.stringify(result), snapshot);
  const skipped = new AbortController(); skipped.abort(new Error("RUN_CANCELLED"));
  const noDispatch = await consumeStructuredStream({ signal: skipped.signal, start: async () => { assert.fail("pre-aborted dispatch"); } });
  assert.deepEqual(noDispatch.transportTimings, { startResolvedMs: null, objectResolvedMs: null, usageResolvedMs: null, finishReasonResolvedMs: null, streamEndMs: null });
});

test("mid-generation timeout records stream progress, never partial prose or invented usage", async () => {
  const controller = new AbortController();
  const never = new Promise<never>(() => {});
  const result = await consumeStructuredStream({ signal: controller.signal, start: async () => stream({
    fullStream: (async function* () {
      yield { type: "text-delta", payload: { text: "PRIVATE_PARTIAL_PROSE" } };
      controller.abort(new Error("MODEL_TIMEOUT"));
      await never;
    })(), object: never, usage: never, finishReason: never,
  }) });
  assert.equal(result.failure, "MODEL_TIMEOUT"); assert.equal(result.output, null);
  assert.equal(result.streamProgress?.textDeltaCount, 1);
  assert.equal(result.streamProgress?.textCharacters, "PRIVATE_PARTIAL_PROSE".length);
  assert.equal(typeof result.streamProgress?.lastTextDeltaMs, "number");
  assert.deepEqual(result.usage, { inputTokens: null, outputTokens: null });
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_PARTIAL_PROSE/);
});
test("truncated output retains observed billable usage and finish metadata", async () => {
  const result = await consumeStructuredStream({ start: async () => stream({ finishReason: Promise.resolve("length") }), signal: new AbortController().signal });
  assert.equal(result.failure, "INCOMPLETE_MODEL_STREAM"); assert.equal(result.output, null);
  assert.deepEqual(result.usage, { inputTokens: 21, outputTokens: 34 });
  assert.equal(result.failureDetails?.finishReason, "length");
});
test("schema rejection and stream failure preserve usage without leaking error prose", async () => {
  const schema = await consumeStructuredStream({ start: async () => stream({ object: Promise.reject(new Error("private clinical payload")) }), signal: new AbortController().signal });
  assert.equal(schema.failure, "MODEL_OUTPUT_INVALID"); assert.equal(schema.usage.outputTokens, 34);
  const failed = await consumeStructuredStream({ start: async () => stream({ fullStream: (async function* () { yield { type: "text-delta" }; throw Object.assign(new Error("private provider payload"), { statusCode: 503 }); })() }), signal: new AbortController().signal });
  assert.equal(failed.output, null); assert.equal(failed.failureDetails?.stage, "stream");
  assert.equal(failed.failureDetails?.httpStatus, 503); assert.equal(failed.usage.inputTokens, 21);
  assert.doesNotMatch(JSON.stringify([schema, failed]), /private/);
});
test("a stream that ends with an SDK error or tripwire is not successful", async () => {
  for (const override of [{ error: new Error("provider failure") }, { tripwire: { reason: "blocked" } }, { finishReason: Promise.resolve("content-filter") }]) {
    const result = await consumeStructuredStream({ start: async () => stream(override), signal: new AbortController().signal });
    assert.equal(result.output, null); assert.ok(result.failure);
  }
  const blocked = await consumeStructuredStream({ start: async () => stream({ tripwire: { reason: "blocked" }, finishReason: Promise.resolve("length") }), signal: new AbortController().signal });
  assert.equal(blocked.failure, "MODEL_TRIPWIRE", "the tripwire must retain its distinct failure classification");
});
test("an error chunk cannot be erased by a missing SDK error getter or nominal stop", async () => {
  const result = await consumeStructuredStream({ start: async () => stream({ fullStream: (async function* () { yield { type: "error", payload: { error: Object.assign(new Error("private response"), { statusCode: 429 }) } }; })(), error: undefined }), signal: new AbortController().signal });
  assert.equal(result.output, null); assert.equal(result.failure, "PROVIDER_RATE_LIMITED");
  assert.equal(result.failureDetails?.httpStatus, 429); assert.equal(result.usage.outputTokens, 34);
  assert.doesNotMatch(JSON.stringify(result), /private/);
  const missingFinish = await consumeStructuredStream({ start: async () => stream({ finishReason: Promise.resolve(undefined) }), signal: new AbortController().signal });
  assert.equal(missingFinish.failure, "INCOMPLETE_MODEL_STREAM");
});
test("cancellation bounds an uncooperative transport and never dispatches after pre-abort", async () => {
  let calls = 0;
  const cancelled = new AbortController(); cancelled.abort(new Error("RUN_CANCELLED"));
  const skipped = await consumeStructuredStream({ start: async () => { calls++; return stream(); }, signal: cancelled.signal });
  assert.equal(calls, 0); assert.equal(skipped.failure, "RUN_CANCELLED"); assert.equal(skipped.firstTextDeltaMs, null);
  const controller = new AbortController();
  const pending = consumeStructuredStream({ start: async () => new Promise(() => {}), signal: controller.signal });
  controller.abort(new Error("MODEL_TIMEOUT"));
  assert.equal((await pending).failure, "MODEL_TIMEOUT");
});
test("trace confirmation is bounded; timed-out and failed flushes remain unconfirmed", async () => {
  let verifyCalls = 0, rejectFlush!: (error: Error) => void;
  const failed = await persistTraceWithinDeadline({ flush: () => new Promise((_resolve, reject) => { rejectFlush = reject; }), verify: async () => { verifyCalls++; return true; }, timeoutMs: 15 });
  assert.equal(failed.persisted, false); assert.equal(verifyCalls, 0); assert.ok(failed.durationMs < 500);
  rejectFlush(new Error("LATE_TRACE_FAILURE")); await tick();
  const success = await persistTraceWithinDeadline({ flush: async () => {}, verify: async () => true });
  assert.equal(success.persisted, true);
  const unavailable = await persistTraceWithinDeadline({ flush: async () => { throw new Error("database offline"); }, verify: async () => true });
  assert.equal(unavailable.persisted, false);
});
test("trace lookup is also bounded and late completion cannot mutate returned status", async () => {
  let resolveVerify!: (value: boolean) => void;
  const result = await persistTraceWithinDeadline({ flush: async () => {}, verify: () => new Promise((resolve) => { resolveVerify = resolve; }), timeoutMs: 15 });
  assert.equal(result.persisted, false); resolveVerify(true); await tick(); assert.equal(result.persisted, false);
});
test("runtime returns and saves a result when the trace exporter hangs", async () => {
  const directory = mkdtempSync(join(tmpdir(), "transport-runtime-"));
  const app = createDispositionRuntime(directory, async () => ({ answer: { malformed: true }, usage: { inputTokens: 10, outputTokens: 10 } }), { profile: "base-opus", budget: "compact" });
  const originalFlush = app.observability.flush.bind(app.observability);
  app.observability.flush = async () => new Promise(() => {});
  try {
    const started = performance.now(), run = await app.assess("My nose is running today.");
    assert.equal(run.tracePersisted, false); assert.equal(run.artifactPersisted, true);
    assert.ok(run.tracePersistenceDurationMs! >= 900); assert.ok(performance.now() - started < 5000);
    assert.ok(run.workflowDurationMs! < run.durationMs);
    assert.equal(JSON.parse(readFileSync(join(directory, "runs", `${run.runId}.json`), "utf8")).tracePersisted, false);
  } finally { app.observability.flush = originalFlush; await originalFlush(); await app.mastra.shutdown(); }
});
test("tampered prior context cannot suppress emergency action or dispatch a paid model", async () => {
  const directory = mkdtempSync(join(tmpdir(), "transport-context-")); let calls = 0;
  const app = createDispositionRuntime(directory, async () => { calls++; throw new Error("must not dispatch"); }, { profile: "adaptive-opus", budget: "compact" });
  try {
    const run = await app.assess("Crushing chest pressure radiating to my left arm, sweaty and nauseous.", undefined, undefined, undefined, { runId: randomUUID(), questionId: "adaptive-0123456789abcdef" });
    assert.equal(calls, 0); assert.equal(run.modelCalls, 0);
    assert.equal(run.failure, "CLARIFICATION_CONTEXT_INVALID"); assert.equal(run.status, "review_required");
    assert.equal(run.answer, null); assert.equal(run.artifactPersisted, true);
    assert.equal(run.responseEvents?.[0]?.kind, "action"); assert.match(run.safetyFloor!.directive, /Call 911 now/);
    const events = readFileSync(join(directory, "events", `${run.runId}.jsonl`), "utf8");
    assert.match(events, /workflow_not_started/); assert.doesNotMatch(events, /workflow_finished/);
  } finally { await app.mastra.shutdown(); }
});
test("the real workflow selects safety-envelope stream schemas and locally rejects malformed clinical prose", async () => {
  const directory = mkdtempSync(join(tmpdir(), "transport-adapter-"));
  const savedKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "synthetic-adapter-test-not-a-real-key";
  const app = createDispositionRuntime(directory, undefined, { profile: "adaptive-opus", budget: "compact", search: async () => ({ version: SEARCH_VERSION, corpusHash: digest([]), passages: [], audit: [] }) });
  const suppliedPlan = { emergency: true, emergencyDestination: "ED_NOW", emergencySource: 0, sameDaySource: null, clarification: null, queries: "malformed auxiliary query" };
  const suppliedAnswer = { decision: "final", clarification: null, answer: { disposition: "EMERGENCY_NOW", patientMessage: "UNSAFE UNVALIDATED ADVICE", reason: false, differential: 123, redFlags: "invalid", vitalSigns: false, questions: [], evidence: [], evidenceLimitations: "unsupported" }, support: "malformed support" };
  const calls: string[] = [];
  for (const [id, expectedSchema, candidate] of [["intakeAgent", referencedPlanTransport, suppliedPlan], ["dispositionAgent", compactAnswerTransport, suppliedAnswer]] as const) {
    const agent = app.mastra.getAgent(id);
    const fake = async (_prompt: unknown, rawOptions: unknown) => {
      const options = rawOptions as { structuredOutput: { schema: typeof planTransportSchema }; abortSignal: AbortSignal; maxSteps: number };
      calls.push(id); assert.equal(options.structuredOutput.schema, expectedSchema);
      assert.equal(options.maxSteps, 1); assert.equal(options.abortSignal.aborted, false);
      const parsed = options.structuredOutput.schema.safeParse(candidate);
      assert.equal(parsed.success, true); // Auxiliary defects do not erase safety.
      return stream({ object: Promise.resolve(parsed.data) });
    };
    agent.stream = fake as typeof agent.stream;
  }
  try {
    assert.equal(planSchema.safeParse(suppliedPlan).success, false);
    assert.equal(adaptiveOutputSchema.safeParse(suppliedAnswer).success, false);
    const run = await app.assess("I cannot pass any urine and have severe lower belly pain.");
    assert.deepEqual(calls, ["intakeAgent", "dispositionAgent"]); assert.equal(run.modelCalls, 2);
    assert.deepEqual(run.usage, { inputTokens: 42, outputTokens: 68 });
    assert.equal(run.status, "review_required"); assert.equal(run.answer, null);
    assert.equal(run.failure, "ANSWER_SCHEMA_FAILED"); assert.equal(run.safetyFloor?.disposition, "EMERGENCY_NOW");
    assert.equal(run.responseEvents!.some((event) => event.kind === "action"), true);
    assert.equal(run.responseEvents!.some((event) => event.kind === "patient_reply"), false);
    assert.doesNotMatch(JSON.stringify(run.responseEvents), /UNSAFE UNVALIDATED ADVICE/);
  } finally {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = savedKey;
    await app.mastra.shutdown();
  }
});

test("actual Anthropic adapter sends closed typed schemas, and parses the HTTP stream without live spending", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  const candidate = { emergency: false, emergencySource: null, emergencyDestination: null, sameDaySource: null, sameDayNeed: null, sameDayRationale: null, prescriptionReviewSource: null, clarification: null, queries: ["hypertension medication"] };
  function checkSchema(value: unknown, path = "schema") {
    assert.ok(value && typeof value === "object", `${path} must be a schema object`);
    const s = value as Record<string, any>;
    assert.ok(s.type || s.anyOf || s.allOf || s.$ref || s.const !== undefined || s.enum, `${path} has no type (a description is not a grammar)`);
    if (s.type === "object") {
      assert.equal(s.additionalProperties, false, `${path} must be closed`);
      for (const [key, child] of Object.entries(s.properties ?? {})) checkSchema(child, `${path}.${key}`);
    }
    if (s.items) checkSchema(s.items, `${path}[]`);
    for (const name of ["anyOf", "allOf"]) for (const child of s[name] ?? []) checkSchema(child, `${path}.${name}`);
  }
  try {
    for (const [model, schema] of [[FAST_MODEL, referencedPlanTransport], [MODEL, compactAnswerTransport]] as const) {
      const output = model === FAST_MODEL ? candidate : { decision: "final", clarification: null, clarificationAssessment: {decision:"not_needed",reason:"No question is required for this transport fixture."}, answer: { disposition: "SELF_CARE", reviewPriority:null, workType:null, reason: "Synthetic transport fixture only.", patientMessage: "Synthetic transport fixture, not medical advice.", differential: [], redFlags: [], vitalSigns: "No measurements supplied.", evidenceLimitations: "No research supplied for this transport test." }, citations: [] };
      globalThis.fetch = async (input, init) => {
        // All fetch calls are intercepted. Never fall through to real networking.
        calls++;
        assert.match(String(input), /^https:\/\/api\.anthropic\.com\/v1\/messages/);
        const body = JSON.parse(String(init?.body));
        const wireSchema = body.output_config?.format?.schema ?? body.output_format?.schema;
        assert.ok(wireSchema, `Missing provider-native schema; fields: ${Object.keys(body).join(",")}`);
        checkSchema(wireSchema);
        assert.equal(body.stream, true);
        const events = [
          { type: "message_start", message: { id: "msg_offline", type: "message", role: "assistant", model: model.split("/")[1], content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 21, output_tokens: 0, cache_read_input_tokens: 13, cache_creation_input_tokens: 5 } } },
          { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
          { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: JSON.stringify(output) } },
          { type: "content_block_stop", index: 0 },
          { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 34 } },
          { type: "message_stop" },
        ];
        return new Response(events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
      };
      const agent = new Agent({ id: `wire-${calls}`, name: "Offline provider adapter test", model: { id: model, apiKey: `synthetic-not-a-key-${randomUUID()}` }, instructions: "Synthetic fixture.", maxRetries: 0 });
      const result = await consumeStructuredStream({ signal: new AbortController().signal, start: signal => agent.stream("Synthetic fixture.", { abortSignal: signal, structuredOutput: { schema, errorStrategy: "strict" }, maxSteps: 1, modelSettings: { maxRetries: 0 } }) });
      assert.equal(result.failure, null); assert.deepEqual(result.output, output);
      // The installed provider adapter includes cache reads/writes in total input;
      // the separate counters must preserve that breakdown without double counting.
      assert.deepEqual(result.usage, { inputTokens: 39, outputTokens: 34 });
      assert.deepEqual(result.cacheUsage, { cachedInputTokens: 13, cacheCreationInputTokens: 5 });
      for (const timing of Object.values(result.transportTimings)) assert.ok(typeof timing === "number" && timing >= 0 && timing <= result.durationMs!);
    }
    assert.equal(calls, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test("HTTP request rejection is not reported as billing or local allowance exhaustion", async () => {
  const result = await consumeStructuredStream({ start: async () => { throw Object.assign(new Error("private request content"), { statusCode: 400 }); }, signal: new AbortController().signal });
  assert.equal(result.failure, "PROVIDER_REQUEST_REJECTED"); assert.equal(result.failureDetails?.httpStatus, 400);
  assert.doesNotMatch(JSON.stringify(result), /private|BUDGET|CREDIT/);
});
