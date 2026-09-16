import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildClinicalReadinessReport,
  clinicalReadinessConstants,
  validateClinicalEvaluationPortfolio,
} from "../src/evaluation/clinical-readiness.mjs";

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
}

async function loadEvidence() {
  return {
    portfolio: await readJson("../configs/clinical-evaluation-portfolio-v1.json"),
    preAdjudicationEvidence: await readJson("../outputs/pre-adjudication-evidence-v1.json"),
    frozenAgentHoldout: await readJson("../outputs/frozen-agent-holdout-v1.json"),
    frozenRetrievalHoldout: await readJson("../outputs/frozen-retrieval-holdout-v1.json"),
    healthbenchEmergencyEvidence: await Promise.all([
      readJson("../outputs/healthbench-emergency-always-emergency-v1.json"),
      readJson("../outputs/healthbench-emergency-never-emergency-v1.json"),
      readJson("../outputs/healthbench-emergency-deterministic-v1.json"),
    ]),
  };
}

test("portfolio keeps every required benchmark in a bounded role", async () => {
  const { portfolio } = await loadEvidence();
  const validation = validateClinicalEvaluationPortfolio(portfolio);

  assert.equal(validation.valid, true);
  assert.equal(validation.evidenceGateCount, 7);
  assert(validation.benchmarkCount >= clinicalReadinessConstants.requiredBenchmarkIds.length);
  assert.deepEqual(
    clinicalReadinessConstants.requiredBenchmarkIds.filter(
      (id) => !portfolio.benchmarkPortfolio.some((benchmark) => benchmark.id === id),
    ),
    [],
  );
});

test("no public benchmark is allowed to imply zero harm, efficacy, or readiness", async () => {
  const { portfolio } = await loadEvidence();

  for (const benchmark of portfolio.benchmarkPortfolio) {
    for (const claim of clinicalReadinessConstants.forbiddenBenchmarkClaims) {
      assert(benchmark.cannotEstablish.includes(claim), `${benchmark.id} omitted ${claim}`);
      assert(!benchmark.permittedClaims.includes(claim), `${benchmark.id} permitted ${claim}`);
    }
  }
  assert.equal(portfolio.executionPolicy.publicBenchmarkFailureCanBlockCandidate, true);
  assert.equal(portfolio.executionPolicy.publicBenchmarkPassCanClearClinicalRelease, false);
});

test("HealthBench Hard cannot become the clinical safety gate", async () => {
  const { portfolio } = await loadEvidence();
  const hard = portfolio.benchmarkPortfolio.find(
    (benchmark) => benchmark.id === "healthbench_hard",
  );

  assert.equal(hard.portfolioRole, "unsaturated_headroom_stress_test");
  assert(hard.controls.some((control) => control.includes("Never use HealthBench Hard")));
  assert(hard.limitations.some((limitation) => limitation.includes("model difficulty")));
});

test("NOHARM keeps omission, commission, severity, and real-world-rate limits visible", async () => {
  const { portfolio } = await loadEvidence();
  const noharm = portfolio.benchmarkPortfolio.find((benchmark) => benchmark.id === "noharm_v2");

  assert(noharm.measures.some((measure) => measure.includes("omissions")));
  assert(noharm.measures.some((measure) => measure.includes("commissions")));
  assert(noharm.requiredReporting.includes("Severe_rate"));
  assert(noharm.requiredReporting.includes("F1_floor"));
  assert(noharm.requiredReporting.includes("Resilience"));
  assert(noharm.cannotEstablish.includes("real_world_event_rate"));
});

test("MedAgentBench remains inactive until EHR tools exist", async () => {
  const { portfolio } = await loadEvidence();

  for (const id of ["medagentbench_v1", "medagentbench_v2"]) {
    const benchmark = portfolio.benchmarkPortfolio.find((candidate) => candidate.id === id);
    assert.equal(benchmark.currentV0Compatibility, "none");
    assert.match(benchmark.activationCondition, /FHIR|EHR|memory/i);
  }
});

test("current readiness report is reviewable but blocks every clinical claim", async () => {
  const evidence = await loadEvidence();
  const report = buildClinicalReadinessReport(evidence);

  assert.equal(report.status, "not_clinically_ready");
  assert.equal(
    report.reviewDisposition,
    "READY_FOR_COUNSEL_TECHNICAL_REVIEW__RESEARCH_ONLY",
  );
  assert.equal(report.claimDecisions.syntheticSoftwareContractEvidence.allowed, true);
  assert.equal(report.claimDecisions.physicianAuthoredDevelopmentReference.allowed, false);
  assert.equal(report.claimDecisions.clinicalPerformanceEstimated.allowed, false);
  assert.equal(report.claimDecisions.clinicalEfficacyEstablished.allowed, false);
  assert.equal(report.claimDecisions.clinicallyDeploymentReady.allowed, false);
  assert.equal(report.claimDecisions.zeroHarmEstablished.allowed, false);
  assert.equal(report.currentEvidence.externalBenchmarkRuns, 3);
  assert.equal(report.currentEvidence.externalBenchmarkSpendUsd, 0);
  assert.equal(report.currentEvidence.healthbenchEmergencyStressTest.length, 3);
  assert.equal(
    report.currentEvidence.healthbenchEmergencyStressTest.find(({ mode }) => mode === "deterministic").falseNegatives,
    28,
  );
});

test("rejected retrieval evidence remains a blocker without post-hoc reinterpretation", async () => {
  const evidence = await loadEvidence();
  const report = buildClinicalReadinessReport(evidence);

  assert.equal(evidence.frozenRetrievalHoldout.status, "not_admitted");
  assert.equal(report.currentEvidence.frozenRetrievalCandidateAdmitted, false);
  assert.equal(report.blockers[0].id, "retrieval_candidate_not_admitted");
  assert.match(report.blockers[0].requiredEvidence[0], /new retrieval candidate/i);
});

test("a verified, matching, complete attested development review still cannot establish clinical efficacy", async () => {
  const evidence = await loadEvidence();
  const report = buildClinicalReadinessReport({
    ...evidence,
    attestedPhysicianReview: {
      integrityVerified: true,
      provenanceMatched: true,
      workspace: { attestation: { reviewerName: "Physician reviewer" } },
      summary: { complete: 50, total: 50 },
    },
  });

  assert.equal(report.claimDecisions.physicianAuthoredDevelopmentReference.allowed, true);
  assert.equal(report.claimDecisions.clinicalPerformanceEstimated.allowed, false);
  assert.equal(report.claimDecisions.clinicalEfficacyEstablished.allowed, false);
  assert.equal(report.claimDecisions.zeroHarmEstablished.allowed, false);
});

test("an unverified review summary cannot advance the physician-development claim", async () => {
  const evidence = await loadEvidence();
  const report = buildClinicalReadinessReport({
    ...evidence,
    attestedPhysicianReview: {
      workspace: { attestation: { reviewerName: "Physician reviewer" } },
      summary: { complete: 50, total: 50 },
    },
  });

  assert.equal(report.claimDecisions.physicianAuthoredDevelopmentReference.allowed, false);
});

test("portfolio validation fails closed if a benchmark permits an efficacy claim", async () => {
  const { portfolio } = await loadEvidence();
  const mutated = structuredClone(portfolio);
  mutated.benchmarkPortfolio[0].permittedClaims.push("clinical_efficacy");

  assert.throws(
    () => validateClinicalEvaluationPortfolio(mutated),
    /cannot permit clinical_efficacy/,
  );
});
