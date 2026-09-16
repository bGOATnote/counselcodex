/** Offline structural expansion experiment. Never imported by the live router.
 * Supplements an already retrieved document with its matching Recommendations
 * subsection; no patient classification, expected route, or new model call.
 */
import { restoreCorpus, type Hit, type Retrieval } from "./model.ts";
import { selectDispositionEvidence, type RetrievalIntent } from "./v26.ts";
import { isDeepStrictEqual } from "node:util";

export const SECTION_EXPANSION_POLICY = "same-document-recommendations/v1";
export type SectionReplacementMode = "capacity_only" | "same_document";
const OMIT = new Set("a an and are as at be by for from how in is it of on or the their then this to when with without body full text step recommendations".split(" "));
const tokens = (s: string) => new Set((s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(t => t.length > 2 && !OMIT.has(t)));
const queryOverlap = (queries: string[], heading: string) => {
  const terms = tokens(heading);
  return Math.max(0, ...queries.map(q => { const ts = [...tokens(q)]; return ts.length ? ts.filter(t => terms.has(t)).length / ts.length : 0; }));
};
/** This protects existing action text against displacement, not clinical meaning.
 * Negated/conditional instructions are protected too; this never emits a route.
 */
export const hasExplicitActionText = (h: Hit) => /call\s+(?:9[- ]?1[- ]?1|an ambulance)|(?:get|seek)\s+(?:emergency|immediate|urgent)\s+(?:help|care|attention)|go\s+to\s+(?:the\s+)?emergency/i.test(h.chunk.text);

export function createSupportSectionExpander(rawCorpus: unknown) {
  // Restore once from retained documents + quarantine, never trust a serialized
  // chunk inventory or mutate/rebuild the embedding index.
  const corpus = restoreCorpus(rawCorpus);
  const chunks = new Map(corpus.chunks.map(c => [c.id, c]));
  const documents = new Map(corpus.documents.map(d => [d.id, d]));
  const recommendations = corpus.chunks.filter(c => /\/ Recommendations$/i.test(c.sectionTitle));
  return function expand(packets: Retrieval[], intent: RetrievalIntent, limit = 9, replacementMode: SectionReplacementMode = "capacity_only") {
    if (!["capacity_only", "same_document"].includes(replacementMode)) throw new Error("INVALID_EXPANSION_REPLACEMENT_MODE");
    if (packets.some(p => p.corpusHash !== corpus.hash)) throw new Error("EXPANSION_CORPUS_MISMATCH");
    const baseline = selectDispositionEvidence(packets, intent, limit);
    for (const hit of packets.flatMap(p => p.hits)) {
      const retained = chunks.get(hit.chunk.id), document = documents.get(hit.document.id);
      if (!retained || !document) throw new Error("EXPANSION_PASSAGE_NOT_IN_ACTIVE_CORPUS");
      const { sections, ...metadata } = document, section = sections[retained.section];
      const context = { before: section.text.slice(Math.max(0, retained.start - 300), retained.start), after: section.text.slice(retained.end, retained.end + 300) };
      if (!isDeepStrictEqual(retained, hit.chunk) || !isDeepStrictEqual(metadata, hit.document) || !isDeepStrictEqual(context, hit.context)) throw new Error("EXPANSION_PASSAGE_NOT_IN_ACTIVE_CORPUS");
    }
    const selected = [...baseline.hits], baselineIds = new Set(selected.map(h => h.chunk.id));
    const additions: { id: string; anchor: string; family: string; overlap: number; replaced: string | null }[] = [];
    const skipped: { id: string; reason: string }[] = [];
    if (intent !== "education") {
      const proposals = recommendations.flatMap(chunk => {
        if (baselineIds.has(chunk.id)) return [];
        const family = chunk.sectionTitle.replace(/\/ Recommendations$/i, "").trim();
        const anchor = baseline.hits.find(h => h.document.id === chunk.documentId
          && (h.chunk.sectionTitle === family || h.chunk.sectionTitle.startsWith(`${family} / `)));
        if (!anchor) return [];
        const queries = packets.filter(p => p.hits.some(h => h.chunk.id === anchor.chunk.id)).map(p => p.query);
        const overlap = queryOverlap(queries, family);
        return overlap > 0 ? [{ chunk, anchor, family, overlap }] : [];
      }).sort((a,b) => b.overlap - a.overlap || baseline.hits.indexOf(a.anchor) - baseline.hits.indexOf(b.anchor) || a.chunk.id.localeCompare(b.chunk.id));
      const expandedDocuments = new Set<string>();
      for (const proposal of proposals) {
        if (expandedDocuments.has(proposal.chunk.documentId) || additions.length >= 2) continue;
        const document = documents.get(proposal.chunk.documentId)!;
        // Preserve a whole section (all qualifiers), not its first truncation.
        const sectionChunks = corpus.chunks.filter(c => c.documentId === document.id && c.section === proposal.chunk.section);
        if (sectionChunks.length !== 1) { skipped.push({ id: proposal.chunk.id, reason: "recommendations_section_exceeds_one_chunk" }); continue; }
        const first = selected.find(h => h.document.id === document.id)!;
        let replacement = -1;
        if (selected.length === limit) {
          // Default candidate never trades existing support for new support.
          // Keep the earlier replacement arm explicitly reproducible: its
          // observed medication-section regression is not erased or relabelled.
          if (replacementMode === "capacity_only") { skipped.push({ id: proposal.chunk.id, reason: "packet_capacity_preserved" }); continue; }
          replacement = selected.findLastIndex(h => h.document.id === document.id && h.chunk.id !== first.chunk.id
            && baselineIds.has(h.chunk.id) && !hasExplicitActionText(h) && !/\/ Recommendations$/i.test(h.chunk.sectionTitle)
            && packets.every(p => !p.hits.some(x => x.chunk.id === h.chunk.id) || selected.some(other => other.chunk.id !== h.chunk.id && p.hits.some(x => x.chunk.id === other.chunk.id))));
          if (replacement < 0) { skipped.push({ id: proposal.chunk.id, reason: "no_redundant_unprotected_slot" }); continue; }
        }
        const { sections, ...metadata } = document;
        const section = sections[proposal.chunk.section];
        const hit: Hit = { chunk: proposal.chunk, document: metadata, score: 0, channels: ["same_document_recommendations"],
          context: { before: section.text.slice(Math.max(0, proposal.chunk.start - 300), proposal.chunk.start), after: section.text.slice(proposal.chunk.end, proposal.chunk.end + 300) } };
        const replaced = replacement < 0 ? null : selected[replacement].chunk.id;
        if (replacement < 0) selected.push(hit); else selected[replacement] = hit;
        additions.push({ id: hit.chunk.id, anchor: proposal.anchor.chunk.id, family: proposal.family, overlap: proposal.overlap, replaced });
        expandedDocuments.add(document.id);
      }
    }
    return { policy: SECTION_EXPANSION_POLICY, replacementMode, corpusHash: corpus.hash, hits: selected,
      audit: { baselinePolicy: baseline.policy, limit, baselineCount: baseline.hits.length, selectedCount: selected.length, additions, skipped,
        originalExplicitActionsPreserved: baseline.hits.filter(hasExplicitActionText).every(h => selected.some(s => s.chunk.id === h.chunk.id)),
        originalDocumentCoveragePreserved: baseline.hits.every(h => selected.some(s => s.document.id === h.document.id)),
        claimSupport: "not_assessed" as const, clinicalAccuracy: "not_assessed" as const, paidCalls: 0 as const, embeddingCalls: 0 as const } };
  };
}
