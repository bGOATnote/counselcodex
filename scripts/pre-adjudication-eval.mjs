import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GRADER_DEFINITIONS, runGraderMetaEvaluation } from "../src/evaluation/handoff-graders.mjs";
import { validateJudgeProgram } from "../src/evaluation/judge-program.mjs";
import { runReliabilityTrials } from "../src/evaluation/reliability-trials.mjs";
import { runRetrievalBenchmark } from "../src/evaluation/retrieval-benchmark.mjs";
import { readCsv } from "../src/lib/csv.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readJsonLines(path) {
  const source = await readFile(path, "utf8");
  return source.trim().split("\n").map((line) => JSON.parse(line));
}

export async function runPreAdjudicationEvaluation() {
  const [corpus, queries, graderSpecification, judgeProgramConfig, patientCases, redTeamCases] = await Promise.all([
    readJsonLines(resolve(root, "data/retrieval/policy-corpus-v1.jsonl")),
    readJsonLines(resolve(root, "data/retrieval/retrieval-eval-v1.jsonl")),
    readFile(resolve(root, "data/grader_meta_eval_v1.json"), "utf8").then(JSON.parse),
    readFile(resolve(root, "configs/cqa-judge-program-v1.json"), "utf8").then(JSON.parse),
    readCsv(resolve(root, "data/patient_messages.csv")),
    readJsonLines(resolve(root, "data/red_team_cases.jsonl")),
  ]);
  const reliabilityCases = [
    ...patientCases.map(({ id, message }) => ({ id, message, corpus: "provided-synthetic" })),
    ...redTeamCases.map(({ id, message }) => ({ id, message, corpus: "synthetic-red-team" })),
  ];
  const retrieval = runRetrievalBenchmark(corpus, queries);
  const graders = runGraderMetaEvaluation(graderSpecification);
  const judgeProgram = validateJudgeProgram(judgeProgramConfig, GRADER_DEFINITIONS);
  const reliability = await runReliabilityTrials(reliabilityCases);
  const hybrid = retrieval.results.governed_hybrid;
  const admissionGates = {
    retrievalOrderStable: hybrid.stableAcrossCorpusOrder,
    retrievalRecallAtThree: hybrid.summary.recallAtThree >= 0.95,
    retrievalAbstention: hybrid.summary.abstentionAccuracy >= 0.95,
    retrievalForbiddenRate: hybrid.summary.forbiddenTopThreeRate === 0,
    graderExactMutationDetection: graders.exactMutationDetection === 1,
    graderNoFalseNegatives: Object.values(graders.perGrader).every(({ falseNegative }) => falseNegative === 0),
    judgeProgramValidAndClinicalJudgesDisabled: judgeProgram.valid && judgeProgram.clinicalJudgeActivated === false,
    metamorphicAllFive: reliability.allFivePassRate === 1,
  };
  return {
    schemaVersion: "counsel-pre-adjudication-evidence/v1",
    status: Object.values(admissionGates).every(Boolean) ? "passed" : "failed",
    claimBoundary: "Deterministic software, retrieval-challenge, and planted-error grader evidence only. No clinical performance or deployment-readiness estimate.",
    externalModelCalls: 0,
    externalSpendUsd: 0,
    admissionGates,
    retrieval,
    graders,
    judgeProgram,
    reliability,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await runPreAdjudicationEvaluation();
  const output = resolve(root, "outputs/pre-adjudication-evidence-v1.json");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    status: report.status,
    output,
    externalSpendUsd: report.externalSpendUsd,
    admissionGates: report.admissionGates,
    retrieval: Object.fromEntries(Object.entries(report.retrieval.results).map(([name, value]) => [name, value.summary])),
    graders: {
      status: report.graders.status,
      exactMutationDetection: report.graders.exactMutationDetection,
      clinicalMonitoringEligible: report.graders.clinicalMonitoringEligible,
    },
    judgeProgram: report.judgeProgram,
    reliability: {
      cases: report.reliability.cases,
      trials: report.reliability.trials,
      allFivePassRate: report.reliability.allFivePassRate,
      fingerprint: report.reliability.fingerprint,
    },
  }, null, 2));
  assert.equal(report.status, "passed", "one or more pre-adjudication admission gates failed");
}
