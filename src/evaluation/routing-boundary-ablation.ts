/** OFFLINE ONLY. Projects saved drafts; never releases care or calls a model.
 * No physician labels enter projection. This experiment measures the cost of
 * coupling route serialization to optional prose, NOT the safety of removing it.
 */
import { draftSchema } from "../disposition/graph-output.ts";
import { gatesDecisionSteps, resolveGatesSteps, GATES_RELEASE_VERSION } from "../disposition/gates-release.ts";
import { asyncAction, operationalRoute, QUEUE_POLICY, routingFieldsValid } from "../disposition/routing-policy.ts";
import { CONTINUE_EMS_DIRECTIVE, reducesEmergencyTransport } from "../disposition/care-setting.ts";
import { responseEventSchema } from "../disposition/progressive.ts";
import { sameRepairValue } from "../disposition/repair-values.ts";
import { selectGraphEvidence } from "../evidence/rag/selection.ts";
import { sha256 } from "../evidence/rag/model.ts";
import { pathBAcuity, pathBDeviation, type PathBAttemptAdmission } from "./v25-path-b.ts";
import type { DispositionRun, SafetyNotice } from "../disposition/contract.ts";
import type { z } from "zod";

export const ROUTING_BOUNDARY_ABLATION = "offline-routing-boundary/v1";
type Draft = z.infer<typeof draftSchema>;

/** Typed policy rendering, not interpretation of symptoms or permission to
 * prescribe. Intentionally does not copy ANY generated clinical prose. */
export function routingEnvelope(draft: Draft, patient: string, early: SafetyNotice | null) {
  const route = operationalRoute(draft), intent = draft.transportIntent;
  if (!route || !routingFieldsValid(draft)) return null;
  let instruction: string;
  if (route === "EMERGENCY_NOW") {
    if (!intent) return null;
    if (intent.mode === "continue_ems") {
      if (!intent.activationQuote || !patient.includes(intent.activationQuote) || early?.directive !== CONTINUE_EMS_DIRECTIVE) return null;
      instruction = CONTINUE_EMS_DIRECTIVE;
    } else {
      if (intent.activationQuote !== null) return null;
      instruction = intent.mode === "activate_ems"
        ? "Call 911 now. Do not drive yourself or wait for a message reply."
        : "Go to the emergency department now. Do not wait for a message reply; call 911 if you cannot travel safely.";
    }
  } else {
    if (intent !== null) return null;
    instruction = draft.disposition === "ASYNC_PHYSICIAN" ? asyncAction(draft)
      : route === "SAME_DAY_IN_PERSON" ? "An in-person assessment is recommended today; do not wait for an asynchronous reply."
      : "Self-care route proposed. Patient guidance is not included in this offline routing projection.";
  }
  return { kind: "offline_route_proposal" as const, route, disposition: draft.disposition,
    reviewPriority: draft.reviewPriority, workType: draft.workType, transport: intent,
    instruction, queuePolicy: QUEUE_POLICY.version,
    intendedOwner: draft.disposition === "ASYNC_PHYSICIAN" ? QUEUE_POLICY.intendedOwner : null,
    serviceAvailability: draft.disposition === "ASYNC_PHYSICIAN" ? QUEUE_POLICY.availability : null,
    handoffConfirmed: false, clinicalApproval: false, patientAdvicePublished: false };
}

/** Exact V25 inputs and checks are replayed before a separate projection. Old
 * failed HTTP admissions remain failures even if today's decoder accepts them. */
export function projectRoutingBoundary(run: DispositionRun, expected: { message: string; promptHash: string }, admission: PathBAttemptAdmission) {
  const blocked: string[] = [];
  const producer = run.agents?.filter(a => a.role === "disposition").at(-1);
  if (run.agents?.filter(a => a.role === "disposition").length !== 1) blocked.push("unexpected_producer_count");
  const parsed = draftSchema.safeParse(producer?.output);
  if (run.message !== expected.message || run.inputHash !== sha256(expected.message) || run.promptHash !== expected.promptHash
    || run.runId !== admission.runId || run.graph?.version !== GATES_RELEASE_VERSION || run.graph.mode !== "gates-release"
    || run.graph.judge !== null || run.agents?.some(a => a.role === "critic" || a.role === "reconciliation")) blocked.push("identity_invalid");
  if (!parsed.success || !producer || producer.failure !== null) blocked.push("producer_invalid");
  if (!admission.eligible || admission.failure !== null) blocked.push("historical_transport_or_identity_failure");
  const events = (run.responseEvents ?? []).map(e => responseEventSchema.parse(e));
  if (events.some((e, i) => e.sequence !== i + 1 || e.kind === "care_revision")) blocked.push("event_sequence_invalid");
  const actions = events.filter(e => e.kind === "action");
  const early = actions.at(-1)?.notice ?? null;
  const draft = parsed.success ? parsed.data : null;
  const hits = selectGraphEvidence(run.graph?.retrieval ?? [], 9);
  const decision = resolveGatesSteps(gatesDecisionSteps(draft, run.message, run.guidance, hits, early,
    run.graph?.gatesAdmission?.aborted ?? true), sha256);
  if (!sameRepairValue(decision.admission, run.graph?.gatesAdmission)
    || !sameRepairValue(decision.checks, run.checks)
    || decision.admission.packetHash !== run.graph?.frozenPacketHash) blocked.push("replay_binding_invalid");
  if (run.guidance.length !== hits.length || run.guidance.some((g, i) => g.id !== hits[i]?.chunk.id || g.summary !== hits[i]?.chunk.text
    || g.url !== hits[i]?.document.url || g.title !== hits[i]?.document.title)) blocked.push("guidance_binding_invalid");
  if (decision.admission.aborted) blocked.push("cancelled");
  if (!decision.admission.packetOk) blocked.push("evidence_packet_invalid");
  if (decision.checks.find(c => c.id === "rag_source_integrity")?.status !== "pass") blocked.push("citation_identity_invalid");
  const envelope = draft ? routingEnvelope(draft, run.message, early) : null;
  if (!envelope) blocked.push("typed_route_invalid");
  // Check every issued action, not only the most recent one. Preserve the
  // original prose-based conflict too; canonical rendering cannot hide one.
  if (decision.admission.lowerThanEarly || envelope && actions.some(e =>
    pathBAcuity(envelope.disposition) < pathBAcuity(e.notice.disposition)
    || reducesEmergencyTransport(e.notice, { disposition: envelope.disposition, directive: envelope.instruction }))) blocked.push("issued_care_conflict");
  const failedChecks = decision.checks.filter(c => c.status === "fail").map(c => c.id);
  return { protocol: ROUTING_BOUNDARY_ABLATION, blocked, eligibleProjection: blocked.length === 0,
    proposal: blocked.length === 0 ? envelope : null,
    draftRouteDiagnosticOnly: draft ? operationalRoute(draft) : null,
    citationCount: draft?.citations.length ?? 0,
    originalFailedChecks: failedChecks, originalProseRepublished: false,
    unsafe_advice: "not_assessed" as const, unsupported_claims: "not_assessed" as const,
    routing_correctness: "not_assessed" as const, routeProseConsistency: "not_assessed" as const,
    publishedNewClinicalOutput: false,
    newProviderLatencyMs: null, newProviderCostUSD: null };
}

/** Physician reference is used here only, downstream of label-blind projection. */
export function compareProjectedRoute(route: string | null, accepted: string[] | null) {
  return { agreement: route !== null && accepted !== null ? accepted.includes(route) : null,
    deviation: pathBDeviation(route, accepted) };
}
