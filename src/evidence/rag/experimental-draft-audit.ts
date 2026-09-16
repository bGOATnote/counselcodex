/** Offline exact-citation diagnostic. Never imports a router or publishes a draft.
 * A quoted prerequisite is not proof that the model applied it correctly. The
 * caller binds these artifacts to a frozen study/model/settings manifest.
 */
import { isDeepStrictEqual } from "node:util";
import { sha256 } from "./model.ts";
import { createTaskSupportAuditor, type AuditPacket, type TaskWitness } from "./task-support-audit.ts";

export const EXPERIMENTAL_DRAFT_AUDIT_VERSION = "unpublished-draft-citation-audit/v1";
export type ExperimentalDraftInput = {
  evidence: Omit<AuditPacket, "citations" | "responsePublished">;
  /** Entire actual model input, not only a source list or caller-provided hash. */
  modelPacket: { patient: string; sources: unknown[]; [key: string]: unknown };
  expectedPacketHash: string;
  draft: { kind: "unpublished_experimental_draft"; raw: unknown; resolved: unknown; failure: string | null };
};
type Citation = { passageId: string; quote: string; claim: string; applicability?: string; limitation?: string };
type DraftStatus = "missing" | "failed" | "invalid" | "inspectable";
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
function requireTrue(value: unknown, code: string): asserts value { if (!value) throw new Error(code); }
const packetHash = (input: ExperimentalDraftInput) => sha256(JSON.stringify(input.modelPacket));

/** Resolve only quote IDs that actually appeared in the frozen input. Do not
 * regenerate sentence boundaries using a potentially different ICU version.
 */
function bindDraft(input: ExperimentalDraftInput): Citation[] {
  const { raw, resolved } = input.draft;
  requireTrue(record(raw) && record(resolved) && Array.isArray(raw.citations), "DRAFT_OUTPUT_INVALID");
  const selected = new Map(input.evidence.selected.map(h => [h.id, h.summary]));
  const sources = new Map<string, Map<string, string>>();
  for (const source of input.modelPacket.sources) {
    requireTrue(record(source) && typeof source.id === "string" && Array.isArray(source.quoteSpans), "DRAFT_SOURCE_INVALID");
    const text = selected.get(source.id);
    requireTrue(text !== undefined && !sources.has(source.id), "DRAFT_SOURCE_SELECTION_MISMATCH");
    const spans = new Map<string, string>();
    for (const span of source.quoteSpans) {
      requireTrue(record(span) && typeof span.id === "string" && typeof span.text === "string" &&
        typeof span.start === "number" && typeof span.end === "number" && Number.isInteger(span.start) && Number.isInteger(span.end) &&
        span.start >= 0 && span.end > span.start && span.end <= text.length && text.slice(span.start, span.end) === span.text &&
        span.selectable === (span.text.length >= 10) && !spans.has(span.id), "DRAFT_SOURCE_SPAN_INVALID");
      if (span.selectable) spans.set(span.id, span.text);
      else spans.set(span.id, "");
    }
    sources.set(source.id, spans);
  }
  requireTrue(sources.size === selected.size, "DRAFT_SOURCE_SELECTION_MISMATCH");
  const citations = raw.citations.map(c => {
    requireTrue(record(c) && typeof c.passageId === "string" && typeof c.quoteId === "string" &&
      typeof c.claim === "string" && c.claim.trim().length > 0 && !("quote" in c), "DRAFT_WIRE_CITATION_INVALID");
    const quote = sources.get(c.passageId)?.get(c.quoteId);
    requireTrue(quote, "DRAFT_QUOTE_ID_NOT_BOUND");
    const { quoteId: _quoteId, ...rest } = c;
    return { ...rest, quote } as Citation;
  });
  // Bind the complete resolved draft, including every citation claim/limitation.
  requireTrue(isDeepStrictEqual({ ...raw, citations }, resolved), "DRAFT_RESOLVED_OUTPUT_MISMATCH");
  return citations;
}

export function createExperimentalDraftAuditor(rawCorpus: unknown) {
  const auditPacket = createTaskSupportAuditor(rawCorpus);
  function audit(witness: TaskWitness, input: ExperimentalDraftInput) {
    // V1 semantics stay unchanged: draft output never enters its publication path.
    const base = auditPacket(witness, { ...input.evidence, citations: [], responsePublished: false });
    const draftErrors: string[] = [];
    let draftStatus: DraftStatus = "invalid", citations: Citation[] = [];
    try {
      requireTrue(input.draft.kind === "unpublished_experimental_draft", "DRAFT_ARTIFACT_KIND_INVALID");
      requireTrue(base.complete, "DRAFT_EVIDENCE_INVALID");
      requireTrue(packetHash(input) === input.expectedPacketHash, "DRAFT_MODEL_PACKET_HASH_MISMATCH");
      if (input.draft.failure !== null) draftStatus = "failed";
      else if (input.draft.raw === null && input.draft.resolved === null) draftStatus = "missing";
      else { citations = bindDraft(input); draftStatus = "inspectable"; }
    } catch (error) { draftErrors.push(error instanceof Error ? error.message : "DRAFT_AUDIT_FAILURE"); }
    const selected = input.evidence.selected.map(s => input.evidence.retrieval.flatMap(p => p.hits).find(h => h.chunk.id === s.id));
    const spans = witness.spans?.map(span => {
      const available = base.complete && selected.some(h => h?.document.id === span.documentId && h.chunk.text.includes(span.quote));
      const matches = draftStatus === "inspectable" ? citations.flatMap((citation, index) => {
        const hit = selected.find(h => h?.chunk.id === citation.passageId);
        return hit?.document.id === span.documentId && citation.quote.includes(span.quote) ? [{ index, ...citation }] : [];
      }) : [];
      return { ...span, selected: available, quoted: draftStatus === "inspectable" && available ? matches.length > 0 : null, matches };
    }) ?? null;
    return { ...base, draftAuditVersion: EXPERIMENTAL_DRAFT_AUDIT_VERSION,
      artifactKind: "unpublished_experimental_draft" as const, patientAdvicePublished: false as const, clinicalApproval: false as const,
      draftStatus, draftErrors, draftFailure: input.draft.failure,
      draftCitationBindingValid: draftStatus === "inspectable" ? true : draftStatus === "invalid" ? false : null,
      draftQuotedWitness: draftStatus === "inspectable" && base.selectedOpportunity === true ? spans!.every(s => s.quoted === true) : null,
      draftSpans: spans };
  }
  function compare(witness: TaskWitness, before: ExperimentalDraftInput, after: ExperimentalDraftInput) {
    requireTrue(packetHash(before) === before.expectedPacketHash && packetHash(after) === after.expectedPacketHash,
      "DRAFT_MODEL_PACKET_HASH_MISMATCH");
    requireTrue(before.expectedPacketHash === after.expectedPacketHash && isDeepStrictEqual(before.modelPacket, after.modelPacket) &&
      isDeepStrictEqual(before.evidence, after.evidence), "DRAFT_PAIRED_PACKET_MISMATCH");
    const a = audit(witness, before), b = audit(witness, after);
    const quotationTransition = a.draftQuotedWitness === null || b.draftQuotedWitness === null ? "not_comparable"
      : a.draftQuotedWitness ? b.draftQuotedWitness ? "both_quoted" : "lost"
        : b.draftQuotedWitness ? "gained" : "neither_quoted";
    return { version: EXPERIMENTAL_DRAFT_AUDIT_VERSION, packetHash: before.expectedPacketHash,
      quotationTransition, before: a, after: b,
      interpretation: "Exact authored-witness citation selection in unpublished drafts; not semantic use, claim support, patient eligibility or clinical correctness." };
  }
  return { audit, compare };
}
