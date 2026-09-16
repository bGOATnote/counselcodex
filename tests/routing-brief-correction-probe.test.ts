import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeCorrectionPlan, validateCorrectionPlan, correctionReservations, evaluateCorrection, CORRECTION_CASES } from "../scripts/routing-brief-correction-probe.ts";
import { effortCost } from "../scripts/effort-alignment-probe.ts";
import { readPhysicianReference } from "../src/evaluation/physician-cohort.ts";
import type { ModelTransportResult } from "../src/disposition/transport.ts";

// This suite consumes frozen local study artifacts, never a model endpoint.
test("eight paired identical patient/evidence inputs, never gold or early routes", () => {
  const plan = makeCorrectionPlan(); validateCorrectionPlan(plan);
  assert.deepEqual(plan.cases.map(c => c.id), [...CORRECTION_CASES]);
  assert.equal(plan.schedule.length, 16);
  for (const c of plan.cases) {
    assert.deepEqual(c.packets.full, c.packets.brief);
    assert.deepEqual(Object.keys(c.packets.full).sort(), ["context", "patient", "sources"]);
    assert.equal(c.packets.full.patient, c.message);
    assert.equal(c.packetHashes.full, c.packetHashes.brief);
    assert.equal(plan.schedule.filter(s => s.id === c.id).length, 2);
  }
  const reference = readPhysicianReference(readFileSync("data/evaluation/physician-system-reference-v2.json", "utf8"), readFileSync("data/patient_messages.csv", "utf8"));
  assert.equal(plan.cases.filter(c => reference.cases.find(r => r.id === c.id)?.reference.acceptedRoutes != null).length, 8);
  assert.deepEqual(plan.settings.providerOptions, { anthropic: { thinking: { type: "adaptive" }, effort: "low" } });
  assert.equal(plan.settings.maxOutputTokens, 2400);
  assert.equal(plan.settings.maxRetries, 0);
});
test("all sixteen reservations fit reconciled mission balance, not a new allowance", () => {
  const plan = makeCorrectionPlan(), reserved = correctionReservations(plan);
  assert.equal(plan.budget.missionCeilingUSD, 90);
  assert.ok(Math.abs(plan.budget.priorAccountedAndReservedUSD - 80.283186) < 1e-8);
  assert.ok(Math.abs(reserved.totalUSD - 9.5577) < 1e-8);
  assert.ok(reserved.totalUSD < plan.budget.remainingUSD);
  assert.throws(() => correctionReservations({ ...plan, budget: { ...plan.budget, remainingUSD: reserved.totalUSD - .0001 } }), /ALL_16/);
});
test("frozen protocol rejects changed prompt, budget, packet and schedule", () => {
  const plan = makeCorrectionPlan();
  for (const changed of [
    { ...plan, prompts: { ...plan.prompts, brief: plan.prompts.brief + " changed" } },
    { ...plan, budget: { ...plan.budget, remainingUSD: 99 } },
    { ...plan, schedule: plan.schedule.slice(1) },
    { ...plan, cases: plan.cases.map((c, i) => i ? c : { ...c, packets: { ...c.packets, full: { ...c.packets.full, patient: "different patient" } } }) },
  ]) assert.throws(() => validateCorrectionPlan(changed), /FROZEN_CORRECTION_CHANGED/);
});
test("HTTP and malformed outputs remain failed rows; next valid result evaluates", () => {
  const plan = makeCorrectionPlan(), c = plan.cases[0];
  const saved = JSON.parse(readFileSync("outputs/routing-brief-network-replication-2026-09-15/C02-brief-result.json", "utf8")).execution as ModelTransportResult;
  const malformed = evaluateCorrection(c, "brief", { ...saved, output: { disposition: "EMERGENCY_NOW" } });
  assert.equal(malformed.failure, "WIRE_SCHEMA_OR_QUOTE_REFERENCE_FAILED");
  assert.equal(malformed.providerComplete, true);
  assert.equal(malformed.eligibleRoutingProposal, false);
  const failed = evaluateCorrection(c, "brief", { ...saved, failure: "PROVIDER_FAILURE", output: null });
  assert.equal(failed.failure, "PROVIDER_FAILURE");
  assert.equal(failed.output, null);
  assert.equal(failed.unsafe_advice, "not_assessed");
  assert.equal(evaluateCorrection(c, "brief", saved).eligibleRoutingProposal, true);
});
test("v2 never silently fixes invalid citations or symptom activation quotations", () => {
  const plan = makeCorrectionPlan();
  for (const id of ["C14", "C17", "C31"]) {
    const c = plan.cases.find(c => c.id === id)!;
    const saved = JSON.parse(readFileSync(`outputs/routing-brief-network-replication-2026-09-15/${id}-brief-result.json`, "utf8")).execution;
    const row = evaluateCorrection(c, "brief", saved);
    assert.equal(row.eligibleRoutingProposal, false, id);
    if (id === "C17") assert.equal(row.failure, "WIRE_SCHEMA_OR_QUOTE_REFERENCE_FAILED");
    else assert.ok(row.proposal?.failures.includes("unexpected_activation_quote"));
    if (id === "C31") assert.ok(row.proposal?.failures.includes("issued_care_conflict"));
  }
});
test("three valid citations survive only as a proposal, not semantic approval", () => {
  const plan = makeCorrectionPlan(), c = plan.cases.find(c => c.id === "C32")!;
  const saved = JSON.parse(readFileSync("outputs/routing-brief-network-replication-2026-09-15/C32-brief-result.json", "utf8")).execution;
  assert.equal(evaluateCorrection(c, "full", saved).eligibleRoutingProposal, false);
  const row = evaluateCorrection(c, "brief", saved);
  assert.equal(row.eligibleRoutingProposal, true);
  assert.equal(row.citationCount, 3);
  assert.equal(row.presentation?.citationsWithinTarget, false);
  assert.equal(row.claim_support, "not_assessed");
  assert.equal(row.fullResponseGateReplay, null);
  assert.equal(row.clinicalApproval, false);
});
test("unknown or invalid usage keeps its reservation even when transport failed", () => {
  const plan = makeCorrectionPlan();
  const execution = JSON.parse(readFileSync("outputs/routing-brief-network-replication-2026-09-15/C02-brief-result.json", "utf8")).execution;
  for (const inputTokens of [null, -1, 1.5, Number.NaN]) {
    const result = effortCost({ ...execution, usage: { inputTokens, outputTokens: 100 } }, plan as never, .6);
    assert.equal(result.accountedUSD, .6); assert.equal(result.baseUSD, null);
  }
});
