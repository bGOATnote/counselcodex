import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { buildComparison, renderReport, summarizeLocalOperations } from "../scripts/score-stripped-3bucket-medgemma.mjs";

const hash = text => createHash("sha256").update(text).digest("hex");
function fixture() {
  const cases = Array.from({ length: 50 }, (_, i) => {
    const id = `C${String(i + 1).padStart(2, "0")}`, message = `Synthetic message ${id}.`;
    return { id, message, inputSHA256: hash(message), acceptedBuckets: [id === "C25" ? "URGENT_ESCALATION" : "SELF_CARE"] };
  });
  const predictions = cases.map(row => ({ id: row.id, message: row.message, inputSHA256: row.inputSHA256,
    parsed: { disposition: row.acceptedBuckets[0], rationale: `Exact rationale ${row.id}.` }, failure: null }));
  return { reference: { referenceId: "synthetic-v3-fixture", cases, provenance: { blinded: false } }, fable: structuredClone(predictions), medgemma: structuredClone(predictions) };
}

test("MedGemma comparison includes C25 and distinguishes urgent misses from clinician-action misses", () => {
  const input = fixture(); input.medgemma[24].parsed.disposition = "ASYNC_PHYSICIAN";
  const { scorecard, comparison } = buildComparison(input);
  assert.equal(scorecard.denominator, 50); assert.equal(scorecard.agree, 49);
  assert.equal(scorecard.clinicianAction.FN, 0); assert.equal(scorecard.urgentAction.FN, 1);
  assert.deepEqual(scorecard.urgentFalseNegativeIds, ["C25"]); assert.deepEqual(comparison.disagreementIds, ["C25"]);
  assert.equal(comparison.rows[24].message, input.medgemma[24].message);
  assert.equal(comparison.rows[24].medgemma.rationale, "Exact rationale C25.");
  assert.equal(comparison.rows[24].fable.rationale, "Exact rationale C25.");
  assert.equal(scorecard.csvScored, false);
});

test("failed MedGemma outputs retain the fixed denominator and never become benign routes", () => {
  const input = fixture();
  for (const index of [0, 24]) { input.medgemma[index].parsed = null; input.medgemma[index].failure = "Timeout; no retry."; }
  const { scorecard, comparison } = buildComparison(input);
  assert.equal(scorecard.agree, 48); assert.equal(scorecard.failedOutputs, 2); assert.equal(scorecard.denominator, 50);
  assert.equal(scorecard.clinicianAction.positiveReferenceFailures, 1); assert.equal(scorecard.clinicianAction.negativeReferenceFailures, 1);
  assert.equal(scorecard.urgentAction.positiveReferenceFailures, 1);
  assert.deepEqual(comparison.failedOutputIds, ["C01", "C25"]);
  assert.equal(comparison.rows[0].medgemma.disposition, null);
});

test("new and resolved case misses remain visible when total agreement is unchanged", () => {
  const input = fixture(); input.reference.cases[21].acceptedBuckets = ["ASYNC_PHYSICIAN"];
  input.medgemma[21].parsed.disposition = "ASYNC_PHYSICIAN";
  input.medgemma[0].parsed.disposition = "ASYNC_PHYSICIAN";
  const { comparison } = buildComparison(input);
  assert.equal(comparison.agreementDelta, 0);
  assert.deepEqual(comparison.resolvedMissIds, ["C22"]); assert.deepEqual(comparison.newMissIds, ["C01"]);
  assert.deepEqual(comparison.resolvedClinicianActionFnIds, ["C22"]); assert.deepEqual(comparison.newUnnecessaryReferralIds, ["C01"]);
});

test("scoring rejects dropped cases, reordered inputs, label drift, missing failures and altered messages", () => {
  const dropped = fixture(); dropped.medgemma.pop(); assert.throws(() => buildComparison(dropped), /50 unique ordered/);
  const reordered = fixture(); reordered.fable.reverse(); assert.throws(() => buildComparison(reordered), /50 unique ordered/);
  const changed = fixture(); changed.medgemma[0].message += " Extra context."; assert.throws(() => buildComparison(changed), /message mismatch/);
  const hashChanged = fixture(); hashChanged.fable[0].inputSHA256 = "0".repeat(64); assert.throws(() => buildComparison(hashChanged), /hash mismatch/);
  const urgent = fixture(); urgent.reference.cases[24].acceptedBuckets = ["ASYNC_PHYSICIAN"]; assert.throws(() => buildComparison(urgent), /C25 urgent/);
  const failed = fixture(); failed.medgemma[0].parsed = null; assert.throws(() => buildComparison(failed), /failure record/);
});

test("report includes exact messages and both rationales for shared misses as well as disagreements", () => {
  const input = fixture(); input.reference.cases[21].acceptedBuckets = ["ASYNC_PHYSICIAN"];
  input.medgemma[24].parsed.disposition = "ASYNC_PHYSICIAN";
  input.medgemma[24].parsed.rationale = "Line one.\nLine two.";
  const result = buildComparison(input);
  const report = renderReport({ ...result,
    audit: { scoredAt: "2026-09-16T00:00:00.000Z", outputDirectory: "outputs/synthetic", operations: { medianLatencyMs: null, latencyObservations: 0 } },
    manifest: { model: "synthetic-medgemma", settings: { temperature: 0, seed: 42 },
      provenance: { sourceRepository: "example/model", revision: "pinned", filename: "model.gguf", sha256: "source-fixture-hash", importedBlobSHA256: "imported-fixture-hash", importTransformation: "Synthetic import record; tensor equivalence unverified." }, runtime: {}, promptSHA256: "fixture" } });
  assert.match(report, /### C22/); assert.match(report, /### C25/);
  assert.ok(report.includes(`> ${input.reference.cases[21].message}`));
  assert.ok(report.includes("> Line one.\n> Line two."));
  assert.ok(report.includes("> Exact rationale C25."));
  assert.match(report, /No clinical superiority or promotion is claimed/);
  assert.match(report, /No grammar-constrained JSON decoding/);
  assert.match(report, /Original CSV labels were not scored/);
  assert.match(report, /\| Model alias \| synthetic-medgemma \|/);
  assert.ok(report.includes('"temperature":0,"seed":42'));
  assert.ok(report.includes("https://huggingface.co/example/model/blob/pinned/model.gguf"));
  assert.ok(report.includes("Downloaded GGUF SHA256 | source-fixture-hash"));
  assert.ok(report.includes("Installed model blob SHA256 | imported-fixture-hash"));
  assert.ok(report.includes("Synthetic import record; tensor equivalence unverified."));
});

test("operation summaries do not impute missing wall latency or token telemetry", () => {
  const records = fixture().medgemma.map((row, index) => ({ id: row.id, latencyMs: index < 2 ? 1000 * (index + 1) : null, telemetry: index === 0 ? { eval_count: 10 } : null }));
  const operations = summarizeLocalOperations(records);
  assert.equal(operations.attempts, 50); assert.equal(operations.latencyObservations, 2); assert.equal(operations.medianLatencyMs, 1500);
  assert.equal(operations.telemetryObservations, 1); assert.equal(operations.records[2].latencyMs, null); assert.equal(operations.records[2].telemetry, null);
});
