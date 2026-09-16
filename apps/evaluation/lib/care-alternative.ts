import { z } from "zod";
import { reviewedEmergencyTransportSchema, type DispositionRun } from "../../../src/disposition/contract.ts";
import { careAlternativeHashInputs, reconcileCareAlternative, type CareAlternativeInput } from "../../../src/disposition/care-alternative.ts";
import { responseEventSchema } from "../../../src/disposition/progressive.ts";
import { sameRepairValue } from "../../../src/disposition/repair-values.ts";
import { reconstructReviewedProducerSteps } from "./preserved-care.ts";
import { boundEmergencyTransport, isEmsInstruction } from "../../../src/disposition/care-setting.ts";
import type { draftSchema } from "../../../src/disposition/graph-output.ts";
import { exactStructuredJudgeAnchor } from "../../../src/disposition/judge-anchors.ts";
import { unchangedJudgeSerialization, verifyJudgeSourceRepairBindingSteps } from "../../../src/disposition/judge-source-repair-binding.ts";

const digest = async (text: string) => Array.from(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))), b => b.toString(16).padStart(2, "0")).join("");
const checkSchema = z.object({ id: z.string().min(1), status: z.enum(["pass", "fail", "not_assessed"]), detail: z.string().optional() }).strict();
const metadataSchema = z.object({ proof: z.unknown(), packet: z.object({ units: z.array(z.object({ id: z.string(), text: z.string() }).strict()) }).passthrough(), checks: z.array(checkSchema) }).strict();
type VerificationSteps = Generator<string, boolean, string>;
const criterionIds = ["undertriage", "overtriage", "patient_grounding", "claim_support", "safety_net", "clarification_delay", "ownership"];

/** Canonical answer from an exact reviewed draft, including typed transport.
 * Checks model-record consistency, not independent verification of EMS. */
export function canonicalReviewedAnswer(run: DispositionRun, draft: ReturnType<typeof draftSchema.parse>) {
  const { citations, transportIntent: intent, ...rest } = draft;
  const transport = run.answer?.emergencyTransport;
  if (intent) {
    const admission = run.graph?.transportAdmission, review = run.graph?.judge?.transportReview;
    if (draft.disposition !== "EMERGENCY_NOW" || !transport || !reviewedEmergencyTransportSchema.safeParse(transport).success
      || !boundEmergencyTransport(transport, draft.patientMessage, run.message) || transport.mode !== intent.mode || transport.activationQuote !== intent.activationQuote
      || admission?.status !== "admitted" || admission.code !== "TRANSPORT_ADMITTED" || !sameRepairValue(admission.binding, transport)
      || review?.verdict !== "supported" || review.mode !== intent.mode || !draft.patientMessage.includes(review.draftQuote)) return null;
    if (intent.mode === "continue_ems" ? !intent.activationQuote || !run.message.includes(intent.activationQuote) || review.activation?.quote !== intent.activationQuote
      || !review.activation.currentPatient || !review.activation.currentEpisode || !review.activation.active : intent.activationQuote !== null || review.activation !== null) return null;
  } else if (transport) return null;
  return { ...rest, ...(transport ? { emergencyTransport: transport } : {}), evidence: citations.map(c => ({ sourceId: c.passageId, claim: c.claim })) };
}

/** Check actual selected evidence and patient-visible context, not just a
 * packet hash supplied by the same metadata being verified. */
function* packetContentSteps(run: DispositionRun, patient: string, draft: ReturnType<typeof draftSchema.parse>, notice: CareAlternativeInput["issued"]["notice"] | null, packet: unknown): VerificationSteps {
  const graph = run.graph!;
  const sources = run.guidance.map(guidance => {
    const hit = graph.retrieval.flatMap(retrieval => retrieval.hits).find(hit => hit.chunk.id === guidance.id && hit.chunk.text === guidance.summary);
    if (!hit) throw new Error("Missing alternative evidence.");
    return { guidance, hit, unit: { id: `source:${hit.chunk.id}`, text: `${hit.document.kind}; ${hit.document.scope}; publication: ${hit.document.publicationDate ?? "unknown"}\n${hit.chunk.text}` } };
  });
  if (new Set(sources.map(source => source.unit.id)).size !== sources.length) return false;
  for (const { guidance, hit } of sources) {
    if ((yield hit.chunk.text) !== hit.chunk.hash || !guidance.retrievedPassages?.some(p => p.id === hit.chunk.id && p.excerpt === hit.chunk.text && p.excerptSha256 === hit.chunk.hash)) return false;
  }
  if (draft.citations.some(citation => !sources.some(({ hit }) => hit.chunk.id === citation.passageId && hit.chunk.text.includes(citation.quote)))) return false;
  const questions = z.array(responseEventSchema).parse(run.responseEvents).filter(event => event.kind === "intake_question");
  const expectedUnits = [{ id: "patient", text: patient }, { id: "draft", text: JSON.stringify(draft) },
    ...(notice ? [{ id: "early", text: JSON.stringify({ notice, basis: graph.safety?.basis }) }] : []),
    ...(questions.length ? [{ id: "issued_question", text: JSON.stringify(questions) }] : []), ...sources.map(source => source.unit)];
  const parsed = metadataSchema.shape.packet.parse(packet);
  return sameRepairValue(parsed.units, expectedUnits);
}

const verifySync = (steps: VerificationSteps, sha256: (text: string) => string): boolean => {
  try { let state = steps.next(); while (!state.done) state = steps.next(sha256(state.value)); return state.value; }
  catch { return false; }
};
const verifyAsync = async (steps: VerificationSteps): Promise<boolean> => {
  try { let state = steps.next(); while (!state.done) state = steps.next(await digest(state.value)); return state.value; }
  catch { return false; }
};

/** The pre-existing unsupported-action correction remains distinct from a
 * supported alternative. Do not let a changed/omitted graph summary masquerade
 * as that exception to the v23 alternative-proof requirement. */
function* unsupportedCareCorrectionSteps(run: DispositionRun, patient: string): VerificationSteps {
  try {
    const judge = run.graph?.judge, revision = run.reconciliation;
    if (run.profile !== "evidence-graph-opus" || run.version !== "disposition-agent/v3" || run.workflowId !== "clinical-evidence-graph"
      || run.status !== "complete" || run.origin !== "agent" || run.failure !== null || !run.answer || run.safetyFloor !== null
      || run.graph?.release !== "model_reviewed" || run.graph.clinicalApproval !== false || run.graph.sourceIntegrity !== true
      || run.inputHash !== (yield patient) || run.answerHash !== (yield JSON.stringify(run.answer))
      || !judge || judge.earlyAction !== "unsupported" || !judge.earlyCorrection || judge.verdict !== "accept"
      || judge.reviewScope !== "draft-and-issued-question/v2" || judge.criteria.length !== 7 || new Set(judge.criteria.map(c => c.id)).size !== 7
      || judge.criteria.some(c => c.verdict !== "pass" || !criterionIds.includes(c.id)) || revision?.status !== "revised"
      || !judge.earlyCorrection.patientQuotes.length || judge.earlyCorrection.patientQuotes.some(quote => !patient.includes(quote))
      || revision.reason !== judge.earlyCorrection.reason || run.message !== patient
      || isEmsInstruction(revision.from.directive) && run.answer.disposition !== "EMERGENCY_NOW" && !judge.earlyCorrection.triggerMisattributedOrCorrected) return false;
    const records = run.agents ?? [], criticIndex = records.findLastIndex(record => record.role === "critic"), critic = records[criticIndex];
    if (!critic || critic.failure !== null || !sameRepairValue(critic.output, judge) || !critic.reviewInputBinding
      || critic.reviewInputBinding.patientHash !== (yield patient)) return false;
    const hashes: string[] = []; for (const record of records) hashes.push(yield JSON.stringify(record.output));
    const producer = yield* reconstructReviewedProducerSteps(run, hashes, critic.reviewInputBinding.draftHash);
    if (!producer || producer.index >= criticIndex || records.slice(producer.index + 1).some(record => record.role === "disposition")) return false;
    const packet = run.graph?.careReviewPacket;
    const events = z.array(responseEventSchema).parse(run.responseEvents);
    const action = events.filter(event => event.kind === "action").at(-1), revisions = events.filter(event => event.kind === "care_revision"), replies = events.filter(event => event.kind === "patient_reply");
    if (events.some((event, index) => event.sequence !== index + 1) || revisions.length !== 1 || replies.length !== 1
      || !sameRepairValue(revisions[0].reconciliation, revision) || !action?.sequence || action.sequence >= revisions[0].sequence!
      || revisions[0].sequence! >= replies[0].sequence! || replies[0].sequence !== events.length
      || replies[0].disposition !== run.answer.disposition || replies[0].text !== run.answer.patientMessage || !sameRepairValue(replies[0].emergencyTransport, run.answer.emergencyTransport)) return false;
    if (!packet || !action || action.notice.disposition !== revision.from.disposition || action.notice.directive !== revision.from.directive
      || critic.reviewInputBinding.packetHash !== (yield JSON.stringify(packet))
      || !(yield* packetContentSteps(run, patient, producer.draft, action.notice, packet))) return false;
    if (!(yield* verifyJudgeSourceRepairBindingSteps(critic, packet))) return false;
    if (!packet.hasIssuedEarlyAction || judge.criteria.some(criterion => !criterion.anchors.length || criterion.anchors.some(anchor =>
      !["patient", "draft", "issued_question"].includes(anchor.unit) && !anchor.unit.startsWith("source:")
      || !packet.units.some(unit => unit.id === anchor.unit && exactStructuredJudgeAnchor(unit, anchor.quote))))
      || !judge.criteria.find(criterion => criterion.id === "claim_support")?.anchors.some(anchor => anchor.unit.startsWith("source:"))) return false;
    return sameRepairValue(run.answer, canonicalReviewedAnswer(run, producer.draft))
      && revision.to.disposition === run.answer?.disposition && revision.to.directive === run.answer?.patientMessage;
  } catch { return false; }
}

export function hasBoundUnsupportedCareCorrectionSync(run: DispositionRun, patient: string, sha256: (text: string) => string): boolean {
  return verifySync(unsupportedCareCorrectionSteps(run, patient), sha256);
}
export function hasBoundUnsupportedCareCorrection(run: DispositionRun, patient: string): Promise<boolean> {
  return verifyAsync(unsupportedCareCorrectionSteps(run, patient));
}

/** Verify one exact completed alternative and its retained review records.
 * This is browser-side consistency verification, not server authentication,
 * source endorsement, clinical approval, or proof of real service capacity.
 * No Node, model runtime, or provider module enters the browser bundle.
 */
function* careAlternativeSteps(run: DispositionRun, patient: string): VerificationSteps {
  try {
    const graph = run.graph, answer = run.answer;
    const version = /^evidence-graph\/v([1-9]\d*)$/.exec(graph?.version ?? "");
    if (!graph || !version || Number(version[1]) < 23 || !answer || !graph.careAlternative
      || run.profile !== "evidence-graph-opus" || run.version !== "disposition-agent/v3" || run.workflowId !== "clinical-evidence-graph"
      || run.status !== "complete" || run.origin !== "agent" || run.failure !== null || run.safetyFloor !== null
      || graph.release !== "model_reviewed" || graph.clinicalApproval !== false || graph.sourceIntegrity !== true
      || graph.preservedCare || graph.careCorrectionReleased || graph.careCarryForward?.used
      || run.message !== patient || run.inputHash !== (yield patient)
      || run.answerHash !== (yield JSON.stringify(answer))) return false;
    const metadata = metadataSchema.parse(graph.careAlternative);
    const events = z.array(responseEventSchema).parse(run.responseEvents);
    if (events.some((event, index) => event.sequence !== index + 1)) return false;
    const revisions = events.filter(e => e.kind === "care_revision"), replies = events.filter(e => e.kind === "patient_reply");
    const revision = revisions[0], reply = replies[0];
    const issued = events.filter(e => e.kind === "action").at(-1);
    if (revisions.length !== 1 || replies.length !== 1 || !revision || !reply || !issued?.sequence
      || issued.sequence >= revision.sequence! || revision.sequence! >= reply.sequence!
      || reply.sequence !== events.length || !sameRepairValue(run.reconciliation, revision.reconciliation)
      || reply.disposition !== answer.disposition || reply.text !== answer.patientMessage || reply.emergencyTransport) return false;

    const records = run.agents ?? [];
    // Do not filter failures before selecting the most recent critic.
    const criticIndex = records.findLastIndex(record => record.role === "critic"), critic = records[criticIndex];
    if (!critic || critic.failure !== null || !critic.output || !critic.reviewInputBinding
      || !sameRepairValue(critic.output, graph.judge)) return false;
    const hashes: string[] = []; for (const record of records) hashes.push(yield JSON.stringify(record.output));
    const producer = yield* reconstructReviewedProducerSteps(run, hashes, critic.reviewInputBinding.draftHash);
    if (!producer || producer.index >= criticIndex
      || records.slice(producer.index + 1).some(record => record.role === "disposition")) return false;
    const draft = producer.draft;
    const { citations, transportIntent: _intent, ...rest } = draft;
    const canonicalAnswer = { ...rest, evidence: citations.map(c => ({ sourceId: c.passageId, claim: c.claim })) };
    if (!sameRepairValue(answer, canonicalAnswer) || !sameRepairValue(graph.citations, citations)) return false;

    if (!(yield* packetContentSteps(run, patient, draft, issued.notice, metadata.packet))) return false;
    if (!(yield* verifyJudgeSourceRepairBindingSteps(critic, metadata.packet))) return false;

    const finalChecks = z.array(checkSchema).parse(run.checks);
    if (new Set(finalChecks.map(check => check.id)).size !== finalChecks.length
      || !["independent_review", "care_reconciliation"].every(id => finalChecks.find(check => check.id === id)?.status === "pass")
      || !sameRepairValue(metadata.checks, finalChecks.filter(check => !["independent_review", "care_reconciliation"].includes(check.id)))) return false;
    const input: CareAlternativeInput = {
      patient, draft, issued: { notice: issued.notice, sequence: issued.sequence }, reviewPacket: metadata.packet,
      reviews: [{ failure: critic.failure, output: critic.output, binding: { ...critic.reviewInputBinding,
        noticeHash: yield JSON.stringify(issued.notice), noticeSequence: issued.sequence, judgeHash: hashes[criticIndex] } }],
      mechanical: { draftHash: yield JSON.stringify(draft), checks: metadata.checks }, cancelled: false,
    };
    // Parse checks before prehashing so both environments hash the same strict
    // schema serialization even if transport object keys arrived reordered.
    const strings = careAlternativeHashInputs(input);
    const lookup = new Map<string, string>(); for (const text of strings) lookup.set(text, yield text);
    const admitted = reconcileCareAlternative(input, text => {
      const hash = lookup.get(text); if (!hash) throw new Error("Unprepared alternative hash."); return hash;
    });
    if (!admitted.ok || !sameRepairValue(admitted.reconciliation, metadata.proof)) return false;
    const proof = admitted.reconciliation;
    return sameRepairValue(run.reconciliation, { policy: "issued-care-reconciliation/v1", status: "revised", from: proof.from, to: proof.to, reason: proof.reason });
  } catch { return false; }
}

/** Offline scoring uses exactly the browser's validation steps and policy. */
export function verifyCareAlternativeSync(run: DispositionRun, patient: string, sha256: (text: string) => string): boolean {
  return verifySync(careAlternativeSteps(run, patient), sha256);
}
export function verifyCareAlternative(run: DispositionRun, patient: string): Promise<boolean> {
  return verifyAsync(careAlternativeSteps(run, patient));
}

/** Applied source-ID recovery on an ordinary completion must replay too.
 * Unchanged/historical judgments retain their existing admission behavior. */
function* publishedSourceRepairSteps(run: DispositionRun, patient: string): VerificationSteps {
  const records = run.agents ?? [], criticIndex = records.findLastIndex(record => record.role === "critic"), critic = records[criticIndex];
  if (!critic) return true;
  if (!critic.judgeSourceRepair) return critic.rawOutput === undefined || unchangedJudgeSerialization(critic.rawOutput, critic.output);
  if (run.status !== "complete" || run.failure !== null || !run.graph || !run.answer || run.message !== patient
    || critic.failure !== null || !sameRepairValue(critic.output, run.graph.judge)
    || run.inputHash !== (yield patient) || critic.reviewInputBinding?.patientHash !== run.inputHash) return false;
  const hashes: string[] = []; for (const record of records) hashes.push(yield JSON.stringify(record.output));
  const producer = yield* reconstructReviewedProducerSteps(run, hashes, critic.reviewInputBinding.draftHash);
  if (!producer || producer.index >= criticIndex || records.slice(producer.index + 1).some(record => record.role === "disposition")) return false;
  const packet = critic.judgeSourceRepair.packet, notice = (run.responseEvents ?? []).filter(event => event.kind === "action").at(-1)?.notice ?? null;
  if (!(yield* packetContentSteps(run, patient, producer.draft, notice, packet))
    || !(yield* verifyJudgeSourceRepairBindingSteps(critic, packet))) return false;
  return sameRepairValue(run.answer, canonicalReviewedAnswer(run, producer.draft));
}
export function verifyPublishedJudgeSourceRepair(run: DispositionRun, patient: string): Promise<boolean> {
  return verifyAsync(publishedSourceRepairSteps(run, patient));
}
