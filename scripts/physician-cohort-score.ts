import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { sha256 } from "../src/evidence/rag/model.ts";
import { readPhysicianReference, scorePhysicianCohort, candidateInputs } from "../src/evaluation/physician-cohort.ts";
import type { DispositionRun } from "../src/disposition/contract.ts";
import { CLINICAL_POLICY_VERSION } from "../src/disposition/clinical-policy.ts";
import { scoreV25PathB } from "../src/evaluation/v25-path-b.ts";

const [promptHash, destination, runtime = "apps/evaluation/.local/clinical-evidence-graph-v1"] = process.argv.slice(2);
if (!promptHash || !/^[0-9a-f]{64}$/.test(promptHash) || !destination) throw new Error("Usage: physician-cohort-score.ts PROMPT_HASH NEW_OUTPUT_DIRECTORY [RUNTIME_DIRECTORY]");
const referencePath = "data/evaluation/physician-system-reference-v2.json", referenceRaw = readFileSync(referencePath, "utf8");
const reference = readPhysicianReference(referenceRaw, readFileSync("data/patient_messages.csv", "utf8"));
const runs: DispositionRun[] = readdirSync(join(runtime, "runs")).filter(n => n.endsWith(".json")).map(n => JSON.parse(readFileSync(join(runtime, "runs", n), "utf8")));
const report = scorePhysicianCohort(reference, runs, promptHash), output = resolve(destination);
const admissionPath=join(runtime,"attempt-admission.json");
if(existsSync(admissionPath)) {
  const diagnosticPath=join(runtime,"diagnostic-runs"), diagnosticRuns=readdirSync(diagnosticPath).filter(n=>n.endsWith(".json")).map(n=>JSON.parse(readFileSync(join(diagnosticPath,n),"utf8")) as DispositionRun);
  report.pathB=scoreV25PathB(reference,diagnosticRuns,promptHash,JSON.parse(readFileSync(admissionPath,"utf8")));
}
mkdirSync(output, { recursive: false }); mkdirSync(join(output, "runs"));
const save = (path: string, value: unknown) => writeFileSync(join(output, path), JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
save("scorecard.json", report);
save("patient-input-plan.json", candidateInputs(reference));
if(existsSync(admissionPath)) {
  save("attempt-admission.json",JSON.parse(readFileSync(admissionPath,"utf8")));
  mkdirSync(join(output,"diagnostic-runs"));
  for(const n of readdirSync(join(runtime,"diagnostic-runs")).filter(n=>n.endsWith(".json"))) save(`diagnostic-runs/${n}`,JSON.parse(readFileSync(join(runtime,"diagnostic-runs",n),"utf8")));
}
const selected = runs.filter(r => r.promptHash === promptHash);
for (const run of selected) save(`runs/${run.runId}.json`, run);
save("manifest.json", { createdAt: new Date().toISOString(), referencePath, referenceSha256: sha256(referenceRaw), promptHash,
  releaseIdentity: report.releaseIdentity,
  scorerSha256: sha256(readFileSync("src/evaluation/physician-cohort.ts", "utf8")),
  scorerDependencies: Object.fromEntries(["src/evaluation/v25-path-b.ts", "src/disposition/judge-anchors.ts", "src/disposition/care-setting.ts", "src/disposition/gates-release.ts", "src/evidence/rag/selection.ts", "src/disposition/contract.ts", "src/disposition/routing-policy.ts", "src/disposition/graph-output.ts", "src/disposition/progressive.ts", "src/disposition/repair-values.ts"].map(path => [path, sha256(readFileSync(path, "utf8"))])),
  clinicalPolicyVersion: CLINICAL_POLICY_VERSION, clinicalPolicySha256: sha256(readFileSync("src/disposition/clinical-policy.ts", "utf8")),
  corpusHashes: [...new Set(selected.flatMap(r => r.graph?.retrieval.map(p => p.corpusHash) ?? []))],
  runIds: selected.map(r => r.runId), noProviderCalls: true,
  comparison: "Reference only enters the offline scorer. Exact agreement and stored model-supported alternatives are separate, without regrading historical models under the current policy. Off-cohort stress cases are retained but never pooled into the 50-case agreement rate." });
console.log(JSON.stringify({ output, attempted: report.casesAttempted, completeAgreements: report.firstAttemptCompleteAgreements, attemptedDenominator: report.firstAttemptDenominator, plannedDenominator: report.plannedReferenceDenominator, modelReview: report.firstAttemptModelReview, unknownCostAttempts: report.unknownCostAttempts }));
