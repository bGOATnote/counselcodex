import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { buildCorpus, restoreCorpus, sha256, type ClinicalDocument, type Corpus } from "../src/evidence/rag/model.ts";
import { readCorpusBundle } from "../src/evidence/rag/bundle.ts";
import { ClinicalRagStore, type Embed } from "../src/evidence/rag/store.ts";
import type { LocalQuarantineManifest } from "../src/evidence/rag/quarantine.ts";

const now = "2026-09-14T00:00:00.000Z";
function document(id: string, text: string): ClinicalDocument {
  return { id, title: `${id} clinical source`, url: `https://example.org/${id}`, publisher: "Test agency", kind: "patient_summary",
    license: "US-PUBLIC-DOMAIN", licenseUrl: "https://example.org/rights", attribution: "Synthetic source fixture only",
    sourceVersion: "frozen/v1", rawHash: sha256(text), retrievedAt: now, publicationDate: null, reviewDate: null,
    reviewStatus: "publisher_reviewed", currency: "not_assessed", scope: "Authored software test, not clinical guidance",
    aliases: [], concepts: [], related: [], sections: [{ title: "Exact source", text }] };
}
const held = document("held", "QUARANTINEDMARKER original source text and its adjacent context remain retained.");
const active = { ...document("active", "Eligible source context remains available."), related: [
  { target: "held", relation: "related_topic" as const, source: "Source-authored relation retained for audit" },
  { target: "replacement", relation: "related_topic" as const, source: "Source-authored relation retained for audit" },
] };
const replacement = document("replacement", "New public source with explicit qualifiers and no rewritten attribution.");
const manifest: LocalQuarantineManifest = {
  version: "local-evidence-quarantine/v1", recordedOn: "2026-09-14",
  authority: { kind: "engineering_source_review", clinicalApproval: false, publisherRetraction: false },
  scope: "Authored test of an explicit local engineering source hold.",
  entries: [{ documentId: held.id, sourceVersion: held.sourceVersion, rawHash: held.rawHash, status: "quarantined",
    reasonCode: "engineering_source_discrepancy", reason: "Source discrepancy awaits a separate clinical fidelity review.",
    sourceUrl: held.url, reviewedAgainst: [replacement.url] }],
};

test("legacy identity stays byte-compatible; policy corpus retains originals but excludes their chunks", () => {
  const before = JSON.stringify([held, active, replacement]), legacy = buildCorpus([held, active]);
  assert.equal(legacy.version, "clinical-rag/v1");
  assert.equal(legacy.hash, sha256(JSON.stringify({ version: "clinical-rag/v1", documents: legacy.documents })));
  assert.equal(legacy.quarantine, undefined); assert.deepEqual(restoreCorpus(legacy), legacy);
  const next = buildCorpus([held, active, replacement], manifest);
  assert.equal(next.version, "clinical-rag/v2"); assert.notEqual(next.hash, legacy.hash);
  assert.deepEqual(next.documents.find(d => d.id === held.id), held);
  assert.deepEqual(next.documents.find(d => d.id === active.id)?.related, active.related);
  assert.deepEqual(next.quarantine?.excludedDocumentIds, [held.id]);
  assert.deepEqual(next.chunks.map(c => c.documentId), [active.id, replacement.id]);
  assert.equal(next.documents.find(d => d.id === held.id)?.currency, "not_assessed");
  assert.equal(next.quarantine?.manifest.authority.clinicalApproval, false);
  assert.equal(JSON.stringify([held, active, replacement]), before);
  assert.notEqual(buildCorpus(next.documents, { ...manifest, scope: "Changed explicit policy content is a new corpus identity." }).hash, next.hash);
});

test("source refresh and absent targets cannot silently clear a corpus quarantine", () => {
  for (const changed of [{ ...held, sourceVersion: "new/v2" }, { ...held, rawHash: "0".repeat(64) }]) {
    assert.throws(() => buildCorpus([changed, active], manifest), /SOURCE_CHANGED_REVIEW_REQUIRED/);
  }
  assert.throws(() => buildCorpus([active], manifest), /TARGET_MISSING_FROM_CORPUS/);
});

test("restore rejects policy stripping or mismatched metadata and never trusts serialized old chunks", () => {
  const legacy = buildCorpus([held, active]), next = buildCorpus([held, active], manifest);
  assert.deepEqual(restoreCorpus({ ...next, chunks: legacy.chunks }).chunks, next.chunks);
  assert.throws(() => restoreCorpus({ ...next, quarantine: undefined }), /QUARANTINE_REQUIRED_OR_UNEXPECTED/);
  assert.throws(() => restoreCorpus({ ...legacy, quarantine: next.quarantine }), /QUARANTINE_REQUIRED_OR_UNEXPECTED/);
  assert.throws(() => restoreCorpus({ ...next, quarantine: { ...next.quarantine, policyHash: "0".repeat(64) } }), /QUARANTINE_IDENTITY_MISMATCH/);
  assert.throws(() => restoreCorpus({ ...next, quarantine: { ...next.quarantine, excludedDocumentIds: [] } }), /QUARANTINE_IDENTITY_MISMATCH/);
  assert.throws(() => restoreCorpus({ ...next, version: "clinical-rag/v1", quarantine: undefined }), /HASH_MISMATCH/);
});

function writeBundle(directory: string, corpus: Corpus) {
  const bytes = gzipSync(JSON.stringify({ version: corpus.version, hash: corpus.hash, documents: corpus.documents,
    ...(corpus.quarantine ? { quarantine: corpus.quarantine } : {}) }));
  const record = { version: corpus.quarantine ? "clinical-rag-bundle/v2" : "clinical-rag-bundle/v1", file: "corpus.json.gz", sha256: sha256(bytes),
    corpusHash: corpus.hash, documents: corpus.documents.length, chunks: corpus.chunks.length,
    ...(corpus.quarantine ? { quarantinePolicyHash: corpus.quarantine.policyHash } : {}) };
  writeFileSync(join(directory, "corpus.json.gz"), bytes);
  writeFileSync(join(directory, "manifest.json"), JSON.stringify(record));
  return record;
}
test("v2 portable bundle round-trip binds quarantine even when byte hashes are recomputed", () => {
  const directory = mkdtempSync(join(tmpdir(), "counsel-policy-bundle-"));
  const corpus = buildCorpus([held, active, replacement], manifest), record = writeBundle(directory, corpus), path = join(directory, "manifest.json");
  assert.deepEqual(readCorpusBundle(path), corpus);
  for (const changed of [{ ...record, version: "clinical-rag-bundle/v1" }, { ...record, quarantinePolicyHash: "0".repeat(64) }]) {
    writeFileSync(path, JSON.stringify(changed)); assert.throws(() => readCorpusBundle(path), /POLICY_MISMATCH/);
  }
  const stripped = gzipSync(JSON.stringify({ version: corpus.version, hash: corpus.hash, documents: corpus.documents }));
  writeFileSync(join(directory, "corpus.json.gz"), stripped);
  writeFileSync(path, JSON.stringify({ ...record, sha256: sha256(stripped) }));
  assert.throws(() => readCorpusBundle(path), /QUARANTINE_REQUIRED_OR_UNEXPECTED/);
});

test("SQL retrieval excludes held documents through lexical, vector, graph and adjacent paths; unchanged embeddings reuse", async () => {
  const donorPath = mkdtempSync(join(tmpdir(), "counsel-policy-donor-")), nextPath = mkdtempSync(join(tmpdir(), "counsel-policy-index-"));
  const legacy = buildCorpus([held, active]), next = buildCorpus([held, active, replacement], manifest);
  const embed: Embed = async texts => ({ vectors: texts.map(() => [1, 0]), tokens: texts.length });
  const donor = await ClinicalRagStore.open(donorPath, 2);
  try { await donor.build(legacy); await donor.embedMissing(embed, new AbortController().signal, () => {}); } finally { await donor.close(); }
  const store = await ClinicalRagStore.open(nextPath, 2);
  try {
    // Deliberately provide stale serialized chunks: the index boundary must
    // rebuild from bound documents/policy instead of importing the old index.
    await store.build({ ...next, chunks: [...legacy.chunks, ...next.chunks] });
    assert.equal(await store.reuseEmbeddings(donorPath), 2);
    const requested: string[] = [];
    await store.embedMissing(async texts => { requested.push(...texts); return embed(texts, new AbortController().signal); }, new AbortController().signal, () => {});
    assert.deepEqual(requested, [next.chunks.find(c => c.documentId === replacement.id)!.embeddingText]);
    const stats = await store.stats();
    assert.equal(stats.chunks, 2); assert.equal(stats.embedded, 2); assert.equal(stats.edges, 1);
    assert.deepEqual((stats.corpus as { excludedDocumentIds: string[] }).excludedDocumentIds, [held.id]);
    assert.equal((await store.search("QUARANTINEDMARKER", { mode: "lexical" })).hits.length, 0);
    for (const mode of ["hybrid", "hybrid-graph"] as const) {
      const result = await store.search("QUARANTINEDMARKER source", { mode, embed });
      assert.equal(result.corpusHash, next.hash); assert.ok(result.hits.length);
      assert.ok(result.hits.every(h => h.document.id !== held.id));
      assert.doesNotMatch(JSON.stringify(result.hits), /QUARANTINEDMARKER/);
    }
    await assert.rejects(store.build(legacy), /IMMUTABLE_USE_NEW_DIRECTORY/);
  } finally { await store.close(); }
});

test("CLI resume and export use policy-aware restoration; migration is explicit rather than a global refresh", () => {
  const cli = readFileSync(new URL("../scripts/clinical-rag.ts", import.meta.url), "utf8");
  const exporter = readFileSync(new URL("../scripts/export-evidence-graph.ts", import.meta.url), "utf8");
  assert.match(cli, /restoreCorpus\(previous\)/); assert.match(exporter, /restoreCorpus\(source\)/);
  assert.doesNotMatch(cli, /buildCorpus\(previous\.documents\)/); assert.doesNotMatch(exporter, /buildCorpus\(source\.documents\)/);
  assert.match(cli, /EXPLICIT_MIGRATION_REQUIRES_NEW_DIRECTORY_BASE_BUNDLE_QUARANTINE_AND_NHLBI/);
  assert.match(exporter, /quarantinePolicyHash: corpus\.quarantine\.policyHash/);
});
