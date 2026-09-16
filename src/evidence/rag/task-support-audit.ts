/** Offline development diagnostic, never a router or source-ranking rule.
 * A condition description, an examination prerequisite and a care-setting
 * instruction are different evidence roles. An exact witness is an opportunity
 * to reason about that role, not proof that this patient meets its conditions.
 */
import { isDeepStrictEqual } from "node:util";
import { restoreCorpus, type Hit, type Retrieval } from "./model.ts";
import { measureSupportOpportunity } from "./disposition-support.ts";
import { accountClaimLinks } from "./v26.ts";

export const TASK_SUPPORT_AUDIT_VERSION = "authored-task-support-audit/v1";
export type EvidenceRole = "diagnostic_description" | "diagnostic_confirmation" | "care_setting_conditions" | "medication_safety" | "follow_through";
export type TaskWitness = {
  id: string; role: EvidenceRole; need: string; boundary: string;
  // null explicitly means no author-labelled corpus witness; never an empty pass.
  spans: { documentId: string; quote: string }[] | null;
};
export type AuditPacket = {
  retrieval: Retrieval[];
  expectedQueries: string[];
  selected: { id: string; summary: string }[];
  citations: { passageId: string; quote: string; claim: string }[];
  responsePublished: boolean;
  errors: string[];
};

export function createTaskSupportAuditor(rawCorpus: unknown) {
  const corpus = restoreCorpus(rawCorpus), documents = new Map(corpus.documents.map(d => [d.id, d]));
  const retained: Hit[] = corpus.chunks.map(chunk => {
    const { sections, ...document } = documents.get(chunk.documentId)!, text = sections[chunk.section].text;
    return { chunk, document, score: 0, channels: ["offline_retained_corpus"], context: {
      before: text.slice(Math.max(0, chunk.start - 300), chunk.start), after: text.slice(chunk.end, chunk.end + 300),
    } };
  });
  const canonical = new Map(retained.map(h => [h.chunk.id, h]));
  return function audit(witness: TaskWitness, packet: AuditPacket) {
    if (!witness.id.trim() || !witness.need.trim() || !witness.boundary.trim() ||
        !["diagnostic_description", "diagnostic_confirmation", "care_setting_conditions", "medication_safety", "follow_through"].includes(witness.role)) throw new Error("INVALID_TASK_WITNESS");
    const errors = [...packet.errors];
    let retrieved: Hit[] = [], selected: Hit[] = [], boundQuotes: { documentId: string; text: string }[] = [];
    try {
      if (!packet.expectedQueries.length || packet.expectedQueries.length !== packet.retrieval.length ||
          packet.expectedQueries.some((q,i) => q !== packet.retrieval[i].query)) throw new Error("TASK_QUERY_ACCOUNTING_MISMATCH");
      if (packet.retrieval.some(p => p.corpusHash !== corpus.hash)) throw new Error("TASK_CORPUS_MISMATCH");
      if (packet.retrieval.some(p => p.warnings.some(w => /LEXICAL_ONLY|FAILED|ERROR/.test(w)))) errors.push("DEGRADED_RETRIEVAL");
      retrieved = packet.retrieval.flatMap(p => p.hits);
      for (const hit of retrieved) {
        const source = canonical.get(hit.chunk.id);
        if (!source || !isDeepStrictEqual(source.chunk, hit.chunk) || !isDeepStrictEqual(source.document, hit.document) ||
            !isDeepStrictEqual(source.context, hit.context)) throw new Error("TASK_PASSAGE_NOT_IN_ACTIVE_CORPUS");
      }
      if (new Set(packet.selected.map(p => p.id)).size !== packet.selected.length) throw new Error("TASK_DUPLICATE_SELECTION");
      selected = packet.selected.map(p => {
        const hit = retrieved.find(h => h.chunk.id === p.id);
        if (!hit || hit.chunk.text !== p.summary) throw new Error("TASK_SELECTION_NOT_BOUND");
        return hit;
      });
      if (packet.responsePublished) {
        const links = accountClaimLinks(selected, packet.citations.map((c,i) => ({ id: String(i), references: [{ passageId: c.passageId, quote: c.quote }] })));
        if (links.claims.some(c => c.missingReferences || c.unboundReferences)) throw new Error("TASK_QUOTE_NOT_BOUND");
        boundQuotes = packet.citations.map(c => ({ documentId: canonical.get(c.passageId)!.document.id, text: c.quote }));
      }
    } catch (error) { errors.push(error instanceof Error ? error.message : "TASK_PACKET_FAILURE"); }
    const complete = errors.length === 0;
    const common = { version: TASK_SUPPORT_AUDIT_VERSION, id: witness.id, role: witness.role, need: witness.need,
      boundary: witness.boundary, complete, errors, responsePublished: packet.responsePublished,
      emptyRetrieved: retrieved.length === 0, emptySelected: selected.length === 0,
      clinicalCorrectness: "not_assessed" as const, patientEligibility: "not_assessed" as const,
      generatedClaimSupport: "not_assessed" as const };
    if (witness.spans === null) return { ...common, witnessStatus: "no_authored_corpus_witness" as const,
      corpusOpportunity: null, retrievedOpportunity: null, selectedOpportunity: null, quotedWitness: null };
    const probe = { id: witness.id, claim: witness.need, boundary: witness.boundary, spans: witness.spans };
    return { ...common, witnessStatus: "authored_exact_spans" as const,
      corpusOpportunity: measureSupportOpportunity(probe, retained).supportOpportunity,
      retrievedOpportunity: measureSupportOpportunity(probe, retrieved, errors).supportOpportunity,
      selectedOpportunity: measureSupportOpportunity(probe, selected, errors).supportOpportunity,
      quotedWitness: packet.responsePublished ? complete && witness.spans.every(span =>
        boundQuotes.some(q => q.documentId === span.documentId && q.text.includes(span.quote))) : null };
  };
}
