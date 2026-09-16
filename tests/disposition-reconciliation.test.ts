import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDispositionRuntime } from "../src/disposition/runtime.ts";
import { SEARCH_VERSION, digest, type EvidenceSearch } from "../src/evidence/search.ts";
import type { DispositionAnswer, DispositionRun } from "../src/disposition/contract.ts";
import type { Generator } from "../src/disposition/workflow.ts";
import { readDispositionStream } from "../apps/evaluation/lib/disposition-stream.ts";

// Mechanism tests, not clinical validation: all model outputs below are mocks.
const message = "After a long flight my left calf is swollen and painful.";
const plan = { emergency: true, emergencyDestination: "ED_NOW", emergencyQuote: "left calf is swollen and painful", findings: [], clarification: null, queries: [] };
const answer: DispositionAnswer = { disposition: "SAME_DAY_IN_PERSON", patientMessage: "Arrange an in-person assessment today for the painful swollen calf. Seek emergency care if chest pain or trouble breathing develops.", reason: "A painful swollen calf after travel needs timely examination and testing for possible DVT.", differential: [], redFlags: [], vitalSigns: "No vital measurements were supplied.", questions: [], evidence: [], evidenceLimitations: "No applicable supporting passage was retrieved in this test." };
const final = (a = answer) => ({ decision: "final", clarification: null, answer: a, support: [] });
const judgment = { decision: "revise_to_final", reason: "The reported calf symptoms warrant same-day testing; an emergency department is not established as the only appropriate setting.", patientQuotes: ["left calf is swollen and painful"], currentEmergencyExcludedByContext: false };
const output = (answer: unknown) => ({ answer, usage: { inputTokens: 10, outputTokens: 20 } });
const empty: EvidenceSearch = async () => ({ version: SEARCH_VERSION, corpusHash: digest([]), passages: [], audit: [] });
function app(generate: Generator, reconcile = true) {
  const directory = mkdtempSync(join(tmpdir(), "reconciliation-test-"));
  return { directory, runtime: createDispositionRuntime(directory, generate, { profile: "adaptive-opus", budget: reconcile ? "manual-gui" : "compact", search: empty }) };
}
function stream(run: DispositionRun, events = run.responseEvents ?? []) {
  const lines = [...events.map(event => ({ type: "response_event", event })), { type: "result", result: run }];
  return new Response(lines.map(l => JSON.stringify(l)).join("\n") + "\n", { headers: { "content-type": "application/x-ndjson" } });
}

test("independent final assessment can explicitly revise ED advice with a bounded recorded reconciliation", async () => {
  const roles: string[] = [];
  const { runtime, directory } = app(async (prompt, _context, role) => {
    roles.push(role!);
    const input = JSON.parse(prompt);
    if (role === "intake") return output(plan);
    if (role === "disposition") {
      for (const key of ["plan", "emergencyFloor", "requiredAction", "priorSafetyFloor"]) assert.equal(key in input, false);
      assert.equal(input.message, message);
      assert.equal(input.intakeQuestion, null);
      return output(final());
    }
    assert.equal(role, "reconciliation");
    assert.equal(input.independentAssessment.answer.disposition, "SAME_DAY_IN_PERSON");
    assert.equal(input.earlierAdvice.disposition, "EMERGENCY_NOW");
    return output(judgment);
  });
  try {
    const run = await runtime.assess(message);
    assert.equal(run.status, "complete", JSON.stringify(run.checks.filter(c => c.status === "fail")));
    assert.equal(run.answer?.disposition, "SAME_DAY_IN_PERSON");
    assert.deepEqual(roles, ["intake", "disposition", "reconciliation"]);
    assert.equal(run.modelCalls, 3); assert.equal(run.usage.outputTokens, 60);
    assert.equal(run.reconciliation?.status, "revised");
    assert.equal(run.safetyFloor?.disposition, "SAME_DAY_IN_PERSON");
    assert.deepEqual(run.responseEvents?.map(e => e.kind), ["action", "care_revision", "patient_reply"]);
    assert.equal((await readDispositionStream(stream(run), message, () => {})).runId, run.runId);
    const saved = JSON.parse(readFileSync(join(directory, "runs", `${run.runId}.json`), "utf8"));
    assert.deepEqual(saved.reconciliation, run.reconciliation);
    assert.equal(saved.agents[2].role, "reconciliation");
    assert.equal(saved.responseEvents[0].notice.disposition, "EMERGENCY_NOW");

    const noRevision = run.responseEvents!.filter(e => e.kind !== "care_revision").map((e, i) => ({ ...e, sequence: i + 1 }));
    await assert.rejects(readDispositionStream(stream({ ...run, responseEvents: noRevision }, noRevision), message, () => {}));
    for (const field of ["from", "to"] as const) {
      const altered = structuredClone(run);
      const event = altered.responseEvents!.find(e => e.kind === "care_revision")!;
      if (event.kind !== "care_revision") throw new Error("missing revision");
      event.reconciliation[field].directive = "An altered, unbound care instruction.";
      await assert.rejects(readDispositionStream(stream(altered), message, () => {}));
    }
  } finally { await runtime.mastra.shutdown(); }
});

for (const [name, response] of [
  ["rejection", { ...judgment, decision: "unresolved" }],
  ["invented patient quote", { ...judgment, patientQuotes: ["My ultrasound ruled out DVT"] }],
  ["malformed review", { decision: "revise_to_final" }],
  ["transport failure", null],
] as const) test(`a ${name} cannot silently downgrade already-issued advice`, async () => {
  const { runtime } = app(async (_p, _c, role) => {
    if (role === "intake") return output(plan);
    if (role === "disposition") return output(final());
    if (response === null) throw new Error("mock transport failure");
    return output(response);
  });
  try {
    const run = await runtime.assess(message);
    assert.equal(run.status, "review_required");
    assert.equal(run.failure, "ROUTING_DISAGREEMENT_UNRESOLVED");
    assert.equal(run.answer, null); assert.ok(run.rejectedAnswer);
    assert.equal(run.safetyFloor?.disposition, "EMERGENCY_NOW");
    assert.equal(run.modelCalls, 3);
    assert.equal(run.responseEvents?.some(e => e.kind === "care_revision"), false);
    await readDispositionStream(stream(run), message, () => {});
  } finally { await runtime.mastra.shutdown(); }
});

test("agreement does not spend a reconciliation call or leak preliminary judgments into the final prompt", async () => {
  const { runtime } = app(async (prompt, _c, role) => {
    if (role === "intake") return output({ ...plan, emergency: false, emergencyDestination: null, emergencyQuote: "" });
    assert.equal(role, "disposition");
    assert.equal("plan" in JSON.parse(prompt), false);
    return output(final({ ...answer, disposition: "ASYNC_PHYSICIAN", patientMessage: "A Counsel clinician should review your request today and determine the next step.", reason: "A clinician needs to review this request." }));
  });
  try {
    const run = await runtime.assess("I need a refill of my usual prescription.");
    assert.equal(run.status, "complete", JSON.stringify({failure:run.failure,checks:run.checks,agents:run.agents})); assert.equal(run.modelCalls, 2);
    assert.equal(run.reconciliation, undefined);
  } finally { await runtime.mastra.shutdown(); }
});

test("a model preference alone cannot cancel unconditional EMS advice", async () => {
  const { runtime } = app(async (_p, _c, role) => output(role === "intake" ? { ...plan, emergencyDestination: "EMS_NOW", emergencyQuote: "crushing chest pressure" } : role === "disposition" ? final({ ...answer, disposition: "ASYNC_PHYSICIAN", patientMessage: "A Counsel clinician should review this message today.", reason: "The draft proposes remote assessment." }) : { ...judgment, patientQuotes: ["crushing chest pressure"], currentEmergencyExcludedByContext: false }));
  try {
    const run = await runtime.assess("I have crushing chest pressure and pain in my left arm.");
    assert.equal(run.failure, "ROUTING_DISAGREEMENT_UNRESOLVED");
    assert.match(run.safetyFloor!.directive, /Call 911 now/);
    assert.equal(run.responseEvents?.some(e => e.kind === "care_revision"), false);
  } finally { await runtime.mastra.shutdown(); }
});

test("genuine emergency agreement remains immediate and does not require reconciliation", async () => {
  const { runtime } = app(async (_p, _c, role) => output(role === "intake" ? { ...plan, emergencyDestination: "EMS_NOW", emergencyQuote: "crushing chest pressure" } : final({ ...answer, disposition: "EMERGENCY_NOW", patientMessage: "Call 911 now. Do not drive yourself or wait for a reply.", reason: "Crushing chest pressure with arm pain needs emergency assessment." })));
  try {
    const run = await runtime.assess("I have crushing chest pressure and pain in my left arm.");
    assert.equal(run.status, "complete"); assert.equal(run.modelCalls, 2);
    assert.equal(run.responseEvents?.[0].kind, "action");
    assert.equal(run.reconciliation, undefined);
    await readDispositionStream(stream(run), run.message, () => {});
  } finally { await runtime.mastra.shutdown(); }
});

test("affirmative subject/time correction can retire a false EMS instruction without erasing it", async () => {
  const m = "My father had slurred speech and a drooping face ten years ago. I need my usual medication refill.";
  const quote = "My father had slurred speech and a drooping face ten years ago";
  const { runtime } = app(async (_p, _c, role) => output(role === "intake" ? { ...plan, emergencyDestination: "EMS_NOW", emergencyQuote: quote } : role === "disposition" ? final({ ...answer, disposition: "ASYNC_PHYSICIAN", patientMessage: "A Counsel clinician should review the medication refill today.", reason: "The remote neurologic event involved the father, not the patient." }) : { ...judgment, reason: "The quoted neurologic event happened to the patient's father ten years ago; it is not a current patient emergency. The refill needs clinician review.", patientQuotes: [quote], currentEmergencyExcludedByContext: true }));
  try {
    const run = await runtime.assess(m);
    assert.equal(run.status, "complete"); assert.equal(run.answer?.disposition, "ASYNC_PHYSICIAN");
    assert.equal(run.safetyFloor, null); assert.equal(run.reconciliation?.status, "revised");
    assert.equal(run.responseEvents?.[0].kind, "action");
    assert.equal(run.responseEvents?.[1].kind, "care_revision");
    await readDispositionStream(stream(run), m, () => {});
  } finally { await runtime.mastra.shutdown(); }
});

test("cancellation during disagreement review cannot publish a late reduction", async () => {
  const controller = new AbortController();
  const { runtime } = app(async (_p, _c, role) => {
    if (role === "intake") return output(plan);
    if (role === "disposition") return output(final());
    controller.abort(new Error("RUN_CANCELLED"));
    return output(judgment);
  });
  try {
    const run = await runtime.assess(message, undefined, undefined, controller.signal);
    assert.notEqual(run.status, "complete");
    assert.equal(run.responseEvents?.some(e => e.kind === "care_revision"), false);
    assert.equal(run.safetyFloor?.disposition, "EMERGENCY_NOW");
  } finally { await runtime.mastra.shutdown(); }
});

test("same-input mechanism ablation isolates the conditional review, retaining raw final judgment in both arms", async () => {
  const runs: DispositionRun[] = [];
  for (const enabled of [false, true]) {
    const { runtime } = app(async (_p, _c, role) => output(role === "intake" ? plan : role === "disposition" ? final() : judgment), enabled);
    try { runs.push(await runtime.assess(message)); } finally { await runtime.mastra.shutdown(); }
  }
  const [without, withReview] = runs;
  assert.deepEqual(without.agents!.find(a => a.role === "disposition")!.output, withReview.agents!.find(a => a.role === "disposition")!.output);
  assert.equal(without.failure, "ROUTING_DISAGREEMENT_UNRESOLVED");
  assert.equal(without.modelCalls, 2); assert.equal(without.usage.outputTokens, 40);
  assert.equal(withReview.status, "complete");
  assert.equal(withReview.answer?.disposition, "SAME_DAY_IN_PERSON");
  assert.equal(withReview.modelCalls, 3); assert.equal(withReview.usage.outputTokens, 60);
  // Mock tokens/call counts establish incremental mechanics, not clinical lift or live latency.
});

test("reviewed transport-only revision does not require falsely declaring that the emergency was excluded", async () => {
  const m = "My calf is swollen and I have new chest pain and shortness of breath.";
  const { runtime } = app(async (_p, _c, role) => output(role === "intake" ? { ...plan, emergencyDestination: "EMS_NOW", emergencyQuote: "new chest pain and shortness of breath" } : role === "disposition" ? final({ ...answer, disposition: "EMERGENCY_NOW", patientMessage: "Call 911 or get to an emergency department now. Do not drive yourself or wait.", reason: "The new chest symptoms with a swollen calf need emergency assessment." }) : { ...judgment, patientQuotes: ["new chest pain and shortness of breath"], reason: "The final response retains immediate emergency assessment and an ambulance option, prohibits driving and does not permit waiting.", currentEmergencyExcludedByContext: false }));
  try {
    const run = await runtime.assess(m);
    assert.equal(run.status, "complete");
    assert.equal(run.answer?.disposition, "EMERGENCY_NOW");
    assert.equal(run.reconciliation?.status, "revised");
    assert.equal(run.modelCalls, 3);
    assert.equal(run.reconciliation?.from.disposition, "EMERGENCY_NOW");
    assert.equal(run.reconciliation?.to.disposition, "EMERGENCY_NOW");
    await readDispositionStream(stream(run), m, () => {});
  } finally { await runtime.mastra.shutdown(); }
});
