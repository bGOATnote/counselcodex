import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyLocalQuarantine, validateLocalQuarantineManifest } from "../src/evidence/rag/quarantine.ts";

const manifest = JSON.parse(readFileSync(new URL("../data/evidence/local-quarantine-2026-09-14.json", import.meta.url), "utf8"));
function boundDocuments() {
  return manifest.entries.map((entry: { documentId: string; sourceVersion: string; rawHash: string }) => ({
    id: entry.documentId, sourceVersion: entry.sourceVersion, rawHash: entry.rawHash,
    currency: "not_assessed", reviewStatus: "publisher_reviewed", sections: [{ text: "Retained original AND source text." }],
  }));
}

test("checked-in engineering hold binds exactly two source copies without claiming physician or publisher action", () => {
  const parsed = validateLocalQuarantineManifest(manifest);
  assert.deepEqual(parsed.entries.map(entry => entry.documentId), ["medlineplus:34", "medlineplus:6450"]);
  assert.deepEqual(parsed.authority, { kind: "engineering_source_review", clinicalApproval: false, publisherRetraction: false });
  assert.equal(parsed.entries[0].rawHash, "83e33085ff05baf28360659853830ecb9b0da930373b2f4cf72fb4728c0c7ea7");
  assert.equal(parsed.entries[1].rawHash, "237065d20dca14cdf15369a34350ba8cac4e2f8895d250d50e7de2230188ef82");
});

test("exact identity excludes originals without mutation; unrelated IDs are not quarantined by matching text hash", () => {
  const quarantined = boundDocuments();
  const other = { ...quarantined[0], id: "another-source" };
  const documents = [other, ...quarantined];
  const before = JSON.stringify({ documents, manifest });
  const result = applyLocalQuarantine(Object.freeze(documents), manifest);
  assert.deepEqual(result.activeDocuments, [other]);
  assert.equal(result.activeDocuments[0], other);
  assert.deepEqual(result.excluded.map(entry => entry.document), quarantined);
  result.excluded.forEach((entry, i) => assert.equal(entry.document, quarantined[i]));
  assert.deepEqual(result.notPresent, []);
  assert.equal(JSON.stringify({ documents, manifest }), before);
});

test("same document ID with refreshed source version or content fails closed pending re-review", () => {
  const original = boundDocuments()[0];
  for (const changed of [{ ...original, sourceVersion: "new-source-version" }, { ...original, rawHash: "0".repeat(64) }]) {
    assert.throws(() => applyLocalQuarantine([changed], manifest), /QUARANTINE_SOURCE_CHANGED_REVIEW_REQUIRED:medlineplus:34/);
  }
});

test("duplicate source identities and malformed or misleading policy metadata are rejected", () => {
  assert.throws(() => applyLocalQuarantine([boundDocuments()[0], boundDocuments()[0]], manifest), /DUPLICATE_DOCUMENT/);
  assert.throws(() => validateLocalQuarantineManifest({ ...manifest, entries: [manifest.entries[0], manifest.entries[0]] }), /DUPLICATE_QUARANTINE_DOCUMENT/);
  for (const invalid of [
    { ...manifest, version: "unknown/v2" },
    { ...manifest, authority: { ...manifest.authority, clinicalApproval: true } },
    { ...manifest, authority: { ...manifest.authority, publisherRetraction: true } },
    { ...manifest, entries: [{ ...manifest.entries[0], rawHash: "x".repeat(64) }] },
    { ...manifest, entries: [{ ...manifest.entries[0], sourceUrl: "https://user:secret@example.org/" }] },
    { ...manifest, inventedApproval: true },
  ]) assert.throws(() => validateLocalQuarantineManifest(invalid));
});

test("policy hash ignores JSON key and entry ordering but binds clinical hold rationale and source identity", () => {
  const baseline = applyLocalQuarantine([], manifest).policyHash;
  const reordered = Object.fromEntries(Object.entries(manifest).reverse());
  reordered.entries = [...manifest.entries].reverse().map(entry => ({ ...entry, reviewedAgainst: [...entry.reviewedAgainst].reverse() }));
  assert.equal(applyLocalQuarantine([], reordered).policyHash, baseline);
  assert.match(baseline, /^[a-f0-9]{64}$/);
  for (const changed of [
    { ...manifest, entries: [{ ...manifest.entries[0], reason: "A different explicit engineering concern requiring review." }] },
    { ...manifest, entries: [{ ...manifest.entries[0], rawHash: "0".repeat(64) }] },
  ]) assert.notEqual(applyLocalQuarantine([], changed).policyHash, baseline);
});

test("absent sources remain explicitly not present, never misreported as excluded", () => {
  const result = applyLocalQuarantine([], manifest);
  assert.deepEqual(result.activeDocuments, []);
  assert.deepEqual(result.excluded, []);
  assert.deepEqual(result.notPresent.map(entry => entry.documentId), ["medlineplus:34", "medlineplus:6450"]);
});
