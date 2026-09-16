import { z } from "zod";
import { sha256 } from "../evidence/rag/model.ts";
import { operationalRoutes } from "./routing-policy.ts";

// Research policy, not a physician-approved rule set. No matcher result is a
// patient instruction. Extraction correctness is a separate evaluation target.
export const FACT_GRAPH_VERSION = "clinical-upgrade-shadow/v1";
export const Setting = z.enum(operationalRoutes);
export type Setting = z.infer<typeof Setting>;
export const VOCABULARY = Object.freeze({
  focal_neuro_deficit: "Focal weakness, facial droop or speech deficit. Not any headache, chronic paresthesia, or a diagnostic label alone.",
  sudden_onset: "Sudden onset of the SAME neurologic episode, not an unrelated symptom.",
  new_worsening_persistent_chest_discomfort: "Reported new, worsening or persistent chest discomfort; not exertion alone or a history of stable angina.",
  anaphylaxis_pattern: "An acute allergic presentation with airway, breathing or circulation compromise; not isolated rash alone. Model interpretation, not confirmed diagnosis.",
  suicidal_intent_plan: "Current intent to act with a plan; not passive distress or remote suicidal history. Its absence never establishes safety.",
  diabetes: "Reported ongoing diabetes in the person whose foot problem is being assessed.",
  foot_ulcer: "An active reported foot ulcer, not automatically any cut or a healed ulcer.",
  fever: "Fever reported in the current illness; not absent, hypothetical or a historical fever.",
  foot_local_inflammation: "Reported local inflammatory findings affecting the same foot wound, not a confirmed severity grade.",
  localized_rash: "Reported localized rash; does NOT encode uncomplicated, absence of red flags or eligibility for home care.",
  dosing_clarification_request: "A request to clarify a personal medicine dose or units; not proof of correct dose, concentration, no overdose or low acuity.",
} as const);
export const FactId = z.enum(Object.keys(VOCABULARY) as [keyof typeof VOCABULARY, ...(keyof typeof VOCABULARY)[]]);
export type FactId = z.infer<typeof FactId>;
export const Observation = z.object({
  factId: FactId,
  subject: z.enum(["patient", "other", "unknown"]),
  episodeId: z.string().min(1).max(40),
  status: z.enum(["present", "absent", "unknown"]),
  temporality: z.enum(["current", "recent_resolved", "historical", "hypothetical", "unknown"]),
  quote: z.string().max(500),
}).strict();
export const FactExtraction = z.array(Observation).max(16);
export type Observation = z.infer<typeof Observation>;
export const Rel = z.enum(["upgrades_to", "suggests", "contraindicates_home"]);
export const Edge = z.object({
  id: z.string().min(3), from: z.array(FactId).min(1), to: Setting, rel: Rel,
  temporalities: z.array(z.enum(["current", "recent_resolved"])).min(1),
  note: z.string().min(10), sourceUrl: z.url(), sourceSection: z.string().min(3),
  status: z.literal("research_seed"),
}).strict().superRefine((e, ctx) => {
  if (new Set(e.from).size !== e.from.length) ctx.addIssue({ code: "custom", message: "Duplicate AND operand" });
  if (e.rel === "upgrades_to" && !["EMERGENCY_NOW", "SAME_DAY_IN_PERSON"].includes(e.to)) ctx.addIssue({ code: "custom", message: "v1 upgrade targets must be acute care settings" });
  if (e.rel === "contraindicates_home" && e.to === "SELF_CARE") ctx.addIssue({ code: "custom", message: "Contradictory home-care exclusion" });
});
export type Edge = z.infer<typeof Edge>;
const seed = (id: string, from: FactId[], to: Setting, rel: z.infer<typeof Rel>, note: string, sourceUrl: string, sourceSection: string, temporalities: Edge["temporalities"] = ["current"]): Edge => {
  const e = Edge.parse({ id, from, to, rel, note, sourceUrl, sourceSection, temporalities, status: "research_seed" });
  Object.freeze(e.from); Object.freeze(e.temporalities); return Object.freeze(e);
};
const footSource = "https://www.nice.org.uk/guidance/ng19/chapter/Recommendations";
export const GRAPH: readonly Edge[] = Object.freeze([
  seed("acute-neurologic", ["focal_neuro_deficit", "sudden_onset"], "EMERGENCY_NOW", "upgrades_to", "Sudden focal deficits, including a recently resolved episode, warrant emergency assessment; historical deficits do not satisfy this edge.", "https://newsroom.heart.org/news/stroke-symptoms-even-if-they-disappear-within-an-hour-need-emergency-assessment", "AHA scientific statement summary, 2023-01-19", ["current", "recent_resolved"]),
  seed("acute-chest-discomfort", ["new_worsening_persistent_chest_discomfort"], "EMERGENCY_NOW", "upgrades_to", "New, worsening or persistent chest discomfort is an emergency warning; exertion alone is not this predicate.", "https://www.heart.org/en/health-topics/heart-attack/angina-chest-pain/unstable-angina", "Reviewed 2025-01-27"),
  seed("anaphylaxis", ["anaphylaxis_pattern"], "EMERGENCY_NOW", "upgrades_to", "Suspected acute anaphylaxis requires emergency help; this seed does not select drug treatment or diagnose from a rash.", "https://www.resus.org.uk/library/additional-guidance/guidance-anaphylaxis/emergency-treatment-anaphylactic-reactions", "Emergency treatment guideline, May 2021"),
  seed("suicidal-intent-plan", ["suicidal_intent_plan"], "EMERGENCY_NOW", "upgrades_to", "Current intent with a plan warrants immediate safety assessment; this is not an exhaustive suicide-risk screen or a transport prescription.", "https://www.nimh.nih.gov/research/research-conducted-at-nimh/asq-toolkit-materials/adult-outpatient/adult-outpatient-brief-suicide-safety-assessment-guide", "Determine disposition; alternative safety pathway needs actual established care"),
  seed("diabetic-ulcer-fever", ["diabetes", "foot_ulcer", "fever"], "EMERGENCY_NOW", "upgrades_to", "Ulceration with fever in a diabetic foot problem needs immediate acute assessment, not a generic end-of-day visit. EMS is a separate decision.", footSource, "NG19 recommendation 1.4.1"),
  seed("diabetic-inflamed-ulcer", ["diabetes", "foot_ulcer", "foot_local_inflammation"], "SAME_DAY_IN_PERSON", "upgrades_to", "Candidate local-policy translation of prompt active-foot-problem assessment. More serious matched findings take precedence; absence of fever is not clearance.", footSource, "NG19 1.4.2: within one working day; same-day route is project interpretation"),
  seed("rash-review-option", ["localized_rash"], "STANDARD_ASYNC", "suggests", "Nonbinding review option only; cannot certify uncomplicated rash or exclude emergency alternatives.", "https://www.nhs.uk/conditions/cellulitis/", "Symptoms and urgent/immediate advice; queue mapping is project hypothesis"),
  seed("dose-review-option", ["dosing_clarification_request"], "PRIORITY_ASYNC", "suggests", "Nonbinding clinician/pharmacist review option, not home-care clearance or dosing advice; urgency depends on drug, concentration, exposure and timing.", "https://www.fda.gov/drugs/information-consumers-and-patients-drugs/stop-learn-go-tips-talking-your-pharmacist-learn-how-use-medicines-safely", "Ask your pharmacist; queue mapping is project hypothesis"),
]);
export const FACT_GRAPH_HASH = sha256(JSON.stringify({ version: FACT_GRAPH_VERSION, vocabulary: VOCABULARY, graph: GRAPH }));
export const FACT_EXTRACTION_INSTRUCTIONS = `Also return factObservations for an ISOLATED SHADOW experiment. Do not choose a route from these IDs. Vocabulary: ${JSON.stringify(VOCABULARY)}. Each observation includes factId, subject (patient/other/unknown), episodeId, status (present/absent/unknown), temporality (current/recent_resolved/historical/hypothetical/unknown), and an exact, uniquely occurring quote from patient. Unknown uses quote="". Quoted educational examples remain hypothetical; a caregiver describing the target patient uses patient, while unrelated relatives use other. Bind AND facts to the SAME patient episode; do not combine different people or historical illnesses. Ongoing diabetes may belong to the current foot episode. Recent_resolved means this recent unresolved care episode, not a remote history. Never invent absent findings. An exact quote still requires faithful interpretation.`;

export function shadowGraph(message: string, raw: unknown, graph: readonly Edge[] = GRAPH) {
  const start = performance.now(), parsed = FactExtraction.safeParse(raw);
  const violations: string[] = [];
  const observations: (Observation & { start: number | null; end: number | null })[] = [];
  if (!parsed.success) violations.push("INVALID_FACT_EXTRACTION");
  for (const [i, o] of (parsed.success ? parsed.data : []).entries()) {
    if (o.status === "unknown") {
      if (o.quote !== "") { violations.push(`UNKNOWN_WITH_QUOTE:${i}`); continue; }
      observations.push({ ...o, start: null, end: null }); continue;
    }
    const offset = message.indexOf(o.quote);
    if (o.quote.length < 3 || offset < 0 || message.indexOf(o.quote, offset + 1) !== -1) { violations.push(`UNBOUND_OR_AMBIGUOUS_QUOTE:${i}`); continue; }
    observations.push({ ...o, start: offset, end: offset + o.quote.length });
  }
  const edges = graph.map(e => Edge.parse(e));
  if (new Set(edges.map(e => e.id)).size !== edges.length) throw new Error("DUPLICATE_EDGE_ID");
  // Reject the entire extracted packet on provenance failure. A missing match
  // never means low risk; the independent live workflow continues unchanged.
  const paths: { edge: Edge; episodeId: string; evidence: typeof observations }[] = [];
  if (!violations.length) for (const e of edges) {
    const eligible = observations.filter(o => o.subject === "patient" && e.temporalities.includes(o.temporality as "current" | "recent_resolved"));
    for (const episodeId of [...new Set(eligible.map(o => o.episodeId))].sort()) {
      const episode = eligible.filter(o => o.episodeId === episodeId);
      const conflict = e.from.some(id => episode.some(o => o.factId === id && o.status === "present") && episode.some(o => o.factId === id && o.status !== "present"));
      if (conflict) { violations.push(`CONFLICT:${e.id}:${episodeId}`); continue; }
      if (e.from.every(id => episode.some(o => o.factId === id && o.status === "present"))) paths.push({ edge: e, episodeId, evidence: episode.filter(o => e.from.includes(o.factId) && o.status === "present") });
    }
  }
  paths.sort((a, b) => a.edge.id.localeCompare(b.edge.id) || a.episodeId.localeCompare(b.episodeId));
  const upgrades = paths.filter(p => p.edge.rel === "upgrades_to");
  const candidateFloor = upgrades.some(p => p.edge.to === "EMERGENCY_NOW") ? "EMERGENCY_NOW" : upgrades.some(p => p.edge.to === "SAME_DAY_IN_PERSON") ? "SAME_DAY_IN_PERSON" : null;
  return { version: FACT_GRAPH_VERSION, graphHash: sha256(JSON.stringify({ version: FACT_GRAPH_VERSION, vocabulary: VOCABULARY, graph: edges })), inputHash: sha256(message), mode: "shadow" as const, affectedRouting: false as const,
    semanticValidation: "not_assessed" as const, observations, paths, candidateFloor,
    suggestions: [...new Set(paths.filter(p => p.edge.rel === "suggests").map(p => p.edge.to))].sort(),
    homeContraindicated: paths.some(p => p.edge.rel === "contraindicates_home"), violations, durationMs: performance.now() - start };
}
export type FactGraphReport = ReturnType<typeof shadowGraph>;
// A research add-on cannot become a new failure gate for the clinical branch.
// The diagnostic failure remains explicit in the returned/persisted report.
export function runFactGraphShadow(message: string, raw: unknown, audit?: (report: FactGraphReport) => void, match: typeof shadowGraph = shadowGraph): FactGraphReport {
  let report: FactGraphReport;
  try { report = match(message, raw); }
  catch { report = { ...shadowGraph(message, []), violations: ["SHADOW_EXECUTION_FAILED"] }; }
  try { audit?.(report); }
  catch { report = { ...report, violations: [...report.violations, "SHADOW_AUDIT_FAILED"] }; }
  return report;
}
// These take evidence-bearing observations, never a bare list of clinical IDs.
export const matchPaths = (message: string, observations: unknown) => shadowGraph(message, observations).paths;
export const floorFromGraph = (message: string, observations: unknown) => shadowGraph(message, observations).candidateFloor;
