import test from "node:test";
import assert from "node:assert/strict";
import { hasRoutingConsequence, pendingInstructionFor } from "../src/disposition/clarification-policy.ts";
import { validAdaptiveQuestion, type ResponseEvent } from "../src/disposition/contract.ts";

test("routing-critical question includes conditional action without declaring either answer present", () => {
  const routingConsequence = { alternatives: [{ answer: "Sudden onset", route: "EMERGENCY_NOW" }, { answer: "Gradual onset", route: "STANDARD_ASYNC" }] };
  const question = { routingConsequence };
  assert.equal(hasRoutingConsequence(question), true);
  const instruction = pendingInstructionFor(question);
  assert.match(instruction, /If the answer “Sudden onset” describes you, call 911 now/);
  assert.doesNotMatch(instruction, /You have|You reported|Your clinician has/);
  const event: Extract<ResponseEvent, { kind: "intake_question" }> = { kind: "intake_question", questionId: "adaptive-1234567890abcdef", text: "Did the numbness begin suddenly?", why: "Onset may change which care setting is needed.", quote: "right hand numbness", decisionChanging: true, routingConsequence: { alternatives: [{ answer: "Sudden onset", route: "EMERGENCY_NOW" }, { answer: "Gradual onset", route: "STANDARD_ASYNC" }] }, interimInstruction: instruction };
  assert.equal(validAdaptiveQuestion(event, "I have right hand numbness."), true);
  assert.equal(validAdaptiveQuestion({ ...event, interimInstruction: "You can safely wait two days." }, "I have right hand numbness."), false);
  assert.equal(validAdaptiveQuestion({ ...event, interimInstruction: undefined }, "I have right hand numbness."), false);
});

test("same-day branch does not become an unconditional emergency or a reassurance", () => {
  const instruction = pendingInstructionFor({ routingConsequence: { alternatives: [{ answer: "Drainage after recent surgery", route: "SAME_DAY_IN_PERSON" }, { answer: "No relevant surgery or injury", route: "SELF_CARE" }] } });
  assert.match(instruction, /If the answer “Drainage after recent surgery” describes you, seek in-person assessment today/);
  assert.doesNotMatch(instruction, /You can stay home|You are safe/);
});
