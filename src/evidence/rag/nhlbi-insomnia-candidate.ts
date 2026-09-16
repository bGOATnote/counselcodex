/** Isolated offline source candidate. No live retrieval import or network call. */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { chunkDocument, documentSchema, sha256, type ClinicalDocument, type Hit } from "./model.ts";
import { measureSupportOpportunity, summarizeSupportOpportunities } from "./disposition-support.ts";

export const NHLBI_INSOMNIA_CAPTURE = Object.freeze({
  version: "nhlbi-insomnia-source-candidate/v1",
  url: "https://www.nhlbi.nih.gov/health/insomnia/diagnosis",
  status: 200, bytes: 67915, retrievedAt: "2026-09-15T08:24:58.928Z",
  rawHash: "03357b093540309dafa8613a0e5e24f6761348aa24301dd8b9826b30260d1efd",
  updated: "2022-03-24",
  baselineDocumentHash: "fa3b6a9f825833727e3a46fec22968257155cbf68c2a48e271ba4b658210b01c",
  baselineCorpusHash: "af7e4a8c239c4b084525aba008d56ce833b3a08144cea6237319bf996aa30dbd",
});
export const INSOMNIA_ASSESSMENT_QUOTE = "If not getting enough sleep is affecting your daily activities, talk to your doctor.";
export const INSOMNIA_CHRONICITY_QUOTE = "Insomnia is considered chronic (long-term) when it occurs 3 or more nights a week and lasts for 3 months or longer.";
const SELECTED = `${INSOMNIA_ASSESSMENT_QUOTE} You may be diagnosed with insomnia if you have difficulty falling or staying asleep for at least 3 nights a week. ${INSOMNIA_CHRONICITY_QUOTE} Your doctor may do more tests to see whether your insomnia is causing any other health problems.`;
const BASELINE_DURATION = "Chronic insomnia lasts for a month or longer.";
const fixture = (name: string) => new URL(`./fixtures/nhlbi-insomnia-2026-09-15/${name}`, import.meta.url);
const fail = (code: string): never => { throw new Error(`NHLBI_INSOMNIA_${code}`); };
function single(html: string, pattern: RegExp, code: string) {
  const matches = [...html.matchAll(pattern)];
  return matches.length === 1 ? matches[0] : fail(code);
}

/** Full response identity is pinned; any future source/layout/date change needs
 * a new reviewed candidate. Only one prose paragraph enters the document. */
export function parseNhlbiInsomniaCandidate(html: string, sourceUrl: string = NHLBI_INSOMNIA_CAPTURE.url): ClinicalDocument {
  if (sourceUrl !== NHLBI_INSOMNIA_CAPTURE.url) fail("SOURCE_URL_CHANGED");
  if (Buffer.byteLength(html) !== NHLBI_INSOMNIA_CAPTURE.bytes || sha256(html) !== NHLBI_INSOMNIA_CAPTURE.rawHash) fail("RAW_RESPONSE_CHANGED");
  const canonical = single(html, /<link rel="canonical" href="([^"]+)"\s*\/>/g, "CANONICAL_CHANGED")[1];
  const heading = single(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/g, "HEADING_CHANGED")[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const date = single(html, /Last updated on <time datetime="(\d{4}-\d{2}-\d{2})T[^"<>]+"[^>]*>/g, "DATE_CHANGED")[1];
  if (canonical !== sourceUrl || heading !== "Insomnia Diagnosis" || date !== NHLBI_INSOMNIA_CAPTURE.updated) fail("PAGE_IDENTITY_OR_DATE_CHANGED");
  const selectedHtml = single(html, /<p>(If not getting enough sleep[\s\S]*?)<\/p>/g, "EXCERPT_CHANGED")[1];
  // One reviewed inline link; no generic HTML flattening of unknown content.
  const text = selectedHtml.replace('<a href="https://www.nhlbi.nih.gov/health/insomnia/living-with" rel="noreferrer">other health problems</a>', "other health problems")
    .replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  if (text !== SELECTED) fail("SELECTED_TEXT_CHANGED");
  return documentSchema.parse({
    id: "nhlbi:insomnia-diagnosis", title: "Insomnia — Diagnosis", url: sourceUrl,
    publisher: "National Heart, Lung, and Blood Institute / NIH", kind: "patient_summary",
    license: "US-PUBLIC-DOMAIN", licenseUrl: "https://www.nhlbi.nih.gov/about/contact/trademark-branding-and-logo",
    attribution: "Source: National Heart, Lung, and Blood Institute; National Institutes of Health; U.S. Department of Health and Human Services. Selected agency webpage prose with HTML formatting normalized; no endorsement implied. Media, logos, formatted publications, navigation and linked material excluded.",
    sourceVersion: sha256(html), rawHash: sha256(html), retrievedAt: NHLBI_INSOMNIA_CAPTURE.retrievedAt,
    publicationDate: null, reviewDate: date, reviewStatus: "publisher_reviewed", currency: "not_assessed",
    scope: "Official patient education, not a primary guideline, diagnostic confirmation or prescribing protocol. The complete introductory paragraph keeps daily-activity advice, tentative diagnostic wording and chronicity frequency/duration together. It does not establish an individual patient's frequency, duration, diagnosis, queue priority, care setting or review deadline. The publisher update date is not an independent currency or applicability review. No sleep-diary waiting instruction is included.",
    aliases: ["sleep difficulty"], concepts: ["insomnia"], related: [],
    sections: [{ title: "Assessment advice and qualified chronicity definition", text }],
  });
}
export function loadNhlbiInsomniaCandidate() {
  return parseNhlbiInsomniaCandidate(readFileSync(fixture("response.html"), "utf8"));
}
export function loadRetainedInsomniaBaseline() {
  const document = JSON.parse(readFileSync(fixture("medlineplus-retained.json"), "utf8"));
  if (sha256(JSON.stringify(document)) !== NHLBI_INSOMNIA_CAPTURE.baselineDocumentHash) fail("BASELINE_DOCUMENT_CHANGED");
  return documentSchema.parse(document);
}
export function insomniaCandidateHits(document: ClinicalDocument): Hit[] {
  const { sections, ...metadata } = document;
  return chunkDocument(document).map(chunk => ({ document: metadata, chunk, score: 0, channels: ["offline-whole-source"],
    context: { before: sections[chunk.section].text.slice(0, chunk.start), after: sections[chunk.section].text.slice(chunk.end) } }));
}

/** Two authored exact-text opportunities, not a retrieval or clinical benchmark.
 * Bind the required text to EACH arm's document ID: no ID-only advantage. */
export function replayInsomniaSourceSupport() {
  const baseline = loadRetainedInsomniaBaseline(), candidate = loadNhlbiInsomniaCandidate();
  const arms = [baseline, candidate].map(document => {
    const hits = insomniaCandidateHits(document);
    const rows = [INSOMNIA_ASSESSMENT_QUOTE, INSOMNIA_CHRONICITY_QUOTE].map((quote, index) => measureSupportOpportunity({
      id: index === 0 ? "daily-activity-assessment-trigger" : "frequency-and-duration-chronicity",
      claim: index === 0 ? "NHLBI advises clinician discussion when insufficient sleep affects daily activities." : "The selected NHLBI chronicity wording retains both frequency and duration.",
      spans: [{ documentId: document.id, quote }],
      boundary: "Exact authored wording only; different wording requires separate semantic adjudication. No patient eligibility, queue timing or routing inference.",
    }, hits));
    return { source: document.id, documentHash: sha256(JSON.stringify(document)), rows, summary: summarizeSupportOpportunities(rows) };
  });
  return { version: NHLBI_INSOMNIA_CAPTURE.version, status: "isolated_unpromoted", capture: NHLBI_INSOMNIA_CAPTURE, arms,
    retainedDurationConflict: baseline.sections.some(s => s.text.includes(BASELINE_DURATION)) && candidate.sections.some(s => s.text.includes(INSOMNIA_CHRONICITY_QUOTE)),
    interpretation: "Whole-source authored exact-span availability only; the baseline has broader assessment discussion but different chronicity wording. Simply adding this candidate would retain a conflicting duration statement. No baseline edit, source retraction claim, retrieval ranking, embeddings, model calls, clinical alignment or patient applicability is assessed." };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(replayInsomniaSourceSupport(), null, 2));
