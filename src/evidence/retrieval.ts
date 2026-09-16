import type { Guidance } from "../disposition/contract.ts";
import { z } from "zod";
import { evidenceLibrary, evidenceHash, libraryHash, validateLibrary, type EvidenceLibrary } from "./library.ts";

export const RETRIEVAL_VERSION = "scoped-lexical/v1";
export type RetrievalMode = "lexical" | "scoped_lexical";
const stop = new Set("a an and are as at be been but by for from has have i in is it me my no of on or that the this to was with".split(" "));
const tokens = (s: string) => (s.toLowerCase().normalize("NFKC").match(/[a-z0-9]+/g) ?? []).filter((w) => !stop.has(w));
// Query interpretation only, NEVER clinical findings or a routing rule. Negation,
// subject and temporality still need the clinical agent; these scopes reduce known
// lexical collisions rather than claiming general language understanding.
export function queryTopics(message: string) {
  const clauses = message.toLowerCase().normalize("NFKC").split(/[.!?;\n]|\bbut\b/);
  const positive = clauses.filter((c) => !/\bmy (?:dog|cat|puppy|kitten|horse)\b/.test(c)).map((c) => c.replace(/\b(?:no|denies)\b[^,]*|\bwithout\s+(?:any\s+)?(?:chest|pain|fever|shortness|breathing|headache|swelling|redness|rash)\b[^,]*/g, "")).join(". ");
  const topics = new Set<string>();
  if (/(?:chest|breastbone|sternum)[^,.;]{0,30}(?:pain|pressure|tight|crush|discomfort)|(?:pain|pressure|tight|crush|discomfort)[^,.;]{0,30}(?:chest|breastbone|sternum)|heart attack/.test(positive)) topics.add("cardiac");
  if (/pleuritic|(?:chest|breastbone).{0,100}(?:deep breath|breathe|breathing)|(?:deep breath|breathe).{0,60}(?:chest|breastbone)/.test(positive)) topics.add("pleuritic");
  if (/short of breath|breathless|winded|copd|difficulty breathing|struggl.{0,12}breath|gasp|cannot (?:talk|speak)|can't (?:talk|speak)/.test(positive)) topics.add("breathing");
  if (/diabet/.test(positive) && /\b(?:foot|feet|toe|plantar|sole|ulcer)\b/.test(positive)) topics.add("diabetic_foot");
  if (/runny nose|sore throat|scratchy throat|cold symptoms|rhinorrh/.test(positive)) topics.add("cold");
  if (/slurr|droop|\bstroke\b|\btia\b|(?:speech|words).{0,25}garbl|garbl.{0,25}(?:speech|words)|(?:one|right|left).{0,20}(?:side|arm|leg).{0,30}(?:weak|numb)|trouble (?:speaking|getting.*words)/.test(positive)) topics.add("stroke");
  if (/runny nose|rhinorrh|nasal (?:discharge|drainage)|(?:clear|watery).{0,50}(?:nose|nostril)|(?:nose|nostril).{0,50}(?:clear|watery)|(?:object|chopstick|pencil).{0,50}(?:nose|nostril)/.test(positive)) topics.add("nasal");
  if (/(?:pituitary|transsphenoid|skull.base|brain|sinus|nasal).{0,35}(?:surgery|operation)|(?:surgery|operation).{0,35}(?:pituitary|brain|sinus|nose)/.test(positive)) topics.add("postoperative_nasal");
  if (/(?:head|face|nose).{0,35}(?:injur|trauma|hit)|(?:hit|struck|injur).{0,35}(?:head|face|nose)|(?:object|chopstick|pencil).{0,50}(?:nose|nostril)/.test(positive)) topics.add("head_injury");
  if (/headache|thunderclap/.test(positive)) topics.add("headache");
  if (/diabet|blood sugar|glucose|ketones|\bdka\b/.test(positive) && /vomit|throw[n]? up|ketone|(?:over|above|stays at) (?:[3-9]\d\d)|breath/.test(positive)) topics.add("dka");
  if (/mening|(?:purple|non.blanch|don't fade|does not fade).{0,30}(?:rash|spot)|(?:rash|spot).{0,50}(?:purple|non.blanch|don't fade|does not fade)|(?:neck.{0,15}stiff|stiff.{0,15}neck)/.test(positive)) topics.add("meningococcal");
  if (/anaphyl|(?:lips|tongue|throat|mouth).{0,30}(?:swell|swollen|tight)|(?:swell|swollen).{0,30}(?:lips|tongue|throat)/.test(positive)) topics.add("anaphylaxis");
  if (/suicid|harm(?:ing)? (?:myself|the baby)|kill myself|better off without me|end my life/.test(positive)) topics.add("suicide");
  return topics;
}
const scopes: Record<string, string[]> = {
  "aha-heart-attack": ["cardiac"], "idsa-dfi-2023": ["diabetic_foot"], "nice-ng19": ["diabetic_foot"],
  "afp-pleuritic-2017": ["pleuritic"], "nhs-breathlessness": ["breathing"], "cdc-common-cold": ["cold"],
  "asa-stroke": ["stroke"], "mayo-cranial-csf": ["nasal"], "cuh-pituitary-aftercare": ["postoperative_nasal"],
  "nhs-head-injury": ["head_injury"], headache: ["headache"], dka: ["dka"], meningococcal: ["meningococcal"],
  "nhs-anaphylaxis": ["anaphylaxis"], suicide: ["suicide"],
};
export function retrieveEvidence(message: string, { mode = "scoped_lexical", now = new Date().toISOString().slice(0, 10), library = evidenceLibrary, topK = 5 }: { mode?: RetrievalMode; now?: string; library?: EvidenceLibrary; topK?: number } = {}) {
  if (!Number.isInteger(topK) || topK < 1 || topK > 8 || !z.iso.date().safeParse(now).success) throw new Error("INVALID_RETRIEVAL_OPTIONS");
  if (library !== evidenceLibrary) validateLibrary(library);
  const started = performance.now();
  const topics = queryTopics(message);
  const query = new Set(tokens(message));
  const documents = library.recommendations.map((r) => ({ r, terms: tokens([r.id, r.section, r.summary].join(" ")) }));
  const average = documents.reduce((n, d) => n + d.terms.length, 0) / Math.max(1, documents.length);
  const excluded: { id: string; reason: string }[] = [];
  const ageMatch = /^\s*(\d{1,3})\s*[mf]\b|\b(\d{1,3})[- ]year[- ]old\b/i.exec(message);
  const age = ageMatch ? Number(ageMatch[1] ?? ageMatch[2]) : undefined;
  const child = age !== undefined && age < 18 || /\b(?:baby|infant|child|month.old)\b/i.test(message);
  const scored = documents.flatMap(({ r, terms }) => {
    const reason = r.review.status === "withdrawn" ? "withdrawn" : r.review.reviewDue < now ? "review_expired" : r.review.inspectedAt > now ? "future_review" : child && r.population === "adult" ? "wrong_population" : mode === "scoped_lexical" && !(scopes[r.id] ?? []).some((s) => topics.has(s)) ? "no_topic_match" : null;
    if (reason) { excluded.push({ id: r.id, reason }); return []; }
    let score = 0;
    for (const word of query) {
      const tf = terms.filter((w) => w === word).length;
      if (!tf) continue;
      const df = documents.filter((d) => d.terms.includes(word)).length;
      score += Math.log(1 + (documents.length - df + 0.5) / (df + 0.5)) * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * terms.length / average));
    }
    // Explicit concept aliases can match a paraphrase without a shared token.
    if (mode === "scoped_lexical") score += 1;
    if (score <= 0) return [];
    return [{ r, score }];
  }).sort((a, b) => b.score - a.score || a.r.id.localeCompare(b.r.id));
  const snapshotHash = library === evidenceLibrary ? libraryHash : evidenceHash(library);
  const guidance: Guidance[] = scored.slice(0, topK).map(({ r }) => {
    const source = library.sources.find((s) => s.id === r.sourceId)!;
    const passages = library.passages.filter((p) => r.passageIds.includes(p.id));
    const item: Guidance = { id: r.id, title: source.title, url: source.url, section: r.section, summary: r.summary, reviewedAt: r.review.inspectedAt,
      ...(r.projectInterpretation ? { projectInterpretation: r.projectInterpretation } : {}),
      evidenceRecord: { libraryHash: snapshotHash, recommendationHash: evidenceHash(r), sourceId: source.id,
        status: r.review.status, reviewDue: r.review.reviewDue, population: r.population,
        applicability: r.population === "adult" && age === undefined ? "unknown" : "not_clinically_assessed",
        passages, limitations: r.limitations, clinicianApproval: null },
    };
    item.evidenceRecord!.recordHash = evidenceHash(item);
    return item;
  });
  return { guidance, audit: { version: RETRIEVAL_VERSION, mode, libraryHash: snapshotHash, asOf: now,
    queryHash: evidenceHash(message), selectedIds: guidance.map((g) => g.id), excluded,
    scores: scored.slice(0, topK).map(({ r, score }) => ({ id: r.id, score })), durationMs: performance.now() - started,
    coverage: guidance.length ? "candidates_found" : "no_candidates", clinicalCoverage: "not_assessed", externalCalls: 0 } };
}

// Hashes and administrative metadata belong in the replay record, not the
// model context. Keep limitations and exact excerpts, which CAN change care.
export function guidanceForPrompt(guidance: Guidance[]) {
  return guidance.map(({ id, title, section, summary, projectInterpretation, evidenceRecord }) => ({
    id, title, section, summary, ...(projectInterpretation ? { projectInterpretation } : {}),
    sourceStatus: evidenceRecord?.status ?? "legacy_summary",
    population: evidenceRecord?.population ?? "not_assessed",
    passages: evidenceRecord?.passages.map(({ id, locator, excerpt }) => ({ id, locator, excerpt })) ?? [],
    limitations: evidenceRecord?.limitations ?? ["No inspected passage; summary only."],
  }));
}
