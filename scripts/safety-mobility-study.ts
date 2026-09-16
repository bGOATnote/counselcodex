import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { assessSafetyAdmission, GRAPH_VERSION, graphRequestSettings, safetySchema } from "../src/disposition/clinical-graph.ts";
import { resolveGraphConfig } from "../src/disposition/graph-config.ts";
import { graphSafetyInstructions } from "../src/disposition/graph-prompts.ts";
import { SAFETY_MOBILITY_POLICY } from "../src/disposition/safety-mobility-policy.ts";
import { consumeStructuredStream, safetyEnvelopeTransport, type ModelTransportResult } from "../src/disposition/transport.ts";
import { EXECUTION_POLICY, requestDeadline } from "../src/disposition/execution-policy.ts";
import { sha256 } from "../src/evidence/rag/model.ts";

export const MOBILITY_PROTOCOL = "safety-mobility-fixed-packet/v1";
export const MOBILITY_ARMS = ["baseline", "mobility"] as const;
type Arm = typeof MOBILITY_ARMS[number];
const NONURGENT = ["NONE", "STANDARD_ASYNC", "PRIORITY_ASYNC"] as const;
export const MOBILITY_CASES = [
  { id: "C48", positive: true, message: "71F. I fell in the kitchen this morning and my right hip hurts badly. I can't put any weight on that leg.", acceptedActions: ["EMS_NOW"], provenance: "Exact supplied C48 development message; observed early under-triage motivated this study. Not held out." },
  { id: "novel-immobile-alone", positive: true, message: "I'm 76 and alone at home. I tripped over a rug just now and landed on my left side. My left hip and upper thigh hurt severely. I cannot get up from the floor or stand because of the pain.", acceptedActions: ["EMS_NOW"], provenance: "Prospectively authored post-fall immobility paraphrase; not a physician-validated case." },
  { id: "current-caregiver-proxy", positive: true, message: "I'm with my 82-year-old mother. She fell onto her right side ten minutes ago. Her right hip hurts severely and she cannot get up or stand. I'm asking what we should do for her now.", acceptedActions: ["EMS_NOW"], provenance: "Prospectively authored current caregiver report. The relative is the patient being assessed; third-person wording must not hide the emergency." },
  { id: "ambulatory-ankle", positive: false, message: "I rolled my ankle on a curb this morning. The outside of the ankle is a little swollen and mildly sore, but I can walk four steps on it. My hip doesn't hurt.", acceptedActions: [...NONURGENT], provenance: "Authored near-neighbor negative. No early in-person/emergency floor is expected; final clinical assessment is not tested." },
  { id: "chronic-hip-walking", positive: false, message: "My hip has gradually become stiff and achy over the past three months. I have not fallen or injured it. I am still walking normally and would like advice about getting it checked.", acceptedActions: [...NONURGENT], provenance: "Authored nonacute negative; an async clinician task is allowed, not forced to NONE." },
  { id: "historical-healed-fracture", positive: false, message: "I broke my hip in a fall two years ago. It healed, and I walk normally now without pain. There has been no new injury. What does the term hip fracture mean?", acceptedActions: [...NONURGENT], provenance: "Authored historical and educational negative, not a current fracture." },
  { id: "denied-current-injury", positive: false, message: "I have no hip pain and have not fallen or injured myself. I can stand and walk normally. I read the phrase 'severe hip pain after a fall and unable to bear weight' in a leaflet. Does it describe a possible fracture?", acceptedActions: [...NONURGENT], provenance: "Authored negated-current and quoted-educational negative." },
] as const;

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? filesBelow(join(directory, entry.name)) : entry.name.endsWith(".ts") ? [join(directory, entry.name)] : []).sort();
}
export function buildMobilityManifest(createdAt = new Date().toISOString()) {
  if (GRAPH_VERSION !== "evidence-graph/v23" || !Number.isFinite(Date.parse(createdAt))) throw new Error("V23_BASELINE_REQUIRED");
  const config = resolveGraphConfig({}), settings = graphRequestSettings("safety", config), baseline = graphSafetyInstructions("full");
  if (config.models.safety !== "anthropic/claude-haiku-4-5" || config.safetyStyle !== "full" || baseline.includes(SAFETY_MOBILITY_POLICY.instruction)) throw new Error("UNPROMOTED_FULL_HAIKU_BASELINE_REQUIRED");
  const prompts = { baseline, mobility: baseline + "\n" + SAFETY_MOBILITY_POLICY.instruction };
  const schema = safetySchema.toJSONSchema();
  const cases = MOBILITY_CASES.map(c => ({ ...c, input: JSON.stringify({ patient: c.message }), inputHash: sha256(JSON.stringify({ patient: c.message })) }));
  const schedule = [1, 2].flatMap(trial => cases.flatMap((c, i) => ((trial + i) % 2 ? MOBILITY_ARMS : [...MOBILITY_ARMS].reverse()).map(arm => ({ id: c.id, trial, arm })))).map((item, i) => ({ index: i + 1, ...item }));
  const implementationFiles = [...filesBelow("src"), "scripts/safety-mobility-study.ts", "tests/safety-mobility-study.test.ts", "package.json", "package-lock.json", "data/patient_messages.csv"];
  const payload = {
    protocol: MOBILITY_PROTOCOL, createdAt, graphVersion: GRAPH_VERSION, model: config.models.safety, config, settings,
    implementationHashes: Object.fromEntries(implementationFiles.map(path => [path, sha256(readFileSync(path))])),
    prompts, promptHashes: Object.fromEntries(MOBILITY_ARMS.map(arm => [arm, sha256(prompts[arm])])) as Record<Arm, string>,
    policy: SAFETY_MOBILITY_POLICY, schema, schemaHash: sha256(JSON.stringify(schema)), cases, schedule,
    timeoutMs: EXECUTION_POLICY.modelTimeoutMs, retrieval: "not_used", retries: 0,
    pricing: { inputPerMillionUSD: 1, outputPerMillionUSD: 5, accountingMultiplier: 1.25, schemaEnvelopeReservationBytes: 8192, basis: "Full-rate known token estimate plus 25% accounting contingency; no cache discount. Unknown usage retains the full pre-dispatch reservation. Estimate and reserve, not provider invoice." },
    authorization: { maximumCalls: 28, maximumInclusiveUSD: 1, automaticRetries: 0, allocationSource: "Within the existing $15 verification reserve; not an additional allocation." },
    criteria: { positives: "EMS_NOW with activate_ems after canonical safety admission. ED_NOW is reported separately as emergency setting without target ambulance activation, never silently scored as target agreement.", negatives: "NONE or either preliminary async classification; report actual action. Any emergency or same-day physical action is a counterfactual escalation needing review.", grounding: "Canonical schema, exact literal patient quotations, current/present flags and actionBasis admission only; these structural checks do not establish truth or clinical validity." },
    limitation: "Seven engineering-authored development cases including known C48 and a current caregiver report, two trials per arm. No independent clinical judge or retrieval, no final-answer benefit, no held-out validation, no automatic promotion. Preserve every failed, unfinished and undispatched schedule item.",
  };
  return { ...payload, fingerprint: sha256(JSON.stringify(payload)) };
}
export type MobilityManifest = ReturnType<typeof buildMobilityManifest>;
export function validateMobilityManifest(value: unknown): MobilityManifest {
  if (!value || typeof value !== "object" || !("createdAt" in value) || typeof value.createdAt !== "string") throw new Error("INVALID_MANIFEST");
  const expected = buildMobilityManifest(value.createdAt);
  if (JSON.stringify(value) !== JSON.stringify(expected)) throw new Error("FROZEN_MOBILITY_STUDY_DRIFT");
  return expected;
}
export function mobilityReservation(manifest: MobilityManifest, input: string, arm: Arm): number {
  return ((Buffer.byteLength(input + manifest.prompts[arm] + JSON.stringify(manifest.schema)) + manifest.pricing.schemaEnvelopeReservationBytes) * manifest.pricing.inputPerMillionUSD + manifest.settings.modelSettings.maxOutputTokens * manifest.pricing.outputPerMillionUSD) / 1e6 * manifest.pricing.accountingMultiplier;
}
export function mobilityCost(manifest: MobilityManifest, usage: ModelTransportResult["usage"]): number | null {
  if (usage.inputTokens === null || usage.outputTokens === null || !Number.isFinite(usage.inputTokens) || !Number.isFinite(usage.outputTokens) || usage.inputTokens < 0 || usage.outputTokens < 0) return null;
  return (usage.inputTokens * manifest.pricing.inputPerMillionUSD + usage.outputTokens * manifest.pricing.outputPerMillionUSD) / 1e6 * manifest.pricing.accountingMultiplier;
}
type Entry = MobilityManifest["schedule"][number];
export type MobilityRow = Entry & { status: "completed" | "provider_failed" | "not_dispatched"; inputHash: string; instructionsHash: string; execution: ModelTransportResult | null; admission: ReturnType<typeof assessSafetyAdmission> | null; action: string | null; transport: string | null; matchedAuthoredTarget: boolean; emergencySettingPreserved: boolean; reservationUSD: number; estimatedInclusiveUSD: number | null; accountedUSD: number; failure: string | null };
export function mobilityRow(manifest: MobilityManifest, entry: Entry, execution: ModelTransportResult | null, accountedUSD: number, failure: string | null = null): MobilityRow {
  const c = manifest.cases.find(c => c.id === entry.id)!;
  const admission = execution ? assessSafetyAdmission(execution.failure ? null : execution.output, c.message) : null;
  const action = admission?.admission.proposedAction ?? null;
  const admitted = Boolean(execution && !execution.failure && admission && admission.admission.status !== "rejected");
  const transport = !admitted ? null : action === "EMS_NOW" ? "activate_ems" : action === "ED_NOW" ? "ed_now" : action === "CONTINUE_EMS" ? "continue_ems" : null;
  return { ...entry, status: !execution ? "not_dispatched" : execution.failure ? "provider_failed" : "completed", inputHash: c.inputHash, instructionsHash: manifest.promptHashes[entry.arm], execution, admission, action, transport,
    matchedAuthoredTarget: admitted && (c.acceptedActions as readonly string[]).includes(action!), emergencySettingPreserved: admitted && ["EMS_NOW", "ED_NOW", "CONTINUE_EMS"].includes(action!),
    reservationUSD: execution ? mobilityReservation(manifest, c.input, entry.arm) : 0, estimatedInclusiveUSD: execution ? mobilityCost(manifest, execution.usage) : null, accountedUSD, failure: execution?.failure ?? failure };
}
const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b), i = Math.floor(sorted.length / 2); return !sorted.length ? null : sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2; };
export function summarizeMobility(manifest: MobilityManifest, rows: MobilityRow[]) {
  if (rows.length !== manifest.schedule.length || new Set(rows.map(r => r.index)).size !== rows.length) throw new Error("ALL_SCHEDULE_ROWS_REQUIRED");
  let expectedAccountedUSD = 0, stopped = false;
  for (const row of rows) {
    const planned = manifest.schedule.find(r => r.index === row.index);
    if (!planned || JSON.stringify(planned) !== JSON.stringify({ index: row.index, id: row.id, trial: row.trial, arm: row.arm })) throw new Error("ROW_SCHEDULE_MISMATCH");
    if (JSON.stringify(row) !== JSON.stringify(mobilityRow(manifest, planned, row.execution, row.accountedUSD, row.failure))) throw new Error("ROW_BINDING_OR_OUTCOME_MISMATCH");
    if (!row.execution) { stopped = true; if (!row.failure) throw new Error("UNDISPATCHED_REASON_REQUIRED"); }
    else { if (stopped) throw new Error("DISPATCH_AFTER_STOP"); expectedAccountedUSD += row.estimatedInclusiveUSD ?? row.reservationUSD; }
    if (!Number.isFinite(row.accountedUSD) || Math.abs(expectedAccountedUSD - row.accountedUSD) > 1e-9) throw new Error("ROW_ACCOUNTING_MISMATCH");
  }
  const arms = Object.fromEntries(MOBILITY_ARMS.map(arm => {
    const group = rows.filter(r => r.arm === arm), positive = group.filter(r => manifest.cases.find(c => c.id === r.id)!.positive), negative = group.filter(r => !manifest.cases.find(c => c.id === r.id)!.positive);
    return [arm, { planned: group.length, dispatched: group.filter(r => r.execution).length, providerFailures: group.filter(r => r.status === "provider_failed").length, undispatched: group.filter(r => !r.execution).length,
      admissionRejections: group.filter(r => r.admission?.admission.status === "rejected").length, matchedAuthoredTargets: group.filter(r => r.matchedAuthoredTarget).length,
      positiveEmsMatches: positive.filter(r => r.matchedAuthoredTarget).length, positiveEdOnly: positive.filter(r => r.transport === "ed_now").length,
      negativeCounterfactualEscalations: negative.filter(r => r.execution && !r.execution.failure && r.admission?.admission.status !== "rejected" && !r.matchedAuthoredTarget).length,
      medianMsAllAttempts: median(group.flatMap(r => r.execution?.durationMs === undefined ? [] : [r.execution.durationMs])),
      knownInclusiveUSD: group.reduce((sum, r) => sum + (r.estimatedInclusiveUSD ?? 0), 0), unknownUsageAttempts: group.filter(r => r.execution && r.estimatedInclusiveUSD === null).length }];
  }));
  const pairs = manifest.cases.flatMap(c => [1, 2].map(trial => {
    const baseline = rows.find(r => r.id === c.id && r.trial === trial && r.arm === "baseline")!, mobility = rows.find(r => r.id === c.id && r.trial === trial && r.arm === "mobility")!;
    return { id: c.id, trial, baselineAction: baseline.action, mobilityAction: mobility.action, baselineMatched: baseline.matchedAuthoredTarget, mobilityMatched: mobility.matchedAuthoredTarget,
      baselineFailure: baseline.failure, mobilityFailure: mobility.failure, deltaMs: baseline.execution?.durationMs === undefined || mobility.execution?.durationMs === undefined ? null : mobility.execution.durationMs - baseline.execution.durationMs };
  }));
  return { protocol: manifest.protocol, fingerprint: manifest.fingerprint, arms, pairs, plannedCalls: rows.length, calls: rows.filter(r => r.execution).length,
    accountedUSD: rows.reduce((maximum, row) => Math.max(maximum, row.accountedUSD), 0), clinicalApproval: false, runtimePromotion: "not_promoted", manualRawOutputReviewRequired: true, limitation: manifest.limitation };
}
export async function executeMobilityCall(manifest: MobilityManifest, entry: Entry): Promise<ModelTransportResult> {
  const c = manifest.cases.find(c => c.id === entry.id)!;
  const agent = new Agent({ id: `mobility-${entry.index}`, name: "Rapid care-setting assessor", model: manifest.model as `${string}/${string}`, instructions: manifest.prompts[entry.arm], maxRetries: 0 });
  const deadline = requestDeadline(new AbortController().signal, manifest.timeoutMs);
  return consumeStructuredStream({ signal: deadline.signal, start: abortSignal => agent.stream(c.input, { abortSignal, structuredOutput: { schema: safetyEnvelopeTransport(safetySchema, z.unknown()), errorStrategy: "strict" }, ...graphRequestSettings("safety", manifest.config), tracingOptions: { hideInput: true, hideOutput: true } }) }).finally(() => deadline.dispose());
}
export async function runMobilityRows(manifest: MobilityManifest, execute: typeof executeMobilityCall, write: (name: string, value: unknown) => void) {
  let accountedUSD = 0, stopReason: string | null = null;
  const rows: MobilityRow[] = [];
  for (const entry of manifest.schedule) {
    const c = manifest.cases.find(c => c.id === entry.id)!, reservation = mobilityReservation(manifest, c.input, entry.arm);
    if (!stopReason && accountedUSD + reservation > manifest.authorization.maximumInclusiveUSD) stopReason = "STUDY_ALLOCATION_EXHAUSTED";
    if (stopReason) { const row = mobilityRow(manifest, entry, null, accountedUSD, stopReason); rows.push(row); write(`${entry.index}-result.json`, row); continue; }
    accountedUSD += reservation;
    write(`${entry.index}-started.json`, { ...entry, inputHash: c.inputHash, instructionsHash: manifest.promptHashes[entry.arm], reservationUSD: reservation, accountedUSD, at: new Date().toISOString() });
    let execution: ModelTransportResult;
    const began = performance.now();
    try { execution = await execute(manifest, entry); }
    catch { execution = { output: null, usage: { inputTokens: null, outputTokens: null }, failure: "STUDY_CALL_FAILED", failureDetails: { stage: "study_dispatch", finishReason: null, httpStatus: null }, durationMs: performance.now() - began, transportTimings: { startResolvedMs: null, objectResolvedMs: null, usageResolvedMs: null, finishReasonResolvedMs: null, streamEndMs: null }, cacheUsage: { cachedInputTokens: null, cacheCreationInputTokens: null } }; }
    const cost = mobilityCost(manifest, execution.usage);
    if (cost !== null) accountedUSD += cost - reservation;
    if (cost !== null && cost > reservation + 1e-9) stopReason = "RESERVATION_BOUND_EXCEEDED";
    const row = mobilityRow(manifest, entry, execution, accountedUSD); rows.push(row); write(`${entry.index}-result.json`, row);
    console.log(JSON.stringify({ index: entry.index, id: entry.id, arm: entry.arm, trial: entry.trial, action: row.action, transport: row.transport, matched: row.matchedAuthoredTarget, failure: row.failure, ms: execution.durationMs, accountedUSD }));
  }
  return { ...summarizeMobility(manifest, rows), stopReason };
}
/** Read-only accounting after an interrupted process/write; never re-evaluate
 * archived clinical outputs or treat an unreturned request as a success. */
export function inspectMobilityArtifacts(directory: string) {
  const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")) as MobilityManifest;
  const { fingerprint, ...payload } = manifest;
  if (manifest.protocol !== MOBILITY_PROTOCOL || fingerprint !== sha256(JSON.stringify(payload))) throw new Error("ARCHIVED_MANIFEST_IDENTITY_FAILED");
  const records = manifest.schedule.map(entry => {
    const startPath = join(directory, `${entry.index}-started.json`), resultPath = join(directory, `${entry.index}-result.json`);
    const start = existsSync(startPath) ? JSON.parse(readFileSync(startPath, "utf8")) : null;
    const result = existsSync(resultPath) ? JSON.parse(readFileSync(resultPath, "utf8")) as MobilityRow : null;
    const c = manifest.cases.find(c => c.id === entry.id)!;
    for (const record of [start, result]) if (record && (record.index !== entry.index || record.id !== entry.id || record.trial !== entry.trial || record.arm !== entry.arm || record.inputHash !== c.inputHash || record.instructionsHash !== manifest.promptHashes[entry.arm])) throw new Error("ARCHIVED_ROW_BINDING_FAILED");
    if (result && (!(["completed", "provider_failed", "not_dispatched"] as string[]).includes(result.status)
      || (result.status === "not_dispatched" ? Boolean(start || result.execution) : !start || !result.execution)
      || (result.status === "completed" && result.execution?.failure !== null)
      || (result.status === "provider_failed" && !result.execution?.failure))) throw new Error("ARCHIVED_ROW_STATE_INVALID");
    const reservation = mobilityReservation(manifest, c.input, entry.arm);
    if (start && (!Number.isFinite(start.reservationUSD) || Math.abs(start.reservationUSD - reservation) > 1e-9)) throw new Error("ARCHIVED_RESERVATION_MISMATCH");
    const knownCost = result?.execution ? mobilityCost(manifest, result.execution.usage) : null;
    return { ...entry, state: result ? result.status : start ? "unfinished_started" : "not_dispatched", resultPresent: Boolean(result), startPresent: Boolean(start),
      accountedInclusiveUSD: start ? knownCost ?? reservation : 0, failure: result?.failure ?? (start ? "START_WITHOUT_RESULT" : "NOT_DISPATCHED") };
  });
  return { protocol: manifest.protocol, fingerprint, mode: "read_only_interruption_audit", planned: records.length, startedReservations: records.filter(r => r.startPresent).length,
    unfinishedStarted: records.filter(r => r.state === "unfinished_started").length, missingResults: records.filter(r => !r.resultPresent).length,
    accountedInclusiveUSD: records.reduce((sum, row) => sum + row.accountedInclusiveUSD, 0), records,
    studyComplete: records.every(r => r.resultPresent) && records.every(r => !["unfinished_started", "not_dispatched"].includes(r.state)), clinicalApproval: false, runtimePromotion: "not_promoted",
    limitation: "A start record reserves an attempted request, not proof of provider receipt. Missing results retain full reservations. This inspection cannot approve clinical outputs or repair an interrupted study." };
}
export async function main(args: string[]) {
  const arg = (name: string) => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3), plan = args.includes("--plan"), live = args.includes("--live");
  const inspect = arg("inspect");
  if (inspect) { if (plan || live) throw new Error("INSPECTION_IS_READ_ONLY"); console.log(JSON.stringify(inspectMobilityArtifacts(resolve(inspect)), null, 2)); return; }
  if (plan === live) throw new Error("CHOOSE_PLAN_OR_LIVE");
  const output = arg("output"), manifestPath = arg("manifest");
  if (!output || existsSync(resolve(output))) throw new Error("FRESH_EXPLICIT_OUTPUT_REQUIRED");
  if (live && !manifestPath) throw new Error("FROZEN_MANIFEST_REQUIRED");
  const manifest = plan ? buildMobilityManifest() : validateMobilityManifest(JSON.parse(readFileSync(resolve(manifestPath!), "utf8")));
  if (live && arg("approved-fingerprint") !== manifest.fingerprint) throw new Error("EXACT_MANIFEST_AUTHORIZATION_REQUIRED");
  if (live) {
    if (!process.env.ANTHROPIC_API_KEY && existsSync(".env")) process.env.ANTHROPIC_API_KEY = parseEnv(readFileSync(".env", "utf8")).ANTHROPIC_API_KEY;
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("KEY_MISSING");
    const claim = { fingerprint: manifest.fingerprint, output: resolve(output), authorization: manifest.authorization, at: new Date().toISOString() };
    writeFileSync(resolve("outputs/safety-mobility-v23-2026-09-14.consumed.json"), JSON.stringify(claim, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    writeFileSync(`${resolve(manifestPath!)}.consumed.json`, JSON.stringify(claim, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  }
  mkdirSync(resolve(output), { recursive: true });
  const write = (name: string, value: unknown) => writeFileSync(join(resolve(output), name), JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  write("manifest.json", manifest);
  if (plan) { console.log(JSON.stringify({ output: resolve(output), fingerprint: manifest.fingerprint, plannedCalls: manifest.schedule.length, paidCalls: 0 })); return; }
  try { write("summary.json", await runMobilityRows(manifest, executeMobilityCall, write)); }
  catch (error) {
    // If storage itself failed, the read-only --inspect path still works after
    // recovery; do not risk another paid call to fill the missing records.
    try { write("interruption-summary.json", inspectMobilityArtifacts(resolve(output))); } catch { /* preserve the original failure */ }
    throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
