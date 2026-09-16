import { DatabaseSync } from "node:sqlite";
import type { DispositionRun, SafetyNotice } from "../../../src/disposition/contract.ts";
import { ROUTING_POLICY_VERSION, QUEUE_POLICY, routingFieldsValid } from "../../../src/disposition/routing-policy.ts";
import { recordedThreadContext, recordedRehearsals, type ThreadContext } from "./thread-context.ts";

export type QueueState = "queued" | "accepted" | "responded" | "resolved" | "reassessment" | "escalated" | "failed";
export type FollowUp = { state: "needs_plan" | "planned" | "completed" | "not_needed"; owner: string | null; dueAt: string | null; note: string; delivery: "not_connected"; updatedAt: string };
export type FollowUpInput = { state: "planned" | "completed" | "not_needed"; dueAt: string | null };
export type QueueTask = {
  episodeId: string; revision: number; version: number; state: QueueState;
  message: string; run: DispositionRun | null; owner: string | null;
  queuedAt: string; dueAt: string | null; updatedAt: string; note: string;
  policy: string; overdue: boolean;
  followUp?: FollowUp;
  followUpOverdue?: boolean;
  safetyNotice?: SafetyNotice;
  inputContext?: ThreadContext;
  rehearsal?: string;
};
export type QueueAction = "enqueue" | "accept" | "respond" | "resolve" | "follow_up";
type Episode = { revision: number; message: string; run: DispositionRun | null };

// Local single-user demonstration. Separate from physician adjudication and
// immutable model artifacts. No prescribing, delivery or clinician attestation.
export function clinicianQueueStore(path: string, clock = () => new Date()) {
  const db = new DatabaseSync(path, { timeout: 150 });
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA synchronous=FULL");
  db.exec("CREATE TABLE IF NOT EXISTS episodes (id TEXT PRIMARY KEY, payload TEXT NOT NULL) STRICT");
  db.exec("CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, payload TEXT NOT NULL) STRICT");
  db.exec("CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, episode TEXT NOT NULL, at TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL) STRICT");
  db.exec("CREATE INDEX IF NOT EXISTS idx_events_episode ON events(episode, id)");
  db.exec("PRAGMA optimize");
  const now = () => clock().toISOString();
  const get = <T>(table: "episodes" | "tasks", id: string): T | null => {
    const row = db.prepare(`SELECT payload FROM ${table} WHERE id=?`).get(id);
    return row ? JSON.parse(row.payload as string) as T : null;
  };
  const put = (table: "episodes" | "tasks", id: string, value: unknown) => db.prepare(`INSERT INTO ${table}(id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload`).run(id, JSON.stringify(value));
  const event = (id: string, kind: string, value: unknown) => db.prepare("INSERT INTO events(episode,at,kind,payload) VALUES (?,?,?,?)").run(id, now(), kind, JSON.stringify(value));
  const transaction = <T>(operation: () => T): T => {
    db.exec("BEGIN IMMEDIATE");
    try { const result = operation(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  };
  const view = (task: QueueTask): QueueTask => ({ ...task,
    inputContext: recordedThreadContext(db.prepare("SELECT payload FROM events WHERE episode=? AND kind='assessment_started' ORDER BY id").all(task.episodeId).map(row => JSON.parse(row.payload as string).message), task.message),
    rehearsal: recordedRehearsals[task.episodeId],
    overdue: !["responded", "resolved"].includes(task.state) && task.dueAt !== null && Date.parse(task.dueAt) <= clock().getTime(),
    followUpOverdue: task.followUp?.state === "planned" && task.followUp.dueAt !== null && Date.parse(task.followUp.dueAt) <= clock().getTime() });
  // No live staffing/calendar/ETA adapter is connected. Do not manufacture a
  // timestamp from public marketing hours. Historical deadlines remain stored.
  const pendingFollowUp = (): FollowUp => ({ state: "needs_plan", owner: null, dueAt: null, note: "", delivery: "not_connected", updatedAt: now() });
  const eligible = (run: DispositionRun | null) => run?.status === "complete" && !run.safetyFloor && !run.safetyNotices?.length && run.answer?.disposition === "ASYNC_PHYSICIAN" && routingFieldsValid(run.answer);
  return {
    close: () => db.close(),
    service() { return { status: "not_connected" as const, checkedAt: null, responseEta: null, intendedOwner: QUEUE_POLICY.intendedOwner, detail: QUEUE_POLICY.availability, target: QUEUE_POLICY.target }; },
    begin(episodeId: string, message: string) {
      return transaction(() => {
        const previous = get<Episode>("episodes", episodeId);
        // A continuation may append information, never replace another case.
        if (previous && message !== previous.message && !message.startsWith(previous.message + "\n\nAdditional patient information: ")) throw new Error("EPISODE_INPUT_CONFLICT");
        const revision = (previous?.revision ?? 0) + 1;
        put("episodes", episodeId, { revision, message, run: null });
        event(episodeId, "assessment_started", { revision, message });
        const task = get<QueueTask>("tasks", episodeId);
        if (task) {
          const next = { ...task, revision, message, run: null, state: "reassessment", followUp: pendingFollowUp(), note: "New information received; previous response and follow-up plan need review.", version: task.version + 1, updatedAt: now() };
          put("tasks", episodeId, next); event(episodeId, "reassessment", next);
        }
        return revision;
      });
    },
    finish(episodeId: string, revision: number, run: DispositionRun) {
      return transaction(() => {
        const episode = get<Episode>("episodes", episodeId);
        event(episodeId, "assessment_finished", { revision, run });
        if (!episode || episode.revision !== revision) return false; // retained, never promoted
        if (episode.message !== run.message) throw new Error("RUN_INPUT_CONFLICT");
        put("episodes", episodeId, { ...episode, run });
        const task = get<QueueTask>("tasks", episodeId);
        if (task) {
          const state: QueueState = task.safetyNotice || run.safetyFloor || ["EMERGENCY_NOW", "SAME_DAY_IN_PERSON"].includes(run.answer?.disposition ?? "") ? "escalated" : eligible(run) ? "queued" : "failed";
          // New information cannot extend an existing deadline or close work.
          const next = { ...task, run, state, note: state === "escalated" ? "Act on the in-person care instruction; queue processing must not delay care." : state === "failed" ? "Manual review required; no completed async disposition." : "Updated assessment requires fresh acceptance.", dueAt: state === "escalated" ? [task.dueAt, now()].filter((v): v is string => v !== null).sort()[0] : task.dueAt, version: task.version + 1, updatedAt: now() };
          put("tasks", episodeId, next); event(episodeId, "assessment_applied", next);
        }
        return true;
      });
    },
    notice(episodeId: string, revision: number, notice: SafetyNotice) {
      transaction(() => {
        if (get<Episode>("episodes", episodeId)?.revision !== revision) return;
        event(episodeId, "care_instruction", { revision, notice });
        const task = get<QueueTask>("tasks", episodeId);
        if (!task || task.safetyNotice?.disposition === "EMERGENCY_NOW") return;
        const next = { ...task, safetyNotice: notice, state: "escalated", version: task.version + 1, updatedAt: now(), dueAt: now(), note: "Follow the care instruction now; do not wait for queue processing." };
        put("tasks", episodeId, next); event(episodeId, "escalated", next);
      });
    },
    fail(episodeId: string, revision: number) {
      transaction(() => {
        if (get<Episode>("episodes", episodeId)?.revision !== revision) return;
        const task = get<QueueTask>("tasks", episodeId);
        event(episodeId, "assessment_failed", { revision });
        if (task) { const next = { ...task, state: task.safetyNotice ? "escalated" : "failed", version: task.version + 1, updatedAt: now(), note: "Assessment interrupted. Manual review required; prior care instructions still apply." }; put("tasks", episodeId, next); event(episodeId, "failure_applied", next); }
      });
    },
    act(episodeId: string, revision: number, action: QueueAction, version: number | null, note = "", followUp?: FollowUpInput) {
      return transaction(() => {
        const episode = get<Episode>("episodes", episodeId);
        if (!episode || episode.revision !== revision) throw new Error("STALE_ASSESSMENT");
        const old = get<QueueTask>("tasks", episodeId);
        if (action === "enqueue") {
          if (!eligible(episode.run)) throw new Error("ASYNC_ASSESSMENT_REQUIRED");
          if (old) return view(old); // idempotent receipt, never resets due date
          const at = now();
          const task: QueueTask = { episodeId, revision, version: 1, state: "queued", message: episode.message, run: episode.run, owner: null, queuedAt: at, dueAt: null, updatedAt: at, note: "", policy: ROUTING_POLICY_VERSION, overdue: false, followUp: pendingFollowUp() };
          put("tasks", episodeId, task); event(episodeId, "queued", task); return view(task);
        }
        if (!old || old.version !== version) throw new Error("STALE_TASK");
        if (action === "follow_up") {
          if (!["accepted", "responded", "escalated", "failed"].includes(old.state)) throw new Error("INVALID_TRANSITION");
          if (note.trim().length < 10) throw new Error("NOTE_REQUIRED");
          if (!followUp || !["planned", "completed", "not_needed"].includes(followUp.state)) throw new Error("FOLLOW_UP_INVALID");
          if (followUp.state === "planned" && (!followUp.dueAt || !Number.isFinite(Date.parse(followUp.dueAt)) || Date.parse(followUp.dueAt) <= clock().getTime())) throw new Error("FOLLOW_UP_INVALID");
          if (followUp.state !== "planned" && followUp.dueAt !== null) throw new Error("FOLLOW_UP_INVALID");
          if (followUp.state === "completed" && old.followUp?.state !== "planned") throw new Error("INVALID_TRANSITION");
          const next: QueueTask = { ...old, version: old.version + 1, updatedAt: now(), followUp: { state: followUp.state, dueAt: followUp.state === "completed" ? old.followUp!.dueAt : followUp.dueAt, owner: "Demo reviewer", note: note.trim(), delivery: "not_connected", updatedAt: now() } };
          put("tasks", episodeId, next); event(episodeId, "follow_up_recorded", next); return view(next);
        }
        const allowed = action === "accept" ? ["queued"] : action === "respond" ? ["accepted"] : ["responded", "escalated", "failed"];
        if (!allowed.includes(old.state)) throw new Error("INVALID_TRANSITION");
        if (action !== "accept" && note.trim().length < 10) throw new Error("NOTE_REQUIRED");
        if (action === "resolve" && old.followUp && !["completed", "not_needed"].includes(old.followUp.state)) throw new Error("FOLLOW_UP_OPEN");
        const state = action === "accept" ? "accepted" : action === "respond" ? "responded" : "resolved";
        const next: QueueTask = { ...old, state, version: old.version + 1, owner: "Demo reviewer", note: note.trim(), updatedAt: now() };
        put("tasks", episodeId, next); event(episodeId, state, next); return view(next);
      });
    },
    list() {
      return (db.prepare("SELECT payload FROM tasks").all().map(row => view(JSON.parse(row.payload as string))) as QueueTask[])
        .sort((a, b) => Number(a.state === "resolved") - Number(b.state === "resolved") || Number(b.state === "escalated") - Number(a.state === "escalated") || Number(Boolean(b.followUpOverdue)) - Number(Boolean(a.followUpOverdue)) || Number(b.run?.answer?.reviewPriority === "priority") - Number(a.run?.answer?.reviewPriority === "priority") || a.queuedAt.localeCompare(b.queuedAt));
    },
    events(episodeId: string) { return db.prepare("SELECT id, at, kind, payload FROM events WHERE episode=? ORDER BY id").all(episodeId); },
  };
}
