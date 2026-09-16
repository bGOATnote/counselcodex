import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDispositionRuntime, repositoryRoot } from "../src/disposition/runtime.ts";
import { readCsv } from "../src/lib/csv.mjs";

if (process.argv.slice(2).join(" ") !== "--live") {
  console.error("Use --live for three fixed Opus development cases (at most 9 paid calls, $2.25 reserved within the shared $9 Opus ceiling). Not clinical validation.");
  process.exitCode = 1;
} else {
  const rows = await readCsv(join(repositoryRoot(), "data/patient_messages.csv"));
  // Fixed before execution. Development sentinels, NOT a held-out benchmark.
  const cases = [
    ...["C02", "C04", "C01"].map((id) => ({ id, message: rows.find((r: Record<string, string>) => r.id === id)!.message, expected: id === "C02" ? "EMERGENCY_NOW" : id === "C04" ? "SAME_DAY_IN_PERSON" : "SELF_CARE" })),
  ];
  const runtime = getDispositionRuntime();
  const runs = [];
  try {
    for (const item of cases) {
      const run = await runtime.assess(item.message, (notice) => console.log(JSON.stringify({ id: item.id, event: notice.source, elapsedMs: notice.elapsedMs })));
      const routeCheck = item.expected ? run.answer?.disposition === item.expected : null;
      runs.push({ id: item.id, expectedDevelopmentRoute: item.expected, routeCheck, run });
      console.log(JSON.stringify({ id: item.id, status: run.status, disposition: run.answer?.disposition ?? null, routeCheck, calls: run.modelCalls, checks: run.checks.map(({ id, status }) => ({ id, status })), tracePersisted: run.tracePersisted, artifactPersisted: run.artifactPersisted }));
      if (run.failure === "PROVIDER_KEY_MISSING" || run.failure === "MODEL_BUDGET_EXHAUSTED" || run.failure === "MODEL_OR_SCHEMA_FAILURE") break;
    }
    const output = join(repositoryRoot(), "apps/evaluation/.local/disposition-agent-v2/pilots");
    mkdirSync(output, { recursive: true, mode: 0o700 });
    const path = join(output, `${new Date().toISOString().replaceAll(":", "-")}.json`);
    writeFileSync(path, JSON.stringify({ scope: "Development smoke pilot; not blinded clinical validation or HealthBench", planned: cases.length, completed: runs.length, runs }, null, 2), { flag: "wx", mode: 0o600 });
    console.log(`Saved immutable pilot: ${path}`);
    if (runs.length !== cases.length || runs.some(({ run, routeCheck }) => run.status !== "complete" || routeCheck === false || !run.tracePersisted || !run.artifactPersisted)) process.exitCode = 1;
  } finally { await runtime.mastra.shutdown(); }
}
