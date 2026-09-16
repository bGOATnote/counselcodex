import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { assessSafetyAdmission, GRAPH_OUTPUT_LIMITS, GRAPH_VERSION, safetySchema } from "../src/disposition/clinical-graph.ts";
import { graphSafetyInstructions } from "../src/disposition/graph-prompts.ts";
import { consumeStructuredStream, safetyEnvelopeTransport, type ModelTransportResult } from "../src/disposition/transport.ts";
import { EXECUTION_POLICY, requestDeadline } from "../src/disposition/execution-policy.ts";
import { safetyContinuationCases } from "../src/evaluation/continuation-fixtures.ts";
import { sha256 } from "../src/evidence/rag/model.ts";

export const PROTOCOL = "safety-full-schema-serialization/v1";
export const ARMS = ["baseline", "succinct"] as const;
type Arm = typeof ARMS[number];
type Action = z.infer<typeof safetySchema>["action"];
type StudyCase = { id: string; message: string; acceptedActions: Action[]; provenance: string };
export const SERIALIZATION_ONLY = `
SERIALIZATION ECONOMY ONLY: Use the SAME full output schema and ALL preceding clinical, attribution, chronology and admission requirements. Consider the ENTIRE message before selecting evidence, including denials, hypothetical or quoted language, past episodes and another person's symptoms. Do not shorten the reasoning process or relax sufficiency to save text.
Prefer one complete exact quotation when it alone contains the jointly sufficient findings. Include additional complete exact quotations whenever conjunction, attribution, chronology or active-response binding requires them. Do not select unrelated background findings merely to lengthen the record. Keep each interpretation to roughly 4–10 words and reason to one short sentence, usually 8–16 words, without repeating the basis. These are writing targets, not validation limits: preserve every necessary qualifier even if longer.
Retain present/currentPatient flags, explicit selected actionBasis indices and its sufficiency judgment. CONTINUE_EMS still requires the complete exact current-patient/current-episode active activation quote, independent activeEms flags and that same quotation selected in actionBasis. Every other action still uses activeEms=null. Keep all full-schema fields, including patientMessage=""; use physicalRequirement only as already specified. Do not invent a diagnosis, patient fact or negative finding to compress an interpretation. This changes serialization length only, never care setting, transport policy, uncertainty handling or required evidence.`;

export function serializationCases(): StudyCase[] {
  const base = safetyContinuationCases(), ids = ["C02", "C02-active-ems", "C30-airway", "C50-new-neuro", "historical-treated", "quoted-educational", "other-person-history", "C30-hypothetical"];
  const selected = ids.map(id => {
    const item = base.find(c => c.id === id); if (!item) throw new Error("CONTINUATION_CASE_MISSING");
    return { ...item, acceptedActions: (id === "C02-active-ems" ? ["CONTINUE_EMS"] : item.acceptedActions) as Action[], provenance: id === "C02-active-ems" ? "Exact continuation message; target updated to the current v22 CONTINUE_EMS contract, not its historical NONE target." : "Exact safetyContinuationCases message and authored action targets." };
  });
  const c02 = selected.find(c => c.id === "C02")!;
  // Match the exact v22 adherence-study additions; keep targets outside packets.
  return [...selected, ...[
    ["ems-cancelled", " I called 911 but then cancelled the ambulance. The pressure is still here."],
    ["ems-planned", " I am thinking about calling 911 but have not called."],
    ["ems-other-active", " My father has an ambulance coming for him at his own home; nobody has called for me."],
    ["ems-historical", " An ambulance took me to hospital last year. I have not called for this episode."],
  ].map(([id, suffix]) => ({ id, message: c02.message + suffix, acceptedActions: ["EMS_NOW"] as Action[], provenance: "Exact message suffix and target from scripts/safety-adherence-study.ts." }))];
}
export function serializationSchedule(cases: StudyCase[]) {
  return [1, 2].flatMap(trial => cases.flatMap((c, index) => ((index + trial) % 2 ? ARMS : [...ARMS].reverse()).map(arm => ({ id: c.id, trial, arm }))));
}
const implementationFiles = ["scripts/safety-serialization-study.ts", "scripts/safety-adherence-study.ts", "src/evaluation/continuation-fixtures.ts", "src/disposition/clinical-graph.ts", "src/disposition/clinical-policy.ts", "src/disposition/graph-prompts.ts", "src/disposition/transport.ts", "src/disposition/execution-policy.ts", "data/evaluation/physician-system-reference-v2.json", "package-lock.json"];
export function buildSerializationManifest(createdAt = new Date().toISOString()) {
  if (GRAPH_VERSION !== "evidence-graph/v22" || !Number.isFinite(Date.parse(createdAt))) throw new Error("V22_BASELINE_REQUIRED");
  const cases = serializationCases(), baseline = graphSafetyInstructions("full"), schema = safetySchema.toJSONSchema();
  const prompts = { baseline, succinct: baseline + SERIALIZATION_ONLY };
  const manifest = {
    protocol: PROTOCOL, createdAt, graphVersion: GRAPH_VERSION, model: "anthropic/claude-haiku-4-5",
    implementationHashes: Object.fromEntries(implementationFiles.map(path => [path, sha256(readFileSync(path, "utf8"))])),
    prompts, promptHashes: { baseline: sha256(prompts.baseline), succinct: sha256(prompts.succinct) }, schema, schemaHash: sha256(JSON.stringify(schema)),
    settings: { trials: 2, maxSteps: 1, maxRetries: 0, maxOutputTokens: GRAPH_OUTPUT_LIMITS.safety, timeoutMs: EXECUTION_POLICY.modelTimeoutMs, transport: "same full safetySchema with canonical assessSafetyAdmission; no compact schema or normalization" },
    cases: cases.map(c => ({ ...c, input: JSON.stringify({ patient: c.message }), inputHash: sha256(JSON.stringify({ patient: c.message })), targets: c.acceptedActions.map(action => ({ action, transport: action === "EMS_NOW" ? "activate_ems" : action === "CONTINUE_EMS" ? "continue_ems" : action === "ED_NOW" ? "ed_now" : null })) })),
    schedule: serializationSchedule(cases).map((item, i) => ({ index: i + 1, ...item })),
    pricing: { inputPerMillionUSD: 1, outputPerMillionUSD: 5, schemaEnvelopeReservationBytes: 8192, basis: "Same conservative Haiku accounting rates as the preceding safety studies; cache reads/writes remain charged at full input rate here. Estimate, not an invoice; no cache discount inferred." },
    authorization: { totalSprintUSD: 40, priorConservativeAccountedUSD: 22.703963, separatelyReservedGuiUSD: 9.869792, remainingBeforeThisStudyUSD: 7.426245, studyMaximumUSD: 1, maximumCalls: cases.length * 4, retries: 0 },
    limitation: "Engineering-authored development regressions, two trials per case/arm; not held-out clinical validation, final-answer lift or a tail-latency guarantee. Action/transport agreement does not establish the truth of model interpretations. Raw outputs require review. No automatic runtime promotion.",
  };
  return { ...manifest, fingerprint: sha256(JSON.stringify(manifest)) };
}
export type SerializationManifest = ReturnType<typeof buildSerializationManifest>;
export function validateSerializationManifest(value: unknown): SerializationManifest {
  if (!value || typeof value !== "object" || !("createdAt" in value) || typeof value.createdAt !== "string") throw new Error("INVALID_MANIFEST");
  const expected = buildSerializationManifest(value.createdAt);
  if (JSON.stringify(value) !== JSON.stringify(expected)) throw new Error("FROZEN_STUDY_DRIFT");
  return expected;
}
export function serializationReservation(manifest: SerializationManifest, input: string, arm: Arm) {
  return (Buffer.byteLength(input + manifest.prompts[arm] + JSON.stringify(manifest.schema)) + manifest.pricing.schemaEnvelopeReservationBytes) * manifest.pricing.inputPerMillionUSD / 1e6 + manifest.settings.maxOutputTokens * manifest.pricing.outputPerMillionUSD / 1e6;
}
export function serializationCost(manifest: SerializationManifest, usage: ModelTransportResult["usage"]): number | null {
  return usage.inputTokens === null || usage.outputTokens === null ? null : (usage.inputTokens * manifest.pricing.inputPerMillionUSD + usage.outputTokens * manifest.pricing.outputPerMillionUSD) / 1e6;
}
export function claimSerializationStudy(manifestPath: string, directory: string, manifest: SerializationManifest, additionalClaim?: string) {
  const boundClaim = `${resolve(manifestPath)}.consumed.json`, claim = { directory, fingerprint: manifest.fingerprint, claimedAt: new Date().toISOString(), authorization: manifest.authorization };
  if (additionalClaim && existsSync(additionalClaim)) throw new Error("STUDY_AUTHORIZATION_ALREADY_CONSUMED");
  // Every manifest is single-use even if a caller supplies a new output/claim path.
  writeFileSync(boundClaim, JSON.stringify(claim, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  if (additionalClaim && resolve(additionalClaim) !== boundClaim) writeFileSync(additionalClaim, JSON.stringify(claim, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}
type ScheduleEntry = SerializationManifest["schedule"][number];
export type SerializationRow = ScheduleEntry & {
  inputHash: string; instructionsHash: string; execution: ModelTransportResult;
  admission: ReturnType<typeof assessSafetyAdmission>; matchedActionAndTransport: boolean;
  observedTransport: "activate_ems" | "continue_ems" | "ed_now" | null;
  estimatedUSD: number | null; reservationUSD: number; admissionElapsedMs: number;
};
const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b), i = Math.floor(sorted.length / 2); return !sorted.length ? null : sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2; };
export function summarizeSerialization(manifest: SerializationManifest, rows: SerializationRow[]) {
  if (new Set(rows.map(r => r.index)).size !== rows.length) throw new Error("DUPLICATE_STUDY_ATTEMPT");
  for (const r of rows) {
    const planned = manifest.schedule.find(p => p.index === r.index), c = manifest.cases.find(c => c.id === r.id);
    if (!planned || !c || planned.id !== r.id || planned.trial !== r.trial || planned.arm !== r.arm || r.inputHash !== c.inputHash || r.instructionsHash !== manifest.promptHashes[r.arm]) throw new Error("STUDY_PAIR_BINDING_MISMATCH");
  }
  const arms = Object.fromEntries(ARMS.map(arm => {
    const group = rows.filter(r => r.arm === arm), planned = manifest.schedule.filter(p => p.arm === arm).length;
    return [arm, { planned, attempted: group.length, missing: planned - group.length, transportFailures: group.filter(r => r.execution.failure).length, admissionRejections: group.filter(r => r.admission.admission.status === "rejected").length,
      matched: group.filter(r => r.matchedActionAndTransport).length, mismatchesOrFailures: group.filter(r => !r.matchedActionAndTransport).map(r => ({ id: r.id, trial: r.trial, failure: r.execution.failure, action: r.admission.admission.proposedAction, admission: r.admission.admission.code })),
      medianMsAllAttempts: median(group.flatMap(r => r.execution.durationMs === undefined ? [] : [r.execution.durationMs])),
      medianMsMatchedOnly: median(group.flatMap(r => r.matchedActionAndTransport && r.execution.durationMs !== undefined ? [r.execution.durationMs] : [])),
      medianFirstTextMsObserved: median(group.flatMap(r => r.execution.firstTextDeltaMs == null ? [] : [r.execution.firstTextDeltaMs])),
      medianOutputTokensKnown: median(group.flatMap(r => r.execution.usage.outputTokens === null ? [] : [r.execution.usage.outputTokens])),
      knownEstimatedUSD: group.reduce((n, r) => n + (r.estimatedUSD ?? 0), 0), unknownCostAttempts: group.filter(r => r.estimatedUSD === null).length }];
  }));
  const paired = manifest.cases.flatMap(c => [1, 2].map(trial => {
    const baseline = rows.find(r => r.id === c.id && r.trial === trial && r.arm === "baseline"), succinct = rows.find(r => r.id === c.id && r.trial === trial && r.arm === "succinct");
    return { id: c.id, trial, complete: Boolean(baseline && succinct), baselineMatched: baseline?.matchedActionAndTransport ?? null, succinctMatched: succinct?.matchedActionAndTransport ?? null,
      deltaMs: baseline?.execution.durationMs === undefined || succinct?.execution.durationMs === undefined ? null : succinct.execution.durationMs - baseline.execution.durationMs,
      deltaOutputTokens: baseline?.execution.usage.outputTokens == null || succinct?.execution.usage.outputTokens == null ? null : succinct.execution.usage.outputTokens - baseline.execution.usage.outputTokens,
      baselineFailure: baseline?.execution.failure ?? null, succinctFailure: succinct?.execution.failure ?? null };
  }));
  return { arms, paired, medianPairedDeltaMsAllPairedAttempts: median(paired.flatMap(p => p.deltaMs === null ? [] : [p.deltaMs])),
    medianPairedDeltaMsBothMatched: median(paired.flatMap(p => p.baselineMatched && p.succinctMatched && p.deltaMs !== null ? [p.deltaMs] : [])),
    missingSchedule: manifest.schedule.filter(p => !rows.some(r => r.index === p.index)), runtimePromotion: "not_promoted", clinicalApproval: false, manualInterpretationReviewRequired: true, limitation: manifest.limitation };
}

export async function main(args: string[]) {
  const plan = args.includes("--plan"), live = args.includes("--live"), arg = (key: string) => args.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3);
  if (plan === live) throw new Error("CHOOSE_EXACTLY_ONE_PLAN_OR_LIVE");
  const output = arg("output"); if (!output || existsSync(resolve(output))) throw new Error("FRESH_EXPLICIT_OUTPUT_REQUIRED");
  const directory = resolve(output), manifestPath = arg("manifest");
  if (live && !manifestPath) throw new Error("FROZEN_MANIFEST_REQUIRED");
  const manifest = plan ? buildSerializationManifest() : validateSerializationManifest(JSON.parse(readFileSync(resolve(manifestPath!), "utf8")));
  if (live && !process.env.ANTHROPIC_API_KEY && existsSync(".env")) process.env.ANTHROPIC_API_KEY = parseEnv(readFileSync(".env", "utf8")).ANTHROPIC_API_KEY;
  if (live && !process.env.ANTHROPIC_API_KEY) throw new Error("KEY_MISSING");
  mkdirSync(directory, { recursive: true });
  const write = (name: string, value: unknown) => writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  write("manifest.json", manifest);
  if (plan) { console.log(JSON.stringify({ directory, plannedCalls: manifest.authorization.maximumCalls, paidCalls: 0, fingerprint: manifest.fingerprint })); return; }
  claimSerializationStudy(manifestPath!, directory, manifest, arg("claim"));
  let accountedUSD = 0, calls = 0, stopReason: string | null = null;
  const rows: SerializationRow[] = [];
  try {
    for (const item of manifest.schedule) {
      const c = manifest.cases.find(c => c.id === item.id)!, reservation = serializationReservation(manifest, c.input, item.arm);
      if (accountedUSD + reservation > manifest.authorization.studyMaximumUSD) { stopReason = "STUDY_ALLOCATION_EXHAUSTED"; break; }
      const agent = new Agent({ id: `serialization-${item.arm}-${item.index}`, name: "Rapid care-setting assessor", model: manifest.model as `${string}/${string}`, instructions: manifest.prompts[item.arm], maxRetries: 0 });
      accountedUSD += reservation; calls++;
      write(`${item.index}-started.json`, { ...item, input: c.input, inputHash: c.inputHash, instructionsHash: manifest.promptHashes[item.arm], schemaHash: manifest.schemaHash, reservationUSD: reservation, accountedUSD, at: new Date().toISOString() });
      const began = performance.now(), deadline = requestDeadline(new AbortController().signal, manifest.settings.timeoutMs);
      const execution = await consumeStructuredStream({ signal: deadline.signal, start: abortSignal => agent.stream(c.input, { abortSignal, structuredOutput: { schema: safetyEnvelopeTransport(safetySchema, z.unknown()), errorStrategy: "strict" }, maxSteps: 1, modelSettings: { maxOutputTokens: manifest.settings.maxOutputTokens, maxRetries: 0 }, tracingOptions: { hideInput: true, hideOutput: true } }) }).finally(() => deadline.dispose());
      const admission = assessSafetyAdmission(execution.failure ? null : execution.output, c.message), admissionElapsedMs = Math.round(performance.now() - began);
      const estimatedUSD = serializationCost(manifest, execution.usage);
      if (estimatedUSD !== null) accountedUSD += estimatedUSD - reservation;
      const action = admission.admission.proposedAction, observedTransport = admission.admission.status !== "admitted" ? null : action === "EMS_NOW" ? "activate_ems" : action === "CONTINUE_EMS" ? "continue_ems" : action === "ED_NOW" ? "ed_now" : null;
      const row: SerializationRow = { ...item, inputHash: c.inputHash, instructionsHash: manifest.promptHashes[item.arm], execution, admission, observedTransport,
        matchedActionAndTransport: !execution.failure && admission.admission.status !== "rejected" && c.targets.some(t => t.action === action && t.transport === observedTransport), estimatedUSD, reservationUSD: reservation, admissionElapsedMs };
      rows.push(row); write(`${item.index}-result.json`, { ...row, accountedUSD });
      console.log(JSON.stringify({ ...item, failure: execution.failure, action, observedTransport, matched: row.matchedActionAndTransport, durationMs: execution.durationMs, estimatedUSD, accountedUSD }));
    }
  } catch (error) { stopReason = "STUDY_INTERRUPTED"; throw error; }
  finally {
    write("summary.json", { protocol: PROTOCOL, fingerprint: manifest.fingerprint, calls, plannedCalls: manifest.schedule.length, accountedUSD, stopReason,
      priorConservativeAccountedUSD: manifest.authorization.priorConservativeAccountedUSD, separatelyReservedGuiUSD: manifest.authorization.separatelyReservedGuiUSD,
      remainingSprintExcludingReservedGuiUSD: manifest.authorization.remainingBeforeThisStudyUSD - accountedUSD,
      unfinishedStartedAttempts: calls - rows.length, ...summarizeSerialization(manifest, rows) });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
