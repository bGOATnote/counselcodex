export function summarizeEvaluationReport(report) {
  if (!report || !Array.isArray(report.cases)) throw new TypeError("evaluation report with cases is required");
  const mismatches = report.cases.filter((row) => row.proposalDisposition !== row.predicted);
  const suppliedDisagreements = report.cases.filter((row) => row.proposalLegacyDisposition !== row.provided);
  const baselineSummary = Object.fromEntries(Object.entries(report.baselines).map(([name, metrics]) => [name, {
    caseCount: metrics.n,
    candidateLabelMatches: Math.round(metrics.accuracy * metrics.n),
    illustrativeWeightedCost: metrics.weightedCost,
    anyEscalationRecall: metrics.escalationRecall,
    sameDayRecall: metrics.perClass.SAME_DAY_IN_PERSON.recall,
    emergencyRecall: metrics.perClass.EMERGENCY_NOW.recall,
    emergencyToSameDay: metrics.confusion["EMERGENCY_NOW->SAME_DAY_IN_PERSON"],
  }]));
  return {
    conclusion: {
      clinicalPerformanceEstimate: null,
      referenceStandardEstablished: false,
      releaseReadinessEstablished: false,
      reason: "No physician-attested review export or untouched representative holdout exists. The prototype was authored against an unattested 50-case reference proposal.",
    },
    physicianReview: {
      status: "awaiting-physician-attestation",
      reviewedCases: 0,
      proposedCases: report.cases.length,
      consensusReferenceCases: 0,
      developmentLeakage: true,
      completionSource: "integrity-hashed export from the physician review instrument",
    },
    developmentSetReplay: {
      caseCount: report.cases.length,
      exactCandidateLabelMatches: report.cases.length - mismatches.length,
      mismatchCount: mismatches.length,
      routeContract: ["SELF_CARE", "ASYNC_PHYSICIAN", "SAME_DAY_IN_PERSON", "EMERGENCY_NOW"],
      fullConfusionMatrix: report.workflowVsReferenceProposal.confusion,
      classSupport: Object.fromEntries(Object.entries(report.workflowVsReferenceProposal.perClass)
        .map(([label, metrics]) => [label, metrics.support])),
      inferenceAllowed: false,
      interpretation: "Software fit to labels used during implementation; not a clinical-performance estimate.",
    },
    suppliedWorkflowVsReferenceProposal: {
      caseCount: report.cases.length,
      agreementCount: report.cases.length - suppliedDisagreements.length,
      disagreementCount: suppliedDisagreements.length,
      inferenceAllowed: false,
      interpretation: "Hypothesis-generating comparison against an unattested proposal; not physician review or consensus truth.",
    },
    developmentBaselines: {
      variants: baselineSummary,
      inferenceAllowed: false,
      interpretation: "Metric-design diagnostics against unattested proposed labels; not clinical comparators.",
    },
    providedLabelAudit: report.providedLabelAudit,
    workflowMismatches: mismatches,
  };
}
