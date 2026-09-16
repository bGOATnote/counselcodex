import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCorpus, sha256, type ClinicalDocument, type Hit, type Retrieval } from "./model.ts";
import { createSupportSectionExpander, hasExplicitActionText } from "./support-section-expansion.ts";

// Frozen authored structural controls, not physician labels or medical advice.
const source: ClinicalDocument = { id: "fixture:topic", title: "Topic management", url: "https://example.org/topic", publisher: "Test",
  kind: "clinical_review", license: "CC0-1.0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", attribution: "Fictional structural retrieval test",
  sourceVersion: "test/v1", rawHash: sha256("authored fixture"), retrievedAt: "2026-09-15T00:00:00.000Z", publicationDate: null,
  reviewStatus: "agent_compiled", reviewDate: null, currency: "not_assessed", scope: "Structural retrieval test only, not medical guidance",
  aliases: [], concepts: [], related: [], sections: [
    { title: "Body / Follow-up response / Referral", text: "Topic follow-up response referral requires contextual assessment." },
    { title: "Body / Follow-up response / Detail", text: "Topic follow-up response treatment discussion." },
    { title: "Body / Follow-up response / Recommendations", text: "If the observed response is inadequate, review the strategy and adherence; do not assume every treatment failed." },
    { title: "Body / Diagnosis / Recommendations", text: "A different section about initial diagnosis is not a follow-up recommendation." },
  ] };
const actionSource: ClinicalDocument = { ...source, id: "fixture:public-advice", title: "Topic warning advice", kind: "patient_summary", url: "https://example.org/warning",
  sections: [{ title: "Public action advice", text: "Topic warning: Call 9-1-1 for emergency help if the specified features are present." }] };
function setup(documents = [source, actionSource]) {
  const corpus = buildCorpus(documents);
  const hit = (id: string, section: number): Hit => {
    const d = corpus.documents.find(d => d.id === id)!, { sections: _sections, ...document } = d;
    return { chunk: corpus.chunks.find(c => c.documentId === id && c.section === section)!, document, score: 1, channels: ["lexical"], context: { before: "", after: "" } };
  };
  const packet = (hits: Hit[], query = "Topic follow-up response referral"): Retrieval => ({ hits, query, corpusHash: corpus.hash, mode: "lexical", timings: {}, warnings: [], embeddingTokens: 0, embeddingCacheHit: false });
  return { corpus, hit, packet, expand: createSupportSectionExpander(corpus) };
}

test("same-document sibling recommendations supplies all conditions without a new query or source", () => {
  const { expand, packet, hit } = setup();
  const p = [packet([hit(source.id, 0)])], before = JSON.stringify(p);
  const result = expand(p, "triage", 3);
  assert.equal(result.audit.additions.length, 1);
  assert.equal(result.hits.find(h => h.channels.includes("same_document_recommendations"))?.chunk.text, source.sections[2].text);
  assert.ok(result.hits.every(h => h.document.id === source.id));
  assert.equal(result.audit.paidCalls, 0); assert.equal(result.audit.embeddingCalls, 0);
  assert.equal(result.audit.claimSupport, "not_assessed"); assert.equal(JSON.stringify(p), before);
});
test("fixed budget replaces redundant same-document content but preserves public emergency action and document diversity", () => {
  const { expand, packet, hit } = setup();
  const warning = hit(actionSource.id, 0), result = expand([packet([hit(source.id, 0), hit(source.id, 1), warning])], "triage", 3, "same_document");
  assert.equal(result.hits.length, 3); assert.equal(result.audit.additions.length, 1);
  assert.ok(result.hits.some(h => h.chunk.id === warning.chunk.id));
  assert.equal(result.audit.originalExplicitActionsPreserved, true); assert.equal(result.audit.originalDocumentCoveragePreserved, true);
});
test("capacity-only default preserves every baseline passage when the packet is full", () => {
  const { expand, packet, hit } = setup(); const original = [hit(source.id, 0), hit(source.id, 1), hit(actionSource.id, 0)];
  const result = expand([packet(original)], "triage", 3);
  assert.equal(result.replacementMode, "capacity_only"); assert.equal(result.audit.additions.length, 0);
  assert.deepEqual(new Set(result.hits.map(h => h.chunk.id)), new Set(original.map(h => h.chunk.id)));
  assert.ok(result.audit.skipped.some(s => s.reason === "packet_capacity_preserved"));
});
test("no slot, education, unrelated hierarchy, and empty retrieval remain unchanged", () => {
  const { expand, packet, hit } = setup();
  assert.equal(expand([packet([hit(source.id, 0)])], "triage", 1).audit.additions.length, 0);
  assert.equal(expand([packet([hit(source.id, 0)])], "education", 9).audit.additions.length, 0);
  assert.equal(expand([packet([hit(actionSource.id, 0)])], "triage", 9).audit.additions.length, 0);
  assert.equal(expand([], "triage", 9).hits.length, 0);
});
test("protects a query's sole original representative and never truncates a multi-chunk recommendation", () => {
  const { expand, packet, hit } = setup();
  const r = expand([packet([hit(source.id, 0)]), packet([hit(source.id, 1)])], "triage", 2, "same_document");
  assert.equal(r.audit.additions.length, 0);
  const long = structuredClone(source); long.sections[2].text = "Qualifying condition and response. ".repeat(150);
  const s = setup([long]);
  const lengthy = s.expand([s.packet([s.hit(source.id, 0)])], "triage", 9);
  assert.equal(lengthy.audit.additions.length, 0); assert.ok(lengthy.audit.skipped.some(s => s.reason === "recommendations_section_exceeds_one_chunk"));
});
test("active corpus identity, metadata, passage hashes and quarantine boundary remain binding", () => {
  const { expand, packet, hit } = setup();
  const h = hit(source.id, 0), wrong = structuredClone(h); wrong.document.license = "Apache-2.0";
  assert.throws(() => expand([packet([wrong])], "triage"), /ACTIVE_CORPUS/);
  const relabelled = structuredClone(h); relabelled.document.kind = "primary_guideline";
  assert.throws(() => expand([packet([relabelled])], "triage"), /ACTIVE_CORPUS/);
  const contextChanged = structuredClone(h); contextChanged.context.after = "Invented eligibility conditions.";
  assert.throws(() => expand([packet([contextChanged])], "triage"), /ACTIVE_CORPUS/);
  assert.throws(() => expand([{ ...packet([h]), corpusHash: "b".repeat(64) }], "triage"), /CORPUS_MISMATCH/);
  const corrupt = structuredClone(h); corrupt.chunk.text += "changed";
  assert.throws(() => expand([packet([corrupt])], "triage"), /INTEGRITY/);
  const retired = structuredClone(source); retired.currency = "retracted";
  const next = createSupportSectionExpander(buildCorpus([retired]));
  assert.equal(next([], "triage").hits.length, 0);
});
test("action matching is document-class agnostic and never alters or interprets qualifiers", () => {
  const { hit } = setup(); const h = hit(actionSource.id, 0);
  assert.equal(hasExplicitActionText(h), true);
  h.chunk.text = "Do not call 911 unless the listed criteria hold.";
  assert.equal(hasExplicitActionText(h), true, "even negated or conditional action text is protected, not interpreted");
});
test("experiment is deterministic and isolated from live routing and authored target labels", () => {
  const { expand, packet, hit } = setup(); const p = [packet([hit(source.id, 0)])];
  assert.deepEqual(expand(p, "triage"), expand(p, "triage"));
  const implementation = readFileSync("src/evidence/rag/support-section-expansion.ts", "utf8");
  assert.doesNotMatch(implementation, /disposition-support-fixtures|v26-challenges|acceptedRoutes|\bC\d\d\b/);
  for (const file of ["src/disposition/clinical-graph.ts", "src/disposition/gates-release.ts", "src/disposition/graph-runtime.ts"]) assert.doesNotMatch(readFileSync(file, "utf8"), /support-section-expansion/);
});
