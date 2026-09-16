import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { buildLocalBindingFixtures, localBindingInput } from "../src/evaluation/local-binding-fixtures.ts";
import { buildLocalMiningTasks, localMiningInput } from "../src/evaluation/local-mining-tasks.ts";
import { LOCAL_OFFLINE_VERSION, LOCAL_MODEL, LOCAL_OPTIONS, LOCAL_UTILITY_GATE, localRequest, validateLocalOutput, scoreLocalBinding, sha256, type LocalTask, type LocalLabel, type LocalResult } from "../src/evaluation/local-offline.ts";

const root = resolve(import.meta.dirname, "..");
const endpoint = "http://127.0.0.1:11434";
const sourcePaths = ["scripts/local-offline-study.ts", "src/evaluation/local-offline.ts", "src/evaluation/local-binding-fixtures.ts", "src/evaluation/local-mining-tasks.ts"];
type Plan = { version: string; createdAt: string; deadlineUtc: string; model: typeof LOCAL_MODEL; options: typeof LOCAL_OPTIONS; gate: typeof LOCAL_UTILITY_GATE; sourceHashes: Record<string, string>; tasks: LocalTask[] };
type Start = { id: string; startedAt: string; planHash: string; requestHash: string; modelDigest: string };
const load = <T,>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const save = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
const fileHash = (path: string) => sha256(readFileSync(path, "utf8"));
const files = (dir: string, id: string) => ({ started: join(dir, `${id}-started.json`), request: join(dir, `${id}-request.json`), raw: join(dir, `${id}-raw.json`), result: join(dir, `${id}-result.json`) });
const terminalReason = (raw: Record<string, unknown>) => raw.done === true && raw.done_reason === "stop";
function rawMetrics(raw: Record<string, any>): LocalResult["metrics"] {
  if (![raw.load_duration, raw.total_duration, raw.prompt_eval_count, raw.eval_count, raw.eval_duration].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0)) return undefined;
  return { loadSeconds: raw.load_duration / 1e9, totalSeconds: raw.total_duration / 1e9, promptTokens: raw.prompt_eval_count, outputTokens: raw.eval_count,
    generationTokensPerSecond: raw.eval_duration > 0 ? raw.eval_count / (raw.eval_duration / 1e9) : null, thinkingCharacters: raw.message?.thinking?.length ?? 0 };
}

export function prepareLocalStudy(directory: string, deadlineUtc = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()) {
  const dir = resolve(directory);
  if (existsSync(dir)) throw new Error("LOCAL_OUTPUT_ALREADY_EXISTS");
  if (!Number.isFinite(Date.parse(deadlineUtc)) || Date.parse(deadlineUtc) <= Date.now()) throw new Error("LOCAL_DEADLINE_MUST_BE_FUTURE");
  const fixtures = buildLocalBindingFixtures(), mining = buildLocalMiningTasks();
  const tasks: LocalTask[] = fixtures.map((fixture, i) => ({ id: `binding-${String(i + 1).padStart(3, "0")}`, kind: "binding", split: fixture.split, input: localBindingInput(fixture) }));
  const labels: LocalLabel[] = fixtures.map((fixture, i) => ({ id: tasks[i].id, family: fixture.family, variant: fixture.variant, expected: fixture.expected }));
  const provenance: unknown[] = fixtures.map((fixture, i) => ({ id: tasks[i].id, fixtureId: fixture.id, rationale: fixture.rationale, provenance: fixture.provenance }));
  for (const [i, task] of mining.entries()) {
    const id = `mining-${String(i + 1).padStart(3, "0")}`;
    tasks.push({ id, kind: task.kind, split: "mining", input: localMiningInput(task) });
    provenance.push({ id, taskId: task.id, provenance: task.provenance });
  }
  // Seeded shuffle keeps controls and defects interleaved without exposing ids.
  let seed = 42;
  for (let i = tasks.length - 1; i > 0; i--) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const j = seed % (i + 1); [tasks[i], tasks[j]] = [tasks[j], tasks[i]]; }
  for (const task of tasks) localRequest(task);
  const plan: Plan = { version: LOCAL_OFFLINE_VERSION, createdAt: new Date().toISOString(), deadlineUtc, model: LOCAL_MODEL, options: LOCAL_OPTIONS, gate: LOCAL_UTILITY_GATE,
    sourceHashes: Object.fromEntries(sourcePaths.map(path => [path, fileHash(join(root, path))])), tasks };
  mkdirSync(dir, { recursive: false });
  save(join(dir, "plan.json"), plan); save(join(dir, "labels.json"), labels); save(join(dir, "provenance.json"), provenance);
  save(join(dir, "freeze.json"), { plan: fileHash(join(dir, "plan.json")), labels: fileHash(join(dir, "labels.json")), provenance: fileHash(join(dir, "provenance.json")) });
  console.log(JSON.stringify({ directory: dir, planHash: fileHash(join(dir, "plan.json")), tasks: tasks.length, binding: fixtures.length, mining: mining.length, providerCalls: 0 }));
}
export function verifyLocalStudy(directory: string, scoringSourceCommit?: string) {
  const dir = resolve(directory), freeze = load<Record<string, string>>(join(dir, "freeze.json"));
  for (const file of ["plan", "labels", "provenance"]) if (fileHash(join(dir, `${file}.json`)) !== freeze[file]) throw new Error(`LOCAL_FREEZE_CHANGED:${file}`);
  const plan = load<Plan>(join(dir, "plan.json"));
  if (plan.version !== LOCAL_OFFLINE_VERSION || JSON.stringify(plan.model) !== JSON.stringify(LOCAL_MODEL) || JSON.stringify(plan.options) !== JSON.stringify(LOCAL_OPTIONS)) throw new Error("LOCAL_MODEL_CONTRACT_CHANGED");
  // Historical source verification is read-only and used only by scoring.
  // Generation always requires the current files to match the original freeze.
  if (scoringSourceCommit && !/^[0-9a-f]{7,40}$/.test(scoringSourceCommit)) throw new Error("LOCAL_SOURCE_COMMIT_INVALID");
  for (const [path, hash] of Object.entries(plan.sourceHashes)) {
    const actual = scoringSourceCommit
      ? sha256(execFileSync("git", ["show", `${scoringSourceCommit}:${path}`], { cwd: root, encoding: "utf8" }))
      : fileHash(join(root, path));
    if (actual !== hash) throw new Error(`LOCAL_SOURCE_CHANGED:${path}`);
  }
  return { dir, plan, planHash: freeze.plan, labels: load<LocalLabel[]>(join(dir, "labels.json")) };
}
async function localJson(path: string, body?: unknown) {
  const response = await fetch(`${endpoint}${path}`, { method: body ? "POST" : "GET", redirect: "error", headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10_000) });
  const value = await response.json();
  if (!response.ok || value.error) throw new Error(`OLLAMA_${response.status}:${value.error ?? "request failed"}`);
  return value;
}
async function memorySample() {
  let swap = "unavailable", vm = "unavailable";
  try { swap = execFileSync("/usr/sbin/sysctl", ["vm.swapusage"], { encoding: "utf8" }).trim(); vm = execFileSync("/usr/bin/vm_stat", [], { encoding: "utf8" }); } catch { /* System metrics are optional and explicitly unavailable. */ }
  let running: unknown = null;
  try { running = await localJson("/api/ps"); } catch { /* Never turn failed telemetry into a second generation. */ }
  return { timestamp: new Date().toISOString(), swap, vm, running };
}
function readResults(directory: string, plan: Plan, planHash: string) {
  const results: LocalResult[] = [];
  for (const task of plan.tasks) {
    const paths = files(directory, task.id);
    if (!existsSync(paths.started)) {
      if (existsSync(paths.result) || existsSync(paths.raw)) throw new Error("LOCAL_ORPHAN_RESULT");
      continue;
    }
    const start = load<Start>(paths.started);
    if (start.id !== task.id || start.planHash !== planHash || start.requestHash !== sha256(JSON.stringify(localRequest(task))) || start.modelDigest !== plan.model.digest) throw new Error("LOCAL_ATTEMPT_BINDING_CHANGED");
    if (fileHash(paths.request) !== sha256(JSON.stringify(localRequest(task), null, 2) + "\n")) throw new Error("LOCAL_REQUEST_CHANGED");
    if (!existsSync(paths.result)) { results.push({ id: task.id, status: "error", error: "STARTED_WITHOUT_RESULT_IN_FLIGHT_OR_INTERRUPTED_NO_RETRY", wallSeconds: null }); continue; }
    const result = load<LocalResult>(paths.result);
    if (result.id !== task.id) throw new Error("LOCAL_RESULT_ID_MISMATCH");
    if (existsSync(paths.raw)) {
      const raw = load<{ body: string; httpStatus: number }>(paths.raw);
      let body: Record<string, any> | null = null;
      try { body = JSON.parse(raw.body); } catch { /* Non-JSON error payload remains retained. */ }
      result.metrics = body ? rawMetrics(body) : undefined;
      if (result.status === "ok") {
        if (raw.httpStatus !== 200 || !body || !terminalReason(body) || !isDeepStrictEqual(JSON.parse(body.message.content), result.output)) throw new Error("LOCAL_RESULT_RAW_MISMATCH");
        result.integrity = validateLocalOutput(task, result.output).integrity;
      }
    } else if (result.status === "ok") {
      throw new Error("LOCAL_SUCCESS_WITHOUT_RAW");
    }
    results.push(result);
  }
  return results;
}
export function scoreLocalStudy(directory: string, scoringSourceCommit?: string) {
  const { dir, plan, planHash, labels } = verifyLocalStudy(directory, scoringSourceCommit);
  const results = readResults(dir, plan, planHash);
  const binding = Object.fromEntries((["development", "validation"] as const).map(split => {
    const tasks = plan.tasks.filter(t => t.split === split), ids = new Set(tasks.map(t => t.id));
    return [split, scoreLocalBinding(tasks, labels.filter(l => ids.has(l.id)), results.filter(r => ids.has(r.id)))];
  }));
  const mining = plan.tasks.filter(t => t.split === "mining").map(task => {
    const result = results.find(r => r.id === task.id);
    return { id: task.id, kind: task.kind, status: result?.status ?? "unattempted", integrity: result?.integrity ?? null, clinicalCorrectness: "not_assessed", humanAdjudicated: false };
  });
  const report = { version: plan.version, planHash, scoringSourceCommit: scoringSourceCommit ?? null,
    scoringSourceHashes: Object.fromEntries(sourcePaths.map(path => [path, fileHash(join(root, path))])),
    binding, mining, firstAttemptsRecorded: results.length, planned: plan.tasks.length, paidProviderCalls: 0,
    telemetry: results.map(r => ({ id: r.id, status: r.status, wallSeconds: r.wallSeconds, rawMetrics: r.metrics ?? null })),
    historicalGoldReadByThisRunner: false, liveCandidateChanged: false, decision: "Offline engineering utility only; live V25 remains frozen." };
  const name = `report-${new Date().toISOString().replaceAll(":", "-")}.json`;
  save(join(dir, name), report);
  console.log(JSON.stringify({ report: join(dir, name), development: binding.development.summary, validation: binding.validation.summary, validationUtilityGate: binding.validation.offlineUtilityGate, mining: mining.length, recorded: results.length }));
  return report;
}
async function runLocalStudyUnlocked(directory: string, split: string) {
  if (!["development", "validation", "mining"].includes(split)) throw new Error("EXPLICIT_SPLIT_REQUIRED");
  const { dir, plan, planHash } = verifyLocalStudy(directory);
  if (split === "validation" && !existsSync(join(dir, "validation-selection.json"))) throw new Error("SELECT_FROZEN_PROMPT_BEFORE_VALIDATION");
  if (split === "validation" && load<{ planHash: string }>(join(dir, "validation-selection.json")).planHash !== planHash) throw new Error("VALIDATION_SELECTION_CHANGED");
  const tags = await localJson("/api/tags");
  const model = tags.models.find((m: { name: string }) => m.name === plan.model.name || m.name === `${plan.model.name}:latest`);
  if (model?.digest !== plan.model.digest) throw new Error("LOCAL_MODEL_DIGEST_MISMATCH");
  const runtimePath = join(dir, `runtime-${split}-${new Date().toISOString().replaceAll(":", "-")}.json`);
  save(runtimePath, { version: await localJson("/api/version"), model, show: await localJson("/api/show", { model: plan.model.name }), before: await memorySample() });
  const recorded = readResults(dir, plan, planHash), startedIds = new Set(recorded.map(r => r.id));
  for (const task of plan.tasks.filter(t => t.split === split)) {
    if (startedIds.has(task.id)) { console.log(JSON.stringify({ id: task.id, cachedFirstAttempt: true })); continue; }
    const remaining = Date.parse(plan.deadlineUtc) - Date.now();
    if (remaining < 1000) { console.log(JSON.stringify({ stop: "USER_TIME_WINDOW", remainingTasksRetained: true })); break; }
    const paths = files(dir, task.id), request = localRequest(task);
    // Exclusive start is a claim: any crash after it stays an unsuccessful first
    // attempt. Resuming never retries a known failure or unfinished dispatch.
    if (!existsSync(paths.request)) {
      try { save(paths.request, request); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    }
    if (fileHash(paths.request) !== sha256(JSON.stringify(request, null, 2) + "\n")) throw new Error("LOCAL_REQUEST_CHANGED");
    try { save(paths.started, { id: task.id, startedAt: new Date().toISOString(), planHash, requestHash: sha256(JSON.stringify(request)), modelDigest: plan.model.digest } satisfies Start); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; console.log(JSON.stringify({ id: task.id, claimedByAnotherRunner: true })); continue; }
    const started = performance.now();
    let result: LocalResult;
    try {
      const response = await fetch(`${endpoint}/api/chat`, { method: "POST", redirect: "error", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal: AbortSignal.timeout(Math.min(120_000, remaining)) });
      const body = await response.text(); save(paths.raw, { httpStatus: response.status, body });
      const raw = JSON.parse(body);
      if (!response.ok || raw.error) throw new Error(`LOCAL_HTTP_${response.status}:${raw.error ?? "failed"}`);
      if (!terminalReason(raw)) throw new Error(`LOCAL_INCOMPLETE:${raw.done_reason}`);
      const checked = validateLocalOutput(task, JSON.parse(raw.message.content));
      result = { id: task.id, status: "ok", ...checked, wallSeconds: (performance.now() - started) / 1000, metrics: rawMetrics(raw) };
    } catch (error) { result = { id: task.id, status: "error", error: error instanceof Error ? error.message : String(error), wallSeconds: (performance.now() - started) / 1000 }; }
    save(paths.result, result);
    save(join(dir, `${task.id}-memory.json`), await memorySample());
    console.log(JSON.stringify({ id: task.id, kind: task.kind, status: result.status, integrity: result.integrity?.valid ?? false, seconds: result.wallSeconds, error: result.error }));
  }
  save(join(dir, `after-${split}-${new Date().toISOString().replaceAll(":", "-")}.json`), await memorySample());
}
export async function runLocalStudy(directory: string, split: string) {
  const lock = "/private/tmp/counsel-local-offline-ollama.lock";
  try { mkdirSync(lock); } catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("LOCAL_RUN_LOCKED: verify the recorded owner before removing a stale lock"); throw error; }
  try {
    save(join(lock, "owner.json"), { pid: process.pid, directory: resolve(directory), split, createdAt: new Date().toISOString() });
    await runLocalStudyUnlocked(directory, split);
  } finally { rmSync(lock, { recursive: true }); }
}
export function selectValidation(directory: string) {
  const { dir, plan, planHash, labels } = verifyLocalStudy(directory), results = readResults(dir, plan, planHash);
  if (plan.tasks.some(t => t.split === "development" && !existsSync(files(dir, t.id).result))) throw new Error("DEVELOPMENT_INCOMPLETE");
  if (plan.tasks.some(t => t.split === "validation" && existsSync(files(dir, t.id).started))) throw new Error("VALIDATION_ALREADY_STARTED");
  const development = plan.tasks.filter(t => t.split === "development"), ids = new Set(development.map(t => t.id));
  if (!scoreLocalBinding(development, labels.filter(l => ids.has(l.id)), results.filter(r => ids.has(r.id))).offlineUtilityGate) throw new Error("DEVELOPMENT_UTILITY_GATE_FAILED");
  save(join(dir, "validation-selection.json"), { planHash, selectedAt: new Date().toISOString(), promptSelection: `Frozen ${plan.version}; no revision after development`, validationModelOutputsObserved: false, clinicalPromotion: false });
  console.log(`Selected frozen ${plan.version} for one validation pass.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, directory, split] = process.argv.slice(2);
  if (!directory) throw new Error("Usage: local-offline-study.ts prepare DIR [DEADLINE_ISO] | run DIR development|validation|mining | score DIR [SOURCE_COMMIT] | select DIR");
  if (command === "prepare") prepareLocalStudy(directory, split);
  else if (command === "run") await runLocalStudy(directory, split);
  else if (command === "score") scoreLocalStudy(directory, split);
  else if (command === "select") selectValidation(directory);
  else throw new Error("UNKNOWN_LOCAL_COMMAND");
}
