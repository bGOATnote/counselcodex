import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sha256 = value => createHash("sha256").update(value).digest("hex");
// Archive integrity pins, NOT an amendment to the historical registration.
export const ARCHIVE_SHA256 = Object.freeze({
  "configs/frozen-evaluation-v1.json": "9210cc9dc0628782f3d162b9c822affed182241e9d22f85e5d46007bb29ccc17",
  "outputs/frozen-agent-holdout-v1.json": "ee7400ebc1821a090ee3359604a7563becc5873e39cd273607e914ee26d99374",
  "outputs/frozen-retrieval-holdout-v1.json": "fc64294fba699195f664e264f1e6750a39d60f183058d20b5d734171a8614dea",
});

/** Read-only archived evidence validation. Never executes or relabels a new
 * candidate run as a holdout, and never changes registration or results.
 */
export async function verifyArchivedHoldout({ read = path => readFile(resolve(root, path), "utf8") } = {}) {
  const archived = {};
  for (const [path, expected] of Object.entries(ARCHIVE_SHA256)) {
    const bytes = await read(path);
    assert.equal(sha256(bytes), expected, `Archived file changed: ${path}`);
    archived[path] = JSON.parse(bytes);
  }
  const registration = archived["configs/frozen-evaluation-v1.json"];
  const retrieval = archived["outputs/frozen-retrieval-holdout-v1.json"];
  const agent = archived["outputs/frozen-agent-holdout-v1.json"];
  assert.deepEqual(retrieval.registration, registration, "Archived retrieval registration mismatch");
  assert.equal(retrieval.firstExecutedAt, registration.firstExecutedAt);
  assert.deepEqual(retrieval.verifiedFiles, { ...registration.candidateFiles, ...registration.inputFiles, ...registration.holdoutFiles, ...registration.evaluationHarnessFiles }, "Archived verified-file binding mismatch");
  const frozenSources = {};
  for (const [path, expected] of Object.entries({ ...registration.inputFiles, ...registration.holdoutFiles, ...registration.evaluationHarnessFiles })) {
    const bytes = await read(path);
    assert.equal(sha256(bytes), expected, `Frozen input or harness changed: ${path}`);
    frozenSources[path] = bytes;
  }
  const drift = [];
  for (const [path, registeredSha256] of Object.entries(registration.candidateFiles)) {
    const currentSha256 = sha256(await read(path));
    if (currentSha256 !== registeredSha256) drift.push({ path, registeredSha256, currentSha256 });
  }
  const jsonLines = path => frozenSources[path].trim().split("\n").map(line => JSON.parse(line));
  assert.equal(retrieval.benchmark.holdoutFileSha256, registration.holdoutFiles["data/retrieval/retrieval-temporal-holdout-v1.jsonl"]);
  assert.equal(retrieval.benchmark.corpusSha256, sha256(JSON.stringify(jsonLines("data/retrieval/policy-corpus-v1.jsonl"))));
  assert.equal(retrieval.benchmark.querySetSha256, sha256(JSON.stringify(jsonLines("data/retrieval/retrieval-temporal-holdout-v1.jsonl"))));
  const candidate = retrieval.benchmark.results[registration.retrievalAdmission.candidate];
  const thresholds = registration.retrievalAdmission;
  const gates = {
    corpusOrderStable: candidate.stableAcrossCorpusOrder === thresholds.requireCorpusOrderStability,
    hitAtOne: candidate.summary.hitAtOne >= thresholds.minimumHitAtOne,
    recallAtThree: candidate.summary.recallAtThree >= thresholds.minimumRecallAtThree,
    abstentionAccuracy: candidate.summary.abstentionAccuracy >= thresholds.minimumAbstentionAccuracy,
    forbiddenTopThreeRate: candidate.summary.forbiddenTopThreeRate <= thresholds.maximumForbiddenTopThreeRate,
  };
  assert.deepEqual(retrieval.gates, gates, "Archived admission gates disagree with the registered thresholds");
  assert.equal(retrieval.status, Object.values(gates).every(Boolean) ? "admitted" : "not_admitted");
  const agentCases = jsonLines("data/clinical_agent_temporal_holdout_v1.jsonl");
  assert.equal(agent.dataset, "clinical_agent_temporal_holdout_v1");
  assert.deepEqual(agent.rows.map(({ id, category }) => ({ id, category })), agentCases.map(({ id, category }) => ({ id, category })));
  assert.equal(agent.cases, agentCases.length);
  for (const row of agent.rows) assert.equal(row.passed, Object.values(row.gates).every(value => value === true));
  assert.equal(agent.passedCases, agent.rows.filter(row => row.passed).length);
  assert.equal(agent.status, agent.passedCases === agent.cases ? "passed" : "failed");
  for (const value of [retrieval, retrieval.benchmark, agent]) assert.equal(value.externalModelCalls, 0);
  assert.equal(retrieval.externalSpendUsd, 0); assert.equal(retrieval.benchmark.externalSpendUsd, 0);
  assert.equal(retrieval.benchmark.clinicalPerformanceEstimate, null); assert.equal(agent.clinicalPerformanceEstimate, null);
  return {
    schemaVersion: "counsel-archived-holdout-verification/v1", archiveIntegrityVerified: true,
    archiveSha256: ARCHIVE_SHA256, frozenInputsAndHarnessVerified: true,
    currentEligible: drift.length === 0, candidateDrift: drift,
    currentCandidateEvaluated: false, newHoldoutRun: false, providerCalls: 0,
    archivedRetrievalStatus: retrieval.status, archivedAgentStatus: agent.status,
    agentBindingLimitation: "The archived agent report has no embedded implementation/registration digest. Its unchanged content and dataset/row identity are verified here; no missing historical provenance is invented.",
    claimBoundary: registration.claimBoundary,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await verifyArchivedHoldout(), null, 2));
}
