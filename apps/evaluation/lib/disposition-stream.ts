import { answerSchema, adaptiveAnswerSchema, reviewedEmergencyTransportSchema, validClarification, validAdaptiveQuestion, type DispositionRun, type ResponseEvent, type SafetyNotice } from "../../../src/disposition/contract.ts";
import { higherRoute, openingFromQuote, responseEventSchema } from "../../../src/disposition/progressive.ts";
import { intakeEvent } from "../../../src/disposition/intake.ts";
import { boundEmergencyTransport, prescriptionReviewOpening, reducesEmergencyTransport, PRESERVED_CARE_COPY, type ReviewedEmergencyTransport } from "../../../src/disposition/care-setting.ts";
import { verifyPreservedCare } from "./preserved-care.ts";
import { hasBoundUnsupportedCareCorrection, verifyCareAlternative, verifyPublishedJudgeSourceRepair } from "./care-alternative.ts";
import { GATES_RELEASE_VERSION, verifyGatesReleaseSteps } from "../../../src/disposition/gates-release.ts";

async function verifyGatesRelease(run: DispositionRun, patient: string) {
  const steps = verifyGatesReleaseSteps(run, patient);
  let state = steps.next();
  while (!state.done) {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state.value));
    state = steps.next(Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join(""));
  }
  return state.value;
}

// Streaming notices are actionable but never count as a completed model answer.
// Full audit records retain raw/normalized outputs and exact review packets.
// The prior 256k line limit rejected a 286k representative two-review record.
// Allow bounded room for the workflow's <=9 calls and <=60k request packets,
// including repeated provenance; this is not permission for unbounded streams.
export const DISPOSITION_STREAM_LIMITS = Object.freeze({ lineCharacters: 1_048_576, totalBytes: 2_097_152, events: 32 });
export type StreamEventTiming = { receivedAtMs: number; publishedAtMs: number };
export async function readDispositionStream(response: Response, message: string, onNotice: (notice: SafetyNotice) => void, onEvent?: (event: ResponseEvent, timing: StreamEventTiming) => void,
  onReceipt?: (event: ResponseEvent, receivedAtMs: number) => void): Promise<DispositionRun> {
  if (!response.body || !response.headers.get("content-type")?.includes("application/x-ndjson")) throw new Error("Unexpected response format.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: DispositionRun | null = null;
  let emergencySeen = false;
  let floor: string | null = null;
  let activeDirective: string | null = null;
  let revision: Extract<ResponseEvent, { kind: "care_revision" }> | null = null;
  let sequence = 0;
  let bytesReceived = 0;
  const events: ResponseEvent[] = [];
  const pendingRevisionEvents: ResponseEvent[] = [];
  const received = new Map<ResponseEvent, number>();
  const publish = (event: ResponseEvent) => onEvent?.(event, { receivedAtMs: received.get(event)!, publishedAtMs: performance.now() });
  let reply: Extract<ResponseEvent, { kind: "patient_reply" }> | null = null;
  const reducesTransport = (disposition: string, directive: string, emergencyTransport?: ReviewedEmergencyTransport) => reducesEmergencyTransport(
    floor && activeDirective ? { disposition: floor, directive: activeDirective } : null,
    { disposition, directive, emergencyTransport },
  );
  const consume = async (line: string) => {
    const event = JSON.parse(line);
    if (result) throw new Error("Unexpected event after final assessment.");
    if (event.type === "response_event") {
      const item = responseEventSchema.parse(event.event);
      // Telemetry only: receipt is not clinical publication or validation.
      const receivedAtMs = performance.now(); received.set(item, receivedAtMs); onReceipt?.(item, receivedAtMs);
      if (item.sequence !== ++sequence) throw new Error("Out-of-order assessment event.");
      if (revision && item.kind !== "patient_reply") throw new Error("Unexpected event after a pending care revision.");
      if (item.kind === "action") {
        if (higherRoute(floor, item.notice.disposition) !== item.notice.disposition) throw new Error("An earlier care instruction cannot be downgraded.");
        if (reducesTransport(item.notice.disposition, item.notice.directive)) throw new Error("Emergency transport cannot be reduced without an explicit care revision.");
        floor = item.notice.disposition; emergencySeen ||= floor === "EMERGENCY_NOW";
        activeDirective = item.notice.directive;
        onNotice(item.notice);
      } else if (item.kind === "care_revision") {
        const r = item.reconciliation;
        if (revision || reply || r.status !== "revised" || r.from.disposition !== floor || r.from.directive !== activeDirective) throw new Error("Unbound care revision.");
        revision = item;
        floor = r.to.disposition;
        activeDirective = r.to.directive;
        emergencySeen = floor === "EMERGENCY_NOW";
      } else if (item.kind === "opening") {
        const recognized = openingFromQuote(item.quote, message)?.text === item.text || prescriptionReviewOpening(item.quote, message)?.text === item.text;
        if (!recognized || floor || reply) throw new Error("Invalid opening message.");
      } else if (item.kind === "intake_question") {
        const adaptive = validAdaptiveQuestion(item, message);
        const prior = events.filter((event) => event.kind === "intake_question");
        if ((!adaptive && intakeEvent({ questionId: item.questionId, quote: item.quote }, message)?.text !== item.text) || floor === "EMERGENCY_NOW" || reply || (adaptive ? prior.length >= 2 || prior.some((event) => !validAdaptiveQuestion(event, message)) : prior.length > 0)) throw new Error("Invalid intake question.");
      } else {
        if (reply || higherRoute(floor, item.disposition) !== item.disposition) throw new Error("Conflicting preliminary reply.");
        if (item.emergencyTransport && !boundEmergencyTransport(item.emergencyTransport, item.text, message)) throw new Error("Unbound reviewed emergency transport.");
        if (reducesTransport(item.disposition, item.text, item.emergencyTransport)) throw new Error("Emergency transport cannot be reduced without an explicit care revision.");
        reply = item;
      }
      events.push(item);
      // Reply and revision provenance arrives with the adjacent final result.
      // Keep urgent actions and questions immediate, but do not publish answer
      // prose and only afterwards discover a missing/malformed final record.
      if (revision || item.kind === "patient_reply") pendingRevisionEvents.push(item); else publish(item);
    } else if (event.type === "safety_notice") {
      const notice = event.notice;
      if (notice?.disposition !== "EMERGENCY_NOW" || typeof notice.directive !== "string" || !["initial_screen", "emergency_agent"].includes(notice.source)) throw new Error("Invalid emergency notice.");
      emergencySeen = true;
      if (reducesTransport(notice.disposition, notice.directive)) throw new Error("Emergency transport cannot be reduced without an explicit care revision.");
      floor = notice.disposition; activeDirective = notice.directive;
      onNotice(notice);
    } else if (event.type === "result") {
      if (!["complete", "awaiting_input", "review_required", "unavailable"].includes(event.result?.status) || (event.result.status === "complete" && !event.result.answer)) throw new Error("Invalid assessment completion state.");
      const adaptive = ["adaptive-opus", "adaptive-no-retrieval", "adaptive-critique", "base-opus", "evidence-graph-opus"].includes(event.result?.profile);
      const transport = event.result.answer?.emergencyTransport;
      if (event.result.answer && Object.hasOwn(event.result.answer, "emergencyTransport") && !transport) throw new Error("Invalid reviewed emergency transport metadata.");
      const baseAnswer = event.result.answer && { ...event.result.answer };
      if (baseAnswer) delete baseAnswer.emergencyTransport;
      // Reviewed metadata is application-produced, not an extension the final
      // model may invent. Validate it separately and bind the server admission,
      // patient quotation, exact directive and streamed event to one result.
      const preservedCare = event.result.graph?.preservedCare ? await verifyPreservedCare(event.result, message) : false;
      if (event.result.graph?.preservedCare && !preservedCare) throw new Error("Unbound preserved care.");
      const graphVersion = /^evidence-graph\/v([1-9]\d*)$/.exec(event.result.graph?.version ?? "");
      const declaresGates = event.result.graph?.mode === "gates-release" || event.result.graph?.release === "gates_only" || event.result.graph?.version === GATES_RELEASE_VERSION;
      const gatesComplete = declaresGates && event.result.status === "complete" && await verifyGatesRelease(event.result, message);
      if (declaresGates && event.result.status === "complete" && !gatesComplete) throw new Error("Unbound gates-only release.");
      // Shared producer selection verifies duplicate-query Hit metadata too.
      // Only a replay-verified v25 gates release bypasses critic source-repair
      // proof. All event, transport, identity and no-downgrade checks still run.
      if (event.result.profile === "evidence-graph-opus" && event.result.status === "complete" && !(graphVersion && Number(graphVersion[1]) <= 22)
        && !gatesComplete && !await verifyPublishedJudgeSourceRepair(event.result, message)) throw new Error("Unbound judge source repair.");
      const careAlternative = event.result.graph?.careAlternative ? await verifyCareAlternative(event.result, message) : false;
      if (event.result.graph?.careAlternative && !careAlternative) throw new Error("Unbound care alternative.");
      const alternativeTransition = revision?.reconciliation.from.disposition === "EMERGENCY_NOW"
        && revision.reconciliation.to.disposition === "SAME_DAY_IN_PERSON";
      const knownLegacyAlternative = Boolean(graphVersion && Number(graphVersion[1]) <= 22);
      if (event.result.profile === "evidence-graph-opus" && event.result.status === "complete" && !knownLegacyAlternative
        && alternativeTransition && !careAlternative && !await hasBoundUnsupportedCareCorrection(event.result, message)) throw new Error("Missing reviewed alternative provenance.");
      const legacyCareProtocol = Boolean(graphVersion && Number(graphVersion[1]) <= 21);
      const finalCare = event.result.answer ? { disposition: event.result.answer.disposition, directive: event.result.answer.patientMessage } : event.result.safetyFloor;
      // A care revision is a claim to validate, not a substitute for review
      // provenance. An unchanged, already-issued safety action needs no new
      // review proof. Newly introduced/corrected care does, even if its flags
      // or the entire proof object were omitted from a malformed result.
      const newlyIntroducedCare = finalCare && (!floor || finalCare.disposition !== floor || finalCare.directive !== activeDirective || revision);
      if (event.result.profile === "evidence-graph-opus" && event.result.status !== "complete" && !legacyCareProtocol && !preservedCare
        && (event.result.graph?.careCorrectionReleased === true || event.result.graph?.careCarryForward?.used === true || newlyIntroducedCare)) throw new Error("Missing reviewed care provenance.");
      if (event.result.profile === "evidence-graph-opus" && event.result.status !== "complete" && !legacyCareProtocol && !preservedCare && baseAnswer
        && (event.result.status !== "review_required" || baseAnswer.reason !== PRESERVED_CARE_COPY.reason || baseAnswer.vitalSigns !== PRESERVED_CARE_COPY.vitalSigns
          || baseAnswer.evidenceLimitations !== PRESERVED_CARE_COPY.evidenceLimitations || baseAnswer.reviewPriority !== null || baseAnswer.workType !== null
          || [baseAnswer.differential, baseAnswer.redFlags, baseAnswer.questions, baseAnswer.evidence].some(value => !Array.isArray(value) || value.length))) throw new Error("Unreviewed explanation cannot accompany preserved early care.");
      const currentTransport = event.result.graph?.transportAdmission?.status === "admitted" && JSON.stringify(event.result.graph.transportAdmission.binding) === JSON.stringify(transport);
      if (transport && (event.result.profile !== "evidence-graph-opus" || event.result.answer.disposition !== "EMERGENCY_NOW" || !reviewedEmergencyTransportSchema.safeParse(transport).success || !boundEmergencyTransport(transport, event.result.answer.patientMessage, message) || (!currentTransport && !preservedCare))) throw new Error("Unbound reviewed emergency transport.");
      if (!["disposition-agent/v2", "disposition-agent/v3"].includes(event.result?.version) || event.result.message !== message || (baseAnswer !== null && !(adaptive ? adaptiveAnswerSchema : answerSchema).safeParse(baseAnswer).success)) throw new Error("Unexpected assessment. No result accepted.");
      if (event.result.status === "awaiting_input") {
        const q = event.result.clarification;
        const last = events.filter((item) => item.kind === "intake_question").at(-1);
        if (!adaptive || event.result.answer !== null || !q || !validClarification(q, message) || !last || last.text !== q.question || last.why !== q.why || last.quote !== q.quote || reply || emergencySeen) throw new Error("Invalid pending clarification.");
      }
      if (emergencySeen && event.result.answer?.disposition !== "EMERGENCY_NOW" && !(event.result.answer === null && event.result.status !== "complete" && event.result.safetyFloor?.disposition === "EMERGENCY_NOW" && typeof event.result.safetyFloor?.directive === "string")) throw new Error("The final assessment could not preserve the emergency instruction. Follow the instruction above.");
      if (event.result.version === "disposition-agent/v3") {
        const saved = Array.isArray(event.result.responseEvents) ? event.result.responseEvents.map((item: unknown) => responseEventSchema.parse(item)) : null;
        if (JSON.stringify(events) !== JSON.stringify(saved)) throw new Error("The saved response does not match the emitted event log.");
      }
      if (event.result.answer && higherRoute(floor, event.result.answer.disposition) !== event.result.answer.disposition) throw new Error("The final assessment contradicts the earlier action.");
      if (event.result.answer && reducesTransport(event.result.answer.disposition, event.result.answer.patientMessage, transport)) throw new Error("Emergency transport cannot be reduced without an explicit care revision.");
      if (!event.result.answer && event.result.safetyFloor && reducesTransport(event.result.safetyFloor.disposition, event.result.safetyFloor.directive)) throw new Error("Emergency transport cannot be reduced without an explicit care revision.");
      const reviewedCareOnly = event.result.profile === "evidence-graph-opus" && event.result.status === "review_required" && event.result.graph?.careCorrectionReleased === true && event.result.graph?.release === "clinician_required";
      if (revision && ((!reviewedCareOnly && event.result.status !== "complete") || JSON.stringify(event.result.reconciliation) !== JSON.stringify(revision.reconciliation) || event.result.answer?.disposition !== revision.reconciliation.to.disposition || event.result.answer?.patientMessage !== revision.reconciliation.to.directive)) throw new Error("The final assessment does not match the explicit care revision.");
      if (!revision && event.result.reconciliation?.status === "revised") throw new Error("Care revision was not emitted.");
      if (reply && event.result.answer && (reply.disposition !== event.result.answer.disposition || reply.text !== event.result.answer.patientMessage || JSON.stringify(reply.emergencyTransport) !== JSON.stringify(transport))) throw new Error("The final assessment changed an already-visible reply.");
      result = event.result;
      for (const pending of pendingRevisionEvents) publish(pending);
    } else if (event.type === "heartbeat") {
      // Transport liveness is not a clinical event and must not alter the saved
      // event sequence, safety floor, reply, or assessment completion state.
      if (!Number.isSafeInteger(event.elapsedMs) || event.elapsedMs < 0 || Object.keys(event).some(key => !["type", "elapsedMs"].includes(key))) throw new Error("Invalid connection heartbeat.");
    } else if (event.type === "error") throw new Error("The assessment could not finish. Any early care instruction still applies; the preliminary explanation is incomplete.");
    else if (event.type !== "started") throw new Error("Unexpected stream event.");
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      bytesReceived += value?.byteLength ?? 0;
      if (bytesReceived > DISPOSITION_STREAM_LIMITS.totalBytes || events.length > DISPOSITION_STREAM_LIMITS.events) throw new Error("Assessment stream exceeds its bounded event budget.");
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        if (newline > DISPOSITION_STREAM_LIMITS.lineCharacters) throw new Error("Assessment response exceeds the expected size.");
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1); if (line.trim()) await consume(line);
      }
      if (buffer.length > DISPOSITION_STREAM_LIMITS.lineCharacters) throw new Error("Assessment response exceeds the expected size.");
      if (done) break;
    }
    if (buffer.trim() || !result) throw new Error("Connection ended before the assessment finished. Any earlier care instruction still applies.");
    return result;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
