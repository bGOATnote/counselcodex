import { XMLParser, XMLValidator } from "fast-xml-parser";
import { documentSchema, sha256, type ClinicalDocument } from "./model.ts";

/** Source-specific adapters. Selected agency webpage prose/table only;
 * not a generic NIH crawler, clinical rule engine, or permission to use media.
 * Reviewed against the public HTML on 2026-09-14. Content/layout drift requires
 * source review rather than silently changing thresholds or dropping context.
 */
export const NHLBI_BP_SOURCES = {
  diagnosis: "https://www.nhlbi.nih.gov/health/high-blood-pressure/diagnosis",
  symptoms: "https://www.nhlbi.nih.gov/health/high-blood-pressure/symptoms",
} as const;

const ADULT_CONTEXT = "For most adults, a healthy blood pressure is less than 120/80 mm Hg. Your blood pressure is considered high when you have consistent systolic readings of 130 mm Hg or higher or diastolic readings of 80 mm Hg or higher.";
const CHILD_CONTEXT = "For children younger than 13, blood pressure readings are compared with readings that are common for children of the same, age, sex, and height.";
const HEADERS = ["Blood Pressure Category", "Systolic and Diastolic Pressure (mm Hg)"];
const ROWS = [
  ["Normal", "Less than 120 systolic pressure AND Less than 80 diastolic pressure"],
  ["Elevated", "120 to 129 systolic pressure AND Less than 80 diastolic pressure"],
  ["High Blood Pressure Stage 1", "130 to 139 systolic pressure OR 80 to 89 diastolic pressure"],
  ["High Blood Pressure Stage 2", "140 or higher systolic pressure OR 90 or higher diastolic pressure"],
  ["Hypertensive Crisis", "Higher than 180 systolic pressure OR Higher than 120 diastolic pressure\nContact your provider immediately."],
];
const RECHECK = "If your blood pressure is 180/120 but you don’t have symptoms, wait 5 minutes and check your blood pressure again. If it is still high, call your healthcare provider who may recommend starting a medicine or changing your dose.";
const ACTION = "If the second measurement is also high and if you have any of these symptoms, call 9-1-1:";
const SYMPTOMS = ["A sudden, severe headache", "Difficulty breathing", "Sudden, severe pain in your abdomen, chest, or back", "Numbness or weakness", "A sudden change in vision", "Problems talking"];
const NO_WAIT = "Do not wait to see if your pressure comes down on its own.";
type Node = Record<string, unknown>;

function reject(code: string): never { throw new Error(`NHLBI_BP_${code}`); }
function nodes(value: unknown): Node[] {
  if (!Array.isArray(value)) return reject("MARKUP_CHANGED");
  return value as Node[];
}
function name(node: Node): string {
  const names = Object.keys(node).filter(key => key !== ":@");
  if (names.length !== 1) return reject("MARKUP_CHANGED");
  return names[0];
}
function elements(value: Node[]): Node[] {
  return value.filter(node => {
    if (name(node) !== "#text") return true;
    if (String(node["#text"]).trim()) reject("UNEXPECTED_STRUCTURAL_TEXT");
    return false;
  });
}
function fragment(html: string): Node[] {
  if (/<!|<\?|copyright|reproduced with permission/i.test(html)) reject("SELECTED_CONTENT_REQUIRES_REVIEW");
  const entities: Record<string, string> = { nbsp: "&#160;", amp: "&amp;", lt: "&lt;", gt: "&gt;", quot: "&quot;", apos: "&apos;", rsquo: "&#8217;", lsquo: "&#8216;", ndash: "&#8211;", mdash: "&#8212;" };
  const xml = `<selected>${html.replace(/&([a-z]+);/gi, (entity, key: string) => entities[key] ?? reject("UNKNOWN_ENTITY"))
    .replace(/<(br|hr)\s*\/?\s*>/g, "<$1/>")}</selected>`;
  if (XMLValidator.validate(xml) !== true) reject("INVALID_SELECTED_MARKUP");
  const parsed = new XMLParser({ preserveOrder: true, ignoreAttributes: false, parseTagValue: false, processEntities: true, htmlEntities: true, trimValues: false }).parse(xml);
  return nodes(parsed[0].selected);
}
function attrs(node: Node, permitted: Record<string, string> = {}) {
  const actual = node[":@"] as Record<string, unknown> | undefined;
  if (Object.entries(actual ?? {}).some(([key, value]) => permitted[key] !== value)) reject("UNKNOWN_ATTRIBUTES");
}
function text(value: Node[], heading = false): string {
  const render = (children: Node[]): string => children.map(node => {
    const tag = name(node);
    if (tag === "#text") return String(node[tag]).replace(/\s+/g, " ");
    if (heading && tag === "span") { attrs(node, { "@_class": "ht-kicker" }); return render(nodes(node[tag])); }
    if (heading && tag === "hr") { attrs(node); return " "; }
    if (!["strong", "em", "br"].includes(tag)) return reject("UNKNOWN_INLINE_MARKUP");
    attrs(node);
    return tag === "br" ? "\n" : render(nodes(node[tag]));
  }).join("");
  return render(value).replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
}
function one(matches: RegExpMatchArray[], code: string): RegExpMatchArray {
  if (matches.length !== 1) return reject(code);
  return matches[0];
}
function metadata(html: string, key: keyof typeof NHLBI_BP_SOURCES) {
  const h1 = one([...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)], "PAGE_IDENTITY_CHANGED");
  if (text(fragment(h1[1]), true) !== `High Blood Pressure ${key === "diagnosis" ? "Diagnosis" : "Symptoms"}`) reject("PAGE_IDENTITY_CHANGED");
  const updated = one([...html.matchAll(/Last updated on <time datetime="(\d{4}-\d{2}-\d{2})T[^"<>]+"[^>]*>/g)], "DATE_MISSING_OR_AMBIGUOUS")[1];
  if (!Number.isFinite(Date.parse(updated)) || new Date(updated).toISOString().slice(0, 10) !== updated) reject("DATE_INVALID");
  return updated;
}
function requireText(actual: string, expected: string) {
  if (actual !== expected) reject("REVIEWED_TEXT_CHANGED");
  return actual; // Return the parsed source, never replacement text.
}
function makeDocument(html: string, now: string, key: keyof typeof NHLBI_BP_SOURCES, reviewDate: string, section: ClinicalDocument["sections"][number]): ClinicalDocument {
  // Keep the complete action qualification or table/context together under
  // the current default 1,800-character passage limit; never truncate to fit.
  if (section.text.length > 1700) reject("SECTION_TOO_LARGE_FOR_BOUND_CONTEXT");
  return documentSchema.parse({
    id: `nhlbi:high-blood-pressure-${key}`, title: `High Blood Pressure — ${key === "diagnosis" ? "Diagnosis and blood pressure levels" : "Symptoms and emergency action"}`,
    url: NHLBI_BP_SOURCES[key], publisher: "National Heart, Lung, and Blood Institute / NIH", kind: "patient_summary",
    license: "US-PUBLIC-DOMAIN", licenseUrl: "https://www.nhlbi.nih.gov/about/contact/trademark-branding-and-logo",
    attribution: "Source: National Heart, Lung, and Blood Institute; National Institutes of Health; U.S. Department of Health and Human Services. Selected agency webpage text with HTML formatting normalized; no endorsement implied. Images, logos, videos, captions, glossary definitions, navigation and linked material excluded.",
    sourceVersion: sha256(html), rawHash: sha256(html), retrievedAt: now, publicationDate: null, reviewDate,
    reviewStatus: "publisher_reviewed", currency: "not_assessed",
    scope: key === "diagnosis"
      ? "Official patient education, not a primary guideline or telehealth prescribing protocol. Selected adult context, under-13 caveat and complete blood-pressure category table. Strict greater-than and OR/AND wording is retained, not translated into a universal emergency route. Measurement preparation and other page sections are excluded. The webpage update date is not an independent currency or patient-applicability review."
      : "Official patient education, not a primary guideline or individualized medication instruction. The asymptomatic five-minute recheck paragraph, conditional repeat-reading/symptom 9-1-1 instruction, full symptom list and no-wait sentence are one bound excerpt. Do not substitute a different source's recheck interval. This blood-pressure-specific pathway does not establish a blood-pressure measurement prerequisite for independently emergent symptoms or justify delaying their emergency action. All other page sections, including the copyrighted Nucleus video, are excluded. The webpage update date is not an independent currency or applicability review.",
    aliases: ["hypertension", "high blood pressure", "hypertensive crisis", "systolic", "diastolic"], concepts: ["cardiovascular", "blood pressure"], related: [], sections: [section],
  });
}

export function ingestNhlbiBloodPressureDiagnosis(html: string, now: string): ClinicalDocument {
  const updated = metadata(html, "diagnosis");
  const numbersHeading = one([...html.matchAll(/<h3\b[^>]*>What the numbers mean<\/h3>/g)], "NUMBERS_HEADING_CHANGED");
  const tableHeading = one([...html.matchAll(/<h3\b[^>]*><strong>Blood Pressure Levels<\/strong><\/h3>/g)], "TABLE_HEADING_CHANGED");
  if (tableHeading.index! <= numbersHeading.index!) reject("SECTION_ORDER_CHANGED");
  const context = html.slice(numbersHeading.index! + numbersHeading[0].length, tableHeading.index);
  // Exact selected prose after the glossary embeds, not flattened modal text.
  const paragraphs = [...context.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)];
  const adultParagraph = one(paragraphs.filter(p => p[2].includes("For most adults,")), "ADULT_CONTEXT_CHANGED");
  const childParagraph = one(paragraphs.filter(p => p[2].startsWith("For children younger than 13,")), "CHILD_CONTEXT_CHANGED");
  for (const p of [adultParagraph, childParagraph]) attrs(elements(fragment(`<p${p[1]}></p>`))[0]);
  const adult = one([...adultParagraph[2].matchAll(/(For most adults,[\s\S]*)$/g)], "ADULT_CONTEXT_CHANGED")[1];
  const child = childParagraph[2];
  const adultText = requireText(text(fragment(adult)), ADULT_CONTEXT);
  const childText = requireText(text(fragment(child)), CHILD_CONTEXT);
  const after = html.slice(tableHeading.index! + tableHeading[0].length);
  const tableMatch = /^\s*(<table\b[\s\S]*?<\/table>)/.exec(after);
  if (!tableMatch) reject("TABLE_BOUNDARY_CHANGED");
  const afterTable = after.slice(tableMatch[0].length);
  const nextHeading = /<h2\b[^>]*>([\s\S]*?)<\/h2>/.exec(afterTable);
  if (!nextHeading || text(fragment(nextHeading[1])) !== "How will my provider find out if I have high blood pressure?"
    || afterTable.slice(0, nextHeading.index).replace(/<\/?div\b[^>]*>/g, "").trim()) reject("TABLE_CONTEXT_BOUNDARY_CHANGED");
  const root = elements(fragment(tableMatch[1]));
  if (root.length !== 1 || name(root[0]) !== "table") reject("TABLE_MARKUP_CHANGED");
  attrs(root[0], { "@_class": "usa-table" });
  const groups = elements(nodes(root[0].table));
  if (groups.length !== 2 || name(groups[0]) !== "thead" || name(groups[1]) !== "tbody") reject("TABLE_GROUPS_CHANGED");
  groups.forEach(group => attrs(group));
  const headRows = elements(nodes(groups[0].thead)), rows = elements(nodes(groups[1].tbody));
  if (headRows.length !== 1 || name(headRows[0]) !== "tr" || rows.length !== ROWS.length) reject("TABLE_ROWS_CHANGED");
  attrs(headRows[0]);
  const headers = elements(nodes(headRows[0].tr)).map(cell => {
    if (name(cell) !== "th") reject("TABLE_HEADERS_CHANGED");
    attrs(cell, { "@_scope": "col" }); return text(nodes(cell.th));
  });
  if (JSON.stringify(headers) !== JSON.stringify(HEADERS)) reject("TABLE_HEADERS_CHANGED");
  const normalized = rows.map((row, i) => {
    if (name(row) !== "tr") reject("TABLE_ROWS_CHANGED"); attrs(row);
    const cells = elements(nodes(row.tr));
    if (cells.length !== 2 || name(cells[0]) !== "th" || name(cells[1]) !== "td") reject("TABLE_COLUMNS_CHANGED");
    attrs(cells[0], { "@_scope": "row" }); attrs(cells[1]);
    const values = [text(nodes(cells[0].th)), text(nodes(cells[1].td))];
    values.forEach((value, n) => requireText(value, ROWS[i][n]));
    return values.map((value, n) => `${headers[n]}: ${value}`).join("\n");
  });
  return makeDocument(html, now, "diagnosis", updated, { title: "Adult context, pediatric caveat and Blood Pressure Levels", text: [adultText, childText, ...normalized].join("\n\n") });
}

export function ingestNhlbiBloodPressureSymptoms(html: string, now: string): ClinicalDocument {
  const updated = metadata(html, "symptoms");
  const start = one([...html.matchAll(/<p\b[^>]*>If your blood pressure is 180\/120 but/g)], "SYMPTOM_SECTION_START_CHANGED");
  const tail = html.slice(start.index), end = tail.search(/<figure\b/);
  if (end < 0) reject("SYMPTOM_SECTION_BOUNDARY_CHANGED");
  const selected = elements(fragment(tail.slice(0, end)));
  if (selected.map(name).join(",") !== "p,p,ul,p") reject("SYMPTOM_SECTION_STRUCTURE_CHANGED");
  selected.forEach(node => attrs(node));
  const recheck = requireText(text(nodes(selected[0].p)), RECHECK);
  const action = requireText(text(nodes(selected[1].p)), ACTION);
  const list = elements(nodes(selected[2].ul));
  if (list.length !== SYMPTOMS.length) reject("SYMPTOM_LIST_CHANGED");
  const symptoms = list.map((item, i) => {
    if (name(item) !== "li") reject("SYMPTOM_LIST_CHANGED"); attrs(item);
    return requireText(text(nodes(item.li)), SYMPTOMS[i]);
  });
  const noWait = requireText(text(nodes(selected[3].p)), NO_WAIT);
  return makeDocument(html, now, "symptoms", updated, { title: "Paired asymptomatic recheck and symptomatic emergency instructions", text: [recheck, action, ...symptoms.map(value => `- ${value}`), noWait].join("\n\n") });
}
