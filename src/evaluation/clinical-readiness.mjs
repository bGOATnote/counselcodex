import { createHash } from "node:crypto";

const REQUIRED_BENCHMARK_IDS = [
  "healthbench",
  "healthbench_consensus",
  "healthbench_hard",
  "noharm_v2",
  "medagentbench_v1",
  "medagentbench_v2",
  "healthagentbench",
];

const FORBIDDEN_BENCHMARK_CLAIMS = new Set([
  "zero_harm",
  "clinical_efficacy",
  "deployment_readiness",
]);

const REQUIRED_LADDER_IDS = [
  "L0_software_verification",
  "L1_physician_development_review",
  "L2_external_retrospective_validation",
  "L3_human_factors_simulation",
  "L4_prospective_shadow",
  "L5_controlled_clinical_evaluation",
  "L6_controlled_release_and_monitoring",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasTextArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every(hasText);
}

function includesNormalized(values, expected) {
  return values.some((value) => value.toLowerCase().includes(expected));
}

export function sha256Json(value) {
  return createHash("sha256").update(`${JSON.stringify(value)}\n`).digest("hex");
}

export function validateClinicalEvaluationPortfolio(portfolio) {
  assert(
    portfolio?.schemaVersion === "counsel-clinical-evaluation-portfolio/v1",
    "Unexpected clinical evaluation portfolio schema",
  );
  assert(hasText(portfolio.asOf), "Portfolio must declare an as-of date");
  assert(hasText(portfolio.decision), "Portfolio must declare its decision");
  assert(
    portfolio.systemUnderTest?.stage === "synthetic_preclinical_research",
    "Current system must remain explicitly preclinical research",
  );
  assert(
    portfolio.systemUnderTest?.patientFacingOutput === false &&
      portfolio.systemUnderTest?.writesLiveEhr === false &&
      portfolio.systemUnderTest?.autonomousClinicalAction === false,
    "Current system boundary must forbid patient-facing output, EHR writes, and autonomous clinical action",
  );

  const forbidden = portfolio.claimPolicy?.forbiddenWithoutFurtherEvidence;
  assert(hasTextArray(forbidden), "Claim policy must enumerate forbidden claims");
  for (const claim of [
    "zero_harm",
    "clinical_performance_estimated",
    "clinical_efficacy_established",
    "deployment_ready",
  ]) {
    assert(forbidden.includes(claim), `Claim policy must forbid ${claim}`);
  }

  const benchmarks = portfolio.benchmarkPortfolio;
  assert(Array.isArray(benchmarks), "Benchmark portfolio must be an array");
  const ids = new Set();
  for (const benchmark of benchmarks) {
    assert(hasText(benchmark.id), "Every benchmark requires an id");
    assert(!ids.has(benchmark.id), `Duplicate benchmark id: ${benchmark.id}`);
    ids.add(benchmark.id);
    assert(hasText(benchmark.name), `${benchmark.id} requires a name`);
    assert(hasText(benchmark.version), `${benchmark.id} requires a version`);
    assert(hasText(benchmark.status), `${benchmark.id} requires a status`);
    assert(hasText(benchmark.portfolioRole), `${benchmark.id} requires a portfolio role`);
    assert(hasTextArray(benchmark.measures), `${benchmark.id} requires measures`);
    assert(
      hasTextArray(benchmark.requiredReporting),
      `${benchmark.id} requires reporting fields`,
    );
    assert(hasTextArray(benchmark.controls), `${benchmark.id} requires controls`);
    assert(hasTextArray(benchmark.limitations), `${benchmark.id} requires limitations`);
    assert(hasTextArray(benchmark.permittedClaims), `${benchmark.id} requires permitted claims`);
    assert(hasTextArray(benchmark.cannotEstablish), `${benchmark.id} requires claim limits`);
    assert(hasTextArray(benchmark.sources), `${benchmark.id} requires primary sources`);
    for (const forbiddenClaim of FORBIDDEN_BENCHMARK_CLAIMS) {
      assert(
        benchmark.cannotEstablish.includes(forbiddenClaim),
        `${benchmark.id} must explicitly reject ${forbiddenClaim}`,
      );
      assert(
        !benchmark.permittedClaims.includes(forbiddenClaim),
        `${benchmark.id} cannot permit ${forbiddenClaim}`,
      );
    }
  }
  for (const id of REQUIRED_BENCHMARK_IDS) {
    assert(ids.has(id), `Missing required benchmark decision: ${id}`);
  }

  const hard = benchmarks.find((benchmark) => benchmark.id === "healthbench_hard");
  assert(
    hard.portfolioRole === "unsaturated_headroom_stress_test" &&
      includesNormalized(hard.controls, "never use healthbench hard as the clinical safety gate"),
    "HealthBench Hard must remain a headroom stress test rather than a safety gate",
  );

  const noharm = benchmarks.find((benchmark) => benchmark.id === "noharm_v2");
  assert(
    includesNormalized(noharm.measures, "omission") &&
      includesNormalized(noharm.measures, "commission") &&
      noharm.requiredReporting.includes("Severe_rate"),
    "NOHARM must preserve omission, commission, and severe-harm reporting",
  );
  assert(
    includesNormalized(noharm.limitations, "not real-world event rates"),
    "NOHARM must not be interpreted as a real-world event-rate estimate",
  );

  for (const id of ["medagentbench_v1", "medagentbench_v2"]) {
    const benchmark = benchmarks.find((candidate) => candidate.id === id);
    assert(
      benchmark.currentV0Compatibility === "none" && hasText(benchmark.activationCondition),
      `${id} must remain deferred until its EHR or memory construct exists`,
    );
  }

  const ladder = portfolio.localEvidenceLadder;
  assert(Array.isArray(ladder), "Local evidence ladder must be an array");
  assert(
    JSON.stringify(ladder.map((gate) => gate.id)) === JSON.stringify(REQUIRED_LADDER_IDS),
    "Local evidence ladder must retain ordered L0-L6 gates",
  );
  for (const gate of ladder) {
    assert(hasText(gate.status), `${gate.id} requires a status`);
    assert(hasTextArray(gate.requiredEvidence), `${gate.id} requires evidence`);
    assert(hasTextArray(gate.metrics), `${gate.id} requires metrics`);
    assert(hasText(gate.permits), `${gate.id} requires a bounded permitted claim`);
  }
  assert(
    ladder.slice(1).every((gate) => gate.status === "blocked"),
    "All clinical and deployment gates must remain blocked in repository defaults",
  );
  assert(
    portfolio.executionPolicy?.publicBenchmarkFailureCanBlockCandidate === true,
    "A public benchmark regression must be able to block a candidate",
  );
  assert(
    portfolio.executionPolicy?.publicBenchmarkPassCanClearClinicalRelease === false,
    "A public benchmark pass cannot clear clinical release",
  );
  assert(
    Number.isInteger(portfolio.executionPolicy?.currentExternalBenchmarkRuns) &&
      portfolio.executionPolicy.currentExternalBenchmarkRuns >= 0,
    "External benchmark run count must be a non-negative integer",
  );
  assert(
    Number.isFinite(portfolio.executionPolicy?.currentExternalBenchmarkSpendUsd) &&
      portfolio.executionPolicy.currentExternalBenchmarkSpendUsd >= 0 &&
      portfolio.executionPolicy.currentExternalBenchmarkSpendUsd <= portfolio.executionPolicy.maximumAuthorizedExternalSpendUsd,
    "External benchmark spend must be non-negative and within the authorized cap",
  );
  const consensus = benchmarks.find((benchmark) => benchmark.id === "healthbench_consensus");
  if (portfolio.executionPolicy.currentExternalBenchmarkRuns > 0) {
    assert(
      consensus.status.startsWith("executed_") &&
        Array.isArray(consensus.evidenceArtifacts) &&
        consensus.evidenceArtifacts.length === portfolio.executionPolicy.currentExternalBenchmarkRuns,
      "Executed external benchmark runs require matching HealthBench Consensus evidence artifacts",
    );
  }

  return {
    valid: true,
    benchmarkCount: benchmarks.length,
    evidenceGateCount: ladder.length,
    portfolioSha256: sha256Json(portfolio),
  };
}

export function buildClinicalReadinessReport({
  portfolio,
  preAdjudicationEvidence,
  frozenAgentHoldout,
  frozenRetrievalHoldout,
  healthbenchEmergencyEvidence = [],
  attestedPhysicianReview = null,
}) {
  const validation = validateClinicalEvaluationPortfolio(portfolio);
  assert(
    preAdjudicationEvidence?.claimBoundary?.toLowerCase().includes("no clinical performance"),
    "Pre-adjudication evidence must reject clinical-performance interpretation",
  );
  assert(
    Array.isArray(healthbenchEmergencyEvidence) &&
      healthbenchEmergencyEvidence.length === portfolio.executionPolicy.currentExternalBenchmarkRuns,
    "HealthBench evidence count must match the execution ledger",
  );
  const healthbenchFingerprint = healthbenchEmergencyEvidence[0]?.cohort?.primaryIdSha256 ?? null;
  for (const evidence of healthbenchEmergencyEvidence) {
    assert(
      evidence?.schemaVersion === "counsel-healthbench-emergency-result/v1" &&
        evidence.artifact === "synthetic-derived-external-stress-test",
      "External benchmark evidence must retain the derived synthetic artifact boundary",
    );
    assert(
      evidence.cohort?.primaryIdSha256 === healthbenchFingerprint &&
        evidence.cohort?.strictCounselReplication === false,
      "External benchmark evidence must share the frozen reconstruction and reject strict replication",
    );
  }
  assert(
    frozenAgentHoldout?.clinicalPerformanceEstimate === null,
    "Agent holdout must leave clinical performance blank",
  );
  assert(
    frozenRetrievalHoldout?.registration?.claimBoundary
      ?.toLowerCase()
      .includes("not clinical performance evidence"),
    "Retrieval holdout must reject clinical-performance interpretation",
  );

  const physicianReviewComplete =
    attestedPhysicianReview?.integrityVerified === true &&
    attestedPhysicianReview?.provenanceMatched === true &&
    attestedPhysicianReview?.workspace?.attestation !== null &&
    attestedPhysicianReview?.workspace?.attestation !== undefined &&
    attestedPhysicianReview?.summary?.complete === 50 &&
    attestedPhysicianReview?.summary?.total === 50;
  const preAdjudicationPassed = preAdjudicationEvidence?.status === "passed";
  const agentContractHoldoutPassed = frozenAgentHoldout?.status === "passed";
  const retrievalCandidateAdmitted = frozenRetrievalHoldout?.status === "admitted";

  const currentEvidence = {
    preAdjudicationArtifactsPassed: preAdjudicationPassed,
    frozenAgentContractHoldoutPassed: agentContractHoldoutPassed,
    frozenRetrievalCandidateAdmitted: retrievalCandidateAdmitted,
    attestedPhysicianDevelopmentReviewComplete: physicianReviewComplete,
    untouchedRepresentativeClinicalHoldoutPresent: false,
    humanFactorsStudyPresent: false,
    prospectiveShadowStudyPresent: false,
    controlledClinicalOutcomeStudyPresent: false,
    externalBenchmarkRuns: portfolio.executionPolicy.currentExternalBenchmarkRuns,
    externalBenchmarkSpendUsd: portfolio.executionPolicy.currentExternalBenchmarkSpendUsd,
    healthbenchEmergencyStressTest: healthbenchEmergencyEvidence.map((evidence) => ({
      mode: evidence.mode,
      status: evidence.status,
      cohortIdSha256: evidence.cohort.primaryIdSha256,
      falseNegatives: evidence.reliability.worstOfK.confusionMatrix.falseNegative,
      falsePositives: evidence.reliability.worstOfK.confusionMatrix.falsePositive,
      emergencyRecall: evidence.reliability.worstOfK.emergencyRecall,
      emergencyPrecision: evidence.reliability.worstOfK.emergencyPrecision,
      specificity: evidence.reliability.worstOfK.specificity,
    })),
  };

  const claimDecisions = {
    syntheticSoftwareContractEvidence: {
      allowed: preAdjudicationPassed && agentContractHoldoutPassed,
      boundary: "Only the checked-in synthetic contracts and artifacts; completion of the full validation command is still required for a release commit.",
    },
    physicianAuthoredDevelopmentReference: {
      allowed: physicianReviewComplete,
      boundary: "A signed single-clinician development reference would not be consensus or external validation.",
    },
    clinicalPerformanceEstimated: {
      allowed: false,
      reason: "No untouched representative patient- and episode-independent sample exists.",
    },
    clinicalEfficacyEstablished: {
      allowed: false,
      reason: "No prospective comparative clinical study or patient-outcome evidence exists.",
    },
    clinicallyDeploymentReady: {
      allowed: false,
      reason: "Clinical reference, external validation, human factors, shadow mode, governance, and outcome gates remain incomplete.",
    },
    zeroHarmEstablished: {
      allowed: false,
      reason: "Finite evaluation can discover and bound failure rates but cannot prove the absence of all harm across future users, settings, or distributions.",
    },
  };

  const blockers = portfolio.localEvidenceLadder
    .filter((gate) => gate.status === "blocked")
    .map((gate) => ({ id: gate.id, requiredEvidence: gate.requiredEvidence }));
  if (!retrievalCandidateAdmitted) {
    blockers.unshift({
      id: "retrieval_candidate_not_admitted",
      requiredEvidence: [
        "Register a new retrieval candidate and new untouched holdout; do not tune the rejected candidate on revealed labels.",
      ],
    });
  }

  return {
    schemaVersion: "counsel-clinical-evaluation-readiness/v1",
    asOf: portfolio.asOf,
    status: "not_clinically_ready",
    reviewDisposition: "READY_FOR_COUNSEL_TECHNICAL_REVIEW__RESEARCH_ONLY",
    decision: portfolio.decision,
    portfolioValidation: validation,
    currentEvidence,
    claimDecisions,
    benchmarkDecisions: portfolio.benchmarkPortfolio.map((benchmark) => ({
      id: benchmark.id,
      status: benchmark.status,
      currentV0Compatibility: benchmark.currentV0Compatibility,
      portfolioRole: benchmark.portfolioRole,
      permittedClaims: benchmark.permittedClaims,
      cannotEstablish: benchmark.cannotEstablish,
    })),
    blockers,
    nextActions: [
      "Complete and export the attributable 50-case single-clinician development review.",
      "Freeze the intended-use labeling manual, route destinations, SLAs, subgroup plan, and a new representative patient- and episode-independent holdout before observing labels.",
      "Run the full Mastra clinical-agent path on the frozen HealthBench reconstruction with a preregistered model, repeated trials, and spend cap; preserve the official-score distinction.",
      "Run NOHARM v2 only if the system produces comprehensive clinical management plans; keep omission, commission, severe-rate, floor, and resilience visible.",
      "Defer MedAgentBench until FHIR tools exist, then add authorization, world-state, idempotency, rollback, and audit checks around the public grader.",
      "Advance through human-factors simulation and prospective shadow mode before any patient-facing or EHR-writing scope is considered.",
    ],
    evidenceHashes: {
      portfolio: validation.portfolioSha256,
      preAdjudicationEvidence: sha256Json(preAdjudicationEvidence),
      frozenAgentHoldout: sha256Json(frozenAgentHoldout),
      frozenRetrievalHoldout: sha256Json(frozenRetrievalHoldout),
      healthbenchEmergencyEvidence: healthbenchEmergencyEvidence.map(sha256Json),
    },
  };
}

export const clinicalReadinessConstants = Object.freeze({
  requiredBenchmarkIds: REQUIRED_BENCHMARK_IDS,
  requiredLadderIds: REQUIRED_LADDER_IDS,
  forbiddenBenchmarkClaims: [...FORBIDDEN_BENCHMARK_CLAIMS],
});
