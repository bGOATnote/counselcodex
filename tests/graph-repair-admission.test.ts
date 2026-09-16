import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRepairContract, nominateRepairFields, REPAIR_PROTOCOL, REPAIR_SCOPE_POLICY } from "../src/disposition/graph-repair.ts";
import { sameRepairValue } from "../src/disposition/repair-values.ts";
import { draftSchema, wireDraftSchema } from "../src/disposition/graph-output.ts";
import { quoteSpans } from "../src/disposition/source-quote-refs.ts";
import { checkAnswer } from "../src/disposition/contract.ts";
import type { DispositionRun } from "../src/disposition/contract.ts";
import { sha256 } from "../src/evidence/rag/model.ts";
import { verifyPreservedCare } from "../apps/evaluation/lib/preserved-care.ts";
import { CONTINUE_EMS_DIRECTIVE, PRESERVED_CARE_COPY, urgentCareDirective } from "../src/disposition/care-setting.ts";
import { buildJudgeSourceAnchorRepairAuditSteps } from "../src/disposition/judge-source-anchor-repair.ts";
import { graphPromptHash } from "../src/disposition/clinical-graph.ts";
import type { GraphConfig } from "../src/disposition/graph-config.ts";

const repair = createRepairContract(draftSchema, wireDraftSchema);
const source = { id: "test-source", text: "This synthetic source describes symptoms and requires individualized clinician assessment." };
const draft = draftSchema.parse({ disposition: "ASYNC_PHYSICIAN", reviewPriority: "routine", workType: "medication_request", transportIntent: null,
  reason: "The reported medication request needs a prescribing clinician review.",
  patientMessage: "I recommend review by a Counsel clinician in this thread. Service availability is not connected.",
  differential: ["Reported medication renewal request"], redFlags: [{ concern: "New symptoms", status: "unknown", quote: "" }],
  vitalSigns: "No vital signs reported; measurement status is unknown.", questions: [],
  citations: [{ passageId: source.id, quote: source.text, claim: "The source calls for individualized assessment.", applicability: "uncertain", limitation: "This is a synthetic test source." }],
  evidenceLimitations: "The test source does not establish treatment eligibility." });
const routing = { disposition: draft.disposition, reviewPriority: draft.reviewPriority, workType: draft.workType, transportIntent: draft.transportIntent };
type Edit = { field: string; value: unknown };
const patch = (edits: Edit[], allowed = ["reason", "patientMessage", "questions", "routing", "citations"] as Parameters<typeof repair.prepare>[2]) => {
  const binding = repair.prepare(draft, [source], allowed);
  return { baseDraftHash: binding.baseDraftHash, evidenceHash: binding.evidenceHash, edits };
};
const apply = (edits: Edit[], allowed = ["reason", "patientMessage", "questions", "routing", "citations"] as Parameters<typeof repair.prepare>[2]) => repair.apply(draft, [source], allowed, patch(edits, allowed));

test("mixed real changes and authorized no-ops preserve the exact effective partition", () => {
  const original = JSON.stringify(draft);
  const edits = [{ field: "reason", value: "Only the reported request supports this clinician task." }, { field: "patientMessage", value: draft.patientMessage + " No request has been sent." }, { field: "questions", value: [] }];
  for (const ordered of [edits, [...edits].reverse()]) {
    const result = apply(ordered);
    assert.equal(result.audit.protocol, "field-local-repair/v2");
    assert.equal(result.audit.status, "applied");
    assert.deepEqual(result.audit.noopFields, ["questions"]);
    assert.deepEqual(result.audit.changedFields, ordered.filter(e => e.field !== "questions").map(e => e.field));
    assert.deepEqual(result.output?.citations, draft.citations);
    assert.equal(result.output?.disposition, draft.disposition);
  }
  assert.equal(JSON.stringify(draft), original);
});

test("unchanged routing does not require coupled prose; effective routing changes do", () => {
  const changedReason = { field: "reason", value: "The reported request remains appropriate for clinician review." };
  const unchangedRouting = { field: "routing", value: { transportIntent: null, workType: routing.workType, reviewPriority: routing.reviewPriority, disposition: routing.disposition } };
  const normalized = apply([changedReason, unchangedRouting]);
  assert.equal(normalized.audit.status, "applied");
  assert.deepEqual(normalized.audit.changedFields, ["reason"]);
  assert.deepEqual(normalized.audit.noopFields, ["routing"]);
  const changedRouting = { field: "routing", value: { ...routing, workType: "clinical_review" } };
  assert.equal(apply([changedRouting, changedReason]).audit.failure, "INCOMPLETE_ROUTING_REPAIR");
  const coupled = apply([changedRouting, { field: "reason", value: draft.reason }, { field: "patientMessage", value: draft.patientMessage }]);
  assert.equal(coupled.audit.status, "applied");
  assert.deepEqual(coupled.audit.changedFields, ["routing"]);
  assert.deepEqual(coupled.audit.noopFields, ["reason", "patientMessage"]);
});

test("schema, permission, source and binding checks cannot be hidden behind no-op normalization", () => {
  const changed = { field: "reason", value: "A changed reason still requires exact admission checks." };
  const repeated = { field: "questions", value: [] };
  const binding = patch([changed]);
  const failures: [unknown, Parameters<typeof repair.prepare>[2], string][] = [
    [patch([repeated]), ["questions"], "NOOP_REPAIR_FIELD"],
    [patch([repeated, { field: "routing", value: routing }]), ["questions", "routing"], "NOOP_REPAIR_FIELD"],
    [patch([changed, repeated, repeated]), ["reason", "questions"], "DUPLICATE_REPAIR_FIELD"],
    [patch([changed, repeated]), ["reason"], "UNAUTHORIZED_REPAIR_FIELD"],
    [{ ...binding, baseDraftHash: "0".repeat(64) }, ["reason"], "STALE_REPAIR_BINDING"],
    [{ ...binding, evidenceHash: "0".repeat(64) }, ["reason"], "STALE_REPAIR_BINDING"],
    [patch([changed, { field: "questions", value: ["Unexpected question?"] }]), ["reason", "questions"], "REPAIR_SCHEMA_INVALID"],
    [patch([changed, { field: "routing", value: { ...routing, unknown: true } }]), ["reason", "routing"], "REPAIR_SCHEMA_INVALID"],
  ];
  for (const [raw, allowed, expected] of failures) {
    const result = repair.apply(draft, [source], allowed, raw);
    assert.equal(result.output, null, expected);
    assert.equal(result.audit.status, "rejected", expected);
    assert.equal(result.audit.resultDraftHash, null, expected);
    assert.equal(result.audit.failure, expected);
  }
  const { quote: _quote, ...citation } = draft.citations[0];
  for (const value of [{ ...citation, passageId: "unknown", quoteId: "q0" }, { ...citation, quoteId: "q999" }]) {
    const result = apply([changed, { field: "citations", value: [value] }]);
    assert.equal(result.output, null);
    assert.match(result.audit.failure!, /INVALID_SOURCE/);
    assert.deepEqual(result.audit.changedFields, [], "all source references are validated before applying changes");
  }
});

test("a source-resolved citation may be a no-op without bypassing reference validation", () => {
  const { quote: _quote, ...citation } = draft.citations[0];
  const result = apply([{ field: "reason", value: draft.reason + " No prescribing authority is assumed." },
    { field: "citations", value: [{ ...citation, quoteId: quoteSpans(source.text)[0].id }] }]);
  assert.equal(result.audit.status, "applied");
  assert.deepEqual(result.audit.noopFields, ["citations"]);
  assert.deepEqual(result.output?.citations, draft.citations);
});

test("effective routing changes cannot create an invalid route/queue combination", () => {
  const result = apply([{ field: "routing", value: { ...routing, disposition: "SELF_CARE" } },
    { field: "reason", value: draft.reason }, { field: "patientMessage", value: draft.patientMessage }]);
  assert.equal(result.output, null);
  assert.equal(result.audit.failure, "REPAIR_ROUTING_INVALID");
});

test("structural equality ignores object-key insertion order only", () => {
  assert.ok(sameRepairValue({ b: [1, { y: 2, x: "é" }], a: null }, { a: null, b: [1, { x: "é", y: 2 }] }));
  for (const [a, b] of [["é", "e\u0301"], ["text", "text "], [[1, 2], [2, 1]], [{ a: undefined }, {}], [null, {}], [false, 0]]) assert.equal(sameRepairValue(a, b), false);
});

test("medication check exposes exact field spans to the existing narrow repair nomination", () => {
  const message = "Can I refill my albuterol inhaler? I use it weekly.";
  const { citations: _citations, transportIntent: _intent, ...answer } = draft;
  const benign = { ...answer, evidence: [], patientMessage: "If you start needing the inhaler more often, contact a clinician." };
  const status = checkAnswer(benign, message, [], null).find(c => c.id === "no_unverified_inhaler_plan")!;
  assert.equal(status.status, "pass");
  for (const field of ["patientMessage", "reason"] as const) {
    const text = "Use your inhaler every hour while awaiting review.";
    const finding = checkAnswer({ ...benign, [field]: text }, message, [], null).find(c => c.id === "no_unverified_inhaler_plan")!;
    assert.equal(finding.status, "fail");
    const [span] = JSON.parse(finding.detail.slice(finding.detail.indexOf("Findings: ") + 10));
    assert.equal(span.field, field);
    assert.equal(text.slice(span.start, span.end), span.matchedText);
    assert.deepEqual(nominateRepairFields([], [finding], false), [field]);
  }
});

const dismissedVitals = "No vital signs reported; whether any were measured is unknown. None are needed for this routing decision.";
function vitalFinding(base = { ...draft, vitalSigns: dismissedVitals }) {
  const { citations, transportIntent: _intent, ...answer } = base;
  return checkAnswer({ ...answer, evidence: citations.map(c => ({ sourceId: c.passageId, claim: c.claim })) }, "A synthetic message requesting clinician review.", [], null)
    .find(check => check.id === "unmeasured_vitals_not_dismissed")!;
}

test("the actual vital check nominates and applies only its exact current field", () => {
  const base = { ...draft, vitalSigns: dismissedVitals }, finding = vitalFinding(base);
  assert.equal(finding.status, "fail");
  assert.deepEqual(finding.repairLocations, [{ field: "vitalSigns", start: 63, end: 78, matchedText: "None are needed" }]);
  const allowed = nominateRepairFields([], [finding], false, base);
  assert.deepEqual(allowed, ["vitalSigns"]);
  const binding = repair.prepare(base, [source], allowed);
  const result = repair.apply(base, [source], allowed, { ...binding, protocol: undefined, allowedFields: undefined,
    baseDraftHash: binding.baseDraftHash, evidenceHash: binding.evidenceHash, edits: [{ field: "vitalSigns", value: draft.vitalSigns }] });
  // Patch schemas reject extra keys, even when their value is undefined.
  assert.equal(result.audit.failure, "REPAIR_SCHEMA_INVALID");
  const accepted = repair.apply(base, [source], allowed, { baseDraftHash: binding.baseDraftHash, evidenceHash: binding.evidenceHash,
    edits: [{ field: "vitalSigns", value: draft.vitalSigns }] });
  assert.ok(accepted.output);
  assert.equal(accepted.audit.status, "applied");
  assert.deepEqual(accepted.audit.changedFields, ["vitalSigns"]);
  assert.equal(accepted.audit.protocol, "field-local-repair/v2");
  assert.deepEqual(accepted.output, { ...base, vitalSigns: draft.vitalSigns });
  assert.equal(vitalFinding(accepted.output).status, "pass");
  assert.equal(base.vitalSigns, dismissedVitals, "the original draft is not mutated");
});

test("missing, malformed, other-field and stale vital locations grant no new repair permission", () => {
  const base = { ...draft, vitalSigns: dismissedVitals }, finding = vitalFinding(base), location = finding.repairLocations![0];
  assert.deepEqual(nominateRepairFields([], [finding], false), []);
  assert.deepEqual(nominateRepairFields([], [{ ...finding, repairLocations: undefined }], false, base), []);
  assert.deepEqual(nominateRepairFields([], [{ ...finding, repairLocations: {} } as typeof finding], false, base), []);
  assert.deepEqual(nominateRepairFields([], [finding], false, draft), []);
  const invalid = [null, { ...location, field: "reason" }, { ...location, start: -1 }, { ...location, start: 61.5 },
    { ...location, end: Infinity }, { ...location, end: 10000 }, { ...location, end: location.start },
    { ...location, matchedText: "Another phrase" }, { ...location, matchedText: null },
    { ...location, start: 0, end: 15 }, { field: "vitalSigns" }];
  for (const candidate of invalid) assert.deepEqual(nominateRepairFields([], [{ ...finding, repairLocations: [candidate] } as typeof finding], false, base), []);
  assert.deepEqual(nominateRepairFields([], [{ ...finding, id: "unknown_check" }], false, base), []);
  assert.deepEqual(nominateRepairFields(["questions"], [{ ...finding, repairLocations: undefined }], false, base), ["questions"]);
});

test("emergency exception preserves clinical status and original offsets of a later invalid claim", () => {
  const exempt = "No readings are needed before seeking emergency care";
  const emergency = { ...draft, disposition: "EMERGENCY_NOW" as const, reviewPriority: null, workType: null, vitalSigns: exempt };
  assert.deepEqual(vitalFinding(emergency), { id: "unmeasured_vitals_not_dismissed", status: "pass",
    detail: "Do not declare missing readings unnecessary from a brief message; their need is not established by this prototype." });
  assert.equal(vitalFinding({ ...draft, vitalSigns: exempt }).status, "fail", "the exception remains emergency-only");
  const text = `🩺 Unknown measurements. ${exempt}; readings are unnecessary.`;
  const mixed = { ...emergency, vitalSigns: text }, finding = vitalFinding(mixed);
  assert.equal(finding.status, "fail");
  const start = text.indexOf("readings are unnecessary");
  assert.deepEqual(finding.repairLocations, [{ field: "vitalSigns", start, end: start + "readings are unnecessary".length, matchedText: "readings are unnecessary" }]);
  assert.deepEqual(nominateRepairFields([], [finding], false, mixed), ["vitalSigns"]);
  assert.equal(vitalFinding({ ...emergency, vitalSigns: "No vitals are required to act on this" }).status, "pass");
});

test("typed vital scope does not bypass patch binding, actual-change, schema or permissions", () => {
  const base = { ...draft, vitalSigns: dismissedVitals }, allowed = nominateRepairFields([], [vitalFinding(base)], false, base);
  const binding = repair.prepare(base, [source], allowed), valid = { baseDraftHash: binding.baseDraftHash, evidenceHash: binding.evidenceHash,
    edits: [{ field: "vitalSigns", value: draft.vitalSigns }] };
  for (const [raw, failure] of [
    [{ ...valid, baseDraftHash: "0".repeat(64) }, "STALE_REPAIR_BINDING"],
    [{ ...valid, evidenceHash: "0".repeat(64) }, "STALE_REPAIR_BINDING"],
    [{ ...valid, edits: [{ field: "vitalSigns", value: base.vitalSigns }] }, "NOOP_REPAIR_FIELD"],
    [{ ...valid, edits: [{ field: "reason", value: "An unauthorized rewritten clinical reason." }] }, "UNAUTHORIZED_REPAIR_FIELD"],
    [{ ...valid, edits: [{ field: "routing", value: routing }] }, "UNAUTHORIZED_REPAIR_FIELD"],
    [{ ...valid, edits: [{ field: "vitalSigns", value: [] }] }, "REPAIR_SCHEMA_INVALID"],
  ] as const) {
    const result = repair.apply(base, [source], allowed, raw);
    assert.equal(result.output, null); assert.equal(result.audit.failure, failure);
    assert.equal(result.audit.resultDraftHash, null);
  }
});

test("archived C36 attribution replay opens one field without rewriting its recorded failure or approving care", () => {
  const url = new URL("../outputs/clinical-lift-v23-cohort-live-2026-09-14/36-C36-run.json", import.meta.url), raw = readFileSync(url, "utf8");
  assert.equal(sha256(raw), "21e3ded568873bfeb4a05033a3effca035dcdef04aced3d0368a84d33219fbb7");
  const archived = JSON.parse(raw) as DispositionRun;
  assert.equal(archived.runId, "afdbfdad-b302-4bf1-9d87-b173268593f5");
  assert.equal(archived.failure, "REPAIR_SCOPE_UNAVAILABLE");
  assert.deepEqual(archived.graph!.repair!.allowedFields, []);
  const base = draftSchema.parse(archived.agents!.find(a => a.role === "disposition" && a.modelCalls > 0)!.output);
  const sources = archived.guidance.map(g => {
    const hit = archived.graph!.retrieval.flatMap(r => r.hits).find(h => h.chunk.id === g.id && h.chunk.text === g.summary)!;
    assert.ok(hit); return { id: hit.chunk.id, kind: hit.document.kind, scope: hit.document.scope, text: hit.chunk.text };
  });
  const finding = vitalFinding(base), allowed = nominateRepairFields([], [finding], false, base), binding = repair.prepare(base, sources, allowed);
  assert.deepEqual(allowed, ["vitalSigns"]);
  assert.equal(binding.baseDraftHash, archived.graph!.repair!.baseDraftHash);
  assert.equal(binding.evidenceHash, archived.graph!.repair!.evidenceHash);
  const { repairLocations: _locations, ...unchangedCheck } = finding;
  assert.deepEqual(unchangedCheck, archived.checks.find(c => c.id === "unmeasured_vitals_not_dismissed"));
  const patched = repair.apply(base, sources, allowed, { baseDraftHash: binding.baseDraftHash, evidenceHash: binding.evidenceHash,
    edits: [{ field: "vitalSigns", value: "No vital signs reported; whether any were measured is unknown." }] });
  assert.ok(patched.output); assert.deepEqual(patched.audit.changedFields, ["vitalSigns"]);
  assert.equal(vitalFinding(patched.output).status, "pass");
  assert.deepEqual(patched.output, { ...base, vitalSigns: "No vital signs reported; whether any were measured is unknown." });
  assert.equal(archived.failure, "REPAIR_SCOPE_UNAVAILABLE");
  assert.equal(sha256(readFileSync(url, "utf8")), sha256(raw));
  // This offline synthetic patch is NOT a provider response, fresh judge
  // verdict, released assessment, or retrospective change to the cohort.
});

test("new mechanical scope changes prompt identity without changing the v2 wire protocol", () => {
  const manifest = JSON.parse(readFileSync(new URL("../outputs/clinical-lift-v23-cohort-plan-2026-09-14/manifest.json", import.meta.url), "utf8")) as { config: GraphConfig; promptHash: string };
  assert.equal(REPAIR_PROTOCOL, "field-local-repair/v2");
  assert.equal(REPAIR_SCOPE_POLICY.version, "mechanical-repair-scope/v1");
  assert.notEqual(graphPromptHash(manifest.config), manifest.promptHash);
});

/** Synthetic provenance fixture only; no judge/provider or clinical assertion.
 * The final care review is deliberately distinct from the pre-patch draft.
 */
function preservedFixture(correction = false) {
  const message = "I have chest pressure. I called 911; an ambulance is coming for me now.";
  const base = draftSchema.parse({ ...draft, disposition: correction ? "SAME_DAY_IN_PERSON" : "EMERGENCY_NOW", reviewPriority: null, workType: null,
    patientMessage: correction ? "Seek an in-person assessment today. Do not wait for a message." : "Call 911 now. Do not drive yourself.",
    reason: "The reported chest pressure requires immediate assessment.", citations: [],
    redFlags: [{ concern: "Chest pressure", status: "reported", quote: "chest pressure" }] });
  const binding = repair.prepare(base, [], ["patientMessage", "questions"]);
  const patchOutput = { baseDraftHash: binding.baseDraftHash, evidenceHash: binding.evidenceHash,
    edits: [{ field: "patientMessage", value: base.patientMessage + " Do not delay care." }, { field: "questions", value: [] }] };
  const applied = repair.apply(base, [], binding.allowedFields, patchOutput);
  assert.ok(applied.output);
  const final = applied.output;
  const judge = { reviewScope: "draft-and-issued-question/v2", verdict: "revise", earlyAction: correction ? "unsupported" : "none",
    earlyCorrection: correction ? { reason: "This is a synthetic exact-bound correction fixture.", patientQuotes: ["chest pressure"], triggerMisattributedOrCorrected: false } : null,
    criteria: ["undertriage", "overtriage", "patient_grounding", "claim_support", "safety_net", "clarification_delay", "ownership"].map(id => ({ id, verdict: id === "claim_support" ? "fail" : "pass", reason: "Synthetic provenance criterion.", anchors: [{ unit: "patient", quote: "chest pressure" }] })),
    correction: "Evidence is not established; care-only provenance is tested.", repairTargets: ["citations"], evidenceQueries: [] };
  const reviewBinding = { patientHash: sha256(message), draftHash: sha256(JSON.stringify(final)), packetHash: "a".repeat(64) };
  const directive = urgentCareDirective(final.disposition, final.patientMessage)!;
  const proof = { ...reviewBinding, reviewInputBinding: reviewBinding, judgeHash: sha256(JSON.stringify(judge)), disposition: final.disposition, directive, origin: "current_review" };
  const to = { disposition: final.disposition, directive };
  const from = { disposition: "EMERGENCY_NOW", directive: CONTINUE_EMS_DIRECTIVE };
  const run = { message, profile: "evidence-graph-opus", status: "review_required", origin: "validation_safeguard", failure: "CLINICIAN_REVIEW_REQUIRED",
    answer: { disposition: final.disposition, reviewPriority: null, workType: null, patientMessage: directive,
      reason: correction ? PRESERVED_CARE_COPY.correctedReason : PRESERVED_CARE_COPY.reason, differential: [], redFlags: [], questions: [], evidence: [],
      vitalSigns: PRESERVED_CARE_COPY.vitalSigns, evidenceLimitations: PRESERVED_CARE_COPY.evidenceLimitations },
    safetyFloor: to, guidance: [], responseEvents: correction ? [{ kind: "action", notice: from }] : [],
    ...(correction ? { reconciliation: { status: "revised", from, to, reason: judge.earlyCorrection!.reason } } : {}),
    graph: { preservedCare: proof, repair: applied.audit, release: "clinician_required", judge, corrections: 1, retrieval: [], careCorrectionReleased: correction },
    agents: [{ role: "disposition", failure: null, output: base }, { role: "disposition", failure: null, output: patchOutput,
      repairInputBinding: { baseDraftHash: binding.baseDraftHash, evidenceHash: binding.evidenceHash, allowedFields: binding.allowedFields } },
      { role: "critic", failure: null, output: judge, reviewInputBinding: reviewBinding }] } as unknown as DispositionRun;
  return { run, message };
}

test("browser care provenance reconstructs v2 no-ops and requires the fresh exact-draft review", async () => {
  const { run, message } = preservedFixture();
  assert.equal(await verifyPreservedCare(run, message), true);
  const mutations: ((copy: DispositionRun) => void)[] = [
    copy => { delete copy.graph!.repair!.noopFields; },
    copy => { copy.graph!.repair!.noopFields = ["reason"]; },
    copy => { copy.graph!.repair!.changedFields = []; },
    copy => { copy.graph!.repair!.protocol = "unknown-protocol"; },
    copy => { copy.graph!.repair!.protocol = "field-local-repair/v1"; }, // v1 did not admit this questions no-op
    copy => { copy.agents![2].reviewInputBinding!.draftHash = copy.graph!.repair!.baseDraftHash; },
    copy => { copy.agents![2].failure = "MODEL_OR_SCHEMA_FAILURE"; },
    copy => { copy.failure = "RUN_CANCELLED"; },
    copy => { (copy.agents![1].output as { edits: Edit[] }).edits.push({ field: "reason", value: draft.reason }); },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(run); mutate(copy);
    assert.equal(await verifyPreservedCare(copy, message), false);
  }
});

test("preserved care replays its exact source-repair packet rather than substituting final guidance", async () => {
  const { run, message } = preservedFixture(), critic = run.agents!.at(-1)!;
  const id = "a".repeat(64), body = "Synthetic retained earlier review evidence; no patient treatment recommendation.";
  const final = { ...draftSchema.parse(run.agents![0].output), patientMessage: (run.agents![1].output as { edits: Edit[] }).edits[0].value };
  const judge = run.graph!.judge!; judge.criteria.find(c => c.id === "claim_support")!.anchors = [{ unit: `source:${id}`, quote: body }];
  const packet = { units: [{ id: "patient", text: message }, { id: "draft", text: JSON.stringify(final) },
    { id: `source:${id}`, text: `patient_summary; Contract test; publication: unknown\n${body}` }], hasIssuedEarlyAction: false };
  critic.reviewInputBinding!.packetHash = sha256(JSON.stringify(packet));
  run.graph!.retrieval = [{ hits: [{ chunk: { id, text: body, hash: sha256(body) }, document: { kind: "patient_summary", scope: "Contract test", publicationDate: null } }] }] as NonNullable<DispositionRun["graph"]>["retrieval"];
  // The old review's source remains retained, although not in final guidance.
  assert.deepEqual(run.guidance, []);
  run.graph!.preservedCare = { ...run.graph!.preservedCare!, judgeHash: sha256(JSON.stringify(judge)) };
  const raw = structuredClone(judge); raw.criteria.find(c => c.id === "claim_support")!.anchors[0].unit = `source:${"b".repeat(58)}`;
  const steps = buildJudgeSourceAnchorRepairAuditSteps(raw, judge, packet);
  let state = steps.next(); while (!state.done) state = steps.next(sha256(state.value));
  assert.ok(state.value); critic.rawOutput = raw; critic.judgeSourceRepair = state.value;
  assert.equal(await verifyPreservedCare(run, message), true);
  for (const mutate of [
    (copy: DispositionRun) => { delete copy.agents!.at(-1)!.judgeSourceRepair; },
    (copy: DispositionRun) => { copy.agents!.at(-1)!.judgeSourceRepair!.packetHash = "0".repeat(64); },
    (copy: DispositionRun) => { copy.graph!.retrieval[0].hits[0].chunk.text += " Altered later evidence."; },
    (copy: DispositionRun) => { copy.agents!.at(-1)!.judgeSourceRepair!.packet.units[0].text += " Another patient."; },
    (copy: DispositionRun) => { copy.responseEvents!.push({ kind: "action", notice: { disposition: "EMERGENCY_NOW", directive: "A different issued instruction requiring a new review.", source: "emergency_agent" } }); },
  ]) {
    const copy = structuredClone(run); mutate(copy);
    assert.equal(await verifyPreservedCare(copy, message), false);
  }
});

test("historical v1 actual-change repair remains verifiable without a no-op audit", async () => {
  const { run, message } = preservedFixture();
  (run.agents![1].output as { edits: Edit[] }).edits.pop();
  run.graph!.repair!.protocol = "field-local-repair/v1";
  delete run.graph!.repair!.noopFields;
  assert.equal(await verifyPreservedCare(run, message), true);
});

test("browser correction cannot reduce a continue-EMS instruction without corrected/misattributed trigger evidence", async () => {
  const { run, message } = preservedFixture(true);
  assert.equal(await verifyPreservedCare(run, message), false);
  // The explicit correction bit is not ignored. Clinical proof remains the
  // independent review's responsibility; this verifies only admission/binding.
  const judge = run.graph!.judge!;
  judge.earlyCorrection!.triggerMisattributedOrCorrected = true;
  run.graph!.preservedCare = { ...run.graph!.preservedCare!, judgeHash: sha256(JSON.stringify(judge)) };
  assert.equal(await verifyPreservedCare(run, message), true);
});
