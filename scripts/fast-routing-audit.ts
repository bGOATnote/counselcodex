/** Offline full Astra review of an immutable fast-routing HTTP study. No live
 * routing changes, reference labels, retries or automatic clinical approval. */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { assessEmergencyTransport, bindGraphJudgeExecution, draftSchema, graphJudgePacket, graphJudgeSchema, graphRequestSettings, graphSourceIntegrity, reviewHandoffLanguage } from "../src/disposition/clinical-graph.ts";
import { checkAnswerForFullReview, type DispositionRun } from "../src/disposition/contract.ts";
import { graphJudgeInstructions } from "../src/disposition/graph-prompts.ts";
import { resolveGraphConfig } from "../src/disposition/graph-config.ts";
import { routingFieldsValid } from "../src/disposition/routing-policy.ts";
import { consumeStructuredStream, safetyEnvelopeTransport, type ModelTransportResult } from "../src/disposition/transport.ts";
import { EXECUTION_POLICY, requestDeadline } from "../src/disposition/execution-policy.ts";
import { STUDY_PRICING } from "../src/evaluation/clinical-study-budget.ts";
import { sha256, type Hit } from "../src/evidence/rag/model.ts";
import { reconstructReviewedProducerSteps } from "../apps/evaluation/lib/preserved-care.ts";
import { canonicalReviewedAnswer } from "../apps/evaluation/lib/care-alternative.ts";
import { sameRepairValue } from "../src/disposition/repair-values.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const FAST_AUDIT = Object.freeze({ protocol: "fast-routing-offline-astra/v1", model: "openai/gpt-6-astra", maximumAllocationUSD: 20, ceilingUSD: 200, minimumPriorUSD: 87.093099025, multiplier: 1.25 });
const digest = (value: unknown) => sha256(JSON.stringify(value));
function need(value: unknown, code: string): asserts value { if (!value) throw new Error(code); }
type Packet = ReturnType<typeof graphJudgePacket>;
type SourceCase = { id: string; message: string; inputHash: string };
type SourceAttempt = { index: number; id: string; run: DispositionRun | null; failure: string | null; identityFailures: string[]; accountedUSD: number; receipts: { phase?: string; event?: DispositionRun["responseEvents"] extends (infer E)[] | undefined ? E : never }[] };
function sourceFiles(directory = "src"): string[] {
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap(e => e.isDirectory() ? sourceFiles(`${directory}/${e.name}`) : /\.(?:ts|mjs)$/.test(e.name) ? [`${directory}/${e.name}`] : []);
}

/** Reconstruct the actual last producer/patch, not a judge's proposed answer.
 * Withheld drafts may be audited, but can never count as delivered responses. */
export function fastAuditPacket(run: DispositionRun) {
  need(run.graph && run.agents && run.responseEvents && sha256(run.message) === run.inputHash, "RUN_PROVENANCE_MISSING");
  const critic = run.agents.filter(a => a.role === "critic").at(-1);
  need(critic?.reviewInputBinding?.draftHash, "NO_BOUND_FINAL_DRAFT");
  const hashes = run.agents.map(a => digest(a.output));
  const steps = reconstructReviewedProducerSteps(run, hashes, critic.reviewInputBinding.draftHash);
  let state = steps.next(); while (!state.done) state = steps.next(sha256(state.value));
  need(state.value && state.value.index < run.agents.lastIndexOf(critic), "FINAL_PRODUCER_BINDING_FAILED");
  const draft = draftSchema.parse(state.value.draft);
  if (run.status === "complete") need(run.answer && sameRepairValue(canonicalReviewedAnswer(run, draft), run.answer) && run.answerHash === digest(run.answer), "FINAL_ANSWER_DIFFERS_FROM_PRODUCER");
  else if (run.rejectedAnswer) need(sameRepairValue(draftSchema.parse(run.rejectedAnswer), draft), "REJECTED_DRAFT_DIFFERS_FROM_PRODUCER");
  const hits: Hit[] = run.guidance.map(g => {
    const matches = run.graph!.retrieval.flatMap(r => r.hits).filter(h => h.chunk.id === g.id && h.chunk.text === g.summary);
    need(matches.length && matches.every(h => digest(h.document) === digest(matches[0].document) && h.chunk.hash === sha256(h.chunk.text)), "AMBIGUOUS_OR_CHANGED_SOURCE");
    need(g.retrievedPassages?.some(p => p.id === g.id && p.excerpt === matches[0].chunk.text && p.excerptSha256 === matches[0].chunk.hash), "GUIDANCE_SOURCE_UNBOUND");
    return matches[0];
  });
  need(new Set(hits.map(h => h.chunk.id)).size === hits.length, "DUPLICATE_SOURCE");
  const actions = run.responseEvents.filter(e => e.kind === "action"), questions = run.responseEvents.filter(e => e.kind === "intake_question");
  // The existing full-review packet has one issued-action slot. Refuse to
  // silently erase earlier different advice from an expanded workflow.
  need(actions.length <= 1, "MULTIPLE_ISSUED_ACTIONS_REQUIRE_TIMELINE_AUDIT");
  const notice = actions.at(-1)?.notice ?? null, transport = assessEmergencyTransport(draft, run.message, null).binding;
  const { citations, transportIntent: _intent, ...rest } = draft;
  const findings = checkAnswerForFullReview({ ...rest, ...(transport ? { emergencyTransport: transport } : {}), evidence: citations.map(c => ({ sourceId: c.passageId, claim: c.claim })) }, run.message, run.guidance, null)
    .map(c => c.id === "no_unconfirmed_handoff" ? reviewHandoffLanguage(draft, null, null, c).check : c).filter(c => c.status === "fail" && c.id !== "response_concision");
  if (!routingFieldsValid(draft)) findings.push({ id: "routing_fields", status: "fail", detail: "Disposition and priority/work-type fields are inconsistent." });
  if (!graphSourceIntegrity(draft, hits)) findings.push({ id: "exact_source_quote", status: "fail", detail: "A cited quotation or source identity does not match its supplied passage." });
  const packet = graphJudgePacket({ patient: run.message, draft, hits, notice, basis: run.graph.safety?.basis, questions, contractFindings: findings });
  need(Buffer.byteLength(JSON.stringify(packet)) <= 60_000, "AUDIT_PACKET_LIMIT_EXCEEDED");
  return { packet, draftHash: digest(draft), packetHash: digest(packet), emittedEvents: run.responseEvents, reviewedArtifact: run.status === "complete" ? "published_final" : "withheld_draft_diagnostic_only" };
}

export function makeFastAuditPlan(studyDirectory: string, priorAccountedUSD: number, allocationUSD: number = FAST_AUDIT.maximumAllocationUSD) {
  const directory = resolve(studyDirectory), files: { path: string; hash: string }[] = [];
  const read = <T>(path: string): T => { const bytes = readFileSync(path); files.push({ path, hash: sha256(bytes) }); return JSON.parse(bytes.toString()); };
  const manifest = read<{ protocol: string; fingerprint: string; cases: SourceCase[]; reservation: { perRunUSD: number }; authorization: { priorAccountedUSD: number }; promptHash: string; [key: string]: unknown }>(join(directory, "manifest.json"));
  const { fingerprint, ...payload } = manifest;
  need(manifest.protocol === "fast-routing-http/v1" && digest(payload) === fingerprint && manifest.cases.length > 0 && manifest.cases.length <= 50 && new Set(manifest.cases.map(c => c.id)).size === manifest.cases.length, "SOURCE_MANIFEST_INVALID");
  const summary = read<{ planned: number; starts: number; results: number; fingerprint: string; accountedUSD: number; totalAccountedUSD: number }>(join(directory, "summary.json"));
  let sourceAccountedUSD = 0, starts = 0, results = 0;
  const cases = manifest.cases.map((c, i) => {
    need(/^C\d{2}$/.test(c.id) && sha256(c.message) === c.inputHash, "SOURCE_PATIENT_BINDING_FAILED");
    const prefix = join(directory, `${String(i + 1).padStart(2, "0")}-${c.id}`), started = existsSync(`${prefix}-started.json`), hasResult = existsSync(`${prefix}-result.json`);
    if (started) { const s = read<{ id: string; index: number; inputHash: string }>(`${prefix}-started.json`); need(s.id === c.id && s.index === i + 1 && s.inputHash === c.inputHash, "SOURCE_START_MISMATCH"); starts++; }
    need(!hasResult || started, "SOURCE_RESULT_WITHOUT_START");
    const attempt = hasResult ? read<SourceAttempt>(`${prefix}-result.json`) : null;
    if (attempt) { need(attempt.id === c.id && attempt.index === i + 1 && Number.isFinite(attempt.accountedUSD) && attempt.accountedUSD >= 0, "SOURCE_RESULT_MISMATCH"); results++; sourceAccountedUSD += attempt.accountedUSD; }
    else if (started) sourceAccountedUSD += manifest.reservation.perRunUSD;
    const row = { index: i + 1, id: c.id, patientHash: c.inputHash, generationComplete: Boolean(attempt?.run?.status === "complete" && !attempt.failure && !attempt.run.failure && !attempt.identityFailures.length), generationStatus: attempt?.run?.status ?? (started ? "unfinished" : "not_started"), generationFailure: attempt?.failure ?? attempt?.run?.failure ?? null,
      unavailable: started ? "NO_RECONSTRUCTIBLE_FINAL_DRAFT" : "GENERATION_NOT_STARTED", packet: null as Packet | null, packetHash: null as string | null, draftHash: null as string | null, reviewedArtifact: null as string | null, emittedEvents: attempt?.run?.responseEvents ?? [] };
    if (!attempt?.run || attempt.failure || attempt.identityFailures.length) return { ...row, unavailable: attempt?.failure ?? (attempt?.identityFailures.length ? "GENERATION_IDENTITY_FAILED" : row.unavailable) };
    const run = read<DispositionRun>(`${prefix}-run.json`);
    need(sameRepairValue(run, attempt.run) && run.message === c.message && run.inputHash === c.inputHash && run.promptHash === manifest.promptHash, "SOURCE_RUN_IDENTITY_MISMATCH");
    const exposed = run.responseEvents?.filter(e => ["action", "intake_question"].includes(e.kind)) ?? [];
    const published = attempt.receipts.filter(r => r.phase === "published").map(r => r.event).filter(e => e && ["action", "intake_question"].includes(e.kind));
    need(sameRepairValue(exposed, published), "PUBLISHED_EARLY_CONTEXT_MISMATCH");
    try { return { ...row, ...fastAuditPacket(run), generationComplete: run.status === "complete" && !run.failure, unavailable: null }; }
    catch (e) { return { ...row, unavailable: e instanceof Error ? e.message : "AUDIT_RECONSTRUCTION_FAILED" }; }
  });
  need(summary.fingerprint === fingerprint && summary.planned === cases.length && summary.starts === starts && summary.results === results && Math.abs(summary.accountedUSD - sourceAccountedUSD) < 1e-8 && Math.abs(summary.totalAccountedUSD - manifest.authorization.priorAccountedUSD - sourceAccountedUSD) < 1e-8, "SOURCE_DENOMINATOR_OR_ACCOUNTING_MISMATCH");
  need(Number.isFinite(priorAccountedUSD) && priorAccountedUSD >= Math.max(FAST_AUDIT.minimumPriorUSD, summary.totalAccountedUSD) && Number.isFinite(allocationUSD) && allocationUSD > 0 && allocationUSD <= FAST_AUDIT.maximumAllocationUSD && priorAccountedUSD + allocationUSD <= FAST_AUDIT.ceilingUSD, "AUDIT_ALLOCATION_EXCEEDS_AUTHORITY");
  const config = resolveGraphConfig({ COUNSEL_GRAPH_JUDGE_MODEL: FAST_AUDIT.model, COUNSEL_GRAPH_JUDGE_STYLE: "full" }), settings = graphRequestSettings("judge", config), instructions = graphJudgeInstructions("full"), schema = graphJudgeSchema.toJSONSchema();
  const implementation = [...sourceFiles(), "apps/evaluation/lib/preserved-care.ts", "apps/evaluation/lib/care-alternative.ts", "scripts/fast-routing-audit.ts", "tests/fast-routing-audit.test.ts", "package.json", "package-lock.json"].sort().map(path => ({ path, hash: sha256(readFileSync(resolve(root, path))) }));
  return { protocol: FAST_AUDIT.protocol, createdAt: new Date().toISOString(), source: { directory, fingerprint, files, accountedUSD: sourceAccountedUSD },
    authorization: { priorAccountedUSD, allocationUSD, totalCeilingUSD: FAST_AUDIT.ceilingUSD, maximumCalls: cases.length, multiplier: FAST_AUDIT.multiplier, statement: "Up to $20 offline review within the user's $200 total ceiling, including at least $87.093099025 already spent. Operator must reconcile any intervening work before freezing this plan." },
    model: FAST_AUDIT.model, config, instructions, instructionsHash: sha256(instructions), schema, schemaHash: digest(schema), settings, settingsHash: digest(settings), timeoutMs: EXECUTION_POLICY.modelTimeoutMs,
    pricing: STUDY_PRICING.models["openai/gpt-6-astra"], pricingSource: "https://developers.openai.com/api/docs/models/gpt-6-astra", implementation, cases,
    interpretation: "External model diagnostic, outside the live path. No gold/reference labels or prior judge outputs sent. Withheld drafts are not delivered answers even if accepted here. Unavailable, failed, unfinished and unstarted rows remain in all-case denominators. Same full seven-criterion rubric; no clinical approval or automatic promotion." };
}
export type FastAuditPlan = ReturnType<typeof makeFastAuditPlan>;
export type FastAuditCase = FastAuditPlan["cases"][number];
export function validateFastAuditPlan(frozen: FastAuditPlan & { fingerprint: string }) {
  const { fingerprint, ...plan } = frozen; need(digest(plan) === fingerprint, "AUDIT_MANIFEST_HASH_MISMATCH");
  need(digest({ ...makeFastAuditPlan(plan.source.directory, plan.authorization.priorAccountedUSD, plan.authorization.allocationUSD), createdAt: plan.createdAt }) === fingerprint, "AUDIT_FROZEN_SOURCE_OR_POLICY_DRIFT"); return plan;
}
export function fastAuditReservation(plan: FastAuditPlan, c: FastAuditCase) {
  return !c.packet ? 0 : ((Buffer.byteLength(JSON.stringify(c.packet) + plan.instructions + JSON.stringify(plan.schema)) + 8192) * plan.pricing.input + plan.settings.modelSettings.maxOutputTokens * plan.pricing.output) / 1e6 * plan.authorization.multiplier;
}
export function fastAuditResult(plan: FastAuditPlan, c: FastAuditCase, raw: ModelTransportResult | null, status: "not_dispatched" | "unfinished" = "not_dispatched", reason: string | null = null) {
  const reserve = fastAuditReservation(plan, c), usage = raw?.usage;
  const known = usage && [usage.inputTokens, usage.outputTokens].every(n => n !== null && Number.isFinite(n) && n >= 0);
  const baseUSD = known ? (usage.inputTokens! * plan.pricing.input + usage.outputTokens! * plan.pricing.output) / 1e6 : null;
  const execution = raw && c.packet ? bindGraphJudgeExecution({ role: "critic", model: plan.model, modelCalls: 1, ...structuredClone(raw) }, c.packet) : null;
  const judge = execution?.failure ? null : execution?.output as ReturnType<typeof graphJudgeSchema.parse> | null;
  return { index: c.index, id: c.id, generationComplete: c.generationComplete, generationStatus: c.generationStatus, generationFailure: c.generationFailure,
    status: !c.packet ? "audit_unavailable" : raw ? execution?.failure ? "audit_failed" : "valid_review" : status,
    reason: c.unavailable ?? execution?.failure ?? reason, reservationUSD: reserve, baseUSD, accountedUSD: raw || status === "unfinished" ? baseUSD === null ? reserve : baseUSD * plan.authorization.multiplier : 0,
    raw, execution, verdict: judge?.verdict ?? null, criteria: judge?.criteria ?? null, clinicalApproval: false, runtimeChanged: false };
}
type AuditRow = ReturnType<typeof fastAuditResult>;
export function summarizeFastAudit(plan: FastAuditPlan, rows: AuditRow[], stopReason: string | null) {
  need(rows.length === plan.cases.length, "ALL_GENERATION_CASES_REQUIRED");
  for (const [i, row] of rows.entries()) need(digest(row) === digest(fastAuditResult(plan, plan.cases[i], row.raw, row.status === "unfinished" ? "unfinished" : "not_dispatched", row.reason)), "AUDIT_ROW_BINDING_OR_ACCOUNTING_MISMATCH");
  const accountedUSD = rows.reduce((n, r) => n + r.accountedUSD, 0);
  return { protocol: plan.protocol, plannedGenerationCases: rows.length, generationComplete: rows.filter(r => r.generationComplete).length, calls: rows.filter(r => r.raw || r.status === "unfinished").length,
    validReviews: rows.filter(r => r.status === "valid_review").length, completedAndAccepted: rows.filter(r => r.generationComplete && r.status === "valid_review" && r.verdict === "accept").length,
    failed: rows.filter(r => r.status === "audit_failed").length, unfinished: rows.filter(r => r.status === "unfinished").length, unavailable: rows.filter(r => r.status === "audit_unavailable").length, notDispatched: rows.filter(r => r.status === "not_dispatched").length,
    accountedUSD, totalAccountedUSD: plan.authorization.priorAccountedUSD + accountedUSD, stopReason, rows, clinicalApproval: false, promotion: "not_promoted", limitation: plan.interpretation };
}
export async function executeFastAudit(plan: FastAuditPlan, c: FastAuditCase): Promise<ModelTransportResult> {
  need(c.packet, "NO_AUDIT_PACKET"); const agent = new Agent({ id: "offline-fast-routing-audit", name: "Offline full Astra audit", model: plan.model as `${string}/${string}`, instructions: plan.instructions, maxRetries: 0 });
  const deadline = requestDeadline(new AbortController().signal, plan.timeoutMs);
  try { return await consumeStructuredStream({ signal: deadline.signal, start: abortSignal => agent.stream(JSON.stringify(c.packet), { abortSignal, structuredOutput: { schema: safetyEnvelopeTransport(graphJudgeSchema, z.unknown()), errorStrategy: "strict" }, ...plan.settings, tracingOptions: { hideInput: true, hideOutput: true } }) }); }
  finally { deadline.dispose(); }
}
export async function runFastAudit(plan: FastAuditPlan, dispatch: (c: FastAuditCase) => Promise<ModelTransportResult>, write: (name: string, value: unknown) => void) {
  const rows: AuditRow[] = []; let accounted = 0, stopReason: string | null = null;
  for (const c of plan.cases) {
    const reserve = fastAuditReservation(plan, c), prefix = `${String(c.index).padStart(2, "0")}-${c.id}`;
    if (c.packet && !stopReason && accounted + reserve > plan.authorization.allocationUSD) stopReason = "AUDIT_RESERVATION_EXHAUSTED";
    if (!c.packet || stopReason) { const row = fastAuditResult(plan, c, null, "not_dispatched", stopReason); rows.push(row); write(`${prefix}-result.json`, row); continue; }
    const began = performance.now(); write(`${prefix}-started.json`, { index: c.index, id: c.id, packetHash: c.packetHash, model: plan.model, settingsHash: plan.settingsHash, reservationUSD: reserve, at: new Date().toISOString() });
    let raw: ModelTransportResult;
    try { raw = await dispatch(c); }
    catch { raw = { output: null, failure: "AUDIT_DISPATCH_FAILED", durationMs: Math.round(performance.now() - began), usage: { inputTokens: null, outputTokens: null },
      transportTimings: { startResolvedMs: null, objectResolvedMs: null, usageResolvedMs: null, finishReasonResolvedMs: null, streamEndMs: null }, cacheUsage: { cachedInputTokens: null, cacheCreationInputTokens: null } }; }
    write(`${prefix}-raw.json`, raw); const row = fastAuditResult(plan, c, raw); rows.push(row); accounted += row.accountedUSD; write(`${prefix}-result.json`, row);
    if (row.accountedUSD > reserve) stopReason = "AUDIT_RESERVATION_BOUND_EXCEEDED";
  }
  return summarizeFastAudit(plan, rows, stopReason);
}
export function inspectFastAudit(directory: string, plan: FastAuditPlan) {
  const rows = plan.cases.map(c => {
    const prefix = join(directory, `${String(c.index).padStart(2, "0")}-${c.id}`), started = existsSync(`${prefix}-started.json`), result = existsSync(`${prefix}-result.json`);
    if (started) { const { at, ...s } = JSON.parse(readFileSync(`${prefix}-started.json`, "utf8"));
      need(Number.isFinite(Date.parse(at)) && digest(s) === digest({ index: c.index, id: c.id, packetHash: c.packetHash, model: plan.model, settingsHash: plan.settingsHash, reservationUSD: fastAuditReservation(plan, c) }), "AUDIT_START_BINDING_FAILED"); }
    if (!result) return fastAuditResult(plan, c, null, started ? "unfinished" : "not_dispatched", started ? "START_WITHOUT_RESULT" : "NOT_DISPATCHED");
    const row = JSON.parse(readFileSync(`${prefix}-result.json`, "utf8")) as AuditRow;
    need(started === Boolean(row.raw || row.status === "unfinished"), "AUDIT_START_RESULT_MISMATCH");
    if (row.raw) need(digest(JSON.parse(readFileSync(`${prefix}-raw.json`, "utf8"))) === digest(row.raw), "AUDIT_RAW_RESULT_MISMATCH"); return row;
  });
  return summarizeFastAudit(plan, rows, "READ_ONLY_INSPECTION");
}
export async function main(args = process.argv.slice(2)) {
  const modes = ["--plan", "--live", "--inspect"].filter(m => args.includes(m)), arg = (key: string) => args.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3);
  need(modes.length === 1 && args.every(a => ["--plan", "--live", "--inspect"].includes(a) || ["study", "output", "manifest", "claim", "prior-accounted-usd", "allocation-usd"].some(k => a.startsWith(`--${k}=`))), "EXPLICIT_MODE_AND_KNOWN_ARGUMENTS_REQUIRED");
  const output = arg("output"); need(output && (modes[0] === "--inspect" || !existsSync(output)), "FRESH_OUTPUT_REQUIRED");
  const write = (name: string, value: unknown) => writeFileSync(join(output, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  if (modes[0] === "--plan") {
    need(arg("study") && arg("prior-accounted-usd"), "STUDY_AND_RECONCILED_PRIOR_REQUIRED"); const plan = makeFastAuditPlan(arg("study")!, Number(arg("prior-accounted-usd")), Number(arg("allocation-usd") ?? 20));
    mkdirSync(output, { recursive: true, mode: 0o700 }); write("manifest.json", { ...plan, fingerprint: digest(plan) }); console.log(JSON.stringify({ paidCalls: 0, cases: plan.cases.length, eligible: plan.cases.filter(c => c.packet).length, fingerprint: digest(plan) })); return;
  }
  const manifestPath = arg("manifest"); need(manifestPath, "MANIFEST_REQUIRED"); const frozen = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (modes[0] === "--inspect") { const { fingerprint, ...p } = frozen; need(digest(p) === fingerprint && p.protocol === FAST_AUDIT.protocol, "AUDIT_MANIFEST_HASH_MISMATCH"); console.log(JSON.stringify(inspectFastAudit(output, p))); return; }
  const plan = validateFastAuditPlan(frozen);
  need(arg("claim") === frozen.fingerprint, "EXACT_AUDIT_CLAIM_REQUIRED"); need(process.env.OPENAI_API_KEY, "OPENAI_API_KEY_MISSING");
  const claim = { fingerprint: frozen.fingerprint, output: resolve(output), allocationUSD: plan.authorization.allocationUSD, at: new Date().toISOString() }, ledger = resolve(root, "outputs/.fast-routing-audit-claims");
  mkdirSync(ledger, { recursive: true }); writeFileSync(join(ledger, `${plan.source.fingerprint}.json`), JSON.stringify(claim) + "\n", { flag: "wx", mode: 0o600 });
  writeFileSync(`${manifestPath}.consumed.json`, JSON.stringify(claim) + "\n", { flag: "wx", mode: 0o600 });
  mkdirSync(output, { recursive: true, mode: 0o700 }); write("manifest.json", frozen);
  try { write("summary.json", await runFastAudit(plan, c => executeFastAudit(plan, c), write)); }
  catch (e) { try { write("interruption-summary.json", inspectFastAudit(output, plan)); } catch {} throw e; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
