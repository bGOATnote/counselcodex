import { z } from "zod";
import { querySchema, type ClinicalPassage } from "../evidence/search.ts";
import { safetyEnvelopeTransport } from "./transport.ts";
import { routingConsequenceSchema } from "./clarification-policy.ts";

// Stable provider grammar: IDs refer to this request's patient text, not to a
// generated quote. Never construct a per-patient enum (schema cache churn).
export const referencedPlanSchema = z.object({
  emergency: z.boolean(), emergencySource: z.number().int().nullable(),
  emergencyDestination: z.enum(["EMS_NOW", "ED_NOW"]).nullable(),
  sameDaySource: z.number().int().nullable(),
  sameDayNeed: z.enum(["physical_exam_or_treatment", "prescribing_review", "missing_information"]).nullable(),
  sameDayRationale: z.string().nullable(),
  prescriptionReviewSource: z.number().int().nullable(),
  clarification: z.object({ question: z.string().min(10).max(350), why: z.string().min(10).max(400), source: z.number().int(), routingConsequence: routingConsequenceSchema.nullable() }).strict().nullable(),
  queries: z.array(querySchema).min(1).max(2),
}).strict();
export const referencedPlanTransport = safetyEnvelopeTransport(referencedPlanSchema, z.object({
  emergency: z.boolean(), emergencySource: z.number().int().nullable(),
  emergencyDestination: z.enum(["EMS_NOW", "ED_NOW"]).nullable(),
}).passthrough());

export function patientFragments(message: string): { id: number; text: string }[] {
  // Keep punctuation/negation; every fragment remains an exact substring.
  const fragments: string[] = [];
  for (const sentence of message.match(/[^.!?\n]+[.!?]?/g) ?? []) {
    let remaining = sentence.trim();
    while (remaining.length > 160) {
      const at = remaining.lastIndexOf(" ", 160);
      const end = at > 0 ? at : 160;
      fragments.push(remaining.slice(0, end));
      remaining = remaining.slice(end).trimStart();
    }
    if (remaining) fragments.push(remaining);
  }
  return fragments.map((text, id) => ({ id, text }));
}

export function resolveReferencedPlan(raw: unknown, message: string): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const p = raw as Record<string, unknown>, fragments = patientFragments(message);
  const quote = (id: unknown) => typeof id === "number" && Number.isInteger(id) && id >= 0 ? fragments[id]?.text ?? "" : "";
  const clarification = p.clarification && typeof p.clarification === "object" && !Array.isArray(p.clarification)
    ? { question: (p.clarification as Record<string, unknown>).question, why: (p.clarification as Record<string, unknown>).why, quote: quote((p.clarification as Record<string, unknown>).source), routingConsequence: (p.clarification as Record<string, unknown>).routingConsequence ?? null }
    : p.clarification;
  return { emergency: p.emergency, emergencyDestination: p.emergencyDestination,
    emergencyQuote: quote(p.emergencySource), sameDayQuote: p.sameDaySource === null ? null : quote(p.sameDaySource),
    sameDayNeed: p.sameDayNeed ?? null, sameDayRationale: p.sameDayRationale ?? null,
    prescriptionReviewQuote: p.prescriptionReviewSource === null ? null : quote(p.prescriptionReviewSource),
    clarification, queries: p.queries, findings: [] };
}

/** Resolve final-agent references without changing the retained provider object. */
export function sourceFragments(text: string): { id: number; text: string }[] {
  const fragments: { id: number; text: string }[] = [];
  let remaining = text.trim();
  while (remaining.length) {
    let end = remaining.length;
    if (end > 600) {
      const sentence = remaining.lastIndexOf(". ", 599);
      end = sentence >= 100 ? sentence + 1 : remaining.lastIndexOf(" ", 600);
      if (end <= 0) end = 600;
    }
    fragments.push({ id: fragments.length, text: remaining.slice(0, end) });
    remaining = remaining.slice(end).trimStart();
  }
  return fragments;
}

export function resolveReferencedAnswer(raw: unknown, message: string, sources: ClinicalPassage[] = []): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const value = structuredClone(raw) as Record<string, any>;
  const fragments = patientFragments(message);
  const sourceFor = (id: unknown) => typeof id === "number" && Number.isInteger(id) && id >= 0 ? sources[id] : undefined;
  // null is deliberately invalid in the local string-ID contract. Never coerce
  // strings, wrap indexes, or resolve an absent slot from another run's corpus.
  if (Array.isArray(value.answer?.evidence)) value.answer.evidence = value.answer.evidence.map((citation: any) =>
    citation && typeof citation === "object" && !Array.isArray(citation)
      ? { ...citation, sourceId: sourceFor(citation.sourceId)?.id ?? null } : citation);
  const quote = (id: unknown) => typeof id === "number" && Number.isInteger(id) && id >= 0 ? fragments[id]?.text ?? "" : "";
  if (Array.isArray(value.answer?.redFlags)) value.answer.redFlags = value.answer.redFlags.map((flag: any) => {
    if (!flag || typeof flag !== "object" || Array.isArray(flag)) return flag;
    // An unknown can have explicit patient context ("I do not know"). Retain
    // that provenance without changing its status to absent. Invalid references
    // remain invalid rather than being silently erased to an empty unknown.
    const sourceQuote = quote(flag.source);
    return { concern: flag.concern, status: flag.status, quote: flag.status === "unknown" && flag.source !== null && !sourceQuote ? "[invalid unknown source reference]" : sourceQuote };
  });
  if (value.clarification && typeof value.clarification === "object" && !Array.isArray(value.clarification)) {
    const c = value.clarification;
    value.clarification = { question: c.question, why: c.why, quote: quote(c.source), routingConsequence: c.routingConsequence ?? null };
  }
  if (Array.isArray(value.support)) value.support = value.support.map((support: any) => {
    if (!support || typeof support !== "object" || Array.isArray(support)) return support;
    const source = sourceFor(support.sourceId);
    const passage = typeof support.passage === "number" && Number.isInteger(support.passage) && support.passage >= 0
      ? sourceFragments(source?.text ?? "")[support.passage]?.text ?? "" : "";
    return { sourceId: source?.id ?? null, quote: passage, applicability: support.applicability, explanation: support.explanation };
  });
  return value;
}
