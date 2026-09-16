import test from "node:test";
import assert from "node:assert/strict";
import { runReliabilityTrials, SEMANTIC_PRESERVING_TRANSFORMS } from "../src/evaluation/reliability-trials.mjs";

const cases = [
  { id: "MR-001", corpus: "test", message: "Crushing chest pressure into my left arm and I am sweaty." },
  { id: "MR-002", corpus: "test", message: "Runny nose and scratchy throat, no fever, eating and drinking fine." },
  { id: "MR-003", corpus: "test", message: "I need a routine medication refill." },
];

test("routing contract is invariant to five normalization-preserving transformations", async () => {
  const report = await runReliabilityTrials(cases);
  assert.equal(Object.keys(SEMANTIC_PRESERVING_TRANSFORMS).length, 5);
  assert.equal(report.trials, 15);
  assert.equal(report.metamorphicTrialPassRate, 1);
  assert.equal(report.allFivePassRate, 1);
  assert.equal(report.clinicalPerformanceEstimate, null);
  assert.match(report.inputSha256, /^[a-f0-9]{64}$/);
});

test("metamorphic trial reports are byte-stable when inputs are unchanged", async () => {
  const first = await runReliabilityTrials(cases);
  const second = await runReliabilityTrials(cases);
  assert.deepEqual(second, first);
});
