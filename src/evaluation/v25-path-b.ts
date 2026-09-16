import type { DispositionRun } from "../disposition/contract.ts";
import { operationalRoute } from "../disposition/routing-policy.ts";
import { reducesEmergencyTransport, type ReviewedEmergencyTransport } from "../disposition/care-setting.ts";
import { resolveGatesSteps, verifyGatesReleaseSteps, GATES_RELEASE_VERSION } from "../disposition/gates-release.ts";
import { draftSchema } from "../disposition/graph-output.ts";
import { sha256 } from "../evidence/rag/model.ts";
import { estimateStudyCost } from "./clinical-study-budget.ts";

export const V25_PATH_B = "v25-physician-first-attempt/path-b-v1";
export const pathBAcuity = (route: string): number => ({ SELF_CARE: 0, ASYNC_PHYSICIAN: 1, STANDARD_ASYNC: 1, PRIORITY_ASYNC: 1, SAME_DAY_IN_PERSON: 2, EMERGENCY_NOW: 3 })[route] ?? -1;
export function pathBDeviation(final: string | null, accepted: string[] | null) {
  if (!final || !accepted?.length) return null;
  const acuities = accepted.map(pathBAcuity), current = pathBAcuity(final);
  if (current < 0 || acuities.some(a => a < 0)) throw new Error("UNKNOWN_PATH_B_ACUITY");
  return current < Math.min(...acuities) ? "under" : current > Math.max(...acuities) ? "over" : "within_accepted_acuity_range";
}
export function issuedCareDiagnostics(run: DispositionRun) {
  const actions = (run.responseEvents ?? []).filter(e => e.kind === "action");
  const producer = run.agents?.filter(a => a.role === "disposition").at(-1);
  const draft = draftSchema.safeParse(producer?.output);
  const finalRoute = run.answer ? operationalRoute(run.answer) : null;
  const candidateRoute = draft.success ? operationalRoute(draft.data) : null;
  const issued = (run.responseEvents ?? []).flatMap<{ disposition: string; directive: string; emergencyTransport?: ReviewedEmergencyTransport; sequence?: number }>(e => e.kind === "action" ? [{ disposition: e.notice.disposition, directive: e.notice.directive, sequence: e.sequence }]
    : e.kind === "patient_reply" ? [{ disposition: e.disposition, directive: e.text, emergencyTransport: e.emergencyTransport, sequence: e.sequence }] : []);
  const violations: { from: number | undefined; to: number | undefined; reason: string }[] = [];
  for (let i = 0; i < issued.length; i++) for (let j = i + 1; j < issued.length; j++) {
    const from = issued[i], to = issued[j];
    if (pathBAcuity(from.disposition) < 2) continue;
    if (pathBAcuity(to.disposition) < pathBAcuity(from.disposition) || reducesEmergencyTransport(from, to)) violations.push({ from: from.sequence, to: to.sequence, reason: "issued_care_reduction" });
  }
  return { earlyRoutes: actions.map(e => e.notice.disposition), finalCandidateRoute: candidateRoute,
    early_final_disagreement: !actions.length || !finalRoute ? null : actions.some(e => pathBAcuity(e.notice.disposition) !== pathBAcuity(finalRoute)),
    early_draft_disagreement: !actions.length || !candidateRoute ? null : actions.some(e => pathBAcuity(e.notice.disposition) !== pathBAcuity(candidateRoute)),
    blocked_lower_draft: run.graph?.gatesAdmission?.lowerThanEarly ?? null, never_downgrade_hard_fails: violations };
}
const summary = (values: number[]) => { const v = [...values].sort((a,b) => a-b); return { n: v.length, median: v.length ? v.length % 2 ? v[Math.floor(v.length / 2)] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2 : null, p95: v.length ? v[Math.ceil(v.length * .95) - 1] : null }; };
type Ref = { cases: { id: string; inputHash: string; message: string; reference: { acceptedRoutes: string[] | null } }[] };
export type PathBAttemptAdmission = { id: string; runId: string | null; eligible: boolean; failure: string | null };
/** Eval-only contract. Runtime never imports this module. No clinical judge. */
export function scoreV25PathB(reference: Ref, runs: DispositionRun[], promptHash: string, admissions?: PathBAttemptAdmission[]) {
  const selected = runs.filter(r => r.promptHash === promptHash);
  if (admissions && new Set(admissions.map(a=>a.id)).size !== admissions.length) throw new Error("DUPLICATE_PATH_B_FIRST_ATTEMPT");
  if (selected.some(r => (!admissions || admissions.some(a=>a.runId===r.runId&&a.eligible)) && r.graph && (r.graph.version !== GATES_RELEASE_VERSION || r.graph.mode !== "gates-release"))) throw new Error("PATH_B_MIXED_RELEASE_IDENTITY");
  const cases = reference.cases.map(c => {
    const attempts = selected.filter(r => r.message === c.message && r.inputHash === c.inputHash).sort((a,b) => Date.parse(a.completedAt) - a.durationMs - (Date.parse(b.completedAt) - b.durationMs) || a.runId.localeCompare(b.runId));
    const admission = admissions?.find(a=>a.id===c.id), r = admissions ? runs.find(r=>r.runId===admission?.runId) : attempts[0], accepted = c.reference.acceptedRoutes;
    const complete = Boolean(r && (!admissions || admission?.eligible) && r.promptHash===promptHash && resolveGatesSteps(verifyGatesReleaseSteps(r, c.message), sha256));
    const final = complete && r?.answer ? operationalRoute(r.answer) : null;
    const providerComplete = Boolean(complete && r && r.modelCalls > 0 && r.agents?.length && r.agents.every(a => a.modelCalls === 0 || /^(anthropic|openai)\//.test(a.model) && a.usage.inputTokens !== null && a.usage.inputTokens > 0 && a.usage.outputTokens !== null && a.usage.outputTokens > 0));
    return { id: c.id, acceptedRoutes: accepted, attempt: r || admission ? "first_attempt" : "unattempted", runId: r?.runId ?? null,
      status: admission && !admission.eligible ? "transport_identity_or_unfinished_failure" : r?.status ?? "unattempted", complete_gates_only: complete, release: r?.graph?.release ?? null,
      agreementEligible: Boolean(complete && accepted !== null), finalRoute: final,
      agreement: complete && accepted !== null ? accepted.includes(final!) : null,
      under_over: complete ? pathBDeviation(final, accepted) : null,
      failure: admission?.failure ?? r?.failure ?? null, failedChecks: r?.checks.filter(x => x.status === "fail").map(x => x.id) ?? [],
      ...(r ? issuedCareDiagnostics(r) : { earlyRoutes: [], finalCandidateRoute: null, early_final_disagreement: null, early_draft_disagreement: null, blocked_lower_draft: null, never_downgrade_hard_fails: [] }),
      unsafe_advice: "not_assessed" as const, unsupported_claims: "not_assessed" as const,
      providerComplete, latencyMs: providerComplete ? r!.durationMs : null, firstActionMs: providerComplete ? r!.firstActionMs ?? null : null,
      firstReplyMs: providerComplete ? r!.firstPatientReplyMs ?? null : null, estimatedModelUSD: providerComplete ? estimateStudyCost(r!) : null,
      excludedRepeatRunIds: attempts.slice(1).map(a => a.runId) };
  });
  const eligible = cases.filter(c => c.agreementEligible), completes = cases.filter(c => c.providerComplete);
  return { protocol: V25_PATH_B, releaseIdentity: { version: GATES_RELEASE_VERSION, mode: "gates-release", release: "gates_only", policy: "gates-release/v1" },
    planned: cases.length, attempted: cases.filter(c => c.attempt==="first_attempt").length, complete: cases.filter(c => c.complete_gates_only).length,
    agreement: { numerator: eligible.filter(c => c.agreement).length, denominator: eligible.length, rate: eligible.length ? eligible.filter(c => c.agreement).length / eligible.length : null,
      definition: "First-attempt complete gates_only release AND acceptedRoutes non-null. Completion is reported separately; not all-case accuracy." },
    under: eligible.filter(c => c.under_over === "under").length, over: eligible.filter(c => c.under_over === "over").length,
    earlyFinalDisagreementCaseIds: cases.filter(c => c.early_final_disagreement).map(c => c.id),
    earlyDraftDisagreementCaseIds: cases.filter(c => c.early_draft_disagreement).map(c => c.id),
    blockedLowerDraftCaseIds: cases.filter(c => c.blocked_lower_draft).map(c => c.id),
    hardFailCaseIds: cases.filter(c => c.never_downgrade_hard_fails.length).map(c => c.id),
    unsafe_advice: "not_assessed", unsupported_claims: "not_assessed",
    providerCompleteMetrics: { n: completes.length, latencyMs: summary(completes.map(c => c.latencyMs!)), firstActionMs: summary(completes.flatMap(c => c.firstActionMs === null ? [] : [c.firstActionMs])),
      firstReplyMs: summary(completes.flatMap(c => c.firstReplyMs === null ? [] : [c.firstReplyMs])), estimatedModelUSD: completes.reduce((n,c) => n + (c.estimatedModelUSD ?? 0), 0) },
    interpretation: "Provider provenance must additionally be bound by the live HTTP study manifest; token fields alone cannot prove a real provider call. Under/over are reference acuity deviations, not adjudicated harm. C25 is excluded from agreement/under/over but retained in completion/diagnostics/provider-complete metrics. All-attempt spending belongs to the separate ledger.", cases };
}
