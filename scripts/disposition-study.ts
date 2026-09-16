/** Standalone fixed-packet experiment. No historical runner, live release or judge. */
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, rmdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { applicationPolicyPrompt, applicationPolicyPacket, evaluateApplicationPolicy, applicationDraftSchema, wireApplicationDraftSchema, resolveApplicationPatientReferences } from "../src/evaluation/application-policy-candidate.ts";
import { candidateInputs, readPhysicianReference } from "../src/evaluation/physician-cohort.ts";
import { pathBDeviation } from "../src/evaluation/v25-path-b.ts";
import { GRAPH_INSTRUCTIONS } from "../src/disposition/graph-prompts.ts";
import { draftSchema, wireDraftSchema } from "../src/disposition/graph-output.ts";
import { GATES_OUTPUT_INSTRUCTIONS, gatesDecisionSteps, resolveGatesSteps } from "../src/disposition/gates-release.ts";
import { checkRoutingProposal, patientBasisIdentity } from "../src/disposition/routing-brief.ts";
import { operationalRoute } from "../src/disposition/routing-policy.ts";
import { sourceWithQuoteSpans, resolveSourceQuoteReferences } from "../src/disposition/source-quote-refs.ts";
import { consumeStructuredStream, safetyEnvelopeTransport, type ModelTransportResult } from "../src/disposition/transport.ts";
import { requestDeadline } from "../src/disposition/execution-policy.ts";
import type { DispositionRun } from "../src/disposition/contract.ts";
import { selectGraphEvidence } from "../src/evidence/rag/selection.ts";
import { sha256 } from "../src/evidence/rag/model.ts";

const SOURCE = "outputs/v25-path-b-complete-2026-09-15";
const CSV = "data/patient_messages.csv", GOLD = "data/evaluation/physician-system-reference-v2.json";
export const STUDY_PROTOCOL = "fixed-packet-source-application/v1";
export const STUDY_ARMS = ["baseline", "candidate"] as const;
type Arm = typeof STUDY_ARMS[number];
const settings = { maxOutputTokens: 4096, maxSteps: 1, maxRetries: 0, timeoutMs: 600_000,
  providerOptions: { anthropic: { thinking: { type: "adaptive" as const }, effort: "low" as const } } };
const mission = { id: "disposition-application-2026-09-15", ceilingUSD: 95,
  claimDirectory: "outputs/.disposition-application-mission-2026-09-15",
  historicalPriorUSD: 84.687986, historicalPriorDeducted: false,
  authorization: "Parent-authorized additional $95 hard ceiling; this fixed-packet phase and any subsequently earned live verification share this one mission. Previous $84.687986 is historical exposure, not charged again." };
const pricing = { inputPerMillionUSD: 5, outputPerMillionUSD: 25, inputMultiplier: 2,
  source: "https://platform.claude.com/docs/en/about-claude/pricing", checkedAt: "2026-09-15",
  scope: "Conservative doubled-input token estimate, not an invoice. Unknown usage retains the full reservation." };
const digest = (v: unknown) => sha256(JSON.stringify(v));
const read = (p: string): any => JSON.parse(readFileSync(p, "utf8"));
const hash = (p: string) => sha256(readFileSync(p));
function check(v: unknown, code: string): asserts v { if (!v) throw new Error(code); }
export function writeStudyArtifact(directory: string, name: string, value: unknown) {
  const fd = openSync(join(directory, name), "wx", 0o600);
  try { writeFileSync(fd, JSON.stringify(value, null, 2) + "\n"); fsyncSync(fd); } finally { closeSync(fd); }
}
function reference() { return readPhysicianReference(readFileSync(GOLD, "utf8"), readFileSync(CSV, "utf8")); }
function sourceCases() {
  const admissions = read(join(SOURCE, "runtime/attempt-admission.json")) as { id: string; runId: string | null }[];
  const inputs = candidateInputs(reference());
  check(admissions.length === 50 && new Set(admissions.map(a => a.id)).size === 50, "EXACT_50_SOURCE_ADMISSIONS_REQUIRED");
  return inputs.map(input => {
    const runId = admissions.find(a => a.id === input.id)?.runId;
    check(runId && /^[a-f0-9-]{36}$/.test(runId), "SOURCE_RUN_REQUIRED");
    const path = join(SOURCE, "runtime/diagnostic-runs", `${runId}.json`), run = read(path) as DispositionRun;
    check(run.message === input.message && run.inputHash === input.inputHash && run.graph?.version === "evidence-graph/v25"
      && run.graph.mode === "gates-release" && run.graph.judge === null, "SOURCE_RUN_IDENTITY_CHANGED");
    const hits = selectGraphEvidence(run.graph.retrieval, 9);
    check(digest(hits) === run.graph.frozenPacketHash && hits.every(h => sha256(h.chunk.text) === h.chunk.hash), "SOURCE_PACKET_CHANGED");
    const sources = hits.map(h => ({ id: h.chunk.id, title: h.document.title, kind: h.document.kind, review: h.document.reviewStatus,
      date: h.document.publicationDate, currency: h.document.currency, scope: h.document.scope, section: h.chunk.sectionTitle,
      before: h.context.before, text: h.chunk.text, after: h.context.after }));
    const baseline = { patient: input.message, context: run.graph.context, outputInstructions: GATES_OUTPUT_INSTRUCTIONS, sources: sources.map(sourceWithQuoteSpans) };
    const candidate = applicationPolicyPacket(structuredClone(baseline), hits);
    const { sourceApplicationRules: _rules, ...unchanged } = candidate;
    check(digest(unchanged) === digest(baseline), "CANDIDATE_CHANGED_BASE_PACKET");
    const packets = { baseline, candidate };
    check(STUDY_ARMS.every(a => Buffer.byteLength(JSON.stringify(packets[a])) <= 60_000), "PACKET_TOO_LARGE");
    return { ...input, path, historyHash: hash(path), hits, sources, guidance: run.guidance,
      issued: (run.responseEvents ?? []).filter(e => e.kind === "action").map(e => e.notice), packets,
      packetHashes: { baseline: digest(baseline), candidate: digest(candidate) } };
  });
}
/** Flat local import closure, not a chain of previous experiment constructors. */
function localDependencies(roots: string[]) {
  const paths = new Set<string>();
  const visit = (path: string) => {
    if (paths.has(path)) return; paths.add(path);
    for (const match of readFileSync(path, "utf8").matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)) {
      const child = resolve(dirname(path), match[1]);
      if (/\.(?:ts|mjs|js)$/.test(child)) visit(child);
    }
  };
  roots.forEach(p => visit(resolve(p))); return [...paths].sort();
}
function frozenFiles(cases: ReturnType<typeof sourceCases>) {
  return [...new Set([...localDependencies(["scripts/disposition-study.ts", "tests/disposition-study.test.ts"]),
    CSV, GOLD, "data/evaluation/physician-development-review-2026-09-13.json", "package.json", "package-lock.json",
    "docs/APPLICATION_ALIGNMENT_PLAN_2026-09-15.md",
    join(SOURCE, "manifest.json"), join(SOURCE, "ledger.json"), join(SOURCE, "runtime/attempt-admission.json"),
    "outputs/aom-source-probe-2026-09-15/report.json", ...cases.map(c => c.path)])].sort();
}
export function makeDispositionStudyPlan(createdAt = new Date().toISOString()) {
  const cases = sourceCases();
  const prompts = { baseline: GRAPH_INSTRUCTIONS.disposition, candidate: applicationPolicyPrompt(GRAPH_INSTRUCTIONS.disposition) };
  const value = { protocol: STUDY_PROTOCOL, createdAt, node: process.version, icu: process.versions.icu, model: "anthropic/claude-opus-5",
    mission, pricing, settings, prompts, promptHashes: { baseline: sha256(prompts.baseline), candidate: sha256(prompts.candidate) },
    schemas: { baseline: wireDraftSchema.toJSONSchema(), candidate: wireApplicationDraftSchema.toJSONSchema() }, cases,
    schedule: cases.flatMap((c, i) => (i % 2 ? [...STUDY_ARMS].reverse() : [...STUDY_ARMS]).map(arm => ({ id: c.id, arm }))),
    files: Object.fromEntries(frozenFiles(cases).map(p => [p, hash(p)])),
    interpretation: "100 fresh first attempts; 50 development cases, not held-out validation. Same original V25 patient/context/evidence, full clinical fields and low/4096 settings in both arms. Candidate alone adds source-application instructions, a source-bound sidecar and sourceApplications output bindings; this declared schema delta is part of the tested intervention. The output cap differs from historical V25's 2400. No new safety/context/retrieval calls, judge, repair or patient publication. Historical issued instructions are evaluation-only compatibility diagnostics, not fresh early-action performance. Full gates and partial application checks do not establish clinical correctness. C25 stays in completion/cost but not reference agreement. Any later live phase must reconcile against this SAME new $95 mission." };
  return { ...value, fingerprint: digest(value) };
}
export type DispositionStudyPlan = ReturnType<typeof makeDispositionStudyPlan>;
export type StudyCase = DispositionStudyPlan["cases"][number];
export function verifyDispositionStudyPlan(plan: DispositionStudyPlan) {
  const { fingerprint, ...value } = plan;
  check(fingerprint === digest(value), "PLAN_FINGERPRINT_CHANGED");
  check(Number.isFinite(Date.parse(plan.createdAt)) && plan.protocol === STUDY_PROTOCOL && plan.model === "anthropic/claude-opus-5"
    && digest(plan.mission) === digest(mission) && digest(plan.pricing) === digest(pricing) && digest(plan.settings) === digest(settings)
    && plan.node === process.version && plan.icu === process.versions.icu
    && digest(plan.schemas) === digest({ baseline: wireDraftSchema.toJSONSchema(), candidate: wireApplicationDraftSchema.toJSONSchema() }), "PLAN_CONTRACT_CHANGED");
  check(plan.prompts.baseline === GRAPH_INSTRUCTIONS.disposition && plan.prompts.candidate === applicationPolicyPrompt(GRAPH_INSTRUCTIONS.disposition)
    && STUDY_ARMS.every(a => plan.promptHashes[a] === sha256(plan.prompts[a])), "PROMPT_CHANGED");
  check(digest(Object.keys(plan.files)) === digest(frozenFiles(plan.cases)), "FROZEN_FILE_SET_CHANGED");
  for (const [path, expected] of Object.entries(plan.files)) check(hash(path) === expected, `FROZEN_FILE_CHANGED:${path}`);
  check(digest(plan.cases) === digest(sourceCases()), "FROZEN_CASES_CHANGED");
  const schedule = plan.cases.flatMap((c, i) => (i % 2 ? [...STUDY_ARMS].reverse() : [...STUDY_ARMS]).map(arm => ({ id: c.id, arm })));
  check(plan.cases.length === 50 && new Set(plan.cases.map(c => c.id)).size === 50 && digest(plan.schedule) === digest(schedule), "EXACT_100_SLOTS_REQUIRED");
}
export function studyReservation(plan: DispositionStudyPlan, c: StudyCase, arm: Arm) {
  const inputBound = Buffer.byteLength(JSON.stringify(c.packets[arm]) + plan.prompts[arm] + JSON.stringify(plan.schemas[arm])) + 8192;
  return (inputBound * plan.pricing.inputPerMillionUSD * plan.pricing.inputMultiplier + plan.settings.maxOutputTokens * plan.pricing.outputPerMillionUSD) / 1e6;
}
export function studyCost(execution: ModelTransportResult, plan: DispositionStudyPlan, reservationUSD: number) {
  const i = execution.usage?.inputTokens, o = execution.usage?.outputTokens;
  const known = [i, o].every(n => typeof n === "number" && Number.isSafeInteger(n) && n >= 0);
  return { baseUSD: known ? (i! * plan.pricing.inputPerMillionUSD + o! * plan.pricing.outputPerMillionUSD) / 1e6 : null,
    accountedUSD: known ? (plan.pricing.inputMultiplier * i! * plan.pricing.inputPerMillionUSD + o! * plan.pricing.outputPerMillionUSD) / 1e6 : reservationUSD, reservationUSD };
}
export function studyPairReservation(plan: DispositionStudyPlan, c: StudyCase) {
  const slots = { baseline: studyReservation(plan, c, "baseline"), candidate: studyReservation(plan, c, "candidate") };
  return { slots, pairUSD: slots.baseline + slots.candidate };
}
export function canReserveStudyPair(accountedUSD: number, pairUSD: number, ceilingUSD: number) {
  return [accountedUSD, pairUSD, ceilingUSD].every(Number.isFinite) && accountedUSD >= 0 && pairUSD > 0 && accountedUSD + pairUSD <= ceilingUSD;
}
export function evaluateDispositionStudy(c: StudyCase, arm: Arm, execution: ModelTransportResult) {
  let output: z.infer<typeof draftSchema> | null = null, failure = execution.failure;
  let applicationOutput: z.infer<typeof applicationDraftSchema> | null = null;
  let parseStage = "wire_schema", parseFailure: { stage: string; code: string; issues: { code: string; path: string }[] } | null = null;
  const raw = execution.output as { disposition?: unknown; reviewPriority?: unknown } | null;
  const rawRoute = raw && typeof raw.disposition === "string" ? operationalRoute({ disposition: raw.disposition,
    reviewPriority: raw.reviewPriority === "priority" || raw.reviewPriority === "routine" ? raw.reviewPriority : null }) : null;
  try { if (!failure) {
    if (arm === "candidate") {
      const wire = wireApplicationDraftSchema.parse(execution.output); parseStage = "source_quote_reference";
      const resolved = resolveSourceQuoteReferences(wire, c.sources); parseStage = "patient_quote_reference";
      const application = resolveApplicationPatientReferences(resolved, c.message); parseStage = "resolved_schema";
      applicationOutput = applicationDraftSchema.parse(application);
      const { sourceApplications: _bindings, ...core } = applicationOutput;
      output = draftSchema.parse(core);
    } else {
      const wire = wireDraftSchema.parse(execution.output); parseStage = "source_quote_reference";
      const resolved = resolveSourceQuoteReferences(wire, c.sources); parseStage = "resolved_schema";
      output = draftSchema.parse(resolved);
    }
  } }
  catch (error) {
    failure = "WIRE_SCHEMA_OR_QUOTE_REFERENCE_FAILED";
    parseFailure = { stage: parseStage, code: error instanceof z.ZodError ? "STRUCTURAL_SCHEMA_INVALID"
      : error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "UNCLASSIFIED_PARSE_FAILURE",
    issues: error instanceof z.ZodError ? error.issues.map(i => ({ code: i.code, path: i.path.map(String).join(".") })) : [] };
  }
  let localEvaluationFailure: string | null = null;
  let proposal: ReturnType<typeof checkRoutingProposal> | null = null, basisIdentity: boolean | null = null;
  let fullGates: (ReturnType<typeof gatesDecisionSteps> extends Generator<string, infer T, string> ? T : never) | null = null;
  let applicationAudit: ReturnType<typeof evaluateApplicationPolicy> | null = null;
  try { if (output) {
    proposal = checkRoutingProposal(output, c.message, c.issued); basisIdentity = patientBasisIdentity(output.redFlags, c.message);
    fullGates = resolveGatesSteps(gatesDecisionSteps(output, c.message, c.guidance, c.hits, c.issued.at(-1) ?? null, false), sha256);
    applicationAudit = evaluateApplicationPolicy(applicationOutput ?? output, c.message, c.hits);
  } } catch { localEvaluationFailure = "LOCAL_EVALUATOR_FAILURE_RESULT_RETAINED"; }
  const applicationBlocked = arm === "candidate" && applicationAudit?.status === "fail";
  return { id: c.id, arm, failure, parseFailure, localEvaluationFailure, output, sourceApplications: applicationOutput?.sourceApplications ?? null,
    rawRoute, parsedRoute: output ? operationalRoute(output) : null,
    proposal, basisIdentity, fullGates, applicationAudit, applicationBlocked,
    eligibleExperimentalResponse: Boolean(output && !failure && !localEvaluationFailure && proposal?.eligibleRoutingProposal && basisIdentity && fullGates?.admission.released && !applicationBlocked),
    providerComplete: execution.failure === null && [execution.usage?.inputTokens, execution.usage?.outputTokens].every(n => typeof n === "number" && Number.isSafeInteger(n) && n >= 0),
    producerMs: execution.durationMs ?? null, firstTextMs: execution.firstTextDeltaMs ?? null,
    claim_support: "not_assessed", unsupported_claims: "not_assessed", clinical_correctness: "not_assessed", unsafe_advice: "not_assessed", patientAdvicePublished: false, clinicalApproval: false };
}
type Evaluation = ReturnType<typeof evaluateDispositionStudy>;
const distribution = (values: number[]) => { const v = [...values].sort((a, b) => a - b), n = v.length; return { n,
  median: n ? n % 2 ? v[Math.floor(n / 2)] : (v[n / 2 - 1] + v[n / 2]) / 2 : null,
  p95: n ? v[Math.ceil(n * .95) - 1] : null }; };
export function verifyStudyClaim(plan: DispositionStudyPlan, directory: string, claimDirectory = plan.mission.claimDirectory) {
  const path = join(claimDirectory, "claim.json");
  check(existsSync(path) && digest(read(path)) === digest({ mission: plan.mission, fingerprint: plan.fingerprint, directory: resolve(directory), allocationUSD: plan.mission.ceilingUSD }), "MISSION_CLAIM_CHANGED");
}
export function scoreDispositionStudy(directory: string, claimDirectory?: string) {
  const plan = read(join(directory, "plan.json")) as DispositionStudyPlan; verifyDispositionStudyPlan(plan);
  let accountedUSD = 0; const gold = reference();
  const rows = plan.cases.flatMap(c => {
    const pair = studyPairReservation(plan, c), path = join(directory, `${c.id}-reservation.json`), held = existsSync(path);
    if (held) { verifyStudyClaim(plan, directory, claimDirectory); check(digest(read(path)) === digest(pair), "RESERVATION_CHANGED"); }
    return plan.schedule.filter(s => s.id === c.id).map(({ arm }) => {
      const prefix = join(directory, `${c.id}-${arm}`), start = existsSync(`${prefix}-started.json`) ? read(`${prefix}-started.json`) : null;
      const result = existsSync(`${prefix}-result.json`) ? read(`${prefix}-result.json`) : null;
      const evaluation = existsSync(`${prefix}-evaluation.json`) ? read(`${prefix}-evaluation.json`) as Evaluation : null;
      if (start) check(held && start.fingerprint === plan.fingerprint && start.packetHash === c.packetHashes[arm]
        && start.promptHash === plan.promptHashes[arm] && start.reservationUSD === pair.slots[arm], "START_BINDING_CHANGED");
      if (result) check(start && digest({ baseUSD: result.baseUSD, accountedUSD: result.accountedUSD, reservationUSD: result.reservationUSD })
        === digest(studyCost(result.execution, plan, pair.slots[arm])), "RESULT_ACCOUNTING_CHANGED");
      if (evaluation) check(result && digest(evaluation) === digest(evaluateDispositionStudy(c, arm, result.execution)), "EVALUATION_CHANGED");
      accountedUSD += held ? result?.accountedUSD ?? pair.slots[arm] : 0;
      const accepted = gold.cases.find(g => g.id === c.id)!.reference.acceptedRoutes;
      const journalStatus = evaluation ? "evaluated" : result ? "result_without_evaluation" : start ? "started_without_result" : held ? "unstarted_reserved" : "unattempted";
      return { id: c.id, arm, journalStatus, attempted: Boolean(start), result, evaluation, referenceExcluded: accepted === null,
        agreement: evaluation?.eligibleExperimentalResponse && accepted ? accepted.includes(evaluation.parsedRoute!) : null,
        rawAgreement: evaluation?.rawRoute && accepted ? accepted.includes(evaluation.rawRoute) : null,
        rawDeviation: pathBDeviation(evaluation?.rawRoute ?? null, accepted) };
    });
  });
  const arms = Object.fromEntries(STUDY_ARMS.map(arm => { const a = rows.filter(r => r.arm === arm), evaluated = a.flatMap(r => r.evaluation ? [r.evaluation] : []);
    return [arm, { planned: 50, attempted: a.filter(r => r.attempted).length, providerComplete: evaluated.filter(e => e.providerComplete).length,
      journalStatus: Object.fromEntries(["evaluated", "result_without_evaluation", "started_without_result", "unstarted_reserved", "unattempted"].map(s => [s, a.filter(r => r.journalStatus === s).length])),
      parsed: evaluated.filter(e => e.output).length, fullGatesAdmitted: evaluated.filter(e => e.fullGates?.admission.released).length,
      providerFailures: a.filter(r => r.result?.execution.failure != null).length, parseFailures: evaluated.filter(e => e.parseFailure !== null).length,
      evaluatorFailures: evaluated.filter(e => e.localEvaluationFailure !== null).length,
      applicationFailures: evaluated.filter(e => e.applicationAudit?.status === "fail").length, applicationBlocked: evaluated.filter(e => e.applicationBlocked).length,
      bindingFailures: evaluated.filter(e => e.applicationAudit?.bindings.status === "fail").length,
      eligibleExperimentalResponses: evaluated.filter(e => e.eligibleExperimentalResponse).length,
      agreement: { numerator: a.filter(r => r.agreement === true).length, denominator: a.filter(r => r.agreement !== null).length },
      agreementCoverage: { numerator: a.filter(r => r.agreement === true).length, denominator: 49 },
      rawRouteAgreementDiagnostic: { numerator: a.filter(r => r.rawAgreement === true).length, denominator: a.filter(r => r.rawAgreement !== null).length },
      rawUnderReference: a.filter(r => r.rawDeviation === "under").length, rawOverReference: a.filter(r => r.rawDeviation === "over").length,
      latency: distribution(evaluated.flatMap(e => e.providerComplete && e.producerMs !== null ? [e.producerMs] : [])) }]; }));
  const pairs = plan.cases.map(c => { const a = rows.find(r => r.id === c.id && r.arm === "baseline")!, b = rows.find(r => r.id === c.id && r.arm === "candidate")!;
    return { id: c.id, baselineRawRoute: a.evaluation?.rawRoute ?? null, candidateRawRoute: b.evaluation?.rawRoute ?? null,
      baselineAgreement: a.agreement, candidateAgreement: b.agreement,
      producerDeltaMs: a.evaluation?.providerComplete && b.evaluation?.providerComplete && a.evaluation.producerMs !== null && b.evaluation.producerMs !== null ? b.evaluation.producerMs - a.evaluation.producerMs : null }; });
  return { protocol: plan.protocol, fingerprint: plan.fingerprint, arms, pairs,
    pairedLatencyDelta: distribution(pairs.flatMap(p => p.producerDeltaMs === null ? [] : [p.producerDeltaMs])), rows,
    spend: { missionId: plan.mission.id, ceilingUSD: plan.mission.ceilingUSD, accountedAndOutstandingUSD: accountedUSD, remainingUSD: plan.mission.ceilingUSD - accountedUSD,
      knownBaseEstimateUSD: rows.reduce((sum, r) => sum + (r.result?.baseUSD ?? 0), 0), unknownUsageRows: rows.filter(r => r.attempted && r.result?.baseUSD == null).length,
      historicalPriorUSD: plan.mission.historicalPriorUSD, historicalPriorDeducted: false },
    claim_support: "not_assessed", unsupported_claims: "not_assessed", unsafe_advice: "not_assessed", clinical_correctness: "not_assessed", patientAdvicePublished: false, clinicalApproval: false, interpretation: plan.interpretation };
}
function failedExecution(started: number): ModelTransportResult {
  return { output: null, usage: { inputTokens: null, outputTokens: null }, failure: "DISPATCH_EXCEPTION_RESULT_RETAINED", durationMs: Math.round(performance.now() - started),
    firstTextDeltaMs: null, transportTimings: { startResolvedMs: null, objectResolvedMs: null, usageResolvedMs: null, finishReasonResolvedMs: null, streamEndMs: null },
    cacheUsage: { cachedInputTokens: null, cacheCreationInputTokens: null } };
}
/** Isolated test seam: caller must reserve/authorize the pair before dispatch. */
export async function executeStudyPair(plan: DispositionStudyPlan, c: StudyCase, directory: string,
  generate: (c: StudyCase, arm: Arm) => Promise<ModelTransportResult>) {
  const pair = studyPairReservation(plan, c);
  check(digest(read(join(directory, `${c.id}-reservation.json`))) === digest(pair), "PAIR_RESERVATION_REQUIRED");
  for (const { arm } of plan.schedule.filter(s => s.id === c.id)) {
    const key = `${c.id}-${arm}`, resultPath = join(directory, `${key}-result.json`), evalPath = join(directory, `${key}-evaluation.json`);
    if (!existsSync(join(directory, `${key}-started.json`))) {
      writeStudyArtifact(directory, `${key}-started.json`, { fingerprint: plan.fingerprint, at: new Date().toISOString(), packetHash: c.packetHashes[arm], promptHash: plan.promptHashes[arm], reservationUSD: pair.slots[arm], attempt: "first_attempt" });
      const began = performance.now(); let execution: ModelTransportResult;
      try { execution = await generate(c, arm); } catch { execution = failedExecution(began); }
      writeStudyArtifact(directory, `${key}-result.json`, { execution, ...studyCost(execution, plan, pair.slots[arm]) });
    }
    if (existsSync(resultPath) && !existsSync(evalPath)) writeStudyArtifact(directory, `${key}-evaluation.json`, evaluateDispositionStudy(c, arm, read(resultPath).execution));
  }
}
async function provider(plan: DispositionStudyPlan, c: StudyCase, arm: Arm) {
  const deadline = requestDeadline(new AbortController().signal, plan.settings.timeoutMs);
  try { return await consumeStructuredStream({ signal: deadline.signal, start: abortSignal => new Agent({ id: `disposition-study-${arm}`, name: "Unpublished disposition study", model: plan.model, instructions: plan.prompts[arm], maxRetries: 0 }).stream(JSON.stringify(c.packets[arm]), {
    abortSignal, structuredOutput: { schema: safetyEnvelopeTransport(arm === "candidate" ? wireApplicationDraftSchema : wireDraftSchema, z.unknown()), errorStrategy: "strict" }, maxSteps: 1,
    modelSettings: { maxOutputTokens: plan.settings.maxOutputTokens, maxRetries: 0 }, providerOptions: plan.settings.providerOptions, tracingOptions: { hideInput: true, hideOutput: true },
  }) }); } finally { deadline.dispose(); }
}
export async function main() {
  const [command, directory, claim] = process.argv.slice(2); check(directory, "OUTPUT_DIRECTORY_REQUIRED");
  if (command === "plan") { const plan = makeDispositionStudyPlan(); verifyDispositionStudyPlan(plan); mkdirSync(directory); writeStudyArtifact(directory, "plan.json", plan);
    console.log(JSON.stringify({ fingerprint: plan.fingerprint, plannedCalls: 100, ceilingUSD: 95, allPairsWorstCaseUSD: plan.cases.reduce((s, c) => s + studyPairReservation(plan, c).pairUSD, 0) })); return; }
  if (command === "score") { check(claim, "NEW_REPORT_FILENAME_REQUIRED"); writeStudyArtifact(directory, claim, scoreDispositionStudy(directory)); return; }
  const plan = read(join(directory, "plan.json")) as DispositionStudyPlan;
  check(command === "run" && claim === plan.fingerprint && process.env.PAID_EVAL_UNLOCK === "95", "EXACT_PLAN_AND_95_UNLOCK_REQUIRED"); verifyDispositionStudyPlan(plan);
  const lock = join(directory, ".run-lock"); mkdirSync(lock);
  try {
    if (!existsSync(plan.mission.claimDirectory)) { mkdirSync(plan.mission.claimDirectory); writeStudyArtifact(plan.mission.claimDirectory, "claim.json", { mission: plan.mission, fingerprint: plan.fingerprint, directory: resolve(directory), allocationUSD: plan.mission.ceilingUSD }); }
    verifyStudyClaim(plan, directory);
    const env = parseEnv(readFileSync(".env", "utf8")); process.env.ANTHROPIC_API_KEY ||= env.ANTHROPIC_API_KEY; check(process.env.ANTHROPIC_API_KEY, "PROVIDER_KEY_REQUIRED");
    for (const c of plan.cases) {
      const report = scoreDispositionStudy(directory), pair = studyPairReservation(plan, c);
      check(report.spend.remainingUSD >= 0, "MISSION_BOUND_EXCEEDED");
      if (!existsSync(join(directory, `${c.id}-reservation.json`))) {
        if (!canReserveStudyPair(report.spend.accountedAndOutstandingUSD, pair.pairUSD, plan.mission.ceilingUSD)) break;
        writeStudyArtifact(directory, `${c.id}-reservation.json`, pair);
      }
      await executeStudyPair(plan, c, directory, (current, arm) => provider(plan, current, arm));
      const updated = scoreDispositionStudy(directory);
      console.log(JSON.stringify({ id: c.id, slots: updated.rows.filter(r => r.id === c.id).map(r => ({ arm: r.arm, status: r.journalStatus })), remainingUSD: updated.spend.remainingUSD }));
    }
    const report = scoreDispositionStudy(directory); if (!existsSync(join(directory, "report.json"))) writeStudyArtifact(directory, "report.json", report);
    check(report.spend.remainingUSD >= 0, "MISSION_BOUND_EXCEEDED");
  } finally { rmdirSync(lock); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
