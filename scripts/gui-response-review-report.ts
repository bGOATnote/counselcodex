// Export only the named synthetic GUI rehearsals. Does not run a model, modify
// old results, export source passages, or count physician reference reviews.
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { responseReviewStore } from "../src/evaluation/response-review-store.ts";
import type { DispositionRun } from "../src/disposition/contract.ts";
const root = resolve(import.meta.dirname, "..");
const examples = [
  ["C50 v29", "0f9707a8-ad65-41e4-a441-31c4abae68a2"],
  ["C50 plus fictional focal weakness/speech update", "ab9e2bfc-c3c9-4856-89af-87e9cb635cff"],
  ["C04", "e8cb17a3-8f9a-40be-a461-faeb8bf6e387"],
  ["C50 v30", "04ef916c-b3e5-4adc-9243-aa58fb66339f"],
  ["C50 v31", "e5e56693-72da-4d0d-a98b-0a12aaba7214"],
  ["C46 v31", "b54270ac-79e5-4809-a470-c4274441ae76"],
  ["C50 v32", "641aeee0-449a-4ceb-80f2-fceb7c5c79b7"],
];
const store = responseReviewStore(join(root, "apps/evaluation/.local/response-review-v1/reviews.db"));
try {
  const attempts = examples.map(([example, id]) => {
    const r: DispositionRun = JSON.parse(readFileSync(join(root, "apps/evaluation/.local/disposition-agent-v3/runs", `${id}.json`), "utf8"));
    if (r.runId !== id) throw new Error("RUN_MISMATCH");
    const job = store.get(id);
    return { example, runId: id, profile: r.profile, version: r.adaptive?.version,
      inputHash: r.inputHash, answerHash: r.answerHash, promptHash: r.promptHash,
      status: r.status, failure: r.failure, route: r.answer?.disposition ?? null,
      reviewPriority: r.answer?.reviewPriority ?? null, completedAt: r.completedAt,
      firstActionMs: r.firstActionMs, firstOpeningMs: r.firstOpeningMs,
      firstQuestionMs: r.firstQuestionMs, firstPatientReplyMs: r.firstPatientReplyMs,
      durationMs: r.durationMs, steps: r.steps, usage: r.usage,
      generationTracePersisted: r.tracePersisted,
      judgment: job ? { state: job.state, error: job.error, packetHash: job.packetHash,
        outcome: job.result?.review.outcome ?? null, criteria: job.result?.review.criteria,
        calibration: job.result?.review.calibration, clinicalApproval: false,
        durationMs: job.result?.durationMs, estimatedUsd: job.result?.estimatedUsd,
        traceId: job.result?.traceId, tracePersisted: job.result?.tracePersisted } : null };
  });
  const times = attempts.map(r => r.durationMs).sort((a,b) => a-b);
  const report = { schemaVersion: 2, supersedes: "summary.json (exporter used an absent summary property; criteria and measurements are unchanged)", generatedAt: new Date().toISOString(), scope: "Seven actual browser rehearsals, all retained; iterative development, not a held-out study or causal ablation",
    denominator: attempts.length, completedAssessments: attempts.filter(r => r.status === "complete").length,
    completedReviews: attempts.filter(r => r.judgment?.state === "complete").length,
    responsesWithJudgeConcerns: attempts.filter(r => r.judgment?.criteria?.some(c => c.verdict === "fail")).length,
    physicianValidated: false, medianFinalMs: times[Math.floor(times.length/2)], maximumFinalMs: times.at(-1),
    knownReviewEstimatedUsd: attempts.reduce((sum,r) => sum + (r.judgment?.estimatedUsd ?? 0), 0),
    attempts };
  const destination = resolve(process.argv[2] ?? join(root, "outputs/gui-response-review-20260911/summary-v2.json"));
  if (existsSync(destination)) {
    const prior = JSON.parse(readFileSync(destination, "utf8"));
    if (JSON.stringify(prior.attempts) !== JSON.stringify(report.attempts)) throw new Error("IMMUTABLE_REPORT_CONFLICT");
    console.log("Existing immutable report verified:", destination);
  } else { mkdirSync(resolve(destination, ".."), { recursive: true }); writeFileSync(destination, JSON.stringify(report, null, 2) + "\n", { flag: "wx" }); console.log(destination); }
  console.log(JSON.stringify({ attempts: report.denominator, reviews: report.completedReviews, flagged: report.responsesWithJudgeConcerns, medianFinalMs: report.medianFinalMs, maximumFinalMs: report.maximumFinalMs, reviewEstimatedUsd: report.knownReviewEstimatedUsd }));
} finally { store.close(); }
