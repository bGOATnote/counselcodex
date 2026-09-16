import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildGraphJudgeCalibrationFixtures, graphJudgeCalibrationInput, CALIBRATION_SOURCE_RUNS, GRAPH_JUDGE_CALIBRATION_VERSION } from "../src/evaluation/graph-judge-calibration.ts";
import { draftSchema, graphSourceIntegrity } from "../src/disposition/clinical-graph.ts";
import { sha256 } from "../src/evidence/rag/model.ts";

test("calibration is seven balanced authored pairs, not a physician-reviewed clinical score", () => {
  const fixtures = buildGraphJudgeCalibrationFixtures();
  assert.equal(fixtures.length, 14);
  assert.equal(new Set(fixtures.map(f => f.id)).size, fixtures.length);
  assert.equal(fixtures.filter(f => f.expected.verdict === "pass").length, 7);
  assert.equal(fixtures.filter(f => f.expected.verdict === "fail").length, 7);
  assert.equal(new Set(fixtures.map(f => f.family)).size, 7);
  for (const fixture of fixtures) {
    assert.equal(fixture.provenance.kind, "engineering_authored_minimal_pair");
    assert.equal(fixture.provenance.clinicalApproval, false);
    assert.equal(fixture.provenance.version, GRAPH_JUDGE_CALIBRATION_VERSION);
    assert.ok(["patient_grounding", "claim_support"].includes(fixture.expected.criterion));
    assert.equal(draftSchema.safeParse(fixture.draft).success, true, fixture.id);
    assert.equal(graphSourceIntegrity(fixture.draft, fixture.hits), true, fixture.id);
    assert.ok(JSON.stringify(fixture.draft).includes(JSON.stringify(fixture.expected.targetDraftQuote).slice(1, -1)), fixture.id);
    assert.ok(fixture.draft.redFlags.every(f => f.status === "unknown" && f.quote === "" || fixture.patient.includes(f.quote)), fixture.id);
  }
});

test("a minimal pair holds patient, evidence, route and other draft fields constant", () => {
  const fixtures = buildGraphJudgeCalibrationFixtures();
  for (const family of new Set(fixtures.map(f => f.family))) {
    const pair = fixtures.filter(f => f.family === family), [control, defect] = pair;
    assert.equal(pair.length, 2);
    assert.equal(control.variant, "control"); assert.equal(defect.variant, "defect");
    assert.equal(control.patient, defect.patient);
    assert.deepEqual(control.hits, defect.hits);
    assert.equal(control.early, defect.early);
    assert.equal(control.issuedQuestion, defect.issuedQuestion);
    assert.equal(control.draft.disposition, defect.draft.disposition);
    assert.equal(control.draft.reviewPriority, defect.draft.reviewPriority);
    const differences = Object.keys(control.draft).filter(key => JSON.stringify(control.draft[key as keyof typeof control.draft]) !== JSON.stringify(defect.draft[key as keyof typeof defect.draft]));
    assert.equal(differences.length, 1, `${family}: ${differences}`);
    if (differences[0] === "citations") {
      const expected = structuredClone(control.draft.citations);
      expected[expected.length - 1].claim = defect.draft.citations.at(-1)!.claim;
      assert.deepEqual(expected, defect.draft.citations);
    }
    assert.equal(control.provenance.evidenceHash, defect.provenance.evidenceHash);
    assert.equal(control.provenance.patientHash, defect.provenance.patientHash);
    assert.notEqual(control.provenance.draftHash, defect.provenance.draftHash);
    assert.notEqual(control.provenance.packetHash, defect.provenance.packetHash);
  }
});

test("judge inputs explicitly exclude expected labels, fixture identity and provenance", () => {
  for (const fixture of buildGraphJudgeCalibrationFixtures()) {
    const input = graphJudgeCalibrationInput(fixture);
    assert.deepEqual(Object.keys(input).sort(), ["draft", "early", "hits", "issuedQuestion", "patient"]);
    const serialized = JSON.stringify(input);
    for (const forbidden of [fixture.id, "engineering_authored_minimal_pair", "targetDraftQuote", "sourceRunHash", '"expected"', '"variant"']) assert.ok(!serialized.includes(forbidden), forbidden);
    assert.equal(sha256(serialized), fixture.provenance.packetHash);
    input.draft.reason = "Caller mutated its copy.";
    input.hits[0].chunk.text = "Caller mutated its evidence copy.";
    assert.notEqual(input.draft.reason, fixture.draft.reason);
    assert.notEqual(input.hits[0].chunk.text, fixture.hits[0].chunk.text);
  }
});

test("provenance hashes bind unchanged historical sources and reproducible fresh fixtures", () => {
  const before = Object.values(CALIBRATION_SOURCE_RUNS).map(source => {
    const path = new URL(`../outputs/candidate-v13-gui-2026-09-14/runs/${source.id}.json`, import.meta.url);
    return { path, hash: sha256(readFileSync(path)), expected: source.hash };
  });
  assert.ok(before.every(source => source.hash === source.expected));
  const first = buildGraphJudgeCalibrationFixtures(), second = buildGraphJudgeCalibrationFixtures();
  assert.deepEqual(first, second);
  for (const fixture of first) {
    assert.equal(fixture.provenance.patientHash, sha256(fixture.patient));
    assert.equal(fixture.provenance.draftHash, sha256(JSON.stringify(fixture.draft)));
    assert.equal(fixture.provenance.evidenceHash, sha256(JSON.stringify(fixture.hits)));
    for (const hit of fixture.hits) assert.equal(sha256(hit.chunk.text), hit.chunk.hash);
  }
  first[0].draft.reason = "Mutation stays local.";
  assert.notEqual(first[0].draft.reason, second[0].draft.reason);
  for (const source of before) assert.equal(sha256(readFileSync(source.path)), source.hash);
});

test("observed contradiction families remain targeted rather than route-label tests", () => {
  const fixtures = buildGraphJudgeCalibrationFixtures();
  const defect = (family: string) => fixtures.find(f => f.family === family && f.variant === "defect")!;
  const redness = defect("redness-trajectory");
  assert.match(redness.draft.reason, /has spreading redness/);
  assert.equal(redness.draft.redFlags.find(f => f.concern === "Spreading redness or streaking")?.status, "unknown");
  assert.doesNotMatch(redness.patient, /spreading/);
  const medication = defect("named-medication-scope");
  assert.match(medication.patient, /out of sumatriptan/);
  assert.match(medication.draft.reason, /no rescue medication left/);
  assert.match(defect("fever-measurement").draft.vitalSigns, /measured temperature is normal/);
  assert.match(defect("new-versus-all-symptoms").patient, /No new symptoms/);
  assert.match(defect("new-versus-all-symptoms").draft.reason, /You have no symptoms/);
  assert.match(defect("source-eligibility-as-fact").draft.reason, /no cardiovascular disease/);
  assert.match(defect("other-person-attribution").patient, /My sister has left-sided weakness/);
  assert.match(defect("source-claim-contradiction").draft.citations.at(-1)!.claim, /every patient with headache/);
  assert.equal(defect("source-claim-contradiction").expected.criterion, "claim_support");
});
