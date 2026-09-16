/** EXPERIMENT ONLY. No retrieval, repairs, GUI mutation, or runtime prompt changes.
 * --plan --output=<fresh directory>
 * --live --output=<that frozen plan directory> --claim=<manifest fingerprint>
 * New $25 allocation INCLUDES a 1.25x cost contingency. No other authorization.
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
export const protocol = "producer-effort-fixed-packet/v1";
const expectedPromptHash = "416b51345cfb995c8114f61d02309f54bd4b7b2a18027c237ede989d0ccc953e";
export const arms = ["low", "medium"] as const;
export const trials = [1, 2] as const;
export const allocationUSD = 25;
export const contingencyMultiplier = 1.25;
export const maximumCalls = 48;
export type Arm = typeof arms[number];
type Draft = z.infer<typeof draftSchema>;
export const identifiers = [
  { id: "C30", runId: "8eba97f2-81ab-4406-a82e-9d2b008194f5", judgePacketHash: "6c5091847a55882582bf4ec046aec94929c54401f694517d91fecdc5967e60e2", producerPacketHash: "4c2014e5e0fc79ccf0a72c048c18f87cf43dfa875d90285fbb7f9097ce9c0eef" },
  { id: "C02", runId: "4c34d547-34e0-461b-a53e-59dddee5c094", judgePacketHash: "253af56339f693adf39dbd1b301d966625c5479492428bf61fae06c1d46d9748", producerPacketHash: "e0a1ab0e3a38ed59c4e4db7c8680848b397edf802588af5ce038968ec683e901" },
  { id: "C50", runId: "7ce06a63-a61d-497d-9a07-a21685080bf4", judgePacketHash: "a3827022175e5b0f9231ec109a0537ac2c69c6265c46f1366e32c46aadd94be9", producerPacketHash: "61c176534735414a8f2ea8aca80e0d3ad5b5acf7123f44748e48d50c5893c869" },
  { id: "activeEMS", runId: "d0a6dbe9-00bd-4af9-9597-6a06942723ba", judgePacketHash: "d973fd69344362ac3c84a88d42c737a2fb3c465900d60a50c2243c2e4e92f95c", producerPacketHash: "da4b297bd38416e807d64339c3f7123cc0a9bdcfe11d4136a8c74d7b718f4bbc" },
  { id: "C04", runId: "deba20d6-812e-4558-9dc3-f902c528ec5d", judgePacketHash: "88019d5973ac45b793c73950d839e7e8b617e123d0f8f65f492cfcf5f5844814", producerPacketHash: null },
  { id: "C01", runId: "822e69ce-65e2-4810-9e4e-64e86ef9b4eb", judgePacketHash: "34466dc539bd8583c409fcaa8cab9a90b4cab55ad7d7aeebc01beba64df61a0a", producerPacketHash: null },
] as const;

function requireTrue(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const digest = (value: unknown) => sha256(JSON.stringify(value));
const fileHash = (path: string) => sha256(readFileSync(resolve(root, path)));
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

export function reconstructCase(identity: typeof identifiers[number]) {
  const runPath = `outputs/continuation-gui-2026-09-14/capture-end8/runs/${identity.runId}.json`;
  const eventPath = `outputs/continuation-gui-2026-09-14/capture-end8/events/${identity.runId}.jsonl`;
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
  // graph-runtime's issuedEvents exposes its decorated journal to the judge.
  // Preserve even runId/elapsed/sequence: exact original packet binding decides.
  const questions = run.responseEvents.filter(e => e.kind === "intake_question") as ResponseEvent[];
  const firstJudgePacket = graphJudgePacket({ patient: run.message, draft: historicalDraft, hits, notice, basis: run.graph.safety?.basis, questions, contractFindings: contractFindings(run.message, historicalDraft, hits) });
  requireTrue(reviewer.reviewInputBinding.patientHash === run.inputHash && reviewer.reviewInputBinding.draftHash === digest(historicalDraft)
    && digest(firstJudgePacket) === identity.judgePacketHash && reviewer.reviewInputBinding.packetHash === identity.judgePacketHash, `${identity.id}:ORIGINAL_JUDGE_PACKET_HASH_MISMATCH`);
  const producerPacket = { patient: run.message, context: run.graph.context, sources: sources.map(sourceWithQuoteSpans) };
  requireTrue((identity.producerPacketHash === null || digest(producerPacket) === identity.producerPacketHash) && Buffer.byteLength(JSON.stringify(producerPacket)) <= 60_000, `${identity.id}:PRODUCER_PACKET_MISMATCH`);
  return { ...identity, producerPacketHash: digest(producerPacket), actor: identity.id === "C01" ? "unattributed; retained, not attributed to controlled operator" : "controlled GUI attempt", runPath, eventPath, runFileHash: fileHash(runPath), eventFileHash: fileHash(eventPath), config: started.config,
    patient: run.message, patientHash: run.inputHash, context: run.graph.context, initialQueries: queries, hits, sources, producerPacket,
    judgeExposure: { notice, basis: run.graph.safety?.basis, questions },
    historical: { firstProducer: producer, firstJudge: reviewer, firstJudgePacket },
    verification: { patientIdentity: true, v22PromptsAndSchemas: true, initialQueryOrder: true, sourceTextHashes: true, originalWireQuoteRoundtrip: true, originalFirstJudgePacketHash: true, priorProducerReconstructionHashAvailable: identity.producerPacketHash !== null,
      provenance: "Deterministic reconstruction, not an originally captured producer HTTP body. Original v22 global prompt/schema hash, source order, original wire-to-canonical quote mapping and exact first-review packet hash independently agree." },
  };
}
type FixedCase = ReturnType<typeof reconstructCase>;

function implementationFiles() {
  return ["scripts/producer-effort-study.ts", "tests/producer-effort-study.test.mjs", "src/evidence/rag/model.ts", "src/evaluation/clinical-study-budget.ts", "package.json", "package-lock.json",
    ...readdirSync(resolve(root, "src/disposition")).filter(name => name.endsWith(".ts")).map(name => `src/disposition/${name}`)]
    .sort().map(path => ({ path, hash: fileHash(path) }));
}
export function providerOptions(role: "producer" | "judge", arm: Arm): { anthropic: { thinking: { type: "adaptive" }; effort: Arm } } | { openai: { reasoningEffort: "low" } } {
  return role === "producer"
    ? { anthropic: { thinking: { type: "adaptive" as const }, effort: arm } }
    : { openai: { reasoningEffort: "low" as const } };
}
export function scheduleFor(cases: Array<{ id: string }>) {
  return trials.flatMap(trial => cases.flatMap((f, index) =>
    ((index + trial) % 2 === 1 ? [...arms] : [...arms].reverse()).map(arm => ({
      id: f.id, arm, trial, producerProviderOptions: providerOptions("producer", arm),
      producerProviderOptionsHash: digest(providerOptions("producer", arm)),
      judgeProviderOptions: providerOptions("judge", arm),
      judgeProviderOptionsHash: digest(providerOptions("judge", arm)),
    }))));
}
export function makePlan() {
  const cases = identifiers.map(reconstructCase);
  const prompts = { producer: GRAPH_INSTRUCTIONS.disposition, judge: graphJudgeInstructions("full") };
  return { protocol, createdAt: new Date().toISOString(), runtime: { node: process.version, icu: process.versions.icu }, implementation: implementationFiles(),
    authorization: { reference: "New September 14 clinical-lift sprint: parent/operator allocates $25 inclusive of a 1.25x cache contingency for this fixed-packet low versus medium Opus study. Parent alone dispatches. No previous sprint authorization is reused.",
      allocationUSD, contingencyMultiplier, maximumCalls },
    models: { producer: "anthropic/claude-opus-5", judge: "openai/gpt-6-astra" }, pricing: STUDY_PRICING,
    settings: { maxRetries: 0, maxSteps: 1, producerMaxOutputTokens: GRAPH_OUTPUT_LIMITS.disposition, judgeMaxOutputTokens: GRAPH_OUTPUT_LIMITS.judge, timeoutMs: EXECUTION_POLICY.modelTimeoutMs,
      producerProviderOptions: Object.fromEntries(arms.map(arm => [arm, providerOptions("producer", arm)])),
      judgeProviderOptions: providerOptions("judge", "low") },
    prompts, promptHashes: Object.fromEntries(Object.entries(prompts).map(([key, prompt]) => [key, sha256(prompt)])),
    schemas: { producer: wireDraftSchema.toJSONSchema(), canonical: draftSchema.toJSONSchema(), judge: graphJudgeSchema.toJSONSchema() },
    canonicalJudgeDraftOrder: Object.keys(draftSchema.shape), cases, schedule: scheduleFor(cases),
    targets: { primary: "First-pass full independent-judge acceptance and unchanged contract/transport/early-action release eligibility; 24 planned first-producer attempts (12 per arm), including failure and non-dispatch",
      secondary: ["First-draft disposition, priority, work type and transport", "Exact source identity and judge-anchor validity separately from patient grounding and claim support",
        "Per-case/trial paired producer and producer-plus-judge latency, completion, usage and cost; failures retained", "New versus recurring material errors require independent transcript audit"],
      promotion: "Experiment only; no automatic promotion, clinical approval, label target substitution or population-level lift claim from six selected development cases." },
    scope: "Two fresh first-producer draws per arm for each of six frozen v22 GUI inputs. Only Opus adaptive effort low versus medium differs. Identical original patient/context, nine-hit retrieval-selection procedure, actual selected source passages and quote IDs, full output schema/prompt, issued early notice/questions, canonical judge ordering and full Astra low materiality judge. No context removal, retrieval, repairs, retries, live GUI publication or physician-reference changes. C01's historical actor remains unattributed. Not end-to-end workflow latency or clinical validation.",
    failurePolicy: "No retries or resume. Invalid producers retain their failure and skip the judge, without substituting a historical answer. Unknown usage retains the full reservation inclusive of contingency; no cache discount. Maximum 48 calls and inclusive per-call cost reservations may stop before completion; every unstarted slot remains in the planned denominator.",
    costPolicy: "Standard input/output token estimate times 1.25 is accounted inside, not on top of, $25. This conservative contingency covers cache writes without assuming cache savings; not a reconciled provider invoice. Actual cache telemetry is retained. No fast mode or billable tools.",
  };
}
export type Plan = ReturnType<typeof makePlan>;
export function validatePlan(frozen: Plan & { fingerprint: string }): Plan {
  const { fingerprint, ...plan } = frozen;
  requireTrue(plan.protocol === protocol && digest(plan) === fingerprint, "PLAN_FINGERPRINT_MISMATCH");
  const current = makePlan();
  requireTrue(digest({ ...current, createdAt: plan.createdAt }) === digest(plan), "FROZEN_STUDY_DRIFT");
  return plan;
}
export function claimPlan(directory: string, plan: Plan, fingerprint: string, expectedHash: string,
  claim = resolve(root, "outputs/producer-effort-study-2026-09-14.consumed.json")) {
  requireTrue(expectedHash === fingerprint && digest(plan) === fingerprint, "EXPLICIT_MANIFEST_HASH_CLAIM_REQUIRED");
  requireTrue(readdirSync(directory).length === 1 && existsSync(join(directory, "manifest.json")), "PLAN_ALREADY_USED_OR_OUTPUT_NOT_EMPTY");
  requireTrue(!existsSync(claim), "ALLOCATION_ALREADY_CLAIMED");
  writeFileSync(claim, JSON.stringify({ protocol, directory, fingerprint, authorization: plan.authorization, at: new Date().toISOString() }) + "\n", { flag: "wx", mode: 0o600 });
  writeFileSync(join(directory, "live-claim.json"), JSON.stringify({ claim, fingerprint }) + "\n", { flag: "wx", mode: 0o600 });
}
export function costFor(usage: { inputTokens: number | null; outputTokens: number | null }, role: "producer" | "judge") {
  const price = STUDY_PRICING.models[role === "producer" ? "anthropic/claude-opus-5" : "openai/gpt-6-astra"];
  if (usage.inputTokens === null || usage.outputTokens === null || !Number.isFinite(usage.inputTokens) || !Number.isFinite(usage.outputTokens) || usage.inputTokens < 0 || usage.outputTokens < 0) return null;
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1e6;
}
export function reservationFor(plan: Plan, role: "producer" | "judge", packet: unknown) {
  const schema = role === "producer" ? wireDraftSchema : graphJudgeSchema;
  const price = STUDY_PRICING.models[plan.models[role] as keyof typeof STUDY_PRICING.models];
  const limit = role === "judge" ? plan.settings.judgeMaxOutputTokens : plan.settings.producerMaxOutputTokens;
  // UTF-8 bytes bound token input, plus schema/instruction/framing allowance.
  const base = (Buffer.byteLength(JSON.stringify(packet) + plan.prompts[role] + JSON.stringify(schema.toJSONSchema())) + 8192) * price.input / 1e6 + limit * price.output / 1e6;
  return base * contingencyMultiplier;
}
export type Outcome = { id: string; arm: Arm; trial: number; route: { disposition: string; reviewPriority: string | null; workType: string | null; transportIntent: unknown } | null; runId: string; status: string; producerMs: number | null; judgeMs: number | null; totalMs: number | null; pairWallMs: number; validDraft: boolean; exactSourceQuotes: boolean | null; patientGrounding: string | null; claimSupport: string | null; validJudge: boolean; judgeAccepted: boolean; releaseEligible: boolean; failure: string | null; judgeSkipped: string | null };
export function releaseEvaluation(f: FixedCase, draft: Draft, judge: GraphJudge | null) {
  const transport = assessEmergencyTransport(draft, f.patient, judge);
  const findings = contractFindings(f.patient, draft, f.hits, judge);
  const early = f.judgeExposure.notice;
  const transportOnly = reducesEmergencyTransport(early, { disposition: draft.disposition, directive: draft.patientMessage, emergencyTransport: transport.binding });
  const lowerThanEarly = early && (transportOnly || (early.disposition === "EMERGENCY_NOW" ? draft.disposition !== "EMERGENCY_NOW" : draft.disposition === "ASYNC_PHYSICIAN" || draft.disposition === "SELF_CARE"));
  const correctionAllowed = judge?.earlyAction === "unsupported" && judge.earlyCorrection && (transportOnly || early?.disposition !== "EMERGENCY_NOW" || !hasUnconditional911Opening(early.directive) || judge.earlyCorrection.triggerMisattributedOrCorrected);
  return { transport, findings, lowerThanEarly: Boolean(lowerThanEarly), correctionAllowed: Boolean(correctionAllowed), releaseEligible: Boolean(judge?.verdict === "accept" && transport.status !== "rejected" && findings.length === 0 && (!lowerThanEarly || correctionAllowed)) };
}
function median(values: number[]) { const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2); return sorted.length ? sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2 : null; }
export function summarize(plan: Plan, rows: Outcome[], calls: number, accountedUSD: number, stopped: string | null) {
  const keys = rows.map(r => `${r.id}-${r.arm}-${r.trial}`);
  requireTrue(new Set(keys).size === keys.length, "DUPLICATE_STUDY_ATTEMPT");
  requireTrue(rows.every(r => plan.schedule.some(s => r.id === s.id && r.arm === s.arm && r.trial === s.trial) && r.runId === plan.cases.find(c => c.id === r.id)?.runId), "STUDY_PAIR_BINDING_MISMATCH");
  const byArm = Object.fromEntries(arms.map(arm => { const r = rows.filter(row => row.arm === arm); return [arm, {
    plannedProducerAttempts: plan.cases.length * trials.length, recordedAttempts: r.length, validDrafts: r.filter(x => x.validDraft).length,
    exactSourceQuotes: r.filter(x => x.exactSourceQuotes === true).length, validJudges: r.filter(x => x.validJudge).length,
    patientGroundingPass: r.filter(x => x.patientGrounding === "pass").length, claimSupportPass: r.filter(x => x.claimSupport === "pass").length,
    judgeAccepted: r.filter(x => x.judgeAccepted).length, releaseEligible: r.filter(x => x.releaseEligible).length,
    observedProducerMedianMs: median(r.flatMap(x => x.producerMs === null ? [] : [x.producerMs])),
    observedProducerAndJudgeMedianMs: median(r.flatMap(x => x.totalMs === null ? [] : [x.totalMs])),
    observedProducerAndJudgeCount: r.filter(x => x.totalMs !== null).length,
    validProducerAndJudgeMedianMs: median(r.flatMap(x => x.totalMs === null || !x.validDraft || !x.validJudge ? [] : [x.totalMs])),
    validProducerAndJudgeCount: r.filter(x => x.totalMs !== null && x.validDraft && x.validJudge).length }]; }));
  const pairs = trials.flatMap(trial => plan.cases.map(f => {
    const low = rows.find(r => r.id === f.id && r.arm === "low" && r.trial === trial), medium = rows.find(r => r.id === f.id && r.arm === "medium" && r.trial === trial);
    return { id: f.id, runId: f.runId, trial, bothObserved: Boolean(low?.totalMs != null && medium?.totalMs != null),
      bothValidJudges: Boolean(low?.validJudge && medium?.validJudge), lowReleaseEligible: low?.releaseEligible ?? false, mediumReleaseEligible: medium?.releaseEligible ?? false,
      observedProducerDeltaMs: low?.producerMs != null && medium?.producerMs != null ? medium.producerMs - low.producerMs : null,
      observedTotalDeltaMs: low?.totalMs != null && medium?.totalMs != null ? medium.totalMs - low.totalMs : null,
      producerDeltaMs: low?.validDraft && medium?.validDraft && low.producerMs != null && medium.producerMs != null ? medium.producerMs - low.producerMs : null,
      totalDeltaMs: low?.validDraft && medium?.validDraft && low.validJudge && medium.validJudge && low.totalMs != null && medium.totalMs != null ? medium.totalMs - low.totalMs : null };
  }));
  return { protocol, calls, plannedCalls: maximumCalls, accountedUSD, remainingInclusiveUSD: allocationUSD - accountedUSD, contingencyMultiplier,
    stopped, byArm, pairs, medianPairedProducerDeltaMs: median(pairs.flatMap(p => p.producerDeltaMs === null ? [] : [p.producerDeltaMs])),
    medianPairedTotalDeltaMs: median(pairs.flatMap(p => p.totalDeltaMs === null ? [] : [p.totalDeltaMs])), rows,
    missingSchedule: plan.schedule.filter(s => !rows.some(r => r.id === s.id && r.arm === s.arm && r.trial === s.trial)),
    clinicalApproval: false, runtimePromotion: "not_promoted",
    interpretation: "Negative deltas favor medium effort. Conditional completed-call latency is not an all-attempt success metric. Exact quotes/anchors are not semantic grounding. Six selected development cases, two draws per arm; no held-out or statistical superiority claim." };
}

export async function main(args = process.argv.slice(2)) {
  const planning = args.includes("--plan"), live = args.includes("--live");
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
    console.log(JSON.stringify({ directory, plannedCalls: maximumCalls, paidCalls: 0, fingerprint: digest(plan), reconstructedCases: plan.cases.map(f => ({ id: f.id, runId: f.runId, producerPacketHash: f.producerPacketHash, judgePacketHash: f.judgePacketHash })) }));
    return;
  }
  const frozen = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")) as Plan & { fingerprint: string };
  const fingerprint = frozen.fingerprint, plan = validatePlan(frozen);
  const claimHash = args.find(a => a.startsWith("--claim="))?.slice(8);
  requireTrue(claimHash, "EXPLICIT_MANIFEST_HASH_CLAIM_REQUIRED");
  claimPlan(directory, plan, fingerprint, claimHash);
  let calls = 0, accountedUSD = 0, stopped: string | null = null;
  const rows: Outcome[] = [];
  async function call(role: "producer" | "judge", arm: Arm, id: string, trial: number, packet: unknown): Promise<ModelTransportResult> {
    const schema: z.ZodType = role === "judge" ? graphJudgeSchema : wireDraftSchema;
    const instructions = plan.prompts[role], prompt = JSON.stringify(packet);
    requireTrue(Buffer.byteLength(prompt) <= 60_000, "PROMPT_LIMIT_EXCEEDED");
    const model = plan.models[role];
    const limit = role === "judge" ? plan.settings.judgeMaxOutputTokens : plan.settings.producerMaxOutputTokens;
    const reservation = reservationFor(plan, role, packet);
    requireTrue(calls < maximumCalls && accountedUSD + reservation <= allocationUSD, "EXPERIMENT_ALLOCATION_EXHAUSTED");
    const index = ++calls;
    accountedUSD += reservation;
    write(`${index}-started.json`, { id, arm, trial, role, model, providerOptions: providerOptions(role, arm), providerOptionsHash: digest(providerOptions(role, arm)), packet, packetHash: sha256(prompt), instructionsHash: sha256(instructions), schemaHash: digest(schema.toJSONSchema()), reservationUSD: reservation, accountedUSD, at: new Date().toISOString() });
    const agent = new Agent({ id: `effort-study-${role}-${arm}`, name: `Fixed study ${role}`, model: model as `${string}/${string}`, instructions, maxRetries: 0 });
    const deadline = requestDeadline(new AbortController().signal, plan.settings.timeoutMs);
    const execution = await consumeStructuredStream({ signal: deadline.signal, start: abortSignal => agent.stream(prompt, {
      abortSignal, structuredOutput: { schema: safetyEnvelopeTransport(schema, z.unknown()), errorStrategy: "strict" }, maxSteps: 1,
      modelSettings: { maxOutputTokens: limit, maxRetries: 0 },
      providerOptions: providerOptions(role, arm),
      tracingOptions: { hideInput: true, hideOutput: true },
    }) }).finally(() => deadline.dispose());
    const cost = costFor(execution.usage, role);
    if (cost !== null) accountedUSD += cost * contingencyMultiplier - reservation;
    write(`${index}-result.json`, { id, arm, trial, role, execution, estimatedBaseUSD: cost, accountedInclusiveUSD: cost === null ? reservation : cost * contingencyMultiplier, accountedUSD });
    console.log(JSON.stringify({ index, id, arm, trial, role, failure: execution.failure, ms: execution.durationMs, firstTextMs: execution.firstTextDeltaMs, estimatedUSD: cost, accountedUSD }));
    requireTrue(accountedUSD <= allocationUSD, "USAGE_EXCEEDED_RESERVATION_STOP");
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
      const row: Outcome = { id: f.id, arm: slot.arm, trial: slot.trial, route: null, runId: f.runId, status: "failed", producerMs: null, judgeMs: null, totalMs: null, pairWallMs: 0, validDraft: false, exactSourceQuotes: null, patientGrounding: null, claimSupport: null, validJudge: false, judgeAccepted: false, releaseEligible: false, failure: null, judgeSkipped: null };
      try {
        const producer = await call("producer", slot.arm, f.id, slot.trial, f.producerPacket);
        row.producerMs = producer.durationMs ?? null;
        let draft: Draft | null = null;
        if (!producer.failure) {
          try {
            requireTrue(wireDraftSchema.safeParse(producer.output).success, "WIRE_SCHEMA_FAILED");
            // Canonical judge order is identical in both arms.
            draft = draftSchema.parse(resolveSourceQuoteReferences(wireDraftSchema.parse(producer.output), f.sources));
            row.validDraft = true;
            row.route = { disposition: draft.disposition, reviewPriority: draft.reviewPriority, workType: draft.workType, transportIntent: draft.transportIntent };
            row.exactSourceQuotes = graphSourceIntegrity(draft, f.hits);
          } catch { row.failure = "PRODUCER_WIRE_OR_SOURCE_REFERENCE_FAILED"; }
        } else row.failure = producer.failure;
        if (!draft) row.judgeSkipped = "No valid new first draft; historical answer is never substituted.";
        else {
          const packet = graphJudgePacket({ patient: f.patient, draft, hits: f.hits, ...f.judgeExposure, contractFindings: contractFindings(f.patient, draft, f.hits) });
          write(`${f.id}-${slot.arm}-${slot.trial}-draft.json`, { draft, draftHash: digest(draft), rawKeyOrder: producer.output && typeof producer.output === "object" ? Object.keys(producer.output) : [], judgePacket: packet, judgePacketHash: digest(packet), patientHash: f.patientHash });
          const execution = await call("judge", slot.arm, f.id, slot.trial, packet);
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
          write(`${f.id}-${slot.arm}-${slot.trial}-review.json`, { judge, rawOutput: execution.output, reviewInputBinding: { patientHash: f.patientHash, draftHash: digest(draft), packetHash: digest(packet) }, release });
        }
      } catch (error) {
        row.failure = error instanceof Error ? error.message : "EXPERIMENT_EXECUTION_FAILED";
        row.judgeSkipped ??= row.judgeMs === null ? "Dispatch stopped; no fabricated review." : null;
        stopped = row.failure;
      } finally {
        row.pairWallMs = Math.round(performance.now() - began);
        rows.push(row);
        write(`${f.id}-${slot.arm}-${slot.trial}-outcome.json`, row);
      }
      if (stopped) break;
    }
  } catch (error) { stopped = error instanceof Error ? error.message : "EXPERIMENT_SETUP_FAILED"; }
  finally {
    for (const slot of plan.schedule) if (!rows.some(r => r.id === slot.id && r.arm === slot.arm && r.trial === slot.trial)) {
      const row: Outcome = { id: slot.id, arm: slot.arm, trial: slot.trial, route: null, runId: plan.cases.find(f => f.id === slot.id)!.runId, status: "not_dispatched", producerMs: null, judgeMs: null, totalMs: null, pairWallMs: 0, validDraft: false, exactSourceQuotes: null, patientGrounding: null, claimSupport: null, validJudge: false, judgeAccepted: false, releaseEligible: false, failure: stopped ?? "NOT_DISPATCHED", judgeSkipped: "No producer dispatched." };
      rows.push(row); write(`${row.id}-${row.arm}-${row.trial}-outcome.json`, row);
    }
    write("summary.json", summarize(plan, rows, calls, accountedUSD, stopped));
  }
  if (stopped) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
