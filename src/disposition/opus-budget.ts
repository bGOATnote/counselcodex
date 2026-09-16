import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Historical experiment allocations under the original project authorization.
// The user's 2026-09-11 clarification separately authorizes requested GUI runs;
// runtime.ts selects that policy explicitly without rewriting these ledgers.
// Separate, bounded Opus experiment. Prior v1 and CQA reservations remain intact.
// Reserve the entire three-call workflow before dispatch; never half-admit a run.
export const OPUS_BUDGET = { maxRuns: 12, callsPerRun: 3, reservePerCallUSD: 0.25, ceilingUSD: 9 } as const;
export function reserveOpusRun(directory: string) {
  return reserveBoundedRun(directory, OPUS_BUDGET);
}
// Frozen latency experiment. Its reservations are never reset or reused.
export const LATENCY_BUDGET = { maxRuns: 16, callsPerRun: 3, reservePerCallUSD: 0.25, ceilingUSD: 12 } as const;
export function reserveLatencyRun(directory: string) { return reserveBoundedRun(directory, LATENCY_BUDGET); }
// Separate interactive allowance after the 16-run pilot; no further automated
// calls use it by default. Known allocations: CQA $20 + v1 $5 + v2 $9 + pilot
// $12 + interactive $9 = $55, within the user's $100 project ceiling.
export const INTERACTIVE_BUDGET = { maxRuns: 12, callsPerRun: 3, reservePerCallUSD: 0.25, ceilingUSD: 9 } as const;
export function reserveInteractiveRun(directory: string) { return reserveBoundedRun(directory, INTERACTIVE_BUDGET); }
// Previous ceilings remain reserved: $55. $55 + $24 = $79, below the project $100.
export const COMPACT_BUDGET = { maxRuns: 32, callsPerRun: 3, reservePerCallUSD: 0.25, ceilingUSD: 24 } as const;
export function reserveCompactRun(directory: string) { return reserveBoundedRun(directory, COMPACT_BUDGET); }
// Nasal-history latency/clinical sentinels: prior $79 + $18 = $97. No old ledger is reset.
export const NASAL_BUDGET = { maxRuns: 24, callsPerRun: 3, reservePerCallUSD: 0.25, ceilingUSD: 18 } as const;
export function reserveNasalRun(directory: string) { return reserveBoundedRun(directory, NASAL_BUDGET); }
// Last $3 of the user's ceiling, for four targeted post-fix calls only. The
// 24-slot primary nasal ledger stays unchanged; no allowance is recycled.
export const NASAL_VERIFY_BUDGET = { maxRuns: 4, callsPerRun: 3, reservePerCallUSD: 0.25, ceilingUSD: 3 } as const;
export function reserveNasalVerificationRun(directory: string) { return reserveBoundedRun(directory, NASAL_VERIFY_BUDGET); }
function reserveBoundedRun(directory: string, budget: { maxRuns: number; callsPerRun: number; reservePerCallUSD: number; ceilingUSD: number }) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const configuration = JSON.stringify(budget);
  const path = join(directory, "budget.json");
  try { const fd = openSync(path, "wx", 0o600); try { writeFileSync(fd, configuration); fsyncSync(fd); } finally { closeSync(fd); } }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  if (readFileSync(path, "utf8") !== configuration) throw new Error("BUDGET_CONFIGURATION_MISMATCH");
  const allowed = new Set(["budget.json", ...Array.from({ length: budget.maxRuns }, (_, i) => `run-${i + 1}.json`)]);
  if (readdirSync(directory).some((name) => !allowed.has(name))) throw new Error("BUDGET_STORE_INVALID");
  for (let slot = 1; slot <= budget.maxRuns; slot++) {
    let fd: number;
    try { fd = openSync(join(directory, `run-${slot}.json`), "wx", 0o600); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") continue; throw error; }
    try { writeFileSync(fd, JSON.stringify({ slot, reservedUSD: budget.callsPerRun * budget.reservePerCallUSD, at: new Date().toISOString() })); fsyncSync(fd); }
    finally { closeSync(fd); }
    return;
  }
  throw new Error("MODEL_BUDGET_EXHAUSTED");
}
