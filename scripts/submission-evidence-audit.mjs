import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, stringifyCsv } from "../src/lib/csv.mjs";

// Offline derived analysis only. Never imports a provider or modifies frozen inputs.
// An existing audit must reproduce byte-for-byte; it is never overwritten.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "outputs/submission-audit-2026-09-15");
const sources = {};
function read(path) {
  const bytes = readFileSync(join(root, path));
  sources[path] = createHash("sha256").update(bytes).digest("hex");
  return bytes.toString("utf8");
}
const json = (path) => JSON.parse(read(path));
const mapping = {
  SELF_CARE: "SELF_CARE",
  PRIORITY_ASYNC: "ASYNC_PHYSICIAN",
  STANDARD_ASYNC: "ASYNC_PHYSICIAN",
  SAME_DAY_IN_PERSON: "URGENT_ESCALATION",
  EMERGENCY_NOW: "URGENT_ESCALATION",
};
const buckets = ["SELF_CARE", "ASYNC_PHYSICIAN", "URGENT_ESCALATION"];
const project = (route) => {
  assert.ok(mapping[route], `Unknown five-way route: ${route}`);
  return mapping[route];
};
const csv = parseCsv(read("data/patient_messages.csv"));
assert.equal(csv.length, 50);
assert.equal(new Set(csv.map((row) => row.id)).size, 50);
const reference = json("data/evaluation/physician-system-reference-v2.json");
const references = new Map(reference.cases.map((row) => [row.id, row.reference.acceptedRoutes]));
const accepted = (id) => references.get(id)?.map(project) ?? null;
const runs = [
  ["fiveWayOpusLow", "stripped-baseline-2026-09-15", true],
  ["threeBucketOpusLow", "stripped-3bucket-opus-2026-09-15", false],
  ["threeBucketFableLow", "stripped-3bucket-fable-2026-09-15", false],
  ["threeBucketFableMax", "stripped-3bucket-fable-max-2026-09-15", false],
];
const metrics = {};
const predictions = {};
let artifactHashesVerified = 0;
const requestIds = new Set();
const responseIds = new Set();
for (const [key, directory, fiveWay] of runs) {
  const prefix = `outputs/${directory}`;
  const complete = json(`${prefix}/generation-complete.json`);
  for (const [name, expectedHash] of Object.entries(complete.artifactHashes)) {
    const path = `${prefix}/${name}`;
    read(path);
    assert.equal(sources[path], expectedHash, `Hash mismatch: ${path}`);
    artifactHashesVerified += 1;
  }
  const physicianScore = json(`${prefix}/scorecard-A-physician.json`);
  const csvScore = json(`${prefix}/scorecard-B-csv.json`);
  // Text artifacts add one terminal newline; provider system content does not.
  const system = read(`${prefix}/system-prompt.txt`).replace(/\n$/, "");
  const rows = csv.map((row) => {
    const request = json(`${prefix}/${row.id}-request.json`);
    assert.deepEqual(request.body.messages, [{ role: "user", content: row.message }]);
    assert.equal(request.body.system, system);
    assert.equal(request.body.tools, undefined);
    const raw = json(`${prefix}/${row.id}-raw.json`);
    assert.equal(raw.status, 200);
    const response = JSON.parse(raw.responseText);
    assert.equal(response.stop_reason, "end_turn");
    assert.ok(!requestIds.has(raw.requestId));
    assert.ok(!responseIds.has(response.id));
    requestIds.add(raw.requestId);
    responseIds.add(response.id);
    const parsed = json(`${prefix}/${row.id}-parsed.json`);
    assert.equal(parsed.providerCalls, 1);
    assert.equal(parsed.failure, null);
    const route = fiveWay ? parsed.parsed.disposition_name : parsed.parsed.disposition;
    const bucket = fiveWay ? project(route) : route;
    assert.ok(buckets.includes(bucket));
    const exact = references.get(row.id);
    return {
      id: row.id,
      route,
      bucket,
      exactAgreement: exact === null ? null : exact.includes(route),
      mappedAgreement: exact === null ? null : accepted(row.id).includes(bucket),
      csvAgreement: row.disposition === bucket,
    };
  });
  const primaryCount = rows.filter((row) => fiveWay ? row.exactAgreement : row.mappedAgreement).length;
  const mappedCount = rows.filter((row) => row.mappedAgreement).length;
  const csvCount = rows.filter((row) => row.csvAgreement).length;
  assert.equal(primaryCount, physicianScore.agree);
  assert.equal(csvCount, csvScore.agree);
  assert.equal(physicianScore.denominator, 49);
  assert.equal(csvScore.denominator, 50);
  assert.equal(complete.providerCalls, 50);
  assert.equal(complete.validDispositions, 50);
  const latencies = complete.latencyMs.map((row) => row.latencyMs).sort((a, b) => a - b);
  assert.equal(latencies.length, 50);
  metrics[key] = {
    source: prefix,
    primaryPhysicianAgreement: primaryCount,
    primaryTaxonomy: fiveWay ? "five-way" : "three-bucket",
    mappedPhysicianAgreement: mappedCount,
    physicianDenominator: 49,
    csvAgreement: csvCount,
    csvDenominator: 50,
    providerCalls: complete.providerCalls,
    validOutputs: complete.validDispositions,
    mappedMissIds: rows.filter((row) => row.mappedAgreement === false).map((row) => row.id),
    medianProviderMs: (latencies[24] + latencies[25]) / 2,
    p95NearestRankProviderMs: latencies[Math.ceil(0.95 * latencies.length) - 1],
    estimatedUSD: complete.estimatedUSD,
    accountedUSD: complete.accountedUSD,
  };
  predictions[key] = new Map(rows.map((row) => [row.id, row]));
}
assert.equal(artifactHashesVerified, 600);
assert.equal(requestIds.size, 200);
assert.equal(responseIds.size, 200);

const v25 = json("outputs/v25-path-b-complete-2026-09-15/scorecard.json").pathB;
const v25Rows = v25.cases.map((row) => {
  assert.deepEqual(row.acceptedRoutes, references.get(row.id));
  const bucket = row.complete_gates_only ? project(row.finalRoute) : null;
  return {
    id: row.id,
    completed: row.complete_gates_only,
    originalRoute: row.finalRoute,
    mappedBucket: bucket,
    included: row.acceptedRoutes !== null,
    originalAgreement: row.complete_gates_only && row.agreement === true,
    mappedDeliveredAgreement: row.acceptedRoutes === null ? null : Boolean(row.complete_gates_only && accepted(row.id).includes(bucket)),
  };
});
const v25Original = v25Rows.filter((row) => row.originalAgreement).length;
const v25Mapped = v25Rows.filter((row) => row.mappedDeliveredAgreement).length;
const changedV25 = v25Rows.filter((row) => row.mappedDeliveredAgreement && !row.originalAgreement).map((row) => row.id);
assert.equal(v25Original, 21);
assert.equal(v25Mapped, 22);
assert.deepEqual(changedV25, ["C12"]);
assert.equal(v25Rows.filter((row) => row.completed).length, 27);
assert.equal(v25Rows.filter((row) => row.included).length, 49);

const referenceDisagreements = csv.filter((row) => accepted(row.id) !== null && !accepted(row.id).includes(row.disposition)).map((row) => row.id);
assert.equal(referenceDisagreements.length, 17);
const gui = json("outputs/stripped-gui-2026-09-15/manifest.json");
for (const [name, expectedHash] of Object.entries(gui.artifactHashes)) {
  const path = `outputs/stripped-gui-2026-09-15/${name}`;
  read(path);
  assert.equal(sources[path], expectedHash);
}
const allCaseRows = csv.map((row) => {
  const v = v25Rows.find((entry) => entry.id === row.id);
  return {
    id: row.id,
    csvLabel: row.disposition,
    physicianBuckets: accepted(row.id) === null ? "UNRESOLVED" : [...new Set(accepted(row.id))].join("|"),
    fiveWayOpusOriginalRoute: predictions.fiveWayOpusLow.get(row.id).route,
    fiveWayOpusMappedBucket: predictions.fiveWayOpusLow.get(row.id).bucket,
    threeBucketOpusLow: predictions.threeBucketOpusLow.get(row.id).bucket,
    threeBucketFableLow: predictions.threeBucketFableLow.get(row.id).bucket,
    threeBucketFableMax: predictions.threeBucketFableMax.get(row.id).bucket,
    v25Completed: v.completed,
    v25OriginalRoute: v.originalRoute ?? "NOT_COMPLETED",
    v25MappedBucket: v.mappedBucket ?? "NOT_COMPLETED",
    v25MappedDeliveredAgreement: v.mappedDeliveredAgreement === null ? "UNSCORED" : v.mappedDeliveredAgreement,
  };
});
const report = {
  schema: "submission-evidence-audit/v1",
  scope: "New offline descriptive analysis of frozen development outputs. No inference, model change, independent clinical adjudication, held-out evaluation, or historical rewrite.",
  mapping,
  plannedCases: csv.length,
  metrics,
  referenceComparison: { denominator: 49, agree: 32, disagreementIds: referenceDisagreements, excludedIds: ["C25"] },
  v25PostHocCollapse: {
    label: "post-hoc mapping of completed frozen first attempts; original score unchanged",
    completed: 27,
    attempts: 50,
    originalFiveWayDeliveredAgree: v25Original,
    mappedThreeBucketDeliveredAgree: v25Mapped,
    denominator: 49,
    conditionalCompletedDenominator: 27,
    changedCaseIds: changedV25,
    rows: v25Rows,
  },
  guiVerification: {
    source: "outputs/stripped-gui-2026-09-15/manifest.json",
    providerCalls: gui.providerCalls,
    validDispositions: gui.validDispositions,
    visibleFinalResults: gui.browserVisibleFinalResults,
    intentionallyDiscarded: gui.intentionallyDiscardedBrowserResults,
    estimatedUSD: gui.estimatedUSD,
    accountedUSD: gui.accountedUSD,
  },
  validation: { frozenBaselineArtifactHashesVerified: artifactHashesVerified, uniqueRequestIds: requestIds.size, uniqueResponseIds: responseIds.size, guiArtifactHashesVerified: Object.keys(gui.artifactHashes).length },
  sources,
};
const artifacts = {
  "audit.json": `${JSON.stringify(report, null, 2)}\n`,
  "all-case-comparison.csv": stringifyCsv(allCaseRows),
};
mkdirSync(output, { recursive: true });
for (const [name, content] of Object.entries(artifacts)) {
  const path = join(output, name);
  if (existsSync(path)) assert.equal(readFileSync(path, "utf8"), content, `Existing derived artifact differs: ${path}`);
  else writeFileSync(path, content, { flag: "wx" });
}
console.log(`Verified 600 frozen baseline hashes, 6 GUI hashes and all score denominators. V25 post-hoc collapse: ${v25Mapped}/49; original: ${v25Original}/49. Audit: ${output}`);
