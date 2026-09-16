/** Frozen, labels-free research execution. Clinical references are deliberately not accepted. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, unlinkSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { accountUsage, fileHash, ledgerState, readBudget, readJSON, reserveAndStart, reserveUSD, settle, sha256, within, withDirectoryLock, writeExclusiveBytes, writeExclusiveJSON, type Budget } from "./budget.ts";
import { createTransport, unloadNano, verifyFableAccess, verifyNanoIdentity, verifyNanoRuntime, type Model, type RequestBody, type Transport } from "./transport.ts";
import { executeOneCall } from "./workflow.ts";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const DEADLINE = "2026-09-16T14:41:47Z";
export const NANO_DIGEST = "36896b6271148892f83130812cb14116beeb2a518f98a0a17b469250b84901c8";
export const ARMS = ["baseline", "async_context", "workflow_contract", "workflow_evidence"] as const;
export type Arm = typeof ARMS[number];
export interface ProtocolAdapter {
  id: string; sourceFiles: string[];
  buildRequest(args: { model: Model; arm: Arm; message: string; replicate: number; seed: number; evidenceText?: string; evidenceMetadata?: unknown }): RequestBody;
  parseResponse(args: { model: Model; arm: Arm; response: unknown }): unknown;
  protocolMetadata(args: { model: Model; arm: Arm }): { systemPrompt: string; settings: unknown; sourceHashes?: Record<string, string> };
  validateEvidencePackets?(args: { root: string; evidencePath: string; verificationMode?: "generation" | "frozen" }): { additionalInputFiles: string[] };
}
const idSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
const messageSchema = z.object({ id: idSchema, message: z.string().min(1).max(12_000).refine(s => !!s.trim()) }).strict();
const modelSchema = z.enum(["fable", "nano"]);
const configSchema = z.object({
  schema: z.literal("workflow-aware-study/v1"), models: z.array(modelSchema).min(1), arms: z.array(z.enum(ARMS)).min(1),
  replicates: z.number().int().min(1).max(10), seed: z.number().int().min(0).max(0xffffffff),
  deadlineUTC: z.string().refine(s => Number.isFinite(Date.parse(s)) && Date.parse(s) <= Date.parse(DEADLINE)),
  timeoutMs: z.object({ fable: z.number().int().min(1000).max(300_000), nano: z.number().int().min(1000).max(300_000) }).strict(),
  nanoDigest: z.string().refine(s => s.replace(/^sha256:/, "") === NANO_DIGEST),
  phases: z.array(z.object({ id: idSchema, messageIds: z.array(idSchema).min(1) }).strict()).min(1),
}).strict();
export type StudyConfig = z.infer<typeof configSchema>;
export type Message = z.infer<typeof messageSchema>;
export type Job = { jobId: string; caseId: string; model: Model; arm: Arm; replicate: number; seed: number; phase: string;
  inputSHA256: string; requestPath: string; requestSHA256: string; promptSHA256: string; reservedUSD: number };
export type Manifest = {
  schema: "workflow-aware-manifest/v1"; studyId: string; frozenAt: string; protocolId: string; config: StudyConfig;
  messages: Message[]; jobs: Job[]; sourceHashes: Record<string, string>; inputFiles: Record<string, string>;
  inputs: { messagesPath: string; configPath: string; evidencePath: string | null };
  runtime: { packageLockPath: string; packageLockSHA256: string; nodeVersion: string };
  protocolMetadata: Record<string, ReturnType<ProtocolAdapter["protocolMetadata"]>>;
  budget: { path: string; sha256: string }; policy: Record<string, unknown>;
};
export type ParsedRecord = { jobId: string; caseId: string; model: Model; arm: Arm; replicate: number; seed: number; phase: string;
  result: unknown | null; failure: string | null; providerCalls: 1; requestSHA256: string; rawSHA256: string; latencyMs: number;
  accountedUSD: number; estimatedUSD: number | null; usageKnown: boolean; usage: unknown };
export const OWN_SOURCES = ["src/research/workflow-aware/runner.ts", "src/research/workflow-aware/transport.ts", "src/research/workflow-aware/workflow.ts", "src/research/workflow-aware/budget.ts", "scripts/workflow-aware-study.ts", "data/research/workflow-aware-v1/nano-serving-provenance.json"];
const names = (dir: string) => readdirSync(dir).sort();
const unique = (items: string[], label: string) => assert.equal(new Set(items).size, items.length, `Duplicate ${label}`);
function rng(seed: number) {
  let value = seed >>> 0;
  return () => { value += 0x6d2b79f5; let t = value; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function shuffled<T>(values: T[], random: () => number) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function makeSchedule(messages: Message[], config: StudyConfig) {
  const random = rng(config.seed), jobs: Omit<Job, "requestPath" | "requestSHA256" | "promptSHA256" | "reservedUSD">[] = [];
  for (const phase of config.phases) for (let replicate = 1; replicate <= config.replicates; replicate++) {
    for (const caseId of shuffled(phase.messageIds, random)) for (const model of shuffled(config.models, random)) {
      for (const arm of shuffled(config.arms, random)) {
        const message = messages.find(m => m.id === caseId)!.message;
        jobs.push({ jobId: `${phase.id}-${caseId}-${model}-${arm}-r${replicate}`, caseId, model, arm, replicate,
          seed: (config.seed + replicate - 1) >>> 0, phase: phase.id, inputSHA256: sha256(message) });
      }
    }
  }
  return jobs;
}
function validateConfigMessages(messages: Message[], config: StudyConfig) {
  assert(messages.length > 0, "Empty message set"); unique(messages.map(m => m.id), "case ID");
  unique(config.models, "model"); unique(config.arms, "arm"); unique(config.phases.map(p => p.id), "phase");
  const phased = config.phases.flatMap(p => p.messageIds); unique(phased, "phase message ID");
  assert.deepEqual([...phased].sort(), messages.map(m => m.id).sort(), "Phases must partition all messages");
}
function requestFirewall(body: RequestBody, model: Model, message: string) {
  assert(body && typeof body === "object" && !Array.isArray(body), "Invalid provider request");
  const messages = body.messages as { role?: unknown; content?: unknown }[];
  assert(Array.isArray(messages), "Missing message-only user input");
  assert.deepEqual(messages.filter(m => m.role === "user"), [{ role: "user", content: message }], "User content must be the exact message only");
  assert(messages.every(m => m.role === "user" || m.role === "system"), "Conversation history is prohibited");
  assert(!Object.hasOwn(body, "tools") && !Object.hasOwn(body, "tool_choice"), "Online tools are prohibited");
  if (model === "fable") {
    assert.equal(messages.length, 1); assert.equal(body.model, "claude-fable-5-1"); assert.equal(body.max_tokens, 4096);
    assert.deepEqual(body.thinking, { type: "adaptive" }); assert.deepEqual(body.output_config, { effort: "low" });
  } else {
    assert.equal(body.model, "counsel-nano-q5"); assert.equal(body.think, false); assert.equal(body.stream, false); assert.equal(body.keep_alive, "5m");
    // Ollama's native renderer lets message content override the think flag.
    assert(messages.every(m => typeof m.content === "string" && !m.content.includes("/think") && !m.content.includes("/no_think")), "Nano renderer control strings would override the frozen thinking setting");
    const options = body.options as Record<string, unknown>;
    assert.equal(options?.num_ctx, 8192); assert.equal(options?.num_predict, 1024); assert.equal(options?.temperature, 0);
    assert(Number.isSafeInteger(options?.seed), "Nano seed is required");
    assert(Buffer.byteLength(JSON.stringify(messages)) + 512 + 1024 <= 8192, "Nano request exceeds conservative context allowance; do not silently truncate");
  }
}
const promptHash = (body: RequestBody) => sha256(JSON.stringify(body.system ?? (body.messages as { role: string; content: unknown }[]).filter(m => m.role === "system")));
function portablePath(root: string, path: string) { const name = relative(root, resolve(root, path)); within(root, name); return name; }
function sourceNames(root: string, protocol: ProtocolAdapter) { return [...new Set([...OWN_SOURCES, ...protocol.sourceFiles.map(p => portablePath(root, p))])].sort(); }
function loadEvidence(root: string, path: string | null, protocol: ProtocolAdapter, messages: Message[], verificationMode: "generation" | "frozen" = "generation") {
  const packets = new Map<string, { evidenceText: string; evidenceMetadata?: unknown }>();
  if (!path) return { packets, additionalInputFiles: [] as string[] };
  assert(protocol.validateEvidencePackets, "Evidence provenance validator is required");
  const admitted = protocol.validateEvidencePackets({ root, evidencePath: within(root, path), verificationMode });
  const additionalInputFiles = admitted.additionalInputFiles.map(p => portablePath(root, p));
  const schema = z.object({ schema: z.literal("workflow-aware-evidence-packets/v1"), packets: z.array(z.object({ inputSHA256: z.string().regex(/^[a-f0-9]{64}$/), evidenceText: z.string().max(60_000), evidenceMetadata: z.unknown() }).strict()) }).strict();
  for (const packet of schema.parse(readJSON(within(root, path))).packets) { assert(!packets.has(packet.inputSHA256), "Duplicate evidence packet"); packets.set(packet.inputSHA256, packet); }
  assert.deepEqual([...packets.keys()].sort(), [...new Set(messages.map(m => sha256(m.message)))].sort(), "Evidence packets must match the message set");
  return { packets, additionalInputFiles };
}
function rebuildRequest(job: Pick<Job, "model" | "arm" | "replicate" | "seed" | "inputSHA256" | "caseId">, messages: Message[], packets: ReturnType<typeof loadEvidence>["packets"], protocol: ProtocolAdapter) {
  const message = messages.find(m => m.id === job.caseId)!.message;
  const packet = job.arm === "workflow_evidence" ? packets.get(job.inputSHA256) : undefined;
  const body = protocol.buildRequest({ model: job.model, arm: job.arm, message, replicate: job.replicate, seed: job.seed, ...(packet ? { evidenceText: packet.evidenceText, evidenceMetadata: packet.evidenceMetadata } : {}) });
  requestFirewall(body, job.model, message); return body;
}
export function planStudy(options: { messagesPath: string; configPath: string; budgetPath: string; outputDir: string; evidencePath?: string; protocol: ProtocolAdapter; root?: string }) {
  const root = options.root ?? ROOT, outputDir = resolve(options.outputDir), protocol = options.protocol;
  assert(!existsSync(outputDir), "A study requires a new output directory");
  const messages = z.array(messageSchema).parse(readJSON(options.messagesPath)), config = configSchema.parse(readJSON(options.configPath));
  validateConfigMessages(messages, config);
  const budget = readBudget(options.budgetPath, root);
  assert(protocol.id && protocol.sourceFiles.length, "Protocol identity and source files are required");
  const inputs = { messagesPath: portablePath(root, options.messagesPath), configPath: portablePath(root, options.configPath), evidencePath: options.evidencePath ? portablePath(root, options.evidencePath) : null };
  if (config.arms.includes("workflow_evidence")) {
    assert(options.evidencePath, "Evidence arm requires pre-frozen evidence packets");
  } else assert(!options.evidencePath, "Unexpected evidence file for a study without an evidence arm");
  const evidence = loadEvidence(root, inputs.evidencePath, protocol, messages);
  const sources = sourceNames(root, protocol);
  const metadata = Object.fromEntries(config.models.flatMap(model => config.arms.map(arm => [`${model}/${arm}`, protocol.protocolMetadata({ model, arm })])));
  const sourceHashes = Object.fromEntries(sources.map(p => [p, fileHash(within(root, p))]));
  const planned = makeSchedule(messages, config).map(job => {
    const body = rebuildRequest(job, messages, evidence.packets, protocol);
    const reservedUSD = reserveUSD(body, job.model); assert(reservedUSD <= budget.perCallCeilingUSD, "A request exceeds the per-call ceiling");
    return { job, body, reservedUSD };
  });
  mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  for (const name of ["requests", "raw", "parsed", "batches", "lifecycle", "runtime"]) mkdirSync(join(outputDir, name), { mode: 0o700 });
  const runtime = { packageLockPath: "runtime/package-lock.json", packageLockSHA256: fileHash(join(root, "package-lock.json")), nodeVersion: process.version };
  writeExclusiveBytes(join(outputDir, runtime.packageLockPath), readFileSync(join(root, "package-lock.json")));
  const jobs: Job[] = [];
  for (const { job, body, reservedUSD } of planned) {
    const requestPath = `requests/${job.jobId}.json`, path = join(outputDir, requestPath);
    writeExclusiveJSON(path, { ...job, reservedUSD, body });
    jobs.push({ ...job, requestPath, requestSHA256: fileHash(path), promptSHA256: promptHash(body), reservedUSD });
  }
  const inputPaths = [...new Set([inputs.messagesPath, inputs.configPath, ...(inputs.evidencePath ? [inputs.evidencePath] : []), ...evidence.additionalInputFiles])].sort();
  const manifest: Manifest = { schema: "workflow-aware-manifest/v1", studyId: randomUUID(), frozenAt: new Date().toISOString(), protocolId: protocol.id,
    config, messages, jobs, sourceHashes, inputs, runtime, inputFiles: Object.fromEntries(inputPaths.map(p => [p, fileHash(within(root, p))])), protocolMetadata: metadata,
    budget: { path: portablePath(root, options.budgetPath), sha256: budget.sha256 },
    policy: { callsPerJob: 1, retries: 0, fallbacks: 0, onlineJudges: 0, workersPerModel: 1, maxConcurrentNano: 1, scoring: "Separate process after generation freeze", completeScheduleFrozenBeforeGeneration: true,
      budgetReservation: "Each dispatched call reserves its full bound; unsettled calls retain that reservation. No full-study advance reservation." } };
  writeExclusiveJSON(join(outputDir, "manifest.json"), manifest);
  writeExclusiveJSON(join(outputDir, "plan-complete.json"), { schema: "workflow-aware-plan-freeze/v1", studyId: manifest.studyId, frozenAt: new Date().toISOString(),
    manifestSHA256: fileHash(join(outputDir, "manifest.json")), artifactHashes: { [runtime.packageLockPath]: runtime.packageLockSHA256, ...Object.fromEntries(jobs.map(j => [j.requestPath, j.requestSHA256])) } });
  return manifest;
}

function verifyStudyInternal(outputDir: string, protocol: ProtocolAdapter, root: string, verificationMode: "generation" | "frozen") {
  const manifestPath = join(outputDir, "manifest.json"), manifest = readJSON(manifestPath) as Manifest;
  assert.equal(manifest.schema, "workflow-aware-manifest/v1"); assert.equal(manifest.protocolId, protocol.id);
  configSchema.parse(manifest.config); z.array(messageSchema).parse(manifest.messages); validateConfigMessages(manifest.messages, manifest.config);
  const freeze = readJSON(join(outputDir, "plan-complete.json")) as { studyId: string; manifestSHA256: string; artifactHashes: Record<string, string> };
  assert.equal(freeze.studyId, manifest.studyId); assert.equal(fileHash(manifestPath), freeze.manifestSHA256, "Manifest changed after planning");
  assert.equal(manifest.runtime.packageLockPath, "runtime/package-lock.json");
  assert.equal(fileHash(within(outputDir, manifest.runtime.packageLockPath)), manifest.runtime.packageLockSHA256, "Archived runtime changed");
  assert.equal(freeze.artifactHashes[manifest.runtime.packageLockPath], manifest.runtime.packageLockSHA256);
  if (verificationMode === "generation") {
    assert.equal(fileHash(join(root, "package-lock.json")), manifest.runtime.packageLockSHA256, "Generation dependency lock changed");
    assert.equal(process.version, manifest.runtime.nodeVersion, "Generation Node runtime changed");
  }
  assert.deepEqual(Object.keys(manifest.sourceHashes).sort(), sourceNames(root, protocol), "Required source provenance is incomplete");
  for (const [path, hash] of Object.entries({ ...manifest.sourceHashes, ...manifest.inputFiles })) assert.equal(fileHash(within(root, path)), hash, "Frozen input or implementation changed");
  assert.deepEqual(z.array(messageSchema).parse(readJSON(within(root, manifest.inputs.messagesPath))), manifest.messages, "Message projection changed");
  assert.deepEqual(configSchema.parse(readJSON(within(root, manifest.inputs.configPath))), manifest.config, "Configuration changed");
  assert.equal(!!manifest.inputs.evidencePath, manifest.config.arms.includes("workflow_evidence"), "Unexpected or missing evidence input");
  const evidence = loadEvidence(root, manifest.inputs.evidencePath, protocol, manifest.messages, verificationMode);
  assert.deepEqual(Object.keys(manifest.inputFiles).sort(), [...new Set([manifest.inputs.messagesPath, manifest.inputs.configPath, ...(manifest.inputs.evidencePath ? [manifest.inputs.evidencePath] : []), ...evidence.additionalInputFiles])].sort(), "Required input provenance is incomplete");
  assert.deepEqual(manifest.protocolMetadata, Object.fromEntries(manifest.config.models.flatMap(model => manifest.config.arms.map(arm => [`${model}/${arm}`, protocol.protocolMetadata({ model, arm })]))), "Protocol metadata changed");
  const scheduled = makeSchedule(manifest.messages, manifest.config);
  assert.equal(manifest.jobs.length, scheduled.length);
  assert.deepEqual(names(join(outputDir, "requests")), manifest.jobs.map(j => `${j.jobId}.json`).sort(), "Request set changed");
  for (let i = 0; i < manifest.jobs.length; i++) {
    const job = manifest.jobs[i], { requestPath, requestSHA256, promptSHA256, reservedUSD, ...identity } = job;
    assert.deepEqual(identity, scheduled[i], "Schedule changed"); assert.equal(requestPath, `requests/${job.jobId}.json`);
    assert.equal(fileHash(join(outputDir, requestPath)), requestSHA256); assert.equal(freeze.artifactHashes[requestPath], requestSHA256);
    const request = readJSON(join(outputDir, requestPath)) as { body: RequestBody; inputSHA256: string; jobId: string };
    assert.deepEqual(request, { ...scheduled[i], reservedUSD, body: rebuildRequest(job, manifest.messages, evidence.packets, protocol) }, "Request does not reconstruct from frozen protocol and inputs");
    assert.equal(reserveUSD(request.body, job.model), reservedUSD); assert.equal(promptHash(request.body), promptSHA256);
  }
  const budget = readBudget(within(root, manifest.budget.path), root); assert.equal(budget.sha256, manifest.budget.sha256, "Budget changed");
  return { manifest, budget, manifestSHA256: freeze.manifestSHA256 };
}
export function verifyStudy(outputDir: string, protocol: ProtocolAdapter, root = ROOT) { return verifyStudyInternal(outputDir, protocol, root, "generation"); }

/** Completed evidence can be checked after dependency maintenance; generation remains strict. */
export function verifyFrozenStudy(outputDir: string, protocol: ProtocolAdapter, root = ROOT) {
  const complete = readJSON(join(outputDir, "generation-complete.json")) as { schema: string; studyId: string; plannedJobs: number; providerCalls: number; artifactHashes: Record<string, string>; ledgerEventHashes: Record<string, string> };
  assert.equal(complete.schema, "workflow-aware-generation-freeze/v1");
  for (const required of ["manifest.json", "plan-complete.json", "runtime/package-lock.json"]) assert(Object.hasOwn(complete.artifactHashes, required), "Incomplete generation freeze");
  for (const [path, hash] of Object.entries(complete.artifactHashes)) assert.equal(fileHash(within(outputDir, path)), hash, "Frozen generation artifact changed");
  for (const [path, hash] of Object.entries(complete.ledgerEventHashes)) assert.equal(fileHash(within(root, path)), hash, "Frozen ledger event changed");
  const verified = verifyStudyInternal(outputDir, protocol, root, "frozen"), { manifest } = verified;
  assert.equal(complete.studyId, manifest.studyId); assert.equal(complete.plannedJobs, manifest.jobs.length); assert.equal(complete.providerCalls, manifest.jobs.length);
  const expected = ["manifest.json", "plan-complete.json", manifest.runtime.packageLockPath, ...manifest.config.models.map(m => `preflight-${m}.json`),
    ...manifest.jobs.flatMap(j => [j.requestPath, `raw/${j.jobId}.json`, `parsed/${j.jobId}.json`]), ...names(join(outputDir, "batches")).map(n => `batches/${n}`), ...names(join(outputDir, "lifecycle")).map(n => `lifecycle/${n}`)].sort();
  assert.deepEqual(Object.keys(complete.artifactHashes).sort(), expected, "Incomplete frozen artifact set");
  assert.deepEqual(Object.keys(complete.ledgerEventHashes).sort(), manifest.jobs.flatMap(j => ["start", "settlement"].map(kind => portablePath(root, join(verified.budget.ledgerPath, `${manifest.studyId}--${j.jobId}-${kind}.json`)))).sort(), "Incomplete frozen ledger set");
  return verified;
}
export async function preflightStudy(options: { outputDir: string; model: Model; protocol: ProtocolAdapter; root?: string; fetchImpl?: typeof fetch; apiKey?: string }) {
  const { manifest } = verifyStudy(options.outputDir, options.protocol, options.root);
  assert(manifest.config.models.includes(options.model), "Model is outside frozen schedule");
  const path = join(options.outputDir, `preflight-${options.model}.json`); assert(!existsSync(path), "Preflight already frozen");
  const result = options.model === "nano" ? { ...await verifyNanoIdentity(manifest.config.nanoDigest, options.fetchImpl), runtime: await verifyNanoRuntime(options.fetchImpl) } : await verifyFableAccess(options.apiKey, options.fetchImpl);
  const receipt = { studyId: manifest.studyId, provider: options.model, ...result };
  writeExclusiveJSON(path, receipt); return receipt;
}
function verifyExistingRecords(outputDir: string, manifest: Manifest, budget: Budget) {
  const state = withDirectoryLock(budget.ledgerPath, () => ledgerState(budget));
  for (const job of manifest.jobs) {
    const key = `${manifest.studyId}--${job.jobId}`, started = state.starts.get(key), settlement = state.settlements.get(key);
    const rawPath = join(outputDir, "raw", `${job.jobId}.json`), parsedPath = join(outputDir, "parsed", `${job.jobId}.json`);
    if (!started) { assert(!existsSync(rawPath) && !existsSync(parsedPath), "Unstarted job has result artifacts"); continue; }
    assert.equal(started.requestSHA256, job.requestSHA256); assert.equal(started.manifestSHA256, fileHash(join(outputDir, "manifest.json")));
    // A concurrent other-model worker may be between start and settlement. Its caller checks only its own model below.
    if (settlement) {
      assert(existsSync(rawPath) && existsSync(parsedPath), "Settled job has missing artifacts");
      assert.equal(fileHash(parsedPath), settlement.parsedSHA256, "Parsed artifact changed");
      const parsed = readJSON(parsedPath) as ParsedRecord;
      assert.equal(parsed.jobId, job.jobId); assert.equal(parsed.requestSHA256, job.requestSHA256); assert.equal(parsed.rawSHA256, fileHash(rawPath));
      assert.equal(parsed.accountedUSD, settlement.accountedUSD); assert.equal(parsed.usageKnown, settlement.usageKnown);
    }
  }
  return state;
}

export async function generateStudy(options: { outputDir: string; model: Model; protocol: ProtocolAdapter; phase?: string; arm?: Arm; maxCalls?: number;
  root?: string; transport?: Transport; fetchImpl?: typeof fetch; apiKey?: string; now?: () => number; progress?: (value: unknown) => void }) {
  const { manifest, budget, manifestSHA256 } = verifyStudy(options.outputDir, options.protocol, options.root);
  const now = options.now ?? Date.now, maxCalls = options.maxCalls ?? 10, progress = options.progress ?? (() => {});
  assert(Number.isSafeInteger(maxCalls) && maxCalls > 0 && maxCalls <= 100, "Batch must contain 1–100 calls");
  assert(manifest.config.models.includes(options.model), "Model outside frozen schedule");
  if (options.phase) assert(manifest.config.phases.some(p => p.id === options.phase), "Unknown phase");
  if (options.arm) assert(manifest.config.arms.includes(options.arm), "Unknown arm");
  assert(!existsSync(join(options.outputDir, "generation-complete.json")), "Generation already frozen");
  const preflightPath = join(options.outputDir, `preflight-${options.model}.json`);
  const preflight = readJSON(preflightPath) as { studyId: string; provider: Model; digest?: string; model: string; runtime?: unknown };
  assert.equal(preflight.studyId, manifest.studyId); assert.equal(preflight.provider, options.model);
  if (options.model === "nano") assert.equal(preflight.digest?.replace(/^sha256:/, ""), manifest.config.nanoDigest.replace(/^sha256:/, ""));
  else assert.equal(preflight.model, "claude-fable-5-1");
  const lockPath = join(options.outputDir, `.${options.model}-generation-lock`);
  try { mkdirSync(lockPath, { mode: 0o700 }); } catch { throw new Error("This model already has a worker or an interrupted owner; inspect before recovery"); }
  const localLock = join(budget.ledgerPath, ".nano-execution-lock");
  let nanoLocked = false;
  const batchId = randomUUID(), completed: string[] = [];
  try {
    writeExclusiveJSON(join(lockPath, "owner.json"), { pid: process.pid, studyId: manifest.studyId, batchId });
    if (options.model === "nano") { mkdirSync(budget.ledgerPath, { recursive: true }); try { mkdirSync(localLock); nanoLocked = true; } catch { throw new Error("A local Nano worker already exists; no parallel inference permitted"); } }
    if (options.model === "nano") assert.deepEqual(await verifyNanoRuntime(options.fetchImpl), preflight.runtime, "Nano runtime changed after preflight");
    const initial = verifyExistingRecords(options.outputDir, manifest, budget);
    for (const job of manifest.jobs.filter(j => j.model === options.model)) {
      const key = `${manifest.studyId}--${job.jobId}`;
      assert(!initial.starts.has(key) || initial.settlements.has(key), "A previously started job is incomplete; no retry or further dispatch permitted");
    }
    const pending = manifest.jobs.filter(j => j.model === options.model && (!options.phase || j.phase === options.phase) && (!options.arm || j.arm === options.arm)
      && !initial.settlements.has(`${manifest.studyId}--${j.jobId}`)).slice(0, maxCalls);
    const transport = options.transport ?? createTransport({ apiKey: options.apiKey, fetchImpl: options.fetchImpl });
    for (const job of pending) {
      const timeoutMs = manifest.config.timeoutMs[job.model];
      assert(now() + timeoutMs < Date.parse(manifest.config.deadlineUTC), "Deadline leaves insufficient time for another call");
      if (job.model === "nano") await verifyNanoIdentity(manifest.config.nanoDigest, options.fetchImpl);
      const fresh = readBudget(within(options.root ?? ROOT, manifest.budget.path), options.root ?? ROOT); assert.equal(fresh.sha256, budget.sha256);
      const requestPath = join(options.outputDir, job.requestPath); assert.equal(fileHash(requestPath), job.requestSHA256);
      const request = readJSON(requestPath) as { body: RequestBody };
      const beganAt = new Date(now()).toISOString();
      assert(now() + timeoutMs < Date.parse(manifest.config.deadlineUTC), "Deadline reached during pre-dispatch checks");
      reserveAndStart(budget, { studyId: manifest.studyId, jobId: job.jobId, model: job.model, manifestSHA256, requestSHA256: job.requestSHA256, reservedUSD: job.reservedUSD, beganAt });
      const raw = await executeOneCall({ model: job.model, body: request.body, timeoutMs }, transport, `${manifest.studyId}-${job.jobId}`);
      const rawPath = join(options.outputDir, "raw", `${job.jobId}.json`), parsedPath = join(options.outputDir, "parsed", `${job.jobId}.json`);
      writeExclusiveJSON(rawPath, { jobId: job.jobId, beganAt, ...raw });
      let response: unknown = null, result: unknown = null, failure: string | null = null;
      try { if (raw.responseText !== null) response = JSON.parse(raw.responseText); } catch { /* Failed JSON is retained in raw, never repaired. */ }
      try { assert.equal(raw.status, 200); assert.equal(raw.error, null); result = options.protocol.parseResponse({ model: job.model, arm: job.arm, response }); assert(result != null); }
      catch { result = null; failure = "Provider, transport, or output-contract failure; no retry or fallback."; }
      const accounting = accountUsage(response, job.model, job.reservedUSD);
      const record: ParsedRecord = { jobId: job.jobId, caseId: job.caseId, model: job.model, arm: job.arm, phase: job.phase, replicate: job.replicate, seed: job.seed,
        result, failure, providerCalls: 1, requestSHA256: job.requestSHA256, rawSHA256: fileHash(rawPath), latencyMs: raw.latencyMs, ...accounting };
      writeExclusiveJSON(parsedPath, record);
      settle(budget, { studyId: manifest.studyId, jobId: job.jobId, settledAt: new Date(now()).toISOString(), accountedUSD: accounting.accountedUSD, estimatedUSD: accounting.estimatedUSD, usageKnown: accounting.usageKnown, parsedSHA256: fileHash(parsedPath) });
      completed.push(job.jobId); progress({ jobId: job.jobId, completed: completed.length, plannedInBatch: pending.length, valid: result !== null, latencyMs: raw.latencyMs });
      assert(accounting.usageKnown && accounting.accountedUSD <= job.reservedUSD + 1e-12, "Unknown or excessive accounting: batch stopped, reservation retained");
    }
    const receipt = { schema: "workflow-aware-batch/v1", studyId: manifest.studyId, batchId, model: options.model, phase: options.phase ?? null, arm: options.arm ?? null,
      completedAt: new Date(now()).toISOString(), completedJobs: completed, providerCalls: completed.length, manifestSHA256, preflightSHA256: fileHash(preflightPath) };
    writeExclusiveJSON(join(options.outputDir, "batches", `${batchId}.json`), receipt); return receipt;
  } finally {
    if (nanoLocked) rmdirSync(localLock);
    if (existsSync(join(lockPath, "owner.json"))) unlinkSync(join(lockPath, "owner.json")); rmdirSync(lockPath);
  }
}

export function finalizeStudy(options: { outputDir: string; protocol: ProtocolAdapter; root?: string }) {
  const { manifest, budget } = verifyStudy(options.outputDir, options.protocol, options.root);
  assert(!existsSync(join(options.outputDir, "generation-complete.json")), "Already frozen");
  for (const model of manifest.config.models) assert(!existsSync(join(options.outputDir, `.${model}-generation-lock`)), "A worker is still active");
  const state = verifyExistingRecords(options.outputDir, manifest, budget);
  assert(manifest.jobs.every(j => state.settlements.has(`${manifest.studyId}--${j.jobId}`)), "Not all planned jobs have settled");
  const records = manifest.jobs.map(j => readJSON(join(options.outputDir, "parsed", `${j.jobId}.json`)) as ParsedRecord);
  const lifecyclePaths = names(join(options.outputDir, "lifecycle")).map(n => `lifecycle/${n}`);
  if (manifest.config.models.includes("nano")) {
    const nanoHashes = Object.fromEntries(manifest.jobs.filter(j => j.model === "nano").map(j => [`parsed/${j.jobId}.json`, fileHash(join(options.outputDir, "parsed", `${j.jobId}.json`))]));
    assert(lifecyclePaths.some(p => {
      const receipt = readJSON(join(options.outputDir, p)) as { studyId?: string; done?: boolean; doneReason?: string; parsedArtifactHashes?: Record<string, string> };
      return receipt.studyId === manifest.studyId && receipt.done === true && receipt.doneReason === "unload" && JSON.stringify(receipt.parsedArtifactHashes) === JSON.stringify(nanoHashes);
    }), "Explicit Nano unload covering all completed Nano jobs is required before freeze");
  }
  const artifactPaths = ["manifest.json", "plan-complete.json", manifest.runtime.packageLockPath, ...manifest.config.models.map(m => `preflight-${m}.json`), ...manifest.jobs.flatMap(j => [j.requestPath, `raw/${j.jobId}.json`, `parsed/${j.jobId}.json`]), ...names(join(options.outputDir, "batches")).map(n => `batches/${n}`), ...lifecyclePaths];
  const ledgerEventHashes = Object.fromEntries(manifest.jobs.flatMap(j => ["start", "settlement"].map(kind => {
    const name = `${manifest.studyId}--${j.jobId}-${kind}.json`, path = join(budget.ledgerPath, name);
    return [portablePath(options.root ?? ROOT, path), fileHash(path)];
  })));
  const complete = { schema: "workflow-aware-generation-freeze/v1", studyId: manifest.studyId, completedAt: new Date().toISOString(),
    plannedJobs: manifest.jobs.length, providerCalls: records.length, validOutputs: records.filter(r => r.result !== null).length,
    failedJobs: records.filter(r => r.failure).map(r => r.jobId), accountedUSD: records.reduce((s, r) => s + r.accountedUSD, 0),
    usageKnown: records.every(r => r.usageKnown), ledgerEventHashes, artifactHashes: Object.fromEntries(artifactPaths.map(p => [p, fileHash(join(options.outputDir, p))])) };
  writeExclusiveJSON(join(options.outputDir, "generation-complete.json"), complete); return complete;
}
export async function unloadStudyNano(options: { outputDir: string; protocol: ProtocolAdapter; root?: string; fetchImpl?: typeof fetch }) {
  const { manifest, budget } = verifyStudy(options.outputDir, options.protocol, options.root);
  assert(manifest.config.models.includes("nano"), "Study contains no Nano jobs");
  assert(!existsSync(join(options.outputDir, ".nano-generation-lock")), "Cannot unload an active Nano worker");
  mkdirSync(budget.ledgerPath, { recursive: true });
  const lock = join(budget.ledgerPath, ".nano-execution-lock");
  try { mkdirSync(lock); } catch { throw new Error("Cannot unload while a Nano execution or lifecycle operation is active"); }
  try {
    const state = verifyExistingRecords(options.outputDir, manifest, budget);
    const nanoJobs = manifest.jobs.filter(j => j.model === "nano" && state.settlements.has(`${manifest.studyId}--${j.jobId}`));
    const receipt = { studyId: manifest.studyId, ...await unloadNano(options.fetchImpl),
      parsedArtifactHashes: Object.fromEntries(nanoJobs.map(j => [`parsed/${j.jobId}.json`, fileHash(join(options.outputDir, "parsed", `${j.jobId}.json`))])) };
    writeExclusiveJSON(join(options.outputDir, "lifecycle", `nano-unload-${randomUUID()}.json`), receipt); return receipt;
  } finally { rmdirSync(lock); }
}
