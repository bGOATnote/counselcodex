import { z } from "zod";
import { GATES_RELEASE_VERSION, verifyGatesReleaseSteps, resolveGatesSteps } from "../disposition/gates-release.ts";
import { sha256 } from "../evidence/rag/model.ts";
import { operationalRoute, operationalRoutes } from "../disposition/routing-policy.ts";
import { CLINICAL_POLICY_VERSION } from "../disposition/clinical-policy.ts";
import { boundEmergencyTransport, hasUnconditional911Opening, reducesEmergencyTransport, type ReviewedEmergencyTransport } from "../disposition/care-setting.ts";
import { exactStructuredJudgeAnchor } from "../disposition/judge-anchors.ts";
import type { DispositionRun } from "../disposition/contract.ts";
import { estimateStudyCost } from "./clinical-study-budget.ts";
import { scoreV25PathB } from "./v25-path-b.ts";
import { parseCsv } from "../lib/csv.mjs";
import { canonicalReviewedAnswer, hasBoundUnsupportedCareCorrectionSync, verifyCareAlternativeSync } from "../../apps/evaluation/lib/care-alternative.ts";
import { reconstructReviewedProducerSteps } from "../../apps/evaluation/lib/preserved-care.ts";
import { sameRepairValue } from "../disposition/repair-values.ts";
import { responseEventSchema } from "../disposition/progressive.ts";
import { completeV23ReleaseChecks, reconstructV23ReviewPacket, EXACT_REVIEW_CONTRACT_VERSIONS, LEGACY_REVIEW_CONTRACT_VERSIONS, usesExactReviewContract, knownReviewContract } from "./v23-review-packet.ts";

const route = z.enum(operationalRoutes);
const row = z.object({
  id: z.string().regex(/^C\d{2}$/), message: z.string().min(1), inputHash: z.string().length(64),
  originalSuppliedLabel: z.string(),
  reference: z.object({ acceptedRoutes: z.array(route).min(1).nullable(), status: z.string(), prioritySpecific: z.boolean(), note: z.string().nullable() }),
  incumbent: z.object({ runId: z.string(), completedAt: z.string(), status: z.string() }).passthrough(),
}).passthrough();
export const physicianReferenceSchema = z.object({
  version: z.literal("physician-designated-system-reference/v1"),
  datasetSha256: z.string().length(64), authority: z.object({ sha256: z.string().length(64) }).passthrough(),
  selection: z.string(), scope: z.string(), cases: z.array(row).length(50),
}).passthrough();
export type PhysicianReference = z.infer<typeof physicianReferenceSchema>;

export function readPhysicianReference(raw: string, csv: string): PhysicianReference {
  const reference = physicianReferenceSchema.parse(JSON.parse(raw));
  if (sha256(csv) !== reference.datasetSha256) throw new Error("REFERENCE_DATASET_CHANGED");
  if (new Set(reference.cases.map(c => c.id)).size !== 50 || new Set(reference.cases.map(c => c.inputHash)).size !== 50) throw new Error("REFERENCE_DUPLICATE_CASE");
  if (reference.cases.some(c => sha256(c.message) !== c.inputHash)) throw new Error("REFERENCE_INPUT_CHANGED");
  const original = parseCsv(csv) as { id: string; message: string; disposition: string }[];
  if (original.length !== 50 || reference.cases.some(c => !original.some(o => o.id === c.id && o.message === c.message && o.disposition === c.originalSuppliedLabel))) throw new Error("REFERENCE_SOURCE_MISMATCH");
  return reference;
}

// Only these patient inputs may enter a candidate invocation. Neither original
// supplied labels nor physician routes are runtime data or retrieval documents.
export function candidateInputs(reference: PhysicianReference) {
  return reference.cases.map(c => ({ id: c.id, message: c.message, inputHash: c.inputHash }));
}

// This is a direction-of-deviation diagnostic, NOT a validated ordinal harm
// scale: different settings imply different capabilities, not equal distances.
const urgency = { SELF_CARE: 0, STANDARD_ASYNC: 1, PRIORITY_ASYNC: 2, SAME_DAY_IN_PERSON: 3, EMERGENCY_NOW: 4 };
const routingReviewCriteria = ["undertriage", "overtriage", "patient_grounding", "claim_support", "safety_net", "clarification_delay", "ownership"] as const;
// These versions retain v12's decoded single-value anchors and independently
// bound transport contract. Explicit membership avoids silently interpreting
// earlier or unknown/future artifacts under a contract they may not implement.
const boundReviewContractVersions = new Set([...LEGACY_REVIEW_CONTRACT_VERSIONS.slice(11), ...EXACT_REVIEW_CONTRACT_VERSIONS]);
// Parse the stored assessment without invoking a model or workflow. The v23
// path additionally replays shared packet/check constructors for exact identity;
// older stored contracts are not clinically re-graded under the current policy.
const storedRoutingReviewSchema = z.object({
  reviewScope: z.literal("draft-and-issued-question/v2"), verdict: z.enum(["accept", "revise", "human_review"]),
  criteria: z.array(z.object({ id: z.enum(routingReviewCriteria), verdict: z.enum(["pass", "fail", "abstain"]),
    reason: z.string().min(10), anchors: z.array(z.object({ unit: z.string().min(1), quote: z.string().min(3) })).min(1),
  })).length(routingReviewCriteria.length), earlyAction: z.enum(["none", "supported", "unsupported", "unresolved"]),
  earlyCorrection: z.object({ reason: z.string().min(20), patientQuotes: z.array(z.string().min(3)).min(1), triggerMisattributedOrCorrected: z.boolean() }).nullable(),
}).passthrough();
const storedSourceSchema = z.object({ chunk: z.object({ id: z.string(), text: z.string(), hash: z.string().length(64) }),
  document: z.object({ kind: z.string(), scope: z.string(), publicationDate: z.string().nullable() }) });
function boundReviewEvidence(run: DispositionRun, judge: z.infer<typeof storedRoutingReviewSchema>, exactDraft?: unknown) {
  const rawHits = Array.isArray(run.graph?.retrieval) ? run.graph.retrieval.flatMap(p => Array.isArray(p.hits) ? p.hits : []) : [];
  const sources = rawHits.flatMap(h => { const parsed = storedSourceSchema.safeParse(h); return parsed.success && sha256(parsed.data.chunk.text) === parsed.data.chunk.hash ? [parsed.data] : []; });
  const answer = run.answer ? Object.fromEntries(Object.entries(run.answer).filter(([key]) => key !== "evidence")) : null;
  const draft = exactDraft ?? (run.status === "complete" && answer ? { ...answer, citations: run.graph?.citations } : run.rejectedAnswer);
  const questions = (run.responseEvents ?? []).filter(e => e.kind === "intake_question");
  const units = [{ id: "patient", text: run.message }, { id: "draft", text: JSON.stringify(draft) ?? "" },
    ...(questions.length ? [{ id: "issued_question", text: JSON.stringify(questions) }] : []),
    ...sources.map(h => ({ id: `source:${h.chunk.id}`, text: `${h.document.kind}; ${h.document.scope}; publication: ${h.document.publicationDate ?? "unknown"}\n${h.chunk.text}` }))];
  // Compatible versions admit verbatim quotations from one decoded structured
  // value. Do not retroactively reinterpret other historical judge contracts.
  const anchorsBound = judge.criteria.every(c => c.anchors.every(a => units.some(u => u.id === a.unit && (boundReviewContractVersions.has(run.graph?.version ?? "") ? exactStructuredJudgeAnchor(u, a.quote) : u.text.includes(a.quote)))));
  const citationsBound = Array.isArray(run.graph?.citations) && run.graph.citations.length > 0 && run.graph.citations.every(c =>
    typeof c?.passageId === "string" && typeof c.quote === "string" && c.quote.length >= 10 && sources.some(h => h.chunk.id === c.passageId && h.chunk.text.includes(c.quote)));
  return { anchorsBound, citationsBound };
}
export type LabelComparison = "match" | "different" | "not_completed" | "qualified";
export type ModelRoutingReviewStatus = "supported" | "model_concern" | "unresolved" | "not_assessed";
function storedEmergencyTransport(run: DispositionRun): ReviewedEmergencyTransport | undefined {
  if (!run.graph || !boundReviewContractVersions.has(run.graph.version)) return undefined;
  const value = run.answer?.emergencyTransport, admission = run.graph.transportAdmission, review = run.graph.judge?.transportReview;
  if (!value || !run.answer || run.answer.disposition !== "EMERGENCY_NOW" || !boundEmergencyTransport(value, run.answer.patientMessage, run.message)
    || admission?.status !== "admitted" || admission.code !== "TRANSPORT_ADMITTED" || !admission.binding
    || ["mode", "activationQuote", "directive", "review"].some(key => admission.binding![key as keyof ReviewedEmergencyTransport] !== value[key as keyof ReviewedEmergencyTransport])
    || review?.verdict !== "supported" || review.mode !== value.mode || typeof review.draftQuote !== "string" || review.draftQuote.length < 3 || !run.answer.patientMessage.includes(review.draftQuote)) return undefined;
  if (value.mode === "continue_ems" ? !review.activation || review.activation.quote !== value.activationQuote || review.activation.currentPatient !== true || review.activation.currentEpisode !== true || review.activation.active !== true : review.activation !== null) return undefined;
  return value;
}

/** Registered exact contracts bind the last actual critic and its exact draft.
 * Earlier versions retain their historical interpretation below; this is
 * provenance validation, not retrospective clinical re-grading. */
function currentExactReview(run: DispositionRun) {
  try {
    if (run.version !== "disposition-agent/v3" || run.workflowId !== "clinical-evidence-graph" || run.profile !== "evidence-graph-opus"
      || run.inputHash !== sha256(run.message)) return null;
    const records = run.agents ?? [], index = records.findLastIndex(record => record.role === "critic"), critic = records[index];
    if (!critic || critic.failure !== null || !critic.output || !sameRepairValue(critic.output, run.graph?.judge)
      || critic.reviewInputBinding?.patientHash !== run.inputHash || !/^[a-f0-9]{64}$/.test(critic.reviewInputBinding.packetHash)) return null;
    const hashes = records.map(record => sha256(JSON.stringify(record.output)));
    const steps = reconstructReviewedProducerSteps(run, hashes, critic.reviewInputBinding.draftHash);
    let state = steps.next(); while (!state.done) state = steps.next(sha256(state.value));
    const producer = state.value;
    if (!producer || producer.index >= index || records.slice(producer.index + 1).some(record => record.role === "disposition")) return null;
    if (run.status === "complete") {
      if (!run.answer || run.answerHash !== sha256(JSON.stringify(run.answer)) || !sameRepairValue(run.answer, canonicalReviewedAnswer(run, producer.draft))) return null;
    } else if (!sameRepairValue(run.rejectedAnswer, producer.draft)) return null;
    if (!reconstructV23ReviewPacket(run, producer.draft, producer.index, index)) return null;
    return producer;
  } catch { return null; }
}

function validExactPublishedResponse(run: DispositionRun): boolean {
  try {
    if (!run.answer || run.origin !== "agent" || run.failure !== null || run.safetyFloor !== null || run.graph?.clinicalApproval !== false) return false;
    const events = z.array(responseEventSchema).parse(run.responseEvents), replies = events.filter(event => event.kind === "patient_reply"), revisions = events.filter(event => event.kind === "care_revision");
    if (events.some((event, index) => event.sequence !== index + 1) || replies.length !== 1 || replies[0].sequence !== events.length
      || replies[0].disposition !== run.answer.disposition || replies[0].text !== run.answer.patientMessage
      || !sameRepairValue(replies[0].emergencyTransport, run.answer.emergencyTransport) || revisions.length > 1) return false;
    if (run.reconciliation?.status === "revised") {
      const early = events.filter(event => event.kind === "action").at(-1);
      if (!early || revisions.length !== 1 || !sameRepairValue(revisions[0].reconciliation, run.reconciliation)
        || early.sequence! >= revisions[0].sequence! || revisions[0].sequence! >= replies[0].sequence!
        || run.reconciliation.from.disposition !== early.notice.disposition || run.reconciliation.from.directive !== early.notice.directive
        || run.reconciliation.to.disposition !== run.answer.disposition || run.reconciliation.to.directive !== run.answer.patientMessage) return false;
    } else if (revisions.length) return false;
    return completeV23ReleaseChecks(run);
  } catch { return false; }
}
export function modelRoutingReview(run: DispositionRun, comparison: LabelComparison) {
  const parsed = storedRoutingReviewSchema.safeParse(run.graph?.judge);
  const provenance = { kind: "stored_candidate_model_review" as const, promptHash: run.promptHash,
    routingPolicy: run.routingPolicy ?? null, reviewedUnderPolicy: run.graph?.clinicalPolicyVersion ?? "legacy_unspecified",
    reviewerModel: run.agents?.filter(a => a.role === "critic").at(-1)?.model ?? null,
    currentPolicyAppliedRetrospectively: false as const, clinicalApproval: false as const };
  const report = (status: ModelRoutingReviewStatus, reason: string, failedCriteria: string[] = [], unresolvedCriteria: string[] = []) => ({ status, reason, failedCriteria, unresolvedCriteria,
    assessment: status !== "supported" ? null : comparison === "different" ? "model_supported_alternative" as const
      : comparison === "qualified" ? "model_supported_qualified_case" as const : "model_supported_reference_match" as const,
    earlyActionReview: !parsed.success ? "not_assessed" : parsed.data.earlyAction === "unsupported" && status === "supported" ? "corrected_model_concern" : parsed.data.earlyAction,
    provenance });
  if (!run.graph?.judge) return report("not_assessed", "No stored independent model routing review; label difference is not a clinical failure verdict.");
  if (!knownReviewContract(run.graph.version)) return report("unresolved", "This graph version has no registered review contract; unknown or future versions cannot use weaker legacy checks.");
  if (!parsed.success || new Set(parsed.data.criteria.map(c => c.id)).size !== routingReviewCriteria.length) return report("unresolved", "Stored review is malformed or has missing/duplicate criteria; no clinical conclusion is inferred.");
  const judge = parsed.data, failed = judge.criteria.filter(c => c.verdict === "fail").map(c => c.id), unresolved = judge.criteria.filter(c => c.verdict === "abstain").map(c => c.id);
  const exactReview = usesExactReviewContract(run.graph.version), current = exactReview ? currentExactReview(run) : null;
  if (exactReview && !current) return report("unresolved", "The registered exact review is not bound to the last available critic, exact producer draft and canonical response; stale or failed reviews cannot support release.");
  const bindings = boundReviewEvidence(run, judge, current?.draft);
  if (!bindings.anchorsBound) return report("unresolved", "A stored review quotation cannot be bound to the patient, current draft, issued question or retained source packet.");
  if (judge.verdict === "accept" && (failed.length || unresolved.length || judge.earlyAction === "unresolved")) return report("unresolved", "The stored acceptance contradicts its criterion or early-action verdicts.");
  if (failed.length) return report("model_concern", "The stored model identified specific concerns; these are not confirmed harm or physician adjudication.", failed, unresolved);
  if (unresolved.length || judge.verdict !== "accept" || judge.earlyAction === "unresolved") return report("unresolved", "The stored review did not resolve all clinical, evidence and issued-action criteria.", [], unresolved);
  if (run.status !== "complete" || !run.answer || !operationalRoute(run.answer) || run.graph.release !== "model_reviewed") return report("unresolved", "A supported complete response was not released; draft agreement is not completion.");
  if (run.graph.sourceIntegrity !== true || !bindings.citationsBound || !judge.criteria.find(c => c.id === "claim_support")!.anchors.some(a => a.unit.startsWith("source:"))) return report("unresolved", "Research support lacks a bound citation/source-integrity record; a pass flag alone is insufficient.");
  const emergencyTransport = storedEmergencyTransport(run);
  if (boundReviewContractVersions.has(run.graph.version) && run.answer.emergencyTransport && !emergencyTransport) return report("unresolved", "The released transport field lacks a matching admitted, independently reviewed patient/draft binding.");
  const early = (run.responseEvents ?? []).filter(e => e.kind === "action").at(-1);
  if (Boolean(early) !== (judge.earlyAction !== "none")) return report("unresolved", "The stored early-action judgment does not match the retained issued actions.");
  if (exactReview) {
    if (!validExactPublishedResponse(run)) return report("unresolved", "The released answer, issued revision/reply or mechanical outcome is not consistently bound to the saved response.");
    const validAlternative = run.graph.careAlternative ? verifyCareAlternativeSync(run, run.message, sha256) : false;
    if (run.graph.careAlternative && !validAlternative) return report("unresolved", "The stored alternative lacks the same exact proof required by the browser; a metadata pass flag is insufficient.");
    const releasedRoute = operationalRoute(run.answer)!;
    const reducesCare = Boolean(early && (urgency[early.notice.disposition] > urgency[releasedRoute]
      || reducesEmergencyTransport(early.notice, { disposition: run.answer.disposition, directive: run.answer.patientMessage, ...(emergencyTransport ? { emergencyTransport } : {}) })));
    if (judge.earlyAction === "unsupported") {
      if (!hasBoundUnsupportedCareCorrectionSync(run, run.message, sha256)) return report("unresolved", "The unsupported-action correction lacks an exact current packet, critic, revision or protected EMS binding.");
    } else if (reducesCare && !validAlternative || run.reconciliation && !validAlternative) return report("unresolved", "An issued care setting or EMS instruction cannot be reduced or revised without its explicit bound review.");
  } else if (judge.earlyAction === "unsupported") {
    const correction = judge.earlyCorrection, revision = run.reconciliation;
    // A reviewed EMS-to-ED correction retains immediate emergency care. It
    // still requires bound reconciliation, but not proof the acute trigger was
    // misattributed. Reducing emergency urgency remains a stricter contract.
    const transportOnly = reducesEmergencyTransport(early?.notice ?? null, { disposition: run.answer.disposition, directive: run.answer.patientMessage, ...(emergencyTransport ? { emergencyTransport } : {}) });
    const correctionBound = correction && correction.patientQuotes.every(q => run.message.includes(q)) && revision?.status === "revised"
      && revision.from.disposition === early?.notice.disposition && revision.from.directive === early.notice.directive
      && revision.to.disposition === run.answer.disposition && revision.to.directive === run.answer.patientMessage
      && (transportOnly || !hasUnconditional911Opening(early.notice.directive) || correction.triggerMisattributedOrCorrected);
    if (!correctionBound) return report("unresolved", "An unsupported early care instruction has no bound correction/reconciliation; final agreement cannot erase it.");
  }
  return report("supported", "All seven stored model criteria passed for the released response. This is model support, not physician approval or proof of clinical correctness.");
}
export function scorePhysicianCohort(reference: PhysicianReference, runs: DispositionRun[], promptHash: string) {
  if (new Set(runs.map(r => r.runId)).size !== runs.length) throw new Error("DUPLICATE_ATTEMPT");
  if (runs.some(r => r.inputHash !== sha256(r.message))) throw new Error("RUN_INPUT_HASH_MISMATCH");
  if (runs.some(r => !Number.isFinite(Date.parse(r.completedAt)) || !Number.isFinite(r.durationMs) || r.durationMs < 0)) throw new Error("RUN_TIME_INVALID");
  const started = (r: DispositionRun) => Date.parse(r.completedAt) - r.durationMs;
  const selected = runs.filter(r => r.promptHash === promptHash);
  // A genuine workflow crash may precede graph metadata. Retain it as an
  // incomplete attempt, not a competing experiment or a reason to drop failures.
  const releaseIdentities = new Set(selected.filter(r => r.graph?.version)
    .map(r => JSON.stringify([r.graph!.version, r.graph!.mode ?? "legacy_unspecified", r.graph!.gatesAdmission?.policy ?? null])));
  if (releaseIdentities.size > 1) throw new Error("COHORT_RELEASE_CONTRACT_MIXED");
  const identifiedGraph = selected.find(r => r.graph?.version)?.graph;
  const gatesCohort = selected.some(r => r.graph?.version === GATES_RELEASE_VERSION || r.graph?.mode === "gates-release" || r.graph?.release === "gates_only");
  const cases = reference.cases.map(c => {
    const accepted = c.reference.acceptedRoutes;
    const attempts = selected.filter(r => r.message === c.message && r.inputHash === c.inputHash)
      .sort((a,b) => started(a) - started(b) || a.runId.localeCompare(b.runId))
      .map(r => {
        const declaresGates = gatesCohort || r.graph?.version === GATES_RELEASE_VERSION || r.graph?.mode === "gates-release" || r.graph?.release === "gates_only";
        const validGates = declaresGates && r.status === "complete" && resolveGatesSteps(verifyGatesReleaseSteps(r, r.message), sha256);
        const missingCandidateIdentity = r.profile === "evidence-graph-opus" && !r.graph?.version;
        const releaseContract = missingCandidateIdentity ? r.status === "complete" ? "invalid" : "identity_unavailable"
          : declaresGates ? r.status !== "complete" ? "not_released" : validGates ? "gates_verified" : "invalid" : "historical_contract";
        const completed = r.status === "complete" && !missingCandidateIdentity && (!declaresGates || validGates);
        const released = completed && r.answer ? operationalRoute(r.answer) : null;
        const displayed = r.answer ? operationalRoute(r.answer) : null;
        const draftValue = r.rejectedAnswer as { disposition?: string; reviewPriority?: "priority" | "routine" | null } | undefined;
        const draft = draftValue?.disposition ? operationalRoute({ ...draftValue, disposition: draftValue.disposition }) : released;
        const early = (r.responseEvents ?? []).filter(e => e.kind === "action").map(e => e.notice.disposition);
        const labelComparison: LabelComparison = !accepted ? "qualified" : !released ? "not_completed" : accepted.includes(released) ? "match" : "different";
        const firstEarlyEmergency = (r.responseEvents ?? []).find(e => e.kind === "action" && e.notice.disposition === "EMERGENCY_NOW");
        const firstEmergencyReply = (r.responseEvents ?? []).find(e => e.kind === "patient_reply" && e.disposition === "EMERGENCY_NOW");
        const measuredMs = (value: number | undefined) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
        const requiresEmergency = accepted?.length === 1 && accepted[0] === "EMERGENCY_NOW", eventsRecorded = Array.isArray(r.responseEvents);
        const relevantEmergency = requiresEmergency || Boolean(firstEarlyEmergency) || displayed === "EMERGENCY_NOW";
        const storedReview = storedRoutingReviewSchema.safeParse(r.graph?.judge);
        return { runId: r.runId, startedAtEstimate: new Date(started(r)).toISOString(), status: r.status, completed, releaseContract, releasedRoute: released, displayedRoute: displayed, draftRoute: draft,
          labelComparison, modelRoutingReview: modelRoutingReview(r, labelComparison),
          completeAgreement: accepted ? Boolean(released && accepted.includes(released)) : null,
          routeDeviation: !accepted || !released ? null : accepted.includes(released) ? "within_reference"
            : urgency[released] < Math.min(...accepted.map(x => urgency[x])) ? "below_reference"
            : urgency[released] > Math.max(...accepted.map(x => urgency[x])) ? "above_reference" : "between_accepted_routes",
          unsafePatientAdvice: "not_assessed", unsupportedClaims: "not_assessed",
          draftAgreement: accepted && draft ? accepted.includes(draft) : null,
          emergencyMiss: accepted?.length === 1 && accepted[0] === "EMERGENCY_NOW"
            ? !early.includes("EMERGENCY_NOW") && displayed !== "EMERGENCY_NOW" : null,
          earlyEscalationAboveReference: accepted ? early.some(a => urgency[a as keyof typeof urgency] > Math.max(...accepted.map(x => urgency[x]))) : null,
          emergencyDelivery: { referenceRequiresEmergency: requiresEmergency, eventRecordAvailable: eventsRecorded,
            earlyEmergencyActionEmitted: eventsRecorded ? Boolean(firstEarlyEmergency) : null,
            earlyEmergencyActionAbsent: relevantEmergency && eventsRecorded ? !firstEarlyEmergency : null,
            firstEarlyEmergencyActionMs: measuredMs(firstEarlyEmergency?.elapsedMs),
            firstEmergencyPatientReplyMs: measuredMs(firstEmergencyReply?.elapsedMs),
            finalDisplayedEmergency: displayed === "EMERGENCY_NOW", deadlineApplied: null,
            scope: "Server-issued event record, not browser receipt or patient action. Absent early action is separate from final route and does not imply a time threshold." },
          earlyActions: early, correctedEarlyAction: Boolean(r.reconciliation),
          durationMs: r.durationMs, firstActionMs: r.firstActionMs ?? null, firstQuestionMs: r.firstQuestionMs ?? null,
          modelCalls: r.modelCalls, estimatedUSD: estimateStudyCost(r),
          claimSupport: storedReview.success && new Set(storedReview.data.criteria.map(c => c.id)).size === routingReviewCriteria.length ? storedReview.data.criteria.find(x => x.id === "claim_support")!.verdict : "not_assessed",
          failedChecks: r.checks.filter(x => x.status === "fail").map(x => x.id) };
      });
    return { id: c.id, inputHash: c.inputHash, acceptedRoutes: accepted, referenceStatus: c.reference.status,
      incumbentRunId: c.incumbent.runId, attempts, firstAttempt: attempts[0] ?? null };
  });
  const assessed = cases.filter(c => c.firstAttempt), scored = cases.filter(c => c.acceptedRoutes), first = scored.flatMap(c => c.firstAttempt ? [c.firstAttempt] : []);
  const attempts = cases.flatMap(c => c.attempts), costs = attempts.map(a => a.estimatedUSD);
  const offCohort = selected.filter(r => !reference.cases.some(c => c.message === r.message && c.inputHash === r.inputHash));
  const firstAll = assessed.map(c => c.firstAttempt!);
  return { version: "physician-cohort-scorecard/v3", promptHash, clinicalPolicyVersion: CLINICAL_POLICY_VERSION,
    ...(gatesCohort ? { pathB: scoreV25PathB(reference, selected, promptHash) } : {}),
    scope: "Physician-designated DEVELOPMENT reference. First exact-input attempt by estimated server start (completion timestamp minus recorded duration) is primary; all repeats, failures, missing cases and early errors remain visible. No held-out efficacy or claim-level physician approval is inferred.",
    plannedCases: cases.length, scoreableCases: scored.length, casesAttempted: assessed.length,
    unattemptedCaseIds: cases.filter(c => !c.firstAttempt).map(c => c.id),
    firstAttemptCompleteAgreements: first.filter(a => a.completeAgreement).length,
    firstAttemptDenominator: first.length, plannedReferenceDenominator: scored.length,
    firstAttemptCompletionCount: assessed.filter(c => c.firstAttempt?.completed).length,
    releaseIdentity: identifiedGraph ? { version: identifiedGraph.version, mode: identifiedGraph.mode ?? null, policy: identifiedGraph.gatesAdmission?.policy ?? null } : null,
    firstAttemptRouteDeviation: { belowReference: first.filter(a => a.routeDeviation === "below_reference").length, aboveReference: first.filter(a => a.routeDeviation === "above_reference").length,
      interpretation: "Ordinal deviation from the frozen accepted routes, not adjudicated undertriage, overtriage or harm." },
    firstAttemptModelReview: { denominator: firstAll.length,
      supported: firstAll.filter(a => a.modelRoutingReview.status === "supported").length,
      modelConcerns: firstAll.filter(a => a.modelRoutingReview.status === "model_concern").length,
      unresolved: firstAll.filter(a => a.modelRoutingReview.status === "unresolved").length,
      notAssessed: firstAll.filter(a => a.modelRoutingReview.status === "not_assessed").length,
      supportedAlternatives: firstAll.filter(a => a.modelRoutingReview.assessment === "model_supported_alternative").length,
      interpretation: "Stored model review, separate from frozen physician-reference agreement. No acceptable-route, physician-approved or clinical-pass count is inferred." },
    scoringCaveats: [
      "Exact route disagreement is a comparison finding, not automatic undertriage, overtriage or harm. Frozen physician acceptedRoutes are unchanged.",
      "Model-supported alternatives retain their original non-agreement result and are not pooled into physician-reference agreement.",
      "Model review is summarized under its recorded prompt/version, not retrospectively regraded under the current clinical policy.",
      "earlyEscalationAboveReference is an ordinal route-deviation diagnostic, not a demonstrated clinical error; settings have different capabilities, not equal harm distances.",
      "A correct final emergency route does not establish early action delivery. Missing early events and known event latencies remain explicit; no deadline is fabricated.",
    ],
    knownCostEstimateUSD: costs.reduce<number>((n,c) => n + (c ?? 0), 0), unknownCostAttempts: costs.filter(c => c === null).length,
    allAttempts: attempts.length, excludedVersionAttempts: runs.length - selected.length,
    offCohortAttempts: offCohort.map(r => ({ runId: r.runId, status: r.status, estimatedUSD: estimateStudyCost(r), durationMs: r.durationMs })),
    offCohortRunIds: offCohort.map(r => r.runId), qualifiedCaseIds: cases.filter(c => !c.acceptedRoutes).map(c => c.id), cases };
}
