import { createHash, randomBytes } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseEnv } from "node:util";
import { Mastra } from "@mastra/core/mastra";
import { Agent } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import { noopLogger } from "@mastra/core/logger";
import { MastraCompositeStore } from "@mastra/core/storage";
import { LibSQLStore } from "@mastra/libsql";
import { Observability, MastraStorageExporter } from "@mastra/observability";
import { guidanceCorpus } from "./guidance.ts";
import { libraryHash } from "../evidence/library.ts";
import { RETRIEVAL_VERSION, retrieveEvidence, queryTopics } from "../evidence/retrieval.ts";
import { reserveInteractiveRun, reserveLatencyRun, reserveCompactRun, reserveNasalRun, reserveNasalVerificationRun } from "./opus-budget.ts";
import { reserveClinicalStudyRun } from "../evaluation/clinical-study-budget.ts";
import { createCompactAgent, createCompactWorkflow, createIntakeAgent, COMPACT_INSTRUCTIONS, COMPACT_GENERATION } from "./compact-workflow.ts";
import { INTAKE_INSTRUCTIONS, intakeQuestions, intakeEmergency, intakeEvent, eligibleQuestions, nasalSymptoms, safetyIntakeSchema } from "./intake.ts";
import { createAdaptiveAgent, createPlanAgent, createAdaptiveWorkflow, validEmergencyEnvelope, validPlan, supportChecks, planSchema, planTransportSchema, adaptiveOutputSchema, adaptiveTransportSchema, referencedAnswerTransportSchema, ADAPTIVE_INSTRUCTIONS, PLAN_INSTRUCTIONS, REFERENCED_PLAN_INSTRUCTIONS, ADAPTIVE_VERSION, ADAPTIVE_GENERATION } from "./adaptive.ts";
import { patientFragments, sourceFragments, referencedPlanTransport, resolveReferencedPlan, resolveReferencedAnswer } from "./plan-references.ts";
import { assembleCareAction, exactSourceSubstring } from "./answer-assembly.ts";
import { createEvidenceSearch, loadPassageCorpus, SEARCH_VERSION, type EvidenceSearch } from "../evidence/search.ts";
import { createDispositionAgent, createHistoryAgent, createEmergencyAgent, createDispositionWorkflow, initialSafetyNotice, validHistory, INSTRUCTIONS, HISTORY_INSTRUCTIONS, FAST_HISTORY_INSTRUCTIONS, EMERGENCY_INSTRUCTIONS, MODEL, FAST_MODEL, type Generator } from "./workflow.ts";
import { answerSchema, checkAnswer, hasImmediateEmsDirective, type Assessment, type DispositionRun, type ResponseEvent, type SafetyNotice, type WorkflowProfile } from "./contract.ts";
import { createClosedReplyParser, createProgressiveGate, higherRoute, openingFromQuote, patientReplyFailures, SAME_DAY_DIRECTIVE, responseEventSchema } from "./progressive.ts";
import { abortable, consumeStructuredStream, persistTraceWithinDeadline } from "./transport.ts";
import { resolveClarificationContext, hasUnconditionalEmsNotice, type ClarificationReference, type TrustedClarification } from "./conversation.ts";
import { compactAnswerTransport, COMPACT_WIRE_INSTRUCTIONS, expandCompactAnswer } from "./adaptive.ts";
import { RECOVERY_POLICY, recoverGeneration } from "./recovery.ts";
import { EXECUTION_POLICY, requestDeadline } from "./execution-policy.ts";
import { RECONCILIATION_POLICY, RECONCILIATION_INSTRUCTIONS, reconciliationJudgmentSchema } from "./reconciliation.ts";
import { INITIAL_SCREEN_VERSION } from "./initial-screen.mjs";

export const hash = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
export function repositoryRoot() {
  let directory = process.cwd();
  for (let depth = 0; depth < 6; depth++) {
    const path = join(directory, "package.json");
    if (existsSync(path) && JSON.parse(readFileSync(path, "utf8")).name === "counselcodex") return directory;
    directory = dirname(directory);
  }
  throw new Error("REPOSITORY_ROOT_NOT_FOUND");
}
function defaultDirectory() { return join(repositoryRoot(), "apps/evaluation/.local/disposition-agent-v3"); }
type RuntimeOptions = { profile?: WorkflowProfile; search?: EvidenceSearch; budgetDirectory?: string; budget?: "manual-gui" | "interactive" | "latency" | "compact" | "nasal" | "nasal-verify" | "clinical-study" };
export function interactiveProfile(): WorkflowProfile { return process.env.COUNSEL_DISPOSITION_PROFILE === "progressive-opus" ? "progressive-opus" : process.env.COUNSEL_DISPOSITION_PROFILE === "conversational-opus" ? "conversational-opus" : "adaptive-opus"; }

export function createDispositionConfiguration(directory = defaultDirectory(), generate?: Generator, options: RuntimeOptions = {}) {
  // Explicitly authorized, user-requested GUI assessments are not an automated
  // experiment allocation. Incumbent only: one intake, at most two final
  // attempts under the versioned recovery policy, plus at most one conditional
  // reconciliation. No model sweep or retry loop; every call/usage is recorded.
  if (options.budget === "manual-gui" && options.profile !== "adaptive-opus") throw new Error("MANUAL_GUI_PROFILE_INVALID");
  if (options.budget === "clinical-study" && (!options.budgetDirectory || !["base-opus","adaptive-opus"].includes(options.profile ?? "") || MODEL !== "anthropic/claude-opus-5" || FAST_MODEL !== "anthropic/claude-haiku-4-5")) throw new Error("CLINICAL_STUDY_CONFIGURATION_INVALID");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const localStore = new LibSQLStore({ id: "disposition-agent-storage", url: `file:${join(directory, "traces.db")}` });
  const storage = new MastraCompositeStore({ id: "disposition-agent-composite", default: localStore, domains: { workflows: false } });
  const observability = new Observability({
    sensitiveDataFilter: { sensitiveFields: ["message", "patientMessage", "content", "prompt", "reason", "quote", "text", "guidance", "summary", "differential", "questions", "vitalSigns", "claim", "evidenceLimitations", "apikey", "authorization", "token", "key", "secret"], redactionStyle: "full" },
    configs: { default: { serviceName: "counsel-disposition-agent", exporters: [new MastraStorageExporter({ customSpanFormatter: (span) => ({ ...span, input: undefined, output: undefined, errorInfo: span.errorInfo ? { message: "REDACTED_EXECUTION_ERROR" } : undefined }) })], includeInternalSpans: false, logging: { enabled: false } } },
  });
  const compact = options.profile === "compact-opus" || options.profile === "conversational-opus";
  const adaptive = options.profile?.startsWith("adaptive-") || options.profile === "base-opus";
  const dispositionAgent = adaptive ? createAdaptiveAgent() : compact ? createCompactAgent() : createDispositionAgent();
  const intakeAgent = adaptive ? createPlanAgent() : createIntakeAgent();
  const reconciliationAgent = new Agent({ id: "care-reconciliation", name: "Care disagreement reconciliation", model: MODEL, instructions: RECONCILIATION_INSTRUCTIONS, maxRetries: 0 });
  const historyAgent = createHistoryAgent(options.profile === "haiku-opus" ? FAST_MODEL : MODEL);
  const emergencyAgent = createEmergencyAgent();
  // Manual runs retain the graph's call/token/time bounds, bounded recovery,
  // and per-run events/usage. They do not consume or reset old lifetime slots.
  // This is not a dollar ceiling or a reading of the provider account balance.
  const reserve = () => options.budget === "manual-gui" ? undefined : options.budget === "clinical-study" ? reserveClinicalStudyRun(options.budgetDirectory!) : options.budget === "nasal-verify" ? reserveNasalVerificationRun(options.budgetDirectory ?? join(directory, "nasal-verification-budget-v1")) : options.budget === "nasal" ? reserveNasalRun(options.budgetDirectory ?? join(directory, "nasal-budget-v1")) : options.budget === "compact" ? reserveCompactRun(options.budgetDirectory ?? join(directory, "compact-budget-v1")) : options.budget === "latency" ? reserveLatencyRun(options.budgetDirectory ?? join(directory, "budget")) : reserveInteractiveRun(options.budgetDirectory ?? join(directory, "interactive-budget-v1"));
  const dispositionWorkflow = adaptive
    ? createAdaptiveWorkflow({ agent: dispositionAgent, planner: intakeAgent, reconciler: reconciliationAgent, reserve, generate, recovery: options.budget === "manual-gui", reconcile: options.budget === "manual-gui", search: options.search ?? createEvidenceSearch({ corpus: loadPassageCorpus(process.env.COUNSEL_PASSAGE_CORPUS), external: !generate }), mode: options.profile === "base-opus" ? "base" : options.profile === "adaptive-no-retrieval" ? "no-retrieval" : options.profile === "adaptive-critique" ? "critique" : "adaptive" })
    : compact
    ? createCompactWorkflow({ agent: dispositionAgent, intakeAgent, reserve, generate, conversational: options.profile === "conversational-opus" })
    : createDispositionWorkflow({ agent: dispositionAgent, historyAgent, emergencyAgent, reserve, generate, profile: options.profile });
  // Mastra provider/schema errors can include raw generated clinical payloads.
  // Suppress console logging; structured failure codes and redacted traces remain.
  const agents: Record<string, Agent> = adaptive ? { dispositionAgent, intakeAgent, reconciliationAgent } : compact ? { dispositionAgent, intakeAgent } : { dispositionAgent, historyAgent, emergencyAgent };
  return { agents, workflows: { dispositionWorkflow }, storage, observability, logger: noopLogger };
}

export function createDispositionRuntime(directory = defaultDirectory(), generate?: Generator, options: RuntimeOptions = {}) {
  const configuration = createDispositionConfiguration(directory, generate, options);
  const mastra = new Mastra(configuration);
  const { observability } = configuration;
  async function executeAssessment(message: string, onSafetyNotice?: (notice: SafetyNotice) => void, onResponseEvent?: (event: ResponseEvent) => void, signal?: AbortSignal, clarificationReference?: ClarificationReference): Promise<DispositionRun> {
    const started = performance.now();
    const spendPolicy = options.budget === "manual-gui" ? "manual-gui-v1" as const : "reserved-experiment" as const;
    // Resolve only server-recorded questions, before any inference reservation.
    // Quoted assistant questions must never be promoted into patient findings.
    let clarificationContext: TrustedClarification[] = [], contextFailure: string | null = null;
    try { clarificationContext = resolveClarificationContext(directory, message, clarificationReference); }
    catch { contextFailure = "CLARIFICATION_CONTEXT_INVALID"; }
    const traceId = randomBytes(16).toString("hex");
    const run = await mastra.getWorkflow("dispositionWorkflow").createRun();
    const safetyNotices: SafetyNotice[] = [];
    const responseEvents: ResponseEvent[] = [];
    const eventDirectory = join(directory, "events");
    let eventFd: number | undefined;
    let eventLogPersisted = true;
    try { mkdirSync(eventDirectory, { recursive: true, mode: 0o700 }); eventFd = openSync(join(eventDirectory, `${run.runId}.jsonl`), "wx", 0o600); }
    catch { eventLogPersisted = false; }
    const record = (entry: unknown) => {
      try { if (eventFd === undefined) throw new Error("EVENT_LOG_UNAVAILABLE"); writeFileSync(eventFd, JSON.stringify(entry) + "\n"); fsyncSync(eventFd); }
      catch { eventLogPersisted = false; }
    };
    record({ type: "start", runId: run.runId, message, inputHash: hash(message), profile: options.profile ?? "progressive-opus", spendPolicy, ...(clarificationReference ? { clarificationReference, clarificationContext, clarificationContextValid: !contextFailure } : {}) });
    const requestContext = new RequestContext();
    if (signal) requestContext.set("abortSignal", signal);
    if (clarificationContext.length) requestContext.set("clarificationContext", clarificationContext);
    requestContext.set("responseEvent", (event: ResponseEvent) => {
      const item: ResponseEvent = { ...responseEventSchema.parse(event), ...(event.kind === "intake_question" ? { runId: run.runId } : {}), elapsedMs: Math.round(performance.now() - started), sequence: responseEvents.length + 1 };
      responseEvents.push(item);
      // Save each visible event before emission, not only when the final succeeds.
      record({ type: "response_event", event: item });
      try { onResponseEvent?.(item); } catch { /* Preserve bounded work if a consumer disconnects. */ }
    });
    requestContext.set("safetyNotice", (notice: SafetyNotice) => {
      const item = { ...notice, elapsedMs: Math.round(performance.now() - started) };
      safetyNotices.push(item);
      try { onSafetyNotice?.(item); } catch { /* A disconnected client must not interrupt assessment or logging. */ }
    });
    let assessment: Assessment;
    let steps: DispositionRun["steps"] = [];
    try {
      if (contextFailure) {
        // A broken prior-question reference blocks inference, not emergency
        // instructions supported by the current patient-only message.
        const notice = initialSafetyNotice(message);
        if (notice && !signal?.aborted) {
          (requestContext.get("responseEvent") as (event: ResponseEvent) => void)({ kind: "action", notice });
          (requestContext.get("safetyNotice") as (notice: SafetyNotice) => void)(notice);
        }
        assessment = { status: notice ? "review_required" : "unavailable", answer: null, origin: "none", failure: contextFailure, modelCalls: 0, usage: { inputTokens: 0, outputTokens: 0 }, agents: [], guidance: [], safetyFloor: notice ? { disposition: notice.disposition, directive: notice.directive } : null, checks: [{ id: "clarification_context", status: "fail", detail: "The prior question reference could not be verified. No model was called and no clinical reassurance is inferred." }] };
        steps = [{ id: "clarification-context", status: "failed", durationMs: Math.round(performance.now() - started) }];
        record({ type: "workflow_not_started", reason: contextFailure });
      } else {
        const execution = await run.start({ inputData: { message }, requestContext, tracingOptions: { traceId, hideInput: true, hideOutput: true, tags: ["disposition-agent-v3", options.profile ?? "progressive-opus", "synthetic-only"] } });
        record({ type: "workflow_finished", status: execution.status });
        if (execution.status !== "success") throw new Error("DISPOSITION_WORKFLOW_FAILED");
        assessment = execution.result;
        steps = Object.entries(execution.steps).filter(([id]) => id !== "input").map(([id, step]) => ({ id, status: step.status, durationMs: "startedAt" in step && typeof step.startedAt === "number" && "endedAt" in step && typeof step.endedAt === "number" ? step.endedAt - step.startedAt : null }));
      }
    } catch (error) { record({ type: "workflow_failed" }); throw error; }
    finally { if (eventFd !== undefined) closeSync(eventFd); }
    const workflowDurationMs = Math.round(performance.now() - started);
    // Trace export is not clinical work. Report persistence as unconfirmed when
    // the deadline expires, even if the uncancelable exporter later finishes.
    const tracePersistence = await persistTraceWithinDeadline({
      flush: () => observability.flush(),
      verify: async () => { const store = await mastra.getStorage()?.getStore("observability"); return Boolean(await store?.getTrace({ traceId })); },
    });
    const result: DispositionRun = {
      ...assessment, safetyNotices, responseEvents, eventLogPersisted, spendPolicy, profile: options.profile ?? "progressive-opus", version: "disposition-agent/v3", workflowId: "counsel-disposition-agent", runId: run.runId,
      ...(assessment.adaptive ? { generation: { ...ADAPTIVE_GENERATION, execution: EXECUTION_POLICY, recovery: options.budget === "manual-gui" ? RECOVERY_POLICY : null } } : {}),
      ...(clarificationReference ? { clarificationReference, clarificationContext } : {}),
      firstActionMs: responseEvents.find((event) => event.kind === "action")?.elapsedMs ?? null,
      firstPatientReplyMs: responseEvents.find((event) => event.kind === "patient_reply")?.elapsedMs ?? null,
      firstOpeningMs: responseEvents.find((event) => event.kind === "opening")?.elapsedMs ?? null,
      firstQuestionMs: responseEvents.find((event) => event.kind === "intake_question")?.elapsedMs ?? null,
      traceId, tracePersisted: tracePersistence.persisted, artifactPersisted: false, message, inputHash: hash(message), answerHash: assessment.answer ? hash(assessment.answer) : null,
      promptHash: hash(options.profile?.startsWith("adaptive-") || options.profile === "base-opus" ? { reconciliation: { policy: RECONCILIATION_POLICY, instructions: RECONCILIATION_INSTRUCTIONS, schema: reconciliationJudgmentSchema.toJSONSchema() }, initialScreen: INITIAL_SCREEN_VERSION, ADAPTIVE_INSTRUCTIONS, PLAN_INSTRUCTIONS, REFERENCED_PLAN_INSTRUCTIONS, ADAPTIVE_VERSION, generation: ADAPTIVE_GENERATION, execution: EXECUTION_POLICY, compactWire: { instructions: COMPACT_WIRE_INSTRUCTIONS, schema: compactAnswerTransport.toJSONSchema(), expand: expandCompactAnswer.toString() }, recovery: options.budget === "manual-gui" ? RECOVERY_POLICY : null, intakeSchema: referencedPlanTransport.toJSONSchema(), answerSchema: referencedAnswerTransportSchema.toJSONSchema(), referenceCodec: [patientFragments, sourceFragments, resolveReferencedPlan, resolveReferencedAnswer].map((fn) => fn.toString()) } : options.profile === "compact-opus" || options.profile === "conversational-opus" ? { COMPACT_INSTRUCTIONS, INTAKE_INSTRUCTIONS, intakeQuestions, COMPACT_GENERATION } : { INSTRUCTIONS, HISTORY_INSTRUCTIONS: options.profile === "haiku-opus" ? FAST_HISTORY_INSTRUCTIONS : HISTORY_INSTRUCTIONS, EMERGENCY_INSTRUCTIONS }), guidanceHash: assessment.adaptive ? hash(assessment.adaptive.evidence) : libraryHash, model: MODEL,
      completedAt: new Date().toISOString(), durationMs: Math.round(performance.now() - started), workflowDurationMs, tracePersistenceDurationMs: tracePersistence.durationMs,
      steps,
    };
    // Synthetic-only, local and append-only. Never touches old reviews or source CSVs.
    try {
      const artifactDirectory = join(directory, "runs");
      mkdirSync(artifactDirectory, { recursive: true, mode: 0o700 });
      const fd = openSync(join(artifactDirectory, `${run.runId}.json`), "wx", 0o600);
      try { writeFileSync(fd, JSON.stringify({ ...result, artifactPersisted: true }, null, 2)); fsyncSync(fd); result.artifactPersisted = true; }
      finally { closeSync(fd); }
    } catch { /* browser download remains available when persistence fails */ }
    return result;
  }
  let active = 0;
  let retired = false;
  async function assess(message: string, onSafetyNotice?: (notice: SafetyNotice) => void, onResponseEvent?: (event: ResponseEvent) => void, signal?: AbortSignal, clarificationReference?: ClarificationReference) {
    active++;
    try { return await executeAssessment(message, onSafetyNotice, onResponseEvent, signal, clarificationReference); }
    finally { active--; if (retired && active === 0) await mastra.shutdown(); }
  }
  function retire() { retired = true; if (active === 0) void mastra.shutdown(); }
  return { mastra, observability, assess, retire };
}

const globalRuntime = globalThis as typeof globalThis & { counselDispositionRuntime?: { signature: string; runtime: ReturnType<typeof createDispositionRuntime> } };
export function getDispositionRuntime(purpose: "experiment" | "manual-gui" = "experiment") {
  // Root .env is the user's existing key entry point. Only the required server key
  // is loaded; no secrets are serialized into the page or model/trace artifacts.
  if (!process.env.ANTHROPIC_API_KEY) {
    const path = join(repositoryRoot(), ".env");
    if (existsSync(path)) process.env.ANTHROPIC_API_KEY = parseEnv(readFileSync(path, "utf8")).ANTHROPIC_API_KEY;
  }
  const signature = hash({ model: MODEL, instructions: [INSTRUCTIONS, HISTORY_INSTRUCTIONS, EMERGENCY_INSTRUCTIONS], guidance: guidanceCorpus, contract: answerSchema.toJSONSchema(), checks: [checkAnswer, hasImmediateEmsDirective, createProgressiveGate, createClosedReplyParser, patientReplyFailures, openingFromQuote, higherRoute, validHistory].map((fn) => fn.toString()), sameDay: SAME_DAY_DIRECTIVE, events: responseEventSchema.toJSONSchema(), workflow: createDispositionWorkflow.toString(), configuration: createDispositionConfiguration.toString() });
  // Local research/demo default only. Explicit opt-out keeps the archived
  // three-call path available; changing profiles never resets a spend ledger.
  const profile = purpose === "manual-gui" ? "adaptive-opus" : interactiveProfile();
  const runtimeSignature = hash({ reconciliation: [RECONCILIATION_POLICY, RECONCILIATION_INSTRUCTIONS, reconciliationJudgmentSchema.toJSONSchema()], initialScreen: INITIAL_SCREEN_VERSION, execution: [EXECUTION_POLICY, requestDeadline.toString()], compactWire: [COMPACT_WIRE_INSTRUCTIONS, compactAnswerTransport.toJSONSchema(), expandCompactAnswer.toString()], recovery: [RECOVERY_POLICY, recoverGeneration.toString()], signature, profile, runtime: createDispositionRuntime.toString(), transport: [abortable, consumeStructuredStream, persistTraceWithinDeadline].map((fn) => fn.toString()), conversation: [resolveClarificationContext, hasUnconditionalEmsNotice].map((fn) => fn.toString()), adaptiveChecks: [validEmergencyEnvelope, validPlan, supportChecks].map((fn) => fn.toString()), adaptiveSchemas: [planSchema, planTransportSchema, adaptiveOutputSchema, adaptiveTransportSchema, referencedAnswerTransportSchema].map((schema) => schema.toJSONSchema()), adaptive: [ADAPTIVE_VERSION, ADAPTIVE_INSTRUCTIONS, PLAN_INSTRUCTIONS, SEARCH_VERSION, createAdaptiveWorkflow.toString(), createEvidenceSearch.toString(), loadPassageCorpus(process.env.COUNSEL_PASSAGE_CORPUS)], libraryHash, RETRIEVAL_VERSION, retrieval: [retrieveEvidence, queryTopics].map((fn) => fn.toString()), compact: createCompactWorkflow.toString(), generation: COMPACT_GENERATION, prompts: [COMPACT_INSTRUCTIONS, INTAKE_INSTRUCTIONS], questions: intakeQuestions, nasalSymptoms: nasalSymptoms.source, intakeSchema: safetyIntakeSchema.toJSONSchema(), intakeChecks: [intakeEmergency, intakeEvent, eligibleQuestions].map((fn) => fn.toString()) });
  const cached = globalRuntime.counselDispositionRuntime;
  const purposeSignature = hash({ runtimeSignature, purpose, REFERENCED_PLAN_INSTRUCTIONS, ADAPTIVE_GENERATION, careChecks: [checkAnswer, initialSafetyNotice].map(fn => fn.toString()), referenceSchema: referencedPlanTransport.toJSONSchema(), referenceCodec: [patientFragments, sourceFragments, resolveReferencedPlan, resolveReferencedAnswer, assembleCareAction, exactSourceSubstring].map((fn) => fn.toString()) });
  if (cached?.signature === purposeSignature) return cached.runtime;
  // Hot reload must not retain old clinical logic or interrupt an in-flight run.
  cached?.runtime?.retire();
  const runtime = createDispositionRuntime(undefined, undefined, { profile, ...(purpose === "manual-gui" ? { budget: "manual-gui" as const } : {}) });
  globalRuntime.counselDispositionRuntime = { signature: purposeSignature, runtime };
  return runtime;
}
