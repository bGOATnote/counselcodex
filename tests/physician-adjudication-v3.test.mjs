import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseCsv } from "../src/lib/csv.mjs";
import { REFERENCE, ROOT, clinicianActionClassification, scoreAdjudication, scoreRun, validateAdjudication, writeUnchangedOrNew } from "../scripts/score-physician-adjudication-v3.mjs";

const sha256 = value => createHash("sha256").update(value).digest("hex");
const adjudication = JSON.parse(readFileSync(REFERENCE, "utf8"));
const baseBytes = readFileSync(join(ROOT, adjudication.baseReference.path));
const baseReference = JSON.parse(baseBytes);

test("v3 applies only the four authorized label changes and preserves all mapped v2 inputs", () => {
  validateAdjudication(adjudication, baseReference, baseBytes);
  assert.deepEqual(adjudication.cases.filter(row => JSON.stringify(row.acceptedBuckets) !== JSON.stringify(row.previousAcceptedBuckets)).map(row => row.id), ["C25", "C32", "C34", "C38"]);
  assert.deepEqual(adjudication.cases.find(row => row.id === "C25").acceptedBuckets, ["URGENT_ESCALATION"]);
  assert.equal(adjudication.cases.find(row => row.id === "C25").previousAcceptedRoutes, null);
  assert.deepEqual(adjudication.cases.find(row => row.id === "C22").acceptedBuckets, ["ASYNC_PHYSICIAN"]);
  const unauthorized = structuredClone(adjudication);
  unauthorized.cases[0].acceptedBuckets = ["URGENT_ESCALATION"];
  assert.throws(() => validateAdjudication(unauthorized, baseReference, baseBytes), /Unapproved adjudication change: C01/);
  assert.throws(() => validateAdjudication(adjudication, baseReference, Buffer.from("changed")), /Base reference hash changed/);
  assert.equal(Object.hasOwn(adjudication.cases[0], "originalSuppliedLabel"), false);
});

test("binary clinician-action errors are distinguished from urgency disagreements", () => {
  assert.equal(clinicianActionClassification("SELF_CARE", ["ASYNC_PHYSICIAN"]), "FN");
  assert.equal(clinicianActionClassification("SELF_CARE", ["SELF_CARE"]), "TN");
  assert.equal(clinicianActionClassification("ASYNC_PHYSICIAN", ["SELF_CARE"]), "FP");
  assert.equal(clinicianActionClassification("ASYNC_PHYSICIAN", ["URGENT_ESCALATION"]), "TP");
  assert.equal(clinicianActionClassification("SELF_CARE", ["SELF_CARE", "ASYNC_PHYSICIAN"]), "AMBIGUOUS_ENDPOINT");
  assert.throws(() => clinicianActionClassification("UNKNOWN", ["SELF_CARE"]));
});

test("C25 is included without shrinking the original 49-case comparison", () => {
  const predictions = adjudication.cases.map(row => ({ id: row.id, message: row.message, inputSHA256: row.inputSHA256, disposition: row.acceptedBuckets[0], rationale: "Synthetic score fixture." }));
  predictions[24].disposition = "SELF_CARE";
  const score = scoreRun(predictions, adjudication);
  assert.equal(score.agree, 49);
  assert.equal(score.denominator, 50);
  assert.equal(score.previousV2.denominator, 49);
  assert.equal(score.revisedCommon49.agree, 49);
  assert.deepEqual(score.missIds, ["C25"]);
  assert.deepEqual(score.newlyIncludedIds, ["C25"]);
  assert.equal(score.rows[24].clinicianAction, "FN");
  assert.throws(() => scoreRun(predictions.filter(row => row.id !== "C25"), adjudication), /all 50 unique/);
  const duplicated = structuredClone(predictions);
  duplicated[24] = duplicated[0];
  assert.throws(() => scoreRun(duplicated, adjudication), /all 50 unique/);
});

test("all six frozen runs reproduce the adjudication scores and exact Astra/Fable differences", () => {
  const output = mkdtempSync(join(tmpdir(), "physician-v3-test-"));
  try {
    const { scorecards, summary, audit } = scoreAdjudication({ output });
    assert.deepEqual(Object.fromEntries(Object.entries(scorecards).map(([key, score]) => [key, score.agree])), {
      fableLow: 48, astraXhigh: 47, astraMax: 47, opusLow: 44, fableMax: 46, historicalOpusFiveWayCollapsed: 48,
    });
    assert.deepEqual(scorecards.fableLow.previousV2, { agree: 44, denominator: 49 });
    assert.deepEqual(scorecards.fableLow.revisedCommon49, { agree: 47, denominator: 49 });
    assert.deepEqual(scorecards.fableLow.adjudicationGainsOnCommon49, ["C32", "C34", "C38"]);
    assert.deepEqual(scorecards.fableLow.missIds, ["C22", "C47"]);
    for (const id of ["C32", "C34", "C38"]) assert.equal(scorecards.fableLow.rows.find(row => row.id === id).clinicianAction, "TN");
    assert.equal(scorecards.opusLow.rows.find(row => row.id === "C32").clinicianAction, "FP");
    assert.deepEqual(scorecards.astraXhigh.missIds, ["C07", "C19", "C22"]);
    assert.deepEqual(scorecards.astraMax.missIds, scorecards.astraXhigh.missIds);
    for (const pair of Object.values(summary.pairwise)) {
      assert.deepEqual(pair.disagreementIds, ["C07", "C19", "C47"]);
      assert.deepEqual(pair.astraAgreesFableMisses, ["C47"]);
      assert.deepEqual(pair.fableAgreesAstraMisses, ["C07", "C19"]);
    }
    assert.equal(audit.frozenArtifactCount, 900);
    assert.equal(audit.uniqueProviderRequestIds, 300);
    assert.equal(audit.uniqueProviderResponseIds, 300);
    assert.equal(audit.newProviderCalls, 0);
    assert.equal(audit.assignmentCSVFileRead, false);
    const csv = parseCsv(readFileSync(join(output, "all-case-comparison.csv"), "utf8"));
    assert.equal(csv.length, 50);
    assert.equal(csv[24].fableLowAgrees, "true");
    const differences = parseCsv(readFileSync(join(output, "astra-fable-disagreements.csv"), "utf8"));
    assert.deepEqual(differences.map(row => row.id), ["C07", "C19", "C47"]);
    const before = Object.fromEntries(readdirSync(output).map(name => [name, sha256(readFileSync(join(output, name)))]));
    scoreAdjudication({ output });
    const after = Object.fromEntries(readdirSync(output).map(name => [name, sha256(readFileSync(join(output, name)))]));
    assert.deepEqual(after, before);
    assert.equal(sha256(readFileSync(join(ROOT, adjudication.baseReference.path))), adjudication.baseReference.sha256);
  } finally { rmSync(output, { recursive: true, force: true }); }
});

test("existing derived artifacts cannot be silently rewritten", () => {
  const output = mkdtempSync(join(tmpdir(), "physician-v3-immutable-"));
  try {
    const path = join(output, "score.json");
    writeUnchangedOrNew(path, "original\n");
    writeUnchangedOrNew(path, "original\n");
    assert.throws(() => writeUnchangedOrNew(path, "changed\n"), /Existing derived artifact differs/);
    assert.equal(readFileSync(path, "utf8"), "original\n");
    writeFileSync(path, "external change\n");
    assert.throws(() => writeUnchangedOrNew(path, "original\n"), /Existing derived artifact differs/);
  } finally { rmSync(output, { recursive: true, force: true }); }
});
