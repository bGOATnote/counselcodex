import { z } from "zod";
import { sha256 } from "../evidence/rag/model.ts";
import { resolveSourceQuoteReferences } from "./source-quote-refs.ts";
import { routingFieldsValid } from "./routing-policy.ts";
import { sameRepairValue } from "./repair-values.ts";
import type { MechanicalVitalLocation } from "./contract.ts";

export const REPAIR_PROTOCOL = "field-local-repair/v2";
// Scope changes are prompt-bound separately from the unchanged v2 patch wire
// and no-op replay contract. This does not approve a repaired clinical answer.
export const REPAIR_SCOPE_POLICY = Object.freeze({ version: "mechanical-repair-scope/v1", check: "unmeasured_vitals_not_dismissed", field: "vitalSigns", binding: "exact-current-field-span" });
export const REPAIR_FIELDS = ["routing", "patientMessage", "reason", "differential", "redFlags", "vitalSigns", "questions", "evidenceLimitations", "citations"] as const;
export const repairFieldSchema = z.enum(REPAIR_FIELDS);
export type RepairField = z.infer<typeof repairFieldSchema>;
type Source = { id: string; text: string; [key: string]: unknown };
export type RepairAudit = { protocol: string; baseDraftHash: string; evidenceHash: string; allowedFields: RepairField[]; changedFields: RepairField[]; noopFields?: RepairField[]; resultDraftHash: string | null; status: "applied" | "rejected"; failure: string | null };
const routingKeys = ["disposition", "reviewPriority", "workType", "transportIntent"] as const;

/** No arbitrary paths, merges or array indices. Route metadata changes atomically. */
export function createRepairContract<D extends z.ZodRawShape, W extends z.ZodRawShape>(draft: z.ZodObject<D>, wire: z.ZodObject<W>) {
  const variants = REPAIR_FIELDS.map(field => z.object({ field: z.literal(field), value: field === "routing"
    ? z.object(Object.fromEntries(routingKeys.map(key => [key, draft.shape[key]]))).strict()
    : wire.shape[field] }).strict());
  const schema = z.object({ baseDraftHash: z.string().regex(/^[a-f0-9]{64}$/), evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
    edits: z.array(z.union(variants as [typeof variants[number], typeof variants[number], ...typeof variants])).min(1).max(REPAIR_FIELDS.length) }).strict();
  function prepare(base: z.infer<typeof draft>, sources: Source[], allowedFields: RepairField[]) {
    return { protocol: REPAIR_PROTOCOL, baseDraftHash: sha256(JSON.stringify(base)), evidenceHash: sha256(JSON.stringify(sources)), allowedFields: [...new Set(allowedFields)] };
  }
  function apply(base: z.infer<typeof draft>, sources: Source[], allowedFields: RepairField[], raw: unknown) {
    const binding = prepare(base, sources, allowedFields);
    const audit: RepairAudit = { ...binding, changedFields: [], noopFields: [], resultDraftHash: null, status: "rejected", failure: null };
    try {
      const patch = schema.parse(raw);
      if (patch.baseDraftHash !== binding.baseDraftHash || patch.evidenceHash !== binding.evidenceHash) throw new Error("STALE_REPAIR_BINDING");
      if (new Set(patch.edits.map(e => e.field)).size !== patch.edits.length) throw new Error("DUPLICATE_REPAIR_FIELD");
      // Validate every permission and source reference before equality. An
      // unauthorized/invalid identical value must never become a safe no-op.
      if (patch.edits.some(edit => !binding.allowedFields.includes(edit.field))) throw new Error("UNAUTHORIZED_REPAIR_FIELD");
      const edits = patch.edits.map(edit => ({ field: edit.field, value: edit.field === "citations"
        ? resolveSourceQuoteReferences({ citations: edit.value as { passageId: string; quoteId: string }[] }, sources).citations : edit.value }));
      const next: Record<string, unknown> = structuredClone(base);
      for (const edit of edits) {
        const before = edit.field === "routing" ? Object.fromEntries(routingKeys.map(k => [k, next[k]])) : next[edit.field];
        const after = edit.value;
        if (sameRepairValue(before, after)) { audit.noopFields!.push(edit.field); continue; }
        if (edit.field === "routing") Object.assign(next, after); else next[edit.field] = after;
        audit.changedFields.push(edit.field);
      }
      if (!audit.changedFields.length) throw new Error("NOOP_REPAIR_FIELD");
      if (audit.changedFields.includes("routing") && !["patientMessage", "reason"].every(f => patch.edits.some(e => e.field === f))) throw new Error("INCOMPLETE_ROUTING_REPAIR");
      const output = draft.parse(next);
      if (!routingFieldsValid(output as { disposition: string; reviewPriority?: "priority" | "routine" | null; workType?: "medication_request" | "clinical_review" | null })) throw new Error("REPAIR_ROUTING_INVALID");
      audit.status = "applied"; audit.resultDraftHash = sha256(JSON.stringify(output));
      return { output, audit };
    } catch (error) {
      audit.failure = error instanceof z.ZodError ? "REPAIR_SCHEMA_INVALID" : error instanceof Error ? error.message : "REPAIR_INVALID";
      return { output: null, audit };
    }
  }
  return { schema, prepare, apply };
}

/** Exact scope for mechanical failures; unknown defects never authorize all fields. */
export function nominateRepairFields(targets: RepairField[], findings: {id:string;detail:string;repairLocations?:MechanicalVitalLocation[]}[], transportRejected: boolean, currentDraft?: { vitalSigns: string }): RepairField[] {
  const allowed = new Set<RepairField>(targets);
  for (const finding of findings) {
    if (finding.id === REPAIR_SCOPE_POLICY.check && Array.isArray(finding.repairLocations) && finding.repairLocations.some(location =>
      location?.field === "vitalSigns" && typeof currentDraft?.vitalSigns === "string"
      && Number.isSafeInteger(location.start) && Number.isSafeInteger(location.end)
      && location.start >= 0 && location.end > location.start && location.end <= currentDraft.vitalSigns.length
      && typeof location.matchedText === "string" && currentDraft.vitalSigns.slice(location.start, location.end) === location.matchedText)) allowed.add("vitalSigns");
    for (const match of finding.detail.matchAll(/"field":"([A-Za-z]+)"/g)) if (repairFieldSchema.safeParse(match[1]).success) allowed.add(match[1] as RepairField);
    if (finding.id === "routing_fields") allowed.add("routing");
    if (finding.id === "no_unconfirmed_handoff" || finding.id === "action_timing_present") allowed.add("patientMessage");
    if (finding.id === "exact_source_quote") allowed.add("citations");
  }
  if (transportRejected) allowed.add("routing");
  if (allowed.has("routing")) { allowed.add("patientMessage"); allowed.add("reason"); }
  return [...allowed];
}

export const REPAIR_INSTRUCTIONS = `FIELD-LOCAL REPAIR: Return ONLY baseDraftHash, evidenceHash and edits, not a complete response. Copy both hashes from repairContract. Each edit replaces ONE allowed top-level field with its complete typed value. Arrays are whole replacements, never indexed patches. Preserve every unedited field exactly; do not restate it. The routing group contains disposition, reviewPriority, workType and transportIntent together; changing it also requires patientMessage and reason edits. Only edit repairContract.allowedFields. Select CURRENT source quoteIds for any changed citations; unchanged citations are preserved by the server. Repair the specific established defect with the smallest sufficient change. Preserve conditional scope: repairing future precautions must not turn them into a current care requirement. If the route remains SELF_CARE, clinician contact and its access fallback stay conditional on NEW findings that require that contact. Never append unconditional clinician or urgent-care review merely to satisfy ownership. Conversely, genuinely necessary care must not depend on service unavailability AND worsening together. Do not add management advice, source-derived patient findings or hypothetical service capabilities. The assembled response receives a fresh independent review. If the defect cannot be fixed within scope, do not invent a fix.`;
