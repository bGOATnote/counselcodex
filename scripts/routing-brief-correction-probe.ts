/** Eight paired, unpublished contract probes. No live release or repair path. */
import { existsSync, mkdirSync, readFileSync, rmdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { makeEffortPlan, scoreEffortProbe, effortCost } from "./effort-alignment-probe.ts";
import { verifyProbeFiles } from "./insomnia-source-probe.ts";
import { reservationForBrief, scoreBriefStudy, type makeBriefPlan } from "./routing-brief-study.ts";
import { ROUTING_BRIEF_INSTRUCTIONS, routingBriefSchema, wireRoutingBriefSchema, checkRoutingProposal, patientBasisIdentity } from "../src/disposition/routing-brief.ts";
import { ROUTING_BRIEF_V2_INSTRUCTIONS, routingBriefV2Schema, wireRoutingBriefV2Schema, routingBriefPresentation } from "../src/disposition/routing-brief-v2.ts";
import { resolveSourceQuoteReferences } from "../src/disposition/source-quote-refs.ts";
import { consumeStructuredStream, safetyEnvelopeTransport, type ModelTransportResult } from "../src/disposition/transport.ts";
import { requestDeadline } from "../src/disposition/execution-policy.ts";
import { sha256 } from "../src/evidence/rag/model.ts";

const PRIOR = "outputs/effort-alignment-probe-2026-09-15", ORIGINAL = "outputs/routing-brief-network-replication-2026-09-15";
const ARMS = ["full", "brief"] as const;
type Arm = typeof ARMS[number];
export const CORRECTION_CASES = ["C02", "C14", "C17", "C20", "C30", "C31", "C32", "C50"] as const;
const schemas = { full: wireRoutingBriefSchema, brief: wireRoutingBriefV2Schema };
const resolvedSchemas = { full: routingBriefSchema, brief: routingBriefV2Schema };
const prompts = { full: ROUTING_BRIEF_INSTRUCTIONS, brief: ROUTING_BRIEF_V2_INSTRUCTIONS };
const digest = (v: unknown) => sha256(JSON.stringify(v));
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const hash = (p: string) => sha256(readFileSync(p));
const write = (d: string, n: string, v: unknown) => writeFileSync(join(d, n), JSON.stringify(v, null, 2) + "\n", { flag: "wx", mode: 0o600 });
function check(v: unknown, message: string): asserts v { if (!v) throw new Error(message); }

export function makeCorrectionPlan() {
  check(!existsSync(join(PRIOR, ".run-lock")), "PRIOR_RUNNING");
  const prior = read(join(PRIOR, "plan.json")) as ReturnType<typeof makeEffortPlan>, report = scoreEffortProbe(PRIOR);
  check(report.rows.length === 20 && report.rows.every(r => r.attempted && r.row)
    && JSON.stringify(report, null, 2) + "\n" === readFileSync(join(PRIOR, "report.json"), "utf8"), "PRIOR_NOT_RECONCILED");
  const priorClaim = join(prior.budget.exclusiveClaim, "claim.json");
  check(read(priorClaim).fingerprint === digest(prior), "PRIOR_CLAIM_CHANGED");
  const base = read(join(ORIGINAL, "plan.json")) as ReturnType<typeof makeBriefPlan>;
  const spent = report.spend.priorAccountedAndReservedUSD + report.spend.currentAccountedAndOutstandingUSD;
  check(Number.isFinite(spent) && spent < 90 && prior.budget.missionCeilingUSD === 90, "PRIOR_BALANCE_INVALID");
  const cases = CORRECTION_CASES.map(id => { const c = base.cases.find(c => c.id === id)!;
    check(c && hash(c.path) === c.historyHash, "BOUND_CASE_CHANGED");
    return { ...c, packets: { full: c.packets.brief, brief: c.packets.brief },
      packetHashes: { full: digest(c.packets.brief), brief: digest(c.packets.brief) } };
  });
  const paths = [join(PRIOR, "plan.json"), join(PRIOR, "report.json"), priorClaim, join(ORIGINAL, "plan.json"),
    ...prior.cases.flatMap(c => [join(PRIOR, `${c.id}-reservation.json`), ...ARMS.flatMap(a => ["started", "result", "evaluation"].map(k => join(PRIOR, `${c.id}-${a}-${k}.json`)))]),
    "src/disposition/routing-brief-v2.ts", "tests/routing-brief-v2.test.ts", "scripts/routing-brief-correction-probe.ts",
    "tests/routing-brief-correction-probe.test.ts", "docs/ROUTING_BRIEF_CORRECTION_PLAN_2026-09-15.md"];
  return { ...base, protocol: "fixed-packet-brief-contract-correction/v1", createdAt: new Date().toISOString(), cases,
    studyKind: "Selected development contract failures and controls", prompts, promptHashes: { full: sha256(prompts.full), brief: sha256(prompts.brief) },
    schemas: { full: schemas.full.toJSONSchema(), brief: schemas.brief.toJSONSchema() }, contracts: { full: "brief" as const, brief: "brief" as const },
    armLabels: { full: "brief_v1", brief: "brief_v2" }, schedule: cases.flatMap((c, i) => (i % 2 ? [...ARMS].reverse() : [...ARMS]).map(arm => ({ id: c.id, arm }))),
    files: { ...prior.files, ...Object.fromEntries(paths.map(p => [p, hash(p)])) },
    budget: { ...base.budget, priorAccountedAndReservedUSD: spent, remainingUSD: 90 - spent,
      exclusiveClaim: "outputs/.routing-brief-correction-spend-2026-09-15" },
    interpretation: "16 fresh low-effort Opus calls; identical original brief patient/context/evidence packets and 2400 token cap. V2 restores original transport instructions and original resource bounds; shorter writing targets are diagnostics only. No new clinical policy, reference, retrieval, judge, repair or publication. Selected development cases, not held-out or live V25 performance; decoding improvement is not clinical lift." };
}
export type CorrectionPlan = ReturnType<typeof makeCorrectionPlan>;
export function correctionReservations(plan: CorrectionPlan) {
  const pairs = Object.fromEntries(plan.cases.map(c => { const reservations = { full: reservationForBrief(plan, c, "full"), brief: reservationForBrief(plan, c, "brief") };
    return [c.id, { reservations, pairReservationUSD: reservations.full + reservations.brief }]; }));
  const totalUSD = Object.values(pairs).reduce((n, p) => n + p.pairReservationUSD, 0);
  check(plan.cases.length === 8 && new Set(plan.cases.map(c => c.id)).size === 8 && plan.schedule.length === 16
    && Number.isFinite(totalUSD) && totalUSD > 0 && totalUSD <= plan.budget.remainingUSD, "ALL_16_RESERVATIONS_MUST_FIT");
  return { pairs, totalUSD };
}
export function validateCorrectionPlan(plan: CorrectionPlan) {
  check(digest({ ...plan, createdAt: "" }) === digest({ ...makeCorrectionPlan(), createdAt: "" }), "FROZEN_CORRECTION_CHANGED");
  check(plan.node === process.version && plan.icu === process.versions.icu, "RUNTIME_CHANGED"); verifyProbeFiles(plan);
}
export function evaluateCorrection(c: CorrectionPlan["cases"][number], arm: Arm, e: ModelTransportResult) {
  let output: z.infer<typeof routingBriefV2Schema> | null = null, failure = e.failure;
  try { if (!failure) output = resolvedSchemas[arm].parse(resolveSourceQuoteReferences(schemas[arm].parse(e.output), c.sources)); }
  catch { failure = "WIRE_SCHEMA_OR_QUOTE_REFERENCE_FAILED"; }
  const proposal = output ? checkRoutingProposal(output, c.message, c.issued) : null;
  const basisIdentity = output ? patientBasisIdentity(output.redFlags, c.message) : null;
  const packetValid = c.hits.length > 0 && new Set(c.hits.map(h => h.chunk.id)).size === c.hits.length
    && c.hits.every(h => sha256(h.chunk.text) === h.chunk.hash && !["superseded", "retracted"].includes(h.document.currency));
  return { id: c.id, arm, firstAttempt: true, failure, output, proposal, basisIdentity, packetValid,
    eligibleRoutingProposal: Boolean(output && proposal?.eligibleRoutingProposal && basisIdentity && packetValid),
    fullResponseGateReplay: null, presentation: output ? routingBriefPresentation(output) : null,
    citationCount: output?.citations.length ?? null, citedSourceClasses: output?.citations.map(q => c.hits.find(h => h.chunk.id === q.passageId)?.document.kind ?? "unbound") ?? [],
    providerComplete: e.failure === null && [e.usage.inputTokens, e.usage.outputTokens].every(n => n !== null && Number.isSafeInteger(n) && n >= 0),
    producerMs: e.durationMs ?? null, firstTextMs: e.firstTextDeltaMs ?? null, usage: e.usage,
    unsafe_advice: "not_assessed", unsupported_claims: "not_assessed", claim_support: "not_assessed", clinical_correctness: "not_assessed",
    clinicalApproval: false, patientAdvicePublished: false };
}
export function scoreCorrection(directory: string) {
  const plan = read(join(directory, "plan.json")) as CorrectionPlan; validateCorrectionPlan(plan);
  const reserved = correctionReservations(plan);
  for (const c of plan.cases) for (const arm of ARMS) {
    const p = join(directory, `${c.id}-${arm}`), start = existsSync(`${p}-started.json`) ? read(`${p}-started.json`) : null;
    const result = existsSync(`${p}-result.json`) ? read(`${p}-result.json`) : null;
    if (start) check(digest(read(join(directory, `${c.id}-reservation.json`))) === digest(reserved.pairs[c.id])
      && start.fingerprint === digest(plan) && start.packetHash === c.packetHashes[arm] && start.reservationUSD === reserved.pairs[c.id].reservations[arm], "START_BINDING_CHANGED");
    if (result) check(start && digest({ baseUSD: result.baseUSD, accountedUSD: result.accountedUSD, reservationUSD: result.reservationUSD })
      === digest(effortCost(result.execution, plan as unknown as ReturnType<typeof makeEffortPlan>, start.reservationUSD)), "RESULT_ACCOUNTING_CHANGED");
    if (existsSync(`${p}-evaluation.json`)) check(result && digest(read(`${p}-evaluation.json`)) === digest(evaluateCorrection(c, arm, result.execution)), "EVALUATION_CHANGED");
  }
  const report = scoreBriefStudy(directory);
  // Selected cases all have non-null gold; keep fixed coverage distinct from
  // conditional eligibility. No new null-to-match behavior or release class.
  for (const arm of ARMS) report.arms[arm].agreementCoverage.denominator = CORRECTION_CASES.length;
  return { ...report, plannedCases: 8, plannedCalls: 16, claim_support: "not_assessed", clinical_correctness: "not_assessed", patientAdvicePublished: false };
}
export async function main() {
  const [command, directory, claim] = process.argv.slice(2); check(directory, "NEW_DIRECTORY_REQUIRED");
  if (command === "plan") { const p = makeCorrectionPlan(); validateCorrectionPlan(p); const reserved = correctionReservations(p); mkdirSync(directory); write(directory, "plan.json", p);
    console.log(JSON.stringify({ fingerprint: digest(p), reservationUSD: reserved.totalUSD, remainingUSD: p.budget.remainingUSD })); return; }
  if (command === "score") { check(claim, "NEW_REPORT_FILENAME_REQUIRED"); write(directory, claim, scoreCorrection(directory)); return; }
  const plan = read(join(directory, "plan.json")) as CorrectionPlan; check(command === "run" && claim === digest(plan), "EXACT_PLAN_CLAIM_REQUIRED");
  validateCorrectionPlan(plan); const reserved = correctionReservations(plan), lock = join(directory, ".run-lock"); mkdirSync(lock);
  try {
    const allocation = { fingerprint: claim, directory: resolve(directory), allocationUSD: reserved.totalUSD };
    if (!existsSync(plan.budget.exclusiveClaim)) { mkdirSync(plan.budget.exclusiveClaim); write(plan.budget.exclusiveClaim, "claim.json", allocation); }
    else check(digest(read(join(plan.budget.exclusiveClaim, "claim.json"))) === digest(allocation), "PHASE_ALREADY_CLAIMED");
    for (const c of plan.cases) if (!existsSync(join(directory, `${c.id}-reservation.json`))) write(directory, `${c.id}-reservation.json`, reserved.pairs[c.id]);
    const env = parseEnv(readFileSync(".env", "utf8")); process.env.ANTHROPIC_API_KEY ||= env.ANTHROPIC_API_KEY; check(process.env.ANTHROPIC_API_KEY, "ANTHROPIC_KEY_REQUIRED");
    for (const { id, arm } of plan.schedule) {
      const c = plan.cases.find(c => c.id === id)!, prefix = `${id}-${arm}`, resultPath = join(directory, `${prefix}-result.json`), evalPath = join(directory, `${prefix}-evaluation.json`);
      if (existsSync(join(directory, `${prefix}-started.json`))) { if (existsSync(resultPath) && !existsSync(evalPath)) write(directory, `${prefix}-evaluation.json`, evaluateCorrection(c, arm, read(resultPath).execution)); continue; }
      check(scoreCorrection(directory).spend.remainingMissionUSD >= 0, "MISSION_CEILING_REACHED");
      const prompt = JSON.stringify(c.packets[arm]), reservationUSD = reserved.pairs[id].reservations[arm]; check(sha256(prompt) === c.packetHashes[arm], "PACKET_CHANGED");
      write(directory, `${prefix}-started.json`, { at: new Date().toISOString(), fingerprint: claim, packetHash: sha256(prompt), reservationUSD, attempt: "first_attempt" });
      const deadline = requestDeadline(new AbortController().signal, plan.settings.timeoutMs);
      const execution = await consumeStructuredStream({ signal: deadline.signal, start: abortSignal => new Agent({ id: `brief-correction-${arm}`, name: "Brief contract probe", model: plan.model, instructions: plan.prompts[arm], maxRetries: 0 }).stream(prompt, {
        abortSignal, structuredOutput: { schema: safetyEnvelopeTransport(schemas[arm], z.unknown()), errorStrategy: "strict" }, maxSteps: 1,
        modelSettings: { maxOutputTokens: plan.settings.maxOutputTokens, maxRetries: 0 }, providerOptions: plan.settings.providerOptions, tracingOptions: { hideInput: true, hideOutput: true },
      }) }).finally(() => deadline.dispose());
      write(directory, `${prefix}-result.json`, { execution, ...effortCost(execution, plan as unknown as ReturnType<typeof makeEffortPlan>, reservationUSD) });
      write(directory, `${prefix}-evaluation.json`, evaluateCorrection(c, arm, execution));
      console.log(JSON.stringify({ id, version: plan.armLabels[arm], failure: execution.failure, durationMs: execution.durationMs }));
    }
    const report = scoreCorrection(directory);
    if (!existsSync(join(directory, "report.json"))) write(directory, "report.json", report);
    check(report.spend.remainingMissionUSD >= 0, "USAGE_EXCEEDED_MISSION_BUDGET");
  } finally { rmdirSync(lock); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
