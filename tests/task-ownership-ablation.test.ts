import { test } from "node:test";
import assert from "node:assert/strict";
import { GRAPH_INSTRUCTIONS } from "../src/disposition/graph-prompts.ts";
import { replaceTaskOwnership, TASK_OWNERSHIP_PARAGRAPH } from "../src/evaluation/task-ownership-ablation.ts";

test("task-ownership experiment replaces one paragraph, preserving all other responsibilities", () => {
  const baseline = GRAPH_INSTRUCTIONS.disposition, changed = replaceTaskOwnership(baseline);
  const start = baseline.indexOf("NECESSARY CLINICIAN TASK:"), end = baseline.indexOf("\nSAFETY-NET LOGIC:", start);
  assert.equal(changed, baseline.slice(0, start) + TASK_OWNERSHIP_PARAGRAPH + baseline.slice(end));
  assert.equal(changed.split("OUTPUT:")[1], baseline.split("OUTPUT:")[1]);
  assert.equal(changed.split("NECESSARY CLINICIAN TASK:").length, 2);
  assert.doesNotMatch(TASK_OWNERSHIP_PARAGRAPH, /\bC\d{2}\b|acceptedRoutes|physician-system-reference|migraine|ibuprofen|rhinitis/);
});

test("capability policy retains self-care and does not turn missing history into acuity", () => {
  assert.match(TASK_OWNERSHIP_PARAGRAPH, /supported general OTC options, product-label education/);
  assert.match(TASK_OWNERSHIP_PARAGRAPH, /first-person wording or unreported optional history alone does not establish that boundary/);
  assert.match(TASK_OWNERSHIP_PARAGRAPH, /more history being possible does not itself create one/);
  assert.match(TASK_OWNERSHIP_PARAGRAPH, /not a documented contraindication/);
  assert.match(TASK_OWNERSHIP_PARAGRAPH, /Priority async only for a concrete time-sensitive consequence/);
  assert.match(TASK_OWNERSHIP_PARAGRAPH, /limited expected evolution alone does not require escalation/);
});

test("prompt boundary changes fail rather than silently adding or losing policy", () => {
  assert.throws(() => replaceTaskOwnership("other prompt"), /TASK_POLICY_BOUNDARY_CHANGED/);
  assert.throws(() => replaceTaskOwnership("NECESSARY CLINICIAN TASK: one\nSAFETY-NET LOGIC: two\nNECESSARY CLINICIAN TASK: three"), /TASK_POLICY_BOUNDARY_CHANGED/);
});
