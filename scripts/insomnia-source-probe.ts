/** Isolated source REPLACEMENT experiment; never live retrieval or clinical approval. */
import { existsSync, mkdirSync, readFileSync, rmdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { briefCost, reservationForBrief, safeEvaluate, scoreBriefStudy, type makeTaskOwnershipPlan } from "./routing-brief-study.ts";
import { wireDraftSchema } from "../src/disposition/graph-output.ts";
import { sourceWithQuoteSpans } from "../src/disposition/source-quote-refs.ts";
import { consumeStructuredStream, safetyEnvelopeTransport, type ModelTransportResult } from "../src/disposition/transport.ts";
import { requestDeadline } from "../src/disposition/execution-policy.ts";
import { sha256 } from "../src/evidence/rag/model.ts";
import { insomniaCandidateHits, loadNhlbiInsomniaCandidate } from "../src/evidence/rag/nhlbi-insomnia-candidate.ts";

const PRIOR = "outputs/task-ownership-ablation-2026-09-15", PROTOCOL = "fixed-packet-insomnia-source/v1";
const ARMS = ["full", "brief"] as const;
type PriorPlan = ReturnType<typeof makeTaskOwnershipPlan>;
type FixedCase = PriorPlan["cases"][number];
const digest = (value: unknown) => sha256(JSON.stringify(value));
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const hash = (path: string) => sha256(readFileSync(path));
function requireTrue(value: unknown, code: string): asserts value { if (!value) throw new Error(code); }
const write = (dir: string, name: string, value: unknown) => writeFileSync(join(dir, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
export const verifyProbeFiles = (plan: Pick<PriorPlan, "files">) => { for (const [path, expected] of Object.entries(plan.files)) requireTrue(hash(path) === expected, `FROZEN_FILE_CHANGED:${path}`); };

export function replaceInsomniaSource(c: FixedCase): FixedCase {
  const indices = c.hits.flatMap((h, i) => h.document.id === "medlineplus:6055" ? [i] : []);
  requireTrue(indices.length > 0 && c.sources.length === c.hits.length && c.guidance.length === c.hits.length && c.packets.full.sources.length === c.hits.length
    && new Set(c.hits.map(h => h.chunk.id)).size === c.hits.length
    && c.hits.every((h, i) => h.chunk.documentId === h.document.id && sha256(h.chunk.text) === h.chunk.hash
      && h.chunk.id === c.sources[i].id && h.chunk.text === c.sources[i].text && h.chunk.id === c.guidance[i].id && h.chunk.text === c.guidance[i].summary
      && digest(c.packets.full.sources[i]) === digest(sourceWithQuoteSpans(c.sources[i]))), "BASELINE_SOURCE_BINDING_FAILED");
  const hits = insomniaCandidateHits(loadNhlbiInsomniaCandidate()); requireTrue(hits.length === 1, "EXACTLY_ONE_CANDIDATE_CHUNK_REQUIRED");
  const h = hits[0], replace = <T>(values: T[], item: T) => { const result = values.filter((_, i) => !indices.includes(i)); result.splice(indices[0], 0, item); return result; };
  requireTrue(!c.hits.some(old => old.document.id === h.document.id || old.chunk.id === h.chunk.id), "CANDIDATE_ALREADY_PRESENT");
  const source = { id: h.chunk.id, title: h.document.title, kind: h.document.kind, review: h.document.reviewStatus, date: h.document.publicationDate,
    currency: h.document.currency, scope: h.document.scope, section: h.chunk.sectionTitle, before: h.context.before, text: h.chunk.text, after: h.context.after };
  // Preserve original non-replaced packet objects, including their quote IDs and offsets.
  const sources = replace(c.sources, source), packet = { ...c.packets.full, sources: replace(c.packets.full.sources, sourceWithQuoteSpans(source)) };
  const guidance = replace(c.guidance, { id: h.chunk.id, title: h.document.title, url: h.document.url, section: h.chunk.sectionTitle, summary: h.chunk.text,
    reviewedAt: h.document.reviewDate ?? "not assessed", projectInterpretation: `${h.document.kind}; ${h.document.reviewStatus}. ${h.document.scope}`,
    retrievedPassages: [{ id: h.chunk.id, sourceId: h.document.id, excerpt: h.chunk.text, excerptSha256: h.chunk.hash, retrievedAt: h.document.retrievedAt,
      sourceContentHash: h.document.rawHash, kind: h.document.kind, limitations: h.document.scope }] });
  return { ...c, hits: replace(c.hits, h), sources, guidance, packets: { full: packet, brief: packet },
    packetHashes: { full: digest(packet), brief: digest(packet) }, commonInputHash: digest(packet) };
}

export function makeInsomniaProbePlan() {
  requireTrue(!existsSync(join(PRIOR, ".run-lock")), "OWNERSHIP_STUDY_RUNNING");
  const prior = read(join(PRIOR, "plan.json")) as PriorPlan, reportPath = join(PRIOR, "report.json"), report = read(reportPath);
  requireTrue(prior.protocol === "fixed-packet-task-ownership/v1" && prior.schedule.length === 100
    && prior.cases.length === 50 && new Set(prior.cases.map(c => c.id)).size === 50
    && prior.cases.every(c => ARMS.every(arm => prior.schedule.some(s => s.id === c.id && s.arm === arm)))
    && new Set(prior.schedule.map(s => `${s.id}-${s.arm}`)).size === 100
    && prior.schedule.every(s => ["started", "result", "evaluation"].every(kind => existsSync(join(PRIOR, `${s.id}-${s.arm}-${kind}.json`))))
    && ARMS.every(arm => report.arms[arm].attempted === 50) && report.rows.length === 100 && report.rows.every((r: { row: unknown }) => r.row !== null), "OWNERSHIP_STUDY_INCOMPLETE");
  requireTrue(JSON.stringify(scoreBriefStudy(PRIOR), null, 2) + "\n" === readFileSync(reportPath, "utf8"), "OWNERSHIP_REPORT_REPLAY_MISMATCH");
  const executionPath = join(PRIOR, "execution-claim.json"), claimPath = join(prior.budget.exclusiveClaim, "claim.json");
  requireTrue(read(executionPath).fingerprint === digest(prior) && digest(read(claimPath)) === digest({ fingerprint: digest(prior), directory: resolve(PRIOR), allocationUSD: prior.budget.remainingUSD }), "OWNERSHIP_CLAIM_MISMATCH");
  verifyProbeFiles(prior);
  for (const previous of prior.cases) requireTrue(hash(previous.path) === previous.historyHash, `OWNERSHIP_HISTORY_MISMATCH:${previous.id}`);
  const original = prior.cases.find(c => c.id === "C47"); requireTrue(original && hash(original.path) === original.historyHash, "C47_HISTORY_MISMATCH");
  const c = { ...original, packets: { full: original.packets.full, brief: original.packets.full }, packetHashes: { full: digest(original.packets.full), brief: digest(original.packets.full) } };
  const spent = report.spend.priorAccountedAndReservedUSD + report.spend.currentAccountedAndOutstandingUSD;
  requireTrue(prior.budget.missionCeilingUSD === 90 && Number.isFinite(spent) && spent >= 0 && spent < 90
    && Math.abs(report.spend.remainingMissionUSD - (90 - spent)) < 1e-9, "PRIOR_SPEND_INVALID");
  const files = [join(PRIOR, "plan.json"), reportPath, executionPath, claimPath, "scripts/insomnia-source-probe.ts", "tests/insomnia-source-probe.test.ts",
    ...prior.cases.flatMap(c => [c.path, join(PRIOR, `${c.id}-reservation.json`)]),
    ...prior.schedule.flatMap(s => ["started", "result", "evaluation"].map(kind => join(PRIOR, `${s.id}-${s.arm}-${kind}.json`))),
    "docs/INSOMNIA_SOURCE_PROBE_2026-09-15.md", "src/evidence/rag/disposition-support.ts", "src/evidence/rag/nhlbi-insomnia-candidate.ts", "src/evidence/rag/fixtures/nhlbi-insomnia-2026-09-15/response.html"];
  const plan = { ...prior, protocol: PROTOCOL, experiment: undefined, studyKind: "counterfactual source replacement; not live retrieval", createdAt: new Date().toISOString(),
    cases: [c, replaceInsomniaSource(c)], prompts: { full: prior.prompts.full, brief: prior.prompts.full },
    promptHashes: { full: prior.promptHashes.full, brief: prior.promptHashes.full }, armLabels: { full: "retained_medlineplus", brief: "replacement_nhlbi" },
    files: { ...prior.files, ...Object.fromEntries(files.map(path => [path, hash(path)])) },
    budget: { ...prior.budget, priorAccountedAndReservedUSD: spent, remainingUSD: 90 - spent, exclusiveClaim: "outputs/.insomnia-source-probe-spend-2026-09-15" },
    schedule: Array.from({ length: 6 }, (_, i) => (i % 2 ? [...ARMS].reverse() : [...ARMS]).map(arm => ({ id: "C47", repeat: i + 1, arm }))).flat(),
    interpretation: "Six paired fresh full-producer repetitions. Only selected MedlinePlus insomnia chunks replaced by one NHLBI paragraph. No retrieval, judge, repair, GUI release, gold input or clinical approval. Source-reference integrity and compiler checks are not claim-support or clinical judgments." };
  requireTrue(plan.node === process.version && plan.icu === process.versions.icu && ARMS.every(a => digest(plan.schemas[a]) === digest(wireDraftSchema.toJSONSchema())), "RUNTIME_OR_SCHEMA_CHANGED");
  validateProbeInputs(plan); probeReservations(plan); return plan;
}
type ProbePlan = ReturnType<typeof makeInsomniaProbePlan>;
const slotId = (s: ProbePlan["schedule"][number]) => `${s.repeat}-${s.arm}`;
export function validateProbeInputs(plan: ProbePlan) {
  const prior = read(join(PRIOR, "plan.json")) as PriorPlan, original = prior.cases.find(c => c.id === "C47")!;
  const report = scoreBriefStudy(PRIOR), spent = report.spend.priorAccountedAndReservedUSD + report.spend.currentAccountedAndOutstandingUSD;
  requireTrue(!existsSync(join(PRIOR, ".run-lock")) && JSON.stringify(report, null, 2) + "\n" === readFileSync(join(PRIOR, "report.json"), "utf8"), "OWNERSHIP_REPORT_REPLAY_MISMATCH");
  const baseline = { ...original, packets: { full: original.packets.full, brief: original.packets.full }, packetHashes: { full: digest(original.packets.full), brief: digest(original.packets.full) } };
  const schedule = Array.from({ length: 6 }, (_, i) => (i % 2 ? [...ARMS].reverse() : [...ARMS]).map(arm => ({ id: "C47", repeat: i + 1, arm }))).flat();
  requireTrue(plan.model === prior.model && digest(plan.settings) === digest(prior.settings) && digest(plan.pricing) === digest(prior.pricing)
    && plan.budget.missionCeilingUSD === 90 && Number.isFinite(spent) && spent >= 0 && spent < 90
    && plan.budget.priorAccountedAndReservedUSD === spent && plan.budget.remainingUSD === 90 - spent
    && plan.budget.exclusiveClaim === "outputs/.insomnia-source-probe-spend-2026-09-15"
    && digest(plan.schemas) === digest(prior.schemas) && digest(plan.contracts) === digest(prior.contracts)
    && ARMS.every(a => plan.prompts[a] === prior.prompts.full && plan.promptHashes[a] === sha256(prior.prompts.full))
    && digest(plan.cases) === digest([baseline, replaceInsomniaSource(baseline)]) && digest(plan.schedule) === digest(schedule), "ONLY_SOURCE_REPLACEMENT_ALLOWED");
}
export function probeCost(execution: ModelTransportResult, plan: ProbePlan, reservationUSD: number) {
  const known = [execution.usage.inputTokens, execution.usage.outputTokens].every(v => v !== null && Number.isSafeInteger(v) && v >= 0);
  const cost = known ? briefCost(execution, plan) : null;
  return { baseUSD: cost?.baseUSD ?? null, accountedUSD: cost?.accountedUSD ?? reservationUSD, reservationUSD };
}
export function probeReservations(plan: ProbePlan) {
  const slots = Object.fromEntries(plan.schedule.map(s => [slotId(s), reservationForBrief(plan, plan.cases[ARMS.indexOf(s.arm)], s.arm)]));
  const reservedUSD = Object.values(slots).reduce((sum, value) => sum + value, 0);
  requireTrue(Object.keys(slots).length === 12 && Object.values(slots).every(v => Number.isFinite(v) && v > 0)
    && Number.isFinite(plan.budget.remainingUSD) && reservedUSD <= plan.budget.remainingUSD, "ALL_12_RESERVATIONS_REQUIRED_WITHIN_BUDGET");
  return { slots, reservedUSD };
}
export function scoreInsomniaProbe(directory: string) {
  const plan = read(join(directory, "plan.json")) as ProbePlan, reservation = probeReservations(plan);
  verifyProbeFiles(plan);
  const reserved = existsSync(join(directory, "reservation.json"));
  if (reserved) requireTrue(digest(read(join(directory, "reservation.json"))) === digest(reservation), "RESERVATIONS_CHANGED");
  const rows = plan.schedule.map(s => { const id = slotId(s), path = join(directory, `${id}-result.json`), result = existsSync(path) ? read(path) : null;
    const started = existsSync(join(directory, `${id}-started.json`)) ? read(join(directory, `${id}-started.json`)) : null;
    if (started) requireTrue(reserved && started.fingerprint === digest(plan) && started.packetHash === plan.cases[ARMS.indexOf(s.arm)].packetHashes[s.arm] && started.reservationUSD === reservation.slots[id], "START_BINDING_INVALID");
    if (result) requireTrue(started && digest({ baseUSD: result.baseUSD, accountedUSD: result.accountedUSD, reservationUSD: result.reservationUSD }) === digest(probeCost(result.execution, plan, reservation.slots[id])), "RESULT_ACCOUNTING_INVALID");
    const evaluation = existsSync(join(directory, `${id}-evaluation.json`)) ? read(join(directory, `${id}-evaluation.json`)) : null;
    if (evaluation) requireTrue(result && started && digest(evaluation) === digest(safeEvaluate(plan.cases[ARMS.indexOf(s.arm)], s.arm, result.execution, "full")), "EVALUATION_RESULT_BINDING_FAILED");
    return { ...s, attempted: Boolean(started), result, evaluation }; });
  return { protocol: PROTOCOL, planned: 12, rows, spend: { priorAccountedAndReservedUSD: plan.budget.priorAccountedAndReservedUSD,
    plannedReservationUSD: reservation.reservedUSD, currentAccountedAndOutstandingUSD: reserved ? rows.reduce((sum, row) => sum + (row.result?.accountedUSD ?? reservation.slots[slotId(row)]), 0) : 0 },
    clinical_correctness: "not_assessed", unsafe_advice: "not_assessed", unsupported_claims: "not_assessed", claim_support: "not_assessed",
    interpretation: "Read each raw output and resolved quotation. No automated chronicity/eligibility/support score; all 12 slots, including missing/failed attempts, remain visible. Compiler admission is diagnostic only." };
}
export async function main() {
  const [command, directory, claim] = process.argv.slice(2); requireTrue(directory && command, "COMMAND_AND_NEW_DIRECTORY_REQUIRED");
  if (command === "plan") { const plan = makeInsomniaProbePlan(); mkdirSync(directory); write(directory, "plan.json", plan); console.log(digest(plan)); return; }
  const plan = read(join(directory, "plan.json")) as ProbePlan;
  if (command === "score") { requireTrue(claim, "NEW_SCORE_FILENAME_REQUIRED"); write(directory, claim, scoreInsomniaProbe(directory)); return; }
  requireTrue(command === "run" && claim === digest(plan) && plan.protocol === PROTOCOL && plan.node === process.version && plan.icu === process.versions.icu, "EXACT_FROZEN_PLAN_REQUIRED");
  verifyProbeFiles(plan); validateProbeInputs(plan); requireTrue(hash(plan.cases[0].path) === plan.cases[0].historyHash, "HISTORY_CHANGED");
  const reservation = probeReservations(plan), lock = join(directory, ".run-lock"); mkdirSync(lock);
  try {
    const mission = { fingerprint: claim, directory: resolve(directory), allocationUSD: reservation.reservedUSD };
    if (!existsSync(plan.budget.exclusiveClaim)) { mkdirSync(plan.budget.exclusiveClaim); write(plan.budget.exclusiveClaim, "claim.json", mission); }
    else requireTrue(digest(read(join(plan.budget.exclusiveClaim, "claim.json"))) === digest(mission), "MISSION_ALREADY_CLAIMED");
    if (!existsSync(join(directory, "reservation.json"))) write(directory, "reservation.json", reservation);
    else requireTrue(digest(read(join(directory, "reservation.json"))) === digest(reservation), "RESERVATIONS_CHANGED");
    const env = parseEnv(readFileSync(".env", "utf8")); process.env.ANTHROPIC_API_KEY ||= env.ANTHROPIC_API_KEY; requireTrue(process.env.ANTHROPIC_API_KEY, "ANTHROPIC_KEY_REQUIRED");
    for (const s of plan.schedule) {
      const id = slotId(s), c = plan.cases[ARMS.indexOf(s.arm)], resultPath = join(directory, `${id}-result.json`), evaluationPath = join(directory, `${id}-evaluation.json`);
      if (existsSync(join(directory, `${id}-started.json`))) {
        if (existsSync(resultPath) && !existsSync(evaluationPath)) write(directory, `${id}-evaluation.json`, safeEvaluate(c, s.arm, read(resultPath).execution, "full"));
        continue; // An interrupted/unknown first attempt is never reissued.
      }
      requireTrue(scoreInsomniaProbe(directory).spend.currentAccountedAndOutstandingUSD <= plan.budget.remainingUSD, "MISSION_BUDGET_EXHAUSTED");
      const prompt = JSON.stringify(c.packets[s.arm]); requireTrue(sha256(prompt) === c.packetHashes[s.arm], "PACKET_CHANGED");
      write(directory, `${id}-started.json`, { at: new Date().toISOString(), fingerprint: claim, packetHash: sha256(prompt), reservationUSD: reservation.slots[id], attempt: "first_attempt" });
      const deadline = requestDeadline(new AbortController().signal, plan.settings.timeoutMs);
      const execution = await consumeStructuredStream({ signal: deadline.signal, start: abortSignal => new Agent({ id: `insomnia-source-${s.arm}`, name: "Source replacement probe", model: plan.model, instructions: plan.prompts[s.arm], maxRetries: 0 }).stream(prompt, {
        abortSignal, structuredOutput: { schema: safetyEnvelopeTransport(wireDraftSchema, z.unknown()), errorStrategy: "strict" }, maxSteps: 1,
        modelSettings: { maxOutputTokens: plan.settings.maxOutputTokens, maxRetries: 0 }, providerOptions: plan.settings.providerOptions, tracingOptions: { hideInput: true, hideOutput: true },
      }) }).finally(() => deadline.dispose());
      write(directory, `${id}-result.json`, { execution, ...probeCost(execution, plan, reservation.slots[id]) });
      write(directory, `${id}-evaluation.json`, safeEvaluate(c, s.arm, execution, "full"));
      console.log(JSON.stringify({ id, failure: execution.failure, durationMs: execution.durationMs }));
    }
    const report = scoreInsomniaProbe(directory);
    if (!existsSync(join(directory, "report.json"))) write(directory, "report.json", report);
    const review = `# Counterfactual insomnia source probe\n\n${plan.cases[0].message}\n\n${report.interpretation}\n\n` + report.rows.map(row =>
      `## Repetition ${row.repeat} — ${plan.armLabels[row.arm]}\n\nAttempted: ${row.attempted}; failure: ${row.result?.execution.failure ?? (row.result ? "none" : "missing result")}\n\nResolved draft (or raw failed output):\n\n\`\`\`json\n${JSON.stringify(row.evaluation?.output ?? row.result?.execution.output ?? null, null, 2)}\n\`\`\`\n`).join("\n");
    if (!existsSync(join(directory, "review.md"))) writeFileSync(join(directory, "review.md"), review, { flag: "wx", mode: 0o600 });
    requireTrue(report.spend.currentAccountedAndOutstandingUSD <= plan.budget.remainingUSD, "USAGE_EXCEEDED_MISSION_BUDGET");
  } finally { rmdirSync(lock); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
