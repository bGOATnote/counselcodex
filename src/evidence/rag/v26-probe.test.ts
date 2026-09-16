import test from "node:test";
import assert from "node:assert/strict";
import { probeBudget } from "./v26-probe.ts";
test("probe budget rejects invalid accounting and respects nested cumulative caps",()=>{
  for(const n of [NaN,Infinity,-1,undefined,"0"])assert.throws(()=>probeBudget(n as number,0,.72),/INVALID/);
  assert.deepEqual(probeBudget(11.063796,0,.72),{phaseCeilingUSD:15,phaseReservedUSD:.72});
  assert.throws(()=>probeBudget(11.063796,14.5,.72),/EXHAUSTED/);
  assert.throws(()=>probeBudget(89.5,0,.72),/EXHAUSTED/);
  assert.throws(()=>probeBudget(91,0,0),/EXHAUSTED/);
  assert.throws(()=>probeBudget(0,NaN,.72),/INVALID/);
  assert.throws(()=>probeBudget(0,0,-1),/INVALID/);
});
