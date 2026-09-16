import { readFileSync, existsSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseExperimentCases, experimentManifest, planExperiment, runExperiment, summarizeExperiment } from "../src/evaluation/disposition-experiment.ts";
import { createDispositionRuntime, repositoryRoot } from "../src/disposition/runtime.ts";
import { createEvidenceSearch, loadPassageCorpus, digest } from "../src/evidence/search.ts";

const [mode, inputPath, outputPath] = process.argv.slice(2);
if (!["plan", "run"].includes(mode) || !inputPath || !outputPath) throw new Error("Usage: npm run disposition:experiment -- plan|run cases.jsonl output-directory");
const root = repositoryRoot(), directory = resolve(outputPath), cases = parseExperimentCases(readFileSync(inputPath, "utf8"));
const fingerprint = digest({ sources: readdirSync(join(root,"src"), { recursive: true }).filter((p): p is string => typeof p === "string" && /\.(ts|mjs)$/.test(p)).sort().map((p) => [p, readFileSync(join(root,"src",p), "utf8")]), dependencies: readFileSync(join(root,"package-lock.json"),"utf8"), corpus: loadPassageCorpus(process.env.COUNSEL_PASSAGE_CORPUS) });
const manifest = experimentManifest(cases, fingerprint);
planExperiment(cases, directory, manifest);
console.log(JSON.stringify({ cases: cases.length, maximumModelCalls: manifest.maximumModelCalls, manifest: join(directory, "manifest.json"), executionStarted: false }));
if (mode === "run") {
  // Never create another allowance just because the experiment output is new.
  // The current project allocation is fully reserved. Reconcile it explicitly
  // before a live experiment; this is not an extra budget authorization.
  if (process.env.COUNSEL_EXPERIMENT_SPEND_RECONCILED !== "true") throw new Error("PAID_EXPERIMENT_REQUIRES_PROJECT_SPEND_RECONCILIATION");
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("PROVIDER_KEY_MISSING");
  const budgetDirectory = join(root, "apps/evaluation/.local/disposition-agent-v3/interactive-budget-v1");
  if (!existsSync(join(budgetDirectory, "budget.json"))) throw new Error("EXISTING_PROJECT_LEDGER_REQUIRED");
  const search = createEvidenceSearch({ corpus: loadPassageCorpus(process.env.COUNSEL_PASSAGE_CORPUS) });
  const controller = new AbortController();
  process.once("SIGINT", () => controller.abort());
  const records = await runExperiment(cases, directory, manifest, async ({ message }, arm, frozen, onResponseEvent) => {
    const runtime = createDispositionRuntime(join(directory, "runtime", arm), undefined, { profile: arm, budgetDirectory, search: frozen ? async () => structuredClone(frozen) : search });
    try { return await runtime.assess(message, undefined, onResponseEvent, controller.signal); }
    finally { await runtime.mastra.shutdown(); }
  }, controller.signal);
  const summary = summarizeExperiment(cases, records, manifest);
  const path = join(directory, `summary-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(summary, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ summary: path, ...summary }));
}
