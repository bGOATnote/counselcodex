import type { DispositionAnswer, DispositionRun, ResponseEvent, SafetyNotice } from "../../../src/disposition/contract.ts";
import type { CareReconciliation } from "../../../src/disposition/reconciliation.ts";
import { higherRoute } from "../../../src/disposition/progressive.ts";
import { boundEmergencyTransport, reducesEmergencyTransport, type ReviewedEmergencyTransport } from "../../../src/disposition/care-setting.ts";

// Ownership of UI state is independent of response arrival order. Abort is best
// effort; the generation number also excludes a provider/server that ignores it.
export type ClientResponseTiming = { actionMs?: number; questionMs?: number; replyMs?: number; replyPublishedMs?: number; completedMs?: number };
export function recordFirstResponseReceipt(previous: ClientResponseTiming, kind: "action" | "intake_question" | "patient_reply", elapsedMs: number): ClientResponseTiming {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return previous;
  const key = kind === "action" ? "actionMs" : kind === "intake_question" ? "questionMs" : "replyMs";
  return previous[key] === undefined ? { ...previous, [key]: Math.round(elapsedMs) } : previous;
}

export function createLatestAssessment() {
  let generation = 0;
  let controller: AbortController | undefined;
  return {
    cancel() { generation++; controller?.abort(); },
    begin() {
      controller?.abort();
      controller = new AbortController();
      const ownController = controller;
      const own = ++generation;
      return { signal: ownController.signal, abort: () => ownController.abort(), current: () => generation === own };
    },
  };
}

export function appendPatientUpdate(message: string, update: string): string {
  const value = update.trim();
  // A bare yes/no is ambiguous for a compound intake question. Preserve the
  // patient's own description; never convert it into model-inferred negatives.
  if (value.length < 10) throw new Error("Please describe the change in a short sentence, rather than just yes or no.");
  // Assistant questions are resolved separately from server-owned event records.
  // Never put generated symptoms into the patient-only string used for screening.
  const combined = `${message}\n\nAdditional patient information: ${value}`;
  if (combined.length > 12_000) throw new Error("The combined message is too long. Please shorten the update.");
  return combined;
}
export type CareInstruction = { disposition: DispositionAnswer["disposition"]; directive: string; emergencyTransport?: ReviewedEmergencyTransport };
export type CareProvenance = { origin: "final_answer" | "patient_reply" | "action" | "care_revision" | "legacy_notice"; sequence?: number; complete: boolean };
export type RetainedCare = { notice: CareInstruction; input: string; runId?: string; provenance?: CareProvenance };
type IssuedCare = { care: CareInstruction; provenance: CareProvenance; runId?: string; reconciliation?: CareReconciliation };
function correctionBinds(from: { disposition: string; directive: string }, to: { disposition: string; directive: string }, correction?: CareReconciliation) {
  return correction?.status === "revised" && correction.from.disposition === from.disposition && correction.from.directive === from.directive && correction.to.disposition === to.disposition && correction.to.directive === to.directive;
}
// Inputs here have already passed the stream reader. Select issued/displayed
// care, never a rejected draft. Source preference must not erase higher care.
export function currentIssuedCare(input: string, result: DispositionRun | null, events: ResponseEvent[], legacyNotice: SafetyNotice | null): IssuedCare | null {
  let selected: IssuedCare | null = null;
  const current = result?.message === input ? result : null;
  const consider = (care: CareInstruction, provenance: CareProvenance, correction?: CareReconciliation) => {
    const binding = care.emergencyTransport && boundEmergencyTransport(care.emergencyTransport, care.directive, input) ? care.emergencyTransport : undefined;
    const candidate = { disposition: care.disposition, directive: care.directive, ...(binding ? { emergencyTransport: binding } : {}) };
    if (selected && (higherRoute(selected.care.disposition, candidate.disposition) !== candidate.disposition || reducesEmergencyTransport(selected.care, candidate)) && !correctionBinds(selected.care, candidate, correction)) return;
    // A released correction survives a disconnect before the final artifact,
    // but cannot authorize different advice on a later event.
    const reconciliation = [correction, selected?.reconciliation].find(value => value?.status === "revised" && value.to.disposition === candidate.disposition && value.to.directive === candidate.directive);
    selected = { care: candidate, provenance, runId: current?.runId, ...(reconciliation ? { reconciliation } : {}) };
  };
  if (legacyNotice) consider(legacyNotice, { origin: "legacy_notice", complete: false });
  for (const event of events) {
    const provenance = { origin: event.kind, sequence: event.sequence, complete: false };
    if (event.kind === "action") consider(event.notice, { ...provenance, origin: "action" });
    if (event.kind === "patient_reply") consider({ disposition: event.disposition, directive: event.text, emergencyTransport: event.emergencyTransport }, { ...provenance, origin: "patient_reply" });
    if (event.kind === "care_revision") consider(event.reconciliation.to, { ...provenance, origin: "care_revision" }, event.reconciliation);
  }
  if (current?.answer && ["complete", "review_required"].includes(current.status)) consider({ disposition: current.answer.disposition, directive: current.answer.patientMessage, emergencyTransport: current.answer.emergencyTransport }, { origin: "final_answer", complete: current.status === "complete" }, current.reconciliation);
  return selected;
}
export function retainPriorCare(prior: RetainedCare | null, notice: CareInstruction | null, input: string, nextInput: string, runId?: string, reconciliation?: CareReconciliation, provenance?: CareProvenance): RetainedCare | null {
  if (input !== nextInput && !nextInput.startsWith(`${input}\n\nAdditional patient information: `)) return null;
  // A third run must not erase an unresolved instruction from the first run
  // merely because the second run produced lower-intensity advice.
  if (priorCareUnreconciled(prior, notice, reconciliation)) return prior;
  return notice ? ["EMERGENCY_NOW", "SAME_DAY_IN_PERSON"].includes(notice.disposition) ? { notice, input, runId, provenance } : null : prior;
}
export function priorCareUnreconciled(prior: RetainedCare | null, current: { disposition: string; directive: string; emergencyTransport?: ReviewedEmergencyTransport } | null, reconciliation?: CareReconciliation): boolean {
  if (!prior) return false;
  if (!current) return true;
  if (correctionBinds(prior.notice, current, reconciliation)) return false;
  return higherRoute(prior.notice.disposition, current.disposition) !== current.disposition || reducesEmergencyTransport(prior.notice, current);
}
