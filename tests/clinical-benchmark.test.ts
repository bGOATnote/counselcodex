import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, symlinkSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { benchmarkManifest, benchmarkOutcome, digest, inferenceInput, loadClinicalBenchmark, readBenchmarkRecords, runBenchmark, summarizeBenchmark, type BenchmarkArm, type BenchmarkCase, type BenchmarkRecord } from "../src/evaluation/clinical-benchmark.ts";
import { reserveClinicalStudyRun, estimateStudyCost, requireStudyCapacity, STUDY_PRICING } from "../src/evaluation/clinical-study-budget.ts";
import { fixtureRun, rehash } from "./response-review-fixtures.ts";
import { ADAPTIVE_VERSION } from "../src/disposition/adaptive.ts";
import { ROUTING_POLICY_VERSION } from "../src/disposition/routing-policy.ts";
import type { ResponseEvent } from "../src/disposition/contract.ts";
import { rubricPacket,rubricIdentity,evaluateRubricJudgment } from "../src/evaluation/benchmark-rubrics.ts";
import { historicalManifest,privateBenchmarkDirectory,readRubricArtifact,summarizeRubrics } from "../src/evaluation/benchmark-report.ts";
import { createDispositionRuntime } from "../src/disposition/runtime.ts";

function sample(id:string, emergencyExpected:boolean|null=false, multi=false):BenchmarkCase {
  const turns:BenchmarkCase["turns"]=[{role:"user",content:`Synthetic software control ${id}; not a clinical reference.`}];
  if(multi) turns.push({role:"assistant",content:"Have you experienced chest pain?"},{role:"user",content:"No."});
  const promptHash=digest(turns);
  const rubrics=[{criterion:"Authored software control only.",points:1,tags:[]}];
  return {id,promptHash,familyId:promptHash,referenceHash:digest([id,emergencyExpected]),rubricHash:digest(rubrics),cohort:emergencyExpected===null?"conditional_stress":"primary",emergencyExpected,turns,rubrics,unsupportedReason:multi?"MULTITURN_ADAPTER_REQUIRED":null};
}
function output(message:string,arm:BenchmarkArm,emergency=false) {
  const run=fixtureRun(); run.message=message; run.profile=arm; run.routingPolicy=ROUTING_POLICY_VERSION;
  run.adaptive={version:ADAPTIVE_VERSION,mode:arm==="base-opus"?"base":"adaptive",plan:null,evidence:{version:"test",corpusHash:"test",passages:[],audit:[]}};
  if(emergency) { run.answer!.disposition="EMERGENCY_NOW"; run.answer!.reviewPriority=null; run.answer!.workType=null; run.answer!.patientMessage="Call 911 now. Do not wait for a message reply."; }
  return rehash(run);
}
const dir=()=>mkdtempSync(join(tmpdir(),"clinical-benchmark-test-"));
const notice:ResponseEvent={kind:"action",notice:{disposition:"EMERGENCY_NOW",directive:"Call 911 now. Do not wait for a reply.",source:"emergency_agent"},elapsedMs:10};
test("frozen selection is order-independent and neither prompt nor canary enters the public manifest",()=>{
  const cases=Array.from({length:30},(_,i)=>sample(`case-${i}`,i%2===0));
  const a=benchmarkManifest(cases,"source-fingerprint"),b=benchmarkManifest([...cases].reverse(),"source-fingerprint");
  assert.deepEqual(a,b); assert.equal(a.pilotIds.length,12);
  assert.ok(!JSON.stringify(a).includes("Synthetic software control"));
  assert.deepEqual(Object.keys(inferenceInput(cases[0])).sort(),["id","message"]);
  assert.throws(()=>inferenceInput(sample("multi",true,true)),/UNSUPPORTED/);
});
test("verified upstream audit preserves 103 with 24 unsupported conversations and separate excluded strata",t=>{
  const path=".cache/healthbench/consensus_2025-05-09-20-00-46.jsonl";
  if(!existsSync(path)) return t.skip("Upstream corpus not cached; no network dependency in CI.");
  const config=JSON.parse(readFileSync("configs/healthbench-emergency-counsel-method-v1.json","utf8"));
  const result=loadClinicalBenchmark(readFileSync(path,"utf8"),config);
  const primary=result.cases.filter(c=>c.cohort==="primary");
  assert.equal(primary.length,103); assert.equal(primary.filter(c=>c.unsupportedReason).length,24);
  assert.equal(result.cases.filter(c=>c.cohort==="conditional_stress").length,176);
  assert.equal(result.cases.filter(c=>c.cohort==="excluded_scope_stress").length,159);
  assert.ok(result.cases.filter(c=>c.cohort==="conditional_stress").every(c=>c.emergencyExpected===null));
  assert.throws(()=>loadClinicalBenchmark(readFileSync(path,"utf8")+"\n",config),/SHA-256/);
});
test("all failures cannot win by being treated as non-emergency predictions",async()=>{
  const cases=[sample("positive",true),sample("negative",false)],manifest=benchmarkManifest(cases,"test",{execution:"simulated"});
  const records=await runBenchmark(cases,dir(),manifest,async()=>{throw new Error("provider 429");},"primary");
  for(const arm of summarizeBenchmark(manifest,records).cohorts[0].arms) {
    assert.equal(arm.complete.rate,0); assert.equal(arm.nonEmergencyCompletedAgreement.rate,0);
    assert.equal(arm.emergencyInstructionCoverage.rate,0); assert.equal(arm.unresolved,2);
    assert.equal(arm.cost.totalEstimateUSD,null); assert.equal(arm.cost.unknownExecuted,2);
  }
});
test("always escalate and never escalate expose distinct failure classes, not a safety win",async()=>{
  const cases=[sample("positive",true),sample("negative",false)],manifest=benchmarkManifest(cases,"test",{execution:"simulated"});
  const records=await runBenchmark(cases,dir(),manifest,async(input,arm)=>output(input.message,arm,arm==="adaptive-opus"),"primary");
  const [never,always]=summarizeBenchmark(manifest,records).cohorts[0].arms;
  assert.equal(never.emergencyInstructionCoverage.rate,0); assert.equal(never.nonEmergencyCompletedAgreement.rate,1);
  assert.equal(always.emergencyInstructionCoverage.rate,1); assert.equal(always.falseEmergencyAlerts.rate,1);
  assert.equal(always.strictBinaryCompletedAgreement!.rate,.5);
});
test("issued emergency survives final failure, but cannot count as a completed appropriate response",async()=>{
  const cases=[sample("positive",true)],manifest=benchmarkManifest(cases,"test",{execution:"simulated"});
  const records=await runBenchmark(cases,dir(),manifest,async(_input,_arm,event)=>{event(notice);throw new Error("late failure");},"primary");
  const arm=summarizeBenchmark(manifest,records).cohorts[0].arms[0];
  assert.equal(arm.emergencyInstructionCoverage.rate,1); assert.equal(arm.complete.rate,0); assert.equal(arm.timeToEmergencyActionMs.median,10);
});
test("wrong early emergency is not erased by a correct final non-emergency answer",async()=>{
  const cases=[sample("negative",false)],manifest=benchmarkManifest(cases,"test",{execution:"simulated"});
  const records=await runBenchmark(cases,dir(),manifest,async(input,arm,event)=>{event(notice);const run=output(input.message,arm);run.responseEvents=[notice];return run;},"primary");
  const arm=summarizeBenchmark(manifest,records).cohorts[0].arms[0];
  assert.equal(arm.falseEmergencyAlerts.rate,1); assert.equal(arm.strictBinaryCompletedAgreement!.rate,0);
});
test("conditional precautions, rejected drafts and unsupported histories are never mined for positive referrals",async()=>{
  const cases=[sample("negative",false),sample("multi",true,true)],manifest=benchmarkManifest(cases,"test",{execution:"simulated"}); let calls=0;
  const records=await runBenchmark(cases,dir(),manifest,async(input,arm)=>{calls++;const r=output(input.message,arm);r.rejectedAnswer={disposition:"EMERGENCY_NOW"};return r;},"primary");
  assert.equal(calls,2); assert.equal(records.filter(r=>r.status==="unsupported").length,2);
  assert.equal(benchmarkOutcome(records.find(r=>r.id==="negative")).prediction,false);
  assert.equal(summarizeBenchmark(manifest,records).cohorts[0].arms[0].unsupported,1);
});
test("append-only resume, label separation, stale source and forged records fail closed",async()=>{
  const cases=[sample("control",false)],manifest=benchmarkManifest(cases,"test",{execution:"simulated"}),directory=dir();let calls=0;
  const runner=async(input:{id:string;message:string},arm:BenchmarkArm)=>{assert.deepEqual(Object.keys(input).sort(),["id","message"]);calls++;return output(input.message,arm);};
  const first=await runBenchmark(cases,directory,manifest,runner,"primary");
  assert.deepEqual(first,await runBenchmark(cases,directory,manifest,runner,"primary")); assert.equal(calls,2);
  await assert.rejects(runBenchmark(cases,directory,{...manifest,fingerprint:"changed"},runner,"primary"),/MANIFEST_CHANGED/);
  const path=join(directory,"control--1--base-opus.json"),r=JSON.parse(readFileSync(path,"utf8"));r.durationMs+=1;writeFileSync(path,JSON.stringify(r));
  assert.throws(()=>readBenchmarkRecords(directory,manifest),/RECORD_MISMATCH/);
});
test("interrupted reservations never rerun, and absent planned slots are not a measured benefit",async()=>{
  const cases=[sample("control",false)],manifest=benchmarkManifest(cases,"test",{execution:"simulated"}),directory=dir();
  writeFileSync(join(directory,"control--1--base-opus.attempt.json"),JSON.stringify({manifestHash:digest(manifest),promptHash:cases[0].promptHash,arm:"base-opus",trial:1}));let calls=0;
  const records=await runBenchmark(cases,directory,manifest,async(input,arm)=>{calls++;return output(input.message,arm);},"primary");
  assert.equal(calls,1);assert.equal(records.find(r=>r.arm==="base-opus")!.status,"interrupted");
  const onlyCandidate=records.filter(r=>r.arm==="adaptive-opus");
  assert.equal(summarizeBenchmark(manifest,onlyCandidate).paired[0].measuredDelta,null);
  assert.equal(summarizeBenchmark(manifest,[]).cohorts[0].arms[0].durationMsAllExecuted.median,null);
});
test("crash recovery retains durable emergency emissions without retrying or completing a failed response",async()=>{
  const cases=[sample("positive",true)],manifest=benchmarkManifest(cases,"test",{execution:"simulated"}),directory=dir();
  writeFileSync(join(directory,"positive--1--base-opus.attempt.json"),JSON.stringify({manifestHash:digest(manifest),promptHash:cases[0].promptHash,arm:"base-opus",trial:1}));
  writeFileSync(join(directory,"positive--1--base-opus.events.jsonl"),JSON.stringify(notice)+"\n"+'{"torn');
  const records=await runBenchmark(cases,directory,manifest,async(input,arm)=>output(input.message,arm,true),"primary");
  const recovered=records.find(r=>r.arm==="base-opus")!;
  assert.deepEqual(recovered.events,[notice]);assert.equal(recovered.eventCaptureFailed,true);
  assert.equal(benchmarkOutcome(recovered).emergency,true);assert.equal(benchmarkOutcome(recovered).complete,false);
});
test("zero remaining capacity stops before new admission, leaving unstarted denominators",async()=>{
  const cases=[sample("negative",false)],manifest=benchmarkManifest(cases,"test",{execution:"simulated"}),directory=dir();let calls=0;
  await assert.rejects(runBenchmark(cases,directory,manifest,async(input,arm)=>{calls++;return output(input.message,arm);},"primary",undefined,()=>{throw new Error("CAPACITY_EXHAUSTED");}),/CAPACITY_EXHAUSTED/);
  assert.equal(calls,0);assert.equal(readBenchmarkRecords(directory,manifest).length,0);
  assert.equal(existsSync(join(directory,"negative--1--base-opus.attempt.json")),false);
});
test("concurrent runner cannot corrupt the other run's admitted attempt",async()=>{
  const cases=[sample("control",false)],manifest=benchmarkManifest(cases,"test",{execution:"simulated"}),directory=dir();
  let release!:()=>void;const pending=new Promise<void>(resolve=>release=resolve);
  const first=runBenchmark(cases,directory,manifest,async(input,arm)=>{await pending;return output(input.message,arm);},"primary");
  await assert.rejects(runBenchmark(cases,directory,manifest,async(input,arm)=>output(input.message,arm),"primary"),/LOCKED/);
  release();assert.equal((await first).length,2);
});
test("runtime identity includes workflow and policy versions; stale outputs cannot score",async()=>{
  const cases=[sample("control",false)],manifest=benchmarkManifest(cases,"test",{execution:"simulated"});
  const records=await runBenchmark(cases,dir(),manifest,async(input,arm)=>{const r=output(input.message,arm);r.adaptive!.version="old-version";return r;},"primary");
  assert.ok(records.every(r=>r.status==="failed" && r.run===null));
});
test("generation authorization is explicit, immutable, bounded and separate from old ledgers",()=>{
  const directory=dir();assert.throws(()=>reserveClinicalStudyRun(directory),/EXPLICIT_SPEND/);
  const authorization={version:"clinical-study-authorization/v1",approved:true,authorizationReference:"Synthetic unit test, no provider calls",ceilingUSD:2,pricingVersion:STUDY_PRICING.version};
  writeFileSync(join(directory,"authorization.json"),JSON.stringify(authorization));
  reserveClinicalStudyRun(directory);reserveClinicalStudyRun(directory);assert.throws(()=>reserveClinicalStudyRun(directory),/EXHAUSTED/);assert.throws(()=>requireStudyCapacity(directory),/EXHAUSTED/);
  writeFileSync(join(directory,"authorization.json"),JSON.stringify({...authorization,ceilingUSD:3}));
  assert.throws(()=>reserveClinicalStudyRun(directory),/AUTHORIZATION_CHANGED/);
});
test("historical reporting preserves code version and private paths reject symlink escape",async()=>{
  const cases=[sample("negative",false)],manifest=benchmarkManifest(cases,"historical-fingerprint",{execution:"simulated"}),directory=dir();
  await runBenchmark(cases,directory,manifest,async(input,arm)=>output(input.message,arm),"primary");
  assert.deepEqual(historicalManifest(directory,cases),manifest);
  assert.throws(()=>historicalManifest(directory,[sample("different",false)]),/HISTORICAL_REFERENCE_CHANGED/);
  assert.throws(()=>benchmarkManifest([sample("../escape",false)],"test"),/INVALID_BENCHMARK_PLAN/);
  const root=dir(),outside=dir();mkdirSync(join(root,".cache"));symlinkSync(outside,join(root,".cache","link"));
  assert.throws(()=>privateBenchmarkDirectory(root,join(root,".cache","link","new-study")),/LOCAL_CACHE/);
  assert.equal(privateBenchmarkDirectory(root,join(root,".cache","new-study")),join(realpathSync(root),".cache","new-study"));
});
test("judge reporting replays raw evidence and retains every ungraded planned response",async()=>{
  const c=sample("control",false),cases=[c],manifest=benchmarkManifest(cases,"test",{execution:"simulated"}),directory=dir();
  const records=await runBenchmark(cases,directory,manifest,async(input,arm)=>output(input.message,arm),"primary"),r=records[0];
  const identity=rubricIdentity(c,r),packet=rubricPacket(c,r);
  const object={criteria:[{id:"criterion-0",verdict:"met",reason:"Authored criterion software control, no clinical approval.",anchors:[{unitId:"final",quote:"The Counsel clinical team"}]}],researchSupport:{verdict:"abstain",reason:"Source evidence is not assessed in this software control.",anchors:[]}};
  const grade=evaluateRubricJudgment(packet,c.rubrics,object),result={...identity,packetHash:packet.packetHash,status:"complete",grade,estimatedUsd:.01};
  writeFileSync(join(directory,`${identity.key}.raw.json`),JSON.stringify({object}));
  writeFileSync(join(directory,`${identity.key}.json`),JSON.stringify({...result,resultHash:digest(result)}));
  assert.equal(readRubricArtifact(directory,c,r).grade!.score,1);
  const report=summarizeRubrics(directory,manifest,cases,records);
  assert.equal(report.cohorts[0].arms.reduce((n,a)=>n+a.weightedRubricScore.assessed,0),1);
  assert.equal(report.cohorts[0].arms.reduce((n,a)=>n+a.weightedRubricScore.unassessed,0),1);
  assert.equal(report.cohorts[0].arms.reduce((n,a)=>n+a.researchSupport.pass,0),0);
  object.criteria[0].verdict="not_met";writeFileSync(join(directory,`${identity.key}.raw.json`),JSON.stringify({object}));
  assert.throws(()=>readRubricArtifact(directory,c,r),/REPLAY_MISMATCH/);
});
test("price estimates preserve missing usage and match the per-agent call count",()=>{
  const r=output("synthetic","base-opus"); r.modelCalls=1;r.agents=[{role:"disposition",model:"anthropic/claude-opus-5",modelCalls:1,output:null,failure:null,usage:{inputTokens:1000,outputTokens:100}}];
  assert.equal(estimateStudyCost(r),.0075);r.agents[0].usage.outputTokens=null;assert.equal(estimateStudyCost(r),null);
});
test("real Mastra workflow consumes one study reservation per run and preserves malformed-output failures",async()=>{
  const directory=dir(),budget=dir();let calls=0;
  writeFileSync(join(budget,"authorization.json"),JSON.stringify({version:"clinical-study-authorization/v1",approved:true,authorizationReference:"Synthetic Mastra test only; no provider execution",ceilingUSD:2,pricingVersion:STUDY_PRICING.version}));
  for(const arm of ["base-opus","adaptive-opus"] as const) {
    const runtime=createDispositionRuntime(join(directory,arm),async()=>{calls++;return {answer:{},usage:{inputTokens:20,outputTokens:2}};},{profile:arm,budget:"clinical-study",budgetDirectory:budget});
    try {
      const run=await runtime.assess("Synthetic software test input, no clinical benchmark claim.");
      assert.equal(run.status,"unavailable");assert.equal(run.profile,arm);assert.equal(run.adaptive!.version,ADAPTIVE_VERSION);
      assert.equal(run.modelCalls,arm==="base-opus"?1:2);assert.equal(run.artifactPersisted,true);
    } finally { await runtime.mastra.shutdown(); }
  }
  assert.equal(calls,3);assert.throws(()=>requireStudyCapacity(budget),/EXHAUSTED/);
});
test("physician rubric judge is blinded to arms and expected label; negative and unknown criteria retain meaning",async()=>{
  const c=sample("control",false);
  c.rubrics=[{criterion:"The response contains a requested good behavior.",points:2,tags:[]},{criterion:"The response contains a prohibited bad behavior.",points:-4,tags:[]}];c.rubricHash=digest(c.rubrics);
  const manifest=benchmarkManifest([c],"test",{execution:"simulated"});
  const records=await runBenchmark([c],dir(),manifest,async(input,arm)=>output(input.message,arm),"primary");
  const packet=rubricPacket(c,records[0]);
  assert.ok(!("emergencyExpected" in packet));assert.ok(!("arm" in packet));assert.ok(!("generationModel" in packet));assert.ok(!("points" in packet.criteria[0]));
  const anchor={unitId:"final",quote:"The Counsel clinical team"};
  const judgment={criteria:packet.criteria.map(c=>({id:c.id,verdict:"met",reason:"Explicit software fixture for verifying signed rubric weights.",anchors:[anchor]})),researchSupport:{verdict:"abstain",reason:"Source entailment has not been assessed by this software fixture.",anchors:[]}};
  assert.equal(evaluateRubricJudgment(packet,c.rubrics,judgment).score,-1);
  judgment.criteria[1].verdict="unresolved";
  const uncertain=evaluateRubricJudgment(packet,c.rubrics,judgment);assert.equal(uncertain.score,null);assert.deepEqual(uncertain.scoreBounds,[-1,1]);
  judgment.criteria[0].anchors[0]={unitId:"patient",quote:"invented quote"};assert.throws(()=>evaluateRubricJudgment(packet,c.rubrics,judgment),/ANCHOR_NOT_FOUND/);
});
test("source presence does not earn a source-support pass and weights cannot change after freeze",async()=>{
  const c=sample("control",false),manifest=benchmarkManifest([c],"test",{execution:"simulated"});
  const records=await runBenchmark([c],dir(),manifest,async(input,arm)=>output(input.message,arm),"primary");
  const packet=rubricPacket(c,records[0]),anchor={unitId:"final",quote:"The Counsel clinical team"};
  const judgment={criteria:[{id:"criterion-0",verdict:"met",reason:"Software-only criterion control was assessed.",anchors:[anchor]}],researchSupport:{verdict:"pass",reason:"This incorrect assertion must be rejected without a passage anchor.",anchors:[anchor]}};
  assert.throws(()=>evaluateRubricJudgment(packet,c.rubrics,judgment),/SOURCE_PASS_WITHOUT_PASSAGE/);
  judgment.researchSupport.verdict="abstain";
  judgment.criteria[0].anchors=[{unitId:"patient",quote:c.turns[0].content}];
  assert.throws(()=>evaluateRubricJudgment(packet,c.rubrics,judgment),/CRITERION_WITHOUT_RESPONSE_ANCHOR/);
  c.rubrics[0].points=100;
  assert.throws(()=>rubricPacket(c,records[0]),/REFERENCE_INVALID/);
  await assert.rejects(runBenchmark([c],dir(),manifest,async(input,arm)=>output(input.message,arm),"primary"),/CASES_CHANGED/);
});
