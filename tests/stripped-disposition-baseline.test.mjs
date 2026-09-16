import assert from "node:assert/strict";
import test from "node:test";
import {
  SYSTEM_PROMPT,
  buildRequest,
  loadCases,
  parseDisposition,
} from "../scripts/stripped-disposition-baseline.mjs";
import {
  CSV_ACCEPTED_IDS,
  scoreCSV,
  scorePhysician,
} from "../scripts/score-stripped-disposition-baseline.mjs";

const names = [
  "SELF_CARE",
  "PRIORITY_ASYNC",
  "STANDARD_ASYNC",
  "SAME_DAY_IN_PERSON",
  "EMERGENCY_NOW",
];
const syntheticCases = () => Array.from({ length: 50 }, (_, index) => ({
  id: `C${String(index + 1).padStart(2, "0")}`,
  message: `Synthetic message ${index + 1}.`,
  disposition: "CSV_LABEL_SENTINEL",
  physician: "PHYSICIAN_LABEL_SENTINEL",
}));
const quoteCsv = value => `"${String(value).replaceAll('"', '""')}"`;
const toCsv = (rows, headers = ["id", "message", "disposition", "physician"]) => [
  headers.join(","),
  ...rows.map(row => headers.map(header => quoteCsv(row[header] ?? "")).join(",")),
].join("\r\n");
const disposition = (id = 2) => ({
  disposition_id: id,
  disposition_name: names[id - 1],
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
const syntheticScoreInputs = () => ({
  predictions: syntheticCases().map(({ id }) => ({ id, parsed: disposition(1) })),
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

test("producer system prompt has exactly the five numbered disposition names", () => {
  const options = [...SYSTEM_PROMPT.matchAll(/^\s*([1-5])[.)]\s+([A-Z_]+)\b/gm)];
  assert.deepEqual(options.map(match => [Number(match[1]), match[2]]),
    names.map((name, index) => [index + 1, name]));
});

test("request contains one unchanged patient message and ignores all supplied scoring fields", () => {
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
  });
  assert.deepEqual(request, {
    model: "claude-opus-5",
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: message }],
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
  });
  assert.doesNotMatch(JSON.stringify(request), /(?:CASE_ID|CSV_LABEL|PHYSICIAN_LABEL|GOLD_ROUTE|HISTORY|SYSTEM_OVERRIDE|MESSAGES_OVERRIDE)_SENTINEL/);
});

test("CSV loader returns only ids and messages, preserving quoted commas, quotes, and line endings", () => {
  const rows = syntheticCases();
  rows[0].message = '  Synthetic, quoted "message".\r\nA second line.\nAnd a third.  ';
  const loaded = loadCases(toCsv(rows));
  assert.deepEqual(loaded, rows.map(({ id, message }) => ({ id, message })));
  for (const row of loaded) {
    assert.deepEqual(Object.keys(row).sort(), ["id", "message"]);
    const request = buildRequest(row);
    assert.doesNotMatch(JSON.stringify(request), /CSV_LABEL_SENTINEL|PHYSICIAN_LABEL_SENTINEL/);
  }
});

test("CSV loader rejects incomplete, oversized, duplicate, unknown, and reordered cohorts", () => {
  const short = syntheticCases().slice(0, 49);
  const long = [...syntheticCases(), { id: "C51", message: "Extra synthetic message." }];
  const duplicate = syntheticCases();
  duplicate[49].id = "C01";
  const unknown = syntheticCases();
  unknown[49].id = "C99";
  const reordered = syntheticCases();
  [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
  for (const rows of [short, long, duplicate, unknown, reordered]) {
    assert.throws(() => loadCases(toCsv(rows)));
  }
});

test("CSV loader rejects missing required headers", () => {
  assert.throws(() => loadCases(toCsv(syntheticCases(), ["id", "disposition"])));
  assert.throws(() => loadCases(toCsv(syntheticCases(), ["message", "disposition"])));
});

test("parser accepts all five exact number and name pairs", () => {
  for (let id = 1; id <= 5; id += 1) {
    assert.deepEqual(parseDisposition(response(disposition(id))), disposition(id));
  }
});

test("parser preserves optional evidence cites and ignores non-text thinking blocks", () => {
  const expected = { ...disposition(4), evidence_cites: ["Synthetic message: symptom stated."] };
  const raw = response(expected, {
    content: [
      { type: "thinking", thinking: "Not JSON; synthetic private reasoning." },
      { type: "redacted_thinking", data: "synthetic" },
      { type: "text", text: JSON.stringify(expected) },
    ],
  });
  assert.deepEqual(parseDisposition(raw), expected);
});

test("parser rejects invalid JSON and responses without a final text disposition", () => {
  for (const text of ["not JSON", "{", JSON.stringify(null), JSON.stringify([])]) {
    assert.throws(() => parseDisposition(response({}, { content: [{ type: "text", text }] })));
  }
  assert.throws(() => parseDisposition(response({}, {
    content: [{ type: "thinking", thinking: JSON.stringify(disposition()) }],
  })));
});

test("parser rejects mismatched names and invalid numeric selections", () => {
  assert.throws(() => parseDisposition(response({ ...disposition(2), disposition_name: "STANDARD_ASYNC" })));
  assert.throws(() => parseDisposition(response({ ...disposition(2), disposition_name: "priority_async" })));
  for (const disposition_id of [0, 6, 2.5, "2", null]) {
    assert.throws(() => parseDisposition(response({ ...disposition(2), disposition_id })));
  }
});

test("parser rejects missing, empty, or non-text rationale", () => {
  const missing = disposition();
  delete missing.rationale;
  assert.throws(() => parseDisposition(response(missing)));
  for (const rationale of ["", "  ", null, 3, []]) {
    assert.throws(() => parseDisposition(response({ ...disposition(), rationale })));
  }
});

test("parser rejects truncated and otherwise unfinished provider responses even when JSON is valid", () => {
  for (const stop_reason of ["max_tokens", "tool_use", "stop_sequence", "pause_turn", null, undefined]) {
    assert.throws(() => parseDisposition(response(disposition(), { stop_reason })));
  }
});

test("physician scoring accepts every explicitly accepted route and preserves exact async priority", () => {
  const { predictions, reference } = syntheticScoreInputs();
  reference.cases[0].reference.acceptedRoutes = ["PRIORITY_ASYNC", "STANDARD_ASYNC"];
  reference.cases[1].reference.acceptedRoutes = ["SAME_DAY_IN_PERSON", "EMERGENCY_NOW"];
  predictions[0].parsed = disposition(3);
  predictions[1].parsed = disposition(5);
  assert.equal(scorePhysician(predictions, reference).agree, 49);
  predictions[0].parsed = disposition(2);
  predictions[1].parsed = disposition(4);
  assert.equal(scorePhysician(predictions, reference).agree, 49);

  reference.cases[2].reference.acceptedRoutes = ["PRIORITY_ASYNC"];
  reference.cases[3].reference.acceptedRoutes = ["STANDARD_ASYNC"];
  predictions[2].parsed = disposition(3);
  predictions[3].parsed = disposition(2);
  const scored = scorePhysician(predictions, reference);
  assert.equal(scored.agree, 47);
  assert.deepEqual(scored.rows.filter(row => row.included && !row.agrees).map(row => row.id), ["C03", "C04"]);
});

test("C25 is excluded only from physician agreement and remains in the CSV denominator", () => {
  const { predictions, reference, csvRows } = syntheticScoreInputs();
  predictions[24].parsed = disposition(5);
  const physician = scorePhysician(predictions, reference);
  const csv = scoreCSV(predictions, csvRows);
  assert.equal(physician.denominator, 49);
  assert.equal(physician.agree, 49);
  assert.equal(physician.missCount, 0);
  assert.equal(physician.agreement, 1);
  assert.deepEqual(physician.excludedIds, ["C25"]);
  assert.equal(physician.rows.find(row => row.id === "C25").included, false);
  assert.equal(physician.rows.find(row => row.id === "C25").agrees, null);
  assert.equal(csv.denominator, 50);
  assert.equal(csv.agree, 49);
  assert.equal(csv.missCount, 1);
  assert.deepEqual(csv.rows.filter(row => !row.agrees).map(row => row.id), ["C25"]);
  predictions[24].parsed = disposition(1);
  assert.equal(scorePhysician(predictions, reference).agree, 49);
  assert.equal(scoreCSV(predictions, csvRows).agree, 50);
});

test("CSV scoring applies only the documented lenient three-bucket mapping", () => {
  assert.deepEqual(CSV_ACCEPTED_IDS, {
    SELF_CARE: [1],
    ASYNC_PHYSICIAN: [2, 3],
    URGENT_ESCALATION: [4, 5],
  });
  const { predictions, csvRows } = syntheticScoreInputs();
  for (const [index, id, bucket] of [
    [0, 2, "ASYNC_PHYSICIAN"],
    [1, 3, "ASYNC_PHYSICIAN"],
    [2, 4, "URGENT_ESCALATION"],
    [3, 5, "URGENT_ESCALATION"],
  ]) {
    predictions[index].parsed = disposition(id);
    csvRows[index].disposition = bucket;
  }
  assert.equal(scoreCSV(predictions, csvRows).agree, 50);
  predictions[4].parsed = disposition(2);
  predictions[5].parsed = disposition(4);
  csvRows[5].disposition = "ASYNC_PHYSICIAN";
  predictions[6].parsed = disposition(3);
  csvRows[6].disposition = "URGENT_ESCALATION";
  const scored = scoreCSV(predictions, csvRows);
  assert.equal(scored.agree, 47);
  assert.deepEqual(scored.rows.filter(row => !row.agrees).map(row => row.id), ["C05", "C06", "C07"]);
});

test("physician score is invariant to supplied CSV labels and independent of CSV mismatches", () => {
  const { predictions, reference, csvRows } = syntheticScoreInputs();
  const original = scorePhysician(predictions, reference);
  for (const entry of reference.cases) entry.originalSuppliedLabel = "URGENT_ESCALATION";
  csvRows[0].disposition = "URGENT_ESCALATION";
  csvRows[1].disposition = "ASYNC_PHYSICIAN";
  assert.deepEqual(scorePhysician(predictions, reference), original);
  const csv = scoreCSV(predictions, csvRows);
  assert.equal(csv.scorecard, "B");
  assert.equal(csv.agree, 48);
  assert.deepEqual(csv.rows.filter(row => !row.agrees).map(row => row.id), ["C01", "C02"]);
  assert.equal(original.scorecard, "A");
  assert.equal(original.agree, 49);
  assert.deepEqual(scorePhysician(predictions, reference), original);
});

test("within-five statement uses physician misses among the 49 included cases", () => {
  const { predictions, reference } = syntheticScoreInputs();
  for (const prediction of predictions.slice(0, 5)) prediction.parsed = disposition(5);
  predictions[24].parsed = disposition(5);
  const fiveMisses = scorePhysician(predictions, reference);
  assert.equal(fiveMisses.agree, 44);
  assert.equal(fiveMisses.missCount, 5);
  assert.equal(fiveMisses.withinFiveOfPhysicianLabels, true);
  predictions[5].parsed = disposition(5);
  const sixMisses = scorePhysician(predictions, reference);
  assert.equal(sixMisses.agree, 43);
  assert.equal(sixMisses.missCount, 6);
  assert.equal(sixMisses.withinFiveOfPhysicianLabels, false);
});
