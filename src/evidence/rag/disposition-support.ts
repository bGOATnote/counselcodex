/** Offline, authored source-span evaluation only. Not a semantic judge, clinical
 * rule, routing policy, or live retriever. Matching a pre-adjudicated passage
 * measures a support opportunity; it does not establish patient applicability. */
import type { Hit } from "./model.ts";
import { accountClaimLinks } from "./v26.ts";

export const SUPPORT_PROBE_VERSION = "authored-disposition-support/v1";
export type SupportProbe = {
  id: string;
  claim: string;
  // All spans are required. Keep the complete qualifying clause in each quote.
  spans: { documentId: string; quote: string }[];
  boundary: string;
};
type Reference = { passageId: string; quote: string };

function validateProbe(probe: SupportProbe) {
  if (!probe.id.trim() || !probe.claim.trim() || !probe.boundary.trim() || !probe.spans.length ||
      probe.spans.some(s => !s.documentId.trim() || !s.quote.trim())) throw new Error("INVALID_AUTHORED_SUPPORT_PROBE");
  const keys = probe.spans.map(s => JSON.stringify([s.documentId, s.quote]));
  if (new Set(keys).size !== keys.length) throw new Error("DUPLICATE_SUPPORT_SPAN");
}

function matchedSpans(probe: SupportProbe, passages: { documentId: string; text: string }[]) {
  return probe.spans.map(span => ({ documentId: span.documentId, quote: span.quote,
    matched: passages.some(p => p.documentId === span.documentId && p.text.includes(span.quote)) }));
}

/** This evaluates pre-authored support-span coverage, not newly generated claims.
 * Retrieval failures remain failed attempts even when partial results survive. */
export function measureSupportOpportunity(probe: SupportProbe, hits: Hit[], retrievalErrors: string[] = []) {
  validateProbe(probe);
  let integrityError: string | null = null;
  try { accountClaimLinks(hits, []); }
  catch (error) { integrityError = error instanceof Error ? error.message : "PASSAGE_INTEGRITY_FAILURE"; }
  const active = integrityError ? [] : hits.filter(h => h.document.currency === "not_assessed");
  const spans = matchedSpans(probe, active.map(h => ({ documentId: h.document.id, text: h.chunk.text })));
  const complete = retrievalErrors.length === 0 && integrityError === null;
  return { id: probe.id, version: SUPPORT_PROBE_VERSION, complete, retrievalErrors: [...retrievalErrors], integrityError,
    emptyPacket: hits.length === 0, noActivePassages: active.length === 0,
    requiredSpans: spans.length, matchedSpans: spans.filter(s => s.matched).length,
    supportOpportunity: complete && spans.every(s => s.matched), spans,
    clinicalCorrectness: "not_assessed" as const, patientApplicability: "not_assessed" as const,
    generatedClaimSupport: "not_assessed" as const };
}

/** A deliberately narrow regression oracle. Only the exact authored claim is
 * eligible. Support elsewhere in a chunk cannot rescue the submitted quotation.
 * A different claim needs fresh adjudication, not fuzzy matching to this probe. */
export function auditAuthoredCitation(probe: SupportProbe, claim: string, references: Reference[], hits: Hit[]) {
  validateProbe(probe);
  const identity = accountClaimLinks(hits, [{ id: probe.id, references }]).claims[0];
  const bound = !identity.missingReferences && identity.unboundReferences === 0;
  const eligible = claim === probe.claim;
  const quoted = bound ? references.flatMap(reference => {
    const hit = hits.find(h => h.chunk.id === reference.passageId && h.document.currency === "not_assessed");
    return hit ? [{ documentId: hit.document.id, text: reference.quote }] : [];
  }) : [];
  const spans = matchedSpans(probe, quoted);
  return { id: probe.id, identityBound: bound, exactAuthoredClaim: eligible,
    support: !eligible ? "not_assessed" as const : bound && spans.every(s => s.matched)
      ? "authored_support_span_matched" as const : "authored_support_span_missing" as const,
    spans, patientApplicability: "not_assessed" as const, clinicalCorrectness: "not_assessed" as const };
}

export function summarizeSupportOpportunities(rows: ReturnType<typeof measureSupportOpportunity>[]) {
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error("DUPLICATE_SUPPORT_ATTEMPT_ID");
  const supported = rows.filter(row => row.supportOpportunity).length;
  return { attempted: rows.length, retrievalOrIntegrityFailures: rows.filter(row => !row.complete).length,
    emptyPackets: rows.filter(row => row.emptyPacket).length, noActivePassages: rows.filter(row => row.noActivePassages).length,
    supportedOpportunities: supported, supportOpportunityRate: rows.length ? supported / rows.length : null,
    unfulfilledOpportunities: rows.length - supported,
    interpretation: "Authored exact-span availability, with all attempts retained. Not clinical accuracy, generated-claim entailment, patient applicability, or measured routing lift." };
}
