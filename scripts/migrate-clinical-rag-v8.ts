// One-off, separately authorized source migration. No generation/judge calls.
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { parseEnv } from "node:util";
import { gzipSync } from "node:zlib";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { readCorpusBundle } from "../src/evidence/rag/bundle.ts";
import { restoreCorpus, sha256 } from "../src/evidence/rag/model.ts";
import { verifyCorpusIndexIdentity } from "../src/evidence/rag/index-identity.ts";
import { ClinicalRagStore, EMBEDDING_POLICY, openAiEmbed } from "../src/evidence/rag/store.ts";

const output = resolve("outputs/clinical-rag-v8-migration-2026-09-14");
const previous = resolve("apps/evaluation/.local/clinical-rag-v7"), next = resolve("apps/evaluation/.local/clinical-rag-v8");
const bundle = resolve("outputs/evidence-graph-development-2026-09-13/corpus/manifest.json");
const command = process.argv[2];
const save = (name: string, value: unknown) => writeFileSync(join(output, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
function tree(directory: string) {
  const files: { file: string; bytes: number; sha256: string }[] = [];
  function visit(path: string) {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error("ORIGINAL_TREE_SYMLINK_REQUIRES_REVIEW");
    if (stat.isDirectory()) for (const child of readdirSync(path).sort()) visit(join(path, child));
    else if (stat.isFile()) files.push({ file: relative(directory, path), bytes: stat.size, sha256: sha256(readFileSync(path)) });
    else throw new Error("ORIGINAL_TREE_NONFILE_REQUIRES_REVIEW");
  }
  visit(directory);
  return { directory, hash: sha256(JSON.stringify(files)), files };
}
function originals() {
  return { v7: tree(previous), bundle: tree(resolve("outputs/evidence-graph-development-2026-09-13/corpus")),
    sourceAndReview: ["data/patient_messages.csv", "data/clinician_development_review.csv"].map(file => ({ file, sha256: sha256(readFileSync(file)) })) };
}
if (command === "--prepare") {
  if (existsSync(output) || existsSync(next)) throw new Error("MIGRATION_DESTINATION_ALREADY_EXISTS");
  const before = originals();
  mkdirSync(output, { recursive: false, mode: 0o700 });
  const donor = mkdtempSync(join(tmpdir(), "counsel-v7-embedding-donor-"));
  cpSync(join(previous, "postgres"), join(donor, "postgres"), { recursive: true, errorOnExist: true, force: false });
  const donorTree = tree(join(donor, "postgres"));
  const expected = before.v7.files.filter(f => f.file.startsWith("postgres/")).map(f => ({ ...f, file: f.file.slice("postgres/".length) }));
  if (sha256(JSON.stringify(expected)) !== donorTree.hash) throw new Error("DONOR_COPY_MISMATCH");
  save("preparation.json", { createdAt: new Date().toISOString(), before, donor, donorCopyHash: donorTree.hash,
    authorization: { maximumUSD: 0.10, onlyNewChunks: 2, provider: EMBEDDING_POLICY.model, noOtherProviderCalls: true },
    scope: "New source-only corpus/index; old v7 copied while server stopped. Originals never opened as a database. No clinical approval or runtime promotion." });
  console.log(JSON.stringify({ output, donor, originalTreeHash: before.v7.hash }));
} else if (command === "--finish") {
  const prep = JSON.parse(readFileSync(join(output, "preparation.json"), "utf8"));
  if (existsSync(join(output, "embedding-started.json"))) throw new Error("MIGRATION_EMBEDDING_ALREADY_CLAIMED");
  if (JSON.stringify(originals()) !== JSON.stringify(prep.before)) throw new Error("ORIGINALS_CHANGED_BEFORE_EMBEDDING");
  const base = readCorpusBundle(bundle), corpus = restoreCorpus(JSON.parse(readFileSync(join(next, "corpus.json"), "utf8")));
  if (base.hash !== "1bb200918d063325df27bcc3b252c992220367482181a42e77e671305321b5ff" || corpus.documents.length !== 1393 || corpus.chunks.length !== 5205) throw new Error("UNEXPECTED_CORPUS_IDENTITY_OR_COUNTS");
  for (const original of base.documents) if (JSON.stringify(corpus.documents.find(d => d.id === original.id)) !== JSON.stringify(original)) throw new Error("ORIGINAL_DOCUMENT_CHANGED");
  const added = corpus.documents.filter(d => !base.documents.some(b => b.id === d.id));
  const expectedIds = ["nhlbi:high-blood-pressure-diagnosis", "nhlbi:high-blood-pressure-symptoms"];
  if (JSON.stringify(added.map(d => d.id).sort()) !== JSON.stringify(expectedIds)) throw new Error("UNEXPECTED_SOURCE_ADDITIONS");
  const newChunks = corpus.chunks.filter(c => expectedIds.includes(c.documentId));
  if (newChunks.length !== 2) throw new Error("UNEXPECTED_NEW_CHUNKS");
  const maximumInputBytes = newChunks.reduce((sum, c) => sum + Buffer.byteLength(c.embeddingText), 0);
  const conservativeCostCeilingUSD = maximumInputBytes * EMBEDDING_POLICY.inputPricePerMillion / 1_000_000;
  if (conservativeCostCeilingUSD > 0.10) throw new Error("EMBEDDING_BUDGET_BOUND_EXCEEDED");
  const env = existsSync(".env") ? parseEnv(readFileSync(".env", "utf8")) : {};
  const embed = openAiEmbed(process.env.OPENAI_API_KEY ?? env.OPENAI_API_KEY ?? "");
  const store = await ClinicalRagStore.open(join(next, "postgres"));
  let calls = 0;
  const began = new Date().toISOString();
  save("embedding-started.json", { began, corpusHash: corpus.hash, newChunks: newChunks.map(c => ({ id: c.id, documentId: c.documentId, embeddingTextHash: sha256(c.embeddingText) })),
    model: EMBEDDING_POLICY.model, dimensions: EMBEDDING_POLICY.dimensions, maximumUSD: 0.10, maximumInputBytes, conservativeCostCeilingUSD,
    note: "No retry. Only the exact two new source chunks may be sent. Retain failed/unknown-spend attempts." });
  try {
    const before = await store.stats();
    verifyCorpusIndexIdentity(corpus, before);
    const after = await store.embedMissing(async (texts, signal) => {
      if (calls !== 0 || texts.length !== 2 || JSON.stringify(texts.map(sha256).sort()) !== JSON.stringify(newChunks.map(c => sha256(c.embeddingText)).sort())) throw new Error("UNAUTHORIZED_MISSING_EMBEDDING_INPUTS");
      calls++;
      const response = await embed(texts, signal);
      save("embedding-provider-receipt.json", { completedAt: new Date().toISOString(), model: EMBEDDING_POLICY.model,
        calls, inputs: texts.length, tokens: response.tokens, inputPricePerMillion: EMBEDDING_POLICY.inputPricePerMillion,
        estimatedUSD: response.tokens * EMBEDDING_POLICY.inputPricePerMillion / 1_000_000, invoiceVerified: false });
      return response;
    }, new AbortController().signal, record => save("embedding-index-receipt.json", record), maximumInputBytes);
    if (calls !== 1 || after.embedded !== 5205) throw new Error("INCOMPLETE_MIGRATION_EMBEDDINGS");
    const identity = verifyCorpusIndexIdentity(corpus, after);
    save("index-verification.json", { verifiedAt: new Date().toISOString(), before, after, identity });
    const excluded = new Set(corpus.quarantine!.excludedDocumentIds);
    const retrievals = [];
    for (const query of ["hypertensive crisis blood pressure systolic diastolic", "high blood pressure symptoms diagnosis", "higher than 180 or higher than 120"]) {
      const retrieval = await store.search(query, { mode: "lexical", limit: 8 });
      if (retrieval.corpusHash !== corpus.hash || retrieval.hits.some(h => excluded.has(h.document.id))) throw new Error("QUARANTINED_SOURCE_RETRIEVED");
      retrievals.push(retrieval);
    }
    save("lexical-retrieval-checks.json", { note: "Real index lexical checks only; no query embeddings or semantic quality/clinical-lift claim.", retrievals });
  } catch (error) {
    save("migration-failure.json", { at: new Date().toISOString(), providerCalls: calls, error: error instanceof Error ? error.message : "MIGRATION_FAILED" });
    throw error;
  } finally { await store.close(); }

  // Source-ID census is stronger than a few sampled searches, but remains a
  // bounded audit of this migration, not a full database/tamper/safety audit.
  const db = await PGlite.create({ dataDir: join(next, "postgres"), extensions: { vector } });
  try {
    const ids = corpus.quarantine!.excludedDocumentIds;
    const heldRows = await db.query<{ docs: number; chunks: number; edges: number }>(`SELECT
      (SELECT count(*)::int FROM rag_docs WHERE id=ANY($1::text[])) docs,
      (SELECT count(*)::int FROM rag_chunks WHERE doc_id=ANY($1::text[])) chunks,
      (SELECT count(*)::int FROM rag_edges WHERE source=ANY($1::text[]) OR target=ANY($1::text[])) edges`, [ids]);
    if (JSON.stringify(heldRows.rows[0]) !== JSON.stringify({ docs: 2, chunks: 0, edges: 0 })) throw new Error("QUARANTINE_INDEX_CENSUS_FAILED");
    save("quarantine-index-census.json", { at: new Date().toISOString(), excludedDocumentIds: ids, ...heldRows.rows[0],
      note: "Original held documents remain in rag_docs; no eligible chunk or graph edge references either held source ID." });
  } finally { await db.close(); }
  const afterOriginals = originals();
  if (JSON.stringify(afterOriginals) !== JSON.stringify(prep.before)) throw new Error("ORIGINALS_CHANGED_AFTER_MIGRATION");
  save("original-integrity-verification.json", { checkedAt: new Date().toISOString(), unchanged: true, after: afterOriginals });
  mkdirSync(join(output, "corpus"));
  const compressed = gzipSync(JSON.stringify({ version: corpus.version, hash: corpus.hash, documents: corpus.documents, quarantine: corpus.quarantine }), { level: 9 });
  writeFileSync(join(output, "corpus/corpus.json.gz"), compressed, { flag: "wx" });
  save("corpus/manifest.json", { version: "clinical-rag-bundle/v2", createdAt: new Date().toISOString(), file: "corpus.json.gz", sha256: sha256(compressed),
    corpusHash: corpus.hash, quarantinePolicyHash: corpus.quarantine!.policyHash, documents: corpus.documents.length, chunks: corpus.chunks.length,
    scope: "Source-only licensed normalized text/provenance; no patient cases, reviewer labels, model answers, embeddings or clinical approval. Mixed per-source rights, not blanket Apache licensing." });
  readCorpusBundle(join(output, "corpus/manifest.json"));
  writeFileSync(join(output, "corpus/OpenEM-LICENSE-APACHE.txt"), readFileSync(join(next, "sources/OpenEM-LICENSE-APACHE.txt")), { flag: "wx" });
  save("corpus/attributions.json", corpus.documents.map(({ sections: _sections, ...d }) => d));
  save("corpus/ingestion.json", JSON.parse(readFileSync(join(next, "ingestion.json"), "utf8")));
  save("corpus/source-fetches.json", readdirSync(join(next, "sources")).filter(f => f.endsWith(".provenance.json")).sort().map(f => JSON.parse(readFileSync(join(next, "sources", f), "utf8"))));
  save("corpus/quarantine-policy.json", corpus.quarantine!.manifest);
  save("summary.json", { completedAt: new Date().toISOString(), corpusHash: corpus.hash, corpusVersion: corpus.version,
    retainedBaseDocuments: base.documents.length, addedDocumentIds: expectedIds, documents: corpus.documents.length, eligibleChunks: corpus.chunks.length,
    excludedDocumentIds: corpus.quarantine!.excludedDocumentIds, originalDocumentsChanged: 0, originalFilesChanged: 0,
    reusedEligibleEmbeddings: corpus.chunks.length - newChunks.length, newEmbeddedChunks: newChunks.length, embeddingCalls: calls,
    embeddingReceipt: "embedding-provider-receipt.json", sourceBundle: "corpus/manifest.json", runtimePromoted: false, clinicalApproval: false,
    note: "Source correction/quarantine only. Neither retrieval quality nor clinical lift has been established by this migration." });
  console.log(JSON.stringify({ output, corpusHash: corpus.hash, documents: corpus.documents.length, chunks: corpus.chunks.length, calls, runtimePromoted: false }));
} else throw new Error("Use --prepare, then the explicit clinical-rag.ts build/reuse command, then --finish. New directories and single-use embedding claim only.");
