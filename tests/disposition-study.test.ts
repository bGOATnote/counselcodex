import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { makeDispositionStudyPlan, verifyDispositionStudyPlan, studyReservation, studyPairReservation, studyCost,
  canReserveStudyPair, writeStudyArtifact, verifyStudyClaim, executeStudyPair, evaluateDispositionStudy, scoreDispositionStudy,
  type DispositionStudyPlan } from "../scripts/disposition-study.ts";
import { sha256 } from "../src/evidence/rag/model.ts";
import type { ModelTransportResult } from "../src/disposition/transport.ts";

const read = (path: string): any => JSON.parse(readFileSync(path, "utf8"));
const plan = makeDispositionStudyPlan("2026-09-15T00:00:00Z");
const caseById = (id: string) => plan.cases.find(c => c.id === id)!;
const execution = (id = "C02"): ModelTransportResult => structuredClone(read(`outputs/task-ownership-ablation-2026-09-15/${id}-full-result.json`).execution);
const refingerprint = (changed: DispositionStudyPlan) => {
  const { fingerprint: _old, ...value } = changed; return { ...value, fingerprint: sha256(JSON.stringify(value)) };
};
function temporary() {
  const directory = mkdtempSync(join(tmpdir(), "disposition-study-offline-")), claims = join(directory, "test-claim");
  writeStudyArtifact(directory, "plan.json", plan); mkdirSync(claims);
  writeStudyArtifact(claims, "claim.json", { mission: plan.mission, fingerprint: plan.fingerprint, directory: resolve(directory), allocationUSD: 95 });
  return { directory, claims, close: () => rmSync(directory, { recursive: true, force: true }) };
}
function reserve(directory: string, id: string) { writeStudyArtifact(directory, `${id}-reservation.json`, studyPairReservation(plan, caseById(id))); }

test("fresh 100-slot plan preserves all 50 original packets; no gold or issued action enters producer input", () => {
  verifyDispositionStudyPlan(plan);
  assert.equal(plan.cases.length, 50); assert.equal(plan.schedule.length, 100);
  assert.equal(new Set(plan.schedule.map(s => `${s.id}-${s.arm}`)).size, 100);
  assert.equal(plan.settings.maxOutputTokens, 4096); assert.equal(plan.settings.maxRetries, 0);
  assert.equal(plan.settings.providerOptions.anthropic.effort, "low");
  assert.equal(plan.mission.ceilingUSD, 95); assert.equal(plan.mission.historicalPriorDeducted, false);
  assert.equal(plan.mission.historicalPriorUSD, 84.687986);
  assert.notDeepEqual(plan.schemas.baseline, plan.schemas.candidate);
  assert.match(plan.interpretation, /schema delta/);
  for (const c of plan.cases) {
    assert.equal(c.historyHash, sha256(readFileSync(c.path)));
    assert.deepEqual(Object.keys(c.packets.baseline).sort(), ["context", "outputInstructions", "patient", "sources"]);
    const { sourceApplicationRules: rules, ...same } = c.packets.candidate;
    assert.deepEqual(same, c.packets.baseline); assert.ok(rules);
    assert.equal(c.packets.baseline.patient, c.message);
    for (const key of ["acceptedRoutes", "reference", "issued", "expectedRoute", "originalDisposition"]) assert.equal(key in c.packets.candidate, false);
    assert.equal(c.packetHashes.baseline, sha256(JSON.stringify(c.packets.baseline)));
    assert.equal(c.packetHashes.candidate, sha256(JSON.stringify(c.packets.candidate)));
  }
});

test("recomputed fingerprints cannot bless missing freezes or changed contract, packet, schema or schedule", () => {
  const mutations = [
    (p: DispositionStudyPlan) => { delete p.files[Object.keys(p.files)[0]]; },
    (p: DispositionStudyPlan) => { p.cases[0].packets.baseline.patient += " changed"; },
    (p: DispositionStudyPlan) => { p.prompts.candidate += " changed"; },
    (p: DispositionStudyPlan) => { p.schemas.candidate = p.schemas.baseline; },
    (p: DispositionStudyPlan) => { p.schedule.pop(); },
    (p: DispositionStudyPlan) => { p.settings.maxOutputTokens = 2400; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(plan); mutate(changed);
    assert.throws(() => verifyDispositionStudyPlan(refingerprint(changed)), /CHANGED|SLOTS_REQUIRED/);
  }
});

test("whole-pair holds reconcile actual estimates without deducting historical exposure; unknown usage stays reserved", () => {
  const c = caseById("C02"), pair = studyPairReservation(plan, c);
  assert.equal(pair.pairUSD, pair.slots.baseline + pair.slots.candidate);
  assert.equal(pair.slots.candidate, studyReservation(plan, c, "candidate"));
  assert.equal(canReserveStudyPair(94, 1, 95), true);
  assert.equal(canReserveStudyPair(94, 1.0001, 95), false);
  assert.equal(canReserveStudyPair(NaN, 1, 95), false);
  const known = execution(); known.usage = { inputTokens: 1000, outputTokens: 1000 };
  assert.deepEqual(studyCost(known, plan, 1), { baseUSD: .03, accountedUSD: .035, reservationUSD: 1 });
  for (const inputTokens of [null, -1, NaN, Infinity, .1]) {
    const unknown = execution(); unknown.usage = { inputTokens, outputTokens: 1 };
    assert.deepEqual(studyCost(unknown, plan, 1), { baseUSD: null, accountedUSD: 1, reservationUSD: 1 });
  }
});

test("plan-only replay keeps fixed denominators and zero new spend", () => {
  const t = temporary();
  try {
    const report = scoreDispositionStudy(t.directory, t.claims);
    assert.equal(report.rows.length, 100);
    for (const arm of ["baseline", "candidate"]) {
      assert.equal(report.arms[arm].planned, 50); assert.equal(report.arms[arm].attempted, 0);
      assert.deepEqual(report.arms[arm].agreementCoverage, { numerator: 0, denominator: 49 });
      assert.equal(report.arms[arm].agreement.denominator, 0);
    }
    assert.equal(report.spend.accountedAndOutstandingUSD, 0); assert.equal(report.spend.remainingUSD, 95);
    assert.equal(report.clinical_correctness, "not_assessed"); assert.equal(report.patientAdvicePublished, false);
    assert.equal(report.unsupported_claims, "not_assessed"); assert.equal(report.unsafe_advice, "not_assessed");
  } finally { t.close(); }
});

test("dispatch failures retain their reservation and second-arm attempt; resume cannot reissue any start", async () => {
  const t = temporary(); let calls = 0;
  try {
    reserve(t.directory, "C02");
    await executeStudyPair(plan, caseById("C02"), t.directory, async () => { if (++calls === 1) throw new Error("offline injected provider failure"); return execution(); });
    assert.equal(calls, 2);
    await executeStudyPair(plan, caseById("C02"), t.directory, async () => { calls++; return execution(); });
    assert.equal(calls, 2);
    const report = scoreDispositionStudy(t.directory, t.claims);
    const failed = report.rows.find(r => r.id === "C02" && r.result?.execution.failure)!;
    assert.equal(failed.evaluation?.failure, "DISPATCH_EXCEPTION_RESULT_RETAINED");
    assert.equal(failed.result.baseUSD, null); assert.equal(failed.result.accountedUSD, failed.result.reservationUSD);
    assert.equal(report.spend.unknownUsageRows, 1);
    assert.equal(report.rows.filter(r => r.id === "C02" && r.attempted).length, 2);
    reserve(t.directory, "C03");
    await executeStudyPair(plan, caseById("C03"), t.directory, async () => { calls++; return execution(); });
    assert.equal(calls, 4, "later case still executes after the retained provider failure");
  } finally { t.close(); }
});

test("started slot without result stays outstanding, not silently retried", async () => {
  const t = temporary(); let calls = 0;
  try {
    const c = caseById("C01"), pair = studyPairReservation(plan, c); reserve(t.directory, c.id);
    writeStudyArtifact(t.directory, "C01-baseline-started.json", { fingerprint: plan.fingerprint, packetHash: c.packetHashes.baseline,
      promptHash: plan.promptHashes.baseline, reservationUSD: pair.slots.baseline, attempt: "first_attempt" });
    await executeStudyPair(plan, c, t.directory, async () => { calls++; return execution(); });
    assert.equal(calls, 1);
    const report = scoreDispositionStudy(t.directory, t.claims), row = report.rows.find(r => r.id === "C01" && r.arm === "baseline")!;
    assert.equal(row.attempted, true); assert.equal(row.result, null); assert.equal(row.evaluation, null);
    assert.equal(row.journalStatus, "started_without_result");
    assert.equal(report.arms.baseline.journalStatus.started_without_result, 1);
    assert.ok(report.spend.accountedAndOutstandingUSD >= pair.slots.baseline);
    await executeStudyPair(plan, c, t.directory, async () => { calls++; return execution(); }); assert.equal(calls, 1);
  } finally { t.close(); }
});

test("C25 remains in raw/parsed completion and costs but never reference agreement", async () => {
  const t = temporary();
  try {
    reserve(t.directory, "C25");
    await executeStudyPair(plan, caseById("C25"), t.directory, async () => execution("C25"));
    const report = scoreDispositionStudy(t.directory, t.claims), rows = report.rows.filter(r => r.id === "C25");
    assert.equal(rows.length, 2);
    for (const r of rows) { assert.equal(r.evaluation?.providerComplete, true); assert.equal(r.referenceExcluded, true);
      assert.equal(r.agreement, null); assert.equal(r.rawAgreement, null); assert.equal(r.rawDeviation, null); }
    assert.ok(report.spend.accountedAndOutstandingUSD > 0);
    for (const arm of ["baseline", "candidate"]) { assert.equal(report.arms[arm].providerComplete, 1); assert.equal(report.arms[arm].agreementCoverage.denominator, 49); }
  } finally { t.close(); }
});

test("raw route remains diagnostic through wire/quote failure, without claimed clinical completion", () => {
  const bad = execution(); (bad.output as any).citations[0].quoteId = "q99999";
  const row = evaluateDispositionStudy(caseById("C02"), "baseline", bad);
  assert.equal(row.failure, "WIRE_SCHEMA_OR_QUOTE_REFERENCE_FAILED");
  assert.deepEqual(row.parseFailure, { stage: "source_quote_reference", code: "INVALID_SOURCE_QUOTE_REFERENCE", issues: [] });
  assert.equal(row.rawRoute, "EMERGENCY_NOW"); assert.equal(row.parsedRoute, null);
  assert.equal(row.providerComplete, true); assert.equal(row.eligibleExperimentalResponse, false);
  assert.equal(row.claim_support, "not_assessed"); assert.equal(row.clinicalApproval, false);
  assert.equal(row.unsupported_claims, "not_assessed"); assert.equal(row.unsafe_advice, "not_assessed");
});

test("unstarted reservations and result-without-evaluation remain explicit, with costs held", async () => {
  const t = temporary();
  try {
    const c = caseById("C02"), pair = studyPairReservation(plan, c); reserve(t.directory, c.id);
    const before = scoreDispositionStudy(t.directory, t.claims);
    assert.equal(before.arms.baseline.journalStatus.unstarted_reserved, 1);
    assert.equal(before.arms.candidate.journalStatus.unstarted_reserved, 1);
    assert.equal(before.spend.accountedAndOutstandingUSD, pair.pairUSD);
    writeStudyArtifact(t.directory, "C02-baseline-started.json", { fingerprint: plan.fingerprint, packetHash: c.packetHashes.baseline,
      promptHash: plan.promptHashes.baseline, reservationUSD: pair.slots.baseline });
    const value = execution(); writeStudyArtifact(t.directory, "C02-baseline-result.json", { execution: value, ...studyCost(value, plan, pair.slots.baseline) });
    const middle = scoreDispositionStudy(t.directory, t.claims);
    assert.equal(middle.arms.baseline.journalStatus.result_without_evaluation, 1);
    assert.equal(middle.arms.baseline.parsed, 0);
    let calls = 0;
    await executeStudyPair(plan, c, t.directory, async () => { calls++; return execution(); });
    assert.equal(calls, 1, "saved result is evaluated locally, never dispatched again");
    const after = scoreDispositionStudy(t.directory, t.claims);
    assert.equal(after.arms.baseline.journalStatus.evaluated, 1);
    assert.equal(after.arms.candidate.journalStatus.evaluated, 1);
  } finally { t.close(); }
});

test("structural parse failure and missing original-patient quote have different diagnostics", () => {
  const structural = execution(); (structural.output as any).sourceApplications = [{ citationIndex: -1 }];
  const invalid = evaluateDispositionStudy(caseById("C02"), "candidate", structural);
  assert.equal(invalid.parseFailure?.stage, "wire_schema"); assert.equal(invalid.parseFailure?.code, "STRUCTURAL_SCHEMA_INVALID");
  assert.ok(invalid.parseFailure?.issues.length);
  const unbound = execution(); (unbound.output as any).sourceApplications = [{ citationIndex: 0, ruleId: "test",
    use: "patient_application", conditions: [{ conditionId: "test", state: "reported_met", patientQuotes: ["Not present in the original patient."] }] }];
  const absent = evaluateDispositionStudy(caseById("C02"), "candidate", unbound);
  assert.equal(absent.parseFailure?.stage, "patient_quote_reference");
  assert.equal(absent.parseFailure?.code, "APPLICATION_PATIENT_QUOTE_MISSING_OR_AMBIGUOUS");
  assert.equal(absent.eligibleExperimentalResponse, false); assert.equal(absent.rawRoute, "EMERGENCY_NOW");
});

test("candidate missing contracted application binds fail candidate only; core full response still parses", () => {
  const a = evaluateDispositionStudy(caseById("C32"), "baseline", execution("C32"));
  const b = evaluateDispositionStudy(caseById("C32"), "candidate", execution("C32"));
  assert.equal(a.failure, null); assert.equal(b.failure, null);
  assert.deepEqual(a.output, b.output); assert.deepEqual(b.sourceApplications, []);
  assert.equal(a.applicationAudit?.status, "fail"); assert.equal(b.applicationAudit?.status, "fail");
  assert.equal(a.applicationBlocked, false); assert.equal(b.applicationBlocked, true);
  assert.equal(b.eligibleExperimentalResponse, false);
});

test("local evaluator exception is retained with raw output, and does not cancel the other slot", async () => {
  const t = temporary(); let calls = 0;
  try {
    reserve(t.directory, "C02");
    const c = structuredClone(caseById("C02"));
    Object.defineProperty(c, "guidance", { get: () => { throw new Error("offline injected evaluator failure"); } });
    await executeStudyPair(plan, c, t.directory, async () => { calls++; return execution(); });
    assert.equal(calls, 2);
    for (const arm of ["baseline", "candidate"]) {
      const evaluation = read(join(t.directory, `C02-${arm}-evaluation.json`));
      assert.equal(evaluation.localEvaluationFailure, "LOCAL_EVALUATOR_FAILURE_RESULT_RETAINED");
      assert.equal(evaluation.rawRoute, "EMERGENCY_NOW"); assert.ok(evaluation.output);
      assert.equal(evaluation.eligibleExperimentalResponse, false);
    }
  } finally { t.close(); }
});

test("own claim, stored evaluation, raw result costs and starts cannot detach from their plan", async () => {
  const t = temporary();
  try {
    assert.doesNotThrow(() => verifyStudyClaim(plan, t.directory, t.claims));
    assert.throws(() => verifyStudyClaim(plan, t.directory, join(t.directory, "absent")), /MISSION_CLAIM_CHANGED/);
    reserve(t.directory, "C02"); await executeStudyPair(plan, caseById("C02"), t.directory, async () => execution());
    const artifacts = [
      [join(t.claims, "claim.json"), (v: any) => { v.fingerprint = "different"; }, /MISSION_CLAIM_CHANGED/],
      [join(t.directory, "C02-baseline-started.json"), (v: any) => { v.packetHash = "different"; }, /START_BINDING_CHANGED/],
      [join(t.directory, "C02-baseline-result.json"), (v: any) => { v.accountedUSD = 0; }, /RESULT_ACCOUNTING_CHANGED/],
      [join(t.directory, "C02-baseline-evaluation.json"), (v: any) => { v.eligibleExperimentalResponse = !v.eligibleExperimentalResponse; }, /EVALUATION_CHANGED/],
    ] as const;
    for (const [path, mutate, error] of artifacts) {
      const original = readFileSync(path, "utf8"), changed = JSON.parse(original); mutate(changed);
      writeFileSync(path, JSON.stringify(changed)); assert.throws(() => scoreDispositionStudy(t.directory, t.claims), error);
      writeFileSync(path, original); // Temp fixture only; real artifacts remain append-only.
    }
    assert.doesNotThrow(() => scoreDispositionStudy(t.directory, t.claims));
    assert.throws(() => writeStudyArtifact(t.directory, "plan.json", plan), /EEXIST/);
  } finally { t.close(); }
});
