import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { createDispositionRuntime, hash, repositoryRoot } from "../src/disposition/runtime.ts";
import { FAST_MODEL } from "../src/disposition/workflow.ts";
import { INTAKE_INSTRUCTIONS, eligibleQuestions, intakeEvent, safetyIntakeSchema } from "../src/disposition/intake.ts";
import { reserveNasalRun } from "../src/disposition/opus-budget.ts";
import { nasalCases, nasalProtocol } from "../src/evaluation/nasal-history.ts";
import { evaluateVisibleTrajectory, estimatedRunCost, median } from "../src/disposition/latency-evaluation.ts";
const root = repositoryRoot(), args = process.argv.slice(2);
if (args.some((a) => !["--live", "--verify", "--final-verify"].includes(a)) || (args.includes("--verify") && args.includes("--final-verify"))) throw new Error("Use --live, optionally --verify or --final-verify for bounded post-fix sentinels.");
const finalVerify = args.includes("--final-verify"), verify = finalVerify || args.includes("--verify");
const baseline = JSON.parse(readFileSync(join(root, "data/evaluations/nasal-intake-baseline-v1.json"), "utf8"));
const files = ["src/disposition/intake.ts", "src/disposition/compact-workflow.ts", "src/disposition/guidance.ts", "src/disposition/runtime.ts", "src/disposition/contract.ts", "src/evaluation/nasal-history.ts", "scripts/disposition-nasal-pilot.ts"];
const sourceSnapshot = Object.fromEntries(files.map((p) => [p, readFileSync(join(root, p), "utf8")]));
const manifest = { ...nasalProtocol, phase: finalVerify ? "final-targeted-verification" : verify ? "post-fix" : "paired-intake-and-sentinels", planned: finalVerify ? 4 : verify ? 2 : 22, baseline, sourceHashes: Object.fromEntries(files.map((p) => [p, hash(sourceSnapshot[p])])), reservedCeilingUSD: finalVerify ? 3 : 18, allKnownCeilingsUSD: 100 };
if (!args.includes("--live")) { console.log(JSON.stringify({ mode: "dry", manifestHash: hash(manifest), manifest }, null, 2)); }
else {
  if (!process.env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = parseEnv(readFileSync(join(root, ".env"), "utf8")).ANTHROPIC_API_KEY;
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("PROVIDER_KEY_MISSING");
  const base = join(root, "apps/evaluation/.local/disposition-nasal-v1"), budgetDirectory = join(base, finalVerify ? "verification-budget" : "budget");
  const directory = join(base, "experiments", new Date().toISOString().replaceAll(":", "-"));
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const save = (name: string, value: unknown) => writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  save("manifest.json", { ...manifest, manifestHash: hash(manifest) }); save("source-snapshot.json", sourceSnapshot);
  const selections: { trial: number; arm: string; durationMs: number; valid: boolean; failure: string | null; inputTokens: number | null; outputTokens: number | null; output: unknown }[] = [];
  const runs: unknown[] = [];
  const agents = { baseline: new Agent({ id: "nasal-baseline", name: "Frozen intake comparator", model: FAST_MODEL, instructions: baseline.instructions, maxRetries: 0 }), candidate: new Agent({ id: "nasal-candidate", name: "Nasal history intake", model: FAST_MODEL, instructions: INTAKE_INSTRUCTIONS, maxRetries: 0 }) };
  const runtime = createDispositionRuntime(join(directory, "workflow"), undefined, { profile: "conversational-opus", budget: finalVerify ? "nasal-verify" : "nasal", budgetDirectory });
  console.log(JSON.stringify({ directory, planned: manifest.planned }));
  try {
    if (!verify) for (let trial = 0; trial < 6; trial++) for (const arm of (trial % 2 ? ["candidate", "baseline"] : ["baseline", "candidate"]) as (keyof typeof agents)[]) {
      reserveNasalRun(budgetDirectory);
      const message = nasalCases[0].message;
      const questions = arm === "baseline" ? [{ id: baseline.question.id, text: baseline.question.text }] : eligibleQuestions(message).map(({ id, text }) => ({ id, text }));
      const schema = arm === "baseline" ? z.fromJSONSchema(baseline.schema) : safetyIntakeSchema;
      const started = performance.now(); let output: unknown = null, failure: string | null = null, inputTokens: number | null = null, outputTokens: number | null = null, valid = false;
      save(`intake-${trial}-${arm}.started.json`, { inputHash: hash(message), at: new Date().toISOString() });
      try {
        const response = await agents[arm].stream(JSON.stringify({ patientMessage: message, questions }), { structuredOutput: { schema, errorStrategy: "strict" }, maxSteps: 1, abortSignal: AbortSignal.timeout(5000), modelSettings: { temperature: 0, maxOutputTokens: 160, maxRetries: 0 }, tracingOptions: { hideInput: true, hideOutput: true } });
        for await (const _chunk of response.fullStream) { /* no partial advice */ }
        const values = await Promise.allSettled([response.object, response.usage]);
        if (values[1].status === "fulfilled") { inputTokens = values[1].value.inputTokens ?? null; outputTokens = values[1].value.outputTokens ?? null; }
        if (values[0].status !== "fulfilled" || response.error) throw new Error("INCOMPLETE_OUTPUT");
        output = values[0].value;
        const parsed = schema.safeParse(output);
        const selection = parsed.success ? parsed.data as { emergency: boolean; questionId: string; quote: string } : null;
        valid = !!selection && !selection.emergency && selection.questionId === (arm === "baseline" ? "respiratory-risk" : "nasal-history") && selection.quote.trim().length >= 3 && message.includes(selection.quote) && (arm === "baseline" || !!intakeEvent({ questionId: selection.questionId, quote: selection.quote }, message));
      } catch { failure = "INTAKE_PROVIDER_OR_SCHEMA_FAILURE"; }
      const row = { trial, arm, durationMs: Math.round(performance.now() - started), valid, failure, inputTokens, outputTokens, output };
      selections.push(row); save(`intake-${trial}-${arm}.json`, row); console.log(JSON.stringify(row));
    }
    const cases = finalVerify ? nasalCases.filter((c) => ["N01", "N03", "N05", "N06"].includes(c.id)) : verify ? nasalCases.filter((c) => ["N01", "N02"].includes(c.id)) : nasalCases;
    for (const item of cases) {
      save(`${item.id}.started.json`, { inputHash: hash(item.message), at: new Date().toISOString() });
      const run = await runtime.assess(item.message);
      const route = run.answer?.disposition ?? run.safetyFloor?.disposition;
      const observation = { id: item.id, run, expectedRouteMatch: (item.routes as readonly string[]).includes(route ?? ""), visible: evaluateVisibleTrajectory(run), emergencyBeforeQuestion: !item.emergency || run.responseEvents?.[0]?.kind === "action", knownCostUSD: estimatedRunCost(run) };
      runs.push(observation); save(`${item.id}.json`, observation);
      console.log(JSON.stringify({ id: item.id, route, status: run.status, firstQuestionMs: run.firstQuestionMs, firstActionMs: run.firstActionMs, finalMs: run.durationMs, match: observation.expectedRouteMatch, emergencyBeforeQuestion: observation.emergencyBeforeQuestion, failures: observation.visible.failures }));
    }
  } finally {
    const summary = { manifestHash: hash(manifest), selections, runs, intakeMedians: Object.fromEntries(["baseline", "candidate"].map((arm) => [arm, { attempted: selections.filter((s) => s.arm === arm).length, valid: selections.filter((s) => s.arm === arm && s.valid).length, medianAllAttemptMs: median(selections.filter((s) => s.arm === arm).map((s) => s.durationMs)), medianValidMs: median(selections.filter((s) => s.arm === arm && s.valid).map((s) => s.durationMs)) }])), clinicalNonInferiorityEstablished: false, latencyNonInferiorityEstablished: false };
    save("summary.json", summary); console.log(JSON.stringify({ directory, intakeMedians: summary.intakeMedians, workflowAttempts: runs.length }));
    await runtime.mastra.shutdown();
  }
}
