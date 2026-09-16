import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { restoreCorpus, sha256 } from "./model.ts";

// Transport integrity, not publisher authenticity or medical validation.
// Document identity, rights metadata and clinical provenance are still required.
export function readCorpusBundle(manifestPath: string) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!["clinical-rag-bundle/v1", "clinical-rag-bundle/v2"].includes(manifest.version) || manifest.file !== "corpus.json.gz" || !/^[a-f0-9]{64}$/.test(manifest.sha256) || !/^[a-f0-9]{64}$/.test(manifest.corpusHash)) throw new Error("INVALID_CORPUS_BUNDLE_MANIFEST");
  const compressed = readFileSync(join(dirname(manifestPath), manifest.file));
  if (compressed.byteLength > 32_000_000 || sha256(compressed) !== manifest.sha256) throw new Error("CORPUS_BUNDLE_INTEGRITY_FAILURE");
  const raw = JSON.parse(gunzipSync(compressed, { maxOutputLength: 64_000_000 }).toString("utf8"));
  const corpus = restoreCorpus(raw);
  if (corpus.quarantine ? manifest.version !== "clinical-rag-bundle/v2" || manifest.quarantinePolicyHash !== corpus.quarantine.policyHash : manifest.version !== "clinical-rag-bundle/v1" || manifest.quarantinePolicyHash !== undefined) throw new Error("CORPUS_BUNDLE_POLICY_MISMATCH");
  if (corpus.version !== raw.version || corpus.hash !== raw.hash || corpus.hash !== manifest.corpusHash || corpus.chunks.length !== manifest.chunks || corpus.documents.length !== manifest.documents) throw new Error("CORPUS_BUNDLE_IDENTITY_MISMATCH");
  return corpus;
}
