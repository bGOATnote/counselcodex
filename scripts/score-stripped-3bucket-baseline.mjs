/** Offline scorecards only. This module makes no provider calls. */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseCsv } from "../src/lib/csv.mjs";
import { ROOT, DEFAULT_OUTPUT, BUCKETS, buildRequest, loadCases, parseDisposition, readJSON, sha256, verifyProtectedFiles, writeJSON } from "./stripped-3bucket-baseline.mjs";

// Post-generation scorecard mapping only; the generator never imports this module.
export const ROUTE_TO_BUCKET = Object.freeze({
  SELF_CARE: "SELF_CARE", PRIORITY_ASYNC: "ASYNC_PHYSICIAN", STANDARD_ASYNC: "ASYNC_PHYSICIAN",
  SAME_DAY_IN_PERSON: "URGENT_ESCALATION", EMERGENCY_NOW: "URGENT_ESCALATION",
});
function verifyPredictions(predictions) {
  assert.equal(predictions.length, 50);
  assert.equal(new Set(predictions.map((p) => p.id)).size, 50);
  assert.ok(predictions.every((p, i) => p.id === `C${String(i + 1).padStart(2, "0")}` && BUCKETS.includes(p.parsed.disposition)));
}
export function scorePhysician(predictions, reference) {
  verifyPredictions(predictions);
  assert.equal(reference.cases.length, 50);
  assert.equal(new Set(reference.cases.map((c) => c.id)).size, 50);
  const rows = predictions.map(({ id, parsed }) => {
    const entry = reference.cases.find((c) => c.id === id);
    assert.ok(entry, `Missing physician case ${id}`);
    const acceptedRoutes = entry.reference.acceptedRoutes;
    if (id === "C25") return { id, disposition: parsed.disposition, acceptedRoutes, acceptedBuckets: null, included: false, agrees: null, note: entry.reference.note ?? null };
    assert.ok(Array.isArray(acceptedRoutes) && acceptedRoutes.length > 0, `Missing acceptedRoutes for ${id}`);
    assert.ok(acceptedRoutes.every((r) => ROUTE_TO_BUCKET[r]), `Unknown physician route for ${id}`);
    const acceptedBuckets = [...new Set(acceptedRoutes.map((route) => ROUTE_TO_BUCKET[route]))];
    return { id, disposition: parsed.disposition, acceptedRoutes, acceptedBuckets, included: true, agrees: acceptedBuckets.includes(parsed.disposition) };
  });
  const included = rows.filter((r) => r.included), agree = included.filter((r) => r.agrees).length;
  assert.equal(included.length, 49);
  return { scorecard: "A", reference: "physician-system-reference-v2 acceptedRoutes mapped to three buckets", mapping: ROUTE_TO_BUCKET, denominator: 49, agree, agreement: agree / 49, missCount: 49 - agree, withinFiveOfPhysicianLabels: 49 - agree <= 5, excludedIds: ["C25"], rows };
}
export function scoreCSV(predictions, csvRows) {
  verifyPredictions(predictions);
  assert.equal(csvRows.length, 50);
  assert.equal(new Set(csvRows.map((c) => c.id)).size, 50);
  const rows = predictions.map(({ id, parsed }) => {
    const entry = csvRows.find((c) => c.id === id);
    assert.ok(entry && BUCKETS.includes(entry.disposition), `Missing or invalid CSV case ${id}`);
    return { id, disposition: parsed.disposition, csvBucket: entry.disposition, agrees: parsed.disposition === entry.disposition };
  });
  const agree = rows.filter((r) => r.agrees).length;
  return { scorecard: "B", reference: "original assignment CSV three-bucket labels", denominator: 50, agree, agreement: agree / 50, missCount: 50 - agree, rows };
}

export function score(output = DEFAULT_OUTPUT, referencePath = join(ROOT, "data/evaluation/physician-system-reference-v2.json")) {
  output = resolve(output); referencePath = resolve(referencePath);
  // Generation and integrity checks finish BEFORE the physician reference is opened.
  const complete = readJSON(join(output, "generation-complete.json"));
  assert.equal(complete.providerCalls, 50); assert.equal(complete.validDispositions, 50);
  assert.deepEqual(complete.failedCases, []);
  for (const [name, hash] of Object.entries(complete.artifactHashes)) assert.equal(sha256(readFileSync(join(output, name))), hash, `Frozen artifact drift: ${name}`);
  const manifest = readJSON(join(output, "manifest.json"));
  verifyProtectedFiles(manifest);
  const csvText = readFileSync(manifest.csvPath, "utf8");
  assert.equal(sha256(csvText), manifest.csvSHA256);
  const cases = loadCases(csvText), requestIds = [], messageIds = [];
  const predictions = cases.map((c, i) => {
    assert.deepEqual(manifest.cases[i], { ...c, inputSHA256: sha256(c.message) });
    const request = readJSON(join(output, `${c.id}-request.json`));
    assert.equal(request.id, c.id); assert.equal(request.inputSHA256, sha256(c.message));
    assert.deepEqual(request.body, buildRequest(c, manifest.settings.model));
    const raw = readJSON(join(output, `${c.id}-raw.json`));
    assert.equal(raw.status, 200); assert.ok(raw.requestId);
    const response = JSON.parse(raw.responseText);
    assert.ok(response.id); assert.equal(response.model, manifest.settings.model);
    requestIds.push(raw.requestId); messageIds.push(response.id);
    const record = readJSON(join(output, `${c.id}-parsed.json`));
    assert.equal(record.id, c.id); assert.equal(record.providerCalls, 1); assert.equal(record.failure, null);
    assert.deepEqual(record.parsed, parseDisposition(response));
    return record;
  });
  assert.equal(new Set(requestIds).size, 50); assert.equal(new Set(messageIds).size, 50);
  const referenceReadAt = new Date().toISOString();
  assert.ok(referenceReadAt >= complete.completedAt);
  const referenceText = readFileSync(referencePath, "utf8"), reference = JSON.parse(referenceText);
  assert.equal(reference.datasetSha256, manifest.csvSHA256);
  for (const c of cases) {
    const entry = reference.cases.find((r) => r.id === c.id);
    assert.equal(entry?.message, c.message); assert.equal(entry?.inputHash, sha256(c.message));
  }
  const A = { ...scorePhysician(predictions, reference), referencePath, referenceSHA256: sha256(referenceText), scoredAt: referenceReadAt };
  // The CSV scoring function receives no physician reference or physician score.
  const B = { ...scoreCSV(predictions, parseCsv(csvText)), csvPath: manifest.csvPath, csvSHA256: manifest.csvSHA256, scoredAt: referenceReadAt };
  const audit = {
    verifiedAt: referenceReadAt, generationCompletedAt: complete.completedAt, providerCalls: 50, uniqueProviderRequestIds: 50, uniqueProviderMessageIds: 50,
    exactMessageOnlyPayloads: 50, parsedOutputsMatchRaw: 50, frozenArtifactsVerified: Object.keys(complete.artifactHashes).length,
    existingApplicationFilesUnchanged: Object.keys(manifest.protectedFiles).length,
    physicianScoreUsesOnlyMappedAcceptedRoutes: true, csvScoreComputedSeparately: true,
    scorerSHA256: sha256(readFileSync(new URL(import.meta.url))),
  };
  for (const [name, value] of [["scorecard-A-physician.json", A], ["scorecard-B-csv.json", B], ["scoring-audit.json", audit]]) {
    const path = join(output, name);
    if (!existsSync(path)) writeJSON(path, value);
    else {
      const previous = readJSON(path);
      // Re-scoring verifies existing results without changing original timestamps.
      for (const key of Object.keys(value)) if (!["scoredAt", "verifiedAt"].includes(key)) assert.deepEqual(previous[key], value[key], `Existing scorecard changed: ${name}/${key}`);
    }
  }
  console.log(JSON.stringify({ physician: `${A.agree}/49`, csv: `${B.agree}/50`, withinFive: A.withinFiveOfPhysicianLabels, physicianMisses: A.rows.filter((r) => r.included && !r.agrees), csvMisses: B.rows.filter((r) => !r.agrees), audit }, null, 2));
  return { A, B, audit };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) score(...process.argv.slice(2));
