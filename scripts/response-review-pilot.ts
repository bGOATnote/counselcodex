import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { repositoryRoot } from "../src/disposition/runtime.ts";
import { createReviewService } from "../src/evaluation/response-review-service.ts";
import { createReviewPacket, REVIEW_INSTRUCTIONS, REVIEW_MODEL, REVIEW_VERSION } from "../src/evaluation/response-review.ts";
import { reviewContrasts } from "../tests/response-review-fixtures.ts";
import { checkAnswer } from "../src/disposition/contract.ts";
import { versionedControlRun, summarizeJudgeControls, type JudgeControlResult } from "../src/evaluation/judge-validation.ts";

const root = repositoryRoot(), service = createReviewService(root);
const args = process.argv.slice(2);
if (args.includes("--resume")) {
  service.store.interruptExpired();
  for (const id of service.store.pending()) { await service.process(id); console.log(JSON.stringify({ runId: id, state: service.store.get(id)?.state })); }
} else if (args.some(a => a.startsWith("--run="))) {
  const id = args.find(a => a.startsWith("--run="))!.slice(6); service.enqueue(service.loadRun(id));
  if (args.includes("--live")) await service.process(id);
  console.log(JSON.stringify(service.store.get(id), null, 2));
} else {
  const cases = reviewContrasts().map(c => ({ ...c, run: versionedControlRun(c.run) }));
  const directory = join(root, "outputs", `response-review-pilot-${Date.now()}`); mkdirSync(directory, { recursive: true });
  const manifest = { protocol: REVIEW_VERSION, model: REVIEW_MODEL, instructionsSha256: createHash("sha256").update(REVIEW_INSTRUCTIONS).digest("hex"),
    scope: "Authored positive/negative mutation controls, not held-out clinical efficacy or physician calibration. No generation-model comparison.",
    budget: { ...service.store.budget(), reservationPerAttemptUsd: 1.25, inferenceLedgersChanged: false },
    cases: cases.map(c => ({ id: c.id, packet: createReviewPacket(c.run), criterion: c.criterion, expected: c.expected })) };
  writeFileSync(join(directory, "manifest.json"), JSON.stringify(manifest, null, 2), { flag: "wx" });
  if (args.includes("--live")) {
    const outcomes = [];
    for (const item of cases) {
      const packet = createReviewPacket(item.run); const before = service.store.get(packet.runId); service.store.enqueue(packet);
      try { await service.process(packet.runId); } catch { /* preserve allocation/provider errors, never retry */ }
      const job = service.store.get(packet.runId)!;
      const observed = job.result?.review.criteria.find(c => c.id === item.criterion)?.verdict ?? null;
      const row = { id: item.id, runId: packet.runId, packetHash: packet.packetHash, cached: before !== null, state: job.state, targetCriterion: item.criterion, expected: item.expected, observed,
        matched: job.state === "complete" && observed === item.expected, outcome: job.result?.review.outcome ?? null, durationMs: job.result?.durationMs ?? null, estimatedUsd: job.result?.estimatedUsd ?? null,
        criteria: job.result?.review.criteria ?? null,
        deterministicFailedChecks: item.run.answer ? checkAnswer(item.run.answer, item.run.message, item.run.guidance, item.run.safetyFloor?.disposition ?? null).filter(c => c.status === "fail").map(c => c.id) : [],
      };
      outcomes.push(row); writeFileSync(join(directory, `${item.id}.json`), JSON.stringify(row, null, 2), { flag: "wx" });
      console.log(JSON.stringify({ id: item.id, state: row.state, expected: row.expected, observed, matched: row.matched, durationMs: row.durationMs, estimatedUsd: row.estimatedUsd }));
    }
    const summary = { ...summarizeJudgeControls(outcomes.map(o => ({ id: o.id, criterion: o.targetCriterion, expected: o.expected, observed: o.observed, state: o.state })) as JudgeControlResult[]), total: outcomes.length, completed: outcomes.filter(o => o.state === "complete").length,
      limitation: manifest.scope, estimatedUsdKnown: outcomes.reduce((n, o) => n + (o.estimatedUsd ?? 0), 0), unknownCosts: outcomes.filter(o => o.estimatedUsd === null).length, budget: service.store.budget() };
    writeFileSync(join(directory, "summary.json"), JSON.stringify(summary, null, 2), { flag: "wx" }); console.log(JSON.stringify(summary));
  }
  console.log(directory);
}
service.store.close();
