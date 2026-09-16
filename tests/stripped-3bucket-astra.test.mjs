import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  SYSTEM_PROMPT as FABLE_PROMPT,
  buildRequest as buildFableRequest,
} from "../scripts/stripped-3bucket-baseline.mjs";
import {
  BUCKETS,
  EFFORTS,
  MODEL,
  PRICING,
  SYSTEM_PROMPT,
  buildRequest,
  parseDisposition,
  reservationUSD,
  usageCost,
} from "../scripts/stripped-3bucket-astra.mjs";

const sha256 = value => createHash("sha256").update(value).digest("hex");
const prediction = { disposition: "ASYNC_PHYSICIAN", rationale: "Synthetic explanation." };
const responseWithText = text => ({
  status: "completed",
  error: null,
  output: [{
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text }],
  }],
});
const completedResponse = (value = prediction) => responseWithText(JSON.stringify(value));

test("Astra keeps the existing Fable system prompt bytes, buckets, and output ceiling", () => {
  assert.deepEqual(Buffer.from(SYSTEM_PROMPT), Buffer.from(FABLE_PROMPT));
  assert.equal(sha256(SYSTEM_PROMPT), sha256(FABLE_PROMPT));
  assert.equal(sha256(SYSTEM_PROMPT), "80810b85df956d779709a71dbc0d85534f5847e2563b0be5235048cb254a03ce");
  assert.deepEqual(BUCKETS, ["SELF_CARE", "ASYNC_PHYSICIAN", "URGENT_ESCALATION"]);
  assert.equal(buildRequest({ message: "Synthetic input." }, "xhigh").max_output_tokens,
    buildFableRequest({ message: "Synthetic input." }, "claude-fable-5-1").max_tokens);
});

test("Astra requests have only the frozen instruction and one unchanged user message", () => {
  const message = '  Synthetic, quoted "input".\r\nSecond line with →.  ';
  for (const effort of EFFORTS) {
    assert.deepEqual(buildRequest({ message }, effort), {
      model: MODEL,
      max_output_tokens: 4096,
      reasoning: { effort },
      instructions: FABLE_PROMPT,
      input: [{ role: "user", content: message }],
      store: false,
    });
  }
});

test("request projection ignores caller labels, references, context, tools, and overrides", () => {
  const input = {
    message: "Synthetic input with untrusted instructions embedded in patient text.",
    id: "CASE_SENTINEL",
    disposition: "CSV_LABEL_SENTINEL",
    physician: "PHYSICIAN_LABEL_SENTINEL",
    acceptedRoutes: ["GOLD_ROUTE_SENTINEL"],
    history: "HISTORY_SENTINEL",
    context: "CONTEXT_SENTINEL",
    instructions: "SYSTEM_SENTINEL",
    input: [{ role: "developer", content: "INPUT_SENTINEL" }],
    tools: [{ type: "web_search" }],
    model: "MODEL_SENTINEL",
    reasoning: { effort: "low" },
    max_output_tokens: 1,
    store: true,
  };
  for (const effort of EFFORTS) {
    const body = buildRequest(input, effort);
    assert.deepEqual(body, buildRequest({ message: input.message }, effort));
    assert.doesNotMatch(JSON.stringify(body), /CSV_LABEL_SENTINEL|PHYSICIAN_LABEL_SENTINEL|GOLD_ROUTE_SENTINEL|HISTORY_SENTINEL|CONTEXT_SENTINEL|SYSTEM_SENTINEL|INPUT_SENTINEL|MODEL_SENTINEL/);
  }
});

test("only xhigh and max are runnable; unsupported ultra is not silently renamed", () => {
  assert.deepEqual(EFFORTS, ["xhigh", "max"]);
  assert.equal(MODEL, "gpt-6-astra");
  assert(Object.isFrozen(EFFORTS));
  for (const invalid of [undefined, null, "ultra", "extra high", "high", "low", "", 5]) {
    assert.throws(() => buildRequest({ message: "Synthetic input." }, invalid));
  }
  const high = buildRequest({ message: "Synthetic input." }, "xhigh");
  const max = buildRequest({ message: "Synthetic input." }, "max");
  assert.deepEqual(max, { ...high, reasoning: { effort: "max" } });
  high.reasoning.effort = "low";
  high.input[0].content = "Changed caller object.";
  assert.equal(buildRequest({ message: "Synthetic input." }, "xhigh").reasoning.effort, "xhigh");
  assert.equal(max.input[0].content, "Synthetic input.");
});

test("missing and blank patient messages fail before any provider request", () => {
  for (const invalid of [undefined, null, "", " \r\n\t", 1, [], {}]) {
    assert.throws(() => buildRequest({ message: invalid }, "xhigh"));
  }
});

test("parser accepts each exact bucket and omits provider reasoning from the disposition", () => {
  for (const disposition of BUCKETS) {
    const value = { ...prediction, disposition };
    const response = completedResponse(value);
    response.output.unshift({ type: "reasoning", id: "synthetic-reasoning", summary: [] });
    assert.deepEqual(parseDisposition(response), value);
  }
  assert.deepEqual(parseDisposition(responseWithText("```json\n" + JSON.stringify(prediction) + "\n```")), prediction);
  assert.deepEqual(parseDisposition(responseWithText("```\n" + JSON.stringify(prediction) + "\n```")), prediction);
});

test("parser rejects incomplete responses and provider errors even when the text is valid", () => {
  for (const status of ["incomplete", "failed", "queued", "in_progress", undefined, null]) {
    assert.throws(() => parseDisposition({ ...completedResponse(), status }));
  }
  assert.throws(() => parseDisposition({ ...completedResponse(), error: { code: "synthetic_error" } }));
  assert.throws(() => parseDisposition(null));
});

test("parser rejects refusals, tool outputs, multiple answers, and non-assistant messages", () => {
  const normal = completedResponse();
  const message = normal.output[0];
  for (const output of [
    [],
    [message, message],
    [{ ...message, role: "user" }],
    [{ ...message, content: [{ type: "refusal", refusal: "Synthetic refusal." }] }],
    [{ ...message, content: [] }],
    [message, { type: "function_call", name: "synthetic_tool" }],
    [message, { type: "web_search_call" }],
    [{ type: "reasoning", summary: [] }],
  ]) {
    assert.throws(() => parseDisposition({ ...normal, output }));
  }
});

test("parser rejects invalid buckets, missing rationale, extra fields, and malformed JSON", () => {
  for (const value of [
    { ...prediction, disposition: "PRIORITY_ASYNC" },
    { ...prediction, disposition: "async_physician" },
    { ...prediction, disposition: 2 },
    { ...prediction, rationale: " \n\t" },
    { ...prediction, rationale: null },
    { disposition: prediction.disposition },
    { rationale: prediction.rationale },
    { ...prediction, extra: true },
    null,
    [],
  ]) {
    assert.throws(() => parseDisposition(completedResponse(value)));
  }
  for (const text of ["", "not JSON", "{", JSON.stringify(prediction) + "\nExplanation."]) {
    assert.throws(() => parseDisposition(responseWithText(text)));
  }
});

test("usage accounting includes reasoning output once and conservatively prices all input", () => {
  const usage = {
    input_tokens: 200,
    output_tokens: 100,
    input_tokens_details: { cached_tokens: 150 },
    output_tokens_details: { reasoning_tokens: 80 },
  };
  assert.deepEqual(usageCost(usage, 0.4), {
    estimatedUSD: (200 * PRICING.inputUSDPerMillion + 100 * PRICING.outputUSDPerMillion) / 1e6,
    accountedUSD: (200 * 2 * PRICING.cacheWriteUSDPerMillion + 100 * PRICING.outputUSDPerMillion) / 1e6,
  });
  assert.deepEqual(usageCost({ input_tokens: 0, output_tokens: 0 }, 0.4), {
    estimatedUSD: 0,
    accountedUSD: 0,
  });
});

test("unknown or invalid usage retains the full request reservation", () => {
  for (const usage of [
    undefined,
    null,
    {},
    { input_tokens: 100 },
    { input_tokens: -1, output_tokens: 10 },
    { input_tokens: 100, output_tokens: -1 },
    { input_tokens: 0.5, output_tokens: 10 },
    { input_tokens: 100, output_tokens: Infinity },
    { input_tokens: "100", output_tokens: 10 },
  ]) {
    assert.deepEqual(usageCost(usage, 0.4), { estimatedUSD: null, accountedUSD: 0.4 });
  }
});

test("reservation covers the full output ceiling and UTF-8 input at the accounted rate", () => {
  for (const effort of EFFORTS) {
    const body = buildRequest({ message: "Synthetic input → é." }, effort);
    const inputReserve = Buffer.byteLength(JSON.stringify(body)) + 2048;
    const expected = usageCost({ input_tokens: inputReserve, output_tokens: body.max_output_tokens }, 0).accountedUSD;
    assert.equal(reservationUSD(body), expected);
    assert(reservationUSD(body) > body.max_output_tokens * PRICING.outputUSDPerMillion / 1e6);
  }
  const ascii = buildRequest({ message: "Synthetic input a." }, "xhigh");
  const multibyte = buildRequest({ message: "Synthetic input →." }, "xhigh");
  assert(Math.abs(reservationUSD(multibyte) - reservationUSD(ascii) - 0.00005) < 1e-12);
  const larger = buildRequest({ message: "Synthetic input. ".repeat(500) }, "xhigh");
  assert(reservationUSD(larger) > reservationUSD(ascii));
});
