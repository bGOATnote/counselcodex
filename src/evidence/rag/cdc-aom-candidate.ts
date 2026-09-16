/** Isolated, unpromoted CDC prose candidate. No network or live retrieval import. */
import { readFileSync } from "node:fs";
import { chunkDocument, documentSchema, sha256, type ClinicalDocument, type Hit } from "./model.ts";

export const CDC_AOM_CAPTURE = Object.freeze({
  version: "cdc-aom-source-candidate/v1",
  url: "https://www.cdc.gov/antibiotic-use/hcp/clinical-care/pediatric-outpatient.html",
  status: 200, bytes: 68825, retrievedAt: "2026-09-15T09:54:04.114Z", reviewed: "2024-04-22",
  rawHash: "9fc7b9f9ff90d39919ce5f69e9e03198c9ca42e32b2a78501d20fda7881934f4",
  rightsUrl: "https://www.cdc.gov/other/agencymaterials.html",
  rightsStatus: 200, rightsBytes: 80260, rightsRetrievedAt: "2026-09-15T09:54:05.795Z", rightsReviewed: "2023-05-01",
  rightsHash: "4238d8179e7c53a2dbb82d10751d2b272be5aa2bf7c9ccc455333ab0674b6a8b",
  manifestHash: "b1cfee25d4412172df4906e6b084b9dce176483a025a11fe639d9e92f1ad2dd6",
});
const SELECTED = `Diagnosis
Definitive diagnosis requires either:
- Moderate or severe bulging of tympanic membrane (TM) or new onset otorrhea not due to otitis externa.
- Mild bulging of the TM AND recent (<48h) onset of otalgia (holding, tugging, rubbing of the ear in a nonverbal child) or intense erythema of the TM.
Do not diagnose AOM in children without middle ear effusion (based on pneumatic otoscopy and/or tympanometry).

Management
- Mild cases with unilateral symptoms in children 6-23 months of age or unilateral or bilateral symptoms in children >2 years may be appropriate for watchful waiting based on shared decision-making.
- Amoxicillin remains first-line therapy for children who have not received amoxicillin within the past 30 days.
- Prescribe amoxicillin/clavulanate if amoxicillin has been taken within the past 30 days if concurrent purulent conjunctivitis is present or if the child has a history of recurrent AOM unresponsive to amoxicillin.
- For children with a non-type I hypersensitivity to penicillin: cefdinir, cefuroxime, cefpodoxime, or ceftriaxone may be appropriate choices.
- Prophylactic antibiotics are not recommended to reduce the frequency of recurrent AOM.
- For further recommendations on alternative antibiotic regimens, consult the American Academy of Pediatrics guidelines. [3]`;
const fixture = (name: string) => new URL(`./fixtures/cdc-aom-2026-09-15/${name}`, import.meta.url);
const fail = (code: string): never => { throw new Error(`CDC_AOM_${code}`); };
function single(html: string, pattern: RegExp, code: string) {
  const matches = [...html.matchAll(pattern)];
  return matches.length === 1 ? matches[0] : fail(code);
}
/** Only reviewed table formatting/entities are normalized; publisher wording is
 * not corrected. Numbered citation markers are retained as [n], not imported. */
function prose(cell: string) {
  return cell.replace(/<span class="cdc-references-cite"><a[^>]+>(\d+)<\/a><\/span>/g, " [$1]")
    .replace(/<li>/g, "- ").replace(/<\/(?:li|ul|div)>|<(?:ul|div)>/g, "\n")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").split(/\r?\n/)
    .map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
}
export function parseCdcAomCandidate(html: string, rightsHtml: string, captureJson: string): ClinicalDocument {
  if (Buffer.byteLength(html) !== CDC_AOM_CAPTURE.bytes || sha256(html) !== CDC_AOM_CAPTURE.rawHash) fail("RAW_RESPONSE_CHANGED");
  if (Buffer.byteLength(rightsHtml) !== CDC_AOM_CAPTURE.rightsBytes || sha256(rightsHtml) !== CDC_AOM_CAPTURE.rightsHash) fail("RIGHTS_RESPONSE_CHANGED");
  if (sha256(captureJson) !== CDC_AOM_CAPTURE.manifestHash) fail("CAPTURE_METADATA_CHANGED");
  const canonical = /<link rel="canonical" href="([^"]+)"\s*\/>/g;
  if (single(html, canonical, "CANONICAL_CHANGED")[1] !== CDC_AOM_CAPTURE.url ||
      single(rightsHtml, canonical, "RIGHTS_CANONICAL_CHANGED")[1] !== CDC_AOM_CAPTURE.rightsUrl ||
      !html.includes('<meta property="cdc:last_reviewed" content="April 22, 2024"/>') ||
      !rightsHtml.includes('<meta property="cdc:last_reviewed" content="May 1, 2023"/>')) fail("PAGE_IDENTITY_OR_DATE_CHANGED");
  const row = single(html, /<tr>\s*<td>Acute otitis media \(AOM\)[\s\S]*?<\/tr>/g, "AOM_ROW_CHANGED")[0];
  const cells = [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(match => match[1]);
  if (cells.length !== 4) fail("TABLE_COLUMNS_CHANGED");
  const text = `Diagnosis\n${prose(cells[2])}\n\nManagement\n${prose(cells[3])}`;
  if (text !== SELECTED) fail("SELECTED_TEXT_CHANGED");
  return documentSchema.parse({
    id: "cdc:pediatric-outpatient-aom", title: "CDC pediatric outpatient care — acute otitis media diagnosis and management",
    url: CDC_AOM_CAPTURE.url, publisher: "Centers for Disease Control and Prevention / HHS", kind: "clinical_review",
    license: "US-PUBLIC-DOMAIN", licenseUrl: CDC_AOM_CAPTURE.rightsUrl,
    attribution: "Source: CDC. This material is available free of charge on the CDC website. Use of this material and links does not imply endorsement by CDC, ATSDR, HHS or the United States Government. Selected agency webpage prose only; HTML/list formatting and reference markers normalized without changing substantive wording. Media, logos, navigation and linked third-party publications excluded.",
    sourceVersion: CDC_AOM_CAPTURE.rawHash, rawHash: CDC_AOM_CAPTURE.rawHash, retrievedAt: CDC_AOM_CAPTURE.retrievedAt,
    publicationDate: null, reviewDate: CDC_AOM_CAPTURE.reviewed, reviewStatus: "publisher_reviewed", currency: "not_assessed",
    scope: "CDC clinician-facing publisher summary, not the original AAP primary guideline. The full AOM Diagnosis and Management cells are retained together, including diagnostic prerequisites, conditional observation and antibiotic-choice qualifiers. It does not confirm AOM or observation eligibility in an undiagnosed earache, establish an individual patient's findings, mandate same-day review, or assign async priority or a care setting. The publisher review date and capture reachability are not independent currency, applicability or clinical-correctness review. Linked third-party guidelines are not reproduced.",
    aliases: ["acute otitis media", "middle ear infection"], concepts: ["acute otitis media"], related: [],
    sections: [{ title: "Acute otitis media — Diagnosis and Management", text }],
  });
}
export function loadCdcAomCandidate(): ClinicalDocument {
  return parseCdcAomCandidate(readFileSync(fixture("response.html"), "utf8"), readFileSync(fixture("rights.html"), "utf8"), readFileSync(fixture("capture.json"), "utf8"));
}
export function cdcAomCandidateHits(document: ClinicalDocument = loadCdcAomCandidate()): Hit[] {
  if (sha256(JSON.stringify(document)) !== sha256(JSON.stringify(loadCdcAomCandidate()))) fail("DOCUMENT_CHANGED");
  const { sections, ...metadata } = document;
  const chunks = chunkDocument(document, 2400, 0);
  if (chunks.length !== 1 || chunks[0].text !== SELECTED) fail("EXPECTED_WHOLE_SECTION");
  return chunks.map(chunk => ({ document: metadata, chunk, score: 0, channels: ["offline-whole-source"],
    context: { before: sections[chunk.section].text.slice(0, chunk.start), after: sections[chunk.section].text.slice(chunk.end) } }));
}
