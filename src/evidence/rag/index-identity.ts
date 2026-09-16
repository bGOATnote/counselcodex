import { z } from "zod";
import { POLICY_RAG_VERSION, RAG_VERSION, restoreCorpus, type Corpus } from "./model.ts";

const count = z.number().int().nonnegative();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const statsSchema = z.object({
  chunks: count,
  documents: z.array(z.object({ count })),
  corpus: z.object({
    hash, version: z.enum([RAG_VERSION, POLICY_RAG_VERSION]), documents: count, chunks: count,
    quarantinePolicyHash: hash.optional(), excludedDocumentIds: z.array(z.string()).optional(),
    eligibleDocuments: count.optional(),
  }),
});

// Counts and committed index metadata are a startup consistency check, not a
// cryptographic audit of stored passage contents, vectors or graph endpoints.
export function verifyCorpusIndexIdentity(corpus: Corpus, rawStats: unknown) {
  const parsed = statsSchema.safeParse(rawStats);
  if (!parsed.success) throw new Error("INDEX_CORPUS_METADATA_INVALID");
  const stats = parsed.data, metadata = stats.corpus;
  if (metadata.hash !== corpus.hash || metadata.version !== corpus.version) throw new Error("INDEX_CORPUS_IDENTITY_MISMATCH");
  if (metadata.chunks !== corpus.chunks.length || stats.chunks !== corpus.chunks.length
    || metadata.documents !== corpus.documents.length || stats.documents.reduce((sum, row) => sum + row.count, 0) !== corpus.documents.length) {
    throw new Error("INDEX_CORPUS_COUNT_MISMATCH");
  }
  if (corpus.quarantine) {
    if (metadata.quarantinePolicyHash !== corpus.quarantine.policyHash
      || JSON.stringify(metadata.excludedDocumentIds) !== JSON.stringify(corpus.quarantine.excludedDocumentIds)
      || metadata.eligibleDocuments !== new Set(corpus.chunks.map(chunk => chunk.documentId)).size) {
      throw new Error("INDEX_CORPUS_QUARANTINE_MISMATCH");
    }
  } else if (metadata.quarantinePolicyHash !== undefined || metadata.excludedDocumentIds !== undefined || metadata.eligibleDocuments !== undefined) {
    throw new Error("INDEX_CORPUS_QUARANTINE_MISMATCH");
  }
  return { version: "clinical-index-identity/v1" as const, corpusHash: corpus.hash, corpusVersion: corpus.version,
    quarantinePolicyHash: corpus.quarantine?.policyHash ?? null, excludedDocumentIds: [...(corpus.quarantine?.excludedDocumentIds ?? [])],
    documents: corpus.documents.length, chunks: corpus.chunks.length, verification: "metadata-and-counts-only" as const, fullDatabaseAudit: false as const };
}

type IndexStore = { stats(): Promise<unknown>; close(): Promise<void> };

// Restore policy-bound content before opening a DB; never accept serialized
// chunks or a stripped quarantine. A rejected DB is closed before propagating
// the original diagnostic, including when metadata could not be read.
export async function openVerifiedClinicalIndex<T extends IndexStore>(rawCorpus: unknown, open: () => Promise<T>) {
  const corpus = restoreCorpus(rawCorpus);
  const store = await open();
  try {
    const identity = verifyCorpusIndexIdentity(corpus, await store.stats());
    return { store, identity };
  } catch (error) {
    try { await store.close(); } catch { /* retain the identity failure, not close noise */ }
    throw error;
  }
}
