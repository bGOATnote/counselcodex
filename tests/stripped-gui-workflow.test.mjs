import test from "node:test";
import assert from "node:assert/strict";
import { createStrippedWorkflow } from "../src/stripped/workflow.ts";
import { buildRequest as frozenRequest } from "../scripts/stripped-3bucket-baseline.mjs";

const secret = "TEST_API_KEY_CANARY_4961";
const final = { disposition: "ASYNC_PHYSICIAN", rationale: "Synthetic fixture rationale; preserve these words exactly." };
function providerResponse(overrides = {}) {
  return {
    id: "msg-fixture", model: "claude-fable-5-1", stop_reason: "end_turn",
    content: [
      { type: "thinking", thinking: "HIDDEN_REASONING_CANARY", signature: "SIGNATURE_CANARY" },
      { type: "redacted_thinking", data: "REDACTED_REASONING_CANARY" },
      { type: "text", text: JSON.stringify(final), signature: "TEXT_SIGNATURE_CANARY" },
    ],
    usage: { input_tokens: 110, output_tokens: 35, cache_read_input_tokens: 20, cache_creation_input_tokens: 10 },
    headers: { "x-api-key": secret }, metadata: { credential: secret },
    ...overrides,
  };
}

async function execute(mockFetch, message = " \r\nSynthetic refill message 🩺\t ") {
  const workflow = createStrippedWorkflow({ apiKey: secret, fetch: mockFetch });
  const run = await workflow.createRun({ runId: "stripped-mocked-run", disableScorers: true });
  const execution = await run.start({ inputData: { message }, tracingOptions: { hideInput: true, hideOutput: true } });
  assert.equal(execution.status, "success");
  return execution.result;
}

test("real stripped Mastra workflow sends one byte-identical frozen Fable request and preserves the answer", async () => {
  const calls = [];
  const message = " \r\nSynthetic refill message 🩺\t ";
  const result = await execute(async (url, init) => {
    calls.push({ url, init });
    return Response.json(providerResponse(), { headers: { "request-id": "req-fixture" } });
  }, message);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.anthropic.com/v1/messages");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(new Headers(calls[0].init.headers).get("x-api-key"), secret);
  assert.equal(new Headers(calls[0].init.headers).get("anthropic-version"), "2023-06-01");
  assert.equal(calls[0].init.body, JSON.stringify(frozenRequest({ message }, "claude-fable-5-1")));
  assert.equal(result.id, "stripped-mocked-run");
  assert.equal(result.status, "complete");
  assert.equal(result.message, message);
  assert.deepEqual(result.result, final);
  assert.equal(result.error, null);
  assert.deepEqual(result.trace.request, frozenRequest({ message }, "claude-fable-5-1"));
  assert.equal(result.trace.providerCalls, 1);
  assert.equal(result.trace.providerRequestId, "req-fixture");
  assert.equal(result.trace.workflowId, "stripped-fable-5-1");
  assert.equal(result.trace.stepId, "one-disposition");
  assert.ok(result.trace.latencyMs >= 0);
  assert.ok(Date.parse(result.completedAt) >= Date.parse(result.createdAt));
});

test("stripped run trace retains final text and usage while omitting hidden reasoning, signatures and credentials", async () => {
  const result = await execute(async () => Response.json(providerResponse(), { headers: { "request-id": "req-fixture" } }));
  assert.deepEqual(result.trace.response.content, [{ type: "text", text: JSON.stringify(final) }]);
  assert.deepEqual(result.trace.usage, { inputTokens: 110, outputTokens: 35, cacheReadTokens: 20, cacheWriteTokens: 10 });
  assert.ok(result.trace.estimatedUSD > 0);
  const trace = JSON.stringify(result);
  for (const canary of [secret, "HIDDEN_REASONING_CANARY", "SIGNATURE_CANARY", "REDACTED_REASONING_CANARY", "TEXT_SIGNATURE_CANARY"]) assert.equal(trace.includes(canary), false, canary);
  assert.equal(result.trace.response.stop_reason, "end_turn");
  assert.equal(result.trace.response.model, "claude-fable-5-1");
});

test("missing or malformed usage remains unknown while a valid final disposition is preserved", async () => {
  for (const usage of [undefined, {}, { input_tokens: 10 }, { output_tokens: 10 },
    { input_tokens: -1, output_tokens: 10 }, { input_tokens: 1.5, output_tokens: 10 },
    { input_tokens: 10, output_tokens: Number.MAX_SAFE_INTEGER + 1 },
    { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: "invalid" },
    { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: -1 },
  ]) {
    const result = await execute(async () => Response.json(providerResponse({ usage })));
    assert.equal(result.status, "complete");
    assert.deepEqual(result.result, final);
    assert.equal(result.trace.usage, null, JSON.stringify(usage));
    assert.equal(result.trace.response.usage, null);
    assert.equal(result.trace.estimatedUSD, null);
  }
  const zero = await execute(async () => Response.json(providerResponse({ usage: { input_tokens: 0, output_tokens: 0 } })));
  assert.deepEqual(zero.trace.usage, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
});

test("stripped workflow has no retries for provider rate limits, server errors or transport exceptions", async () => {
  for (const failure of [429, 503, "transport"]) {
    let calls = 0;
    const result = await execute(async () => {
      calls++;
      if (failure === "transport") throw new Error(`Request leaked x-api-key: ${secret}`);
      return Response.json({ error: { message: secret } }, { status: failure, headers: { "request-id": "req-failure" } });
    });
    assert.equal(calls, 1, String(failure));
    assert.equal(result.status, "error");
    assert.equal(result.result, null);
    assert.equal(result.trace.providerCalls, 1);
    assert.equal(result.trace.response, null);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(secret));
    if (typeof failure === "number") {
      assert.equal(result.error, `Provider HTTP ${failure}`);
      assert.equal(result.trace.providerRequestId, "req-failure");
    } else assert.match(result.error, /No retry was made/);
  }
});

test("stripped workflow rejects incomplete, malformed and noncontract output without retries or a fallback answer", async () => {
  const invalid = [
    providerResponse({ stop_reason: "max_tokens" }),
    providerResponse({ content: [{ type: "text", text: "not JSON" }] }),
    providerResponse({ content: [{ type: "text", text: JSON.stringify({ ...final, disposition: "EMERGENCY_NOW" }) }] }),
    providerResponse({ content: [{ type: "text", text: JSON.stringify({ ...final, extra: "not allowed" }) }] }),
    providerResponse({ content: [{ type: "text", text: JSON.stringify({ ...final, rationale: " " }) }] }),
  ];
  for (const response of invalid) {
    let calls = 0;
    const result = await execute(async () => { calls++; return Response.json(response); });
    assert.equal(calls, 1);
    assert.equal(result.status, "error");
    assert.equal(result.result, null);
    assert.match(result.error, /invalid disposition JSON/);
    assert.ok(result.trace.response);
    assert.equal(JSON.stringify(result.trace).includes("HIDDEN_REASONING_CANARY"), false);
  }
});

test("consecutive stripped workflow runs do not pass prior messages or responses into a new request", async () => {
  const submitted = [];
  for (const message of ["First synthetic message", "Second synthetic message", "Second synthetic message, edited"]) {
    const result = await execute(async (_url, init) => {
      submitted.push(JSON.parse(init.body));
      return Response.json(providerResponse());
    }, message);
    assert.equal(result.message, message);
  }
  assert.deepEqual(submitted.map((request) => request.messages), [
    [{ role: "user", content: "First synthetic message" }],
    [{ role: "user", content: "Second synthetic message" }],
    [{ role: "user", content: "Second synthetic message, edited" }],
  ]);
});
