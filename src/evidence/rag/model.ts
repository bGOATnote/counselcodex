import { createHash } from "node:crypto";
import { z } from "zod";
import { applyLocalQuarantine, validateLocalQuarantineManifest, type LocalQuarantineManifest } from "./quarantine.ts";

export const RAG_VERSION = "clinical-rag/v1";
export const POLICY_RAG_VERSION = "clinical-rag/v2";
export const RETRIEVAL_POLICY = "ranked-lexical-hybrid-bounded-graph/v2";
export const sha256 = (text: string | Uint8Array) => createHash("sha256").update(text).digest("hex");
export const licenseSchema = z.enum(["Apache-2.0", "CC-BY-4.0", "CC-BY-3.0", "CC-BY-2.0", "CC0-1.0", "US-PUBLIC-DOMAIN"]);
export const documentSchema = z.object({
  id: z.string().min(3), title: z.string().min(3), url: z.url(), publisher: z.string().min(2),
  kind: z.enum(["research_synthesis", "patient_summary", "primary_guideline", "clinical_review"]),
  license: licenseSchema, licenseUrl: z.url(), attribution: z.string().min(5),
  sourceVersion: z.string().min(3), rawHash: z.string().length(64), retrievedAt: z.iso.datetime(),
  publicationDate: z.string().nullable(), reviewStatus: z.enum(["upstream_physician_reviewed", "agent_compiled", "publisher_reviewed"]),
  reviewDate: z.string().nullable(), currency: z.enum(["not_assessed", "superseded", "retracted"]),
  scope: z.string().min(10), aliases: z.array(z.string()), concepts: z.array(z.string()),
  related: z.array(z.object({ target: z.string(), relation: z.enum(["related_topic", "differential"]), source: z.string() })),
  sections: z.array(z.object({ title: z.string().min(1), text: z.string().min(1) })).min(1),
}).strict();
export type ClinicalDocument = z.infer<typeof documentSchema>;
export type Chunk = { id: string; documentId: string; section: number; sectionTitle: string; start: number; end: number; text: string; hash: string; embeddingText: string };
export type Corpus = { version: typeof RAG_VERSION | typeof POLICY_RAG_VERSION; hash: string; documents: ClinicalDocument[]; chunks: Chunk[];
  quarantine?: { manifest: LocalQuarantineManifest; policyHash: string; excludedDocumentIds: string[] } };
export type Hit = { chunk: Chunk; document: Omit<ClinicalDocument, "sections">; score: number; channels: string[]; context: { before: string; after: string } };
export type Retrieval = { corpusHash: string; retrievalPolicy?: string; query: string; mode: "lexical" | "hybrid" | "hybrid-graph"; hits: Hit[]; timings: Record<string, number>; warnings: string[]; embeddingTokens: number; embeddingCacheHit: boolean };

// Lossless excerpts: character offsets refer to a retained normalized section,
// not a model-generated paraphrase. Overlap preserves local exceptions; parent
// context remains available for auditing rather than being silently discarded.
export function chunkDocument(document: ClinicalDocument, limit = 1800, overlap = 200): Chunk[] {
  if (limit < 400 || overlap < 0 || overlap >= limit / 2) throw new Error("INVALID_CHUNK_POLICY");
  return document.sections.flatMap((section, index) => {
    const result: Chunk[] = [];
    for (let start = 0; start < section.text.length;) {
      let end = Math.min(start + limit, section.text.length);
      if (end < section.text.length) {
        const boundary = section.text.lastIndexOf("\n", end);
        if (boundary > start + limit / 2) end = boundary;
        else { const space = section.text.lastIndexOf(" ", end); if (space > start + limit / 2) end = space; }
      }
      const text = section.text.slice(start, end);
      const hash = sha256(text);
      result.push({ id: sha256([document.id, document.sourceVersion, index, start, end, hash].join("\0")), documentId: document.id, section: index, sectionTitle: section.title, start, end, text, hash,
        embeddingText: `${document.title}\n${document.aliases.join("; ")}\n${section.title}\n${text}` });
      if (end === section.text.length) break;
      start = end - overlap;
    }
    return result;
  });
}
export function buildCorpus(raw: unknown[], quarantineManifest?: unknown): Corpus {
  const documents = raw.map(d => documentSchema.parse(d)).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(documents.map(d => d.id)).size !== documents.length) throw new Error("DUPLICATE_DOCUMENT");
  for (const doc of documents) {
    const url = new URL(doc.url);
    if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("UNSAFE_SOURCE_URL");
  }
  // Retain originals and publisher metadata. A local hold is not a publisher
  // retraction, and faithful source identity does not establish medical fidelity.
  if (quarantineManifest !== undefined) {
    const manifest = validateLocalQuarantineManifest(quarantineManifest);
    const checked = applyLocalQuarantine(documents, manifest);
    if (checked.notPresent.length) throw new Error("QUARANTINE_TARGET_MISSING_FROM_CORPUS");
    const quarantine = { manifest, policyHash: checked.policyHash, excludedDocumentIds: checked.excluded.map(x => x.document.id) };
    const chunks = checked.activeDocuments.filter(d => d.currency === "not_assessed").flatMap(d => chunkDocument(d));
    const hash = sha256(JSON.stringify({ version: POLICY_RAG_VERSION, documents, quarantinePolicyHash: checked.policyHash }));
    return { version: POLICY_RAG_VERSION, hash, documents, chunks, quarantine };
  }
  // Keep the no-policy v1 identity byte-compatible with historical studies.
  const chunks = documents.filter(d => d.currency === "not_assessed").flatMap(d => chunkDocument(d));
  const hash = sha256(JSON.stringify({ version: RAG_VERSION, documents }));
  return { version: RAG_VERSION, hash, documents, chunks };
}

// All restore/index/export paths rebuild from retained documents and policy,
// never from serialized chunks. A stripped policy cannot become an active v1.
export function restoreCorpus(raw: unknown): Corpus {
  const saved = z.object({ version: z.enum([RAG_VERSION, POLICY_RAG_VERSION]), hash: z.string().regex(/^[a-f0-9]{64}$/),
    documents: z.array(z.unknown()), chunks: z.unknown().optional(), quarantine: z.unknown().optional() }).strict().parse(raw);
  if ((saved.version === POLICY_RAG_VERSION) !== (saved.quarantine !== undefined)) throw new Error("CORPUS_QUARANTINE_REQUIRED_OR_UNEXPECTED");
  const policy = saved.quarantine === undefined ? undefined : z.object({ manifest: z.unknown(), policyHash: z.string().regex(/^[a-f0-9]{64}$/), excludedDocumentIds: z.array(z.string()) }).strict().parse(saved.quarantine);
  const corpus = buildCorpus(saved.documents, policy?.manifest);
  if (corpus.hash !== saved.hash || corpus.version !== saved.version) throw new Error("CORPUS_HASH_MISMATCH");
  if (policy && (corpus.quarantine!.policyHash !== policy.policyHash || JSON.stringify(corpus.quarantine!.excludedDocumentIds) !== JSON.stringify(policy.excludedDocumentIds))) throw new Error("CORPUS_QUARANTINE_IDENTITY_MISMATCH");
  return corpus;
}

export function permissiveLicense(url: string): z.infer<typeof licenseSchema> | null {
  try {
    const u = new URL(url);
    if (!["https:", "http:"].includes(u.protocol) || !["creativecommons.org", "www.creativecommons.org"].includes(u.hostname) || u.username || u.password) return null;
    const path = u.pathname.replace(/\/$/, "");
    const match = /^\/licenses\/by\/(2\.0|3\.0|4\.0)$/.exec(path);
    if (match) return `CC-BY-${match[1]}` as z.infer<typeof licenseSchema>;
    return path === "/publicdomain/zero/1.0" ? "CC0-1.0" : null;
  } catch { return null; }
}
