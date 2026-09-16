import { createHash } from "node:crypto";
import { routeMessage } from "../workflows/disposition-workflow.mjs";

export const SEMANTIC_PRESERVING_TRANSFORMS = Object.freeze({
  original: (message) => message,
  case_fold: (message) => message.toUpperCase(),
  whitespace: (message) => `  ${message.replaceAll(" ", "   ")}  `,
  compatibility_unicode: (message) => [...message].map((character) => {
    const code = character.codePointAt(0);
    if (code >= 0x21 && code <= 0x7e) return String.fromCodePoint(code + 0xfee0);
    return character;
  }).join(""),
  format_control: (message) => {
    const firstSpace = message.indexOf(" ");
    return firstSpace < 0 ? `${message}\u200b` : `${message.slice(0, firstSpace)}\u200b${message.slice(firstSpace)}`;
  },
});

function contractSignature(result) {
  return {
    disposition: result.disposition,
    subtype: result.subtype,
    confidence: result.confidence,
    layer: result.layer,
    locked: result.locked,
    overrideBlocked: result.overrideBlocked,
  };
}

function fingerprint(rows) {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

export async function runReliabilityTrials(cases) {
  const ids = cases.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) throw new Error("metamorphic trial case IDs must be unique");
  const rows = [];
  for (const testCase of cases) {
    const trials = [];
    for (const [transform, apply] of Object.entries(SEMANTIC_PRESERVING_TRANSFORMS)) {
      const result = await routeMessage({ id: testCase.id, message: apply(testCase.message) });
      trials.push({ transform, signature: contractSignature(result) });
    }
    const baseline = JSON.stringify(trials[0].signature);
    const matchingTrials = trials.filter(({ signature }) => JSON.stringify(signature) === baseline).length;
    rows.push({
      id: testCase.id,
      corpus: testCase.corpus,
      matchingTrials,
      trialCount: trials.length,
      allTrialsMatch: matchingTrials === trials.length,
      trials,
    });
  }
  const trialCount = rows.reduce((total, row) => total + row.trialCount, 0);
  const matchingTrials = rows.reduce((total, row) => total + row.matchingTrials, 0);
  const fullFingerprint = fingerprint(rows.map(({ id, trials }) => [id, trials]));
  return {
    schemaVersion: "counsel-metamorphic-reliability/v1",
    clinicalPerformanceEstimate: null,
    externalModelCalls: 0,
    externalSpendUsd: 0,
    transformations: Object.keys(SEMANTIC_PRESERVING_TRANSFORMS),
    inputSha256: fingerprint(cases.map(({ id, corpus, message }) => [id, corpus, message])),
    cases: rows.length,
    trials: trialCount,
    metamorphicTrialPassRate: matchingTrials / trialCount,
    allFivePassRate: rows.filter(({ allTrialsMatch }) => allTrialsMatch).length / rows.length,
    fingerprint: fullFingerprint,
    interpretation: "Normalization and execution reproducibility only; this is not stochastic model reliability or clinical validity.",
    caseResults: rows.map(({ id, corpus, matchingTrials: matched, trialCount: count, allTrialsMatch }) => ({ id, corpus, matchingTrials: matched, trialCount: count, allTrialsMatch })),
    mismatches: rows.filter(({ allTrialsMatch }) => !allTrialsMatch),
  };
}
