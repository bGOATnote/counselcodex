import { readCsv } from "../src/lib/csv.mjs";
import {
  ASYNC_PHYSICIAN,
  EMERGENCY_NOW,
  LEGACY_URGENT_ESCALATION,
  SAME_DAY_IN_PERSON,
  SELF_CARE,
  toLegacyDisposition,
} from "../src/domain/constants.mjs";

const ORDER = [SELF_CARE, ASYNC_PHYSICIAN, SAME_DAY_IN_PERSON, EMERGENCY_NOW];
const COST = new Map([
  [`${SELF_CARE}:${SELF_CARE}`, 0], [`${SELF_CARE}:${ASYNC_PHYSICIAN}`, 1], [`${SELF_CARE}:${SAME_DAY_IN_PERSON}`, 3], [`${SELF_CARE}:${EMERGENCY_NOW}`, 4],
  [`${ASYNC_PHYSICIAN}:${SELF_CARE}`, 4], [`${ASYNC_PHYSICIAN}:${ASYNC_PHYSICIAN}`, 0], [`${ASYNC_PHYSICIAN}:${SAME_DAY_IN_PERSON}`, 2], [`${ASYNC_PHYSICIAN}:${EMERGENCY_NOW}`, 3],
  [`${SAME_DAY_IN_PERSON}:${SELF_CARE}`, 18], [`${SAME_DAY_IN_PERSON}:${ASYNC_PHYSICIAN}`, 15], [`${SAME_DAY_IN_PERSON}:${SAME_DAY_IN_PERSON}`, 0], [`${SAME_DAY_IN_PERSON}:${EMERGENCY_NOW}`, 2],
  [`${EMERGENCY_NOW}:${SELF_CARE}`, 30], [`${EMERGENCY_NOW}:${ASYNC_PHYSICIAN}`, 25], [`${EMERGENCY_NOW}:${SAME_DAY_IN_PERSON}`, 12], [`${EMERGENCY_NOW}:${EMERGENCY_NOW}`, 0],
]);

const LEGACY_ORDER = [SELF_CARE, ASYNC_PHYSICIAN, LEGACY_URGENT_ESCALATION];
const LEGACY_COST = new Map([
  [`${SELF_CARE}:${SELF_CARE}`, 0], [`${SELF_CARE}:${ASYNC_PHYSICIAN}`, 1], [`${SELF_CARE}:${LEGACY_URGENT_ESCALATION}`, 3],
  [`${ASYNC_PHYSICIAN}:${SELF_CARE}`, 4], [`${ASYNC_PHYSICIAN}:${ASYNC_PHYSICIAN}`, 0], [`${ASYNC_PHYSICIAN}:${LEGACY_URGENT_ESCALATION}`, 2],
  [`${LEGACY_URGENT_ESCALATION}:${SELF_CARE}`, 25], [`${LEGACY_URGENT_ESCALATION}:${ASYNC_PHYSICIAN}`, 20], [`${LEGACY_URGENT_ESCALATION}:${LEGACY_URGENT_ESCALATION}`, 0],
]);

export function wilsonInterval(successes, total, z = 1.959963984540054) {
  if (!Number.isInteger(successes) || !Number.isInteger(total) || successes < 0 || total < 0 || successes > total) {
    throw new RangeError("successes and total must be non-negative integers with successes <= total");
  }
  if (!Number.isFinite(z) || z <= 0) throw new RangeError("z must be a positive finite number");
  if (total === 0) return null;
  const proportion = successes / total;
  const zSquared = z ** 2;
  const denominator = 1 + zSquared / total;
  const center = (proportion + zSquared / (2 * total)) / denominator;
  const margin = (z * Math.sqrt((proportion * (1 - proportion) + zSquared / (4 * total)) / total)) / denominator;
  const lower = Math.max(0, center - margin);
  const upper = Math.min(1, center + margin);
  return {
    lower: lower < 1e-15 ? 0 : lower,
    upper: 1 - upper < 1e-15 ? 1 : upper,
  };
}

function metricsFor(pairs, order, cost, positiveLabels) {
  const count = pairs.length;
  const correct = pairs.filter(([candidate, predicted]) => candidate === predicted).length;
  const perClass = {};
  for (const label of order) {
    const tp = pairs.filter(([candidate, predicted]) => candidate === label && predicted === label).length;
    const fp = pairs.filter(([candidate, predicted]) => candidate !== label && predicted === label).length;
    const fn = pairs.filter(([candidate, predicted]) => candidate === label && predicted !== label).length;
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    perClass[label] = {
      support: tp + fn,
      precision,
      precision95CI: wilsonInterval(tp, tp + fp),
      recall,
      recall95CI: wilsonInterval(tp, tp + fn),
      f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
    };
  }
  const escalationCandidates = pairs.filter(([candidate]) => positiveLabels.has(candidate));
  const escalationPredicted = pairs.filter(([, predicted]) => positiveLabels.has(predicted));
  const escalationTruePositive = escalationCandidates.filter(([, predicted]) => positiveLabels.has(predicted)).length;
  const confusion = Object.fromEntries(order.flatMap((candidate) => order.map((predicted) => [
    `${candidate}->${predicted}`,
    pairs.filter(([actual, output]) => actual === candidate && output === predicted).length,
  ])));
  const weightedCost = pairs.reduce((sum, [candidate, predicted]) => {
    const value = cost.get(`${candidate}:${predicted}`);
    if (value === undefined) throw new Error(`No illustrative cost for ${candidate}:${predicted}`);
    return sum + value;
  }, 0);
  return {
    n: count,
    accuracy: count ? correct / count : 0,
    accuracy95CI: wilsonInterval(correct, count),
    weightedCost,
    meanCost: count ? weightedCost / count : 0,
    escalationRecall: escalationCandidates.length ? escalationTruePositive / escalationCandidates.length : 0,
    escalationRecall95CI: wilsonInterval(escalationTruePositive, escalationCandidates.length),
    escalationPrecision: escalationPredicted.length ? escalationTruePositive / escalationPredicted.length : 0,
    escalationPrecision95CI: wilsonInterval(escalationTruePositive, escalationPredicted.length),
    perClass,
    confusion,
  };
}

export function calculateMetrics(pairs) {
  return metricsFor(pairs, ORDER, COST, new Set([SAME_DAY_IN_PERSON, EMERGENCY_NOW]));
}

export function calculateLegacyMetrics(pairs) {
  return metricsFor(pairs, LEGACY_ORDER, LEGACY_COST, new Set([LEGACY_URGENT_ESCALATION]));
}

export async function evaluateRows({ predictionsPath, messagesPath, referenceProposalPath }) {
  const [predictions, messages, proposalRows] = await Promise.all([
    readCsv(predictionsPath),
    readCsv(messagesPath),
    readCsv(referenceProposalPath),
  ]);
  const predictionById = new Map(predictions.map((row) => [row.id, row]));
  const proposalById = new Map(proposalRows.map((row) => [row.id, row]));
  const cases = messages.map((message) => {
    const prediction = predictionById.get(message.id);
    const proposal = proposalById.get(message.id);
    if (!prediction || !proposal) throw new Error(`Missing joined row for ${message.id}`);
    return {
      id: message.id,
      message: message.message,
      provided: message.disposition,
      proposalDisposition: proposal.clinician_disposition,
      proposalLegacyDisposition: toLegacyDisposition(proposal.clinician_disposition),
      predicted: prediction.disposition,
    };
  });
  const pairs = cases.map((row) => [row.proposalDisposition, row.predicted]);
  const providedPairs = cases.map((row) => [row.proposalLegacyDisposition, row.provided]);
  return {
    workflowVsReferenceProposal: calculateMetrics(pairs),
    providedVsReferenceProposal: calculateLegacyMetrics(providedPairs),
    baselines: {
      alwaysAsync: calculateMetrics(cases.map((row) => [row.proposalDisposition, ASYNC_PHYSICIAN])),
      alwaysSameDay: calculateMetrics(cases.map((row) => [row.proposalDisposition, SAME_DAY_IN_PERSON])),
      alwaysEmergency: calculateMetrics(cases.map((row) => [row.proposalDisposition, EMERGENCY_NOW])),
      alwaysSelfCare: calculateMetrics(cases.map((row) => [row.proposalDisposition, SELF_CARE])),
    },
    providedLabelAudit: {
      disagreements: cases.filter((row) => row.provided !== row.proposalLegacyDisposition).length,
      missedEscalation: cases.filter((row) => row.proposalLegacyDisposition === LEGACY_URGENT_ESCALATION && row.provided !== LEGACY_URGENT_ESCALATION).length,
      falseEscalation: cases.filter((row) => row.proposalLegacyDisposition !== LEGACY_URGENT_ESCALATION && row.provided === LEGACY_URGENT_ESCALATION).length,
    },
    cases,
  };
}
