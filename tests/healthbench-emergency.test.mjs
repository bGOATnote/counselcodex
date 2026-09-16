import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  adaptPromptToClinicalTurns,
  compareEmergencyPredictions,
  exactMcNemarP,
  parseJsonl,
  scoreEmergencyPredictions,
  scoreReliabilityTrials,
  wilsonInterval,
} from "../src/evaluation/healthbench-emergency.mjs";

test("emergency metrics preserve the clinically important confusion matrix", () => {
  const metrics = scoreEmergencyPredictions([
    { emergencyExpected: true, emergencyPredicted: true },
    { emergencyExpected: true, emergencyPredicted: false },
    { emergencyExpected: false, emergencyPredicted: true },
    { emergencyExpected: false, emergencyPredicted: false },
  ]);
  assert.deepEqual(metrics.confusionMatrix, { truePositive: 1, falsePositive: 1, trueNegative: 1, falseNegative: 1 });
  assert.equal(metrics.emergencyPrecision, 0.5);
  assert.equal(metrics.emergencyRecall, 0.5);
  assert.equal(metrics.f1, 0.5);
  assert.equal(metrics.specificity, 0.5);
});

test("Wilson interval does not imply certainty after zero observed misses", () => {
  const interval = wilsonInterval(29, 29);
  assert.ok(interval.lower > 0.88 && interval.lower < 0.89);
  assert.equal(interval.upper, 1);
});
test("legacy binary scorer rejects failed negatives rather than granting true negatives", () => {
  for (const failure of [{ error: "provider failed" }, { agentStatus: "degraded" }, { source: "evaluation_error" }]) {
    assert.throws(() => scoreEmergencyPredictions([{ emergencyExpected: false, emergencyPredicted: false, ...failure }]), /cannot score failed/);
  }
});

test("worst-of-k counts any emergency miss and any non-emergency over-alert", () => {
  const scored = scoreReliabilityTrials([
    [
      { id: "emergent", emergencyExpected: true, emergencyPredicted: true },
      { id: "non-emergent", emergencyExpected: false, emergencyPredicted: false },
    ],
    [
      { id: "emergent", emergencyExpected: true, emergencyPredicted: false },
      { id: "non-emergent", emergencyExpected: false, emergencyPredicted: true },
    ],
  ]);
  assert.deepEqual(scored.worstOfK.confusionMatrix, {
    truePositive: 0,
    falsePositive: 1,
    trueNegative: 0,
    falseNegative: 1,
  });
});

test("worst-of-k rejects duplicate IDs and label drift between trials", () => {
  assert.throws(() => scoreReliabilityTrials([[
    { id: "duplicate", emergencyExpected: true, emergencyPredicted: true },
    { id: "duplicate", emergencyExpected: true, emergencyPredicted: true },
  ]]), /duplicate case IDs/);
  assert.throws(() => scoreReliabilityTrials([
    [{ id: "case", emergencyExpected: true, emergencyPredicted: true }],
    [{ id: "case", emergencyExpected: false, emergencyPredicted: false }],
  ]), /reference labels changed/);
});

test("always-escalate control has perfect recall but poor discernment", () => {
  const metrics = scoreEmergencyPredictions([
    ...Array.from({ length: 29 }, () => ({ emergencyExpected: true, emergencyPredicted: true })),
    ...Array.from({ length: 74 }, () => ({ emergencyExpected: false, emergencyPredicted: true })),
  ]);
  assert.equal(metrics.emergencyRecall, 1);
  assert.equal(metrics.emergencyPrecision, 29 / 103);
  assert.equal(metrics.specificity, 0);
  assert.ok(metrics.f1 > 0.43 && metrics.f1 < 0.45);
});

test("paired comparison separates emergency misses from false-alert reductions", () => {
  const comparison = compareEmergencyPredictions([
    { id: "e1", emergencyExpected: true, emergencyPredicted: true },
    { id: "e2", emergencyExpected: true, emergencyPredicted: true },
    { id: "n1", emergencyExpected: false, emergencyPredicted: true },
    { id: "n2", emergencyExpected: false, emergencyPredicted: true },
  ], [
    { id: "e1", emergencyExpected: true, emergencyPredicted: true },
    { id: "e2", emergencyExpected: true, emergencyPredicted: false },
    { id: "n1", emergencyExpected: false, emergencyPredicted: false },
    { id: "n2", emergencyExpected: false, emergencyPredicted: false },
  ]);
  assert.equal(comparison.pairedChanges.emergencyMissesIntroduced, 1);
  assert.equal(comparison.pairedChanges.falseAlertsResolved, 2);
  assert.equal(comparison.deltas.falseNegatives, 1);
  assert.equal(comparison.deltas.falsePositives, -2);
  assert.equal(exactMcNemarP(1, 2), 1);
});

test("HealthBench roles map to bounded clinical intake roles", () => {
  assert.deepEqual(adaptPromptToClinicalTurns({
    prompt_id: "case-1",
    prompt: [
      { role: "user", content: "I have chest pain." },
      { role: "assistant", content: "When did it start?" },
      { role: "user", content: "Ten minutes ago." },
    ],
  }), [
    { role: "patient", content: "I have chest pain." },
    { role: "clinician", content: "When did it start?" },
    { role: "patient", content: "Ten minutes ago." },
  ]);
  assert.throws(() => adaptPromptToClinicalTurns({
    prompt_id: "case-2",
    prompt: [{ role: "system", content: "Hidden instruction" }],
  }), /unsupported role/);
});

test("JSONL parsing reports the failing line", () => {
  assert.deepEqual(parseJsonl('{"id":1}\n\n{"id":2}\n'), [{ id: 1 }, { id: 2 }]);
  assert.throws(() => parseJsonl('{"id":1}\n{bad}\n'), /line 2/);
});

test("checked-in HealthBench evidence is internally reproducible without prompt text", async () => {
  const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
  const config = await readJson("../configs/healthbench-emergency-counsel-method-v1.json");
  const reports = await Promise.all([
    readJson("../outputs/healthbench-emergency-always-emergency-v1.json"),
    readJson("../outputs/healthbench-emergency-never-emergency-v1.json"),
    readJson("../outputs/healthbench-emergency-deterministic-v1.json"),
  ]);
  for (const report of reports) {
    assert.equal(report.source.sha256, config.upstream.sha256);
    assert.equal(report.cohort.primaryIdSha256, config.selection.expectedPrimaryIdSha256);
    assert.equal(report.cohort.primaryRows, config.selection.expectedPrimaryRows);
    assert.equal(report.predictions.length, config.selection.expectedPrimaryRows);
    assert.equal(new Set(report.predictions.map(({ id }) => id)).size, config.selection.expectedPrimaryRows);
    assert.deepEqual(scoreEmergencyPredictions(report.predictions), report.reliability.perTrial[0]);
    assert.equal(JSON.stringify(report.predictions).includes('"prompt"'), false);
    assert.equal(JSON.stringify(report.predictions).includes('"content"'), false);
  }
});
