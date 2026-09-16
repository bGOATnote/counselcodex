import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCorpus, sha256, type ClinicalDocument, type Hit } from "./model.ts";
import { createTaskSupportAuditor, type TaskWitness } from "./task-support-audit.ts";
import { createExperimentalDraftAuditor, type ExperimentalDraftInput } from "./experimental-draft-audit.ts";

const description = "An illness description alone does not decide the care setting.";
const first = "Discharge only after assessment shows the patient can drink.";
const second = "Arrange reliable follow-up before discharge.";
function fixture() {
  const text = [description, first, second].join("\n");
  const source: ClinicalDocument = { id: "test:draft", title: "Authored fixture", url: "https://example.org/draft", publisher: "Test",
    kind: "patient_summary", license: "CC0-1.0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", attribution: "Software fixture only",
    sourceVersion: "fixture/v1", rawHash: sha256(text), retrievedAt: "2026-09-15T00:00:00.000Z", publicationDate: null,
    reviewStatus: "agent_compiled", reviewDate: null, currency: "not_assessed", scope: "No clinical validity", aliases: [], concepts: [], related: [],
    sections: [{ title: "Fixture", text }] };
  const corpus = buildCorpus([source]), { sections: _sections, ...document } = source;
  const hit: Hit = { chunk: corpus.chunks[0], document, score: 1, channels: ["lexical"], context: { before: "", after: "" } };
  const quoteSpans = [description, first, second].map((quote, i) => ({ id: `q${i}`, text: quote, start: text.indexOf(quote), end: text.indexOf(quote) + quote.length, selectable: true }));
  const modelPacket = { patient: "An original message.", context: { unknown: ["exam"] }, sources: [{ id: hit.chunk.id, quoteSpans }] };
  const raw = { reason: "An authored output.", citations: [{ passageId: hit.chunk.id, quoteId: "q0", claim: "A management claim.", applicability: "uncertain", limitation: "Not yet examined." }] };
  const input: ExperimentalDraftInput = {
    evidence: { retrieval: [{ corpusHash: corpus.hash, query: "assessment", mode: "lexical", hits: [hit], timings: {}, warnings: [], embeddingTokens: 0, embeddingCacheHit: false }],
      expectedQueries: ["assessment"], selected: [{ id: hit.chunk.id, summary: text }], errors: [] },
    modelPacket, expectedPacketHash: sha256(JSON.stringify(modelPacket)), draft: { kind: "unpublished_experimental_draft", raw, resolved: null, failure: null },
  };
  setQuotes(input, ["q0"]);
  const witness: TaskWitness = { id: "conditions", role: "care_setting_conditions", need: "Retain both prerequisites.", boundary: "Neither condition is an observed patient fact.",
    spans: [{ documentId: source.id, quote: first }, { documentId: source.id, quote: second }] };
  return { input, witness, corpus, auditor: createExperimentalDraftAuditor(corpus) };
}
function setQuotes(input: ExperimentalDraftInput, ids: string[]) {
  const source = input.modelPacket.sources[0] as { id: string; quoteSpans: { id: string; text: string }[] };
  const citations = ids.map(quoteId => ({ passageId: source.id, quoteId, claim: "A management claim.", applicability: "uncertain", limitation: "Not yet examined." }));
  input.draft.raw = { reason: "An authored output.", citations };
  input.draft.resolved = { reason: "An authored output.", citations: citations.map(({ quoteId, ...c }) => ({ ...c, quote: source.quoteSpans.find(q => q.id === quoteId)!.text })) };
}
function rehash(input: ExperimentalDraftInput) { input.expectedPacketHash = sha256(JSON.stringify(input.modelPacket)); }

test("unpublished paired drafts measure quotation gain without publication or support claims", () => {
  const { input, witness, auditor, corpus } = fixture(), after = structuredClone(input);
  setQuotes(after, ["q1", "q2"]);
  const pair = auditor.compare(witness, input, after);
  assert.equal(pair.quotationTransition, "gained"); assert.equal(pair.before.draftQuotedWitness, false); assert.equal(pair.after.draftQuotedWitness, true);
  assert.equal(pair.after.draftSpans?.length, 2); assert.equal(pair.after.draftSpans?.[0].matches[0].claim, "A management claim.");
  for (const row of [pair.before, pair.after]) {
    assert.equal(row.responsePublished, false); assert.equal(row.patientAdvicePublished, false); assert.equal(row.quotedWitness, null);
    assert.equal(row.clinicalApproval, false); assert.equal(row.clinicalCorrectness, "not_assessed");
    assert.equal(row.patientEligibility, "not_assessed"); assert.equal(row.generatedClaimSupport, "not_assessed");
  }
  assert.equal(createTaskSupportAuditor(corpus)(witness, { ...after.evidence, citations: [], responsePublished: false }).quotedWitness, null);
  assert.equal(auditor.compare(witness, after, input).quotationTransition, "lost");
});

test("partial multi-span witness and duplicate citations do not become complete coverage", () => {
  const { input, witness, auditor } = fixture(); setQuotes(input, ["q1", "q1"]);
  const row = auditor.audit(witness, input);
  assert.equal(row.draftQuotedWitness, false); assert.deepEqual(row.draftSpans?.map(s => s.quoted), [true, false]);
  assert.equal(row.draftSpans?.[0].matches.length, 2);
});

test("missing, provider-failed and malformed drafts retain selected opportunities without a quotation score", () => {
  for (const kind of ["missing", "failed", "invalid"] as const) {
    const { input, witness, auditor } = fixture(), after = structuredClone(input);
    if (kind === "missing") after.draft.raw = after.draft.resolved = null;
    if (kind === "failed") after.draft.failure = "PROVIDER_FAILURE";
    if (kind === "invalid") after.draft.resolved = null;
    const row = auditor.audit(witness, after);
    assert.equal(row.draftStatus, kind); assert.equal(row.draftQuotedWitness, null); assert.equal(row.selectedOpportunity, true);
    assert.equal(row.complete, true); assert.equal(auditor.compare(witness, input, after).quotationTransition, "not_comparable");
  }
});

test("quote ID, frozen offsets, selected source and resolved output all must agree", () => {
  const mutations: ((input: ExperimentalDraftInput) => void)[] = [
    input => { (input.draft.raw as { citations: { quoteId: string }[] }).citations[0].quoteId = "not-in-packet"; },
    input => { (input.draft.raw as { citations: { passageId: string }[] }).citations[0].passageId = "not-selected"; },
    input => { (input.draft.resolved as { citations: { claim: string }[] }).citations[0].claim = "Altered claim"; },
    input => { (input.draft.resolved as { citations: { quote: string }[] }).citations[0].quote = first; },
    input => { (input.draft.resolved as { reason: string }).reason = "Altered response"; },
    input => { (input.modelPacket.sources[0] as { quoteSpans: { start: number }[] }).quoteSpans[0].start++; rehash(input); },
    input => { input.modelPacket.sources.push(structuredClone(input.modelPacket.sources[0])); rehash(input); },
    input => { (input.modelPacket.sources[0] as { quoteSpans: unknown[] }).quoteSpans.push(structuredClone((input.modelPacket.sources[0] as { quoteSpans: unknown[] }).quoteSpans[0])); rehash(input); },
  ];
  for (const mutate of mutations) {
    const { input, witness, auditor } = fixture(); mutate(input);
    const row = auditor.audit(witness, input);
    assert.equal(row.draftStatus, "invalid"); assert.equal(row.draftCitationBindingValid, false); assert.equal(row.draftQuotedWitness, null);
    assert.equal(row.selectedOpportunity, true);
  }
});

test("wrong-document identical text cannot satisfy a witness and unknown witnesses remain null", () => {
  const { input, witness, auditor } = fixture(); setQuotes(input, ["q1", "q2"]);
  const other = { ...witness, spans: witness.spans!.map(s => ({ ...s, documentId: "other:source" })) };
  const row = auditor.audit(other, input);
  assert.equal(row.selectedOpportunity, false); assert.equal(row.draftQuotedWitness, null);
  const unknown = auditor.audit({ ...witness, spans: null }, input);
  assert.equal(unknown.selectedOpportunity, null); assert.equal(unknown.draftQuotedWitness, null); assert.equal(unknown.draftSpans, null);
});

test("frozen packet hash, patient/context/source equality and evidence identity gate pairing", () => {
  for (const mutate of [(p: ExperimentalDraftInput) => { p.modelPacket.patient += " changed"; },
    (p: ExperimentalDraftInput) => { p.modelPacket.context = {}; },
    (p: ExperimentalDraftInput) => { p.modelPacket.sources = []; },
    (p: ExperimentalDraftInput) => { p.evidence.expectedQueries = ["different query"]; }]) {
    const { input, witness, auditor } = fixture(), after = structuredClone(input); mutate(after); rehash(after);
    assert.throws(() => auditor.compare(witness, input, after), /DRAFT_PAIRED_PACKET_MISMATCH/);
  }
  const { input, witness, auditor } = fixture(); input.expectedPacketHash = "forged";
  assert.throws(() => auditor.compare(witness, input, input), /DRAFT_MODEL_PACKET_HASH_MISMATCH/);
  assert.equal(auditor.audit(witness, input).draftStatus, "invalid");
});

test("tampered retained evidence cannot become draft quotation credit", () => {
  const { input, witness, auditor } = fixture(); setQuotes(input, ["q1", "q2"]);
  input.evidence.retrieval[0].hits[0].document.title = "changed";
  const row = auditor.audit(witness, input);
  assert.equal(row.complete, false); assert.equal(row.draftStatus, "invalid"); assert.equal(row.draftQuotedWitness, null);
});

test("diagnostic has no live import and does not mutate V1 publication semantics", () => {
  for (const path of ["src/disposition/clinical-graph.ts", "src/disposition/gates-release.ts", "src/disposition/graph-runtime.ts", "src/evidence/rag/selection.ts", "src/evidence/rag/task-support-audit.ts"])
    assert.doesNotMatch(readFileSync(path, "utf8"), /experimental-draft-audit/);
});
