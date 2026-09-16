/** Read-only projection of frozen historical studies. No inference or study writes. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseCsv } from "../src/lib/csv.mjs";
import { scoreV25PathB } from "../src/evaluation/v25-path-b.ts";
import { verifyWorkflowGeneration } from "./score-workflow-aware.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const V25_BASE = "outputs/v25-path-b-complete-2026-09-15";
const V25_REPLAY = "outputs/v25-path-b-complete-replay-2026-09-15";
const V25_PRIOR = "outputs/v25-path-b-live-2026-09-15";
const NANO_BASE = "outputs/workflow-aware-disposition-2026-09-16/study";
const V25_ROOTS = [V25_BASE, V25_REPLAY, V25_PRIOR];
// New publication-integrity snapshot of all retained files in these three
// historical directories. This is not a retroactive preregistration claim.
export const V25_PUBLICATION_SNAPSHOT = Object.freeze({ files: 567, sha256: "9ac03176d90aa1be0e51eee919f715a758feecdf6f8615732797822c70c8ad6b" });
const BUCKETS = ["SELF_CARE", "ASYNC_PHYSICIAN", "URGENT_ESCALATION"];
const hash = (value) => createHash("sha256").update(value).digest("hex");
const json = (root, path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const fileHash = (root, path) => hash(readFileSync(resolve(root, path)));
const assertIDs = (rows) => assert.deepEqual(rows.map((r) => r.id).sort(), Array.from({ length: 50 }, (_, i) => `C${String(i + 1).padStart(2, "0")}`), "Exactly C01–C50 are required");

export function collapseHistoricalRoute(route) {
  const mapped = { SELF_CARE: "SELF_CARE", ASYNC_PHYSICIAN: "ASYNC_PHYSICIAN", PRIORITY_ASYNC: "ASYNC_PHYSICIAN", STANDARD_ASYNC: "ASYNC_PHYSICIAN", SAME_DAY_IN_PERSON: "URGENT_ESCALATION", EMERGENCY_NOW: "URGENT_ESCALATION" }[route];
  assert(mapped, "Unknown historical route");
  return mapped;
}

/** Reject additions, deletions, byte changes and symlinks in the saved bundle. */
export function verifyV25PublicationSnapshot(root = ROOT) {
  function walk(path) {
    assert(!lstatSync(resolve(root, path)).isSymbolicLink(), "Symlink in historical source");
    return readdirSync(resolve(root, path), { withFileTypes: true }).flatMap((entry) => {
      const next = `${path}/${entry.name}`;
      assert(!entry.isSymbolicLink(), "Symlink in historical source");
      if (entry.isDirectory()) return walk(next);
      assert(entry.isFile(), "Unexpected historical source type");
      return [next];
    });
  }
  const paths = V25_ROOTS.flatMap(walk).sort();
  const entries = paths.map((path) => [path, fileHash(root, path)]);
  assert.equal(entries.length, V25_PUBLICATION_SNAPSHOT.files, "Historical bundle file set changed");
  assert.equal(hash(JSON.stringify(entries)), V25_PUBLICATION_SNAPSHOT.sha256, "Historical bundle bytes changed");
  return Object.fromEntries(entries);
}

function verifyPlanFingerprint(plan) {
  const { fingerprint, ...body } = plan;
  assert.equal(hash(JSON.stringify(body)), fingerprint, "Historical plan fingerprint changed");
}

function exactMessage(record, expected) {
  assert.equal(record.message, expected.message, "Historical input differs from assignment message");
  assert.equal(record.inputHash ?? record.inputSHA256, hash(expected.message), "Historical input hash mismatch");
}

/** Pure allowlisted projection. Proposed/fallback answers never become releases. */
export function projectV25Case({ row, run, admission, message, artifacts }) {
  assert.equal(row.id, admission.id);
  assert.equal(row.runId, run.runId);
  assert.equal(row.runId, admission.runId);
  exactMessage(run, { message });
  const complete = row.complete_gates_only === true;
  if (complete) {
    assert.equal(admission.eligible, true, "Ineligible first attempt cannot be complete");
    assert.equal(row.status, "complete");
    assert.equal(run.status, "complete");
    assert.equal(row.release, "gates_only");
    assert.equal(typeof run.answer?.reason, "string");
    assert.equal(run.answer.disposition, row.finalRoute === "PRIORITY_ASYNC" || row.finalRoute === "STANDARD_ASYNC" ? "ASYNC_PHYSICIAN" : row.finalRoute);
  } else {
    assert.equal(row.finalRoute, null, "Incomplete release cannot have a final route");
  }
  const earlyActions = (run.responseEvents ?? []).filter((e) => e.kind === "action").map((e) => {
    assert.equal(typeof e.notice?.directive, "string");
    return { originalDisposition: e.notice.disposition, disposition: collapseHistoricalRoute(e.notice.disposition), directive: e.notice.directive, label: "Issued early action; not a completed release" };
  });
  return {
    id: row.id, message, status: complete ? "complete" : "incomplete",
    disposition: complete ? collapseHistoricalRoute(row.finalRoute) : null,
    rationale: complete ? run.answer.reason : null,
    originalDisposition: complete ? row.finalRoute : null,
    failureReason: complete ? null : row.failure ?? "No eligible completed release",
    sourceStatus: row.status,
    traceSummary: {
      runId: run.runId, storedStatus: run.status, release: row.release,
      completedRelease: complete, modelCalls: run.modelCalls,
      roles: (run.agents ?? []).map((a) => ({ role: a.role, model: a.model, calls: a.modelCalls })),
      failedChecks: [...row.failedChecks], earlyActions,
      unsupportedClaims: "not_assessed", unsafeAdvice: "not_assessed",
    },
    earlyActions,
    artifactPaths: Object.fromEntries(artifacts.map((a) => [a.kind, a.path])),
    artifactHashes: Object.fromEntries(artifacts.map((a) => [a.path, a.sha256])),
  };
}

/** Pure projection admits both registered baseline repetitions, never best-arm selection. */
export function projectNanoCase(record, artifacts) {
  assert.equal(record.model, "nano");
  assert.equal(record.arm, "baseline", "Only the original Nano baseline is admitted");
  assert.equal(record.phase, "known");
  assert([1, 2].includes(record.replicate));
  assert.equal(record.id, record.caseId);
  assert.equal(record.inputSHA256, hash(record.message));
  if (record.parsed) {
    assert(BUCKETS.includes(record.parsed.disposition));
    assert.equal(typeof record.parsed.rationale, "string");
    assert.equal(record.failure, null);
  } else assert.equal(typeof record.failure, "string");
  return {
    id: record.id, message: record.message, status: record.parsed ? "complete" : "incomplete",
    disposition: record.parsed?.disposition ?? null, rationale: record.parsed?.rationale ?? null,
    originalDisposition: record.parsed?.disposition ?? null,
    failureReason: record.failure, sourceStatus: record.parsed ? "complete" : "failed",
    replicate: record.replicate,
    traceSummary: { jobId: record.jobId, arm: "baseline", repetition: record.replicate, modelCalls: 1, promptSHA256: record.promptSHA256 },
    earlyActions: [],
    artifactPaths: Object.fromEntries(artifacts.map((a) => [a.kind, a.path])),
    artifactHashes: Object.fromEntries(artifacts.map((a) => [a.path, a.sha256])),
  };
}

export function loadHistoricalCaseReview(root = ROOT) {
  root = resolve(root);
  const sourceArtifacts = verifyV25PublicationSnapshot(root);
  const verified = verifyWorkflowGeneration(resolve(root, NANO_BASE), root);
  const cases = parseCsv(readFileSync(resolve(root, "data/patient_messages.csv"), "utf8"));
  assertIDs(cases);
  const caseMap = new Map(cases.map((c) => [c.id, c]));
  const plan = json(root, `${V25_BASE}/manifest.json`);
  verifyPlanFingerprint(plan); verifyPlanFingerprint(plan.base);
  assert.equal(plan.base.protocol, "v25-path-b-live-http/v1");
  for (const [path, expected] of Object.entries(plan.priorFiles)) {
    assert(path.startsWith(`${V25_PRIOR}/`) && !path.includes(".."));
    assert.equal(sourceArtifacts[path], expected, "Original four-attempt artifacts changed");
  }
  assertIDs(plan.base.cases);
  for (const c of plan.base.cases) exactMessage(c, caseMap.get(c.id));
  const replayManifest = json(root, `${V25_REPLAY}/manifest.json`);
  assert.equal(replayManifest.referencePath, "data/evaluation/physician-system-reference-v2.json");
  assert.equal(replayManifest.referenceSha256, "19a37b5ab11f7ed4f266d0d4adb0bf8dd4ba977a6aed1af7c83e3b8bfc6c6598");
  for (const [path, expected] of Object.entries(replayManifest.scorerDependencies)) {
    assert(path.startsWith("src/") && !path.includes(".."));
    assert.equal(fileHash(root, path), expected, "Historical scorer dependency changed");
    sourceArtifacts[path] = expected;
  }
  assert.equal(fileHash(root, replayManifest.referencePath), replayManifest.referenceSha256);
  sourceArtifacts[replayManifest.referencePath] = replayManifest.referenceSha256;
  const original = json(root, `${V25_BASE}/scorecard.json`).pathB;
  const replay = json(root, `${V25_REPLAY}/scorecard.json`).pathB;
  assert.deepEqual(original, replay, "Historical scorecards differ");
  assertIDs(original.cases);
  const admissions = json(root, `${V25_REPLAY}/attempt-admission.json`);
  assertIDs(admissions);
  assert.deepEqual(admissions, json(root, `${V25_BASE}/runtime/attempt-admission.json`));
  const runs = original.cases.map((row) => {
    assert.match(row.runId, /^[a-f0-9-]{36}$/);
    const runPath = `${V25_REPLAY}/diagnostic-runs/${row.runId}.json`;
    const run = json(root, runPath);
    const originalPath = `${Number(row.id.slice(1)) <= 4 ? V25_PRIOR : V25_BASE}/${row.id}-run.json`;
    assert.deepEqual(run, json(root, originalPath), "Replay record differs from original first attempt");
    return run;
  });
  const replayed = scoreV25PathB(json(root, replayManifest.referencePath), runs, plan.base.promptHash, admissions);
  assert.deepEqual(replayed, original, "V25 historical score replay failed");
  assert.equal(original.complete, 27);
  assert.equal(original.agreement.numerator, 21);
  assert.equal(original.agreement.denominator, 27);
  const v25 = original.cases.map((row, i) => {
    const path = `${Number(row.id.slice(1)) <= 4 ? V25_PRIOR : V25_BASE}/${row.id}-run.json`;
    return projectV25Case({ row, run: runs[i], admission: admissions.find((a) => a.id === row.id), message: caseMap.get(row.id).message,
      artifacts: [{ kind: "run", path, sha256: sourceArtifacts[path] }, { kind: "scorecard", path: `${V25_BASE}/scorecard.json`, sha256: sourceArtifacts[`${V25_BASE}/scorecard.json`] }] });
  });

  const nano = [1, 2].map((replicate) => {
    const records = verified.records.filter((r) => r.model === "nano" && r.arm === "baseline" && r.phase === "known" && r.replicate === replicate).sort((a, b) => a.id.localeCompare(b.id));
    assertIDs(records);
    return records.map((r) => {
      exactMessage(r, caseMap.get(r.id));
      const paths = [r.requestPath, `raw/${r.jobId}.json`, `parsed/${r.jobId}.json`];
      const artifacts = paths.map((name) => {
        const path = `${NANO_BASE}/${name}`;
        const sha256 = verified.complete.artifactHashes[name];
        assert.equal(fileHash(root, path), sha256);
        sourceArtifacts[path] = sha256;
        return { kind: name.startsWith("requests/") ? "request" : name.split("/")[0], path, sha256 };
      });
      return projectNanoCase(r, artifacts);
    });
  });
  for (const path of ["data/patient_messages.csv", `${NANO_BASE}/manifest.json`, `${NANO_BASE}/generation-complete.json`]) sourceArtifacts[path] = fileHash(root, path);
  return {
    schema: "historical-case-review-adapter/v1", sourceArtifacts, provenance: sourceArtifacts,
    integrity: { v25PublicationSnapshot: V25_PUBLICATION_SNAPSHOT, v25HistoricalScoreReplayed: true, nanoVerifiedGenerationJobs: verified.audit.verifiedJobs, nanoRawParsedParity: verified.audit.rawParsedParity },
    models: [
      { id: "v25", label: "Historical V25 · completed releases", default: true, records: v25,
        provenance: "Frozen first attempts; five routes collapsed for this display. Only 27/50 had eligible completed releases. The 23 incomplete cases have no completed disposition; separately issued early actions do not change that status.",
        referenceNote: "Any physician-v3 comparison is a newly derived diagnostic. Preserve the original v2 result: 21/49 all-case exact-route successes and 21/27 agreement among eligible completed releases. This display does not establish delivery to a patient or completed care.",
        historical: { originalReference: "physician-system-reference-v2", exactRouteSuccesses: 21, allCaseReferenceDenominator: 49, completed: 27, attempts: 50, completedAgreementDenominator: 27 } },
      ...nano.map((records, i) => ({ id: `nano-r${i + 1}`, label: `Nemotron Nano · baseline A · repetition ${i + 1}`, default: i === 0, records,
        provenance: "Existing local Nemotron 3 Nano Q5 configuration; frozen baseline A, known 50-case phase. Repetitions are shown separately and are not additional independent patients. No highest-scoring arm selection.",
        referenceNote: "Familiar development messages; single-physician post-output v3 reference. No independent clinical validation or promotion." })),
    ],
    inferenceEnabled: false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 2, "This read-only verifier takes no arguments");
  const data = await loadHistoricalCaseReview();
  console.log(JSON.stringify({ schema: data.schema, models: data.models.map(({ id, records }) => ({ id, cases: records.length, complete: records.filter((r) => r.status === "complete").length })), integrity: data.integrity, inferenceEnabled: false }, null, 2));
}
