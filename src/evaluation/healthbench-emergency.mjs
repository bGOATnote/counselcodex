import { createHash } from "node:crypto";

const FIRST_PERSON = /\b(?:i|i['’]?m|i['’]?ve|me|my|mine)\b/i;
const THIRD_PARTY = /\bpatient\b|\bmy (?:child|kid|son|daughter|baby|newborn|infant|toddler|mother|mom|father|dad|parent|grandmother|grandfather|grandma|grandpa|aunt|uncle|cousin|brother|sister|sibling|friend|boyfriend|girlfriend|partner|wife|husband|roommate|coworker|colleague|neighbor|athlete)\b|\b(?:the|a|an|this|that) (?:child|kid|baby|newborn|infant|toddler|man|woman|person)\b|\b(?:he|she|they|him|her|their|them|someone|people)\b|\b(?:i['’]?m|i am) (?:a|an) [^.!?]{0,30}\b(?:nurse|physician|doctor|medic|obstetrician|fellow|allergologist)\b/i;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function tagsFor(row) {
  if (!Array.isArray(row?.example_tags)) throw new TypeError("HealthBench row is missing example_tags");
  return row.example_tags;
}

function patientText(row) {
  if (!Array.isArray(row?.prompt)) throw new TypeError("HealthBench row is missing prompt turns");
  return row.prompt
    .filter(({ role }) => role === "user")
    .map(({ content }) => String(content ?? ""))
    .join("\n");
}

function categoryFor(row, categories) {
  const tags = tagsFor(row);
  const matches = Object.entries(categories).filter(([, tag]) => tags.includes(tag));
  if (matches.length !== 1) throw new Error(`prompt ${row.prompt_id} has ${matches.length} emergency categories`);
  return matches[0][0];
}

function countByCategory(rows, categories) {
  const counts = { emergent: 0, conditional: 0, nonEmergent: 0 };
  for (const row of rows) counts[categoryFor(row, categories)] += 1;
  return counts;
}

function assertCount(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

function assertUniquePromptIds(rows) {
  const ids = rows.map(({ prompt_id: promptId }) => promptId);
  if (ids.some((id) => typeof id !== "string" || id.length === 0)) throw new Error("every row must have a prompt_id");
  if (new Set(ids).size !== ids.length) throw new Error("duplicate prompt_id in HealthBench source");
}

function baseFirstPersonScope(row) {
  const text = patientText(row);
  return FIRST_PERSON.test(text) && !THIRD_PARTY.test(text);
}

export function primaryIdSha256(rows) {
  return sha256(rows.map(({ prompt_id: promptId }) => promptId).sort().join("\n"));
}

export function parseJsonl(source) {
  if (typeof source !== "string") throw new TypeError("JSONL source must be a string");
  const lines = source.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new SyntaxError(`invalid JSONL at line ${index + 1}: ${error instanceof Error ? error.message : "parse failure"}`);
    }
  });
}

export function verifyUpstream(source, config) {
  const rows = parseJsonl(source);
  assertCount(rows.length, config.upstream.rows, "upstream row count");
  const digest = sha256(source);
  if (digest !== config.upstream.sha256) {
    throw new Error(`upstream SHA-256 mismatch: expected ${config.upstream.sha256}, received ${digest}`);
  }
  assertUniquePromptIds(rows);
  return rows;
}

export function deriveCohorts(rows, config) {
  const { selection } = config;
  const themeRows = rows.filter((row) => tagsFor(row).includes(selection.themeTag));
  assertCount(themeRows.length, selection.expectedThemeRows, "emergency-theme row count");
  const categoryCounts = countByCategory(themeRows, selection.categories);
  for (const [category, expected] of Object.entries(selection.expectedCategoryCounts)) {
    assertCount(categoryCounts[category], expected, `${category} row count`);
  }

  const languageReasons = new Map(selection.auditableLanguageExclusions.map(({ promptId, reason }) => [promptId, reason]));
  if (languageReasons.size !== selection.auditableLanguageExclusions.length) throw new Error("duplicate language exclusion prompt ID");
  for (const promptId of languageReasons.keys()) {
    if (!themeRows.some((row) => row.prompt_id === promptId)) throw new Error(`language exclusion ${promptId} is not in the emergency theme`);
  }
  const auditableEnglishRows = themeRows.filter((row) => !languageReasons.has(row.prompt_id));
  const binaryRows = auditableEnglishRows.filter((row) => categoryFor(row, selection.categories) !== "conditional");
  const conditionalShadow = auditableEnglishRows.filter((row) => categoryFor(row, selection.categories) === "conditional");

  const includeReasons = new Map(selection.scopeOverrides.include.map(({ promptId, reason }) => [promptId, reason]));
  const excludeReasons = new Map(selection.scopeOverrides.exclude.map(({ promptId, reason }) => [promptId, reason]));
  for (const promptId of includeReasons.keys()) {
    if (excludeReasons.has(promptId)) throw new Error(`scope override ${promptId} is both included and excluded`);
  }
  const primary = binaryRows.filter((row) => {
    if (includeReasons.has(row.prompt_id)) return true;
    if (excludeReasons.has(row.prompt_id)) return false;
    return baseFirstPersonScope(row);
  });

  assertCount(primary.length, selection.expectedPrimaryRows, "primary cohort row count");
  const primaryCounts = countByCategory(primary, selection.categories);
  assertCount(primaryCounts.emergent, selection.expectedPrimaryEmergent, "primary emergent row count");
  assertCount(primaryCounts.nonEmergent, selection.expectedPrimaryNonEmergent, "primary non-emergent row count");
  const fingerprint = primaryIdSha256(primary);
  if (selection.expectedPrimaryIdSha256 && fingerprint !== selection.expectedPrimaryIdSha256) {
    throw new Error(`primary cohort fingerprint mismatch: expected ${selection.expectedPrimaryIdSha256}, received ${fingerprint}`);
  }

  return {
    primary: primary.map((row) => ({
      ...row,
      evaluation: {
        label: categoryFor(row, selection.categories),
        emergencyExpected: categoryFor(row, selection.categories) === "emergent",
      },
    })),
    conditionalShadow,
    audit: {
      upstreamRows: rows.length,
      themeRows: themeRows.length,
      categoryCounts,
      auditableLanguageExclusions: languageReasons.size,
      afterAuditableLanguageFilter: auditableEnglishRows.length,
      articleReportedAfterEnglishFilter: selection.articleReportedCounts.afterEnglishFilter,
      languageFilterCountDifference: auditableEnglishRows.length - selection.articleReportedCounts.afterEnglishFilter,
      binaryRows: binaryRows.length,
      articleReportedAfterConditionalExclusion: selection.articleReportedCounts.afterConditionalExclusion,
      binaryCountDifference: binaryRows.length - selection.articleReportedCounts.afterConditionalExclusion,
      conditionalShadowRows: conditionalShadow.length,
      primaryRows: primary.length,
      primaryCounts: { emergent: primaryCounts.emergent, nonEmergent: primaryCounts.nonEmergent },
      primaryIdSha256: fingerprint,
      strictCounselReplication: false,
      reason: "Counsel did not publish the 103 prompt IDs or all language/scope annotations; this is a frozen, method-aligned reconstruction.",
    },
  };
}

function safeDivide(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

export function wilsonInterval(successes, trials, z = 1.959963984540054) {
  if (!Number.isInteger(successes) || !Number.isInteger(trials) || successes < 0 || trials < 0 || successes > trials) {
    throw new RangeError("Wilson interval requires 0 <= successes <= trials as integers");
  }
  if (trials === 0) return null;
  const estimate = successes / trials;
  const z2 = z * z;
  const denominator = 1 + z2 / trials;
  const center = (estimate + z2 / (2 * trials)) / denominator;
  const margin = (z * Math.sqrt((estimate * (1 - estimate) + z2 / (4 * trials)) / trials)) / denominator;
  return { lower: Math.max(0, center - margin), upper: Math.min(1, center + margin) };
}

export function scoreEmergencyPredictions(rows) {
  const matrix = { truePositive: 0, falsePositive: 0, trueNegative: 0, falseNegative: 0 };
  for (const row of rows) {
    // Historical binary-only scoring cannot represent abstentions or execution
    // failures. Reject them instead of crediting a failed negative as correct.
    if (row.error || row.agentStatus === "degraded" || row.source === "evaluation_error") {
      throw new Error("Legacy binary scorer cannot score failed/degraded runs; use clinical:benchmark for all-attempt accounting");
    }
    if (typeof row.emergencyExpected !== "boolean" || typeof row.emergencyPredicted !== "boolean") {
      throw new TypeError("each scored row requires boolean emergencyExpected and emergencyPredicted values");
    }
    if (row.emergencyExpected && row.emergencyPredicted) matrix.truePositive += 1;
    else if (!row.emergencyExpected && row.emergencyPredicted) matrix.falsePositive += 1;
    else if (!row.emergencyExpected && !row.emergencyPredicted) matrix.trueNegative += 1;
    else matrix.falseNegative += 1;
  }
  const positivePredictions = matrix.truePositive + matrix.falsePositive;
  const actualEmergencies = matrix.truePositive + matrix.falseNegative;
  const actualNonEmergencies = matrix.trueNegative + matrix.falsePositive;
  const precision = safeDivide(matrix.truePositive, positivePredictions);
  const recall = safeDivide(matrix.truePositive, actualEmergencies);
  const specificity = safeDivide(matrix.trueNegative, actualNonEmergencies);
  const f1 = precision === null || recall === null || precision + recall === 0 ? null : (2 * precision * recall) / (precision + recall);
  return {
    cases: rows.length,
    confusionMatrix: matrix,
    emergencyPrecision: precision,
    emergencyRecall: recall,
    f1,
    specificity,
    accuracy: safeDivide(matrix.truePositive + matrix.trueNegative, rows.length),
    intervals95: {
      emergencyPrecision: wilsonInterval(matrix.truePositive, positivePredictions),
      emergencyRecall: wilsonInterval(matrix.truePositive, actualEmergencies),
      specificity: wilsonInterval(matrix.trueNegative, actualNonEmergencies),
    },
  };
}

export function scoreReliabilityTrials(trials) {
  if (!Array.isArray(trials) || trials.length === 0) throw new TypeError("at least one trial is required");
  const ids = trials[0].map(({ id }) => id);
  if (new Set(ids).size !== ids.length) throw new Error("reliability trials contain duplicate case IDs");
  for (const trial of trials) {
    if (trial.length !== ids.length || trial.some((row, index) => row.id !== ids[index])) {
      throw new Error("all reliability trials must contain the same ordered case IDs");
    }
    if (trial.some((row, index) => row.emergencyExpected !== trials[0][index].emergencyExpected)) {
      throw new Error("reference labels changed between reliability trials");
    }
  }
  const worstCaseRows = ids.map((id, index) => {
    const expected = trials[0][index].emergencyExpected;
    const predictions = trials.map((trial) => trial[index].emergencyPredicted);
    return {
      id,
      emergencyExpected: expected,
      emergencyPredicted: expected ? predictions.every(Boolean) : predictions.some(Boolean),
    };
  });
  return {
    trials: trials.length,
    perTrial: trials.map(scoreEmergencyPredictions),
    worstOfK: scoreEmergencyPredictions(worstCaseRows),
    interpretation: "For emergent cases, any missed trial is a miss. For non-emergent cases, any emergency over-escalation is a false positive.",
  };
}

function binomialCoefficient(n, k) {
  const reduced = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= reduced; index += 1) result = (result * (n - reduced + index)) / index;
  return result;
}

export function exactMcNemarP(baselineOnlyCorrect, candidateOnlyCorrect) {
  if (![baselineOnlyCorrect, candidateOnlyCorrect].every((value) => Number.isInteger(value) && value >= 0)) {
    throw new RangeError("McNemar discordant counts must be non-negative integers");
  }
  const discordant = baselineOnlyCorrect + candidateOnlyCorrect;
  if (discordant === 0) return 1;
  const tail = Math.min(baselineOnlyCorrect, candidateOnlyCorrect);
  let probability = 0;
  for (let index = 0; index <= tail; index += 1) {
    probability += binomialCoefficient(discordant, index) * (0.5 ** discordant);
  }
  return Math.min(1, 2 * probability);
}

export function compareEmergencyPredictions(baseline, candidate) {
  if (!Array.isArray(baseline) || !Array.isArray(candidate) || baseline.length !== candidate.length) {
    throw new Error("paired comparison requires equal-length prediction arrays");
  }
  const baselineIds = baseline.map(({ id }) => id);
  if (new Set(baselineIds).size !== baseline.length) throw new Error("baseline predictions contain duplicate case IDs");
  const candidateById = new Map(candidate.map((row) => [row.id, row]));
  if (candidateById.size !== candidate.length) throw new Error("candidate predictions contain duplicate case IDs");
  const paired = baseline.map((baselineRow) => {
    const candidateRow = candidateById.get(baselineRow.id);
    if (!candidateRow) throw new Error(`candidate predictions are missing ${baselineRow.id}`);
    if (baselineRow.emergencyExpected !== candidateRow.emergencyExpected) {
      throw new Error(`reference label mismatch for ${baselineRow.id}`);
    }
    return { baseline: baselineRow, candidate: candidateRow };
  });
  const baselineMetrics = scoreEmergencyPredictions(baseline);
  const candidateMetrics = scoreEmergencyPredictions(candidate);
  const baselineOnlyCorrect = paired.filter(({ baseline: first, candidate: second }) => (
    first.emergencyPredicted === first.emergencyExpected && second.emergencyPredicted !== second.emergencyExpected
  )).length;
  const candidateOnlyCorrect = paired.filter(({ baseline: first, candidate: second }) => (
    first.emergencyPredicted !== first.emergencyExpected && second.emergencyPredicted === second.emergencyExpected
  )).length;
  return {
    cases: paired.length,
    baseline: baselineMetrics,
    candidate: candidateMetrics,
    deltas: {
      emergencyRecall: candidateMetrics.emergencyRecall - baselineMetrics.emergencyRecall,
      emergencyPrecision: candidateMetrics.emergencyPrecision === null || baselineMetrics.emergencyPrecision === null
        ? null
        : candidateMetrics.emergencyPrecision - baselineMetrics.emergencyPrecision,
      f1: candidateMetrics.f1 === null || baselineMetrics.f1 === null ? null : candidateMetrics.f1 - baselineMetrics.f1,
      specificity: candidateMetrics.specificity - baselineMetrics.specificity,
      falseNegatives: candidateMetrics.confusionMatrix.falseNegative - baselineMetrics.confusionMatrix.falseNegative,
      falsePositives: candidateMetrics.confusionMatrix.falsePositive - baselineMetrics.confusionMatrix.falsePositive,
    },
    pairedChanges: {
      baselineOnlyCorrect,
      candidateOnlyCorrect,
      exactMcNemarP: exactMcNemarP(baselineOnlyCorrect, candidateOnlyCorrect),
      emergencyMissesRecovered: paired.filter(({ baseline: first, candidate: second }) => (
        first.emergencyExpected && !first.emergencyPredicted && second.emergencyPredicted
      )).length,
      emergencyMissesIntroduced: paired.filter(({ baseline: first, candidate: second }) => (
        first.emergencyExpected && first.emergencyPredicted && !second.emergencyPredicted
      )).length,
      falseAlertsResolved: paired.filter(({ baseline: first, candidate: second }) => (
        !first.emergencyExpected && first.emergencyPredicted && !second.emergencyPredicted
      )).length,
      falseAlertsIntroduced: paired.filter(({ baseline: first, candidate: second }) => (
        !first.emergencyExpected && !first.emergencyPredicted && second.emergencyPredicted
      )).length,
    },
    interpretation: "McNemar tests paired correctness only. Safety review must separately examine emergency misses and false alerts; a significant tradeoff is not necessarily a clinical improvement.",
  };
}

export function adaptPromptToClinicalTurns(row) {
  const turns = row.prompt.map(({ role, content }) => {
    if (role !== "user" && role !== "assistant") {
      throw new Error(`prompt ${row.prompt_id} contains unsupported role '${role}'`);
    }
    return {
      role: role === "user" ? "patient" : "clinician",
      content: String(content ?? "").trim(),
    };
  });
  if (turns.some(({ content }) => content.length === 0)) throw new Error(`prompt ${row.prompt_id} contains an empty turn`);
  if (turns.at(-1)?.role !== "patient") throw new Error(`prompt ${row.prompt_id} does not end with a patient turn`);
  return turns;
}

export function patientTranscriptFor(row) {
  return patientText(row);
}
