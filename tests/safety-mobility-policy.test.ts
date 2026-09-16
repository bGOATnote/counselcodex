import test from "node:test";
import assert from "node:assert/strict";
import { GRAPH_INSTRUCTIONS, graphSafetyInstructions } from "../src/disposition/graph-prompts.ts";
import { SAFETY_MOBILITY_POLICY } from "../src/disposition/safety-mobility-policy.ts";
import { graphPromptHash } from "../src/disposition/clinical-graph.ts";
import { resolveGraphConfig } from "../src/disposition/graph-config.ts";

test("full safety uses the exact paired-tested contextual mobility instruction once", () => {
  assert.equal(graphSafetyInstructions("full"), GRAPH_INSTRUCTIONS.safety + "\n" + SAFETY_MOBILITY_POLICY.instruction);
  assert.equal(graphSafetyInstructions(), graphSafetyInstructions("full"));
  assert.equal(graphSafetyInstructions("full").split(SAFETY_MOBILITY_POLICY.instruction).length, 2);
});

test("untested compact serialization does not silently inherit the mobility experiment", () => {
  assert.ok(!graphSafetyInstructions("compact").includes(SAFETY_MOBILITY_POLICY.instruction));
  assert.notEqual(graphPromptHash(resolveGraphConfig({})), graphPromptHash(resolveGraphConfig({ COUNSEL_GRAPH_SAFETY_STYLE: "compact" })));
});

test("policy preserves reported active EMS and current proxy reports while bounding negative examples", () => {
  const policy = SAFETY_MOBILITY_POLICY.instruction;
  assert.match(policy, /current caregiver or proxy report/);
  assert.match(policy, /unrelated or hypothetical other-person injuries/);
  assert.match(policy, /CONTINUE_EMS/);
  assert.match(policy, /do not require the patient to attempt walking/);
  assert.match(policy, /isolated ambulatory ankle injuries/);
  assert.deepEqual(SAFETY_MOBILITY_POLICY.sources, ["https://www.nhs.uk/conditions/broken-hip/", "https://www.nhs.uk/conditions/falls/"]);
});
