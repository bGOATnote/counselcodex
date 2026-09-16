import { randomBytes } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseEnv } from "node:util";
import { Mastra } from "@mastra/core/mastra";
import { RequestContext } from "@mastra/core/request-context";
import { noopLogger } from "@mastra/core/logger";
import { SpanType } from "@mastra/core/observability";
import { MastraCompositeStore } from "@mastra/core/storage";
import { LibSQLStore } from "@mastra/libsql";
import { Observability, MastraStorageExporter } from "@mastra/observability";
import { createClinicalGraph, createGraphAgents, graphPromptHash, graphVersion, type GraphGenerate, type GraphSearch } from "./clinical-graph.ts";
import { DEFAULT_CANDIDATE_MODE, type GraphMode } from "./gates-release.ts";
import { resolveGraphConfig, type GraphConfig } from "./graph-config.ts";
import { CLINICAL_POLICY_VERSION } from "./clinical-policy.ts";
import { responseEventSchema } from "./progressive.ts";
import { persistTraceWithinDeadline } from "./transport.ts";
import type { AgentExecution, Assessment, DispositionRun, ResponseEvent } from "./contract.ts";
import { ClinicalRagStore, openAiEmbed } from "../evidence/rag/store.ts";
import { sha256 } from "../evidence/rag/model.ts";
import { openVerifiedClinicalIndex } from "../evidence/rag/index-identity.ts";

export const GRAPH_TRACE_POLICY = { version: "clinical-traces/v2", excludeSpanTypes: [SpanType.MODEL_CHUNK] };

export function graphRepositoryRoot() {
  let path = process.cwd();
  for (let i = 0; i < 6; i++, path = dirname(path)) {
    const file = join(path, "package.json");
    if (existsSync(file) && JSON.parse(readFileSync(file, "utf8")).name === "counselcodex") return path;
  }
  throw new Error("REPOSITORY_ROOT_NOT_FOUND");
}
export function createGraphRuntime(directory: string, search: GraphSearch, generate?: GraphGenerate, mode: GraphMode = "hybrid", config: GraphConfig = resolveGraphConfig()) {
  const promptHash = graphPromptHash(config, mode), version = graphVersion(mode);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const local = new LibSQLStore({ id: "clinical-graph-storage", url: `file:${join(directory, "traces.db")}` });
  const storage = new MastraCompositeStore({ id: "clinical-graph-composite", default: local, domains: { workflows: false } });
  const observability = new Observability({ configs: { default: { serviceName: "clinical-evidence-graph", exporters: [new MastraStorageExporter({ customSpanFormatter: span => ({ ...span, input: undefined, output: undefined, errorInfo: span.errorInfo ? { message: "REDACTED_EXECUTION_ERROR" } : undefined }) })], excludeSpanTypes: GRAPH_TRACE_POLICY.excludeSpanTypes, includeInternalSpans: false, logging: { enabled: false } } } });
  const agents = createGraphAgents(config);
  const mastra = new Mastra({ agents, workflows: { clinicalGraph: createClinicalGraph({ agents, search, generate, mode, config }) }, storage, observability, logger: noopLogger });
  async function assess(message: string, emit?: (event: ResponseEvent) => void, signal?: AbortSignal): Promise<DispositionRun> {
    const began = performance.now(), traceId = randomBytes(16).toString("hex"), run = await mastra.getWorkflow("clinicalGraph").createRun();
    const events: ResponseEvent[] = [], executions: AgentExecution[] = [], context = new RequestContext();
    context.set("issuedEvents", () => [...events]);
    if (signal) context.set("abortSignal", signal);
    let eventFd: number | undefined, eventLogPersisted = true;
    try { mkdirSync(join(directory, "events"), { recursive: true, mode: 0o700 }); eventFd = openSync(join(directory, "events", `${run.runId}.jsonl`), "wx", 0o600); }
    catch { eventLogPersisted = false; }
    const record = (value: unknown) => { try { if (eventFd === undefined) throw new Error("LOG_UNAVAILABLE"); writeFileSync(eventFd, JSON.stringify(value) + "\n"); fsyncSync(eventFd); } catch { eventLogPersisted = false; } };
    record({ type: "started", message, inputHash: sha256(message), runId: run.runId, version, clinicalPolicyVersion: CLINICAL_POLICY_VERSION, mode, config, promptHash, tracePolicy: GRAPH_TRACE_POLICY });
    context.set("factGraphAudit", (report: unknown) => record({ type: "fact_graph_shadow", report }));
    context.set("contextAdmission", (admission: unknown) => record({ type: "context_admission", admission }));
    context.set("evidencePacketFrozen", (packet: unknown) => record({ type: "evidence_packet_frozen", packet }));
    context.set("agentExecution", (execution: AgentExecution) => { executions.push(execution); record({ type: "agent_execution", execution }); });
    context.set("responseEvent", (event: ResponseEvent) => {
      // One per-run admission point also handles parallel-step context copies:
      // a late question cannot distract from an already-issued emergency action.
      if (event.kind === "intake_question" && events.some(e => e.kind === "action" && e.notice.disposition === "EMERGENCY_NOW")) { record({ type: "suppressed_after_emergency", event }); return; }
      const item: ResponseEvent = responseEventSchema.parse({ ...event, ...(event.kind === "intake_question" ? { runId: run.runId } : {}), sequence: events.length + 1, elapsedMs: Math.round(performance.now() - began) });
      events.push(item); record({ type: "response_event", event: item });
      try { emit?.(item); } catch { /* consumer loss never erases the durable event */ }
    });
    let assessment: Assessment, steps: DispositionRun["steps"] = [];
    try {
      const execution = await run.start({ inputData: { message }, requestContext: context, tracingOptions: { traceId, hideInput: true, hideOutput: true, tags: [version, "synthetic-candidate"] } });
      record({ type: "workflow_finished", status: execution.status });
      if (execution.status !== "success") throw new Error("WORKFLOW_FAILED");
      assessment = execution.result;
      steps = Object.entries(execution.steps).filter(([id]) => id !== "input").map(([id, step]) => ({ id, status: step.status, durationMs: "startedAt" in step && "endedAt" in step && typeof step.startedAt === "number" && typeof step.endedAt === "number" ? step.endedAt - step.startedAt : null }));
    } catch {
      const early = events.filter(e => e.kind === "action").at(-1);
      assessment = { status: "review_required", answer: null, origin: "none", failure: signal?.aborted ? "RUN_CANCELLED" : "GRAPH_EXECUTION_FAILED", safetyFloor: early?.notice ?? null, modelCalls: executions.reduce((n, a) => n + a.modelCalls, 0), agents: executions, usage: { inputTokens: null, outputTokens: null }, guidance: [], checks: [{ id: "workflow_execution", status: "fail", detail: "Workflow interrupted. Provider usage may be unknown; earlier saved actions remain applicable." }] };
      record({ type: "workflow_failed", failure: assessment.failure });
    } finally { if (eventFd !== undefined) closeSync(eventFd); }
    const workflowDurationMs = Math.round(performance.now() - began);
    const persistence = await persistTraceWithinDeadline({ flush: () => observability.flush(), verify: async () => Boolean(await (await mastra.getStorage()?.getStore("observability"))?.getTrace({ traceId })) });
    const result: DispositionRun = { ...assessment, version: "disposition-agent/v3", workflowId: "clinical-evidence-graph", profile: "evidence-graph-opus", spendPolicy: "manual-gui-v1", runId: run.runId, traceId, tracePersisted: persistence.persisted, artifactPersisted: false, eventLogPersisted, message, inputHash: sha256(message), answerHash: assessment.answer ? sha256(JSON.stringify(assessment.answer)) : null, promptHash, guidanceHash: sha256(JSON.stringify(assessment.graph?.retrieval.map(r => r.corpusHash) ?? [])), model: config.models.disposition, completedAt: new Date().toISOString(), durationMs: Math.round(performance.now() - began), workflowDurationMs, tracePersistenceDurationMs: persistence.durationMs, steps, responseEvents: events, safetyNotices: events.filter(e => e.kind === "action").map(e => e.notice), firstActionMs: events.find(e => e.kind === "action")?.elapsedMs ?? null, firstPatientReplyMs: events.find(e => e.kind === "patient_reply")?.elapsedMs ?? null, firstQuestionMs: events.find(e => e.kind === "intake_question")?.elapsedMs ?? null };
    try {
      mkdirSync(join(directory, "runs"), { recursive: true, mode: 0o700 });
      const fd = openSync(join(directory, "runs", `${run.runId}.json`), "wx", 0o600);
      try { writeFileSync(fd, JSON.stringify({ ...result, artifactPersisted: true }, null, 2)); fsyncSync(fd); result.artifactPersisted = true; } finally { closeSync(fd); }
    } catch { /* caller can download the complete run if storage failed */ }
    return result;
  }
  return { assess, mastra, close: () => mastra.shutdown() };
}

// One PostgreSQL owner per process. The candidate has its own artifacts/index;
// it never reads the physician review store, dataset dispositions or incumbent answers.
const globalGraph = globalThis as typeof globalThis & { counselClinicalGraph?: Promise<ReturnType<typeof createGraphRuntime>> };
export function getClinicalGraphRuntime() {
  return globalGraph.counselClinicalGraph ??= (async () => {
    const root = graphRepositoryRoot(), envPath = join(root, ".env");
    const env = existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : {};
    for (const key of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]) if (!process.env[key] && env[key]) process.env[key] = env[key];
    if (!process.env.ANTHROPIC_API_KEY || !process.env.OPENAI_API_KEY) throw new Error("CANDIDATE_KEYS_REQUIRED");
    const path = process.env.COUNSEL_RAG_DIRECTORY ?? join(root, "apps/evaluation/.local/clinical-rag-v8");
    if (!existsSync(join(path, "corpus.json"))) throw new Error("BUILD_CLINICAL_RAG_FIRST");
    const config = resolveGraphConfig({ ...env, ...process.env });
    const { store } = await openVerifiedClinicalIndex(JSON.parse(readFileSync(join(path, "corpus.json"), "utf8")), () => ClinicalRagStore.open(join(path, "postgres")));
    try {
      const embed = openAiEmbed(process.env.OPENAI_API_KEY);
      return createGraphRuntime(join(root, "apps/evaluation/.local/clinical-evidence-graph-v1"), (query, signal) => store.search(query, { mode: "hybrid", signal, embed, limit: 5 }), undefined, DEFAULT_CANDIDATE_MODE, config);
    } catch (error) {
      try { await store.close(); } catch { /* preserve initialization diagnostic */ }
      throw error;
    }
  })().catch(error => { globalGraph.counselClinicalGraph = undefined; throw error; });
}
