/** Fixed-packet serialization experiment ONLY. Run from the frozen v22 tree.
 * --plan --output=<new directory> makes no provider calls.
 * --live --output=<planned directory> --claim=<manifest fingerprint>
 * Parent/operator alone dispatches after the effort study finishes. */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { assessEmergencyTransport, draftSchema, graphJudgePacket, graphJudgeSchema, graphPromptHash, graphSourceIntegrity, GRAPH_OUTPUT_LIMITS, GRAPH_VERSION, noticeFromSafety, selectGraphEvidence, validateGraphJudge, wireDraftSchema } from "../src/disposition/clinical-graph.ts";
import { graphJudgeInstructions } from "../src/disposition/graph-prompts.ts";
import { createJudgeSpanContract, judgeSpanPacket, judgeSpanPacketDiagnostics, restoreJudgeSpanUnits, JUDGE_SPAN_INSTRUCTIONS } from "../src/disposition/graph-judge-span-contract.ts";
import { checkAnswer, type DispositionRun, type Guidance, type SafetyNotice } from "../src/disposition/contract.ts";
import { routingFieldsValid } from "../src/disposition/routing-policy.ts";
import { resolveSourceQuoteReferences } from "../src/disposition/source-quote-refs.ts";
import { consumeStructuredStream, safetyEnvelopeTransport, type ModelTransportResult } from "../src/disposition/transport.ts";
import { EXECUTION_POLICY, requestDeadline } from "../src/disposition/execution-policy.ts";
import { diagnoseGraphJudge } from "../src/evaluation/graph-judge-diagnostics.ts";
import { STUDY_PRICING } from "../src/evaluation/clinical-study-budget.ts";
import { sha256, type Hit } from "../src/evidence/rag/model.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const protocol = "judge-span-fixed-packet/v1";
export const allocationUSD = 8, contingencyMultiplier = 1.25, maximumCalls = 16;
export const arms = ["original", "span"] as const;
export type Arm = typeof arms[number];
export const caseIds = ["C07", "C22", "C12", "C02"] as const;
const expectedPromptHash = "416b51345cfb995c8114f61d02309f54bd4b7b2a18027c237ede989d0ccc953e";
const expectedRuns = { C07: "0e47af03-7000-4381-b17e-b5fd4a52dc72", C22: "c253f093-3748-4061-99d9-193ad88a29fa", C12: "c8f7e937-d01a-4537-bee9-c23932aa532a", C02: "3549904a-47b8-48b5-9e35-8df1e0bc9224" };
const cohort = "outputs/clinical-lift-v22-cohort-live-2026-09-14";
const afterStudy = "outputs/clinical-lift-effort-study-2026-09-14/summary.json";
const spanContract = createJudgeSpanContract(graphJudgeSchema);
const digest = (value: unknown) => sha256(JSON.stringify(value));
function requireTrue(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function evidenceFor(hits: Hit[]): Guidance[] {
  return hits.map(h => ({ id: h.chunk.id, title: h.document.title, url: h.document.url, section: h.chunk.sectionTitle, summary: h.chunk.text, reviewedAt: h.document.reviewDate ?? "not assessed", projectInterpretation: `${h.document.kind}; ${h.document.reviewStatus}. ${h.document.scope}`, retrievedPassages: [{ id: h.chunk.id, sourceId: h.document.id, excerpt: h.chunk.text, excerptSha256: h.chunk.hash, retrievedAt: h.document.retrievedAt, sourceContentHash: h.document.rawHash, kind: h.document.kind, limitations: h.document.scope }] }));
}

export function reconstructCase(id: typeof caseIds[number]) {
  const prefix = `${id.slice(1)}-${id}`, runPath = `${cohort}/${prefix}-run.json`, eventPath = `${cohort}/${prefix}-server-events.jsonl`;
  const bytes = readFileSync(resolve(root, runPath)), eventBytes = readFileSync(resolve(root, eventPath));
  const run = JSON.parse(bytes.toString()) as DispositionRun;
  const started = eventBytes.toString().trim().split("\n").map(line => JSON.parse(line)).find(event => event.type === "started");
  requireTrue(run.runId === expectedRuns[id] && run.graph?.contextAdmission && run.agents && run.responseEvents && started?.runId === run.runId, `${id}:ARCHIVED_RUN_IDENTITY_MISMATCH`);
  requireTrue(GRAPH_VERSION === "evidence-graph/v22" && run.graph.version === GRAPH_VERSION && run.promptHash === expectedPromptHash && started.promptHash === expectedPromptHash && graphPromptHash(started.config) === expectedPromptHash, `${id}:FROZEN_V22_RUNTIME_REQUIRED`);
  requireTrue(started.config.models.judge === "openai/gpt-6-astra" && started.config.judgeStyle === "full" && started.config.factGraphMode === "off", `${id}:ORIGINAL_JUDGE_CONFIGURATION_MISMATCH`);
  const firstProducer = run.agents.find(a => a.role === "disposition" && a.modelCalls > 0), firstJudge = run.agents.find(a => a.role === "critic" && a.modelCalls > 0);
  requireTrue(firstProducer && !firstProducer.failure && firstProducer.rawOutput && firstJudge?.reviewInputBinding, `${id}:FIRST_ATTEMPT_BINDING_MISSING`);
  const draft = draftSchema.parse(firstProducer.output), queries = run.graph.contextAdmission.queries;
  const initial = run.graph.retrieval.slice(0, queries.length);
  requireTrue(queries.length > 0 && digest(initial.map(r => r.query)) === digest(queries), `${id}:RETRIEVAL_ORDER_MISMATCH`);
  const hits = selectGraphEvidence(initial, 9);
  requireTrue(hits.length > 0 && hits.every(h => sha256(h.chunk.text) === h.chunk.hash), `${id}:SOURCE_TEXT_HASH_MISMATCH`);
  const sources = hits.map(h => ({ id: h.chunk.id, kind: h.document.kind, scope: h.document.scope, text: h.chunk.text }));
  requireTrue(digest(draftSchema.parse(resolveSourceQuoteReferences(wireDraftSchema.parse(firstProducer.rawOutput), sources))) === digest(draft), `${id}:FIRST_DRAFT_QUOTE_ROUNDTRIP_FAILED`);
  const notice = noticeFromSafety(run.graph.safety, run.message), questions = run.responseEvents.filter(e => e.kind === "intake_question");
  const { citations, transportIntent: _transportIntent, ...rest } = draft;
  const binding = assessEmergencyTransport(draft, run.message, null).binding;
  const answer = { ...rest, ...(binding ? { emergencyTransport: binding } : {}), evidence: citations.map(c => ({ sourceId: c.passageId, claim: c.claim })) };
  const contractFindings = [
    ...checkAnswer(answer, run.message, evidenceFor(hits), null).filter(c => c.status === "fail" && c.id !== "response_concision"),
    ...(!routingFieldsValid(draft) ? [{ id: "routing_fields", status: "fail", detail: "Disposition and priority/work-type fields are inconsistent." }] : []),
    ...(!graphSourceIntegrity(draft, hits) ? [{ id: "exact_source_quote", status: "fail", detail: "A cited quotation or source identity does not match its supplied passage." }] : []),
  ];
  const packet = graphJudgePacket({ patient: run.message, draft, hits, notice, basis: run.graph.safety?.basis, questions, contractFindings });
  const reviewInputBinding = { patientHash: sha256(run.message), draftHash: digest(draft), packetHash: digest(packet) };
  requireTrue(reviewInputBinding.patientHash === run.inputHash && digest(reviewInputBinding) === digest(firstJudge.reviewInputBinding), `${id}:ORIGINAL_FIRST_JUDGE_PACKET_HASH_MISMATCH`);
  const span = judgeSpanPacket(packet), diagnostics = judgeSpanPacketDiagnostics(packet);
  requireTrue(diagnostics.lossless && diagnostics.withinLimit && diagnostics.overheadRatio < 1.4 && digest(restoreJudgeSpanUnits(span)) === digest(packet.units), `${id}:SPAN_PACKET_LOSS_OR_SIZE_LIMIT`);
  return { id, runId: run.runId, runPath, eventPath, runFileHash: sha256(bytes), eventFileHash: sha256(eventBytes), reviewInputBinding, draft, hasEvidence: draft.citations.length > 0, notice,
    packet, spanPacket: span, spanPacketHash: digest(span), diagnostics,
    historical: { firstJudge, diagnostics: diagnoseGraphJudge(firstJudge.rawOutput ?? firstJudge.output, packet.units, draft.citations.length > 0, notice) },
    reconstruction: "Exact first patient/draft/reviewer-packet hashes and selected source hashes verified using frozen v22 modules. Historical review/failure is metadata only, never included in either prompt. Not a new physician reference." };
}

export function scheduleFor(ids: readonly string[] = caseIds) {
  return [1, 2].flatMap(trial => ids.flatMap((id, index) => ((index + trial) % 2 ? arms : [...arms].reverse()).map(arm => ({ id, arm, trial }))));
}
export const providerOptions = { openai: { reasoningEffort: "low" as const } };
function implementationFiles() {
  return ["scripts/judge-span-study.ts", "tests/judge-span-study.test.mjs", "src/evaluation/graph-judge-diagnostics.ts", "src/evaluation/clinical-study-budget.ts", "src/evidence/rag/model.ts", "package.json", "package-lock.json",
    ...readdirSync(resolve(root, "src/disposition")).filter(name => name.endsWith(".ts")).map(name => `src/disposition/${name}`)].sort().map(path => ({ path, hash: sha256(readFileSync(resolve(root, path))) }));
}
export function makePlan() {
  const cases = caseIds.map(reconstructCase), original = graphJudgeInstructions("full");
  const prompts = { original, span: `${original}\n\n${JUDGE_SPAN_INSTRUCTIONS}` };
  return { protocol, createdAt: new Date().toISOString(), runtime: { node: process.version, icu: process.versions.icu }, implementation: implementationFiles(),
    authorization: { allocationUSD, contingencyMultiplier, maximumCalls, reference: "Parent/operator reallocated up to $8 of unused September 14 full-cohort allocation, inclusive of 1.25 cost contingency, for 16 fixed-packet judge calls; start only after the effort study completes. No additional user budget is created.", afterStudy },
    model: "openai/gpt-6-astra", pricing: STUDY_PRICING, settings: { providerOptions, maxRetries: 0, maxSteps: 1, maxOutputTokens: GRAPH_OUTPUT_LIMITS.judge, timeoutMs: EXECUTION_POLICY.modelTimeoutMs },
    prompts, promptHashes: { original: sha256(prompts.original), span: sha256(prompts.span) }, schemas: { original: graphJudgeSchema.toJSONSchema(), span: spanContract.schema.toJSONSchema() },
    cases, schedule: scheduleFor(),
    targets: { primary: "Canonical full-judge contract validity over all eight planned attempts per arm, not acceptance count", secondary: ["Raw versus resolved verdicts, all seven criterion findings, corrections, repair targets and exact anchors", "Paired observed and valid-completion latency, usage, cache telemetry and inclusive cost; failures and unstarted slots retained", "Independent clinical audit required for missed/materially changed findings on identical first drafts; not judge-as-ground-truth"],
      promotion: "Never automatic. Successful serialization does not convert revise into accept. No clinical approval, runtime route change, patient publication, or clinical accuracy claim. Any loss of required context, invalid binding, new emergency contradiction or unreviewed material finding prevents promotion; live semantic audit remains necessary." },
    scope: "Only evidence-anchor input/output serialization differs: identical first draft, patient, sources, full clinical judge instructions, provider, low effort, output ceiling and validation. Span instructions append serialization directions; span IDs resolve through the exact original packet before the same frozen validator. No retrieval, producer, repair, retries, rejudging, GUI changes or physician label substitution.",
    failurePolicy: "Retain all raw outputs, transport failures, invalid spans and canonical validation failures. No retries or resume. Unknown usage consumes the full reservation; no cache discount. Allocation/call/size violations stop dispatch and retain all missing slots in denominators. Historical failed first-judge revise outputs stay metadata and are never rewritten.",
    costPolicy: "Standard input/output token estimate multiplied by 1.25 inside the $8 allocation, not a reconciled invoice. No cache savings assumed, tools or fast mode enabled.",
  };
}
export type Plan = ReturnType<typeof makePlan>;
export function validatePlan(frozen: Plan & { fingerprint: string }) {
  const { fingerprint, ...plan } = frozen;
  requireTrue(plan.protocol === protocol && digest(plan) === fingerprint, "PLAN_FINGERPRINT_MISMATCH");
  requireTrue(digest({ ...makePlan(), createdAt: plan.createdAt }) === digest(plan), "FROZEN_STUDY_DRIFT");
  return plan;
}
export function packetArtifact(plan: Plan, id: string) {
  const c = plan.cases.find(c => c.id === id); requireTrue(c, "UNKNOWN_CASE");
  return { id, runId: c.runId, reviewInputBinding: c.reviewInputBinding, original: c.packet, span: c.spanPacket, spanPacketHash: c.spanPacketHash };
}
export function claimPlan(directory: string, plan: Plan, fingerprint: string, claimHash: string, claimPath = resolve(root, "outputs/judge-span-study-2026-09-14.consumed.json"), completionPath = resolve(root, afterStudy)) {
  requireTrue(claimHash === fingerprint && digest(plan) === fingerprint, "EXPLICIT_MANIFEST_HASH_CLAIM_REQUIRED");
  const expected = ["manifest.json", ...caseIds.map(id => `${id}-packets.json`)].sort();
  requireTrue(digest(readdirSync(directory).sort()) === digest(expected), "PLAN_ALREADY_USED_OR_OUTPUT_NOT_EMPTY");
  for (const id of caseIds) requireTrue(digest(JSON.parse(readFileSync(join(directory, `${id}-packets.json`), "utf8"))) === digest(packetArtifact(plan, id)), "FROZEN_PACKET_ARTIFACT_MISMATCH");
  requireTrue(existsSync(completionPath), "WAIT_FOR_EFFORT_STUDY_COMPLETION");
  const completion = JSON.parse(readFileSync(completionPath, "utf8"));
  requireTrue(completion.protocol === "producer-effort-fixed-packet/v1" && completion.plannedCalls === 48 && Number.isInteger(completion.calls) && Array.isArray(completion.rows), "INVALID_EFFORT_COMPLETION_RECORD");
  requireTrue(!existsSync(claimPath), "ALLOCATION_ALREADY_CLAIMED");
  writeFileSync(claimPath, JSON.stringify({ protocol, directory, fingerprint, authorization: plan.authorization, prerequisiteHash: digest(completion), at: new Date().toISOString() }) + "\n", { flag: "wx", mode: 0o600 });
  writeFileSync(join(directory, "live-claim.json"), JSON.stringify({ claimPath, fingerprint, prerequisiteHash: digest(completion) }) + "\n", { flag: "wx", mode: 0o600 });
}
export function costFor(usage: { inputTokens: number | null; outputTokens: number | null }) {
  if ([usage.inputTokens, usage.outputTokens].some(n => n === null || !Number.isFinite(n) || n < 0)) return null;
  const price = STUDY_PRICING.models["openai/gpt-6-astra"];
  return (usage.inputTokens! * price.input + usage.outputTokens! * price.output) / 1e6;
}
export function reservationFor(plan: Plan, arm: Arm, packet: unknown) {
  const price = STUDY_PRICING.models["openai/gpt-6-astra"];
  return ((Buffer.byteLength(JSON.stringify(packet) + plan.prompts[arm] + JSON.stringify(plan.schemas[arm])) + 8192) * price.input / 1e6 + plan.settings.maxOutputTokens * price.output / 1e6) * contingencyMultiplier;
}
export function evaluateRaw(plan: Plan, id: string, arm: Arm, output: unknown, transportFailure: string | null = null) {
  const c = plan.cases.find(c => c.id === id); requireTrue(c, "UNKNOWN_CASE");
  let canonical: unknown = output, resolutionFailure: string | null = null;
  if (arm === "span" && !transportFailure) {
    try { canonical = spanContract.resolve(output, c.packet); } catch (error) { canonical = null; resolutionFailure = error instanceof Error ? error.message : "SPAN_RESOLUTION_FAILED"; }
  }
  const judge = transportFailure || resolutionFailure ? null : validateGraphJudge(canonical, c.packet.units, c.hasEvidence, c.notice as SafetyNotice | null);
  return { judge, canonical, resolutionFailure, diagnostics: canonical === null ? null : diagnoseGraphJudge(canonical, c.packet.units, c.hasEvidence, c.notice as SafetyNotice | null),
    failure: transportFailure ?? resolutionFailure ?? (judge ? null : "JUDGE_CONTRACT_FAILED"), validJudge: Boolean(judge), verdict: judge?.verdict ?? null,
    criteria: judge?.criteria ?? null, earlyAction: judge?.earlyAction ?? null, correction: judge?.correction ?? null,
    clinicalApproval: false, releasePerformed: false };
}
export type Outcome = { id: string; runId: string; arm: Arm; trial: number; status: string; durationMs: number | null; firstTextDeltaMs: number | null; validJudge: boolean; verdict: string | null; failure: string | null };
function median(values: number[]) { const s = [...values].sort((a, b) => a - b), i = Math.floor(s.length / 2); return s.length ? s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2 : null; }
export function summarize(plan: Plan, rows: Outcome[], calls: number, accountedUSD: number, stopped: string | null) {
  const key = (r: { id: string; arm: string; trial: number }) => `${r.id}-${r.arm}-${r.trial}`;
  requireTrue(new Set(rows.map(key)).size === rows.length && rows.every(r => plan.schedule.some(s => key(s) === key(r)) && plan.cases.find(c => c.id === r.id)?.runId === r.runId), "STUDY_ATTEMPT_BINDING_MISMATCH");
  requireTrue(rows.every(r => ["valid_review", "failed", "not_dispatched"].includes(r.status)
    && r.validJudge === (r.status === "valid_review")
    && (r.validJudge ? ["accept", "revise", "human_review"].includes(r.verdict ?? "") && r.failure === null : r.verdict === null && typeof r.failure === "string" && r.failure.length > 0)
    && [r.durationMs, r.firstTextDeltaMs].every(n => n === null || Number.isFinite(n) && n >= 0)
    && (r.status !== "not_dispatched" || r.durationMs === null && r.firstTextDeltaMs === null)), "STUDY_ROW_STATE_MISMATCH");
  requireTrue(Number.isInteger(calls) && calls >= 0 && calls <= maximumCalls && calls === rows.filter(r => r.status !== "not_dispatched").length && Number.isFinite(accountedUSD) && accountedUSD >= 0, "STUDY_ACCOUNTING_MISMATCH");
  const byArm = Object.fromEntries(arms.map(arm => { const r = rows.filter(r => r.arm === arm); return [arm, { plannedAttempts: 8, dispatchedAttempts: r.filter(r => r.status !== "not_dispatched").length, validJudges: r.filter(r => r.validJudge).length, accepted: r.filter(r => r.verdict === "accept").length, revised: r.filter(r => r.verdict === "revise").length,
    observedCount: r.filter(r => r.durationMs !== null).length, observedMedianMs: median(r.flatMap(r => r.durationMs === null ? [] : [r.durationMs])), validCount: r.filter(r => r.validJudge && r.durationMs !== null).length, validMedianMs: median(r.flatMap(r => !r.validJudge || r.durationMs === null ? [] : [r.durationMs])) }]; }));
  const pairs = [1, 2].flatMap(trial => caseIds.map(id => { const a = rows.find(r => r.id === id && r.arm === "original" && r.trial === trial), b = rows.find(r => r.id === id && r.arm === "span" && r.trial === trial); return { id, trial, bothValid: Boolean(a?.validJudge && b?.validJudge), originalVerdict: a?.verdict ?? null, spanVerdict: b?.verdict ?? null,
    observedDeltaMs: a?.durationMs != null && b?.durationMs != null ? b.durationMs - a.durationMs : null, validDeltaMs: a?.validJudge && b?.validJudge && a.durationMs !== null && b.durationMs !== null ? b.durationMs - a.durationMs : null }; }));
  return { protocol, calls, plannedCalls: maximumCalls, accountedUSD, remainingInclusiveUSD: allocationUSD - accountedUSD, stopped, byArm, pairs, rows, missingSchedule: plan.schedule.filter(s => !rows.some(r => key(s) === key(r))), medianPairedValidDeltaMs: median(pairs.flatMap(p => p.validDeltaMs === null ? [] : [p.validDeltaMs])),
    clinicalApproval: false, semanticAudit: "not_assessed", runtimePromotion: "not_promoted", interpretation: "Negative latency deltas favor span serialization. A valid revise is a successful contract, not clinical acceptance. Four selected development packets and two draws per arm cannot establish clinical superiority or population reliability; all raw findings need separate semantic review." };
}

export async function main(args = process.argv.slice(2)) {
  const planning = args.includes("--plan"), live = args.includes("--live");
  requireTrue(planning !== live, "CHOOSE_EXACTLY_ONE_OF_PLAN_OR_LIVE");
  requireTrue(args.every(a => a === "--plan" || a === "--live" || a.startsWith("--output=") || a.startsWith("--claim=")), "UNKNOWN_ARGUMENT");
  const directoryArg = args.find(a => a.startsWith("--output="))?.slice(9); requireTrue(directoryArg, "EXPLICIT_OUTPUT_REQUIRED");
  const directory = resolve(directoryArg), write = (name: string, value: unknown) => writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  if (planning) {
    requireTrue(!existsSync(directory), "FRESH_PLAN_OUTPUT_REQUIRED");
    const plan = makePlan(); mkdirSync(directory, { recursive: true, mode: 0o700 });
    write("manifest.json", { ...plan, fingerprint: digest(plan) });
    for (const id of caseIds) write(`${id}-packets.json`, packetArtifact(plan, id));
    console.log(JSON.stringify({ directory, fingerprint: digest(plan), plannedCalls: maximumCalls, paidCalls: 0, packets: plan.cases.map(c => ({ id: c.id, ...c.diagnostics })) })); return;
  }
  const frozen = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")), plan = validatePlan(frozen);
  const claim = args.find(a => a.startsWith("--claim="))?.slice(8); requireTrue(claim, "EXPLICIT_MANIFEST_HASH_CLAIM_REQUIRED");
  claimPlan(directory, plan, frozen.fingerprint, claim);
  let calls = 0, accountedUSD = 0, stopped: string | null = null;
  let active: { index: number; slot: ReturnType<typeof scheduleFor>[number]; runId: string; began: number } | null = null;
  const rows: Outcome[] = [];
  try {
    const env = existsSync(resolve(root, ".env")) ? parseEnv(readFileSync(resolve(root, ".env"), "utf8")) : {};
    process.env.OPENAI_API_KEY ||= env.OPENAI_API_KEY; requireTrue(process.env.OPENAI_API_KEY, "OPENAI_API_KEY_MISSING");
    for (const slot of plan.schedule) {
      const c = plan.cases.find(c => c.id === slot.id)!, packet = slot.arm === "original" ? c.packet : c.spanPacket;
      const schema = slot.arm === "original" ? graphJudgeSchema : spanContract.schema, prompt = JSON.stringify(packet), reservation = reservationFor(plan, slot.arm, packet);
      requireTrue(Buffer.byteLength(prompt) <= 60_000, "PROMPT_LIMIT_EXCEEDED");
      requireTrue(calls < maximumCalls && accountedUSD + reservation <= allocationUSD, "EXPERIMENT_ALLOCATION_EXHAUSTED");
      const index = ++calls; accountedUSD += reservation;
      active = { index, slot, runId: c.runId, began: performance.now() };
      write(`${index}-started.json`, { ...slot, runId: c.runId, model: plan.model, providerOptions, packetHash: sha256(prompt), originalReviewBinding: c.reviewInputBinding, instructionsHash: plan.promptHashes[slot.arm], schemaHash: digest(plan.schemas[slot.arm]), reservationUSD: reservation, accountedUSD, at: new Date().toISOString() });
      const agent = new Agent({ id: `span-study-${slot.arm}`, name: "Fixed-packet full judge", model: plan.model as `${string}/${string}`, instructions: plan.prompts[slot.arm], maxRetries: 0 });
      const deadline = requestDeadline(new AbortController().signal, plan.settings.timeoutMs);
      let execution: ModelTransportResult;
      try {
        execution = await consumeStructuredStream({ signal: deadline.signal, start: abortSignal => agent.stream(prompt, { abortSignal, structuredOutput: { schema: safetyEnvelopeTransport(schema, z.unknown()), errorStrategy: "strict" }, maxSteps: 1, modelSettings: { maxOutputTokens: plan.settings.maxOutputTokens, maxRetries: 0 }, providerOptions, tracingOptions: { hideInput: true, hideOutput: true } }) });
      } finally { deadline.dispose(); }
      const cost = costFor(execution.usage); if (cost !== null) accountedUSD += cost * contingencyMultiplier - reservation;
      // Preserve provider transport before any postprocessing can fail.
      write(`${index}-transport.json`, { ...slot, runId: c.runId, execution, estimatedBaseUSD: cost, accountedInclusiveUSD: cost === null ? reservation : cost * contingencyMultiplier, accountedUSD });
      const review = evaluateRaw(plan, slot.id, slot.arm, execution.output, execution.failure);
      write(`${index}-result.json`, { ...slot, runId: c.runId, execution, review, estimatedBaseUSD: cost, accountedInclusiveUSD: cost === null ? reservation : cost * contingencyMultiplier, accountedUSD });
      const row: Outcome = { ...slot, runId: c.runId, status: review.validJudge ? "valid_review" : "failed", durationMs: execution.durationMs ?? null, firstTextDeltaMs: execution.firstTextDeltaMs ?? null, validJudge: review.validJudge, verdict: review.verdict, failure: review.failure };
      rows.push(row); write(`${slot.id}-${slot.arm}-${slot.trial}-outcome.json`, row);
      active = null;
      console.log(JSON.stringify({ index, ...row, accountedUSD }));
      requireTrue(accountedUSD <= allocationUSD, "USAGE_EXCEEDED_RESERVATION_STOP");
    }
  } catch (error) {
    stopped = error instanceof Error ? error.message : "STUDY_EXECUTION_FAILED";
    if (active) {
      const row: Outcome = { ...active.slot, runId: active.runId, status: "failed", durationMs: Math.round(performance.now() - active.began), firstTextDeltaMs: null, validJudge: false, verdict: null, failure: stopped };
      rows.push(row); write(`${active.index}-execution-error.json`, { ...row, accountedUSD, error: stopped, durationMeaning: "Attempt wall time; provider completion time unavailable." });
      write(`${row.id}-${row.arm}-${row.trial}-outcome.json`, row);
    }
  }
  finally {
    for (const slot of plan.schedule) if (!rows.some(r => r.id === slot.id && r.arm === slot.arm && r.trial === slot.trial)) {
      const row: Outcome = { ...slot, runId: plan.cases.find(c => c.id === slot.id)!.runId, status: "not_dispatched", durationMs: null, firstTextDeltaMs: null, validJudge: false, verdict: null, failure: stopped ?? "NOT_DISPATCHED" };
      rows.push(row); write(`${slot.id}-${slot.arm}-${slot.trial}-outcome.json`, row);
    }
    write("summary.json", summarize(plan, rows, calls, accountedUSD, stopped));
  }
  if (stopped) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
