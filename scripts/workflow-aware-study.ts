/** Explicit offline-plan / read-only-preflight / bounded-generation research CLI. */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { PROTOCOL_ADAPTER } from "../src/research/workflow-aware/protocol.ts";
import { ARMS, ROOT, finalizeStudy, generateStudy, planStudy, preflightStudy, unloadStudyNano, verifyStudy, type Arm } from "../src/research/workflow-aware/runner.ts";
import { ledgerState, withDirectoryLock } from "../src/research/workflow-aware/budget.ts";
import type { Model } from "../src/research/workflow-aware/transport.ts";

export async function main(argv: string[]) {
  const [action, ...args] = argv, flags: Record<string, string> = {};
  const allowed = ["--messages", "--config", "--budget", "--out", "--evidence", "--model", "--phase", "--arm", "--max-calls"];
  assert(args.length % 2 === 0, "Each argument requires a value");
  for (let i = 0; i < args.length; i += 2) { assert(allowed.includes(args[i]) && !Object.hasOwn(flags, args[i]), "Unknown or duplicate argument"); flags[args[i]] = args[i + 1]; }
  assert(flags["--out"], "--out is required");
  const outputDir = resolve(flags["--out"]), protocol = PROTOCOL_ADAPTER;
  const model = flags["--model"] as Model | undefined, arm = flags["--arm"] as Arm | undefined;
  if (model) assert(model === "fable" || model === "nano", "Unknown model");
  if (arm) assert(ARMS.includes(arm), "Unknown arm");
  let apiKey: string | undefined;
  if ((action === "preflight" || action === "generate") && model === "fable") {
    const envPath = join(ROOT, ".env");
    apiKey = process.env.ANTHROPIC_API_KEY ?? (existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")).ANTHROPIC_API_KEY : undefined);
  }
  if (action === "plan") {
    assert(flags["--messages"] && flags["--config"] && flags["--budget"], "plan requires --messages --config --budget");
    const result = planStudy({ outputDir, protocol, messagesPath: resolve(flags["--messages"]), configPath: resolve(flags["--config"]), budgetPath: resolve(flags["--budget"]),
      ...(flags["--evidence"] ? { evidencePath: resolve(flags["--evidence"]) } : {}) });
    return { action, studyId: result.studyId, plannedJobs: result.jobs.length, outputDir, generationCalls: 0 };
  }
  if (action === "preflight") { assert(model, "preflight requires --model"); return preflightStudy({ outputDir, model, protocol, apiKey }); }
  if (action === "generate") { assert(model, "generate requires --model"); return generateStudy({ outputDir, model, protocol, apiKey, phase: flags["--phase"], arm,
    maxCalls: flags["--max-calls"] === undefined ? undefined : Number(flags["--max-calls"]), progress: value => console.log(JSON.stringify(value)) }); }
  if (action === "freeze") return finalizeStudy({ outputDir, protocol });
  if (action === "unload") return unloadStudyNano({ outputDir, protocol });
  if (action === "status") {
    const { manifest, budget } = verifyStudy(outputDir, protocol), state = withDirectoryLock(budget.ledgerPath, () => ledgerState(budget));
    const jobs = manifest.jobs.map(j => ({ ...j, started: state.starts.has(`${manifest.studyId}--${j.jobId}`), settled: state.settlements.has(`${manifest.studyId}--${j.jobId}`) }));
    return { studyId: manifest.studyId, plannedJobs: jobs.length, startedJobs: jobs.filter(j => j.started).length, settledJobs: jobs.filter(j => j.settled).length,
      byModel: Object.fromEntries(manifest.config.models.map(m => [m, { planned: jobs.filter(j => j.model === m).length, settled: jobs.filter(j => j.model === m && j.settled).length }])),
      budget: { blocked: state.blocked, accountedAndOutstandingUSD: state.obligationsUSD, remainingGenerationUSD: state.remainingUSD, remainingEmbeddingUSD: state.embeddingRemainingUSD } };
  }
  throw new Error("Use plan, preflight, generate, status, freeze, or unload");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await main(process.argv.slice(2)))); }
  catch (error) { console.error(error instanceof Error ? error.message : "Research command failed"); process.exitCode = 1; }
}
