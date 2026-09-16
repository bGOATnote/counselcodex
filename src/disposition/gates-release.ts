import { checkAnswer, type Check, type DispositionRun, type Guidance, type SafetyNotice } from "./contract.ts";
import { draftSchema } from "./graph-output.ts";
import { routingFieldsValid } from "./routing-policy.ts";
import { CONTINUE_EMS_DIRECTIVE, hasUnconditional911Opening, reducesEmergencyTransport } from "./care-setting.ts";
import { sameRepairValue } from "./repair-values.ts";
import { responseEventSchema } from "./progressive.ts";
import type { Hit } from "../evidence/rag/model.ts";
import { selectGraphEvidence } from "../evidence/rag/selection.ts";
import type { z } from "zod";

export const GATES_RELEASE_VERSION = "evidence-graph/v25";
export const GATES_RELEASE_POLICY = "gates-release/v1";
export const GATES_OUTPUT_INSTRUCTIONS = `For emergency transport, start patientMessage with "Call 911 now." for activate_ems or "Go to the emergency department now." for ed_now, then a concise patient-specific explanation. For continue_ems, use exactly: ${CONTINUE_EMS_DIRECTIVE} No independent judge runs in this release mode; never imply independent approval.`;
export type GraphMode = "hybrid" | "no-retrieval" | "no-judge" | "gates-release";
export const DEFAULT_CANDIDATE_MODE: GraphMode = "gates-release";
export type GatesAdmission = { policy: typeof GATES_RELEASE_POLICY; packetHash: string; draftHash: string;
  contractOk: boolean; packetOk: boolean; lowerThanEarly: boolean; aborted: boolean; released: boolean };
type Draft = z.infer<typeof draftSchema>;
export function gatesAnswer(draft: Draft) {
  const { citations, transportIntent: _intent, ...answer } = draft;
  // A typed producer intent is retained in its execution record. It is NOT
  // independently reviewed transport, so do not manufacture that metadata.
  return { ...answer, evidence: citations.map(c => ({ sourceId: c.passageId, claim: c.claim })) };
}
function transportValid(draft: Draft, patient: string, early: SafetyNotice | null) {
  const intent = draft.transportIntent;
  if (draft.disposition !== "EMERGENCY_NOW") return intent === null;
  if (!intent) return false;
  if (intent.mode === "continue_ems") return Boolean(intent.activationQuote && patient.includes(intent.activationQuote)
    && early?.directive === CONTINUE_EMS_DIRECTIVE && draft.patientMessage === CONTINUE_EMS_DIRECTIVE);
  if (intent.activationQuote !== null) return false;
  if (intent.mode === "activate_ems") return hasUnconditional911Opening(draft.patientMessage);
  // Directive recognition only, not symptom-based routing or a clinical judge.
  return /^(?:please\s+)?(?:go (?:directly )?to|seek|attend) (?:the |an |your nearest )?emergency (?:department|room)(?: assessment| care)? (?:now|immediately)(?:[.!;:]|$)/i.test(draft.patientMessage.trim());
}

/** Same deterministic response checks as hybrid, with no model-review exceptions.
 * Original onset checking is intentionally stricter: full-review deferral cannot
 * be reused when no full review will occur. Hash yields keep this module usable
 * by Node scoring and browser validation without importing a model runtime. */
export function* gatesDecisionSteps(draft: Draft | null, patient: string, guidance: Guidance[], hits: Hit[], early: SafetyNotice | null, aborted: boolean): Generator<string, { admission: GatesAdmission; checks: Check[] }, string> {
  const packetHash = yield JSON.stringify(hits), draftHash = yield JSON.stringify(draft);
  let usable = hits.length > 0 && new Set(hits.map(h => h.chunk.id)).size === hits.length;
  for (const h of hits) {
    const hash = yield h.chunk.text;
    usable &&= h.chunk.text.trim().length > 0 && hash === h.chunk.hash && h.chunk.documentId === h.document.id
      && h.document.currency !== "superseded" && h.document.currency !== "retracted";
  }
  const integrity = Boolean(draft && draft.citations.every(c => hits.some(h => h.chunk.id === c.passageId && h.chunk.text.includes(c.quote))));
  const checks = draft ? checkAnswer(gatesAnswer(draft), patient, guidance, null) : [];
  const transportOk = Boolean(draft && transportValid(draft, patient, early));
  // An exact already-issued continuation establishes timing without pretending
  // a model judge reviewed it or asserting EMS was externally confirmed.
  if (transportOk && draft?.transportIntent?.mode === "continue_ems") {
    const timing = checks.find(c => c.id === "action_timing_present");
    if (timing) { timing.status = "pass"; timing.detail = "Exact previously issued active-response continuation preserved; not external verification of EMS."; }
  }
  checks.push({ id: "transport_intent", status: transportOk ? "pass" : "fail", detail: "Typed intent matches a bounded immediate directive. No independent review or external EMS activation is asserted." });
  const contractOk = Boolean(draft && routingFieldsValid(draft) && integrity && transportOk
    && checks.every(c => c.status !== "fail" || c.id === "response_concision"));
  const order = ["SELF_CARE", "ASYNC_PHYSICIAN", "SAME_DAY_IN_PERSON", "EMERGENCY_NOW"];
  const lowerThanEarly = Boolean(early && (!draft || order.indexOf(draft.disposition) < order.indexOf(early.disposition)
    || reducesEmergencyTransport(early, { disposition: draft.disposition, directive: draft.patientMessage })));
  const admission: GatesAdmission = { policy: GATES_RELEASE_POLICY, packetHash, draftHash, contractOk,
    packetOk: usable, lowerThanEarly, aborted, released: !aborted && contractOk && !lowerThanEarly && usable };
  checks.push(
    { id: "rag_source_integrity", status: integrity ? "pass" : "fail", detail: "Citation quotation and selected passage identity are checked; clinical support is not established." },
    { id: "evidence_packet", status: usable ? "pass" : "fail", detail: "A nonempty integrity-valid evidence packet is required for a completed response. Missing evidence never cancels an issued action." },
    { id: "independent_review", status: "not_assessed", detail: "No model judge runs on gates-release. Clinical correctness and claim support remain unassessed." },
    { id: "care_reconciliation", status: lowerThanEarly ? "fail" : "not_assessed", detail: "An issued emergency/in-person instruction cannot be silently reduced. Disagreement is retained for clinician review." },
  );
  return { admission, checks };
}

/** Internal consistency proof, not clinical validation or server authentication.
 * Do not register this protocol in the full-critic review compatibility list. */
export function* verifyGatesReleaseSteps(run: DispositionRun, patient: string): Generator<string, boolean, string> {
  try {
    const graph = run.graph;
    if (!graph || graph.version !== GATES_RELEASE_VERSION || graph.mode !== "gates-release" || graph.release !== "gates_only"
      || graph.gatesAdmission?.policy !== GATES_RELEASE_POLICY || graph.clinicalApproval !== false
      || run.status !== "complete" || run.origin !== "agent" || run.failure !== null || run.safetyFloor !== null
      || run.profile !== "evidence-graph-opus" || run.workflowId !== "clinical-evidence-graph" || run.version !== "disposition-agent/v3"
      || run.message !== patient || !run.answer || run.answer.emergencyTransport || run.reconciliation
      || graph.judge !== null || graph.corrections !== 0 || graph.careCorrectionReleased || graph.repair || graph.careAlternative
      || graph.careReviewPacket || graph.preservedCare || graph.careCarryForward || graph.transportAdmission) return false;
    if (run.inputHash !== (yield patient) || run.answerHash !== (yield JSON.stringify(run.answer))) return false;
    if (!run.agents?.length || run.agents.some(a => a.role === "critic" || a.role === "reconciliation" || a.repairInputBinding || a.judgeSourceRepair || a.reviewInputBinding)) return false;
    const producer = run.agents.filter(a => a.role === "disposition").at(-1);
    if (!producer || producer.failure !== null) return false;
    const draft = draftSchema.parse(producer.output);
    if (!sameRepairValue(gatesAnswer(draft), run.answer) || !sameRepairValue(graph.citations, draft.citations)) return false;
    // Reconstruct the exact producer packet, not the first query's duplicate.
    // No judge binding is required for gates_only; the original gates still run.
    const hits = selectGraphEvidence(graph.retrieval, 9);
    if (run.guidance.length !== hits.length) return false;
    for (const [index, g] of run.guidance.entries()) {
      const h = hits[index];
      if (!h || h.chunk.id !== g.id || h.chunk.text !== g.summary || h.document.title !== g.title || h.document.url !== g.url
        || !g.retrievedPassages?.some(p => p.id === h.chunk.id && p.excerpt === h.chunk.text && p.excerptSha256 === h.chunk.hash)) return false;
    }
    const events = (run.responseEvents ?? []).map(e => responseEventSchema.parse(e));
    const replies = events.filter(e => e.kind === "patient_reply");
    if (events.some((e, i) => e.sequence !== i + 1 || e.kind === "care_revision") || replies.length !== 1
      || replies[0].sequence !== events.length || replies[0].text !== run.answer.patientMessage
      || replies[0].disposition !== run.answer.disposition || replies[0].emergencyTransport) return false;
    let early: SafetyNotice | null = null;
    for (const e of events) if (e.kind === "action") {
      if (early && (early.disposition === "EMERGENCY_NOW" && e.notice.disposition !== "EMERGENCY_NOW" || reducesEmergencyTransport(early, e.notice))) return false;
      early = e.notice;
    }
    const decision = yield* gatesDecisionSteps(draft, patient, run.guidance, hits, early, false);
    return graph.sourceIntegrity === true && graph.frozenPacketHash === decision.admission.packetHash
      && decision.admission.released && sameRepairValue(graph.gatesAdmission, decision.admission)
      && sameRepairValue(run.checks, decision.checks);
  } catch { return false; }
}

export function resolveGatesSteps<T>(steps: Generator<string, T, string>, hash: (text: string) => string): T {
  let state = steps.next(); while (!state.done) state = steps.next(hash(state.value)); return state.value;
}
