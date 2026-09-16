import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { GRADER_DEFINITIONS } from "../src/evaluation/handoff-graders.mjs";
import { validateJudgeProgram } from "../src/evaluation/judge-program.mjs";
import { evaluateBinaryJudge, evaluateJudgeValidation } from "../src/evaluation/judge-validation.mjs";

test("accuracy cannot hide a judge that misses every rare failure", () => {
  const rows = [
    ...Array.from({ length: 95 }, (_, index) => ({
      caseId: `pass-${index}`,
      criterionId: "rare_failure",
      expertLabel: "PASS",
      judgeLabel: "PASS",
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      caseId: `fail-${index}`,
      criterionId: "rare_failure",
      expertLabel: "FAIL",
      judgeLabel: "PASS",
    })),
  ];
  const metrics = evaluateBinaryJudge(rows);
  assert.equal(metrics.unweighted.accuracy, 0.95);
  assert.equal(metrics.unweighted.sensitivity, 0);
  assert.equal(metrics.unweighted.f1, 0);
  assert.equal(metrics.unweighted.balancedAccuracy, 0.5);
  assert.equal(metrics.automaticFailureMisses, 5);
});

test("abstention routes uncertainty to review instead of silently passing it", () => {
  const metrics = evaluateBinaryJudge([
    { caseId: "uncertain-failure", criterionId: "criterion", expertLabel: "FAIL", judgeLabel: "ABSTAIN" },
    { caseId: "clear-pass", criterionId: "criterion", expertLabel: "PASS", judgeLabel: "PASS" },
  ]);
  assert.equal(metrics.coverage, 0.5);
  assert.equal(metrics.failureAbstentions, 1);
  assert.equal(metrics.automaticFailureMisses, 0);
  assert.equal(metrics.reviewReferralRate, 0.5);
});

test("validation is use-specific and detects bias that changes across system versions", () => {
  const rows = [
    { caseId: "shared-fail", criterionId: "safety", systemVersion: "A", expertLabel: "FAIL", judgeLabel: "FAIL", judgeModelFamily: "judge-C", evaluatedSystemFamily: "system-A" },
    { caseId: "shared-pass", criterionId: "safety", systemVersion: "A", expertLabel: "PASS", judgeLabel: "PASS", judgeModelFamily: "judge-C", evaluatedSystemFamily: "system-A" },
    { caseId: "shared-fail", criterionId: "safety", systemVersion: "B", expertLabel: "FAIL", judgeLabel: "PASS", judgeModelFamily: "judge-C", evaluatedSystemFamily: "system-B" },
    { caseId: "shared-pass", criterionId: "safety", systemVersion: "B", expertLabel: "PASS", judgeLabel: "PASS", judgeModelFamily: "judge-C", evaluatedSystemFamily: "system-B" },
  ];
  const report = evaluateJudgeValidation(rows, {
    minimumFailureSupport: 1,
    minimumPassSupport: 1,
    minimumCoverage: 1,
    minimumFailureSensitivity: 0.5,
    minimumSpecificity: 1,
    maximumAbsoluteVersionBias: 0.1,
  });
  assert.equal(report.overall.unweighted.accuracy, 0.75);
  assert.equal(report.bySystemVersion.A.weighted.prevalenceBias, 0);
  assert.equal(report.bySystemVersion.B.weighted.prevalenceBias, -0.5);
  assert.equal(report.gates.boundedVersionSpecificBias, false);
  assert.equal(report.gates.multipleSystemVersionsRepresented, true);
  assert.equal(report.gates.everyCriterionRepresentedInEverySystemVersion, true);
  assert.equal(report.gates.crossFamilyAuditRepresented, true);
  assert.equal(report.status, "not_validated");
});

test("perfect statistical cells cannot establish clinical admission without reference provenance", () => {
  const rows = ["A", "B"].flatMap((systemVersion) => ["safety", "completeness"].flatMap((criterionId) => [
    ...Array.from({ length: 100 }, (_, index) => ({
      caseId: `${criterionId}-pass-${index}`,
      criterionId,
      systemVersion,
      expertLabel: "PASS",
      judgeLabel: "PASS",
      judgeModelFamily: "judge-C",
      evaluatedSystemFamily: `system-${systemVersion}`,
    })),
    ...Array.from({ length: 100 }, (_, index) => ({
      caseId: `${criterionId}-fail-${index}`,
      criterionId,
      systemVersion,
      expertLabel: "FAIL",
      judgeLabel: "FAIL",
      judgeModelFamily: "judge-C",
      evaluatedSystemFamily: `system-${systemVersion}`,
    })),
  ]));
  const report = evaluateJudgeValidation(rows);
  assert.equal(report.status, "statistical_gates_passed");
  assert.equal(report.clinicalMonitoringEligible, false);
  assert.equal(report.gates.minimumPositiveAndNegativeSupportPerCriterionAndVersion, true);
  assert.equal(report.gates.minimumWilsonLowerBoundsPerCriterionAndVersion, true);
  assert.equal(Object.keys(report.byCriterionAndSystemVersion.safety).length, 2);
  rows[0].judgeModelFamily = rows[0].evaluatedSystemFamily;
  assert.equal(evaluateJudgeValidation(rows).gates.crossFamilyAuditRepresented, false);
});

test("CQA program keeps clinical judges disabled and non-speaking until admission", async () => {
  const program = JSON.parse(await readFile(new URL("../configs/cqa-judge-program-v1.json", import.meta.url), "utf8"));
  const result = validateJudgeProgram(program, GRADER_DEFINITIONS);
  assert.equal(result.valid, true);
  assert.equal(result.activeCriteria, GRADER_DEFINITIONS.length);
  assert.equal(result.clinicalJudgeActivated, false);
  assert.deepEqual(result.plannedClinicalPacks, ["emergency_redflag", "uti_vaginitis", "uri_sinusitis_stewardship"]);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
});
