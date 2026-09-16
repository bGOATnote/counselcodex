import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { answerSchema, checkAnswer, hasImmediateEmsDirective, type DispositionAnswer } from "../src/disposition/contract.ts";
import { createDispositionRuntime as createRuntime, hash } from "../src/disposition/runtime.ts";
import { type Generator, MODEL, initialSafetyNotice } from "../src/disposition/workflow.ts";
import { reserveOpusRun } from "../src/disposition/opus-budget.ts";
import { retrieveGuidance } from "../src/disposition/guidance.ts";
import { reserveModelCall } from "../src/disposition/budget.ts";

const foot = "I have diabetes and a cut on my foot. It is red, swollen and tender. No fever.";
const fixture: DispositionAnswer = {
  disposition: "SAME_DAY_IN_PERSON", reason: "An inflamed diabetic foot wound needs examination to establish severity and perfusion.",
  patientMessage: "Please get an in-person assessment today for this foot wound. Do not wait for a routine message reply. Seek emergency care now if you become very unwell or the foot is cold or discoloured.",
  differential: ["Diabetic foot soft-tissue infection; depth and perfusion not yet assessed."],
  redFlags: [{ concern: "Fever", status: "denied", quote: "No fever" }, { concern: "Deep infection or ischaemia", status: "unknown", quote: "" }],
  vitalSigns: "No numeric vital signs provided. An absence of reported fever does not establish stability.", questions: ["Is the redness spreading rapidly?"],
  evidence: [{ sourceId: "idsa-dfi-2023", claim: "Clinical examination and severity grading are needed for suspected diabetic foot infection." }],
  evidenceLimitations: "The severity and applicability of the guidance require clinical review.",
};
const fresh = () => mkdtempSync(join(tmpdir(), "counsel-disposition-test-"));
const historyOutput = { findings: [{ finding: "Unassessed findings", status: "unknown", quote: "" }], vitalSigns: "No verified measurements", differential: ["Clinical cause undetermined"], questions: [] };
const supervisorOutput = (minimumDisposition = "SELF_CARE") => ({ minimumDisposition, emergencyDestination: minimumDisposition === "EMERGENCY_NOW" ? "EMS_NOW" : "NONE", reason: "Independent assessment of the message.", concerns: [] });
const createDispositionRuntime = (directory: string, generate: Generator) => createRuntime(directory, async (prompt, context, role) => role === "disposition" ? generate(prompt, context, role) : ({ answer: role === "history" ? historyOutput : supervisorOutput(JSON.parse(prompt).escalationFloor ?? "SELF_CARE"), usage: { inputTokens: 10, outputTokens: 10 } }));

test("schema constrains the single answer and does not accept extra parallel proposals", () => {
  assert.ok(answerSchema.safeParse(fixture).success);
  assert.equal(answerSchema.safeParse({ ...fixture, proposal: "SELF_CARE" }).success, false);
});

test("crisis notice addresses the patient and does not equate crisis support with dispatch", () => {
  const notice = initialSafetyNotice("Everyone would be better off without me.");
  assert.equal(notice?.disposition, "EMERGENCY_NOW");
  assert.match(notice!.directive, /988 for crisis support; call 911 for a life-threatening emergency/);
  assert.doesNotMatch(notice!.directive, /Stay with the patient|close.*thread/);
});

test("observed refill timing is accepted, but invented workflow completion is rejected", () => {
  const status = (patientMessage: string, id: string) => checkAnswer({ ...fixture, disposition: "ASYNC_PHYSICIAN", patientMessage }, foot, [], null).find((c) => c.id === id)?.status;
  for (const claim of ["I've sent this to a clinician to review within about a day.", "We have referred you to a doctor.", "Your request has been forwarded to the clinician.", "I will book an appointment.", "I've dispatched an ambulance."]) assert.equal(status(claim, "no_unconfirmed_handoff"), "fail", claim);
  for (const instruction of ["Contact your prescriber within about a day.", "I cannot send this to your clinician. Contact your prescriber within 24 hours.", "I have not booked an appointment. Please arrange clinician review today."]) assert.equal(status(instruction, "no_unconfirmed_handoff"), "pass", instruction);
  assert.equal(status("Contact your prescriber within about a day.", "action_timing_present"), "pass");
  assert.equal(status("Contact your prescriber within one day.", "action_timing_present"), "pass");
  assert.equal(status("Contact your prescriber within ten days.", "action_timing_present"), "fail");
});

test("emergency care need not wait for vitals, without dismissing their subsequent need", () => {
  const status = (vitalSigns: string, disposition: DispositionAnswer["disposition"] = "EMERGENCY_NOW") => checkAnswer({ ...fixture, disposition, vitalSigns }, foot, [], null).find((c) => c.id === "unmeasured_vitals_not_dismissed")?.status;
  assert.equal(status("No vital signs reported or measured; none are needed before seeking emergency assessment."), "pass");
  assert.equal(status("No readings are required before obtaining emergency care."), "pass");
  assert.equal(status("No vital signs reported; none are needed to act on this."), "pass");
  assert.equal(status("No vital signs reported or measured; none required before emergency assessment."), "pass");
  assert.equal(status("None are needed to act on this; no measurements are required."), "fail");
  assert.equal(status("None are needed before seeking emergency assessment; vitals are unnecessary."), "fail");
  assert.equal(status("No readings reported; none needed given mild symptoms.", "SELF_CARE"), "fail");
  assert.equal(status("No measurements are required."), "fail");
});

test("refill routing cannot quietly become a medication-continuation order", () => {
  const status = (patientMessage: string) => checkAnswer({ ...fixture, patientMessage }, foot, [], null).find((c) => c.id === "no_unauthorized_medication_change")?.status;
  assert.equal(status("Don't stop losartan. Contact your clinician today."), "fail");
  assert.equal(status("Continue taking the medication while waiting."), "fail");
  assert.equal(status("Contact your prescriber today to review the refill and medication plan."), "pass");
  assert.equal(status("Don't stop to measure your vital signs before calling 911."), "pass");
  assert.equal(status("Continue taking readings only if this does not delay care."), "pass");
  assert.equal(status("Don't stop to check your vital signs; continue taking losartan."), "fail");
  assert.equal(status("Keep taking readings and don't skip your medication."), "fail");
});

test("a symptom-free claim requires an explicit patient denial, not an administrative refill request", () => {
  const status = (patientMessage: string, input = "Could I refill my losartan?") => checkAnswer({ ...fixture, reason: "A clinician needs to review the request.", patientMessage }, input, [], null).find(c => c.id === "unreported_symptoms_not_denied")?.status;
  assert.equal(status("You report no symptoms, so request a refill today."), "fail");
  assert.equal(status("You are asymptomatic and need a medication review."), "fail");
  assert.equal(status("You are asymptomatic.", "I have no symptoms. Please refill my losartan."), "pass");
  assert.equal(status("You are asymptomatic.", "I'd like STI testing. No symptoms, but I have a new partner."), "pass");
  assert.equal(status("You are asymptomatic.", "What if I have no symptoms next week?"), "fail");
  assert.equal(status("Symptoms were not described; a clinician can review the refill."), "pass");
  assert.equal(status("I cannot assume you are asymptomatic. Contact your clinician."), "pass");
});

test("research citation presence cannot masquerade as support and absent research fails coverage", () => {
  const checks = checkAnswer(fixture, foot, retrieveGuidance(foot), null);
  assert.equal(checks.find((c) => c.id === "research_support")?.status, "not_assessed");
  assert.equal(checkAnswer({ ...fixture, evidence: [] }, foot, [], null).find((c) => c.id === "research_support")?.status, "fail");
  assert.equal(checkAnswer({ ...fixture, evidence: [{ sourceId: "invented", claim: "Unretrieved guidance apparently says something." }] }, foot, [], null).find((c) => c.id === "citation_provenance")?.status, "fail");
});

test("denial provenance, unsupported clearance, action timing and escalation floor are checked", () => {
  const bad = { ...fixture, disposition: "SELF_CARE" as const, patientMessage: "You have no red flags and normal vitals. Rest and wait.", redFlags: [{ concern: "Ischaemia", status: "denied" as const, quote: "Foot is warm" }] };
  const failures = checkAnswer(bad, foot, retrieveGuidance(foot), "SAME_DAY_IN_PERSON").filter((c) => c.status === "fail").map((c) => c.id);
  for (const id of ["escalation_floor", "quoted_patient_evidence", "no_blanket_clearance", "action_timing_present"]) assert.ok(failures.includes(id));
});

test("retrieval uses message content, not case IDs or supplied labels, and has explicit coverage gaps", () => {
  assert.equal(retrieveGuidance("C04 ASYNC_PHYSICIAN").length, 0);
  assert.deepEqual(retrieveGuidance("My diabetic left sole has an ulcer.").map((s) => s.id).sort(), ["idsa-dfi-2023", "nice-ng19"]);
  assert.equal(retrieveGuidance("Could I renew my medication?").length, 0);
  assert.deepEqual(retrieveGuidance("My diabetic foot ulcer is warm and painful.").map((s) => s.id).sort(), ["idsa-dfi-2023", "nice-ng19"]);
});

test("atomic shared budget survives restart and refuses the 21st call", () => {
  const directory = fresh();
  for (let i = 0; i < 20; i++) reserveModelCall(directory);
  assert.throws(() => reserveModelCall(directory), /MODEL_BUDGET_EXHAUSTED/);
  assert.equal(readdirSync(directory).length, 21);
});

test("real Mastra graph returns the model answer unchanged and records replayable provenance", async () => {
  const directory = fresh(); let prompt = "";
  const runtime = createDispositionRuntime(directory, async (input) => { prompt = input; return { answer: fixture, usage: { inputTokens: 100, outputTokens: 80 } }; });
  try {
    const run = await runtime.assess(foot);
    assert.equal(run.status, "complete");
    assert.deepEqual(run.answer, fixture);
    assert.equal(run.answerHash, hash(fixture));
    assert.equal(run.modelCalls, 3);
    assert.equal(run.model, MODEL);
    assert.equal(run.version, "disposition-agent/v3");
    assert.equal(run.tracePersisted, true);
    assert.equal(run.artifactPersisted, true);
    assert.deepEqual(run.steps.map((s) => s.id).sort(), ["assess-emergency", "assess-history", "screen-and-retrieve", "generate-disposition"].sort());
    assert.deepEqual(JSON.parse(readFileSync(join(directory, "runs", `${run.runId}.json`), "utf8")), run);
    assert.doesNotMatch(prompt, /suppliedDisposition|clinician_disposition|C04|proposal/i);
    const trace = await (await runtime.mastra.getStorage()!.getStore("observability"))!.getTrace({ traceId: run.traceId });
    assert.ok(trace && trace.spans.length >= 3);
    assert.ok(trace.spans.every((span) => span.input == null && span.output == null));
    assert.equal(JSON.stringify(trace).includes(foot), false);
  } finally { await runtime.mastra.shutdown(); }
});

test("emergency instruction precedes deferred models, which still generate the complete answer", async () => {
  const directory = fresh(); const events: string[] = [];
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const emergencyAnswer = { ...fixture, disposition: "EMERGENCY_NOW", patientMessage: "Call 911 now. Do not drive yourself or wait for a reply.", redFlags: [{ concern: "Chest pressure", status: "reported", quote: "crushing chest pressure" }], evidence: [{ sourceId: "aha-heart-attack", claim: "Heart-attack warning signs warrant calling 911 immediately." }] };
  const runtime = createRuntime(directory, async (_prompt, _context, role) => {
    events.push(role); if (role !== "disposition") await barrier;
    return { answer: role === "history" ? historyOutput : role === "emergency" ? supervisorOutput("EMERGENCY_NOW") : emergencyAnswer, usage: { inputTokens: 10, outputTokens: 20 } };
  });
  try {
    const pending = runtime.assess("I have crushing chest pressure, left arm pain and feel sweaty.", (notice) => events.push(notice.source));
    for (let i = 0; i < 100 && events.length < 3; i++) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.deepEqual(events, ["initial_screen", "history", "emergency"]);
    release(); const run = await pending;
    assert.equal(run.answer?.disposition, "EMERGENCY_NOW");
    assert.match(run.answer!.patientMessage, /Call 911 now/);
    assert.equal(run.origin, "agent");
    assert.equal(run.modelCalls, 3);
    assert.equal(run.safetyNotices?.length, 2);
    assert.equal(readdirSync(join(directory, "interactive-budget-v1")).length, 2);
  } finally { release(); await runtime.mastra.shutdown(); }
});

test("provider failure never becomes a successful async result and keeps an existing same-day instruction", async () => {
  const runtime = createDispositionRuntime(fresh(), async () => { throw new Error("SECRET_PROVIDER_ERROR"); });
  try {
    const run = await runtime.assess("I flew home and now my calf is swollen and warm.");
    assert.equal(run.status, "unavailable"); assert.equal(run.answer, null);
    assert.equal(run.safetyFloor?.disposition, "SAME_DAY_IN_PERSON");
    assert.doesNotMatch(JSON.stringify(run), /SECRET_PROVIDER_ERROR/);
  } finally { await runtime.mastra.shutdown(); }
});

test("invalid citations cannot erase an agent-detected emergency", async () => {
  const emergency = { ...fixture, disposition: "EMERGENCY_NOW" as const, patientMessage: "Go to the emergency department now. Do not wait for a message reply.", redFlags: [{ concern: "Dangerous cause not excluded", status: "unknown" as const, quote: "" }], evidence: [{ sourceId: "not-retrieved", claim: "A claim that has not been verified." }] };
  const runtime = createDispositionRuntime(fresh(), async () => ({ answer: emergency, usage: { inputTokens: 20, outputTokens: 20 } }));
  try { const run = await runtime.assess("Severe unexplained symptoms."); assert.equal(run.status, "review_required"); assert.equal(run.answer?.disposition, "EMERGENCY_NOW"); assert.equal(run.origin, "validation_safeguard"); assert.deepEqual(run.rejectedAnswer, emergency); assert.deepEqual(run.answer?.evidence, []); }
  finally { await runtime.mastra.shutdown(); }
});

test("a malformed model answer cannot erase its structured emergency signal", async () => {
  const runtime = createDispositionRuntime(fresh(), async () => ({ answer: { disposition: "EMERGENCY_NOW", patientMessage: "bad" }, usage: { inputTokens: 5, outputTokens: 5 } }));
  try { const run = await runtime.assess("Severe unexplained symptoms."); assert.equal(run.answer?.disposition, "EMERGENCY_NOW"); assert.match(run.answer!.patientMessage, /assessment now/); assert.equal(run.origin, "validation_safeguard"); }
  finally { await runtime.mastra.shutdown(); }
});

test("observed clinical-attribution failures trigger targeted regressions", () => {
  const answer = { ...fixture, patientMessage: "A clinician will review this within 24 hours. Please get an in-person assessment today.", redFlags: [{ concern: "Systemic infection, chills, confusion", status: "denied" as const, quote: "No fever" }], evidence: [{ sourceId: "nice-ng19", claim: "NICE requires in-person assessment within one working day." }] };
  const failures = checkAnswer(answer, foot, retrieveGuidance(foot), null).filter((c) => c.status === "fail").map((c) => c.id);
  for (const id of ["no_unconfirmed_handoff", "denial_scope", "guideline_deadline_fidelity"]) assert.ok(failures.includes(id));
});

test("three-call reservations survive restarts and cannot exceed the Opus budget", () => {
  const directory = fresh();
  for (let i = 0; i < 12; i++) reserveOpusRun(directory);
  assert.throws(() => reserveOpusRun(directory), /MODEL_BUDGET_EXHAUSTED/);
  assert.equal(readdirSync(directory).length, 13);
});

test("parallel agents receive only original input, not each other's output", async () => {
  const prompts: Record<string, string> = {};
  const runtime = createRuntime(fresh(), async (prompt, _context, role) => {
    prompts[role] = prompt;
    return { answer: role === "history" ? { ...historyOutput, vitalSigns: "HISTORY_PRIVATE_CANARY" } : role === "emergency" ? supervisorOutput("SAME_DAY_IN_PERSON") : fixture, usage: { inputTokens: 10, outputTokens: 10 } };
  });
  try { await runtime.assess(foot); assert.doesNotMatch(prompts.emergency, /HISTORY_PRIVATE_CANARY/); assert.match(prompts.disposition, /HISTORY_PRIVATE_CANARY/); }
  finally { await runtime.mastra.shutdown(); }
});

test("supervisor emergency survives failed history and malformed supervisor details", async () => {
  const notices: string[] = [];
  const runtime = createRuntime(fresh(), async (_prompt, _context, role) => {
    if (role === "history") throw new Error("private provider failure");
    assert.equal(role, "emergency");
    return { answer: { minimumDisposition: "EMERGENCY_NOW" }, usage: { inputTokens: 5, outputTokens: 5 } };
  });
  try { const run = await runtime.assess("Unusual rapidly progressing symptoms.", (notice) => notices.push(notice.source)); assert.equal(run.modelCalls, 2); assert.equal(run.answer?.disposition, "EMERGENCY_NOW"); assert.equal(run.status, "review_required"); assert.deepEqual(notices, ["emergency_agent"]); }
  finally { await runtime.mastra.shutdown(); }
});

test("writer cannot downgrade the emergency supervisor", async () => {
  const runtime = createRuntime(fresh(), async (_prompt, _context, role) => ({ answer: role === "history" ? historyOutput : role === "emergency" ? supervisorOutput("EMERGENCY_NOW") : fixture, usage: { inputTokens: 10, outputTokens: 10 } }));
  try { const run = await runtime.assess(foot); assert.equal(run.answer?.disposition, "EMERGENCY_NOW"); assert.equal(run.origin, "validation_safeguard"); assert.equal(run.failure, "ANSWER_CONTRACT_FAILED"); assert.deepEqual(run.rejectedAnswer, fixture); assert.equal(run.rejectedChecks?.find((c) => c.id === "escalation_floor")?.status, "fail"); assert.equal(run.checks.find((c) => c.id === "escalation_floor")?.status, "pass"); assert.equal(run.checks.find((c) => c.id === "generation_contract")?.status, "fail"); }
  finally { await runtime.mastra.shutdown(); }
});

test("unsupported numeric risk is not added to persuade a patient", () => {
  const checks = checkAnswer({ ...fixture, patientMessage: fixture.patientMessage + " You have a 90% chance of losing the foot." }, foot, retrieveGuidance(foot), null);
  assert.equal(checks.find((c) => c.id === "no_unsupported_statistics")?.status, "fail");
  assert.equal(checkAnswer({ ...fixture, vitalSigns: "Reported oxygen saturation 95%; time and device unknown." }, foot, retrieveGuidance(foot), null).find((c) => c.id === "no_unsupported_statistics")?.status, "pass");
  assert.equal(checkAnswer({ ...fixture, questions: ["Can you feel anything hard or bone-like in the wound base?"] }, foot, retrieveGuidance(foot), null).find((c) => c.id === "no_patient_wound_probing")?.status, "fail");
});

test("EMS check accepts immediate local-number wording but rejects conditional activation", () => {
  for (const text of ["Call 911 now.", "Please call 911 immediately.", "Call 911 (or your local emergency number) right now — do not wait."]) assert.equal(hasImmediateEmsDirective(text), true);
  for (const text of ["Call 911 if symptoms worsen.", "If you cannot travel, call 911 now.", "Do not call 911 now.", "Call 911 (if symptoms worsen) now."]) assert.equal(hasImmediateEmsDirective(text), false);
});
