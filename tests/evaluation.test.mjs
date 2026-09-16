import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { readCsv } from "../src/lib/csv.mjs";
import { routeMessage } from "../src/workflows/disposition-workflow.mjs";
import { calculateLegacyMetrics, calculateMetrics, evaluateRows, wilsonInterval } from "../scripts/evaluate.mjs";
import { summarizeEvaluationReport } from "../src/evaluation/evidence-boundary.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("workflow replays all 50 labels used during implementation", async () => {
  const [messages, proposalRows] = await Promise.all([
    readCsv(resolve(root, "data/patient_messages.csv")),
    readCsv(resolve(root, "data/clinician_development_review.csv")),
  ]);
  const proposalById = new Map(proposalRows.map((row) => [row.id, row.clinician_disposition]));
  const pairs = [];
  for (const row of messages) {
    const result = await routeMessage({ id: row.id, message: row.message });
    pairs.push([proposalById.get(row.id), result.disposition]);
  }
  const metrics = calculateMetrics(pairs);
  assert.equal(metrics.n, 50);
  assert.equal(metrics.accuracy, 1);
  assert.equal(metrics.escalationRecall, 1);
  assert.equal(metrics.escalationPrecision, 1);
  assert.equal(metrics.perClass.EMERGENCY_NOW.recall, 1);
  assert.equal(metrics.perClass.SAME_DAY_IN_PERSON.recall, 1);
  assert.equal(metrics.weightedCost, 0);
});

test("small-sample proportions include Wilson uncertainty", () => {
  const interval = wilsonInterval(22, 22);
  assert.ok(interval.lower > 0.85 && interval.lower < 0.852);
  assert.equal(interval.upper, 1);
  assert.equal(wilsonInterval(0, 6).lower, 0);
  assert.throws(() => wilsonInterval(1, 1, 0), /positive finite/);

  const metrics = calculateMetrics(Array.from({ length: 22 }, () => ["EMERGENCY_NOW", "EMERGENCY_NOW"]));
  assert.deepEqual(metrics.escalationRecall95CI, interval);
});

test("the legacy projection cannot hide emergency-to-same-day delay in primary metrics", () => {
  const operational = calculateMetrics([["EMERGENCY_NOW", "SAME_DAY_IN_PERSON"]]);
  const legacy = calculateLegacyMetrics([["URGENT_ESCALATION", "URGENT_ESCALATION"]]);
  assert.equal(operational.escalationRecall, 1);
  assert.equal(operational.perClass.EMERGENCY_NOW.recall, 0);
  assert.equal(operational.accuracy, 0);
  assert.equal(operational.weightedCost, 12);
  assert.equal(operational.confusion["EMERGENCY_NOW->SAME_DAY_IN_PERSON"], 1);
  assert.equal(legacy.accuracy, 1);
});

test("evaluation reports naive routing baselines and label-disagreement severity", async () => {
  const report = await evaluateRows({
    predictionsPath: resolve(root, "outputs/predictions.csv"),
    messagesPath: resolve(root, "data/patient_messages.csv"),
    referenceProposalPath: resolve(root, "data/clinician_development_review.csv"),
  });

  assert.equal(report.baselines.alwaysAsync.accuracy, 0.44);
  assert.equal(report.baselines.alwaysAsync.escalationRecall, 0);
  assert.equal(report.baselines.alwaysAsync.weightedCost, 506);
  assert.equal(report.baselines.alwaysSameDay.accuracy, 0.1);
  assert.equal(report.baselines.alwaysSameDay.escalationRecall, 1);
  assert.equal(report.baselines.alwaysSameDay.perClass.EMERGENCY_NOW.recall, 0);
  assert.equal(report.baselines.alwaysSameDay.weightedCost, 266);
  assert.equal(report.baselines.alwaysEmergency.accuracy, 0.34);
  assert.equal(report.baselines.alwaysEmergency.escalationRecall, 1);
  assert.equal(report.baselines.alwaysEmergency.perClass.EMERGENCY_NOW.recall, 1);
  assert.equal(report.baselines.alwaysEmergency.weightedCost, 100);
  assert.deepEqual(report.providedLabelAudit, {
    disagreements: 12,
    missedEscalation: 8,
    falseEscalation: 4,
  });
});

test("evaluation summary distinguishes take-home review from clinical-performance evidence", async () => {
  const report = await evaluateRows({
    predictionsPath: resolve(root, "outputs/predictions.csv"),
    messagesPath: resolve(root, "data/patient_messages.csv"),
    referenceProposalPath: resolve(root, "data/clinician_development_review.csv"),
  });
  const summary = summarizeEvaluationReport(report);

  assert.equal(summary.conclusion.clinicalPerformanceEstimate, null);
  assert.equal(summary.conclusion.referenceStandardEstablished, false);
  assert.equal(summary.conclusion.releaseReadinessEstablished, false);
  assert.equal(summary.physicianReview.reviewedCases, 0);
  assert.equal(summary.physicianReview.proposedCases, 50);
  assert.equal(summary.physicianReview.consensusReferenceCases, 0);
  assert.equal(summary.developmentSetReplay.inferenceAllowed, false);
  assert.equal(summary.suppliedWorkflowVsReferenceProposal.inferenceAllowed, false);
  assert.equal(summary.developmentBaselines.inferenceAllowed, false);
  assert.equal("accuracy" in summary.developmentSetReplay, false);
  assert.equal("referenceStandard" in summary, false);
  assert.equal("workflowVsProvisionalReference" in summary, false);
});
