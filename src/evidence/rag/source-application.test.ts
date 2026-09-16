import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCorpus, sha256, type ClinicalDocument, type Hit } from "./model.ts";
import { applicationContractsForHits, applicationSidecar, auditSourceApplications, auditApplicationBinding, auditApplicationBindings,
  type ApplicationDraft, type SourceApplicationBinding, type CitationApplication } from "./source-application.ts";
import { loadRetainedInsomniaBaseline, loadNhlbiInsomniaCandidate, insomniaCandidateHits } from "./nhlbi-insomnia-candidate.ts";
import { cdcAomCandidateHits } from "./cdc-aom-candidate.ts";

const diagnosis = "AOM requires: (1) acute onset, (2) middle ear effusion, AND (3) middle ear inflammation.";
const observation = "Most episodes are self-limited: 80% resolve spontaneously within 3 days without antibiotics.";
const impact = "Insomnia can cause daytime sleepiness and a lack of energy.";
// Synthetic regression construction using verbatim retained witness text and
// source-version keys. Not a replacement corpus or new publisher attestation.
function aomHit(text = `${diagnosis}\n${observation}`): Hit {
  const source: ClinicalDocument = { id: "openem:pediatric-acute-otitis-media", title: "Authored regression fixture",
    url: "https://example.org/source", publisher: "Synthetic fixture", kind: "research_synthesis", license: "CC0-1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", attribution: "Synthetic test, not published medical guidance",
    sourceVersion: "c913c62bc13158b0173272760e69ce55f16abc6e", rawHash: "53385ae4af66eacf5722a88783c68301097b3a5b663f6d5857d91ee4c2b543fd",
    retrievedAt: "2026-09-15T00:00:00.000Z", publicationDate: null, reviewDate: null, reviewStatus: "agent_compiled", currency: "not_assessed",
    scope: "Authored exact-span regression only", aliases: [], concepts: [], related: [], sections: [{ title: "Recognition", text }] };
  const { sections: _sections, ...document } = source;
  return { chunk: buildCorpus([source]).chunks[0], document, score: 1, channels: ["authored_test"], context: { before: "", after: "" } };
}
function draft(hit: Hit, claim: string, quote = observation, reason = "The decision remains a separate clinical inference."): ApplicationDraft {
  return { reason, citations: [{ passageId: hit.chunk.id, quote, claim, applicability: "uncertain", limitation: "Eligibility is not independently established." }] };
}
const aom = aomHit();
const retainedSleep = insomniaCandidateHits(loadRetainedInsomniaBaseline());
const sleep = retainedSleep.find(h => h.chunk.text.includes(impact))!;
const run = (value: ApplicationDraft, hits = [aom], patient = "Ear pain since last night.") => auditSourceApplications({ patient, hits, draft: value });

test("original compiled AOM and retained insomnia activate source-bound engineer conditions", () => {
  const contracts = applicationContractsForHits([aom, ...retainedSleep]);
  assert.deepEqual(contracts.map(c => c.id), ["compiled-aom-observation", "retained-insomnia-daytime-impact"]);
  for (const contract of contracts) {
    assert.equal(contract.authorship, "engineer_authored"); assert.equal(contract.publisherReviewed, false);
    assert.equal(contract.clinicalReview, "not_assessed");
    assert.ok(contract.conditions.length > 0);
    for (const w of contract.witnesses) {
      const h = [aom, ...retainedSleep].find(h => h.chunk.id === w.passageId)!;
      assert.equal(h.chunk.text.slice(w.start, w.end), w.quote); assert.equal(w.chunkHash, h.chunk.hash);
    }
  }
});

test("complete frozen CDC and NHLBI candidates can bind without activating Ottawa", () => {
  const contracts = applicationContractsForHits([...cdcAomCandidateHits(), ...insomniaCandidateHits(loadNhlbiInsomniaCandidate())]);
  assert.deepEqual(contracts.map(c => c.id), ["cdc-aom-observation", "nhlbi-insomnia-daytime-impact"]);
  assert.deepEqual(applicationContractsForHits([]), []);
  assert.doesNotMatch(JSON.stringify(contracts), /ottawa/i);
});

test("sidecar is source-only, cloned and explicitly not publisher/clinical approval", () => {
  const contracts = applicationContractsForHits([aom, ...retainedSleep]);
  const before = JSON.stringify(contracts), sidecar = applicationSidecar(contracts);
  assert.doesNotMatch(JSON.stringify(sidecar), /acceptedRoutes|\bC\d\d\b|SELF_CARE|STANDARD_ASYNC|PRIORITY_ASYNC|EMERGENCY_NOW/);
  assert.equal(JSON.stringify(contracts), before);
  assert.notEqual((sidecar as { conditions: unknown }).conditions, contracts);
});

test("sidecar rejects edited, rehashed or duplicate authoring contracts", () => {
  const c = applicationContractsForHits([aom])[0];
  assert.throws(() => applicationSidecar([c, c]), /CONTRACT_IDENTITY/);
  const forged = structuredClone(c); forged.conditions[0].requirement = "Assume eligibility.";
  assert.throws(() => applicationSidecar([forged]), /CONTRACT_IDENTITY/);
  const { contractHash: _hash, ...body } = forged; forged.contractHash = sha256(JSON.stringify(body));
  assert.throws(() => applicationSidecar([forged]), /CONTRACT_IDENTITY/);
});

test("missing/context-only diagnostic witness and changed source version do not activate rules", () => {
  const partial = aomHit(observation); partial.context.before = diagnosis;
  assert.deepEqual(applicationContractsForHits([partial]), []);
  const changed = structuredClone(aom); changed.document.sourceVersion = "unreviewed/v2";
  assert.deepEqual(applicationContractsForHits([changed]), []);
  const retracted = structuredClone(aom); retracted.document.currency = "retracted";
  assert.deepEqual(applicationContractsForHits([retracted]), []);
});

test("source object-key order is immaterial; conflicting metadata still fails", () => {
  const reversed = structuredClone(aom);
  reversed.document = Object.fromEntries(Object.entries(aom.document).reverse()) as Hit["document"];
  assert.deepEqual(applicationContractsForHits([reversed]), applicationContractsForHits([aom]));
  assert.deepEqual(applicationContractsForHits([aom, reversed]), applicationContractsForHits([aom]));
  reversed.document.title = "Actually changed title";
  assert.throws(() => applicationContractsForHits([aom, reversed]), /CONFLICTING|CONFLICT/);
});

test("covered without-assessment extrapolation fails despite uncertain applicability and exact quote", () => {
  const value = draft(aom, "Most acute otitis media episodes are self-limited, supporting initial symptom care without immediate clinician assessment");
  const result = run(value);
  assert.equal(result.status, "fail");
  assert.equal(result.findings[0].code, "WITHOUT_ANTIBIOTICS_NOT_WITHOUT_ASSESSMENT");
  assert.equal(result.findings[0].field, "citations.0.claim");
  assert.equal(value.citations[0].claim.slice(result.findings[0].start!, result.findings[0].end!), result.findings[0].text);
  assert.equal(result.coveredApplications[0].sourceWitnessBinding, "authored_support_span_matched");
  assert.equal(result.claimSupport, "not_assessed"); assert.equal(result.patientEligibility, "not_assessed");
});

test("general source claims, explicit uncertainty, negation and conditional applications are not blanket failures", () => {
  for (const reason of [
    "Observation is an option for some diagnosed AOM patients; this patient's eligibility is not established.",
    "If a clinician establishes the diagnostic criteria, this child qualifies for watchful waiting.",
    "We cannot say this child is eligible for watchful waiting.",
    "Whether this child is eligible for watchful waiting remains unknown.",
    "It is not true that this child is eligible for watchful waiting.",
    "Home observation is a clinical inference, not a conclusion established by the AOM source.",
  ]) {
    const result = run(draft(aom, "Most diagnosed AOM episodes resolve without antibiotics.", observation, reason));
    assert.equal(result.status, "not_assessed", reason); assert.deepEqual(result.findings, []);
  }
});

test("negated or conditional clause cannot mask a subsequent separate covered assertion", () => {
  for (const reason of [
    "If symptoms change, seek help; this child is eligible for watchful waiting.",
    "We cannot establish all criteria, but this child qualifies for watchful waiting.",
  ]) {
    const result = run(draft(aom, "General AOM natural-history statement.", observation, reason));
    assert.equal(result.status, "not_assessed"); assert.equal(result.unresolvedApplications.length, 1);
  }
});

test("preserved functioning cannot establish absent impact in a covered reason or limitation", () => {
  for (const text of ["Functioning means no functional impairment.", "Preserved function establishes that the threshold is not currently met.",
    "Functional impairment is absent because the patient is functioning.", "The daily-activity threshold is not met because she is functioning."]) {
    const value = draft(sleep, "Insomnia may affect daytime energy.", impact, text);
    assert.equal(run(value, retainedSleep, "I'm functioning but tired all day.").status, "fail", text);
    value.reason = "Daytime impact needs clarification."; value.citations[0].limitation = text;
    const result = run(value, retainedSleep); assert.equal(result.findings[0]?.field, "citations.0.limitation", text);
  }
});

test("uncertain impact and negated inference stay unassessed, never classified as absent or emergency", () => {
  for (const reason of ["The patient is functioning, but daytime impact is not established.",
    "Functioning does not establish no functional impairment.", "It is not true that functioning means no functional impairment.",
    "If functioning means no functional impairment, that assumption must be checked.",
    "The source describes a possible effect, not an established patient finding."]) {
    const result = run(draft(sleep, "Insomnia may affect daytime energy.", impact, reason), retainedSleep);
    assert.equal(result.status, "not_assessed", reason); assert.equal(result.routeChanged, false);
  }
});

test("actual retained functioning quote cannot be relabelled impairment denied", () => {
  const quote = "I'm functioning but tired all day";
  const value = draft(sleep, "Insomnia may affect daytime energy.", impact);
  value.redFlags = [{ concern: "Functional impairment", status: "denied", quote }];
  const result = run(value, retainedSleep, `Work has been stressful. ${quote}.`);
  assert.equal(result.findings[0]?.code, "FUNCTIONING_QUOTE_DOES_NOT_DENY_IMPAIRMENT");
  assert.equal(result.findings[0].field, "redFlags.0.quote");
  assert.equal(value.redFlags[0].quote.slice(result.findings[0].start!, result.findings[0].end!), quote);
  assert.equal(result.routeChanged, false);
  for (const [concern, status, text] of [
    ["Functional impairment", "unknown", ""], ["Preserved function", "reported", quote],
    ["Functional impairment", "denied", "I'm functioning and have no functional impairment"],
    ["Functional impairment", "denied", "I'm functioning normally; my daily activities are unaffected."],
    ["Functional impairment", "denied", "I'm functioning with zero difficulty."],
    ["Functional impairment", "denied", "I'm functioning but tired all day; my daily activities are unaffected."],
    ["Functional impairment", "denied", "I'm functioning"],
    ["Functional impairment", "reported", "I'm not functioning"],
  ]) {
    value.redFlags = [{ concern, status, quote: text }];
    assert.equal(run(value, retainedSleep, text).status, "not_assessed");
  }
});

test("bounded invalid inference in patientMessage is inspected without inferring route", () => {
  const value = draft(sleep, "Insomnia may affect daytime energy.", impact);
  value.patientMessage = "Preserved functioning means no functional impairment.";
  assert.equal(run(value, retainedSleep).findings[0]?.field, "patientMessage");
});

test("identity errors and omitted/mixed contracts fail without a clinical verdict", () => {
  const contracts = applicationContractsForHits([aom]);
  const value = draft(aom, "A general source description.");
  assert.equal(auditSourceApplications({ patient: "Ear pain.", hits: [aom], draft: value, contracts: [] }).status, "fail");
  const modified = structuredClone(aom); modified.document.title = "Changed metadata";
  assert.equal(auditSourceApplications({ patient: "Ear pain.", hits: [modified], draft: value, contracts }).status, "fail");
  value.citations[0].quote = "An invented source quotation.";
  assert.equal(run(value).findings[0].code, "APPLICATION_CITATION_IDENTITY_INVALID");
  const broken = structuredClone(aom); broken.chunk.hash = "0".repeat(64);
  assert.equal(run(draft(aom, "General information."), [broken]).status, "fail");
});

test("uncovered/uncited applications and reported examinations never acquire semantic validation", () => {
  const result = run({ reason: "The Ottawa rule is negative despite an incomplete examination.", citations: [] });
  assert.equal(result.status, "not_assessed"); assert.deepEqual(result.coveredApplications, []);
  const applied = run(draft(aom, "General AOM information.", observation, "This child qualifies for watchful waiting."), [aom],
    "A clinician examined my child's ear and diagnosed AOM today.");
  assert.equal(applied.patientEligibility, "not_assessed");
  assert.equal(applied.status, "not_assessed"); // No semantic basis for blocking an already assessed patient.
  assert.equal(applied.unresolvedApplications.length, 1);
  assert.deepEqual(applied.findings, []);
});

const boundPatient = "A clinician examined the ear today. Observation was agreed with the pediatrician.";
function binding(): SourceApplicationBinding {
  const c = applicationContractsForHits([aom])[0];
  return { contractId: c.id, contractHash: c.contractHash, packetHash: sha256(JSON.stringify([aom])), patientHash: sha256(boundPatient),
    use: "patient_application", conditions: c.conditions.map((condition, i) => {
      const quote = i === 0 ? "A clinician examined the ear today." : "Observation was agreed with the pediatrician.";
      const start = boundPatient.indexOf(quote);
      return { conditionId: condition.id, state: "reported_met", patientSpans: [{ start, end: start + quote.length, quote }] };
    }) };
}
function bind(application = binding(), patient = boundPatient) {
  return auditApplicationBinding({ patient, hits: [aom], contract: applicationContractsForHits([aom])[0], application });
}

test("typed complete exact witnesses bind the reported conjunction, never clinical eligibility", () => {
  const result = bind();
  assert.equal(result.bindingValid, true); assert.equal(result.reportedPrerequisiteConjunction, true);
  assert.equal(result.applicationStatus, "reported_prerequisites_bound");
  assert.equal(result.currentApplicationMeetsDeclaredConditions, true);
  assert.equal(result.patientEligibility, "not_assessed"); assert.equal(result.semanticVerification, "not_assessed");
  assert.equal(result.status, "not_assessed"); assert.equal(result.clinicalApproval, false);
});

test("unknown/not-met condition prevents current eligibility without failing general/conditional use or escalating", () => {
  for (const state of ["unknown", "not_met"] as const) for (const use of ["patient_application", "general_information", "conditional_precaution"] as const) {
    const a = binding(); a.use = use; a.conditions[1].state = state;
    if (state === "unknown") a.conditions[1].patientSpans = [];
    const result = bind(a);
    assert.equal(result.bindingValid, true); assert.equal(result.reportedPrerequisiteConjunction, false);
    assert.equal(result.currentApplicationMeetsDeclaredConditions, false); assert.equal(result.status, "not_assessed");
    assert.equal(result.applicationStatus, use === "patient_application" ? "no_current_eligibility" : "not_applying_to_current_patient");
    assert.equal(result.routeChanged, false);
  }
});

test("typed application rejects missing, unknown, duplicate, contradictory and unhashed condition bindings", () => {
  const variants = [
    (a: SourceApplicationBinding) => { a.conditions.pop(); },
    (a: SourceApplicationBinding) => { a.conditions[0].conditionId = "invented"; },
    (a: SourceApplicationBinding) => { a.conditions.push(structuredClone(a.conditions[0])); },
    (a: SourceApplicationBinding) => { a.conditions.push({ ...a.conditions[0], state: "not_met" }); },
    (a: SourceApplicationBinding) => { a.conditions[0].state = "unknown"; },
    (a: SourceApplicationBinding) => { a.conditions[0].patientSpans = []; },
    (a: SourceApplicationBinding) => { a.conditions[0].patientSpans[0].quote = "Invented examination."; },
    (a: SourceApplicationBinding) => { a.conditions[0].patientSpans[0].start++; },
    (a: SourceApplicationBinding) => { a.conditions[0].patientSpans.push(structuredClone(a.conditions[0].patientSpans[0])); },
    (a: SourceApplicationBinding) => { a.contractHash = "0".repeat(64); },
    (a: SourceApplicationBinding) => { a.packetHash = "0".repeat(64); },
    (a: SourceApplicationBinding) => { a.patientHash = "0".repeat(64); },
  ];
  for (const change of variants) {
    const a = binding(); change(a); const result = bind(a);
    assert.equal(result.status, "fail"); assert.equal(result.bindingValid, false);
    assert.equal(result.currentApplicationMeetsDeclaredConditions, false); assert.equal(result.routeChanged, false);
  }
  assert.equal(bind(binding(), "A different patient.").status, "fail");
});

test("typed quote identity cannot certify predicate, negation, subject or episode interpretation", () => {
  const patient = "My neighbour once had an ear examination, not me.";
  const a = binding(); a.patientHash = sha256(patient);
  for (const c of a.conditions) c.patientSpans = [{ start: 0, end: patient.length, quote: patient }];
  const result = bind(a, patient);
  assert.equal(result.bindingValid, true); // Deliberately demonstrate the semantic blind spot, not approve it.
  assert.equal(result.semanticVerification, "not_assessed"); assert.equal(result.patientEligibility, "not_assessed");
  assert.equal(result.clinicalApproval, false);
});

function citationApplication(): CitationApplication {
  const a = binding();
  return { citationIndex: 0, ruleId: a.contractId, use: a.use,
    conditions: a.conditions.map(c => ({ conditionId: c.conditionId,
      state: c.state === "not_met" ? "reported_not_met" : c.state,
      patientSpans: c.patientSpans.map(({ start, end }) => ({ start, end })) })) };
}
function bindCitations(applications = [citationApplication()], citations = draft(aom, "General AOM information.").citations, patient = boundPatient) {
  return auditApplicationBindings({ patient, hits: [aom], contracts: applicationContractsForHits([aom]), applications, citations });
}

test("candidate citation adapter binds all covered applications without certifying arbitrary claims", () => {
  const result = bindCitations();
  assert.equal(result.status, "not_assessed"); assert.equal(result.completeBindingCoverage, true);
  assert.equal(result.applications.length, 1);
  assert.equal(result.applications[0].authoredClaimSupport.exactAuthoredClaim, false);
  assert.equal(result.applications[0].authoredClaimSupport.support, "not_assessed");
  assert.equal(result.semanticVerification, "not_assessed"); assert.equal(result.patientEligibility, "not_assessed");
});

test("candidate adapter rejects missing, duplicate, extra or misindexed covered application", () => {
  const a = citationApplication();
  for (const applications of [[], [a, structuredClone(a)], [{ ...a, citationIndex: 1 }], [{ ...a, ruleId: "invented" }]])
    assert.equal(bindCitations(applications).status, "fail");
  const citations = draft(aom, "General AOM information.").citations;
  assert.equal(bindCitations([a], [...citations, ...citations]).status, "fail");
  assert.equal(bindCitations([a, { ...a, citationIndex: 1 }], [...citations, ...citations]).status, "not_assessed");
});

test("candidate current use cannot declare unknown/not-met while general and conditional uses can", () => {
  for (const state of ["unknown", "reported_not_met"] as const) for (const use of ["patient_application", "general_information", "conditional_precaution"] as const) {
    const a = citationApplication(); a.use = use; a.conditions[1].state = state;
    if (state === "unknown") a.conditions[1].patientSpans = [];
    const result = bindCitations([a]);
    assert.equal(result.status, use === "patient_application" ? "fail" : "not_assessed");
    assert.equal(result.completeBindingCoverage, true); // Coverage is distinct from contradictory current use.
    assert.equal(result.routeChanged, false);
  }
});

test("candidate bound no-fever text cannot acquire semantic examination verification", () => {
  const a = citationApplication();
  for (const c of a.conditions) c.patientSpans = [{ start: 0, end: 8 }];
  const result = bindCitations([a], undefined, "No fever");
  assert.equal(result.completeBindingCoverage, true); // The declared mapping is structurally bound, not clinically endorsed.
  assert.equal(result.patientEligibility, "not_assessed"); assert.equal(result.semanticVerification, "not_assessed");
  assert.equal(result.clinicalApproval, false);
  a.conditions[0].patientSpans = [{ start: 0, end: diagnosis.length }];
  assert.equal(bindCitations([a], undefined, "No fever").status, "fail"); // Source words are not patient spans.
});

test("uncatalogued citations need no invented rule; empty coverage is not support", () => {
  const h = structuredClone(aom); h.document.sourceVersion = "uncatalogued/v2";
  const result = auditApplicationBindings({ patient: "Ear pain.", hits: [h], contracts: [], applications: [], citations: draft(h, "A general statement.").citations });
  assert.equal(result.status, "not_assessed"); assert.equal(result.expectedApplications.length, 0);
  assert.equal(result.patientEligibility, "not_assessed");
});

test("audit preserves patient, drafts, packets and historical safety fields without publication", () => {
  const value = { ...draft(aom, "General AOM information."), disposition: "SELF_CARE", issued: [{ disposition: "EMERGENCY_NOW", directive: "Call 911 now." }] };
  const input = { patient: "Ear pain.", hits: [aom], draft: value };
  const before = JSON.stringify(input), result = auditSourceApplications(input);
  assert.equal(JSON.stringify(input), before); assert.equal(result.patientHash, sha256(input.patient));
  assert.equal(result.routeChanged, false); assert.equal(result.patientAdvicePublished, false); assert.equal(result.clinicalApproval, false);
  for (const path of ["src/disposition/clinical-graph.ts", "src/disposition/gates-release.ts", "src/disposition/graph-runtime.ts"])
    assert.doesNotMatch(readFileSync(path, "utf8"), /source-application/);
});
