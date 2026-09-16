import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runEmergencyBranch, runIntentBranch } from "../src/domain/branches.mjs";
import {
  ASYNC_PHYSICIAN,
  EMERGENCY_NOW,
  SAME_DAY_IN_PERSON,
  SELF_CARE,
  isEscalatedDisposition,
} from "../src/domain/constants.mjs";
import { applyHardGate, routeResidual } from "../src/domain/routing.mjs";
import { readCsv } from "../src/lib/csv.mjs";
import { routeMessage } from "../src/workflows/disposition-workflow.mjs";
import { calculateMetrics } from "./evaluate.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const gateClear = Object.freeze({
  status: "ok",
  fired: false,
  name: null,
  disposition: null,
  subtype: null,
  evidence: [],
  directive: null,
});

async function safetyOnly(message) {
  const emergency = await runEmergencyBranch(message);
  if (!emergency.fired) return { disposition: ASYNC_PHYSICIAN };
  return routeResidual(applyHardGate({ emergency, history: await runIntentBranch(message) }));
}

async function intentOnly(message) {
  return routeResidual(applyHardGate({ emergency: gateClear, history: await runIntentBranch(message) }));
}

async function retrievalUnavailable(message) {
  const [emergency, history] = await Promise.all([
    runEmergencyBranch(message),
    runIntentBranch(message, undefined, async () => { throw new Error("ablation"); }),
  ]);
  return routeResidual(applyHardGate({ emergency, history }));
}

const variants = Object.freeze({
  full: async (message) => routeMessage({ message }),
  safety_only: safetyOnly,
  intent_only_no_emergency_gate: intentOnly,
  retrieval_unavailable: retrievalUnavailable,
  always_async: async () => ({ disposition: ASYNC_PHYSICIAN }),
  always_same_day: async () => ({ disposition: SAME_DAY_IN_PERSON }),
  always_emergency: async () => ({ disposition: EMERGENCY_NOW }),
});

async function evaluateVariant(cases, predict) {
  const predictions = [];
  for (const row of cases) predictions.push(await predict(row.message));
  const pairs = cases.map((row, index) => [row.expected, predictions[index].disposition]);
  const metrics = calculateMetrics(pairs);
  return {
    n: metrics.n,
    labelAgreement: metrics.accuracy,
    escalationLabelRecall: metrics.escalationRecall,
    escalationLabelPrecision: metrics.escalationPrecision,
    emergencyLabelRecall: metrics.perClass.EMERGENCY_NOW.recall,
    emergencyLabelPrecision: metrics.perClass.EMERGENCY_NOW.precision,
    illustrativeWeightedCost: metrics.weightedCost,
    escalationMisses: pairs.filter(([expected, predicted]) => isEscalatedDisposition(expected) && !isEscalatedDisposition(predicted)).length,
    emergencyDelayedToSameDay: pairs.filter(([expected, predicted]) => expected === EMERGENCY_NOW && predicted === SAME_DAY_IN_PERSON).length,
    emergencyMisses: pairs.filter(([expected, predicted]) => expected === EMERGENCY_NOW && predicted !== EMERGENCY_NOW).length,
    inappropriateSelfCare: pairs.filter(([expected, predicted]) => expected !== SELF_CARE && predicted === SELF_CARE).length,
    escalationRate: pairs.filter(([, predicted]) => isEscalatedDisposition(predicted)).length / pairs.length,
    emergencyRate: pairs.filter(([, predicted]) => predicted === EMERGENCY_NOW).length / pairs.length,
  };
}

export async function runAblations() {
  const [messages, clinicianRows, redTeamText] = await Promise.all([
    readCsv(resolve(root, "data/patient_messages.csv")),
    readCsv(resolve(root, "data/clinician_development_review.csv")),
    readFile(resolve(root, "data/red_team_cases.jsonl"), "utf8"),
  ]);
  const clinicianById = new Map(clinicianRows.map((row) => [row.id, row.clinician_disposition]));
  const referenceProposalCases = messages.map((row) => ({ message: row.message, expected: clinicianById.get(row.id) }));
  const redTeamCases = redTeamText.trim().split("\n").map((line) => {
    const row = JSON.parse(line);
    return { message: row.message, expected: row.expected };
  });
  const report = {
    schemaVersion: "counsel-component-ablation/v2",
    status: "deterministic-in-sample-research-only",
    clinicalPerformanceEstimate: null,
    referenceStandardEstablished: false,
    externalModelCalls: 0,
    externalSpendUsd: 0,
    referenceProposal: {},
    redTeam: {},
  };
  for (const [name, predict] of Object.entries(variants)) {
    report.referenceProposal[name] = await evaluateVariant(referenceProposalCases, predict);
    report.redTeam[name] = await evaluateVariant(redTeamCases, predict);
  }
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await runAblations();
  await writeFile(resolve(root, "outputs/component-ablation-v1.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}
