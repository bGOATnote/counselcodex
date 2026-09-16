import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { repositoryRoot, hash } from "../src/disposition/runtime.ts";
import { estimatedRunCost } from "../src/disposition/latency-evaluation.ts";

// Read-only replay of the exact local artifacts. No models, graders or new runs.
const root = repositoryRoot(), base = join(root, "apps/evaluation/.local/disposition-agent-v3");
const experiment = "2026-09-10T20-17-57.190Z", directory = join(base, "experiments", experiment);
const pilot = readdirSync(directory).filter((file) => /^C\d+-\d+-.*\.json$/.test(file) && !file.endsWith("started.json")).sort().map((file) => {
  const raw = readFileSync(join(directory, file), "utf8"), observation = JSON.parse(raw), run = observation.run;
  return { caseId: observation.id, trial: observation.trial, profile: observation.profile, runId: run.runId, artifactSha256: hash(raw), status: run.status, failure: run.failure,
    firstActionMs: run.firstActionMs, firstReplyMs: run.firstPatientReplyMs, openingMs: run.firstOpeningMs, durationMs: run.durationMs, modelCalls: run.modelCalls,
    failures: observation.visible.failures, expectedDevelopmentRouteMatch: observation.expectedRouteMatch, estimatedUSD: estimatedRunCost(run) };
});
const http = ["2026-09-10T20-27-09.209Z", "2026-09-10T20-29-23.423Z"].flatMap((epoch) => readdirSync(join(base, "http", epoch)).sort().map((file) => {
  const raw = readFileSync(join(base, "http", epoch, file), "utf8"), observation = JSON.parse(raw);
  const runRaw = readFileSync(join(base, "runs", `${observation.runId}.json`), "utf8");
  return { ...observation, followUp: epoch.includes("20-29"), receiptArtifactSha256: hash(raw), runArtifactSha256: hash(runRaw), estimatedUSD: estimatedRunCost(JSON.parse(runRaw)) };
}));
const knownCosts = [...pilot, ...http].map((row) => row.estimatedUSD);
const report = {
  version: "progressive-response-report/v1", experiment, manifestHash: JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")).manifestHash,
  clockDefinition: "Pilot times: server elapsed. HTTP received times: real client decoder receipt, not browser paint.",
  clinicalCorrectness: "not_assessed", citationEntailment: "not_assessed", clinicalNonInferiorityEstablished: false, autoPromoted: false,
  pilot, http, estimatedTotalUSD: knownCosts.every((value) => value !== null) ? knownCosts.reduce((sum, value) => sum + value!, 0) : null,
};
if (process.argv.includes("--verify")) {
  assert.deepEqual(JSON.parse(readFileSync(join(root, "docs/evaluations/progressive-latency-2026-09-10.json"), "utf8")), report);
  console.log("Verified all 12 pilot and 4 HTTP observations against immutable local artifact hashes; no provider calls.");
} else console.log(JSON.stringify(report, null, 2));
