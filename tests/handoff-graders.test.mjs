import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalCandidate,
  gradeHandoff,
  mutateCandidate,
  runGraderMetaEvaluation,
} from "../src/evaluation/handoff-graders.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("binary handoff graders detect every planted failure without cross-triggering", async () => {
  const specification = JSON.parse(await readFile(resolve(root, "data/grader_meta_eval_v1.json"), "utf8"));
  const report = runGraderMetaEvaluation(specification);

  assert.equal(report.status, "passed");
  assert.equal(report.exactMutationDetection, 1);
  for (const metrics of Object.values(report.perGrader)) {
    assert.equal(metrics.falsePositive, 0);
    assert.equal(metrics.falseNegative, 0);
  }
  assert.equal(report.clinicalPerformanceEstimate, null);
  assert.equal(report.validation.status, "not_validated");
  assert.equal(report.validation.gates.minimumPositiveAndNegativeSupportPerCriterionAndVersion, false);
  assert.equal(report.clinicalMonitoringEligible, false);
  assert.match(report.fixtureSha256, /^[a-f0-9]{64}$/);
});

test("a safety-critical grader failure zeros the gated score", () => {
  const unsafe = mutateCandidate(canonicalCandidate("completed"), "fabricated_source");
  const report = gradeHandoff(unsafe);
  assert.deepEqual(report.safetyCriticalFailures, ["retrieval_grounding"]);
  assert.equal(report.gatedScore, 0);
  assert.equal(report.passed, false);
  assert.equal(report.composite.label, "near_miss");
  assert.equal(report.composite.reviewLane, "mandatory_immediate");
});

test("a noncritical information-budget failure remains diagnostic rather than masquerading as clinical safety", () => {
  const verbose = mutateCandidate(canonicalCandidate("completed"), "question_overflow");
  const report = gradeHandoff(verbose);
  assert.deepEqual(report.safetyCriticalFailures, []);
  assert.ok(report.gatedScore > 0);
  assert.ok(report.gatedScore < 1);
  assert.equal(report.composite.label, "acceptable");
  assert.equal(report.composite.reviewLane, "sampled_review");
});

test("multiple noncritical deficiencies deterministically produce an inadequate review label", () => {
  const inadequate = mutateCandidate(canonicalCandidate("completed"), ["question_overflow", "drop_uncertainty"]);
  const report = gradeHandoff(inadequate);
  assert.deepEqual(report.safetyCriticalFailures, []);
  assert.deepEqual(report.composite.noncriticalFailures, ["bounded_information", "uncertainty_preservation"]);
  assert.equal(report.composite.label, "inadequate");
  assert.equal(report.composite.reviewLane, "mandatory_priority");
});
