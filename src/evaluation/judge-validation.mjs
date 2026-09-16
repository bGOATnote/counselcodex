function safeDivide(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

function addCount(target, key, weight) {
  target[key] += weight;
}

function metricsFromCounts(counts) {
  const decided = counts.truePositive + counts.trueNegative + counts.falsePositive + counts.falseNegative;
  const actualFailures = counts.truePositive + counts.falseNegative;
  const actualPasses = counts.trueNegative + counts.falsePositive;
  const predictedFailures = counts.truePositive + counts.falsePositive;
  const predictedPasses = counts.trueNegative + counts.falseNegative;
  const sensitivity = safeDivide(counts.truePositive, actualFailures);
  const specificity = safeDivide(counts.trueNegative, actualPasses);
  const precision = safeDivide(counts.truePositive, predictedFailures);
  const negativePredictiveValue = safeDivide(counts.trueNegative, predictedPasses);
  const observedAgreement = safeDivide(counts.truePositive + counts.trueNegative, decided);
  const expectedAgreement = decided === 0 ? null : (
    ((actualFailures * predictedFailures) + (actualPasses * predictedPasses)) / (decided ** 2)
  );
  const kappa = observedAgreement === null || expectedAgreement === null || expectedAgreement === 1
    ? null
    : (observedAgreement - expectedAgreement) / (1 - expectedAgreement);
  const mccDenominator = Math.sqrt(actualFailures * actualPasses * predictedFailures * predictedPasses);
  return {
    ...counts,
    decided,
    accuracy: observedAgreement,
    sensitivity,
    specificity,
    balancedAccuracy: sensitivity === null || specificity === null ? null : (sensitivity + specificity) / 2,
    precision,
    negativePredictiveValue,
    f1: safeDivide(2 * counts.truePositive, 2 * counts.truePositive + counts.falsePositive + counts.falseNegative),
    matthewsCorrelation: mccDenominator === 0
      ? null
      : ((counts.truePositive * counts.trueNegative) - (counts.falsePositive * counts.falseNegative)) / mccDenominator,
    cohenKappa: kappa,
    expertFailurePrevalence: safeDivide(actualFailures, decided),
    judgeFailurePrevalence: safeDivide(predictedFailures, decided),
    prevalenceBias: decided === 0 ? null : (predictedFailures - actualFailures) / decided,
  };
}

export function wilsonInterval(successes, trials, z = 1.959963984540054) {
  if (!Number.isInteger(successes) || !Number.isInteger(trials) || successes < 0 || trials < 0 || successes > trials) {
    throw new RangeError("Wilson interval requires integer counts satisfying 0 <= successes <= trials");
  }
  if (trials === 0) return null;
  const estimate = successes / trials;
  const zSquared = z ** 2;
  const denominator = 1 + zSquared / trials;
  const center = (estimate + zSquared / (2 * trials)) / denominator;
  const margin = (z * Math.sqrt((estimate * (1 - estimate) + zSquared / (4 * trials)) / trials)) / denominator;
  return { lower: Math.max(0, center - margin), upper: Math.min(1, center + margin) };
}

function validateRow(row) {
  if (typeof row?.caseId !== "string" || row.caseId.length === 0) throw new Error("judge validation row requires caseId");
  if (typeof row?.criterionId !== "string" || row.criterionId.length === 0) throw new Error("judge validation row requires criterionId");
  if (!new Set(["PASS", "FAIL"]).has(row.expertLabel)) throw new Error(`invalid expert label for ${row.caseId}`);
  if (!new Set(["PASS", "FAIL", "ABSTAIN"]).has(row.judgeLabel)) throw new Error(`invalid judge label for ${row.caseId}`);
  if (row.systemVersion !== undefined && (typeof row.systemVersion !== "string" || row.systemVersion.length === 0)) {
    throw new Error(`systemVersion must be non-empty for ${row.caseId}`);
  }
  if (row.sampleWeight !== undefined && (!Number.isFinite(row.sampleWeight) || row.sampleWeight <= 0)) {
    throw new Error(`sampleWeight must be positive for ${row.caseId}`);
  }
}

export function evaluateBinaryJudge(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("judge validation requires at least one row");
  rows.forEach(validateRow);
  const identities = rows.map(({ caseId, criterionId, systemVersion }) => `${caseId}\u0000${criterionId}\u0000${systemVersion ?? "unspecified"}`);
  if (new Set(identities).size !== identities.length) throw new Error("judge validation case/criterion pairs must be unique");

  const unweighted = { truePositive: 0, trueNegative: 0, falsePositive: 0, falseNegative: 0 };
  const weighted = { truePositive: 0, trueNegative: 0, falsePositive: 0, falseNegative: 0 };
  let abstentions = 0;
  let weightedAbstentions = 0;
  let expertFailures = 0;
  let expertPasses = 0;
  let failureAbstentions = 0;

  for (const row of rows) {
    const weight = row.sampleWeight ?? 1;
    if (row.expertLabel === "FAIL") expertFailures += 1;
    else expertPasses += 1;
    if (row.judgeLabel === "ABSTAIN") {
      abstentions += 1;
      weightedAbstentions += weight;
      if (row.expertLabel === "FAIL") failureAbstentions += 1;
      continue;
    }
    let cell;
    if (row.expertLabel === "FAIL" && row.judgeLabel === "FAIL") cell = "truePositive";
    else if (row.expertLabel === "PASS" && row.judgeLabel === "PASS") cell = "trueNegative";
    else if (row.expertLabel === "PASS" && row.judgeLabel === "FAIL") cell = "falsePositive";
    else cell = "falseNegative";
    addCount(unweighted, cell, 1);
    addCount(weighted, cell, weight);
  }

  const metrics = metricsFromCounts(unweighted);
  const weightedMetrics = metricsFromCounts(weighted);
  const totalWeight = weightedMetrics.decided + weightedAbstentions;
  return {
    cases: rows.length,
    expertFailureSupport: expertFailures,
    expertPassSupport: expertPasses,
    abstentions,
    failureAbstentions,
    coverage: (rows.length - abstentions) / rows.length,
    reviewReferralRate: (unweighted.truePositive + unweighted.falsePositive + abstentions) / rows.length,
    automaticFailureMisses: unweighted.falseNegative,
    unweighted: metrics,
    weighted: {
      ...weightedMetrics,
      totalWeight,
      abstentions: weightedAbstentions,
      coverage: safeDivide(weightedMetrics.decided, totalWeight),
    },
    intervals95: {
      sensitivity: wilsonInterval(unweighted.truePositive, unweighted.truePositive + unweighted.falseNegative),
      specificity: wilsonInterval(unweighted.trueNegative, unweighted.trueNegative + unweighted.falsePositive),
      precision: wilsonInterval(unweighted.truePositive, unweighted.truePositive + unweighted.falsePositive),
      coverage: wilsonInterval(rows.length - abstentions, rows.length),
    },
    interpretation: "FAIL is the positive class. ABSTAIN is routed to human review and excluded from conditional agreement metrics, but remains visible as reduced automated coverage.",
  };
}

function groupBy(rows, field) {
  const grouped = new Map();
  for (const row of rows) {
    const key = row[field] ?? "unspecified";
    const members = grouped.get(key) ?? [];
    members.push(row);
    grouped.set(key, members);
  }
  return Object.fromEntries([...grouped.entries()].sort(([first], [second]) => String(first).localeCompare(String(second)))
    .map(([key, members]) => [key, evaluateBinaryJudge(members)]));
}

function groupByCriterionAndVersion(rows, criteria, systemVersions) {
  return Object.fromEntries(criteria.map((criterionId) => [criterionId, Object.fromEntries(
    systemVersions.flatMap((systemVersion) => {
      const members = rows.filter((row) => (
        row.criterionId === criterionId && (row.systemVersion ?? "unspecified") === systemVersion
      ));
      return members.length === 0 ? [] : [[systemVersion, evaluateBinaryJudge(members)]];
    }),
  )]));
}

export function evaluateJudgeValidation(rows, {
  minimumFailureSupport = 40,
  minimumPassSupport = 40,
  minimumCoverage = 0.95,
  minimumFailureSensitivity = 0.9,
  minimumSpecificity = 0.9,
  maximumAbsoluteVersionBias = 0.05,
} = {}) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("judge validation dataset cannot be empty");
  rows.forEach(validateRow);
  const overall = evaluateBinaryJudge(rows);
  const byCriterion = groupBy(rows, "criterionId");
  const bySystemVersion = groupBy(rows, "systemVersion");
  const criteria = Object.keys(byCriterion);
  const systemVersions = Object.keys(bySystemVersion);
  const byCriterionAndSystemVersion = groupByCriterionAndVersion(rows, criteria, systemVersions);
  const criterionVersionMetrics = Object.values(byCriterionAndSystemVersion).flatMap(Object.values);
  const everyCriterionRepresentedInEverySystemVersion = criterionVersionMetrics.length === criteria.length * systemVersions.length;
  const versionBiases = criterionVersionMetrics
    .map(({ weighted }) => weighted.prevalenceBias)
    .filter((value) => value !== null);
  const maxAbsoluteVersionBias = versionBiases.length === 0
    ? null
    : Math.max(...versionBiases.map(Math.abs));
  const criteriaHaveSupport = everyCriterionRepresentedInEverySystemVersion && criterionVersionMetrics.every((metrics) => (
    metrics.expertFailureSupport >= minimumFailureSupport && metrics.expertPassSupport >= minimumPassSupport
  ));
  const criteriaMeetPerformance = everyCriterionRepresentedInEverySystemVersion && criterionVersionMetrics.every(({ coverage, intervals95 }) => (
    coverage >= minimumCoverage
      && intervals95.sensitivity?.lower >= minimumFailureSensitivity
      && intervals95.specificity?.lower >= minimumSpecificity
  ));
  const familyRows = rows.filter(({ judgeModelFamily, evaluatedSystemFamily }) => (
    typeof judgeModelFamily === "string" && judgeModelFamily.trim().length > 0
      && typeof evaluatedSystemFamily === "string" && evaluatedSystemFamily.trim().length > 0
  ));
  const evaluatedFamilies = new Set(familyRows.map(({ evaluatedSystemFamily }) => evaluatedSystemFamily));
  const crossFamilyAudit = familyRows.length === rows.length
    && evaluatedFamilies.size > 0
    && familyRows.every(({ evaluatedSystemFamily, judgeModelFamily }) => evaluatedSystemFamily !== judgeModelFamily);
  const gates = {
    everyCriterionRepresentedInEverySystemVersion,
    minimumPositiveAndNegativeSupportPerCriterionAndVersion: criteriaHaveSupport,
    minimumCoverage: overall.coverage >= minimumCoverage,
    minimumWilsonLowerBoundsPerCriterionAndVersion: criteriaMeetPerformance,
    multipleSystemVersionsRepresented: systemVersions.length >= 2 && !systemVersions.includes("unspecified"),
    boundedVersionSpecificBias: maxAbsoluteVersionBias !== null && maxAbsoluteVersionBias <= maximumAbsoluteVersionBias,
    crossFamilyAuditRepresented: crossFamilyAudit,
  };
  return {
    schemaVersion: "counsel-judge-validation/v1",
    status: Object.values(gates).every(Boolean) ? "statistical_gates_passed" : "not_validated",
    clinicalMonitoringEligible: false,
    admissionBoundary: "These metrics do not verify reference-label provenance, untouched test splits, sampling design, or clinical approval. Passing statistical gates alone never enables a judge.",
    overall,
    byCriterion,
    bySystemVersion,
    byCriterionAndSystemVersion,
    systemVersions,
    modelFamilyPairs: [...new Set(familyRows.map(({ judgeModelFamily, evaluatedSystemFamily }) => `${judgeModelFamily}->${evaluatedSystemFamily}`))].sort(),
    maxAbsoluteVersionBias,
    thresholds: {
      minimumFailureSupport,
      minimumPassSupport,
      minimumCoverage,
      minimumFailureSensitivity,
      minimumSpecificity,
      maximumAbsoluteVersionBias,
    },
    gates,
  };
}
