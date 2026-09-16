import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { hash, repositoryRoot } from "../src/disposition/runtime.ts";
import { evaluateVisibleTrajectory, estimatedRunCost } from "../src/disposition/latency-evaluation.ts";
import type { DispositionRun } from "../src/disposition/contract.ts";

const root = repositoryRoot();
const output = join(root, "outputs/compact-latency-20260910-v1.json");
if (process.argv.includes("--write")) {
  if (existsSync(output)) throw new Error("IMMUTABLE_REPORT_ALREADY_EXISTS");
  const base = join(root, "apps/evaluation/.local/disposition-compact-v1/experiments");
  const phases = readdirSync(base).sort().map((name) => {
    const dir = join(base, name);
    const raw = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    const { manifestHash, ...manifest } = raw;
    const integrity = hash(manifest) === manifestHash;
    // Preserve, disclose and explain an observed metadata defect; never edit the
    // original. The verification invocation renamed phase after hashing it.
    const originalHashedManifest = !integrity && manifest.phase === "post-fix-verification" ? { ...manifest, phase: "paired-comparison" } : manifest;
    assert.equal(hash(originalHashedManifest), manifestHash, "Unexplained manifest integrity failure");
    const observations = readdirSync(dir).filter((file) => /^(?:C\d+|RT\d+)-.*opus\.json$/.test(file)).sort().map((file) => {
      const row = JSON.parse(readFileSync(join(dir, file), "utf8"));
      const run = row.run as DispositionRun;
      assert.equal(hash(run.message), run.inputHash);
      if (run.answer) assert.equal(hash(run.answer), run.answerHash);
      return { ...row, observationHash: hash(row), currentContractReplay: evaluateVisibleTrajectory(run) };
    });
    return { directory: name, manifest: raw, originalHashedManifest, metadataIntegrity: { storedManifestMatchesHash: integrity, explanation: integrity ? null : "Verification phase display name changed after manifest hashing. Restoring the original paired-comparison phase exactly reproduces the recorded hash. Original artifacts are retained unchanged." }, sourceSnapshot: existsSync(join(dir, "source-snapshot.json")) ? JSON.parse(readFileSync(join(dir, "source-snapshot.json"), "utf8")) : null, historicalSummary: JSON.parse(readFileSync(join(dir, "summary.json"), "utf8")), observations };
  });
  const browserDirectory = join(root, "apps/evaluation/.local/disposition-agent-v3/runs");
  const browserRuns = readdirSync(browserDirectory).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(browserDirectory, f), "utf8")) as DispositionRun).filter((r) => r.profile === "conversational-opus" && r.completedAt >= "2026-09-10T22:40:00.000Z").sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  const all = [...phases.flatMap((p) => p.observations.map((o) => o.run as DispositionRun)), ...browserRuns];
  const payload = { version: "compact-latency-evidence/v1", phases, browserRuns: browserRuns.map((run) => ({ run, currentContractReplay: evaluateVisibleTrajectory(run) })),
    accounting: { automatedAttempts: phases.reduce((sum, p) => sum + p.observations.length, 0), browserAttempts: browserRuns.length, estimatedKnownTokenCostUSD: all.reduce((sum, r) => sum + (estimatedRunCost(r) ?? 0), 0), unknownCostAttempts: all.filter((r) => estimatedRunCost(r) === null).length, newReservedCeilingUSD: 24, allKnownReservedCeilingsUSD: 79, costIsInvoice: false },
    limits: ["Development sentinels, not blinded clinical validation or HealthBench.", "Historical checks remain immutable; currentContractReplay records new failures found after the run.", "No p95/SLA or non-inferiority inference from these small changing-protocol samples.", "Early question timing is not time to disposition.", "Initial comparison and first red-team phase have source hashes but no full source snapshot; exact historical code re-execution is not guaranteed.", "Browser run times in this artifact are server times; browser receipt observations are documented separately."] };
  writeFileSync(output, JSON.stringify({ ...payload, artifactHash: hash(payload) }, null, 2) + "\n", { flag: "wx" });
}
if (!existsSync(output)) { console.log("No calls made. Use --write once to export local completed evidence; subsequent runs verify it offline."); }
else {
  const { artifactHash, ...payload } = JSON.parse(readFileSync(output, "utf8"));
  assert.equal(hash(payload), artifactHash);
  for (const phase of payload.phases) {
    assert.equal(hash(phase.originalHashedManifest), phase.manifest.manifestHash);
    for (const { observationHash, currentContractReplay: _replay, ...observation } of phase.observations) assert.equal(hash(observation), observationHash);
  }
  console.log(JSON.stringify({ path: output, artifactHash, accounting: payload.accounting, phases: payload.phases.map((p: { directory: string; observations: { id: string; profile: string; currentContractReplay: { failures: string[] } }[] }) => ({ phase: p.directory, currentFailures: p.observations.filter((o) => o.currentContractReplay.failures.length).map((o) => ({ id: o.id, profile: o.profile, failures: o.currentContractReplay.failures })) })) }, null, 2));
}
