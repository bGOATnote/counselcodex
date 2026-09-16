import { existsSync,readFileSync,realpathSync } from "node:fs";
import { dirname,join,relative,resolve,sep } from "node:path";
import { benchmarkManifest,digest,type BenchmarkCase,type BenchmarkManifest,type BenchmarkRecord } from "./clinical-benchmark.ts";
import { BENCHMARK_RUBRIC_VERSION,evaluateRubricJudgment,rubricIdentity,rubricPacket } from "./benchmark-rubrics.ts";

export function privateBenchmarkDirectory(root:string,output:string) {
  const cache=realpathSync(join(root,".cache")),directory=resolve(output);
  let ancestor=directory;
  while(!existsSync(ancestor) && dirname(ancestor)!==ancestor) ancestor=dirname(ancestor);
  const actual=realpathSync(ancestor),canonicalDirectory=resolve(actual,relative(ancestor,directory));
  if(!canonicalDirectory.startsWith(cache+sep) || (actual!==cache && !actual.startsWith(cache+sep))) throw new Error("BENCHMARK_RAW_ARTIFACTS_REQUIRE_LOCAL_CACHE");
  return canonicalDirectory;
}
export function historicalManifest(directory:string,cases:BenchmarkCase[]) {
  const saved:BenchmarkManifest=JSON.parse(readFileSync(join(directory,"manifest.json"),"utf8"));
  // The code fingerprint is historical, not silently rebound to today's code.
  // Reconstruct the current reference index to reject changed source selection.
  const current=benchmarkManifest(cases,saved.fingerprint,{seed:saved.seed,repetitions:saved.repetitions,execution:saved.execution});
  if(saved.indexHash!==current.indexHash || digest(saved.index)!==current.indexHash || digest(saved.order)!==digest(current.order) || digest(saved.pilotIds)!==digest(current.pilotIds)) throw new Error("BENCHMARK_HISTORICAL_REFERENCE_CHANGED");
  return saved;
}
type Grade=ReturnType<typeof evaluateRubricJudgment>;
type ReadGrade={status:string;grade:Grade|null;costUSD:number|null};
export function readRubricArtifact(directory:string,c:BenchmarkCase,r:BenchmarkRecord):ReadGrade {
  const identity=rubricIdentity(c,r),path=join(directory,`${identity.key}.json`);
  if(!existsSync(path)) return {status:existsSync(join(directory,`${identity.key}.attempt.json`))?"interrupted":"not_graded",grade:null,costUSD:null};
  const saved=JSON.parse(readFileSync(path,"utf8")),{resultHash,...body}=saved;
  if(digest(body)!==resultHash || Object.entries(identity).some(([k,v])=>saved[k]!==v)) throw new Error("JUDGE_RESULT_IDENTITY_MISMATCH");
  if(!["complete","failed","invalid_packet"].includes(saved.status)) throw new Error("JUDGE_RESULT_STATE_INVALID");
  if(saved.status!=="complete") {
    if(saved.grade!==null) throw new Error("JUDGE_FAILURE_WITH_GRADE");
    return {status:saved.status,grade:null,costUSD:saved.estimatedUsd??null};
  }
  const packet=rubricPacket(c,r);
  if(packet.packetHash!==saved.packetHash) throw new Error("JUDGE_PACKET_BINDING_MISMATCH");
  const raw=JSON.parse(readFileSync(join(directory,`${identity.key}.raw.json`),"utf8"));
  // Recalculate weights, abstentions and source-anchor gates from the immutable
  // raw judgment. A stored 'pass' or numeric score is never accepted on trust.
  const grade=evaluateRubricJudgment(packet,c.rubrics,raw.object);
  if(digest(grade)!==digest(saved.grade)) throw new Error("JUDGE_REPLAY_MISMATCH");
  return {status:grade.unresolved?"unresolved":"complete",grade,costUSD:saved.estimatedUsd??null};
}
export function summarizeRubrics(directory:string,manifest:BenchmarkManifest,cases:BenchmarkCase[],records:BenchmarkRecord[]) {
  const slots=manifest.index.flatMap(index=>Array.from({length:manifest.repetitions},(_,i)=>manifest.arms.map(arm=>{
    const c=cases.find(c=>c.id===index.id)!;
    if(!c || c.rubricHash!==index.rubricHash || c.referenceHash!==index.referenceHash) throw new Error("JUDGE_REFERENCE_CHANGED");
    const record=records.find(r=>r.id===c.id && r.trial===i+1 && r.arm===arm);
    const result:ReadGrade=c.unsupportedReason?{status:"unsupported",grade:null,costUSD:0}:!record?.run?{status:"no_recorded_response",grade:null,costUSD:null}:readRubricArtifact(directory,c,record);
    return {id:c.id,trial:i+1,arm,cohort:c.cohort,...result};
  }))).flat();
  const partitions=["primary","primary_pilot","primary_remainder","excluded_scope_stress","conditional_stress"];
  return {version:BENCHMARK_RUBRIC_VERSION,manifestHash:digest(manifest),
    cohorts:partitions.map(cohort=>({cohort,arms:manifest.arms.map(arm=>{
      const s=slots.filter(s=>s.arm===arm && (cohort==="primary_pilot"?s.cohort==="primary" && manifest.pilotIds.includes(s.id):cohort==="primary_remainder"?s.cohort==="primary" && !manifest.pilotIds.includes(s.id):s.cohort===cohort));
      const scored=s.filter(s=>s.grade?.score!==null && s.grade?.score!==undefined);
      return {arm,planned:s.length,statusCounts:Object.fromEntries([...new Set(s.map(s=>s.status))].sort().map(status=>[status,s.filter(s=>s.status===status).length])),
        weightedRubricScore:{assessed:scored.length,unassessed:s.length-scored.length,meanAmongAssessed:scored.length?scored.reduce((n,s)=>n+s.grade!.score!,0)/scored.length:null},
        criteriaUnresolved:s.reduce((n,s)=>n+(s.grade?.unresolved??0),0),
        researchSupport:{pass:s.filter(s=>s.grade?.researchSupport.verdict==="pass").length,fail:s.filter(s=>s.grade?.researchSupport.verdict==="fail").length,abstain:s.filter(s=>s.grade?.researchSupport.verdict==="abstain").length,ungraded:s.filter(s=>!s.grade).length},
        knownJudgeCostUSD:s.reduce((n,s)=>n+(s.costUSD??0),0),unknownJudgeCost:s.filter(s=>["complete","unresolved","failed","interrupted"].includes(s.status) && s.costUSD===null).length,
      };
    })})),
    clinicalAccuracy:null,
    interpretation:"Criterion reference: upstream physician-authored rubric. Execution: independent, uncalibrated model judgment. Every planned slot is retained; means among assessed are coverage-dependent, not an all-case success rate. Research support cannot be averaged away. Early and final emissions are graded together; no claim of patient receipt or treatment completion. No full HealthBench or clinical approval claim.",
  };
}
