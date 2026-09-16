/** Authorized continuation: one attempt per remaining case; failures are rows. */
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, openSync, closeSync, fsyncSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { freezeV25, verifyV25, v25IdentityFailures, v25Account, type V25Plan } from "./v25-cohort-study.ts";
import { cohortRequestBody, validateCohortEndpoint } from "./candidate-cohort-study.ts";
import { readDispositionStream } from "../apps/evaluation/lib/disposition-stream.ts";
import { readPhysicianReference, scorePhysicianCohort } from "../src/evaluation/physician-cohort.ts";
import { scoreV25PathB, type PathBAttemptAdmission } from "../src/evaluation/v25-path-b.ts";
import { sha256 } from "../src/evidence/rag/model.ts";
import type { DispositionRun } from "../src/disposition/contract.ts";

const write = (p:string,x:unknown) => writeFileSync(p,JSON.stringify(x,null,2)+"\n",{flag:"wx",mode:0o600});
const hashFile = (p:string) => sha256(readFileSync(p));
const walk = (p:string):string[] => readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(p,e.name)):[join(p,e.name)]);
const errorText = (e:unknown) => e instanceof Error ? e.message : "UNKNOWN_CASE_FAILURE";
type Input = {id:string;message:string;inputHash:string};
type Attempt = {id:string;attempt:"first_attempt";runId:string|null;status:string;httpAccepted:boolean;failure:string|null;identityFailures:string[];estimatedModelUSD:number|null;estimatedEmbeddingUSD:number|null;unknownUsage:boolean;accountedUSD:number;accountedCumulativeUSD:number;providerCompleteHttpMs:number|null};

export function remainingCases(cases:Input[],prior:PathBAttemptAdmission[]) {
  if(new Set(prior.map(a=>a.id)).size!==prior.length || prior.some(a=>!cases.some(c=>c.id===a.id))) throw new Error("INVALID_PRIOR_CASE_ADMISSIONS");
  const ids=new Set(prior.map(a=>a.id)); return cases.filter(c=>!ids.has(c.id));
}
/** Only budget controls continuation. An individual exception is recorded,
 * never converted to a rerun or a reason to skip the following case. */
export async function continueCases<T>(cases:T[],canSpend:()=>boolean,execute:(c:T)=>Promise<void>,recordFailure:(c:T,error:unknown)=>Promise<void>) {
  for(const c of cases) { if(!canSpend()) return "BUDGET_CANNOT_RESERVE_NEXT_REQUEST"; try {await execute(c);} catch(e) {await recordFailure(c,e);} }
  return null;
}
export function freezeContinuation(priorDirectory:string) {
  const base=freezeV25();
  const priorPlan=JSON.parse(readFileSync(join(priorDirectory,"manifest.json"),"utf8")) as V25Plan;
  const admissions=JSON.parse(readFileSync(join(priorDirectory,"runtime","attempt-admission.json"),"utf8")) as PathBAttemptAdmission[];
  const ledger=JSON.parse(readFileSync(join(priorDirectory,"ledger.json"),"utf8"));
  if(base.promptHash!==priorPlan.promptHash || base.configHash!==priorPlan.configHash || base.corpusFileHash!==priorPlan.corpusFileHash || base.goldHash!==priorPlan.goldHash) throw new Error("GENERATION_OR_REFERENCE_CHANGED");
  if(!Number.isFinite(ledger.accountedUSD)||ledger.accountedUSD<0||ledger.accountedUSD>=90) throw new Error("PRIOR_BUDGET_INVALID");
  const codePaths=["scripts/v25-cohort-continue.ts","tests/v25-cohort-continue.test.ts"];
  for(const p of codePaths) if(sha256(execFileSync("git",["show",`${base.commit}:${p}`]))!==hashFile(p)) throw new Error(`UNCHECKED_IN_CODE:${p}`);
  const plan={protocol:"v25-path-b-continuation/v2",createdAt:new Date().toISOString(),base,
    codeFiles:Object.fromEntries(codePaths.map(p=>[p,hashFile(p)])),priorDirectory,priorFiles:Object.fromEntries(walk(priorDirectory).map(p=>[p,hashFile(p)])),
    remainingCaseIds:remainingCases(base.cases,admissions).map(c=>c.id),priorAccountedUSD:ledger.accountedUSD as number,
    ceilingUSD:90,authorization:"User: finish 50 first-attempt rows, inclusive $90 API; continue after each case failure; RAG only afterwards.",
    change:"Shared exact V25 Hit selection fixes GUI binding; same prompts, models, corpus, release gates and no-judge happy path. Prior four admissions are preserved, not regraded.",
    individualFailurePolicy:"record_and_continue",debugReruns:0,judgeCalls:0};
  return {...plan,fingerprint:sha256(JSON.stringify(plan))};
}
export type ContinuationPlan=ReturnType<typeof freezeContinuation>;
export function verifyContinuation(plan:ContinuationPlan) {
  const {fingerprint,...value}=plan;
  if(fingerprint!==sha256(JSON.stringify(value))||plan.protocol!=="v25-path-b-continuation/v2"||plan.ceilingUSD!==90) throw new Error("CONTINUATION_PLAN_INVALID");
  verifyV25(plan.base);
  for(const [p,h] of Object.entries({...plan.codeFiles,...plan.priorFiles})) if(hashFile(p)!==h) throw new Error(`CONTINUATION_IDENTITY_DRIFT:${p}`);
}
async function captureCase(plan:V25Plan,c:Input,prefix:string) {
  const began=performance.now(),priorNames=new Set(readdirSync(join(plan.runtime,"runs")));
  const fd=openSync(`${prefix}-wire.ndjson`,"wx",0o600),receiptFd=openSync(`${prefix}-receipts.jsonl`,"wx",0o600);
  let run:DispositionRun|null=null,failure:string|null=null;
  try {
    const url=validateCohortEndpoint(plan.endpoint);
    const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json",Origin:url.origin,"x-counsel-review":"local-v1"},body:JSON.stringify(cohortRequestBody(c.message)),signal:AbortSignal.timeout(plan.httpAllowanceMs)});
    write(`${prefix}-http.json`,{status:response.status,headers:Object.fromEntries(response.headers)});
    if(!response.ok||!response.body){writeFileSync(fd,await response.text());throw new Error(`HTTP_${response.status}`);}
    const stream=response.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){writeFileSync(fd,chunk);fsyncSync(fd);controller.enqueue(chunk);}}));
    run=await readDispositionStream(new Response(stream,{headers:response.headers}),c.message,()=>{},(event,timing)=>{
      writeFileSync(receiptFd,JSON.stringify({phase:"published",receivedMs:timing.receivedAtMs-began,publishedMs:timing.publishedAtMs-began,event})+"\n");fsyncSync(receiptFd);
    },(event,at)=>{writeFileSync(receiptFd,JSON.stringify({phase:"received",receivedMs:at-began,event})+"\n");fsyncSync(receiptFd);});
  } catch(e){failure=errorText(e);} finally {closeSync(fd);closeSync(receiptFd);}
  if(!run) {
    const fresh=readdirSync(join(plan.runtime,"runs")).filter(n=>!priorNames.has(n)).flatMap(n=>{try{return [JSON.parse(readFileSync(join(plan.runtime,"runs",n),"utf8")) as DispositionRun];}catch{return [];}}).filter(r=>r.message===c.message);
    if(fresh.length===1)run=fresh[0];
  }
  let identityFailures:string[]=[];
  if(run){
    write(`${prefix}-run.json`,run);
    const eventPath=join(plan.runtime,"events",`${run.runId}.jsonl`),raw=existsSync(eventPath)?readFileSync(eventPath,"utf8"):null;
    if(raw)writeFileSync(`${prefix}-server-events.jsonl`,raw,{flag:"wx"});
    identityFailures=v25IdentityFailures(plan,run,c.message,raw?JSON.parse(raw.split("\n")[0]):null);
  }
  return {run,failure,identityFailures,httpMs:Math.round(performance.now()-began)};
}
export async function runContinuation(plan:ContinuationPlan,output:string,claim:string|undefined) {
  verifyContinuation(plan);
  if(process.env.PAID_EVAL_UNLOCK!=="90"||claim!==plan.fingerprint)throw new Error("EXPLICIT_90_DOLLAR_UNLOCK_REQUIRED");
  if(existsSync(output))throw new Error("NEW_OUTPUT_DIRECTORY_REQUIRED");
  write(join("outputs/.v25-eval-claims",`${plan.fingerprint}.json`),{output:resolve(output),ceilingUSD:90,priorAccountedUSD:plan.priorAccountedUSD});
  mkdirSync(output);mkdirSync(join(output,"runtime"));mkdirSync(join(output,"runtime","runs"));mkdirSync(join(output,"runtime","diagnostic-runs"));
  write(join(output,"manifest.json"),plan);
  const priorLedger=JSON.parse(readFileSync(join(plan.priorDirectory,"ledger.json"),"utf8"));
  const attempts:Attempt[]=priorLedger.attempts;
  const admissions:PathBAttemptAdmission[]=JSON.parse(readFileSync(join(plan.priorDirectory,"runtime","attempt-admission.json"),"utf8"));
  const runs:DispositionRun[]=[];
  for(const directory of ["diagnostic-runs","runs"])for(const n of readdirSync(join(plan.priorDirectory,"runtime",directory))){
    const r=JSON.parse(readFileSync(join(plan.priorDirectory,"runtime",directory,n),"utf8")) as DispositionRun;
    write(join(output,"runtime",directory,n),r);if(directory==="diagnostic-runs")runs.push(r);
  }
  let accountedUSD=plan.priorAccountedUSD;
  const cases=remainingCases(plan.base.cases,admissions);
  if(JSON.stringify(cases.map(c=>c.id))!==JSON.stringify(plan.remainingCaseIds))throw new Error("RESUME_CASES_CHANGED");
  async function settle(c:Input,result:{run:DispositionRun|null;failure:string|null;identityFailures:string[];httpMs:number}) {
    const {run,failure,identityFailures}=result,cost=v25Account(run,plan.base.reservation);
    accountedUSD+=cost.accountedUSD;
    const eligible=failure===null&&identityFailures.length===0&&run!==null;
    const attempt:Attempt={id:c.id,attempt:"first_attempt",runId:run?.runId??null,status:run?.status??"transport_or_unfinished",httpAccepted:failure===null,failure,identityFailures,...cost,accountedCumulativeUSD:accountedUSD,providerCompleteHttpMs:eligible&&run.status==="complete"?result.httpMs:null};
    attempts.push(attempt);admissions.push({id:c.id,runId:run?.runId??null,eligible,failure:failure??(identityFailures.length?identityFailures.join(";"):null)});
    if(run){runs.push(run);write(join(output,"runtime","diagnostic-runs",`${run.runId}.json`),run);if(eligible)write(join(output,"runtime","runs",`${run.runId}.json`),run);}
    write(join(output,`${c.id}-attempt.json`),attempt);console.log(JSON.stringify(attempt));
  }
  const stopReason=await continueCases(cases,()=>accountedUSD+plan.base.reservation.perRunUSD<=plan.ceilingUSD,async c=>{
    const prefix=join(output,c.id);
    write(`${prefix}-started.json`,{id:c.id,attempt:"first_attempt",at:new Date().toISOString(),inputHash:c.inputHash,reservedUSD:plan.base.reservation.perRunUSD,priorAccountedUSD:accountedUSD});
    verifyContinuation(plan);
    await settle(c,await captureCase(plan.base,c,prefix));
  },async(c,error)=>{
    // A completed settlement cannot be charged twice if its final log write fails.
    if(attempts.some(a=>a.id===c.id))return;
    const path=join(output,`${c.id}-run.json`);
    let run:DispositionRun|null=null;try{if(existsSync(path))run=JSON.parse(readFileSync(path,"utf8"));}catch{/* keep full unknown-usage reserve */}
    await settle(c,{run,failure:errorText(error),identityFailures:[],httpMs:0});
  });
  write(join(output,"runtime","attempt-admission.json"),admissions);
  write(join(output,"ledger.json"),{ceilingUSD:90,priorAccountedUSD:plan.priorAccountedUSD,accountedUSD,remainingUSD:90-accountedUSD,stopReason,plannedN:50,started:attempts.length,unattempted:remainingCases(plan.base.cases,admissions).map(c=>c.id),
    estimatedModelUSD:attempts.reduce((n,a)=>n+(a.estimatedModelUSD??0),0),estimatedEmbeddingUSD:attempts.reduce((n,a)=>n+(a.estimatedEmbeddingUSD??0),0),unknownUsageAttempts:attempts.filter(a=>a.unknownUsage).length,attempts});
  const reference=readPhysicianReference(readFileSync(plan.base.goldPath,"utf8"),readFileSync("data/patient_messages.csv","utf8"));
  const acceptedRuns=runs.filter(r=>admissions.some(a=>a.runId===r.runId&&a.eligible));
  const score={...scorePhysicianCohort(reference,acceptedRuns,plan.base.promptHash),pathB:scoreV25PathB(reference,runs,plan.base.promptHash,admissions)};
  write(join(output,"scorecard.json"),score);
  console.log(JSON.stringify({finished:true,attempted:score.pathB.attempted,complete:score.pathB.complete,agreement:score.pathB.agreement,accountedUSD,stopReason,output}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [command,path,output,claim]=process.argv.slice(2);
  if(command==="freeze"&&path&&output){const p=freezeContinuation(path);write(output,p);console.log(JSON.stringify({path:output,fingerprint:p.fingerprint,remaining:p.remainingCaseIds,paidCalls:0}));}
  else if(command==="run"&&path&&output)await runContinuation(JSON.parse(readFileSync(path,"utf8")),output,claim);
  else throw new Error("Usage: v25-cohort-continue.ts freeze PRIOR_DIRECTORY NEW_PLAN | run PLAN NEW_OUTPUT FINGERPRINT");
}
