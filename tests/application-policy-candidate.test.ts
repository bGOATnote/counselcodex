import { test } from "node:test";
import assert from "node:assert/strict";
import { GRAPH_INSTRUCTIONS } from "../src/disposition/graph-prompts.ts";
import { applicationPolicyPrompt, applicationPolicyPacket, resolveApplicationPatientReferences, GUIDANCE_SCOPE_POLICY, SOURCE_APPLICATION_POLICY } from "../src/evaluation/application-policy-candidate.ts";

test("candidate replaces two policy sections without adding agents or changing transport", () => {
  const baseline = GRAPH_INSTRUCTIONS.disposition, candidate = applicationPolicyPrompt(baseline);
  assert.equal(candidate.split("NECESSARY CLINICIAN TASK:").length, 2);
  assert.equal(candidate.split("EVIDENCE:").length, 2);
  assert.equal(candidate.split("TRANSPORT:").at(-1)!.split("EVIDENCE:")[0], baseline.split("TRANSPORT:").at(-1)!.split("EVIDENCE:")[0]);
  assert.equal(candidate.split("OMIT unnecessary")[1], baseline.split("OMIT unnecessary")[1]);
  assert.doesNotMatch(GUIDANCE_SCOPE_POLICY + SOURCE_APPLICATION_POLICY, /\bC\d{2}\b|acceptedRoutes|physician-system-reference|\bibuprofen\b|\botitis\b|\binsomnia\b/);
});
test("guidance policy distinguishes incomplete task from automatic escalation", () => {
  assert.match(GUIDANCE_SCOPE_POLICY, /verified product-label education can be SELF_CARE/);
  assert.match(GUIDANCE_SCOPE_POLICY, /a dose question.*alone does not require a clinician/);
  assert.match(GUIDANCE_SCOPE_POLICY, /do not substitute generic comfort measures/);
  assert.match(GUIDANCE_SCOPE_POLICY, /Missing eligibility.*does not itself establish/);
  assert.match(SOURCE_APPLICATION_POLICY, /Unmet or unknown prerequisites/);
  assert.match(SOURCE_APPLICATION_POLICY, /not new clinical evidence or publisher approval/);
});
test("empty source packet gains no invented source and no patient-derived sidecar", () => {
  const original = { patient: "A fictional message", context: {}, sources: [] };
  const candidate = applicationPolicyPacket(original, []);
  assert.equal(candidate.patient, original.patient);
  assert.equal(candidate.sources, original.sources);
  assert.equal(candidate.context, original.context);
  assert.doesNotMatch(JSON.stringify(candidate.sourceApplicationRules), /fictional message/);
});
test("changed prompt boundaries fail instead of stacking policy", () => {
  assert.throws(() => applicationPolicyPrompt("new prompt"), /APPLICATION_POLICY_BOUNDARY_CHANGED/);
  assert.throws(() => applicationPolicyPrompt(GRAPH_INSTRUCTIONS.disposition + "\nEVIDENCE: duplicate"), /APPLICATION_POLICY_BOUNDARY_CHANGED/);
});
test("patient quote references resolve mechanically without asking a model to count characters", () => {
  const patient = "I am tired today; I went to work.";
  const wire = { sourceApplications: [{ citationIndex: 0, ruleId: "example", use: "general_information" as const,
    conditions: [{ conditionId: "daytime", state: "reported_met" as const, patientQuotes: ["I am tired today"] }] }] };
  const resolved = resolveApplicationPatientReferences(wire, patient);
  assert.deepEqual(resolved.sourceApplications[0].conditions[0].patientSpans, [{ start: 0, end: 16 }]);
  assert.equal(wire.sourceApplications[0].conditions[0].patientQuotes[0], "I am tired today");
  assert.throws(() => resolveApplicationPatientReferences(wire, "No corresponding statement."), /APPLICATION_PATIENT_QUOTE_MISSING_OR_AMBIGUOUS/);
  assert.throws(() => resolveApplicationPatientReferences(wire, patient + patient), /APPLICATION_PATIENT_QUOTE_MISSING_OR_AMBIGUOUS/);
});
