import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildCorpus, sha256 } from "./model.ts";
import { auditAuthoredCitation, measureSupportOpportunity } from "./disposition-support.ts";
import { INSOMNIA_ASSESSMENT_QUOTE, INSOMNIA_CHRONICITY_QUOTE, NHLBI_INSOMNIA_CAPTURE,
  insomniaCandidateHits, loadNhlbiInsomniaCandidate, loadRetainedInsomniaBaseline,
  parseNhlbiInsomniaCandidate, replayInsomniaSourceSupport } from "./nhlbi-insomnia-candidate.ts";

const raw = readFileSync(new URL("./fixtures/nhlbi-insomnia-2026-09-15/response.html", import.meta.url), "utf8");
test("retained response identity, publisher update date and license attribution are pinned", () => {
  const document = loadNhlbiInsomniaCandidate();
  assert.equal(sha256(raw), NHLBI_INSOMNIA_CAPTURE.rawHash);
  assert.equal(document.url, NHLBI_INSOMNIA_CAPTURE.url);
  assert.equal(document.reviewDate, "2022-03-24");
  assert.equal(document.publicationDate, null);
  assert.equal(document.currency, "not_assessed");
  assert.equal(document.kind, "patient_summary");
  assert.equal(document.license, "US-PUBLIC-DOMAIN");
  assert.match(document.attribution, /no endorsement implied/);
  assert.equal(document.rawHash, sha256(raw));
  assert.throws(() => parseNhlbiInsomniaCandidate(raw, "https://example.org/insomnia"), /SOURCE_URL_CHANGED/);
});

test("identity, selected qualifiers, date and unreviewed response drift fail closed", () => {
  for (const [before, after] of [
    [NHLBI_INSOMNIA_CAPTURE.url, "https://www.nhlbi.nih.gov/health/insomnia/treatment"],
    ["2022-03-24", "2026-09-15"],
    ["at least 3 nights a week", "occasionally"],
    ["3 months or longer", "a month or longer"],
    ["If not getting enough sleep is affecting your daily activities", "If you ever have difficulty sleeping"],
  ]) {
    assert.ok(raw.includes(before));
    assert.throws(() => parseNhlbiInsomniaCandidate(raw.replace(before, after)), /RAW_RESPONSE_CHANGED/);
  }
  assert.throws(() => parseNhlbiInsomniaCandidate(raw + "\n"), /RAW_RESPONSE_CHANGED/);
});

test("one lossless chunk retains the conditional trigger, tentative diagnosis and both chronicity qualifiers", () => {
  const document = loadNhlbiInsomniaCandidate(), corpus = buildCorpus([document]);
  assert.equal(corpus.chunks.length, 1);
  const chunk = corpus.chunks[0];
  assert.equal(chunk.text, document.sections[0].text);
  assert.equal(chunk.hash, sha256(chunk.text));
  assert.ok(chunk.text.includes(INSOMNIA_ASSESSMENT_QUOTE));
  assert.ok(chunk.text.includes("You may be diagnosed with insomnia"));
  assert.ok(chunk.text.includes("at least 3 nights a week"));
  assert.ok(chunk.text.includes(INSOMNIA_CHRONICITY_QUOTE));
  assert.ok(chunk.text.endsWith("Your doctor may do more tests to see whether your insomnia is causing any other health problems."));
  assert.doesNotMatch(chunk.text, /<|sleep diary|same.day|priority|48.hours|emergency|C47|Counsel/i);
});

test("quote identity cannot rescue a chronicity quote that omits frequency", () => {
  const document = loadNhlbiInsomniaCandidate(), hits = insomniaCandidateHits(document);
  const probe = { id: "paired-chronicity-qualifiers", claim: "The source specifies chronicity frequency and duration together.",
    spans: [{ documentId: document.id, quote: INSOMNIA_CHRONICITY_QUOTE }],
    boundary: "No patient-specific diagnosis or queue priority follows from the definition." };
  const partial = [{ passageId: hits[0].chunk.id, quote: "lasts for 3 months or longer." }];
  const rejected = auditAuthoredCitation(probe, probe.claim, partial, hits);
  assert.equal(rejected.identityBound, true);
  assert.equal(rejected.support, "authored_support_span_missing");
  const full = [{ passageId: hits[0].chunk.id, quote: INSOMNIA_CHRONICITY_QUOTE }];
  assert.equal(auditAuthoredCitation(probe, probe.claim, full, hits).support, "authored_support_span_matched");
  for (const claim of ["This patient has chronic insomnia.", "This patient requires Standard async today."])
    assert.equal(auditAuthoredCitation(probe, claim, full, hits).support, "not_assessed");
  const failed = measureSupportOpportunity(probe, hits, ["source_capture_failed"]);
  assert.equal(failed.supportOpportunity, false);
  assert.equal(failed.patientApplicability, "not_assessed");
  assert.equal(measureSupportOpportunity(probe, []).supportOpportunity, false);
});

test("paired whole-source replay preserves both attempts and the retained duration conflict", () => {
  const baseline = loadRetainedInsomniaBaseline(), before = sha256(JSON.stringify(baseline));
  const report = replayInsomniaSourceSupport();
  assert.equal(report.status, "isolated_unpromoted");
  assert.deepEqual(report.arms.map(a => [a.summary.attempted, a.summary.supportedOpportunities]), [[2, 0], [2, 2]]);
  assert.equal(report.retainedDurationConflict, true);
  assert.ok(baseline.sections[0].text.includes("Chronic insomnia lasts for a month or longer."));
  assert.equal(before, NHLBI_INSOMNIA_CAPTURE.baselineDocumentHash);
  assert.equal(sha256(JSON.stringify(loadRetainedInsomniaBaseline())), before);
  for (const arm of report.arms) for (const row of arm.rows) {
    assert.equal(row.clinicalCorrectness, "not_assessed");
    assert.equal(row.patientApplicability, "not_assessed");
    assert.equal(row.generatedClaimSupport, "not_assessed");
  }
});
