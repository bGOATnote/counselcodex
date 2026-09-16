import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClosedReplyParser, createProgressiveGate, openingFromQuote, SAME_DAY_DIRECTIVE } from "../src/disposition/progressive.ts";
import { createDispositionRuntime } from "../src/disposition/runtime.ts";
import { reserveLatencyRun, reserveInteractiveRun } from "../src/disposition/opus-budget.ts";
import { validHistory } from "../src/disposition/workflow.ts";
import { estimatedRunCost, evaluateVisibleTrajectory, median } from "../src/disposition/latency-evaluation.ts";
import type { DispositionAnswer, DispositionRun, ResponseEvent, WorkflowProfile } from "../src/disposition/contract.ts";

const message = "I have diabetes and a red, tender foot wound. No fever.";
const answer: DispositionAnswer = {
  disposition: "SAME_DAY_IN_PERSON", patientMessage: "Please arrange an in-person assessment today. Do not wait for a routine message reply.",
  reason: "The wound needs an examination to establish severity.", differential: ["Diabetic foot infection"],
  redFlags: [{ concern: "Fever", status: "denied", quote: "No fever." }], vitalSigns: "No measurements supplied.", questions: [],
  evidence: [{ sourceId: "idsa-dfi-2023", claim: "Suspected infection requires clinical severity assessment." }], evidenceLimitations: "Limited retrieved context; not a confirmed diagnosis.",
};
const history = { findings: [{ finding: "Foot wound", status: "reported", quote: "red, tender foot wound" }], vitalSigns: "Unknown measurements", differential: [], questions: ["PRIVATE_INTERNAL_CANARY"] };
const supervisor = { minimumDisposition: "SAME_DAY_IN_PERSON", emergencyDestination: "NONE", reason: "Needs examination today.", concerns: [{ concern: "Foot wound", quote: "foot wound" }] };
const usage = { inputTokens: 10, outputTokens: 10 };
const fresh = () => mkdtempSync(join(tmpdir(), "counsel-progressive-"));
const until = async (condition: () => boolean) => { for (let i = 0; i < 300 && !condition(); i++) await new Promise((resolve) => setTimeout(resolve, 5)); assert.ok(condition(), "Expected event was not emitted"); };

test("closed-field parser handles every byte boundary, reordered fields, nested commas and escaped quotes", () => {
  const text = 'Arrange an in-person assessment today, for the “café” injury. The label says "A,B".';
  for (const object of [{ disposition: "SAME_DAY_IN_PERSON", patientMessage: text, reason: "later" }, { reason: "earlier", differential: ["A,B", { foo: "}" }], patientMessage: text, disposition: "SAME_DAY_IN_PERSON" }]) {
    const encoded = JSON.stringify(object);
    for (let split = 1; split < encoded.length; split++) {
      const seen: unknown[] = []; const parse = createClosedReplyParser((value) => seen.push(value));
      parse(encoded.slice(0, split)); parse(encoded.slice(split));
      assert.deepEqual(seen.at(-1), { disposition: "SAME_DAY_IN_PERSON", patientMessage: text });
    }
  }
});

test("unfinished text is not emitted, even when it looks like an acceptable sentence", () => {
  const seen: unknown[] = []; const parse = createClosedReplyParser((value) => seen.push(value));
  parse('{"reason":"already present","disposition":"SAME_DAY_IN_PERSON","patientMessage":"Get an in-person assessment today.');
  assert.equal(seen.length, 0);
  parse(' But do not probe the wound.","differential":[');
  assert.equal(seen.length, 1);
  assert.throws(() => createClosedReplyParser(() => {})("x"), /INVALID_STREAM/);
  assert.throws(() => createClosedReplyParser(() => {})('{"disposition":"SELF_CARE","disposition":"EMERGENCY_NOW"}'), /DUPLICATE/);
  assert.throws(() => createClosedReplyParser(() => {})(" ".repeat(128_001)), /STREAM_LIMIT/);
});

test("generated advice waits for valid independent supervision and preserves EMS destination", () => {
  const events: ResponseEvent[] = []; const gate = createProgressiveGate((event) => events.push(event));
  gate.reply(answer); assert.equal(events.length, 0);
  gate.supervisor("SAME_DAY_IN_PERSON", false); assert.equal(events.length, 0);
  gate.supervisor("SAME_DAY_IN_PERSON", true); assert.equal(events.length, 1);
  gate.reply(answer); assert.equal(events.length, 1);
  const emsEvents: ResponseEvent[] = []; const ems = createProgressiveGate((event) => emsEvents.push(event));
  ems.action({ disposition: "EMERGENCY_NOW", directive: "Call 911 now.", source: "initial_screen" });
  ems.supervisor("EMERGENCY_NOW", true);
  ems.reply({ disposition: "EMERGENCY_NOW", patientMessage: "Go to the emergency department now. Call 911 if you get worse." });
  ems.action({ disposition: "SAME_DAY_IN_PERSON", directive: SAME_DAY_DIRECTIVE, source: "emergency_agent" });
  assert.equal(emsEvents.length, 1);
});

test("unsafe partial prose cannot escape simply by passing the final route", () => {
  for (const text of ["You have no red flags. Get an in-person assessment today.", "Get an in-person assessment today. Feel for bone in the wound.", "Get an in-person assessment today. There is a 90% risk of amputation."]) {
    const events: ResponseEvent[] = []; const gate = createProgressiveGate((event) => events.push(event));
    gate.supervisor("SAME_DAY_IN_PERSON", true); gate.reply({ ...answer, patientMessage: text }); assert.equal(events.length, 0);
  }
});

test("Haiku opening can only quote original input and never smuggle model advice", () => {
  assert.equal(openingFromQuote("fabricated symptom", message), null);
  assert.equal(openingFromQuote("x".repeat(200), message), null);
  assert.match(openingFromQuote("foot wound", message)!.text, /checking the appropriate care and timing/);
  const seen: ResponseEvent[] = []; const gate = createProgressiveGate((event) => seen.push(event));
  gate.action({ disposition: "SAME_DAY_IN_PERSON", directive: SAME_DAY_DIRECTIVE, source: "emergency_agent" });
  gate.opening("foot wound", message); assert.equal(seen.length, 1);
});

test("same-day instruction arrives and is durably logged while history is still blocked", async () => {
  const directory = fresh(); let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const events: ResponseEvent[] = [];
  const runtime = createDispositionRuntime(directory, async (_prompt, _context, role, partial) => {
    if (role === "history") { await barrier; return { answer: history, usage }; }
    if (role === "emergency") return { answer: supervisor, usage };
    partial?.(answer); return { answer, usage };
  });
  try {
    const pending = runtime.assess(message, undefined, (event) => events.push(event));
    await until(() => events.some((event) => event.kind === "action"));
    assert.equal(events.some((event) => event.kind === "patient_reply"), false);
    release(); const run = await pending;
    assert.equal(run.status, "complete"); assert.equal(run.eventLogPersisted, true);
    assert.match(readFileSync(join(directory, "events", `${run.runId}.jsonl`), "utf8"), /response_event/);
    assert.doesNotMatch(JSON.stringify(run.responseEvents), /PRIVATE_INTERNAL_CANARY/);
    assert.ok(run.firstActionMs! <= run.firstPatientReplyMs!);
    assert.equal(run.responseEvents?.length, 2);
  } finally { release(); await runtime.mastra.shutdown(); }
});

for (const profile of ["parallel-opus", "haiku-opus"] as WorkflowProfile[]) {
  test(`${profile} drafts independently, never sends labels/history to writer, and validates conflict`, async () => {
    let writerStarted = false, supervisorStarted = false;
    let release!: () => void; const barrier = new Promise<void>((resolve) => { release = resolve; });
    const events: ResponseEvent[] = [];
    const runtime = createDispositionRuntime(fresh(), async (prompt, _context, role, partial) => {
      if (role === "history") return { answer: history, usage };
      if (role === "emergency") { supervisorStarted = true; await barrier; return { answer: supervisor, usage }; }
      writerStarted = true; assert.doesNotMatch(prompt, /PRIVATE_INTERNAL_CANARY|suppliedDisposition|C04/);
      partial?.(answer); return { answer, usage };
    }, { profile });
    try {
      const pending = runtime.assess(message, undefined, (event) => events.push(event));
      await until(() => writerStarted && supervisorStarted);
      assert.equal(events.some((event) => event.kind === "patient_reply"), false);
      release(); const run = await pending;
      assert.equal(run.status, "complete"); assert.equal(run.profile, profile);
      assert.equal(run.modelCalls, profile === "parallel-opus" ? 2 : 3);
      assert.equal(run.firstPatientReplyMs !== null, true);
    } finally { release(); await runtime.mastra.shutdown(); }
  });
}

test("late provider failure keeps early instructions and the emitted prefix in its artifact", async () => {
  const runtime = createDispositionRuntime(fresh(), async (_prompt, _context, role, partial) => {
    if (role === "history") return { answer: history, usage };
    if (role === "emergency") return { answer: supervisor, usage };
    partial?.(answer); throw new Error("PRIVATE_LATE_ERROR");
  });
  try {
    const run = await runtime.assess(message);
    assert.equal(run.status, "unavailable"); assert.equal(run.answer, null);
    assert.ok(run.responseEvents?.some((event) => event.kind === "patient_reply"));
    assert.equal(run.safetyFloor?.disposition, "SAME_DAY_IN_PERSON");
    assert.doesNotMatch(JSON.stringify(run), /PRIVATE_LATE_ERROR/);
  } finally { await runtime.mastra.shutdown(); }
});

test("a changed final reply fails rather than overwriting the earlier visible version", async () => {
  const runtime = createDispositionRuntime(fresh(), async (_prompt, _context, role, partial) => {
    if (role === "history") return { answer: history, usage };
    if (role === "emergency") return { answer: supervisor, usage };
    partial?.(answer); return { answer: { ...answer, patientMessage: answer.patientMessage + " This is different." }, usage };
  });
  try { const run = await runtime.assess(message); assert.equal(run.status, "unavailable"); assert.equal(run.checks.find((item) => item.id === "visible_reply_consistency")?.status, "fail"); }
  finally { await runtime.mastra.shutdown(); }
});

test("shared latency ceiling stops at sixteen whole-run reservations across profiles", () => {
  const directory = fresh();
  for (let i = 0; i < 16; i++) reserveLatencyRun(directory);
  assert.throws(() => reserveLatencyRun(directory), /MODEL_BUDGET_EXHAUSTED/);
});

test("interactive allowance is independently bounded and cannot reset an exhausted pilot ledger", () => {
  const pilot = fresh(); for (let i = 0; i < 16; i++) reserveLatencyRun(pilot);
  assert.throws(() => reserveInteractiveRun(pilot), /BUDGET_CONFIGURATION_MISMATCH/);
  const interactive = fresh(); for (let i = 0; i < 12; i++) reserveInteractiveRun(interactive);
  assert.throws(() => reserveInteractiveRun(interactive), /MODEL_BUDGET_EXHAUSTED/);
});

test("latency reporting excludes acknowledgments and never turns missing timings into zero", () => {
  const run = { status: "unavailable", answer: null, message, guidance: [], durationMs: 100, responseEvents: [{ ...openingFromQuote("foot wound", message)!, elapsedMs: 2 }] } as unknown as DispositionRun;
  assert.equal(evaluateVisibleTrajectory(run).firstActionOrReplyMs, null);
  assert.deepEqual(evaluateVisibleTrajectory(run).failures, ["incomplete_assessment"]);
  assert.equal(median([null, undefined]), null);
  assert.equal(median([null, 10, 20]), 15);
});

test("visible failures cannot disappear when the completed answer is rejected", () => {
  const run = { status: "unavailable", answer: null, message, guidance: [], durationMs: 100, responseEvents: [{ kind: "patient_reply", disposition: answer.disposition, text: answer.patientMessage, elapsedMs: 20 }] } as unknown as DispositionRun;
  const result = evaluateVisibleTrajectory(run);
  assert.equal(result.firstActionOrReplyMs, 20);
  assert.ok(result.failures.includes("visible_reply_not_finalized"));
  assert.ok(result.failures.includes("visible_final_disagreement"));
  assert.equal(result.clinicalCorrectness, "not_assessed");
});

test("cost estimates refuse unknown models, missing agents and missing usage", () => {
  assert.equal(estimatedRunCost({ agents: [] } as unknown as DispositionRun), null);
  for (const agent of [{ model: "unknown", usage }, { model: "anthropic/claude-opus-5", usage: { inputTokens: null, outputTokens: 1 } }]) {
    assert.equal(estimatedRunCost({ agents: [agent] } as unknown as DispositionRun), null);
  }
  assert.equal(estimatedRunCost({ agents: [{ model: "anthropic/claude-haiku-4-5", usage }] } as unknown as DispositionRun), 0.00006);
});

test("unknown history can cite original context, never an invented quote or an unsupported denial", () => {
  const contextual = { ...history, findings: [{ finding: "Measured temperature", status: "unknown" as const, quote: "No fever." }] };
  assert.equal(validHistory(contextual, message), true);
  assert.equal(contextual.findings[0].status, "unknown");
  assert.equal(validHistory({ ...contextual, findings: [{ ...contextual.findings[0], quote: "Temperature 37 C" }] }, message), false);
  assert.equal(validHistory({ ...contextual, findings: [{ ...contextual.findings[0], status: "denied", quote: "" }] }, message), false);
});

test("context-quoted unknown history reaches the writer without being changed to a negative finding", async () => {
  const runtime = createDispositionRuntime(fresh(), async (prompt, _context, role, partial) => {
    if (role === "history") return { answer: { ...history, findings: [{ finding: "Measured temperature", status: "unknown", quote: "No fever." }] }, usage };
    if (role === "emergency") return { answer: supervisor, usage };
    assert.deepEqual(JSON.parse(prompt).history.findings, [{ finding: "Measured temperature", status: "unknown", quote: "No fever." }]);
    partial?.(answer); return { answer, usage };
  });
  try { const run = await runtime.assess(message); assert.equal(run.status, "complete"); assert.equal(run.modelCalls, 3); }
  finally { await runtime.mastra.shutdown(); }
});

test("published latency evidence retains failed attempts and never claims clinical non-inferiority", () => {
  const report = JSON.parse(readFileSync(new URL("../docs/evaluations/progressive-latency-2026-09-10.json", import.meta.url), "utf8"));
  assert.equal(report.pilot.length, 12); assert.equal(report.http.length, 4);
  assert.equal(report.pilot.filter((run: { status: string }) => run.status === "complete").length, 11);
  assert.equal(report.http.filter((run: { status: string }) => run.status === "complete").length, 3);
  assert.equal(report.pilot.filter((run: { failures: string[] }) => run.failures.includes("research_support")).length, 5);
  assert.equal(report.clinicalNonInferiorityEstablished, false); assert.equal(report.autoPromoted, false);
  assert.equal(report.clinicalCorrectness, "not_assessed");
  assert.ok(Math.abs(report.estimatedTotalUSD - 1.112339) < 1e-9);
});
