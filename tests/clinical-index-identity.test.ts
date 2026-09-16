import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCorpus, sha256, type ClinicalDocument, type Corpus } from "../src/evidence/rag/model.ts";
import { openVerifiedClinicalIndex, verifyCorpusIndexIdentity } from "../src/evidence/rag/index-identity.ts";

const document: ClinicalDocument = { id: "held-source", title: "Source fixture", url: "https://example.org/source", publisher: "Test publisher",
  kind: "patient_summary", license: "US-PUBLIC-DOMAIN", licenseUrl: "https://example.org/rights", attribution: "Synthetic test source",
  sourceVersion: "source/v1", rawHash: sha256("source text"), retrievedAt: "2026-09-14T00:00:00.000Z", publicationDate: null,
  reviewStatus: "publisher_reviewed", reviewDate: null, currency: "not_assessed", scope: "Software fixture, not medical guidance",
  aliases: [], concepts: [], related: [], sections: [{ title: "Section", text: "source text" }] };
const active = { ...document, id: "active-source", url: "https://example.org/active" };
const policy = { version: "local-evidence-quarantine/v1", recordedOn: "2026-09-14",
  authority: { kind: "engineering_source_review", clinicalApproval: false, publisherRetraction: false },
  scope: "Authored engineering test quarantine, not clinical adjudication",
  entries: [{ documentId: document.id, sourceVersion: document.sourceVersion, rawHash: document.rawHash, status: "quarantined",
    reasonCode: "engineering_source_discrepancy", reason: "Synthetic source discrepancy pending review", sourceUrl: document.url,
    reviewedAgainst: [active.url] }] };
const legacy = buildCorpus([document, active]), held = buildCorpus([document, active], policy);
function stats(corpus: Corpus) {
  return { chunks: corpus.chunks.length, documents: [{ kind: "patient_summary", review: "publisher_reviewed", count: corpus.documents.length }],
    corpus: { hash: corpus.hash, version: corpus.version, documents: corpus.documents.length, chunks: corpus.chunks.length,
      ...(corpus.quarantine ? { quarantinePolicyHash: corpus.quarantine.policyHash, excludedDocumentIds: corpus.quarantine.excludedDocumentIds,
        eligibleDocuments: new Set(corpus.chunks.map(c => c.documentId)).size } : {}) } };
}

test("startup accepts exact legacy and policy index identities without claiming a full content audit", () => {
  for (const corpus of [legacy, held]) {
    const verified = verifyCorpusIndexIdentity(corpus, stats(corpus));
    assert.equal(verified.corpusHash, corpus.hash);
    assert.equal(verified.fullDatabaseAudit, false);
    assert.equal(verified.verification, "metadata-and-counts-only");
    assert.deepEqual(verified.excludedDocumentIds, corpus.quarantine?.excludedDocumentIds ?? []);
  }
});

test("mismatched, missing or malformed identity metadata is rejected", () => {
  const original = stats(held);
  for (const corpus of [null, {}, { ...original.corpus, hash: "0".repeat(64) }, { ...original.corpus, version: "clinical-rag/v1" }]) {
    assert.throws(() => verifyCorpusIndexIdentity(held, { ...original, corpus }), /INDEX_CORPUS_(METADATA_INVALID|IDENTITY_MISMATCH)/);
  }
  assert.throws(() => verifyCorpusIndexIdentity(held, stats(legacy)), /IDENTITY_MISMATCH/);
  assert.throws(() => verifyCorpusIndexIdentity(legacy, stats(held)), /IDENTITY_MISMATCH/);
});

test("metadata and actual document/chunk counts must each match restored corpus", () => {
  const original = stats(held);
  for (const changed of [{ ...original, chunks: 99 }, { ...original, documents: [{ count: 1 }] },
    { ...original, corpus: { ...original.corpus, chunks: 99 } }, { ...original, corpus: { ...original.corpus, documents: 99 } }]) {
    assert.throws(() => verifyCorpusIndexIdentity(held, changed), /COUNT_MISMATCH/);
  }
});

test("a forged matching hash alone cannot hide missing, changed or unexpected quarantine metadata", () => {
  const original = stats(held);
  for (const changed of [{ quarantinePolicyHash: undefined }, { quarantinePolicyHash: "0".repeat(64) }, { excludedDocumentIds: [] },
    { excludedDocumentIds: [document.id, document.id] }, { excludedDocumentIds: undefined }, { eligibleDocuments: 2 }, { eligibleDocuments: undefined }]) {
    assert.throws(() => verifyCorpusIndexIdentity(held, { ...original, corpus: { ...original.corpus, ...changed } }), /QUARANTINE_MISMATCH/);
  }
  const v1 = stats(legacy);
  assert.throws(() => verifyCorpusIndexIdentity(legacy, { ...v1, corpus: { ...v1.corpus, excludedDocumentIds: [] } }), /QUARANTINE_MISMATCH/);
});

test("invalid serialized corpus fails before opening; rejected DB closes; accepted DB remains caller-owned", async () => {
  let opened = 0, closed = 0;
  const bad = { stats: async () => stats(legacy), close: async () => { closed++; } };
  await assert.rejects(openVerifiedClinicalIndex({ ...held, quarantine: undefined }, async () => { opened++; return bad; }), /QUARANTINE_REQUIRED_OR_UNEXPECTED/);
  assert.equal(opened, 0); assert.equal(closed, 0);
  await assert.rejects(openVerifiedClinicalIndex(held, async () => { opened++; return bad; }), /IDENTITY_MISMATCH/);
  assert.equal(opened, 1); assert.equal(closed, 1);
  const good = { stats: async () => stats(held), close: async () => { closed++; } };
  const result = await openVerifiedClinicalIndex({ ...held, chunks: legacy.chunks }, async () => good);
  assert.equal(result.store, good); assert.equal(result.identity.chunks, held.chunks.length); assert.equal(closed, 1);
});

test("stats and close failures preserve the original startup diagnostic", async () => {
  let closed = 0;
  await assert.rejects(openVerifiedClinicalIndex(held, async () => ({ stats: async () => { throw new Error("STATS_UNAVAILABLE"); },
    close: async () => { closed++; throw new Error("CLOSE_FAILED"); } })), /STATS_UNAVAILABLE/);
  assert.equal(closed, 1);
});

test("candidate startup uses checked opener and explicitly promoted v8 source correction", () => {
  const code = readFileSync(new URL("../src/disposition/graph-runtime.ts", import.meta.url), "utf8");
  assert.match(code, /openVerifiedClinicalIndex\(JSON\.parse\(readFileSync\(join\(path, "corpus\.json"\)/);
  assert.match(code, /apps\/evaluation\/\.local\/clinical-rag-v8/);
  assert.doesNotMatch(code, /const store = await ClinicalRagStore\.open/);
});
