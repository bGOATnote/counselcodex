import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseEnv } from "node:util";
import { loadClinicalBenchmark, benchmarkManifest, digest, planBenchmark, readBenchmarkRecords, runBenchmark, summarizeBenchmark } from "../src/evaluation/clinical-benchmark.ts";
import { createDispositionRuntime, repositoryRoot } from "../src/disposition/runtime.ts";
import { readStudyAuthorization,requireStudyCapacity } from "../src/evaluation/clinical-study-budget.ts";
import { loadPassageCorpus } from "../src/evidence/search.ts";
import { createBenchmarkGrader } from "../src/evaluation/benchmark-rubric-runtime.ts";
import { historicalManifest,privateBenchmarkDirectory,summarizeRubrics } from "../src/evaluation/benchmark-report.ts";

const [command,output,stage="pilot",authorizationDirectory]=process.argv.slice(2);
if(!["plan","run","grade","report"].includes(command) || !output || !["pilot","primary","stress"].includes(stage)) throw new Error("Usage: clinical:benchmark plan|run|grade|report PRIVATE_DIRECTORY [pilot|primary|stress] [AUTHORIZED_BUDGET_DIRECTORY]");
const root=repositoryRoot(), directory=privateBenchmarkDirectory(root,output);
const config=JSON.parse(readFileSync(join(root,"configs/healthbench-emergency-counsel-method-v1.json"),"utf8"));
const source=readFileSync(join(root,".cache/healthbench/consensus_2025-05-09-20-00-46.jsonl"),"utf8");
const benchmark=loadClinicalBenchmark(source,config);
const files=[...readdirSync(join(root,"src"),{recursive:true}).filter((p):p is string=>typeof p==="string" && /\.(ts|mjs)$/.test(p)).map(p=>`src/${p}`),"package-lock.json","scripts/clinical-benchmark.ts"].sort();
const fingerprint=digest({ sources:files.map(p=>[p,readFileSync(join(root,p),"utf8")]),corpus:loadPassageCorpus(process.env.COUNSEL_PASSAGE_CORPUS),selectionHash:benchmark.selectionHash,upstreamHash:benchmark.upstreamHash });
const manifest=["grade","report"].includes(command)?historicalManifest(directory,benchmark.cases):benchmarkManifest(benchmark.cases,fingerprint);
if(["plan","run"].includes(command)) planBenchmark(directory,manifest);
if(command==="run") {
  if(!authorizationDirectory) throw new Error("STUDY_REQUIRES_EXPLICIT_SPEND_AUTHORIZATION");
  const budgetDirectory=resolve(authorizationDirectory);
  readStudyAuthorization(budgetDirectory); // fail BEFORE admitting any attempts
  if(!process.env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY=parseEnv(readFileSync(join(root,".env"),"utf8")).ANTHROPIC_API_KEY;
  if(!process.env.ANTHROPIC_API_KEY) throw new Error("PROVIDER_KEY_MISSING");
  const controller=new AbortController(); process.once("SIGINT",()=>controller.abort());
  await runBenchmark(benchmark.cases,directory,manifest,async(input,arm,onEvent)=>{
    const runtime=createDispositionRuntime(join(directory,"runtime",arm),undefined,{profile:arm,budget:"clinical-study",budgetDirectory});
    try { return await runtime.assess(input.message,undefined,onEvent,AbortSignal.any([controller.signal,AbortSignal.timeout(90000)])); }
    finally { await runtime.mastra.shutdown(); }
  },stage as "pilot"|"primary"|"stress",controller.signal,()=>requireStudyCapacity(budgetDirectory));
}
const records=readBenchmarkRecords(directory,manifest);
if(command==="grade") {
  if(!authorizationDirectory) throw new Error("STUDY_REQUIRES_EXPLICIT_SPEND_AUTHORIZATION");
  const budgetDirectory=resolve(authorizationDirectory);readStudyAuthorization(budgetDirectory);
  if(!process.env.OPENAI_API_KEY) process.env.OPENAI_API_KEY=parseEnv(readFileSync(join(root,".env"),"utf8")).OPENAI_API_KEY;
  if(!process.env.OPENAI_API_KEY) throw new Error("JUDGE_PROVIDER_KEY_MISSING");
  const grader=createBenchmarkGrader(join(directory,"judgments"),budgetDirectory);
  try {
    for(const r of records) {
      const c=benchmark.cases.find(c=>c.id===r.id)!;
      const selected=stage==="pilot" ? manifest.pilotIds.includes(c.id) : stage==="primary" ? c.cohort==="primary" : c.cohort!=="primary";
      // Failed final assessments with a stored run are judged too. Unsupported
      // or thrown attempts without a run remain explicit evaluation gaps.
      if(selected && r.run && !c.unsupportedReason) await grader.grade(c,r);
    }
  } finally { await grader.shutdown(); }
}
const summary={ audit:benchmark.audit,...summarizeBenchmark(manifest,records),rubrics:summarizeRubrics(join(directory,"judgments"),manifest,benchmark.cases,records) };
const reportPath=join(directory,`summary-${Date.now()}.json`);
writeFileSync(reportPath,JSON.stringify(summary,null,2),{flag:"wx",mode:0o600});
// Only metadata and aggregates may be copied to a public report. Never print
// benchmark questions, rejected answers, source passages, or judge rubrics.
console.log(JSON.stringify({command,manifest:join(directory,"manifest.json"),report:reportPath,audit:benchmark.audit,plannedArms:manifest.arms,pilotCases:manifest.pilotIds.length,recorded:records.length},null,2));
