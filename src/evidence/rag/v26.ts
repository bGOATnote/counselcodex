/** Offline V26 candidate only. Not imported by the live V25 workflow.
 * Ranking signals propose passages for inspection; they cannot establish a
 * diagnosis, urgency, applicability, or support for any clinical claim. */
import { sha256, type Hit, type Retrieval } from "./model.ts";

export const V26_SELECTION_POLICY = "disposition-evidence-selection/v26";
export type RetrievalIntent = "triage" | "management" | "red_flags" | "education";
const HINTS: Record<RetrievalIntent, string> = {
  triage: "care setting referral disposition timing",
  management: "assessment treatment contraindications follow-up",
  red_flags: "warning signs emergency assessment referral",
  education: "",
};
/** Add search intent, never patient findings. Never truncate clinical context. */
export function dispositionQueryHint(query: string, intent: RetrievalIntent) {
  if (query.length < 3 || query.length > 300 || /[\u0000-\u001f]/.test(query)) throw new Error("INVALID_RAG_QUERY");
  const hint = HINTS[intent], expanded = hint ? `${query} ${hint}` : query;
  return { query: expanded.length <= 300 ? expanded : query,
    added: Boolean(hint && expanded.length <= 300), reason: !hint ? "education_unchanged" : expanded.length > 300 ? "length_preserved_no_hint" : "intent_only" };
}
const STOP = new Set("a an and are as at be been can could did do does for from has have how i if in is it may my of on or should that the their them then there these they this to was what when where which who why will with without would you your care setting referral disposition timing assessment treatment contraindications follow up warning signs emergency management patient patients need needs now today".split(" "));
const terms = (text: string) => [...new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(t => t.length > 2 && !STOP.has(t)))];
function coverage(query: string, text: string) {
  const q = terms(query), body = new Set(terms(text));
  return q.length ? q.filter(t => body.has(t)).length / q.length : 0;
}
function actionSignal(hit: Hit, intent: RetrievalIntent) {
  if (intent === "education") return 0;
  const text = hit.chunk.text;
  // Lexical ranking features only. Negation/qualifiers remain in the untouched
  // source; these matches never emit clinical assertions or escalation floors.
  const immediate = /call\s+(?:9[- ]?1[- ]?1|an ambulance)|seek\s+(?:immediate|urgent|emergency|medical)\s+(?:care|help|attention)|same.day|as soon as possible/i.test(text);
  const setting = /admi(?:t|ssion)|outpatient|inpatient|refer(?:ral)?|discharg|observation|follow.up|within\s+\d+\s+(?:hour|day)/i.test(text);
  const section = /disposition|critical actions|when to call|red flags|recommendations|follow.up|referral|acute treatment/i.test(hit.chunk.sectionTitle);
  return (immediate ? .8 : setting ? .4 : 0) + (section ? .2 : 0);
}
function sourcePrior(hit: Hit, intent: RetrievalIntent, topic: number, action: number) {
  if (!topic || intent === "education") return 0;
  if (hit.document.kind === "primary_guideline") return .1;
  if (hit.document.kind === "clinical_review") return .05;
  // A CDC/NHLBI/Medline emergency directive is not a soft overview. An
  // agent-compiled synthesis receives no authority bonus over patient material.
  return hit.document.kind === "patient_summary" && !action ? -.1 : 0;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,canonical(v)]));
  return value;
}
function verifyPassage(hit: Hit, identities: Map<string,string>) {
  if (hit.chunk.hash !== sha256(hit.chunk.text) || hit.chunk.documentId !== hit.document.id || hit.chunk.end - hit.chunk.start !== hit.chunk.text.length) throw new Error("PASSAGE_INTEGRITY_FAILURE");
  const identity = sha256(JSON.stringify(canonical([hit.chunk, hit.document, hit.context])));
  if (identities.has(hit.chunk.id) && identities.get(hit.chunk.id) !== identity) throw new Error("CONFLICTING_PASSAGE_IDENTITY");
  identities.set(hit.chunk.id,identity);
  return identity;
}
export function selectDispositionEvidence(packets: Retrieval[], intent: RetrievalIntent, limit = 9) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 12) throw new Error("INVALID_SELECTION_LIMIT");
  if (new Set(packets.map(p => p.corpusHash)).size > 1) throw new Error("MIXED_CORPUS_PACKETS");
  const candidates = new Map<string, { hit: Hit; identity: string; packetIds: Set<number>; rank: number; topic: number; action: number; prior: number; score: number }>();
  const identities = new Map<string,string>();
  const rejected: { id: string; reason: string }[] = [];
  for (const [i,p] of packets.entries()) for (const [rank,hit] of p.hits.entries()) {
    const identity = verifyPassage(hit,identities), prior = candidates.get(hit.chunk.id);
    if (hit.document.currency !== "not_assessed") { rejected.push({ id: hit.chunk.id, reason: hit.document.currency }); continue; }
    const topic = .65 * coverage(p.query, `${hit.document.title} ${hit.document.aliases.join(" ")}`) + .35 * coverage(p.query, hit.chunk.text);
    const action = actionSignal(hit,intent), classPrior = sourcePrior(hit,intent,topic,action);
    // Semantic-only candidates remain eligible via original retrieval rank.
    // Lack of exact-word overlap is not evidence of irrelevance.
    const score = 4 * topic + 1 / (rank + 1) + (topic ? action : 0) + classPrior;
    if (!prior) candidates.set(hit.chunk.id,{hit,identity,packetIds:new Set([i]),rank,topic,action,prior:classPrior,score});
    else {
      prior.packetIds.add(i);
      if (score > prior.score) Object.assign(prior,{hit,rank,topic,action,prior:classPrior,score});
    }
  }
  const ordered = [...candidates.values()].sort((a,b)=>b.score-a.score || a.hit.chunk.id.localeCompare(b.hit.chunk.id));
  const selected: typeof ordered = [], covered = new Set<number>();
  const take = (c: typeof ordered[number]) => { selected.push(c); for (const id of c.packetIds) covered.add(id); };
  // Preserve one best candidate for each query when capacity permits. This is
  // retrieval coverage, not proof that the query/claim is answered.
  for (const [i] of packets.entries()) {
    if (selected.length >= limit) break;
    if (!covered.has(i)) { const c = ordered.find(c=>c.packetIds.has(i)&&!selected.includes(c)); if(c)take(c); }
  }
  for (const c of ordered) { if (selected.length >= limit) break; if (!selected.includes(c)) take(c); }
  selected.sort((a,b)=>b.score-a.score || a.hit.chunk.id.localeCompare(b.hit.chunk.id));
  return { policy: V26_SELECTION_POLICY, intent, hits: selected.map(c=>c.hit),
    audit: { emptyPacket: selected.length === 0, retrievedCandidates: candidates.size, rejected,
      queryCoverage: packets.map((p,i)=>({query:p.query,retrieved:p.hits.length,selected:selected.filter(c=>c.packetIds.has(i)).length})),
      ranking: selected.map(c=>({id:c.hit.chunk.id,score:c.score,topic:c.topic,action:c.action,sourcePrior:c.prior,sourceClass:c.hit.document.kind})),
      claimSupport: "not_assessed" as const, applicability: "not_assessed" as const,
      unsupportedClaims: "not_assessed" as const } };
}

/** Evaluation-facing quote accounting. A bound quotation is NOT entailment. */
export function accountClaimLinks(hits: Hit[], claims: { id: string; references: { passageId: string; quote: string }[] }[]) {
  if (new Set(claims.map(c=>c.id)).size !== claims.length) throw new Error("DUPLICATE_CLAIM_ID");
  const identities = new Map<string,string>();
  for (const hit of hits) verifyPassage(hit,identities);
  return { emptyPacket: hits.length === 0, claims: claims.map(c=>({id:c.id,
    missingReferences:c.references.length===0,
    unboundReferences:c.references.filter(r=>!r.quote.trim() || !hits.some(h=>h.chunk.id===r.passageId&&h.chunk.hash===sha256(h.chunk.text)&&h.chunk.text.includes(r.quote))).length,
    support:"not_assessed" as const, applicability:"not_assessed" as const })),
    unsupportedClaims:"not_assessed" as const };
}
