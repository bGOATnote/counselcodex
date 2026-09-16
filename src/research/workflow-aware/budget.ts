/** Append-only per-dispatch accounting. Uncertain calls remain fully reserved. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { Model, RequestBody } from "./transport.ts";

export const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
export const fileHash = (path: string) => sha256(readFileSync(path));
export const readJSON = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
export const nonnegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
export function writeExclusiveBytes(path: string, bytes: string | Uint8Array) {
  const fd = openSync(path, "wx", 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
  const directory = openSync(dirname(path), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}
export function writeExclusiveJSON(path: string, value: unknown) { writeExclusiveBytes(path, `${JSON.stringify(value, null, 2)}\n`); }
export function within(root: string, name: string) {
  assert(typeof name === "string" && name && !isAbsolute(name), "Expected a relative source path");
  const path = resolve(root, name), rel = relative(root, path);
  assert(rel && rel !== ".." && !rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(rel), "Source path escapes repository");
  return path;
}
export function withDirectoryLock<T>(directory: string, callback: () => T): T {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const lock = join(directory, ".lock");
  const deadline = performance.now() + 2000;
  // Only local metadata coordination is retried. No provider call or stale owner is retried/reclaimed.
  for (;;) {
    try { mkdirSync(lock, { mode: 0o700 }); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || performance.now() >= deadline) throw new Error("Directory is locked; interrupted owners require explicit inspection, not automatic retry");
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  try {
    writeExclusiveJSON(join(lock, "owner.json"), { pid: process.pid, beganAt: new Date().toISOString() });
    return callback();
  } finally { unlinkSync(join(lock, "owner.json")); rmdirSync(lock); }
}

export type Budget = {
  schema: "workflow-aware-budget/v1"; allocationUSD: number; embeddingEarmarkUSD: number;
  accountedAndOutstandingUSD: number; perCallCeilingUSD: number; ledgerDirectory: string;
  sources: Record<string, string>; path: string; sha256: string; ledgerPath: string;
};
export function readBudget(path: string, root: string): Budget {
  const b = readJSON(path) as Budget;
  assert.equal(b.schema, "workflow-aware-budget/v1");
  for (const key of ["allocationUSD", "embeddingEarmarkUSD", "accountedAndOutstandingUSD", "perCallCeilingUSD"] as const) assert(nonnegative(b[key]), `Invalid ${key}`);
  assert(b.allocationUSD > 0 && b.allocationUSD <= 50 && b.embeddingEarmarkUSD >= 1, "Research allocation exceeds its authorization or omits the embedding earmark");
  assert(b.accountedAndOutstandingUSD + b.embeddingEarmarkUSD <= b.allocationUSD, "Allocation already exhausted");
  assert(b.perCallCeilingUSD > 0 && b.perCallCeilingUSD <= b.allocationUSD, "Invalid per-call ceiling");
  assert(b.sources && !Array.isArray(b.sources) && Object.keys(b.sources).length > 0, "Budget requires hashed funding receipts");
  for (const [name, hash] of Object.entries(b.sources)) { assert(/^[a-f0-9]{64}$/.test(hash), "Invalid funding hash"); assert.equal(fileHash(within(root, name)), hash, "Funding receipt changed"); }
  return { ...b, path, sha256: fileHash(path), ledgerPath: within(root, b.ledgerDirectory) };
}
export function reserveUSD(body: RequestBody, model: Model) {
  if (model === "nano") return 0;
  assert.equal(body.max_tokens, 4096, "Unexpected Fable token bound");
  return ((Buffer.byteLength(JSON.stringify(body)) + 2048) * 20 + 4096 * 50) / 1e6;
}
export type Accounting = { accountedUSD: number; estimatedUSD: number | null; usageKnown: boolean; usage: unknown };
export function accountUsage(response: unknown, model: Model, reservation: number): Accounting {
  const r = response && typeof response === "object" ? response as Record<string, unknown> : {};
  if (model === "nano") return { accountedUSD: 0, estimatedUSD: 0, usageKnown: true,
    usage: { promptEvalCount: r.prompt_eval_count ?? null, evalCount: r.eval_count ?? null, totalDuration: r.total_duration ?? null } };
  const usage = r.usage as Record<string, unknown> | undefined;
  const valid = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  if (!usage || !valid(usage.input_tokens) || !valid(usage.output_tokens) || !valid(usage.cache_creation_input_tokens ?? 0) || !valid(usage.cache_read_input_tokens ?? 0))
    return { accountedUSD: reservation, estimatedUSD: null, usageKnown: false, usage: null };
  const i = usage.input_tokens, o = usage.output_tokens, w = (usage.cache_creation_input_tokens ?? 0) as number, c = (usage.cache_read_input_tokens ?? 0) as number;
  return { accountedUSD: ((i + w + c) * 20 + o * 50) / 1e6, estimatedUSD: (i * 10 + o * 50 + w * 20 + c * .25) / 1e6, usageKnown: true,
    usage: { input_tokens: i, output_tokens: o, cache_creation_input_tokens: w, cache_read_input_tokens: c } };
}
export type Start = { type: "call-start"; studyId: string; jobId: string; model: Model | "embedding"; budgetSHA256: string; manifestSHA256: string; requestSHA256: string; reservedUSD: number; beganAt: string };
export type Settlement = { type: "call-settlement"; studyId: string; jobId: string; budgetSHA256: string; accountedUSD: number; estimatedUSD: number | null; usageKnown: boolean; parsedSHA256: string; settledAt: string };
const eventKey = (studyId: string, jobId: string) => { assert(/^[a-zA-Z0-9_-]{1,160}$/.test(studyId) && /^[a-zA-Z0-9_-]{1,160}$/.test(jobId), "Invalid ledger ID"); return `${studyId}--${jobId}`; };
export function ledgerState(budget: Budget) {
  const starts = new Map<string, Start>(), settlements = new Map<string, Settlement>();
  if (existsSync(budget.ledgerPath)) for (const name of readdirSync(budget.ledgerPath).filter(n => n !== ".lock" && n !== ".nano-execution-lock")) {
    assert(name.endsWith(".json"), "Unrecognized budget artifact");
    const event = readJSON(join(budget.ledgerPath, name)) as Start | Settlement;
    assert.equal(event.budgetSHA256, budget.sha256, "Ledger belongs to a different budget");
    const key = eventKey(event.studyId, event.jobId);
    if (event.type === "call-start") {
      assert.equal(name, `${key}-start.json`); assert(!starts.has(key));
      assert(nonnegative(event.reservedUSD) && event.reservedUSD <= budget.perCallCeilingUSD, "Invalid reservation");
      assert(event.model === "fable" || event.model === "nano" || event.model === "embedding", "Invalid reserved model");
      starts.set(key, event);
    } else {
      assert.equal(event.type, "call-settlement"); assert.equal(name, `${key}-settlement.json`); assert(!settlements.has(key));
      assert(nonnegative(event.accountedUSD) && typeof event.usageKnown === "boolean", "Invalid settlement");
      settlements.set(key, event);
    }
  }
  let obligationsUSD = 0, generationObligationsUSD = 0, embeddingObligationsUSD = 0, blocked = false;
  for (const [key, start] of starts) {
    const settlement = settlements.get(key);
    const amount = settlement?.accountedUSD ?? start.reservedUSD;
    obligationsUSD += amount;
    if (start.model === "embedding") embeddingObligationsUSD += amount; else generationObligationsUSD += amount;
    if (settlement && (!settlement.usageKnown || settlement.accountedUSD > start.reservedUSD + 1e-12)) blocked = true;
  }
  for (const key of settlements.keys()) assert(starts.has(key), "Settlement has no durable start");
  return { starts, settlements, obligationsUSD, generationObligationsUSD, embeddingObligationsUSD, blocked,
    remainingUSD: budget.allocationUSD - budget.embeddingEarmarkUSD - budget.accountedAndOutstandingUSD - generationObligationsUSD,
    embeddingRemainingUSD: Math.min(budget.embeddingEarmarkUSD - embeddingObligationsUSD, budget.allocationUSD - budget.accountedAndOutstandingUSD - obligationsUSD) };
}
export function reserveAndStart(budget: Budget, start: Omit<Start, "type" | "budgetSHA256">) {
  return withDirectoryLock(budget.ledgerPath, () => {
    const state = ledgerState(budget), key = eventKey(start.studyId, start.jobId);
    assert(!state.blocked, "Unknown or excessive previous accounting prevents further dispatch");
    assert(!state.starts.has(key), "Job was already started; no retry permitted");
    assert(nonnegative(start.reservedUSD) && start.reservedUSD <= budget.perCallCeilingUSD, "Per-call reservation exceeds its ceiling");
    assert(start.reservedUSD <= (start.model === "embedding" ? state.embeddingRemainingUSD : state.remainingUSD) + 1e-12, "Insufficient remaining research allocation");
    writeExclusiveJSON(join(budget.ledgerPath, `${key}-start.json`), { type: "call-start", budgetSHA256: budget.sha256, ...start });
  });
}
export function settle(budget: Budget, settlement: Omit<Settlement, "type" | "budgetSHA256">) {
  return withDirectoryLock(budget.ledgerPath, () => {
    const state = ledgerState(budget), key = eventKey(settlement.studyId, settlement.jobId);
    assert(state.starts.has(key), "Settlement has no durable start");
    assert(!state.settlements.has(key), "Settlement already exists");
    assert(nonnegative(settlement.accountedUSD), "Invalid accounted amount");
    writeExclusiveJSON(join(budget.ledgerPath, `${key}-settlement.json`), { type: "call-settlement", budgetSHA256: budget.sha256, ...settlement });
  });
}
