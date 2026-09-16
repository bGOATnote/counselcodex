import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  deriveCohorts,
  patientTranscriptFor,
  scoreReliabilityTrials,
  verifyUpstream,
} from "../src/evaluation/healthbench-emergency.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultConfigPath = resolve(root, "configs/healthbench-emergency-counsel-method-v1.json");
const defaultDatasetPath = resolve(root, ".cache/healthbench/consensus_2025-05-09-20-00-46.jsonl");
const defaultOutputPath = resolve(root, `outputs/healthbench-legacy-offline-${Date.now()}.json`);

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function positiveInteger(value, label, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} must be a positive integer`);
  return parsed;
}

async function loadConfig() {
  return JSON.parse(await readFile(resolve(argument("--config") ?? defaultConfigPath), "utf8"));
}

async function fetchDataset(config, datasetPath) {
  const response = await fetch(config.upstream.url, { redirect: "follow", signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`HealthBench download failed with HTTP ${response.status}`);
  const source = await response.text();
  verifyUpstream(source, config);
  await mkdir(dirname(datasetPath), { recursive: true, mode: 0o700 });
  await writeFile(datasetPath, source, { encoding: "utf8", mode: 0o600 });
  return source;
}

async function readDataset(config, datasetPath) {
  try {
    return await readFile(datasetPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    throw new Error(`HealthBench source is missing at ${datasetPath}. Run: npm run healthbench:fetch`);
  }
}

async function predictorFor(mode) {
  if (mode === "always-emergency") {
    return { predict: async () => ({ disposition: "EMERGENCY_NOW", source: "control" }), shutdown: async () => {} };
  }
  if (mode === "never-emergency") {
    return { predict: async () => ({ disposition: "ASYNC_PHYSICIAN", source: "control" }), shutdown: async () => {} };
  }
  if (mode === "deterministic") {
    const [{ routeWithMastra }, { mastra }] = await Promise.all([
      import("../src/mastra/run.ts"),
      import("../src/mastra/legacy-index.ts"),
    ]);
    return {
      predict: async (row) => {
        const result = await routeWithMastra(patientTranscriptFor(row), row.prompt_id);
        return { disposition: result.disposition, source: result.layer, subtype: result.subtype };
      },
      shutdown: async () => mastra.shutdown(),
    };
  }
  throw new Error(`unsupported --mode '${mode}'`);
}

async function runTrial(rows, predict, trialNumber) {
  const predictions = [];
  for (const row of rows) {
    let prediction;
    try {
      prediction = await predict(row);
    } catch (error) {
      prediction = {
        disposition: null,
        source: "evaluation_error",
        error: error instanceof Error ? error.message : "unknown evaluation error",
      };
    }
    predictions.push({
      id: row.prompt_id,
      trial: trialNumber,
      label: row.evaluation.label,
      emergencyExpected: row.evaluation.emergencyExpected,
      emergencyPredicted: prediction.disposition === "EMERGENCY_NOW",
      ...prediction,
    });
  }
  return predictions;
}

async function main() {
  const command = process.argv[2] ?? "evaluate";
  const config = await loadConfig();
  const datasetPath = resolve(argument("--dataset") ?? defaultDatasetPath);

  if (command === "fetch") {
    const source = await fetchDataset(config, datasetPath);
    const cohorts = deriveCohorts(verifyUpstream(source, config), config);
    console.log(JSON.stringify({ status: "ok", datasetPath, audit: cohorts.audit }, null, 2));
    return;
  }

  const source = await readDataset(config, datasetPath);
  const rows = verifyUpstream(source, config);
  const cohorts = deriveCohorts(rows, config);

  if (command === "audit") {
    console.log(JSON.stringify({ status: "ok", datasetPath, audit: cohorts.audit }, null, 2));
    return;
  }
  if (command !== "evaluate") throw new Error("usage: healthbench-emergency.mjs <fetch|audit|evaluate>");

  const mode = argument("--mode") ?? "deterministic";
  if (mode === "live-agent") throw new Error("This historical command does not test the GUI workflow. Use clinical:benchmark plan/run/grade/report with explicit study authorization.");
  const trials = positiveInteger(argument("--trials"), "--trials", 1);
  const outputPath = resolve(argument("--output") ?? defaultOutputPath);
  const requestedMaxCases = argument("--max-cases");
  const maxCases = requestedMaxCases === undefined
    ? cohorts.primary.length
    : Math.min(positiveInteger(requestedMaxCases, "--max-cases", cohorts.primary.length), cohorts.primary.length);
  const evaluationRows = cohorts.primary.slice(0, maxCases);

  const spend = { providerCallsAuthorized: false, estimatedCeilingUsd: 0, maxCostUsd: 0 };

  const predictor = await predictorFor(mode);
  const trialRows = [];
  try {
    for (let trial = 1; trial <= trials; trial += 1) {
      trialRows.push(await runTrial(evaluationRows, predictor.predict, trial));
    }
  } finally {
    await predictor.shutdown();
  }
  const reliability = scoreReliabilityTrials(trialRows);
  const allPredictions = trialRows.flat();
  const evaluationErrors = allPredictions.filter(({ error }) => error);
  const degradedAgentRuns = allPredictions.filter(({ agentStatus }) => agentStatus === "degraded");
  const completeCohort = evaluationRows.length === cohorts.primary.length;
  const dispositionsById = new Map();
  for (const prediction of allPredictions) {
    const dispositions = dispositionsById.get(prediction.id) ?? new Set();
    dispositions.add(prediction.disposition);
    dispositionsById.set(prediction.id, dispositions);
  }
  const deterministicRepeatStable = mode === "live-agent"
    ? null
    : [...dispositionsById.values()].every((dispositions) => dispositions.size === 1);
  const worstMetrics = reliability.worstOfK;
  const gate = {
    evaluatedCompletePrimaryCohort: completeCohort,
    noEvaluationErrors: evaluationErrors.length === 0,
    noDegradedAgentRuns: mode !== "live-agent" || degradedAgentRuns.length === 0,
    deterministicRepeatStable,
    zeroObservedEmergencyFalseNegatives: worstMetrics.confusionMatrix.falseNegative === config.releaseGate.observedEmergencyFalseNegatives,
    minimumObservedEmergencyPrecision: worstMetrics.emergencyPrecision !== null
      && worstMetrics.emergencyPrecision >= config.releaseGate.minimumObservedEmergencyPrecision,
    minimumObservedSpecificity: worstMetrics.specificity !== null
      && worstMetrics.specificity >= config.releaseGate.minimumObservedSpecificity,
  };
  const passed = Object.values(gate).every((value) => value === true || value === null);

  const report = {
    schemaVersion: "counsel-healthbench-emergency-result/v1",
    status: passed ? "passed" : "failed",
    generatedAt: new Date().toISOString(),
    artifact: "synthetic-derived-external-stress-test",
    mode,
    source: { url: config.upstream.url, sha256: config.upstream.sha256 },
    cohort: cohorts.audit,
    evaluatedCases: evaluationRows.length,
    completePrimaryCohort: completeCohort,
    reliability,
    gate,
    evaluationErrors: evaluationErrors.map(({ id, trial, error }) => ({ id, trial, error })),
    degradedAgentRuns: degradedAgentRuns.map(({ id, trial, degradedReason }) => ({ id, trial, degradedReason })),
    routeCounts: Object.fromEntries([...new Set(allPredictions.map(({ disposition }) => disposition))].map((disposition) => [
      String(disposition),
      allPredictions.filter((row) => row.disposition === disposition).length,
    ])),
    predictions: allPredictions,
    spend,
    publishedContextOnly: config.publishedContextOnly,
    claimBoundary: config.releaseGate.interpretation,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(JSON.stringify({
    status: report.status,
    mode,
    evaluatedCases: report.evaluatedCases,
    cohort: report.cohort,
    metrics: report.reliability.worstOfK,
    gate,
    outputPath,
  }, null, 2));
  assert.equal(passed, true, "HealthBench emergency release gate failed; inspect the written report");
}

await main();
