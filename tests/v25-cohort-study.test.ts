import test from "node:test";
import assert from "node:assert/strict";
import { v25Reservation, v25Account, canStartV25, unsettledV25Starts } from "../scripts/v25-cohort-study.ts";
import { resolveGraphConfig } from "../src/disposition/graph-config.ts";
import type { DispositionRun } from "../src/disposition/contract.ts";

test("V25 reservation includes recovery but no judge, and cannot exceed $70",()=>{
  const reserve=v25Reservation(resolveGraphConfig());
  assert.equal(reserve.maximumCalls,4);assert.deepEqual(reserve.calls.map(c=>[c.role,c.count]),[["context",1],["safety",1],["disposition",2]]);
  assert.ok(reserve.perRunUSD>0);assert.equal(canStartV25(70-reserve.perRunUSD,reserve.perRunUSD),true);
  assert.equal(canStartV25(70,reserve.perRunUSD),false);assert.equal(canStartV25(NaN,1),false);
});
test("Unknown or failed provider usage is not free and is retained in ledger",()=>{
  const reserve=v25Reservation(resolveGraphConfig());
  assert.equal(v25Account(null,reserve).accountedUSD,reserve.perRunUSD);
  const run={modelCalls:1,agents:[{model:"anthropic/claude-opus-5",modelCalls:1,usage:{inputTokens:1000,outputTokens:1000}}]} as DispositionRun;
  assert.equal(v25Account(run,reserve).estimatedModelUSD,.03);
  assert.ok(Math.abs(v25Account(run,reserve).accountedUSD-.037)<1e-12);
  assert.equal(v25Account({...run,modelCalls:2},reserve).accountedUSD,reserve.perRunUSD);
});
test("post-dispatch failure keeps its case and full outstanding reservation",()=>{
  const reserve=v25Reservation(resolveGraphConfig());
  assert.deepEqual(unsettledV25Starts(["C01","C02"],["C01"],reserve.perRunUSD),{unfinished:["C02"],reservedUSD:reserve.perRunUSD});
});
