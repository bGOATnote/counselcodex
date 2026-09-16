/** New-output-only authored retrieval ablation. No disposition/judge calls. */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { ClinicalRagStore, openAiEmbed, EMBEDDING_POLICY, type Embed } from "./store.ts";
import { restoreCorpus, sha256, type Hit, type Retrieval } from "./model.ts";
import { verifyCorpusIndexIdentity } from "./index-identity.ts";
import { selectGraphEvidence } from "./selection.ts";
import { dispositionQueryHint, selectDispositionEvidence, V26_SELECTION_POLICY } from "./v26.ts";
import { V26_CHALLENGES, type V26Challenge } from "./v26-challenges.ts";

const write = (path:string,value:unknown) => writeFileSync(path,JSON.stringify(value,null,2)+"\n",{flag:"wx",mode:0o600});
const sourcePaths=["src/evidence/rag/v26.ts","src/evidence/rag/v26-challenges.ts","src/evidence/rag/v26-probe.ts","src/evidence/rag/v26.test.ts","src/evidence/rag/store.ts","src/evidence/rag/model.ts","src/evidence/rag/selection.ts"];
const mean = (xs:number[]) => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
export function probeBudget(priorMissionUSD: number, phaseReservedUSD: number, requestedUSD: number) {
  if ([priorMissionUSD,phaseReservedUSD,requestedUSD].some(n=>typeof n!=="number"||!Number.isFinite(n)||n<0)) throw new Error("INVALID_SPEND_LEDGER");
  const phaseCeilingUSD=Math.min(15,90-priorMissionUSD);
  if(requestedUSD>phaseCeilingUSD-phaseReservedUSD+1e-12)throw new Error("CUMULATIVE_PROBE_BUDGET_EXHAUSTED");
  return {phaseCeilingUSD,phaseReservedUSD:phaseReservedUSD+requestedUSD};
}
/** Reserve the entire bounded query-only run, append-only across fresh outputs.
 * Reservations stay conservative after failure; no optimistic refund/retry loop. */
function reserveProbeRun(directory:string,output:string,priorMissionUSD:number,requestedUSD:number) {
  mkdirSync(directory,{recursive:true});const lock=join(directory,"reservation.lock");
  mkdirSync(lock); // Concurrent/stale lock fails before any API call.
  try {
    const reservations=readdirSync(directory).filter(n=>n.endsWith(".json")).map(n=>JSON.parse(readFileSync(join(directory,n),"utf8")));
    if(reservations.some(r=>r.priorMissionUSD!==priorMissionUSD||typeof r.reservedUSD!=="number"||!Number.isFinite(r.reservedUSD)||r.reservedUSD<0))throw new Error("INVALID_PHASE_LEDGER");
    const priorReservedUSD=reservations.reduce((n,r)=>n+r.reservedUSD,0),budget=probeBudget(priorMissionUSD,priorReservedUSD,requestedUSD);
    const path=join(directory,`${sha256(resolve(output))}.json`);
    write(path,{createdAt:new Date().toISOString(),output:resolve(output),priorMissionUSD,reservedUSD:requestedUSD});
    return {path,priorReservedUSD,...budget};
  }finally{rmdirSync(lock);}
}
export function targetRank(c:V26Challenge,hits:Hit[]) {
  if(!c.targets.length)return null;
  const i=hits.findIndex(h=>c.targets.some(t=>h.document.id===t.document&&h.chunk.sectionTitle.includes(t.section)));
  return i<0?0:i+1;
}
export async function runV26Probe(output:string,index?:string) {
  if(existsSync(output))throw new Error("NEW_OUTPUT_DIRECTORY_REQUIRED");
  if(index && (process.env.PAID_RAG_PROBES!=="15" || !resolve(index).startsWith("/private/tmp/") && !resolve(index).startsWith("/tmp/")))throw new Error("HYBRID_REQUIRES_15_DOLLAR_UNLOCK_AND_ISOLATED_TMP_INDEX");
  const corpusPath="apps/evaluation/.local/clinical-rag-v8/corpus.json",raw=readFileSync(corpusPath),corpus=restoreCorpus(JSON.parse(raw.toString()));
  const score=JSON.parse(readFileSync("outputs/v25-path-b-complete-2026-09-15/scorecard.json","utf8")).pathB;
  const cohortLedger=JSON.parse(readFileSync("outputs/v25-path-b-complete-2026-09-15/ledger.json","utf8"));
  if(score.attempted!==50 || score.cases.some((c:{attempt:string})=>c.attempt!=="first_attempt") || !existsSync("docs/V25_COMPLETED_REPORT.md"))throw new Error("V25_SCORECARD_AND_REPORT_MUST_FINISH_FIRST");
  const ceiling=probeBudget(cohortLedger.accountedUSD,0,0).phaseCeilingUSD,callReserveUSD=.01;
  const maxEmbeddingCalls=V26_CHALLENGES.reduce((n,c)=>n+c.queries.length*2,0);
  mkdirSync(output,{recursive:false});
  const plan={createdAt:new Date().toISOString(),version:V26_SELECTION_POLICY,sourceHashes:Object.fromEntries(sourcePaths.map(p=>[p,sha256(readFileSync(p))])),
    corpusHash:corpus.hash,corpusFileHash:sha256(raw),challengeHash:sha256(JSON.stringify(V26_CHALLENGES)),challenges:V26_CHALLENGES,
    mode:index?"hybrid":"lexical",index:index??"new in-memory lexical index, no vectors",ceilingUSD:ceiling,priorMissionAccountedUSD:cohortLedger.accountedUSD,
    callReserveUSD,maxEmbeddingCalls,pricing:EMBEDDING_POLICY,dispositionCalls:0,judgeCalls:0,embeddingBuilds:0,
    metrics:"Authored document+section retrieval relevance only. Not semantic support, population applicability, medical correctness or clinical lift."};
  write(join(output,"plan.json"),plan);
  const store=await ClinicalRagStore.open(index);
  let accountedUSD=0,actualKnownUSD=0,embeddingTokens=0,unknownUsageCalls=0,embeddingCalls=0;
  let phaseReservation:ReturnType<typeof reserveProbeRun>|null=null;
  const attempts:Record<string,any>[]=[];
  try {
    if(index){const stats=await store.stats();verifyCorpusIndexIdentity(corpus,stats);if(stats.embedded!==stats.chunks)throw new Error("FULL_EXISTING_VECTOR_INDEX_REQUIRED");}
    else await store.build(corpus);
    let embed:Embed|undefined;
    if(index){
      phaseReservation=reserveProbeRun("outputs/.v26-rag-probe-spend-2026-09-15",output,cohortLedger.accountedUSD,maxEmbeddingCalls*callReserveUSD);
      const env=existsSync(".env")?parseEnv(readFileSync(".env","utf8")):{};
      const provider=openAiEmbed(process.env.OPENAI_API_KEY??env.OPENAI_API_KEY??"");
      embed=async(texts,signal)=>{
        // Only bounded query embeds. Never call embedMissing or ingest sources.
        if(texts.length!==1||texts[0].length>300||embeddingCalls>=maxEmbeddingCalls||accountedUSD+callReserveUSD>ceiling)throw new Error("QUERY_PROBE_RESERVATION_REJECTED");
        const n=++embeddingCalls;accountedUSD+=callReserveUSD;
        write(join(output,`embedding-${n}-started.json`),{n,inputHash:sha256(JSON.stringify(texts)),bytes:Buffer.byteLength(texts[0]),reservedUSD:callReserveUSD});
        try {const result=await provider(texts,signal),cost=result.tokens*EMBEDDING_POLICY.inputPricePerMillion/1e6;
          if(cost>callReserveUSD)throw new Error("PROVIDER_USAGE_EXCEEDS_QUERY_BOUND");
          accountedUSD+=cost-callReserveUSD;actualKnownUSD+=cost;embeddingTokens+=result.tokens;
          write(join(output,`embedding-${n}-complete.json`),{n,tokens:result.tokens,estimatedUSD:cost});return result;
        }catch(e){unknownUsageCalls++;write(join(output,`embedding-${n}-failed.json`),{n,error:e instanceof Error?e.message:"EMBED_FAILED",retainedUSD:callReserveUSD});throw e;}
      };
    }
    for(const c of V26_CHALLENGES)for(const variant of ["raw","hinted"] as const){
      const queryResults:Retrieval[]=[],errors:string[]=[];
      for(const q of c.queries){const query=variant==="hinted"?dispositionQueryHint(q,c.intent).query:q;
        try{queryResults.push(await store.search(query,{mode:index?"hybrid":"lexical",embed,limit:5,signal:AbortSignal.timeout(60_000)}));}
        catch(e){errors.push(e instanceof Error?e.message:"RETRIEVAL_FAILED");}
      }
      write(join(output,`${c.id}-${variant}-retrieval.json`),{queries:c.queries,results:queryResults,errors});
      for(const selector of ["v25","v26"] as const){
        let hits:Hit[]=[],audit:unknown=null,selectionError:string|null=null;const began=performance.now();
        try{if(selector==="v25")hits=selectGraphEvidence(queryResults,9);else{const selected=selectDispositionEvidence(queryResults,c.intent,9);hits=selected.hits;audit=selected.audit;}}
        catch(e){selectionError=e instanceof Error?e.message:"SELECTION_FAILED";}
        const degradedQueries=index?queryResults.filter(p=>p.warnings.some(w=>/LEXICAL_ONLY/.test(w))).length:0;
        const selectionMs=performance.now()-began,rank=targetRank(c,hits),complete=errors.length===0&&!selectionError&&degradedQueries===0;
        const row={id:c.id,mode:index?"hybrid":"lexical",variant,selector,complete,errors,selectionError,
          degradedQueries,retrievalWarnings:queryResults.flatMap(p=>p.warnings),
          effectiveChannels:[...new Set(queryResults.flatMap(p=>p.hits.flatMap(h=>h.channels)))],
          targetAvailableInCorpus:corpus.chunks.some(h=>c.targets.some(t=>h.documentId===t.document&&h.sectionTitle.includes(t.section))),
          rank,hitAt1:rank===null?null:complete&&rank>0&&rank<=1,hitAt3:rank===null?null:complete&&rank>0&&rank<=3,
          hitAt9:rank===null?null:complete&&rank>0&&rank<=9,mrrAt9:rank===null?null:complete&&rank>0?1/rank:0,
          candidateTargetRank:targetRank(c,queryResults.flatMap(p=>p.hits)),emptyPacket:hits.length===0,
          selectionMs,retrievalMs:queryResults.reduce((n,p)=>n+p.timings.totalMs,0),quoteIntegrity:hits.every(h=>sha256(h.chunk.text)===h.chunk.hash),
          sources:hits.map(h=>({id:h.chunk.id,document:h.document.id,section:h.chunk.sectionTitle,kind:h.document.kind,review:h.document.reviewStatus,hash:h.chunk.hash})),
          audit,claimSupport:"not_assessed",unsupportedClaims:"not_assessed",applicability:"not_assessed"};
        write(join(output,`${c.id}-${variant}-${selector}.json`),row);attempts.push(row);
      }
    }
    const results=["raw","hinted"].flatMap(variant=>["v25","v26"].map(selector=>{
      const all=attempts.filter(r=>r.variant===variant&&r.selector===selector),rated=all.filter(r=>r.rank!==null),controls=all.filter(r=>r.rank===null);
      return {variant,selector,attempts:all.length,rated: rated.length,failures:all.filter(r=>!r.complete).length,degradedQueries:all.reduce((n,r)=>n+r.degradedQueries,0),
        hitAt1:mean(rated.map(r=>Number(r.hitAt1))),hitAt3:mean(rated.map(r=>Number(r.hitAt3))),hitAt9:mean(rated.map(r=>Number(r.hitAt9))),mrrAt9:mean(rated.map(r=>r.mrrAt9)),
        emptyPackets:all.filter(r=>r.emptyPacket).length,noTargetControls:controls.length,nonemptyNoTargetControls:controls.filter(r=>!r.emptyPacket).length,
        meanSelectionMs:mean(all.map(r=>r.selectionMs)),meanRetrievalMs:mean(all.map(r=>r.retrievalMs)),quoteIntegrity:all.every(r=>r.quoteIntegrity)};
    }));
    write(join(output,"report.json"),{...plan,results,attempts,paid:{embeddingCalls,embeddingTokens,unknownUsageCalls,estimatedKnownUSD:actualKnownUSD,accountedUSD,ceilingUSD:ceiling,phaseReservation,missionTotalAccountedUSD:cohortLedger.accountedUSD+(phaseReservation?.priorReservedUSD??0)+accountedUSD}});
    console.log(JSON.stringify({output,results,embeddingCalls,embeddingTokens,unknownUsageCalls,accountedUSD}));
  }finally{
    write(join(output,"ledger.json"),{embeddingCalls,embeddingTokens,unknownUsageCalls,estimatedKnownUSD:actualKnownUSD,accountedUSD,ceilingUSD:ceiling,phaseReservation,priorMissionAccountedUSD:cohortLedger.accountedUSD,remainingMissionUSD:90-cohortLedger.accountedUSD-(phaseReservation?.priorReservedUSD??0)-accountedUSD,dispositionCalls:0,judgeCalls:0,embeddingBuilds:0});
    await store.close();
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const [output,index]=process.argv.slice(2);if(!output)throw new Error("Usage: v26-probe.ts NEW_OUTPUT [ISOLATED_TMP_INDEX] (hybrid needs PAID_RAG_PROBES=15)");await runV26Probe(output,index);}
