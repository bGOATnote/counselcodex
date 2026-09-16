import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseExperimentCases, experimentManifest, runExperiment, summarizeExperiment, wilson, EXPERIMENT_VERSION, type TrialRecord, type ExperimentCase } from "../src/evaluation/disposition-experiment.ts";
import { digest, SEARCH_VERSION } from "../src/evidence/search.ts";
import type { DispositionRun, WorkflowProfile } from "../src/disposition/contract.ts";
import { fixtureRun } from "./response-review-fixtures.ts";
import { ROUTING_POLICY_VERSION } from "../src/disposition/routing-policy.ts";

const cases: ExperimentCase[] = [{ id: "unseen-1", message: "A synthetic unseen message for testing only.", reference: { status: "development_expectation", provenance: "Software test fixture; not clinician reviewed", acceptedRoutes: ["EMERGENCY_NOW"], emergency: true } }];
const evidence = { version: SEARCH_VERSION, corpusHash: digest([]), passages: [], audit: [] };
const fake = (message: string, profile: WorkflowProfile): DispositionRun => ({ message, profile, status: "unavailable", answer: null, adaptive: { version: "test", mode: "test", plan: null, evidence }, usage: { inputTokens: 0, outputTokens: 0 }, responseEvents: [], durationMs: 1 } as unknown as DispositionRun);
test("strict unseen-case import rejects duplicates and original labels mistaken for truth", () => {
  assert.equal(parseExperimentCases(JSON.stringify(cases[0])).length, 1);
  assert.throws(() => parseExperimentCases([cases[0],cases[0]].map((c) => JSON.stringify(c)).join("\n")));
  assert.throws(() => parseExperimentCases(JSON.stringify({ id: "C04", message: "Synthetic message", disposition: "ASYNC_PHYSICIAN" })));
});
test("paired evidence frozen, labels excluded, resume never reruns a completed attempt", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ablation-test-")), manifest = experimentManifest(cases, "fixture/v1", 1, "simulated");
  let calls = 0;
  const runner: Parameters<typeof runExperiment>[3] = async (input,arm,frozen) => {
    calls++; assert.deepEqual(Object.keys(input).sort(), ["id","message"]);
    if (arm === "adaptive-critique") assert.deepEqual(frozen,evidence);
    return fake(input.message,arm);
  };
  const a = await runExperiment(cases,dir,manifest,runner);
  const saved = readFileSync(join(dir,"unseen-1--1--base-opus.json"),"utf8");
  const b = await runExperiment(cases,dir,manifest,runner);
  assert.equal(calls,4); assert.deepEqual(a,b); assert.equal(readFileSync(join(dir,"unseen-1--1--base-opus.json"),"utf8"),saved);
  const report = summarizeExperiment(cases,a);
  assert.equal(report.arms[0].emergencySensitivity!.denominator,1); assert.equal(report.arms[0].emergencySensitivity!.rate,0);
  assert.equal(report.arms[0].clinicalCorrectness,"not_assessed");
  await assert.rejects(runExperiment(cases,dir,{ ...manifest, fingerprint: "changed" },runner), /MANIFEST_MISMATCH/);
  const corrupted = JSON.parse(saved); corrupted.durationMs += 1;
  writeFileSync(join(dir,"unseen-1--1--base-opus.json"),JSON.stringify(corrupted));
  await assert.rejects(runExperiment(cases,dir,manifest,runner), /RESULT_MISMATCH/);
});

test("concurrent runners cannot turn an in-flight attempt into a cached failure", async () => {
  const dir = mkdtempSync(join(tmpdir(),"ablation-lock-")), manifest = experimentManifest(cases,"lock-test",1,"simulated");
  let release!: () => void;
  const pending = new Promise<void>((r) => { release = r; });
  const first = runExperiment(cases,dir,manifest,async (input,arm) => { await pending; return fake(input.message,arm); });
  await assert.rejects(runExperiment(cases,dir,manifest,async (input,arm) => fake(input.message,arm)), /EXPERIMENT_LOCKED/);
  release(); assert.equal((await first).length,4);
});
test("crashed attempt remains failure; changing evidence in critique is rejected", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ablation-crash-")), manifest = experimentManifest(cases,"fixture",1,"simulated");
  writeFileSync(join(dir,"unseen-1--1--base-opus.attempt.json"),"{}");
  const rows = await runExperiment(cases,dir,manifest,async (input,arm) => {
    const result = fake(input.message,arm);
    if (arm === "adaptive-critique") result.adaptive = { ...result.adaptive!, evidence: { ...evidence, corpusHash: "changed" } };
    return result;
  });
  assert.equal(rows.find((r) => r.arm === "base-opus")?.status,"interrupted");
  assert.equal(rows.find((r) => r.arm === "base-opus")?.durationMs,null);
  assert.equal(rows.find((r) => r.arm === "base-opus")?.executionState,"prior_attempt_unknown");
  assert.equal(rows.find((r) => r.arm === "adaptive-critique")?.failure,"PAIRED_EVIDENCE_CHANGED");
});
test("1000-case planning is label-independent and does not make provider calls", () => {
  const thousand = Array.from({ length: 1000 }, (_,i) => ({ id: `u${i}`, message: `Synthetic case ${i}: a presenting symptom.` }));
  const parsed = parseExperimentCases(thousand.map((c) => JSON.stringify(c)).join("\n"));
  const manifest = experimentManifest(parsed,"frozen-runtime");
  assert.equal(manifest.maximumModelCalls,8000);
  assert.equal(manifest.inferenceHash,digest(thousand));
  const interval = wilson(100,100); assert.ok(interval.ci95![0] < 1);
  assert.equal(wilson(0,0).rate,null);
});

test("1000-case simulated batch persists all four arms and resumes without any repeated inference", async () => {
  const thousand = Array.from({ length: 1000 }, (_,i) => ({ id: `u${i}`, message: `Synthetic case ${i}: a presenting symptom.` }));
  const manifest = experimentManifest(thousand,"software-scale-test",1,"simulated");
  const dir = mkdtempSync(join(tmpdir(),"ablation-1000-")); let calls = 0;
  const runner: Parameters<typeof runExperiment>[3] = async (input,arm) => { calls++; return fake(input.message,arm); };
  const records = await runExperiment(thousand,dir,manifest,runner);
  assert.equal(records.length,4000); assert.equal(calls,4000);
  assert.equal((await runExperiment(thousand,dir,manifest,runner)).length,4000); assert.equal(calls,4000);
  assert.equal(summarizeExperiment(thousand,records).arms[0].acceptedRouteCoverage!.rate,null);
});

test("skipped and interrupted attempts remain outcome failures without appearing as fast executions", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ablation-timing-")), manifest = experimentManifest(cases,"timing-fixture",1,"simulated");
  writeFileSync(join(dir,"unseen-1--1--base-opus.attempt.json"),"{}");
  const rows = await runExperiment(cases,dir,manifest,async () => { throw new Error("simulated provider failure"); });
  const skipped = rows.find((r) => r.arm === "adaptive-critique")!;
  assert.equal(skipped.failure,"NO_PAIRED_EVIDENCE_SNAPSHOT"); assert.equal(skipped.durationMs,null); assert.equal(skipped.executionState,"not_started");
  const summary = summarizeExperiment(cases,rows);
  for (const arm of [summary.arms[0], summary.arms[3]]) {
    assert.equal(arm.medianEndMs,null); assert.equal(arm.latencyDenominators.observedEnd,0);
    assert.equal(arm.latencyDenominators.unknownOrNotExecutedEnd,1); assert.equal(arm.emergencySensitivity!.denominator,1);
  }
  assert.equal(summary.arms[1].latencyDenominators.observedEnd,1);
  assert.equal(typeof summary.arms[1].medianEndMs,"number");
});

test("emergency events survive a failed final runner and remain in sensitivity and false-escalation metrics", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ablation-events-")), manifest = experimentManifest(cases,"events-fixture",1,"simulated");
  const rows = await runExperiment(cases,dir,manifest,async (_input,_arm,_frozen,emit) => {
    emit?.({ kind: "action", notice: { disposition: "EMERGENCY_NOW", directive: "Call 911 now. Do not wait for a reply.", source: "emergency_agent" }, elapsedMs: 700, sequence: 1 });
    throw new Error("catastrophic final workflow failure");
  });
  const base = rows.find((r) => r.arm === "base-opus")!;
  assert.equal(base.run,null); assert.equal(base.responseEvents.length,1); assert.equal(base.responseEvents[0].elapsedMs,700);
  assert.equal(JSON.parse(readFileSync(join(dir,"unseen-1--1--base-opus.json"),"utf8")).responseEvents.length,1);
  const summary = summarizeExperiment(cases,rows);
  assert.equal(summary.arms[0].emergencySensitivity!.rate,1); assert.equal(summary.arms[0].failedOrUnavailable,1);
  assert.equal(summary.arms[0].medianActionMs,700); assert.equal(summary.arms[0].latencyDenominators.observedAction,1);
  const nonemergency = cases.map((c) => ({ ...c, reference: { ...c.reference!, emergency: false, acceptedRoutes: ["ASYNC_PHYSICIAN" as const] } }));
  assert.equal(summarizeExperiment(nonemergency,rows).arms[0].falseEmergencyEscalation!.rate,1);
});

test("invalid callback data is not counted as patient-visible clinical evidence", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ablation-invalid-event-")), manifest = experimentManifest(cases,"invalid-event",1,"simulated");
  const rows = await runExperiment(cases,dir,manifest,async (input,arm,_frozen,emit) => {
    emit?.({ kind: "action", notice: { disposition: "EMERGENCY_NOW", directive: "", source: "emergency_agent" } });
    return fake(input.message,arm);
  });
  assert.equal(rows[0].eventCaptureFailure,true); assert.equal(rows[0].responseEvents.length,0);
  assert.equal(rows[0].failure,"EVENT_CAPTURE_INVALID"); assert.equal(rows[0].run,null);
});

test("repetitions suppress independence-based intervals and duplicate summaries are rejected", () => {
  const record: TrialRecord = { version: EXPERIMENT_VERSION, id: cases[0].id, manifestHash: "fixture", inputHash: digest(cases[0].message), recordHash: "fixture", failure: null, evidenceHash: null, status: "recorded", eventCaptureFailure: false, trial: 1, arm: "base-opus", execution: "simulated", executionState: "started", durationMs: 100, responseEvents: [], run: fake(cases[0].message,"base-opus") };
  const repeated = [1,2,3].map((trial) => ({ ...record,trial }));
  const summary = summarizeExperiment(cases,repeated).arms[0];
  assert.equal(summary.emergencySensitivity!.denominator,3); assert.equal(summary.emergencySensitivity!.ci95,null);
  assert.equal(summary.emergencySensitivity!.intervalMethod,"suppressed_case_repetition_requires_clustered_inference");
  assert.equal(summary.referenceOutcomes[1].cases,1);
  assert.throws(() => summarizeExperiment(cases,[record,record]),/INVALID_SUMMARY_RECORD_IDENTITIES/);
});

test("development expectations never pool with physician-adjudicated metrics", () => {
  const mixed = [cases[0], { ...cases[0], id: "clinician-case", reference: { ...cases[0].reference!, status: "clinician_adjudicated" as const } }];
  const rows = mixed.map((c): TrialRecord => ({ version: EXPERIMENT_VERSION, id: c.id, manifestHash: "fixture", inputHash: digest(c.message), recordHash: "fixture", failure: null, evidenceHash: null, status: "recorded", eventCaptureFailure: false, trial: 1, arm: "base-opus", execution: "simulated", executionState: "started", durationMs: 100, responseEvents: [], run: fake(c.message,"base-opus") }));
  const summary = summarizeExperiment(mixed,rows).arms[0];
  assert.equal(summary.emergencySensitivity,null); assert.equal(summary.acceptedRouteCoverage,null);
  assert.equal(summary.pooledReferenceMetrics,"suppressed_mixed_reference_status");
  assert.deepEqual(summary.referenceOutcomes.map((r) => r.emergencySensitivity.denominator),[1,1]);
});

test("comparison metadata discloses confounds and legacy timestamps are not upgraded", () => {
  const manifest = experimentManifest(cases,"fixture");
  assert.match(manifest.ordering,/not a balanced Latin/); assert.match(manifest.design,/not isolated component lift/);
  const legacy = { version: "disposition-ablation/v1", id: cases[0].id, trial: 1, arm: "base-opus", execution: "simulated", status: "interrupted", durationMs: 0, run: null } as TrialRecord;
  const summary = summarizeExperiment(cases,[legacy]);
  assert.equal(summary.arms[0].medianEndMs,null); assert.deepEqual(summary.recordVersions,["disposition-ablation/v1"]);
  assert.ok(summary.pairs.some((p) => p.arm === "adaptive-critique" && p.comparator === "adaptive-opus"));
  assert.equal(summary.arms[3].searchTiming,"frozen_passage_replay_excludes_live_search");
});

const priorityCase = (): ExperimentCase => ({ id: "migraine", message: fixtureRun().message, reference: {
  status: "development_expectation", provenance: "Authored routing-policy control, not physician adjudication", emergency: false,
  acceptedRoutes: ["ASYNC_PHYSICIAN"], acceptedOperationalRoutes: ["PRIORITY_ASYNC"],
  rationale: "An active usual migraine with exhausted medication requires time-sensitive clinician prescribing review.", policyVersion: ROUTING_POLICY_VERSION,
} });
test("five-route scoring detects priority errors that the legacy disposition hides", async () => {
  const cs = [priorityCase()], manifest = experimentManifest(cs,"five-route-fixture",1,"simulated");
  const rows = await runExperiment(cs,mkdtempSync(join(tmpdir(),"five-route-")),manifest,async (_input,arm) => {
    const run = fixtureRun(); run.profile = arm;
    if (arm === "base-opus") run.answer!.reviewPriority = "routine";
    if (arm === "adaptive-no-retrieval") run.answer!.reviewPriority = null;
    if (arm === "adaptive-opus") run.adaptive = { version: "fixture", mode: "fixture", plan: null, evidence };
    if (arm === "adaptive-critique") run.adaptive = { version: "fixture", mode: "fixture", plan: null, evidence };
    return run;
  });
  const report = summarizeExperiment(cs,rows,manifest);
  assert.equal(report.arms[0].acceptedRouteCoverage!.rate,0);
  assert.equal(report.arms[1].referenceOutcomes[1].operationalRouteCoverage.rate,0);
  assert.equal(report.arms[2].referenceOutcomes[1].operationalRouteCoverage.rate,1);
  assert.deepEqual(report.pairs[1].improved,["migraine/1"]);
  assert.equal(report.coverage.verifiedAgainstManifest,true);
});
test("a correct final route cannot conceal an incorrect early escalation", async () => {
  const cs = [priorityCase()], manifest = experimentManifest(cs,"early-fixture",1,"simulated");
  const rows = await runExperiment(cs,mkdtempSync(join(tmpdir(),"early-score-")),manifest,async (_input,arm) => {
    const run = fixtureRun(); run.profile = arm;
    run.responseEvents = [{ kind: "action", notice: { disposition: "EMERGENCY_NOW", directive: "Call 911 now for this refill.", source: "emergency_agent" }, elapsedMs: 10 }];
    return run;
  });
  const summary = summarizeExperiment(cs,rows,manifest).arms[0].referenceOutcomes[1];
  assert.equal(summary.operationalRouteCoverage.rate,1);
  assert.equal(summary.routeAndIssuedEscalationCoverage.rate,0);
  assert.equal(summary.falseEmergencyEscalation.rate,1);
});
test("a partial report retains every prespecified case-arm-trial slot", async () => {
  const cs = [priorityCase()], manifest = experimentManifest(cs,"partial-fixture",1,"simulated");
  const rows = await runExperiment(cs,mkdtempSync(join(tmpdir(),"partial-score-")),manifest,async (_input,arm) => { const run = fixtureRun(); run.profile = arm; return run; });
  const report = summarizeExperiment(cs,[rows[0]],manifest);
  assert.equal(report.coverage.planned,4); assert.equal(report.coverage.recorded,1); assert.equal(report.coverage.missing.length,3);
  assert.equal(report.arms[1].referenceOutcomes[1].operationalRouteCoverage.denominator,1);
  assert.equal(report.arms[1].referenceOutcomes[1].operationalRouteCoverage.rate,0);
  assert.equal(report.arms[1].medianEndMs,null); assert.equal(report.arms[1].plannedResultsMissing,1);
  assert.throws(() => summarizeExperiment(cs,[{ ...rows[0], durationMs: rows[0].durationMs! + 1 }],manifest),/SUMMARY_RECORD_MISMATCH/);
  assert.throws(() => summarizeExperiment(cs,[],{ ...manifest, repetitions: 0 }),/SUMMARY_MANIFEST_MISMATCH/);
  assert.throws(() => summarizeExperiment(cs,[{ ...rows[0], inputHash: "wrong" }]),/SUMMARY_INPUT_MISMATCH/);
  assert.throws(() => summarizeExperiment(cs,[rows[0],{ ...rows[1], execution: "provider" }]),/MIXED_EXECUTION/);
});
test("related cases suppress independent intervals and even-sample medians average the middle pair", () => {
  const cs = [priorityCase(),{ ...priorityCase(), id: "related", message: "A paraphrase of the same patient's migraine." }].map(c => ({ ...c, familyId: "same-episode" }));
  const rows = cs.map((c,i): TrialRecord => ({ version: "fixture", manifestHash: "fixture", recordHash: "fixture", eventCaptureFailure: false, failure: null, evidenceHash: null, id: c.id, inputHash: digest(c.message), trial: 1, arm: "base-opus", execution: "simulated", status: "recorded", executionState: "started", durationMs: i ? 300 : 100, responseEvents: [], run: fixtureRun() }));
  const report = summarizeExperiment(cs,rows).arms[0];
  assert.equal(report.medianEndMs,200);
  assert.equal(report.referenceOutcomes[1].operationalRouteCoverage.ci95,null);
  const duplicateInputs = cs.map(c => ({ ...c, familyId: c.id, message: cs[0].message }));
  const duplicateRows = rows.map(r => ({ ...r, inputHash: digest(cs[0].message) }));
  assert.equal(summarizeExperiment(duplicateInputs,duplicateRows).arms[0].acceptedRouteCoverage!.ci95,null);
});
test("operational reference contracts reject contradictory labels and unexplained priority", () => {
  const c = priorityCase(); assert.equal(parseExperimentCases(JSON.stringify(c)).length,1);
  assert.throws(() => parseExperimentCases(JSON.stringify({ ...c, reference: { ...c.reference, acceptedOperationalRoutes: ["EMERGENCY_NOW"] } })));
  assert.throws(() => parseExperimentCases(JSON.stringify({ ...c, reference: { ...c.reference, rationale: undefined } })));
  assert.throws(() => parseExperimentCases(JSON.stringify({ ...c, reference: { ...c.reference, acceptedOperationalRoutes: ["PRIORITY_ASYNC","PRIORITY_ASYNC"] } })));
});
