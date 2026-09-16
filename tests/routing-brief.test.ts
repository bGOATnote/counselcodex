import test from "node:test";
import assert from "node:assert/strict";
import { routingBriefSchema, wireRoutingBriefSchema, checkRoutingProposal, patientBasisIdentity,
  ROUTING_BRIEF_INSTRUCTIONS, type RoutingBrief } from "../src/disposition/routing-brief.ts";
import { GRAPH_INSTRUCTIONS } from "../src/disposition/graph-prompts.ts";
import { CONTINUE_EMS_DIRECTIVE } from "../src/disposition/care-setting.ts";
import { resolveSourceQuoteReferences, sourceWithQuoteSpans } from "../src/disposition/source-quote-refs.ts";
import type { SafetyNotice } from "../src/disposition/contract.ts";
import { draft, patient, hit } from "./fixtures/gates-fixture.ts";

// Authored contract fixtures only; no saved cohort, provider, or clinical verdict.
const { patientMessage: _patientMessage, differential: _differential, vitalSigns: _vitalSigns,
  questions: _questions, ...briefFields } = draft;
const brief = routingBriefSchema.parse(briefFields);
const ems: SafetyNotice = { disposition: "EMERGENCY_NOW", directive: "Call 911 now.", source: "emergency_agent" };
const ed: SafetyNotice = { ...ems, directive: "Go to the emergency department now." };
const continuation: SafetyNotice = { ...ems, directive: CONTINUE_EMS_DIRECTIVE };
const today: SafetyNotice = { disposition: "SAME_DAY_IN_PERSON", directive: "An in-person assessment is recommended today.", source: "emergency_agent" };
function route(disposition: RoutingBrief["disposition"], mode: "activate_ems" | "ed_now" = "ed_now"): RoutingBrief {
  return { ...brief, disposition, reviewPriority: disposition === "ASYNC_PHYSICIAN" ? "priority" : null,
    workType: disposition === "ASYNC_PHYSICIAN" ? "medication_request" : null,
    transportIntent: disposition === "EMERGENCY_NOW" ? { mode, activationQuote: null } : null };
}

test("brief schema keeps shared routing fields and rejects patient prose or operational extras", () => {
  for (const key of ["disposition", "reviewPriority", "workType", "transportIntent"] as const) {
    assert.deepEqual(brief[key], draft[key]);
  }
  for (const extra of [
    { patientMessage: "I have sent your request and booked an appointment." },
    { differential: ["Unnecessary narrative"] }, { vitalSigns: "Unreported readings" },
    { questions: [] }, { handoffConfirmed: true }, { clinicianAccepted: true },
    { prescribingApproved: true }, { promisedResponseTime: "Within one hour" },
  ]) assert.equal(routingBriefSchema.safeParse({ ...brief, ...extra }).success, false);
  assert.equal(routingBriefSchema.safeParse({ ...brief, citations: [{ ...brief.citations[0], clinicallySupported: true }] }).success, false);
});

test("wire citations use exact source IDs and quote IDs, not model-retyped quotations", () => {
  const source = { id: hit.chunk.id, text: hit.chunk.text };
  const span = sourceWithQuoteSpans(source).quoteSpans.find(s => s.selectable)!;
  const { quote: _quote, ...citation } = brief.citations[0];
  const wire = { ...brief, citations: [{ ...citation, quoteId: span.id }] };
  assert.equal(wireRoutingBriefSchema.safeParse(wire).success, true);
  assert.equal(routingBriefSchema.safeParse(wire).success, false);
  assert.equal(wireRoutingBriefSchema.safeParse(brief).success, false);
  const resolved = routingBriefSchema.parse(resolveSourceQuoteReferences(wireRoutingBriefSchema.parse(wire), [source]));
  assert.equal(resolved.citations[0].quote, span.text);
  assert.throws(() => resolveSourceQuoteReferences({ ...wire, citations: [{ ...wire.citations[0], quoteId: "q9999" }] }, [source]), /INVALID_SOURCE_QUOTE_REFERENCE/);
});

test("brief resource bounds constrain serialization without inventing clinical findings", () => {
  assert.equal(routingBriefSchema.safeParse({ ...brief, reason: "x".repeat(451) }).success, false);
  assert.equal(routingBriefSchema.safeParse({ ...brief, evidenceLimitations: "x".repeat(351) }).success, false);
  assert.equal(routingBriefSchema.safeParse({ ...brief, redFlags: Array(5).fill(brief.redFlags[0]) }).success, false);
  assert.equal(routingBriefSchema.safeParse({ ...brief, citations: Array(3).fill(brief.citations[0]) }).success, false);
});

test("empty citations are permitted without a support or clinical approval verdict", () => {
  const uncited = routingBriefSchema.parse({ ...brief, citations: [], evidenceLimitations: "The supplied passages do not establish clinical support for this proposal." });
  assert.equal(wireRoutingBriefSchema.safeParse(uncited).success, true);
  const checked = checkRoutingProposal(uncited, patient, []);
  assert.equal(checked.eligibleRoutingProposal, true);
  assert.equal(checked.clinicalApproval, false);
  assert.equal(checked.patientAdvicePublished, false);
  for (const key of ["support", "claimSupport", "patientGrounding", "unsafe_advice", "unsupported_claims"]) {
    assert.equal(Object.hasOwn(checked, key), false);
  }
});

test("shared route checks reject contradictory priority and work-type fields", () => {
  for (const disposition of ["SELF_CARE", "SAME_DAY_IN_PERSON", "EMERGENCY_NOW"] as const) {
    for (const extra of [{ reviewPriority: "priority" as const }, { workType: "clinical_review" as const }]) {
      const checked = checkRoutingProposal({ ...route(disposition), ...extra }, patient, []);
      assert.equal(checked.eligibleRoutingProposal, false);
      assert.ok(checked.failures.includes("routing_fields_invalid"));
    }
  }
  for (const extra of [{ reviewPriority: null }, { workType: null }]) {
    assert.ok(checkRoutingProposal({ ...brief, ...extra }, patient, []).failures.includes("routing_fields_invalid"));
  }
  assert.equal(checkRoutingProposal(brief, patient, []).route, "PRIORITY_ASYNC");
  assert.equal(checkRoutingProposal({ ...brief, reviewPriority: "routine" }, patient, []).route, "STANDARD_ASYNC");
});

test("no issued notice means no inferred early-care floor", () => {
  for (const disposition of ["SELF_CARE", "ASYNC_PHYSICIAN", "SAME_DAY_IN_PERSON", "EMERGENCY_NOW"] as const) {
    const checked = checkRoutingProposal(route(disposition), patient, []);
    assert.equal(checked.eligibleRoutingProposal, true, disposition);
    assert.equal(checked.earlyFinalDisagreement, null, disposition);
    assert.equal(checked.lowerThanIssued, false, disposition);
  }
});

test("an issued emergency setting cannot be lowered to any nonemergency route", () => {
  for (const notice of [ems, ed, continuation]) for (const disposition of ["SELF_CARE", "ASYNC_PHYSICIAN", "SAME_DAY_IN_PERSON"] as const) {
    const checked = checkRoutingProposal(route(disposition), patient, [notice]);
    assert.equal(checked.eligibleRoutingProposal, false);
    assert.equal(checked.earlyFinalDisagreement, true);
    assert.equal(checked.lowerThanIssued, true);
    assert.ok(checked.failures.includes("issued_care_conflict"));
  }
});

test("EMS to ED transport reduction is blocked even when care-setting labels agree", () => {
  for (const issued of [[ems], [continuation], [ems, ed], [continuation, ed]]) {
    const checked = checkRoutingProposal(route("EMERGENCY_NOW", "ed_now"), patient, issued);
    assert.equal(checked.earlyFinalDisagreement, false);
    assert.equal(checked.lowerThanIssued, true);
    assert.ok(checked.failures.includes("issued_care_conflict"));
    assert.equal(checked.eligibleRoutingProposal, false);
  }
  assert.equal(checkRoutingProposal(route("EMERGENCY_NOW", "activate_ems"), patient, [ems]).eligibleRoutingProposal, true);
  assert.equal(checkRoutingProposal(route("EMERGENCY_NOW", "ed_now"), patient, [ed]).eligibleRoutingProposal, true);
  assert.equal(checkRoutingProposal(route("EMERGENCY_NOW", "activate_ems"), patient, [ed]).eligibleRoutingProposal, true);
});

test("same-day action is preserved while escalation remains available", () => {
  for (const disposition of ["SELF_CARE", "ASYNC_PHYSICIAN"] as const) {
    assert.ok(checkRoutingProposal(route(disposition), patient, [today]).failures.includes("issued_care_conflict"));
  }
  assert.equal(checkRoutingProposal(route("SAME_DAY_IN_PERSON"), patient, [today]).eligibleRoutingProposal, true);
  const escalated = checkRoutingProposal(route("EMERGENCY_NOW"), patient, [today]);
  assert.equal(escalated.eligibleRoutingProposal, true);
  assert.equal(escalated.earlyFinalDisagreement, true);
  assert.equal(escalated.lowerThanIssued, false);
});

test("continue EMS requires both exact patient quotation and an issued continuation", () => {
  const activePatient = "I called 911 and the dispatcher is sending help.";
  const continued = { ...route("EMERGENCY_NOW"), transportIntent: { mode: "continue_ems" as const, activationQuote: "I called 911" } };
  const checked = checkRoutingProposal(continued, activePatient, [continuation]);
  assert.equal(checked.eligibleRoutingProposal, true);
  assert.equal(checked.lowerThanIssued, false);
  assert.equal(checked.clinicalApproval, false);
  for (const [message, issued] of [[patient, [continuation]], [activePatient, []], [activePatient, [ems]], [activePatient, [ed]]] as const) {
    assert.ok(checkRoutingProposal(continued, message, [...issued]).failures.includes("active_ems_not_bound"));
  }
  assert.ok(checkRoutingProposal({ ...continued, transportIntent: { mode: "continue_ems", activationQuote: null } }, activePatient, [continuation]).failures.includes("active_ems_not_bound"));
});

test("typed transport is required only for emergency and activation quotes are continuation-only", () => {
  assert.ok(checkRoutingProposal({ ...route("EMERGENCY_NOW"), transportIntent: null }, patient, []).failures.includes("emergency_transport_missing"));
  for (const mode of ["activate_ems", "ed_now"] as const) {
    assert.ok(checkRoutingProposal({ ...route("EMERGENCY_NOW"), transportIntent: { mode, activationQuote: "No fever" } }, patient, []).failures.includes("unexpected_activation_quote"));
    assert.ok(checkRoutingProposal({ ...brief, transportIntent: { mode, activationQuote: null } }, patient, []).failures.includes("nonemergency_transport"));
  }
});

test("patient-basis identity rejects invented quotes and empty reported or denied findings", () => {
  for (const status of ["reported", "denied"] as const) {
    for (const quote of ["", "   ", "My blood pressure is normal."]) {
      assert.equal(patientBasisIdentity([{ concern: "A decision-relevant finding", status, quote }], patient), false);
    }
    assert.equal(patientBasisIdentity([{ concern: "A decision-relevant finding", status, quote: "No fever" }], patient), true);
  }
  assert.equal(patientBasisIdentity(brief.redFlags, patient), true);
});

test("unknown findings may be empty or exactly quoted, never an invented patient span", () => {
  for (const quote of ["", "My usual migraine started today"]) {
    assert.equal(patientBasisIdentity([{ concern: "Uncertain clinical interpretation", status: "unknown", quote }], patient), true);
  }
  for (const quote of ["Normal vital signs", "   "]) {
    assert.equal(patientBasisIdentity([{ concern: "Unreported measurement", status: "unknown", quote }], patient), false);
  }
});

test("quote identity and typed routing do not adjudicate negation or clinical truth", () => {
  // This intentionally contradictory label has an exact span: identity is true,
  // while semantic correctness must remain unassessed by these narrow checks.
  const contradictory = { ...brief, redFlags: [{ concern: "Fever present", status: "reported" as const, quote: "No fever" }] };
  assert.equal(patientBasisIdentity(contradictory.redFlags, patient), true);
  const checked = checkRoutingProposal(contradictory, patient, []);
  assert.equal(checked.eligibleRoutingProposal, true);
  assert.equal(checked.clinicalApproval, false);
  assert.equal(Object.hasOwn(checked, "patientGrounding"), false);
});

test("brief instructions retain original policy boundary and explicitly remove optional prose", () => {
  assert.equal(ROUTING_BRIEF_INSTRUCTIONS.split("OUTPUT:")[0], GRAPH_INSTRUCTIONS.disposition.split("OUTPUT:")[0]);
  assert.match(ROUTING_BRIEF_INSTRUCTIONS, /not a complete patient response/);
  assert.match(ROUTING_BRIEF_INSTRUCTIONS, /return citations=\[\]/);
  assert.match(ROUTING_BRIEF_INSTRUCTIONS, /No independent judge runs/);
});
