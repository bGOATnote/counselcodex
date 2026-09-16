import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { digest, episodeSchema } from "./contracts.ts";
import { reportSchema, ResearchBudget } from "./engine.ts";

export function validateCachedReport(raw: unknown, episode: unknown, rubricSha256: string) {
  const parsed = episodeSchema.parse(episode);
  const report = reportSchema.parse(raw);
  // makeJobs hashes schema-parsed input, not fixture object insertion order.
  // Use the same representation on resume; never rerun a cached abstention.
  if (report.inputSha256 !== digest(parsed) || report.rubricSha256 !== rubricSha256
    || report.episodeId !== parsed.episodeId || report.revision !== parsed.revision || report.decisionAt !== parsed.decisionAt) throw new Error("CACHED_REPORT_MISMATCH");
  return report;
}

// Single-host research storage, not a distributed work queue. A persistent lock
// prevents concurrent runners; after a crash an operator must resolve the lock.
export function openResearchStore(root: string, experimentId: string, manifest: unknown) {
  if (!/^[a-zA-Z0-9_-]{1,60}$/.test(experimentId)) throw new Error("INVALID_EXPERIMENT_ID");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const lock = join(root, "runner.lock");
  const lockFd = openSync(lock, "wx", 0o600);
  writeFileSync(lockFd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  fsyncSync(lockFd);
  const release = () => { closeSync(lockFd); unlinkSync(lock); };
  try {
    const directory = join(root, experimentId);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const manifestFile = join(directory, "manifest.json");
    const expected = digest(manifest);
    if (existsSync(manifestFile)) {
      if (digest(JSON.parse(readFileSync(manifestFile, "utf8"))) !== expected) throw new Error("EXPERIMENT_MANIFEST_CHANGED");
    } else {
      writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    }
    const ledgerFile = join(root, "reservations.jsonl");
    const budget = new ResearchBudget(10, 20, 2);
    if (existsSync(ledgerFile)) {
      const lines = readFileSync(ledgerFile, "utf8").split("\n");
      if (lines.pop() !== "") throw new Error("BUDGET_LEDGER_INCOMPLETE");
      for (const line of lines) {
        const reservation = JSON.parse(line);
        if (reservation.reservedUsd !== 2 || typeof reservation.experimentId !== "string" || !Number.isInteger(reservation.sequence)) throw new Error("BUDGET_LEDGER_INVALID");
        if (reservation.sequence !== budget.snapshot().callsReserved + 1) throw new Error("BUDGET_LEDGER_INVALID");
        budget.reserve();
      }
    }
    return {
      directory,
      reserve() {
        budget.reserve();
        const fd = openSync(ledgerFile, "a", 0o600);
        try {
          appendFileSync(fd, JSON.stringify({ experimentId, sequence: budget.snapshot().callsReserved, reservedUsd: 2, at: new Date().toISOString() }) + "\n");
          fsyncSync(fd); // Persist before any network request, never refund an uncertain failure.
        } finally { closeSync(fd); }
      },
      snapshot: () => budget.snapshot(),
      close: release,
    };
  } catch (error) { release(); throw error; }
}
