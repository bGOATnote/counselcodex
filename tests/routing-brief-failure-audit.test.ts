import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { auditRoutingBriefFailure } from "../src/evaluation/routing-brief-failure-audit.ts";
import { readRoutingBriefFailureAudit } from "../scripts/routing-brief-failure-audit.ts";
import { draft, patient, hit } from "./fixtures/gates-fixture.ts";
import { sourceWithQuoteSpans } from "../src/disposition/source-quote-refs.ts";
import type { SafetyNotice } from "../src/disposition/contract.ts";

const { patientMessage: _message, differential: _differential, vitalSigns: _vitals, questions: _questions, ...base } = draft;
const source = { id: hit.chunk.id, text: hit.chunk.text };
const span = sourceWithQuoteSpans(source).quoteSpans.find(s => s.selectable)!;
const { quote: _quote, ...claim } = base.citations[0];
const brief = { ...base, citations: [{ ...claim, quoteId: span.id }] };
const ems: SafetyNotice = { disposition: "EMERGENCY_NOW", directive: "Call 911 now.", source: "emergency_agent" };
const ed: SafetyNotice = { ...ems, directive: "Go to the emergency department now." };
function audit(output: unknown, issued: SafetyNotice[] = [], evaluation: unknown = { failure: "ORIGINAL_FAILURE", eligibleRoutingProposal: false }) {
  return auditRoutingBriefFailure({ arm: "brief", patient, issued, sources: [source], execution: { output, failure: null }, evaluation });
}

test("a blank third citation rejects the original contract without erasing raw routing intent", () => {
  const raw = { ...brief, disposition: "EMERGENCY_NOW", reviewPriority: null, workType: null,
    transportIntent: { mode: "ed_now", activationQuote: null },
    citations: [...brief.citations, ...brief.citations, { passageId: "", quoteId: "q0", claim: "", applicability: "uncertain", limitation: "" }] };
  const result = audit(raw, [ed]);
  assert.equal(result.original.storedFailure, "ORIGINAL_FAILURE");
  assert.equal(result.original.storedEligibleRoutingProposal, false);
  assert.equal(result.rawDispositionPresent, true);
  assert.equal(result.wireSchema.valid, false);
  assert.ok(result.wireSchema.issues.some(i => i.code === "too_big" && i.path[0] === "citations"));
  assert.ok(result.wireSchema.issues.some(i => i.code === "too_small" && i.path.join(".") === "citations.2.claim"));
  assert.equal(result.hypotheticalTypedCore.route, "EMERGENCY_NOW");
  assert.equal(result.hypotheticalTypedCore.passesTypedCoreOnly, true);
  assert.equal(result.citationReferences.references[0].status, "exact_quote_bound");
  assert.equal(result.citationReferences.references[2].status, "unbound_reference");
  assert.equal(result.originalEligibilityChanged, false);
});

test("invalid auxiliary fields cannot conceal an unchanged raw issued-care reduction", () => {
  const raw = { ...brief, disposition: "SAME_DAY_IN_PERSON", reviewPriority: null, workType: null,
    reason: "short", citations: [...brief.citations, ...brief.citations, ...brief.citations] };
  const result = audit(raw, [ed]);
  assert.ok(result.categories.includes("citation_serialization_failure"));
  assert.ok(result.categories.includes("auxiliary_serialization_failure"));
  assert.ok(result.categories.includes("issued_care_reduction"));
  assert.equal(result.hypotheticalTypedCore.issuedCareReductionBlocked, true);
  assert.equal(result.hypotheticalTypedCore.passesTypedCoreOnly, false);
  assert.ok(result.hypotheticalTypedCore.failures.includes("issued_care_conflict"));
});

test("activation-quote misuse and EMS-to-ED reduction remain distinct blockers", () => {
  const raw = { ...brief, disposition: "EMERGENCY_NOW", reviewPriority: null, workType: null,
    transportIntent: { mode: "ed_now", activationQuote: "No fever" } };
  const result = audit(raw, [ems]);
  assert.equal(result.wireSchema.valid, true);
  assert.ok(result.categories.includes("activation_quote_used_outside_continue_ems"));
  assert.ok(result.categories.includes("issued_care_reduction"));
  assert.deepEqual(result.hypotheticalTypedCore.failures, ["unexpected_activation_quote", "issued_care_conflict"]);
  assert.deepEqual(result.hypotheticalTypedCore.fields.transportIntent, raw.transportIntent);
  assert.equal(result.hypotheticalTypedCore.valuesChanged, false);
});

test("stitching patient quotes is an identity error, not missing routing intent", () => {
  const raw = { ...brief, redFlags: [{ concern: "Reported symptoms", status: "reported", quote: "My usual migraine... No fever." }] };
  const result = audit(raw);
  assert.equal(result.rawDispositionPresent, true);
  assert.equal(result.patientBasis.identity, false);
  assert.ok(result.categories.includes("exact_patient_basis_identity_failure"));
  assert.equal(result.hypotheticalTypedCore.passesTypedCoreOnly, true);
  assert.equal(result.clinicalApproval, false);
});

test("an exact quote does not establish the model's clinical or negation interpretation", () => {
  const result = audit({ ...brief, redFlags: [{ concern: "Fever present", status: "reported", quote: "No fever" }] });
  assert.equal(result.patientBasis.identity, true);
  assert.equal(result.citationReferences.claimSupport, "not_assessed");
  assert.equal(result.citationReferences.applicability, "not_assessed");
  assert.equal(result.unsafe_advice, "not_assessed");
  assert.equal(result.unsupported_claims, "not_assessed");
  assert.equal(result.clinicalApproval, false);
});

test("missing provider output remains missing and a missing typed field is not default-filled", () => {
  const noOutput = auditRoutingBriefFailure({ arm: "brief", patient, issued: [ems], sources: [source],
    execution: { failure: "MODEL_TIMEOUT", output: null }, evaluation: null });
  assert.equal(noOutput.original.providerFailure, "MODEL_TIMEOUT");
  assert.equal(noOutput.rawDispositionPresent, false);
  assert.equal(noOutput.hypotheticalTypedCore.passesTypedCoreOnly, false);
  const { transportIntent: _intent, ...missingTransport } = brief;
  const missing = audit(missingTransport);
  assert.equal(missing.hypotheticalTypedCore.fieldPresence.transportIntent, false);
  assert.equal(missing.hypotheticalTypedCore.schemaValid, false);
  assert.ok(missing.categories.includes("typed_core_schema_failure"));
});

test("the full arm uses its own schema and preserves its original outcome", () => {
  const full = { ...draft, citations: brief.citations };
  const evaluation = { failure: null, eligibleRoutingProposal: true, basisIdentity: true, proposal: { route: "PRIORITY_ASYNC", failures: [] } };
  const result = auditRoutingBriefFailure({ arm: "full", patient, issued: [], sources: [source],
    execution: { output: full, failure: null }, evaluation });
  assert.equal(result.wireSchema.valid, true);
  assert.equal(result.original.storedEligibleRoutingProposal, true);
  assert.deepEqual(result.original.storedProposal, evaluation.proposal);
  assert.equal(result.originalScoresChanged, false);
});

test("diagnostic replay never mutates raw execution, evaluation or fixed inputs", () => {
  const input = { arm: "brief" as const, patient, issued: [ems], sources: [source],
    execution: { output: structuredClone(brief), failure: null },
    evaluation: { failure: "ORIGINAL_FAILURE", eligibleRoutingProposal: false } };
  const before = JSON.stringify(input);
  auditRoutingBriefFailure(input);
  assert.equal(JSON.stringify(input), before);
});

test("read-only study snapshots retain missing and not-yet-readable artifacts without writing", () => {
  const directory = mkdtempSync(join(tmpdir(), "routing-brief-audit-test-"));
  const write = (name: string, value: unknown) => writeFileSync(join(directory, name), JSON.stringify(value));
  try {
    const fixed = { message: patient, issued: [], sources: [source] };
    write("plan.json", { node: process.version, icu: process.versions.icu, files: {},
      cases: [{ id: "C01", ...fixed }, { id: "C02", ...fixed }],
      schedule: [{ id: "C01", arm: "full" }, { id: "C01", arm: "brief" }, { id: "C02", arm: "brief" }] });
    write("C01-full-result.json", { execution: { output: { ...draft, citations: brief.citations }, failure: null } });
    write("C01-full-evaluation.json", { id: "C01", arm: "full", failure: null, eligibleRoutingProposal: true });
    writeFileSync(join(directory, "C01-brief-result.json"), "{"); // An in-progress write, not a provider verdict.
    const snapshot = () => readdirSync(directory).sort().map(name => [name, readFileSync(join(directory, name), "utf8")]);
    const before = snapshot(), result = readRoutingBriefFailureAudit(directory);
    assert.deepEqual(snapshot(), before);
    assert.equal(result.scheduledSlots, 3);
    assert.equal(result.availableResults, 2);
    assert.equal(result.availableEvaluations, 1);
    assert.equal(result.rows[0].audit!.original.storedEligibleRoutingProposal, true);
    assert.equal(result.rows[1].readErrors[0].failure, "UNREADABLE_ARTIFACT_AT_SNAPSHOT");
    assert.equal(result.rows[1].audit, null);
    assert.equal(result.rows[2].resultPresent, false);
    assert.equal(result.rows[2].audit, null);
    assert.equal(result.originalScoresChanged, false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
