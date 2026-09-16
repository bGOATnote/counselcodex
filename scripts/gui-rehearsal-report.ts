import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

// Read-only with respect to original runs. Export every attempt in the declared
// time window, not just successes. This is a GUI rehearsal, not a clinical eval.
const [from, to = new Date().toISOString()] = process.argv.slice(2);
if (!from || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || Date.parse(from) >= Date.parse(to)) throw new Error("Provide a valid ISO start and optional end time.");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const directory = "apps/evaluation/.local/disposition-agent-v3/runs";
const runs = readdirSync(directory).filter((name) => name.endsWith(".json")).map((name) => {
  const path = join(directory, name), raw = readFileSync(path, "utf8");
  return { run: JSON.parse(raw), path, sha256: hash(raw) };
}).filter(({ run }) => Date.parse(run.completedAt) >= Date.parse(from) && Date.parse(run.completedAt) <= Date.parse(to))
  .sort((a, b) => a.run.completedAt.localeCompare(b.run.completedAt));
const records = runs.map(({ run: r, path, sha256 }) => ({
  runId: r.runId, completedAt: r.completedAt, originalRun: path, sha256,
  inputHash: r.inputHash, promptHash: r.promptHash, guidanceHash: r.guidanceHash,
  workflowVersion: r.adaptive?.version, retrievalVersion: r.adaptive?.evidence?.version,
  model: r.model, generation: r.generation ?? null, status: r.status, failure: r.failure,
  durationMs: r.durationMs, firstActionMs: r.firstActionMs, firstQuestionMs: r.firstQuestionMs,
  firstPatientReplyMs: r.firstPatientReplyMs, firstOpeningMs: r.firstOpeningMs, traceId: r.traceId,
  tracePersisted: r.tracePersisted, artifactPersisted: r.artifactPersisted, eventLogPersisted: r.eventLogPersisted,
  modelCalls: r.modelCalls, usage: r.usage,
  agents: r.agents.map((a: any) => ({ role: a.role, model: a.model, durationMs: a.durationMs, firstTextDeltaMs: a.firstTextDeltaMs, failure: a.failure, usage: a.usage })),
  disposition: r.answer?.disposition ?? null, safetyFloor: r.safetyFloor?.disposition ?? null,
  reviewPriority: r.answer?.reviewPriority ?? null, workType: r.answer?.workType ?? null,
  routingPolicy: r.routingPolicy ?? null, clarificationAssessment: r.clarificationAssessment ?? null,
  proposedClarificationRoutes: r.clarification?.routingConsequence?.alternatives?.map((a: any) => a.route) ?? [],
  conditionalInstructionRecorded: Boolean(r.pendingInstruction || r.responseEvents?.some((e: any) => e.kind === "intake_question" && e.interimInstruction)),
  citedSources: r.answer?.evidence?.map((e: any) => e.sourceId) ?? [],
  sources: r.adaptive?.evidence?.passages.map((p: any) => ({ id: p.id, url: p.url, contentHash: p.contentHash, kind: p.kind, linkStatus: p.linkStatus, retrieval: p.retrieval })) ?? [],
  sourceAudit: r.adaptive?.evidence?.audit ?? [], checks: r.checks,
}));
const reviewPath = "apps/evaluation/.local/response-review-v1/reviews.db";
const reviews = existsSync(reviewPath) ? (() => {
  const db = new DatabaseSync(reviewPath, { readOnly: true });
  try {
    return records.map(record => {
      const row = db.prepare("SELECT state,packet_hash,result,error FROM jobs WHERE run_id=?").get(record.runId);
      const result = row?.result ? JSON.parse(row.result as string) : null;
      return { runId: record.runId, state: row?.state ?? "not_recorded", packetHash: row?.packet_hash ?? null, error: row?.error ?? null,
        version: result?.review?.version ?? null, outcome: result?.review?.outcome ?? null, clinicalApproval: false,
        criteria: result?.review?.criteria?.map((c: any) => ({ id: c.id, verdict: c.verdict })) ?? [], estimatedUsd: result?.estimatedUsd ?? null };
    });
  } finally { db.close(); }
})() : [];
// A crash can leave an event log without a final artifact. Keep those attempts
// visible too. Birth time is explicitly weaker than an application timestamp.
const eventDirectory = "apps/evaluation/.local/disposition-agent-v3/events";
const finalFiles = new Set(readdirSync(directory));
const unfinished = readdirSync(eventDirectory).filter(name => name.endsWith(".jsonl") && !finalFiles.has(name.replace(/\.jsonl$/, ".json"))).flatMap(name => {
  const path = join(eventDirectory, name), stat = statSync(path);
  if (stat.birthtimeMs < Date.parse(from) || stat.birthtimeMs > Date.parse(to)) return [];
  const raw = readFileSync(path, "utf8");
  return [{ runId: name.replace(/\.jsonl$/, ""), originalEvents: path, sha256: hash(raw), status: "no_final_artifact", observedStart: stat.birthtime.toISOString(), timestampSource: "filesystem_birthtime_not_application_clock" }];
});
const out = `outputs/gui-rehearsal-${from.slice(0, 10)}`;
mkdirSync(out, { recursive: true });
const path = `${out}/${Date.now()}.json`;
writeFileSync(path, JSON.stringify({ protocol: "gui-rehearsal/v3", from, to,
  limitations: "Adaptive debugging sequence, not randomized or blinded. Changing prompts/retrieval/generation settings confounds causal latency claims. Complete means software admission, not clinical correctness or evidence entailment. Failed and unfinished assessments are retained. Raw attempts remain local; this export omits patient text, model prose and copyrighted source passages.",
  sampleCsvSha256: hash(readFileSync("data/patient_messages.csv", "utf8")), records, unfinished, reviews,
}, null, 2), { flag: "wx" });
console.log(JSON.stringify({ path, attempts: records.length + unfinished.length, completedArtifacts: records.length, unfinished: unfinished.length, statuses: records.reduce((counts: Record<string, number>, r: any) => ({ ...counts, [r.status]: (counts[r.status] ?? 0) + 1 }), {}), rawRunsModified: false }));
