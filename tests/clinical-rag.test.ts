import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { readCorpusBundle } from "../src/evidence/rag/bundle.ts";
import { buildCorpus, chunkDocument, permissiveLicense, sha256, type ClinicalDocument } from "../src/evidence/rag/model.ts";
import { ingestMedline, ingestOpenEm, ingestPmc, ingestNhlbiHeartAttack, ingestCdc } from "../src/evidence/rag/ingest.ts";
import { ClinicalRagStore, validateVectors, type Embed } from "../src/evidence/rag/store.ts";

const now = "2026-09-13T00:00:00.000Z";
test("CDC adapter preserves conditional warning text and excludes image and treatment-window material", () => {
  const html = '<meta property="og:updated_time" content="2026-05-19T00:00:00Z"><h1>Signs and Symptoms of Stroke</h1><h2>Signs and symptoms</h2><h3>Warning signs</h3><ul><li>Sudden weakness on one side.</li><li>Sudden severe headache with no known cause.</li></ul><p>Call 9-1-1 right away if these symptoms occur.</p><figure><img src="copyrighted.jpg"><p>Third-party image caption.</p></figure><h2>When to seek emergency help</h2><p>Excluded treatment-window claim.</p>';
  const doc = ingestCdc(html, "stroke", now);
  assert.equal(doc.sections.length, 1); assert.match(doc.sections[0].text, /Call 9-1-1 right away if these symptoms occur/);
  assert.doesNotMatch(doc.sections[0].text, /Third-party|treatment-window|copyrighted/);
  assert.match(doc.attribution, /without charge.*do not imply endorsement/);
  assert.throws(() => ingestCdc(html.replace("Signs and Symptoms of Stroke", "Other page"), "stroke", now), /IDENTITY/);
  assert.throws(() => ingestCdc(html.replace("<h3>", "<script>untrusted</script><h3>"), "stroke", now), /REQUIRES_REVIEW/);
});
test("reviewed NIH adapter excludes embedded third-party content and rejects changed boundaries", () => {
  const html = '<h2>What are the symptoms of a heart attack?</h2><p>Symptom one.</p><ul><li>Symptom two.</li><li>Symptom three.</li></ul><h2>When to call 9-1-1</h2><p>Seek emergency help.</p><ul><li>Do not drive.</li><li>Do not delay.</li></ul><span data-embed-button="node"><p>EXCLUDED IMAGE CAPTION</p></span>Last updated on <time datetime="2022-03-24T12:00:00Z">Date</time>';
  const result = ingestNhlbiHeartAttack(html, now);
  assert.equal(result.sections.length, 2); assert.equal(result.license, "US-PUBLIC-DOMAIN");
  assert.equal(result.reviewDate, "2022-03-24"); assert.doesNotMatch(JSON.stringify(result.sections), /EXCLUDED/);
  assert.throws(() => ingestNhlbiHeartAttack(html.replace("When to call 9-1-1", "Changed heading"), now), /IDENTITY/);
  assert.throws(() => ingestNhlbiHeartAttack(html.replace("<p>Seek", "<script>bad</script><p>Seek"), now), /REQUIRES_REVIEW/);
});
function doc(id: string, title: string, text: string): ClinicalDocument {
  return { id, title, url: `https://medlineplus.gov/${id}.html`, publisher: "NLM", kind: "patient_summary", license: "US-PUBLIC-DOMAIN", licenseUrl: "https://medlineplus.gov/about/using/usingcontent/", attribution: "Source: NLM", sourceVersion: "test/v1", rawHash: sha256(text), retrievedAt: now, publicationDate: null, reviewDate: null, reviewStatus: "publisher_reviewed", currency: "not_assessed", scope: "Test reference, not clinical guidance", aliases: [], concepts: [], related: [], sections: [{ title: "Overview", text }] };
}
test("frozen corpus bundle verifies bytes, normalized identity and counts before indexing", () => {
  const directory = mkdtempSync(join(tmpdir(), "counsel-corpus-bundle-"));
  const c = buildCorpus([doc("example", "Example source", "Exact normalized public-domain source text.")]);
  const bytes = gzipSync(JSON.stringify({ version: c.version, hash: c.hash, documents: c.documents }));
  const m = { version: "clinical-rag-bundle/v1", file: "corpus.json.gz", sha256: sha256(bytes), corpusHash: c.hash, chunks: c.chunks.length, documents: c.documents.length };
  const path = join(directory, "manifest.json");
  writeFileSync(join(directory, "corpus.json.gz"), bytes);
  writeFileSync(path, JSON.stringify(m));
  assert.deepEqual(readCorpusBundle(path), c);
  writeFileSync(path, JSON.stringify({ ...m, chunks: 999 }));
  assert.throws(() => readCorpusBundle(path), /IDENTITY_MISMATCH/);
  writeFileSync(path, JSON.stringify({ ...m, file: "../elsewhere" }));
  assert.throws(() => readCorpusBundle(path), /INVALID.*MANIFEST/);
  writeFileSync(path, JSON.stringify(m));
  writeFileSync(join(directory, "corpus.json.gz"), Buffer.from("tampered"));
  assert.throws(() => readCorpusBundle(path), /INTEGRITY_FAILURE/);
});
test("licenses allow exact permissive grants, reject NC/ND/SA and deceptive hosts", () => {
  assert.equal(permissiveLicense("http://creativecommons.org/licenses/by/4.0/"), "CC-BY-4.0");
  for (const value of ["https://creativecommons.org/licenses/by-nc/4.0/", "https://creativecommons.org/licenses/by-sa/4.0/", "https://creativecommons.org.evil.test/licenses/by/4.0/", "https://evil.test/?license=ccby", "not-a-license"]) assert.equal(permissiveLicense(value), null);
});
test("chunks are bounded exact slices and retain every source character", () => {
  const d = doc("long", "Long source", ("Emergency care is indicated only if condition X occurs.\nOtherwise use the documented follow-up pathway.\n").repeat(80));
  const chunks = chunkDocument(d, 700, 100);
  assert.ok(chunks.length > 2); assert.equal(chunks[0].start, 0); assert.equal(chunks.at(-1)!.end, d.sections[0].text.length);
  chunks.forEach((c, i) => { assert.equal(c.text, d.sections[0].text.slice(c.start, c.end)); assert.equal(c.hash, sha256(c.text)); assert.ok(c.text.length <= 700); if (i) assert.ok(c.start <= chunks[i - 1].end); });
});
test("corpus identity is deterministic and invalidated documents never enter retrieval", () => {
  const a = doc("abc", "First source", "A first source."), b = { ...doc("def", "Second source", "Another source."), currency: "retracted" as const };
  assert.equal(buildCorpus([a, b]).hash, buildCorpus([b, a]).hash);
  assert.deepEqual(buildCorpus([a, b]).chunks.map(c => c.documentId), ["abc"]);
  assert.throws(() => buildCorpus([a, a]), /DUPLICATE/);
});
test("Medline only imports English public-domain full summaries", () => {
  const xml = `<health-topics><health-topic id="1" title="Migraine" language="English" url="https://medlineplus.gov/migraine.html"><full-summary>&lt;p&gt;A migraine is a type of headache.&lt;/p&gt;</full-summary><also-called>Migrainous headache</also-called><site><information-category>Encyclopedia</information-category><text>DO NOT INDEX COPYRIGHTED EXTERNAL CONTENT</text></site><related-topic id="2">Headache</related-topic></health-topic><health-topic id="3" language="Spanish"><full-summary>No</full-summary></health-topic></health-topics>`;
  const docs = ingestMedline(xml, "xml/test", now);
  assert.equal(docs.length, 1); assert.equal(docs[0].sections[0].text, "A migraine is a type of headache."); assert.equal(docs[0].related[0].target, "medlineplus:2");
  assert.throws(() => ingestMedline('<!DOCTYPE x [<!ENTITY a "xx">]><health-topics/>', "test", now), /UNSAFE_XML/);
});
test("OpenEM synthesis cannot masquerade as a primary guideline or consume tier2", () => {
  const md = `---\nid: headache\ncondition: Headache\ntrack: tier1\ncompiled_by: agent\nlast_updated: 2026-02-19\n---\n# Headache\n\n## Recognition\n\nHeadache has many causes.\n\n## Disposition\n\nMatch the route to the actual clinical findings.\n`;
  const result = ingestOpenEm(md, "corpus/tier1/conditions/headache.md", "a".repeat(40), now);
  assert.equal(result.kind, "research_synthesis"); assert.equal(result.reviewStatus, "agent_compiled"); assert.equal(result.sections.length, 2);
  assert.throws(() => ingestOpenEm(md.replace("tier1", "tier2"), "corpus/tier1/conditions/headache.md", "a".repeat(40), now), /REJECTED/);
});
test("JATS identity, license and ordered inline text are verified; tables omitted", () => {
  const xml = `<article article-type="guideline"><front><journal-meta><journal-title-group><journal-title>Clinical journal</journal-title></journal-title-group></journal-meta><article-meta><article-id pub-id-type="pmc">123</article-id><title-group><article-title>Example guideline</article-title></title-group><permissions><license xlink:href="http://creativecommons.org/licenses/by/4.0/"/></permissions></article-meta></front><body><sec><title>Recommendation</title><p>Do <bold>not</bold> delay care <italic>if</italic> indicated.</p><table-wrap><table><tr><td>Table third party</td></tr></table></table-wrap></sec></body></article>`;
  const result = ingestPmc(xml, "PMC123", now);
  assert.equal(result.sections[0].text, "Do not delay care if indicated."); assert.equal(result.license, "CC-BY-4.0");
  assert.throws(() => ingestPmc(xml.replace("/by/", "/by-nc/"), "PMC123", now), /LICENSE/);
  assert.throws(() => ingestPmc(xml, "PMC124", now), /IDENTITY/);
  const nested = xml.replace("</p><table-wrap>", "<table-wrap>").replace("</table-wrap></sec>", "</table-wrap></p></sec>");
  assert.doesNotMatch(ingestPmc(nested, "PMC123", now).sections[0].text, /Table third party/);
});
test("embedding integrity checks dimensions, finiteness and zero vectors", () => {
  for (const v of [[[0, 0]], [[1, NaN]], [[1]], []]) assert.throws(() => validateVectors(v, 1, 2));
  validateVectors([[1, 0]], 1, 2);
});
test("explicitly selected JATS tables preserve spanning-cell clinical qualifiers and reject ambiguous layouts", () => {
  const xml = `<article><front><journal-meta><journal-title-group><journal-title>Clinical journal</journal-title></journal-title-group></journal-meta><article-meta><article-id pub-id-type="pmc">123</article-id><title-group><article-title>Example guideline</article-title></title-group><permissions><license xlink:href="https://creativecommons.org/licenses/by/4.0/"/></permissions></article-meta></front><body><sec><title>Table section</title><table-wrap id="T1"><caption><p>Test contraindications</p></caption><table><thead><tr><th>Drug</th><th>Concern</th></tr></thead><tbody><tr><td>A</td><td rowspan="2">Do not use with condition X</td></tr><tr><td>B</td></tr></tbody></table><table-wrap-foot><p>Scope: test population only</p></table-wrap-foot></table-wrap></sec></body></article>`;
  const d = ingestPmc(xml, "PMC123", now, ["T1"]);
  assert.equal(d.sections.length, 1);
  assert.match(d.sections[0].text, /Drug: B\nConcern: Do not use with condition X/);
  assert.match(d.sections[0].text, /Scope: test population only/);
  assert.throws(() => ingestPmc(xml.replace('rowspan="2"','rowspan="3"'), "PMC123", now, ["T1"]), /UNFINISHED_ROWSPAN/);
  assert.throws(() => ingestPmc(xml, "PMC123", now, ["T2"]), /SELECTED_TABLE_NOT_FOUND/);
});
test("actual PostgreSQL FTS + vectors, immutable corpus, cached queries and degraded retrieval", async () => {
  const store = await ClinicalRagStore.open(undefined, 2);
  try {
    const corpus = buildCorpus([doc("migraine", "Migraine", "Migraine causes recurrent headache. A usual headache medication request differs from a new thunderclap headache."), doc("thrombosis", "Deep vein thrombosis", "A swollen calf can need urgent assessment for deep vein thrombosis.")]);
    await store.build(corpus);
    const lexical = await store.search("migraine headache", { mode: "lexical" });
    assert.equal(lexical.hits[0].document.id, "migraine");
    const partial = await store.search("migraine", { mode: "hybrid" });
    assert.ok(partial.warnings.includes("INCOMPLETE_VECTOR_INDEX_LEXICAL_ONLY"));
    const embed: Embed = async texts => ({ vectors: texts.map(t => /migraine|headache/i.test(t) ? [1, 0] : [0, 1]), tokens: texts.length * 10 });
    await store.embedMissing(embed, new AbortController().signal, () => {});
    const result = await store.search("migraine headache", { embed });
    assert.ok(result.hits[0].channels.includes("vector")); assert.equal(result.embeddingCacheHit, false);
    assert.equal((await store.search("migraine headache", { embed })).embeddingCacheHit, true);
    const degraded = await store.search("calf thrombosis", { embed: async () => { throw new Error("provider failed"); } });
    assert.ok(degraded.hits.length); assert.ok(degraded.warnings.includes("QUERY_EMBEDDING_FAILED_LEXICAL_ONLY"));
    await assert.rejects(store.build(buildCorpus([doc("different", "Other", "New corpus")])), /IMMUTABLE/);
    assert.equal((await store.stats()).embedded, 2);
  } finally { await store.close(); }
});
