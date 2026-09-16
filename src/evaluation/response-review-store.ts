import { DatabaseSync } from "node:sqlite";
import { validateReviewPacket, type ReviewPacket } from "./response-review.ts";
import type { ReviewExecution } from "./response-review-runtime.ts";
import { EXECUTION_POLICY } from "../disposition/execution-policy.ts";

export type ReviewJob = { runId: string; packetHash: string; state: "queued" | "running" | "complete" | "failed" | "interrupted"; createdAt: string; startedAt: string | null; finishedAt: string | null; result: ReviewExecution | null; error: string | null };
export const REVIEW_RESERVATION_USD = 1.25;
export const REVIEW_PILOT_CAP_USD = 20;
// New, separately bounded review pilot. Old inference ledgers are not reset.
// Uncertain/failed calls retain their entire hold. Completed calls reconcile
// against conservatively priced recorded usage, not an arbitrary call count.
export function responseReviewStore(path: string, now = () => new Date()) {
  const db = new DatabaseSync(path, { timeout: 150 });
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
  db.exec("CREATE TABLE IF NOT EXISTS jobs (run_id TEXT PRIMARY KEY, packet_hash TEXT NOT NULL, packet TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT, result TEXT, error TEXT, reserved_usd REAL NOT NULL DEFAULT 0) STRICT");
  db.exec("CREATE TABLE IF NOT EXISTS physician_feedback (id INTEGER PRIMARY KEY, run_id TEXT NOT NULL, packet_hash TEXT NOT NULL, criterion TEXT NOT NULL, verdict TEXT NOT NULL, note TEXT NOT NULL, at TEXT NOT NULL) STRICT");
  const view = (row: Record<string, unknown>): ReviewJob => ({ runId: row.run_id as string, packetHash: row.packet_hash as string, state: row.state as ReviewJob["state"], createdAt: row.created_at as string, startedAt: row.started_at as string | null, finishedAt: row.finished_at as string | null, result: row.result ? JSON.parse(row.result as string) : null, error: row.error as string | null });
  const get = (id: string) => { const row = db.prepare("SELECT * FROM jobs WHERE run_id=?").get(id); return row ? view(row) : null; };
  const allocation = () => db.prepare("SELECT reserved_usd,result FROM jobs").all().reduce((total, row) => {
    const usage = row.result ? (JSON.parse(row.result as string) as ReviewExecution).usage : null;
    const known = usage && Number.isSafeInteger(usage.inputTokens) && Number.isSafeInteger(usage.outputTokens) && usage.inputTokens! >= 0 && usage.outputTokens! >= 0;
    // Input priced at the cache-write rate (higher than ordinary input); output
    // includes reasoning tokens. If accounting exceeds the reservation, retain
    // the full excess, which prevents further claims past the pilot cap.
    return total + (known ? (usage.inputTokens! * 12.5 + usage.outputTokens! * 50) / 1_000_000 : Number(row.reserved_usd));
  }, 0);
  return {
    close: () => db.close(), get,
    budget: () => ({ allocatedUsd: allocation(), originalReservationsUsd: Number(db.prepare("SELECT COALESCE(SUM(reserved_usd),0) AS total FROM jobs").get()!.total), capUsd: REVIEW_PILOT_CAP_USD }),
    enqueue(packet: ReviewPacket) {
      validateReviewPacket(packet);
      const prior = get(packet.runId);
      if (prior && prior.packetHash !== packet.packetHash) throw new Error("REVIEW_PACKET_CONFLICT");
      db.prepare("INSERT OR IGNORE INTO jobs(run_id,packet_hash,packet,state,created_at) VALUES(?,?,?,'queued',?)").run(packet.runId, packet.packetHash, JSON.stringify(packet), now().toISOString());
      return get(packet.runId)!;
    },
    claim(id: string): ReviewPacket | null {
      db.exec("BEGIN IMMEDIATE");
      try {
        const row = db.prepare("SELECT * FROM jobs WHERE run_id=?").get(id);
        if (!row || row.state !== "queued") { db.exec("COMMIT"); return null; }
        const packet = JSON.parse(row.packet as string); validateReviewPacket(packet);
        const total = allocation();
        if (total + REVIEW_RESERVATION_USD > REVIEW_PILOT_CAP_USD) throw new Error("REVIEW_PILOT_ALLOCATION_REACHED");
        db.prepare("UPDATE jobs SET state='running',started_at=?,reserved_usd=? WHERE run_id=? AND state='queued'").run(now().toISOString(), REVIEW_RESERVATION_USD, id);
        db.exec("COMMIT"); return packet;
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
    finish(id: string, result: ReviewExecution | null, error: string | null = null) {
      const prior = get(id);
      if (result && (!prior || result.review.runId !== id || result.review.packetHash !== prior.packetHash)) throw new Error("REVIEW_RESULT_MISMATCH");
      const updated = db.prepare("UPDATE jobs SET state=?,result=?,error=?,finished_at=? WHERE run_id=? AND state='running'").run(result ? "complete" : "failed", result ? JSON.stringify(result) : null, result ? null : (error ?? "REVIEW_EXECUTION_FAILED"), now().toISOString(), id);
      return updated.changes === 1;
    },
    interruptExpired() {
      // No automatic retry after a crash: provider billing/completion is unknown.
      return db.prepare("UPDATE jobs SET state='interrupted',error='REVIEW_INTERRUPTED_OUTCOME_UNKNOWN',finished_at=? WHERE state='running' AND started_at < ?").run(now().toISOString(), new Date(now().getTime() - EXECUTION_POLICY.reviewStaleAfterMs).toISOString()).changes;
    },
    pending() { return db.prepare("SELECT run_id FROM jobs WHERE state='queued' ORDER BY created_at").all().map(row => row.run_id as string); },
    pendingError(id: string, error: string) {
      const safe = ["REVIEW_PILOT_ALLOCATION_REACHED", "REVIEW_PROVIDER_NOT_CONFIGURED"].includes(error) ? error : "REVIEW_SCHEDULING_FAILED";
      db.prepare("UPDATE jobs SET error=? WHERE run_id=? AND state='queued'").run(safe, id);
    },
    feedback(id: string, packetHash: string, criterion: string, verdict: string, note: string) {
      const job = get(id);
      if (!job?.result || job.packetHash !== packetHash || !job.result.review.criteria.some(c => c.id === criterion) || !["agree", "disagree", "unable"].includes(verdict) || note.length > 2000 || (verdict !== "agree" && note.trim().length < 10)) throw new Error("FEEDBACK_INVALID");
      db.prepare("INSERT INTO physician_feedback(run_id,packet_hash,criterion,verdict,note,at) VALUES(?,?,?,?,?,?)").run(id, packetHash, criterion, verdict, note, now().toISOString());
    },
    feedbackFor(id: string) { return db.prepare("SELECT criterion,verdict,note,at FROM physician_feedback WHERE run_id=? ORDER BY id").all(id); },
  };
}
