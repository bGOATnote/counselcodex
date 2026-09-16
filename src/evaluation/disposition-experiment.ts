import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync, fsyncSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { routes, type DispositionRun, type WorkflowProfile, type ResponseEvent } from "../disposition/contract.ts";
import { responseEventSchema } from "../disposition/progressive.ts";
import { digest, type EvidenceSearchResult } from "../evidence/search.ts";
import { operationalRoute, operationalRoutes, ROUTING_POLICY_VERSION } from "../disposition/routing-policy.ts";

export const EXPERIMENT_VERSION = "disposition-workflow-comparison/v3";
export const ARMS = ["base-opus", "adaptive-no-retrieval", "adaptive-opus", "adaptive-critique"] as const satisfies readonly WorkflowProfile[];
export const experimentCaseSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/), message: z.string().min(1).max(12_000),
  familyId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/).optional(),
  reference: z.object({
    status: z.enum(["clinician_adjudicated", "development_expectation"]),
    provenance: z.string().min(8).max(500), acceptedRoutes: z.array(z.enum(routes)).min(1).max(4),
    emergency: z.boolean(),
    // Optional only for reading older, coarse references. Never infer async
    // priority from a legacy label and count that inference as physician truth.
    acceptedOperationalRoutes: z.array(z.enum(operationalRoutes)).min(1).max(5).optional(),
    rationale: z.string().min(15).max(1500).optional(),
    policyVersion: z.string().min(1).max(100).optional(),
  }).strict().superRefine((r, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (!(r.emergency ? r.acceptedRoutes.every(s => s === "EMERGENCY_NOW") : !r.acceptedRoutes.includes("EMERGENCY_NOW"))) fail("Emergency strata must agree with accepted routes");
    if (new Set(r.acceptedRoutes).size !== r.acceptedRoutes.length) fail("Duplicate reference routes");
    if (r.acceptedOperationalRoutes) {
      const projected = [...new Set(r.acceptedOperationalRoutes.map(s => s.endsWith("_ASYNC") ? "ASYNC_PHYSICIAN" : s))].sort();
      if (digest(projected) !== digest([...r.acceptedRoutes].sort())) fail("Operational and legacy routes conflict");
      if (new Set(r.acceptedOperationalRoutes).size !== r.acceptedOperationalRoutes.length || !r.rationale || !r.policyVersion) fail("Operational reference needs unique routes, rationale and policy version");
    }
  }).optional(),
}).strict();
export type ExperimentCase = z.infer<typeof experimentCaseSchema>;
export function parseExperimentCases(jsonl: string): ExperimentCase[] {
  if (Buffer.byteLength(jsonl) > 30_000_000) throw new Error("DATASET_TOO_LARGE");
  const cases = jsonl.split(/\r?\n/).filter(Boolean).map((line) => experimentCaseSchema.parse(JSON.parse(line)));
  if (!cases.length || cases.length > 10_000 || new Set(cases.map((c) => c.id)).size !== cases.length) throw new Error("INVALID_CASE_IDS_OR_COUNT");
  return cases;
}
export function experimentManifest(cases: ExperimentCase[], fingerprint: string, repetitions = 1, execution: "simulated" | "provider" = "provider") {
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 10 || !fingerprint) throw new Error("INVALID_EXPERIMENT_CONFIG");
  return { version: EXPERIMENT_VERSION, datasetHash: digest(cases), inferenceHash: digest(cases.map(({ id,message }) => ({ id,message }))), fingerprint, repetitions, execution, arms: ARMS,
    maximumModelCalls: cases.length * repetitions * 8, // 1 + 2 + 2 + 3; no retries
    ordering: "deterministic constrained rotation; not a balanced Latin design because retrieval precedes critique",
    design: "Whole-workflow comparison, not isolated component lift. Critique resamples planner/draft and replays frozen passages without repeating live search latency.",
    migration: "v1 reports remain immutable. Use a new output directory; v1 latency/pooled confidence intervals are not upgraded or retrospectively certified.",
    referencePolicy: "Supplied dispositions are not clinical truth. Reference status/provenance is declared by the dataset author and must be audited.",
    routingPolicy: ROUTING_POLICY_VERSION,
    primaryOutcomes: ["five-route coverage", "issued escalation conflicts", "emergency sensitivity", "false emergency escalation", "unresolved/failed fraction"],
    secondaryOutcomes: ["time to emergency action", "question/reply latency", "completion latency including failures", "tokens", "source support and applicability (separately graded)"],
  };
}
export type Manifest = ReturnType<typeof experimentManifest>;
export type TrialRecord = { version: string; manifestHash: string; id: string; inputHash: string; trial: number; arm: typeof ARMS[number]; execution: "simulated" | "provider"; status: "recorded" | "failed" | "interrupted"; durationMs: number | null; executionState: "started" | "not_started" | "prior_attempt_unknown"; responseEvents: ResponseEvent[]; eventCaptureFailure: boolean; run: DispositionRun | null; failure: string | null; evidenceHash: string | null; recordHash: string };
export type ExperimentRunner = (input: { id: string; message: string }, arm: typeof ARMS[number], frozenEvidence?: EvidenceSearchResult, onResponseEvent?: (event: ResponseEvent) => void) => Promise<DispositionRun>;
function immutable(path: string, value: unknown) {
  const fd = openSync(path, "wx", 0o600);
  try { writeFileSync(fd, JSON.stringify(value, null, 2)); fsyncSync(fd); } finally { closeSync(fd); }
}
export function planExperiment(cases: ExperimentCase[], directory: string, manifest: Manifest) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, "manifest.json");
  if (existsSync(path)) { if (digest(JSON.parse(readFileSync(path, "utf8"))) !== digest(manifest)) throw new Error("EXPERIMENT_MANIFEST_MISMATCH"); }
  else immutable(path, manifest);
  if (manifest.datasetHash !== digest(cases)) throw new Error("EXPERIMENT_DATASET_CHANGED");
  return manifest;
}
export async function runExperiment(cases: ExperimentCase[], directory: string, manifest: Manifest, runner: ExperimentRunner, signal?: AbortSignal) {
  planExperiment(cases, directory, manifest);
  const lockPath = join(directory, "experiment.lock");
  let lock: number;
  try { lock = openSync(lockPath, "wx", 0o600); writeFileSync(lock, JSON.stringify({ pid: process.pid, at: new Date().toISOString() })); fsyncSync(lock); }
  catch { throw new Error("EXPERIMENT_LOCKED_INSPECT_EXISTING_RUN_BEFORE_RECOVERY"); }
  try {
  const records: TrialRecord[] = [], manifestHash = digest(manifest);
  // Each attempt is admitted durably before execution. An interrupted attempt
  // is never silently retried (and billed again) on resume. One runner per dir.
  for (const [i, c] of cases.entries()) for (let trial = 1; trial <= manifest.repetitions; trial++) {
    const rotation = (i + trial - 1) % ARMS.length;
    const order = [...ARMS.slice(rotation), ...ARMS.slice(0, rotation)];
    if (order.indexOf("adaptive-critique") < order.indexOf("adaptive-opus")) {
      const index = order.indexOf("adaptive-critique"); order.splice(index, 1); order.splice(order.indexOf("adaptive-opus") + 1, 0, "adaptive-critique");
    }
    let frozenEvidence: EvidenceSearchResult | undefined;
    for (const arm of order) {
      signal?.throwIfAborted();
      const name = `${c.id}--${trial}--${arm}`, path = join(directory, `${name}.json`), attempt = join(directory, `${name}.attempt.json`);
      if (existsSync(path)) {
        const record = JSON.parse(readFileSync(path, "utf8")) as TrialRecord;
        const { recordHash, ...payload } = record;
        if (digest(payload) !== recordHash || record.manifestHash !== manifestHash || record.inputHash !== digest(c.message) || record.id !== c.id || record.arm !== arm || record.trial !== trial) throw new Error("EXPERIMENT_RESULT_MISMATCH");
        records.push(record); if (arm === "adaptive-opus") frozenEvidence = record.run?.adaptive?.evidence; continue;
      }
      let started: number | null = null;
      let run: DispositionRun | null = null, status: TrialRecord["status"] = "recorded", failure: string | null = null;
      let executionState: TrialRecord["executionState"] = "not_started", eventCaptureFailure = false, acceptingEvents = true;
      let responseEvents: ResponseEvent[] = [];
      const captureEvent = (event: ResponseEvent) => {
        if (!acceptingEvents) return;
        const parsed = responseEventSchema.safeParse(event);
        if (!parsed.success || responseEvents.length >= 128) { eventCaptureFailure = true; return; }
        responseEvents.push(structuredClone({ ...parsed.data, elapsedMs: parsed.data.elapsedMs ?? (started === null ? undefined : Math.round(performance.now() - started)) }));
      };
      if (existsSync(attempt)) { status = "interrupted"; executionState = "prior_attempt_unknown"; failure = "PRIOR_ATTEMPT_INCOMPLETE_NO_AUTOMATIC_RETRY"; }
      else {
        immutable(attempt, { manifestHash, inputHash: digest(c.message), arm, trial, at: new Date().toISOString() });
        try {
          if (arm === "adaptive-critique" && !frozenEvidence) throw new Error("NO_PAIRED_EVIDENCE_SNAPSHOT");
          // Do not leak reference labels or rubrics to the inference function.
          started = performance.now(); executionState = "started";
          run = await runner({ id: c.id, message: c.message }, arm, arm === "adaptive-critique" ? structuredClone(frozenEvidence) : undefined, captureEvent);
          if (run.message !== c.message || run.profile !== arm) throw new Error("INFERENCE_IDENTITY_MISMATCH");
          if (arm === "adaptive-critique" && digest(run.adaptive?.evidence) !== digest(frozenEvidence)) throw new Error("PAIRED_EVIDENCE_CHANGED");
          const returnedEvents = z.array(responseEventSchema).max(128).parse(run.responseEvents ?? []);
          if (responseEvents.length && digest(responseEvents) !== digest(returnedEvents)) throw new Error("EVENT_CAPTURE_MISMATCH");
          responseEvents = structuredClone(returnedEvents);
          if (eventCaptureFailure) throw new Error("EVENT_CAPTURE_INVALID");
        } catch (e) { status = "failed"; failure = e instanceof Error && /^(NO_PAIRED|INFERENCE_|PAIRED_|EVENT_CAPTURE_)/.test(e.message) ? e.message : "RUN_FAILED"; run = null; }
      }
      acceptingEvents = false;
      const payload = { version: EXPERIMENT_VERSION, manifestHash, id: c.id, inputHash: digest(c.message), trial, arm, execution: manifest.execution, status, executionState, responseEvents, eventCaptureFailure, run, durationMs: started === null ? null : Math.round(performance.now()-started), failure, evidenceHash: run?.adaptive ? digest(run.adaptive.evidence) : null };
      const record: TrialRecord = { ...payload, recordHash: digest(payload) };
      immutable(path, record); records.push(record); if (arm === "adaptive-opus") frozenEvidence = run?.adaptive?.evidence;
    }
  }
  return records;
  } finally { closeSync(lock); unlinkSync(lockPath); }
}
const percentile = (values: number[], p: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b) => a-b);
  return p === .5 ? (sorted[Math.floor((sorted.length-1)/2)] + sorted[Math.floor(sorted.length/2)])/2 : sorted[Math.max(0,Math.ceil(p*sorted.length)-1)];
};
export function wilson(successes: number, n: number) {
  if (!n) return { numerator: successes, denominator: n, rate: null, ci95: null };
  const z = 1.959964, p = successes/n, d = 1+z*z/n, mid = (p+z*z/(2*n))/d, h = z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;
  return { numerator: successes, denominator: n, rate: p, ci95: [Math.max(0,mid-h), Math.min(1,mid+h)] };
}
const visibleEvents = (r: TrialRecord) => r.responseEvents ?? r.run?.responseEvents ?? [];
const emergency = (r: TrialRecord) => r.run?.answer?.disposition === "EMERGENCY_NOW" || visibleEvents(r).some((e) => e.kind === "action" && e.notice.disposition === "EMERGENCY_NOW");
// Legacy v1 failure timestamps were processing time during resume/skips, not
// observed execution time. Do not silently reinterpret them as measurements.
const observedDuration = (r: TrialRecord) => r.executionState === "started" && typeof r.durationMs === "number" && Number.isFinite(r.durationMs) && r.durationMs >= 0 ? r.durationMs : null;
const firstEventMs = (r: TrialRecord, kind: ResponseEvent["kind"]) => visibleEvents(r).find((event) => event.kind === kind)?.elapsedMs ?? null;
export function summarizeExperiment(cases: ExperimentCase[], recorded: TrialRecord[], manifest?: Manifest) {
  const byId = new Map(cases.map((c) => [c.id,c]));
  if (!cases.length || byId.size !== cases.length || new Set(recorded.map((r) => `${r.id}/${r.arm}/${r.trial}`)).size !== recorded.length || recorded.some(r => !byId.has(r.id) || !ARMS.includes(r.arm) || !Number.isInteger(r.trial) || r.trial < 1)) throw new Error("INVALID_SUMMARY_RECORD_IDENTITIES");
  if (recorded.some(r => r.inputHash !== undefined && r.inputHash !== digest(byId.get(r.id)!.message))) throw new Error("SUMMARY_INPUT_MISMATCH");
  if (new Set(recorded.map(r => r.execution)).size > 1) throw new Error("MIXED_EXECUTION_REQUIRES_SEPARATE_REPORTS");
  const records = [...recorded];
  const missing: string[] = [];
  if (manifest) {
    if (manifest.datasetHash !== digest(cases) || manifest.version !== EXPERIMENT_VERSION || digest(manifest.arms) !== digest(ARMS) || !Number.isInteger(manifest.repetitions) || manifest.repetitions < 1 || manifest.repetitions > 10 || !["provider","simulated"].includes(manifest.execution)) throw new Error("SUMMARY_MANIFEST_MISMATCH");
    for (const r of recorded) {
      const { recordHash, ...payload } = r;
      if (digest(payload) !== recordHash || r.manifestHash !== digest(manifest) || r.execution !== manifest.execution || r.trial > manifest.repetitions) throw new Error("SUMMARY_RECORD_MISMATCH");
    }
    // Missing files are missing results, not successes and not fast executions.
    // This projection never writes a synthetic result into the experiment dir.
    for (const c of cases) for (const arm of ARMS) for (let trial = 1; trial <= manifest.repetitions; trial++) {
      if (recorded.some(r => r.id === c.id && r.arm === arm && r.trial === trial)) continue;
      missing.push(`${c.id}/${arm}/${trial}`);
      records.push({ version: EXPERIMENT_VERSION, id: c.id, arm, trial, manifestHash: digest(manifest), inputHash: digest(c.message), execution: manifest.execution, status: "interrupted", executionState: "not_started", durationMs: null, responseEvents: [], eventCaptureFailure: false, run: null, failure: "PLANNED_RESULT_MISSING", evidenceHash: null, recordHash: "summary-projection-only" });
    }
  }
  const finalAccepted = (r: TrialRecord) => {
    const ref = byId.get(r.id)?.reference;
    if (r.status !== "recorded" || r.run?.status !== "complete" || !r.run.answer || !ref) return false;
    return ref.acceptedOperationalRoutes ? ref.acceptedOperationalRoutes.includes(operationalRoute(r.run.answer)!) : ref.acceptedRoutes.includes(r.run.answer.disposition);
  };
  const escalationConflict = (r: TrialRecord) => {
    const ref = byId.get(r.id)?.reference;
    return !!ref && visibleEvents(r).some(e => e.kind === "action" && !ref.acceptedRoutes.includes(e.notice.disposition));
  };
  const referenceStatus = [...new Set(cases.map((c) => c.reference?.status ?? "unlabeled"))];
  const outcomes = (labeled: TrialRecord[]) => {
    const families = labeled.flatMap(r => byId.get(r.id)!.familyId ? [byId.get(r.id)!.familyId!] : []);
    const repeatedCases = new Set(labeled.map(r => digest(byId.get(r.id)!.message))).size < labeled.length || new Set(families).size < families.length;
    const interval = (successes: number, count: number) => {
      const result = wilson(successes, count);
      return { ...result, ci95: repeatedCases ? null : result.ci95, intervalMethod: repeatedCases ? "suppressed_case_repetition_requires_clustered_inference" : "wilson_independent_cases" };
    };
    const emergencies = labeled.filter((r) => byId.get(r.id)!.reference!.emergency), nonemergencies = labeled.filter((r) => !byId.get(r.id)!.reference!.emergency);
    const operational = labeled.filter(r => byId.get(r.id)!.reference!.acceptedOperationalRoutes);
    return { cases: new Set(labeled.map((r) => r.id)).size, attempts: labeled.length,
      emergencySensitivity: interval(emergencies.filter(emergency).length, emergencies.length), falseEmergencyEscalation: interval(nonemergencies.filter(emergency).length, nonemergencies.length),
      acceptedRouteCoverage: interval(labeled.filter(finalAccepted).length, labeled.length),
      operationalRouteCoverage: interval(operational.filter(finalAccepted).length, operational.length),
      routeAndIssuedEscalationCoverage: interval(operational.filter(r => finalAccepted(r) && !escalationConflict(r)).length, operational.length),
      coarseReferenceAttempts: labeled.length - operational.length,
      issuedEscalationConflicts: labeled.filter(escalationConflict).map(r => `${r.id}/${r.trial}`),
      // Preserve set-valued references instead of inventing one truth for a matrix.
      operationalConfusion: operational.map(r => ({ id: r.id, trial: r.trial, accepted: byId.get(r.id)!.reference!.acceptedOperationalRoutes!, observed: r.run?.status === "complete" && r.run.answer ? operationalRoute(r.run.answer) : null, status: r.run?.status ?? r.failure, matched: finalAccepted(r) })),
    };
  };
  const arms = ARMS.map((arm) => {
    const rows = records.filter((r) => r.arm === arm), labeled = rows.filter((r) => byId.get(r.id)?.reference);
    const referenceOutcomes = (["clinician_adjudicated", "development_expectation"] as const).map((status) => ({ referenceStatus: status, ...outcomes(labeled.filter((r) => byId.get(r.id)?.reference?.status === status)) }));
    const mixedReferences = new Set(labeled.map((r) => byId.get(r.id)!.reference!.status)).size > 1;
    const overall = mixedReferences ? null : outcomes(labeled);
    const endTimes = rows.flatMap((r) => observedDuration(r) === null ? [] : [observedDuration(r)!]);
    const eventTimes = (kind: ResponseEvent["kind"]) => rows.flatMap((r) => firstEventMs(r,kind) === null ? [] : [firstEventMs(r,kind)!]);
    const usageKnown = rows.every((r) => r.run && r.run.usage.inputTokens !== null && r.run.usage.outputTokens !== null);
    return { arm, attempts: rows.length, recordedAttempts: recorded.filter(r => r.arm === arm).length, plannedResultsMissing: rows.filter(r => r.failure === "PLANNED_RESULT_MISSING").length, completed: rows.filter((r) => r.run?.status === "complete").length, awaitingInput: rows.filter((r) => r.run?.status === "awaiting_input").length,
      failedOrUnavailable: rows.filter((r) => !r.run || ["unavailable", "review_required"].includes(r.run.status)).length,
      emergencySensitivity: overall?.emergencySensitivity ?? null, falseEmergencyEscalation: overall?.falseEmergencyEscalation ?? null, acceptedRouteCoverage: overall?.acceptedRouteCoverage ?? null,
      referenceOutcomes, pooledReferenceMetrics: mixedReferences ? "suppressed_mixed_reference_status" : "single_reference_status_or_unlabeled",
      medianEndMs: percentile(endTimes, .5), p95EndMs: percentile(endTimes, .95),
      medianActionMs: percentile(eventTimes("action"), .5), medianQuestionMs: percentile(eventTimes("intake_question"), .5), medianReplyMs: percentile(eventTimes("patient_reply"), .5),
      latencyDenominators: { attempts: rows.length, observedEnd: endTimes.length, unknownOrNotExecutedEnd: rows.length-endTimes.length, observedAction: eventTimes("action").length, observedQuestion: eventTimes("intake_question").length, observedReply: eventTimes("patient_reply").length },
      eventCaptureFailures: rows.filter((r) => r.eventCaptureFailure).length,
      searchTiming: arm === "adaptive-critique" ? "frozen_passage_replay_excludes_live_search" : arm === "adaptive-opus" ? "live_or_cached_search_included" : "no_search",
      tokens: usageKnown ? rows.reduce((v,r) => ({ input: v.input+r.run!.usage.inputTokens!, output: v.output+r.run!.usage.outputTokens! }), { input: 0, output: 0 }) : null,
      actualCostUSD: null, clinicalCorrectness: "not_assessed", claimEntailment: "not_assessed", applicability: "not_assessed",
    };
  });
  const pairs = [...ARMS.slice(1).map((arm) => ({ arm, comparator: "base-opus" as typeof ARMS[number] })), { arm: "adaptive-critique" as const, comparator: "adaptive-opus" as const }].map(({ arm, comparator }) => {
    const improved: string[] = [], worsened: string[] = [];
    for (const row of records.filter((r) => r.arm === arm)) {
      const base = records.find((r) => r.arm === comparator && r.id === row.id && r.trial === row.trial), reference = byId.get(row.id)?.reference;
      if (!base || !reference) continue;
      const accepted = (r: TrialRecord) => finalAccepted(r) && !escalationConflict(r);
      if (accepted(row) && !accepted(base)) improved.push(`${row.id}/${row.trial}`);
      if (!accepted(row) && accepted(base)) worsened.push(`${row.id}/${row.trial}`);
    }
    return { arm, comparator, interpretation: "whole_workflow_comparison_not_isolated_component_lift", improved, worsened };
  });
  return { version: EXPERIMENT_VERSION, coverage: { planned: manifest ? cases.length * manifest.repetitions * ARMS.length : null, recorded: recorded.length, missing, verifiedAgainstManifest: Boolean(manifest) }, recordVersions: [...new Set(recorded.map((r) => r.version))], referenceStatus, execution: [...new Set(records.map((r) => r.execution))], arms, pairs,
    limitations: ["Whole-workflow comparisons do not isolate component causality.", "Label agreement is not overall clinical correctness; development and clinician reference metrics are separated.", "Unresolved and failed cases remain in labeled outcome denominators.", "Repeated-case confidence intervals are suppressed pending case-clustered inference.", "End latency includes observed executed failures, but not unknown historical duration or non-execution; inspect latency denominators.", "Action/question latency is conditional on emission and known timing; use alongside missing/failed counts.", "Callback events survive a thrown runner; a hard process crash before record persistence still needs separate runtime-event recovery.", "Legacy v1 timing lacks execution-state provenance and is excluded, not retroactively certified.", "Token totals are not invoice cost. No calibration or clinical lift is inferred from simulated runs.", "Critique replays passages without live search latency, but independently sampled planner/draft outputs remain a confound; paired clinical review is required."],
  };
}
