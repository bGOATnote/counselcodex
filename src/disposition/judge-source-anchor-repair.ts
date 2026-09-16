import { sameRepairValue } from "./repair-values.ts";

/** Wire-reference recovery only: never a clinical decision or fuzzy quotation. */
export const JUDGE_SOURCE_REPAIR_POLICY = Object.freeze({
  protocol: "unique-exact-source-anchor/v1",
  unknownReference: "source:[a-f0-9]{32,64}",
  canonicalTarget: "source:[a-f0-9]{64}",
  matching: "Exactly one current packet source body contains the unchanged verbatim quotation; existing unit IDs are never rebound. The fragment shape is only a wire-format bound, never prefix/distance evidence.",
  bodyBoundary: "Only text after a recognized single-line application source header; metadata, patient text and draft text are excluded.",
  clinicalApproval: false,
});
export type JudgeSourcePacket = { units: { id: string; text: string }[]; [key: string]: unknown };
type Repair = { criterionIndex: number; anchorIndex: number; from: string; to: string; quote: string };
type Diagnostic = { criterionIndex: number; anchorIndex: number; code: "MALFORMED_SOURCE_REFERENCE" | "EMPTY_QUOTATION" | "DUPLICATE_UNIT_IDS" | "KNOWN_SOURCE_QUOTE_MISMATCH" | "NO_EXACT_SOURCE_BODY_MATCH" | "AMBIGUOUS_EXACT_SOURCE_BODY_MATCH" };
export type JudgeSourceAnchorRepairAudit = {
  protocol: typeof JUDGE_SOURCE_REPAIR_POLICY.protocol; status: "applied" | "rejected";
  packet: JudgeSourcePacket; packetHash: string; rawHash: string; resolvedHash: string | null;
  repairs: (Repair & { quoteHash: string })[]; diagnostics: Diagnostic[]; clinicalApproval: false;
};
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const canonicalSource = /^source:[a-f0-9]{64}$/;
const recoverableReference = /^source:[a-f0-9]{32,64}$/;
function sourceBody(unit: { id: string; text: string }): string | null {
  // graphJudgePacket writes this one-line header. Unknown/multiline metadata is
  // conservatively ineligible, not guessed or reinterpreted as source content.
  const header = /^(?:research_synthesis|patient_summary|primary_guideline|clinical_review); [^\r\n]*; publication: [^\r\n]+\n/.exec(unit.text);
  return header ? unit.text.slice(header[0].length) : null;
}
export function planJudgeSourceAnchorRepair(raw: unknown, packet: JudgeSourcePacket): { output: unknown; repairs: Repair[]; diagnostics: Diagnostic[] } {
  const repairs: Repair[] = [], diagnostics: Diagnostic[] = [];
  if (!record(raw) || !Array.isArray(raw.criteria)) return { output: raw, repairs, diagnostics };
  const duplicateIds = new Set(packet.units.map(u => u.id)).size !== packet.units.length;
  const targets = packet.units.filter(u => canonicalSource.test(u.id)).map(u => ({ ...u, body: sourceBody(u) }));
  raw.criteria.forEach((criterion, criterionIndex) => {
    if (!record(criterion) || !Array.isArray(criterion.anchors)) return;
    criterion.anchors.forEach((anchor, anchorIndex) => {
      if (!record(anchor) || typeof anchor.unit !== "string" || !anchor.unit.startsWith("source:") || typeof anchor.quote !== "string") return;
      const problem = (code: Diagnostic["code"]) => diagnostics.push({ criterionIndex, anchorIndex, code });
      const existing = packet.units.find(unit => unit.id === anchor.unit);
      if (existing) { if (!existing.text.includes(anchor.quote)) problem("KNOWN_SOURCE_QUOTE_MISMATCH"); return; }
      if (!recoverableReference.test(anchor.unit)) { problem("MALFORMED_SOURCE_REFERENCE"); return; }
      if (!anchor.quote.trim()) { problem("EMPTY_QUOTATION"); return; }
      if (duplicateIds) { problem("DUPLICATE_UNIT_IDS"); return; }
      const quote = anchor.quote;
      const matches = targets.filter(unit => unit.body !== null && unit.body.includes(quote));
      if (matches.length !== 1) { problem(matches.length ? "AMBIGUOUS_EXACT_SOURCE_BODY_MATCH" : "NO_EXACT_SOURCE_BODY_MATCH"); return; }
      repairs.push({ criterionIndex, anchorIndex, from: anchor.unit, to: matches[0].id, quote });
    });
  });
  if (!repairs.length) return { output: raw, repairs, diagnostics };
  const output = structuredClone(raw);
  for (const repair of repairs) {
    // Only this leaf changes. The full schema/clinical validator still decides
    // whether the result is admissible after serialization repair.
    const criterion = (output.criteria as Record<string, unknown>[])[repair.criterionIndex];
    (criterion.anchors as { unit: string; quote: string }[])[repair.anchorIndex].unit = repair.to;
  }
  return { output, repairs, diagnostics };
}
export function sameJudgeValueWithSchemaDefaults(candidate: unknown, resolved: unknown): boolean {
  if (sameRepairValue(candidate, resolved)) return true;
  // The existing graphJudgeSchema has exactly this default. No other omitted
  // field, verdict, reason, quotation or repair target may be manufactured.
  return record(candidate) && candidate.evidenceQueries === undefined
    && sameRepairValue({ ...candidate, evidenceQueries: [] }, resolved);
}
type HashSteps<T> = Generator<string, T, string>;
export function* buildJudgeSourceAnchorRepairAuditSteps(raw: unknown, resolved: unknown | null, packet: JudgeSourcePacket): HashSteps<JudgeSourceAnchorRepairAudit | null> {
  const plan = planJudgeSourceAnchorRepair(raw, packet);
  if (!plan.repairs.length && !plan.diagnostics.length) return null;
  if (resolved !== null && !sameJudgeValueWithSchemaDefaults(plan.output, resolved)) throw new Error("SOURCE_ANCHOR_REPAIR_CHANGED_REVIEW");
  const repairs: JudgeSourceAnchorRepairAudit["repairs"] = [];
  for (const repair of plan.repairs) repairs.push({ ...repair, quoteHash: yield repair.quote });
  return { protocol: JUDGE_SOURCE_REPAIR_POLICY.protocol, status: resolved !== null && repairs.length ? "applied" : "rejected",
    packet: structuredClone(packet), packetHash: yield JSON.stringify(packet), rawHash: yield JSON.stringify(raw), resolvedHash: resolved === null ? null : yield JSON.stringify(resolved),
    repairs, diagnostics: plan.diagnostics, clinicalApproval: false };
}
/** Shared server/browser replay. Caller separately rejects provider failure and
 * binds this exact packet to the current patient, draft and selected sources. */
export function* verifyJudgeSourceAnchorRepairSteps(raw: unknown, resolved: unknown, audit: JudgeSourceAnchorRepairAudit): HashSteps<boolean> {
  try {
    if (!audit || audit.status !== "applied" || !audit.repairs.length || !record(audit.packet) || !Array.isArray(audit.packet.units)) return false;
    const expected = yield* buildJudgeSourceAnchorRepairAuditSteps(raw, resolved, audit.packet);
    return expected !== null && sameRepairValue(expected, audit);
  } catch { return false; }
}
