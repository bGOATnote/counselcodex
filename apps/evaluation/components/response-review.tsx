"use client";
import { useEffect, useState } from "react";
import type { ReviewJob } from "../../../src/evaluation/response-review-store";
const labels: Record<string, string> = { undertriage: "Missed or delayed escalation", overtriage: "Unnecessary escalation", setting_timing: "Care setting, timing and ownership", patient_grounding: "Patient facts and uncertainty", research_support: "Research support and applicability", safety_netting: "Return precautions", clarification: "Necessity of delaying routing" };
type Feedback = { criterion: string; verdict: string; note: string; at: string };
export function ResponseReview({ runId }: { runId: string }) {
  const [job, setJob] = useState<ReviewJob | null>(null), [feedback, setFeedback] = useState<Feedback[]>([]);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [allocation, setAllocation] = useState(false);
  const [draft, setDraft] = useState<{ criterion: string; verdict: string; note: string } | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = async () => { try {
      const response = await fetch(`/api/response-review?runId=${encodeURIComponent(runId)}`, { headers: { "x-counsel-review": "local-v1" }, cache: "no-store" });
      if (!response.ok) throw new Error(); const value = await response.json();
      if (active && (!value.job || value.job.runId === runId)) { setJob(value.job); setFeedback(value.feedback); setAllocation(value.budget.allocatedUsd + 1.25 > value.budget.capUsd); setError(""); }
    } catch { if (active) setError("Independent review status could not be loaded. The care recommendation is unchanged."); } };
    setJob(null); setFeedback([]); setDraft(null); void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => { active = false; clearInterval(timer); };
  }, [runId]);
  async function post(body: unknown) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/response-review", { method: "POST", headers: { "Content-Type": "application/json", "x-counsel-review": "local-v1" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(); const value = await response.json();
      if (value.job?.runId === runId) { setJob(value.job); setFeedback(value.feedback); setDraft(null); }
    } catch { setError("Review request was not saved. No clinical action was changed."); }
    finally { setBusy(false); }
  }
  const review = job?.result?.review;
  const failures = review?.criteria.filter(c => c.verdict === "fail") ?? [];
  function download() { const url = URL.createObjectURL(new Blob([JSON.stringify({ job, feedback }, null, 2)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = `independent-review-${runId}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  return <section className="border-t p-6" aria-label="Independent clinical review">
    <h3 className="text-xl">Independent clinical review</h3>
    <p className="mt-2 text-sm">Astra audits this Opus response, including early messages. It flags concerns for your review; it does not approve care or change the route.</p>
    {review ? <><p className={`mt-3 font-semibold ${failures.length ? "text-[#8f3028]" : ""}`}>{failures.length ? `${failures.length} concern${failures.length === 1 ? "" : "s"} flagged` : review.outcome === "indeterminate" ? "Review incomplete or uncertain" : "No concerns identified by this judge"}</p>
      {failures.map(c => <p key={c.id} className="mt-2 text-sm"><strong>{labels[c.id]}: </strong>{c.reason}</p>)}
      <details className="mt-4"><summary>Inspect judgments and give feedback</summary><p className="mt-2 text-sm">This rubric has not been calibrated against physician judgments. Your feedback is saved separately; existing case reviews remain unchanged.</p>
        {review.criteria.map(c => { const recorded = feedback.filter(f => f.criterion === c.id).at(-1); return <section key={c.id} className="mt-4 border-t pt-3"><h4 className="font-semibold">{labels[c.id]} · {c.verdict === "pass" ? "No issue found" : c.verdict === "fail" ? "Concern" : "Uncertain"}</h4><p className="mt-2 text-sm">{c.reason}</p><details className="mt-2 text-sm"><summary>Quoted evidence</summary>{c.anchors.map((a, i) => <blockquote key={i} className="mt-2 border-l-2 pl-3"><p>{a.quote}</p><small>{a.unitId}</small></blockquote>)}</details>
          {recorded && <p className="mt-2 text-sm">Saved feedback: {recorded.verdict} · {recorded.note || "No additional note"}</p>}
          <button type="button" className="mt-2 text-sm underline" onClick={() => setDraft({ criterion: c.id, verdict: "", note: "" })}>Review this judgment</button>
          {draft?.criterion === c.id && <div className="mt-3 space-y-2"><label className="block text-sm">Your assessment<select aria-label={`Your assessment of ${labels[c.id]}`} className="ml-2 rounded border p-2" value={draft.verdict} onChange={e => setDraft({ ...draft, verdict: e.target.value })}><option value="">Choose…</option><option value="agree">Agree</option><option value="disagree">Disagree</option><option value="unable">Unable to judge</option></select></label><textarea aria-label="Feedback reason" placeholder="Reason (required for disagreement or uncertainty)" className="w-full rounded border p-3" rows={2} maxLength={2000} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })}/><button className="rounded-full border px-4 py-2 disabled:opacity-50" disabled={busy || !draft.verdict || (draft.verdict !== "agree" && draft.note.trim().length < 10)} onClick={() => void post({ action: "feedback", runId, packetHash: review.packetHash, ...draft })}>Save feedback</button></div>}
        </section>; })}
      </details><details className="mt-4 text-sm"><summary>Review provenance</summary><p className="mt-2 break-all">{review.judgeModel} · {review.version}<br/>Run: {runId}<br/>Packet: {review.packetHash}<br/>Trace: {job.result!.traceId} · saved: {String(job.result!.tracePersisted)}<br/>Review time: {(job.result!.durationMs / 1000).toFixed(1)} s (after response)<br/>Estimated cost: {job.result!.estimatedUsd === null ? "unknown" : `$${job.result!.estimatedUsd.toFixed(4)}`}</p><button className="mt-2 underline" onClick={download}>Download independent review</button></details></> : <>
      <p role="status" className="mt-3">{job?.state === "running" ? "Reviewing in the background…" : job?.state === "queued" ? allocation ? "Independent-review pilot allocation reached. Patient assessments are unaffected." : job.error === "REVIEW_PROVIDER_NOT_CONFIGURED" ? "The independent-review provider key is not configured. Your care recommendation is unchanged." : "Queued for independent review." : job?.state === "failed" || job?.state === "interrupted" ? "Independent review did not finish. No clinical grade was assigned; the attempted run is preserved." : "No independent review recorded yet."}</p>
      {(!job || job.state === "queued") && !allocation && <button type="button" disabled={busy} className="mt-3 rounded-full border px-4 py-2 disabled:opacity-50" onClick={() => void post({ action: "review", runId })}>{busy ? "Scheduling…" : "Run independent review"}</button>}
    </>}
    {error && <p role="alert" className="mt-3 text-sm text-[#8f3028]">{error}</p>}
  </section>;
}
