import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCorpus, sha256, type ClinicalDocument, type Hit } from "./model.ts";
import { createTaskSupportAuditor, type AuditPacket, type TaskWitness } from "./task-support-audit.ts";
import { TASK_SUPPORT_FIXTURES } from "./task-support-fixtures.ts";

const definition = "A description of an illness.";
const conditional = "Discharge after assessment only when able to drink and follow-up is arranged.";
function fixture() {
  const source: ClinicalDocument = { id: "test:topic", title: "Authored task evidence", url: "https://example.org/task", publisher: "Test",
    kind: "patient_summary", license: "CC0-1.0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", attribution: "Offline accounting fixture, not clinical guidance",
    sourceVersion: "fixture/v1", rawHash: sha256(definition + conditional), retrievedAt: "2026-09-15T00:00:00.000Z", publicationDate: null,
    reviewStatus: "agent_compiled", reviewDate: null, currency: "not_assessed", scope: "Offline test, no routing or medical validity",
    aliases: [], concepts: [], related: [], sections: [{ title: "Text", text: `${definition}\n${conditional}` }] };
  const corpus = buildCorpus([source]), { sections, ...document } = source;
  const hit: Hit = { chunk: corpus.chunks[0], document, score: 1, channels: ["lexical"], context: { before: "", after: "" } };
  assert.equal(hit.chunk.text, sections[0].text);
  const packet: AuditPacket = { retrieval: [{ corpusHash: corpus.hash, query: "topic assessment", mode: "lexical", hits: [hit],
    timings: {}, warnings: [], embeddingTokens: 0, embeddingCacheHit: false }], expectedQueries: ["topic assessment"],
    selected: [{ id: hit.chunk.id, summary: hit.chunk.text }], citations: [{ passageId: hit.chunk.id, quote: definition, claim: "A management claim." }],
    responsePublished: true, errors: [] };
  const witness: TaskWitness = { id: "prerequisites", role: "care_setting_conditions", need: "Keep the complete discharge prerequisites.",
    boundary: "Not evidence that a patient meets them.", spans: [{ documentId: document.id, quote: conditional }] };
  return { audit: createTaskSupportAuditor(corpus), packet, witness, corpus, hit };
}

test("selected prerequisites are not quoted support when the model cites only a definition", () => {
  const { audit, packet, witness } = fixture(), row = audit(witness, packet);
  assert.equal(row.corpusOpportunity, true); assert.equal(row.retrievedOpportunity, true); assert.equal(row.selectedOpportunity, true);
  assert.equal(row.quotedWitness, false); assert.equal(row.generatedClaimSupport, "not_assessed");
  packet.citations[0].quote = conditional;
  const full = audit(witness, packet); assert.equal(full.quotedWitness, true); assert.equal(full.patientEligibility, "not_assessed");
  assert.equal(full.clinicalCorrectness, "not_assessed");
});

test("partial condition text and topical titles cannot satisfy an exact role witness", () => {
  const { audit, packet, witness } = fixture(); packet.citations[0].quote = "Discharge after assessment only when able to drink";
  assert.equal(audit(witness, packet).quotedWitness, false);
  packet.retrieval[0].hits[0].document.title = conditional;
  const row = audit(witness, packet); assert.equal(row.complete, false); assert.equal(row.selectedOpportunity, false);
  assert.ok(row.errors.includes("TASK_PASSAGE_NOT_IN_ACTIVE_CORPUS"));
});

test("unknown authored corpus support is null, not an empty success or clinical failure", () => {
  const { audit, packet, witness } = fixture(), row = audit({ ...witness, spans: null }, packet);
  assert.equal(row.witnessStatus, "no_authored_corpus_witness"); assert.equal(row.corpusOpportunity, null);
  assert.equal(row.selectedOpportunity, null); assert.equal(row.quotedWitness, null);
  assert.throws(() => audit({ ...witness, spans: [] }, packet), /INVALID_AUTHORED_SUPPORT_PROBE/);
});

test("withheld response preserves packet opportunities but has no judged quotation", () => {
  const { audit, packet, witness } = fixture(); packet.responsePublished = false; packet.citations[0].quote = conditional;
  const row = audit(witness, packet); assert.equal(row.selectedOpportunity, true); assert.equal(row.quotedWitness, null);
});

test("missing query, partial retrieval error and unbound selected text stay incomplete", () => {
  for (const mutate of [(p: AuditPacket) => { p.expectedQueries.push("missing query"); },
    (p: AuditPacket) => { p.errors.push("QUERY_FAILED"); },
    (p: AuditPacket) => { p.selected[0].summary += " forged"; },
    (p: AuditPacket) => { p.retrieval[0].corpusHash = "f".repeat(64); },
    (p: AuditPacket) => { p.citations[0].quote = "invented text"; }]) {
    const { audit, packet, witness } = fixture(); mutate(packet); const row = audit(witness, packet);
    assert.equal(row.complete, false); assert.equal(row.selectedOpportunity, false); assert.equal(row.quotedWitness, false);
  }
});

test("corpus witnesses are distinct from empty retrieval, and source classes are not authority", () => {
  const { audit, packet, witness } = fixture(); packet.retrieval[0].hits = []; packet.selected = []; packet.citations = [];
  const row = audit(witness, packet); assert.equal(row.corpusOpportunity, true); assert.equal(row.retrievedOpportunity, false);
  assert.equal(row.emptyRetrieved, true); assert.equal(row.complete, true); assert.equal(row.quotedWitness, false);
});

test("audit labels stay outside live retrieval and contain no expected routes", () => {
  assert.equal(TASK_SUPPORT_FIXTURES.length, 8);
  const witnesses = TASK_SUPPORT_FIXTURES.flatMap(f => f.witnesses);
  assert.equal(new Set(witnesses.map(w => w.id)).size, witnesses.length);
  assert.equal(witnesses.filter(w => w.spans === null).length, 2);
  assert.doesNotMatch(JSON.stringify(witnesses), /acceptedRoutes|STANDARD_ASYNC|PRIORITY_ASYNC|EMERGENCY_NOW/);
  for (const path of ["src/evidence/rag/selection.ts", "src/evidence/rag/v26.ts", "src/disposition/clinical-graph.ts", "src/disposition/gates-release.ts", "src/disposition/graph-runtime.ts"]) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /task-support-(?:audit|fixtures|replay)/);
  }
});
