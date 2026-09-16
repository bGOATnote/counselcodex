import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { fixtureRun } from "./response-review-fixtures.ts";
import { createReviewPacket, REVIEW_MODEL, REVIEW_VERSION } from "../src/evaluation/response-review.ts";
import { REVIEW_PROMPT_HASH } from "../src/evaluation/response-review-runtime.ts";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const script = fileURLToPath(new URL("../scripts/evaluation-scorecard.ts",import.meta.url));
function setup() {
  const root = mkdtempSync(join(tmpdir(),"scorecard-contract-"));
  const write = (path: string, data: unknown) => { mkdirSync(dirname(join(root,path)),{recursive:true}); const raw=typeof data==="string"?data:JSON.stringify(data); writeFileSync(join(root,path),raw); return sha(raw); };
  const run=fixtureRun(), originalRun=`apps/evaluation/.local/disposition-agent-v3/runs/${run.runId}.json`;
  const hash=write(originalRun,run);
  write("data/evaluation/routing-policy-controls-v1.jsonl",readFileSync(new URL("../data/evaluation/routing-policy-controls-v1.jsonl",import.meta.url),"utf8"));
  const cohort={ protocol:"gui-rehearsal/v3",from:"2026-09-11T21:00:00Z",to:"2026-09-11T23:00:00Z",records:[{runId:run.runId,originalRun,sha256:hash}],unfinished:[] as {runId:string;originalEvents:string;sha256:string;status:string}[] };
  const execute = (out="report.json") => { write("cohort.json",cohort); return spawnSync(process.execPath,["--experimental-strip-types",script,"cohort.json",out],{cwd:root,env:{...process.env,ANTHROPIC_API_KEY:"",OPENAI_API_KEY:"",MASTRA_TELEMETRY_DISABLED:"true"},encoding:"utf8",timeout:15000}); };
  const judge = (promptHash: string, packetHash=createReviewPacket(run).packetHash) => {
    const path=join(root,"apps/evaluation/.local/response-review-v1/reviews.db"); mkdirSync(dirname(path),{recursive:true}); const db=new DatabaseSync(path);
    db.exec("CREATE TABLE IF NOT EXISTS jobs(run_id TEXT PRIMARY KEY,packet_hash TEXT,state TEXT,result TEXT,error TEXT)");
    db.prepare("INSERT OR REPLACE INTO jobs VALUES(?,?,'complete',?,NULL)").run(run.runId,packetHash,JSON.stringify({promptHash,review:{version:REVIEW_VERSION,judgeModel:REVIEW_MODEL,runId:run.runId,packetHash,criteria:[]}})); db.close();
  };
  return {root,run,originalRun,write,cohort,execute,judge};
}
test("scorecard retains orphaned attempts and absent judges without inventing clinical scores", () => {
  const f=setup(), path="apps/evaluation/.local/disposition-agent-v3/events/a0000000-0000-4000-8000-000000000099.jsonl";
  f.cohort.unfinished.push({runId:"a0000000-0000-4000-8000-000000000099",originalEvents:path,sha256:f.write(path,"{}\n"),status:"no_final_artifact"});
  const result=f.execute(); assert.equal(result.status,0,result.stderr);
  const report=JSON.parse(readFileSync(join(f.root,"report.json"),"utf8"));
  assert.equal(report.cohort.softwareCompletion.rate,.5); assert.equal(report.byWorkflow[0].judgeMissingOrStale,1);
  assert.equal(report.byWorkflow[0].clinicalAccuracy,null); assert.equal(report.byWorkflow[0].routingPolicyControlCoverage.rate,1);
  assert.notEqual(f.execute().status,0,"existing reports must not be overwritten");
  f.write(path,"changed\n"); assert.match(f.execute("changed-events.json").stderr,/COHORT_RUN_CHANGED/);
});
test("scorecard rejects edited runs and current-rubric judge mismatches; stale judges earn no credit", () => {
  const f=setup(); f.judge("old-rubric");
  assert.equal(f.execute().status,0);
  const report=JSON.parse(readFileSync(join(f.root,"report.json"),"utf8")); assert.equal(report.byWorkflow[0].judgeMissingOrStale,1);
  f.judge(REVIEW_PROMPT_HASH,"wrong-packet"); assert.match(f.execute("mismatch.json").stderr,/JUDGE_COHORT_BINDING_MISMATCH/);
  f.write(f.originalRun,{...f.run,durationMs:42}); assert.match(f.execute("changed.json").stderr,/COHORT_RUN_CHANGED/);
});
