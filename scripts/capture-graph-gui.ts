import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "../src/evidence/rag/model.ts";
import { estimateStudyCost, STUDY_PRICING } from "../src/evaluation/clinical-study-budget.ts";
import type { DispositionRun } from "../src/disposition/contract.ts";

// Snapshot all starts in a declared rehearsal window, including unfinished
// starts. No provider dispatch, database opening or original-artifact edits.
const [planPath, destination, until = new Date().toISOString()] = process.argv.slice(2);
if (!planPath || !destination || !Number.isFinite(Date.parse(until))) throw new Error("PLAN_DESTINATION_END_REQUIRED");
const rawPlan = readFileSync(planPath, "utf8"), plan = JSON.parse(rawPlan), from = Date.parse(plan.createdAt), to = Date.parse(until);
if (!Number.isFinite(from) || to <= from) throw new Error("INVALID_WINDOW");
const capturedAt = new Date().toISOString();
if (to > Date.parse(capturedAt)) throw new Error("FUTURE_WINDOW_NOT_OBSERVED");
const runtime = "apps/evaluation/.local/clinical-evidence-graph-v1", events = join(runtime, "events"), runs = join(runtime, "runs");
mkdirSync(destination, { recursive: false });
for (const name of ["runs", "events"]) mkdirSync(join(destination, name));
const runFiles = new Set(readdirSync(runs));
const selected = readdirSync(events).filter(n => n.endsWith(".jsonl")).map(name => ({name, created: statSync(join(events, name)).birthtimeMs}))
  .filter(row => row.created >= from && row.created <= to).sort((a,b) => a.created - b.created);
const rows = selected.map(({name, created}) => {
  const id = name.replace(/\.jsonl$/, ""), rawEvents = readFileSync(join(events, name), "utf8");
  writeFileSync(join(destination, "events", name), rawEvents, {flag:"wx"});
  let r: DispositionRun | null = null, runHash: string | null = null;
  if (runFiles.has(`${id}.json`)) { const raw = readFileSync(join(runs, `${id}.json`), "utf8"); r = JSON.parse(raw); runHash = sha256(raw); writeFileSync(join(destination, "runs", `${id}.json`), raw, {flag:"wx"}); }
  return {runId:id, observedStart:new Date(created).toISOString(), timestampSource:"filesystem_birthtime", eventsSHA256:sha256(rawEvents), runSHA256:runHash,
    status:r?.status??"unfinished", failure:r?.failure??null, version:r?.graph?.version??null, promptHash:r?.promptHash??null, inputHash:r?.inputHash??null,
    disposition:r?.answer?.disposition??null, reviewPriority:r?.answer?.reviewPriority??null, earlyActionMs:r?.firstActionMs??null, questionMs:r?.firstQuestionMs??null,
    durationMs:r?.durationMs??null, modelCalls:r?.modelCalls??null, repair:r?.graph?.repair??null, review:r?.graph?.judge?.verdict??null,
    failedCriteria:r?.graph?.judge?.criteria.filter(c=>c.verdict!=="pass")??[], estimatedUSD:r?estimateStudyCost(r):null,
    tracePersisted:r?.tracePersisted??false, eventLogPersisted:r?.eventLogPersisted??false, clinicalApproval:false};
});
const knownUSD = rows.reduce((s,r)=>s+(r.estimatedUSD??0),0), unknown = rows.filter(r=>r.estimatedUSD===null).length;
const summary = {protocol:"graph-gui-capture/v1", capturedAt, from:plan.createdAt, until, planPath, planSHA256:sha256(rawPlan), rows, attempts:rows.length,
  complete:rows.filter(r=>r.status==="complete").length, knownUSD, unknownCostAttempts:unknown, conservativeAccountedUSD:knownUSD+unknown*plan.perAssessmentReservationUSD,
  capacityExceeded:rows.length>plan.maximumAssessments || knownUSD+unknown*plan.perAssessmentReservationUSD>plan.allocationUSD,
  pricing:STUDY_PRICING, limitation:"All browser starts in window; engineering rehearsal, not randomized or clinical validation. Server event times are not browser paint measurements. Token estimates exclude embedding calls and cache-specific billing."};
writeFileSync(join(destination,"summary.json"),JSON.stringify(summary,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({destination,attempts:rows.length,complete:summary.complete,knownUSD,unknownCostAttempts:unknown,capacityExceeded:summary.capacityExceeded}));
