/** Read-only replay of saved packets. No index build, network, model calls, or
 * result-file writes. The four witnesses were authored retrospectively: this is
 * diagnostic development evidence, not a prospective or held-out benchmark. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { restoreCorpus, sha256, type Hit, type Retrieval } from "./model.ts";
import { selectGraphEvidence } from "./selection.ts";
import { selectDispositionEvidence } from "./v26.ts";
import { DISPOSITION_SUPPORT_PROBES, SAVED_PROBE_SUPPORT } from "./disposition-support-fixtures.ts";
import { measureSupportOpportunity, summarizeSupportOpportunities, SUPPORT_PROBE_VERSION } from "./disposition-support.ts";

export function replaySavedSupport(root = process.cwd()) {
  const corpus = restoreCorpus(JSON.parse(readFileSync(resolve(root, "apps/evaluation/.local/clinical-rag-v8/corpus.json"), "utf8")));
  const inputs: Record<string, string> = {}, results = [];
  for (const mode of ["lexical", "hybrid"] as const) for (const variant of ["raw", "hinted"] as const) for (const selector of ["v25", "v26"] as const) {
    const rows = []; let topicDocumentHits = 0;
    for (const mapping of SAVED_PROBE_SUPPORT) {
      const probe = DISPOSITION_SUPPORT_PROBES.find(p => p.id === mapping.supportProbe)!;
      const path = `outputs/v26-rag-${mode}-2026-09-15/${mapping.retrievalProbe}-${variant}-retrieval.json`;
      let hits: Hit[] = [], packets: Retrieval[] = [], errors: string[] = [];
      try {
        const bytes = readFileSync(resolve(root, path)); inputs[path] = sha256(bytes);
        const saved = JSON.parse(bytes.toString());
        if (!Array.isArray(saved.queries) || !saved.queries.length || !Array.isArray(saved.results) || !Array.isArray(saved.errors) ||
            saved.errors.some((e: unknown) => typeof e !== "string") || saved.results.length + saved.errors.length !== saved.queries.length) throw new Error("SAVED_QUERY_ACCOUNTING_INVALID");
        packets = saved.results;
        errors = [...saved.errors];
        if (packets.some(p => p.corpusHash !== corpus.hash)) throw new Error("SAVED_CORPUS_MISMATCH");
        if (mode === "hybrid" && packets.some(p => p.warnings.some(w => /LEXICAL_ONLY/.test(w)))) errors.push("DEGRADED_RETRIEVAL");
        hits = selector === "v25" ? selectGraphEvidence(packets, 9) : selectDispositionEvidence(packets, "triage", 9).hits;
      } catch (error) { errors.push(error instanceof Error ? error.message : "REPLAY_FAILURE"); }
      if (hits.some(h => probe.spans.some(span => span.documentId === h.document.id))) topicDocumentHits++;
      rows.push(measureSupportOpportunity(probe, hits, errors));
    }
    results.push({ mode, variant, selector, topicDocumentHits, ...summarizeSupportOpportunities(rows), rows });
  }
  return { version: SUPPORT_PROBE_VERSION, design: "Retrospective authored exact-span witnesses; no prospective clinical adjudication",
    corpusHash: corpus.hash, inputs, inputManifestHash: sha256(JSON.stringify(inputs)),
    probeHash: sha256(JSON.stringify(DISPOSITION_SUPPORT_PROBES)),
    sourceHashes: Object.fromEntries(["disposition-support.ts", "disposition-support-fixtures.ts", "disposition-support-replay.ts", "v26.ts", "selection.ts"]
      .map(name => [name, sha256(readFileSync(resolve(root, "src/evidence/rag", name)))])),
    corpusSpanAvailability: DISPOSITION_SUPPORT_PROBES.map(probe => ({ id: probe.id,
      allRequiredSpansAvailable: probe.spans.every(span => corpus.chunks.some(c => c.documentId === span.documentId && c.text.includes(span.quote))) })),
    paidCalls: 0, indexBuilds: 0, results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) console.log(JSON.stringify(replaySavedSupport(), null, 2));
