import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runEvals } from "@mastra/core/evals";
import { readCsv } from "../src/lib/csv.mjs";
import { mastra } from "../src/mastra/legacy-index.ts";
import { exactDispositionScorer, hardGateIntegrityScorer } from "../src/mastra/scorers/disposition.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

try {
  const [messages, clinicianRows] = await Promise.all([
    readCsv(resolve(root, "data/patient_messages.csv")),
    readCsv(resolve(root, "data/clinician_development_review.csv")),
  ]);
  const clinicianById = new Map(clinicianRows.map((row: Record<string, string>) => [row.id, row.clinician_disposition]));
  const workflow = mastra.getWorkflow("counselDispositionWorkflow");
  const result = await runEvals({
    target: workflow,
    data: (messages as Record<string, string>[]).map((row) => ({
      input: { message: row.message },
      groundTruth: clinicianById.get(row.id),
      startOptions: { tracingOptions: { hideInput: true, hideOutput: true, tags: ["synthetic-eval"] } },
    })),
    gates: [exactDispositionScorer, hardGateIntegrityScorer],
    scorers: [hardGateIntegrityScorer],
    concurrency: 8,
  });
  assert.equal(result.summary.totalItems, 50);
  assert.equal(result.verdict, "passed");
  assert.ok(result.gateResults?.every((gate) => gate.passed && gate.score === 1));
  console.log(JSON.stringify({
    status: "ok",
    dataset: "in-sample-synthetic-v0",
    items: result.summary.totalItems,
    verdict: result.verdict,
    gates: result.gateResults,
  }, null, 2));
} finally {
  await mastra.shutdown();
}
