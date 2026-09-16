import { createHash } from "node:crypto";
import { z } from "zod";

const id = z.string().regex(/^[A-Za-z0-9_.:-]{1,100}$/);
const time = z.iso.datetime({ offset: true });
export const conditionSchema = z.enum(["viral_uri", "sinusitis", "uti", "vaginitis", "other"]);
export const sourceSchema = z.object({
  id,
  kind: z.enum(["patient_message", "clinician_message", "note", "order", "diagnosis"]),
  occurredAt: time,
  availableAt: time,
  text: z.string().min(1).max(4_000),
  condition: conditionSchema.optional(),
  orderStatus: z.enum(["draft", "signed", "cancelled"]).optional(),
  medicationClass: z.enum(["systemic_antibiotic", "other", "unknown"]).optional(),
}).strict().superRefine((source, context) => {
  if (source.kind === "diagnosis" && !source.condition) context.addIssue({ code: "custom", message: "diagnosis sources require a structured condition" });
  if (source.kind === "order" && (!source.orderStatus || !source.medicationClass)) context.addIssue({ code: "custom", message: "order sources require status and medication class" });
  if (source.kind !== "diagnosis" && source.condition) context.addIssue({ code: "custom", message: "only diagnosis sources carry a structured condition" });
  if (source.kind !== "order" && (source.orderStatus || source.medicationClass)) context.addIssue({ code: "custom", message: "only orders carry medication metadata" });
});

export const episodeSchema = z.object({
  schemaVersion: z.literal("counsel-cqa-episode/v1"),
  synthetic: z.literal(true),
  episodeId: id,
  revision: z.number().int().min(1),
  decisionSourceId: id,
  decisionAt: time,
  ageYears: z.number().int().min(0).max(120).nullable(),
  language: z.string().min(2).max(20),
  recordCompleteness: z.enum(["complete", "partial", "unavailable"]),
  sources: z.array(sourceSchema).max(60),
}).strict().superRefine((episode, context) => {
  const decision = episode.sources.find(({ id }) => id === episode.decisionSourceId);
  if (!decision || !["order", "clinician_message"].includes(decision.kind)
      || Date.parse(decision.occurredAt) !== Date.parse(episode.decisionAt)
      || Date.parse(decision.availableAt) > Date.parse(episode.decisionAt)) {
    context.addIssue({ code: "custom", message: "decision cutoff must match an available clinician message or order" });
  }
  if (new Set(episode.sources.map((source) => source.id)).size !== episode.sources.length) {
    context.addIssue({ code: "custom", message: "source IDs must be unique within an episode" });
  }
  if (episode.sources.reduce((sum, source) => sum + source.text.length, 0) > 24_000) {
    context.addIssue({ code: "custom", message: "episode exceeds the 24000-character audit budget; it must not be silently truncated" });
  }
});

export const evidenceSchema = z.object({
  sourceId: id,
  start: z.number().int().min(0),
  end: z.number().int().min(1),
  quote: z.string().min(1).max(1_000),
}).strict();
export const judgmentSchema = z.object({
  verdict: z.enum(["PASS", "FAIL", "ABSTAIN"]),
  basis: z.enum(["documented_evidence", "absence_in_complete_record", "insufficient_evidence"]),
  rationale: z.string().min(1).max(1_000),
  evidence: z.array(evidenceSchema).max(8),
  missingInformation: z.array(z.string().min(1).max(250)).max(6),
}).strict();

export type Episode = z.infer<typeof episodeSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Judgment = z.infer<typeof judgmentSchema>;
export type CriterionId = "emergency_action" | "uti_pregnancy_context" | "uti_systemic_risk" | "uri_antibiotic_indication" | "sinusitis_antibiotic_indication";
export type Criterion = {
  id: CriterionId;
  title: string;
  conditions: Array<z.infer<typeof conditionSchema>>;
  requiresAntibiotic: boolean;
  safetyCritical: boolean;
  instruction: string;
  references: string[];
};

export function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function asOfDecision(raw: unknown) {
  const episode = episodeSchema.parse(raw);
  const cutoff = Date.parse(episode.decisionAt);
  const sources = episode.sources.filter((source) => (
    Date.parse(source.occurredAt) <= cutoff && Date.parse(source.availableAt) <= cutoff
  )).sort((a, b) => Date.parse(a.availableAt) - Date.parse(b.availableAt) || a.id.localeCompare(b.id));
  return { episode: { ...episode, sources }, excludedFutureSources: episode.sources.length - sources.length };
}

export function verifyJudgment(raw: unknown, episode: Episode): Judgment {
  const result = judgmentSchema.parse(raw);
  const snapshot = asOfDecision(episode).episode;
  for (const citation of result.evidence) {
    const source = snapshot.sources.find(({ id }) => id === citation.sourceId);
    if (!source || citation.end <= citation.start || citation.end > source.text.length || source.text.slice(citation.start, citation.end) !== citation.quote) {
      throw new Error("EVIDENCE_SPAN_INVALID");
    }
  }
  if (result.verdict !== "ABSTAIN" && result.evidence.length === 0) throw new Error("EVIDENCE_REQUIRED");
  if (result.verdict !== "ABSTAIN" && !result.evidence.some(({ sourceId }) => sourceId === episode.decisionSourceId)) throw new Error("DECISION_EVIDENCE_REQUIRED");
  if (result.verdict !== "ABSTAIN" && episode.recordCompleteness !== "complete") throw new Error("RECORD_INCOMPLETE");
  if (result.verdict === "ABSTAIN" && result.missingInformation.length === 0) throw new Error("ABSTENTION_REASON_REQUIRED");
  if (result.verdict === "PASS" && result.basis !== "documented_evidence") throw new Error("PASS_REQUIRES_DOCUMENTED_EVIDENCE");
  if (result.verdict === "FAIL" && result.basis === "insufficient_evidence") throw new Error("UNCERTAINTY_REQUIRES_ABSTENTION");
  return result;
}
