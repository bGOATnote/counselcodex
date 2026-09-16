import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { makePlan, validatePlan, packetArtifact, claimPlan, costFor, reservationFor, summarize, evaluateRaw, providerOptions, allocationUSD, maximumCalls, contingencyMultiplier } from "../scripts/judge-span-study.ts";
import { graphJudgeInstructions } from "../src/disposition/graph-prompts.ts";
import { graphJudgeSchema, GRAPH_VERSION } from "../src/disposition/clinical-graph.ts";
import { judgeSpanAliases, JUDGE_SPAN_INSTRUCTIONS, restoreJudgeSpanUnits } from "../src/disposition/graph-judge-span-contract.ts";
import { sha256 } from "../src/evidence/rag/model.ts";
const digest = value => sha256(JSON.stringify(value));
const frozenV22 = GRAPH_VERSION === "evidence-graph/v22";
const plan = frozenV22 ? makePlan() : null;
const fixedTest = (name, fn) => test(name, { skip: !frozenV22 && "Run this study's tests in its recorded frozen v22 tree; current runtime must not reinterpret v22 packets." }, fn);

test("study refuses newer runtime instead of silently rebuilding historical packets", () => {
  if (!frozenV22) assert.throws(() => makePlan(), /FROZEN_V22_RUNTIME_REQUIRED/);
});

fixedTest("four original first-review packets retain exact bindings and historical negative reviews outside prompts", () => {
  assert.deepEqual(plan.cases.map(c => c.id), ["C07", "C22", "C12", "C02"]);
  for (const c of plan.cases) {
    assert.equal(c.reviewInputBinding.packetHash, digest(c.packet));
    assert.equal(c.reviewInputBinding.draftHash, digest(c.draft));
    assert.equal(c.spanPacketHash, digest(c.spanPacket));
    assert.deepEqual(restoreJudgeSpanUnits(c.spanPacket), c.packet.units);
    assert.equal(c.diagnostics.lossless, true); assert.ok(c.diagnostics.overheadRatio < 1.4);
    assert.equal(c.historical.firstJudge.reviewInputBinding.packetHash, digest(c.packet));
    assert.equal("historical" in c.packet, false); assert.equal("historical" in c.spanPacket, false);
    assert.equal("firstJudge" in c.spanPacket, false);
  }
  assert.equal(plan.cases.find(c => c.id === "C12").historical.firstJudge.output.verdict, "accept");
  for (const id of ["C07", "C22"]) {
    const c = plan.cases.find(c => c.id === id);
    assert.equal(c.historical.firstJudge.failure, "JUDGE_CONTRACT_FAILED");
    assert.equal(c.historical.firstJudge.rawOutput.verdict, "revise");
    assert.equal(c.historical.diagnostics.runtimeContractConformant, false);
  }
  assert.equal(plan.cases.find(c => c.id === "C02").historical.firstJudge.output.verdict, "revise");
});

fixedTest("only serialization changes; both arms use full judge standards and matched two-trial settings", () => {
  assert.equal(plan.schedule.length, 16); assert.equal(maximumCalls, 16);
  assert.equal(plan.prompts.original, graphJudgeInstructions("full"));
  assert.equal(plan.prompts.span, `${plan.prompts.original}\n\n${JUDGE_SPAN_INSTRUCTIONS}`);
  assert.deepEqual(plan.schemas.original, graphJudgeSchema.toJSONSchema());
  assert.deepEqual(providerOptions, { openai: { reasoningEffort: "low" } });
  assert.equal(plan.settings.maxRetries, 0); assert.equal(plan.settings.maxSteps, 1);
  for (const c of plan.cases) {
    const s = plan.schedule.filter(s => s.id === c.id);
    assert.deepEqual(s.map(s => s.trial), [1, 1, 2, 2]);
    assert.deepEqual(s.slice(0, 2).map(s => s.arm), s.slice(2).map(s => s.arm).reverse());
  }
});

fixedTest("rehashed manifest tampering cannot alter packets, schemas, prompts, schedule, models or allocation", () => {
  assert.deepEqual(validatePlan({ ...plan, fingerprint: digest(plan) }), plan);
  for (const mutate of [p => { p.authorization.allocationUSD = 9; }, p => { p.prompts.original += " extra"; }, p => { p.settings.providerOptions.openai.reasoningEffort = "high"; }, p => { p.cases[0].packet.units[0].text += " new"; }, p => { p.schemas.span.required.reverse(); }, p => { p.schedule.reverse(); }]) {
    const p = structuredClone(plan); mutate(p);
    assert.throws(() => validatePlan({ ...p, fingerprint: digest(p) }), /FROZEN_STUDY_DRIFT/);
  }
});

fixedTest("eight-dollar allocation includes contingency and unknown usage never creates credit", () => {
  assert.equal(allocationUSD, 8); assert.equal(contingencyMultiplier, 1.25);
  assert.equal(costFor({ inputTokens: 100, outputTokens: 20 }), 0.002);
  for (const n of [null, -1, NaN, Infinity]) assert.equal(costFor({ inputTokens: n, outputTokens: 20 }), null);
  for (const c of plan.cases) for (const arm of ["original", "span"]) {
    const packet = arm === "original" ? c.packet : c.spanPacket;
    assert.ok(reservationFor(plan, arm, packet) > 0 && reservationFor(plan, arm, packet) < allocationUSD);
  }
});

fixedTest("live claim requires immutable packet files, completed effort study and single-use inclusive allocation", () => {
  const root = mkdtempSync(join(tmpdir(), "judge-span-claim-")), marker = join(root, "consumed.json"), completion = join(root, "effort-summary.json");
  function prepare(name) { const directory = join(root, name); mkdirSync(directory); writeFileSync(join(directory, "manifest.json"), JSON.stringify({ ...plan, fingerprint: digest(plan) })); for (const c of plan.cases) writeFileSync(join(directory, `${c.id}-packets.json`), JSON.stringify(packetArtifact(plan, c.id))); return directory; }
  const dir = prepare("first"), other = prepare("copy"), fingerprint = digest(plan);
  assert.throws(() => claimPlan(dir, plan, fingerprint, "wrong", marker, completion), /HASH_CLAIM/);
  assert.throws(() => claimPlan(dir, plan, fingerprint, fingerprint, marker, completion), /WAIT_FOR_EFFORT/);
  assert.equal(existsSync(marker), false);
  writeFileSync(completion, JSON.stringify({ protocol: "producer-effort-fixed-packet/v1", plannedCalls: 48, calls: 48, rows: [] }));
  const firstPacketPath = join(dir, "C07-packets.json"), originalBytes = readFileSync(firstPacketPath);
  writeFileSync(firstPacketPath, JSON.stringify({ ...packetArtifact(plan, "C07"), spanPacketHash: "tampered" }));
  assert.throws(() => claimPlan(dir, plan, fingerprint, fingerprint, marker, completion), /PACKET_ARTIFACT/);
  writeFileSync(firstPacketPath, originalBytes);
  claimPlan(dir, plan, fingerprint, fingerprint, marker, completion);
  assert.equal(existsSync(marker), true);
  assert.throws(() => claimPlan(dir, plan, fingerprint, fingerprint, marker, completion), /ALREADY_USED/);
  assert.throws(() => claimPlan(other, plan, fingerprint, fingerprint, marker, completion), /ALLOCATION_ALREADY_CLAIMED/);
  assert.equal(readdirSync(other).length, 5);
});

fixedTest("valid negative reviews are retained as revise, not transformed into clinical approval", () => {
  const c = plan.cases.find(c => c.id === "C02"), source = c.historical.firstJudge.output;
  const aliases = judgeSpanAliases(c.packet);
  // Synthetic wire fixture changes anchor serialization only. Criteria retain
  // the exact archived negative decisions; semantic equivalence is not inferred.
  const raw = { ...source, packetHash: c.reviewInputBinding.packetHash, criteria: source.criteria.map(criterion => ({ ...criterion, anchors: [{ spanId: aliases.find(a => a.unit === (criterion.id === "claim_support" ? c.packet.units.find(u => u.id.startsWith("source:")).id : "patient")).alias }] })) };
  const result = evaluateRaw(plan, c.id, "span", raw);
  assert.equal(result.validJudge, true); assert.equal(result.verdict, "revise");
  assert.deepEqual(result.criteria.map(c => [c.id, c.verdict, c.reason]), source.criteria.map(c => [c.id, c.verdict, c.reason]));
  assert.equal(result.clinicalApproval, false); assert.equal(result.releasePerformed, false);
  assert.equal(evaluateRaw(plan, c.id, "span", { ...raw, packetHash: "0".repeat(64) }).validJudge, false);
  assert.equal(evaluateRaw(plan, c.id, "span", raw, "MODEL_TIMEOUT").failure, "MODEL_TIMEOUT");
  for (const id of ["C07", "C22"]) {
    const failed = plan.cases.find(c => c.id === id);
    assert.equal(evaluateRaw(plan, id, "original", failed.historical.firstJudge.rawOutput).validJudge, false);
  }
});

fixedTest("summary never drops failed or unfinished slots from planned denominators", () => {
  const c = plan.cases[0], row = { id: c.id, runId: c.runId, arm: "span", trial: 1, status: "valid_review", durationMs: 123, firstTextDeltaMs: 100, validJudge: true, verdict: "revise", failure: null };
  const summary = summarize(plan, [row], 1, 0.2, "TEST_STOP");
  assert.equal(summary.byArm.original.plannedAttempts, 8); assert.equal(summary.byArm.span.plannedAttempts, 8);
  assert.equal(summary.byArm.span.validJudges, 1); assert.equal(summary.byArm.span.accepted, 0); assert.equal(summary.byArm.span.revised, 1);
  assert.equal(summary.missingSchedule.length, 15); assert.equal(summary.runtimePromotion, "not_promoted");
  assert.equal(summary.semanticAudit, "not_assessed");
  assert.throws(() => summarize(plan, [row, row], 2, 0.4, null), /BINDING_MISMATCH/);
  assert.throws(() => summarize(plan, [{ ...row, runId: "other" }], 1, 0.2, null), /BINDING_MISMATCH/);
  assert.throws(() => summarize(plan, [row], 0, 0.2, null), /ACCOUNTING_MISMATCH/);
  for (const changed of [{ ...row, status: "not_dispatched" }, { ...row, validJudge: false }, { ...row, verdict: null }, { ...row, durationMs: -1 }, { ...row, failure: "hidden failure" }]) {
    assert.throws(() => summarize(plan, [changed], 1, 0.2, null), /ROW_STATE_MISMATCH/);
  }
});
