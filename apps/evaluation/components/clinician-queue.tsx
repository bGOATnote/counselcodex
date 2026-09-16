"use client";
import { useEffect, useState } from "react";
import type { QueueAction, QueueTask, FollowUpInput } from "../lib/clinician-queue-store";
import type { DispositionRun } from "../../../src/disposition/contract";
import { routingTiming, routingLabel, QUEUE_POLICY } from "../../../src/disposition/routing-policy";
import { queueStateLabel, queuePreview } from "../lib/clinician-queue-presentation";
import { ResponseReview } from "./response-review";

async function queueRequest(body?: unknown) {
  const response = await fetch("/api/clinician-queue", { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", "x-counsel-review": "local-v1" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json();
  if (!response.ok && value.error === "FOLLOW_UP_OPEN") throw new Error("Follow-up is still open. Record its outcome, or document why no further follow-up is needed, before resolving this task.");
  if (!response.ok && value.error === "FOLLOW_UP_INVALID") throw new Error("Choose a valid future check-in time. The follow-up plan has not been saved.");
  if (!response.ok) throw new Error(value.error === "STALE_TASK" || value.error === "STALE_ASSESSMENT" ? "This task changed. Refresh before acting." : "Queue action was not saved. Your clinical recommendation is unchanged; retry or refresh the queue.");
  return value;
}
export function QueueReceipt({ result }: { result: DispositionRun }) {
  const [task, setTask] = useState<QueueTask | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const handoff = result.handoff;
  useEffect(() => {
    let active = true;
    void queueRequest().then(value => { if (active) setTask(value.tasks.find((item: QueueTask) => item.episodeId === handoff?.episodeId) ?? null); }).catch(() => {});
    return () => { active = false; };
  }, [handoff?.episodeId]);
  if (!handoff) return null;
  if (!handoff.persisted) return <p role="alert" className="m-6 text-[#8f3028]">Queue record could not be saved. No handoff is confirmed. The care recommendation still applies.</p>;
  if (result.status !== "complete" || result.answer?.disposition !== "ASYNC_PHYSICIAN") return task ? <p className="m-6"><a href="/queue" className="underline">Demo queue: {queueStateLabel(task)}</a> · Do not wait for the queue to follow an in-person care instruction.</p> : null;
  return <section className="mx-6 mb-6 rounded-xl border p-4" aria-label="Clinician handoff">
    <h4 className="font-semibold">Clinician handoff</h4>
    <p className="mt-2 text-sm">Intended owner: {QUEUE_POLICY.intendedOwner}. {QUEUE_POLICY.availability}</p>
    {task ? <><p role="status" className="mt-2">Saved to the demo queue · {queueStateLabel(task)}</p><a className="mt-2 inline-block underline" href="/queue">Open clinician queue</a></> : <><p className="mt-2 text-sm">Review recommended; no clinician has accepted this request.</p><button type="button" disabled={busy} className="mt-3 rounded-full bg-[#243866] px-4 py-2 text-white disabled:opacity-50" onClick={async () => { setBusy(true); setError(""); try { setTask((await queueRequest({ episodeId: handoff.episodeId, revision: handoff.revision, version: null, action: "enqueue" })).task); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } }}>{busy ? "Saving…" : "Send to demo clinician queue"}</button></>}
    {error && <p role="alert" className="mt-2 text-[#8f3028]">{error}</p>}
  </section>;
}
export function ClinicianQueue() {
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [followUpTime, setFollowUpTime] = useState("");
  const [service, setService] = useState<{ detail: string; target: string } | null>(null);
  async function refresh() { try { const value = await queueRequest(); setTasks(value.tasks); setService(value.service); setError(""); } catch (error) { setError((error as Error).message); } finally { setLoading(false); } }
  useEffect(() => { void refresh(); const timer = setInterval(() => { void refresh(); }, 15_000); return () => clearInterval(timer); }, []);
  const task = tasks.find(item => item.episodeId === selected) ?? tasks[0];
  async function act(action: QueueAction, followUp?: FollowUpInput) {
    if (!task) return;
    setBusy(true); setError("");
    try { await queueRequest({ episodeId: task.episodeId, revision: task.revision, version: task.version, action, note, ...(followUp ? { followUp } : {}) }); setNote(""); setFollowUpTime(""); await refresh(); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="v0-app"><header className="v0-header"><div><h1 className="text-2xl">Clinician queue</h1><p className="mt-1 text-sm">Local demonstration · actions do not send messages or prescribe.</p></div><nav aria-label="Workspace"><a className="underline" href="/">Disposition agent</a></nav></header><main className="v0-workspace">
    <div className="mb-5 flex items-center justify-between"><p>{tasks.filter(t => t.state !== "resolved").length} open tasks</p><button className="rounded-full border px-4 py-2" onClick={() => void refresh()}>Refresh queue</button></div>
    <section aria-label="Service availability" className="mb-5 rounded-xl border p-4 text-sm"><p><strong>Intended owner: {QUEUE_POLICY.intendedOwner}.</strong> {service?.detail ?? QUEUE_POLICY.availability}</p><p className="mt-2">{service?.target ?? QUEUE_POLICY.target}</p></section>
    {error && <p role="alert" className="mb-4 text-[#8f3028]">{error}</p>}
    {loading ? <p role="status">Loading queue…</p> : !tasks.length ? <section className="v0-panel p-6"><h2 className="text-xl">No requests queued</h2><p className="mt-2">Assess a message, then send its clinician-review recommendation here.</p><a href="/" className="mt-3 inline-block underline">Assess a message</a></section> : <div className="grid gap-5 lg:grid-cols-[minmax(240px,1fr)_minmax(0,2fr)]"><section aria-label="Queued threads" className="space-y-2">{tasks.map(item => {
      const preview = queuePreview(item);
      return <button key={item.episodeId} onClick={() => { setSelected(item.episodeId); setNote(""); setFollowUpTime(""); }} aria-pressed={task?.episodeId === item.episodeId} className={`w-full rounded-xl border p-4 text-left ${task?.episodeId === item.episodeId ? "border-[#243866] bg-[#eaf0f7]" : "bg-white"}`}>
        {item.rehearsal && <span className="mb-2 block text-sm text-[#62685f]">Engineering test</span>}
        <span className="block font-semibold">{item.overdue && item.state !== "escalated" ? "Overdue · " : ""}{queueStateLabel(item)}</span>
        {item.followUpOverdue && <span className="mt-1 block font-semibold text-[#8f3028]">Follow-up overdue · outreach not connected</span>}
        <span className="mt-3 block text-sm font-medium">{preview.label}</span>
        <span className="mt-1 block whitespace-pre-line">{preview.text}</span>
        <span className="mt-2 block text-sm">{item.run?.answer ? routingLabel(item.run.answer) : "Review required"}</span>
      </button>;
    })}</section>
      {task && <section className="v0-panel p-6" aria-label="Selected thread"><h2 className="text-2xl">{queueStateLabel(task)}</h2>
        {task.rehearsal && <p className="mt-3 rounded-lg bg-[#eaf0f7] p-3 text-sm">{task.rehearsal}. Added during browser testing; not a new report from you.</p>}
        {task.inputContext?.verified && task.inputContext.updates.length > 0 && <section className="mt-5 rounded-lg border-l-4 border-[#243866] bg-[#f3f6fa] p-4" aria-label="Latest patient update"><h3 className="font-semibold">Latest patient update</h3><p className="mt-2 whitespace-pre-line leading-7">{task.inputContext.updates.at(-1)}</p><p className="mt-2 text-sm">This assessment includes the original message and {task.inputContext.updates.length} recorded update{task.inputContext.updates.length === 1 ? "" : "s"}.</p></section>}
        <p className="mt-4">{task.owner ?? "No reviewer has accepted this task"}</p>
        {task.state !== "escalated" && <p className="mt-2 text-sm">Response ETA: unavailable · no connected staffing service.</p>}
        <details className="mt-5"><summary>{task.inputContext?.updates.length ? "Original message and earlier updates" : "Original message"}</summary><p className="mt-2 whitespace-pre-line leading-7">{task.inputContext?.original ?? task.message}</p>{task.inputContext?.updates.slice(0, -1).map((update, i) => <p key={i} className="mt-3 whitespace-pre-line leading-7"><strong>Update {i + 1}: </strong>{update}</p>)}</details>
        {task.run?.answer && <><h3 className="mt-5 font-semibold">Recommendation</h3><p className="mt-2">{routingTiming(task.run.answer, task.run.answer.disposition)}</p><p className="mt-2 whitespace-pre-line leading-7">{task.run.answer.patientMessage}</p><p className="mt-2">{task.run.answer.reason}</p></>}
        {(task.safetyNotice || task.run?.safetyFloor) && <p role="alert" className="mt-5 rounded-lg border border-red-700 p-4">{task.safetyNotice?.directive ?? task.run?.safetyFloor?.directive}</p>}
        {task.note && <p className="mt-4 whitespace-pre-line"><strong>Latest recorded note: </strong>{task.note}</p>}
        <section aria-label="Follow-up" className="mt-5 rounded-lg border p-4"><h3 className="font-semibold">Follow-up · {task.followUp?.state.replaceAll("_", " ") ?? "not recorded on this historical task"}</h3><p className="mt-2 text-sm">{QUEUE_POLICY.followUp}</p>{task.followUp?.owner && <p className="mt-2">Owner: {task.followUp.owner}</p>}{task.followUp?.dueAt && <p className="mt-2">Check-in due: {new Date(task.followUp.dueAt).toLocaleString()} {task.followUpOverdue ? "· OVERDUE" : ""}</p>}{task.followUp?.note && <p className="mt-2 whitespace-pre-line">{task.followUp.note}</p>}</section>
        {task.run && <ResponseReview key={task.run.runId} runId={task.run.runId} />}
        {task.state === "reassessment" && <p role="alert" className="mt-4">A new assessment is pending. If it remains unfinished, manual review is still required. Previous responses are not current clearance.</p>}
        {["accepted", "responded", "escalated", "failed"].includes(task.state) && <label className="mt-5 block">{task.state === "accepted" ? "Demo clinician response" : "Resolution and follow-up note"}<textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={2000} className="mt-2 w-full rounded-lg border p-3" placeholder="Record the action taken and who owns follow-up."/></label>}
        {["accepted", "responded", "escalated", "failed"].includes(task.state) && <details className="mt-4"><summary>Plan or record follow-up</summary><label className="mt-3 block text-sm">Local check-in time<input type="datetime-local" value={followUpTime} onChange={e => setFollowUpTime(e.target.value)} className="ml-3 rounded border p-2" /></label><div className="mt-3 flex flex-wrap gap-3"><button className="rounded-full border px-4 py-2 disabled:opacity-50" disabled={busy || note.trim().length < 10 || !followUpTime || !Number.isFinite(Date.parse(followUpTime))} onClick={() => void act("follow_up", { state: "planned", dueAt: new Date(followUpTime).toISOString() })}>Save follow-up plan</button>{task.followUp?.state === "planned" && <button className="rounded-full border px-4 py-2 disabled:opacity-50" disabled={busy || note.trim().length < 10} onClick={() => void act("follow_up", { state: "completed", dueAt: null })}>Record demo follow-up completed</button>}<button className="rounded-full border px-4 py-2 disabled:opacity-50" disabled={busy || note.trim().length < 10} onClick={() => void act("follow_up", { state: "not_needed", dueAt: null })}>Record no further follow-up needed</button></div><p className="mt-2 text-sm">Use the note above for the plan or outcome. Saving does not send SMS, push notifications or patient messages.</p></details>}
        <div className="mt-5 flex flex-wrap gap-3">{task.state === "queued" && <button disabled={busy} className="rounded-full bg-[#243866] px-5 py-3 text-white" onClick={() => void act("accept")}>Accept as demo reviewer</button>}{task.state === "accepted" && <button disabled={busy || note.trim().length < 10} className="rounded-full bg-[#243866] px-5 py-3 text-white disabled:opacity-50" onClick={() => void act("respond")}>Record demo response</button>}{["responded", "escalated", "failed"].includes(task.state) && <button disabled={busy || note.trim().length < 10} className="rounded-full border px-5 py-3 disabled:opacity-50" onClick={() => void act("resolve")}>Resolve demo task</button>}</div>
        {task.followUp && !["completed", "not_needed"].includes(task.followUp.state) && task.state === "responded" && <p className="mt-3 text-sm">Response recorded, not resolved. Record the follow-up plan/outcome before closing this task.</p>}
        <details className="mt-5 text-sm"><summary>Audit identifiers</summary><p className="mt-2 break-all">Episode: {task.episodeId}<br/>Revision: {task.revision} · task version: {task.version}<br/>Run: {task.run?.runId ?? "pending"}<br/>Policy at enqueue: {task.policy}<br/>Recorded deadline: {task.dueAt ?? "None; service not connected"}<br/>Queued: {task.queuedAt}<br/>Updated: {task.updatedAt}</p></details>
      </section>}
    </div>}
  </main></div>;
}
