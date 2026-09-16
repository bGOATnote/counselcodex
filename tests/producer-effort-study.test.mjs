import nodeTest from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { makePlan, validatePlan, claimPlan, costFor, reservationFor, summarize, providerOptions, allocationUSD, maximumCalls, contingencyMultiplier } from "../scripts/producer-effort-study.ts";
import { GRAPH_INSTRUCTIONS, graphJudgeInstructions } from "../src/disposition/graph-prompts.ts";
import { wireDraftSchema, graphJudgeSchema, GRAPH_OUTPUT_LIMITS, GRAPH_VERSION } from "../src/disposition/clinical-graph.ts";
import { sha256 } from "../src/evidence/rag/model.ts";

const digest = value => sha256(JSON.stringify(value));
const frozenV22 = GRAPH_VERSION === "evidence-graph/v22";
const plan = frozenV22 ? makePlan() : null;
const test = (name, fn) => nodeTest(name, { skip: !frozenV22 && "Replay this frozen study in its recorded v22 source archive; never reinterpret its historical packets." }, fn);
nodeTest("effort study refuses historical reconstruction under a newer runtime", () => {
  if (!frozenV22) assert.throws(() => makePlan(), /V22_PROMPT_SCHEMA_DRIFT/);
});

test("effort study reconstructs six archived v22 first-attempt packets without importing final repaired answers", () => {
  assert.deepEqual(plan.cases.map(c => c.id), ["C30", "C02", "C50", "activeEMS", "C04", "C01"]);
  for (const c of plan.cases) {
    assert.match(c.runPath, /^outputs\/continuation-gui-2026-09-14\/capture-end8\/runs\//);
    assert.equal(c.producerPacketHash, digest(c.producerPacket));
    assert.equal(c.judgePacketHash, digest(c.historical.firstJudgePacket));
    assert.equal(c.judgePacketHash, c.historical.firstJudge.reviewInputBinding.packetHash);
    assert.equal(c.patientHash, sha256(c.patient));
    assert.deepEqual(c.producerPacket.context, c.context);
    assert.equal(c.producerPacket.sources.length, c.hits.length);
    assert.ok(c.producerPacket.sources.every(s => s.quoteSpans.length > 0));
    assert.match(c.verification.provenance, /not an originally captured producer HTTP body/);
    assert.equal(c.verification.originalWireQuoteRoundtrip, true);
  }
  assert.match(plan.cases.find(c => c.id === "C01").actor, /unattributed/);
  assert.equal(plan.cases.filter(c => c.verification.priorProducerReconstructionHashAvailable).length, 4);
});

test("only Opus effort differs; both two-trial schedules freeze full prompts, schemas and provider option hashes", () => {
  assert.equal(plan.schedule.length, 24); assert.equal(maximumCalls, 48);
  assert.equal(plan.prompts.producer, GRAPH_INSTRUCTIONS.disposition);
  assert.equal(plan.prompts.judge, graphJudgeInstructions("full"));
  assert.deepEqual(plan.schemas.producer, wireDraftSchema.toJSONSchema());
  assert.deepEqual(plan.schemas.judge, graphJudgeSchema.toJSONSchema());
  assert.equal(plan.settings.producerMaxOutputTokens, GRAPH_OUTPUT_LIMITS.disposition);
  assert.equal(plan.settings.judgeMaxOutputTokens, GRAPH_OUTPUT_LIMITS.judge);
  assert.equal(plan.settings.maxRetries, 0); assert.equal(plan.settings.maxSteps, 1);
  assert.deepEqual(providerOptions("producer", "medium"), { anthropic: { thinking: { type: "adaptive" }, effort: "medium" } });
  assert.deepEqual(providerOptions("judge", "low"), providerOptions("judge", "medium"));
  for (const c of plan.cases) {
    const slots = plan.schedule.filter(s => s.id === c.id);
    assert.equal(slots.length, 4);
    assert.deepEqual(slots.slice(0, 2).map(s => s.arm), slots.slice(2).map(s => s.arm).reverse());
    assert.deepEqual(slots.map(s => s.trial), [1, 1, 2, 2]);
    for (const s of slots) {
      assert.deepEqual(s.producerProviderOptions, providerOptions("producer", s.arm));
      assert.equal(s.producerProviderOptionsHash, digest(s.producerProviderOptions));
      assert.equal(s.judgeProviderOptionsHash, digest(s.judgeProviderOptions));
    }
  }
});

test("tampering fails closed even when an edited manifest is rehashed", () => {
  const frozen = { ...plan, fingerprint: digest(plan) };
  assert.deepEqual(validatePlan(frozen), plan);
  for (const mutate of [
    p => { p.authorization.allocationUSD = 26; },
    p => { p.schedule[0].producerProviderOptions.anthropic.effort = "high"; },
    p => { p.prompts.producer += " altered"; },
    p => { p.cases[0].producerPacket.context = null; },
    p => { p.schemas.producer.required.reverse(); },
  ]) {
    const changed = structuredClone(plan); mutate(changed);
    assert.throws(() => validatePlan({ ...changed, fingerprint: digest(changed) }), /FROZEN_STUDY_DRIFT/);
  }
});

test("allocation is inclusive of contingency and unknown or malformed usage cannot create credit", () => {
  assert.equal(allocationUSD, 25); assert.equal(contingencyMultiplier, 1.25);
  assert.equal(costFor({ inputTokens: 100, outputTokens: 20 }, "producer"), 0.001);
  assert.equal(costFor({ inputTokens: 100, outputTokens: 20 }, "judge"), 0.002);
  for (const value of [null, -1, Infinity, NaN]) assert.equal(costFor({ inputTokens: value, outputTokens: 10 }, "producer"), null);
  for (const c of plan.cases) {
    const reserved = reservationFor(plan, "producer", c.producerPacket);
    assert.ok(reserved > 0.1 && reserved < 1);
    assert.equal(reserved, reservationFor(plan, "producer", structuredClone(c.producerPacket)));
    assert.ok(reservationFor(plan, "judge", c.historical.firstJudgePacket) > reserved);
  }
  assert.equal(plan.authorization.allocationUSD, 25);
  assert.doesNotMatch(plan.authorization.reference, /\$40|\$20|remaining balance/);
});

test("single-use hash claim rejects wrong hashes and copied plans without touching the real ledger", () => {
  const root = mkdtempSync(join(tmpdir(), "producer-effort-claim-")), marker = join(root, "consumed.json"), fingerprint = digest(plan);
  const first = join(root, "first"), second = join(root, "copy");
  for (const dir of [first, second]) { mkdirSync(dir); writeFileSync(join(dir, "manifest.json"), JSON.stringify({ ...plan, fingerprint })); }
  assert.throws(() => claimPlan(first, plan, fingerprint, "wrong", marker), /MANIFEST_HASH/);
  assert.equal(existsSync(marker), false);
  claimPlan(first, plan, fingerprint, fingerprint, marker);
  assert.equal(existsSync(join(first, "live-claim.json")), true);
  assert.throws(() => claimPlan(first, plan, fingerprint, fingerprint, marker), /ALREADY_USED/);
  assert.throws(() => claimPlan(second, plan, fingerprint, fingerprint, marker), /ALLOCATION_ALREADY_CLAIMED/);
  assert.deepEqual(readdirSync(second), ["manifest.json"]);
});

test("paired summaries retain all planned denominators, incomplete trials and distinct clinical support outcomes", () => {
  const c = plan.cases[0];
  const base = { id: c.id, runId: c.runId, trial: 1, arm: "low", route: null, status: "failed", producerMs: 100, judgeMs: null, totalMs: null, pairWallMs: 100, validDraft: false, exactSourceQuotes: null, patientGrounding: null, claimSupport: null, validJudge: false, judgeAccepted: false, releaseEligible: false, failure: "PROVIDER_RATE_LIMITED", judgeSkipped: "No valid new first draft" };
  const candidate = { ...base, arm: "medium", validDraft: true, validJudge: true, judgeAccepted: false, releaseEligible: false, producerMs: 200, judgeMs: 300, totalMs: 500, exactSourceQuotes: true, patientGrounding: "pass", claimSupport: "fail" };
  const result = summarize(plan, [base, candidate], 3, 0.3, null);
  assert.equal(result.byArm.low.plannedProducerAttempts, 12); assert.equal(result.byArm.medium.plannedProducerAttempts, 12);
  assert.equal(result.missingSchedule.length, 22); assert.equal(result.pairs.length, 12);
  assert.equal(result.pairs[0].totalDeltaMs, null); assert.equal(result.pairs[0].producerDeltaMs, null);
  assert.equal(result.pairs[0].observedProducerDeltaMs, 100);
  assert.equal(result.byArm.low.validProducerAndJudgeCount, 0);
  assert.equal(result.byArm.medium.validProducerAndJudgeCount, 1);
  assert.equal(result.byArm.medium.patientGroundingPass, 1); assert.equal(result.byArm.medium.claimSupportPass, 0);
  assert.equal(result.byArm.medium.releaseEligible, 0); assert.equal(result.runtimePromotion, "not_promoted");
  assert.equal(result.clinicalApproval, false); assert.equal(result.remainingInclusiveUSD, 24.7);
  assert.throws(() => summarize(plan, [base, base], 2, 0, null), /DUPLICATE/);
  assert.throws(() => summarize(plan, [{ ...base, runId: "wrong" }], 1, 0, null), /BINDING/);
});

test("plan CLI is keyless and zero-spend; it refuses reused directories and live without hash approval", () => {
  const directory = mkdtempSync(join(tmpdir(), "producer-effort-plan-")), output = join(directory, "plan");
  const run = (...args) => spawnSync(process.execPath, ["--experimental-strip-types", "scripts/producer-effort-study.ts", ...args], { encoding: "utf8", timeout: 15000, env: { ...process.env, OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", MASTRA_TELEMETRY_DISABLED: "true" } });
  const planned = run("--plan", `--output=${output}`);
  assert.equal(planned.status, 0, planned.stderr); assert.match(planned.stdout, /"paidCalls":0/);
  const manifest = JSON.parse(readFileSync(join(output, "manifest.json"), "utf8"));
  assert.equal(manifest.fingerprint, digest(validatePlan(manifest)));
  assert.notEqual(run("--plan", `--output=${output}`).status, 0);
  const unapproved = run("--live", `--output=${output}`);
  assert.notEqual(unapproved.status, 0); assert.match(unapproved.stderr, /EXPLICIT_MANIFEST_HASH_CLAIM_REQUIRED/);
  assert.deepEqual(readdirSync(output), ["manifest.json"]);
});
