import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readCsv } from "../src/lib/csv.mjs";
import { repositoryRoot } from "../src/disposition/runtime.ts";
import { evaluateVisibleTrajectory } from "../src/disposition/latency-evaluation.ts";
import { readDispositionStream } from "../apps/evaluation/lib/disposition-stream.ts";
import { EXECUTION_POLICY } from "../src/disposition/execution-policy.ts";
import { RECOVERY_POLICY } from "../src/disposition/recovery.ts";

// Exercises the real endpoint AND the GUI decoder, not a buffered fetch.json().
// Two paid runs only after --live. Receipt timing is not browser paint timing.
const args = process.argv.slice(2);
if (args[0] !== "--live") {
  console.log("Dry run: --live sends at most two GUI assessments, each allowing one intake and up to two sequential final attempts; background independent reviews are additional calls. No fixed dollar charge is implied; reconcile usage and unknown outcomes. Optional case IDs: C01, C02, C04 (default C04 and C02).");
} else {
  const cases = args.length > 1 ? args.slice(1) : ["C04", "C02"];
  if (cases.length > 2 || cases.some((id) => !["C01", "C02", "C04"].includes(id)) || new Set(cases).size !== cases.length) throw new Error("INVALID_SMOKE_CASES");
  const root = repositoryRoot();
  const rows = await readCsv(join(root, "data/patient_messages.csv")) as Record<string, string>[];
  const directory = join(root, "apps/evaluation/.local/disposition-agent-v3/http", new Date().toISOString().replaceAll(":", "-"));
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  for (const id of cases) {
    const message = rows.find((row) => row.id === id)!.message;
    const receipts: { kind: string; receivedMs: number; publishedMs: number; serverElapsedMs: number | null }[] = [];
    const started = performance.now();
    const response = await fetch("http://localhost:4120/api/disposition", {
      method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:4120", "x-counsel-review": "local-v1" },
      body: JSON.stringify({ message, syntheticOnly: true }), signal: AbortSignal.timeout(EXECUTION_POLICY.modelTimeoutMs * RECOVERY_POLICY.maxAttempts + RECOVERY_POLICY.retryDelayMs + 30_000),
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const run = await readDispositionStream(response, message, () => {}, (event, timing) => {
      const item = { kind: event.kind, receivedMs: Math.round(timing.receivedAtMs - started), publishedMs: Math.round(timing.publishedAtMs - started), serverElapsedMs: event.elapsedMs ?? null };
      receipts.push(item); console.log(JSON.stringify({ id, ...item }));
    });
    const observation = { id, runId: run.runId, status: run.status, receipts, finalReceivedMs: Math.round(performance.now() - started), serverDurationMs: run.durationMs, modelCalls: run.modelCalls, visible: evaluateVisibleTrajectory(run), persisted: { trace: run.tracePersisted, artifact: run.artifactPersisted, eventLog: run.eventLogPersisted } };
    writeFileSync(join(directory, `${id}.json`), JSON.stringify(observation, null, 2), { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify(observation));
  }
  console.log(JSON.stringify({ directory }));
}
