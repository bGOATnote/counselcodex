import test from "node:test";
import assert from "node:assert/strict";
import { summarizeJudgeControls, versionedControlRun } from "../src/evaluation/judge-validation.ts";
import { fixtureRun, rehash } from "./response-review-fixtures.ts";

test("judge control cache identity binds the case, source, instructions and model", () => {
  const a = fixtureRun(); const id = versionedControlRun(a).runId;
  assert.equal(versionedControlRun(a).runId,id);
  assert.notEqual(versionedControlRun(a,"changed rubric").runId,id);
  assert.notEqual(versionedControlRun(a,undefined,"openai/other-model").runId,id);
  const changed = structuredClone(a); changed.answer!.reason += " Wrong additional claim.";
  assert.notEqual(versionedControlRun(rehash(changed)).runId,id);
  assert.equal(a.runId,fixtureRun().runId);
});
test("missing and abstained judge decisions do not turn into correct negatives", () => {
  const report = summarizeJudgeControls([
    { id: "detected", criterion: "overtriage", expected: "fail", observed: "fail", state: "complete" },
    { id: "missed", criterion: "overtriage", expected: "fail", observed: "pass", state: "complete" },
    { id: "abstained", criterion: "overtriage", expected: "fail", observed: "abstain", state: "complete" },
    { id: "failed", criterion: "overtriage", expected: "fail", observed: "pass", state: "failed" },
    { id: "clean", criterion: "overtriage", expected: "pass", observed: "pass", state: "complete" },
    { id: "false-alarm", criterion: "overtriage", expected: "pass", observed: "fail", state: "complete" },
  ]);
  assert.equal(report.defectDetection.rate,1/4); assert.equal(report.falseAcceptance.rate,1/4);
  assert.equal(report.matched.rate,2/6); assert.equal(report.falseAlarm.rate,1/2);
  assert.deepEqual(report.unresolvedDefects,["abstained","failed"]);
  assert.equal(report.byCriterion.find(c => c.criterion === "clarification")!.matched.rate,null);
});
