import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDispositionRuntime } from "../src/disposition/runtime.ts";
import { adaptiveOutputSchema, adaptiveTransportSchema, referencedAnswerSchema, planSchema, planTransportSchema, validEmergencyEnvelope, validSameDayEnvelope, supportChecks, validPlan, abortable, type ClinicalPlan } from "../src/disposition/adaptive.ts";
import { patientFragments, sourceFragments, referencedPlanSchema, resolveReferencedPlan, resolveReferencedAnswer } from "../src/disposition/plan-references.ts";
import { assembleCareAction, exactSourceSubstring } from "../src/disposition/answer-assembly.ts";
import { validClarification, checkAnswer, hasImmediateEmsDirective, adaptiveAnswerSchema, type DispositionAnswer, type ResponseEvent, type WorkflowProfile } from "../src/disposition/contract.ts";
import { digest, SEARCH_VERSION, type EvidenceSearch } from "../src/evidence/search.ts";
import { readDispositionStream } from "../apps/evaluation/lib/disposition-stream.ts";
import { appendPatientUpdate } from "../apps/evaluation/lib/latest-assessment.ts";
import type { Generator } from "../src/disposition/workflow.ts";
import { Agent } from "@mastra/core/agent";
import { consumeStructuredStream } from "../src/disposition/transport.ts";
import { reserveInteractiveRun } from "../src/disposition/opus-budget.ts";
import { compactAnswerSchema, expandCompactAnswer } from "../src/disposition/adaptive.ts";

const message = "My nose has been running for two days. No fever.";
const question = { question: "Did this start after recent head, nose or sinus surgery or injury?", why: "Recent relevant surgery or injury could change home care to prompt in-person assessment.", quote: "nose has been running", routingConsequence: { alternatives: [{ answer: "No surgery or injury", route: "SELF_CARE" as const }, { answer: "New drainage after skull-base surgery", route: "SAME_DAY_IN_PERSON" as const }] } };
const plan: ClinicalPlan = { emergency: false, emergencyDestination: null, emergencyQuote: "", findings: [{ finding: "Fever", status: "denied", quotes: ["No fever"] }], clarification: question, queries: ["nasal discharge after surgery"] };
const answer: DispositionAnswer = { disposition: "SELF_CARE", patientMessage: "Rest and fluids may help. Seek care if symptoms worsen or you develop difficulty breathing.", reason: "The reported mild symptoms could be a viral respiratory infection.", differential: [], redFlags: [], vitalSigns: "Vital measurements are not provided.", questions: [], evidence: [], evidenceLimitations: "No applicable supporting passage was retrieved." };
test("compact citation transport expands without inventing evidence or losing patient provenance", () => {
  const { evidence: _evidence, questions: _questions, ...compact } = answer;
  const raw = { decision: "final", clarification: null, clarificationAssessment: { decision: "not_needed", reason: "No question changes routing in this fixture." }, answer: { ...compact, reviewPriority: null, workType: null, redFlags: [{ concern: "Fever", status: "denied", source: 1 }] }, citations: [{ sourceId: 0, passages: [0], claim: "The passage describes respiratory symptoms.", applicability: "uncertain", explanation: "This passage alone cannot establish clinical severity." }] };
  assert.equal(compactAnswerSchema.safeParse(raw).success, true);
  const sources = [{ id: "run-local-source", text: "The passage describes respiratory symptoms." }] as Parameters<typeof resolveReferencedAnswer>[2];
  const result = adaptiveOutputSchema.parse(resolveReferencedAnswer(expandCompactAnswer(raw), message, sources));
  assert.equal(result.answer.evidence[0].sourceId, "run-local-source");
  assert.equal(result.support[0].quote, sources![0].text);
  assert.equal(result.answer.redFlags[0].quote, "No fever.");
  assert.deepEqual(result.answer.questions, []); assert.ok("citations" in raw);
  for (const sourceId of [-1, 99, "0", null]) {
    const invalid = { ...raw, citations: [{...raw.citations[0],sourceId}] };
    assert.equal(adaptiveOutputSchema.safeParse(resolveReferencedAnswer(expandCompactAnswer(invalid), message, sources)).success, false);
  }
  const noEvidence = adaptiveOutputSchema.parse(resolveReferencedAnswer(expandCompactAnswer({...raw,citations:[]}),message,[]));
  assert.deepEqual(noEvidence.answer.evidence, []); assert.deepEqual(noEvidence.support, []);
});
test("manual GUI recovers one transport error, retains every attempt and preserves emergency action", async () => {
  let finals = 0;
  const app = createDispositionRuntime(mkdtempSync(join(tmpdir(),"recovery-gui-")), async (_,__,role) => {
    if (role === "intake") return { answer: {...plan, emergency: true, emergencyQuote: "crushing chest pain", emergencyDestination: "EMS_NOW", clarification: null}, usage:{inputTokens:1,outputTokens:1} };
    if (++finals === 1) throw new Error("transient transport failure");
    return { answer: { ...final(), answer: { ...answer, disposition: "EMERGENCY_NOW", patientMessage: "Call 911 now. Do not drive yourself.", reason:"Reported crushing chest pain requires emergency assessment.", evidence:[] } }, usage:{inputTokens:2,outputTokens:2} };
  }, {profile:"adaptive-opus",budget:"manual-gui",search:empty});
  try {
    const r = await app.assess("I have crushing chest pain.");
    assert.equal(finals,2); assert.equal(r.modelCalls,3); assert.equal(r.agents!.length,3);
    assert.equal(r.agents![1].failure,"MODEL_OR_SCHEMA_FAILURE");
    assert.equal(r.safetyFloor?.disposition,"EMERGENCY_NOW");
    assert.ok(r.responseEvents?.some(e=>e.kind === "action"));
    assert.equal(r.usage.outputTokens,null); // unknown failed-call billing is not zero
    assert.equal(r.generation?.recovery?.maxAttempts,2);
  } finally { await app.mastra.shutdown(); }
});
test("live citation grammar is request-independent; integer references resolve on both sides of the join", () => {
  const schema = referencedAnswerSchema;
  const citation = schema.shape.answer.shape.evidence.element;
  assert.equal(citation.safeParse({ sourceId: "medleplus-placeholder", claim: "placeholder" }).success, false);
  assert.equal(citation.safeParse({ sourceId: 0, claim: "The retrieved passage describes symptoms." }).success, true);
  const support = schema.shape.support.element;
  assert.equal(support.safeParse({ sourceId: "invented", passage: 0, applicability: "applicable", explanation: "Fixture support explanation." }).success, false);
  assert.equal(support.safeParse({ sourceId: 1, passage: 0, applicability: "applicable", explanation: "Fixture support explanation." }).success, true);
  const wire = JSON.stringify(schema.toJSONSchema());
  assert.doesNotMatch(wire, /medlineplus-known|pubmed-known/);
  const raw = { ...final(), answer: { ...answer, evidence: [{ sourceId: 0, claim: "The retrieved passage describes symptoms." }] }, support: [{ sourceId: 0, passage: 0, applicability: "applicable", explanation: "Fixture support explanation." }] };
  for (const id of ["medlineplus-known", "different-run-source"]) {
    const sources = [{ id, text: "The retrieved passage describes symptoms." }] as Parameters<typeof resolveReferencedAnswer>[2];
    const decoded = adaptiveOutputSchema.parse(resolveReferencedAnswer(raw, message, sources));
    assert.equal(decoded.answer.evidence[0].sourceId, id);
    assert.equal(decoded.support[0].sourceId, id);
    assert.equal(raw.support[0].sourceId, 0);
    for (const invalid of [-1, 1, 0.5, "0", "medlineplus-known", null]) {
      const bad = { ...raw, answer: { ...raw.answer, evidence: [{ ...raw.answer.evidence[0], sourceId: invalid }] } };
      assert.equal(adaptiveOutputSchema.safeParse(resolveReferencedAnswer(bad, message, sources)).success, false);
      assert.equal(adaptiveOutputSchema.safeParse(resolveReferencedAnswer({ ...raw, support: [{ ...raw.support[0], sourceId: invalid }] }, message, sources)).success, false);
    }
  }
  assert.equal(adaptiveOutputSchema.safeParse(resolveReferencedAnswer(raw, message, [])).success, false);
  assert.equal(JSON.stringify(schema.toJSONSchema()), wire);
});
test("final patient findings resolve exact references without copying or mutating raw provider output", () => {
  const message = "My foot is red. It is tender. No fever.";
  const raw = { decision: "final", clarification: null, answer: { ...answer, redFlags: [{ concern: "Tenderness", status: "reported", source: 1 }, { concern: "Fever", status: "denied", source: 2 }, { concern: "Measured temperature", status: "unknown", source: null }] }, support: [] };
  const decoded = adaptiveOutputSchema.parse(resolveReferencedAnswer(raw, message));
  assert.equal(decoded.answer.redFlags[0].quote, "It is tender.");
  assert.equal(decoded.answer.redFlags[1].quote, "No fever.");
  assert.equal(checkAnswer(decoded.answer, message, [], null).find((c) => c.id === "quoted_patient_evidence")?.status, "pass");
  assert.equal(raw.answer.redFlags[0].source, 1); assert.equal("quote" in raw.answer.redFlags[0], false);
  for (const source of [-1, 99, null]) {
    const invalid = structuredClone(raw); invalid.answer.redFlags[0].source = source;
    const resolved = adaptiveOutputSchema.parse(resolveReferencedAnswer(invalid, message));
    assert.equal(checkAnswer(resolved.answer, message, [], null).find((c) => c.id === "quoted_patient_evidence")?.status, "fail");
  }
  const wrongUnknown = structuredClone(raw); wrongUnknown.answer.redFlags[2].source = 99;
  assert.equal(checkAnswer(adaptiveOutputSchema.parse(resolveReferencedAnswer(wrongUnknown, message)).answer, message, [], null).find((c) => c.id === "quoted_patient_evidence")?.status, "fail");
});

test("an explicitly unknown history can cite the patient without becoming a denial or a schema failure", () => {
  const message = "I do not know of any infection in my partner.";
  const raw = {...final(),answer:{...answer,redFlags:[{concern:"Partner infection",status:"unknown",source:0}]}};
  const decoded = adaptiveOutputSchema.parse(resolveReferencedAnswer(raw,message));
  assert.equal(decoded.answer.redFlags[0].status,"unknown"); assert.equal(decoded.answer.redFlags[0].quote,message);
  assert.equal(checkAnswer(decoded.answer,message,[],null).find(c=>c.id==="quoted_patient_evidence")?.status,"pass");
  for (const source of [99,-1,"0",0.5]) {
    const invalid = adaptiveOutputSchema.parse(resolveReferencedAnswer({...raw,answer:{...raw.answer,redFlags:[{...raw.answer.redFlags[0],source}]}},message));
    assert.equal(checkAnswer(invalid.answer,message,[],null).find(c=>c.id==="quoted_patient_evidence")?.status,"fail");
  }
});
test("assembled overlong clinical text is rejected by the browser contract, never truncated", () => {
  const raw = { ...answer, disposition: "ASYNC_PHYSICIAN" as const, patientMessage: "x".repeat(1600) };
  assert.equal(adaptiveAnswerSchema.safeParse(raw).success, true);
  const rendered = assembleCareAction(raw, null);
  assert.equal(adaptiveAnswerSchema.safeParse(rendered).success, false);
  assert.ok(rendered.patientMessage.endsWith(raw.patientMessage));
});
test("source references resolve original passages; invented indices and copied ellipses fail closed", () => {
  const text = "This is the first exact source sentence. " + "Further exact source context. ".repeat(50);
  const fragments = sourceFragments(text);
  assert.ok(fragments.length > 1);
  for (const f of fragments) { assert.ok(text.includes(f.text)); assert.ok(f.text.length <= 600); }
  const sources = [{ id: "source-a", text }] as NonNullable<Parameters<typeof resolveReferencedAnswer>[2]>;
  const raw = { ...final(), support: [{ sourceId: 0, passage: 1, applicability: "applicable", explanation: "Test support with actual source reference." }] };
  const decoded = adaptiveOutputSchema.parse(resolveReferencedAnswer(raw, message, sources));
  assert.equal(decoded.support[0].quote, fragments[1].text);
  assert.equal("quote" in raw.support[0], false);
  for (const passage of [-1, 999, null, "1"]) {
    const invalid = { ...raw, support: [{ ...raw.support[0], passage }] };
    assert.equal(adaptiveOutputSchema.safeParse(resolveReferencedAnswer(invalid, message, sources)).success, false);
  }
  assert.equal(adaptiveOutputSchema.safeParse(resolveReferencedAnswer({ ...raw, support: [{ sourceId: "source-a", quote: "First ... last", applicability: "applicable", explanation: "Invented copied source excerpt." }] }, message, sources)).success, false);
});
const final = (a = answer) => ({ decision: "final" as const, clarification: null, answer: a, support: [] });
const output = (answer: unknown) => ({ answer, usage: { inputTokens: 100, outputTokens: 100 } });
const empty: EvidenceSearch = async () => ({ version: SEARCH_VERSION, corpusHash: digest([]), passages: [], audit: [] });
const runtime = (generate: Generator, profile: WorkflowProfile = "adaptive-opus", search: EvidenceSearch = empty) => createDispositionRuntime(mkdtempSync(join(tmpdir(), "adaptive-test-")), generate, { profile, search, budget: "compact" });

test("manual GUI remains usable after old allocation exhaustion without reopening experiments", async () => {
  const directory = mkdtempSync(join(tmpdir(), "manual-gui-test-"));
  const ledger = join(directory, "interactive-budget-v1");
  for (let i = 0; i < 12; i++) reserveInteractiveRun(ledger);
  const before = readdirSync(ledger).map((name) => [name, readFileSync(join(ledger, name), "utf8")]);
  let calls = 0;
  const generate: Generator = async (_p, _c, role) => { calls++; return output(role === "intake" ? { ...plan, clarification: null } : final()); };
  // A new runtime (including server restart) must neither reset old slots nor
  // misrepresent their exhaustion as an external provider-credit problem.
  for (let i = 0; i < 2; i++) {
    const app = createDispositionRuntime(directory, generate, { profile: "adaptive-opus", budget: "manual-gui", search: empty });
    try {
      const run = await app.assess(message);
      assert.equal(run.status, "complete"); assert.equal(run.modelCalls, 2);
      assert.equal(run.spendPolicy, "manual-gui-v1");
      const start = JSON.parse(readFileSync(join(directory, "events", `${run.runId}.jsonl`), "utf8").split("\n")[0]);
      assert.equal(start.spendPolicy, run.spendPolicy);
      assert.equal(JSON.parse(readFileSync(join(directory, "runs", `${run.runId}.json`), "utf8")).spendPolicy, run.spendPolicy);
    } finally { await app.mastra.shutdown(); }
  }
  const experiment = createDispositionRuntime(directory, generate, { profile: "adaptive-opus", search: empty });
  try {
    const run = await experiment.assess(message);
    assert.equal(run.failure, "MODEL_BUDGET_EXHAUSTED"); assert.equal(run.modelCalls, 0);
    assert.equal(run.spendPolicy, "reserved-experiment");
  } finally { await experiment.mastra.shutdown(); }
  assert.equal(calls, 4);
  assert.deepEqual(readdirSync(ledger).map((name) => [name, readFileSync(join(ledger, name), "utf8")]), before);
  assert.throws(() => createDispositionRuntime(directory, generate, { profile: "adaptive-critique", budget: "manual-gui" }), /MANUAL_GUI_PROFILE_INVALID/);
});

test("dynamic history has quote/unknown/contradiction contracts, not a fixed symptom catalog", () => {
  assert.equal(validPlan(plan,message), true);
  assert.equal(validPlan({ ...plan, findings: [{ finding: "Fever", status: "unknown", quotes: ["No fever"] }] }, message), false);
  assert.equal(validPlan({ ...plan, findings: [{ finding: "Fever", status: "contradictory", quotes: ["No fever"] }] }, message), false);
  assert.equal(validClarification({ ...question, quote: "brain surgery" }, message), false);
  assert.equal(validClarification({ ...question, question: "Can you probe your nose?" }, message), false);
});

test("live intake uses original patient fragment references with a stable grammar and required research", () => {
  const m = "I have diabetes. My foot wound is red and swollen. No fever.";
  const raw = { emergency: false, emergencySource: null, emergencyDestination: null, sameDaySource: 1, sameDayNeed: "physical_exam_or_treatment", sameDayRationale: "The inflamed diabetic foot wound needs examination for depth and perfusion today.", prescriptionReviewSource: null, clarification: null, queries: ["diabetic foot infection"] };
  assert.equal(referencedPlanSchema.safeParse(raw).success, true);
  assert.equal(referencedPlanSchema.safeParse({ ...raw, queries: [] }).success, false);
  const resolved = planSchema.parse(resolveReferencedPlan(raw, m));
  assert.equal(resolved.sameDayQuote, "My foot wound is red and swollen.");
  assert.equal(validPlan(resolved, m), true);
  assert.equal(raw.sameDaySource, 1); assert.equal("sameDayQuote" in raw, false);
  for (const bad of [-1, 1.5, 999, "1"]) {
    assert.equal(planSchema.safeParse(resolveReferencedPlan({ ...raw, sameDaySource: bad }, m)).success, false);
  }
  const denied = "I do not have chest pain.";
  assert.equal(validEmergencyEnvelope(resolveReferencedPlan({ ...raw, emergency: true, emergencySource: 0, emergencyDestination: "EMS_NOW", sameDaySource: null }, denied), denied), false);
  for (const text of ["Everyone would be better off without me.", "The severe headache began without warning.", "I am struggling to breathe without help."]) assert.equal(validEmergencyEnvelope({ emergency: true, emergencyDestination: "ED_NOW", emergencyQuote: text }, text), true, text);
  assert.equal(validEmergencyEnvelope({ emergency: true, emergencyDestination: "ED_NOW", emergencyQuote: "without chest pain." }, "I am without chest pain."), false);
  for (const fragment of patientFragments("No symptoms. " + "long patient statement ".repeat(40))) {
    assert.ok(fragment.text.length <= 160); assert.ok(("No symptoms. " + "long patient statement ".repeat(40)).includes(fragment.text));
  }
  const q = resolveReferencedPlan({ ...raw, sameDaySource: null, clarification: { question: "Was there a recent injury?", why: "This could change the required care setting.", source: 1 } }, m);
  assert.equal(validClarification(planSchema.parse(q).clarification!, m), true);
});

test("a prescribing review or unknown history cannot create an irreversible same-day floor", async () => {
  const m = "My usual migraine is unchanged. I'm out of sumatriptan and would like a refill.";
  const raw = { emergency: false, emergencySource: null, emergencyDestination: null, sameDaySource: 1, sameDayNeed: "prescribing_review", sameDayRationale: "Contraindications and medication history need review.", prescriptionReviewSource: 1, clarification: null, queries: ["migraine"] };
  for (const sameDayNeed of ["prescribing_review", "missing_information", null, undefined]) {
    const decoded = resolveReferencedPlan({ ...raw, sameDayNeed }, m);
    assert.equal(validSameDayEnvelope(decoded, m), false);
  }
  assert.equal(validSameDayEnvelope(resolveReferencedPlan({ ...raw, sameDayNeed: "physical_exam_or_treatment", sameDayRationale: null }, m), m), false);
  const app = runtime(async (prompt, _c, role) => {
    if (role === "intake") return output(resolveReferencedPlan(raw, m));
    assert.equal("emergencyFloor" in JSON.parse(prompt), false);
    return output(final({ ...answer, disposition: "ASYNC_PHYSICIAN", patientMessage: "Contact your prescriber today for an asynchronous review of the refill request." }));
  });
  const events: ResponseEvent[] = [];
  try {
    const run = await app.assess(m, undefined, e => events.push(e));
    assert.equal(run.status, "complete"); assert.equal(run.answer?.disposition, "ASYNC_PHYSICIAN");
    assert.equal(events.some(e => e.kind === "action"), false);
    assert.equal(run.agents?.[0].failure, "PLAN_CONTRACT_FAILED");
    assert.equal(run.modelCalls, 2);
  } finally { await app.mastra.shutdown(); }
});

test("prescription acknowledgment precedes research without becoming a care floor or a completed answer", async () => {
  const m = "Please refill my established migraine medication.";
  const events: ResponseEvent[] = [];
  const p = { ...plan, findings: [], clarification: null, prescriptionReviewQuote: m };
  const app = runtime(async (_p, _c, role) => output(role === "intake" ? p : { broken: true }), "adaptive-opus", async () => {
    assert.equal(events[0]?.kind, "opening");
    return empty([], new AbortController().signal);
  });
  try {
    const run = await app.assess(m, undefined, e => events.push(e));
    assert.equal(run.status, "unavailable"); assert.equal(run.safetyFloor, null);
    assert.equal(run.answer, null); assert.equal(run.modelCalls, 2);
    assert.ok(run.firstOpeningMs !== null);
    assert.equal(events.some(e => e.kind === "patient_reply" || e.kind === "action"), false);
    assert.match(events[0]?.kind === "opening" ? events[0].text : "", /assessment is not complete/);
    assert.equal(validPlan({ ...p, prescriptionReviewQuote: "Invented medication request." }, m), false);
  } finally { await app.mastra.shutdown(); }
});

test("prescription acknowledgment cannot supersede emergency action", async () => {
  const m = "Crushing chest pressure radiating to my left arm. Please refill my medication.";
  const app = runtime(async (_p, _c, role) => output(role === "intake" ? { ...plan, findings: [], clarification: null, prescriptionReviewQuote: "Please refill my medication." } : { broken: true }));
  try {
    const run = await app.assess(m);
    assert.equal(run.safetyFloor?.disposition, "EMERGENCY_NOW");
    assert.equal(run.responseEvents?.some(e => e.kind === "opening"), false);
  } finally { await app.mastra.shutdown(); }
});

test("no citations means source identity is unassessed, never a vacuous pass", async () => {
  const evidence = await empty([], new AbortController().signal);
  assert.equal(supportChecks(final(), evidence)[0].status, "not_assessed");
  assert.equal(supportChecks({ ...final(), support: [{ sourceId: "invented", quote: "A fabricated quote.", applicability: "applicable", explanation: "Fabricated support with no matching claim." }] }, evidence)[0].status, "fail");
});

test("action assembly renders the chosen route without claiming completed care", () => {
  const raw = { ...answer, disposition: "ASYNC_PHYSICIAN" as const, patientMessage: "A prescriber must review this refill request." };
  const rendered = assembleCareAction(raw, null);
  assert.match(rendered.patientMessage, /^Counsel clinician review in this thread is recommended/);
  assert.equal(raw.patientMessage, "A prescriber must review this refill request.");
  assert.deepEqual(assembleCareAction(rendered, null), rendered);
  assert.match(assembleCareAction({ ...raw, disposition: "EMERGENCY_NOW" }, "Call 911 now. Do not drive yourself.").patientMessage, /^Call 911 now/);
  assert.match(assembleCareAction({ ...raw, disposition: "SAME_DAY_IN_PERSON" }, null).patientMessage, /^Arrange an in-person assessment today/);
  assert.equal(assembleCareAction(answer, null), answer);
});

test("source whitespace correction returns original text without changing meaning-bearing characters", () => {
  const source = "Seek care now. Higher than 180andHigher than 120. Do not wait.";
  assert.equal(exactSourceSubstring(source, "Higher than 180 andHigher than 120"), "Higher than 180andHigher than 120");
  assert.equal(exactSourceSubstring(source, "Higher than 180 orHigher than 120"), null);
  assert.equal(exactSourceSubstring(source, "Higher than 180andHigher than 110"), null);
  assert.equal(exactSourceSubstring(source, "Seek care later."), null);
  assert.equal(exactSourceSubstring(source, "          "), null);
  assert.equal(exactSourceSubstring(source, "Do not wait."), "Do not wait.");
});

test("emergency rendering does not invent conditional transport advice before an explicit model action", () => {
  for (const text of ["Call 911 or get to an emergency department now. Do not drive yourself or wait.", "Call 911 or go to the nearest emergency department now. Do not drive yourself."]) {
    const raw = { ...answer, disposition: "EMERGENCY_NOW" as const, patientMessage: text };
    assert.equal(assembleCareAction(raw, null).patientMessage, text);
    assert.doesNotMatch(assembleCareAction(raw, null).patientMessage, /if travel is unsafe/);
    // Preserving text does not falsely classify the alternative as unconditional EMS.
    assert.equal(hasImmediateEmsDirective(text), false);
  }
});

test("a faulty clarification does not discard independently valid research queries", async () => {
  let searched = false;
  const app = runtime(async (_p, _c, role) => output(role === "intake" ? { ...plan, clarification: { ...question, quote: "made up evidence" } } : final()), "adaptive-opus", async (queries, signal) => { searched = true; assert.deepEqual(queries, plan.queries); return empty(queries, signal); });
  try { const run = await app.assess(message); assert.equal(searched, true); assert.equal(run.adaptive?.plan, null); assert.equal(run.agents?.[0].failure, "PLAN_CONTRACT_FAILED"); }
  finally { await app.mastra.shutdown(); }
});

test("a long evidence-limitations paragraph is preserved with a presentation warning, not a lost assessment", async () => {
  const long = "These abstracts do not establish the individual care-setting recommendation. ".repeat(9);
  assert.ok(long.length > 500);
  const app = runtime(async (_p, _c, role) => output(role === "intake" ? { ...plan, clarification: null } : final({ ...answer, evidenceLimitations: long })));
  try {
    const run = await app.assess(message);
    assert.equal(run.status, "complete"); assert.equal(run.answer?.evidenceLimitations, long);
    assert.equal(run.checks.find((c) => c.id === "response_concision")?.status, "fail");
    assert.equal(run.checks.find((c) => c.id === "research_support")?.status, "fail");
    assert.equal(run.modelCalls, 2);
  } finally { await app.mastra.shutdown(); }
  assert.equal(adaptiveOutputSchema.safeParse(final({ ...answer, evidenceLimitations: "x".repeat(4001) })).success, false);
  assert.equal(adaptiveOutputSchema.safeParse(final({ ...answer, evidenceLimitations: 123 } as unknown as DispositionAnswer)).success, false);
});

test("a presentation warning cannot bypass unsupported clinical reassurance", async () => {
  const app = runtime(async (_p, _c, role) => output(role === "intake" ? { ...plan, clarification: null } : final({ ...answer, reason: "There are no red flags, so home care is safe.", evidenceLimitations: "Missing applicable evidence. ".repeat(24) })));
  try {
    const run = await app.assess(message);
    assert.equal(run.failure, "ANSWER_CONTRACT_FAILED"); assert.equal(run.answer, null);
    assert.equal(run.checks.find((c) => c.id === "no_blanket_clearance")?.status, "fail");
    assert.equal(run.checks.find((c) => c.id === "response_concision")?.status, "fail");
  } finally { await app.mastra.shutdown(); }
});

test("fast intake omits the duplicate findings inventory and emits quoted same-day care before research", async () => {
  assert.equal(Object.hasOwn(planTransportSchema.toJSONSchema().properties!, "findings"), false);
  const m = "I have diabetes and my foot wound is red and swollen.";
  const fast = { emergency: false, emergencyQuote: "", emergencyDestination: null, sameDayQuote: "my foot wound is red and swollen", clarification: null, queries: ["diabetic foot infection"] };
  assert.equal(validSameDayEnvelope(fast, m), true);
  assert.equal(validSameDayEnvelope({ ...fast, sameDayQuote: "made-up swelling" }, m), false);
  assert.equal(validSameDayEnvelope({ ...fast, sameDayQuote: "foot wound" }, "I do not have a foot wound."), false);
  assert.deepEqual(planSchema.parse(fast).findings, []);
  const events: ResponseEvent[] = [];
  const app = runtime(async (_p, _c, role) => output(role === "intake" ? fast : { broken: true }), "adaptive-opus", async () => { assert.equal(events[0]?.kind, "action"); return empty([], new AbortController().signal); });
  try {
    const run = await app.assess(m, undefined, (e) => events.push(e));
    assert.equal(run.safetyFloor?.disposition, "SAME_DAY_IN_PERSON");
    assert.equal(run.status, "review_required"); assert.equal(run.modelCalls, 2);
    assert.equal(events.some((e) => e.kind === "patient_reply"), false);
  } finally { await app.mastra.shutdown(); }
});

test("an unnecessary follow-up cannot erase research after a valid same-day instruction", async () => {
  const m = "I have diabetes and my foot wound is red and swollen.";
  const raw = { emergency: false, emergencyQuote: "", emergencyDestination: null, sameDayQuote: "my foot wound is red and swollen", findings: [], clarification: { question: "Is there drainage?", quote: "foot wound", why: "Drainage could change the urgency of the examination." }, queries: ["diabetic foot infection"] };
  let searched = false;
  const app = runtime(async (_p, _c, role) => output(role === "intake" ? raw : final({ ...answer, disposition: "SAME_DAY_IN_PERSON", patientMessage: "Please arrange an in-person examination today." })), "adaptive-opus", async (queries, signal) => { assert.deepEqual(queries, raw.queries); searched = true; return empty(queries, signal); });
  try {
    const run = await app.assess(m);
    assert.equal(searched, true); assert.equal(run.status, "complete");
    assert.equal(run.adaptive?.plan?.clarification, null);
    assert.deepEqual(run.agents?.[0].output, raw);
    assert.equal(run.responseEvents?.some(e => e.kind === "intake_question"), false);
  } finally { await app.mastra.shutdown(); }
});

test("fast same-day output cannot downgrade an already-issued emergency", async () => {
  const m = "Crushing chest pressure radiating to my left arm, sweaty and nauseous.";
  const app = runtime(async (_p, _c, role) => output(role === "intake" ? { ...plan, sameDayQuote: "Crushing chest pressure", clarification: null } : { broken: true }));
  try {
    const run = await app.assess(m);
    assert.equal(run.safetyFloor?.disposition, "EMERGENCY_NOW");
    assert.ok(run.responseEvents?.filter((e) => e.kind === "action").every((e) => e.notice.disposition === "EMERGENCY_NOW"));
  } finally { await app.mastra.shutdown(); }
});
test("unanswered decision-changing history withholds settled self-care; persisted and streamed as awaiting_input", async () => {
  const app = runtime(async (_p,_c,role) => output(role === "intake" ? plan : final()));
  try {
    const run = await app.assess(message);
    assert.equal(run.status, "awaiting_input"); assert.equal(run.answer, null); assert.equal(run.clarification?.question, question.question);
    assert.equal(run.modelCalls, 2); assert.equal(run.artifactPersisted, true); assert.equal(run.tracePersisted, true);
    assert.equal(run.responseEvents?.some((e) => e.kind === "patient_reply"), false);
    const lines = [...run.responseEvents!.map((event) => ({ type: "response_event", event })), { type: "result", result: run }];
    const stream = new Response(lines.map((e) => JSON.stringify(e)+"\n").join(""), { headers: { "content-type": "application/x-ndjson" } });
    assert.equal((await readDispositionStream(stream, message, () => {})).status, "awaiting_input");
  } finally { await app.mastra.shutdown(); }
});
test("patient answer preserves question context and can resolve the pending decision", async () => {
  const update = appendPatientUpdate(message, "No recent surgery or injury to my head or nose.");
  assert.doesNotMatch(update, /Assistant question/);
  const app = runtime(async (p,_c,role) => { assert.ok(p.includes("No recent surgery or injury")); return output(role === "intake" ? { ...plan, clarification: null } : final()); });
  try {
    const run = await app.assess(update); assert.equal(run.status, "complete"); assert.deepEqual(run.answer?.differential, []);
    const lines = [...run.responseEvents!.map((event) => ({ type: "response_event", event })), { type: "result", result: run }];
    assert.equal((await readDispositionStream(new Response(lines.map((e) => JSON.stringify(e)+"\n").join(""), { headers: { "content-type": "application/x-ndjson" } }), update, () => {})).status, "complete");
  } finally { await app.mastra.shutdown(); }
});
test("localization-only intake cannot block C13 async routing", async () => {
  const text = "55M. My right hand has been numb and tingly for a few days, worse at night. No weakness anywhere, no face drooping, my speech is normal.";
  const q = { question: "Which fingers are affected, or is it your entire hand?", why: "Finger distribution may help localize a peripheral nerve problem during review.", quote: "right hand has been numb and tingly", routingConsequence: null };
  const a = { ...answer, disposition: "ASYNC_PHYSICIAN" as const, reviewPriority: "routine" as const, workType: "clinical_review" as const, patientMessage: "Standard async review by the Counsel clinician has a same-day service-hours target; no clinician has accepted. Sudden weakness or speech problems need emergency care." };
  const app = runtime(async (_p,_c,role) => output(role === "intake" ? { ...plan, findings: [], clarification: q } : { ...final(a), clarificationAssessment: { decision: "collect_during_review", reason: "Localization can be clarified during clinician assessment without withholding the route." } }));
  try { const result = await app.assess(text); assert.equal(result.status, "complete"); assert.equal(result.answer?.reviewPriority, "routine"); assert.equal(result.responseEvents?.find(e => e.kind === "intake_question")?.decisionChanging, false); assert.ok(!result.checks.some(c => c.id === "unanswered_low_acuity_guard")); }
  finally { await app.mastra.shutdown(); }
});
test("unsupported hold fails instead of inventing a routing consequence or releasing a draft", async () => {
  for (const routingConsequence of [null, { ...question.routingConsequence, alternatives: [{ answer: "Thumb and index", route: "STANDARD_ASYNC" as const }, { answer: "Entire hand", route: "STANDARD_ASYNC" as const }] }]) {
    const q = { ...question, routingConsequence };
    const app = runtime(async (_p,_c,role) => output(role === "intake" ? { ...plan, clarification: q } : { ...final(), decision: "needs_information", clarification: q, clarificationAssessment: { decision: "block", reason: "Diagnostic relevance alone is not enough to justify this fixture hold." } }));
    try { const result = await app.assess(message); assert.equal(result.failure, "ANSWER_CONTRACT_FAILED"); assert.equal(result.answer, null); assert.equal(result.checks.find(c => c.id === "clarification_contract")?.status, "fail"); }
    finally { await app.mastra.shutdown(); }
  }
});
test("a justified hold persists counterfactual branches and interim safety instruction", async () => {
  const app = runtime(async (_p,_c,role) => output(role === "intake" ? plan : { ...final(), decision: "needs_information", clarification: question, clarificationAssessment: { decision: "block", reason: "Possible postoperative drainage needs resolution before choosing self care rather than in-person assessment." } }));
  try { const result = await app.assess(message); assert.equal(result.status, "awaiting_input"); assert.deepEqual(result.clarification?.routingConsequence, question.routingConsequence); assert.match(result.pendingInstruction!, /call 911 now/); assert.equal(result.answer, null); }
  finally { await app.mastra.shutdown(); }
});
test("already-needed same-day assessment is not delayed for an answer", async () => {
  const a = { ...answer, disposition: "SAME_DAY_IN_PERSON" as const, patientMessage: "Please arrange an in-person examination today. Do not wait for an asynchronous reply." };
  const app = runtime(async (_p,_c,role) => output(role === "intake" ? plan : final(a)));
  try { assert.equal((await app.assess(message)).status, "complete"); } finally { await app.mastra.shutdown(); }
});
test("emergency action precedes failed research and malformed Opus, is never withheld", async () => {
  const events: ResponseEvent[] = [];
  const app = runtime(async (_p,_c,role) => output(role === "intake" ? { ...plan, clarification: null, findings: [], queries: ["acute coronary syndrome"] } : { broken: true }), "adaptive-opus", async () => { assert.equal(events[0]?.kind, "action"); throw new Error("offline"); });
  try {
    const run = await app.assess("Crushing chest pressure radiating to my left arm, sweaty and nauseous.", undefined, (e) => events.push(e));
    assert.equal(run.safetyFloor?.disposition, "EMERGENCY_NOW"); assert.equal(run.status, "review_required"); assert.equal(run.modelCalls, 2);
    assert.match(run.safetyFloor!.directive, /Call 911 now/); assert.equal(run.adaptive?.evidence.audit[0].status, "failed");
  } finally { await app.mastra.shutdown(); }
});
test("ED-now instruction is not automatically rewritten as ambulance activation", async () => {
  const m = "I suddenly cannot pass any urine and have severe lower belly pain.";
  const p = { ...plan, emergency: true, emergencyDestination: "ED_NOW", emergencyQuote: "cannot pass any urine", findings: [], clarification: null };
  const a = { ...answer, disposition: "EMERGENCY_NOW" as const, patientMessage: "Go to the emergency department now for urgent assessment of your inability to pass urine." };
  const app = runtime(async (_p,_c,role) => output(role === "intake" ? p : final(a)));
  try { const run = await app.assess(m); assert.equal(run.status, "complete"); assert.doesNotMatch(run.safetyFloor!.directive, /^Call 911 now/); } finally { await app.mastra.shutdown(); }
});
test("hallucinated and inapplicable citation rejected even when URL exists", async () => {
  for (const support of [{ sourceId: "fake", quote: "No such source text exists", applicability: "applicable", explanation: "Claimed applicable to this patient." }, { sourceId: "fake", quote: "No such source text exists", applicability: "inapplicable", explanation: "Different population and setting." }]) {
    const app = runtime(async (_p,_c,role) => output(role === "intake" ? { ...plan, clarification: null } : { ...final({ ...answer, evidence: [{ sourceId: "fake", claim: "This guideline recommends home care." }] }), support: [support] }));
    try { const run = await app.assess(message); assert.equal(run.answer, null); assert.ok(run.checks.some((c) => c.id === "source_quote_identity" && c.status === "fail")); } finally { await app.mastra.shutdown(); }
  }
});
test("ablation arms execute only necessary calls; retrieval is absent from the no-retrieval arm", async () => {
  for (const [profile, expected] of [["base-opus", ["disposition"]], ["adaptive-no-retrieval", ["intake","disposition"]], ["adaptive-critique", ["intake","disposition","critic"]]] as const) {
    const roles: string[] = []; let searches = 0;
    const app = runtime(async (_p,_c,role) => { roles.push(role!); return output(role === "intake" ? { ...plan, clarification: null } : final()); }, profile, async (...args) => { searches++; return empty(...args); });
    try { const run = await app.assess(message); assert.equal(run.status, "complete"); assert.deepEqual(roles, expected); assert.equal(searches, profile === "adaptive-critique" ? 1 : 0); } finally { await app.mastra.shutdown(); }
  }
});
test("bounded cancellation resolves even an uncooperative model promise", async () => {
  await assert.rejects(abortable(new Promise(() => {}), AbortSignal.timeout(20)), { name: "TimeoutError" });
});
test("model schema forbids a second competing list of questions", () => {
  assert.equal(adaptiveOutputSchema.safeParse(final()).success, true);
  assert.equal(adaptiveOutputSchema.safeParse(final({ ...answer, questions: ["Another question?"] })).success, false);
});

test("a critic cannot downgrade the emergency action already emitted by the draft", async () => {
  const urgent = { ...answer, disposition: "EMERGENCY_NOW" as const, patientMessage: "Call 911 now. Do not drive yourself. Emergency assessment cannot wait for another message." };
  const app = runtime(async (_p,_c,role) => output(role === "intake" ? { ...plan, clarification: null } : final(role === "critic" ? answer : urgent)), "adaptive-critique");
  try {
    const run = await app.assess(message);
    assert.equal(run.status,"review_required"); assert.equal(run.answer,null);
    assert.match(run.safetyFloor!.directive,/Call 911 now/);
    assert.equal(run.responseEvents!.some((e) => e.kind === "patient_reply"),false);
  } finally { await app.mastra.shutdown(); }
});

test("failed intake cannot cancel the independent expert assessment or fabricate findings", async () => {
  const roles: string[] = [];
  const app = runtime(async (_p,_c,role) => { roles.push(role!); if (role === "intake") throw new Error("provider unavailable"); return output(final()); });
  try {
    const run = await app.assess(message);
    assert.deepEqual(roles,["intake","disposition"]); assert.equal(run.status,"complete");
    assert.equal(run.adaptive?.plan,null); assert.ok(run.agents![0].failure);
    assert.ok(run.checks.some((c) => c.id === "intake_availability" && c.status === "not_assessed"));
  } finally { await app.mastra.shutdown(); }
});

test("a valid emergency envelope survives malformed unrelated fields and prevents self-care", async () => {
  const m = "My throat is bleeding heavily after surgery.";
  for (const auxiliary of [{ queries: ["https://example.com"] }, { findings: "not an array" }, { clarification: { question: "broken" } }]) {
    const p = { ...plan, emergency: true, emergencyDestination: "EMS_NOW", emergencyQuote: "throat is bleeding heavily", clarification: null, ...auxiliary };
    assert.equal(planTransportSchema.safeParse(p).success, true);
    assert.equal(planSchema.safeParse(p).success, false);
    const app = runtime(async (_p,_c,role) => output(role === "intake" ? p : final()));
    try {
      const run = await app.assess(m);
      assert.equal(run.status, "review_required"); assert.equal(run.answer, null);
      assert.match(run.safetyFloor!.directive, /^Call 911 now/);
      assert.equal(run.responseEvents!.some((e) => e.kind === "patient_reply"), false);
      assert.equal(run.agents![0].failure, "PLAN_CONTRACT_FAILED");
    } finally { await app.mastra.shutdown(); }
  }
});

test("a quote cannot trim away an explicit denial in the containing clause", () => {
  const p = { emergency: true, emergencyDestination: "EMS_NOW", emergencyQuote: "crushing chest pain" };
  for (const m of ["I do not have crushing chest pain.", "I don't have crushing chest pain.", "I deny nothing but no crushing chest pain."]) assert.equal(validEmergencyEnvelope(p, m), false);
  assert.equal(validEmergencyEnvelope(p, "No fever, but I have crushing chest pain."), true);
  assert.equal(validEmergencyEnvelope(p, "Yesterday I said no crushing chest pain. Now I have crushing chest pain."), true);
  for (const quote of ["no longer able to speak", "No air is getting through my throat", "no urine is coming out"]) assert.equal(validEmergencyEnvelope({ ...p, emergencyQuote: quote }, `Today: ${quote}.`), true);
});

test("same-day care cannot be withheld by needs_information", async () => {
  const a = { ...answer, disposition: "SAME_DAY_IN_PERSON" as const, patientMessage: "Arrange an in-person examination today. Do not wait for a messaging reply." };
  const raw = { ...final(a), decision: "needs_information", clarification: question };
  const app = runtime(async (_p,_c,role) => output(role === "intake" ? { ...plan, clarification: null } : raw));
  try {
    const run = await app.assess(message);
    assert.equal(run.status, "complete"); assert.equal(run.answer?.disposition, "SAME_DAY_IN_PERSON");
    assert.equal(run.responseEvents!.some((e) => e.kind === "intake_question"), false);
    assert.equal((run.agents![1].output as typeof raw).decision, "needs_information");
    assert.ok(run.checks.some((c) => c.id === "in_person_care_not_held"));
  } finally { await app.mastra.shutdown(); }
});

test("an EMS determination upgrades an initial ED-only direction", async () => {
  const m = "I have sudden severe pain in my testicle and I feel faint.";
  const p = { ...plan, emergency: true, emergencyDestination: "EMS_NOW", emergencyQuote: "feel faint", findings: [], clarification: null };
  const a = { ...answer, disposition: "EMERGENCY_NOW" as const, patientMessage: "Go to the emergency department now for an examination." };
  const app = runtime(async (_p,_c,role) => output(role === "intake" ? p : final(a)));
  try {
    const run = await app.assess(m);
    assert.match(run.safetyFloor!.directive, /^Call 911 now/);
    assert.equal(run.status, "review_required");
    assert.ok(run.checks.some((c) => c.id === "issued_care_reconciliation" && c.status === "fail"));
  } finally { await app.mastra.shutdown(); }
});

test("malformed final metadata cannot erase the same-day or emergency action", async () => {
  for (const route of ["SAME_DAY_IN_PERSON", "EMERGENCY_NOW"] as const) {
    const app = runtime(async (_p,_c,role) => output(role === "intake" ? { ...plan, clarification: null } : { ...final({ ...answer, disposition: route }), support: "invalid metadata" }));
    try {
      const run = await app.assess(message);
      assert.equal(run.status, "review_required"); assert.equal(run.safetyFloor?.disposition, route);
      assert.equal(run.responseEvents!.some((e) => e.kind === "patient_reply"), false);
    } finally { await app.mastra.shutdown(); }
  }
});

test("citation-to-support mapping rejects orphaned excerpts even when array lengths match", async () => {
  const value = { ...final({ ...answer, evidence: [{ sourceId: "a", claim: "This is the first statement." }, { sourceId: "a", claim: "This is the second statement." }] }), support: [
    { sourceId: "a", quote: "Supporting passage text", applicability: "applicable" as const, explanation: "Reported population and setting." },
    { sourceId: "unused", quote: "Unused supporting text", applicability: "applicable" as const, explanation: "No corresponding cited entry." },
  ] };
  const evidence = { ...(await empty([], new AbortController().signal)), passages: [{ id: "a", text: "Supporting passage text", linkStatus: "reachable" }] };
  assert.equal(supportChecks(value, evidence as Parameters<typeof supportChecks>[1])[0].status, "fail");
});
test("one cited source can have multiple distinct exact supporting excerpts", async () => {
  const value = { ...final({ ...answer, evidence: [{ sourceId: "a", claim: "Symptoms and return precautions are described." }] }), support: [
    { sourceId: "a", quote: "Symptom description.", applicability: "applicable" as const, explanation: "First part of the same topic summary." },
    { sourceId: "a", quote: "Return precautions.", applicability: "applicable" as const, explanation: "Second part of the same topic summary." },
  ] };
  const evidence = { ...(await empty([], new AbortController().signal)), passages: [{ id: "a", text: "Symptom description. Return precautions.", linkStatus: "reachable" }] } as Parameters<typeof supportChecks>[1];
  assert.equal(supportChecks(value, evidence)[0].status, "pass");
  const twoClaims = { ...value, answer: { ...value.answer, evidence: [{ sourceId: "a", claim: "Symptoms are described." }, { sourceId: "a", claim: "Return precautions are described separately." }] } };
  assert.equal(supportChecks(twoClaims, evidence)[0].status, "pass");
  assert.equal(supportChecks({ ...value, answer: { ...value.answer, evidence: [value.answer.evidence[0], value.answer.evidence[0]] } }, evidence)[0].status, "fail");
  assert.match(supportChecks(value, evidence)[0].detail, /does not establish semantic support/);
  assert.equal(supportChecks({ ...value, support: [value.support[0], value.support[0]] }, evidence)[0].status, "fail");
  assert.equal(supportChecks({ ...value, support: [{ ...value.support[0], quote: "Invented evidence." }] }, evidence)[0].status, "fail");
  const withExclusion = { ...value, support: [...value.support, { sourceId: "excluded", quote: "Not for this population.", applicability: "uncertain" as const, explanation: "Reviewed but excluded from supporting evidence." }] };
  const moreEvidence = { ...evidence, passages: [...evidence.passages, { ...evidence.passages[0], id: "excluded", text: "Not for this population." }] };
  assert.equal(supportChecks(withExclusion, moreEvidence)[0].status, "pass");
  assert.equal(supportChecks({ ...withExclusion, answer: { ...value.answer, evidence: [] }, support: [withExclusion.support.at(-1)!] }, moreEvidence)[0].status, "not_assessed");
  assert.equal(supportChecks(withExclusion, evidence)[0].status, "fail", "Excluded sources must still be real, exact retrieved passages.");
  const uncertainCitation = { ...withExclusion, answer: { ...value.answer, evidence: [...value.answer.evidence, { sourceId: "excluded", claim: "Conditional warning with unknown patient applicability." }] } };
  assert.equal(supportChecks(uncertainCitation, moreEvidence)[0].status, "pass", "Exact quotation is separate from applicability.");
  assert.equal(supportChecks(uncertainCitation, moreEvidence).find((c) => c.id === "source_applicability")?.status, "not_assessed");
  const inapplicableCitation = { ...uncertainCitation, support: uncertainCitation.support.map((s) => s.sourceId === "excluded" ? { ...s, applicability: "inapplicable" as const } : s) };
  assert.equal(supportChecks(inapplicableCitation, moreEvidence).find((c) => c.id === "source_applicability")?.status, "fail");
});

test("search receives the workflow deadline and failures report observed elapsed time", async () => {
  let searchSignal: AbortSignal | undefined;
  const app = runtime(async (_p,_c,role) => output(role === "intake" ? { ...plan, clarification: null } : final()), "adaptive-opus", async (_queries, signal) => { searchSignal = signal; throw new Error("immediate dependency failure"); });
  try {
    const controller = new AbortController();
    const run = await app.assess(message, undefined, undefined, controller.signal);
    assert.ok(searchSignal); assert.notEqual(searchSignal, controller.signal);
    const audit = run.adaptive!.evidence.audit[0];
    assert.equal(audit.error, "EVIDENCE_UNAVAILABLE"); assert.ok(audit.durationMs < 5000);
    controller.abort(); assert.equal(searchSignal.aborted, true);
  } finally { await app.mastra.shutdown(); }
});

test("real Mastra streaming adapter retains malformed auxiliary data for local safety validation", async () => {
  const candidate = { emergency: true, emergencyDestination: "EMS_NOW", emergencyQuote: "throat is bleeding heavily", findings: "bad type", clarification: null, queries: ["https://example.com"] };
  let calls = 0;
  const model = {
    specificationVersion: "v2" as const, provider: "synthetic", modelId: "scripted-adaptive-transport", supportedUrls: {},
    doGenerate: async (): Promise<never> => { throw new Error("Nonstreaming dispatch is forbidden in this test"); },
    doStream: async () => { calls++; return { stream: new ReadableStream({ start(controller) {
      controller.enqueue({ type: "stream-start", warnings: [] });
      controller.enqueue({ type: "text-start", id: "t" });
      controller.enqueue({ type: "text-delta", id: "t", delta: JSON.stringify(candidate) });
      controller.enqueue({ type: "text-end", id: "t" });
      controller.enqueue({ type: "finish", finishReason: "stop", usage: { inputTokens: 11, outputTokens: 22 } }); controller.close();
    } }) }; },
  };
  const agent = new Agent({ id: "adapter-regression", name: "Adapter regression", model, instructions: "Return the structured synthetic fixture.", maxRetries: 0 });
  const result = await consumeStructuredStream({ signal: new AbortController().signal, start: (signal) => agent.stream("synthetic", { abortSignal: signal, structuredOutput: { schema: planTransportSchema, errorStrategy: "strict" }, maxSteps: 1, modelSettings: { maxRetries: 0 } }) });
  assert.equal(calls, 1); assert.equal(result.failure, null); assert.deepEqual(result.output, candidate);
  assert.deepEqual(result.usage, { inputTokens: 11, outputTokens: 22 });
  assert.equal(validEmergencyEnvelope(result.output, "My throat is bleeding heavily after surgery."), true);
  assert.equal(planSchema.safeParse(result.output).success, false);
  assert.equal(adaptiveTransportSchema.safeParse({ ...final(), support: "invalid auxiliary data" }).success, true);
});

test("persisted assistant questions stay out of patient evidence on the next run", async () => {
  const q = { question: "Do you have crushing chest pressure or pain in your left arm?", why: "These symptoms could change the care setting to emergency assessment.", quote: "nose has been running" };
  let calls = 0;
  const app = runtime(async (p,_c,role) => {
    const input = JSON.parse(p);
    if (calls >= 2) {
      assert.ok(input.clarificationContext.some((c: { question: string }) => c.question === q.question));
      assert.doesNotMatch(input.message, /crushing chest pressure/);
    }
    calls++; return output(role === "intake" ? { ...plan, clarification: calls <= 2 ? q : null } : final());
  });
  try {
    const first = await app.assess(message);
    const event = first.responseEvents!.find((e) => e.kind === "intake_question")!;
    assert.equal(event.kind, "intake_question");
    const m = appendPatientUpdate(message, "No, neither of those symptoms are present.");
    const run = await app.assess(m, undefined, undefined, undefined, { runId: event.runId!, questionId: event.questionId });
    assert.equal(run.status, "complete"); assert.equal(run.safetyFloor, null);
    assert.equal(run.responseEvents!.some((e) => e.kind === "action"), false);
  } finally { await app.mastra.shutdown(); }
});

test("answering a prior question cannot erase an already-emitted in-person floor", async () => {
  let calls = 0;
  const m = "My foot has become red and swollen.";
  const q = { question: "Did the wound begin after a recent operation or injury?", why: "Recent injury or surgery may change the care destination.", quote: "foot has become red and swollen" };
  const sameDay = { ...answer, disposition: "SAME_DAY_IN_PERSON" as const, patientMessage: "Arrange an in-person examination today. Do not wait for a messaging reply." };
  const app = runtime(async (_p,_c,role) => { calls++; return output(role === "intake" ? { ...plan, findings: [], clarification: calls <= 2 ? q : null } : final(calls <= 2 ? sameDay : answer)); });
  try {
    const first = await app.assess(m);
    assert.equal(first.status, "complete");
    const qEvent = first.responseEvents!.find((e) => e.kind === "intake_question")!;
    assert.equal(qEvent.kind, "intake_question");
    const run = await app.assess(appendPatientUpdate(m, "My foot feels slightly better this afternoon."), undefined, undefined, undefined, { runId: first.runId, questionId: qEvent.questionId });
    assert.equal(run.safetyFloor?.disposition, "SAME_DAY_IN_PERSON"); assert.equal(run.status, "review_required");
    assert.equal(run.responseEvents!.some((e) => e.kind === "patient_reply"), false);
  } finally { await app.mastra.shutdown(); }
});

test("an explanation before a trusted EMS instruction cannot hide that instruction", async () => {
  const m = "I have crushing chest pressure and left arm pain.";
  const p = { ...plan, emergency: true, emergencyDestination: "ED_NOW", emergencyQuote: "crushing chest pressure", findings: [], clarification: null };
  const a = { ...answer, disposition: "EMERGENCY_NOW" as const, patientMessage: "Go to the emergency department now for assessment." };
  const app = runtime(async (_p,_c,role) => output(role === "intake" ? p : final(a)));
  try {
    const run = await app.assess(m);
    assert.match(run.safetyFloor!.directive, /Call 911 now/); assert.equal(run.status, "review_required");
    assert.ok(run.checks.some((c) => c.id === "issued_care_reconciliation" && c.status === "fail"));
  } finally { await app.mastra.shutdown(); }
});
