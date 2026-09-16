import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { assessSafetyAdmission, GRAPH_VERSION, graphRequestSettings, safetySchema } from "../src/disposition/clinical-graph.ts";
import { resolveGraphConfig } from "../src/disposition/graph-config.ts";
import { graphSafetyInstructions } from "../src/disposition/graph-prompts.ts";
import { quoteSpans } from "../src/disposition/source-quote-refs.ts";
import { consumeStructuredStream, safetyEnvelopeTransport, type ModelTransportResult } from "../src/disposition/transport.ts";
import { EXECUTION_POLICY, requestDeadline } from "../src/disposition/execution-policy.ts";
import { safetyContinuationCases } from "../src/evaluation/continuation-fixtures.ts";
import { sha256 } from "../src/evidence/rag/model.ts";

// Experimental adapter only. The production safety call does not import this file.
export const REFERENCE_PROTOCOL = "safety-patient-reference-fixed-packet/v1";
export const REFERENCE_ARMS = ["baseline", "references"] as const;
type Arm = typeof REFERENCE_ARMS[number];
const quoteId = z.string().regex(/^q(?:0|[1-9][0-9]*)$/);
export const safetyReferenceSchema = safetySchema.extend({
  basis: z.array(safetySchema.shape.basis.element.omit({ quote: true }).extend({ quoteId }).strict()).max(12),
  activeEms: safetySchema.shape.activeEms.removeDefault().unwrap().omit({ quote: true }).extend({ quoteId }).strict().nullable().default(null),
}).strict();
export const REFERENCE_INSTRUCTIONS = `PATIENT QUOTATION SERIALIZATION ONLY: The complete ORIGINAL patient message remains in patient; quoteSpans lists deterministic exact spans of that same message. Wherever this schema asks for quoteId, SELECT the matching quoteSpans id instead of copying a quote. This applies to basis and activeEms. The server resolves each id to that exact unchanged patient span; no fuzzy matching or inference is performed. Consider the ENTIRE original message, not only selected spans, including denials, historical/conditional wording and attribution. A sentence can contain both a reported symptom and a contextual qualifier: selecting its id does not establish that the symptom is current or belongs to the patient. Independently retain every interpretation, present/currentPatient flag, actionBasis index/sufficiency decision, reason, patientMessage, physicalRequirement and activeEms currentPatient/currentEpisode/active flag. CONTINUE_EMS requires the same complete activation span id in activeEms and its selected basis item, with all existing current/active checks. Do not infer those flags from successful reference lookup. NONE and async actionBasis rules remain unchanged. Do not add a quote field or paraphrase a span. This changes wire serialization and selectable span granularity only, not the clinical policy, action, transport, or required contextual evidence.`;

export function resolveSafetyReferences(raw: unknown, patient: string, expectedPatientHash: string) {
  if (sha256(patient) !== expectedPatientHash) throw new Error("PATIENT_INPUT_BINDING_FAILED");
  const wire = safetyReferenceSchema.parse(raw), spans = quoteSpans(patient);
  const resolvedReferences: { path: string; quoteId: string; start: number; end: number; quoteHash: string }[] = [];
  function lookup(id: string, path: string) {
    const span = spans.find(s => s.id === id);
    if (!span || span.text.length < 3 || patient.slice(span.start, span.end) !== span.text) throw new Error("INVALID_PATIENT_QUOTE_REFERENCE");
    resolvedReferences.push({ path, quoteId: id, start: span.start, end: span.end, quoteHash: sha256(span.text) });
    return span.text;
  }
  const output = safetySchema.parse({ ...wire,
    basis: wire.basis.map(({ quoteId: id, ...rest }, i) => ({ ...rest, quote: lookup(id, `basis[${i}].quote`) })),
    activeEms: wire.activeEms ? (() => { const { quoteId: id, ...rest } = wire.activeEms; return { ...rest, quote: lookup(id, "activeEms.quote") }; })() : null,
  });
  return { output, audit: { protocol: REFERENCE_PROTOCOL, patientHash: expectedPatientHash, rawWireHash: sha256(JSON.stringify(raw)), resolvedHash: sha256(JSON.stringify(output)), resolvedReferences, clinicalApproval: false } };
}
export function referenceCases() {
  const c35 = { id: "C35", message: "58M. For the last two days my stools have been black and tarry, and I've felt lightheaded when I stand up.", acceptedActions: ["ED_NOW"], provenance: "Exact supplied C35 development message. Observed omitted-I copying failure motivated this serialization experiment; not held out." };
  if (!readFileSync("data/patient_messages.csv", "utf8").includes(c35.message)) throw new Error("C35_ORIGINAL_MESSAGE_CHANGED");
  const existing = safetyContinuationCases();
  return [c35, ...["C02-active-ems", "quoted-educational", "historical-treated", "other-person-history", "C30-hypothetical"].map(id => {
    const c = existing.find(c => c.id === id)!;
    return { ...c, acceptedActions: id === "C02-active-ems" ? ["CONTINUE_EMS"] : c.acceptedActions,
      provenance: "Exact existing safetyContinuationCases patient text; current CONTINUE_EMS target replaces historical NONE only for active response. Engineering target, not clinical validation." };
  })];
}
function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(e => e.isDirectory() ? filesBelow(join(directory, e.name)) : e.name.endsWith(".ts") ? [join(directory, e.name)] : []).sort();
}
export function buildReferenceManifest(createdAt = new Date().toISOString()) {
  if (GRAPH_VERSION !== "evidence-graph/v23" || !Number.isFinite(Date.parse(createdAt))) throw new Error("V23_BASELINE_REQUIRED");
  const config = resolveGraphConfig({}), settings = graphRequestSettings("safety", config);
  if (config.models.safety !== "anthropic/claude-haiku-4-5" || config.safetyStyle !== "full") throw new Error("FULL_HAIKU_BASELINE_REQUIRED");
  const baseline = graphSafetyInstructions("full"), prompts = { baseline, references: baseline + "\n" + REFERENCE_INSTRUCTIONS };
  const schemas = { baseline: safetySchema.toJSONSchema(), references: safetyReferenceSchema.toJSONSchema() };
  const cases = referenceCases().map(c => {
    const inputs = { baseline: JSON.stringify({ patient: c.message }), references: JSON.stringify({ patient: c.message, quoteSpans: quoteSpans(c.message).map(({ id, text }) => ({ id, text })) }) };
    return { ...c, patientHash: sha256(c.message), inputs, inputHashes: Object.fromEntries(REFERENCE_ARMS.map(a => [a, sha256(inputs[a])])) as Record<Arm, string> };
  });
  const schedule = [1, 2].flatMap(trial => cases.flatMap((c, i) => ((trial + i) % 2 ? REFERENCE_ARMS : [...REFERENCE_ARMS].reverse()).map(arm => ({ id: c.id, trial, arm })))).map((row, i) => ({ index: i + 1, ...row }));
  const paths = [...filesBelow("src"), "scripts/safety-reference-study.ts", "tests/safety-reference-study.test.ts", "package.json", "package-lock.json", "data/patient_messages.csv", "data/evaluation/physician-system-reference-v2.json"];
  const payload = { protocol: REFERENCE_PROTOCOL, createdAt, graphVersion: GRAPH_VERSION, model: config.models.safety, config, settings,
    implementationHashes: Object.fromEntries(paths.map(path => [path, sha256(readFileSync(path))])),
    prompts, promptHashes: Object.fromEntries(REFERENCE_ARMS.map(a => [a, sha256(prompts[a])])) as Record<Arm, string>,
    schemas, schemaHashes: Object.fromEntries(REFERENCE_ARMS.map(a => [a, sha256(JSON.stringify(schemas[a]))])) as Record<Arm, string>, cases, schedule,
    segmenter: { algorithm: "source-quote-refs.ts quoteSpans; Intl.Segmenter(en,sentence), max580-char pieces", node: process.versions.node, icu: process.versions.icu },
    timeoutMs: EXECUTION_POLICY.modelTimeoutMs, retrieval: "not_used", retries: 0,
    pricing: { inputPerMillionUSD: 1, outputPerMillionUSD: 5, accountingMultiplier: 1.25, schemaEnvelopeReservationBytes: 8192, basis: "Known full-rate token estimate plus 25% contingency, no cache discount. Unknown usage retains complete pre-call reservation. Not a provider invoice." },
    authorization: { maximumCalls: 24, maximumInclusiveUSD: 0.90, automaticRetries: 0, allocationSource: "Previously unallocated sprint capacity: prior completed81.008177775 + GUIreserve18 + this maximum0.90 =99.908177775. Not an added budget." },
    acceptance: { action: "Report exact action and typed transport separately. Authored C35 target ED_NOW; EMS is stronger emergency action, not exact target agreement. C02 active-response target CONTINUE_EMS, not duplicate activation. Any new negative-case physical/emergency escalation is a regression requiring review.", serialization: "Complete provider success, full canonical schema, original literal quote identity, unchanged contextual actionBasis/activeEMS admission. Lookup is not semantic evidence or clinical approval.", promotion: "No automatic promotion. Independent review of all raw paired outputs and contextual flags, no action/transport regression, and measured improvement in exact admission required before proposing runtime use." },
    limitation: "Six development cases selected for a known copying failure and context negatives, two trials each. Sentence references change selectable granularity and may combine qualifiers; full input retained. No retrieval, independent clinical judge, final-answer benefit or held-out clinical accuracy claim. All failed, unfinished and undispatched rows remain in denominator.",
  };
  return { ...payload, fingerprint: sha256(JSON.stringify(payload)) };
}
export type ReferenceManifest = ReturnType<typeof buildReferenceManifest>;
type Entry = ReferenceManifest["schedule"][number];
export function validateReferenceManifest(value: unknown) {
  if (!value || typeof value !== "object" || !("createdAt" in value) || typeof value.createdAt !== "string") throw new Error("INVALID_MANIFEST");
  const expected = buildReferenceManifest(value.createdAt);
  if (JSON.stringify(value) !== JSON.stringify(expected)) throw new Error("FROZEN_REFERENCE_STUDY_DRIFT");
  return expected;
}
export function referenceReservation(m: ReferenceManifest, e: Entry) {
  const c = m.cases.find(c => c.id === e.id)!;
  return ((Buffer.byteLength(c.inputs[e.arm] + m.prompts[e.arm] + JSON.stringify(m.schemas[e.arm])) + m.pricing.schemaEnvelopeReservationBytes) * m.pricing.inputPerMillionUSD + m.settings.modelSettings.maxOutputTokens * m.pricing.outputPerMillionUSD) / 1e6 * m.pricing.accountingMultiplier;
}
export function referenceCost(m: ReferenceManifest, usage: ModelTransportResult["usage"]) {
  if (usage.inputTokens === null || usage.outputTokens === null || !Number.isFinite(usage.inputTokens) || !Number.isFinite(usage.outputTokens) || usage.inputTokens < 0 || usage.outputTokens < 0) return null;
  return (usage.inputTokens * m.pricing.inputPerMillionUSD + usage.outputTokens * m.pricing.outputPerMillionUSD) / 1e6 * m.pricing.accountingMultiplier;
}
export function referenceRow(m: ReferenceManifest, e: Entry, execution: ModelTransportResult | null, accountedUSD: number, failure: string | null = null) {
  const c = m.cases.find(c => c.id === e.id)!;
  let output: z.infer<typeof safetySchema> | null = null, referenceAudit: ReturnType<typeof resolveSafetyReferences>["audit"] | null = null, serializationFailure: string | null = null;
  if (execution && !execution.failure) {
    try {
      if (e.arm === "references") ({ output, audit: referenceAudit } = resolveSafetyReferences(execution.output, c.message, c.patientHash));
      else output = safetySchema.parse(execution.output);
    } catch { serializationFailure = "INVALID_SAFETY_SERIALIZATION"; }
  }
  const admission = execution ? assessSafetyAdmission(output, c.message) : null;
  const literalIdentity = output ? output.basis.every(b => c.message.includes(b.quote)) && (!output.activeEms || c.message.includes(output.activeEms.quote)) : false;
  const action = output?.action ?? null, admitted = Boolean(output && !execution?.failure && literalIdentity && admission?.admission.status !== "rejected");
  const transport = !admitted ? null : action === "EMS_NOW" ? "activate_ems" : action === "CONTINUE_EMS" ? "continue_ems" : action === "ED_NOW" ? "ed_now" : null;
  return { ...e, status: !execution ? "not_dispatched" : execution.failure ? "provider_failed" : "completed", inputHash: c.inputHashes[e.arm], patientHash: c.patientHash, instructionsHash: m.promptHashes[e.arm],
    execution, output, referenceAudit, serializationFailure, admission, literalIdentity, action, transport,
    matchedAuthoredTarget: admitted && c.acceptedActions.includes(action!), emergencySettingPreserved: admitted && ["EMS_NOW", "ED_NOW", "CONTINUE_EMS"].includes(action!),
    reservationUSD: execution ? referenceReservation(m, e) : 0, estimatedInclusiveUSD: execution ? referenceCost(m, execution.usage) : null, accountedUSD, failure: execution?.failure ?? failure };
}
export type ReferenceRow = ReturnType<typeof referenceRow>;
function median(values: number[]) { const s = values.sort((a, b) => a - b), i = Math.floor(s.length / 2); return !s.length ? null : s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; }
export function summarizeReference(m: ReferenceManifest, rows: ReferenceRow[]) {
  if (rows.length !== m.schedule.length) throw new Error("ALL_SCHEDULE_ROWS_REQUIRED");
  let spent = 0, stopped = false;
  rows.forEach((row, i) => {
    const planned = m.schedule[i];
    if (JSON.stringify(row) !== JSON.stringify(referenceRow(m, planned, row.execution, row.accountedUSD, row.failure))) throw new Error("ROW_BINDING_OR_OUTCOME_MISMATCH");
    if (!row.execution) { stopped = true; if (!row.failure) throw new Error("UNDISPATCHED_REASON_REQUIRED"); }
    else { if (stopped) throw new Error("DISPATCH_AFTER_STOP"); spent += row.estimatedInclusiveUSD ?? row.reservationUSD; }
    if (!Number.isFinite(row.accountedUSD) || Math.abs(spent - row.accountedUSD) > 1e-9) throw new Error("ROW_ACCOUNTING_MISMATCH");
  });
  const arms = Object.fromEntries(REFERENCE_ARMS.map(arm => {
    const r = rows.filter(r => r.arm === arm);
    return [arm, { planned: r.length, dispatched: r.filter(r => r.execution).length, providerFailures: r.filter(r => r.status === "provider_failed").length, undispatched: r.filter(r => !r.execution).length,
      canonicalSchemaSuccess: r.filter(r => r.output).length, literalIdentitySuccess: r.filter(r => r.literalIdentity).length, admissionRejections: r.filter(r => r.admission?.admission.status === "rejected").length,
      matchedAuthoredTargets: r.filter(r => r.matchedAuthoredTarget).length,
      negativeCounterfactualEscalations: r.filter(r => !["C35", "C02-active-ems"].includes(r.id) && ["SAME_DAY_IN_PERSON", "ED_NOW", "EMS_NOW", "CONTINUE_EMS"].includes(r.action ?? "") && r.literalIdentity && r.admission?.admission.status === "admitted").length,
      actionCounts: Object.fromEntries(safetySchema.shape.action.options.map(action => [action, r.filter(row => row.action === action).length])),
      admissionCounts: Object.fromEntries(["admitted", "not_requested", "rejected", "undispatched"].map(status => [status, r.filter(row => (row.admission?.admission.status ?? "undispatched") === status).length])),
      medianMsAllAttempts: median(r.flatMap(r => r.execution?.durationMs === undefined ? [] : [r.execution.durationMs])), knownInclusiveUSD: r.reduce((s, r) => s + (r.estimatedInclusiveUSD ?? 0), 0), unknownUsageAttempts: r.filter(r => r.execution && r.estimatedInclusiveUSD === null).length }];
  }));
  const pairs = m.cases.flatMap(c => [1, 2].map(trial => {
    const a = rows.find(r => r.id === c.id && r.trial === trial && r.arm === "baseline")!, b = rows.find(r => r.id === c.id && r.trial === trial && r.arm === "references")!;
    return { id: c.id, trial, baselineAction: a.action, referenceAction: b.action, baselineTransport: a.transport, referenceTransport: b.transport, baselineMatched: a.matchedAuthoredTarget, referenceMatched: b.matchedAuthoredTarget,
      baselineFailure: a.failure ?? a.serializationFailure, referenceFailure: b.failure ?? b.serializationFailure, deltaMs: a.execution?.durationMs === undefined || b.execution?.durationMs === undefined ? null : b.execution.durationMs - a.execution.durationMs };
  }));
  return { protocol: m.protocol, fingerprint: m.fingerprint, plannedCalls: rows.length, calls: rows.filter(r => r.execution).length, accountedUSD: spent, arms, pairs, clinicalApproval: false, runtimePromotion: "not_promoted", manualRawOutputReviewRequired: true, limitation: m.limitation };
}
export async function executeReferenceCall(m: ReferenceManifest, e: Entry): Promise<ModelTransportResult> {
  const c = m.cases.find(c => c.id === e.id)!, schema = e.arm === "baseline" ? safetySchema : safetyReferenceSchema;
  const agent = new Agent({ id: `safety-reference-${e.index}`, name: "Rapid care-setting assessor", model: m.model as `${string}/${string}`, instructions: m.prompts[e.arm], maxRetries: 0 });
  const deadline = requestDeadline(new AbortController().signal, m.timeoutMs);
  return consumeStructuredStream({ signal: deadline.signal, start: abortSignal => agent.stream(c.inputs[e.arm], { abortSignal, structuredOutput: { schema: safetyEnvelopeTransport(schema, z.unknown()), errorStrategy: "strict" }, ...graphRequestSettings("safety", m.config), tracingOptions: { hideInput: true, hideOutput: true } }) }).finally(() => deadline.dispose());
}
export async function runReferenceRows(m: ReferenceManifest, execute: typeof executeReferenceCall, write: (name: string, value: unknown) => void) {
  let accountedUSD = 0, stopReason: string | null = null;
  const rows: ReferenceRow[] = [];
  for (const e of m.schedule) {
    const c = m.cases.find(c => c.id === e.id)!, reservation = referenceReservation(m, e);
    if (!stopReason && accountedUSD + reservation > m.authorization.maximumInclusiveUSD) stopReason = "STUDY_ALLOCATION_EXHAUSTED";
    if (stopReason) { const row = referenceRow(m, e, null, accountedUSD, stopReason); rows.push(row); write(`${e.index}-result.json`, row); continue; }
    accountedUSD += reservation;
    write(`${e.index}-started.json`, { ...e, inputHash: c.inputHashes[e.arm], patientHash: c.patientHash, instructionsHash: m.promptHashes[e.arm], reservationUSD: reservation, accountedUSD, at: new Date().toISOString() });
    let execution: ModelTransportResult;
    const began = performance.now();
    try { execution = await execute(m, e); }
    catch { execution = { output: null, usage: { inputTokens: null, outputTokens: null }, failure: "STUDY_CALL_FAILED", failureDetails: { stage: "study_dispatch", finishReason: null, httpStatus: null }, durationMs: performance.now() - began, transportTimings: { startResolvedMs: null, objectResolvedMs: null, usageResolvedMs: null, finishReasonResolvedMs: null, streamEndMs: null }, cacheUsage: { cachedInputTokens: null, cacheCreationInputTokens: null } }; }
    const cost = referenceCost(m, execution.usage);
    if (cost !== null) accountedUSD += cost - reservation;
    if (cost !== null && cost > reservation + 1e-9) stopReason = "RESERVATION_BOUND_EXCEEDED";
    const row = referenceRow(m, e, execution, accountedUSD); rows.push(row); write(`${e.index}-result.json`, row);
    console.log(JSON.stringify({ index: e.index, id: e.id, arm: e.arm, trial: e.trial, action: row.action, transport: row.transport, matched: row.matchedAuthoredTarget, failure: row.failure ?? row.serializationFailure, ms: execution.durationMs, accountedUSD }));
  }
  return { ...summarizeReference(m, rows), stopReason };
}
/** Read only: a started request without a result keeps its entire reservation. */
export function inspectReferenceArtifacts(directory: string) {
  const m = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")) as ReferenceManifest, { fingerprint, ...payload } = m;
  if (m.protocol !== REFERENCE_PROTOCOL || sha256(JSON.stringify(payload)) !== fingerprint) throw new Error("ARCHIVED_MANIFEST_IDENTITY_FAILED");
  const rows = m.schedule.map(e => {
    const startPath = join(directory, `${e.index}-started.json`), resultPath = join(directory, `${e.index}-result.json`);
    const start = existsSync(startPath) ? JSON.parse(readFileSync(startPath, "utf8")) : null, result = existsSync(resultPath) ? JSON.parse(readFileSync(resultPath, "utf8")) as ReferenceRow : null;
    const c = m.cases.find(c => c.id === e.id)!;
    for (const row of [start, result]) if (row && (row.index !== e.index || row.id !== e.id || row.trial !== e.trial || row.arm !== e.arm || row.inputHash !== c.inputHashes[e.arm] || row.patientHash !== c.patientHash || row.instructionsHash !== m.promptHashes[e.arm])) throw new Error("ARCHIVED_ROW_BINDING_FAILED");
    if (result && (!["completed", "provider_failed", "not_dispatched"].includes(result.status) || (result.status === "not_dispatched" ? Boolean(start || result.execution) : !start || !result.execution)
      || (result.status === "completed" && result.execution?.failure !== null) || (result.status === "provider_failed" && !result.execution?.failure))) throw new Error("ARCHIVED_ROW_STATE_INVALID");
    const reservation = referenceReservation(m, e);
    if (start && (!Number.isFinite(start.reservationUSD) || Math.abs(start.reservationUSD - reservation) > 1e-9)) throw new Error("ARCHIVED_RESERVATION_MISMATCH");
    return { ...e, state: result ? result.status : start ? "unfinished_started" : "not_dispatched", resultPresent: Boolean(result), startPresent: Boolean(start), accountedInclusiveUSD: start ? (result?.execution ? referenceCost(m, result.execution.usage) : null) ?? reservation : 0 };
  });
  return { protocol: m.protocol, fingerprint, mode: "read_only_interruption_audit", planned: rows.length, startedReservations: rows.filter(r => r.startPresent).length, unfinishedStarted: rows.filter(r => r.state === "unfinished_started").length,
    accountedInclusiveUSD: rows.reduce((s, r) => s + r.accountedInclusiveUSD, 0), studyComplete: rows.every(r => r.resultPresent && !["not_dispatched", "unfinished_started"].includes(r.state)), rows, clinicalApproval: false, runtimePromotion: "not_promoted" };
}
export async function main(args: string[]) {
  const arg = (name: string) => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3), plan = args.includes("--plan"), live = args.includes("--live"), inspect = arg("inspect");
  if (inspect) { if (plan || live) throw new Error("INSPECTION_IS_READ_ONLY"); console.log(JSON.stringify(inspectReferenceArtifacts(resolve(inspect)), null, 2)); return; }
  if (plan === live) throw new Error("CHOOSE_PLAN_OR_LIVE");
  const output = arg("output"), manifestPath = arg("manifest");
  if (!output || existsSync(resolve(output))) throw new Error("FRESH_EXPLICIT_OUTPUT_REQUIRED");
  if (live && !manifestPath) throw new Error("FROZEN_MANIFEST_REQUIRED");
  const m = plan ? buildReferenceManifest() : validateReferenceManifest(JSON.parse(readFileSync(resolve(manifestPath!), "utf8")));
  if (m.schedule.reduce((s, e) => s + referenceReservation(m, e), 0) > m.authorization.maximumInclusiveUSD) throw new Error("ALL_UNKNOWN_RESERVATIONS_EXCEED_ALLOCATION");
  if (live && arg("approved-fingerprint") !== m.fingerprint) throw new Error("EXACT_MANIFEST_AUTHORIZATION_REQUIRED");
  if (live) {
    if (!process.env.ANTHROPIC_API_KEY && existsSync(".env")) process.env.ANTHROPIC_API_KEY = parseEnv(readFileSync(".env", "utf8")).ANTHROPIC_API_KEY;
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("KEY_MISSING");
    const claim = { fingerprint: m.fingerprint, output: resolve(output), authorization: m.authorization, at: new Date().toISOString() };
    writeFileSync(resolve("outputs/safety-reference-v23-2026-09-14.consumed.json"), JSON.stringify(claim, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    writeFileSync(`${resolve(manifestPath!)}.consumed.json`, JSON.stringify(claim, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  }
  mkdirSync(resolve(output), { recursive: true });
  const write = (name: string, value: unknown) => writeFileSync(join(resolve(output), name), JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  write("manifest.json", m);
  if (plan) { console.log(JSON.stringify({ output: resolve(output), fingerprint: m.fingerprint, plannedCalls: m.schedule.length, allUnknownReserveUSD: m.schedule.reduce((s, e) => s + referenceReservation(m, e), 0), paidCalls: 0 })); return; }
  try { write("summary.json", await runReferenceRows(m, executeReferenceCall, write)); }
  catch (error) { try { write("interruption-summary.json", inspectReferenceArtifacts(resolve(output))); } catch { /* no paid recovery */ } throw error; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
