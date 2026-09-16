import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { compareEmergencyPredictions } from "../src/evaluation/healthbench-emergency.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readReport(path) {
  const report = JSON.parse(await readFile(resolve(path), "utf8"));
  if (report.schemaVersion !== "counsel-healthbench-emergency-result/v1") throw new Error(`${path} is not a compatible result`);
  if (report.reliability?.trials !== 1) throw new Error(`${path} must contain exactly one trial for paired comparison`);
  return report;
}

const baselinePath = argument("--baseline");
const candidatePath = argument("--candidate");
const outputPath = argument("--output");
if (!baselinePath || !candidatePath) {
  throw new Error("usage: healthbench-compare.mjs --baseline <result.json> --candidate <result.json> [--output <comparison.json>]");
}
const [baseline, candidate] = await Promise.all([readReport(baselinePath), readReport(candidatePath)]);
if (baseline.cohort.primaryIdSha256 !== candidate.cohort.primaryIdSha256) throw new Error("cohort fingerprints do not match");
const comparison = {
  schemaVersion: "counsel-healthbench-emergency-comparison/v1",
  artifact: "synthetic-derived-external-stress-test",
  cohortIdSha256: baseline.cohort.primaryIdSha256,
  baselineMode: baseline.mode,
  candidateMode: candidate.mode,
  comparison: compareEmergencyPredictions(baseline.predictions, candidate.predictions),
  claimBoundary: "Paired lift on this frozen synthetic reconstruction is not clinical efficacy or a strict replication of Counsel's unpublished cohort.",
};
if (outputPath) {
  const resolvedOutput = resolve(outputPath);
  await mkdir(dirname(resolvedOutput), { recursive: true });
  await writeFile(resolvedOutput, `${JSON.stringify(comparison, null, 2)}\n`, "utf8");
}
console.log(JSON.stringify(comparison, null, 2));
