import test from "node:test";
import assert from "node:assert/strict";
import { runAblations } from "../scripts/ablate.mjs";

test("component ablation demonstrates that the safety gate carries escalation recall", async () => {
  const report = await runAblations();
  assert.equal(report.clinicalPerformanceEstimate, null);
  assert.equal(report.referenceStandardEstablished, false);
  assert.equal(report.referenceProposal.full.escalationLabelRecall, 1);
  assert.equal(report.referenceProposal.full.emergencyLabelRecall, 1);
  assert.equal(report.referenceProposal.intent_only_no_emergency_gate.escalationLabelRecall, 0);
  assert.ok(report.referenceProposal.intent_only_no_emergency_gate.illustrativeWeightedCost > report.referenceProposal.full.illustrativeWeightedCost);
  assert.ok(report.redTeam.intent_only_no_emergency_gate.escalationMisses > 0);
});

test("retrieval failure preserves safety while removing self-care utility", async () => {
  const report = await runAblations();
  assert.equal(report.referenceProposal.retrieval_unavailable.escalationLabelRecall, 1);
  assert.equal(report.referenceProposal.retrieval_unavailable.emergencyLabelRecall, 1);
  assert.equal(report.referenceProposal.retrieval_unavailable.inappropriateSelfCare, 0);
  assert.ok(report.referenceProposal.retrieval_unavailable.labelAgreement < report.referenceProposal.full.labelAgreement);
  assert.equal(report.referenceProposal.retrieval_unavailable.labelAgreement, report.referenceProposal.safety_only.labelAgreement);
  assert.equal(report.externalSpendUsd, 0);
});
