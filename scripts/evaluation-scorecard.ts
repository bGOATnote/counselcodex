import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { parseExperimentCases } from "../src/evaluation/disposition-experiment.ts";
import { operationalRoute, ROUTING_POLICY_VERSION } from "../src/disposition/routing-policy.ts";
import { createReviewPacket, evaluateReview, REVIEW_VERSION, REVIEW_MODEL } from "../src/evaluation/response-review.ts";
import { REVIEW_PROMPT_HASH } from "../src/evaluation/response-review-runtime.ts";
import type { DispositionRun } from "../src/disposition/contract.ts";

// Re-score an explicitly selected, immutable GUI cohort. No model calls, no
// rewrites, no best-run selection, and no export of raw source text or reviews.
const [cohortPath, outputPath] = process.argv.slice(2);
if (!cohortPath || !outputPath) throw new Error("Usage: npm run evaluation:scorecard -- cohort.json new-report.json");
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const root = resolve("."), cohortRaw = readFileSync(cohortPath,"utf8");
const cohort = z.object({ protocol:z.literal("gui-rehearsal/v3"), from:z.string().datetime(), to:z.string().datetime(),
  records:z.array(z.object({ originalRun:z.string(),sha256:z.string().regex(/^[a-f0-9]{64}$/),runId:z.uuid() })),
  unfinished:z.array(z.object({ runId:z.uuid(), originalEvents:z.string(), sha256:z.string(), status:z.string() })),
}).parse(JSON.parse(cohortRaw));
const referencesPath = "data/evaluation/routing-policy-controls-v1.jsonl", referenceRaw = readFileSync(referencesPath,"utf8");
const references = parseExperimentCases(referenceRaw), referenceByInput = new Map(references.map(c => [sha(c.message),c]));
const ratio = (numerator: number, denominator: number) => ({ numerator, denominator, rate: denominator ? numerator/denominator : null });
const percentile = (a: number[], p: number) => {
  if (!a.length) return null;
  const s = [...a].sort((a,b)=>a-b);
  return p === .5 ? (s[Math.floor((s.length-1)/2)]+s[Math.floor(s.length/2)])/2 : s[Math.max(0,Math.ceil(s.length*p)-1)];
};
if (Date.parse(cohort.from) >= Date.parse(cohort.to) || new Set([...cohort.records,...cohort.unfinished].map(r => r.runId)).size !== cohort.records.length+cohort.unfinished.length) throw new Error("INVALID_COHORT");
const verifyArtifact = (path: string, expectedHash: string, store: "runs" | "events") => {
  const resolved = resolve(root,path), directory = join(root,"apps/evaluation/.local/disposition-agent-v3",store);
  if (!resolved.startsWith(directory+sep) || !realpathSync(resolved).startsWith(realpathSync(directory)+sep)) throw new Error("RUN_PATH_OUTSIDE_COHORT_STORE");
  const raw = readFileSync(resolved,"utf8");
  if (sha(raw) !== expectedHash) throw new Error("COHORT_RUN_CHANGED");
  return raw;
};
for (const attempt of cohort.unfinished) verifyArtifact(attempt.originalEvents,attempt.sha256,"events");
const reviewPath = "apps/evaluation/.local/response-review-v1/reviews.db";
const db = existsSync(reviewPath) ? new DatabaseSync(reviewPath,{ readOnly: true }) : null;
let rows;
try {
  rows = cohort.records.map((record: { originalRun: string; sha256: string; runId: string }) => {
    const raw = verifyArtifact(record.originalRun,record.sha256,"runs");
    const run = JSON.parse(raw) as DispositionRun;
    if (run.runId !== record.runId) throw new Error("COHORT_ID_MISMATCH");
    if (!Number.isFinite(run.durationMs) || run.durationMs < 0 || !Number.isFinite(Date.parse(run.completedAt)) || Date.parse(run.completedAt) < Date.parse(cohort.from) || Date.parse(run.completedAt) > Date.parse(cohort.to)) throw new Error("INVALID_COHORT_TIMING");
    // Includes exact input/answer/source hash verification, including failures.
    const packet = createReviewPacket(run);
    const row = db?.prepare("SELECT state,packet_hash,result,error FROM jobs WHERE run_id=?").get(run.runId);
    const result = row?.result ? JSON.parse(row.result as string) : null;
    const currentJudge = result?.review?.version === REVIEW_VERSION && result?.review?.judgeModel === REVIEW_MODEL && result?.promptHash === REVIEW_PROMPT_HASH;
    let review = null;
    if (row?.state === "complete" && currentJudge) {
      if (row.packet_hash !== packet.packetHash || result.review.packetHash !== packet.packetHash || result.review.runId !== run.runId) throw new Error("JUDGE_COHORT_BINDING_MISMATCH");
      review = evaluateReview(packet,{ criteria: result.review.criteria });
    }
    const reference = referenceByInput.get(run.inputHash), route = run.status === "complete" && run.answer ? operationalRoute(run.answer) : null;
    const match = reference ? Boolean(route && reference.reference!.acceptedOperationalRoutes!.includes(route)) : null;
    const conflict = reference ? (run.responseEvents??[]).some(e => e.kind === "action" && !reference.reference!.acceptedRoutes.includes(e.notice.disposition)) : null;
    const issuedEmergency = run.answer?.disposition === "EMERGENCY_NOW" || (run.responseEvents??[]).some(e => e.kind === "action" && e.notice.disposition === "EMERGENCY_NOW");
    return { runId: run.runId, inputHash: run.inputHash, runSha256: record.sha256, workflowVersion: run.adaptive?.version??"unknown", status: run.status, route, durationMs: run.durationMs,
      firstActionMs: run.firstActionMs??null, referenceId: reference?.id??null, routeMatched: match, issuedEscalationConflict: conflict, issuedEmergency,
      referenceEmergency: reference?.reference?.emergency??null,
      judgeState: row?.state??"not_recorded", judgeVersion: result?.review?.version??null, currentJudge, judgeOutcome: review?.outcome??null,
      criteria: review?.criteria.map(c=>({ id:c.id, verdict:c.verdict }))??[],
    };
  });
} finally { db?.close(); }
const byWorkflow = [...new Set(rows.map(r=>r.workflowVersion))].map(workflowVersion=>{
  const group = rows.filter(r=>r.workflowVersion===workflowVersion), labeled = group.filter(r=>r.referenceId), emergent=labeled.filter(r=>r.referenceEmergency), nonemergent=labeled.filter(r=>!r.referenceEmergency);
  return { workflowVersion, attempts: group.length, distinctInputs: new Set(group.map(r=>r.inputHash)).size,
    completed: ratio(group.filter(r=>r.status==="complete").length,group.length),
    routingPolicyControlCoverage: ratio(labeled.filter(r=>r.routeMatched && !r.issuedEscalationConflict).length,labeled.length),
    unreferenced: group.length-labeled.length, emergencyAction: ratio(emergent.filter(r=>r.issuedEmergency).length,emergent.length), falseEmergencyAction: ratio(nonemergent.filter(r=>r.issuedEmergency).length,nonemergent.length),
    judgeNoFlags: ratio(group.filter(r=>r.judgeOutcome==="no_flags").length,group.length),
    judgeConcerns: group.filter(r=>r.judgeOutcome==="concerns").length, judgeMissingOrStale: group.filter(r=>r.judgeOutcome===null).length,
    medianEndMs: percentile(group.map(r=>r.durationMs),.5), p95EndMs: percentile(group.map(r=>r.durationMs),.95),
    clinicalAccuracy: null, componentLift: null,
  };
});
const backupDirectory = "apps/evaluation/.local/review-backups";
const backups = existsSync(backupDirectory) ? readdirSync(backupDirectory).filter(p=>p.endsWith(".json")).map(p=>{
  const raw=readFileSync(join(backupDirectory,p),"utf8"), o=JSON.parse(raw), w=o.workspace??o;
  return { artifactSha256:sha(raw), exportedAt:o.exportedAt, completed:Object.values(w.records??{}).filter((r:any)=>r.completedAt).length, attestationPresent:Boolean(w.attestation) };
}).sort((a,b)=>String(b.exportedAt).localeCompare(String(a.exportedAt))) : [];
const report = { protocol:"assignment-evaluation-scorecard/v3", createdAt:new Date().toISOString(), routingPolicy:ROUTING_POLICY_VERSION,
  latencyEstimator:"Arithmetic median of middle pair for even n; nearest-rank p95. Failures included. Small dependent samples do not estimate production tails.",
  cohort:{ path:cohortPath,sha256:sha(cohortRaw),from:cohort.from,to:cohort.to,attempts:rows.length+cohort.unfinished.length,orphanedAttempts:cohort.unfinished,
    softwareCompletion:ratio(rows.filter(r=>r.status==="complete").length,rows.length+cohort.unfinished.length),
    selection:"Explicit existing debugging cohort, not an exhaustive prospective sample. Orphaned attempts have no trusted workflow version and remain in this overall denominator, not a guessed version group." },
  reference:{ path:referencesPath,sha256:sha(referenceRaw),status:"post_hoc_development_policy_controls",inputs:references.length,
    limitation:"Known, previously inspected cases. Policy assertions are not an independently adjudicated clinical reference. Other messages stay unscored; no imputation or case-ID lookup during inference." },
  physicianReference:{ latestLocalBackup:backups[0]??null, attestedBackups:backups.filter(b=>b.attestationPresent).length,
    status:"inventory_only_not_identity_or_content_attestation; browser-only work may be newer; historical review is not review of current answers" },
  byWorkflow, rows,
  release:{ approved:false, reasons:["No independent intended-use clinical accuracy estimate.","Judge control performance is not physician calibration.","Historical debugging versions cannot establish paired component lift.","Latency and exact-response concerns remain open; no clinical handoff claim."] },
};
mkdirSync(dirname(resolve(outputPath)),{recursive:true});
writeFileSync(outputPath,JSON.stringify(report,null,2),{flag:"wx",mode:0o600});
console.log(JSON.stringify({ outputPath, byWorkflow, physicianReference:report.physicianReference, release:report.release },null,2));
