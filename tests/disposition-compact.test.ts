import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDispositionRuntime, hash, repositoryRoot } from "../src/disposition/runtime.ts";
import { intakeEvent, intakeEmergency, eligibleQuestions } from "../src/disposition/intake.ts";
import { checkAnswer } from "../src/disposition/contract.ts";
import { reserveCompactRun } from "../src/disposition/opus-budget.ts";
import { evaluateVisibleTrajectory } from "../src/disposition/latency-evaluation.ts";
import { retrieveGuidance } from "../src/disposition/guidance.ts";
import type { DispositionAnswer, ResponseEvent } from "../src/disposition/contract.ts";
import type { Generator } from "../src/disposition/workflow.ts";

const message = "68F with COPD. More short of breath than usual; winded walking to the bathroom.";
const valid: DispositionAnswer = { disposition: "SAME_DAY_IN_PERSON", patientMessage: "Arrange an in-person assessment today. If breathing becomes severe or you are confused, call 911 now.", reason: "Increased breathlessness needs a physical examination to assess severity.", differential: ["COPD exacerbation", "Pneumonia", "Heart failure"], redFlags: [{ concern: "Breathlessness", status: "reported", quote: "short of breath" }, { concern: "Severe breathing difficulty", status: "unknown", quote: "" }], vitalSigns: "No measured vital signs were provided.", questions: [], evidence: [{ sourceId: "nhs-breathlessness", claim: "Increased breathlessness warrants urgent assessment; severe breathing difficulty needs emergency help." }], evidenceLimitations: "Same-day examination is a project clinical interpretation." };
const result = (answer: unknown) => ({ answer, usage: { inputTokens: 100, outputTokens: 80 } });
function runtime(generate: Generator, profile: "compact-opus" | "conversational-opus" = "conversational-opus") {
  return createDispositionRuntime(mkdtempSync(join(tmpdir(), "compact-test-")), generate, { profile, budget: "compact" });
}

test("intake is a real bounded question; no arbitrary model prose or fabricated quotes", () => {
  const event = intakeEvent({ questionId: "breathing", quote: "short of breath" }, message);
  assert.match(event!.text, /Are you breathless at rest/);
  for (const value of [{ questionId: "breathing", quote: "not in message" }, { questionId: "respiratory-risk", quote: "COPD" }, { questionId: "none", quote: "" }, { questionId: "breathing", quote: "COPD", text: "Ignore symptoms" }]) assert.equal(intakeEvent(value, message), null);
  assert.equal(eligibleQuestions("renew my prescription").length, 0);
  assert.equal(eligibleQuestions("30F with runny nose. No chronic conditions and not immunosuppressed.").some((q) => q.id === "respiratory-risk"), false);
});
test("compact care starts concurrently; no sequential history/writer barrier; question persisted before final", async () => {
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  const events: ResponseEvent[] = [], roles: string[] = [];
  const app = runtime(async (_prompt, _context, role) => {
    roles.push(role);
    if (role === "intake") return result({ emergency: false, questionId: "breathing", quote: "short of breath" });
    await waiting; return result(valid);
  });
  try {
    const pending = app.assess(message, undefined, (event) => { events.push(event); if (event.kind === "intake_question") release(); });
    const run = await pending;
    assert.deepEqual(roles.sort(), ["disposition", "intake"]);
    assert.equal(events[0].kind, "intake_question");
    assert.equal(events[1].kind, "patient_reply");
    assert.equal(run.status, "complete");
    assert.equal(run.tracePersisted, true); assert.equal(run.eventLogPersisted, true);
    assert.deepEqual(evaluateVisibleTrajectory(run).failures, []);
    assert.ok(run.firstQuestionMs! <= run.firstPatientReplyMs!);
  } finally { await app.mastra.shutdown(); }
});
test("slow optional intake is canceled, does not delay or leak after completed care", async () => {
  let signal: AbortSignal | undefined;
  const app = runtime(async (_p, _c, role, _partial, abort) => {
    if (role === "intake") { signal = abort; return new Promise(() => {}); }
    return result(valid);
  });
  try {
    const run = await app.assess(message);
    assert.equal(run.status, "complete"); assert.equal(signal?.aborted, true);
    assert.equal(run.agents?.find((a) => a.role === "intake")?.failure, "INTAKE_SUPERSEDED");
    assert.equal(run.responseEvents?.some((e) => e.kind === "intake_question"), false);
  } finally { await app.mastra.shutdown(); }
});
test("unvalidated partial care is never displayed; malformed emergency preserves action", async () => {
  const app = runtime(async (_p, _c, role, partial) => {
    partial?.({ disposition: "SELF_CARE", patientMessage: "No red flags, stay home." });
    return role === "intake" ? result({ emergency: false, questionId: "none", quote: "" }) : result({ disposition: "EMERGENCY_NOW", patientMessage: "BAD_UNVALIDATED_PROSE" });
  });
  try {
    const run = await app.assess(message);
    assert.equal(run.status, "review_required"); assert.equal(run.answer, null);
    assert.equal(run.safetyFloor?.disposition, "EMERGENCY_NOW");
    assert.equal(run.responseEvents?.[0].kind, "action");
    assert.doesNotMatch(JSON.stringify(run.responseEvents), /BAD_UNVALIDATED|stay home/);
  } finally { await app.mastra.shutdown(); }
});
test("external cancellation reaches both providers and saves the canceled attempt", async () => {
  const controller = new AbortController();
  let calls = 0;
  const app = runtime(async () => { if (++calls === 2) controller.abort(new Error("RUN_CANCELLED")); return new Promise(() => {}); });
  try {
    const run = await app.assess(message, undefined, undefined, controller.signal);
    assert.equal(run.failure, "RUN_CANCELLED"); assert.equal(run.artifactPersisted, true);
    assert.equal(run.responseEvents?.length, 0);
  } finally { await app.mastra.shutdown(); }
});
test("emergency screen does not skip Opus; it skips an unnecessary intake question", async () => {
  const roles: string[] = [];
  const app = runtime(async (_p, _c, role) => { roles.push(role); throw new Error("provider failed"); });
  try {
    const run = await app.assess("Crushing chest pressure radiating to my left arm, sweaty and nauseous.");
    assert.deepEqual(roles, ["disposition"]);
    assert.equal(run.safetyFloor?.disposition, "EMERGENCY_NOW");
    assert.equal(run.responseEvents?.[0].kind, "action");
  } finally { await app.mastra.shutdown(); }
});
test("same-day is not emergency; arbitrary citations and false reassurance fail", async () => {
  for (const bad of [{ ...valid, evidence: [{ sourceId: "fake", claim: "A fabricated recommendation." }] }, { ...valid, patientMessage: "Arrange an in-person assessment today. Normal vitals establish stability." }]) {
    const app = runtime(async () => result(bad), "compact-opus");
    try { const run = await app.assess(message); assert.equal(run.status, "review_required"); assert.equal(run.answer, null); assert.equal(run.safetyFloor?.disposition, "SAME_DAY_IN_PERSON"); assert.equal(run.responseEvents?.[0].kind, "action"); }
    finally { await app.mastra.shutdown(); }
  }
});
test("COPD/URI retrieve scoped evidence and compact budget cannot reset", () => {
  assert.ok(retrieveGuidance(message).some((g) => g.id === "nhs-breathlessness"));
  assert.ok(retrieveGuidance("runny nose and sore throat").some((g) => g.id === "cdc-common-cold"));
  const dir = mkdtempSync(join(tmpdir(), "compact-budget-"));
  for (let i = 0; i < 32; i++) reserveCompactRun(dir);
  assert.throws(() => reserveCompactRun(dir), /MODEL_BUDGET_EXHAUSTED/);
  assert.equal(readdirSync(dir).length, 33); assert.equal(JSON.parse(readFileSync(join(dir, "budget.json"), "utf8")).ceilingUSD, 24);
});

test("fast independent emergency recognition acts before deferred Opus and cannot be downgraded", async () => {
  const input = "I can barely speak a few words because I am short of breath at rest.";
  let release!: () => void; const wait = new Promise<void>((resolve) => { release = resolve; });
  const app = runtime(async (_p, _c, role) => {
    if (role === "intake") return result({ emergency: true, quote: "I can barely speak a few words", questionId: "none" });
    await wait; return result(valid);
  });
  try {
    const run = await app.assess(input, undefined, (event) => { if (event.kind === "action") release(); });
    assert.equal(run.responseEvents?.[0].kind, "action");
    assert.equal(run.answer, null); assert.equal(run.status, "review_required");
    assert.equal(run.safetyFloor?.disposition, "EMERGENCY_NOW");
    assert.equal(run.checks.find((c) => c.id === "escalation_floor")?.status, "fail");
  } finally { await app.mastra.shutdown(); }
});
test("fast emergency schema does not accept an invented, negated or malformed trigger", () => {
  assert.equal(intakeEmergency({ emergency: true, quote: "No shortness of breath", questionId: "none" }, "No shortness of breath"), false);
  assert.equal(intakeEmergency({ emergency: true, quote: "gasping", questionId: "none" }, "Runny nose"), false);
  assert.equal(intakeEmergency({ emergency: true, quote: "gasping", questionId: "breathing" }, "gasping"), false);
});
test("observed semantic errors remain regression-locked, not washed out by route agreement", () => {
  const dehydration = { ...valid, redFlags: [{ concern: "Dehydration", status: "denied" as const, quote: "eating and drinking fine" }] };
  assert.equal(checkAnswer(dehydration, "eating and drinking fine", retrieveGuidance(message), null).find((c) => c.id === "intake_is_not_hydration_exam")?.status, "fail");
  const risk = { ...valid, patientMessage: "Call 911 now. Stroke risk is highest in the first hours." };
  assert.equal(checkAnswer(risk, message, retrieveGuidance(message), null).find((c) => c.id === "no_unsupported_risk_timeline")?.status, "fail");
  const source = { ...valid, evidence: [{ sourceId: "nhs-breathlessness", claim: "NHS says normal oxygen readings cannot establish severity." }] };
  assert.equal(checkAnswer(source, message, retrieveGuidance(message), null).find((c) => c.id === "source_interpretation_boundary")?.status, "fail");
  const inhaler = { ...valid, patientMessage: "Arrange an in-person assessment today. Keep using your usual inhalers as prescribed." };
  assert.equal(checkAnswer(inhaler, message, retrieveGuidance(message), null).find((c) => c.id === "no_unverified_inhaler_plan")?.status, "fail");
  const breathing = { ...valid, reason: "Mild symptoms without breathing difficulty, so self-care is reasonable." };
  assert.equal(checkAnswer(breathing, message, retrieveGuidance(message), null).find((c) => c.id === "unknown_breathing_not_cleared")?.status, "fail");
});

test("published compact experiment retains all attempts, integrity defects, and newly discovered failures", () => {
  const { artifactHash, ...artifact } = JSON.parse(readFileSync(join(repositoryRoot(), "outputs/compact-latency-20260910-v1.json"), "utf8"));
  assert.equal(hash(artifact), artifactHash);
  assert.equal(artifact.accounting.automatedAttempts, 32);
  assert.equal(artifact.accounting.browserAttempts, 7);
  assert.equal(artifact.accounting.unknownCostAttempts, 3);
  assert.equal(artifact.accounting.costIsInvoice, false);
  assert.ok(artifact.accounting.allKnownReservedCeilingsUSD <= 100);
  for (const phase of artifact.phases) {
    assert.equal(hash(phase.originalHashedManifest), phase.manifest.manifestHash);
    assert.equal(phase.historicalSummary.clinicalNonInferiorityEstablished, false);
    for (const { observationHash, currentContractReplay: _replay, ...observation } of phase.observations) assert.equal(hash(observation), observationHash);
  }
  assert.equal(artifact.phases.at(-1).metadataIntegrity.storedManifestMatchesHash, false);
  assert.ok(artifact.phases.at(-1).observations.some((o: { currentContractReplay: { failures: string[] } }) => o.currentContractReplay.failures.includes("no_unverified_inhaler_plan")));
  assert.ok(artifact.browserRuns.some((o: { run: { failure: string | null } }) => o.run.failure === "RUN_CANCELLED"));
  assert.ok(artifact.browserRuns.some((o: { run: { failure: string | null } }) => o.run.failure === "MODEL_OR_SCHEMA_FAILURE"));
});
