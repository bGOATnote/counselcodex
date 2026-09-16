/** Isolated reasoning-effort comparison. No live imports, publication or repair. */
import { existsSync, mkdirSync, readFileSync, rmdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { briefCost, reservationForBrief, safeEvaluate, scoreBriefStudy, type makeTaskOwnershipPlan } from "./routing-brief-study.ts";
import { scoreInsomniaProbe, verifyProbeFiles } from "./insomnia-source-probe.ts";
import { wireDraftSchema } from "../src/disposition/graph-output.ts";
import { consumeStructuredStream, safetyEnvelopeTransport, type ModelTransportResult } from "../src/disposition/transport.ts";
import { requestDeadline } from "../src/disposition/execution-policy.ts";
import { sha256 } from "../src/evidence/rag/model.ts";
import { readPhysicianReference } from "../src/evaluation/physician-cohort.ts";

const PRIOR = "outputs/insomnia-source-probe-2026-09-15", OWNERSHIP = "outputs/task-ownership-ablation-2026-09-15";
const ARMS = ["full", "brief"] as const;
export const EFFORT_CASES = ["C01", "C02", "C07", "C12", "C13", "C22", "C30", "C34", "C47", "C50"] as const;
const digest = (v: unknown) => sha256(JSON.stringify(v));
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const hash = (p: string) => sha256(readFileSync(p));
const write = (dir: string, name: string, value: unknown) => writeFileSync(join(dir, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
function requireTrue(v: unknown, code: string): asserts v { if (!v) throw new Error(code); }

export function makeEffortPlan() {
  requireTrue(!existsSync(join(PRIOR, ".run-lock")), "SOURCE_PROBE_RUNNING");
  const previous = read(join(PRIOR, "plan.json")), report = scoreInsomniaProbe(PRIOR);
  requireTrue(report.rows.length === 12 && report.rows.every(r => r.attempted && r.result && r.evaluation)
    && JSON.stringify(report, null, 2) + "\n" === readFileSync(join(PRIOR, "report.json"), "utf8"), "SOURCE_PROBE_NOT_RECONCILED");
  const claimPath = join(previous.budget.exclusiveClaim, "claim.json");
  requireTrue(digest(read(claimPath)) === digest({ fingerprint: digest(previous), directory: resolve(PRIOR), allocationUSD: report.spend.plannedReservationUSD }), "SOURCE_CLAIM_MISMATCH");
  const old = read(join(OWNERSHIP, "plan.json")) as ReturnType<typeof makeTaskOwnershipPlan>;
  const spent = report.spend.priorAccountedAndReservedUSD + report.spend.currentAccountedAndOutstandingUSD;
  requireTrue(previous.budget.missionCeilingUSD === 90 && Number.isFinite(spent) && spent >= 0 && spent < 90, "PRIOR_BALANCE_INVALID");
  const cases = EFFORT_CASES.map(id => {
    const c = old.cases.find(c => c.id === id); requireTrue(c && hash(c.path) === c.historyHash, `BOUND_CASE_MISSING:${id}`);
    return { ...c, packets: { full: c.packets.full, brief: c.packets.full },
      packetHashes: { full: digest(c.packets.full), brief: digest(c.packets.full) } };
  });
  const paths = [join(PRIOR, "plan.json"), join(PRIOR, "report.json"), join(PRIOR, "reservation.json"), claimPath,
    ...previous.schedule.flatMap((s: { repeat: number; arm: string }) => ["started", "result", "evaluation"].map(k => join(PRIOR, `${s.repeat}-${s.arm}-${k}.json`))),
    "scripts/effort-alignment-probe.ts", "tests/effort-alignment-probe.test.ts", "docs/EFFORT_ALIGNMENT_PROBE_PLAN_2026-09-15.md"];
  return { ...old, experiment: undefined, protocol: "fixed-packet-effort-alignment/v1", createdAt: new Date().toISOString(),
    studyKind: "Targeted development subset; provider effort only", cases,
    prompts: { full: old.prompts.full, brief: old.prompts.full }, promptHashes: { full: old.promptHashes.full, brief: old.promptHashes.full },
    settings: { ...old.settings, maxOutputTokens: 4096 },
    providerOptions: { full: { anthropic: { thinking: { type: "adaptive" as const }, effort: "low" as const } },
      brief: { anthropic: { thinking: { type: "adaptive" as const }, effort: "high" as const } } },
    armLabels: { full: "low_effort", brief: "high_effort" }, contracts: { full: "full" as const, brief: "full" as const },
    schedule: cases.flatMap((c, i) => (i % 2 ? [...ARMS].reverse() : [...ARMS]).map(arm => ({ id: c.id, arm }))),
    files: { ...previous.files, ...Object.fromEntries(paths.map(p => [p, hash(p)])) },
    budget: { ...old.budget, priorAccountedAndReservedUSD: spent, remainingUSD: 90 - spent,
      exclusiveClaim: "outputs/.effort-alignment-probe-spend-2026-09-15" },
    interpretation: "20 fresh producer calls, 10 purposively selected development cases; not held-out accuracy or V25 releases. Same original full prompt/packet/schema and 4096 output cap in BOTH arms; only effort low versus high changes. Historical context/sources retained, including C47's original MedlinePlus packet. No judge, repair, live retrieval, gold or early action in model input. No physician approval or patient publication. Count missing, failed and withheld proposals; raw route agreement remains diagnostic only." };
}
export type EffortPlan = ReturnType<typeof makeEffortPlan>;
export function effortCost(execution: ModelTransportResult, plan: EffortPlan, reservationUSD: number) {
  const known = [execution.usage.inputTokens, execution.usage.outputTokens].every(v => v !== null && Number.isSafeInteger(v) && v >= 0);
  const cost = known ? briefCost(execution, plan) : null;
  return { baseUSD: cost?.baseUSD ?? null, accountedUSD: cost?.accountedUSD ?? reservationUSD, reservationUSD };
}
export function validateEffortPlan(plan: EffortPlan) {
  const expected = makeEffortPlan();
  requireTrue(digest({ ...plan, createdAt: "" }) === digest({ ...expected, createdAt: "" }), "ONLY_EFFORT_CHANGE_ALLOWED");
  requireTrue(plan.node === process.version && plan.icu === process.versions.icu
    && ARMS.every(a => digest(plan.schemas[a]) === digest(wireDraftSchema.toJSONSchema())), "RUNTIME_OR_SCHEMA_CHANGED");
  verifyProbeFiles(plan);
}
export function effortReservations(plan: EffortPlan) {
  const pairs = Object.fromEntries(plan.cases.map(c => { const reservations = Object.fromEntries(ARMS.map(a => [a, reservationForBrief(plan, c, a)]));
    return [c.id, { reservations, pairReservationUSD: reservations.full + reservations.brief }]; }));
  const totalUSD = Object.values(pairs).reduce((s, p) => s + p.pairReservationUSD, 0);
  requireTrue(plan.cases.length === 10 && new Set(plan.cases.map(c => c.id)).size === 10 && plan.schedule.length === 20
    && Object.values(pairs).every(p => Number.isFinite(p.pairReservationUSD) && p.pairReservationUSD > 0)
    && Number.isFinite(plan.budget.remainingUSD) && totalUSD <= plan.budget.remainingUSD, "ALL_20_RESERVATIONS_MUST_FIT");
  return { pairs, totalUSD };
}
export function scoreEffortProbe(directory: string) {
  const plan = read(join(directory, "plan.json")) as EffortPlan, reserved = effortReservations(plan);
  validateEffortPlan(plan);
  for (const c of plan.cases) {
    const p = join(directory, `${c.id}-reservation.json`), hasReservation = existsSync(p);
    if (hasReservation) requireTrue(digest(read(p)) === digest(reserved.pairs[c.id]), "PAIR_RESERVATION_CHANGED");
    for (const arm of ARMS) {
      const prefix = join(directory, `${c.id}-${arm}`), start = existsSync(`${prefix}-started.json`) ? read(`${prefix}-started.json`) : null;
      const result = existsSync(`${prefix}-result.json`) ? read(`${prefix}-result.json`) : null;
      const evaluation = existsSync(`${prefix}-evaluation.json`) ? read(`${prefix}-evaluation.json`) : null;
      const reservationUSD = reserved.pairs[c.id].reservations[arm];
      if (start) requireTrue(hasReservation && start.fingerprint === digest(plan) && start.packetHash === c.packetHashes[arm]
        && digest(start.providerOptions) === digest(plan.providerOptions[arm]) && start.reservationUSD === reservationUSD, "START_BINDING_CHANGED");
      if (result) requireTrue(start && digest({ baseUSD: result.baseUSD, accountedUSD: result.accountedUSD, reservationUSD: result.reservationUSD })
        === digest(effortCost(result.execution, plan, reservationUSD)), "RESULT_ACCOUNTING_CHANGED");
      if (evaluation) requireTrue(result && digest(evaluation) === digest(safeEvaluate(c, arm, result.execution, "full")), "EVALUATION_NOT_BOUND");
    }
  }
  const report = scoreBriefStudy(directory);
  const ref = readPhysicianReference(readFileSync("data/evaluation/physician-system-reference-v2.json", "utf8"), readFileSync("data/patient_messages.csv", "utf8"));
  const denominator = plan.cases.filter(c => ref.cases.find(r => r.id === c.id)!.reference.acceptedRoutes !== null).length;
  // The shared full-cohort scorer's fixed 49 denominator is not this subset.
  for (const arm of ARMS) report.arms[arm].agreementCoverage.denominator = denominator;
  return { ...report, plannedCases: plan.cases.length, plannedCalls: plan.schedule.length, cohort: [...EFFORT_CASES],
    claim_support: "not_assessed", clinical_correctness: "not_assessed", patientAdvicePublished: false, clinicalApproval: false };
}
export async function main() {
  const [command, directory, claim] = process.argv.slice(2); requireTrue(command && directory, "COMMAND_AND_DIRECTORY_REQUIRED");
  if (command === "plan") { const plan = makeEffortPlan(); validateEffortPlan(plan); const reservations = effortReservations(plan);
    mkdirSync(directory); write(directory, "plan.json", plan); console.log(JSON.stringify({ fingerprint: digest(plan), reservations, remainingUSD: plan.budget.remainingUSD })); return; }
  const plan = read(join(directory, "plan.json")) as EffortPlan;
  if (command === "score") { requireTrue(claim, "NEW_SCORE_FILENAME_REQUIRED"); write(directory, claim, scoreEffortProbe(directory)); return; }
  requireTrue(command === "run" && claim === digest(plan), "EXACT_PLAN_CLAIM_REQUIRED");
  validateEffortPlan(plan); const reserved = effortReservations(plan), lock = join(directory, ".run-lock"); mkdirSync(lock);
  try {
    const mission = { fingerprint: claim, directory: resolve(directory), allocationUSD: reserved.totalUSD };
    if (!existsSync(plan.budget.exclusiveClaim)) { mkdirSync(plan.budget.exclusiveClaim); write(plan.budget.exclusiveClaim, "claim.json", mission); }
    else requireTrue(digest(read(join(plan.budget.exclusiveClaim, "claim.json"))) === digest(mission), "MISSION_ALREADY_CLAIMED");
    for (const c of plan.cases) { const name = `${c.id}-reservation.json`; if (!existsSync(join(directory, name))) write(directory, name, reserved.pairs[c.id]); }
    const env = parseEnv(readFileSync(".env", "utf8")); process.env.ANTHROPIC_API_KEY ||= env.ANTHROPIC_API_KEY; requireTrue(process.env.ANTHROPIC_API_KEY, "ANTHROPIC_KEY_REQUIRED");
    for (const { id, arm } of plan.schedule) {
      const c = plan.cases.find(c => c.id === id)!, prefix = `${id}-${arm}`, resultPath = join(directory, `${prefix}-result.json`), evalPath = join(directory, `${prefix}-evaluation.json`);
      if (existsSync(join(directory, `${prefix}-started.json`))) {
        if (existsSync(resultPath) && !existsSync(evalPath)) write(directory, `${prefix}-evaluation.json`, safeEvaluate(c, arm, read(resultPath).execution, "full"));
        continue;
      }
      requireTrue(scoreEffortProbe(directory).spend.currentAccountedAndOutstandingUSD <= plan.budget.remainingUSD, "MISSION_BALANCE_EXHAUSTED");
      const prompt = JSON.stringify(c.packets[arm]), reservationUSD = reserved.pairs[id].reservations[arm];
      requireTrue(sha256(prompt) === c.packetHashes[arm], "PACKET_CHANGED");
      write(directory, `${prefix}-started.json`, { at: new Date().toISOString(), fingerprint: claim, packetHash: sha256(prompt), providerOptions: plan.providerOptions[arm], reservationUSD, attempt: "first_attempt" });
      const deadline = requestDeadline(new AbortController().signal, plan.settings.timeoutMs);
      const execution = await consumeStructuredStream({ signal: deadline.signal, start: abortSignal => new Agent({ id: `effort-probe-${arm}`, name: "Effort probe", model: plan.model, instructions: plan.prompts[arm], maxRetries: 0 }).stream(prompt, {
        abortSignal, structuredOutput: { schema: safetyEnvelopeTransport(wireDraftSchema, z.unknown()), errorStrategy: "strict" }, maxSteps: 1,
        modelSettings: { maxOutputTokens: plan.settings.maxOutputTokens, maxRetries: 0 }, providerOptions: plan.providerOptions[arm], tracingOptions: { hideInput: true, hideOutput: true },
      }) }).finally(() => deadline.dispose());
      write(directory, `${prefix}-result.json`, { execution, ...effortCost(execution, plan, reservationUSD) });
      write(directory, `${prefix}-evaluation.json`, safeEvaluate(c, arm, execution, "full"));
      console.log(JSON.stringify({ id, effort: plan.providerOptions[arm].anthropic.effort, failure: execution.failure, durationMs: execution.durationMs, outputTokens: execution.usage.outputTokens }));
    }
    const report = scoreEffortProbe(directory);
    if (!existsSync(join(directory, "report.json"))) write(directory, "report.json", report);
    requireTrue(report.spend.remainingMissionUSD >= 0, "USAGE_EXCEEDED_MISSION_BUDGET");
  } finally { rmdirSync(lock); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
