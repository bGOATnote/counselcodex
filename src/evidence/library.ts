import { createHash } from "node:crypto";
import { z } from "zod";
import { clinicalSources } from "./source-catalog.ts";
import { legacyNotes } from "./legacy-notes.ts";

export const evidenceHash = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const date = z.iso.date();
export const passageSchema = z.object({
  id: z.string().min(1), sourceId: z.string().min(1), locator: z.string().min(1),
  excerpt: z.string().min(8).max(600), excerptSha256: z.string().regex(/^[a-f0-9]{64}$/),
  inspectedAt: date, inspection: z.literal("publisher_text_inspected_by_coding_agent"),
}).strict();
export type Passage = z.infer<typeof passageSchema>;
export type Source = { id: string; title: string; publisher: string; url: string; kind: string; publication: string; accessScope: string };
export type Recommendation = {
  id: string; sourceId: string; section: string; summary: string; projectInterpretation?: string;
  population: "all" | "adult"; passageIds: string[];
  review: { status: "legacy_summary" | "source_inspected" | "withdrawn"; inspectedAt: string; reviewDue: string; clinicianApproval: null };
  limitations: string[];
};
export type EvidenceLibrary = { version: string; sources: Source[]; passages: Passage[]; recommendations: Recommendation[] };

// Bibliographic discovery is deliberately separate from an inspected passage.
// Shared with the review catalog; no case ID, supplied label, or physician answer enters this module.
const sources: Source[] = clinicalSources.map(({ reviewedAt: _reviewedAt, ...source }) => source);
for (const note of legacyNotes) if (!sources.some((source) => source.id === note.id)) sources.push({
  id: note.id, title: note.title, publisher: new URL(note.url).hostname, url: note.url,
  kind: "Legacy guidance — see source title", publication: note.section,
  accessScope: "Migrated project summary; no independently captured supporting passage",
});
sources.push({ id: "nhs-anaphylaxis", title: "NHS: Anaphylaxis", publisher: "NHS", url: "https://www.nhs.uk/conditions/anaphylaxis/", kind: "Patient emergency guidance", publication: "Reviewed 2023-06-21; publisher review due 2026-06-21", accessScope: "Public page inspected; publisher review overdue, not a medication protocol" });

const recommendations: Recommendation[] = legacyNotes.map((note) => {
  // Previously mixed into the source summary. This is not publisher guidance.
  const split = note.summary.search(/Project interpretation/i);
  return { id: note.id, sourceId: note.id, section: note.section,
    summary: split < 0 ? note.summary : note.summary.slice(0, split).trim(),
    ...(note.projectInterpretation || split >= 0 ? { projectInterpretation: note.projectInterpretation ?? note.summary.slice(split) } : {}),
    population: "all", passageIds: [],
    review: { status: "legacy_summary", inspectedAt: note.reviewedAt, reviewDue: "2026-10-10", clinicianApproval: null },
    limitations: ["Summary retained for prototype continuity; passage-level support has not been verified."],
  };
});
const passages: Passage[] = [];
function inspected(id: string, section: string, excerpt: string, summary: string, population: Recommendation["population"], limitations: string[], projectInterpretation?: string) {
  const passageId = `${id}/p1`;
  passages.push({ id: passageId, sourceId: id, locator: section, excerpt, excerptSha256: evidenceHash(excerpt), inspectedAt: "2026-09-11", inspection: "publisher_text_inspected_by_coding_agent" });
  recommendations.push({ id, sourceId: id, section, summary, population, passageIds: [passageId],
    review: { status: "source_inspected", inspectedAt: "2026-09-11", reviewDue: "2026-12-10", clinicianApproval: null },
    limitations, ...(projectInterpretation ? { projectInterpretation } : {}),
  });
}
inspected("headache", "SORT: acute thunderclap headache", "Patients with acute thunderclap headache should be sent to the emergency department",
  "An abrupt thunderclap headache requires emergency-department evaluation. This review rates the recommendation SORT C; it does not establish a diagnosis from text or permit waiting at home.", "adult",
  ["2022 review, not a complete current headache guideline; examination findings cannot be inferred remotely."]);
inspected("dka", "Test for ketones: emergency warning signs", "You are vomiting and can't keep food or drinks down.",
  "CDC directs emergency care for diabetes with persistent marked hyperglycemia, vomiting with inability to retain intake, breathing difficulty or other DKA warning features. Do not delay emergency care to collect home ketones. A message does not confirm DKA.", "all",
  ["Patient safety guidance, not an insulin-dosing protocol; a single glucose value is not the complete diagnostic assessment."]);
inspected("meningococcal", "Key points", "Seek medical attention immediately for symptoms of meningococcal disease.",
  "Fever, headache, neck stiffness, altered mental status and sometimes a dark purple rash can accompany meningococcal disease. Babies can present differently. The CDC advises immediate medical attention; a rash need not be present.", "all",
  ["No personal probability or diagnosis can be inferred from this symptom page."],
  "Fever with a non-blanching rash and altered responsiveness requires emergency assessment now; do not ask the patient to wait for the full symptom list.");
inspected("nhs-anaphylaxis", "Immediate action required: Call 999 if", "your lips, mouth, throat or tongue suddenly become swollen",
  "Sudden lip, tongue or throat swelling, breathing or swallowing difficulty can signal anaphylaxis and require emergency help. NHS guidance uses 999; this US demonstration uses 911.", "all",
  ["Publisher's next-review date has passed; currency requires clinical review. No drug dosing or positioning protocol is included."],
  "Do not attribute chest-wall hives to cardiac chest pain. A rash alone is not proof of anaphylaxis.");
inspected("suicide", "Clinical assessment: history", "Important elements of the patient history include the intent, plan, and means",
  "Assess suicidal intent, plan, access to means, prior attempts, psychiatric illness, substance use and available support. Immediate safety and stabilization matter. Missing answers do not establish low risk.", "all",
  ["2021 review; the excerpt supports assessment domains, not a risk score or universal inpatient/outpatient decision."]);

export function validateLibrary(library: EvidenceLibrary) {
  for (const values of [library.sources, library.passages, library.recommendations]) if (new Set(values.map((v) => v.id)).size !== values.length) throw new Error("DUPLICATE_EVIDENCE_ID");
  const sourceById = new Map(library.sources.map((s) => [s.id, s]));
  const passageById = new Map(library.passages.map((p) => [p.id, passageSchema.parse(p)]));
  for (const source of library.sources) {
    const url = new URL(source.url);
    if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("INVALID_SOURCE_URL");
  }
  for (const passage of library.passages) if (!sourceById.has(passage.sourceId) || evidenceHash(passage.excerpt) !== passage.excerptSha256) throw new Error("INVALID_PASSAGE_PROVENANCE");
  for (const recommendation of library.recommendations) {
    if (!sourceById.has(recommendation.sourceId)) throw new Error("MISSING_RECOMMENDATION_SOURCE");
    date.parse(recommendation.review.inspectedAt); date.parse(recommendation.review.reviewDue);
    if (recommendation.review.reviewDue < recommendation.review.inspectedAt) throw new Error("INVALID_REVIEW_WINDOW");
    if (recommendation.review.status === "source_inspected" && !recommendation.passageIds.length) throw new Error("MISSING_SUPPORTING_PASSAGE");
    for (const id of recommendation.passageIds) if (passageById.get(id)?.sourceId !== recommendation.sourceId) throw new Error("CROSS_SOURCE_PASSAGE");
  }
  return library;
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
}
export const evidenceLibrary = deepFreeze(validateLibrary({ version: "clinical-evidence/v1", sources, passages, recommendations }));
// Exact content snapshot, not just a URL list. A changed note invalidates replay/judge bindings.
export const libraryHash = evidenceHash(evidenceLibrary);

export function evidenceGraph(library = evidenceLibrary) {
  return {
    nodes: [...library.sources.map((s) => ({ id: `source:${s.id}`, kind: "source" })), ...library.passages.map((p) => ({ id: `passage:${p.id}`, kind: "passage" })), ...library.recommendations.map((r) => ({ id: `recommendation:${r.id}`, kind: "recommendation" }))],
    edges: [...library.passages.map((p) => ({ from: `passage:${p.id}`, to: `source:${p.sourceId}`, relation: "excerpt_of" })), ...library.recommendations.flatMap((r) => [{ from: `recommendation:${r.id}`, to: `source:${r.sourceId}`, relation: "attributed_to" }, ...r.passageIds.map((id) => ({ from: `recommendation:${r.id}`, to: `passage:${id}`, relation: "inspection_anchor_not_full_entailment" }))])],
  };
}
