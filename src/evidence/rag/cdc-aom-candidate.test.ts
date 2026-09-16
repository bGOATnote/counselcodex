import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CDC_AOM_CAPTURE, cdcAomCandidateHits, loadCdcAomCandidate, parseCdcAomCandidate } from "./cdc-aom-candidate.ts";
import { sha256 } from "./model.ts";
import { auditAuthoredCitation, measureSupportOpportunity } from "./disposition-support.ts";
import { quoteSpans, resolveSourceQuoteReferences } from "../../disposition/source-quote-refs.ts";

const fixture = (file: string) => readFileSync(new URL(`./fixtures/cdc-aom-2026-09-15/${file}`, import.meta.url), "utf8");
const raw = fixture("response.html"), rights = fixture("rights.html"), manifest = fixture("capture.json");
const observed = "Mild cases with unilateral symptoms in children 6-23 months of age or unilateral or bilateral symptoms in children >2 years may be appropriate for watchful waiting based on shared decision-making.";
const prerequisite = "Do not diagnose AOM in children without middle ear effusion (based on pneumatic otoscopy and/or tympanometry).";

test("public source, retained rights and both 200 responses have pinned identities and dates", () => {
  const document = loadCdcAomCandidate(), capture = JSON.parse(manifest);
  assert.equal(sha256(raw), CDC_AOM_CAPTURE.rawHash);
  assert.equal(sha256(rights), CDC_AOM_CAPTURE.rightsHash);
  assert.deepEqual(capture.map((r: { url: string; finalUrl: string; status: number; bytes: number; retrievedAt: string }) => [r.url, r.finalUrl, r.status, r.bytes, r.retrievedAt]), [
    [CDC_AOM_CAPTURE.url, CDC_AOM_CAPTURE.url, 200, CDC_AOM_CAPTURE.bytes, CDC_AOM_CAPTURE.retrievedAt],
    [CDC_AOM_CAPTURE.rightsUrl, CDC_AOM_CAPTURE.rightsUrl, 200, CDC_AOM_CAPTURE.rightsBytes, CDC_AOM_CAPTURE.rightsRetrievedAt],
  ]);
  assert.equal(document.reviewDate, "2024-04-22");
  assert.equal(document.publicationDate, null);
  assert.equal(document.kind, "clinical_review");
  assert.equal(document.currency, "not_assessed");
  assert.equal(document.license, "US-PUBLIC-DOMAIN");
  assert.equal(document.licenseUrl, CDC_AOM_CAPTURE.rightsUrl);
  assert.match(document.attribution, /Source: CDC/);
  assert.match(document.attribution, /available free of charge/);
  assert.match(document.attribution, /does not imply endorsement by CDC, ATSDR, HHS or the United States Government/);
  assert.match(document.scope, /not the original AAP primary guideline/);
});

test("full raw response, qualifiers, metadata and reuse-policy drift fail closed", () => {
  for (const [before, after] of [[CDC_AOM_CAPTURE.url, "https://example.org"], ["April 22, 2024", "April 22, 2026"],
    ["without middle ear effusion", "with earache"], ["based on shared decision-making", "always"],
    ["non-type I hypersensitivity", "type I hypersensitivity"], ["within the past 30 days", "at any time"]]) {
    assert.ok(raw.includes(before));
    assert.throws(() => parseCdcAomCandidate(raw.replace(before, after), rights, manifest), /RAW_RESPONSE_CHANGED/);
  }
  assert.throws(() => parseCdcAomCandidate(raw + "\n", rights, manifest), /RAW_RESPONSE_CHANGED/);
  assert.throws(() => parseCdcAomCandidate(raw, rights.replace("May 1, 2023", "May 1, 2026"), manifest), /RIGHTS_RESPONSE_CHANGED/);
  assert.throws(() => parseCdcAomCandidate(raw, rights, manifest.replace('"status": 200', '"status": 403')), /CAPTURE_METADATA_CHANGED/);
});

test("one exact chunk keeps all diagnosis and management qualifiers without diagnosing a patient", () => {
  const document = loadCdcAomCandidate(), [hit] = cdcAomCandidateHits(document);
  assert.equal(cdcAomCandidateHits().length, 1);
  assert.equal(hit.chunk.text, document.sections[0].text);
  assert.equal(hit.chunk.start, 0);
  assert.equal(hit.chunk.end, hit.chunk.text.length);
  assert.equal(hit.chunk.hash, sha256(hit.chunk.text));
  assert.deepEqual(hit.context, { before: "", after: "" });
  for (const text of [prerequisite, observed, "not due to otitis externa", "Mild bulging of the TM AND recent (<48h)",
    "not received amoxicillin within the past 30 days", "concurrent purulent conjunctivitis", "recurrent AOM unresponsive to amoxicillin",
    "non-type I hypersensitivity to penicillin", "cefdinir, cefuroxime, cefpodoxime, or ceftriaxone",
    "Prophylactic antibiotics are not recommended", "consult the American Academy of Pediatrics guidelines. [3]"])
    assert.ok(hit.chunk.text.includes(text), text);
  assert.doesNotMatch(hit.chunk.text, /<\/?[a-z][^>]*>|&[a-z]+;|C32|Counsel|async|same.day|priority|80%/i);
  assert.match(document.scope, /does not confirm AOM or observation eligibility in an undiagnosed earache/);
  const changed = structuredClone(document); changed.sections[0].text = observed;
  assert.throws(() => cdcAomCandidateHits(changed), /DOCUMENT_CHANGED/);
});

test("existing quote-ref and authored support interfaces retain identity without implying applicability", () => {
  const hits = cdcAomCandidateHits(), hit = hits[0];
  const spans = quoteSpans(hit.chunk.text);
  for (const span of spans) {
    assert.equal(hit.chunk.text.slice(span.start, span.end), span.text);
    if (span.text.length >= 10) {
      const resolved = resolveSourceQuoteReferences({ citations: [{ passageId: hit.chunk.id, quoteId: span.id }] }, [{ id: hit.chunk.id, text: hit.chunk.text }]);
      assert.equal(resolved.citations[0].quote, span.text);
    }
  }
  const probe = { id: "aom-conditional-observation", claim: "CDC observation advice remains beside diagnostic prerequisites.",
    spans: [prerequisite, observed].map(quote => ({ documentId: hit.document.id, quote })),
    boundary: "No patient-specific diagnosis, eligibility, medication, queue priority or timing follows from exact text coverage." };
  assert.equal(measureSupportOpportunity(probe, hits).supportOpportunity, true);
  assert.equal(measureSupportOpportunity(probe, []).supportOpportunity, false);
  const refs = [{ passageId: hit.chunk.id, quote: observed }];
  assert.equal(auditAuthoredCitation(probe, probe.claim, refs, hits).support, "authored_support_span_missing");
  for (const claim of ["This child has AOM.", "This child is eligible for watchful waiting.", "This child needs same-day async review."])
    assert.equal(auditAuthoredCitation(probe, claim, refs, hits).support, "not_assessed");
  assert.equal(measureSupportOpportunity(probe, hits).patientApplicability, "not_assessed");
});

test("candidate loading is deterministic offline work and does not mutate caller documents", () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("UNEXPECTED_NETWORK_CALL"); };
  try {
    const document = loadCdcAomCandidate(), before = JSON.stringify(document);
    assert.deepEqual(cdcAomCandidateHits(document), cdcAomCandidateHits());
    assert.equal(JSON.stringify(document), before);
    assert.equal(JSON.stringify(loadCdcAomCandidate()), before);
  } finally { globalThis.fetch = originalFetch; }
});
