import test from "node:test";
import assert from "node:assert/strict";
import { continueCases, remainingCases } from "../scripts/v25-cohort-continue.ts";
test("HTTP, decoder and case-local exceptions are rows and later cases still execute",async()=>{
  const called:number[]=[],failures:number[]=[];
  const stop=await continueCases([5,6,7,8,9],()=>true,async n=>{called.push(n);if([5,6,8].includes(n))throw new Error(n===5?"HTTP_503":n===6?"Unbound gates-only release.":"CASE_ERROR");},async n=>{failures.push(n);});
  assert.equal(stop,null);assert.deepEqual(called,[5,6,7,8,9]);assert.deepEqual(failures,[5,6,8]);
});
test("budget is the only loop stop, and a failed attempted case is not retried",async()=>{
  let spent=.889694;const called:number[]=[];
  const stop=await continueCases([5,6,7],()=>spent+2<=3,async n=>{called.push(n);spent+=2;throw new Error("FAILED");},async()=>{});
  assert.deepEqual(called,[5]);assert.equal(stop,"BUDGET_CANNOT_RESERVE_NEXT_REQUEST");
});
test("resume excludes every historical first attempt, including rejected C04",()=>{
  const cases=Array.from({length:50},(_,i)=>({id:`C${String(i+1).padStart(2,"0")}`,message:"synthetic",inputHash:"hash"}));
  const prior=cases.slice(0,4).map(c=>({id:c.id,runId:c.id,eligible:c.id!=="C04",failure:c.id==="C04"?"Unbound gates-only release.":null}));
  assert.equal(remainingCases(cases,prior).length,46);assert.equal(remainingCases(cases,prior)[0].id,"C05");
  assert.throws(()=>remainingCases(cases,[...prior,prior[3]]),/INVALID_PRIOR/);
});
