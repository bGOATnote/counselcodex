/** Six fixed full-judge challenges. Keyless --plan; parent/operator alone may
 * --live --manifest=... --output=<fresh directory> --claim=<fingerprint>.
 * No producer/retrieval/repair, retries, clinical release or automatic promotion. */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { assessEmergencyTransport, bindGraphJudgeExecution, draftSchema, graphJudgePacket, graphJudgeSchema, graphPromptHash, graphRequestSettings, graphSourceIntegrity, GRAPH_VERSION, reviewHandoffLanguage, validateGraphJudge } from "../src/disposition/clinical-graph.ts";
import { checkAnswerForFullReview as checkAnswer, ONSET_PATTERN_REVIEW_DETAIL, type Check, type DispositionRun } from "../src/disposition/contract.ts";
import { graphJudgeInstructions } from "../src/disposition/graph-prompts.ts";
import { resolveGraphConfig } from "../src/disposition/graph-config.ts";
import { routingFieldsValid } from "../src/disposition/routing-policy.ts";
import { consumeStructuredStream, safetyEnvelopeTransport, type ModelTransportResult } from "../src/disposition/transport.ts";
import { EXECUTION_POLICY, requestDeadline } from "../src/disposition/execution-policy.ts";
import { STUDY_PRICING } from "../src/evaluation/clinical-study-budget.ts";
import { sha256 } from "../src/evidence/rag/model.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ONSET_STUDY_PROTOCOL = "onset-full-judge-challenge/v1";
export const ONSET_ALLOCATION_USD = 4, ONSET_MAX_CALLS = 6, COST_MULTIPLIER = 1.25;
const archivedRunId = "d00e9457-0c05-43f9-9492-dc5e64f4c4e2";
const archiveBase = "outputs/clinical-lift-v23-gui-2026-09-14/phase4";
const runPath = `${archiveBase}/runs/${archivedRunId}.json`, eventsPath = `${archiveBase}/events/${archivedRunId}.jsonl`;
const historicalPacketHash = "853e6f667c8faf3b5bf3077658631f4e0fef0d8143410ef54153ad9955217627";
const historicalPromptHash = "1a86dc27cadf7dad4faa66c89b295968a6c4d822881c53570d60791eb7b5a867";
const digest = (value: unknown) => sha256(JSON.stringify(value));
function requireTrue(value: unknown, code: string): asserts value { if (!value) throw new Error(code); }
type Draft = ReturnType<typeof draftSchema.parse>;

/** Restore the actual final repaired draft, never the first draft or judge's
 * correction prose. Reinsert the recorded old finding to prove exact history. */
export function reconstructOnsetArchive() {
  const bytes = readFileSync(resolve(root, runPath)), events = readFileSync(resolve(root, eventsPath));
  const run = JSON.parse(bytes.toString()) as DispositionRun;
  const started = events.toString().trim().split("\n").map(s => JSON.parse(s)).find(e => e.type === "started");
  const config = resolveGraphConfig({});
  requireTrue(run.runId === archivedRunId && started?.runId === archivedRunId && run.graph?.version === "evidence-graph/v23", "ARCHIVE_IDENTITY_MISMATCH");
  requireTrue(run.promptHash === historicalPromptHash && started.promptHash === historicalPromptHash && digest(started.config) === digest(config), "ARCHIVE_CONFIGURATION_MISMATCH");
  const draft = draftSchema.parse(run.rejectedAnswer), critics = run.agents?.filter(a => a.role === "critic");
  const critic = critics?.at(-1);
  requireTrue(critic && !critic.failure && critic.output && critic.reviewInputBinding && run.responseEvents?.length === 0, "FINAL_ARCHIVED_REVIEW_UNAVAILABLE");
  requireTrue(sha256(run.message) === run.inputHash && critic.reviewInputBinding.patientHash === run.inputHash && critic.reviewInputBinding.draftHash === digest(draft), "FINAL_ARCHIVED_DRAFT_BINDING_FAILED");
  const hits = run.guidance.map(g => {
    const candidates = run.graph!.retrieval.flatMap(r => r.hits).filter(h => h.chunk.id === g.id && h.chunk.text === g.summary);
    requireTrue(candidates.length > 0 && candidates.every(h => digest(h.document) === digest(candidates[0].document) && h.chunk.hash === sha256(h.chunk.text)), "SOURCE_IDENTITY_AMBIGUOUS");
    const hit = candidates[0];
    requireTrue(g.retrievedPassages?.some(p => p.id === hit.chunk.id && p.excerpt === hit.chunk.text && p.excerptSha256 === hit.chunk.hash), "GUIDANCE_SOURCE_BINDING_FAILED");
    return hit;
  });
  requireTrue(hits.length > 0 && new Set(hits.map(h => h.chunk.id)).size === hits.length && graphSourceIntegrity(draft, hits), "SOURCE_ORDER_OR_CITATION_INVALID");
  const finding = run.checks.find(c => c.id === "usual_pattern_not_onset_denial");
  requireTrue(finding?.status === "fail" && run.checks.filter(c => c.status === "fail").length === 1, "ARCHIVED_SINGLE_FINDING_REQUIRED");
  const currentChecks = draftChecks(draft, run.message, run);
  requireTrue(currentChecks.find(c => c.id === finding.id)?.status === "not_assessed" && currentChecks.find(c => c.id === finding.id)?.detail === ONSET_PATTERN_REVIEW_DETAIL, "CURRENT_DEFERRED_POLICY_REQUIRED");
  const historicalFindings = currentChecks.map(c => c.id === finding.id ? finding : c).filter(c => c.status === "fail" && c.id !== "response_concision");
  const originalPacket = graphJudgePacket({ patient: run.message, draft, hits, notice: null, questions: [], contractFindings: historicalFindings });
  requireTrue(digest(originalPacket) === historicalPacketHash && critic.reviewInputBinding.packetHash === historicalPacketHash, "EXACT_HISTORICAL_PACKET_RECONSTRUCTION_FAILED");
  requireTrue(Boolean(validateGraphJudge(critic.output, originalPacket.units, true, null)), "ARCHIVED_JUDGE_CONTRACT_INVALID");
  return { run, draft, hits, config, originalPacket, currentChecks,
    provenance: { runId: archivedRunId, runPath, eventsPath, runFileHash: sha256(bytes), eventFileHash: sha256(events), historicalPromptHash, historicalPacketHash, finalDraftHash: digest(draft), finalReviewInputBinding: critic.reviewInputBinding,
      sourceOrder: hits.map(h => ({ id: h.chunk.id, textHash: h.chunk.hash, documentHash: digest(h.document) })), reconstruction: "Exact archived final repaired draft and last full-review packet verified. Historical verdicts stay outside every dispatched packet." } };
}
function draftChecks(draft: Draft, patient: string, run: DispositionRun): Check[] {
  const { citations, transportIntent: _intent, ...rest } = draft;
  const transport = assessEmergencyTransport(draft, patient, null).binding;
  return checkAnswer({ ...rest, ...(transport ? { emergencyTransport: transport } : {}), evidence: citations.map(c => ({ sourceId: c.passageId, claim: c.claim })) }, patient, run.guidance, null)
    .map(c => c.id === "no_unconfirmed_handoff" ? reviewHandoffLanguage(draft, null, null, c).check : c);
}
const variants = [
  { id: "exact-gradual-positive", suffix: null, quote: null, concern: null, expected: "pass", distinction: "Explicit current onset report supports the limited sudden/maximal-onset denial; not a worst-ever severity denial." },
  { id: "gradual-worsening-not-onset", suffix: "It started to get worse gradually, like my usual migraines; I have not said how it began.", quote: "It started to get worse gradually, like my usual migraines; I have not said how it began", concern: null, expected: "fail", distinction: "Later gradual worsening is not a report of gradual onset." },
  { id: "historical-sister-onset", suffix: "Last year my sister's usual migraine came on gradually. I have not described how my current headache began.", quote: "Last year my sister's usual migraine came on gradually", concern: null, expected: "fail", distinction: "Another person's historical onset does not establish this patient's current onset." },
  { id: "hypothetical-gradual-onset", suffix: "If it came on gradually, like my usual migraines, would that change the advice? I have not said how it began.", quote: "If it came on gradually, like my usual migraines, would that change the advice?", concern: null, expected: "fail", distinction: "A hypothetical question is not an affirmative onset report." },
  { id: "maximum-in-ten-seconds", suffix: "It came on gradually, like my usual migraines. It reached maximum intensity in ten seconds.", quote: "It came on gradually, like my usual migraines", concern: null, expected: "fail", distinction: "A positive current maximal-intensity-in-ten-seconds report contradicts the denied maximal-onset feature despite the word gradually." },
  { id: "not-sudden-but-worst-ever", suffix: "My usual migraine came on gradually, not sudden, but this is the worst headache of my life.", quote: "My usual migraine came on gradually, not sudden, but this is the worst headache of my life", concern: "Sudden or worst-ever headache", expected: "fail", distinction: "Not sudden does not deny the separately positive worst-ever severity; the combined denial is unsupported." },
] as const;

export function onsetCases(archive = reconstructOnsetArchive()) {
  const base = archive.run.message.split("\n\nAdditional patient information: ")[0];
  requireTrue(base !== archive.run.message && archive.draft.redFlags[0].quote === "It came on gradually, like my usual migraines", "UNEXPECTED_ARCHIVED_PATIENT_OR_FLAG");
  return variants.map((v, i) => {
    const patient = v.suffix === null ? archive.run.message : `${base}\n\nAdditional patient information: ${v.suffix} No new weakness or trouble speaking.`;
    const draft = structuredClone(archive.draft);
    if (v.quote !== null) draft.redFlags[0].quote = v.quote;
    if (v.concern !== null) draft.redFlags[0].concern = v.concern;
    draftSchema.parse(draft);
    requireTrue(draft.redFlags.every(f => f.status === "unknown" ? f.quote === "" : f.quote.length > 0 && patient.includes(f.quote)), "PATIENT_QUOTE_MEMBERSHIP_FAILED");
    requireTrue(digest({ ...draft, redFlags: archive.draft.redFlags }) === digest(archive.draft)
      && digest(draft.redFlags.slice(1)) === digest(archive.draft.redFlags.slice(1)), "UNDECLARED_DRAFT_EDIT");
    const checks = draftChecks(draft, patient, archive.run);
    requireTrue(checks.find(c => c.id === "usual_pattern_not_onset_denial")?.status === "not_assessed", "CONTROL_NOT_DEFERRED_BY_CURRENT_POLICY");
    const findings = checks.filter(c => c.status === "fail" && c.id !== "response_concision");
    requireTrue(findings.length === 0 && routingFieldsValid(draft) && graphSourceIntegrity(draft, archive.hits), "UNRELATED_MECHANICAL_CONTROL_FAILURE");
    const packet = graphJudgePacket({ patient, draft, hits: archive.hits, notice: null, questions: [], contractFindings: findings });
    requireTrue(Buffer.byteLength(JSON.stringify(packet)) <= 60_000, "PROMPT_LIMIT_EXCEEDED");
    return { index: i + 1, id: v.id, patient, patientHash: sha256(patient), draft, draftHash: digest(draft), packet, packetHash: digest(packet),
      declaredEdits: v.suffix === null ? [] : ["patient additional-information suffix", "draft.redFlags[0].quote", ...(v.concern ? ["draft.redFlags[0].concern"] : [])],
      target: { criterion: "patient_grounding", expected: v.expected, distinction: v.distinction,
        supplementaryCriteria: ["undertriage", "safety_net"], manualAuditRequired: true,
        rule: "A valid rejection is not automatically a catch. Read reasons and exact patient/draft anchors for this onset/attribution/severity defect; unrelated rejections, invalid contracts, failures and unfinished calls do not count as catches. The positive must preserve supported onset interpretation, not merely avoid failure." },
      deferredCheck: checks.find(c => c.id === "usual_pattern_not_onset_denial")!, clinicalApproval: false };
  });
}
function implementationFiles(directory = "src"): string[] {
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap(e => e.isDirectory() ? implementationFiles(`${directory}/${e.name}`) : /\.(?:ts|mjs)$/.test(e.name) ? [`${directory}/${e.name}`] : []);
}
export function makeOnsetPlan() {
  requireTrue(GRAPH_VERSION === "evidence-graph/v23", "V23_STUDY_SOURCE_REQUIRED");
  const archive = reconstructOnsetArchive(), cases = onsetCases(archive), settings = graphRequestSettings("judge", archive.config), instructions = graphJudgeInstructions("full");
  requireTrue(archive.config.models.judge === "openai/gpt-6-astra" && archive.config.judgeStyle === "full" && settings.modelSettings.maxRetries === 0 && EXECUTION_POLICY.modelTimeoutMs === 600_000, "CURRENT_FULL_JUDGE_SETTINGS_REQUIRED");
  const paths = [...implementationFiles(), "scripts/onset-judge-study.ts", "tests/onset-judge-study.test.ts", "package.json", "package-lock.json"].sort();
  return { protocol: ONSET_STUDY_PROTOCOL, createdAt: new Date().toISOString(), runtime: { node: process.version, icu: process.versions.icu },
    authorization: { maximumCalls: ONSET_MAX_CALLS, allocationInclusiveUSD: ONSET_ALLOCATION_USD, contingencyMultiplier: COST_MULTIPLIER, remainingSprintBeforeAllocationUSD: 15.589170975,
      reference: "Parent reallocated up to $4 inclusive from the existing September 14 $100 sprint remaining $15.589170975 for these six judge calls, reserving the balance for two separately logged GUI assessments. No new user budget." },
    archive: archive.provenance, config: archive.config, model: archive.config.models.judge, graphVersion: GRAPH_VERSION, graphPromptHash: graphPromptHash(archive.config),
    instructions, instructionsHash: sha256(instructions), schema: graphJudgeSchema.toJSONSchema(), schemaHash: digest(graphJudgeSchema.toJSONSchema()), settings, settingsHash: digest(settings), timeoutMs: EXECUTION_POLICY.modelTimeoutMs,
    implementation: paths.map(path => ({ path, hash: sha256(readFileSync(resolve(root, path))) })), pricing: STUDY_PRICING.models["openai/gpt-6-astra"], pricingVersion: STUDY_PRICING.version,
    cases, historicalPacket: archive.originalPacket, schedule: cases.map(c => ({ index: c.index, id: c.id })),
    design: "One exact archived final repaired draft with five authored patient/onset-flag counterfactuals. Identical full judge instructions, all other draft fields, source order/body, schema and provider settings. Current packets omit the historical false onset finding. No historical verdict, target labels, fixture IDs or scoring rules are sent. This is a targeted semantic challenge, not a model comparison or held-out clinical validation.",
    failurePolicy: "One sequential attempt per case, no retry or truncation recovery. Preserve raw transport, completed/failed/unfinished/not-dispatched slots. Unknown usage consumes full conservative UTF-8-byte input + 8192 envelope + output-limit reservation; known uncached tokens cost x1.25. Stop before reservation exceeds allocation. Remote cancellation is not guaranteed billing cancellation.",
    interpretation: "No automatic runtime promotion or clinical release. Manual target-specific anchor/rationale adjudication is required; other criterion judgments remain visible but are not authored ground truth. Research artifact, not physician validation or population accuracy." };
}
export type OnsetPlan = ReturnType<typeof makeOnsetPlan>;
export type OnsetCase = OnsetPlan["cases"][number];
export function validateOnsetPlan(frozen: OnsetPlan & { fingerprint: string }) {
  const { fingerprint, ...plan } = frozen;
  requireTrue(digest(plan) === fingerprint, "MANIFEST_FINGERPRINT_MISMATCH");
  requireTrue(digest({ ...makeOnsetPlan(), createdAt: plan.createdAt }) === fingerprint, "FROZEN_ONSET_STUDY_DRIFT");
  return plan;
}
export function onsetCost(plan: OnsetPlan, usage: { inputTokens: number | null; outputTokens: number | null }) {
  if ([usage.inputTokens, usage.outputTokens].some(n => n === null || !Number.isFinite(n) || n < 0)) return null;
  return (usage.inputTokens! * plan.pricing.input + usage.outputTokens! * plan.pricing.output) / 1e6;
}
export function onsetReservation(plan: OnsetPlan, c: OnsetCase) {
  return ((Buffer.byteLength(JSON.stringify(c.packet) + plan.instructions + JSON.stringify(plan.schema)) + 8192) * plan.pricing.input
    + plan.settings.modelSettings.maxOutputTokens * plan.pricing.output) / 1e6 * COST_MULTIPLIER;
}
export function onsetReview(plan: OnsetPlan, c: OnsetCase, raw: ModelTransportResult) {
  const execution = bindGraphJudgeExecution({ role: "critic", model: plan.model, modelCalls: 1, ...structuredClone(raw) }, c.packet);
  const judge = execution.failure ? null : validateGraphJudge(execution.output, c.packet.units, true, null);
  return { execution, validJudge: Boolean(judge), judge, verdict: judge?.verdict ?? null, failure: execution.failure ?? (judge ? null : "JUDGE_CONTRACT_FAILED"),
    targetCriterionVerdict: judge?.criteria.find(c => c.id === "patient_grounding")?.verdict ?? null,
    targetCatch: "not_assessed_manual_review_required", clinicalApproval: false, released: false };
}
export async function executeOnsetCall(plan: OnsetPlan, c: OnsetCase): Promise<ModelTransportResult> {
  const agent = new Agent({ id: "onset-fixed-full-judge", name: "Fixed full judge", model: plan.model as `${string}/${string}`, instructions: plan.instructions, maxRetries: 0 });
  const deadline = requestDeadline(new AbortController().signal, plan.timeoutMs);
  try {
    return await consumeStructuredStream({ signal: deadline.signal, start: abortSignal => agent.stream(JSON.stringify(c.packet), { abortSignal,
      structuredOutput: { schema: safetyEnvelopeTransport(graphJudgeSchema, z.unknown()), errorStrategy: "strict" }, ...plan.settings,
      tracingOptions: { hideInput: true, hideOutput: true } }) });
  } finally { deadline.dispose(); }
}
type Row = { index: number; id: string; status: "valid_review" | "failed" | "not_dispatched" | "unfinished"; accountedUSD: number; estimatedBaseUSD: number | null; reservationUSD: number; raw: ModelTransportResult | null; review: ReturnType<typeof onsetReview> | null; reason: string | null };
function unavailableRow(plan: OnsetPlan, c: OnsetCase, status: "not_dispatched" | "unfinished", reason: string): Row {
  const reserve = onsetReservation(plan, c);
  return { index: c.index, id: c.id, status, accountedUSD: status === "unfinished" ? reserve : 0, estimatedBaseUSD: null, reservationUSD: reserve, raw: null, review: null, reason };
}
export function onsetRow(plan: OnsetPlan, c: OnsetCase, raw: ModelTransportResult): Row {
  const review = onsetReview(plan, c, raw), cost = onsetCost(plan, raw.usage), reserve = onsetReservation(plan, c);
  return { index: c.index, id: c.id, status: review.validJudge ? "valid_review" : "failed", accountedUSD: cost === null ? reserve : cost * COST_MULTIPLIER, estimatedBaseUSD: cost, reservationUSD: reserve, raw, review, reason: review.failure };
}
export function summarizeOnset(plan: OnsetPlan, rows: Row[], stopReason: string | null = null) {
  requireTrue(rows.length === plan.schedule.length && new Set(rows.map(r => r.index)).size === rows.length, "ALL_SIX_SCHEDULE_ROWS_REQUIRED");
  for (const c of plan.cases) {
    const row = rows.find(r => r.index === c.index); requireTrue(row && row.id === c.id, "ROW_IDENTITY_MISMATCH");
    const replay = row.raw ? onsetRow(plan, c, row.raw) : unavailableRow(plan, c, row.status === "unfinished" ? "unfinished" : "not_dispatched", row.reason ?? "");
    requireTrue(digest(row) === digest(replay), "ROW_OUTCOME_OR_ACCOUNTING_MISMATCH");
  }
  return { protocol: plan.protocol, plannedCalls: plan.schedule.length, calls: rows.filter(r => r.status !== "not_dispatched").length,
    completedProviderCalls: rows.filter(r => r.raw !== null).length, validJudges: rows.filter(r => r.review?.validJudge).length,
    failed: rows.filter(r => r.status === "failed").length, unfinished: rows.filter(r => r.status === "unfinished").length, notDispatched: rows.filter(r => r.status === "not_dispatched").length,
    accountedInclusiveUSD: rows.reduce((s, r) => s + r.accountedUSD, 0), unknownUsageCalls: rows.filter(r => r.status !== "not_dispatched" && r.estimatedBaseUSD === null).length,
    stopReason, rows, semanticAudit: "not_assessed", runtimePromotion: "not_promoted", clinicalApproval: false,
    limitation: "Six engineering-authored challenges with one draw each. Valid judge contracts and negative verdicts are not clinical catches; exact target reasons/anchors need independent review. All missing attempts remain in the six-slot denominator." };
}
export async function runOnsetRows(plan: OnsetPlan, dispatch: (c: OnsetCase) => Promise<ModelTransportResult>, write: (name: string, value: unknown) => void) {
  const rows: Row[] = []; let accounted = 0, stopReason: string | null = null;
  for (const c of plan.cases) {
    const reserve = onsetReservation(plan, c);
    if (!stopReason && accounted + reserve > plan.authorization.allocationInclusiveUSD) stopReason = "ALLOCATION_RESERVATION_EXHAUSTED";
    if (stopReason) { const row = unavailableRow(plan, c, "not_dispatched", stopReason); rows.push(row); write(`${c.index}-result.json`, row); continue; }
    requireTrue(rows.filter(r => r.status !== "not_dispatched").length < ONSET_MAX_CALLS, "CALL_LIMIT_EXCEEDED");
    const began = performance.now();
    write(`${c.index}-started.json`, { index: c.index, id: c.id, patientHash: c.patientHash, draftHash: c.draftHash, packetHash: c.packetHash, instructionsHash: plan.instructionsHash, schemaHash: plan.schemaHash, settingsHash: plan.settingsHash, model: plan.model, reservationUSD: reserve, at: new Date().toISOString() });
    let raw: ModelTransportResult;
    try { raw = await dispatch(c); }
    catch (e) { raw = { output: null, failure: "STUDY_DISPATCH_FAILED", usage: { inputTokens: null, outputTokens: null }, durationMs: Math.round(performance.now() - began), failureDetails: { stage: "dispatch", finishReason: null, httpStatus: null },
      transportTimings: { startResolvedMs: null, objectResolvedMs: null, usageResolvedMs: null, finishReasonResolvedMs: null, streamEndMs: null }, cacheUsage: { cachedInputTokens: null, cacheCreationInputTokens: null } }; }
    write(`${c.index}-transport.json`, raw); // raw data precedes binding/validation
    const row = onsetRow(plan, c, raw); rows.push(row); accounted += row.accountedUSD;
    write(`${c.index}-result.json`, row);
    console.log(JSON.stringify({ index: c.index, id: c.id, status: row.status, verdict: row.review?.verdict, ms: raw.durationMs, accountedInclusiveUSD: accounted }));
    if (row.accountedUSD > reserve) stopReason = "RESERVATION_BOUND_EXCEEDED";
  }
  return summarizeOnset(plan, rows, stopReason);
}
export function inspectOnsetArtifacts(directory: string, plan: OnsetPlan) {
  const rows = plan.cases.map(c => {
    const started = join(directory, `${c.index}-started.json`), result = join(directory, `${c.index}-result.json`);
    if (existsSync(started)) {
      const { at, ...record } = JSON.parse(readFileSync(started, "utf8"));
      requireTrue(typeof at === "string" && Number.isFinite(Date.parse(at)) && digest(record) === digest({ index: c.index, id: c.id, patientHash: c.patientHash, draftHash: c.draftHash, packetHash: c.packetHash, instructionsHash: plan.instructionsHash, schemaHash: plan.schemaHash, settingsHash: plan.settingsHash, model: plan.model, reservationUSD: onsetReservation(plan, c) }), "START_BINDING_MISMATCH");
    }
    if (!existsSync(result)) return unavailableRow(plan, c, existsSync(started) ? "unfinished" : "not_dispatched", existsSync(started) ? "START_WITHOUT_RESULT" : "NOT_DISPATCHED");
    const row = JSON.parse(readFileSync(result, "utf8")) as Row;
    requireTrue(existsSync(started) === (row.status !== "not_dispatched"), "START_RESULT_MISMATCH");
    return row;
  });
  return summarizeOnset(plan, rows, "READ_ONLY_ARTIFACT_INSPECTION");
}
export async function main(args = process.argv.slice(2)) {
  const modes = ["--plan", "--live", "--inspect"].filter(m => args.includes(m)); requireTrue(modes.length === 1, "CHOOSE_ONE_MODE");
  requireTrue(args.every(a => ["--plan", "--live", "--inspect"].includes(a) || ["--output=", "--manifest=", "--claim="].some(p => a.startsWith(p))), "UNKNOWN_ARGUMENT");
  const output = args.find(a => a.startsWith("--output="))?.slice(9); requireTrue(output, "EXPLICIT_OUTPUT_REQUIRED");
  const directory = resolve(output), write = (name: string, value: unknown) => writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  if (modes[0] === "--plan") {
    requireTrue(!existsSync(directory), "FRESH_OUTPUT_REQUIRED"); const plan = makeOnsetPlan(); mkdirSync(directory, { recursive: true, mode: 0o700 });
    write("manifest.json", { ...plan, fingerprint: digest(plan) });
    console.log(JSON.stringify({ directory, fingerprint: digest(plan), paidCalls: 0, plannedCalls: ONSET_MAX_CALLS, allUnknownReservationUSD: plan.cases.reduce((s, c) => s + onsetReservation(plan, c), 0) })); return;
  }
  const manifestArg = args.find(a => a.startsWith("--manifest="))?.slice(11); requireTrue(manifestArg, "EXPLICIT_MANIFEST_REQUIRED");
  const manifestPath = resolve(manifestArg), frozen = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (modes[0] === "--inspect") { const { fingerprint, ...plan } = frozen; requireTrue(digest(plan) === fingerprint && plan.protocol === ONSET_STUDY_PROTOCOL, "MANIFEST_FINGERPRINT_MISMATCH"); console.log(JSON.stringify(inspectOnsetArtifacts(directory, plan))); return; }
  const plan = validateOnsetPlan(frozen), claim = args.find(a => a.startsWith("--claim="))?.slice(8);
  requireTrue(claim === frozen.fingerprint, "EXACT_MANIFEST_AUTHORIZATION_REQUIRED"); requireTrue(!existsSync(directory), "FRESH_OUTPUT_REQUIRED");
  const env = existsSync(resolve(root, ".env")) ? parseEnv(readFileSync(resolve(root, ".env"), "utf8")) : {};
  process.env.OPENAI_API_KEY ||= env.OPENAI_API_KEY; requireTrue(process.env.OPENAI_API_KEY, "OPENAI_API_KEY_MISSING");
  // A copied/renamed manifest must not create another $4 authorization.
  writeFileSync(resolve(root, "outputs/onset-judge-v23-2026-09-14.consumed.json"), JSON.stringify({ protocol: plan.protocol, fingerprint: claim, directory, manifestPath, authorization: plan.authorization, at: new Date().toISOString() }) + "\n", { flag: "wx", mode: 0o600 });
  writeFileSync(`${manifestPath}.consumed.json`, JSON.stringify({ protocol: plan.protocol, fingerprint: claim, directory, authorization: plan.authorization, at: new Date().toISOString() }) + "\n", { flag: "wx", mode: 0o600 });
  mkdirSync(directory, { recursive: true, mode: 0o700 }); write("manifest.json", frozen);
  try { const summary = await runOnsetRows(plan, c => executeOnsetCall(plan, c), write); write("summary.json", summary); if (summary.stopReason) process.exitCode = 1; }
  catch (e) { try { write("interruption-summary.json", { ...inspectOnsetArtifacts(directory, plan), error: e instanceof Error ? e.message : "STUDY_INTERRUPTED" }); } catch {} throw e; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
