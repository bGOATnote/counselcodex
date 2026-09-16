import { z } from "zod";

export const RESPONSE_SAFETY_VERSION = "response-safety/v1" as const;
const definitions = [
  { id: "breathing", label: "Breathing difficulty", terms: ["shortness of breath", "difficulty breathing", "trouble breathing"] },
  { id: "chest", label: "Chest pain / pressure", terms: ["chest pain", "chest pressure"] },
  { id: "syncope", label: "Fainting / collapse", terms: ["fainting", "passing out", "collapse"] },
  { id: "neurologic", label: "Weakness / focal neurologic mentions", terms: ["weakness", "facial droop", "slurred speech"] },
  { id: "fever", label: "Fever", terms: ["fever"] },
  { id: "bleeding", label: "Bleeding", terms: ["bleeding", "blood in stool", "black stools"] },
  { id: "hydration", label: "Vomiting / inability to retain fluids", terms: ["vomiting", "trouble keeping fluids down"] },
  { id: "flank", label: "Flank / back pain", terms: ["flank pain", "back pain"], relevance: /urina|pee|dysuria|uti\b|flank|kidney/i },
  { id: "pregnancy", label: "Pregnancy context", terms: ["pregnancy"], relevance: /pregnan|postpartum|birth control|bleed|pee|dysuria|uti\b/i },
  { id: "leg", label: "Unilateral leg symptoms", terms: ["leg swelling", "calf swelling", "calf pain"], relevance: /chest|breath|flight|travel|leg|calf/i },
  { id: "meningeal", label: "Neck stiffness", terms: ["neck stiffness", "stiff neck"], relevance: /headache|head ache|fever|photophob/i },
  { id: "safety", label: "Self-harm / harm to others", terms: ["suicidal thoughts", "thoughts of harming myself", "thoughts of harming others"], relevance: /hopeless|suicid|harm|depress|postpartum|baby|better off/i },
] as const;

export const safetyQuoteSchema = z.object({ turn: z.number().int().positive(), quote: z.string().min(1).max(400) }).strict();
export const safetyReviewSchema = z.object({
  version: z.literal(RESPONSE_SAFETY_VERSION),
  assessedThroughTurn: z.number().int().positive(),
  scope: z.literal("limited_literal_statement_review_not_clinical_clearance"),
  clinicalClearanceEstablished: z.literal(false),
  redFlags: z.array(z.object({
    id: z.string(), label: z.string(),
    status: z.enum(["reported", "explicit_denial_recorded", "not_assessed", "mentioned_needs_assessment", "prior_denial_needs_recheck", "prior_report_needs_recheck", "prior_positive_now_denied", "conflicting_reports"]),
    evidence: z.array(safetyQuoteSchema),
  }).strict()),
  vitalSigns: z.array(z.object({
    id: z.string(), label: z.string(),
    status: z.enum(["not_available", "reported_requires_interpretation"]),
    observations: z.array(safetyQuoteSchema),
  }).strict()),
  interpretation: z.string(),
}).strict();
export type ResponseSafetyReview = z.infer<typeof safetyReviewSchema>;
type Turn = { role: "patient" | "clinician"; content: string };

const vitalDefinitions = [
  { id: "temperature", label: "Temperature", pattern: /\b(?:temperature|temp|fever)(?:\s+(?:of|is|was))?\s*[:=]?\s*\d{2,3}(?:\.\d+)?\s*(?:°?\s*[cf]\b|degrees\b)?/ig },
  { id: "heart_rate", label: "Heart rate", pattern: /\b(?:heart rate|pulse|hr)(?:\s+(?:of|is|was))?\s*[:=]?\s*\d{2,3}\s*(?:bpm\b)?/ig },
  { id: "respiratory_rate", label: "Respiratory rate", pattern: /\b(?:respiratory rate|breathing rate|rr)(?:\s+(?:of|is|was))?\s*[:=]?\s*\d{1,2}\s*(?:breaths?\b)?/ig },
  { id: "blood_pressure", label: "Blood pressure", pattern: /\b(?:blood pressure|bp)(?:\s+(?:of|is|was))?\s*[:=]?\s*\d{2,3}\s*\/\s*\d{2,3}/ig },
  { id: "oxygen_saturation", label: "Oxygen saturation", pattern: /\b(?:oxygen saturation|spo2|o2 sat|oxygen level)(?:\s+(?:of|is|was))?\s*[:=]?\s*\d{2,3}\s*%?/ig },
] as const;

// Deliberately narrow literal grammar. This is not an NLP diagnostic screen.
// Only whole, unambiguous first-person/telegraphic declarations may assert denial.
// Unrecognized prose remains not_assessed, never negative by default.
function explicitStatement(sentence: string, term: string): "reported" | "denied" | null {
  if (sentence.includes("?")) return null;
  const normalized = sentence.toLowerCase().trim().replace(/[.!?]+$/, "").trim();
  if ([`no ${term}`, `i have no ${term}`, `i do not have ${term}`, `i don't have ${term}`, `i am not having ${term}`, `i'm not having ${term}`].includes(normalized)) return "denied";
  if ([`i have ${term}`, `i am having ${term}`, `i'm having ${term}`].includes(normalized)) return "reported";
  return null;
}

export function buildResponseSafetyReview(turns: Turn[]): ResponseSafetyReview {
  if (!turns.length || turns.at(-1)?.role !== "patient") throw new Error("Safety review requires a latest patient turn");
  const patientText = turns.filter((turn) => turn.role === "patient").map((turn) => turn.content).join("\n");
  const redFlags = definitions.filter((definition) => !("relevance" in definition) || definition.relevance.test(patientText)).map((definition) => {
    const observations: Array<{ turn: number; quote: string; state: "reported" | "denied" | "mentioned" }> = [];
    turns.forEach((turn, index) => {
      if (turn.role !== "patient") return;
      // Do not split comma/or lists: negation scope and attribution may be ambiguous.
      for (const match of turn.content.matchAll(/[^.!?\n]+[.!?]?/g)) {
        const quote = match[0].trim();
        if (quote.length > 400) continue;
        const state = definition.terms.map((term) => explicitStatement(quote, term)).find(Boolean);
        if (state) observations.push({ turn: index + 1, quote, state });
        else if (definition.id === "pregnancy" && /^(?:i'm|i am) not pregnant[.!]?$/i.test(quote)) observations.push({ turn: index + 1, quote, state: "denied" });
        else if (definition.terms.some((term) => quote.toLowerCase().includes(term))
          || (definition.id === "chest" && /\bchest\b/i.test(quote))
          || (definition.id === "pregnancy" && /pregnan|postpartum/i.test(quote))) observations.push({ turn: index + 1, quote, state: "mentioned" });
      }
    });
    const positive = observations.some((item) => item.state === "reported");
    const negative = observations.some((item) => item.state === "denied");
    const currentDenial = observations.some((item) => item.state === "denied" && item.turn === turns.length);
    const currentPositive = observations.some((item) => item.state === "reported" && item.turn === turns.length);
    // Unparsed mentions can contradict an otherwise simple denial. Do not clear it.
    const currentMention = observations.some((item) => item.state === "mentioned" && item.turn === turns.length);
    const status = currentPositive && currentDenial ? "conflicting_reports" : currentPositive ? "reported"
      : currentMention ? "mentioned_needs_assessment" : positive && currentDenial ? "prior_positive_now_denied"
      : currentDenial ? "explicit_denial_recorded" : positive ? "prior_report_needs_recheck"
      : negative ? "prior_denial_needs_recheck" : observations.length ? "mentioned_needs_assessment" : "not_assessed";
    return { id: definition.id, label: definition.label, status, evidence: observations.map(({ turn, quote }) => ({ turn, quote })) };
  });
  const vitalSigns = vitalDefinitions.map(({ id, label, pattern }) => {
    const observations: Array<{ turn: number; quote: string }> = [];
    turns.forEach((turn, index) => {
      if (turn.role !== "patient") return;
      for (const match of turn.content.matchAll(new RegExp(pattern))) {
        // A candidate mention is not an authenticated patient measurement. Retain
        // surrounding attribution/time/context instead of inventing any metadata.
        const start = Math.max(0, match.index! - 70);
        const end = Math.min(turn.content.length, match.index! + match[0].length + 70);
        observations.push({ turn: index + 1, quote: turn.content.slice(start, end) });
      }
    });
    return { id, label, status: observations.length ? "reported_requires_interpretation" : "not_available", observations };
  });
  return safetyReviewSchema.parse({
    version: RESPONSE_SAFETY_VERSION, assessedThroughTurn: turns.length,
    scope: "limited_literal_statement_review_not_clinical_clearance", clinicalClearanceEstablished: false,
    redFlags, vitalSigns,
    interpretation: "Not assessed means this limited extractor did not establish a current answer; review the original message. A denial applies only to the quoted symptom, not the whole category or exclusion of disease. Attribution and temporality still need clinical verification. Vital mentions require verification of subject, value, units, measurement time, device, age/pregnancy, baseline and trend. Missing or apparently normal vitals do not establish stability. Do not delay emergency action to obtain readings.",
  });
}

export function assertNoUnsupportedClearance(text: string): void {
  if (/\b(?:no|without|absen(?:ce|t) of)\s+(?:any\s+)?red flags\b|\b(?:vitals?|vital signs)\s+(?:are\s+|were\s+|is\s+)?(?:normal|stable|reassuring|within normal limits)\b|\b(?:hemodynamically|physiologically)\s+stable\b/i.test(text)) {
    throw new Error("UNSUPPORTED_SAFETY_CLEARANCE");
  }
}
