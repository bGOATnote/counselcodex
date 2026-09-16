/** Isolated source-content probe; no live import, judge, repair or publication. */
import { existsSync, mkdirSync, readFileSync, rmdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { scoreCorrection, evaluateCorrection, type CorrectionPlan } from "./routing-brief-correction-probe.ts";
import { verifyProbeFiles } from "./insomnia-source-probe.ts";
import { effortCost } from "./effort-alignment-probe.ts";
import { reservationForBrief } from "./routing-brief-study.ts";
import { cdcAomCandidateHits } from "../src/evidence/rag/cdc-aom-candidate.ts";
import { sourceWithQuoteSpans } from "../src/disposition/source-quote-refs.ts";
import { ROUTING_BRIEF_V2_INSTRUCTIONS, wireRoutingBriefV2Schema } from "../src/disposition/routing-brief-v2.ts";
import { readPhysicianReference } from "../src/evaluation/physician-cohort.ts";
import { consumeStructuredStream, safetyEnvelopeTransport, type ModelTransportResult } from "../src/disposition/transport.ts";
import { requestDeadline } from "../src/disposition/execution-policy.ts";
import { sha256 } from "../src/evidence/rag/model.ts";

const PRIOR = "outputs/routing-brief-correction-live-2026-09-15";
const ARMS = ["full", "brief"] as const;
type Arm = typeof ARMS[number];
type FixedCase = CorrectionPlan["cases"][number];
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const hash = (p: string) => sha256(readFileSync(p));
const digest = (v: unknown) => sha256(JSON.stringify(v));
function check(v: unknown, message: string): asserts v { if (!v) throw new Error(message); }
const write = (d: string, n: string, v: unknown) => writeFileSync(join(d, n), JSON.stringify(v, null, 2) + "\n", { flag: "wx", mode: 0o600 });

export function replaceAomRecognition(c: FixedCase): FixedCase {
  const index = c.hits.findIndex(h => h.chunk.id === "1b640fd18cef569933a0cf6a0f1baf3099d6e0277240fcca1446b8bebac4d1bc");
  check(index >= 0 && c.hits.length === 9 && c.sources.length === 9 && c.guidance.length === 9
    && c.hits.every((h, i) => h.chunk.id === c.sources[i].id && h.chunk.text === c.sources[i].text
      && sha256(h.chunk.text) === h.chunk.hash && digest(c.packets.brief.sources[i]) === digest(sourceWithQuoteSpans(c.sources[i]))), "BASELINE_BINDING_CHANGED");
  const hits = cdcAomCandidateHits(); check(hits.length === 1, "ONE_WHOLE_AOM_CHUNK_REQUIRED");
  const h = hits[0], replace = <T>(values: T[], v: T) => values.map((old, i) => i === index ? v : old);
  const source = { id: h.chunk.id, title: h.document.title, kind: h.document.kind, review: h.document.reviewStatus,
    date: h.document.publicationDate, currency: h.document.currency, scope: h.document.scope,
    section: h.chunk.sectionTitle, before: h.context.before, text: h.chunk.text, after: h.context.after };
  const packet = { ...c.packets.brief, sources: replace(c.packets.brief.sources, sourceWithQuoteSpans(source)) };
  const guidance = { id: h.chunk.id, title: h.document.title, url: h.document.url, section: h.chunk.sectionTitle, summary: h.chunk.text,
    reviewedAt: h.document.reviewDate ?? "not assessed", projectInterpretation: `${h.document.kind}; ${h.document.reviewStatus}. ${h.document.scope}`,
    retrievedPassages: [{ id: h.chunk.id, sourceId: h.document.id, excerpt: h.chunk.text, excerptSha256: h.chunk.hash,
      retrievedAt: h.document.retrievedAt, sourceContentHash: h.document.rawHash, kind: h.document.kind, limitations: h.document.scope }] };
  return { ...c, hits: replace(c.hits, h), sources: replace(c.sources, source), guidance: replace(c.guidance, guidance),
    packets: { full: packet, brief: packet }, packetHashes: { full: digest(packet), brief: digest(packet) } };
}
export function makeAomPlan() {
  check(!existsSync(join(PRIOR, ".run-lock")), "PRIOR_RUNNING");
  const old = read(join(PRIOR, "plan.json")) as CorrectionPlan, report = scoreCorrection(PRIOR);
  check(report.rows.length === 16 && report.rows.every(r => r.attempted && r.row)
    && JSON.stringify(report, null, 2) + "\n" === readFileSync(join(PRIOR, "report.json"), "utf8"), "PRIOR_NOT_RECONCILED");
  const claim = join(old.budget.exclusiveClaim, "claim.json"); check(read(claim).fingerprint === digest(old), "PRIOR_CLAIM_CHANGED");
  const baseline = old.cases.find(c => c.id === "C32")!;
  check(baseline && baseline.issued.length === 0 && hash(baseline.path) === baseline.historyHash, "CASE_IDENTITY_CHANGED");
  const spent = report.spend.priorAccountedAndReservedUSD + report.spend.currentAccountedAndOutstandingUSD;
  const files = [join(PRIOR, "plan.json"), join(PRIOR, "report.json"), claim,
    ...old.cases.flatMap(c => [join(PRIOR, `${c.id}-reservation.json`), ...ARMS.flatMap(a => ["started", "result", "evaluation"].map(k => join(PRIOR, `${c.id}-${a}-${k}.json`)))]),
    "scripts/aom-source-probe.ts", "tests/aom-source-probe.test.ts", "docs/AOM_SOURCE_PROBE_PLAN_2026-09-15.md",
    "src/evidence/rag/cdc-aom-candidate.ts", "src/evidence/rag/cdc-aom-candidate.test.ts",
    "src/evidence/rag/fixtures/cdc-aom-2026-09-15/response.html", "src/evidence/rag/fixtures/cdc-aom-2026-09-15/rights.html",
    "src/evidence/rag/fixtures/cdc-aom-2026-09-15/capture.json", "src/evidence/rag/fixtures/cdc-aom-2026-09-15/capture.mjs",
    "src/evidence/rag/fixtures/cdc-aom-2026-09-15/README.md"];
  check(Number.isFinite(spent) && spent < 90 && old.budget.missionCeilingUSD === 90, "BUDGET_INVALID");
  return { ...old, protocol: "fixed-packet-aom-source/v1", createdAt: new Date().toISOString(),
    cases: [baseline, replaceAomRecognition(baseline)], prompts: { full: ROUTING_BRIEF_V2_INSTRUCTIONS, brief: ROUTING_BRIEF_V2_INSTRUCTIONS },
    promptHashes: { full: sha256(ROUTING_BRIEF_V2_INSTRUCTIONS), brief: sha256(ROUTING_BRIEF_V2_INSTRUCTIONS) },
    schemas: { full: wireRoutingBriefV2Schema.toJSONSchema(), brief: wireRoutingBriefV2Schema.toJSONSchema() },
    armLabels: { full: "original_compiled_recognition", brief: "cdc_diagnosis_management" },
    schedule: Array.from({ length: 3 }, (_, i) => (i % 2 ? [...ARMS].reverse() : [...ARMS]).map(arm => ({ repeat: i + 1, arm }))).flat(),
    budget: { ...old.budget, priorAccountedAndReservedUSD: spent, remainingUSD: 90 - spent, exclusiveClaim: "outputs/.aom-source-probe-spend-2026-09-15" },
    files: { ...old.files, ...Object.fromEntries(files.map(p => [p, hash(p)])) },
    interpretation: "Three paired unpublished brief-v2 repetitions of C32. Only one Recognition chunk is replaced with the full CDC AOM diagnosis and management excerpt. Eight other chunks, patient, context, model/settings, prompt and contract stay identical. Original already contains diagnostic prerequisites; this tests provenance/content and patient application, not retrieval recall. Self-care may be defensible; a route change is neither necessary nor sufficient for improved source use. No judge, repair, embeddings, live retrieval, gold input, or clinical approval." };
}
export type AomPlan = ReturnType<typeof makeAomPlan>;
export function evaluateAom(c: FixedCase, arm: Arm, execution: ModelTransportResult) {
  return { ...evaluateCorrection(c, "brief", execution), arm, contract: "routing-brief/v2" };
}
export function validateAomPlan(p: AomPlan) {
  check(digest({ ...p, createdAt: "" }) === digest({ ...makeAomPlan(), createdAt: "" }), "FROZEN_AOM_CHANGED");
  check(p.node === process.version && p.icu === process.versions.icu, "RUNTIME_CHANGED"); verifyProbeFiles(p);
}
export function aomReservations(p: AomPlan) {
  const slots = Object.fromEntries(p.schedule.map(s => [`${s.repeat}-${s.arm}`, reservationForBrief(p as unknown as CorrectionPlan, p.cases[ARMS.indexOf(s.arm)], s.arm)]));
  const totalUSD = Object.values(slots).reduce((sum, value) => sum + value, 0);
  check(Object.keys(slots).length === 6 && Object.values(slots).every(v => Number.isFinite(v) && v > 0)
    && Number.isFinite(totalUSD) && totalUSD <= p.budget.remainingUSD, "ALL_SIX_RESERVATIONS_MUST_FIT");
  return { slots, totalUSD };
}
export function verifyAomPhaseClaim(directory: string, plan: AomPlan, allocationUSD: number) {
  const path = join(plan.budget.exclusiveClaim, "claim.json");
  check(existsSync(path) && digest(read(path)) === digest({ fingerprint: digest(plan), directory: resolve(directory), allocationUSD }),
    "PHASE_CLAIM_CHANGED");
}
export function scoreAom(directory: string) {
  const plan = read(join(directory, "plan.json")) as AomPlan; validateAomPlan(plan);
  const reserved = aomReservations(plan), held = existsSync(join(directory, "reservation.json"));
  if (held) {
    check(digest(read(join(directory, "reservation.json"))) === digest(reserved), "RESERVATION_CHANGED");
    verifyAomPhaseClaim(directory, plan, reserved.totalUSD);
  }
  const gold = readPhysicianReference(readFileSync("data/evaluation/physician-system-reference-v2.json", "utf8"), readFileSync("data/patient_messages.csv", "utf8"));
  const rows = plan.schedule.map(s => {
    const key = `${s.repeat}-${s.arm}`, prefix = join(directory, key), c = plan.cases[ARMS.indexOf(s.arm)];
    const start = existsSync(`${prefix}-started.json`) ? read(`${prefix}-started.json`) : null;
    const result = existsSync(`${prefix}-result.json`) ? read(`${prefix}-result.json`) : null;
    const evaluation = existsSync(`${prefix}-evaluation.json`) ? read(`${prefix}-evaluation.json`) as ReturnType<typeof evaluateAom> : null;
    if (start) check(held && start.fingerprint === digest(plan) && start.packetHash === c.packetHashes[s.arm]
      && start.reservationUSD === reserved.slots[key], "START_BINDING_CHANGED");
    if (result) check(start && digest({ baseUSD: result.baseUSD, accountedUSD: result.accountedUSD, reservationUSD: result.reservationUSD })
      === digest(effortCost(result.execution, plan as never, reserved.slots[key])), "COST_BINDING_CHANGED");
    if (evaluation) check(result && digest(evaluation) === digest(evaluateAom(c, s.arm, result.execution)), "EVALUATION_CHANGED");
    const accepted = gold.cases.find(r => r.id === c.id)!.reference.acceptedRoutes;
    const route = evaluation?.proposal?.route;
    const agreement = evaluation?.eligibleRoutingProposal && accepted && route ? accepted.includes(route) : null;
    return { ...s, id: c.id, attempted: Boolean(start), result, evaluation, agreement };
  });
  const accounted = held ? rows.reduce((sum, r) => sum + (r.result?.accountedUSD ?? reserved.slots[`${r.repeat}-${r.arm}`]), 0) : 0;
  return { protocol: plan.protocol, rows, arms: Object.fromEntries(ARMS.map(arm => { const selected = rows.filter(r => r.arm === arm);
    return [plan.armLabels[arm], { attempted: selected.filter(r => r.attempted).length, providerComplete: selected.filter(r => r.evaluation?.providerComplete).length,
      eligible: selected.filter(r => r.evaluation?.eligibleRoutingProposal).length, agreement: { numerator: selected.filter(r => r.agreement === true).length,
        denominator: selected.filter(r => r.agreement !== null).length }, agreementCoverageDenominator: 3 }]; })),
    spend: { priorAccountedUSD: plan.budget.priorAccountedAndReservedUSD, reservedUSD: reserved.totalUSD,
      baseUSD: rows.every(r => r.result?.baseUSD != null) ? rows.reduce((sum, r) => sum + r.result.baseUSD, 0) : null,
      unknownUsageRows: rows.filter(r => r.attempted && r.result?.baseUSD == null).length, accountedAndOutstandingUSD: accounted,
      remainingUSD: plan.budget.remainingUSD - accounted },
    claim_support: "not_assessed", clinical_correctness: "not_assessed", unsafe_advice: "not_assessed", unsupported_claims: "not_assessed",
    clinicalApproval: false, patientAdvicePublished: false, interpretation: plan.interpretation };
}
export async function main() {
  const [command, directory, claim] = process.argv.slice(2); check(directory, "NEW_DIRECTORY_REQUIRED");
  if (command === "plan") { const p = makeAomPlan(); validateAomPlan(p); const r = aomReservations(p); mkdirSync(directory); write(directory, "plan.json", p); console.log(JSON.stringify({ fingerprint: digest(p), reservedUSD: r.totalUSD, remainingUSD: p.budget.remainingUSD })); return; }
  if (command === "score") { check(claim, "NEW_REPORT_FILENAME_REQUIRED"); write(directory, claim, scoreAom(directory)); return; }
  const p = read(join(directory, "plan.json")) as AomPlan;
  check(command === "run" && claim === digest(p), "EXACT_PLAN_CLAIM_REQUIRED"); validateAomPlan(p); const reserved = aomReservations(p);
  const lock = join(directory, ".run-lock"); mkdirSync(lock);
  try {
    const allocation = { fingerprint: claim, directory: resolve(directory), allocationUSD: reserved.totalUSD };
    if (!existsSync(p.budget.exclusiveClaim)) { mkdirSync(p.budget.exclusiveClaim); write(p.budget.exclusiveClaim, "claim.json", allocation); }
    else check(digest(read(join(p.budget.exclusiveClaim, "claim.json"))) === digest(allocation), "PHASE_ALREADY_CLAIMED");
    if (!existsSync(join(directory, "reservation.json"))) write(directory, "reservation.json", reserved);
    const env = parseEnv(readFileSync(".env", "utf8")); process.env.ANTHROPIC_API_KEY ||= env.ANTHROPIC_API_KEY; check(process.env.ANTHROPIC_API_KEY, "KEY_REQUIRED");
    for (const s of p.schedule) {
      const key = `${s.repeat}-${s.arm}`, c = p.cases[ARMS.indexOf(s.arm)], resultPath = join(directory, `${key}-result.json`), evalPath = join(directory, `${key}-evaluation.json`);
      if (existsSync(join(directory, `${key}-started.json`))) { if (existsSync(resultPath) && !existsSync(evalPath)) write(directory, `${key}-evaluation.json`, evaluateAom(c, s.arm, read(resultPath).execution)); continue; }
      check(scoreAom(directory).spend.remainingUSD >= 0, "MISSION_CEILING_REACHED");
      const prompt = JSON.stringify(c.packets[s.arm]), reservationUSD = reserved.slots[key]; check(sha256(prompt) === c.packetHashes[s.arm], "PACKET_CHANGED");
      write(directory, `${key}-started.json`, { fingerprint: claim, at: new Date().toISOString(), packetHash: sha256(prompt), reservationUSD, attempt: "first_attempt" });
      const deadline = requestDeadline(new AbortController().signal, p.settings.timeoutMs);
      const execution = await consumeStructuredStream({ signal: deadline.signal, start: abortSignal => new Agent({ id: `aom-source-${s.arm}`, name: "Source-content probe", model: p.model, instructions: p.prompts[s.arm], maxRetries: 0 }).stream(prompt, {
        abortSignal, structuredOutput: { schema: safetyEnvelopeTransport(wireRoutingBriefV2Schema, z.unknown()), errorStrategy: "strict" }, maxSteps: 1,
        modelSettings: { maxOutputTokens: p.settings.maxOutputTokens, maxRetries: 0 }, providerOptions: p.settings.providerOptions, tracingOptions: { hideInput: true, hideOutput: true },
      }) }).finally(() => deadline.dispose());
      write(directory, `${key}-result.json`, { execution, ...effortCost(execution, p as never, reservationUSD) });
      write(directory, `${key}-evaluation.json`, evaluateAom(c, s.arm, execution)); console.log(JSON.stringify({ key, failure: execution.failure, durationMs: execution.durationMs }));
    }
    const report = scoreAom(directory); if (!existsSync(join(directory, "report.json"))) write(directory, "report.json", report);
    check(report.spend.remainingUSD >= 0, "USAGE_EXCEEDED_MISSION_BUDGET");
  } finally { rmdirSync(lock); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
