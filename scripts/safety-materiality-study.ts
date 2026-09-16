import { existsSync,mkdirSync,readFileSync,writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve,join } from "node:path";
import { parseEnv } from "node:util";
import { stripTypeScriptTypes } from "node:module";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { safetySchema,compactSafetyWireSchema,normalizeSafetyWire,assessSafetyAdmission,graphJudgeSchema,validateGraphJudge,GRAPH_OUTPUT_LIMITS } from "../src/disposition/clinical-graph.ts";
import { graphJudgeInstructions,graphSafetyInstructions } from "../src/disposition/graph-prompts.ts";
import { consumeStructuredStream,safetyEnvelopeTransport } from "../src/disposition/transport.ts";
import { requestDeadline,EXECUTION_POLICY } from "../src/disposition/execution-policy.ts";
import { continuationFixtures,safetyContinuationCases,CONTINUATION_PROTOCOL } from "../src/evaluation/continuation-fixtures.ts";
import { sha256 } from "../src/evidence/rag/model.ts";

const args=process.argv.slice(2),live=args.includes("--live"),directory=resolve(args.find(a=>a.startsWith("--output="))?.slice(9)??"MISSING_OUTPUT");
if(!args.some(a=>a.startsWith("--output="))||existsSync(directory))throw new Error("FRESH_EXPLICIT_OUTPUT_REQUIRED");
const baselineCommit="ec45b1f22b782599601d1008f07aaca87eba410c";
// Compile the exact pinned prompt source; clinical policy is unchanged and its
// current contents must match that commit before this reconstruction is valid.
const policy=execFileSync("git",["show",`${baselineCommit}:src/disposition/clinical-policy.ts`],{encoding:"utf8"});
if(policy!==readFileSync("src/disposition/clinical-policy.ts","utf8"))throw new Error("BASELINE_POLICY_CHANGED");
const baselineSource=execFileSync("git",["show",`${baselineCommit}:src/disposition/graph-prompts.ts`],{encoding:"utf8"});
const compiled=stripTypeScriptTypes(baselineSource.replace('"./clinical-policy.ts"',JSON.stringify(pathToFileURL(resolve("src/disposition/clinical-policy.ts")).href)),{mode:"strip"});
const baseline=await import("data:text/javascript;base64,"+Buffer.from(compiled).toString("base64"));
const fixtures=continuationFixtures(),safety=safetyContinuationCases();
const prompts={safety:{baseline:baseline.GRAPH_INSTRUCTIONS.safety as string,candidate:graphSafetyInstructions("compact")},judge:{baseline:baseline.graphJudgeInstructions("full") as string,candidate:graphJudgeInstructions("full")}};
const manifest={protocol:CONTINUATION_PROTOCOL,createdAt:new Date().toISOString(),baselineCommit,baselinePromptSourceHash:sha256(baselineSource),implementationHash:sha256(readFileSync("src/disposition/clinical-graph.ts","utf8")),
  authorization:{reference:"User September 14: continue prior $40 sprint for next couple hours",totalUSD:40,priorConservativeAccountedUSD:20.130208,continuationRemainingUSD:19.869792,fixedStudyAllocationUSD:10,remainingGuiAllocationUSD:9.869792,maximumCalls:safety.length*2+fixtures.length*2},
  models:{safety:"anthropic/claude-haiku-4-5",judge:"openai/gpt-6-astra"},prompts,schemas:{safetyBaseline:safetySchema.toJSONSchema(),safetyCandidate:compactSafetyWireSchema.toJSONSchema(),judge:graphJudgeSchema.toJSONSchema()},safety,fixtures,
  limitation:"Engineering-authored targeted expectations, not held-out or physician claim-level validation. Sources and judge packets reconstructed from frozen artifacts, not exact live packet replay. Full judge output style and 6144-token limit identical across arms. No answer-generation or retrieval-model comparison."};
mkdirSync(directory,{recursive:true});
const write=(name:string,value:unknown)=>writeFileSync(join(directory,name),JSON.stringify(value,null,2)+"\n",{flag:"wx",mode:0o600});
write("manifest.json",{...manifest,fingerprint:sha256(JSON.stringify(manifest))});
if(!live){console.log(JSON.stringify({directory,plannedCalls:manifest.authorization.maximumCalls,paidCalls:0}));process.exit(0);}
const claim=args.find(a=>a.startsWith("--claim="))?.slice(8);if(!claim)throw new Error("SINGLE_USE_CLAIM_REQUIRED");
writeFileSync(resolve(claim),JSON.stringify({directory,fingerprint:sha256(JSON.stringify(manifest)),authorization:manifest.authorization})+"\n",{flag:"wx",mode:0o600});
const env=parseEnv(readFileSync(".env","utf8"));for(const key of ["OPENAI_API_KEY","ANTHROPIC_API_KEY"])process.env[key]||=env[key];
if(!process.env.OPENAI_API_KEY||!process.env.ANTHROPIC_API_KEY)throw new Error("KEYS_MISSING");
let calls=0,accountedUSD=0;const rows:object[]=[];
async function call(role:"safety"|"judge",arm:"baseline"|"candidate",id:string,packet:unknown){
  const schema=role==="judge"?graphJudgeSchema:arm==="candidate"?compactSafetyWireSchema:safetySchema;
  const prompt=JSON.stringify(packet),instructions=prompts[role][arm],price=role==="judge"?{input:10,output:50}:{input:1,output:5},limit=role==="judge"?GRAPH_OUTPUT_LIMITS.judge:GRAPH_OUTPUT_LIMITS.safety;
  const reservation=(Buffer.byteLength(prompt+instructions+JSON.stringify(schema.toJSONSchema()))+8192)*price.input/1e6+limit*price.output/1e6;
  if(accountedUSD+reservation>10||calls>=manifest.authorization.maximumCalls)throw new Error("CONTINUATION_ALLOCATION_EXHAUSTED");
  const index=++calls;accountedUSD+=reservation;
  write(`${index}-started.json`,{id,role,arm,packet,packetHash:sha256(prompt),instructionsHash:sha256(instructions),reservationUSD:reservation,accountedUSD,at:new Date().toISOString()});
  const agent=new Agent({id:`study-${role}-${arm}`,name:`Study ${role}`,model:manifest.models[role] as `${string}/${string}`,instructions,maxRetries:0});
  const deadline=requestDeadline(new AbortController().signal,EXECUTION_POLICY.modelTimeoutMs);
  const execution=await consumeStructuredStream({signal:deadline.signal,start:abortSignal=>agent.stream(prompt,{abortSignal,structuredOutput:{schema:safetyEnvelopeTransport(schema,z.unknown()),errorStrategy:"strict"},maxSteps:1,modelSettings:{maxOutputTokens:limit,maxRetries:0},...(role==="judge"?{providerOptions:{openai:{reasoningEffort:"low" as const}}}:{}),tracingOptions:{hideInput:true,hideOutput:true}})}).finally(()=>deadline.dispose());
  const cost=execution.usage.inputTokens===null||execution.usage.outputTokens===null?null:(execution.usage.inputTokens*price.input+execution.usage.outputTokens*price.output)/1e6;
  if(cost!==null)accountedUSD+=cost-reservation;
  write(`${index}-result.json`,{id,role,arm,execution,estimatedUSD:cost,accountedUSD});
  console.log(JSON.stringify({index,id,role,arm,failure:execution.failure,ms:execution.durationMs,tokens:execution.usage.outputTokens,estimatedUSD:cost,accountedUSD}));
  return execution;
}
try{
  for(const [i,f] of safety.entries())for(const arm of i%2?["candidate","baseline"] as const:["baseline","candidate"] as const){
    const execution=await call("safety",arm,f.id,{patient:f.message});let value:ReturnType<typeof normalizeSafetyWire>|null=null;
    try{if(!execution.failure)value=normalizeSafetyWire(execution.output,arm==="candidate");}catch{}
    const admission=assessSafetyAdmission(value,f.message);
    const row={id:f.id,role:"safety",arm,action:value?.action??null,matched:Boolean(value&&f.acceptedActions.includes(value.action)&&admission.admission.status!=="rejected"),admission,ms:execution.durationMs,firstTextMs:execution.firstTextDeltaMs,tokens:execution.usage.outputTokens};rows.push(row);write(`${f.id}-${arm}-outcome.json`,row);
  }
  for(const [i,f] of [...fixtures].sort((a,b)=>sha256(a.id).localeCompare(sha256(b.id))).entries())for(const arm of i%2?["candidate","baseline"] as const:["baseline","candidate"] as const){
    const execution=await call("judge",arm,f.id,f.packet),judge=execution.failure?null:validateGraphJudge(execution.output,f.packet.units,true,null);
    const observed=judge?.criteria.find(c=>c.id===f.criterion)?.verdict??null;
    const row={id:f.id,role:"judge",arm,expected:f.expected,criterion:f.criterion,observed,matched:observed===f.expected,valid:Boolean(judge),judge,ms:execution.durationMs,tokens:execution.usage.outputTokens,packetHash:sha256(JSON.stringify(f.packet))};rows.push(row);write(`${f.id}-${arm}-outcome.json`,row);
  }
}finally{write("summary.json",{protocol:CONTINUATION_PROTOCOL,calls,accountedUSD,remainingAuthorizedUSD:19.869792-accountedUSD,rows,clinicalApproval:false});}
