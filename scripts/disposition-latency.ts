import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { createDispositionRuntime, hash, repositoryRoot } from "../src/disposition/runtime.ts";
import { INSTRUCTIONS, HISTORY_INSTRUCTIONS, FAST_HISTORY_INSTRUCTIONS, EMERGENCY_INSTRUCTIONS } from "../src/disposition/workflow.ts";
import { guidanceCorpus } from "../src/disposition/guidance.ts";
import { estimatedRunCost, evaluateVisibleTrajectory, LATENCY_PROTOCOL, median } from "../src/disposition/latency-evaluation.ts";
import { readCsv } from "../src/lib/csv.mjs";
import type { DispositionRun, WorkflowProfile } from "../src/disposition/contract.ts";

const root = repositoryRoot();
const rows = await readCsv(join(root, "data/patient_messages.csv")) as Record<string, string>[];
const manifest = {
  protocol: LATENCY_PROTOCOL, datasetHash: hash(readFileSync(join(root, "data/patient_messages.csv"), "utf8")),
  // All 50 original messages are frozen, but the paid pilot uses only its declared cases.
  cases: rows.map(({ id, message }) => ({ id, message, inputHash: hash(message) })),
  promptHash: hash({ INSTRUCTIONS, HISTORY_INSTRUCTIONS, FAST_HISTORY_INSTRUCTIONS, EMERGENCY_INSTRUCTIONS }), guidanceHash: hash(guidanceCorpus),
  sourceHashes: Object.fromEntries(["src/disposition/workflow.ts", "src/disposition/runtime.ts", "src/disposition/progressive.ts", "src/disposition/contract.ts", "src/disposition/latency-evaluation.ts", "scripts/disposition-latency.ts"].map((path) => [path, hash(readFileSync(join(root, path), "utf8"))])),
};
const live = process.argv.slice(2).join(" ") === "--live";
if (!live) {
  console.log(JSON.stringify({ mode: "dry-run; no provider calls", manifestHash: hash(manifest), casesFrozen: manifest.cases.length, protocol: LATENCY_PROTOCOL, runsPlanned: 12, maximumAdditionalReservedUSD: 9, sharedExperimentCeilingUSD: 12, note: "Original pilot exhausted this immutable ledger; --live will refuse further calls." }, null, 2));
} else {
  if (!process.env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = parseEnv(readFileSync(join(root, ".env"), "utf8")).ANTHROPIC_API_KEY;
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("PROVIDER_KEY_MISSING");
  const base = join(root, "apps/evaluation/.local/disposition-agent-v3");
  const directory = join(base, "experiments", new Date().toISOString().replaceAll(":", "-"));
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(join(directory, "manifest.json"), JSON.stringify({ ...manifest, manifestHash: hash(manifest) }, null, 2), { flag: "wx", mode: 0o600 });
  const observations: { id: string; trial: number; profile: WorkflowProfile; run: DispositionRun; visible: ReturnType<typeof evaluateVisibleTrajectory>; expectedRouteMatch: boolean }[] = [];
  const runtimes = new Map(LATENCY_PROTOCOL.profiles.map((profile) => [profile, createDispositionRuntime(join(directory, profile), undefined, { profile, budget: "latency", budgetDirectory: join(base, "budget") })]));
  try {
    // Rotate arm order to reduce provider-time/order confounding. No request sees
    // another arm's output or the source label. Preserve every failed attempt.
    let index = 0;
    for (const id of LATENCY_PROTOCOL.cases) for (let trial = 1; trial <= LATENCY_PROTOCOL.trials; trial++) {
      const rotation = index++ % LATENCY_PROTOCOL.profiles.length;
      const profiles = [...LATENCY_PROTOCOL.profiles.slice(rotation), ...LATENCY_PROTOCOL.profiles.slice(0, rotation)];
      for (const profile of profiles) {
        const item = manifest.cases.find((row) => row.id === id)!;
        writeFileSync(join(directory, `${id}-${trial}-${profile}.started.json`), JSON.stringify({ id, trial, profile, inputHash: item.inputHash }), { flag: "wx", mode: 0o600 });
        const run = await runtimes.get(profile)!.assess(item.message);
        const visible = evaluateVisibleTrajectory(run);
        const observation = { id, trial, profile, run, visible, expectedRouteMatch: run.answer?.disposition === LATENCY_PROTOCOL.expectedDevelopmentRoutes[id] };
        observations.push(observation);
        writeFileSync(join(directory, `${id}-${trial}-${profile}.json`), JSON.stringify(observation, null, 2), { flag: "wx", mode: 0o600 });
        console.log(JSON.stringify({ id, trial, profile, status: run.status, firstActionMs: run.firstActionMs, firstReplyMs: run.firstPatientReplyMs, openingMs: run.firstOpeningMs, fullMs: run.durationMs, failures: visible.failures, calls: run.modelCalls }));
        if (run.failure === "MODEL_BUDGET_EXHAUSTED" || run.failure === "PROVIDER_KEY_MISSING") throw new Error(run.failure);
      }
    }
  } finally {
    const summary = LATENCY_PROTOCOL.profiles.map((profile) => {
      const matching = observations.filter((row) => row.profile === profile);
      return { profile, attempted: matching.length, completed: matching.filter((row) => row.run.status === "complete").length, routeMatches: matching.filter((row) => row.expectedRouteMatch).length,
        medianFirstActionOrReplyMs: median(matching.map((row) => row.visible.firstActionOrReplyMs)), firstActionOrReplyObserved: matching.filter((row) => row.visible.firstActionOrReplyMs !== null).length,
        medianFinalMs: median(matching.filter((row) => row.run.status === "complete").map((row) => row.run.durationMs)), medianAttemptDurationMs: median(matching.map((row) => row.run.durationMs)), medianOpeningMs: median(matching.map((row) => row.run.firstOpeningMs)),
        estimatedUSD: matching.every((row) => estimatedRunCost(row.run) !== null) ? matching.reduce((sum, row) => sum + estimatedRunCost(row.run)!, 0) : null,
        observedFailures: [...new Set(matching.flatMap((row) => row.visible.failures))],
      };
    });
    writeFileSync(join(directory, "summary.json"), JSON.stringify({ manifestHash: hash(manifest), summary, plannedRuns: 12, attemptedRuns: observations.length, clinicalNonInferiorityEstablished: false, autoPromoted: false, tailLatencyClaim: "No p95 claim: sample too small", prices: "Standard token-rate estimates, not provider invoices; unknown-usage failures are not zero-cost" }, null, 2), { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ directory, summary, clinicalNonInferiorityEstablished: false }));
    await Promise.all([...runtimes.values()].map((runtime) => runtime.mastra.shutdown()));
  }
}
