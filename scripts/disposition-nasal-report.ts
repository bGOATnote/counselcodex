import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { hash, repositoryRoot } from "../src/disposition/runtime.ts";
import { answerSchema, checkAnswer, type DispositionRun } from "../src/disposition/contract.ts";
import { evaluateVisibleTrajectory, estimatedRunCost, median } from "../src/disposition/latency-evaluation.ts";

const root = repositoryRoot(), output = join(root, "outputs/nasal-history-20260910-v1.json");
if (process.argv.slice(2).some((arg) => arg !== "--write")) throw new Error("Use --write once, or no arguments for offline verification.");
if (process.argv.includes("--write")) {
  assert.equal(existsSync(output), false, "Evidence exports are immutable");
  const base = join(root, "apps/evaluation/.local/disposition-nasal-v1/experiments");
  const phases = readdirSync(base).sort().map((name) => {
    const directory = join(base, name), read = (file: string) => JSON.parse(readFileSync(join(directory, file), "utf8"));
    const manifest = read("manifest.json"), sourceSnapshot = read("source-snapshot.json");
    const { manifestHash, ...hashedManifest } = manifest;
    assert.equal(hash(hashedManifest), manifestHash);
    for (const [file, expected] of Object.entries(manifest.sourceHashes)) assert.equal(hash(sourceSnapshot[file]), expected);
    const historicalSummary = read("summary.json");
    const selections = readdirSync(directory).filter((f) => /^intake-\d+-(baseline|candidate)\.json$/.test(f)).sort().map((file) => {
      const observation = read(file); return { observation, observationHash: hash(observation) };
    });
    const observations = readdirSync(directory).filter((f) => /^N\d+\.json$/.test(f)).sort().map((file) => {
      const observation = read(file), run = observation.run as DispositionRun;
      assert.equal(hash(run.message), run.inputHash);
      if (run.answer) assert.equal(hash(run.answer), run.answerHash);
      const rejected = answerSchema.safeParse(run.rejectedAnswer);
      return { observation, observationHash: hash(observation), currentContractReplay: evaluateVisibleTrajectory(run),
        rejectedContractReplay: rejected.success ? checkAnswer(rejected.data, run.message, run.guidance, run.safetyFloor?.disposition ?? null) : null };
    });
    const starts = readdirSync(directory).filter((f) => f.endsWith(".started.json")).length;
    assert.equal(starts, manifest.planned, "Missing dispatch record");
    assert.equal(selections.length + observations.length, starts, "Unaccounted attempt");
    assert.equal(historicalSummary.selections.length, selections.length);
    assert.equal(historicalSummary.runs.length, observations.length);
    const pairs = selections.filter((s) => s.observation.arm === "candidate").map((s) => s.observation.durationMs - selections.find((b) => b.observation.arm === "baseline" && b.observation.trial === s.observation.trial)!.observation.durationMs);
    return { directory: name, manifest, sourceSnapshot, historicalSummary, selections, observations,
      pairedMedianIncreaseMs: median(pairs), missingAttempts: 0 };
  });
  const all = phases.flatMap((p) => p.observations.map((o) => o.observation.run as DispositionRun));
  const selections = phases.flatMap((p) => p.selections.map((s) => s.observation));
  const payload = { version: "nasal-history-evidence/v1", phases,
    accounting: { intakeOnlyAttempts: selections.length, workflowAttempts: all.length,
      estimatedKnownTokenCostUSD: all.reduce((sum, r) => sum + (estimatedRunCost(r) ?? 0), 0) + selections.reduce((sum, s) => sum + (s.inputTokens === null || s.outputTokens === null ? 0 : (s.inputTokens + s.outputTokens * 5) / 1_000_000), 0),
      unknownCostAttempts: all.filter((r) => estimatedRunCost(r) === null).length + selections.filter((s) => s.inputTokens === null || s.outputTokens === null).length,
      newReservedCeilingUSD: 21, allKnownReservedCeilingsUSD: 100, costIsInvoice: false },
    limitations: ["Fictional development sentinels, not adjudicated clinical labels or a held-out benchmark.", "Historical outputs/checks are unchanged. Current replay is separately labeled and does not retroactively fix delivered text.", "No claim of speed or accuracy non-inferiority. The primary paired intake increase exceeded its 500ms target.", "Provider-call time is not browser paint, and a question is not a disposition.", "A matching route, reachable link or exact quote does not establish clinical correctness or citation entailment.", "Prompt fixes remain probabilistic. Post-fix runs are selected regression checks, not a rerun of all cases or six latency pairs.", "No further automated API allowance remains under the allocated $100 ceiling."] };
  writeFileSync(output, JSON.stringify({ ...payload, artifactHash: hash(payload) }, null, 2) + "\n", { flag: "wx" });
}
if (!existsSync(output)) console.log("No calls made. Use --write once after the local pilot completes.");
else {
  const { artifactHash, ...payload } = JSON.parse(readFileSync(output, "utf8"));
  assert.equal(hash(payload), artifactHash);
  for (const phase of payload.phases) {
    const { manifestHash, ...manifest } = phase.manifest;
    assert.equal(hash(manifest), manifestHash);
    for (const [file, expected] of Object.entries(manifest.sourceHashes)) assert.equal(hash(phase.sourceSnapshot[file]), expected);
    for (const row of [...phase.selections, ...phase.observations]) assert.equal(hash(row.observation), row.observationHash);
  }
  console.log(JSON.stringify({ output, artifactHash, accounting: payload.accounting, phases: payload.phases.map((p: { directory: string; pairedMedianIncreaseMs: number | null; observations: { observation: { id: string; run: DispositionRun }; currentContractReplay: { failures: string[] } }[] }) => ({ directory: p.directory, pairedMedianIncreaseMs: p.pairedMedianIncreaseMs, observations: p.observations.map((o) => ({ id: o.observation.id, status: o.observation.run.status, replayFailures: o.currentContractReplay.failures })) })) }, null, 2));
}
