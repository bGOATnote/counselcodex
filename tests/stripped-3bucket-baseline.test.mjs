import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  BUCKETS,
  SYSTEM_PROMPT,
  buildRequest,
  generate,
  loadCases,
  parseDisposition,
  settingsFor,
} from "../scripts/stripped-3bucket-baseline.mjs";
import { SETTINGS as V1_SETTINGS } from "../scripts/stripped-disposition-baseline.mjs";
import {
  ROUTE_TO_BUCKET,
  scoreCSV,
  scorePhysician,
} from "../scripts/score-stripped-3bucket-baseline.mjs";

const buckets = ["SELF_CARE", "ASYNC_PHYSICIAN", "URGENT_ESCALATION"];
const expectedPrompt = `Choose exactly one bucket for the patient message:
1. SELF_CARE
2. ASYNC_PHYSICIAN
3. URGENT_ESCALATION

Medication refill → ASYNC_PHYSICIAN unless clear emergency/same-day red flags → URGENT_ESCALATION.
Return only JSON with "disposition" (one exact bucket name) and "rationale" (short).`;
const disposition = (bucket = "ASYNC_PHYSICIAN") => ({
  disposition: bucket,
  rationale: "Synthetic routing explanation.",
});
const response = (value = disposition(), extra = {}) => ({
  id: "synthetic-provider-response",
  type: "message",
  role: "assistant",
  stop_reason: "end_turn",
  content: [{ type: "text", text: JSON.stringify(value) }],
  ...extra,
});
const syntheticCases = () => Array.from({ length: 50 }, (_, index) => ({
  id: `C${String(index + 1).padStart(2, "0")}`,
  message: `Synthetic message ${index + 1}.`,
  disposition: "CSV_LABEL_SENTINEL",
  physician: "PHYSICIAN_LABEL_SENTINEL",
}));
const quoteCsv = value => `"${String(value).replaceAll('"', '""')}"`;
const toCsv = rows => {
  const headers = ["id", "message", "disposition", "physician"];
  return [headers.join(","), ...rows.map(row => headers.map(header => quoteCsv(row[header])).join(","))].join("\r\n");
};
const syntheticScoreInputs = () => ({
  predictions: syntheticCases().map(({ id }) => ({ id, parsed: disposition("SELF_CARE") })),
  reference: {
    cases: syntheticCases().map(({ id }) => ({
      id,
      originalSuppliedLabel: "SELF_CARE",
      reference: {
        acceptedRoutes: id === "C25" ? [] : ["SELF_CARE"],
        note: id === "C25" ? "Synthetic excluded physician case." : "Synthetic reference.",
      },
    })),
  },
  csvRows: syntheticCases().map(({ id, message }) => ({ id, message, disposition: "SELF_CARE" })),
});

test("three-bucket prompt contains only the exact assignment taxonomy, refill rule, and JSON contract", () => {
  assert.deepEqual(BUCKETS, buckets);
  assert.equal(SYSTEM_PROMPT, expectedPrompt);
  const options = [...SYSTEM_PROMPT.matchAll(/^([1-3])\. ([A-Z_]+)$/gm)];
  assert.deepEqual(options.map(match => [Number(match[1]), match[2]]), buckets.map((bucket, index) => [index + 1, bucket]));
});

test("one-shot request preserves only the message and ignores labels, reference data, history, and overrides", () => {
  const message = "  Synthetic patient message, with a quote: \"hello\".\r\nSecond line.  ";
  const request = buildRequest({
    message,
    id: "CASE_ID_SENTINEL",
    disposition: "CSV_LABEL_SENTINEL",
    physician: "PHYSICIAN_LABEL_SENTINEL",
    acceptedRoutes: ["GOLD_ROUTE_SENTINEL"],
    history: "HISTORY_SENTINEL",
    system: "SYSTEM_OVERRIDE_SENTINEL",
    messages: [{ role: "system", content: "MESSAGES_OVERRIDE_SENTINEL" }],
    tools: [{ name: "TOOL_SENTINEL" }],
    model: "MODEL_OVERRIDE_SENTINEL",
    max_tokens: 1,
    output_config: { effort: "high" },
  });
  assert.deepEqual(request, {
    ...V1_SETTINGS,
    system: expectedPrompt,
    messages: [{ role: "user", content: message }],
  });
  assert.doesNotMatch(JSON.stringify(request), /(?:CASE_ID|CSV_LABEL|PHYSICIAN_LABEL|GOLD_ROUTE|HISTORY|SYSTEM_OVERRIDE|MESSAGES_OVERRIDE|TOOL|MODEL_OVERRIDE)_SENTINEL/);
});

test("Opus and an explicitly selected endpoint reuse v1 settings with only the model substituted", () => {
  const opusModel = "claude-opus-5";
  // This tests request construction only; provider availability needs a live preflight.
  const fableModel = "claude-fable-5-1";
  assert.deepEqual(settingsFor(opusModel), V1_SETTINGS);
  assert.deepEqual(settingsFor(fableModel), { ...V1_SETTINGS, model: fableModel });
  const input = { message: "Synthetic routing input." };
  const opus = buildRequest(input, opusModel);
  const fable = buildRequest(input, fableModel);
  assert.deepEqual(fable, { ...opus, model: fableModel });
  assert.deepEqual(opus.messages, [{ role: "user", content: input.message }]);
  assert.deepEqual(Object.keys(opus).sort(), ["max_tokens", "messages", "model", "output_config", "system", "thinking"]);
});

test("request rejects absent, blank, and non-string messages before a provider call", () => {
  for (const message of [undefined, null, "", "  \n\t", 7, [], {}]) {
    assert.throws(() => buildRequest({ message }));
  }
});

test("all 50 CSV messages can reach the producer without any other CSV columns", () => {
  const cases = syntheticCases();
  cases[0].message = '  Synthetic, quoted "message".\r\nA second line.\nAnd a third.  ';
  const projected = loadCases(toCsv(cases));
  assert.equal(projected.length, 50);
  assert.deepEqual(projected, cases.map(({ id, message }) => ({ id, message })));
  for (const input of projected) {
    const request = buildRequest(input);
    assert.deepEqual(request.messages, [{ role: "user", content: input.message }]);
    assert.doesNotMatch(JSON.stringify(request), /CSV_LABEL_SENTINEL|PHYSICIAN_LABEL_SENTINEL/);
  }
});

test("parser accepts exactly the three bucket names and a nonempty short rationale", () => {
  for (const bucket of buckets) {
    const expected = disposition(bucket);
    assert.deepEqual(parseDisposition(response(expected)), expected);
  }
});

test("parser consumes final text and ignores provider thinking blocks", () => {
  const expected = disposition("URGENT_ESCALATION");
  const raw = response(expected, {
    content: [
      { type: "thinking", thinking: "Synthetic non-answer content." },
      { type: "redacted_thinking", data: "synthetic" },
      { type: "text", text: JSON.stringify(expected) },
    ],
  });
  assert.deepEqual(parseDisposition(raw), expected);
  assert.throws(() => parseDisposition(response({}, {
    content: [{ type: "thinking", thinking: JSON.stringify(expected) }],
  })));
});

test("parser rejects five-way names, approximate bucket names, numeric choices, and old output schemas", () => {
  for (const invalid of [
    "PRIORITY_ASYNC", "STANDARD_ASYNC", "SAME_DAY_IN_PERSON", "EMERGENCY_NOW",
    "self_care", "ASYNC PHYSICIAN", "URGENT_ESCALATION ", " SELF_CARE", "OTHER",
    1, 2, 3, "1", "2", "3", null, undefined, [], {},
  ]) {
    assert.throws(() => parseDisposition(response({ ...disposition(), disposition: invalid })));
  }
  for (const invalid of [
    { disposition_id: 1, disposition_name: "SELF_CARE", rationale: "Synthetic explanation." },
    { bucket: "SELF_CARE", rationale: "Synthetic explanation." },
    { disposition_name: "SELF_CARE", rationale: "Synthetic explanation." },
  ]) {
    assert.throws(() => parseDisposition(response(invalid)));
  }
});

test("parser rejects additional fields even when the chosen bucket is valid", () => {
  for (const extra of [
    { disposition_id: 2 }, { disposition_name: "ASYNC_PHYSICIAN" },
    { evidence_cites: [] }, { reasoning: "Synthetic explanation." },
    { patient_reply: "Synthetic response." }, { acceptedRoutes: ["ASYNC_PHYSICIAN"] },
    { csvLabel: "ASYNC_PHYSICIAN" },
  ]) {
    assert.throws(() => parseDisposition(response({ ...disposition(), ...extra })));
  }
});

test("parser rejects missing, empty, and non-text rationale", () => {
  const missing = disposition();
  delete missing.rationale;
  assert.throws(() => parseDisposition(response(missing)));
  for (const rationale of ["", " \n\t", null, 3, [], {}]) {
    assert.throws(() => parseDisposition(response({ ...disposition(), rationale })));
  }
});

test("parser rejects malformed or missing JSON and non-object outputs", () => {
  for (const text of ["not JSON", "{", "null", "[]", "2", '"SELF_CARE"']) {
    assert.throws(() => parseDisposition(response({}, { content: [{ type: "text", text }] })));
  }
  for (const content of [undefined, null, []]) {
    assert.throws(() => parseDisposition(response({}, { content })));
  }
});

test("parser rejects truncated and unfinished provider responses even if their JSON is otherwise valid", () => {
  for (const stop_reason of ["max_tokens", "tool_use", "stop_sequence", "pause_turn", "refusal", null, undefined]) {
    assert.throws(() => parseDisposition(response(disposition(), { stop_reason })));
  }
});

test("physician scoring collapses both async routes and both urgent routes into their assignment buckets", () => {
  assert.deepEqual(ROUTE_TO_BUCKET, {
    SELF_CARE: "SELF_CARE",
    PRIORITY_ASYNC: "ASYNC_PHYSICIAN",
    STANDARD_ASYNC: "ASYNC_PHYSICIAN",
    SAME_DAY_IN_PERSON: "URGENT_ESCALATION",
    EMERGENCY_NOW: "URGENT_ESCALATION",
  });
  const { predictions, reference } = syntheticScoreInputs();
  for (const [index, routes, bucket] of [
    [0, ["PRIORITY_ASYNC"], "ASYNC_PHYSICIAN"],
    [1, ["STANDARD_ASYNC"], "ASYNC_PHYSICIAN"],
    [2, ["SAME_DAY_IN_PERSON"], "URGENT_ESCALATION"],
    [3, ["EMERGENCY_NOW"], "URGENT_ESCALATION"],
    [4, ["PRIORITY_ASYNC", "STANDARD_ASYNC"], "ASYNC_PHYSICIAN"],
    [5, ["SAME_DAY_IN_PERSON", "EMERGENCY_NOW"], "URGENT_ESCALATION"],
  ]) {
    predictions[index].parsed = disposition(bucket);
    reference.cases[index].reference.acceptedRoutes = routes;
  }
  const scored = scorePhysician(predictions, reference);
  assert.equal(scored.agree, 49);
  assert.equal(scored.denominator, 49);
  assert.deepEqual(scored.rows[4].acceptedBuckets, ["ASYNC_PHYSICIAN"]);
  assert.deepEqual(scored.rows[5].acceptedBuckets, ["URGENT_ESCALATION"]);
  predictions[0].parsed = disposition("URGENT_ESCALATION");
  predictions[2].parsed = disposition("ASYNC_PHYSICIAN");
  assert.deepEqual(scorePhysician(predictions, reference).rows.filter(row => row.included && !row.agrees).map(row => row.id), ["C01", "C03"]);
});

test("physician scoring accepts any explicitly accepted bucket and joins reference rows by case id", () => {
  const { predictions, reference } = syntheticScoreInputs();
  reference.cases[0].reference.acceptedRoutes = ["SELF_CARE", "STANDARD_ASYNC"];
  reference.cases.reverse();
  assert.equal(scorePhysician(predictions, reference).agree, 49);
  predictions[0].parsed = disposition("ASYNC_PHYSICIAN");
  assert.equal(scorePhysician(predictions, reference).agree, 49);
  predictions[0].parsed = disposition("URGENT_ESCALATION");
  assert.equal(scorePhysician(predictions, reference).agree, 48);
});

test("C25 remains excluded from physician agreement and included in the separate CSV score", () => {
  const { predictions, reference, csvRows } = syntheticScoreInputs();
  predictions[24].parsed = disposition("URGENT_ESCALATION");
  const physician = scorePhysician(predictions, reference);
  const csv = scoreCSV(predictions, csvRows);
  assert.equal(physician.scorecard, "A");
  assert.equal(physician.denominator, 49);
  assert.equal(physician.agree, 49);
  assert.equal(physician.missCount, 0);
  assert.equal(physician.agreement, 1);
  assert.deepEqual(physician.excludedIds, ["C25"]);
  assert.equal(physician.rows.find(row => row.id === "C25").included, false);
  assert.equal(physician.rows.find(row => row.id === "C25").agrees, null);
  assert.equal(csv.scorecard, "B");
  assert.equal(csv.denominator, 50);
  assert.equal(csv.agree, 49);
  assert.equal(csv.missCount, 1);
  assert.deepEqual(csv.rows.filter(row => !row.agrees).map(row => row.id), ["C25"]);
  predictions[24].parsed = disposition("SELF_CARE");
  assert.equal(scorePhysician(predictions, reference).agree, 49);
  assert.equal(scoreCSV(predictions, csvRows).agree, 50);
});

test("CSV scoring uses exact assignment buckets and joins by id without physician input", () => {
  const { predictions, csvRows } = syntheticScoreInputs();
  predictions[0].parsed = disposition("ASYNC_PHYSICIAN");
  csvRows[0].disposition = "ASYNC_PHYSICIAN";
  predictions[1].parsed = disposition("URGENT_ESCALATION");
  csvRows[1].disposition = "URGENT_ESCALATION";
  csvRows.reverse();
  assert.equal(scoreCSV(predictions, csvRows).agree, 50);
  predictions[0].parsed = disposition("URGENT_ESCALATION");
  predictions[1].parsed = disposition("ASYNC_PHYSICIAN");
  predictions[2].parsed = disposition("ASYNC_PHYSICIAN");
  const scored = scoreCSV(predictions, csvRows);
  assert.equal(scored.agree, 47);
  assert.equal(scored.agreement, 47 / 50);
  assert.deepEqual(scored.rows.filter(row => !row.agrees).map(row => row.id), ["C01", "C02", "C03"]);
});

test("physician score is invariant to originalSuppliedLabel and separate CSV scoring", () => {
  const { predictions, reference, csvRows } = syntheticScoreInputs();
  const original = scorePhysician(predictions, reference);
  for (const entry of reference.cases) entry.originalSuppliedLabel = "URGENT_ESCALATION";
  csvRows[0].disposition = "URGENT_ESCALATION";
  csvRows[1].disposition = "ASYNC_PHYSICIAN";
  assert.deepEqual(scorePhysician(predictions, reference), original);
  assert.equal(scoreCSV(predictions, csvRows).agree, 48);
  assert.equal(original.agree, 49);
  assert.deepEqual(scorePhysician(predictions, reference), original);
});

test("within-five statement counts only physician disagreements in the 49 included cases", () => {
  const { predictions, reference } = syntheticScoreInputs();
  for (const prediction of predictions.slice(0, 5)) prediction.parsed = disposition("URGENT_ESCALATION");
  predictions[24].parsed = disposition("URGENT_ESCALATION");
  const fiveMisses = scorePhysician(predictions, reference);
  assert.equal(fiveMisses.agree, 44);
  assert.equal(fiveMisses.missCount, 5);
  assert.equal(fiveMisses.withinFiveOfPhysicianLabels, true);
  predictions[5].parsed = disposition("URGENT_ESCALATION");
  const sixMisses = scorePhysician(predictions, reference);
  assert.equal(sixMisses.agree, 43);
  assert.equal(sixMisses.missCount, 6);
  assert.equal(sixMisses.withinFiveOfPhysicianLabels, false);
});

test("both scorecards reject malformed prediction cohorts and non-bucket predictions", () => {
  const { predictions, reference, csvRows } = syntheticScoreInputs();
  const duplicate = structuredClone(predictions);
  duplicate[49].id = "C01";
  const unknown = structuredClone(predictions);
  unknown[49].id = "C99";
  const reordered = structuredClone(predictions);
  [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
  const invalid = structuredClone(predictions);
  invalid[0].parsed.disposition = "PRIORITY_ASYNC";
  const missing = structuredClone(predictions);
  missing[0].parsed = null;
  for (const cohort of [predictions.slice(0, 49), [...predictions, predictions[0]], duplicate, unknown, reordered, invalid, missing]) {
    assert.throws(() => scorePhysician(cohort, reference));
    assert.throws(() => scoreCSV(cohort, csvRows));
  }
});

test("scorecards reject missing, duplicate, unknown, and invalid label rows", () => {
  const { predictions, reference, csvRows } = syntheticScoreInputs();
  for (const mutate of [
    rows => rows.pop(),
    rows => rows.push(structuredClone(rows[0])),
    rows => { rows[49].id = "C01"; },
    rows => { rows[49].id = "C99"; },
  ]) {
    const badReference = structuredClone(reference);
    const badCSV = structuredClone(csvRows);
    mutate(badReference.cases);
    mutate(badCSV);
    assert.throws(() => scorePhysician(predictions, badReference));
    assert.throws(() => scoreCSV(predictions, badCSV));
  }
  for (const acceptedRoutes of [undefined, null, [], ["ASYNC_PHYSICIAN"], ["UNKNOWN_ROUTE"]]) {
    const badReference = structuredClone(reference);
    badReference.cases[0].reference.acceptedRoutes = acceptedRoutes;
    assert.throws(() => scorePhysician(predictions, badReference));
  }
  for (const invalidBucket of [undefined, null, "SELF_CARE ", "self_care", "PRIORITY_ASYNC", 1]) {
    const badCSV = structuredClone(csvRows);
    badCSV[0].disposition = invalidBucket;
    assert.throws(() => scoreCSV(predictions, badCSV));
  }
});

test("generation makes one model lookup and 50 one-shot message-only calls; resume makes no calls", async () => {
  const directory = mkdtempSync(join(tmpdir(), "stripped-3bucket-test-"));
  const csvPath = join(directory, "synthetic.csv");
  const priorPath = join(directory, "synthetic-prior-completion.json");
  const output = join(directory, "run");
  const cases = syntheticCases();
  const model = "claude-opus-5";
  writeFileSync(csvPath, toCsv(cases));
  writeFileSync(priorPath, JSON.stringify({ priorAccountedUSD: 0, accountedUSD: 0, remainingAllocationUSD: 95 }));
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.ANTHROPIC_API_KEY;
  const originalLog = console.log;
  const calls = [];
  const readJSON = path => JSON.parse(readFileSync(path, "utf8"));
  try {
    process.env.ANTHROPIC_API_KEY = "synthetic-test-key";
    console.log = () => {};
    globalThis.fetch = async (url, options = {}) => {
      const method = options.method ?? "GET";
      const body = options.body ? JSON.parse(options.body) : null;
      calls.push({ url, method, body });
      assert.equal(options.headers["x-api-key"], "synthetic-test-key");
      if (method === "GET") {
        assert.equal(url, `https://api.anthropic.com/v1/models/${model}`);
        return Response.json({ id: model, type: "model", display_name: "Synthetic test model" });
      }
      assert.equal(method, "POST");
      assert.equal(url, "https://api.anthropic.com/v1/messages");
      assert.equal(body.model, model);
      assert.equal(body.system, expectedPrompt);
      assert.equal(body.messages.length, 1);
      assert.equal(body.messages[0].role, "user");
      assert.doesNotMatch(JSON.stringify(body), /CSV_LABEL_SENTINEL|PHYSICIAN_LABEL_SENTINEL/);
      return Response.json(response(disposition(), {
        model,
        usage: { input_tokens: 100, output_tokens: 20 },
      }), { headers: { "request-id": `synthetic-request-${calls.length}` } });
    };

    const completed = await generate(model, csvPath, output, priorPath);
    assert.equal(calls.filter(call => call.method === "GET").length, 1);
    const posts = calls.filter(call => call.method === "POST");
    assert.equal(posts.length, 50);
    assert.deepEqual(posts.map(call => call.body.messages[0].content).sort(), cases.map(entry => entry.message).sort());
    assert.equal(completed.providerCalls, 50);
    assert.equal(completed.validDispositions, 50);
    assert.deepEqual(completed.failedCases, []);
    assert.equal(Object.keys(completed.artifactHashes).length, 150);
    assert.equal(readdirSync(output).filter(name => /^C\d{2}-(request|raw|parsed)\.json$/.test(name)).length, 150);
    for (const input of cases) {
      assert.deepEqual(readJSON(join(output, `${input.id}-request.json`)).body.messages, [{ role: "user", content: input.message }]);
      assert.equal(readJSON(join(output, `${input.id}-raw.json`)).status, 200);
      const parsed = readJSON(join(output, `${input.id}-parsed.json`));
      assert.deepEqual(parsed.parsed, disposition());
      assert.equal(parsed.providerCalls, 1);
      assert.equal(parsed.failure, null);
    }
    const frozen = readFileSync(join(output, "generation-complete.json"), "utf8");
    const resumed = await generate(model, csvPath, output, priorPath);
    assert.equal(calls.length, 51);
    assert.equal(resumed.providerCalls, 50);
    assert.deepEqual(resumed.artifactHashes, completed.artifactHashes);
    assert.equal(readFileSync(join(output, "generation-complete.json"), "utf8"), frozen);

    // Simulate an interrupted case after its request was written: never send a second call.
    rmSync(join(output, "C01-parsed.json"));
    await assert.rejects(generate(model, csvPath, output, priorPath), /Already started C01; no second provider call allowed/);
    assert.equal(calls.length, 51);
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
    rmSync(directory, { recursive: true, force: true });
  }
});
