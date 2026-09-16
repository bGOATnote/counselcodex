import { z } from "zod";
import { sha256 } from "../evidence/rag/model.ts";
import { exactStructuredJudgeAnchor } from "./judge-anchors.ts";

export const JUDGE_SPAN_PROTOCOL = "packet-bound-judge-spans/v1";
export const MAX_JUDGE_SPAN_PACKET_BYTES = 60_000;
type Unit = { id: string; text: string };
type Packet = { units: Unit[]; handoffFindings?: { clause: string }[] };
export type JudgeSpan = { id: string; unit: string; path: string; start: number; end: number; text: string };

/** Exact quoted substrings, never normalized source text or combined fields.
 * The original complete units remain in the packet for clinical context.
 * This catalog changes evidence serialization, NOT clinical review standards.
 */
export function judgeSpanCatalog(packet: Packet): JudgeSpan[] {
  if (new Set(packet.units.map(unit => unit.id)).size !== packet.units.length) throw new Error("DUPLICATE_JUDGE_UNIT");
  const spans: JudgeSpan[] = [];
  const seen = new Set<string>();
  const add = (unit: Unit, path: string, text: string, start: number, end: number) => {
    const piece = text.slice(start, end), clean = piece.trim();
    if (clean.length < 3) return;
    const left = start + piece.indexOf(clean);
    if (clean.length > 300 || !exactStructuredJudgeAnchor(unit, clean)) throw new Error("INVALID_JUDGE_SPAN");
    const fields = { unit: unit.id, path, start: left, end: left + clean.length, text: clean };
    const id = `a${sha256(JSON.stringify(fields)).slice(0, 20)}`;
    if (!seen.has(id)) { seen.add(id); spans.push({ id, ...fields }); }
  };
  const split = (unit: Unit, path: string, text: string) => {
    const lowSurrogate = (at: number) => at > 0 && /[\uDC00-\uDFFF]/.test(text[at] ?? "") && /[\uD800-\uDBFF]/.test(text[at - 1] ?? "");
    const withShortTail = (start: number, end: number) => {
      // A final one/two-character fragment must not disappear. Overlap only
      // within this exact text leaf until the canonical minimum is met.
      let left = start;
      while (left > 0 && text.slice(left, end).trim().length < 3) { left--; if (lowSurrogate(left)) left--; }
      if (end - left <= 300) add(unit, path, text, left, end);
    };
    for (const sentence of new Intl.Segmenter("en", { granularity: "sentence" }).segment(text)) {
      let start = sentence.index;
      const end = start + sentence.segment.length;
      while (start < end) {
        if (!text.slice(start, end).trim()) break;
        if (text.slice(start, end).trim().length < 3) { withShortTail(start, end); break; }
        let stop = Math.min(end, start + 300);
        if (stop < end) { const space = text.lastIndexOf(" ", stop); if (space > start + 100) stop = space; }
        if (lowSurrogate(stop)) stop--;
        add(unit, path, text, start, stop);
        start = stop;
      }
    }
  };
  const visit = (unit: Unit, value: unknown, path: string) => {
    if (typeof value === "string") split(unit, path, value);
    else if (Array.isArray(value)) value.forEach((item, index) => visit(unit, item, `${path}/${index}`));
    else if (value !== null && typeof value === "object") for (const [key, item] of Object.entries(value)) visit(unit, item, `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`);
  };
  for (const unit of packet.units) {
    if (!["patient", "draft", "issued_question"].includes(unit.id) && !unit.id.startsWith("source:")) continue;
    if (["draft", "issued_question"].includes(unit.id)) {
      // Malformed application JSON fails closed; never fall back to fabricated
      // concatenation or treat a different field as the same quoted statement.
      visit(unit, JSON.parse(unit.text), "");
    } else split(unit, "", unit.text);
  }
  const draft = packet.units.find(unit => unit.id === "draft");
  // Ownership review requires the exact WHOLE flagged clause; it may be a
  // sub-sentence. Include it only after exact binding to the current draft.
  for (const finding of packet.handoffFindings ?? []) {
    const message: unknown = draft ? JSON.parse(draft.text)?.patientMessage : undefined;
    if (!draft || typeof message !== "string" || !message.includes(finding.clause)) throw new Error("UNBOUND_HANDOFF_CLAUSE");
    const start = message.indexOf(finding.clause);
    add(draft, "/patientMessage", message, start, start + finding.clause.length);
  }
  return spans;
}

export function judgeSpanAliases(packet: Packet) {
  return judgeSpanCatalog(packet).map((span, index) => ({ ...span, alias: `s${index.toString(36)}` }));
}
type Fragment = string | [string, string];
type Encoded = null | boolean | number | { $text: Fragment[] } | Encoded[] | { [key: string]: Encoded };
function spanPacket<P extends Packet>(packet: P) {
  const catalog = judgeSpanAliases(packet);
  const overlapAnchors: { unit: string; id: string; text: string }[] = [];
  const encodeText = (unit: string, path: string, text: string): Encoded => {
    const selected = catalog.filter(span => span.unit === unit && span.path === path).sort((a, b) => a.start - b.start || b.end - a.end);
    const parts: Fragment[] = []; let position = 0;
    for (const span of selected) {
      if (span.start < position) { overlapAnchors.push({ unit, id: span.alias, text: span.text }); continue; }
      if (span.start > position) parts.push(text.slice(position, span.start));
      parts.push([span.alias, text.slice(span.start, span.end)]); position = span.end;
    }
    if (position < text.length) parts.push(text.slice(position));
    return { $text: parts };
  };
  const encode = (unit: string, value: unknown, path: string): Encoded => {
    if (typeof value === "string") return encodeText(unit, path, value);
    if (Array.isArray(value)) return value.map((item, index) => encode(unit, item, `${path}/${index}`));
    if (value !== null && typeof value === "object") {
      if (Object.hasOwn(value, "$text")) throw new Error("RESERVED_JUDGE_SPAN_KEY");
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(unit, item, `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`)]));
    }
    return value as null | boolean | number;
  };
  const units = packet.units.map(unit => {
    const structured = ["draft", "issued_question"].includes(unit.id);
    const parsed: unknown = structured ? JSON.parse(unit.text) : unit.text;
    // Application-created structured units use canonical JSON. Reject other
    // encodings rather than claim byte-preserving reconstruction after reformatting.
    if (structured && JSON.stringify(parsed) !== unit.text) throw new Error("NONCANONICAL_JUDGE_UNIT");
    return { ...unit, text: { encoding: structured ? "json" : "text", value: encode(unit.id, parsed, "") } };
  });
  const { units: _originalUnits, ...context } = packet;
  return { ...context, units, anchorProtocol: JUDGE_SPAN_PROTOCOL, packetHash: sha256(JSON.stringify(packet)), overlapAnchors };
}

/** Diagnostic round trip only. Never accepts or validates a provider verdict. */
export function restoreJudgeSpanUnits(prepared: ReturnType<typeof spanPacket>): Unit[] {
  const decode = (value: Encoded): unknown => {
    if (Array.isArray(value)) return value.map(decode);
    if (value !== null && typeof value === "object") {
      if (Object.hasOwn(value, "$text")) return (value.$text as Fragment[]).map(part => typeof part === "string" ? part : part[1]).join("");
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)]));
    }
    return value;
  };
  return prepared.units.map(unit => ({ ...unit, text: unit.text.encoding === "json" ? JSON.stringify(decode(unit.text.value)) : decode(unit.text.value) as string }));
}

export function judgeSpanPacketDiagnostics(packet: Packet) {
  const proposed = spanPacket(packet);
  const originalPacketBytes = Buffer.byteLength(JSON.stringify(packet)), packetBytes = Buffer.byteLength(JSON.stringify(proposed));
  return { originalPacketBytes, packetBytes, addedBytes: packetBytes - originalPacketBytes,
    spanCount: judgeSpanCatalog(packet).length, overheadRatio: packetBytes / originalPacketBytes,
    lossless: JSON.stringify(restoreJudgeSpanUnits(proposed)) === JSON.stringify(packet.units),
    limitBytes: MAX_JUDGE_SPAN_PACKET_BYTES, withinLimit: packetBytes <= MAX_JUDGE_SPAN_PACKET_BYTES };
}

export function judgeSpanPacket<P extends Packet>(packet: P) {
  const proposed = spanPacket(packet);
  if (Buffer.byteLength(JSON.stringify(proposed)) > MAX_JUDGE_SPAN_PACKET_BYTES) throw new Error("JUDGE_SPAN_PROMPT_LIMIT_EXCEEDED");
  return proposed;
}

/** Offline experiment, NOT wired into the clinical runtime. Models choose an ID; the server resolves the
 * exact quoted text from the SAME packet. Other decisions are never repaired,
 * dropped, inferred or upgraded. Canonical validation must still run afterward.
 */
export function createJudgeSpanContract<C extends z.ZodRawShape>(canonical: z.ZodObject<C>) {
  const criteria = canonical.shape.criteria;
  if (!(criteria instanceof z.ZodArray) || !(criteria.element instanceof z.ZodObject)) throw new Error("JUDGE_CRITERIA_SCHEMA_REQUIRED");
  const wireCriterion = criteria.element.omit({ anchors: true }).extend({
    anchors: z.array(z.object({ spanId: z.string().regex(/^s[0-9a-z]+$/) }).strict()).min(1).max(3),
  }).strict();
  const schema = canonical.extend({ packetHash: z.string().regex(/^[a-f0-9]{64}$/), criteria: z.array(wireCriterion).length(7) }).strict();
  function resolve(raw: unknown, packet: Packet) {
    // Zod validates the extended generic object before this structural view;
    // the view names only the two wire fields replaced by this function.
    const wire = schema.parse(raw) as unknown as { packetHash: string; criteria: { anchors: { spanId: string }[]; [key: string]: unknown }[]; [key: string]: unknown };
    if (wire.packetHash !== sha256(JSON.stringify(packet))) throw new Error("STALE_JUDGE_SPAN_PACKET");
    const catalog = new Map(judgeSpanAliases(packet).map(span => [span.alias, span]));
    const { packetHash: _packetHash, ...rest } = wire;
    return canonical.parse({ ...rest, criteria: wire.criteria.map(criterion => ({ ...criterion,
      anchors: criterion.anchors.map((anchor: { spanId: string }) => {
        const span = catalog.get(anchor.spanId);
        if (!span) throw new Error("UNKNOWN_JUDGE_SPAN_ID");
        return { unit: span.unit, quote: span.text };
      }),
    })) });
  }
  return { schema, resolve };
}

export const JUDGE_SPAN_INSTRUCTIONS = `ANCHOR SERIALIZATION: Each unit contains its complete text once. For json units, object fields and non-string values retain their original structure. Every original string is represented by $text fragments: plain strings are context; [spanId,text] pairs label exact selectable text. Concatenate all fragment text in order to recover the complete original string, including whitespace. overlapAnchors contains additional selectable overlapping whole clauses. For each criterion anchor return ONLY spanId; do not retype quotations. Copy packetHash exactly. IDs are packet-local: the server resolves them only against that exact original packet, never a previous turn. Select spans that demonstrate your finding; an ID is not proof of entailment. Complete units, including qualifiers outside the selected span, remain authoritative. Do not select a different correct sentence to clear a contradiction. For claim_support=pass select a supporting source span. All seven decisions, review scope, corrections, repair targets, transport and ownership requirements remain unchanged. Serialization does not grant approval or waive uncertainty.`;
