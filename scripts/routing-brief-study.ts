/** OFFLINE fixed-packet producer comparison, not a V25 live release. */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmdirSync } from "node:fs";
import { lookup } from "node:dns/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { z } from "zod";
import { Agent } from "@mastra/core/agent";
import { GRAPH_INSTRUCTIONS } from "../src/disposition/graph-prompts.ts";
import { draftSchema, wireDraftSchema } from "../src/disposition/graph-output.ts";
import { ROUTING_BRIEF_INSTRUCTIONS, routingBriefSchema, wireRoutingBriefSchema, checkRoutingProposal, patientBasisIdentity } from "../src/disposition/routing-brief.ts";
import { GATES_OUTPUT_INSTRUCTIONS, gatesDecisionSteps, resolveGatesSteps } from "../src/disposition/gates-release.ts";
import { sourceWithQuoteSpans, resolveSourceQuoteReferences } from "../src/disposition/source-quote-refs.ts";
import { consumeStructuredStream, safetyEnvelopeTransport, type ModelTransportResult } from "../src/disposition/transport.ts";
import { requestDeadline, EXECUTION_POLICY } from "../src/disposition/execution-policy.ts";
import { selectGraphEvidence } from "../src/evidence/rag/selection.ts";
import { sha256 } from "../src/evidence/rag/model.ts";
import { readPhysicianReference } from "../src/evaluation/physician-cohort.ts";
import { pathBDeviation, type PathBAttemptAdmission } from "../src/evaluation/v25-path-b.ts";
import { parseCsv } from "../src/lib/csv.mjs";
import { contextAblationInputs, CONTEXT_ABLATION_PROTOCOL } from "../src/evaluation/context-ablation.ts";
import { replaceTaskOwnership } from "../src/evaluation/task-ownership-ablation.ts";
import type { DispositionRun } from "../src/disposition/contract.ts";

const SOURCE = "outputs/v25-path-b-complete-2026-09-15";
const GOLD = "data/evaluation/physician-system-reference-v2.json", CSV = "data/patient_messages.csv";
const PROTOCOL = "fixed-packet-routing-brief/v1";
const OWNERSHIP_PROTOCOL = "fixed-packet-task-ownership/v1";
const MODEL = "anthropic/claude-opus-5" as const;
const CEILING_USD = 90;
const MISSION_CLAIM = "outputs/.routing-brief-network-replication-spend-2026-09-15";
const NETWORK_AUDIT = "docs/ROUTING_BRIEF_NETWORK_RECONCILIATION_2026-09-15.json";
const PRIOR_LEDGER = `${SOURCE}/ledger.json`, RAG_LEDGER = "outputs/v26-rag-hybrid-2026-09-15/ledger.json";
const ARMS = ["full", "brief"] as const;
type Arm = typeof ARMS[number];
const digest = (v: unknown) => sha256(JSON.stringify(v));
const hashFile = (p: string) => sha256(readFileSync(p));
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
function requireTrue(v: unknown, code: string): asserts v { if (!v) throw new Error(code); }
const write = (directory: string, name: string, v: unknown) => writeFileSync(join(directory, name), JSON.stringify(v, null, 2) + "\n", { flag: "wx", mode: 0o600 });
const schemas = { full: wireDraftSchema, brief: wireRoutingBriefSchema };
const prompts = { full: GRAPH_INSTRUCTIONS.disposition, brief: ROUTING_BRIEF_INSTRUCTIONS };
const settings = { maxOutputTokens: 2400, maxSteps: 1, maxRetries: 0,
  providerOptions: { anthropic: { thinking: { type: "adaptive" as const }, effort: "low" as const } }, timeoutMs: EXECUTION_POLICY.modelTimeoutMs };

export function makeBriefPlan() {
  const prior = read(PRIOR_LEDGER), rag = read(RAG_LEDGER);
  const networkAudit = read(NETWORK_AUDIT), failedReport = read(`${networkAudit.failedStudy}/report.json`);
  requireTrue(ARMS.every(arm => failedReport.arms[arm].attempted === 50 && failedReport.arms[arm].providerComplete === 0)
    && Math.abs(failedReport.spend.currentAccountedAndOutstandingUSD - networkAudit.reservationReleasedUSD) < .000001,
    "PRECONNECT_RECONCILIATION_MISMATCH");
  const ragReservationPath = rag.phaseReservation.path as string;
  const ragReservation = read(ragReservationPath);
  const priorAccounted = prior.accountedUSD + rag.phaseReservation.phaseReservedUSD;
  requireTrue(prior.ceilingUSD === CEILING_USD && prior.started === 50 && prior.unattempted.length === 0
    && Number.isFinite(priorAccounted) && priorAccounted < CEILING_USD, "PRIOR_MISSION_ACCOUNTING_INVALID");
  const admissions = read(join(SOURCE, "runtime/attempt-admission.json")) as PathBAttemptAdmission[];
  const inputs = parseCsv(readFileSync(CSV, "utf8")) as { id: string; message: string }[];
  requireTrue(inputs.length === 50 && admissions.length === 50 && new Set(admissions.map(a => a.id)).size === 50, "EXACT_50_INPUTS_REQUIRED");
  const files = [CSV, GOLD, NETWORK_AUDIT, `${networkAudit.failedStudy}/report.json`, PRIOR_LEDGER, RAG_LEDGER, ragReservationPath, `${SOURCE}/runtime/attempt-admission.json`, "package.json", "package-lock.json", "scripts/routing-brief-study.ts",
    "src/evaluation/physician-cohort.ts", "src/evaluation/v25-path-b.ts", "src/evidence/rag/selection.ts", "src/evidence/rag/model.ts", "src/evidence/rag/quarantine.ts",
    ...readdirSync("src/disposition").filter(p => p.endsWith(".ts")).map(p => `src/disposition/${p}`)];
  const cases = inputs.map(({ id, message }) => {
    const admission = admissions.find(a => a.id === id)!;
    requireTrue(admission?.runId && /^[a-f0-9-]{36}$/.test(admission.runId), "BOUND_RUN_REQUIRED");
    const path = join(SOURCE, "runtime/diagnostic-runs", `${admission.runId}.json`), run = read(path) as DispositionRun;
    requireTrue(run.message === message && run.inputHash === sha256(message) && run.graph?.version === "evidence-graph/v25"
      && run.graph.mode === "gates-release" && run.graph.judge === null, "V25_INPUT_IDENTITY_FAILED");
    const hits = selectGraphEvidence(run.graph.retrieval, 9);
    requireTrue(digest(hits) === run.graph.frozenPacketHash && hits.every(h => sha256(h.chunk.text) === h.chunk.hash), "PACKET_RECONSTRUCTION_FAILED");
    const sources = hits.map(h => ({ id: h.chunk.id, title: h.document.title, kind: h.document.kind, review: h.document.reviewStatus,
      date: h.document.publicationDate, currency: h.document.currency, scope: h.document.scope, section: h.chunk.sectionTitle,
      before: h.context.before, text: h.chunk.text, after: h.context.after }));
    const common = { patient: message, context: run.graph.context, sources: sources.map(sourceWithQuoteSpans) };
    const packets = { full: { patient: message, context: run.graph.context, outputInstructions: GATES_OUTPUT_INSTRUCTIONS, sources: common.sources }, brief: common };
    // No gold, historical model decision or early safety output enters either packet.
    requireTrue(Object.values(packets).every(p => Buffer.byteLength(JSON.stringify(p)) <= 60_000), "PACKET_TOO_LARGE");
    return { id, path, historyHash: hashFile(path), originalAdmission: admission, message, sources, hits, guidance: run.guidance,
      issued: (run.responseEvents ?? []).filter(e => e.kind === "action").map(e => e.notice), packets,
      commonInputHash: digest(common), packetHashes: { full: digest(packets.full), brief: digest(packets.brief) } };
  });
  return { protocol: PROTOCOL, studyKind: "network-enabled replication after retained pre-connect failures", networkAudit,
    createdAt: new Date().toISOString(), node: process.version, icu: process.versions.icu,
    model: MODEL, settings, pricing: { inputPerMillionUSD: 5, outputPerMillionUSD: 25,
      verified: "2026-09-15", source: "https://platform.claude.com/docs/en/about-claude/pricing",
      accounting: "2x all input plus output, conservatively covering cache writes; unknown usage retains full reservation. Not a provider invoice." },
    budget: { missionCeilingUSD: CEILING_USD, priorAccountedAndReservedUSD: priorAccounted, remainingUSD: CEILING_USD - priorAccounted,
      priorLedger: PRIOR_LEDGER, ragLedger: RAG_LEDGER, ragReservationPath, ragReservation,
      nestedRagReservationUSD: rag.phaseReservation.phaseReservedUSD, exclusiveClaim: MISSION_CLAIM },
    files: Object.fromEntries(files.map(p => [p, hashFile(p)])), prompts, promptHashes: { full: sha256(prompts.full), brief: sha256(prompts.brief) },
    schemas: { full: schemas.full.toJSONSchema(), brief: schemas.brief.toJSONSchema() }, cases,
    schedule: cases.flatMap((c, i) => (i % 2 ? [...ARMS].reverse() : [...ARMS]).map(arm => ({ id: c.id, arm }))),
    interpretation: "Two fresh first attempts per original message, one per arm. Alternating sequential arm order, no retries/repair/judge. Same original patient/context/passages and settings; only output instructions/schema change. Development reference is evaluation-only. Producer-only latency, NOT live GUI or full-system latency. No clinical releases." };
}
type BasePlan = ReturnType<typeof makeBriefPlan>;
type BaseCase = BasePlan["cases"][number];
type FixedCase = Omit<BaseCase, "packets"> & { packets: Record<Arm, {
  patient: string; context?: BaseCase["packets"]["full"]["context"];
  outputInstructions?: string; sources: BaseCase["packets"]["full"]["sources"];
}> };
type Plan = Omit<BasePlan, "cases"> & {
  cases: FixedCase[];
  experiment?: "context" | "ownership";
  armLabels?: Record<Arm, string>;
  contracts?: Record<Arm, Arm>;
};
const PREVIOUS_STUDY = "outputs/routing-brief-network-replication-2026-09-15";
export function makeContextPlan(): Plan {
  const previousPath = `${PREVIOUS_STUDY}/report.json`, previous = read(previousPath);
  requireTrue(!existsSync(join(PREVIOUS_STUDY, ".run-lock"))
    && ARMS.every(a => previous.arms[a].attempted === 50)
    && previous.rows.length === 100 && previous.rows.every((r: { row: unknown }) => r.row !== null), "PREVIOUS_STUDY_INCOMPLETE");
  const base = makeBriefPlan();
  const plan: Plan = { ...base, cases: base.cases.map(c => {
    const p = contextAblationInputs(c.packets.full);
    return { ...c, packets: { full: p.withContext, brief: p.withoutContext }, commonInputHash: p.commonInputHash,
      packetHashes: { full: digest(p.withContext), brief: digest(p.withoutContext) } };
  }) };
  const verifiedSpend = scoreBriefStudy(PREVIOUS_STUDY).spend;
  requireTrue(digest(verifiedSpend) === digest(previous.spend), "PREVIOUS_LEDGER_REPLAY_MISMATCH");
  plan.experiment = "context";
  plan.protocol = CONTEXT_ABLATION_PROTOCOL;
  plan.studyKind = "Generated-context removal, two fresh full-output arms";
  // Legacy artifact slot names are retained by the shared journal runner. The
  // labels and contracts below make clear that neither arm is a brief output.
  plan.armLabels = { full: "with_generated_context", brief: "without_generated_context" };
  plan.contracts = { full: "full", brief: "full" };
  plan.prompts = { full: prompts.full, brief: prompts.full };
  plan.promptHashes = { full: sha256(prompts.full), brief: sha256(prompts.full) };
  plan.schemas = { full: schemas.full.toJSONSchema(), brief: schemas.full.toJSONSchema() };
  plan.budget.priorAccountedAndReservedUSD += previous.spend.currentAccountedAndOutstandingUSD;
  plan.budget.remainingUSD = CEILING_USD - plan.budget.priorAccountedAndReservedUSD;
  plan.budget.exclusiveClaim = "outputs/.generated-context-ablation-spend-2026-09-15";
  plan.files[previousPath] = hashFile(previousPath);
  plan.files["src/evaluation/context-ablation.ts"] = hashFile("src/evaluation/context-ablation.ts");
  plan.interpretation = "Two fresh first attempts per original message: with_generated_context versus without_generated_context. BOTH arms use the original full disposition prompt/schema/settings. Alternating sequential order, no retries/repair/judge. Remove ONLY the complete generated context field (queries/findings/question) from the final producer; original patient, exact retrieved sources/order and output instruction remain unchanged. No re-retrieval. Known development reference is scoring-only. Producer latency, not live workflow or GUI latency; no clinical releases. Slot names full/brief are journal identifiers, not differing output contracts.";
  return plan;
}
const CONTEXT_STUDY = "outputs/generated-context-ablation-2026-09-15";
export function makeTaskOwnershipPlan(): Plan {
  const previousPath = `${CONTEXT_STUDY}/report.json`, previousPlanPath = `${CONTEXT_STUDY}/plan.json`;
  const previous = read(previousPath), previousPlan = read(previousPlanPath) as Plan;
  const executionClaimPath = `${CONTEXT_STUDY}/execution-claim.json`;
  const phaseClaimPath = `${previousPlan.budget.exclusiveClaim}/claim.json`;
  requireTrue(!existsSync(join(CONTEXT_STUDY, ".run-lock"))
    && previousPlan.protocol === CONTEXT_ABLATION_PROTOCOL && previousPlan.experiment === "context"
    && previousPlan.schedule.length === 100 && new Set(previousPlan.schedule.map(s => `${s.id}-${s.arm}`)).size === 100
    && ARMS.every(a => previous.arms[a].attempted === 50)
    && previous.rows.length === 100 && previous.rows.every((r: { row: unknown }) => r.row !== null), "CONTEXT_STUDY_INCOMPLETE");
  requireTrue(digest(scoreBriefStudy(CONTEXT_STUDY)) === digest(previous), "CONTEXT_REPORT_REPLAY_MISMATCH");
  requireTrue(read(executionClaimPath).fingerprint === digest(previousPlan)
    && digest(read(phaseClaimPath)) === digest({ fingerprint: digest(previousPlan), directory: resolve(CONTEXT_STUDY),
      allocationUSD: previousPlan.budget.remainingUSD }), "CONTEXT_CLAIM_BINDING_FAILED");
  // This runner is the sole intentionally revised file from the context freeze.
  for (const [p, h] of Object.entries(previousPlan.files)) if (p !== "scripts/routing-brief-study.ts")
    requireTrue(hashFile(p) === h, `CONTEXT_FROZEN_INPUT_CHANGED:${p}`);
  const base = makeContextPlan();
  requireTrue(digest(base.cases) === digest(previousPlan.cases) && digest(base.schedule) === digest(previousPlan.schedule)
    && base.model === previousPlan.model && digest(base.settings) === digest(previousPlan.settings)
    && digest(base.schemas) === digest(previousPlan.schemas) && digest(base.prompts) === digest(previousPlan.prompts)
    && base.budget.priorAccountedAndReservedUSD === previous.spend.priorAccountedAndReservedUSD,
    "CONTEXT_BASELINE_IDENTITY_FAILED");
  const prior = previous.spend.priorAccountedAndReservedUSD + previous.spend.currentAccountedAndOutstandingUSD;
  requireTrue(previousPlan.budget.missionCeilingUSD === CEILING_USD && Number.isFinite(prior) && prior >= 0 && prior < CEILING_USD,
    "OWNERSHIP_PRIOR_ACCOUNTING_INVALID");
  const candidatePrompt = replaceTaskOwnership(prompts.full);
  const plan: Plan = { ...base, experiment: "ownership", protocol: OWNERSHIP_PROTOCOL,
    studyKind: "Task-ownership paragraph comparison, two fresh full-output arms",
    armLabels: { full: "baseline_task_ownership", brief: "explicit_task_ownership" },
    contracts: { full: "full", brief: "full" },
    prompts: { full: prompts.full, brief: candidatePrompt },
    promptHashes: { full: sha256(prompts.full), brief: sha256(candidatePrompt) },
    cases: base.cases.map(c => {
      const packet = c.packets.full;
      return { ...c, packets: { full: packet, brief: structuredClone(packet) }, commonInputHash: digest(packet),
        packetHashes: { full: digest(packet), brief: digest(packet) } };
    }),
    budget: { ...base.budget, priorAccountedAndReservedUSD: prior, remainingUSD: CEILING_USD - prior,
      exclusiveClaim: "outputs/.task-ownership-ablation-spend-2026-09-15" },
    interpretation: "Two fresh first attempts per original message: baseline_task_ownership versus explicit_task_ownership. BOTH arms use the original WITH-context patient/source packet, full output schema/instructions and settings. Replace ONLY the necessary-clinician-task paragraph in the producer prompt; no other policy, transport or evidence-contract change. Alternating sequential order, no retries/repair/judge or re-retrieval. Known development reference is scoring-only; missing/failed slots remain visible. Producer latency, not live workflow or GUI latency; no clinical releases. Slot names full/brief are journal identifiers, not differing output contracts." };
  for (const p of [previousPlanPath, previousPath, executionClaimPath, phaseClaimPath, "src/evaluation/task-ownership-ablation.ts"])
    plan.files[p] = hashFile(p);
  return plan;
}
export function reservationForBrief(plan: Plan, c: FixedCase, arm: Arm) {
  // UTF-8 bytes conservatively bound input tokens, including a schema/framing
  // allowance. Reserve BOTH arms before beginning a pair.
  const input = Buffer.byteLength(JSON.stringify(c.packets[arm]) + plan.prompts[arm] + JSON.stringify(plan.schemas[arm])) + 8192;
  return (input * plan.pricing.inputPerMillionUSD * 2 + plan.settings.maxOutputTokens * plan.pricing.outputPerMillionUSD) / 1e6;
}
export function briefCost(e: ModelTransportResult, plan: Plan) {
  const { inputTokens: i, outputTokens: o } = e.usage;
  if (i === null || o === null) return null;
  return { baseUSD: (i * plan.pricing.inputPerMillionUSD + o * plan.pricing.outputPerMillionUSD) / 1e6,
    accountedUSD: (2 * i * plan.pricing.inputPerMillionUSD + o * plan.pricing.outputPerMillionUSD) / 1e6 };
}
function evaluate(c: FixedCase, arm: Arm, e: ModelTransportResult, contract: Arm = arm) {
  const schema = contract === "full" ? draftSchema : routingBriefSchema;
  let failure: string | null = e.failure, output: z.infer<typeof schema> | null = null;
  try { if (!failure) output = schema.parse(resolveSourceQuoteReferences(schemas[contract].parse(e.output), c.sources)); }
  catch { failure = "WIRE_SCHEMA_OR_QUOTE_REFERENCE_FAILED"; }
  const proposal = output ? checkRoutingProposal(output, c.message, c.issued) : null;
  const basisIdentity = output ? patientBasisIdentity(output.redFlags, c.message) : null;
  const packetValid = c.hits.length > 0 && new Set(c.hits.map(h => h.chunk.id)).size === c.hits.length
    && c.hits.every(h => !["superseded", "retracted"].includes(h.document.currency));
  const fullChecks = contract === "full" && output ? resolveGatesSteps(gatesDecisionSteps(draftSchema.parse(output), c.message, c.guidance,
    c.hits, c.issued.at(-1) ?? null, false), sha256) : null;
  return { id: c.id, arm, firstAttempt: true, failure, output, proposal, basisIdentity, packetValid,
    eligibleRoutingProposal: Boolean(output && proposal?.eligibleRoutingProposal && basisIdentity && packetValid),
    fullResponseGateReplay: fullChecks, citationCount: output?.citations.length ?? null,
    citedSourceClasses: output?.citations.map(q => c.hits.find(h => h.chunk.id === q.passageId)!.document.kind) ?? [],
    providerComplete: e.failure === null && e.usage.inputTokens !== null && e.usage.outputTokens !== null,
    producerMs: e.durationMs ?? null, firstTextMs: e.firstTextDeltaMs ?? null, usage: e.usage,
    unsafe_advice: "not_assessed", unsupported_claims: "not_assessed", clinicalApproval: false, patientAdvicePublished: false };
}
/** Scoring failure cannot erase real provider work or authorize a second call. */
export function safeEvaluate(c: FixedCase, arm: Arm, e: ModelTransportResult, contract: Arm = arm) {
  try { return evaluate(c, arm, e, contract); }
  catch {
    return { id: c.id, arm, firstAttempt: true, failure: "LOCAL_EVALUATOR_FAILURE_RESULT_RETAINED",
      output: null, proposal: null, basisIdentity: null, packetValid: false, eligibleRoutingProposal: false,
      fullResponseGateReplay: null, citationCount: null, citedSourceClasses: [],
      providerComplete: e.failure === null && e.usage.inputTokens !== null && e.usage.outputTokens !== null,
      producerMs: e.durationMs ?? null, firstTextMs: e.firstTextDeltaMs ?? null, usage: e.usage,
      providerFailure: e.failure, failureDetails: e.failureDetails, streamProgress: e.streamProgress,
      transportTimings: e.transportTimings, cacheUsage: e.cacheUsage,
      unsafe_advice: "not_assessed", unsupported_claims: "not_assessed", clinicalApproval: false, patientAdvicePublished: false };
  }
}
type Row = ReturnType<typeof safeEvaluate>;
const distribution = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return { n: s.length,
  median: s.length ? s.length % 2 ? s[Math.floor(s.length / 2)] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2 : null,
  p95: s.length ? s[Math.ceil(s.length * .95) - 1] : null }; };
export function scoreBriefStudy(directory: string) {
  const plan = read(join(directory, "plan.json")) as Plan;
  requireTrue(hashFile(GOLD) === plan.files[GOLD] && hashFile(CSV) === plan.files[CSV], "REFERENCE_CHANGED");
  const reference = readPhysicianReference(readFileSync(GOLD, "utf8"), readFileSync(CSV, "utf8"));
  const rows = plan.schedule.map(s => {
    const p = join(directory, `${s.id}-${s.arm}-evaluation.json`);
    if (!existsSync(p)) return { id: s.id, arm: s.arm, attempted: existsSync(join(directory, `${s.id}-${s.arm}-started.json`)), row: null, agreement: null, rawAgreement: null, deviation: null };
    const row = read(p) as Row, accepted = reference.cases.find(c => c.id === s.id)!.reference.acceptedRoutes;
    requireTrue(row.id === s.id && row.arm === s.arm, "SCORE_BINDING_FAILED");
    return { id: s.id, arm: s.arm, attempted: true, row,
      agreement: row.eligibleRoutingProposal && accepted !== null ? accepted.includes(row.proposal!.route!) : null,
      rawAgreement: row.proposal?.route && accepted !== null ? accepted.includes(row.proposal.route) : null,
      deviation: row.eligibleRoutingProposal ? pathBDeviation(row.proposal!.route, accepted) : null };
  });
  const arms = Object.fromEntries(ARMS.map(arm => { const r = rows.filter(r => r.arm === arm); return [arm, {
    attempted: r.filter(r => r.attempted).length, providerComplete: r.filter(r => r.row?.providerComplete).length,
    eligibleProposals: r.filter(r => r.row?.eligibleRoutingProposal).length,
    agreement: { numerator: r.filter(r => r.agreement === true).length, denominator: r.filter(r => r.agreement !== null).length },
    agreementCoverage: { numerator: r.filter(r => r.agreement === true).length, denominator: 49 },
    rawRouteAgreementDiagnostic: { numerator: r.filter(r => r.rawAgreement === true).length, denominator: r.filter(r => r.rawAgreement !== null).length },
    under: r.filter(r => r.deviation === "under").map(r => r.id), over: r.filter(r => r.deviation === "over").map(r => r.id),
    blockedEarlyConflicts: r.filter(r => r.row?.proposal?.lowerThanIssued).map(r => r.id),
    fullResponseGatesPassed: (plan.contracts?.[arm] ?? arm) === "full" ? r.filter(r => r.row?.fullResponseGateReplay?.admission.released).length : null,
    producerLatency: distribution(r.flatMap(r => r.row?.providerComplete && r.row.producerMs !== null ? [r.row.producerMs] : [])),
    outputTokens: distribution(r.flatMap(r => r.row?.providerComplete && r.row.usage.outputTokens !== null ? [r.row.usage.outputTokens] : [])),
    emptyCitations: r.filter(r => r.row?.citationCount === 0).map(r => r.id) }]; }));
  const pairs = plan.cases.map(c => { const f = rows.find(r => r.id === c.id && r.arm === "full")!, b = rows.find(r => r.id === c.id && r.arm === "brief")!;
    return { id: c.id, fullAgreement: f.agreement, briefAgreement: b.agreement, fullRoute: f.row?.proposal?.route ?? null,
      briefRoute: b.row?.proposal?.route ?? null, producerDeltaMs: f.row?.providerComplete && b.row?.providerComplete
        && f.row.producerMs !== null && b.row.producerMs !== null ? b.row.producerMs - f.row.producerMs : null }; });
  const results = plan.schedule.flatMap(s => { const p = join(directory, `${s.id}-${s.arm}-result.json`); return existsSync(p) ? [read(p)] : []; });
  const reserveFiles = plan.cases.flatMap(c => { const p = join(directory, `${c.id}-reservation.json`); return existsSync(p) ? [read(p)] : []; });
  const accounted = reserveFiles.reduce((n, r) => n + r.pairReservationUSD, 0) + results.reduce((n, r) => n + r.accountedUSD - r.reservationUSD, 0);
  return { protocol: plan.protocol, ...(plan.armLabels ? { armLabels: plan.armLabels } : {}), arms, pairs, pairedProducerDelta: distribution(pairs.flatMap(p => p.producerDeltaMs === null ? [] : [p.producerDeltaMs])),
    spend: { baseEstimateUSD: results.reduce((n, r) => n + (r.baseUSD ?? 0), 0), currentAccountedAndOutstandingUSD: accounted,
      priorAccountedAndReservedUSD: plan.budget.priorAccountedAndReservedUSD, remainingMissionUSD: plan.budget.remainingUSD - accounted },
    unsafe_advice: "not_assessed", unsupported_claims: "not_assessed", rows, limitations: plan.interpretation };
}

export async function main() {
  const [command, directory, claim] = process.argv.slice(2);
  requireTrue(directory, "OUTPUT_DIRECTORY_REQUIRED");
  if (command === "plan" || command === "plan-context" || command === "plan-ownership") {
    requireTrue(!existsSync(directory), "NEW_OUTPUT_DIRECTORY_REQUIRED");
    const plan = command === "plan-ownership" ? makeTaskOwnershipPlan() : command === "plan-context" ? makeContextPlan() : makeBriefPlan(); mkdirSync(directory, { recursive: false }); write(directory, "plan.json", plan);
    console.log(JSON.stringify({ directory, fingerprint: digest(plan), calls: plan.schedule.length, remainingUSD: plan.budget.remainingUSD })); return;
  }
  const plan = read(join(directory, "plan.json")) as Plan;
  if (command === "score") { requireTrue(claim, "NEW_SCORE_FILENAME_REQUIRED"); write(directory, claim, scoreBriefStudy(directory)); return; }
  requireTrue(command === "run" && claim === digest(plan), "EXACT_PLAN_CLAIM_REQUIRED");
  const expectedPrompts = plan.experiment === "ownership" ? { full: prompts.full, brief: replaceTaskOwnership(prompts.full) }
    : plan.experiment === "context" ? { full: prompts.full, brief: prompts.full } : prompts;
  const expectedContracts: Record<Arm, Arm> = plan.experiment === "context" || plan.experiment === "ownership" ? { full: "full", brief: "full" } : { full: "full", brief: "brief" };
  const expectedProtocol = plan.experiment === "ownership" ? OWNERSHIP_PROTOCOL : plan.experiment === "context" ? CONTEXT_ABLATION_PROTOCOL : PROTOCOL;
  requireTrue(plan.protocol === expectedProtocol && plan.model === MODEL && digest(plan.settings) === digest(settings)
    && digest(plan.prompts) === digest(expectedPrompts) && digest(plan.contracts ?? expectedContracts) === digest(expectedContracts)
    && ARMS.every(a => digest(plan.schemas[a]) === digest(schemas[expectedContracts[a]].toJSONSchema()))
    && plan.node === process.version && plan.icu === process.versions.icu, "PLAN_RUNTIME_CHANGED");
  for (const [p, h] of Object.entries(plan.files)) requireTrue(hashFile(p) === h, `FROZEN_CODE_CHANGED:${p}`);
  for (const c of plan.cases) requireTrue(hashFile(c.path) === c.historyHash, `HISTORY_CHANGED:${c.id}`);
  // No keys or patient data sent. A DNS/connectivity failure is a setup failure,
  // not 100 inferred case failures. Do this before reserving or dispatching.
  const dns = await lookup("api.anthropic.com");
  const connectivity = await fetch("https://api.anthropic.com", { signal: AbortSignal.timeout(15000) });
  if (!existsSync(join(directory, "network-preflight.json"))) write(directory, "network-preflight.json", { at: new Date().toISOString(), dns, httpStatus: connectivity.status, authenticated: false });
  const lock = join(directory, ".run-lock"); mkdirSync(lock);
  process.once("exit", () => { try { rmdirSync(lock); } catch { /* Preserve a nonempty lock for inspection. */ } });
  // One atomic claim for this entire phase prevents a new output directory from
  // spending the same remaining authorization again. No other paid phase runs
  // concurrently; future phases must reconcile this study's final ledger.
  const missionClaim = { fingerprint: claim, directory: resolve(directory), allocationUSD: plan.budget.remainingUSD };
  const claimDirectory = plan.budget.exclusiveClaim;
  if (!existsSync(claimDirectory)) mkdirSync(claimDirectory);
  if (existsSync(join(claimDirectory, "claim.json"))) requireTrue(digest(read(join(claimDirectory, "claim.json"))) === digest(missionClaim), "MISSION_ALREADY_CLAIMED");
  else write(claimDirectory, "claim.json", missionClaim);
  if (existsSync(join(directory, "execution-claim.json"))) requireTrue(read(join(directory, "execution-claim.json")).fingerprint === claim, "RESUME_CLAIM_CHANGED");
  else write(directory, "execution-claim.json", { fingerprint: claim, beganAt: new Date().toISOString() });
  const env = parseEnv(readFileSync(".env", "utf8")); process.env.ANTHROPIC_API_KEY ||= env.ANTHROPIC_API_KEY;
  requireTrue(process.env.ANTHROPIC_API_KEY, "ANTHROPIC_KEY_REQUIRED");
  // Resume from append-only journals. An interrupted unknown call is NEVER
  // reissued; its full reservation remains charged against this authorization.
  let accountedUSD = scoreBriefStudy(directory).spend.currentAccountedAndOutstandingUSD;
  for (const c of plan.cases) {
    const pair = plan.schedule.filter(s => s.id === c.id), reservations = Object.fromEntries(pair.map(s => [s.arm, reservationForBrief(plan, c, s.arm)]));
    const pairReservationUSD = reservations.full + reservations.brief;
    if (!existsSync(join(directory, `${c.id}-reservation.json`))) {
      requireTrue(accountedUSD + pairReservationUSD <= plan.budget.remainingUSD, "MISSION_BUDGET_EXHAUSTED");
      accountedUSD += pairReservationUSD; write(directory, `${c.id}-reservation.json`, { pairReservationUSD, reservations, accountedUSD, at: new Date().toISOString() });
    }
    for (const { arm } of pair) {
      requireTrue(accountedUSD <= plan.budget.remainingUSD, "MISSION_BALANCE_EXHAUSTED");
      const packet = c.packets[arm], prompt = JSON.stringify(packet), reservationUSD = reservations[arm];
      const contract = plan.contracts?.[arm] ?? arm;
      if (existsSync(join(directory, `${c.id}-${arm}-started.json`))) {
        const resultPath = join(directory, `${c.id}-${arm}-result.json`), evaluationPath = join(directory, `${c.id}-${arm}-evaluation.json`);
        if (existsSync(resultPath) && !existsSync(evaluationPath)) write(directory, `${c.id}-${arm}-evaluation.json`, safeEvaluate(c, arm, read(resultPath).execution, contract));
        console.log(JSON.stringify({ id: c.id, arm, skipped: "existing_first_attempt", resultPresent: existsSync(resultPath) }));
        continue;
      }
      requireTrue(sha256(prompt) === c.packetHashes[arm], "PACKET_HASH_CHANGED");
      write(directory, `${c.id}-${arm}-started.json`, { at: new Date().toISOString(), model: plan.model, packetHash: sha256(prompt),
        commonInputHash: c.commonInputHash, promptHash: plan.promptHashes[arm], schemaHash: digest(plan.schemas[arm]), reservationUSD, attempt: "first_attempt", noJudge: true });
      const deadline = requestDeadline(new AbortController().signal, plan.settings.timeoutMs);
      const execution = await consumeStructuredStream({ signal: deadline.signal, start: abortSignal => new Agent({ id: `routing-brief-study-${arm}`, name: `Routing contract ${arm}`, model: plan.model, instructions: plan.prompts[arm], maxRetries: 0 }).stream(prompt, {
        abortSignal, structuredOutput: { schema: safetyEnvelopeTransport(schemas[contract], z.unknown()), errorStrategy: "strict" },
        maxSteps: 1, modelSettings: { maxOutputTokens: plan.settings.maxOutputTokens, maxRetries: 0 }, providerOptions: plan.settings.providerOptions,
        tracingOptions: { hideInput: true, hideOutput: true },
      }) }).finally(() => deadline.dispose());
      const cost = briefCost(execution, plan), accounted = cost?.accountedUSD ?? reservationUSD;
      accountedUSD += accounted - reservationUSD;
      // Persist the raw provider result and money BEFORE schema/evidence scoring.
      write(directory, `${c.id}-${arm}-result.json`, { execution, baseUSD: cost?.baseUSD ?? null, accountedUSD: accounted, reservationUSD });
      const evaluation = safeEvaluate(c, arm, execution, contract);
      write(directory, `${c.id}-${arm}-evaluation.json`, evaluation);
      console.log(JSON.stringify({ id: c.id, arm, armLabel: plan.armLabels?.[arm] ?? arm, failure: execution.failure, ms: execution.durationMs, outputTokens: execution.usage.outputTokens,
        route: "proposal" in evaluation ? evaluation.proposal?.route : null, eligible: "eligibleRoutingProposal" in evaluation ? evaluation.eligibleRoutingProposal : false,
        currentAccountedUSD: accountedUSD }));
      requireTrue(accountedUSD <= plan.budget.remainingUSD, "USAGE_EXCEEDED_MISSION_BUDGET");
    }
  }
  if (!existsSync(join(directory, "report.json"))) write(directory, "report.json", scoreBriefStudy(directory));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
