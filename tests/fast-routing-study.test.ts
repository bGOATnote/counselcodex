import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FAST_STUDY, selectFastStudyCases, fastStudyAuthorization, fastStudyReservation, fastStudyProviderSettings, claimFastStudyPlan, summarizeFastStudy, requireFreshStudyOutput, verifyFastStudyPlan, main, type FastStudyPlan, type FastAttempt } from "../scripts/fast-routing-study.ts";
import { resolveGraphConfig, type GraphConfig } from "../src/disposition/graph-config.ts";
import { cohortAccountedCost, cohortRequestBody } from "../scripts/candidate-cohort-study.ts";
import { GRAPH_VERSION, graphPromptHash, graphJudgeSchema } from "../src/disposition/clinical-graph.ts";
import { graphJudgeInstructions } from "../src/disposition/graph-prompts.ts";
import { EXECUTION_POLICY } from "../src/disposition/execution-policy.ts";
import { STUDY_PRICING } from "../src/evaluation/clinical-study-budget.ts";
import { sha256 } from "../src/evidence/rag/model.ts";
import type { DispositionRun } from "../src/disposition/contract.ts";

const csv = readFileSync("data/patient_messages.csv", "utf8");
const config = resolveGraphConfig({ COUNSEL_GRAPH_DISPOSITION_MODEL: "anthropic/claude-haiku-4-5", COUNSEL_GRAPH_JUDGE_MODEL: "anthropic/claude-haiku-4-5" });
const reservation = fastStudyReservation(config);
const cases = selectFastStudyCases(csv, ["C02", "C50", "C30"]);
const plan = { fingerprint: "a".repeat(64), cases, reservation, authorization: fastStudyAuthorization(87.093099025, 20) } as FastStudyPlan;

test("fixed patient subsets preserve order and never carry either label into requests", () => {
  assert.deepEqual(cases.map(c => c.id), ["C02", "C50", "C30"]);
  assert.deepEqual(Object.keys(cases[0]), ["id", "message", "inputHash"]);
  assert.deepEqual(Object.keys(cohortRequestBody(cases[0].message)), ["message", "syntheticOnly"]);
  assert.equal(selectFastStudyCases(csv, Array.from({ length: 50 }, (_, i) => `C${String(i + 1).padStart(2, "0")}`)).length, 50);
  for (const ids of [[], ["C02", "C02"], ["C51"], ["../../.env"]]) assert.throws(() => selectFastStudyCases(csv, ids));
});
test("$200 is total, earlier $87.09 is not reset, and this phase cannot exceed $20", () => {
  assert.equal(FAST_STUDY.totalCeilingUSD, 200);
  assert.equal(fastStudyAuthorization(90, 20).priorAccountedUSD, 90);
  for (const [prior, allocation] of [[0, 20], [87, 20], [190, 20], [100, 21], [100, 0], [NaN, 20], [100, Infinity]]) assert.throws(() => fastStudyAuthorization(prior, allocation), /AUTHORITY/);
});
test("all-Haiku reservation covers nine worst-case calls, including all recovery paths", () => {
  assert.equal(reservation.maximumCalls, 9);
  assert.ok(reservation.calls.every(c => c.model === "anthropic/claude-haiku-4-5" && c.inputTokenBound > 68_192));
  assert.equal(reservation.calls.filter(c => c.role === "judge").reduce((n, c) => n + c.count, 0), 4);
  assert.ok(reservation.perRunUSD > 0 && reservation.perRunUSD < 20);
  assert.throws(() => fastStudyReservation({ ...config, models: { ...config.models, judge: "other/unpriced" } }), /UNPRICED/);
  assert.throws(() => fastStudyReservation({ ...config, factGraphMode: "shadow" }), /FULL_SAFETY/);
});
test("concise hybrid reserves its exact judge instructions without changing criteria or call limits", () => {
  const conciseConfig = resolveGraphConfig({ COUNSEL_GRAPH_DISPOSITION_MODEL: "anthropic/claude-haiku-4-5", COUNSEL_GRAPH_JUDGE_MODEL: "openai/gpt-6-astra", COUNSEL_GRAPH_JUDGE_STYLE: "concise" });
  const full = fastStudyReservation({ ...conciseConfig, judgeStyle: "full" }), concise = fastStudyReservation(conciseConfig);
  const schema = JSON.stringify(graphJudgeSchema.toJSONSchema());
  assert.deepEqual(graphJudgeSchema.shape.criteria.element.shape.id.options, ["undertriage", "overtriage", "patient_grounding", "claim_support", "safety_net", "clarification_delay", "ownership"]);
  assert.equal(concise.maximumCalls, full.maximumCalls);
  assert.equal(concise.maximumCalls, 9);
  assert.deepEqual(concise.calls.filter(c => c.role !== "judge"), full.calls.filter(c => c.role !== "judge"));
  for (const [i, call] of concise.calls.entries()) {
    if (call.role !== "judge") continue;
    assert.equal(call.model, "openai/gpt-6-astra");
    assert.equal(call.schemaHash, sha256(schema));
    assert.equal(call.schemaHash, full.calls[i].schemaHash);
    assert.equal(call.instructionHash, sha256(graphJudgeInstructions("concise")));
    assert.notEqual(call.instructionHash, full.calls[i].instructionHash);
    assert.equal(call.inputTokenBound, 68_192 + Buffer.byteLength(graphJudgeInstructions("concise") + schema));
    assert.equal(call.inputTokenBound - full.calls[i].inputTokenBound, Buffer.byteLength(graphJudgeInstructions("concise")) - Buffer.byteLength(graphJudgeInstructions("full")));
    assert.equal(call.outputTokenBound, full.calls[i].outputTokenBound);
  }
  // Concise constrains output prose, not a lower output cap or cheaper vendor.
  assert.deepEqual(fastStudyProviderSettings(conciseConfig), fastStudyProviderSettings({ ...conciseConfig, judgeStyle: "full" }));
  assert.notEqual(graphPromptHash(conciseConfig), graphPromptHash({ ...conciseConfig, judgeStyle: "full" }));
  assert.throws(() => fastStudyReservation({ ...conciseConfig, judgeStyle: "unchecked" } as unknown as GraphConfig), /KNOWN_JUDGE/);
});
test("a rehashed manifest still rejects selected judge instructions, reservation, or settings drift", () => {
  const conciseConfig = resolveGraphConfig({ COUNSEL_GRAPH_DISPOSITION_MODEL: "anthropic/claude-haiku-4-5", COUNSEL_GRAPH_JUDGE_STYLE: "concise" });
  const rehash = (input: FastStudyPlan) => { const { fingerprint: _fingerprint, ...payload } = input; return { ...payload, fingerprint: sha256(JSON.stringify(payload)) }; };
  const bound = rehash({ protocol: FAST_STUDY.protocol, endpoint: "http://localhost:4120/api/candidate", graphVersion: GRAPH_VERSION,
    config: conciseConfig, promptHash: graphPromptHash(conciseConfig), authorization: plan.authorization, pricing: STUDY_PRICING,
    reservation: fastStudyReservation(conciseConfig), providerSettings: fastStudyProviderSettings(conciseConfig), files: {},
    transport: { httpAllowanceMs: EXECUTION_POLICY.modelTimeoutMs * 9 + 120_000, sequential: true, decoder: "actual GUI readDispositionStream", externalRetries: 0 } } as FastStudyPlan);
  // Correct model binding reaches (and fails) the independent source gate.
  assert.throws(() => verifyFastStudyPlan(bound), /FROZEN_SOURCE_SET_DRIFT/);
  const changedStyle = { ...conciseConfig, judgeStyle: "full" } as GraphConfig;
  const changedReservation = structuredClone(bound.reservation); changedReservation.calls.find(c => c.role === "judge")!.inputTokenBound--;
  const changedInstruction = structuredClone(bound.reservation); changedInstruction.calls.find(c => c.role === "judge")!.instructionHash = sha256(graphJudgeInstructions("full"));
  const changedSettings = structuredClone(bound.providerSettings); changedSettings.roles.judge.modelSettings.maxOutputTokens--;
  for (const mutation of [
    { config: changedStyle },
    { config: changedStyle, promptHash: graphPromptHash(changedStyle) },
    { reservation: changedReservation },
    { reservation: changedInstruction },
    { providerSettings: changedSettings },
  ]) assert.throws(() => verifyFastStudyPlan(rehash({ ...bound, ...mutation })), /FROZEN_MODEL_CONFIG_DRIFT/);
});
test("known usage uses exact recorded token counts and uncertainty keeps full reservation", () => {
  const run = { modelCalls: 1, agents: [{ modelCalls: 1, model: "anthropic/claude-haiku-4-5", usage: { inputTokens: 100, outputTokens: 10 } }] } as DispositionRun;
  const cost = cohortAccountedCost(run, reservation);
  assert.equal(cost.estimatedUSD, 0.00015);
  assert.equal(cost.accountedUSD, 0.00015 * 1.25 + 0.002);
  assert.equal(cohortAccountedCost(null, reservation).accountedUSD, reservation.perRunUSD);
  run.modelCalls = 2;
  assert.equal(cohortAccountedCost(run, reservation).unknownUsage, true);
});
test("single-use claim also rejects a copied manifest with the same fingerprint", () => {
  const root = mkdtempSync(join(tmpdir(), "fast-study-claim-")), ledger = join(root, "claims"), manifest = join(root, "manifest.json");
  assert.throws(() => claimFastStudyPlan(manifest, join(root, "one"), plan, "bad", ledger), /FINGERPRINT/);
  claimFastStudyPlan(manifest, join(root, "one"), plan, plan.fingerprint, ledger);
  assert.throws(() => claimFastStudyPlan(join(root, "copied.json"), join(root, "two"), plan, plan.fingerprint, ledger), /EEXIST/);
});
test("failed complete-shaped result never counts complete; unfinished starts retain reservation", () => {
  const attempt = { index: 1, id: "C02", run: { status: "complete", answer: null } as DispositionRun, receipts: [], failure: "DECODER_FAILED", identityFailures: [], durationMs: 10, estimatedUSD: null, accountedUSD: reservation.perRunUSD, unknownUsage: true } as FastAttempt;
  const result = summarizeFastStudy(plan, [attempt], 2, "STOPPED");
  assert.equal(result.planned, 3); assert.equal(result.starts, 2); assert.equal(result.results, 1);
  assert.equal(result.unfinishedStarted, 1); assert.deepEqual(result.unattempted, ["C30"]);
  assert.equal(result.complete, 0); assert.equal(result.accountedUSD, 2 * reservation.perRunUSD);
  assert.equal(result.totalAccountedUSD, plan.authorization.priorAccountedUSD + result.accountedUSD);
  assert.throws(() => summarizeFastStudy(plan, [attempt], 4, null), /BINDING/);
  assert.throws(() => summarizeFastStudy(plan, [{ ...attempt, id: "C50" }], 1, null), /BINDING/);
});
test("existing source/output directories are rejected before planning or provider access", async () => {
  const root = mkdtempSync(join(tmpdir(), "fast-study-overwrite-"));
  const sentinel = join(root, "keep.txt"); writeFileSync(sentinel, "unchanged");
  await assert.rejects(main(["--plan", `--output=${root}`]), /FRESH_OUTPUT/);
  await assert.rejects(main(["--live", "--output=src"]), /FRESH_OUTPUT/);
  assert.equal(readFileSync(sentinel, "utf8"), "unchanged");
  assert.throws(() => requireFreshStudyOutput("src/new-fast-study-output"), /OUTPUTS_SUBDIRECTORY/);
  assert.throws(() => requireFreshStudyOutput("outputs/../../new-fast-study-output"), /OUTPUTS_SUBDIRECTORY/);
});
test("modified manifest or plan source cannot reach provider dispatch", () => {
  assert.throws(() => verifyFastStudyPlan({ ...plan, protocol: FAST_STUDY.protocol }), /INVALID_FAST_STUDY_MANIFEST/);
});
