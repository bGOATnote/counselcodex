import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { projectRoutingBoundary, routingEnvelope, compareProjectedRoute } from "../src/evaluation/routing-boundary-ablation.ts";
import { draft as fixture, patient } from "./fixtures/gates-fixture.ts";
import type { DispositionRun } from "../src/disposition/contract.ts";
import type { PathBAttemptAdmission } from "../src/evaluation/v25-path-b.ts";
import { CONTINUE_EMS_DIRECTIVE } from "../src/disposition/care-setting.ts";
import { sha256 } from "../src/evidence/rag/model.ts";
import { selectGraphEvidence } from "../src/evidence/rag/selection.ts";

const source = "outputs/v25-path-b-complete-2026-09-15/runtime";
const admissions = JSON.parse(readFileSync(`${source}/attempt-admission.json`, "utf8")) as PathBAttemptAdmission[];
function saved(id: string) {
  const admission = admissions.find(a => a.id === id)!;
  const run = JSON.parse(readFileSync(`${source}/diagnostic-runs/${admission.runId}.json`, "utf8")) as DispositionRun;
  return { admission, run, expected: { message: run.message, promptHash: run.promptHash } };
}
function project(id: string) { const { run, expected, admission } = saved(id); return projectRoutingBoundary(run, expected, admission); }

test("typed route policy renders ownership without copying unverified operations or advice", () => {
  const d = { ...fixture, patientMessage: "I've routed this. Start a new medication.", reason: "Unverified assertion." };
  const envelope = routingEnvelope(d, patient, null)!;
  assert.equal(envelope.route, "PRIORITY_ASYNC");
  assert.match(envelope.instruction, /Counsel clinician.*today/);
  assert.doesNotMatch(JSON.stringify(envelope), /I've routed|new medication|Unverified assertion/);
  assert.equal(envelope.handoffConfirmed, false); assert.equal(envelope.clinicalApproval, false);
  assert.equal(envelope.patientAdvicePublished, false);
});
test("priority and transport cannot be invented, and EMS continuation needs existing admission", () => {
  assert.equal(routingEnvelope({ ...fixture, reviewPriority: null }, patient, null), null);
  const ed = { ...fixture, disposition: "EMERGENCY_NOW" as const, reviewPriority: null, workType: null,
    transportIntent: { mode: "ed_now" as const, activationQuote: null } };
  assert.match(routingEnvelope(ed, patient, null)!.instruction, /^Go to the emergency department now\./);
  assert.match(routingEnvelope({ ...ed, transportIntent: { mode: "activate_ems", activationQuote: null } }, patient, null)!.instruction, /^Call 911 now\./);
  assert.equal(routingEnvelope({ ...ed, transportIntent: null }, patient, null), null);
  const continuation = { ...ed, transportIntent: { mode: "continue_ems" as const, activationQuote: "I called 911" } };
  assert.equal(routingEnvelope(continuation, "I called 911", null), null);
  const early = { disposition: "EMERGENCY_NOW" as const, directive: CONTINUE_EMS_DIRECTIVE, source: "emergency_agent" as const };
  assert.equal(routingEnvelope(continuation, "No call reported", early), null);
  assert.equal(routingEnvelope(continuation, "I called 911", early)!.instruction, CONTINUE_EMS_DIRECTIVE);
});
test("C04 remains a delivery failure and C25 null is never agreement", () => {
  assert.equal(project("C04").eligibleProjection, false);
  assert.ok(project("C04").blocked.includes("historical_transport_or_identity_failure"));
  assert.deepEqual(compareProjectedRoute("SAME_DAY_IN_PERSON", null), { agreement: null, deviation: null });
  assert.equal(project("C25").eligibleProjection, false);
});
test("all seven early-care or transport conflicts remain blocked", () => {
  for (const id of ["C16", "C19", "C25", "C28", "C31", "C48", "C49"]) {
    assert.ok(project(id).blocked.includes("issued_care_conflict"), id);
    assert.equal(project(id).proposal, null, id);
  }
});
test("omitted failed advice remains unassessed, never an approved full response", () => {
  for (const id of ["C01", "C06", "C07", "C18", "C24", "C34", "C46"]) {
    const r = project(id);
    assert.equal(r.eligibleProjection, true, `${id}: ${r.blocked}`);
    assert.equal(r.originalProseRepublished, false);
    assert.equal(r.publishedNewClinicalOutput, false);
    assert.equal(r.unsafe_advice, "not_assessed"); assert.equal(r.unsupported_claims, "not_assessed");
    assert.equal(r.routeProseConsistency, "not_assessed");
    assert.equal(r.newProviderLatencyMs, null);
    assert.ok(r.originalFailedChecks.length > 0);
  }
});
test("patient, prompt, producer, packet, citations and cancellation bind projection", () => {
  const original = saved("C50");
  assert.equal(project("C50").eligibleProjection, true);
  const mutations: ((r: DispositionRun) => void)[] = [
    r => { r.message += " different patient"; },
    r => { r.promptHash = "0".repeat(64); },
    r => { r.agents!.filter(a => a.role === "disposition")[0].failure = "failed"; },
    r => { r.agents!.push(r.agents!.find(a => a.role === "disposition")!); },
    r => { selectGraphEvidence(r.graph!.retrieval, 9)[0].chunk.text += " corrupted"; },
    r => { r.graph!.retrieval = []; },
    r => { const d = r.agents!.find(a => a.role === "disposition")!.output as { citations: { quote: string }[] }; d.citations[0].quote = "Never present in the source material."; },
    r => { r.graph!.gatesAdmission!.aborted = true; },
    r => { r.responseEvents![0].sequence = 30; },
  ];
  for (const mutate of mutations) {
    const r = structuredClone(original.run); mutate(r);
    assert.equal(projectRoutingBoundary(r, original.expected, original.admission).eligibleProjection, false);
  }
});
test("projection does not mutate any of the 50 saved runs", () => {
  for (const a of admissions) {
    const { run, expected, admission } = saved(a.id), before = sha256(JSON.stringify(run));
    projectRoutingBoundary(run, expected, admission);
    assert.equal(sha256(JSON.stringify(run)), before, a.id);
  }
});
test("agreement is exact priority but acuity treats both async priorities alike", () => {
  assert.deepEqual(compareProjectedRoute("STANDARD_ASYNC", ["PRIORITY_ASYNC"]), { agreement: false, deviation: "within_accepted_acuity_range" });
  assert.deepEqual(compareProjectedRoute("SELF_CARE", ["STANDARD_ASYNC"]), { agreement: false, deviation: "under" });
  assert.deepEqual(compareProjectedRoute(null, ["STANDARD_ASYNC"]), { agreement: null, deviation: null });
});
