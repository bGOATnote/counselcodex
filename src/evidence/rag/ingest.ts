import { parse as parseYaml } from "yaml";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { documentSchema, permissiveLicense, sha256, type ClinicalDocument } from "./model.ts";

const list = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const plain = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/[ \t]+/g, " ").trim();

export const CDC_SOURCES = {
  vte: { url: "https://www.cdc.gov/blood-clots/about/", title: "About Venous Thromboembolism (Blood Clots)", sections: ["Signs and symptoms", "Testing and diagnosis"], aliases: ["deep vein thrombosis", "DVT", "pulmonary embolism", "PE", "leg swelling"], scope: "Selected CDC consumer education on DVT/PE symptoms, urgency and need for testing. The source says as soon as possible for DVT and immediately for PE; it does not define a universal same-day clock, imaging availability, or a telehealth prescribing pathway." },
  stroke: { url: "https://www.cdc.gov/stroke/signs-symptoms/index.html", title: "Signs and Symptoms of Stroke", sections: ["Signs and symptoms"], aliases: ["sudden severe headache", "neurological deficit", "weakness", "emergency warning signs", "911"], scope: "Selected CDC stroke warning-sign section and its 9-1-1 action. Not a complete headache guideline. Treatment-window text, figures, FAST maneuvers, TIA section and other page material are not included; no treatment-window claim may be attributed to this excerpt." },
} as const;

export function ingestCdc(html: string, key: keyof typeof CDC_SOURCES, now: string): ClinicalDocument {
  const source = CDC_SOURCES[key];
  const h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)];
  if (h1.length !== 1 || plain(h1[0][1]) !== source.title) throw new Error("CDC_PAGE_IDENTITY_CHANGED");
  const date = /<meta property="og:updated_time" content="(\d{4}-\d{2}-\d{2})T/.exec(html)?.[1];
  if (!date) throw new Error("CDC_DATE_MISSING");
  const sections = source.sections.map(title => {
    const headings = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)].filter(m => plain(m[1]) === title);
    if (headings.length !== 1) throw new Error("CDC_SECTION_IDENTITY_CHANGED");
    const tail = html.slice(headings[0].index! + headings[0][0].length);
    const end = tail.search(/<h2\b|<figure\b|<div class="dfe-block dfe-block--keep_reading"/);
    if (end < 0) throw new Error("CDC_SECTION_BOUNDARY_CHANGED");
    const fragment = tail.slice(0, end);
    if (/<(?:script|style|table|img|iframe)\b|copyright|reproduced with permission/i.test(fragment)) throw new Error("CDC_SECTION_REQUIRES_REVIEW");
    // Preserve headings/list/paragraph order, including DVT versus PE and
    // conditional qualifiers. Do not translate or substantively rewrite prose.
    const text = plain(fragment.replace(/<\/(?:p|li|h3|h4)>/g, "\n\n").replace(/&mdash;/g, "—").replace(/&ndash;/g, "–").replace(/&rsquo;/g, "’").replace(/&lsquo;/g, "‘")).replace(/\s*\n\s*/g, "\n").trim();
    if (text.length < 80 || /&[a-z#0-9]+;/i.test(text)) throw new Error("CDC_PROSE_CHANGED");
    return { title, text };
  });
  return documentSchema.parse({ id: `cdc:${key}`, title: source.title, url: source.url, publisher: "US Centers for Disease Control and Prevention", kind: "patient_summary", license: "US-PUBLIC-DOMAIN", licenseUrl: "https://www.cdc.gov/other/agencymaterials.html", attribution: "Source: CDC. Selected unmodified agency prose, with HTML formatting normalized. Available without charge on the CDC website. Use and links do not imply endorsement by CDC, HHS or the United States Government. No images or logos included.", sourceVersion: sha256(html), rawHash: sha256(html), retrievedAt: now, publicationDate: null, reviewDate: date, reviewStatus: "publisher_reviewed", currency: "not_assessed", scope: source.scope + " Page date is not an independent currentness or applicability review.", aliases: [...source.aliases], concepts: [], related: [], sections });
}

// A reviewed, page-specific adapter, not permission to crawl all NIH content.
// Only the two named prose sections are admitted. Images, callouts, navigation,
// linked publications and unknown markup never become licensed clinical text.
export function ingestNhlbiHeartAttack(html: string, now: string): ClinicalDocument {
  const headings = ["What are the symptoms of a heart attack?", "When to call 9-1-1"];
  const sections = headings.map(title => {
    const matches = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)].filter(m => plain(m[1]) === title);
    if (matches.length !== 1) throw new Error("NHLBI_SECTION_IDENTITY_CHANGED");
    const tail = html.slice(matches[0].index! + matches[0][0].length);
    const boundary = tail.search(/<h2\b|<span\b[^>]*data-embed-button|<div class="paragraph component/);
    if (boundary < 0) throw new Error("NHLBI_SECTION_BOUNDARY_CHANGED");
    const fragment = tail.slice(0, boundary);
    if (/<(?:script|style|table|img|iframe)\b|copyright|reproduced with permission/i.test(fragment)) throw new Error("NHLBI_SECTION_REQUIRES_REVIEW");
    const paragraphs = [...fragment.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/g)].map(m => plain(m[2]).replace(/\s+/g, " "));
    if (paragraphs.length < 3 || paragraphs.some(p => !p || p.includes("&"))) throw new Error("NHLBI_PROSE_CHANGED");
    return { title, text: paragraphs.join("\n\n") };
  });
  const date = /Last updated on <time datetime="(\d{4}-\d{2}-\d{2})T/.exec(html)?.[1];
  if (!date) throw new Error("NHLBI_DATE_MISSING");
  return documentSchema.parse({ id: "nhlbi:heart-attack-symptoms", title: "Heart Attack — Symptoms and emergency action", url: "https://www.nhlbi.nih.gov/health/heart-attack/symptoms", publisher: "National Heart, Lung, and Blood Institute / NIH", kind: "patient_summary", license: "US-PUBLIC-DOMAIN", licenseUrl: "https://www.nhlbi.nih.gov/about/contact/trademark-branding-and-logo", attribution: "Source: National Heart, Lung, and Blood Institute; National Institutes of Health; U.S. Department of Health and Human Services. Selected webpage prose; no endorsement implied. Images, logos and formatted publications excluded.", sourceVersion: sha256(html), rawHash: sha256(html), retrievedAt: now, publicationDate: null, reviewDate: date, reviewStatus: "publisher_reviewed", currency: "not_assessed", scope: "Official patient education about heart attack symptoms and emergency transport, not a prescribing protocol or guarantee of specific EMS interventions. Webpage date is not an independent currency or applicability review.", aliases: ["myocardial infarction", "acute coronary syndrome", "emergency transport"], concepts: ["cardiovascular", "emergency medical services"], related: [], sections });
}
function xmlParser(xml: string) {
  // Publisher DTD declarations are metadata, not a reason to resolve entities.
  // Internal subsets/custom entities are never accepted; network DTD fetching
  // is not supported by this parser. Strip a simple external declaration only.
  if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(xml)) throw new Error("UNSAFE_XML_ENTITY");
  const clean = xml.replace(/<!DOCTYPE[^>]*>/g, "");
  if (XMLValidator.validate(clean) !== true) throw new Error("INVALID_SOURCE_XML");
  return new XMLParser({ ignoreAttributes: false, parseTagValue: false, processEntities: true }).parse(clean);
}
function nodeText(value: unknown): string {
  if (typeof value === "string") return plain(value);
  if (Array.isArray(value)) return value.map(nodeText).join(" ");
  if (value && typeof value === "object") return Object.entries(value).filter(([k]) => !k.startsWith("@_")).map(([, v]) => nodeText(v)).join(" ");
  return "";
}

export function ingestOpenEm(markdown: string, file: string, commit: string, now: string): ClinicalDocument {
  const match = /^---\r?\n([\s\S]+?)\r?\n---\r?\n([\s\S]+)$/.exec(markdown);
  if (!match || !/^[a-f0-9]{40}$/.test(commit) || !/^corpus\/tier1\/conditions\/[a-z0-9-]+\.md$/.test(file)) throw new Error("INVALID_OPENEM_SOURCE");
  const meta = parseYaml(match[1], { maxAliasCount: 20 });
  if (meta.track !== "tier1" || meta.compiled_by !== "agent" || typeof meta.id !== "string") throw new Error("OPENEM_TIER_OR_ORIGIN_REJECTED");
  const sections = [...match[2].matchAll(/^## ([^\n]+)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)]
    // Keep clinically relevant source text, not the benchmark/evaluation fields.
    .filter(m => /^(Recognition|Critical Actions|Differential Diagnosis|Workup|Treatment|Disposition|Pitfalls)$/i.test(m[1].trim()))
    .map(m => ({ title: m[1].trim(), text: m[2].trim() })).filter(s => s.text);
  return documentSchema.parse({ id: `openem:${meta.id}`, title: meta.condition, url: `https://github.com/GOATnote-Inc/openem-corpus/blob/${commit}/${file}`, publisher: "GOATnote-Inc / OpenEM",
    kind: "research_synthesis", license: "Apache-2.0", licenseUrl: `https://github.com/GOATnote-Inc/openem-corpus/blob/${commit}/LICENSE-APACHE`, attribution: "Copyright 2026 GOATnote Inc. OpenEM Tier 1, Apache License 2.0. Content is agent-compiled synthesis; upstream review metadata is not approval of this system.",
    sourceVersion: commit, rawHash: sha256(markdown), retrievedAt: now, publicationDate: String(meta.last_updated ?? "") || null,
    reviewStatus: meta.reviewed_by ? "upstream_physician_reviewed" : "agent_compiled", reviewDate: meta.review_date ? String(meta.review_date) : null, currency: "not_assessed",
    scope: "Emergency-department reference synthesis, not a primary guideline or telehealth protocol. ESI, ICD codes and mortality metadata are excluded from route inference. Verify source claims independently; statistics, diagnoses and treatment recommendations are not pre-approved.",
    aliases: list<string>(meta.aliases), concepts: [String(meta.category ?? "emergency medicine")], related: list<any>(meta.confusion_pairs).map(p => ({ target: `openem:${p.condition}`, relation: "differential", source: "Upstream confusion_pairs metadata; a retrieval relationship, not a patient finding" })), sections });
}

export function ingestMedline(xml: string, sourceVersion: string, now: string, onExclude: (id: string, reason: string) => void = () => {}): ClinicalDocument[] {
  const root = xmlParser(xml)["health-topics"];
  if (!root) throw new Error("MEDLINE_SCHEMA_CHANGED");
  return list<any>(root["health-topic"]).filter(t => t["@_language"] === "English").filter(t => {
    if (nodeText(t["full-summary"]).trim()) return true;
    onExclude(`medlineplus:${t["@_id"]}`, "NO_PUBLIC_DOMAIN_SUMMARY"); return false;
  }).map(t => {
    const url = String(t["@_url"]);
    if (!/^https:\/\/(?:www\.)?medlineplus\.gov\/[a-z0-9-]+\.html$/.test(url)) throw new Error("MEDLINE_TOPIC_URL_REJECTED");
    // Only NLM's public-domain full-summary. Never ingest linked ADAM articles,
    // ASHP drug monographs, external sites, images or other licensed resources.
    const text = nodeText(t["full-summary"]);
    return documentSchema.parse({ id: `medlineplus:${t["@_id"]}`, title: t["@_title"], url, publisher: "MedlinePlus / US National Library of Medicine", kind: "patient_summary", license: "US-PUBLIC-DOMAIN", licenseUrl: "https://medlineplus.gov/about/using/usingcontent/", attribution: "Source: MedlinePlus, US National Library of Medicine. Health-topic summary; no endorsement implied.",
      sourceVersion, rawHash: sha256(JSON.stringify(t)), retrievedAt: now, publicationDate: null, reviewStatus: "publisher_reviewed", reviewDate: null, currency: "not_assessed",
      scope: "Public-domain consumer health-topic summary only. Not a specialty guideline, prescribing authority, or proof of individual patient applicability. XML snapshot date is not a clinical review date.",
      aliases: list<any>(t["also-called"]).map(nodeText), concepts: list<any>(t["mesh-heading"]).map(nodeText),
      related: list<any>(t["related-topic"]).filter(x => x["@_id"]).map(x => ({ target: `medlineplus:${x["@_id"]}`, relation: "related_topic", source: "NLM health-topic relationship" })),
      sections: [{ title: "Health-topic summary", text }] });
  });
}

export function ingestPmc(xml: string, pmcid: string, now: string, allowedTables: string[] = []): ClinicalDocument {
  if (!/^PMC\d+$/.test(pmcid)) throw new Error("INVALID_PMC_ID");
  const parsed = xmlParser(xml);
  const article = parsed["OAI-PMH"]?.GetRecord?.record?.metadata?.article ?? parsed.article;
  const meta = article?.front?.["article-meta"];
  if (!meta || !article.body) throw new Error("PMC_FULLTEXT_UNAVAILABLE");
  const ids = list<any>(meta["article-id"]);
  if (!ids.some(x => /^(?:pmc|pmcid)$/.test(x["@_pub-id-type"]) && String(x["#text"]).replace(/^PMC/, "") === pmcid.slice(3))) throw new Error("PMC_IDENTITY_MISMATCH");
  const licenses = list<any>(meta.permissions?.license);
  const urls = licenses.flatMap(l => [l["@_xlink:href"], ...list<any>(l["ali:license_ref"]).map(x => typeof x === "string" ? x : x["#text"])]).filter((x): x is string => typeof x === "string");
  const grants = urls.map(url => ({ url, license: permissiveLicense(url) }));
  if (grants.some(g => !g.license)) throw new Error("PMC_LICENSE_NOT_PERMISSIVE");
  const allowed = grants.find(x => x.license);
  if (!allowed) throw new Error("PMC_LICENSE_NOT_PERMISSIVE");
  if (/retracted|retraction/i.test(String(article["@_article-type"]))) throw new Error("PMC_RETRACTED");
  // Parse in document order for prose: object flattening can reorder inline
  // JATS tags. Use preserveOrder for body text to retain the original sequence.
  const ordered = new XMLParser({ preserveOrder: true, ignoreAttributes: false, parseTagValue: false, processEntities: true, trimValues: false }).parse(xml.replace(/<!DOCTYPE[^>]*>/g, ""));
  function textOf(nodes: any[]): string { return nodes.map(n => Object.entries(n).filter(([k]) => k !== ":@").map(([k, v]) => ["table-wrap", "fig", "supplementary-material", "ref-list"].includes(k) ? "" : k === "#text" ? String(v) : Array.isArray(v) ? textOf(v) : "").join("")).join(""); }
  function bodies(nodes: any[]): any[] { for (const n of nodes) for (const [k, v] of Object.entries(n)) { if (k === "body") return v as any[]; if (Array.isArray(v)) { const found = bodies(v); if (found.length) return found; } } return []; }
  const sections: ClinicalDocument["sections"] = [];
  const foundTables = new Set<string>();
  function table(nodes: any[], id: string) {
    const child = (key: string) => nodes.find(n => n[key])?.[key] ?? [];
    const raw = JSON.stringify(nodes);
    if (/reproduced (?:with|by)|permission (?:of|from)|copyright.*(?:third|elsevier)|©/i.test(raw)) throw new Error("TABLE_RIGHTS_REQUIRE_REVIEW");
    const tableNodes = child("table"), head = tableNodes.find((n: any) => n.thead)?.thead ?? [], body = tableNodes.find((n: any) => n.tbody)?.tbody ?? [];
    const headerRows = head.filter((n: any) => n.tr);
    if (headerRows.length !== 1) throw new Error("TABLE_COMPLEX_HEADER_REQUIRES_REVIEW");
    const headers = headerRows[0].tr.filter((n: any) => n.th).map((n: any) => plain(textOf(n.th)));
    if (!headers.length || headers.length > 12) throw new Error("TABLE_HEADER_INVALID");
    const title = `${id}: ${plain(textOf(child("caption")))}`;
    const foot = plain(textOf(child("table-wrap-foot")));
    const carry: { value: string; remaining: number }[] = [];
    let group = ""; const rows: string[] = [];
    for (const row of body.filter((n: any) => n.tr)) {
      const cells = row.tr.filter((n: any) => n.td || n.th);
      if (cells.length === 1 && Number(cells[0][":@"]?.["@_colspan"] ?? 1) === headers.length) { group = plain(textOf(cells[0].td ?? cells[0].th)); if (carry.some(x => x?.remaining > 0)) throw new Error("TABLE_GROUP_SPAN_CONFLICT"); continue; }
      const values: string[] = []; let at = 0;
      for (let col = 0; col < headers.length; col++) {
        if (carry[col]?.remaining > 0) { values.push(carry[col].value); carry[col].remaining--; continue; }
        const cell = cells[at++];
        if (!cell || Number(cell[":@"]?.["@_colspan"] ?? 1) !== 1) throw new Error("TABLE_COLUMN_ALIGNMENT_INVALID");
        const span = Number(cell[":@"]?.["@_rowspan"] ?? 1), value = plain(textOf(cell.td ?? cell.th));
        if (!Number.isInteger(span) || span < 1 || span > 100) throw new Error("TABLE_ROWSPAN_INVALID");
        values.push(value); carry[col] = { value, remaining: span - 1 };
      }
      if (at !== cells.length) throw new Error("TABLE_EXTRA_CELL");
      rows.push([group && `Group: ${group}`, ...headers.map((h: string, i: number) => `${h}: ${values[i]}`), foot && `Table notes: ${foot}`].filter(Boolean).join("\n"));
    }
    if (carry.some(x => x?.remaining > 0)) throw new Error("TABLE_UNFINISHED_ROWSPAN");
    let block = "";
    for (const row of rows) {
      if (row.length > 1600) throw new Error("TABLE_ROW_TOO_LARGE_FOR_LOSSLESS_PASSAGE");
      if (block && block.length + row.length + 2 > 1600) { sections.push({ title, text: block }); block = ""; }
      block += (block ? "\n\n" : "") + row;
    }
    if (block) sections.push({ title, text: block });
    foundTables.add(id);
  }
  function walk(nodes: any[], heading: string) {
    let current = heading, paragraphs: string[] = [];
    function flush() { const text = paragraphs.join("\n\n").trim(); if (text) sections.push({ title: current.slice(0, 200), text }); paragraphs = []; }
    for (const n of nodes) {
      if (n.title) current = `${heading} / ${plain(textOf(n.title))}`;
      else if (n.sec) { flush(); walk(n.sec, current); }
      else if (n.p || n.list || n["boxed-text"]) paragraphs.push(plain(textOf([n])));
      // Tables/figures can contain third-party content and lose qualification
      // on flattening. Excluded explicitly in scope, not silently summarized.
    }
    flush();
  }
  walk(bodies(ordered), "Full-text body");
  // Publishers may place tables in floats-group outside body. Traverse the
  // validated article tree separately; duplicate selected IDs are ambiguous.
  function selectedTables(nodes: any[]) { for (const n of nodes) for (const [key, value] of Object.entries(n)) {
    if (key === "table-wrap" && allowedTables.includes(n[":@"]?.["@_id"])) { const id = n[":@"]["@_id"]; if (foundTables.has(id)) throw new Error("DUPLICATE_SELECTED_TABLE"); table(value as any[], id); }
    else if (Array.isArray(value)) selectedTables(value);
  } }
  selectedTables(ordered);
  if (allowedTables.some(id => !foundTables.has(id))) throw new Error("SELECTED_TABLE_NOT_FOUND");
  if (!sections.length) throw new Error("PMC_NO_RETRIEVABLE_BODY_PROSE");
  const date = list<any>(meta["pub-date"]).find(d => d.year);
  return documentSchema.parse({ id: `pmc:${pmcid}`, title: nodeText(meta["title-group"]?.["article-title"]), url: `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`, publisher: nodeText(article.front?.["journal-meta"]?.["journal-title-group"] ?? article.front?.["journal-meta"]?.publisher), kind: "primary_guideline", license: allowed.license, licenseUrl: allowed.url,
    attribution: `${nodeText(meta["title-group"]?.["article-title"])}. ${nodeText(meta.permissions?.["copyright-statement"])} ${allowed.license}. Text extracted from PMC JATS; ${allowedTables.length ? `selected tables ${allowedTables.join(", ")} normalized as header/value rows; other tables` : "tables"}, figures and references omitted.`, sourceVersion: sha256(xml), rawHash: sha256(xml), retrievedAt: now, publicationDate: date ? String(date.year) : null, reviewStatus: "publisher_reviewed", reviewDate: null, currency: "not_assessed",
    scope: "Publisher guideline selected in a versioned source manifest. Narrative body text only: tables, figures, supplementary material and references are excluded. The source may be superseded; date and patient applicability require assessment. Retrieval is not clinician approval.", aliases: [], concepts: list<any>(meta["kwd-group"]?.kwd).map(nodeText), related: [], sections });
}
