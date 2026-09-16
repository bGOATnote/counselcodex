import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { Agent } from "@mastra/core/agent";
import { createStep,createWorkflow } from "@mastra/core/workflows";
import { Mastra } from "@mastra/core/mastra";
import { noopLogger } from "@mastra/core/logger";
import { LibSQLStore } from "@mastra/libsql";
import { Observability,MastraStorageExporter } from "@mastra/observability";
import { z } from "zod";
import { abortable,persistTraceWithinDeadline } from "../disposition/transport.ts";
import { reserveClinicalStudyRun,requireStudyCapacity } from "./clinical-study-budget.ts";
import { digest,type BenchmarkCase,type BenchmarkRecord } from "./clinical-benchmark.ts";
import { BENCHMARK_JUDGE_MODEL,BENCHMARK_JUDGE_INSTRUCTIONS,rubricJudgmentSchema,rubricPacket,rubricIdentity,evaluateRubricJudgment,type RubricPacket } from "./benchmark-rubrics.ts";

export function createBenchmarkGrader(directory:string,budgetDirectory:string) {
  mkdirSync(directory,{recursive:true,mode:0o700});
  const agent=new Agent({id:"benchmark-physician-rubric-auditor",name:"Independent physician-rubric evaluation",model:BENCHMARK_JUDGE_MODEL,instructions:BENCHMARK_JUDGE_INSTRUCTIONS,maxRetries:0});
  const step=createStep({id:"grade-upstream-criteria",inputSchema:z.custom<RubricPacket>(),outputSchema:z.custom<{object:unknown;usage:{inputTokens:number|null;outputTokens:number|null}}>(),execute:async({inputData,tracingContext})=>{
    if(Buffer.byteLength(JSON.stringify(inputData)+BENCHMARK_JUDGE_INSTRUCTIONS)>40000) throw new Error("RUBRIC_PACKET_TOO_LARGE");
    reserveClinicalStudyRun(budgetDirectory,"grading");
    const signal=AbortSignal.timeout(60000);
    const result=await abortable(()=>agent.generate(JSON.stringify({units:inputData.units,criteria:inputData.criteria}),{abortSignal:signal,tracingContext,maxSteps:1,structuredOutput:{schema:rubricJudgmentSchema,errorStrategy:"strict"},modelSettings:{maxRetries:0,maxOutputTokens:6000},tracingOptions:{hideInput:true,hideOutput:true}}),signal);
    return {object:result.object,usage:{inputTokens:result.usage?.inputTokens??null,outputTokens:result.usage?.outputTokens??null}};
  }});
  const workflow=createWorkflow({id:"benchmark-reference-review",inputSchema:step.inputSchema,outputSchema:step.outputSchema}).then(step).commit();
  const storage=new LibSQLStore({id:"benchmark-judgments",url:`file:${join(directory,"traces.db")}`});
  const observability=new Observability({configs:{default:{serviceName:"benchmark-reference-review",exporters:[new MastraStorageExporter({customSpanFormatter:s=>({...s,input:undefined,output:undefined,errorInfo:s.errorInfo?{message:"REDACTED_JUDGE_ERROR"}:undefined})})],includeInternalSpans:false,logging:{enabled:false}}}});
  const mastra=new Mastra({agents:{rubricJudge:agent},workflows:{benchmarkReview:workflow},storage,observability,logger:noopLogger});
  const save=(path:string,value:unknown)=>{const fd=openSync(path,"wx",0o600);try{writeFileSync(fd,JSON.stringify(value,null,2));fsyncSync(fd);}finally{closeSync(fd);}};
  return {shutdown:()=>mastra.shutdown(), async grade(c:BenchmarkCase,r:BenchmarkRecord) {
    const identity=rubricIdentity(c,r),key=identity.key,path=join(directory,`${key}.json`),attempt=join(directory,`${key}.attempt.json`);
    if(existsSync(path)) { const saved=JSON.parse(readFileSync(path,"utf8")),{resultHash,...body}=saved; if(resultHash!==digest(body) || saved.key!==key)throw new Error("JUDGE_RESULT_CHANGED");return saved; }
    // Immutable admission doubles as per-packet lock. A process crash cannot
    // silently repeat a paid judgment. Recovery inspects raw artifacts first.
    if(existsSync(attempt)) return {...identity,status:"interrupted",grade:null,recordHash:r.recordHash};
    // Invalid packets are durable failures without spending. They cannot stop
    // the remainder of a batch or disappear from its judging denominator.
    let packet:RubricPacket;
    try { packet=rubricPacket(c,r); }
    catch {
      const result={...identity,packetHash:null,status:"invalid_packet",grade:null,failure:"RUBRIC_PACKET_REJECTED",usage:null,traceId:null,tracePersisted:false,durationMs:0,estimatedUsd:0};
      const saved={...result,resultHash:digest(result)};save(path,saved);return saved;
    }
    requireStudyCapacity(budgetDirectory);
    save(attempt,{...identity,recordHash:r.recordHash,at:new Date().toISOString()});
    const started=performance.now(),traceId=randomBytes(16).toString("hex");
    let grade:ReturnType<typeof evaluateRubricJudgment>|null=null,failure:string|null=null,usage:{inputTokens:number|null;outputTokens:number|null}|null=null,tracePersisted=false;
    try {
      const run=await mastra.getWorkflow("benchmarkReview").createRun();
      const result=await run.start({inputData:packet,tracingOptions:{traceId,hideInput:true,hideOutput:true}});
      if(result.status!=="success")throw new Error("JUDGE_EXECUTION_FAILED");
      usage=result.result.usage;save(join(directory,`${key}.raw.json`),result.result);
      grade=evaluateRubricJudgment(packet,c.rubrics,result.result.object);
      tracePersisted=(await persistTraceWithinDeadline({flush:()=>observability.flush(),verify:async()=>Boolean(await(await storage.getStore("observability"))?.getTrace({traceId}))})).persisted;
    }catch(error){failure=error instanceof Error && /^(RUBRIC_|JUDGE_)/.test(error.message)?error.message:"JUDGE_FAILED";}
    const result={...identity,packetHash:packet.packetHash,status:grade?"complete":"failed",grade,failure,usage,traceId,tracePersisted,durationMs:Math.round(performance.now()-started),estimatedUsd:usage?.inputTokens!=null && usage.outputTokens!=null?(usage.inputTokens*10+usage.outputTokens*50)/1e6:null};
    const saved={...result,resultHash:digest(result)};save(path,saved);return saved;
  }};
}
