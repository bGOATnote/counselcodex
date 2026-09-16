import test from "node:test";
import assert from "node:assert/strict";
import { CLINICAL_POLICY_VERSION, CLINICAL_ROUTES, CLINICAL_ROUTING_POLICY, DEFENSIBLE_ALTERNATIVES_POLICY, CLINICAL_POLICY_SOURCES } from "../src/disposition/clinical-policy.ts";
import { GRAPH_INSTRUCTIONS } from "../src/disposition/graph-prompts.ts";
import { operationalRoutes, QUEUE_POLICY } from "../src/disposition/routing-policy.ts";

// Contract tests, not a simulated clinical-performance score. Clinical meaning
// still requires independent adjudication of generated responses.
test("five definitions separate capability, timing and ownership without a refill bucket", () => {
  assert.deepEqual(Object.keys(CLINICAL_ROUTES).sort(), [...operationalRoutes].sort());
  for (const route of operationalRoutes) for (const field of ["requirement", "timing", "ownership"] as const) assert.ok(CLINICAL_ROUTES[route][field].trim().length > 0);
  assert.match(CLINICAL_ROUTING_POLICY, /refill is a work type, not a sixth setting/);
  assert.equal(CLINICAL_ROUTES.PRIORITY_ASYNC.ownership, QUEUE_POLICY.intendedOwner);
  assert.equal(CLINICAL_ROUTES.STANDARD_ASYNC.ownership, QUEUE_POLICY.intendedOwner);
  assert.match(CLINICAL_ROUTES.STANDARD_ASYNC.timing, /never an automatic 48-hour wait/);
  assert.match(CLINICAL_ROUTES.EMERGENCY_NOW.ownership, /Transport is separate/);
});
test("candidate decision roles share the same policy; extraction remains independent of routes and gold", () => {
  for (const role of ["safety", "disposition", "judge"] as const) {
    assert.ok(GRAPH_INSTRUCTIONS[role].includes(CLINICAL_ROUTING_POLICY));
    assert.ok(GRAPH_INSTRUCTIONS[role].includes(CLINICAL_POLICY_VERSION));
  }
  assert.ok(GRAPH_INSTRUCTIONS.judge.includes(DEFENSIBLE_ALTERNATIVES_POLICY));
  assert.ok(!GRAPH_INSTRUCTIONS.context.includes(CLINICAL_ROUTING_POLICY));
  for (const instructions of Object.values(GRAPH_INSTRUCTIONS)) assert.doesNotMatch(instructions, /\bC(?:0[1-9]|[1-4]\d|50)\b|acceptedRoutes|incumbentRunId/);
});
test("alternative policy forbids both mismatch failure and unconditional conservative passes", () => {
  assert.match(DEFENSIBLE_ALTERNATIVES_POLICY, /higher label is not automatically overtriage/);
  assert.match(DEFENSIBLE_ALTERNATIVES_POLICY, /neither is greater intensity automatically safe/);
  assert.match(DEFENSIBLE_ALTERNATIVES_POLICY, /unconfirmed time-sensitive pathway, it is CONDITIONAL/);
  assert.match(DEFENSIBLE_ALTERNATIVES_POLICY, /abstain and specify that uncertainty/);
  assert.match(DEFENSIBLE_ALTERNATIVES_POLICY, /model agreement does not create physician approval/);
  assert.match(DEFENSIBLE_ALTERNATIVES_POLICY, /later correct route does not erase/);
  assert.match(GRAPH_INSTRUCTIONS.judge, /Actual time-to-delivery and missing early-action detection are separate event metrics/);
  assert.match(GRAPH_INSTRUCTIONS.judge, /your pass verdict does not establish timely delivery/);
});
test("policy distinguishes clinical requirements from source wording and invented context", () => {
  assert.match(DEFENSIBLE_ALTERNATIVES_POLICY, /one-working-day referral and one-further-working-day triage/);
  assert.match(DEFENSIBLE_ALTERNATIVES_POLICY, /not that guideline's literal deadline/);
  assert.match(DEFENSIBLE_ALTERNATIVES_POLICY, /unknown family history is not documented positive family history/);
  assert.match(DEFENSIBLE_ALTERNATIVES_POLICY, /after exercise is not necessarily pain during exertion/);
  assert.match(DEFENSIBLE_ALTERNATIVES_POLICY, /Do not fabricate a Wells score/);
  assert.match(CLINICAL_ROUTING_POLICY, /Unknown findings are neither negative nor positive/);
  assert.match(CLINICAL_ROUTING_POLICY, /Merely offering intake or referral does not satisfy/);
  assert.match(DEFENSIBLE_ALTERNATIVES_POLICY, /deep soft-tissue\/bone infection or gangrene, with or without ulceration/);
});
test("policy references are provenance, not injected evidence or runtime case lookups", () => {
  assert.equal(new Set(CLINICAL_POLICY_SOURCES.map(s => s.id)).size, CLINICAL_POLICY_SOURCES.length);
  for (const source of CLINICAL_POLICY_SOURCES) {
    assert.equal(new URL(source.url).protocol, "https:");
    assert.ok(source.scope.length > 30);
    assert.ok(!CLINICAL_ROUTING_POLICY.includes(source.url));
    assert.ok(!DEFENSIBLE_ALTERNATIVES_POLICY.includes(source.url));
  }
});
test("clinician necessity includes grounded uncertainty without inventing tasks or priority", () => {
  assert.match(CLINICAL_ROUTING_POLICY, /Merely saying a clinician could assess severity/);
  assert.match(CLINICAL_ROUTING_POLICY, /specific decision-critical uncertainty/);
  assert.match(CLINICAL_ROUTING_POLICY, /not generic caution or a failed automated review/);
  assert.match(CLINICAL_ROUTING_POLICY, /limited evolution compatible with an otherwise self-care presentation/);
  assert.match(CLINICAL_ROUTING_POLICY, /regardless of whether messaging is available/);
  assert.doesNotMatch(CLINICAL_ROUTING_POLICY, /poison ivy|forearms|\bC30\b/);
  assert.match(GRAPH_INSTRUCTIONS.disposition, /named location is not an exhaustive distribution/);
  assert.match(GRAPH_INSTRUCTIONS.disposition, /does not establish a numeric symptom duration/);
});
test("self-care does not confuse absent urgent need with absent clinician task or invent an observation interval", () => {
  assert.match(GRAPH_INSTRUCTIONS.disposition, /NECESSARY CLINICIAN TASK: Name the patient-grounded need that makes clinician action necessary/);
  assert.match(GRAPH_INSTRUCTIONS.disposition, /STANDARD_ASYNC: A clinician task remains/);
  assert.match(GRAPH_INSTRUCTIONS.disposition, /concrete supported guidance\/observation/);
  assert.match(GRAPH_INSTRUCTIONS.disposition, /Do not invent waiting thresholds/);
  assert.match(GRAPH_INSTRUCTIONS.disposition, /Keep present needs separate from conditional future precautions/);
  assert.match(GRAPH_INSTRUCTIONS.disposition, /Symptoms or limited evolution compatible with an otherwise self-care presentation do not independently mandate clinician review/);
});
test("judge reviews necessary routine tasks and actual deferral without forcing a preferred route", () => {
  assert.match(GRAPH_INSTRUCTIONS.judge, /necessary nonurgent clinician task remains/);
  assert.match(GRAPH_INSTRUCTIONS.judge, /Accept a defensible self-care alternative/);
  assert.match(GRAPH_INSTRUCTIONS.judge, /unsupported deferral can be material even when stroke precautions are correct/);
  assert.match(GRAPH_INSTRUCTIONS.judge, /actual unmet task, unsupported interval or missing actionable guidance/);
  assert.match(GRAPH_INSTRUCTIONS.judge, /do not fail solely for differing route labels or a preferred follow-up interval/);
  // Prompt-presence regressions only: these do not demonstrate model adherence
  // or declare any supplied case's preferred/alternative route clinically valid.
  for (const role of ["disposition", "judge"] as const) assert.doesNotMatch(GRAPH_INSTRUCTIONS[role], /\bC13\b|carpal tunnel|few weeks/);
});
