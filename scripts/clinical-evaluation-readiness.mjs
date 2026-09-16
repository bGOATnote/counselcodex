import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildClinicalReadinessReport } from "../src/evaluation/clinical-readiness.mjs";
import { dataset, evaluationCases } from "../apps/evaluation/lib/cases.ts";
import {
  parseImportedWorkspace,
  summarizeWorkspace,
} from "../apps/evaluation/lib/review-state.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(path) {
  return JSON.parse(await readFile(resolve(root, path), "utf8"));
}

function reviewBundlePath(argv) {
  const flagIndex = argv.indexOf("--review-bundle");
  if (flagIndex === -1) return null;
  const value = argv[flagIndex + 1];
  if (!value || value.startsWith("--")) {
    throw new Error("--review-bundle requires the path to a GUI audit export");
  }
  return resolve(process.cwd(), value);
}

async function loadAttestedPhysicianReview(path) {
  if (!path) return null;
  const raw = await readFile(path, "utf8");
  const workspace = await parseImportedWorkspace(
    raw,
    dataset,
    evaluationCases.map(({ id }) => id),
  );
  const summary = summarizeWorkspace(workspace, evaluationCases);
  if (!workspace.attestation || summary.complete !== 50 || summary.total !== 50) {
    throw new Error(
      "The GUI audit export must contain a valid attestation and all 50 completed cases",
    );
  }
  return {
    integrityVerified: true,
    provenanceMatched: true,
    workspace,
    summary,
  };
}

const portfolio = await readJson("configs/clinical-evaluation-portfolio-v1.json");
const preAdjudicationEvidence = await readJson("outputs/pre-adjudication-evidence-v1.json");
const frozenAgentHoldout = await readJson("outputs/frozen-agent-holdout-v1.json");
const frozenRetrievalHoldout = await readJson("outputs/frozen-retrieval-holdout-v1.json");
const healthbenchEmergencyEvidence = await Promise.all([
  readJson("outputs/healthbench-emergency-always-emergency-v1.json"),
  readJson("outputs/healthbench-emergency-never-emergency-v1.json"),
  readJson("outputs/healthbench-emergency-deterministic-v1.json"),
]);
const attestedPhysicianReview = await loadAttestedPhysicianReview(
  reviewBundlePath(process.argv.slice(2)),
);

const report = buildClinicalReadinessReport({
  portfolio,
  preAdjudicationEvidence,
  frozenAgentHoldout,
  frozenRetrievalHoldout,
  healthbenchEmergencyEvidence,
  attestedPhysicianReview,
});
const outputPath = resolve(root, "outputs/clinical-evaluation-readiness-v1.json");
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`Clinical evaluation portfolio: ${report.portfolioValidation.benchmarkCount} benchmarks`);
console.log(`Counsel technical review: ${report.reviewDisposition}`);
console.log(`Clinical readiness: ${report.status}`);
console.log(`Retrieval candidate admitted: ${report.currentEvidence.frozenRetrievalCandidateAdmitted}`);
console.log(`Clinical performance estimated: ${report.claimDecisions.clinicalPerformanceEstimated.allowed}`);
console.log(`Clinical efficacy established: ${report.claimDecisions.clinicalEfficacyEstablished.allowed}`);
console.log(`Zero harm established: ${report.claimDecisions.zeroHarmEstablished.allowed}`);
console.log(`Wrote ${outputPath}`);
