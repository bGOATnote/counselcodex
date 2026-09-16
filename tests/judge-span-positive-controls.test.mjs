import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { makePlan, validatePlan, packetArtifact, claimPlan, costFor, reservationFor, summarize, evaluateRaw, providerOptions, allocationUSD, maximumCalls, contingencyMultiplier } from "../scripts/judge-span-positive-controls.ts";
import { graphJudgeInstructions } from "../src/disposition/graph-prompts.ts";
import { graphJudgeSchema, GRAPH_VERSION } from "../src/disposition/clinical-graph.ts";
import { judgeSpanAliases, JUDGE_SPAN_INSTRUCTIONS, restoreJudgeSpanUnits } from "../src/disposition/graph-judge-span-contract.ts";
import { sha256 } from "../src/evidence/rag/model.ts";
const digest = value => sha256(JSON.stringify(value));
const frozenV22 = GRAPH_VERSION === "evidence-graph/v22";
const plan = frozenV22 ? makePlan() : null;
const fixedTest = (name, fn) => test(name, { skip: !frozenV22 && "Run the fixed controls in the recorded v22 snapshot; never reinterpret archived packets with newer runtime." }, fn);

test("positive-control runner refuses newer runtime", () => {
  if (!frozenV22) assert.throws(() => makePlan(), /FROZEN_V22_RUNTIME_REQUIRED/);
});

fixedTest("prospective controls preserve exact historically accepted first packets and selection exclusions", () => {
  assert.deepEqual(plan.cases.map(c => c.id), ["C14", "C21"]);
  assert.deepEqual(plan.selectionAudit.considered.map(c => [c.id, c.decision]), [["C12", "excluded"], ["C14", "selected"], ["C15", "excluded"], ["C17", "excluded"], ["C21", "selected"]]);
  for (const c of plan.cases) {
    assert.equal(c.historical.firstJudge.failure, null);
    assert.equal(c.historical.firstJudge.output.verdict, "accept");
    assert.equal(c.reviewInputBinding.packetHash, digest(c.packet));
    assert.equal(c.reviewInputBinding.draftHash, digest(c.draft));
    assert.deepEqual(restoreJudgeSpanUnits(c.spanPacket), c.packet.units);
    assert.equal(c.diagnostics.lossless, true); assert.ok(c.diagnostics.overheadRatio < 1.4);
    for (const packet of [c.packet, c.spanPacket]) {
      assert.equal("historical" in packet, false); assert.equal("selectionAudit" in packet, false);
    }
  }
});

fixedTest("only serialization differs across eight planned calls with frozen v22 settings", () => {
  assert.equal(plan.schedule.length, 8); assert.equal(maximumCalls, 8);
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

fixedTest("rehashing cannot change controls, prompts, settings or inclusive allocation", () => {
  assert.deepEqual(validatePlan({ ...plan, fingerprint: digest(plan) }), plan);
  for (const mutate of [p => { p.authorization.allocationUSD = 4; }, p => { p.prompts.original += " pass"; }, p => { p.settings.providerOptions.openai.reasoningEffort = "high"; }, p => { p.cases.reverse(); }, p => { p.selectionAudit.considered[0].decision = "selected"; }, p => { p.schedule.reverse(); }]) {
    const p = structuredClone(plan); mutate(p);
    assert.throws(() => validatePlan({ ...p, fingerprint: digest(p) }), /FROZEN_STUDY_DRIFT/);
  }
});

fixedTest("three-dollar cap includes 25 percent reserve; unknown usage never creates credit", () => {
  assert.equal(allocationUSD, 3); assert.equal(contingencyMultiplier, 1.25);
  assert.equal(costFor({ inputTokens: 100, outputTokens: 20 }), 0.002);
  for (const n of [null, -1, NaN, Infinity]) assert.equal(costFor({ inputTokens: n, outputTokens: 20 }), null);
  for (const c of plan.cases) for (const arm of ["original", "span"]) assert.ok(reservationFor(plan, arm, arm === "original" ? c.packet : c.spanPacket) < allocationUSD);
});

fixedTest("independent single-use claim requires original completed study and immutable packet files", () => {
  const root = mkdtempSync(join(tmpdir(), "judge-span-positive-claim-")), marker = join(root, "consumed.json"), completion = join(root, "original-summary.json");
  function prepare(name) { const directory = join(root, name); mkdirSync(directory); writeFileSync(join(directory, "manifest.json"), JSON.stringify({ ...plan, fingerprint: digest(plan) })); for (const c of plan.cases) writeFileSync(join(directory, `${c.id}-packets.json`), JSON.stringify(packetArtifact(plan, c.id))); return directory; }
  const dir = prepare("first"), other = prepare("copy"), fingerprint = digest(plan);
  assert.throws(() => claimPlan(dir, plan, fingerprint, "wrong", marker, completion), /HASH_CLAIM/);
  assert.throws(() => claimPlan(dir, plan, fingerprint, fingerprint, marker, completion), /WAIT_FOR_ORIGINAL_SPAN/);
  assert.equal(existsSync(marker), false);
  writeFileSync(completion, JSON.stringify({ protocol: "judge-span-fixed-packet/v1", plannedCalls: 16, calls: 16, rows: [] }));
  const firstPacketPath = join(dir, "C14-packets.json"), originalBytes = readFileSync(firstPacketPath);
  writeFileSync(firstPacketPath, JSON.stringify({ ...packetArtifact(plan, "C14"), spanPacketHash: "tampered" }));
  assert.throws(() => claimPlan(dir, plan, fingerprint, fingerprint, marker, completion), /PACKET_ARTIFACT/);
  writeFileSync(firstPacketPath, originalBytes);
  claimPlan(dir, plan, fingerprint, fingerprint, marker, completion);
  assert.equal(existsSync(marker), true);
  assert.throws(() => claimPlan(dir, plan, fingerprint, fingerprint, marker, completion), /ALREADY_USED/);
  assert.throws(() => claimPlan(other, plan, fingerprint, fingerprint, marker, completion), /ALLOCATION_ALREADY_CLAIMED/);
  assert.equal(readdirSync(other).length, 3);
});

fixedTest("span resolution retains acceptance or fresh negative review without manufacturing approval", () => {
  const c = plan.cases[0], source = c.historical.firstJudge.output, aliases = judgeSpanAliases(c.packet);
  const raw = { ...source, packetHash: c.reviewInputBinding.packetHash, criteria: source.criteria.map(criterion => ({ ...criterion, anchors: [{ spanId: aliases.find(a => a.unit === (criterion.id === "claim_support" ? c.packet.units.find(u => u.id.startsWith("source:")).id : "patient")).alias }] })) };
  const result = evaluateRaw(plan, c.id, "span", raw);
  assert.equal(result.validJudge, true); assert.equal(result.verdict, "accept");
  assert.equal(result.clinicalApproval, false); assert.equal(result.releasePerformed, false);
  const negative = { ...raw, verdict: "revise", correction: "Synthetic new defect must remain a negative review.", repairTargets: ["patientMessage"], criteria: raw.criteria.map(criterion => criterion.id === "safety_net" ? { ...criterion, verdict: "fail" } : criterion) };
  assert.equal(evaluateRaw(plan, c.id, "span", negative).verdict, "revise");
  assert.equal(evaluateRaw(plan, c.id, "span", { ...raw, packetHash: "0".repeat(64) }).validJudge, false);
  assert.equal(evaluateRaw(plan, c.id, "span", raw, "MODEL_TIMEOUT").failure, "MODEL_TIMEOUT");
});

fixedTest("positive-control summary retains failed and unfinished denominators", () => {
  const c = plan.cases[0], row = { id: c.id, runId: c.runId, arm: "span", trial: 1, status: "valid_review", durationMs: 123, firstTextDeltaMs: 100, validJudge: true, verdict: "accept", failure: null };
  const summary = summarize(plan, [row], 1, 0.2, "TEST_STOP");
  assert.equal(summary.byArm.original.plannedAttempts, 4); assert.equal(summary.byArm.span.plannedAttempts, 4);
  assert.equal(summary.byArm.span.accepted, 1); assert.equal(summary.missingSchedule.length, 7);
  assert.equal(summary.runtimePromotion, "not_promoted");
  assert.throws(() => summarize(plan, [{ ...row, status: "not_dispatched" }], 1, 0.2, null), /ROW_STATE_MISMATCH/);
  assert.throws(() => summarize(plan, [row], 0, 0.2, null), /ACCOUNTING_MISMATCH/);
});
