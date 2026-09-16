import { Agent, type AgentExecutionOptionsBase } from "@mastra/core/agent";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { SpanType, type TracingContext } from "@mastra/core/observability";
import { z } from "zod";
import { selectGraphEvidence } from "../evidence/rag/selection.ts";
import { GATES_RELEASE_VERSION, GATES_RELEASE_POLICY, GATES_OUTPUT_INSTRUCTIONS, gatesAnswer, gatesDecisionSteps, resolveGatesSteps, type GatesAdmission, type GraphMode } from "./gates-release.ts";
import { draftSchema, wireDraftSchema } from "./graph-output.ts";
import { checkAnswerForFullReview as checkAnswer, handoffLanguageFindings, validAdaptiveQuestion, ONSET_PATTERN_ADMISSION_POLICY, type AgentExecution, type Assessment, type Check, type DispositionAnswer, type Guidance, type HandoffLanguageFinding, type ResponseEvent, type SafetyNotice } from "./contract.ts";
import { ROUTING_POLICY_VERSION, ACTION_TIMING_ADMISSION_POLICY, asyncAction, routingFieldsValid } from "./routing-policy.ts";
import { GRAPH_INSTRUCTIONS, GRAPH_REVIEW_PROTOCOL, graphJudgeInstructions, graphSafetyInstructions } from "./graph-prompts.ts";
import { CLINICAL_POLICY_VERSION } from "./clinical-policy.ts";
import { isEmsInstruction, CONTINUE_EMS_DIRECTIVE, PRESERVED_CARE_COPY, urgentCareDirective, reducesEmergencyTransport, type ReviewedEmergencyTransport } from "./care-setting.ts";
import { sourceWithQuoteSpans, resolveSourceQuoteReferences } from "./source-quote-refs.ts";
import { FactExtraction, FACT_EXTRACTION_INSTRUCTIONS, FACT_GRAPH_HASH, runFactGraphShadow, type FactGraphReport } from "./fact-graph.ts";
import { DEFAULT_GRAPH_MODELS, resolveGraphConfig, type GraphConfig } from "./graph-config.ts";
import { consumeStructuredStream, abortable, safetyEnvelopeTransport } from "./transport.ts";
import { requestDeadline, EXECUTION_POLICY } from "./execution-policy.ts";
import { sha256, type Retrieval, type Hit } from "../evidence/rag/model.ts";
import { RECONCILIATION_POLICY, type CareReconciliation } from "./reconciliation.ts";
import { exactStructuredJudgeAnchor } from "./judge-anchors.ts";
import { createRepairContract, nominateRepairFields, repairFieldSchema, REPAIR_INSTRUCTIONS, REPAIR_PROTOCOL, REPAIR_SCOPE_POLICY, type RepairAudit } from "./graph-repair.ts";
import { careAlternativeReviewSchema, reconcileCareAlternative, CARE_ALTERNATIVE_POLICY, type BoundCareAlternative } from "./care-alternative.ts";
import { JUDGE_SOURCE_REPAIR_POLICY, planJudgeSourceAnchorRepair, buildJudgeSourceAnchorRepairAuditSteps } from "./judge-source-anchor-repair.ts";
import { modelReviewDetail } from "./model-review-provenance.ts";

export const GRAPH_VERSION: string = "evidence-graph/v24";
export const GRAPH_MODELS = DEFAULT_GRAPH_MODELS;
export const GRAPH_OUTPUT_LIMITS = Object.freeze({ context: 1000, shadowContext: 2400, safety: 1000, disposition: 2400, judge: 6144, truncatedJudgeRecovery: 9216 });
/** One source for the actual request settings and experiment identity. A new
 * vendor override receives no guessed vendor-specific reasoning parameters. */
export function graphRequestSettings(role: keyof typeof GRAPH_MODELS, config: GraphConfig, truncatedJudgeRecovery = false): { maxSteps: number; modelSettings: { maxOutputTokens: number; maxRetries: number }; providerOptions?: AgentExecutionOptionsBase<unknown>["providerOptions"] } {
  return { maxSteps: 1, providerOptions: undefined, modelSettings: {
    maxOutputTokens: role === "judge" && truncatedJudgeRecovery ? GRAPH_OUTPUT_LIMITS.truncatedJudgeRecovery : role === "context" && config.factGraphMode === "shadow" ? GRAPH_OUTPUT_LIMITS.shadowContext : GRAPH_OUTPUT_LIMITS[role], maxRetries: 0,
  }, ...(role === "disposition" && config.models[role] === DEFAULT_GRAPH_MODELS.disposition
    ? { providerOptions: { anthropic: { thinking: { type: "adaptive" as const }, effort: "low" as const } } }
    : role === "judge" && config.models[role] === DEFAULT_GRAPH_MODELS.judge
      ? { providerOptions: { openai: { reasoningEffort: "low" as const } } } : {}) };
}
export function retryTruncatedJudge(execution: AgentExecution, aborted: boolean): boolean {
  return !aborted && execution.failure === "INCOMPLETE_MODEL_STREAM" && execution.failureDetails?.finishReason === "length";
}
export const contextSchema = z.object({ queries: z.array(z.string().min(3).max(160)).min(1).max(3),
  findings: z.array(z.object({ finding: z.string(), status: z.enum(["reported", "denied", "unknown"]), quote: z.string() }).strict()).max(6),
  question: z.object({ text: z.string().min(10).max(300), why: z.string().min(10).max(300), quote: z.string().min(3).max(160) }).strict().nullable(),
}).strict();
export const shadowContextSchema = contextSchema.extend({ factObservations: FactExtraction });
const retrievalHintsSchema = z.array(z.string().min(3).max(160).refine(q => q.trim().length >= 3 && !/[\x00-\x1f\x7f]/.test(q))).min(1).max(3);
export type ContextAdmission = { clinicalContextAccepted: boolean; querySource: "accepted_context" | "isolated_query_hints" | "unavailable"; queries: string[]; clinicalValidation: false };
export function admitGraphContext(value: unknown, message: string): { context: z.infer<typeof contextSchema> | null; admission: ContextAdmission } {
  const parsed = contextSchema.safeParse(value);
  const valid = parsed.success && parsed.data.findings.every(f => f.status === "unknown" ? f.quote === "" : f.quote.length >= 3 && message.includes(f.quote));
  const hints = retrievalHintsSchema.safeParse(value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>).queries : undefined);
  // Query hints are untrusted search inputs, NEVER patient facts or instructions.
  // A rejected finding/question cannot discard independently bounded hints, nor
  // can those hints rescue the rejected clinical context. No raw-text truncation.
  return { context: valid ? parsed.data : null, admission: { clinicalContextAccepted: Boolean(valid), querySource: hints.success ? valid ? "accepted_context" : "isolated_query_hints" : "unavailable", queries: hints.success ? [...new Set(hints.data)] : [], clinicalValidation: false } };
}
export const safetySchema = z.object({ action: z.enum(["NONE", "PRIORITY_ASYNC", "STANDARD_ASYNC", "SAME_DAY_IN_PERSON", "ED_NOW", "EMS_NOW", "CONTINUE_EMS"]),
  basis: z.array(z.object({ quote: z.string().min(3).max(1000), interpretation: z.string().min(8).max(1500), currentPatient: z.boolean(), present: z.boolean() }).strict()).max(12),
  actionBasis: z.object({ indices: z.array(z.number().int().min(0).max(11)).min(1).max(12), sufficient: z.boolean() }).strict().nullable().default(null),
  reason: z.string().min(8).max(1500), patientMessage: z.string().max(1500),
  physicalRequirement: z.string().min(10).max(400).nullable().default(null),
  activeEms: z.object({ quote: z.string().min(3).max(600), currentPatient: z.boolean(), currentEpisode: z.boolean(), active: z.boolean() }).strict().nullable().default(null),
}).strict();
/** Same clinical decisions and attribution checks; no unused patient prose. */
export const compactSafetyWireSchema = safetySchema.omit({patientMessage:true}).extend({
  basis: z.array(safetySchema.shape.basis.element.extend({interpretation:z.string().min(8).max(120)})).max(3),
  actionBasis:z.object({indices:z.array(z.number().int().min(0).max(2)).min(1).max(3),sufficient:z.boolean()}).strict().nullable(),
  reason: z.string().min(8).max(180),
  physicalRequirement: z.string().min(10).max(180).nullable(),
}).strict();
export function normalizeSafetyWire(value:unknown, compact:boolean) {
  if(!compact)return safetySchema.parse(value);
  // Compact limits guide generation; excess verbosity alone cannot erase a
  // grounded emergency. Preserve the full text and record conformance below.
  const parsed=safetySchema.omit({patientMessage:true}).parse(value);
  if(["ED_NOW","EMS_NOW","CONTINUE_EMS","SAME_DAY_IN_PERSON"].includes(parsed.action)&&!parsed.actionBasis)throw new Error("COMPACT_ACTION_BASIS_REQUIRED");
  return { ...parsed, patientMessage:"" };
}
export { draftSchema, wireDraftSchema } from "./graph-output.ts";
export const graphRepair = createRepairContract(draftSchema, wireDraftSchema);
const criteria = ["undertriage", "overtriage", "patient_grounding", "claim_support", "safety_net", "clarification_delay", "ownership"] as const;
export const graphJudgeSchema = z.object({
  reviewScope: z.literal("draft-and-issued-question/v2"),
  verdict: z.enum(["accept", "revise", "human_review"]),
  criteria: z.array(z.object({ id: z.enum(criteria), verdict: z.enum(["pass", "fail", "abstain"]), reason: z.string().min(10).max(350), anchors: z.array(z.object({ unit: z.string(), quote: z.string().min(3).max(300) }).strict()).min(1).max(3) }).strict()).length(criteria.length),
  earlyAction: z.enum(["none", "supported", "unsupported", "unresolved"]),
  earlyCorrection: z.object({ reason: z.string().min(20).max(600), patientQuotes: z.array(z.string().min(3).max(300)).min(1).max(3), triggerMisattributedOrCorrected: z.boolean() }).strict().nullable(),
  alternativeReconciliation: careAlternativeReviewSchema.nullable().optional(),
  transportReview: z.object({ mode: z.enum(["activate_ems", "continue_ems", "ed_now"]), verdict: z.enum(["supported", "unsupported", "unresolved"]), draftQuote: z.string().min(3).max(600), activation: z.object({ quote: z.string().min(3).max(600), currentPatient: z.boolean(), currentEpisode: z.boolean(), active: z.boolean() }).strict().nullable() }).strict().nullable().optional(),
  ownershipTaskReview: z.array(z.object({ clause: z.string().min(3).max(300), classification: z.enum(["recommended_task", "unconfirmed_commitment", "unresolved"]), recommendationQuote: z.string().min(3).max(300).nullable(), availabilityQuote: z.string().min(3).max(300).nullable() }).strict()).max(3).optional(),
  correction: z.string().max(800),
  repairTargets: z.array(repairFieldSchema).max(9).optional(),
  evidenceQueries: z.array(z.string().min(3).max(120)).max(2).default([]),
}).strict();
export type GraphJudge = z.infer<typeof graphJudgeSchema>;
export type ReviewedCareSnapshot = Readonly<{ patientHash: string; draftHash: string; judgeHash: string; reviewInputBinding?: AgentExecution["reviewInputBinding"]; disposition: "EMERGENCY_NOW" | "SAME_DAY_IN_PERSON"; directive: string; emergencyTransport?: ReviewedEmergencyTransport }>;
export type ReviewedCareCorrectionSnapshot = ReviewedCareSnapshot | Readonly<Omit<ReviewedCareSnapshot, "disposition"> & { disposition: "ASYNC_PHYSICIAN"; reviewPriority: "priority" | "routine"; workType: "medication_request" | "clinical_review" }>;
export function reviewedCareSnapshot(draft: z.infer<typeof draftSchema> | null, judge: GraphJudge | null, reviewedDraftHash: string | null, patient: string, checks: Check[], execution?: AgentExecution): ReviewedCareSnapshot | null {
  if (!draft || !judge || reviewedDraftHash !== sha256(JSON.stringify(draft)) || !routingFieldsValid(draft)) return null;
  if (execution && (execution.failure || execution.reviewInputBinding?.patientHash !== sha256(patient)
    || execution.reviewInputBinding.draftHash !== reviewedDraftHash || sha256(JSON.stringify(execution.output)) !== sha256(JSON.stringify(judge)))) return null;
  const transport = assessEmergencyTransport(draft, patient, judge);
  if (transport.status === "rejected" || !["EMERGENCY_NOW", "SAME_DAY_IN_PERSON"].includes(draft.disposition)
    || !criteria.filter(id => id !== "claim_support").every(id => judge.criteria.find(c => c.id === id)?.verdict === "pass")
    || !draft.redFlags.some(f => f.status === "reported" && f.quote.length > 2 && patient.includes(f.quote))
    || !["quoted_patient_evidence", "action_timing_present", "no_blanket_clearance"].every(id => checks.find(c => c.id === id)?.status === "pass")) return null;
  const directive = graphCareDirective(draft, transport.binding);
  return Object.freeze({ patientHash: sha256(patient), ...(execution?.reviewInputBinding ? { reviewInputBinding: execution.reviewInputBinding } : {}), draftHash: reviewedDraftHash, judgeHash: sha256(JSON.stringify(judge)), disposition: draft.disposition as ReviewedCareSnapshot["disposition"], directive, ...(transport.binding ? { emergencyTransport: Object.freeze({ ...transport.binding, directive }) } : {}) });
}
/** Preserve the stronger already-supported action, not the first one to finish.
 * This compares care contracts, never symptoms. Reductions require the separate
 * explicit correction path; an explanation failure cannot authorize one.
 */
export function selectSupportedCare(early: SafetyNotice | null, reviewed: ReviewedCareSnapshot | null) {
  if (!early) return { care: reviewed, reviewedUsed: Boolean(reviewed) };
  if (!reviewed) return { care: early, reviewedUsed: false };
  const strongerSetting = early.disposition === "SAME_DAY_IN_PERSON" && reviewed.disposition === "EMERGENCY_NOW";
  const strongerTransport = early.disposition === "EMERGENCY_NOW" && reviewed.disposition === "EMERGENCY_NOW"
    && reviewed.emergencyTransport?.mode === "activate_ems" && !isEmsInstruction(early.directive);
  // A bound active response is a continuation, not a lower transport urgency.
  const activeResponse = early.disposition === "EMERGENCY_NOW" && reviewed.disposition === "EMERGENCY_NOW" && reviewed.emergencyTransport?.mode === "continue_ems";
  return strongerSetting || strongerTransport || activeResponse ? { care: reviewed, reviewedUsed: true } : { care: early, reviewedUsed: false };
}
export type GraphCareAlternative = { proof: BoundCareAlternative; packet: ReturnType<typeof graphJudgePacket>; checks: Check[] };
export type GraphMetadata = { version: string; mode: string; frozenPacketHash?: string; gatesAdmission?: GatesAdmission; clinicalPolicyVersion?: string; factGraph?: FactGraphReport; context: z.infer<typeof contextSchema> | null; contextAdmission?: ContextAdmission; safety: z.infer<typeof safetySchema> | null; safetyAdmission?: SafetyAdmission; safetyWireConformance?: "conformant" | "expanded_envelope" | "unavailable"; questionPublication?: QuestionPublication; transportAdmission?: TransportAdmission; ownershipLanguageReview?: OwnershipLanguageReview; repair?: RepairAudit; careAlternative?: GraphCareAlternative; careReviewPacket?: ReturnType<typeof graphJudgePacket>; preservedCare?: ReviewedCareCorrectionSnapshot & { origin: "current_review" | "pre_repair_review" }; careCarryForward?: ReviewedCareSnapshot & { used: boolean }; retrieval: Retrieval[]; judge: GraphJudge | null; release: "model_reviewed" | "gates_only" | "clinician_required"; clinicalApproval: false; corrections: number; careCorrectionReleased: boolean; sourceIntegrity: boolean; citations: z.infer<typeof draftSchema>["citations"] };
const instructions = GRAPH_INSTRUCTIONS;
export function graphVersion(mode: GraphMode = "hybrid") { return mode === "gates-release" ? GATES_RELEASE_VERSION : GRAPH_VERSION; }
export function graphPromptHash(config: GraphConfig = resolveGraphConfig(), mode: GraphMode = "hybrid") {
  const safetyInstructions = graphSafetyInstructions(config.safetyStyle);
  const instructions = { ...GRAPH_INSTRUCTIONS, safety: safetyInstructions };
  return sha256(JSON.stringify({ version: graphVersion(mode), mode, releasePolicy: mode === "gates-release" ? GATES_RELEASE_POLICY : "full-review/v24", ...(mode === "gates-release" ? { gatesOutputInstructions: GATES_OUTPUT_INSTRUCTIONS } : {}), config, outputLimits: GRAPH_OUTPUT_LIMITS,
    requestSettings: { ...Object.fromEntries(Object.keys(config.models).map(role => [role, graphRequestSettings(role as keyof typeof GRAPH_MODELS, config)])), truncatedJudgeRecovery: graphRequestSettings("judge", config, true) },
    instructions, repairProtocol: REPAIR_PROTOCOL, repairScopePolicy: REPAIR_SCOPE_POLICY, actionTimingAdmissionPolicy: ACTION_TIMING_ADMISSION_POLICY, onsetPatternAdmissionPolicy: ONSET_PATTERN_ADMISSION_POLICY, repairInstructions: REPAIR_INSTRUCTIONS, careAlternativePolicy: CARE_ALTERNATIVE_POLICY, reviewProtocol: GRAPH_REVIEW_PROTOCOL, judgeSourceRepairPolicy: JUDGE_SOURCE_REPAIR_POLICY, judgeInstructions: graphJudgeInstructions(config.judgeStyle), schemas: [config.factGraphMode === "shadow" ? shadowContextSchema : contextSchema, config.safetyStyle === "compact" ? compactSafetyWireSchema : safetySchema, wireDraftSchema, graphJudgeSchema, graphRepair.schema].map(s => s.toJSONSchema()), ...(config.factGraphMode === "shadow" ? { factGraphHash: FACT_GRAPH_HASH, factInstructions: FACT_EXTRACTION_INSTRUCTIONS } : {}) }));
}
export const GRAPH_PROMPT_HASH = graphPromptHash();
export function createGraphAgents(config: GraphConfig = resolveGraphConfig()) {
  return Object.fromEntries(Object.entries(config.models).map(([role, model]) => [role, new Agent({ id: `graph-${role}`, name: `Disposition ${role}`, model: model as `${string}/${string}`, instructions: (role === "judge" ? graphJudgeInstructions(config.judgeStyle) : role === "safety" ? graphSafetyInstructions(config.safetyStyle) : instructions[role as keyof typeof instructions]) + (role === "context" && config.factGraphMode === "shadow" ? `\n${FACT_EXTRACTION_INSTRUCTIONS}` : ""), maxRetries: 0 })])) as Record<keyof typeof GRAPH_MODELS, Agent>;
}
type Role = keyof typeof GRAPH_MODELS;
// Canonical-output test seam. Wire serialization/normalization is tested through
// the actual Agent.stream boundary, not inferred from this injected generator.
export type GraphGenerate = (role: Role, prompt: string, signal: AbortSignal) => Promise<{ output: unknown; usage: Assessment["usage"] }>;
export type GraphSearch = (query: string, signal: AbortSignal) => Promise<Retrieval>;
export async function traceGraphSearch(search: GraphSearch, query: string, signal: AbortSignal, tracing: TracingContext | undefined, phase: "initial" | "revision", index: number): Promise<Retrieval | null> {
  let span: ReturnType<NonNullable<TracingContext["currentSpan"]>["createChildSpan"]> | undefined;
  // Observability must not become a clinical dependency. Raw queries, patient
  // text, source text and provider error bodies stay out of these trace spans.
  try { span = tracing?.currentSpan?.createChildSpan({ type: SpanType.GENERIC, name: "clinical-retrieval-query", metadata: { phase, index, queryHash: sha256(query) } }); } catch { /* detailed local run journal remains independent */ }
  try {
    const result = await search(query, signal);
    try { span?.end({ metadata: { outcome: "received", hitCount: result.hits.length, corpusHash: result.corpusHash, durationMs: result.timings.totalMs, embeddingCacheHit: result.embeddingCacheHit } }); } catch { /* do not discard evidence after a telemetry failure */ }
    return result;
  } catch {
    try { span?.error({ error: new Error(signal.aborted ? "RETRIEVAL_CANCELLED" : "RETRIEVAL_FAILED") }); } catch { /* preserve the retrieval failure without leaking its body */ }
    return null;
  }
}
type ClinicalState = { message: string; context: z.infer<typeof contextSchema> | null; contextAdmission: ContextAdmission; factObservations?: unknown; factGraph?: FactGraphReport; retrieval: Retrieval[]; hits: Hit[]; frozenPacketHash?: string; draft: z.infer<typeof draftSchema> | null; agents: AgentExecution[]; failure: string | null };
export type SafetyAdmission = { status: "admitted" | "not_requested" | "rejected"; code: "INVALID_SAFETY_OUTPUT" | "NO_EARLY_ACTION" | "PHYSICAL_DEPENDENCY_MISSING" | "PATIENT_QUOTE_MISMATCH" | "ACTION_BASIS_MISSING" | "ACTION_BASIS_REFERENCE_INVALID" | "ACTION_BASIS_NOT_SUFFICIENT" | "ACTION_BASIS_NOT_CURRENT_PRESENT" | "ACTION_ADMITTED" | "ACTIVE_EMS_NOT_BOUND" | "ACTIVE_EMS_CONTRACT_CONFLICT"; proposedAction: z.infer<typeof safetySchema>["action"] | null; basisMode: "explicit" | "legacy_all_basis" | null; supportingBasisIndices: number[]; contextualBasisIndices: number[]; clinicalValidation: false };
type SafetyState = { safety: z.infer<typeof safetySchema> | null; notice: SafetyNotice | null; admission: SafetyAdmission; wireConformance?: "conformant" | "expanded_envelope" | "unavailable"; agents: AgentExecution[] };
type QuestionState = { question: Extract<ResponseEvent, { kind: "intake_question" }> | null; safety: "pending" | "nonemergency" | "emergency" | "unavailable"; published: boolean; invalidQuestion: boolean };
export type QuestionPublication = { status: "not_proposed" | "published" | "suppressed_emergency" | "suppressed_safety_unavailable" | "rejected_question_contract" | "not_published"; blocksRouting: false };

export function assessSafetyAdmission(value: unknown, message: string): { notice: SafetyNotice | null; admission: SafetyAdmission } {
  const parsed = safetySchema.safeParse(value);
  const admission: SafetyAdmission = { status: "rejected", code: "INVALID_SAFETY_OUTPUT", proposedAction: parsed.success ? parsed.data.action : null, basisMode: null, supportingBasisIndices: [], contextualBasisIndices: [], clinicalValidation: false };
  const reject = (code: SafetyAdmission["code"]) => ({ notice: null, admission: { ...admission, code } });
  if (!parsed.success) return reject("INVALID_SAFETY_OUTPUT");
  if (["NONE", "PRIORITY_ASYNC", "STANDARD_ASYNC"].includes(parsed.data.action)) return { notice: null, admission: { ...admission, status: "not_requested", code: "NO_EARLY_ACTION" } };
  const s = parsed.data;
  if (s.action === "SAME_DAY_IN_PERSON" && !s.physicalRequirement) return reject("PHYSICAL_DEPENDENCY_MISSING");
  if (!s.basis.length) return reject("ACTION_BASIS_MISSING");
  if (s.basis.some(b => !message.includes(b.quote))) return reject("PATIENT_QUOTE_MISMATCH");
  // Bind admission to the model's explicitly sufficient clinical basis, not
  // ANY positive finding. Negative/background context must not cancel a valid
  // acute basis, and must not silently become support for the action either.
  // Legacy outputs retain the old all-items guard; we never reinterpret them.
  admission.basisMode = s.actionBasis ? "explicit" : "legacy_all_basis";
  const selected = s.actionBasis?.indices ?? s.basis.map((_, i) => i);
  if (new Set(selected).size !== selected.length || selected.some(i => !s.basis[i])) return reject("ACTION_BASIS_REFERENCE_INVALID");
  admission.supportingBasisIndices = selected;
  admission.contextualBasisIndices = s.basis.map((_, i) => i).filter(i => !selected.includes(i));
  if (s.actionBasis && !s.actionBasis.sufficient) return reject("ACTION_BASIS_NOT_SUFFICIENT");
  if (selected.some(i => !s.basis[i].currentPatient || !s.basis[i].present)) return reject("ACTION_BASIS_NOT_CURRENT_PRESENT");
  // Sufficiency, attribution and temporality remain MODEL judgments. Exact
  // quotations and booleans cannot prove clinical entailment; the independent
  // review still evaluates/corrects every issued action, including overtriage.
  // The LLM chooses the care action from this message. Rendering that action
  // cannot depend on prose length, a phrase order, or an invented EMS promise.
  // No clinical condition/keyword selects these templates; no answers are cached.
  if (s.action === "CONTINUE_EMS" && (!s.actionBasis || !s.activeEms || !message.includes(s.activeEms.quote)
    || !s.activeEms.currentPatient || !s.activeEms.currentEpisode || !s.activeEms.active
    || !selected.some(i => s.basis[i].quote === s.activeEms!.quote))) return reject("ACTIVE_EMS_NOT_BOUND");
  if (s.action !== "CONTINUE_EMS" && s.activeEms !== null) return reject("ACTIVE_EMS_CONTRACT_CONFLICT");
  const directive = s.action === "CONTINUE_EMS" ? CONTINUE_EMS_DIRECTIVE
    : s.action === "EMS_NOW" ? "Call 911 now. Do not drive yourself or wait for a message reply." : s.action === "ED_NOW" ? "Seek emergency department assessment now. Do not wait for a message reply; call 911 if you cannot travel safely." : "Arrange an in-person assessment today. Do not wait for an asynchronous reply.";
  return { notice: { disposition: s.action === "SAME_DAY_IN_PERSON" ? "SAME_DAY_IN_PERSON" : "EMERGENCY_NOW", directive, source: "emergency_agent" }, admission: { ...admission, status: "admitted", code: "ACTION_ADMITTED" } };
}
export function noticeFromSafety(value: unknown, message: string): SafetyNotice | null { return assessSafetyAdmission(value, message).notice; }
function evidenceFor(hits: Hit[]): Guidance[] {
  return hits.map(h => ({ id: h.chunk.id, title: h.document.title, url: h.document.url, section: h.chunk.sectionTitle, summary: h.chunk.text, reviewedAt: h.document.reviewDate ?? "not assessed",
    projectInterpretation: `${h.document.kind}; ${h.document.reviewStatus}. ${h.document.scope}`, retrievedPassages: [{ id: h.chunk.id, sourceId: h.document.id, excerpt: h.chunk.text, excerptSha256: h.chunk.hash, retrievedAt: h.document.retrievedAt, sourceContentHash: h.document.rawHash, kind: h.document.kind, limitations: h.document.scope }] }));
}
function answerFrom(draft: z.infer<typeof draftSchema>, emergencyTransport?: ReviewedEmergencyTransport): DispositionAnswer {
  const { citations, transportIntent: _intent, ...rest } = draft;
  return { ...rest, ...(emergencyTransport ? { emergencyTransport } : {}), evidence: citations.map(c => ({ sourceId: c.passageId, claim: c.claim })) };
}
export type TransportAdmission = { status: "legacy" | "admitted" | "rejected"; code: "LEGACY_TEXT_CONTRACT" | "TRANSPORT_CONTEXT_INVALID" | "TRANSPORT_REVIEW_MISSING_OR_UNSUPPORTED" | "TRANSPORT_REVIEW_MISMATCH" | "ACTIVATION_NOT_CURRENT_PATIENT_ACTIVE" | "TRANSPORT_ADMITTED"; binding?: ReviewedEmergencyTransport; clinicalValidation: false };
export function assessEmergencyTransport(draft: z.infer<typeof draftSchema> | null, message: string, judge: GraphJudge | null): TransportAdmission {
  const intent = draft?.transportIntent;
  const outcome = (code: TransportAdmission["code"]): TransportAdmission => ({ status: "rejected", code, clinicalValidation: false });
  if (!intent) return { status: "legacy", code: "LEGACY_TEXT_CONTRACT", clinicalValidation: false };
  if (draft.disposition !== "EMERGENCY_NOW" || (intent.mode === "continue_ems" ? !intent.activationQuote || !message.includes(intent.activationQuote) : intent.activationQuote !== null)) return outcome("TRANSPORT_CONTEXT_INVALID");
  const review = judge?.transportReview;
  if (!review || review.verdict !== "supported") return outcome("TRANSPORT_REVIEW_MISSING_OR_UNSUPPORTED");
  if (review.mode !== intent.mode || !draft.patientMessage.includes(review.draftQuote)) return outcome("TRANSPORT_REVIEW_MISMATCH");
  if (intent.mode === "continue_ems") {
    if (!review.activation || review.activation.quote !== intent.activationQuote || !message.includes(review.activation.quote)) return outcome("TRANSPORT_REVIEW_MISMATCH");
    if (!review.activation.currentPatient || !review.activation.currentEpisode || !review.activation.active) return outcome("ACTIVATION_NOT_CURRENT_PATIENT_ACTIVE");
  } else if (review.activation !== null) return outcome("TRANSPORT_REVIEW_MISMATCH");
  // Exact binding prevents invented quotations and stale reviews; attribution,
  // active status and consistency with the prose remain independent MODEL
  // judgments, not deterministic clinical truth or a verified EMS handoff.
  return { status: "admitted", code: "TRANSPORT_ADMITTED", clinicalValidation: false, binding: { mode: intent.mode, activationQuote: intent.activationQuote, directive: draft.patientMessage, review: "independent_model" } };
}
export function graphSourceIntegrity(draft: z.infer<typeof draftSchema>, hits: Hit[]) {
  return draft.citations.every(c => hits.some(h => h.chunk.id === c.passageId && sha256(h.chunk.text) === h.chunk.hash && h.chunk.text.includes(c.quote)));
}
export { selectGraphEvidence } from "../evidence/rag/selection.ts";
/** Shared live/frozen review packet. Reference labels never enter this boundary. */
export function graphJudgePacket(input: { patient: string; draft: z.infer<typeof draftSchema>; hits: Hit[]; notice: SafetyNotice | null; basis?: unknown; questions?: ResponseEvent[]; contractFindings?: unknown[] }) {
  const { patient, draft, hits, notice, basis, questions = [], contractFindings = [] } = input;
  const units = [{ id: "patient", text: patient }, { id: "draft", text: JSON.stringify(draft) }, ...(notice ? [{ id: "early", text: JSON.stringify({ notice, basis }) }] : []), ...(questions.length ? [{ id: "issued_question", text: JSON.stringify(questions) }] : []), ...hits.map(h => ({ id: `source:${h.chunk.id}`, text: `${h.document.kind}; ${h.document.scope}; publication: ${h.document.publicationDate ?? "unknown"}\n${h.chunk.text}` }))];
  return { units, contractFindings, handoffFindings: handoffLanguageFindings(draft.patientMessage), hasIssuedEarlyAction: Boolean(notice), questionSemantics: "blocksRouting=false means no assessment or care was held for an answer; clinical relevance remains for independent review. It is not a decisionChanging verdict.", policy: ROUTING_POLICY_VERSION };
}
export function validateGraphJudge(raw: unknown, units: { id: string; text: string }[], hasEvidence: boolean, notice: SafetyNotice | null): GraphJudge | null {
  const parsed = graphJudgeSchema.safeParse(raw); if (!parsed.success) return null;
  const j = parsed.data;
  if (new Set(j.criteria.map(c => c.id)).size !== criteria.length || j.criteria.some(c => c.anchors.some(a => !["patient", "draft", "issued_question"].includes(a.unit) && !a.unit.startsWith("source:") || !units.some(u => u.id === a.unit && exactStructuredJudgeAnchor(u, a.quote))))) return null;
  const research = j.criteria.find(c => c.id === "claim_support")!;
  if (research.verdict === "pass" && (!hasEvidence || !research.anchors.some(a => a.unit.startsWith("source:")))) return null;
  if (Boolean(notice) !== (j.earlyAction !== "none")) return null;
  if (j.earlyAction === "unsupported" && (!j.earlyCorrection || j.earlyCorrection.patientQuotes.some(q => !units.find(u => u.id === "patient")?.text.includes(q)))) return null;
  if (j.verdict === "accept" && (j.criteria.some(c => c.verdict !== "pass") || j.earlyAction === "unresolved")) return null;
  return j;
}

/** Bind the successful provider response before journaling. Only an unknown
 * source reference may be repaired; all seven original judgments survive. */
export function bindGraphJudgeExecution(result: AgentExecution, packet: ReturnType<typeof graphJudgePacket>): AgentExecution {
  const patient = packet.units.find(u => u.id === "patient")!.text;
  const draftText = packet.units.find(u => u.id === "draft")!.text;
  result.reviewInputBinding = { patientHash: sha256(patient), draftHash: sha256(draftText), packetHash: sha256(JSON.stringify(packet)) };
  if (result.failure) {
    // Even a parseable partial answer is not a completed provider judgment.
    if (result.output !== null) { result.rawOutput ??= result.output; result.output = null; }
    return result;
  }
  const raw = result.output;
  result.rawOutput = raw;
  const parsed = graphJudgeSchema.safeParse(raw);
  const candidate = parsed.success ? planJudgeSourceAnchorRepair(raw, packet).output : raw;
  const notice = packet.units.find(u => u.id === "early");
  result.output = validateGraphJudge(candidate, packet.units, Boolean(JSON.parse(draftText).citations?.length), notice ? JSON.parse(notice.text).notice : null);
  if (parsed.success) {
    const steps = buildJudgeSourceAnchorRepairAuditSteps(raw, result.output, packet);
    let state = steps.next();
    while (!state.done) state = steps.next(sha256(state.value));
    if (state.value) result.judgeSourceRepair = state.value;
  }
  if (!result.output) result.failure = "JUDGE_CONTRACT_FAILED";
  return result;
}

export type OwnershipLanguageReview = { raw: Check; findings: HandoffLanguageFinding[]; status: "not_flagged" | "resolved_recommended_task" | "blocked"; reviewedDraftHash: string | null; taskReviews: NonNullable<GraphJudge["ownershipTaskReview"]>; clinicalApproval: false };
export function reviewHandoffLanguage(draft: z.infer<typeof draftSchema>, judge: GraphJudge | null, reviewedDraftHash: string | null, raw: Check): { check: Check; audit: OwnershipLanguageReview } {
  const findings = handoffLanguageFindings(draft.patientMessage), taskReviews = judge?.ownershipTaskReview ?? [];
  const ownership = judge?.criteria.find(c => c.id === "ownership");
  const boundReview = reviewedDraftHash === sha256(JSON.stringify(draft)) && judge?.verdict === "accept" && criteria.every(id => judge.criteria.find(c => c.id === id)?.verdict === "pass");
  const resolved = raw.status === "fail" && findings.length > 0 && boundReview && findings.every(f => {
    if (f.kind !== "future_clinician_task") return false;
    const review = taskReviews.find(r => r.clause === f.clause);
    return review?.classification === "recommended_task" && Boolean(review.recommendationQuote && review.availabilityQuote && review.recommendationQuote !== review.availabilityQuote
      && draft.patientMessage.includes(review.recommendationQuote) && draft.patientMessage.includes(review.availabilityQuote)
      && !f.clause.includes(review.recommendationQuote) && !f.clause.includes(review.availabilityQuote)
      && ownership?.anchors.some(a => a.unit === "draft" && a.quote === f.clause));
  });
  const audit: OwnershipLanguageReview = { raw, findings, status: raw.status !== "fail" ? "not_flagged" : resolved ? "resolved_recommended_task" : "blocked", reviewedDraftHash, taskReviews, clinicalApproval: false };
  // Preserve the raw failed heuristic AND its model resolution. This is not
  // proof of a handoff; no operation, response guarantee or other check is waived.
  return { check: resolved ? { ...raw, status: "pass", detail: "A raw future-tense phrase finding was independently reviewed as a recommended clinician task, with exact recommendation/availability context. No accepted handoff or response guarantee is established; raw finding and bound review are retained." } : raw, audit };
}

export function graphCareDirective(draft: z.infer<typeof draftSchema>, transport?: ReviewedEmergencyTransport): string {
  if (draft.disposition === "ASYNC_PHYSICIAN") return asyncAction(draft);
  const urgent = urgentCareDirective(draft.disposition, draft.patientMessage, transport);
  if (urgent) return urgent;
  throw new Error("SELF_CARE_REQUIRES_COMPLETE_RESPONSE_REVIEW");
}

// A failure to approve an explanation must not preserve a specifically
// adjudicated wrong care action. This is a narrow model-reviewed correction,
// not clinical approval: it still routes to a clinician and withholds prose.
export function canReleaseCareCorrection(draft: z.infer<typeof draftSchema> | null, judge: GraphJudge | null, notice: SafetyNotice | null, checks: Check[], transport?: ReviewedEmergencyTransport): boolean {
  if (!draft || !notice || !judge || judge.verdict !== "revise" || judge.earlyAction !== "unsupported" || !judge.earlyCorrection || !routingFieldsValid(draft)) return false;
  if (draft.transportIntent && !transport) return false;
  const transportOnly = reducesEmergencyTransport(notice, { disposition: draft.disposition, directive: draft.patientMessage, emergencyTransport: transport });
  if (!transportOnly && !["ASYNC_PHYSICIAN", "SAME_DAY_IN_PERSON"].includes(draft.disposition)) return false;
  if (notice.disposition !== "EMERGENCY_NOW" && draft.disposition !== "ASYNC_PHYSICIAN") return false;
  if (!transportOnly && isEmsInstruction(notice.directive) && !judge.earlyCorrection.triggerMisattributedOrCorrected) return false;
  if (!criteria.filter(id => id !== "claim_support").every(id => judge.criteria.find(c => c.id === id)?.verdict === "pass")) return false;
  const required = ["quoted_patient_evidence", "action_timing_present", "no_blanket_clearance", "no_unconfirmed_handoff"];
  if (!required.every(id => checks.find(c => c.id === id)?.status === "pass")) return false;
  return !checks.some(c => c.status === "fail" && !["citation_provenance", "research_support", "response_concision"].includes(c.id));
}

/** Corrections are not generic carry-forward: only the exact current review
 * may replace adjudicated-wrong early care, including its async queue metadata.
 */
export function reviewedCareCorrectionSnapshot(draft: z.infer<typeof draftSchema> | null, judge: GraphJudge | null, reviewedDraftHash: string | null, patient: string, notice: SafetyNotice | null, checks: Check[], execution?: AgentExecution): ReviewedCareCorrectionSnapshot | null {
  if (!draft || !judge || !execution || execution.failure || reviewedDraftHash !== sha256(JSON.stringify(draft))
    || execution.reviewInputBinding?.patientHash !== sha256(patient) || execution.reviewInputBinding.draftHash !== reviewedDraftHash
    || sha256(JSON.stringify(execution.output)) !== sha256(JSON.stringify(judge))) return null;
  const transport = assessEmergencyTransport(draft, patient, judge);
  if (!canReleaseCareCorrection(draft, judge, notice, checks, transport.binding)) return null;
  const directive = graphCareDirective(draft, transport.binding);
  const proof = { patientHash: sha256(patient), draftHash: reviewedDraftHash, judgeHash: sha256(JSON.stringify(judge)), reviewInputBinding: execution.reviewInputBinding, directive,
    ...(transport.binding ? { emergencyTransport: Object.freeze({ ...transport.binding, directive }) } : {}) };
  if (draft.disposition === "ASYNC_PHYSICIAN") return Object.freeze({ ...proof, disposition: draft.disposition, reviewPriority: draft.reviewPriority!, workType: draft.workType! });
  return Object.freeze({ ...proof, disposition: draft.disposition as ReviewedCareSnapshot["disposition"] });
}

export function createClinicalGraph(options: { agents: ReturnType<typeof createGraphAgents>; search: GraphSearch; generate?: GraphGenerate; mode?: GraphMode; config?: GraphConfig }) {
  const config = options.config ?? resolveGraphConfig(), models = config.models;
  const mode = options.mode ?? "hybrid", inputSchema = z.object({ message: z.string().min(1).max(12_000).refine(text => text.trim().length > 0) }).strict();
  async function rawCall(role: Role, data: unknown, parent: AbortSignal, tracingContext?: TracingContext, truncatedJudgeRecovery = false): Promise<AgentExecution> {
    const repairing = role === "disposition" && Boolean((data as { repairContract?: unknown }).repairContract);
    const sources = role === "disposition" ? (data as { sources: { id: string; text: string; [key: string]: unknown }[] }).sources : [];
    const payload = role === "disposition" && (!options.generate || repairing) ? { ...(data as object), ...(repairing ? { outputInstructions: REPAIR_INSTRUCTIONS } : {}), sources: sources.map(sourceWithQuoteSpans) } : data;
    const prompt = JSON.stringify(payload), schema: z.ZodType = repairing ? graphRepair.schema : { context: config.factGraphMode === "shadow" ? shadowContextSchema : contextSchema, safety: config.safetyStyle === "compact" ? compactSafetyWireSchema : safetySchema, disposition: wireDraftSchema, judge: graphJudgeSchema }[role];
    const recordRole = { context: "history", safety: "emergency", disposition: "disposition", judge: "critic" }[role] as AgentExecution["role"];
    const began = performance.now(), deadline = requestDeadline(parent, EXECUTION_POLICY.modelTimeoutMs);
    let modelCalls = 0;
    try {
      if (Buffer.byteLength(prompt) > 60_000) throw new Error("PROMPT_LIMIT_EXCEEDED");
      if (options.generate) { modelCalls = 1; const result = await abortable(() => options.generate!(role, prompt, deadline.signal), deadline.signal); return { role: recordRole, model: models[role], modelCalls, ...result, failure: null, durationMs: performance.now() - began }; }
      const result = await consumeStructuredStream({ signal: deadline.signal, start: abortSignal => { modelCalls = 1; return options.agents[role].stream(prompt, { abortSignal, structuredOutput: { schema: safetyEnvelopeTransport(schema, z.unknown()), errorStrategy: "strict" },
        ...graphRequestSettings(role, config, truncatedJudgeRecovery), tracingContext, tracingOptions: { hideInput: true, hideOutput: true } }); } });
      if (role === "safety" && config.safetyStyle === "compact" && !result.failure) {
        try { return {role:recordRole,model:models[role],modelCalls,...result,output:normalizeSafetyWire(result.output,true),rawOutput:result.output}; }
        catch { return {role:recordRole,model:models[role],modelCalls,...result,output:null,rawOutput:result.output,failure:"SAFETY_WIRE_CONTRACT_FAILED"}; }
      }
      if (role === "disposition" && !repairing && !result.failure) {
        const wire = wireDraftSchema.safeParse(result.output);
        try {
          if (!wire.success) throw new Error("DRAFT_WIRE_CONTRACT_FAILED");
          const output = draftSchema.parse(resolveSourceQuoteReferences(wire.data, sources));
          return { role: recordRole, model: models[role], modelCalls, ...result, output, rawOutput: result.output };
        } catch {
          return { role: recordRole, model: models[role], modelCalls, ...result, output: null, rawOutput: result.output, failure: "SOURCE_REFERENCE_CONTRACT_FAILED" };
        }
      }
      return { role: recordRole, model: models[role], modelCalls, ...result };
    } catch (e) { return { role: recordRole, model: models[role], modelCalls, output: null, usage: { inputTokens: null, outputTokens: null }, failure: parent.aborted ? "RUN_CANCELLED" : e instanceof Error && e.message === "PROMPT_LIMIT_EXCEEDED" ? e.message : "MODEL_OR_SCHEMA_FAILURE", durationMs: performance.now() - began }; }
    finally { deadline.dispose(); }
  }
  async function call(role: Role, data: unknown, parent: AbortSignal, tracingContext: TracingContext | undefined, context: { get(key: string): unknown }, truncatedJudgeRecovery = false): Promise<AgentExecution> {
    const result = await rawCall(role, data, parent, tracingContext, truncatedJudgeRecovery);
    if (role === "disposition" && (data as {repairContract?:unknown}).repairContract) {
      const binding = (data as {repairContract:NonNullable<AgentExecution["repairInputBinding"]>}).repairContract;
      result.repairInputBinding = {baseDraftHash:binding.baseDraftHash,evidenceHash:binding.evidenceHash,allowedFields:[...binding.allowedFields]};
    }
    if (role === "judge") {
      bindGraphJudgeExecution(result, data as ReturnType<typeof graphJudgePacket>);
    }
    // Persist each call before downstream parsing/judging can fail. A workflow
    // crash must not turn completed provider spend into zero recorded calls.
    (context.get("agentExecution") as ((record: AgentExecution) => void) | undefined)?.(result);
    return result;
  }
  function publishQuestion(state: QuestionState, context: { get(key: string): unknown }, signal: AbortSignal) {
    const emit = context.get("responseEvent") as ((event: ResponseEvent) => void) | undefined;
    if (state.question && state.safety === "nonemergency" && !state.published && !signal.aborted && emit) { state.published = true; emit(state.question); }
  }
  // Initialize once before branch contexts are copied. Only question publication
  // joins on safety; retrieval and independent disposition never await this state.
  const initialize = createStep({ id: "initialize-publication", inputSchema, outputSchema: inputSchema, execute: async ({ inputData, requestContext }) => {
    requestContext.set("graphQuestionPublication", { question: null, safety: "pending", published: false, invalidQuestion: false } satisfies QuestionState);
    return inputData;
  } });
  const safety = createStep({ id: "independent-safety", inputSchema, outputSchema: z.custom<SafetyState>(), execute: async ({ inputData, requestContext, tracingContext }) => {
    const signal = (requestContext.get("abortSignal") as AbortSignal | undefined) ?? new AbortController().signal;
    const execution = await call("safety", { patient: inputData.message }, signal, tracingContext, requestContext), parsed = safetySchema.safeParse(execution.output), { notice, admission } = assessSafetyAdmission(execution.output, inputData.message);
    const publication = requestContext.get("graphQuestionPublication") as QuestionState;
    publication.safety = notice?.disposition === "EMERGENCY_NOW" || parsed.success && ["ED_NOW", "EMS_NOW"].includes(parsed.data.action) ? "emergency" : !parsed.success || admission.status === "rejected" ? "unavailable" : "nonemergency";
    if (notice && !signal.aborted) { requestContext.set("graphEarlyAction", notice.disposition); (requestContext.get("responseEvent") as ((e: ResponseEvent) => void) | undefined)?.({ kind: "action", notice }); }
    publishQuestion(publication, requestContext, signal);
    return { safety: parsed.success ? parsed.data : null, notice, admission, ...(config.safetyStyle === "compact" ? {wireConformance:execution.failure ? "unavailable" as const : compactSafetyWireSchema.safeParse(execution.rawOutput).success ? "conformant" as const : "expanded_envelope" as const} : {}), agents: [execution] };
  } });
  const context = createStep({ id: "context", inputSchema, outputSchema: z.custom<ClinicalState>(), execute: async ({ inputData, requestContext, tracingContext }) => {
    const signal = (requestContext.get("abortSignal") as AbortSignal | undefined) ?? new AbortController().signal;
    const execution = await call("context", { patient: inputData.message }, signal, tracingContext, requestContext);
    const { factObservations, ...base } = config.factGraphMode === "shadow" && execution.output && typeof execution.output === "object" ? execution.output as Record<string, unknown> : { factObservations: undefined };
    const { context: data, admission } = admitGraphContext(config.factGraphMode === "shadow" ? base : execution.output, inputData.message);
    if (!data) execution.failure ??= "CONTEXT_CONTRACT_FAILED";
    (requestContext.get("contextAdmission") as ((admission: ContextAdmission) => void) | undefined)?.(admission);
    // Queue only publication, never clinical work. An unanswered question
    // cannot block routing, and an unresolved safety screen cannot be outrun.
    const q = data?.question;
    const publication = requestContext.get("graphQuestionPublication") as QuestionState;
    if (q) {
      const proposed: Extract<ResponseEvent, { kind: "intake_question" }> = { kind: "intake_question", questionId: `adaptive-${sha256(JSON.stringify(q)).slice(0, 16)}`, quote: q.quote, text: q.text, why: q.why, blocksRouting: false };
      if (validAdaptiveQuestion(proposed, inputData.message)) publication.question = proposed;
      else publication.invalidQuestion = true;
    }
    publishQuestion(publication, requestContext, signal);
    return { message: inputData.message, context: data, contextAdmission: admission, ...(config.factGraphMode === "shadow" ? { factObservations } : {}), retrieval: [], hits: [], draft: null, agents: [execution], failure: null };
  } });
  const factGraph = createStep({ id: "canonical-fact-graph-shadow", inputSchema: z.custom<ClinicalState>(), outputSchema: z.custom<ClinicalState>(), execute: async ({ inputData: s, requestContext }) => {
    const report = runFactGraphShadow(s.message, s.factObservations, requestContext.get("factGraphAudit") as ((report: FactGraphReport) => void) | undefined);
    return { ...s, factGraph: report };
  } });
  const retrieve = createStep({ id: "hybrid-evidence", inputSchema: z.custom<ClinicalState>(), outputSchema: z.custom<ClinicalState>(), execute: async ({ inputData: s, requestContext, tracingContext }) => {
    if (mode === "no-retrieval") return s;
    const signal = (requestContext.get("abortSignal") as AbortSignal | undefined) ?? new AbortController().signal;
    if (!s.contextAdmission.queries.length) return { ...s, failure: "RETRIEVAL_QUERY_UNAVAILABLE" };
    const results = await Promise.all(s.contextAdmission.queries.map((q, i) => traceGraphSearch(options.search, q, signal, tracingContext, "initial", i)));
    const retrieval = results.filter((r): r is Retrieval => Boolean(r));
    const hits = selectGraphEvidence(retrieval, 9);
    return { ...s, retrieval, hits, failure: retrieval.length ? null : "RETRIEVAL_UNAVAILABLE" };
  } });
  const disposition = createStep({ id: "independent-disposition", inputSchema: z.custom<ClinicalState>(), outputSchema: z.custom<ClinicalState>(), execute: async ({ inputData: s, requestContext, tracingContext }) => {
    const signal = (requestContext.get("abortSignal") as AbortSignal | undefined) ?? new AbortController().signal;
    if (mode === "gates-release") {
      s.hits = structuredClone(s.hits);
      s.frozenPacketHash = sha256(JSON.stringify(s.hits));
      (requestContext.get("evidencePacketFrozen") as ((packet: unknown) => void) | undefined)?.({ hash: s.frozenPacketHash, passageIds: s.hits.map(h => h.chunk.id) });
    }
    const data = { patient: s.message, context: s.context, ...(mode === "gates-release" ? { outputInstructions: GATES_OUTPUT_INSTRUCTIONS } : {}), sources: s.hits.map(h => ({ id: h.chunk.id, title: h.document.title, kind: h.document.kind, review: h.document.reviewStatus, date: h.document.publicationDate, currency: h.document.currency, scope: h.document.scope, section: h.chunk.sectionTitle, before: h.context.before, text: h.chunk.text, after: h.context.after })) };
    const executions = [await call("disposition", data, signal, tracingContext, requestContext)];
    // Retry one genuine failed generation, never launch a speculative duplicate
    // just because a valid request is slow. Both attempts remain in the record.
    if (executions[0].failure && !signal.aborted) executions.push(await call("disposition", data, signal, tracingContext, requestContext));
    const parsed = draftSchema.safeParse(executions.at(-1)!.output);
    return { ...s, draft: parsed.success ? parsed.data : null, agents: [...s.agents, ...executions], failure: parsed.success ? s.failure : executions.at(-1)!.failure ?? "DRAFT_CONTRACT_FAILED" };
  } });
  const clinicalStart = createWorkflow({ id: "context-evidence-disposition", inputSchema, outputSchema: z.custom<ClinicalState>() }).then(context);
  const clinical = (config.factGraphMode === "shadow" ? clinicalStart.then(factGraph) : clinicalStart).then(retrieve).then(disposition).commit();
  const joinSchema = z.object({ "independent-safety": z.custom<SafetyState>(), "context-evidence-disposition": z.custom<ClinicalState>() });
  const review = createStep({ id: "review-and-release", inputSchema: joinSchema, outputSchema: z.custom<Assessment>(), execute: async ({ inputData, requestContext, tracingContext }): Promise<Assessment> => {
    const s = inputData["context-evidence-disposition"], early = inputData["independent-safety"], agents = [...s.agents, ...early.agents];
    const signal = (requestContext.get("abortSignal") as AbortSignal | undefined) ?? new AbortController().signal;
    const emit = requestContext.get("responseEvent") as ((e: ResponseEvent) => void) | undefined;
    let guidance = evidenceFor(s.hits);
    // One candidate workflow, two explicit release contracts. This branch never
    // invokes judge/repair/re-retrieval or fabricates their acceptance. The full
    // hybrid and withholding no-judge paths below retain their prior semantics.
    if (mode === "gates-release") {
      const { admission, checks } = resolveGatesSteps(gatesDecisionSteps(s.draft, s.message, guidance, s.hits, early.notice, signal.aborted), sha256);
      const released = admission.released && s.frozenPacketHash === admission.packetHash;
      const floor = !released && early.notice ? { disposition: early.notice.disposition, directive: early.notice.directive } : null;
      const answer = released ? gatesAnswer(s.draft!) : floor ? {
        disposition: floor.disposition, reviewPriority: null, workType: null, reason: PRESERVED_CARE_COPY.reason,
        patientMessage: floor.directive, differential: [], redFlags: [], vitalSigns: PRESERVED_CARE_COPY.vitalSigns,
        questions: [], evidence: [], evidenceLimitations: PRESERVED_CARE_COPY.evidenceLimitations,
      } : null;
      const publication = requestContext.get("graphQuestionPublication") as QuestionState;
      if (released && answer) emit?.({ kind: "patient_reply", disposition: answer.disposition, text: answer.patientMessage });
      return { status: released ? "complete" : "review_required", answer, origin: released ? "agent" : "validation_safeguard",
        failure: released ? null : signal.aborted ? "RUN_CANCELLED" : !admission.packetOk ? "EVIDENCE_PACKET_UNAVAILABLE" : s.failure ?? "CLINICIAN_REVIEW_REQUIRED",
        safetyFloor: floor, rejectedAnswer: released ? undefined : s.draft, modelCalls: agents.reduce((n, a) => n + a.modelCalls, 0), agents,
        checks, guidance, routingPolicy: ROUTING_POLICY_VERSION,
        usage: { inputTokens: agents.every(a => a.usage.inputTokens !== null) ? agents.reduce((n, a) => n + a.usage.inputTokens!, 0) : null,
          outputTokens: agents.every(a => a.usage.outputTokens !== null) ? agents.reduce((n, a) => n + a.usage.outputTokens!, 0) : null },
        graph: { version: GATES_RELEASE_VERSION, mode, frozenPacketHash: s.frozenPacketHash, gatesAdmission: admission, clinicalPolicyVersion: CLINICAL_POLICY_VERSION,
          context: s.context, contextAdmission: s.contextAdmission, safety: early.safety, safetyAdmission: early.admission,
          questionPublication: { status: publication.invalidQuestion ? "rejected_question_contract" : !publication.question ? "not_proposed" : publication.published ? "published" : publication.safety === "emergency" ? "suppressed_emergency" : publication.safety === "unavailable" ? "suppressed_safety_unavailable" : "not_published", blocksRouting: false },
          retrieval: s.retrieval, judge: null, release: released ? "gates_only" : "clinician_required", clinicalApproval: false,
          corrections: 0, careCorrectionReleased: false, sourceIntegrity: Boolean(s.draft && graphSourceIntegrity(s.draft, s.hits)), citations: released ? s.draft!.citations : [] },
      };
    }
    let draft = s.draft, judge: GraphJudge | null = null, reviewedDraftHash: string | null = null, corrections = 0, repair: RepairAudit | undefined;
    let beforeRepairCare: ReviewedCareSnapshot | null = null;
    let lastJudgeExecution: AgentExecution | undefined;
    let lastJudgePacket: ReturnType<typeof graphJudgePacket> | undefined;
    const contractFindings = () => draft ? [
      ...checkAnswer(answerFrom(draft, assessEmergencyTransport(draft, s.message, judge).binding), s.message, guidance, null).map(c => c.id === "no_unconfirmed_handoff" ? reviewHandoffLanguage(draft!, judge, reviewedDraftHash, c).check : c).filter(c => c.status === "fail" && c.id !== "response_concision"),
      ...(!routingFieldsValid(draft) ? [{ id: "routing_fields", status: "fail", detail: "Disposition and priority/work-type fields are inconsistent." }] : []),
      ...(!graphSourceIntegrity(draft, s.hits) ? [{ id: "exact_source_quote", status: "fail", detail: "A cited quotation or source identity does not match its supplied passage." }] : []),
    ] : [];
    async function judgeDraft() {
      const issued = (requestContext.get("issuedEvents") as (() => ResponseEvent[]) | undefined)?.() ?? [];
      const questions = issued.filter(e => e.kind === "intake_question");
      // Grade only patient-visible instructions. An internal preliminary async
      // classification is neither issued advice nor a handoff. Keep the raw
      // assessor output in the trace, but not in the judge's exposure packet.
      const packet = graphJudgePacket({ patient: s.message, draft: draft!, hits: s.hits, notice: early.notice, basis: early.safety?.basis, questions, contractFindings: contractFindings() });
      lastJudgePacket = packet;
      const { units } = packet;
      let execution = await call("judge", packet, signal, tracingContext, requestContext); agents.push(execution);
      // Same frozen packet, one recovery only after confirmed output truncation.
      // Never retry a valid negative verdict or treat partial JSON as approval.
      if (retryTruncatedJudge(execution, signal.aborted)) { execution = await call("judge", packet, signal, tracingContext, requestContext, true); agents.push(execution); }
      const value = execution.failure ? null : validateGraphJudge(execution.output, units, Boolean(draft?.citations.length), early.notice);
      lastJudgeExecution = execution;
      reviewedDraftHash = value ? sha256(JSON.stringify(draft)) : null;
      if (!value) { execution.failure ??= "JUDGE_CONTRACT_FAILED"; s.failure = execution.failure; }
      return value;
    }
    if (draft && mode !== "no-judge" && !signal.aborted) {
      judge = await judgeDraft();
      // Snapshot ONLY independently supported time-sensitive care before any
      // explanation repair. Its review never becomes a review of a new draft.
      beforeRepairCare = draft ? reviewedCareSnapshot(draft, judge, reviewedDraftHash, s.message, checkAnswer(answerFrom(draft, assessEmergencyTransport(draft, s.message, judge).binding), s.message, guidance, null), lastJudgeExecution) : null;
      // A mechanical defect needs the same bounded repair opportunity as a
      // review finding. Do not silently alter the judge's recorded verdict.
      if (judge && (judge.verdict === "revise" || judge.verdict === "accept" && (contractFindings().length || assessEmergencyTransport(draft, s.message, judge).status === "rejected"))) {
        // Repair a missing evidence dependency before rewriting. One bounded
        // cycle, no recursive research loop; preserve both retrieval packets.
        if (mode !== "no-retrieval" && judge.evidenceQueries.length) {
          const repairs = await Promise.all(judge.evidenceQueries.map((q, i) => traceGraphSearch(options.search, q, signal, tracingContext, "revision", i)));
          const retrieved = repairs.filter((r): r is Retrieval => Boolean(r));
          const pinned = s.hits.filter(h => draft?.citations.some(c => c.passageId === h.chunk.id));
          s.hits = selectGraphEvidence([...retrieved, ...s.retrieval], 12, pinned);
          s.retrieval.push(...retrieved);
          guidance = evidenceFor(s.hits);
        }
        const sources = s.hits.map(h => ({ id: h.chunk.id, kind: h.document.kind, scope: h.document.scope, text: h.chunk.text }));
        const findings = contractFindings();
        const transportFinding = assessEmergencyTransport(draft, s.message, judge);
        const allowed = nominateRepairFields(judge.repairTargets ?? [], findings, transportFinding.status === "rejected", draft);
        const fieldPatch = config.repairMode !== "full_regeneration";
        if (fieldPatch && !allowed.length) {
          // Retain the rejected draft/review, but do not pay for an impossible
          // patch or broaden permission to unrelated clinical fields.
          s.failure = "REPAIR_SCOPE_UNAVAILABLE";
          repair = { ...graphRepair.prepare(draft, sources, []), changedFields: [], resultDraftHash: null, status: "rejected", failure: s.failure };
        } else {
        corrections = 1;
        const execution = await call("disposition", { patient: s.message, previousDraft: draft, reviewerFeedback: judge, contractFindings: findings, transportFinding, sources,
          ...(fieldPatch ? { repairContract: graphRepair.prepare(draft, sources, allowed) } : {}) }, signal, tracingContext, requestContext); agents.push(execution);
        // A previous review is never applicable to a changed draft, including
        // transport/ownership helpers used when constructing the next packet.
        judge = null; reviewedDraftHash = null;
        if (fieldPatch) {
          const applied = graphRepair.apply(draft, sources, allowed, execution.output);
          repair = applied.audit; draft = applied.output;
          if (!draft) { s.failure = execution.failure ?? repair.failure; repair.failure = s.failure; }
        } else {
          const revised = draftSchema.safeParse(execution.output); draft = revised.success ? revised.data : null;
        }
        if (draft) judge = await judgeDraft(); else judge = null;
        }
      }
    }
    const integrity = draft ? graphSourceIntegrity(draft, s.hits) : false;
    const transportAdmission = assessEmergencyTransport(draft, s.message, judge), transport = transportAdmission.binding;
    const rawChecks = draft ? checkAnswer(answerFrom(draft, transport), s.message, guidance, null) : [];
    const rawHandoff = rawChecks.find(c => c.id === "no_unconfirmed_handoff");
    const ownershipReview = draft && rawHandoff ? reviewHandoffLanguage(draft, judge, reviewedDraftHash, rawHandoff) : null;
    const checks = rawChecks.map(c => c.id === "no_unconfirmed_handoff" && ownershipReview ? ownershipReview.check : c);
    checks.push({ id: "emergency_transport", status: transportAdmission.status === "legacy" ? "not_assessed" : transportAdmission.status === "admitted" ? "pass" : "fail", detail: `${transportAdmission.code}: typed transport intent and independent review are bound to patient and draft quotations; this is not externally verified EMS activation or clinical validation.` });
    const contractOk = draft && transportAdmission.status !== "rejected" && routingFieldsValid(draft) && integrity && checks.filter(c => c.status === "fail" && c.id !== "response_concision").length === 0;
    const transportOnly = reducesEmergencyTransport(early.notice, draft ? { disposition: draft.disposition, directive: draft.patientMessage, emergencyTransport: transport } : null);
    const lowerThanEarly = early.notice && (transportOnly || (early.notice.disposition === "EMERGENCY_NOW" ? draft?.disposition !== "EMERGENCY_NOW" : draft?.disposition === "ASYNC_PHYSICIAN" || draft?.disposition === "SELF_CARE"));
    const issuedAction = ((requestContext.get("issuedEvents") as (() => ResponseEvent[]) | undefined)?.() ?? []).filter(e => e.kind === "action").at(-1);
    const alternativeChecks = [...checks, { id: "rag_source_integrity", status: integrity ? "pass" as const : "fail" as const, detail: "Cited passage identity and exact quote match; this does not establish claim support or applicability." }];
    const alternativeResult = draft && judge?.alternativeReconciliation && lastJudgePacket && lastJudgeExecution && early.notice && issuedAction?.kind === "action" && issuedAction.sequence
      && JSON.stringify(issuedAction.notice) === JSON.stringify(early.notice) && lastJudgeExecution.reviewInputBinding
      ? reconcileCareAlternative({ patient: s.message, draft, issued: { notice: early.notice, sequence: issuedAction.sequence }, reviewPacket: lastJudgePacket,
        reviews: [{ failure: lastJudgeExecution.failure, output: lastJudgeExecution.output, binding: { ...lastJudgeExecution.reviewInputBinding,
          noticeHash: sha256(JSON.stringify(early.notice)), noticeSequence: issuedAction.sequence, judgeHash: sha256(JSON.stringify(lastJudgeExecution.output)) } }],
        mechanical: { draftHash: sha256(JSON.stringify(draft)), checks: alternativeChecks }, cancelled: signal.aborted }, sha256) : null;
    const careAlternative: GraphCareAlternative | undefined = alternativeResult?.ok ? { proof: alternativeResult.reconciliation, packet: lastJudgePacket!, checks: alternativeChecks } : undefined;
    const correctionAllowed = Boolean(careAlternative || judge?.earlyAction === "unsupported" && judge.earlyCorrection && (transportOnly || early.notice?.disposition !== "EMERGENCY_NOW" || !isEmsInstruction(early.notice.directive) || judge.earlyCorrection.triggerMisattributedOrCorrected));
    const released = Boolean(!signal.aborted && contractOk && judge?.verdict === "accept" && (!lowerThanEarly || correctionAllowed));
    const correctedReviewedCare = !signal.aborted && !released ? reviewedCareCorrectionSnapshot(draft, judge, reviewedDraftHash, s.message, early.notice, checks, lastJudgeExecution) : null;
    const careCorrectionReleased = Boolean(correctedReviewedCare);
    let answer = released ? answerFrom(draft!, transport) : null;
    // A failed review requires operational follow-up, not a fabricated clinical
    // async priority. Without supported care there is no released answer.
    // Preserve supported early emergency/in-person care.
    // An exact quote cannot justify emergency care by itself. An unavailable
    // judge must not promote an unreviewed draft into a new safety floor; only
    // independently reviewed care criteria can survive an evidence/prose defect.
    const currentReviewedCare = signal.aborted ? null : reviewedCareSnapshot(draft, judge, reviewedDraftHash, s.message, checks, lastJudgeExecution);
    // A valid later review supersedes the snapshot, even when it rejects care.
    // Carry only after a failed repair/review, never on cancellation or a valid
    // later rejection. No explanation or citations are copied. An earlier,
    // weaker notice must not hide a subsequently reviewed emergency action.
    const carryReviewedCare = !signal.aborted && !judge && corrections > 0 ? beforeRepairCare : null;
    const supportedCare = currentReviewedCare ?? carryReviewedCare;
    const selectedCare = selectSupportedCare(early.notice, supportedCare);
    const floor = careCorrectionReleased ? { disposition: draft!.disposition, directive: graphCareDirective(draft!, transport) } : selectedCare.care ? { disposition: selectedCare.care.disposition, directive: selectedCare.care.directive } : null;
    if (!released && floor) {
      const route = floor.disposition;
      const directive = floor.directive;
      const preservedTransport = careCorrectionReleased ? transport : selectedCare.reviewedUsed ? supportedCare?.emergencyTransport : undefined;
      answer = { disposition: route as DispositionAnswer["disposition"], reviewPriority: route === "ASYNC_PHYSICIAN" ? careCorrectionReleased ? draft!.reviewPriority : "priority" : null, workType: route === "ASYNC_PHYSICIAN" ? careCorrectionReleased ? draft!.workType : "clinical_review" : null, reason: careCorrectionReleased ? PRESERVED_CARE_COPY.correctedReason : PRESERVED_CARE_COPY.reason, patientMessage: directive, ...(preservedTransport ? { emergencyTransport: { ...preservedTransport, directive } } : {}), differential: [], redFlags: [], vitalSigns: PRESERVED_CARE_COPY.vitalSigns, questions: [], evidence: [], evidenceLimitations: PRESERVED_CARE_COPY.evidenceLimitations };
    }
    const publication = requestContext.get("graphQuestionPublication") as QuestionState;
    const questionPublication: QuestionPublication = { status: publication.invalidQuestion ? "rejected_question_contract" : !publication.question ? "not_proposed" : publication.published ? "published" : publication.safety === "emergency" ? "suppressed_emergency" : publication.safety === "unavailable" ? "suppressed_safety_unavailable" : "not_published", blocksRouting: false };
    const graph: GraphMetadata = { version: GRAPH_VERSION, mode, clinicalPolicyVersion: CLINICAL_POLICY_VERSION, ...(s.factGraph ? { factGraph: s.factGraph } : {}), context: s.context, contextAdmission: s.contextAdmission, safety: early.safety, safetyAdmission: early.admission, questionPublication, transportAdmission, ...(ownershipReview ? { ownershipLanguageReview: ownershipReview.audit } : {}), ...(repair ? { repair } : {}), retrieval: s.retrieval, judge, release: released ? "model_reviewed" : "clinician_required", clinicalApproval: false, corrections, careCorrectionReleased, sourceIntegrity: integrity, citations: released ? draft!.citations : [] };
    if (early.wireConformance) graph.safetyWireConformance = early.wireConformance;
    if (released && careAlternative) graph.careAlternative = careAlternative;
    if (released && judge?.earlyAction === "unsupported" && lastJudgePacket) graph.careReviewPacket = lastJudgePacket;
    if (!released && correctedReviewedCare) graph.preservedCare = { ...correctedReviewedCare, origin: "current_review" };
    else if (!released && selectedCare.reviewedUsed && supportedCare) graph.preservedCare = { ...supportedCare, origin: currentReviewedCare ? "current_review" : "pre_repair_review" };
    if (beforeRepairCare) graph.careCarryForward = { ...beforeRepairCare, used: Boolean(!released && !careCorrectionReleased && carryReviewedCare && selectedCare.reviewedUsed) };
    const reconciliationReason = careAlternative?.proof.reason ?? judge?.earlyCorrection?.reason;
    // A correct stronger final instruction supersedes a deficient early one.
    // Record that correction rather than asking the producer to repair advice
    // it did not write. This never changes a recorded revise into acceptance.
    const correctsEarlierAction = lowerThanEarly || released && judge?.earlyAction === "unsupported" && Boolean(judge.earlyCorrection);
    const reconciliation: CareReconciliation | undefined = (released || careCorrectionReleased) && correctsEarlierAction && answer && early.notice && reconciliationReason ? { policy: RECONCILIATION_POLICY, status: "revised", from: { disposition: early.notice.disposition, directive: early.notice.directive }, to: { disposition: answer.disposition, directive: answer.patientMessage }, reason: reconciliationReason } : undefined;
    if (!signal.aborted) { if (reconciliation) emit?.({ kind: "care_revision", reconciliation }); if (released && answer) emit?.({ kind: "patient_reply", disposition: answer.disposition, text: answer.patientMessage, ...(transport ? { emergencyTransport: transport } : {}) }); }
    return { status: released ? "complete" : "review_required", answer, reconciliation, origin: released ? "agent" : "validation_safeguard", modelCalls: agents.reduce((n, a) => n + a.modelCalls, 0), agents, guidance, safetyFloor: released ? null : floor, rejectedAnswer: released ? undefined : draft, failure: released ? null : s.failure ?? "CLINICIAN_REVIEW_REQUIRED", routingPolicy: ROUTING_POLICY_VERSION,
      checks: [...checks, { id: "rag_source_integrity", status: integrity ? "pass" : "fail", detail: "Cited passage identity and exact quote match; this does not establish claim support or applicability." }, { id: "independent_review", status: judge?.verdict === "accept" ? "pass" : "fail", detail: modelReviewDetail(judge?.verdict === "accept", agents.filter(a => a.role === "disposition").at(-1)?.model, lastJudgeExecution?.model) }, { id: "care_reconciliation", status: !lowerThanEarly ? "not_assessed" : correctionAllowed ? "pass" : "fail", detail: !lowerThanEarly ? "No reduction of already-issued care setting or emergency transport was requested." : correctionAllowed ? "The independent reviewer explicitly justified the reduced care instruction; the prior instruction remains in the audit history." : "Application withheld a reduction of already-issued care setting or emergency transport because an explicit bound correction is missing. This is a reconciliation-contract failure, not an absent or rejected judge verdict." }],
      ...(signal.aborted ? { failure: "RUN_CANCELLED" } : {}), usage: { inputTokens: agents.every(a => a.usage.inputTokens !== null) ? agents.reduce((n, a) => n + a.usage.inputTokens!, 0) : null, outputTokens: agents.every(a => a.usage.outputTokens !== null) ? agents.reduce((n, a) => n + a.usage.outputTokens!, 0) : null }, graph };
  } });
  return createWorkflow({ id: "clinical-evidence-graph", inputSchema, outputSchema: z.custom<Assessment>() }).then(initialize).parallel([safety, clinical]).then(review).commit();
}
