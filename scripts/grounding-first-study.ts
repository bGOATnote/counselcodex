/** EXPERIMENT ONLY. No retrieval, repairs, GUI mutation, or runtime prompt changes.
 * --plan --output=<fresh directory>
 * --live --output=<that frozen plan directory> --claim=<single-use authorization file>
 * Only the parent/operator dispatches --live. A failed producer is not replaced
 * with a historical draft to fill its judge slot. No automatic retry or resume.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import {
  assessEmergencyTransport, draftSchema, graphJudgePacket, graphJudgeSchema,
  graphPromptHash, graphSourceIntegrity, GRAPH_OUTPUT_LIMITS, GRAPH_VERSION,
  noticeFromSafety, reviewHandoffLanguage, selectGraphEvidence,
  validateGraphJudge, wireDraftSchema, type GraphJudge,
} from "../src/disposition/clinical-graph.ts";
import { GRAPH_INSTRUCTIONS, graphJudgeInstructions } from "../src/disposition/graph-prompts.ts";
import { checkAnswer, type DispositionAnswer, type DispositionRun, type Guidance, type ResponseEvent, type SafetyNotice } from "../src/disposition/contract.ts";
import { hasUnconditional911Opening, reducesEmergencyTransport, type ReviewedEmergencyTransport } from "../src/disposition/care-setting.ts";
import { routingFieldsValid } from "../src/disposition/routing-policy.ts";
import { resolveSourceQuoteReferences, sourceWithQuoteSpans } from "../src/disposition/source-quote-refs.ts";
import { consumeStructuredStream, safetyEnvelopeTransport, type ModelTransportResult } from "../src/disposition/transport.ts";
import { EXECUTION_POLICY, requestDeadline } from "../src/disposition/execution-policy.ts";
import { STUDY_PRICING } from "../src/evaluation/clinical-study-budget.ts";
import { sha256, type Hit } from "../src/evidence/rag/model.ts";
import type { GraphConfig } from "../src/disposition/graph-config.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const protocol = "grounding-first-fixed-producer/v1";
const expectedPromptHash = "416b51345cfb995c8114f61d02309f54bd4b7b2a18027c237ede989d0ccc953e";
const arms = ["baseline", "grounding_first"] as const;
type Arm = typeof arms[number];
type Draft = z.infer<typeof draftSchema>;
const identifiers = [
  { id: "C30", runId: "8eba97f2-81ab-4406-a82e-9d2b008194f5", judgePacketHash: "6c5091847a55882582bf4ec046aec94929c54401f694517d91fecdc5967e60e2", producerPacketHash: "4c2014e5e0fc79ccf0a72c048c18f87cf43dfa875d90285fbb7f9097ce9c0eef" },
  { id: "C02", runId: "4c34d547-34e0-461b-a53e-59dddee5c094", judgePacketHash: "253af56339f693adf39dbd1b301d966625c5479492428bf61fae06c1d46d9748", producerPacketHash: "e0a1ab0e3a38ed59c4e4db7c8680848b397edf802588af5ce038968ec683e901" },
  { id: "C50", runId: "7ce06a63-a61d-497d-9a07-a21685080bf4", judgePacketHash: "a3827022175e5b0f9231ec109a0537ac2c69c6265c46f1366e32c46aadd94be9", producerPacketHash: "61c176534735414a8f2ea8aca80e0d3ad5b5acf7123f44748e48d50c5893c869" },
  { id: "activeEMS", runId: "d0a6dbe9-00bd-4af9-9597-6a06942723ba", judgePacketHash: "d973fd69344362ac3c84a88d42c737a2fb3c465900d60a50c2243c2e4e92f95c", producerPacketHash: "da4b297bd38416e807d64339c3f7123cc0a9bdcfe11d4136a8c74d7b718f4bbc" },
] as const;
const constructionInstruction = "Construction order: populate patient-grounded red flags and vital signs first, then scoped citations and differential, then routing and reason. Write patientMessage last, summarizing only those represented findings, unknowns, supported claims and care action; do not introduce additional patient history, diagnostic qualifiers, service capabilities or commitments.";
const fieldOrder = ["redFlags", "vitalSigns", "citations", "differential", "disposition", "reviewPriority", "workType", "transportIntent", "reason", "questions", "evidenceLimitations", "patientMessage"] as const;
const candidateSchema = z.object(Object.fromEntries(fieldOrder.map(key => [key, wireDraftSchema.shape[key]]))).strict();
const producerSchemas = { baseline: wireDraftSchema, grounding_first: candidateSchema };

function requireTrue(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const digest = (value: unknown) => sha256(JSON.stringify(value));
const fileHash = (path: string) => sha256(readFileSync(resolve(root, path)));
// Property order and JSON-Schema required-array order do not change semantics.
// All other array order and values remain fixed in this comparison.
function canonical(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return (key === "required" ? [...value].sort() : value).map(v => canonical(v));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v, k)]));
  return value;
}
function sourcesFor(hits: Hit[]) {
  // Exact production first-producer mapping and insertion order. Source IDs,
  // selectable quote IDs and adjacent context are not rewritten by this study.
  return hits.map(h => ({ id: h.chunk.id, title: h.document.title, kind: h.document.kind, review: h.document.reviewStatus, date: h.document.publicationDate, currency: h.document.currency, scope: h.document.scope, section: h.chunk.sectionTitle, before: h.context.before, text: h.chunk.text, after: h.context.after }));
}
function evidenceFor(hits: Hit[]): Guidance[] {
  return hits.map(h => ({ id: h.chunk.id, title: h.document.title, url: h.document.url, section: h.chunk.sectionTitle, summary: h.chunk.text, reviewedAt: h.document.reviewDate ?? "not assessed",
    projectInterpretation: `${h.document.kind}; ${h.document.reviewStatus}. ${h.document.scope}`, retrievedPassages: [{ id: h.chunk.id, sourceId: h.document.id, excerpt: h.chunk.text, excerptSha256: h.chunk.hash, retrievedAt: h.document.retrievedAt, sourceContentHash: h.document.rawHash, kind: h.document.kind, limitations: h.document.scope }] }));
}
function answerFrom(draft: Draft, emergencyTransport?: ReviewedEmergencyTransport): DispositionAnswer {
  const { citations, transportIntent: _intent, ...rest } = draft;
  return { ...rest, ...(emergencyTransport ? { emergencyTransport } : {}), evidence: citations.map(c => ({ sourceId: c.passageId, claim: c.claim })) };
}
function contractFindings(patient: string, draft: Draft, hits: Hit[], judge: GraphJudge | null = null) {
  const draftHash = judge ? digest(draft) : null;
  return [
    ...checkAnswer(answerFrom(draft, assessEmergencyTransport(draft, patient, judge).binding), patient, evidenceFor(hits), null)
      .map(c => c.id === "no_unconfirmed_handoff" ? reviewHandoffLanguage(draft, judge, draftHash, c).check : c)
      .filter(c => c.status === "fail" && c.id !== "response_concision"),
    ...(!routingFieldsValid(draft) ? [{ id: "routing_fields", status: "fail", detail: "Disposition and priority/work-type fields are inconsistent." }] : []),
    ...(!graphSourceIntegrity(draft, hits) ? [{ id: "exact_source_quote", status: "fail", detail: "A cited quotation or source identity does not match its supplied passage." }] : []),
  ];
}

function reconstructCase(identity: typeof identifiers[number]) {
  const runPath = `apps/evaluation/.local/clinical-evidence-graph-v1/runs/${identity.runId}.json`;
  const eventPath = `apps/evaluation/.local/clinical-evidence-graph-v1/events/${identity.runId}.jsonl`;
  const run = JSON.parse(readFileSync(resolve(root, runPath), "utf8")) as DispositionRun;
  const events = readFileSync(resolve(root, eventPath), "utf8").trim().split("\n").map(line => JSON.parse(line));
  const started = events.find(e => e.type === "started") as { config: GraphConfig; promptHash: string; version: string; message: string; runId: string } | undefined;
  requireTrue(started && run.graph && run.graph.contextAdmission, `${identity.id}:MISSING_RECONSTRUCTION_MATERIAL`);
  requireTrue(run.agents && run.responseEvents && run.safetyNotices, `${identity.id}:EXECUTION_JOURNAL_MISSING`);
  requireTrue(run.runId === identity.runId && started.runId === identity.runId && started.message === run.message && sha256(run.message) === run.inputHash, `${identity.id}:PATIENT_IDENTITY_MISMATCH`);
  requireTrue(started.version === "evidence-graph/v22" && GRAPH_VERSION === started.version && started.promptHash === expectedPromptHash && run.promptHash === expectedPromptHash && graphPromptHash(started.config) === expectedPromptHash, `${identity.id}:V22_PROMPT_SCHEMA_DRIFT`);
  requireTrue(started.config.models.disposition === "anthropic/claude-opus-5" && started.config.models.judge === "openai/gpt-6-astra" && started.config.judgeStyle === "full" && started.config.factGraphMode === "off", `${identity.id}:MODEL_CONFIGURATION_MISMATCH`);
  const queries = run.graph.contextAdmission.queries;
  const retrieval = run.graph.retrieval.slice(0, queries.length);
  requireTrue(queries.length > 0 && digest(retrieval.map(r => r.query)) === digest(queries), `${identity.id}:INITIAL_RETRIEVAL_NOT_RECONSTRUCTABLE`);
  const hits = selectGraphEvidence(retrieval, 9), sources = sourcesFor(hits);
  requireTrue(hits.length > 0 && hits.every(h => sha256(h.chunk.text) === h.chunk.hash), `${identity.id}:SOURCE_IDENTITY_MISMATCH`);
  const producer = run.agents.find(a => a.role === "disposition");
  const reviewer = run.agents.find(a => a.role === "critic");
  requireTrue(producer && !producer.failure && producer.rawOutput && reviewer?.reviewInputBinding, `${identity.id}:FIRST_EXECUTION_MISSING`);
  const historicalDraft = draftSchema.parse(producer.output);
  const roundtrip = draftSchema.parse(resolveSourceQuoteReferences(wireDraftSchema.parse(producer.rawOutput), sources));
  requireTrue(digest(roundtrip) === digest(producer.output), `${identity.id}:ORIGINAL_QUOTE_ID_ROUNDTRIP_FAILED`);
  const notice = noticeFromSafety(run.graph.safety, run.message);
  requireTrue(digest(notice ? [notice] : []) === digest(run.safetyNotices), `${identity.id}:EARLY_NOTICE_MISMATCH`);
  const questions = run.responseEvents.filter(e => e.kind === "intake_question").map(({ elapsedMs: _elapsed, sequence: _sequence, ...event }) => event) as ResponseEvent[];
  const firstJudgePacket = graphJudgePacket({ patient: run.message, draft: historicalDraft, hits, notice, basis: run.graph.safety?.basis, questions, contractFindings: contractFindings(run.message, historicalDraft, hits) });
  requireTrue(reviewer.reviewInputBinding.patientHash === run.inputHash && reviewer.reviewInputBinding.draftHash === digest(historicalDraft)
    && digest(firstJudgePacket) === identity.judgePacketHash && reviewer.reviewInputBinding.packetHash === identity.judgePacketHash, `${identity.id}:ORIGINAL_JUDGE_PACKET_HASH_MISMATCH`);
  const producerPacket = { patient: run.message, context: run.graph.context, sources: sources.map(sourceWithQuoteSpans) };
  requireTrue(digest(producerPacket) === identity.producerPacketHash && Buffer.byteLength(JSON.stringify(producerPacket)) <= 60_000, `${identity.id}:PRODUCER_PACKET_MISMATCH`);
  return { ...identity, runPath, eventPath, runFileHash: fileHash(runPath), eventFileHash: fileHash(eventPath), config: started.config,
    patient: run.message, patientHash: run.inputHash, context: run.graph.context, initialQueries: queries, hits, sources, producerPacket,
    judgeExposure: { notice, basis: run.graph.safety?.basis, questions },
    historical: { firstProducer: producer, firstJudge: reviewer, firstJudgePacket },
    verification: { patientIdentity: true, v22PromptsAndSchemas: true, initialQueryOrder: true, sourceTextHashes: true, originalWireQuoteRoundtrip: true, originalFirstJudgePacketHash: true,
      provenance: "Deterministic reconstruction, not an originally captured producer HTTP body. Original v22 global prompt/schema hash, source order, original wire-to-canonical quote mapping and exact first-review packet hash independently agree." },
  };
}
type FixedCase = ReturnType<typeof reconstructCase>;

function implementationFiles() {
  return ["scripts/grounding-first-study.ts", "src/evidence/rag/model.ts", "src/evaluation/clinical-study-budget.ts", "package.json", "package-lock.json",
    ...readdirSync(resolve(root, "src/disposition")).filter(name => name.endsWith(".ts")).map(name => `src/disposition/${name}`)]
    .sort().map(path => ({ path, hash: fileHash(path) }));
}
function makePlan() {
  requireTrue(digest(Object.keys(wireDraftSchema.shape).sort()) === digest([...fieldOrder].sort()), "FIELD_SET_CHANGED");
  requireTrue(digest(canonical(wireDraftSchema.toJSONSchema())) === digest(canonical(candidateSchema.toJSONSchema())), "SCHEMA_SEMANTICS_CHANGED");
  const cases = identifiers.map(reconstructCase);
  const prompts = { baseline: GRAPH_INSTRUCTIONS.disposition, grounding_first: `${GRAPH_INSTRUCTIONS.disposition}\n\n${constructionInstruction}`, judge: graphJudgeInstructions("full") };
  return { protocol, createdAt: new Date().toISOString(), runtime: { node: process.version, icu: process.versions.icu }, implementation: implementationFiles(),
    authorization: { reference: "Parent/operator allocation within user-authorized September 14 $40 sprint; parent alone dispatches paid calls. September 14 correction reduces base provider estimate allocation to $5 and reserves an additional 25% contingency in the parent ledger.", totalUSD: 40, priorAccountedUSD: 22.703963, guiAllocationUSD: 9.869792, safetyStudyAllocationUSD: 1, experimentCapUSD: 5, parentContingencyMultiplier: 1.25, maximumIncrementIncludingContingencyUSD: 6.25, maximumCalls: 16 },
    models: { producer: "anthropic/claude-opus-5", judge: "openai/gpt-6-astra" }, pricing: STUDY_PRICING,
    settings: { maxRetries: 0, maxSteps: 1, producerMaxOutputTokens: GRAPH_OUTPUT_LIMITS.disposition, judgeMaxOutputTokens: GRAPH_OUTPUT_LIMITS.judge, timeoutMs: EXECUTION_POLICY.modelTimeoutMs, producerProviderOptions: { anthropic: { thinking: { type: "adaptive" }, effort: "low" } }, judgeProviderOptions: { openai: { reasoningEffort: "low" } } },
    prompts, promptHashes: Object.fromEntries(Object.entries(prompts).map(([key, prompt]) => [key, sha256(prompt)])),
    schemas: { baseline: wireDraftSchema.toJSONSchema(), grounding_first: candidateSchema.toJSONSchema(), canonical: draftSchema.toJSONSchema(), judge: graphJudgeSchema.toJSONSchema() },
    constructionInstruction, fieldOrder, canonicalJudgeDraftOrder: Object.keys(draftSchema.shape), cases,
    schedule: cases.flatMap((f, index) => (index % 2 ? [...arms].reverse() : [...arms]).map(arm => ({ id: f.id, arm }))),
    targets: { primary: "First-pass full independent-judge acceptance and unchanged contract/transport/early-action release eligibility, all eight planned producer attempts as denominator",
      secondary: ["First-producer transport completion and output-contract validity", "Exact source identity/quote validity separately from patient_grounding and claim_support judge criteria", "Per-case paired producer latency and producer-plus-judge latency; failures and incomplete pairs retained", "No added first-pass material errors, with adverse findings retained for operator review"],
      promotion: "Experiment only; no automatic promotion, runtime changes, clinical approval or inference of population-level lift from four selected development cases." },
    scope: "One new first-producer draw per arm for each of four fixed v22 GUI inputs. Same frozen context, source passages/quote IDs, early notice, issued questions, canonical judge field order and full materiality judge. Only producer output-property order and one construction-order instruction differ. No context/safety/retrieval calls, RAG database, repair, judge retry, response publishing, or physician-reference changes. This is not an end-to-end GUI latency or clinical validation study.",
    failurePolicy: "No retries or resume. A failed/invalid producer remains failed and its judge is explicitly not dispatched; no historical draft substitution. Missing usage retains the entire conservative reservation. Call cap and per-call dollar reservations can stop dispatch before sixteen calls; skipped slots remain in the planned denominator.",
  };
}
type Plan = ReturnType<typeof makePlan>;
type Outcome = { id: string; arm: Arm; runId: string; status: string; producerMs: number | null; judgeMs: number | null; totalMs: number | null; pairWallMs: number; validDraft: boolean; exactSourceQuotes: boolean | null; patientGrounding: string | null; claimSupport: string | null; validJudge: boolean; judgeAccepted: boolean; releaseEligible: boolean; failure: string | null; judgeSkipped: string | null };

function releaseEvaluation(f: FixedCase, draft: Draft, judge: GraphJudge | null) {
  const transport = assessEmergencyTransport(draft, f.patient, judge);
  const findings = contractFindings(f.patient, draft, f.hits, judge);
  const early = f.judgeExposure.notice;
  const transportOnly = reducesEmergencyTransport(early, { disposition: draft.disposition, directive: draft.patientMessage, emergencyTransport: transport.binding });
  const lowerThanEarly = early && (transportOnly || (early.disposition === "EMERGENCY_NOW" ? draft.disposition !== "EMERGENCY_NOW" : draft.disposition === "ASYNC_PHYSICIAN" || draft.disposition === "SELF_CARE"));
  const correctionAllowed = judge?.earlyAction === "unsupported" && judge.earlyCorrection && (transportOnly || early?.disposition !== "EMERGENCY_NOW" || !hasUnconditional911Opening(early.directive) || judge.earlyCorrection.triggerMisattributedOrCorrected);
  return { transport, findings, lowerThanEarly: Boolean(lowerThanEarly), correctionAllowed: Boolean(correctionAllowed), releaseEligible: Boolean(judge?.verdict === "accept" && transport.status !== "rejected" && findings.length === 0 && (!lowerThanEarly || correctionAllowed)) };
}
function median(values: number[]) { const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2); return sorted.length ? sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2 : null; }
function summarize(plan: Plan, rows: Outcome[], calls: number, accountedUSD: number, stopped: string | null) {
  const byArm = Object.fromEntries(arms.map(arm => { const r = rows.filter(row => row.arm === arm); return [arm, { plannedProducerAttempts: plan.cases.length, recordedAttempts: r.length, validDrafts: r.filter(x => x.validDraft).length, validJudges: r.filter(x => x.validJudge).length, judgeAccepted: r.filter(x => x.judgeAccepted).length, releaseEligible: r.filter(x => x.releaseEligible).length,
    observedProducerMedianMs: median(r.flatMap(x => x.producerMs === null ? [] : [x.producerMs])), completedProducerAndJudgeMedianMs: median(r.flatMap(x => x.totalMs === null ? [] : [x.totalMs])), completedProducerAndJudgeCount: r.filter(x => x.totalMs !== null).length }]; }));
  const pairs = plan.cases.map(f => { const baseline = rows.find(r => r.id === f.id && r.arm === "baseline"), candidate = rows.find(r => r.id === f.id && r.arm === "grounding_first"); return { id: f.id, runId: f.runId, complete: Boolean(baseline?.totalMs != null && candidate?.totalMs != null), producerDeltaMs: baseline?.producerMs != null && candidate?.producerMs != null ? candidate.producerMs - baseline.producerMs : null, totalDeltaMs: baseline?.totalMs != null && candidate?.totalMs != null ? candidate.totalMs - baseline.totalMs : null }; });
  return { protocol, calls, plannedCalls: 16, accountedUSD, experimentRemainingUSD: plan.authorization.experimentCapUSD - accountedUSD, parentLedgerIncrementIncludingContingencyUSD: accountedUSD * plan.authorization.parentContingencyMultiplier, parentSprintLedgerReconciliationRequired: true, stopped, byArm, pairs, rows, clinicalApproval: false,
    interpretation: "Negative deltas favor grounding-first. Conditional completed-call latency is not an all-attempt success metric. A schema/source check is not semantic grounding or clinical correctness. Four selected development cases, one draw per arm; no held-out or statistical superiority claim." };
}

async function main() {
  const args = process.argv.slice(2), planning = args.includes("--plan"), live = args.includes("--live");
  requireTrue(planning !== live, "CHOOSE_EXACTLY_ONE_OF_PLAN_OR_LIVE");
  requireTrue(args.every(a => a === "--plan" || a === "--live" || a.startsWith("--output=") || a.startsWith("--claim=")), "UNKNOWN_ARGUMENT");
  const outputArg = args.find(a => a.startsWith("--output="))?.slice(9);
  requireTrue(outputArg, "EXPLICIT_OUTPUT_REQUIRED");
  const directory = resolve(outputArg);
  const write = (name: string, value: unknown) => writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  if (planning) {
    requireTrue(!existsSync(directory), "FRESH_PLAN_OUTPUT_REQUIRED");
    const plan = makePlan();
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    write("manifest.json", { ...plan, fingerprint: digest(plan) });
    console.log(JSON.stringify({ directory, plannedCalls: 16, paidCalls: 0, fingerprint: digest(plan), reconstructedCases: plan.cases.map(f => ({ id: f.id, runId: f.runId, producerPacketHash: f.producerPacketHash, judgePacketHash: f.judgePacketHash })) }));
    return;
  }
  const frozen = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")) as Plan & { fingerprint: string };
  const { fingerprint, ...plan } = frozen;
  requireTrue(plan.protocol === protocol && digest(plan) === fingerprint, "PLAN_FINGERPRINT_MISMATCH");
  requireTrue(plan.runtime.node === process.version && plan.runtime.icu === process.versions.icu, "RUNTIME_CHANGED_REPLAN_REQUIRED");
  requireTrue(readdirSync(directory).length === 1 && existsSync(join(directory, "manifest.json")), "PLAN_ALREADY_USED_OR_OUTPUT_NOT_EMPTY");
  for (const file of plan.implementation) requireTrue(fileHash(file.path) === file.hash, `IMPLEMENTATION_CHANGED:${file.path}`);
  requireTrue(digest(plan.cases) === digest(identifiers.map(reconstructCase)), "FROZEN_CASE_RECONSTRUCTION_CHANGED");
  const claimArg = args.find(a => a.startsWith("--claim="))?.slice(8);
  requireTrue(claimArg, "EXPLICIT_SINGLE_USE_CLAIM_REQUIRED");
  const claim = resolve(claimArg);
  requireTrue(!existsSync(claim), "ALLOCATION_ALREADY_CLAIMED");
  // Both this allocation marker and the plan-local marker are create-only.
  writeFileSync(claim, JSON.stringify({ protocol, directory, fingerprint, authorization: plan.authorization, at: new Date().toISOString() }) + "\n", { flag: "wx", mode: 0o600 });
  write("live-claim.json", { claim, fingerprint, at: new Date().toISOString() });
  let calls = 0, accountedUSD = 0, stopped: string | null = null;
  const rows: Outcome[] = [];
  async function call(role: "producer" | "judge", arm: Arm, id: string, packet: unknown): Promise<ModelTransportResult> {
    const schema: z.ZodType = role === "judge" ? graphJudgeSchema : producerSchemas[arm];
    const instructions = role === "judge" ? plan.prompts.judge : plan.prompts[arm], prompt = JSON.stringify(packet);
    requireTrue(Buffer.byteLength(prompt) <= 60_000, "PROMPT_LIMIT_EXCEEDED");
    const model = plan.models[role], price = STUDY_PRICING.models[model as keyof typeof STUDY_PRICING.models];
    requireTrue(price, "UNPRICED_MODEL");
    const limit = role === "judge" ? plan.settings.judgeMaxOutputTokens : plan.settings.producerMaxOutputTokens;
    // UTF-8 byte upper bound plus schema/instruction/framing allowance; unknown
    // billed tokens remain reserved. No cache discounts or skipped-call credit.
    const reservation = (Buffer.byteLength(prompt + instructions + JSON.stringify(schema.toJSONSchema())) + 8192) * price.input / 1e6 + limit * price.output / 1e6;
    requireTrue(calls < 16 && accountedUSD + reservation <= plan.authorization.experimentCapUSD, "EXPERIMENT_ALLOCATION_EXHAUSTED");
    const index = ++calls;
    accountedUSD += reservation;
    write(`${index}-started.json`, { id, arm, role, model, packet, packetHash: sha256(prompt), instructionsHash: sha256(instructions), schemaHash: digest(schema.toJSONSchema()), reservationUSD: reservation, accountedUSD, at: new Date().toISOString() });
    const agent = new Agent({ id: `grounding-study-${role}-${arm}`, name: `Fixed study ${role}`, model: model as `${string}/${string}`, instructions, maxRetries: 0 });
    const deadline = requestDeadline(new AbortController().signal, plan.settings.timeoutMs);
    const execution = await consumeStructuredStream({ signal: deadline.signal, start: abortSignal => agent.stream(prompt, {
      abortSignal, structuredOutput: { schema: safetyEnvelopeTransport(schema, z.unknown()), errorStrategy: "strict" }, maxSteps: 1,
      modelSettings: { maxOutputTokens: limit, maxRetries: 0 },
      providerOptions: role === "producer" ? { anthropic: { thinking: { type: "adaptive" as const }, effort: "low" as const } } : { openai: { reasoningEffort: "low" as const } },
      tracingOptions: { hideInput: true, hideOutput: true },
    }) }).finally(() => deadline.dispose());
    const cost = execution.usage.inputTokens === null || execution.usage.outputTokens === null ? null : (execution.usage.inputTokens * price.input + execution.usage.outputTokens * price.output) / 1e6;
    if (cost !== null) accountedUSD += cost - reservation;
    write(`${index}-result.json`, { id, arm, role, execution, estimatedUSD: cost, accountedUSD });
    console.log(JSON.stringify({ index, id, arm, role, failure: execution.failure, ms: execution.durationMs, firstTextMs: execution.firstTextDeltaMs, estimatedUSD: cost, accountedUSD }));
    requireTrue(accountedUSD <= plan.authorization.experimentCapUSD, "USAGE_EXCEEDED_RESERVATION_STOP");
    return execution;
  }
  try {
    const envPath = resolve(root, ".env");
    const env = existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : {};
    for (const key of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]) process.env[key] ||= env[key];
    requireTrue(process.env.OPENAI_API_KEY && process.env.ANTHROPIC_API_KEY, "PROVIDER_KEYS_MISSING");
    for (const slot of plan.schedule) {
      const f = plan.cases.find(c => c.id === slot.id)!;
      const began = performance.now();
      const row: Outcome = { id: f.id, arm: slot.arm, runId: f.runId, status: "failed", producerMs: null, judgeMs: null, totalMs: null, pairWallMs: 0, validDraft: false, exactSourceQuotes: null, patientGrounding: null, claimSupport: null, validJudge: false, judgeAccepted: false, releaseEligible: false, failure: null, judgeSkipped: null };
      try {
        const producer = await call("producer", slot.arm, f.id, f.producerPacket);
        row.producerMs = producer.durationMs ?? null;
        let draft: Draft | null = null;
        if (!producer.failure) {
          try {
            requireTrue(producerSchemas[slot.arm].safeParse(producer.output).success, "WIRE_SCHEMA_FAILED");
            // Identical canonical order for the judge in BOTH arms, so output
            // ordering is tested only at the producer's construction boundary.
            draft = draftSchema.parse(resolveSourceQuoteReferences(wireDraftSchema.parse(producer.output), f.sources));
            row.validDraft = true;
            row.exactSourceQuotes = graphSourceIntegrity(draft, f.hits);
          } catch { row.failure = "PRODUCER_WIRE_OR_SOURCE_REFERENCE_FAILED"; }
        } else row.failure = producer.failure;
        if (!draft) row.judgeSkipped = "No valid new first draft; historical answer is never substituted.";
        else {
          const packet = graphJudgePacket({ patient: f.patient, draft, hits: f.hits, ...f.judgeExposure, contractFindings: contractFindings(f.patient, draft, f.hits) });
          write(`${f.id}-${slot.arm}-draft.json`, { draft, draftHash: digest(draft), rawKeyOrder: producer.output && typeof producer.output === "object" ? Object.keys(producer.output) : [], judgePacket: packet, judgePacketHash: digest(packet), patientHash: f.patientHash });
          const execution = await call("judge", slot.arm, f.id, packet);
          row.judgeMs = execution.durationMs ?? null;
          row.totalMs = row.producerMs !== null && row.judgeMs !== null ? row.producerMs + row.judgeMs : null;
          const judge = execution.failure ? null : validateGraphJudge(execution.output, packet.units, Boolean(draft.citations.length), f.judgeExposure.notice as SafetyNotice | null);
          row.validJudge = Boolean(judge);
          row.patientGrounding = judge?.criteria.find(c => c.id === "patient_grounding")?.verdict ?? null;
          row.claimSupport = judge?.criteria.find(c => c.id === "claim_support")?.verdict ?? null;
          row.judgeAccepted = judge?.verdict === "accept";
          const release = releaseEvaluation(f, draft, judge);
          row.releaseEligible = release.releaseEligible;
          row.failure = execution.failure ?? (!judge ? "JUDGE_CONTRACT_FAILED" : null);
          row.status = row.releaseEligible ? "accepted" : judge ? "review_not_accepted" : "failed";
          write(`${f.id}-${slot.arm}-review.json`, { judge, rawOutput: execution.output, reviewInputBinding: { patientHash: f.patientHash, draftHash: digest(draft), packetHash: digest(packet) }, release });
        }
      } catch (error) {
        row.failure = error instanceof Error ? error.message : "EXPERIMENT_EXECUTION_FAILED";
        row.judgeSkipped ??= row.judgeMs === null ? "Dispatch stopped; no fabricated review." : null;
        stopped = row.failure;
      } finally {
        row.pairWallMs = Math.round(performance.now() - began);
        rows.push(row);
        write(`${f.id}-${slot.arm}-outcome.json`, row);
      }
      if (stopped) break;
    }
  } catch (error) { stopped = error instanceof Error ? error.message : "EXPERIMENT_SETUP_FAILED"; }
  finally {
    for (const slot of plan.schedule) if (!rows.some(r => r.id === slot.id && r.arm === slot.arm)) {
      const row: Outcome = { id: slot.id, arm: slot.arm, runId: plan.cases.find(f => f.id === slot.id)!.runId, status: "not_dispatched", producerMs: null, judgeMs: null, totalMs: null, pairWallMs: 0, validDraft: false, exactSourceQuotes: null, patientGrounding: null, claimSupport: null, validJudge: false, judgeAccepted: false, releaseEligible: false, failure: stopped ?? "NOT_DISPATCHED", judgeSkipped: "No producer dispatched." };
      rows.push(row); write(`${row.id}-${row.arm}-outcome.json`, row);
    }
    write("summary.json", summarize(plan, rows, calls, accountedUSD, stopped));
  }
  if (stopped) process.exitCode = 1;
}

await main();
