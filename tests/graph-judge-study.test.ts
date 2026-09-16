import test from "node:test";
import assert from "node:assert/strict";
import { buildGraphJudgeCalibrationFixtures } from "../src/evaluation/graph-judge-calibration.ts";
import { calibrationPacket, judgeStudySchedule, summarizeJudgeStudy, judgeRequestReservation, type JudgeStudyRow } from "../src/evaluation/graph-judge-study.ts";
import { graphJudgeInstructions } from "../src/disposition/graph-prompts.ts";
import { graphPromptHash, graphJudgeSchema } from "../src/disposition/clinical-graph.ts";
import { resolveGraphConfig } from "../src/disposition/graph-config.ts";
import { claimJudgeStudyAuthorization, judgeStudyFingerprint } from "../src/evaluation/graph-judge-study.ts";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sprintFixtures, sprintPacket, repairFixtures } from "../src/evaluation/repair-sprint.ts";

test("both styles keep the same clinical review and schema; only output economy differs", () => {
  assert.ok(graphJudgeInstructions("concise").startsWith(graphJudgeInstructions("full")));
  assert.match(graphJudgeInstructions("full"), /Reconcile EVERY patient-specific assertion/);
  assert.match(graphJudgeInstructions("concise"), /FULL required evidence/);
  for (const style of ["full", "concise"] as const) assert.match(graphJudgeInstructions(style), /claim_support=pass requires at least one exact supporting source:<id> passage anchor/);
  assert.equal(graphJudgeSchema.shape.criteria.element.shape.reason.safeParse("Concise rationale.").success, true);
  assert.notEqual(graphPromptHash(resolveGraphConfig({ COUNSEL_GRAPH_JUDGE_STYLE: "full" })), graphPromptHash(resolveGraphConfig({ COUNSEL_GRAPH_JUDGE_STYLE: "concise" })));
  assert.throws(() => resolveGraphConfig({ COUNSEL_GRAPH_JUDGE_STYLE: "skip" }));
});
test("fixed schedule preserves all pairs and excludes labels and provenance from packets", () => {
  const fixtures = buildGraphJudgeCalibrationFixtures(), schedule = judgeStudySchedule(fixtures);
  assert.equal(schedule.length, 28);
  for (let i = 0; i < schedule.length; i += 2) {
    assert.equal(schedule[i].fixture.id, schedule[i + 1].fixture.id);
    assert.notEqual(schedule[i].style, schedule[i + 1].style);
    const packet = calibrationPacket(schedule[i].fixture), text = JSON.stringify(packet);
    for (const forbidden of ["expected", "provenance", "targetDraftQuote", schedule[i].fixture.id]) assert.equal(text.includes(forbidden), false);
    assert.deepEqual(packet.contractFindings, []);
    assert.ok(judgeRequestReservation(text, "concise") > 0);
  }
});
test("failure, abstention, missing attempts and packet mismatches cannot establish promotion", () => {
  const row: JudgeStudyRow = { id: "x", family: "test", variant: "defect", style: "full", packetHash: "same", expected: "fail", observed: "fail", valid: true, durationMs: 20, outputTokens: 10, estimatedUSD: 0.01 };
  assert.equal(summarizeJudgeStudy([row], ["x"]).promotionSignal, "not_established");
  const good = { ...row, style: "concise" as const, durationMs: 10 };
  assert.equal(summarizeJudgeStudy([row, good], ["x"]).promotionSignal, "eligible_for_gui_verification");
  for (const bad of [{ ...good, valid: false }, { ...good, observed: "pass" as const }, { ...good, observed: "abstain" as const }]) assert.equal(summarizeJudgeStudy([row, bad], ["x"]).promotionSignal, "not_established");
  assert.throws(() => summarizeJudgeStudy([row, { ...good, packetHash: "different" }], ["x"]));
  assert.throws(() => summarizeJudgeStudy([row, row], ["x"]));
  assert.equal(summarizeJudgeStudy([], []).promotionSignal, "not_established");
  assert.throws(() => summarizeJudgeStudy([{ ...row, durationMs: NaN }, good], ["x"]));
});
test("study authorization is fingerprint-bound and cannot fund another output directory", () => {
  const directory = mkdtempSync(join(tmpdir(), "judge-study-auth-")), path = join(directory, "authorization.json");
  const fingerprint = judgeStudyFingerprint(buildGraphJudgeCalibrationFixtures());
  writeFileSync(path, JSON.stringify({ approved: true, reference: "offline test authorization only", studyFingerprint: fingerprint, maximumUSD: 10, maximumCalls: 28 }));
  assert.throws(() => claimJudgeStudyAuthorization(path, "first", "changed-packet-or-prompt"));
  assert.equal(claimJudgeStudyAuthorization(path, "first", fingerprint).maximumUSD, 10);
  assert.throws(() => claimJudgeStudyAuthorization(path, "second", fingerprint));
});
test("new sprint freezes six single-field pairs without leaking targets into the judge", () => {
  const fixtures = sprintFixtures(); assert.equal(fixtures.length, 12);
  for (const control of fixtures.filter(f => f.variant === "control")) {
    const defect = fixtures.find(f => f.family === control.family && f.variant === "defect")!;
    assert.equal(control.patient, defect.patient); assert.deepEqual(control.hits, defect.hits);
    const changed = Object.keys(control.draft).filter(k => JSON.stringify(control.draft[k as keyof typeof control.draft]) !== JSON.stringify(defect.draft[k as keyof typeof defect.draft]));
    assert.deepEqual(changed, [control.field]);
    assert.doesNotMatch(JSON.stringify(sprintPacket(control)), /rs1-|engineering_authored|"expected"|"provenance"|targetDraftQuote/);
  }
  assert.equal(repairFixtures().length, 4);
  assert.ok(repairFixtures().every(f => f.allowedFields.length && f.hits.every(h => h.chunk.hash.length === 64)));
});
test("known-confounded historical fixtures cannot silently start a new paid comparison", () => {
  const directory = mkdtempSync(join(tmpdir(), "repair-sprint-guard-")), output = join(directory, "not-created");
  // No authorization claim is supplied: even a regression cannot reach dispatch.
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/repair-sprint.ts", "--live", `--output=${output}`], { encoding: "utf8", timeout: 15000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HISTORICAL_FIXTURES_REQUIRE_CORRECTION_OR_EXPLICIT_EXPLORATORY_ACKNOWLEDGMENT/);
  assert.equal(existsSync(output), false);
});
