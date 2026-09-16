import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCorpus, sha256, type ClinicalDocument, type Hit } from "./model.ts";
import { auditAuthoredCitation, measureSupportOpportunity, summarizeSupportOpportunities } from "./disposition-support.ts";
import { DISPOSITION_SUPPORT_PROBES } from "./disposition-support-fixtures.ts";

function hit(documentId: string, text: string): Hit {
  const source: ClinicalDocument = { id: documentId, title: "Authored regression source", url: "https://example.org/source", publisher: "Test",
    kind: "patient_summary", license: "CC0-1.0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", attribution: "Offline fixture, not medical guidance",
    sourceVersion: "fixture/v1", rawHash: sha256(text), retrievedAt: "2026-09-15T00:00:00.000Z", publicationDate: null, reviewStatus: "agent_compiled",
    reviewDate: null, currency: "not_assessed", scope: "Author-labelled source-span accounting regression only", aliases: [], concepts: [], related: [], sections: [{ title: "Text", text }] };
  const { sections, ...document } = source;
  return { chunk: buildCorpus([source]).chunks[0], document, score: 1, channels: ["lexical"], context: { before: "", after: "" } };
}
const warning = DISPOSITION_SUPPORT_PROBES.find(probe => probe.id === "vertigo-warning-conjunction")!;
const definition = "Vertigo is the feeling that you or the room is spinning even when nothing is moving.";

test("exact vertigo definition cannot support warning even when warning is elsewhere in the same chunk", () => {
  const h = hit("medlineplus:216", `${definition}\n${warning.spans[0].quote}`);
  const wrong = auditAuthoredCitation(warning, warning.claim, [{ passageId: h.chunk.id, quote: definition }], [h]);
  assert.equal(wrong.identityBound, true);
  assert.equal(wrong.support, "authored_support_span_missing");
  const right = auditAuthoredCitation(warning, warning.claim, [{ passageId: h.chunk.id, quote: warning.spans[0].quote }], [h]);
  assert.equal(right.support, "authored_support_span_matched");
  assert.equal(right.patientApplicability, "not_assessed");
});

test("topic matching and descriptive source text do not become management support", () => {
  const h = hit("medlineplus:216", definition);
  const row = measureSupportOpportunity(warning, [h]);
  assert.equal(row.emptyPacket, false);
  assert.equal(row.supportOpportunity, false);
  assert.equal(row.generatedClaimSupport, "not_assessed");
});

test("retains complete qualifying clauses and needs every authored span", () => {
  const stroke = DISPOSITION_SUPPORT_PROBES.find(probe => probe.id === "stroke-signs-action")!;
  assert.equal(measureSupportOpportunity(stroke, [hit("cdc:stroke", stroke.spans[0].quote)]).supportOpportunity, false);
  assert.equal(measureSupportOpportunity(stroke, [hit("cdc:stroke", stroke.spans.map(s => s.quote).join("\n"))]).supportOpportunity, true);
  const partial = hit("medlineplus:216", warning.spans[0].quote);
  const omittedQualifier = "Get emergency help right away if you have sudden or severe dizziness or vertigo";
  assert.equal(auditAuthoredCitation(warning, warning.claim, [{ passageId: partial.chunk.id, quote: omittedQualifier }], [partial]).support, "authored_support_span_missing");
});

test("different claim, metadata title, or source identity cannot borrow the authored claim's support", () => {
  const h = hit("medlineplus:216", warning.spans[0].quote);
  assert.equal(auditAuthoredCitation(warning, "All dizziness needs an ambulance.", [{ passageId: h.chunk.id, quote: h.chunk.text }], [h]).support, "not_assessed");
  const topic = hit("medlineplus:216", definition); topic.document.title = warning.spans[0].quote;
  assert.equal(measureSupportOpportunity(warning, [topic]).supportOpportunity, false);
  assert.equal(measureSupportOpportunity(warning, [hit("other:source", warning.spans[0].quote)]).supportOpportunity, false);
});

test("empty, partial-failure, and invalid packets remain unsuccessful attempts", () => {
  const h = hit("medlineplus:216", warning.spans[0].quote), tampered = structuredClone(h);
  tampered.chunk.hash = "bad";
  const rows = [measureSupportOpportunity({ ...warning, id: "success" }, [h]), measureSupportOpportunity({ ...warning, id: "empty" }, []),
    measureSupportOpportunity({ ...warning, id: "partial" }, [h], ["RETRIEVAL_FAILED"]), measureSupportOpportunity({ ...warning, id: "invalid" }, [tampered])];
  const summary = summarizeSupportOpportunities(rows);
  assert.equal(summary.attempted, 4); assert.equal(summary.supportedOpportunities, 1); assert.equal(summary.supportOpportunityRate, .25);
  assert.equal(summary.emptyPackets, 1); assert.equal(summary.retrievalOrIntegrityFailures, 2);
  assert.equal(summarizeSupportOpportunities([]).supportOpportunityRate, null);
  assert.throws(() => summarizeSupportOpportunities([rows[0], rows[0]]), /DUPLICATE/);
});

test("conflicting valid duplicate identities fail; retracted or invented quotes cannot pass", () => {
  const h = hit("medlineplus:216", warning.spans[0].quote), conflict = structuredClone(h), retracted = structuredClone(h);
  conflict.document.sourceVersion = "different";
  const row = measureSupportOpportunity(warning, [h, conflict]);
  assert.match(row.integrityError!, /CONFLICTING/); assert.equal(row.supportOpportunity, false);
  retracted.document.currency = "retracted";
  assert.equal(measureSupportOpportunity(warning, [retracted]).supportOpportunity, false);
  assert.equal(auditAuthoredCitation(warning, warning.claim, [{ passageId: "unknown", quote: warning.spans[0].quote }], [h]).support, "authored_support_span_missing");
});

test("empty or duplicate requirements cannot generate a vacuous support success", () => {
  assert.throws(() => measureSupportOpportunity({ ...warning, spans: [] }, []), /INVALID/);
  assert.throws(() => measureSupportOpportunity({ ...warning, spans: [warning.spans[0], warning.spans[0]] }, []), /DUPLICATE/);
});

test("authored probes stay offline and contain no patient/cohort route binding", () => {
  for (const path of ["src/disposition/clinical-graph.ts", "src/disposition/gates-release.ts", "src/disposition/graph-runtime.ts"]) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /disposition-support/);
  }
  for (const probe of DISPOSITION_SUPPORT_PROBES) {
    assert.ok(probe.spans.length > 0);
    assert.doesNotMatch(JSON.stringify(probe), /\bC\d\d\b|acceptedRoutes|STANDARD_ASYNC|PRIORITY_ASYNC/);
  }
});
