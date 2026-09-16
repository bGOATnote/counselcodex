import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { graphPromptHash } from "../../src/disposition/clinical-graph.ts";
import { productionArtifactFiles } from "../../scripts/candidate-cohort-study.ts";

// Planning only. No model dispatch, secret reads or database opening.
const prior = JSON.parse(readFileSync("outputs/clinical-lift-v23-gui-2026-09-14/phase4-plan.json", "utf8"));
const captured = JSON.parse(readFileSync("outputs/clinical-lift-v23-gui-2026-09-14/phase4/summary.json", "utf8"));
if (captured.attempts !== 5 || captured.unknownCostAttempts || captured.complete !== 4) throw new Error("ORIGINAL_GUI_FAILURE_RECORD_REQUIRED");
const sprintAccountedUSD = 81.140014025 + captured.knownUSD * 1.25 + captured.attempts * .002;
const separateJudgeReservationUSD = 4, allocationUSD = 100 - sprintAccountedUSD - separateJudgeReservationUSD;
if (allocationUSD < prior.perAssessmentReservationUSD) throw new Error("INSUFFICIENT_REMAINING_SPRINT_RESERVATION");
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const sourcePaths = Object.keys(prior.files).filter(path => !path.startsWith("apps/evaluation/.next/"));
const files = Object.fromEntries([...new Set([...sourcePaths, "src/evaluation/v23-review-packet.ts", "tests/onset-denial-admission.test.ts", ...productionArtifactFiles(), "apps/evaluation/.next/BUILD_ID"])].sort().map(path => [path, hash(readFileSync(path))]));
const promptHash = graphPromptHash(prior.config);
if (promptHash === prior.promptHash) throw new Error("NEW_PATTERN_ADMISSION_IDENTITY_REQUIRED");
const plan = { protocol: "clinical-lift-v23-gui/v5", createdAt: new Date().toISOString(),
  purpose: "Actual-browser original C50 and same attributed follow-up after replacing a brittle clinical-language parser with a scoped three-state guard and mandatory full exact-draft judge. Not a new cohort score.",
  endpoint: prior.endpoint, version: prior.version, promptHash, previousFailedPromptHash: prior.promptHash,
  config: prior.config, sourceHash: prior.sourceHash, files,
  casesInOrder: ["C50", "C50-update"], cases: prior.cases.filter((row: {id: string}) => row.id === "C50"), update: prior.update,
  maximumAssessments: 2, allocationUSD, perAssessmentReservationUSD: prior.perAssessmentReservationUSD,
  sprintAccountedBeforeThisPhaseUSD: sprintAccountedUSD, separateJudgeReservationUSD, sprintCeilingUSD: 100,
  accounting: "Retain full per-assessment reserve before each sequential start; reconcile known token estimates times1.25 plus0.002 per run, unknown usage retains full reserve. Separate four-dollar judge allocation remains unavailable here until explicitly reconciled. No retry/replacement or fresh budget is inferred.",
  checks: ["original versus attributed update", "no unsupported early escalation", "current prompt/source identity", "source links, patient response and trace visible", "every failed start retained", "onset semantics require full exact-draft judge"],
  limitation: "Two development-browser trials cannot prove reliability or clinical safety. Sources and grader are not independent physician adjudication. Receipt/publication timing is not browser-paint measurement.",
};
const path = "outputs/clinical-lift-v23-gui-2026-09-14/phase5-plan.json";
writeFileSync(path, JSON.stringify({ ...plan, fingerprint: hash(JSON.stringify(plan)) }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ path, promptHash, sprintAccountedUSD, separateJudgeReservationUSD, allocationUSD, maximumTotalUSD: sprintAccountedUSD + separateJudgeReservationUSD + allocationUSD }));
