import type { ResponseSafetyReview } from "../../../src/clinical/response-safety.ts";

const statusLabels = {
  reported: "Reported · review", explicit_denial_recorded: "Denial recorded · category not cleared",
  not_assessed: "Not established by this inventory", prior_denial_needs_recheck: "Prior denial · reassess",
  mentioned_needs_assessment: "Mentioned · assess the source statement",
  prior_report_needs_recheck: "Previously reported · reassess",
  prior_positive_now_denied: "Prior report and current denial · reconcile specific symptoms",
  conflicting_reports: "Conflicting reports · reconcile",
};
export function ResponseSafetyPanel({ review, revealed }: { review?: ResponseSafetyReview; revealed: boolean }) {
  if (!revealed || !review) return null;
  return <section aria-label="Per-turn safety evidence" className="mt-5 rounded-2xl border border-[#bcd7cd] bg-white p-5">
    <h3 className="text-lg font-semibold">Safety evidence · turn {review.assessedThroughTurn}</h3>
    <p className="mt-2 text-sm leading-6 text-[#647b76]">No blanket “no red flags” clearance. This is a limited statement inventory, not a complete clinical screen.</p>
    <div className="mt-4 grid gap-4 lg:grid-cols-2"><div><h4 className="font-semibold">Red flags and relevant context</h4><ul className="mt-2 space-y-2">{review.redFlags.map((flag) => <li key={flag.id} className="text-sm leading-6"><span className="font-medium">{flag.label}: </span>{statusLabels[flag.status]}{flag.evidence.length > 0 && <details open={flag.status === "explicit_denial_recorded"}><summary className="cursor-pointer text-xs text-[#647b76]">Exact source statements</summary>{flag.evidence.map((item, index) => <p key={index}>Turn {item.turn}: “{item.quote}”</p>)}</details>}</li>)}</ul></div>
    <div><h4 className="font-semibold">Vital signs</h4><ul className="mt-2 space-y-2">{review.vitalSigns.map((vital) => <li key={vital.id} className="text-sm leading-6"><span className="font-medium">{vital.label}: </span>{vital.status === "not_available" ? "No numeric reading extracted" : "Mentioned · verify and interpret"}{vital.observations.map((item, index) => <p key={index} className="mt-1 text-[#647b76]">Turn {item.turn}: “{item.quote}”</p>)}</li>)}</ul><p className="mt-3 text-sm font-medium text-[#875421]">Physiologic stability is not established by this inventory. Abnormal or discordant readings need clinical interpretation; missing readings must not delay emergency action.</p></div></div>
    <details className="mt-4 text-sm leading-6 text-[#647b76]"><summary className="cursor-pointer">Scope and limitations · {review.version}</summary><p>{review.interpretation}</p></details>
  </section>;
}
