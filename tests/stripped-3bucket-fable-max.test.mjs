import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  SYSTEM_PROMPT as PRIOR_PROMPT,
  buildRequest as priorRequest,
  settingsFor as priorSettings,
} from "../scripts/stripped-3bucket-baseline.mjs";
import {
  BUCKETS,
  DEFAULT_OUTPUT,
  ROOT,
  SYSTEM_PROMPT,
  buildRequest,
  generate,
  loadCases,
  parseDisposition,
  settingsFor,
} from "../scripts/stripped-3bucket-fable-max.mjs";
import {
  scoreCSV as priorScoreCSV,
  scorePhysician as priorScorePhysician,
} from "../scripts/score-stripped-3bucket-baseline.mjs";
import { scoreCSV, scorePhysician } from "../scripts/score-stripped-3bucket-fable-max.mjs";

const model = "claude-fable-5-1";
const sha256 = value => createHash("sha256").update(value).digest("hex");
const readJSON = path => JSON.parse(readFileSync(path, "utf8"));
const syntheticCases = () => Array.from({ length: 50 }, (_, index) => ({
  id: `C${String(index + 1).padStart(2, "0")}`,
  message: `Synthetic input ${index + 1}.`,
  disposition: "CSV_LABEL_SENTINEL",
  physician: "PHYSICIAN_LABEL_SENTINEL",
}));
const toCSV = rows => {
  const headers = ["id", "message", "disposition", "physician"];
  const quote = value => `"${String(value).replaceAll('"', '""')}"`;
  return [headers.join(","), ...rows.map(row => headers.map(header => quote(row[header])).join(","))].join("\r\n");
};
const prediction = { disposition: "ASYNC_PHYSICIAN", rationale: "Synthetic explanation." };
const providerResponse = () => ({
  model,
  stop_reason: "end_turn",
  content: [{ type: "text", text: JSON.stringify(prediction) }],
  usage: { input_tokens: 100, output_tokens: 20 },
});

test("Fable max reuses the frozen three-bucket prompt bytes and SHA", () => {
  assert.deepEqual(Buffer.from(SYSTEM_PROMPT), Buffer.from(PRIOR_PROMPT));
  assert.equal(sha256(SYSTEM_PROMPT), sha256(PRIOR_PROMPT));
  assert.deepEqual(BUCKETS, ["SELF_CARE", "ASYNC_PHYSICIAN", "URGENT_ESCALATION"]);
  assert.equal(DEFAULT_OUTPUT, join(ROOT, "outputs/stripped-3bucket-fable-max-2026-09-15"));
});

test("only output_config.effort differs from the prior Fable request", () => {
  const input = { message: '  Synthetic, quoted "input".\r\nSecond line.  ' };
  const before = priorRequest(input, model);
  assert.equal(before.output_config.effort, "low");
  assert.deepEqual(buildRequest(input), {
    ...before,
    output_config: { ...before.output_config, effort: "max" },
  });
  assert.deepEqual(settingsFor(), {
    ...priorSettings(model),
    output_config: { effort: "max" },
  });
  assert.deepEqual(settingsFor(), {
    model,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    output_config: { effort: "max" },
  });
});

test("the ablation permits only Fable 5.1 and returns fresh fixed settings", () => {
  assert.deepEqual(settingsFor(model), settingsFor());
  for (const invalid of ["claude-opus-5", "", "other-model", null, 5]) {
    assert.throws(() => settingsFor(invalid));
    assert.throws(() => buildRequest({ message: "Synthetic input." }, invalid));
  }
  const modified = settingsFor();
  modified.output_config.effort = "low";
  modified.thinking.type = "disabled";
  assert.equal(settingsFor().output_config.effort, "max");
  assert.deepEqual(settingsFor().thinking, { type: "adaptive" });
});

test("request projection ignores labels, reference fields, history, and caller overrides", () => {
  const message = "Synthetic input with untrusted embedded instructions.";
  assert.deepEqual(buildRequest({
    message,
    id: "CASE_SENTINEL",
    disposition: "CSV_LABEL_SENTINEL",
    physician: "PHYSICIAN_LABEL_SENTINEL",
    acceptedRoutes: ["GOLD_ROUTE_SENTINEL"],
    history: "HISTORY_SENTINEL",
    system: "SYSTEM_SENTINEL",
    messages: [{ role: "system", content: "MESSAGES_SENTINEL" }],
    tools: [{ name: "TOOL_SENTINEL" }],
    model: "MODEL_SENTINEL",
    max_tokens: 1,
    output_config: { effort: "low" },
  }), buildRequest({ message }));
  for (const invalid of [undefined, null, "", " \r\n\t", 1, [], {}]) {
    assert.throws(() => buildRequest({ message: invalid }));
  }
});

test("CSV loading preserves all 50 exact messages and discards every other input column", () => {
  const cases = syntheticCases();
  cases[0].message = '  Synthetic, quoted "input".\r\nSecond line.  ';
  assert.deepEqual(loadCases(toCSV(cases)), cases.map(({ id, message }) => ({ id, message })));
  assert.throws(() => loadCases(toCSV(cases.slice(0, 49))));
  const reordered = structuredClone(cases);
  [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
  assert.throws(() => loadCases(toCSV(reordered)));
});

test("max effort still requires a completed response with the exact output contract", () => {
  const valid = providerResponse();
  valid.content.unshift({ type: "thinking", thinking: "Synthetic reasoning." });
  assert.deepEqual(parseDisposition(valid), prediction);
  assert.throws(() => parseDisposition({ ...valid, stop_reason: "max_tokens" }));
  for (const bad of [
    { ...prediction, disposition: "PRIORITY_ASYNC" },
    { ...prediction, rationale: "" },
    { ...prediction, extra: true },
  ]) {
    assert.throws(() => parseDisposition({ ...valid, content: [{ type: "text", text: JSON.stringify(bad) }] }));
  }
});

test("scorecards preserve prior rules on valid predictions and count first-call failures on fixed denominators", () => {
  const cases = syntheticCases();
  const predictions = cases.map(({ id }) => ({ id, parsed: { ...prediction } }));
  const reference = {
    cases: cases.map(({ id }) => ({
      id,
      originalSuppliedLabel: "IGNORED_SYNTHETIC_LABEL",
      reference: {
        acceptedRoutes: id === "C25" ? [] : ["PRIORITY_ASYNC", "STANDARD_ASYNC"],
        note: "Synthetic reference.",
      },
    })),
  };
  const csv = cases.map(({ id, message }) => ({ id, message, disposition: "ASYNC_PHYSICIAN" }));
  assert.deepEqual(scorePhysician(predictions, reference), priorScorePhysician(predictions, reference));
  assert.deepEqual(scoreCSV(predictions, csv), priorScoreCSV(predictions, csv));
  predictions[0].parsed = null;
  predictions[24].parsed = null;
  const physician = scorePhysician(predictions, reference);
  const csvScore = scoreCSV(predictions, csv);
  assert.equal(physician.denominator, 49);
  assert.equal(physician.agree, 48);
  assert.equal(physician.missCount, 1);
  assert.deepEqual(physician.rows.filter(row => row.included && !row.agrees).map(row => row.id), ["C01"]);
  assert.equal(physician.rows.find(row => row.id === "C25").agrees, null);
  assert.equal(csvScore.denominator, 50);
  assert.equal(csvScore.agree, 48);
  assert.equal(csvScore.missCount, 2);
  assert.deepEqual(csvScore.rows.filter(row => !row.agrees).map(row => row.id), ["C01", "C25"]);
});

test("offline max generation uses one lookup and 50 one-shot calls; resume and interrupted cases never retry", async () => {
  const directory = mkdtempSync(join(tmpdir(), "stripped-fable-max-test-"));
  const csvPath = join(directory, "synthetic.csv");
  const priorPath = join(directory, "synthetic-prior-completion.json");
  const output = join(directory, "run");
  const cases = syntheticCases();
  writeFileSync(csvPath, toCSV(cases));
  writeFileSync(priorPath, JSON.stringify({ priorAccountedUSD: 0, accountedUSD: 0, remainingAllocationUSD: 95 }));
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.ANTHROPIC_API_KEY;
  const originalLog = console.log;
  const calls = [];
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
        return Response.json({
          id: model,
          type: "model",
          display_name: "Synthetic Fable test model",
          capabilities: { effort: { max: { supported: true } } },
        });
      }
      assert.equal(method, "POST");
      assert.equal(url, "https://api.anthropic.com/v1/messages");
      assert.deepEqual(body, buildRequest({ message: body.messages[0].content }));
      assert.doesNotMatch(JSON.stringify(body), /CSV_LABEL_SENTINEL|PHYSICIAN_LABEL_SENTINEL/);
      return Response.json(providerResponse(), { headers: { "request-id": `synthetic-${calls.length}` } });
    };

    const completed = await generate(model, csvPath, output, priorPath);
    assert.equal(calls.filter(call => call.method === "GET").length, 1);
    const posts = calls.filter(call => call.method === "POST");
    assert.equal(posts.length, 50);
    assert.deepEqual(posts.map(call => call.body.messages[0].content).sort(), cases.map(row => row.message).sort());
    assert.equal(completed.providerCalls, 50);
    assert.equal(completed.validDispositions, 50);
    assert.deepEqual(completed.failedCases, []);
    assert.equal(Object.keys(completed.artifactHashes).length, 150);
    assert.equal(readdirSync(output).filter(name => /^C\d{2}-(request|raw|parsed)\.json$/.test(name)).length, 150);
    const manifest = readJSON(join(output, "manifest.json"));
    assert.equal(manifest.promptSHA256, sha256(PRIOR_PROMPT));
    assert.deepEqual(manifest.settings, settingsFor());
    assert.deepEqual(manifest.callPolicy, { cases: 50, callsPerCase: 1, automaticRetries: 0, fallbackCalls: 0, judgeCalls: 0, concurrency: 4 });
    for (const row of cases) {
      assert.deepEqual(readJSON(join(output, `${row.id}-request.json`)).body, buildRequest(row));
      assert.equal(readJSON(join(output, `${row.id}-raw.json`)).status, 200);
      const parsed = readJSON(join(output, `${row.id}-parsed.json`));
      assert.deepEqual(parsed.parsed, prediction);
      assert.equal(parsed.providerCalls, 1);
      assert.equal(parsed.failure, null);
    }
    const frozen = readFileSync(join(output, "generation-complete.json"), "utf8");
    const resumed = await generate(model, csvPath, output, priorPath);
    assert.equal(calls.length, 51);
    assert.deepEqual(resumed.artifactHashes, completed.artifactHashes);
    assert.equal(readFileSync(join(output, "generation-complete.json"), "utf8"), frozen);

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
