import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { parseEnv } from "node:util";
import { buildCorpus, restoreCorpus, sha256, type Corpus } from "../src/evidence/rag/model.ts";
import { ingestMedline, ingestOpenEm, ingestPmc, ingestNhlbiHeartAttack, ingestCdc, CDC_SOURCES } from "../src/evidence/rag/ingest.ts";
import { ClinicalRagStore, openAiEmbed } from "../src/evidence/rag/store.ts";
import { readCorpusBundle } from "../src/evidence/rag/bundle.ts";
import { validateLocalQuarantineManifest } from "../src/evidence/rag/quarantine.ts";
import { NHLBI_BP_SOURCES, ingestNhlbiBloodPressureDiagnosis, ingestNhlbiBloodPressureSymptoms } from "../src/evidence/rag/nhlbi-blood-pressure.ts";

const args = process.argv.slice(2), command = args.shift();
function arg(name: string) { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; }
const directory = resolve(arg("--directory") ?? process.env.COUNSEL_RAG_DIRECTORY ?? "apps/evaluation/.local/clinical-rag-v7");
const signal = new AbortController().signal;
function save(path: string, value: unknown) { writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 }); }
async function snapshot(url: string, name: string, maxBytes = 40_000_000) {
  const path = join(directory, "sources", name);
  if (existsSync(path)) {
    const text = readFileSync(path, "utf8"), provenance = JSON.parse(readFileSync(path + ".provenance.json", "utf8"));
    if (sha256(text) !== provenance.sha256 || provenance.requestedUrl !== url) throw new Error("SOURCE_SNAPSHOT_INTEGRITY_FAILURE");
    return text;
  }
  const u = new URL(url);
  const nhlbi = "https://www.nhlbi.nih.gov/health/heart-attack/symptoms";
  const fixedPages: string[] = [nhlbi, ...Object.values(CDC_SOURCES).map(s => s.url), ...Object.values(NHLBI_BP_SOURCES)];
  if (u.protocol !== "https:" || (!["medlineplus.gov", "www.medlineplus.gov", "pmc.ncbi.nlm.nih.gov"].includes(u.hostname) && !fixedPages.includes(url))) throw new Error("DOWNLOAD_HOST_NOT_ALLOWED");
  const fetchUrl = new URL(url); if (fetchUrl.hostname === "medlineplus.gov") fetchUrl.hostname = "www.medlineplus.gov";
  const response = await fetch(fetchUrl, { signal: AbortSignal.timeout(60_000), headers: { "Accept-Encoding": "gzip, deflate", "User-Agent": "CounselDispositionResearch/1.0 (synthetic take-home research)" } });
  if (!response.ok) throw new Error(`SOURCE_HTTP_${response.status}`);
  const final = new URL(response.url);
  if (!["medlineplus.gov", "www.medlineplus.gov", "pmc.ncbi.nlm.nih.gov"].includes(final.hostname) && !fixedPages.includes(response.url)) throw new Error("SOURCE_REDIRECT_REJECTED");
  const reader = response.body!.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > maxBytes) throw new Error("SOURCE_TOO_LARGE"); chunks.push(value); } }
  finally { await reader.cancel(); }
  const text = Buffer.concat(chunks).toString("utf8");
  writeFileSync(path, text, { flag: "wx", mode: 0o600 });
  save(path + ".provenance.json", { requestedUrl: url, finalUrl: response.url, status: response.status, retrievedAt: new Date().toISOString(), bytes: size, sha256: sha256(text) });
  return text;
}
if (command === "build") {
  const basePath = arg("--base-bundle"), quarantinePath = arg("--quarantine"), includeBloodPressure = args.includes("--nhlbi-blood-pressure");
  if (basePath || quarantinePath || includeBloodPressure) {
    if (!basePath || !quarantinePath || !includeBloodPressure || !arg("--directory") || arg("--bundle") || arg("--openem")) throw new Error("EXPLICIT_MIGRATION_REQUIRES_NEW_DIRECTORY_BASE_BUNDLE_QUARANTINE_AND_NHLBI");
  }
  const base = basePath ? readCorpusBundle(resolve(basePath)) : undefined;
  if (base?.quarantine) throw new Error("MIGRATION_REQUIRES_UNMODIFIED_V1_BASE");
  const quarantine = quarantinePath ? validateLocalQuarantineManifest(JSON.parse(readFileSync(resolve(quarantinePath), "utf8"))) : undefined;
  mkdirSync(join(directory, "sources"), { recursive: true, mode: 0o700 });
  const corpusPath = join(directory, "corpus.json");
  let corpus: Corpus;
  if (existsSync(corpusPath)) {
    const previous = JSON.parse(readFileSync(corpusPath, "utf8"));
    corpus = restoreCorpus(previous);
    if (base && quarantine) {
      const receipt = JSON.parse(readFileSync(join(directory, "ingestion.json"), "utf8"));
      const checked = buildCorpus(corpus.documents, quarantine);
      if (receipt.baseCorpusHash !== base.hash || checked.hash !== corpus.hash) throw new Error("MIGRATION_RESUME_IDENTITY_MISMATCH");
      for (const original of base.documents) if (JSON.stringify(corpus.documents.find(d => d.id === original.id)) !== JSON.stringify(original)) throw new Error("MIGRATION_ORIGINAL_DOCUMENT_CHANGED");
    }
  } else if (base && quarantine) {
    // Explicit migration preserves the frozen source cohort. Do not download a
    // newer global Medline feed or silently re-review a quarantined source ID.
    const now = new Date().toISOString(), additions = [];
    for (const [key, ingest] of [["diagnosis", ingestNhlbiBloodPressureDiagnosis], ["symptoms", ingestNhlbiBloodPressureSymptoms]] as const) {
      const name = `nhlbi-blood-pressure-${key}.html`;
      const html = await snapshot(NHLBI_BP_SOURCES[key], name, 1_000_000);
      const receipt = JSON.parse(readFileSync(join(directory, "sources", name + ".provenance.json"), "utf8"));
      additions.push(ingest(html, receipt.retrievedAt));
    }
    corpus = buildCorpus([...base.documents, ...additions], quarantine);
    const license = readFileSync(join(dirname(resolve(basePath!)), "OpenEM-LICENSE-APACHE.txt"));
    const licensePath = join(directory, "sources", "OpenEM-LICENSE-APACHE.txt");
    if (!existsSync(licensePath)) writeFileSync(licensePath, license, { flag: "wx" });
    else if (!readFileSync(licensePath).equals(license)) throw new Error("LICENSE_SNAPSHOT_MISMATCH");
    save(corpusPath, corpus);
    save(join(directory, "ingestion.json"), { createdAt: now, hash: corpus.hash, baseBundle: resolve(basePath!), baseCorpusHash: base.hash,
      baseBundleManifestHash: sha256(readFileSync(resolve(basePath!))), quarantinePolicyHash: corpus.quarantine!.policyHash,
      retainedDocuments: corpus.documents.length, addedDocumentIds: additions.map(d => d.id), excludedDocumentIds: corpus.quarantine!.excludedDocumentIds, chunks: corpus.chunks.length,
      note: "Derived from the unchanged frozen bundle, with two explicit NHLBI source additions and a local engineering quarantine. Original source text and publisher metadata are retained, not corrected or retracted. Original raw snapshots remain in the prior source directory; this migration does not refresh them or confer clinical approval." });
  } else if (arg("--bundle")) {
    corpus = readCorpusBundle(resolve(arg("--bundle")!));
    save(corpusPath, corpus);
    save(join(directory, "ingestion.json"), { createdAt: new Date().toISOString(), hash: corpus.hash, importedFromBundle: resolve(arg("--bundle")!), documents: corpus.documents.length, chunks: corpus.chunks.length, note: "Frozen source version replay; no new publisher verification claimed." });
  } else {
    const now = new Date().toISOString(), documents = [], rejected: { source: string; reason: string }[] = [];
    const openem = arg("--openem");
    if (openem) {
      const root = resolve(openem), commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
      // Read pinned Git objects, not an uncommitted working copy with a false
      // commit citation. Record and retain the upstream license and notice.
      const files = execFileSync("git", ["ls-tree", "-r", "--name-only", commit, "corpus/tier1/conditions"], { cwd: root, encoding: "utf8" }).trim().split("\n");
      for (const file of files.filter(f => f.endsWith(".md"))) {
        const text = execFileSync("git", ["show", `${commit}:${file}`], { cwd: root, encoding: "utf8", maxBuffer: 4_000_000 });
        try { documents.push(ingestOpenEm(text, file, commit, now)); } catch (e) { rejected.push({ source: file, reason: e instanceof Error ? e.message : "INVALID_OPENEM_RECORD" }); }
      }
      const licensePath = join(directory, "sources", "OpenEM-LICENSE-APACHE.txt"), license = execFileSync("git", ["show", `${commit}:LICENSE-APACHE`], { cwd: root, encoding: "utf8" });
      if (!existsSync(licensePath)) writeFileSync(licensePath, license, { flag: "wx" });
      else if (readFileSync(licensePath, "utf8") !== license) throw new Error("LICENSE_SNAPSHOT_MISMATCH");
    }
    const page = await snapshot("https://medlineplus.gov/xml.html", "medline-download-page.html", 1_000_000);
    const url = [...page.matchAll(/href="(https:\/\/medlineplus\.gov\/xml\/mplus_topics_\d{4}-\d{2}-\d{2}\.xml)"/g)].map(m => m[1]).sort().reverse()[0];
    if (!url) throw new Error("MEDLINE_DOWNLOAD_LINK_NOT_FOUND");
    documents.push(...ingestMedline(await snapshot(url, "medline-topics.xml"), url, now, (source, reason) => rejected.push({ source, reason })));
    try { documents.push(ingestNhlbiHeartAttack(await snapshot("https://www.nhlbi.nih.gov/health/heart-attack/symptoms", "nhlbi-heart-attack.html", 1_000_000), now)); }
    catch (e) { rejected.push({ source: "nhlbi:heart-attack-symptoms", reason: e instanceof Error ? e.message : "NHLBI_SOURCE_FAILED" }); }
    for (const key of Object.keys(CDC_SOURCES) as (keyof typeof CDC_SOURCES)[]) {
      try { documents.push(ingestCdc(await snapshot(CDC_SOURCES[key].url, `cdc-${key}.html`, 1_000_000), key, now)); }
      catch (e) { rejected.push({ source: `cdc:${key}`, reason: e instanceof Error ? e.message : "CDC_SOURCE_FAILED" }); }
    }
    // Deliberate, reviewable starter manifest; not an automated claim that every
    // PubMed review is a guideline. Expansion requires identity/license checks.
    const manifest = JSON.parse(readFileSync(new URL("../data/evidence/rag-primary-sources.json", import.meta.url), "utf8")) as { sources: { pmcid: string; titleIncludes: string; kind: "primary_guideline" | "clinical_review"; currency: "not_assessed" | "superseded"; rationale: string; tables?: string[] }[] };
    for (const source of manifest.sources) {
      try {
        const url = `https://pmc.ncbi.nlm.nih.gov/api/oai/v1/mh/?verb=GetRecord&metadataPrefix=pmc&identifier=oai:pubmedcentral.nih.gov:${source.pmcid.slice(3)}`;
        const doc = ingestPmc(await snapshot(url, `${source.pmcid}.xml`, 8_000_000), source.pmcid, now, source.tables);
        if (!doc.title.toLowerCase().includes(source.titleIncludes.toLowerCase())) throw new Error("MANIFEST_TITLE_MISMATCH");
        doc.currency = source.currency;
        doc.kind = source.kind;
        doc.scope = `${source.rationale} ${source.tables?.length ? `Selected tables ${source.tables.join(", ")} are normalized header/value rows with spanning cells propagated, not verbatim prose.` : "Tables omitted."} Figures, supplementary material and references omitted. Currentness and patient applicability are not certified by ingestion.`;
        documents.push(doc);
      } catch (e) { rejected.push({ source: source.pmcid, reason: e instanceof Error ? e.message : "PRIMARY_SOURCE_FAILED" }); }
      // PMC permits no concurrent calls, <=3/s. We use <=1/s.
      await new Promise(r => setTimeout(r, 1000));
    }
    corpus = buildCorpus(documents); save(corpusPath, corpus);
    save(join(directory, "ingestion.json"), { createdAt: now, hash: corpus.hash, documents: documents.length, chunks: corpus.chunks.length, rejected, primaryManifest: manifest });
  }
  const store = await ClinicalRagStore.open(join(directory, "postgres"));
  try {
    console.log(JSON.stringify({ stage: "index", hash: corpus.hash, ...await store.build(corpus) }));
    const reuse = arg("--reuse-embeddings");
    if (reuse) { if (resolve(reuse) === directory) throw new Error("CANNOT_REUSE_CURRENT_INDEX"); console.log(JSON.stringify({ stage: "reuse", embeddings: await store.reuseEmbeddings(join(resolve(reuse), "postgres")) })); }
    if (args.includes("--embed")) {
      const env = existsSync(".env") ? parseEnv(readFileSync(".env", "utf8")) : {};
      const stats = await store.embedMissing(openAiEmbed(process.env.OPENAI_API_KEY ?? env.OPENAI_API_KEY ?? ""), signal, record => console.log(JSON.stringify({ stage: "embedding", ...record as object })));
      console.log(JSON.stringify({ stage: "complete", ...stats }));
    }
  } finally { await store.close(); }
} else if (command === "search" || command === "stats") {
  const store = await ClinicalRagStore.open(join(directory, "postgres"));
  try {
    if (command === "stats") console.log(JSON.stringify(await store.stats(), null, 2));
    else {
      const env = existsSync(".env") ? parseEnv(readFileSync(".env", "utf8")) : {};
      const query = arg("--query"); if (!query) throw new Error("QUERY_REQUIRED");
      const result = await store.search(query, { mode: args.includes("--lexical") ? "lexical" : "hybrid", embed: openAiEmbed(process.env.OPENAI_API_KEY ?? env.OPENAI_API_KEY ?? ""), signal });
      console.log(JSON.stringify({ ...result, hits: result.hits.map(h => ({ id: h.chunk.id, title: h.document.title, kind: h.document.kind, section: h.chunk.sectionTitle, channels: h.channels, score: h.score, excerpt: h.chunk.text.slice(0, 160) })) }, null, 2));
    }
  } finally { await store.close(); }
} else throw new Error("Usage: clinical-rag.ts build --openem PATH [--embed] | build --directory NEW --base-bundle MANIFEST --quarantine POLICY --nhlbi-blood-pressure [--reuse-embeddings DONOR_COPY] [--embed] | stats | search --query CONCEPTS [--lexical]; optional --directory PATH");
