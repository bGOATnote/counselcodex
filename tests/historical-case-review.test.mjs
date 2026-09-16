import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { collapseHistoricalRoute, loadHistoricalCaseReview, projectNanoCase, projectV25Case, verifyV25PublicationSnapshot } from "../scripts/load-historical-case-review.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const digest = (s) => createHash("sha256").update(s).digest("hex");
const artifact = [{ kind: "run", path: "outputs/synthetic.json", sha256: "a".repeat(64) }];
function v25Fixture() {
  return {
    message: "Synthetic assessment request.", artifacts: artifact,
    row: { id: "C04", runId: "fixed-run", complete_gates_only: false, finalRoute: null, status: "transport_identity_or_unfinished_failure", release: "gates_only", failure: "Original decoder failure", failedChecks: [] },
    admission: { id: "C04", runId: "fixed-run", eligible: false, failure: "Original decoder failure" },
    run: { runId: "fixed-run", message: "Synthetic assessment request.", inputHash: digest("Synthetic assessment request."), status: "complete", modelCalls: 3,
      answer: { disposition: "SAME_DAY_IN_PERSON", reason: "A stored answer does not reverse failed admission." },
      agents: [{ role: "disposition", model: "anthropic/test", modelCalls: 1, output: { hidden: "never copy this" } }],
      responseEvents: [], estimatedUSD: 123, usage: { credentials: "never copy this" }, rejectedAnswer: { disposition: "SELF_CARE" } },
  };
}

test("five-way mapping keeps timing detail explicit while collapsing buckets", () => {
  assert.equal(collapseHistoricalRoute("PRIORITY_ASYNC"), "ASYNC_PHYSICIAN");
  assert.equal(collapseHistoricalRoute("STANDARD_ASYNC"), "ASYNC_PHYSICIAN");
  assert.equal(collapseHistoricalRoute("SAME_DAY_IN_PERSON"), "URGENT_ESCALATION");
  assert.equal(collapseHistoricalRoute("EMERGENCY_NOW"), "URGENT_ESCALATION");
  assert.equal(collapseHistoricalRoute("SELF_CARE"), "SELF_CARE");
  assert.throws(() => collapseHistoricalRoute(null), /Unknown historical route/);
  assert.throws(() => collapseHistoricalRoute("review_required"), /Unknown historical route/);
});

test("an apparently complete stored C04-style answer never overrides original failed admission", () => {
  const result = projectV25Case(v25Fixture());
  assert.equal(result.status, "incomplete");
  assert.equal(result.disposition, null);
  assert.equal(result.originalDisposition, null);
  assert.equal(result.rationale, null);
  assert.equal(result.failureReason, "Original decoder failure");
  assert(!JSON.stringify(result).includes("never copy this"));
  assert(!JSON.stringify(result).includes("estimatedUSD"));
  assert.deepEqual(result.artifactPaths, { run: "outputs/synthetic.json" });
});

test("C49-style retained early action is distinct from an incomplete release", () => {
  const f = v25Fixture();
  f.run.responseEvents = [{ kind: "action", notice: { disposition: "SAME_DAY_IN_PERSON", directive: "Arrange assessment today." } }];
  const result = projectV25Case(f);
  assert.equal(result.disposition, null);
  assert.equal(result.earlyActions[0].disposition, "URGENT_ESCALATION");
  assert.equal(result.earlyActions[0].originalDisposition, "SAME_DAY_IN_PERSON");
  assert.match(result.earlyActions[0].label, /not a completed release/);
  f.row.finalRoute = "SAME_DAY_IN_PERSON";
  assert.throws(() => projectV25Case(f), /Incomplete release cannot have a final route/);
});

test("complete projection requires eligible gates-only release and matching input", () => {
  const f = v25Fixture();
  f.row = { ...f.row, complete_gates_only: true, status: "complete", finalRoute: "SAME_DAY_IN_PERSON", failure: null };
  assert.throws(() => projectV25Case(f), /Ineligible/);
  f.admission.eligible = true;
  assert.equal(projectV25Case(f).disposition, "URGENT_ESCALATION");
  f.run.message = "A different patient message.";
  assert.throws(() => projectV25Case(f), /differs from assignment/);
});

test("Nano adapter rejects optimized arms, authored challenges and a selected best repetition", () => {
  const record = { id: "C01", caseId: "C01", message: "Exact input.", inputSHA256: digest("Exact input."), model: "nano", arm: "baseline", phase: "known", replicate: 1, jobId: "known-C01-nano-baseline-r1", parsed: { disposition: "SELF_CARE", rationale: "Saved short rationale." }, failure: null, promptSHA256: "a".repeat(64) };
  assert.equal(projectNanoCase(record, artifact).replicate, 1);
  assert.throws(() => projectNanoCase({ ...record, arm: "workflow_evidence" }, artifact), /original Nano baseline/);
  assert.throws(() => projectNanoCase({ ...record, phase: "challenge" }, artifact));
  assert.throws(() => projectNanoCase({ ...record, replicate: 3 }, artifact));
  const failed = projectNanoCase({ ...record, parsed: null, failure: "Recorded failure" }, artifact);
  assert.equal(failed.status, "incomplete");
  assert.equal(failed.disposition, null);
});

test("full saved data verify: original V25 status retained and both Nano baselines complete", () => {
  const result = loadHistoricalCaseReview(ROOT);
  assert.deepEqual(result.models.map((m) => m.id), ["v25", "nano-r1", "nano-r2"]);
  assert(result.models.every((m) => m.records.length === 50));
  assert.equal(result.integrity.nanoVerifiedGenerationJobs, 1568);
  assert.equal(result.integrity.nanoRawParsedParity, 1568);
  assert.equal(result.integrity.v25HistoricalScoreReplayed, true);
  const v25 = result.models[0];
  assert.equal(v25.records.filter((r) => r.disposition === null).length, 23);
  assert.deepEqual(v25.historical, { originalReference: "physician-system-reference-v2", exactRouteSuccesses: 21, allCaseReferenceDenominator: 49, completed: 27, attempts: 50, completedAgreementDenominator: 27 });
  assert.equal(v25.records[3].disposition, null);
  assert.equal(v25.records[48].disposition, null);
  assert.equal(v25.records[48].earlyActions[0].originalDisposition, "SAME_DAY_IN_PERSON");
  assert.equal(v25.records[11].originalDisposition, "SAME_DAY_IN_PERSON");
  assert.equal(v25.records[11].disposition, "URGENT_ESCALATION");
  for (const model of result.models) {
    assert.deepEqual(model.records.map((r) => r.id), Array.from({ length: 50 }, (_, i) => `C${String(i + 1).padStart(2, "0")}`));
    for (const row of model.records) for (const path of Object.values(row.artifactPaths)) assert.equal(result.provenance[path], row.artifactHashes[path]);
  }
  assert.equal(result.models[1].records[48].disposition, "ASYNC_PHYSICIAN");
  assert.equal(result.models[2].records[48].disposition, "ASYNC_PHYSICIAN");
  assert(!JSON.stringify(result.models).includes("estimatedUSD"));
  assert(!JSON.stringify(result.models).includes("accountedUSD"));
});

test("historical publication snapshot detects tampering, addition, deletion and symlinks", () => {
  const root = mkdtempSync(join(tmpdir(), "historical-review-test-"));
  const dirs = ["outputs/v25-path-b-complete-2026-09-15", "outputs/v25-path-b-complete-replay-2026-09-15", "outputs/v25-path-b-live-2026-09-15"];
  try {
    for (const dir of dirs) cpSync(resolve(ROOT, dir), resolve(root, dir), { recursive: true });
    verifyV25PublicationSnapshot(root);
    const path = resolve(root, dirs[2], "C01-attempt.json"), bytes = readFileSync(path);
    writeFileSync(path, Buffer.concat([bytes, Buffer.from(" ")]));
    assert.throws(() => verifyV25PublicationSnapshot(root), /bytes changed/);
    writeFileSync(path, bytes);
    const added = resolve(root, dirs[2], "unexpected.json");
    writeFileSync(added, "{}");
    assert.throws(() => verifyV25PublicationSnapshot(root), /file set changed/);
    rmSync(added);
    rmSync(path);
    assert.throws(() => verifyV25PublicationSnapshot(root), /file set changed/);
    symlinkSync(resolve(ROOT, dirs[2], "C01-attempt.json"), path);
    assert.throws(() => verifyV25PublicationSnapshot(root), /Symlink/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
