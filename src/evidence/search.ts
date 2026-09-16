import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { Guidance } from "../disposition/contract.ts";
import { evidenceHash } from "./library.ts";

export const SEARCH_VERSION = "clinical-search/v4";
export const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const querySchema = z.string().trim().min(3).max(100)
  .regex(/^[a-zA-Z][a-zA-Z -]*$/, "Clinical concepts only; no identifiers, numbers, URLs or search operators")
  .refine((s) => s.split(/\s+/).length <= 10 && !/\b(my|patient|name|address|ignore|instructions|system|prompt)\b/i.test(s));
export const passageSchema = z.object({
  id: z.string().min(1).max(100), title: z.string().min(3).max(500), url: z.url(),
  publisher: z.string().min(2).max(200), kind: z.enum(["guideline_passage", "patient_summary", "guideline_abstract", "review_abstract", "drug_label"]),
  text: z.string().min(40).max(12_000), section: z.string().min(3).max(200),
  publicationDate: z.string().nullable(), retrievedAt: z.iso.datetime(),
  population: z.string().min(3).max(600), limitations: z.string().min(8).max(1000),
  rights: z.string().min(5).max(500), reviewDue: z.iso.datetime().nullable(), superseded: z.boolean(),
}).strict();
export type ClinicalPassage = z.infer<typeof passageSchema> & { contentHash: string; linkStatus: "reachable" | "unverified"; retrieval?: { query: string; rank: number }; excerpt?: { start: number; end: number; originalHash: string; originalLength: number } };
export type SearchAudit = { provider: string; query: string; status: "ok" | "failed" | "cached" | "disabled"; durationMs: number; returned: number; error?: string; responseHash?: string };
export type EvidenceSearchResult = { passages: ClinicalPassage[]; audit: SearchAudit[]; version: string; corpusHash: string };
export type EvidenceSearch = (queries: string[], signal: AbortSignal) => Promise<EvidenceSearchResult>;
const hosts = new Set(["medlineplus.gov", "www.medlineplus.gov", "pubmed.ncbi.nlm.nih.gov", "dailymed.nlm.nih.gov", "www.nice.org.uk", "www.acog.org", "www.aafp.org", "www.idsociety.org", "www.acep.org", "www.abem.org", "www.cdc.gov", "www.nhs.uk"]);
export function allowedCitationUrl(value: string) {
  try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password && !u.port && hosts.has(u.hostname); } catch { return false; }
}
const plain = (value: string) => value.replace(/<[^>]*>/g, " ").replace(/&(?:nbsp|amp|lt|gt|quot|apos);/g, (m) => ({ "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" })[m]!).replace(/\s+/g, " ").trim();
const list = <T>(v: T | T[] | undefined): T[] => v === undefined ? [] : Array.isArray(v) ? v : [v];
function seal(value: z.infer<typeof passageSchema>): ClinicalPassage {
  const parsed = passageSchema.parse(value);
  if (!allowedCitationUrl(parsed.url)) throw new Error("SOURCE_HOST_NOT_ALLOWED");
  return { ...parsed, contentHash: digest(parsed), linkStatus: "unverified" };
}
export function parseMedlinePlus(xml: string, now: string): ClinicalPassage[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("XML_DECLARATION_REJECTED");
  const parsed = new XMLParser({ ignoreAttributes: false, parseTagValue: false, processEntities: true }).parse(xml);
  if (!parsed.nlmSearchResult) throw new Error("SOURCE_SCHEMA_FAILED");
  return list<any>(parsed.nlmSearchResult.list?.document).flatMap((doc) => {
    const fields = Object.fromEntries(list<any>(doc.content).map((c) => [String(c["@_name"]).toLowerCase(), plain(String(c["#text"] ?? ""))]));
    if (!fields.fullsummary || !allowedCitationUrl(doc["@_url"])) return [];
    return [seal({ id: `medlineplus-${digest(doc["@_url"]).slice(0,16)}`, title: fields.title, url: doc["@_url"], publisher: "MedlinePlus / US National Library of Medicine", kind: "patient_summary", text: fields.fullsummary, section: "Health topic summary (API)", publicationDate: null, retrievedAt: now, population: "Consumer health information; individual applicability not established", limitations: "A topic summary is not a specialty guideline. Publication/review date unavailable from this response. Retrieval rank is not clinical applicability.", rights: "MedlinePlus Web Service permits reuse with attribution; no endorsement.", reviewDue: null, superseded: false })];
  });
}
export function parseEuropePmc(json: unknown, now: string): ClinicalPassage[] {
  const response = z.object({ resultList: z.object({ result: z.array(z.record(z.string(), z.unknown())) }) }).parse(json);
  return response.resultList.result.flatMap((r) => {
    const types = list<string>((r.pubTypeList as { pubType?: string[] } | undefined)?.pubType);
    const guideline = types.some((t) => /guideline/i.test(t));
    if (!/^\d+$/.test(String(r.pmid)) || typeof r.abstractText !== "string" || r.isRetracted === "Y" || types.some((t) => /retract|preprint|case reports?/i.test(t)) || /\bcase report\b/i.test(String(r.title)) || (!guideline && !types.some((t) => /review/i.test(t)))) return [];
    const text = plain(r.abstractText); if (text.length < 40 || text.length > 12_000) return [];
    return [seal({ id: `pubmed-${r.pmid}`, title: plain(String(r.title)), url: `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`, publisher: "PubMed-indexed publication, retrieved via Europe PMC", kind: guideline ? "guideline_abstract" : "review_abstract", text, section: "Abstract only", publicationDate: typeof r.firstPublicationDate === "string" ? r.firstPublicationDate : null, retrievedAt: now, population: "Must be established from the abstract; no population match inferred", limitations: "Abstract only: methods, exceptions, recommendation strength and supersession may be absent. Indexing does not establish authority, currency or applicability.", rights: "Abstract supplied by Europe PMC; publisher rights retained. No full-text redistribution license inferred.", reviewDue: null, superseded: false })];
  });
}
// A query candidate is not a medication diagnosis. Exact generic-name matching
// below is required; no fuzzy mapping from a symptom to an unrelated drug.
export function medicationSearchTerm(queries: string[]): string | null {
  const focused = queries.slice(1).find((q) => /\b(?:monitoring|contraindications|refill|adverse|safety|renal|potassium)\b/i.test(q));
  const term = focused?.split(/\s+/)[0]?.toLowerCase();
  return term && /^[a-z]{3,30}$/.test(term) ? term : null;
}
export function parseDrugLabels(json: unknown, term: string, now: string): ClinicalPassage[] {
  const response = z.object({ results: z.array(z.record(z.string(), z.unknown())) }).parse(json);
  let matchedProduct = false;
  return response.results.flatMap((r) => {
    const metadata = z.object({ generic_name: z.array(z.string()), product_type: z.array(z.string()), application_number: z.array(z.string()).optional() }).safeParse(r.openfda);
    if (!metadata.success || !metadata.data.generic_name.some((name) => name.toLowerCase().split(/[^a-z]+/).includes(term)) || !metadata.data.product_type.includes("HUMAN PRESCRIPTION DRUG") || !metadata.data.application_number?.some((n) => /^(?:NDA|ANDA|BLA)\d+$/.test(n))) return [];
    // A single-drug query is not authority to import another active ingredient.
    if (matchedProduct || metadata.data.generic_name.length !== 1 || /\band\b|[+;/,]/i.test(metadata.data.generic_name[0])) return [];
    if (typeof r.set_id !== "string" || !/^[a-f0-9-]{36}$/i.test(r.set_id)) return [];
    matchedProduct = true;
    const title = metadata.data.generic_name.join(" / ").slice(0, 180);
    return ["boxed_warning", "warnings_and_cautions", "contraindications"].flatMap((section) => {
      const contents = z.array(z.string()).safeParse(r[section]);
      if (!contents.success) return [];
      const text = plain(contents.data.join(" ")); if (text.length < 40 || text.length > 12_000) return [];
      return [seal({ id: `label-${r.set_id}-${section}`, title: `${title} — ${section.replaceAll("_", " ")}`,
        url: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${r.set_id}`, publisher: "Manufacturer-submitted SPL via openFDA; DailyMed label link", kind: "drug_label", text,
        section: `${section}; SPL version ${String(r.version ?? "unknown").slice(0, 30)}`, publicationDate: typeof r.effective_time === "string" && /^\d{8}$/.test(r.effective_time) ? `${r.effective_time.slice(0,4)}-${r.effective_time.slice(4,6)}-${r.effective_time.slice(6,8)}` : null,
        retrievedAt: now, population: "Product labeling; verify formulation, indication, age, pregnancy and individual applicability",
        limitations: "Manufacturer-submitted labeling retrieved through openFDA, not independent FDA verification or proof of the patient's dispensed product. May differ from approved/current packaging. Label warnings do not establish a refill deadline or authorize prescribing. Not a clinical guideline.",
        rights: "openFDA public API; manufacturer labeling attribution retained; no endorsement implied", reviewDue: null, superseded: false })];
    });
  });
}
export function loadPassageCorpus(path?: string): ClinicalPassage[] {
  if (!path) return [];
  const file = readFileSync(path, "utf8"); if (Buffer.byteLength(file) > 20_000_000) throw new Error("CORPUS_TOO_LARGE");
  const passages = file.split(/\r?\n/).filter(Boolean).map((line) => seal(passageSchema.parse(JSON.parse(line))));
  if (new Set(passages.map((p) => p.id)).size !== passages.length) throw new Error("DUPLICATE_PASSAGE_ID");
  return passages;
}
const tokens = (s: string) => new Set(s.toLowerCase().match(/[a-z]{3,}/g) ?? []);
// Stable selection independent of provider completion order. Preserve exact
// substring offsets and original identity when a passage must fit the budget.
export function selectPassages(candidates: ClinicalPassage[], queries: string[], budget = 12_000) {
  const terms = tokens(queries.join(" "));
  const ranked = [...candidates].sort((a,b) => {
    const score = (p: ClinicalPassage) => [...terms].reduce((n,t) => n + (tokens(p.title).has(t) ? 3 : tokens(p.text).has(t) ? 1 : 0), 0) + (p.kind === "drug_label" ? 8 : p.kind === "guideline_passage" ? 4 : p.kind === "guideline_abstract" ? 2 : 0);
    return score(b)-score(a) || a.id.localeCompare(b.id) || a.contentHash.localeCompare(b.contentHash)
      || (a.retrieval?.query ?? "").localeCompare(b.retrieval?.query ?? "") || (a.retrieval?.rank ?? 0)-(b.retrieval?.rank ?? 0);
  });
  // Reserve one health-topic summary for the first (broad) query. Pure lexical
  // ranking displaced Suicide/Common cold with experimental-treatment reviews.
  // Provider rank is only a retrieval signal, never proof of clinical relevance.
  const summary = candidates.filter((p) => p.kind === "patient_summary" && !p.superseded && p.retrieval && queries.includes(p.retrieval.query))
    .sort((a,b) => queries.indexOf(a.retrieval!.query)-queries.indexOf(b.retrieval!.query) || a.retrieval!.rank-b.retrieval!.rank || a.id.localeCompare(b.id))[0];
  const ordered = summary ? [summary, ...ranked] : ranked;
  const selected: ClinicalPassage[] = [], seen = new Set<string>();
  let used = 0;
  for (const original of ordered) {
    if (seen.has(original.id) || original.superseded) continue;
    seen.add(original.id);
    // No synthesized summary masquerading as a source quote.
    const limit = original.kind === "drug_label" || original === summary ? 4500 : 2000;
    const text = original.text.slice(0, limit);
    const p = text === original.text ? original : { ...original, text, excerpt: { start: 0, end: text.length, originalHash: original.contentHash, originalLength: original.text.length }, contentHash: digest({ originalHash: original.contentHash, start: 0, text }), limitations: original.limitations + ` Passage truncated to its first ${limit} characters; omitted context may change interpretation.` };
    const bytes = Buffer.byteLength(JSON.stringify(p));
    if (used + bytes > budget) continue;
    selected.push(p); used += bytes;
  }
  return selected;
}
export function searchCorpus(corpus: ClinicalPassage[], queries: string[], now = Date.now()) {
  const terms = tokens(queries.join(" "));
  return corpus.filter((p) => !p.superseded && p.reviewDue !== null && Date.parse(p.reviewDue) > now)
    .map((p) => ({ p, score: [...terms].reduce((n,t) => n + (tokens(p.title).has(t) ? 3 : tokens(p.text).has(t) ? 1 : 0), 0) }))
    .filter((x) => x.score > 0).sort((a,b) => b.score-a.score || a.p.id.localeCompare(b.p.id)).slice(0,4).map((x) => x.p);
}
async function readBounded(response: Response, signal: AbortSignal) {
  const reader = response.body?.getReader(); if (!reader) throw new Error("EMPTY_SOURCE_BODY");
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { signal.throwIfAborted(); const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 512_000) throw new Error("SOURCE_BODY_TOO_LARGE"); chunks.push(value); } }
  finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks).toString("utf8");
}
export function createEvidenceSearch(options: { corpus?: ClinicalPassage[]; fetcher?: typeof fetch; external?: boolean; timeoutMs?: number; medicationLabels?: boolean } = {}): EvidenceSearch {
  const corpus = options.corpus ?? [], fetcher = options.fetcher ?? fetch;
  const cache = new Map<string, { at: number; passages: ClinicalPassage[]; hash: string }>();
  // Per-process limiter. Multi-replica use needs a shared limiter before deployment.
  let lastMedline = 0, lastLabel = 0;
  const links = new Map<string, { at: number; status: ClinicalPassage["linkStatus"] }>();
  return async (raw, parentSignal) => {
    const queries = z.array(querySchema).max(2).parse(raw); parentSignal.throwIfAborted();
    const signal = AbortSignal.any([parentSignal, AbortSignal.timeout(options.timeoutMs ?? 4500)]);
    const audit: SearchAudit[] = [];
    const candidates = searchCorpus(corpus, queries);
    audit.push({ provider: "local-passages", query: queries.join(" | "), status: "ok", durationMs: 0, returned: candidates.length });
    const medication = medicationSearchTerm(queries);
    const requests = queries.flatMap((query) => ["medlineplus", "europepmc"].map((provider) => ({ query, provider })));
    if (medication && options.medicationLabels !== false) requests.push({ query: medication, provider: "openfda" });
    if (options.external !== false) await Promise.all(requests.map(async ({ query, provider }) => {
      const start = performance.now(), key = provider + query, hit = cache.get(key);
      if (hit && Date.now()-hit.at < 12*3600_000) { candidates.push(...hit.passages.map((p, rank) => ({ ...p, retrieval: { query, rank } }))); audit.push({ provider, query, status: "cached", durationMs: 0, returned: hit.passages.length, responseHash: hit.hash }); return; }
      try {
        if (provider === "medlineplus") { const at = Math.max(Date.now(), lastMedline + 800); lastMedline = at; await new Promise<void>((resolve,reject) => { const timer = setTimeout(done, at-Date.now()); function done() { signal.removeEventListener("abort", abort); resolve(); } function abort() { clearTimeout(timer); reject(new Error("SOURCE_TIMEOUT")); } signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort(); }); }
        if (provider === "openfda") { const at = Math.max(Date.now(), lastLabel + 1600); lastLabel = at; await new Promise<void>((resolve,reject) => { const timer = setTimeout(done, at-Date.now()); function done() { signal.removeEventListener("abort", abort); resolve(); } function abort() { clearTimeout(timer); reject(new Error("SOURCE_TIMEOUT")); } signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort(); }); }
        const url = provider === "medlineplus" ? new URL("https://wsearch.nlm.nih.gov/ws/query") : provider === "openfda" ? new URL("https://api.fda.gov/drug/label.json") : new URL("https://www.ebi.ac.uk/europepmc/webservices/rest/search");
        url.search = provider === "medlineplus" ? new URLSearchParams({ db: "healthTopics", term: query, retmax: "2", tool: "counselcodex-research" }).toString() : provider === "openfda" ? new URLSearchParams({ search: `openfda.generic_name:${query} AND openfda.product_type:"HUMAN PRESCRIPTION DRUG"`, sort: "effective_time:desc", limit: "3" }).toString() : new URLSearchParams({ query: `(${query}) AND SRC:MED AND (PUB_TYPE:guideline OR PUB_TYPE:review) AND HAS_ABSTRACT:Y NOT PUB_TYPE:"Case Reports"`, format: "json", resultType: "core", pageSize: "8" }).toString();
        const response = await fetcher(url, { signal, redirect: "error", headers: { Accept: provider === "medlineplus" ? "application/xml" : "application/json" } });
        if (!response.ok) throw new Error(`SOURCE_HTTP_${response.status}`);
        const body = await readBounded(response, signal), now = new Date().toISOString();
        const passages = provider === "medlineplus" ? parseMedlinePlus(body, now) : provider === "openfda" ? parseDrugLabels(JSON.parse(body), query, now) : parseEuropePmc(JSON.parse(body), now);
        const responseHash = digest(body);
        if (cache.size >= 256) cache.delete(cache.keys().next().value!);
        cache.set(key, { at: Date.now(), passages, hash: responseHash }); candidates.push(...passages.map((p, rank) => ({ ...p, retrieval: { query, rank } })));
        audit.push({ provider, query, status: "ok", durationMs: Math.round(performance.now()-start), returned: passages.length, responseHash });
      } catch (e) { audit.push({ provider, query, status: "failed", durationMs: Math.round(performance.now()-start), returned: 0, error: e instanceof Error && /^SOURCE_/.test(e.message) ? e.message : "SOURCE_UNAVAILABLE" }); }
    }));
    else audit.push({ provider: "external", query: "", status: "disabled", durationMs: 0, returned: 0 });
    parentSignal.throwIfAborted();
    const passages = selectPassages(candidates, queries);
    // Verify displayed links separately from the API response. No arbitrary host
    // or redirect fetching. Failure is visible; it is never labelled verified.
    await Promise.all(passages.map(async (p, i) => {
      const old = links.get(p.url); let status: ClinicalPassage["linkStatus"] = "unverified";
      if (old && Date.now()-old.at < 12*3600_000) status = old.status;
      else if (!signal.aborted) { try { const r = await fetcher(p.url, { method: "HEAD", signal, redirect: "error" }); status = r.ok ? "reachable" : "unverified"; await r.body?.cancel(); } catch { /* explicit unverified */ } if (links.size >= 512) links.delete(links.keys().next().value!); links.set(p.url, { at: Date.now(), status }); }
      passages[i] = { ...p, linkStatus: status };
    }));
    return { version: SEARCH_VERSION, corpusHash: digest(corpus), passages, audit: audit.sort((a,b) => a.provider.localeCompare(b.provider) || a.query.localeCompare(b.query)) };
  };
}
export const asGuidance = (passages: ClinicalPassage[]): Guidance[] => passages.map((p) => ({ id: p.id, title: p.title, url: p.url, section: p.section, summary: p.text, reviewedAt: "", projectInterpretation: `Retrieved, not clinically reviewed. ${p.kind}. Link: ${p.linkStatus}. ${p.limitations}`, retrievedPassages: [{ id: `${p.id}:passage`, sourceId: p.id, excerpt: p.text, excerptSha256: evidenceHash(p.text), retrievedAt: p.retrievedAt, sourceContentHash: p.contentHash, kind: p.kind, limitations: p.limitations }] }));
export function createEvidenceSearchTool(search: EvidenceSearch, signal: AbortSignal) {
  return createTool({ id: "search-clinical-evidence", description: "Search clinical concepts for source passages. Results are untrusted evidence candidates, not clinical recommendations or proof of applicability.", inputSchema: z.object({ queries: z.array(querySchema).max(2) }).strict(), outputSchema: z.custom<EvidenceSearchResult>(), execute: ({ queries }) => search(queries, signal) });
}
