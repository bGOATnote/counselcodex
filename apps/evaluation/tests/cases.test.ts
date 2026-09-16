import assert from "node:assert/strict";
import test from "node:test";
import { dataset, evaluationCases, proposalSummary } from "../lib/cases.ts";

test("joins every supplied case to the unattested proposal and V0 prediction", () => {
  assert.equal(evaluationCases.length, 50);
  assert.equal(new Set(evaluationCases.map(({ id }) => id)).size, 50);
  assert.equal(proposalSummary.cases, 50);
  assert.match(dataset.sourceHash, /^[a-f0-9]{64}$/);
  assert.match(dataset.referenceProposalHash, /^[a-f0-9]{64}$/);
  assert.match(dataset.predictionHash, /^[a-f0-9]{64}$/);
});

test("unattested proposal keeps its clinically important hypotheses executable", () => {
  assert.deepEqual({
    agreement: proposalSummary.suppliedAgreement,
    disagreement: proposalSummary.suppliedDisagreements,
    possibleUndertriage: proposalSummary.possibleUndertriage,
    possibleOvertriage: proposalSummary.possibleOvertriage,
  }, {
    agreement: 38,
    disagreement: 12,
    possibleUndertriage: 8,
    possibleOvertriage: 4,
  });
});

test("proposed under-triage and over-triage findings are directionally coherent", () => {
  for (const reviewCase of evaluationCases) {
    if (reviewCase.referenceProposal.finding === "possible_undertriage") {
      assert.ok(["SAME_DAY_IN_PERSON", "EMERGENCY_NOW"].includes(reviewCase.referenceProposal.disposition));
      assert.notEqual(reviewCase.suppliedDisposition, "URGENT_ESCALATION");
      assert.ok(reviewCase.referenceProposal.harmIfFollowSupplied.length > 0);
    }
    if (reviewCase.referenceProposal.finding === "possible_overtriage") {
      assert.equal(reviewCase.suppliedDisposition, "URGENT_ESCALATION");
      assert.ok(!["SAME_DAY_IN_PERSON", "EMERGENCY_NOW"].includes(reviewCase.referenceProposal.disposition));
    }
  }
});

test("proposal replay is labeled as fit, not clinical performance", () => {
  assert.equal(proposalSummary.v0Matches, 50);
  assert.equal(proposalSummary.clinicalPerformanceEstimated, false);
});
