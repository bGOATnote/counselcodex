import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COHORT_V23_BUDGET, cohortVersionPolicy, verifyCohortVersionBinding, cohortProviderSettings, cohortReservation, productionArtifactFiles, candidateIdentityFailures, summarizeCohort, type CohortPlan } from "../scripts/candidate-cohort-study.ts";
import { resolveGraphConfig } from "../src/disposition/graph-config.ts";
import { graphRequestSettings } from "../src/disposition/clinical-graph.ts";
import { sha256 } from "../src/evidence/rag/model.ts";
import type { DispositionRun } from "../src/disposition/contract.ts";

const config = resolveGraphConfig(), reservation = cohortReservation(config, "evidence-graph/v23");
const versionPlan = (version: string) => ({ graphVersion: version, protocol: cohortVersionPolicy(version).protocol,
  authorization: { cohortAllocationUSD: cohortVersionPolicy(version).allocationUSD, maximumAssessments: 50, externalRetries: 0 } });

test("v23 is a distinct prospective $40 corpus-v8 plan, never a reused v22 allocation", () => {
  assert.deepEqual(cohortVersionPolicy("evidence-graph/v23"), { protocol: "fresh-candidate-cohort/v2", corpusPath: "apps/evaluation/.local/clinical-rag-v8/corpus.json", allocationUSD: 40 });
  assert.equal(cohortVersionPolicy("evidence-graph/v22").allocationUSD, 55);
  verifyCohortVersionBinding(versionPlan("evidence-graph/v23"), "evidence-graph/v23");
  verifyCohortVersionBinding(versionPlan("evidence-graph/v22"), "evidence-graph/v22");
  assert.throws(() => verifyCohortVersionBinding(versionPlan("evidence-graph/v22"), "evidence-graph/v23"), /VERSION_OR_ALLOCATION_DRIFT/);
  assert.throws(() => verifyCohortVersionBinding({ ...versionPlan("evidence-graph/v23"), protocol: "fresh-candidate-cohort/v1" }, "evidence-graph/v23"), /DRIFT/);
  for (const change of [{ cohortAllocationUSD: 35 }, { cohortAllocationUSD: 55 }, { externalRetries: 1 }, { maximumAssessments: 51 }]) {
    const plan = versionPlan("evidence-graph/v23");
    assert.throws(() => verifyCohortVersionBinding({ ...plan, authorization: { ...plan.authorization, ...change } }, "evidence-graph/v23"), /DRIFT/);
  }
  assert.throws(() => cohortVersionPolicy("evidence-graph/v24"), /UNREGISTERED/);
});

test("prospective allocation retains prior charges and GUI reserve below the existing $100 ceiling", () => {
  const total = COHORT_V23_BUDGET.priorAccountedUSD + COHORT_V23_BUDGET.guiReserveUSD + COHORT_V23_BUDGET.cohortAllocationUSD;
  assert.equal(COHORT_V23_BUDGET.guiReserveUSD, 15.5);
  assert.ok(Math.abs(total - 99.716046525) < 1e-10);
  assert.ok(total <= COHORT_V23_BUDGET.sprintCeilingUSD);
  assert.equal(COHORT_V23_BUDGET.sprintCeilingUSD, 100);
});

test("v23 identity records the actual prompt-bound role settings, including truncation recovery", () => {
  const settings = cohortProviderSettings(config, "evidence-graph/v23");
  assert.ok(settings.requestSettings);
  for (const role of Object.keys(config.models) as (keyof typeof config.models)[]) assert.deepEqual(settings.requestSettings[role], graphRequestSettings(role, config));
  assert.deepEqual(settings.requestSettings.truncatedJudgeRecovery, graphRequestSettings("judge", config, true));
  assert.equal(settings.judgeSerialization, "exact-quoted-anchors/v1");
  assert.match(settings.binding, /included in graphPromptHash/);
  assert.match(cohortProviderSettings(config, "evidence-graph/v22").binding, /NOT included/);
});

test("unpromoted concise or span styles cannot enter the full quoted v23 cohort", () => {
  assert.throws(() => cohortReservation({ ...config, judgeStyle: "concise" }, "evidence-graph/v23"), /FULL_QUOTED/);
  assert.throws(() => cohortReservation({ ...config, judgeAnchors: "spans" } as typeof config, "evidence-graph/v23"), /FULL_QUOTED/);
  assert.equal(reservation.maximumCalls, 9);
  for (const call of reservation.calls) assert.equal(call.outputTokenBound, graphRequestSettings(call.role, config, call.outputTokenBound === 9216).modelSettings.maxOutputTokens);
});

test("production identity includes HTML and binary/client assets and detects added serving files", () => {
  const root = mkdtempSync(join(tmpdir(), "cohort-build-test-"));
  for (const path of ["server/pages", "static/chunks", "cache", "dev", "types"]) mkdirSync(join(root, path), { recursive: true });
  for (const path of ["BUILD_ID", "required-server-files.json", "server/pages/500.html", "static/chunks/app.js", "static/font.woff", "trace", "trace-build", "cache/mutable", "dev/app.js", "types/routes.d.ts"]) writeFileSync(join(root, path), "fixture");
  const frozen = productionArtifactFiles(root);
  assert.deepEqual(frozen, ["BUILD_ID", "required-server-files.json", "server/pages/500.html", "static/chunks/app.js", "static/font.woff"].map(p => join(root,p)).sort());
  writeFileSync(join(root, "server/extra.js"), "new code");
  assert.notDeepEqual(productionArtifactFiles(root), frozen);
});

test("v23 run identity binds actual started version and mode, not a config-shaped object alone", () => {
  const message = "Synthetic patient-only test input", promptHash = "a".repeat(64);
  const run = { runId: "synthetic", message, inputHash: sha256(message), promptHash, status: "review_required", agents: [], graph: { version: "evidence-graph/v23", mode: "hybrid", retrieval: [] } } as unknown as DispositionRun;
  const plan = { promptHash, graphVersion: "evidence-graph/v23", corpusHash: "b".repeat(64), config };
  const start = { runId: run.runId, inputHash: run.inputHash, promptHash, config, version: plan.graphVersion, mode: "hybrid" };
  assert.deepEqual(candidateIdentityFailures(plan, run, message, start), []);
  assert.ok(candidateIdentityFailures(plan, run, message, { ...start, version: "evidence-graph/v22" }).includes("START_GRAPH_VERSION_UNBOUND"));
  assert.ok(candidateIdentityFailures(plan, run, message, { ...start, mode: "none" }).includes("START_GRAPH_VERSION_UNBOUND"));
});

test("v23 keeps failed/unfinished/unattempted denominator and cannot count a captured but failed result as released", () => {
  const reference = JSON.parse(readFileSync("data/evaluation/physician-system-reference-v2.json", "utf8"));
  const plan = { ...versionPlan("evidence-graph/v23"), cases: reference.cases.map((c: { id: string; message: string; inputHash: string }) => ({ id: c.id, message: c.message, inputHash: c.inputHash })), promptHash: "a".repeat(64), fingerprint: "b".repeat(64), reservation, interpretation: "Development reference only" } as CohortPlan;
  const c = plan.cases[0];
  const result = summarizeCohort(plan, [{ index: 1, id: c.id, run: { runId: "failed", message: c.message, inputHash: c.inputHash, status: "complete", agents: [], answer: null } as unknown as DispositionRun, receipts: [], failure: "JOURNAL_READ_FAILED", identityFailures: [], durationMs: 20, estimatedUSD: null, accountedUSD: reservation.perRunUSD, unknownUsage: true }], 2, "STOPPED");
  assert.equal(result.planned, 50);
  assert.equal(result.starts, 2);
  assert.equal(result.results, 1);
  assert.equal(result.unfinishedStarted, 1);
  assert.equal(result.unattempted.length, 48);
  assert.equal(result.transportOrDecoderFailures, 1);
  assert.equal(result.complete, 0);
  assert.equal(result.accountedUSD, reservation.perRunUSD * 2);
  assert.equal(result.cohort.plannedReferenceDenominator, 49);
  assert.throws(() => summarizeCohort(plan, [], 51, null), /ATTEMPT_BINDING/);
});
