import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// New workflow only. Does not reset or spend against the existing CQA ledger.
// A failed/unknown call consumes a slot too. Atomic creation bounds concurrent processes.
export const DISPOSITION_BUDGET = { maxCalls: 20, reservePerCallUSD: 0.25, ceilingUSD: 5 } as const;
export function reserveModelCall(directory: string): void {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const configuration = JSON.stringify(DISPOSITION_BUDGET);
  const configPath = join(directory, "budget.json");
  try { const fd = openSync(configPath, "wx", 0o600); try { writeFileSync(fd, configuration); fsyncSync(fd); } finally { closeSync(fd); } }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  if (readFileSync(configPath, "utf8") !== configuration) throw new Error("BUDGET_CONFIGURATION_MISMATCH");
  if (readdirSync(directory).some((name) => name !== "budget.json" && !/^call-(?:[1-9]|1[0-9]|20)\.json$/.test(name))) throw new Error("BUDGET_STORE_INVALID");
  for (let slot = 1; slot <= DISPOSITION_BUDGET.maxCalls; slot++) {
    const path = join(directory, `call-${slot}.json`);
    if (existsSync(path)) continue;
    let fd: number;
    try { fd = openSync(path, "wx", 0o600); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") continue; throw error; }
    try { writeFileSync(fd, JSON.stringify({ slot, reservedUSD: DISPOSITION_BUDGET.reservePerCallUSD, at: new Date().toISOString() })); fsyncSync(fd); }
    finally { closeSync(fd); }
    return;
  }
  throw new Error("MODEL_BUDGET_EXHAUSTED");
}
