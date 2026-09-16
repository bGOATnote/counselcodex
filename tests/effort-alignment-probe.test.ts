import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeEffortPlan, validateEffortPlan, effortReservations, effortCost, scoreEffortProbe, EFFORT_CASES } from "../scripts/effort-alignment-probe.ts";
import { safeEvaluate } from "../scripts/routing-brief-study.ts";
import { sha256 } from "../src/evidence/rag/model.ts";
import type { ModelTransportResult } from "../src/disposition/transport.ts";

// No calls: imports, plan reconstruction, fixtures and replay are entirely local.
const plan = makeEffortPlan(), digest = (v: unknown) => sha256(JSON.stringify(v));
test("ten frozen cases, twenty paired first attempts; only effort differs", () => {
  validateEffortPlan(plan);
  assert.deepEqual(plan.cases.map(c => c.id), [...EFFORT_CASES]);
  assert.equal(plan.schedule.length, 20);
  assert.deepEqual(plan.schedule.slice(0, 4).map(s => s.arm), ["full", "brief", "brief", "full"]);
  assert.equal(plan.prompts.full, plan.prompts.brief);
  assert.deepEqual(plan.schemas.full, plan.schemas.brief);
  assert.deepEqual(plan.contracts, { full: "full", brief: "full" });
  assert.equal(plan.settings.maxOutputTokens, 4096);
  assert.deepEqual(plan.providerOptions, {
    full: { anthropic: { thinking: { type: "adaptive" }, effort: "low" } },
    brief: { anthropic: { thinking: { type: "adaptive" }, effort: "high" } },
  });
});
test("both arms use original full packets, no source substitution or gold/early leakage", () => {
  const prior = JSON.parse(readFileSync("outputs/task-ownership-ablation-2026-09-15/plan.json", "utf8"));
  for (const c of plan.cases) {
    const original = prior.cases.find((v: { id: string }) => v.id === c.id);
    assert.deepEqual(c.packets.full, original.packets.full);
    assert.deepEqual(c.packets.full, c.packets.brief);
    assert.equal(c.packetHashes.full, digest(c.packets.full));
    assert.equal(c.packetHashes.full, c.packetHashes.brief);
    assert.deepEqual(Object.keys(c.packets.full).sort(), ["context", "outputInstructions", "patient", "sources"]);
    assert.equal(plan.prompts.full, prior.prompts.full);
  }
  assert.ok(plan.cases.find(c => c.id === "C47")!.hits.some(h => h.document.id === "medlineplus:6055"));
});
test("altered settings, case order, prompt, gold input or budget fail pre-dispatch identity", () => {
  const changes = [
    (p: typeof plan) => { p.settings.maxOutputTokens++; },
    (p: typeof plan) => { p.prompts.brief += " More routing rules."; },
    (p: typeof plan) => { p.cases.reverse(); },
    (p: typeof plan) => { Object.assign(p.cases[0].packets.full, { acceptedRoutes: ["SELF_CARE"] }); },
    (p: typeof plan) => { p.schedule.pop(); },
    (p: typeof plan) => { p.budget.remainingUSD++; },
    (p: typeof plan) => { p.budget.exclusiveClaim += "-again"; },
  ];
  for (const change of changes) { const copy = structuredClone(plan); change(copy); assert.throws(() => validateEffortPlan(copy), /ONLY_EFFORT_CHANGE_ALLOWED/); }
});
test("all twenty worst-case reservations fit reconciled remaining money, not a new allowance", () => {
  const r = effortReservations(plan);
  assert.equal(Object.keys(r.pairs).length, 10);
  assert.ok(Math.abs(r.totalUSD - 12.892780) < 1e-9);
  assert.ok(Math.abs(plan.budget.priorAccountedAndReservedUSD - 75.937696) < 1e-9);
  assert.ok(Math.abs(plan.budget.remainingUSD - 14.062304) < 1e-9);
  for (const remainingUSD of [NaN, -1, r.totalUSD - .000001]) assert.throws(() => effortReservations({ ...plan, budget: { ...plan.budget, remainingUSD } }), /ALL_20_RESERVATIONS_MUST_FIT/);
});
test("invalid/unknown usage holds full reservation; known complete counts output including thinking", () => {
  for (const usage of [{ inputTokens: null, outputTokens: 12 }, { inputTokens: 5, outputTokens: null }, { inputTokens: -1, outputTokens: 3 }, { inputTokens: 1.5, outputTokens: 3 }])
    assert.deepEqual(effortCost({ usage } as ModelTransportResult, plan, .5), { baseUSD: null, accountedUSD: .5, reservationUSD: .5 });
  assert.deepEqual(effortCost({ usage: { inputTokens: 100, outputTokens: 4096 } } as ModelTransportResult, plan, .5), { baseUSD: .1029, accountedUSD: .1034, reservationUSD: .5 });
});
test("missing/interrupted/failed slots remain rows; coverage denominator is ten, not 49", () => {
  const dir = mkdtempSync(join(tmpdir(), "effort-probe-offline-"));
  const put = (name: string, value: unknown) => writeFileSync(join(dir, name), JSON.stringify(value));
  const r = effortReservations(plan), c = plan.cases[0], arm = "full", reserve = r.pairs[c.id].reservations[arm];
  try {
    put("plan.json", plan);
    const planned = scoreEffortProbe(dir);
    assert.equal(planned.rows.length, 20);
    assert.equal(planned.spend.currentAccountedAndOutstandingUSD, 0);
    assert.equal(planned.arms.full.agreementCoverage.denominator, 10);
    assert.equal(planned.arms.brief.agreementCoverage.denominator, 10);
    for (const c of plan.cases) put(`${c.id}-reservation.json`, r.pairs[c.id]);
    put(`${c.id}-${arm}-started.json`, { fingerprint: digest(plan), packetHash: c.packetHashes[arm], providerOptions: plan.providerOptions[arm], reservationUSD: reserve });
    const interrupted = scoreEffortProbe(dir);
    assert.equal(interrupted.arms.full.attempted, 1);
    assert.equal(interrupted.arms.full.providerComplete, 0);
    assert.ok(Math.abs(interrupted.spend.currentAccountedAndOutstandingUSD - r.totalUSD) < 1e-9);
    const execution = { output: null, failure: "MODEL_OR_SCHEMA_FAILURE", usage: { inputTokens: null, outputTokens: null } } as ModelTransportResult;
    put(`${c.id}-${arm}-result.json`, { execution, ...effortCost(execution, plan, reserve) });
    put(`${c.id}-${arm}-evaluation.json`, safeEvaluate(c, arm, execution, "full"));
    const failed = scoreEffortProbe(dir);
    assert.equal(failed.arms.full.agreement.denominator, 0);
    assert.equal(failed.unsafe_advice, "not_assessed");
    assert.equal(failed.claim_support, "not_assessed");
    assert.equal(failed.patientAdvicePublished, false);
    const tampered = safeEvaluate(c, arm, execution, "full"); tampered.eligibleRoutingProposal = true;
    put(`${c.id}-${arm}-evaluation.json`, tampered);
    assert.throws(() => scoreEffortProbe(dir), /EVALUATION_NOT_BOUND/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test("start effort and result cost tampering are detected independently of clinical scores", () => {
  const dir = mkdtempSync(join(tmpdir(), "effort-cost-binding-"));
  const put = (name: string, value: unknown) => writeFileSync(join(dir, name), JSON.stringify(value));
  const r = effortReservations(plan), c = plan.cases[0], reserve = r.pairs[c.id].reservations.full;
  const start = { fingerprint: digest(plan), packetHash: c.packetHashes.full, providerOptions: plan.providerOptions.full, reservationUSD: reserve };
  try {
    put("plan.json", plan); put(`${c.id}-reservation.json`, r.pairs[c.id]);
    put(`${c.id}-full-started.json`, { ...start, providerOptions: plan.providerOptions.brief });
    assert.throws(() => scoreEffortProbe(dir), /START_BINDING_CHANGED/);
    put(`${c.id}-full-started.json`, start);
    const execution = { output: null, failure: "MODEL_OR_SCHEMA_FAILURE", usage: { inputTokens: null, outputTokens: null } } as ModelTransportResult;
    put(`${c.id}-full-result.json`, { execution, baseUSD: 0, accountedUSD: 0, reservationUSD: reserve });
    assert.throws(() => scoreEffortProbe(dir), /RESULT_ACCOUNTING_CHANGED/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
