import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as contract from "../../../src/disposition/contract.ts";
import * as presentation from "../lib/v0-contract.ts";
import { sampleMessages } from "../lib/source-messages.ts";
import * as stream from "../lib/disposition-stream.ts";
import * as latest from "../lib/latest-assessment.ts";
import * as intake from "../../../src/disposition/intake.ts";
import * as intakeSources from "../../../src/evidence/legacy-notes.ts";
import * as routing from "../../../src/disposition/routing-policy.ts";

async function components() {
  const require = createRequire(import.meta.url);
  const { transform, loadBindings } = require("next/dist/build/swc"); await loadBindings();
  const { code } = await transform(readFileSync(new URL("../components/disposition-workbench.tsx", import.meta.url), "utf8"), { filename: "disposition-workbench.tsx", jsc: { parser: { syntax: "typescript", tsx: true }, target: "es2022", transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
  const cache: Record<string, unknown> = { "../lib/disposition-stream": stream, "../../../src/disposition/contract": contract, "../lib/v0-contract": presentation, "./v0-workbench": { CounselFlowLogo: () => createElement("img", { src: "/counsel-symbol.svg", alt: "Counsel C" }) } };
  cache["../lib/latest-assessment"] = latest;
  cache["../../../src/disposition/routing-policy"] = routing;
  const handoffCode = (await transform(readFileSync(new URL("../components/routing-handoff.tsx", import.meta.url), "utf8"), { filename: "routing-handoff.tsx", jsc: { parser: { syntax: "typescript", tsx: true }, target: "es2022", transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } })).code;
  const handoffModule = { exports: {} }; new Function("require", "module", "exports", handoffCode)((id: string) => cache[id] ?? require(id), handoffModule, handoffModule.exports);
  cache["./routing-handoff"] = handoffModule.exports;
  cache["../../../src/disposition/intake"] = intake;
  cache["../../../src/evidence/legacy-notes"] = intakeSources;
  const reviewCode = (await transform(readFileSync(new URL("../components/response-review.tsx", import.meta.url), "utf8"), { filename: "response-review.tsx", jsc: { parser: { syntax: "typescript", tsx: true }, target: "es2022", transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } })).code;
  const reviewModule = { exports: {} }; new Function("require", "module", "exports", reviewCode)(require, reviewModule, reviewModule.exports);
  cache["./response-review"] = reviewModule.exports;
  const module = { exports: {} }; new Function("require", "module", "exports", code)((id: string) => cache[id] ?? require(id), module, module.exports);
  return module.exports as Record<string, (props: Record<string, unknown>) => ReturnType<typeof createElement>>;
}

const run: contract.DispositionRun = {
  version: "disposition-agent/v1", status: "complete", origin: "agent", modelCalls: 1, failure: null, safetyFloor: null,
  workflowId: "counsel-disposition-agent", runId: "run-1", traceId: "trace-1", tracePersisted: true, artifactPersisted: true,
  inputHash: "input-hash", answerHash: "answer-hash", promptHash: "prompt-hash", guidanceHash: "guidance-hash", model: "test-model",
  message: "Synthetic message", completedAt: "2026-09-10T00:00:00Z", durationMs: 123, usage: { inputTokens: 100, outputTokens: 90 },
  steps: [{ id: "generate-disposition", status: "success", durationMs: 100 }], checks: [{ id: "research_support", status: "not_assessed", detail: "Clinical entailment ungraded" }],
  guidance: [{ id: "source", title: "Clinical source", url: "https://www.nice.org.uk/guidance/ng19", section: "1.4", summary: "Guidance", reviewedAt: "2026-09-10" }],
  answer: { disposition: "SAME_DAY_IN_PERSON", reason: "An examination is required to establish severity.", patientMessage: "Please have an in-person assessment today.", differential: ["Soft-tissue infection"], redFlags: [{ concern: "Fever", status: "unknown", quote: "" }], vitalSigns: "No measurements supplied.", questions: [], evidence: [{ sourceId: "source", claim: "The examination determines severity." }], evidenceLimitations: "Applicability requires review." },
};

test("one closed clinical disclosure preserves detail without hiding the care action", async () => {
  const { DispositionResult } = await components();
  const html = renderToStaticMarkup(createElement(DispositionResult, { result: run }));
  const tag = html.match(/<details[^>]*data-clinical-detail="true"[^>]*>/)?.[0];
  assert.ok(tag); assert.doesNotMatch(tag, / open(?:=|\s|>)/);
  const index = html.indexOf(tag);
  assert.ok(html.indexOf(run.answer!.patientMessage) < index);
  assert.ok(html.indexOf("Evidence sources:") < index);
  assert.ok(html.indexOf(run.answer!.reason) > index);
  assert.ok(html.indexOf(run.answer!.differential[0]) > index);
  assert.ok(html.indexOf(run.answer!.vitalSigns) > index);
  assert.ok(html.indexOf(run.answer!.evidenceLimitations) > index);
  assert.equal((html.match(/<summary>Clinical detail &amp; evidence<\/summary>/g) ?? []).length, 1);
});

test("compact evidence links deduplicate sources but retain each clinical claim", async () => {
  const { DispositionResult } = await components();
  const answer = { ...run.answer!, evidence: [...run.answer!.evidence, { sourceId: "source", claim: "A second distinct source claim." }] };
  const html = renderToStaticMarkup(createElement(DispositionResult, { result: { ...run, answer } }));
  const summary = html.match(/<p[^>]*data-evidence-summary="true"[^>]*>(.*?)<\/p>/)?.[1] ?? "";
  assert.equal((summary.match(/href=/g) ?? []).length, 1);
  assert.match(summary, /Clinical source/);
  assert.match(html, /The examination determines severity/);
  assert.match(html, /A second distinct source claim/);
});

test("missing and unrecognized evidence stays visible outside clinical detail", async () => {
  const { DispositionResult } = await components();
  for (const evidence of [[], [{ sourceId: "unknown", claim: "Not a verified source." }]]) {
    const html = renderToStaticMarkup(createElement(DispositionResult, { result: { ...run, answer: { ...run.answer!, evidence } } }));
    const summary = html.match(/<p[^>]*data-evidence-summary="true"[^>]*>(.*?)<\/p>/)?.[1] ?? "";
    assert.match(summary, evidence.length ? /Unrecognized citation — not verified/ : /evidence-coverage failure/);
    assert.doesNotMatch(summary, /href=/);
    assert.ok(html.indexOf(summary) < html.indexOf('data-clinical-detail="true"'));
  }
});

test("execution details expose actual first action receipt without claiming browser paint timing", async () => {
  const { DispositionResult } = await components();
  const html = renderToStaticMarkup(createElement(DispositionResult, { result: run, clientTiming: { actionMs: 5990, completedMs: 82000 } }));
  assert.match(html, /Browser receipt — action: 5.99 s/);
  assert.match(html, /not a paint measurement/);
  assert.match(html, /actionMs/);
  const disclosure = html.match(/<details class="v0-detail"><summary>Execution details<\/summary>([\s\S]*?)<\/details>/)?.[1];
  assert.ok(disclosure); assert.match(disclosure, /Browser receipt — action: 5.99 s/);
  assert.match(html, /Why this route/); assert.match(html, /Brief differential/);
});
test("candidate starts with the clinical task, keeping implementation and version navigation secondary", async () => {
  const { DispositionWorkbench } = await components();
  const html = renderToStaticMarkup(createElement(DispositionWorkbench, { candidate: true, samples: sampleMessages }));
  const header = html.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";
  assert.match(header, /Disposition agent/); assert.doesNotMatch(header, /Evidence-graph|queue|reviews|Pause|Open existing version/);
  const footer = html.match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? "";
  assert.match(footer, /About this prototype/); assert.match(footer, /Evidence-graph candidate/); assert.match(footer, /Open existing version/);
  assert.match(html, /rows="5"/); assert.match(html, /Counsel’s 50 sample messages/);
});
test("optional updates stay collapsed and clarification opens without displacing emergency care", async () => {
  const { PatientUpdatePanel } = await components();
  for (const [needsAnswer, emergencyActive, expectedOpen] of [[false, false, false], [true, false, true], [true, true, false], [false, true, false]]) {
    const html = renderToStaticMarkup(createElement(PatientUpdatePanel, { needsAnswer, emergencyActive }, createElement("textarea", { "aria-label": "Update" })));
    assert.equal(/<details[^>]* open=""/.test(html), expectedOpen);
    assert.match(html, /<summary/); assert.match(html, /<textarea/);
    assert.match(html, expectedOpen ? /Answer the clarification question/ : /Add information or changed symptoms/);
  }
});
test("timings remain inspectable while incomplete logging stays visible", async () => {
  const { DispositionResult } = await components();
  const result = { ...run, version: "disposition-agent/v3", eventLogPersisted: false, firstActionMs: 1300, agents: [{ role: "history", model: "fixture", modelCalls: 1, output: {}, usage: { inputTokens: 10, outputTokens: 5 }, failure: null, durationMs: 2450 }] };
  const html = renderToStaticMarkup(createElement(DispositionResult, { result }));
  const disclosure = html.match(/<details class="v0-detail"><summary>Execution details<\/summary>([\s\S]*?)<\/details>/)?.[1] ?? "";
  assert.match(disclosure, /history · output received · 2.45 s/); assert.match(disclosure, /Server timing — early action: 1.30 s/);
  assert.doesNotMatch(disclosure, /Logging is incomplete/); assert.match(html, /role="alert"[^>]*>Logging is incomplete/);
});
test("application withholding is not presented as an independent judge rejection", async () => {
  const { DispositionResult } = await components();
  const result = { ...run, status: "review_required", origin: "validation_safeguard", graph: { release: "clinician_required", judge: { verdict: "accept", criteria: [] }, citations: [], retrieval: [], corrections: 1 }, checks: [{ id: "no_blanket_clearance", status: "fail", detail: "Exact phrase still present in reason." }] };
  const html = renderToStaticMarkup(createElement(DispositionResult, { result }));
  assert.match(html, /reviewer accepted the draft, but application checks withheld the full response/);
  assert.doesNotMatch(html, /independent review did not approve release/);
  assert.match(html, /Clinician review required/); assert.match(html, /Exact phrase still present/);
});
test("gates-only completion and withholding never claim independent clinical review", async () => {
  const { DispositionResult } = await components();
  for (const complete of [true, false]) {
    const result = { ...run, status: complete ? "complete" : "review_required", origin: complete ? "agent" : "validation_safeguard", graph: { mode: "gates-release", release: complete ? "gates_only" : "clinician_required", judge: null, citations: [], retrieval: [], corrections: 0 } };
    const html = renderToStaticMarkup(createElement(DispositionResult, { result }));
    assert.match(html, /No model judge ran/);
    assert.doesNotMatch(html, /independent reviewer accepted|reviewer accepted the draft|independently reviewed and approved/);
    assert.match(html, complete ? /clinical correctness and claim support are not independently established/ : /clinician review is required/);
    assert.doesNotMatch(html, /clinical correctness is separately reviewed/);
  }
});
test("historical review fallback is unresolved, not a new clinical priority or a rejected draft", async () => {
  const { DispositionResult } = await components();
  for (const answer of [null, { ...run.answer!, disposition: "ASYNC_PHYSICIAN", reviewPriority: "priority", patientMessage: "Legacy fallback directive." }]) {
    const result = { ...run, answer, status: "review_required", origin: "validation_safeguard", rejectedAnswer: { patientMessage: "Rejected self-care draft." }, graph: { release: "clinician_required", judge: null, retrieval: [], corrections: 1 } };
    const html = renderToStaticMarkup(createElement(DispositionResult, { result }));
    assert.match(html, /Clinician review required/);
    assert.match(html, /not a finding that your symptoms became more urgent/);
    assert.match(html, /No request has been sent/);
    assert.doesNotMatch(html, /Priority async|Standard async|>Self care<|Legacy fallback directive|Rejected self-care draft|Why this route|Destination: Counsel clinician queue/);
  }
});
test("withheld explanations preserve supported physical care and reviewed lower-setting corrections", async () => {
  const { DispositionResult } = await components();
  const graph = { release: "clinician_required", judge: null, retrieval: [], corrections: 1 };
  for (const [disposition, directive] of [["EMERGENCY_NOW", "Call 911 now. Do not drive."], ["SAME_DAY_IN_PERSON", "Get an in-person assessment today."]] as const) {
    const result = { ...run, status: "review_required", origin: "validation_safeguard", graph, safetyFloor: { disposition, directive } };
    const html = renderToStaticMarkup(createElement(DispositionResult, { result }));
    assert.ok(html.includes(directive)); assert.match(html, /Clinician review required/);
    assert.ok(html.indexOf(directive) < html.indexOf("Clinician review required"));
  }
  const answer = { ...run.answer!, disposition: "ASYNC_PHYSICIAN", reviewPriority: "routine", patientMessage: "Recommend standard Counsel messaging review." };
  const html = renderToStaticMarkup(createElement(DispositionResult, { result: { ...run, answer, status: "review_required", origin: "validation_safeguard", graph: { ...graph, careCorrectionReleased: true }, safetyFloor: { disposition: answer.disposition, directive: answer.patientMessage } } }));
  assert.match(html, /Reviewed care correction · Standard async/); assert.ok(html.includes(answer.patientMessage));
  assert.match(html, /Clinician review required/); assert.doesNotMatch(html, /Why this route/);
});
test("a retained instruction is explicitly previous-run advice, never new model progress", async () => {
  const { RetainedCareNotice } = await components();
  const html = renderToStaticMarkup(createElement(RetainedCareNotice, { care: { notice: { disposition: "EMERGENCY_NOW", directive: "Call 911 now.", source: "emergency_agent" }, input: "Prior message", runId: "prior-run" } }));
  assert.match(html, /Earlier care instruction — retained/);
  assert.match(html, /Not generated by this run and not included in its response timing/);
  assert.match(html, /data-prior-care-run="prior-run"/);
  assert.doesNotMatch(html, /clinical explanation is still being prepared/);
});
test("final-only urgent care renders retained provenance without pretending it came from the early agent", async () => {
  const { RetainedCareNotice } = await components();
  const result = { ...run, answer: { ...run.answer!, disposition: "EMERGENCY_NOW" as const, patientMessage: "Call 911 now." } };
  const selected = latest.currentIssuedCare(result.message, result, [], null)!;
  const care = latest.retainPriorCare(null, selected.care, result.message, result.message, selected.runId, undefined, selected.provenance);
  const html = renderToStaticMarkup(createElement(RetainedCareNotice, { care }));
  assert.match(html, /data-prior-care-origin="final_answer"/);
  assert.match(html, /data-prior-care-run="run-1"/);
  assert.match(html, /Call 911 now/);
  assert.doesNotMatch(html, /emergency_agent|Reply received/);
  const source = readFileSync(new URL("../components/disposition-workbench.tsx", import.meta.url), "utf8");
  assert.match(source, /retainPriorCare\(priorCare, issuedCare\?\.care/);
  assert.match(source, /unreconciledPriorCare && priorCare\?\.notice\.disposition === "EMERGENCY_NOW"/, "a reconciled old EMS instruction must not produce a contradictory update warning");
});

test("five-route presentation distinguishes async priority without a fabricated deadline", async () => {
  const { DispositionResult } = await components();
  for (const [disposition, reviewPriority, label] of [
    ["SELF_CARE", null, "Self care"], ["ASYNC_PHYSICIAN", "priority", "Priority async"],
    ["ASYNC_PHYSICIAN", "routine", "Standard async"], ["EMERGENCY_NOW", null, "Emergency assessment now"],
    ["SAME_DAY_IN_PERSON", null, "In-person today"],
  ] as const) {
    const answer = { ...run.answer!, disposition, reviewPriority, patientMessage: "Fixture care instruction." };
    const html = renderToStaticMarkup(createElement(DispositionResult, { result: { ...run, answer } }));
    assert.ok(html.includes(`>${label}</h3>`));
    assert.doesNotMatch(html, /48 hours|within two days/);
    if (disposition === "ASYNC_PHYSICIAN") assert.match(html, /Counsel clinician/);
  }
});

test("candidate acceptance copy does not falsely name a hardcoded judge vendor", async () => {
  const { DispositionResult } = await components();
  const graph = { version: "fixture", mode: "hybrid", context: null, safety: null, retrieval: [], judge: null, release: "model_reviewed", clinicalApproval: false, corrections: 0, careCorrectionReleased: false, sourceIntegrity: true, citations: [] };
  const html = renderToStaticMarkup(createElement(DispositionResult, { result: { ...run, graph } }));
  assert.match(html, /A separate model review accepted this response/);
  assert.doesNotMatch(html, /The independent reviewer accepted/);
  assert.doesNotMatch(html, /Astra accepted/);
});

test("emergency setting heading does not imply EMS when the directive specifies ED attendance", async () => {
  const { DispositionResult } = await components();
  for (const patientMessage of ["Go to an emergency department now; do not wait for a message reply.", "Call 911 now. Do not drive yourself."]) {
    const answer = { ...run.answer!, disposition: "EMERGENCY_NOW", reviewPriority: null, workType: null, patientMessage };
    const html = renderToStaticMarkup(createElement(DispositionResult, { result: { ...run, answer } }));
    assert.match(html, />Emergency assessment now<\/h3>/);
    assert.ok(html.includes(patientMessage));
    assert.doesNotMatch(html, /Emergency now \/ 911/);
  }
});

test("recovery attempts remain distinct in the execution panel without claiming cancelled usage is free", async () => {
  const { DispositionResult } = await components();
  const agents: contract.AgentExecution[] = [
    {role:"disposition",model:"synthetic",modelCalls:1,output:null,failure:"GENERATION_SUPERSEDED",usage:{inputTokens:null,outputTokens:null},attempt:{number:1,offsetMs:0,selected:false,policy:"bounded-hedge/v1"}},
    {role:"disposition",model:"synthetic",modelCalls:1,output:{},failure:null,usage:{inputTokens:100,outputTokens:80},attempt:{number:2,offsetMs:12000,selected:true,policy:"bounded-hedge/v1"}},
  ];
  const html = renderToStaticMarkup(createElement(DispositionResult,{result:{...run,agents,modelCalls:2}}));
  assert.match(html,/attempt 1/); assert.match(html,/attempt 2 · selected/);
  assert.match(html,/cancelled after another attempt completed/);
  assert.match(html,/\? input \/ \? output tokens/);
});

test("an approved care revision is visible and old advice remains in the evaluation history", async () => {
  const { DispositionResult, ProgressiveResponse } = await components();
  const reconciliation = { policy: "issued-care-reconciliation/v1", status: "revised", from: { disposition: "EMERGENCY_NOW", directive: "Seek emergency department assessment now." }, to: { disposition: "SAME_DAY_IN_PERSON", directive: run.answer!.patientMessage }, reason: "Review found a same-day examination appropriate; the earlier emergency classification was excessive." };
  const event = { kind: "care_revision", sequence: 2, reconciliation };
  const result = { ...run, reconciliation, responseEvents: [{ kind: "action", sequence: 1, notice: { ...reconciliation.from, source: "emergency_agent" } }, event] };
  const html = renderToStaticMarkup(createElement(DispositionResult, { result }));
  assert.match(html, /Early recommendation revised after review/);
  assert.ok(html.includes(reconciliation.reason));
  assert.ok(html.includes(reconciliation.from.directive));
  const progressive = renderToStaticMarkup(createElement(ProgressiveResponse, { events: [event] }));
  assert.match(progressive, /Care recommendation revised after review/);
  assert.ok(progressive.includes(reconciliation.to.directive));
});

test("pending view shows routing alternatives as proposals, not findings or clearance", async () => {
  const { DispositionResult } = await components();
  const result = { ...run, status: "awaiting_input", answer: null, pendingInstruction: "Do not wait if emergency symptoms develop.", clarification: { question: "Did symptoms start suddenly?", why: "Onset may change the necessary care setting.", quote: "Synthetic message", routingConsequence: { alternatives: [{ answer: "Sudden onset", route: "EMERGENCY_NOW" }, { answer: "Gradual onset", route: "STANDARD_ASYNC" }] } } };
  const html = renderToStaticMarkup(createElement(DispositionResult, { result }));
  assert.match(html, /proposed alternatives, not findings/);
  assert.match(html, /Sudden onset → EMERGENCY NOW/);
  assert.match(html, /No final disposition has been issued/);
  assert.match(html, /Do not wait if emergency symptoms develop/);
});

test("active GUI has one input/answer without redundant consent or budget mechanics", async () => {
  const { DispositionWorkbench } = await components();
  const html = renderToStaticMarkup(createElement(DispositionWorkbench, { samples: [{ id: "C04", message: "Fictional case" }] }));
  assert.match(html, /System response/); assert.match(html, /Assess message/);
  assert.match(html, /<select[^>]*disabled=""/);
  assert.match(html, /<textarea[^>]*disabled=""/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Assess message/);
  assert.doesNotMatch(html, /type="checkbox"|sent to Anthropic|saved locally|20-call|reservation|Sonnet|skip the model|Unattested proposal|Supplied workflow/);
  const header = html.match(/<header[\s\S]*?<\/header>/)?.[0];
  assert.ok(header);
  assert.doesNotMatch(header, /href="\/(queue|review)"|Previous-version|Clinician queue|<button|Pause|Play/);
});

test("both async priorities identify the same stub destination without simulating a receipt", async () => {
  const { DispositionResult } = await components();
  for (const [reviewPriority, label] of [["priority", "Priority"], ["routine", "Standard"], [null, "Priority not recorded"]] as const) {
    const result = { ...run, answer: { ...run.answer!, disposition: "ASYNC_PHYSICIAN", reviewPriority }, handoff: { episodeId: "historical", revision: 1, persisted: true } };
    const html = renderToStaticMarkup(createElement(DispositionResult, { result }));
    assert.match(html, /Destination: Counsel clinician queue/);
    assert.ok(html.includes(`· ${label}`));
    assert.match(html, /Integration stub/);
    assert.match(html, /No request is sent and no clinician acceptance is confirmed/);
    assert.match(html, /Priority and standard requests share this queue/);
    assert.match(html, /Service availability not connected/);
    assert.match(html, /SMS\/push delivery and shift handoff are not connected/);
    assert.doesNotMatch(html, /Send to demo|Open clinician queue|Saved to the demo queue|Queue record could not be saved/);
  }
  for (const disposition of ["SELF_CARE", "SAME_DAY_IN_PERSON", "EMERGENCY_NOW"]) {
    const html = renderToStaticMarkup(createElement(DispositionResult, { result: { ...run, answer: { ...run.answer!, disposition } } }));
    assert.doesNotMatch(html, /Destination: Counsel clinician queue/);
  }
  for (const status of ["awaiting_input", "unavailable", "review_required"]) {
    const html = renderToStaticMarkup(createElement(DispositionResult, { result: { ...run, status, answer: null } }));
    assert.doesNotMatch(html, /Destination: Counsel clinician queue/);
  }
});

test("queue stub rejects old client actions without reading or mutating historical storage", async () => {
  const { GET, POST } = await import("../app/api/clinician-queue/route.ts");
  for (const handler of [GET, POST]) {
    const response = handler();
    assert.equal(response.status, 501);
    assert.equal((await response.json()).error, "QUEUE_INTEGRATION_NOT_CONNECTED");
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  const api = readFileSync(new URL("../app/api/disposition/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(api, /getClinicianQueue|handoff:/);
  assert.match(api, /review\.enqueue\(result\)/); // independent scoring remains active
  const page = readFileSync(new URL("../app/queue/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /import .*ClinicianQueue|<ClinicianQueue/);
});

test("emergency notice is actionable while models continue and persists on failure", async () => {
  const { EmergencyNotice } = await components();
  const notice = { disposition: "EMERGENCY_NOW", directive: "Call 911 now.", source: "initial_screen" };
  for (const busy of [true, false]) {
    const html = renderToStaticMarkup(createElement(EmergencyNotice, { notice, busy }));
    assert.match(html, /role="alert"/); assert.match(html, /Call 911 now/);
    assert.match(html, busy ? /still being prepared/ : /still applies/);
  }
});

test("local allowance and provider request failures have distinct actionable explanations", async () => {
  const { DispositionResult } = await components();
  for (const [failure, title] of [["MODEL_BUDGET_EXHAUSTED", "Local demo allowance reached"], ["PROVIDER_REQUEST_REJECTED", "Model request rejected"], ["PROVIDER_AUTH_FAILED", "Provider authentication failed"], ["PROVIDER_RATE_LIMITED", "Provider request limit reached"], ["ANSWER_CONTRACT_FAILED", "Response withheld by validation"], ["ANSWER_SCHEMA_FAILED", "Response format could not be read"]]) {
    const html = renderToStaticMarkup(createElement(DispositionResult, { result: { ...run, answer: null, status: "unavailable", failure, safetyFloor: { disposition: "EMERGENCY_NOW", directive: "Call 911 now." } } }));
    assert.ok(html.includes(title)); assert.match(html, /Call 911 now/); assert.match(html, /not a low-risk disposition/);
    if (failure === "MODEL_BUDGET_EXHAUSTED") assert.match(html, /not necessarily your provider credit/);
  }
  const historical = renderToStaticMarkup(createElement(DispositionResult, { result: { ...run, answer: null, failure: "MODEL_OR_SCHEMA_FAILURE", agents: [{ role: "disposition", model: "test", modelCalls: 1, failure: "MODEL_OR_SCHEMA_FAILURE", output: null, usage: { inputTokens: null, outputTokens: null }, failureDetails: { stage: "structured-output", finishReason: null, httpStatus: 400 } }] } }));
  assert.match(historical, /Model request rejected/); assert.match(historical, /HTTP 400/);
});

test("same-day care has its own early instruction, not an emergency badge", async () => {
  const { EmergencyNotice } = await components();
  const html = renderToStaticMarkup(createElement(EmergencyNotice, { notice: { disposition: "SAME_DAY_IN_PERSON", directive: "Arrange an in-person assessment today.", source: "emergency_agent" }, busy: true }));
  assert.match(html, /In-person assessment today/); assert.match(html, /still being prepared/); assert.doesNotMatch(html, /Emergency action now/);
});

test("a failed explanation keeps the emergency action primary without claiming completion", async () => {
  const { DispositionResult } = await components();
  for (const failure of ["MODEL_TIMEOUT", "ANSWER_CONTRACT_FAILED", "MODEL_OR_SCHEMA_FAILURE"]) {
    const result = { ...run, answer: null, status: "review_required", failure, safetyFloor: { disposition: "EMERGENCY_NOW", directive: "Call 911 now. Do not drive yourself." } };
    const html = renderToStaticMarkup(createElement(DispositionResult, { result }));
    assert.ok(html.indexOf("Emergency action now") < html.indexOf("No completed assessment"));
    assert.match(html, /Call 911 now/); assert.match(html, /This care instruction still applies/);
    assert.match(html, /No completed assessment/);
    if (failure === "MODEL_TIMEOUT") {
      assert.match(html, /Model explanation timed out/);
      assert.doesNotMatch(html, /Assessment unavailable|credit|allowance/);
    }
  }
  const sameDay = renderToStaticMarkup(createElement(DispositionResult, { result: { ...run, answer: null, status: "review_required", failure: "MODEL_TIMEOUT", safetyFloor: { disposition: "SAME_DAY_IN_PERSON", directive: "Arrange an in-person assessment today." } } }));
  assert.match(sameDay, /In-person assessment today/); assert.doesNotMatch(sameDay, /Emergency action now|Call 911/);
  const noFloor = renderToStaticMarkup(createElement(DispositionResult, { result: { ...run, answer: null, status: "unavailable", failure: "MODEL_TIMEOUT", safetyFloor: null } }));
  assert.match(noFloor, /No care recommendation was completed/);
  assert.doesNotMatch(noFloor, /Emergency action now|Call 911|This care instruction still applies/);
});

test("nasal history renders as one concise intake turn with inspectable publisher links", async () => {
  const { ProgressiveResponse } = await components();
  const event = intake.intakeEvent({ questionId: "nasal-history", quote: "runny nose" }, "A runny nose for two days");
  const html = renderToStaticMarkup(createElement(ProgressiveResponse, { events: [event], notice: null, busy: true }));
  assert.match(html, /brain, sinus or nasal/); assert.match(html, /object entering your nose/);
  assert.match(html, /Why these questions/); assert.match(html, /www.mayoclinic.org/);
  assert.match(html, /www.cdc.gov/); assert.match(html, /www.cuh.nhs.uk/);
  assert.doesNotMatch(html, /You have a CSF leak|Call 911/);
});

test("live renderer gives an emergency precedence and never displays hidden history", async () => {
  const { ProgressiveResponse } = await components();
  const html = renderToStaticMarkup(createElement(ProgressiveResponse, { events: [{ kind: "patient_reply", disposition: "SELF_CARE", text: "LOW_ACUITY_CANARY" }], notice: { disposition: "EMERGENCY_NOW", directive: "Call 911 now.", source: "emergency_agent" }, busy: true }));
  assert.match(html, /Call 911 now/); assert.doesNotMatch(html, /LOW_ACUITY_CANARY/);
});

test("final view retains earlier messages for grading rather than erasing a failed prefix", async () => {
  const { DispositionResult } = await components();
  const result = { ...run, version: "disposition-agent/v3", responseEvents: [{ kind: "patient_reply", disposition: "SAME_DAY_IN_PERSON", text: "VISIBLE_PREFIX_CANARY", sequence: 1, elapsedMs: 3000 }], eventLogPersisted: false };
  const html = renderToStaticMarkup(createElement(DispositionResult, { result }));
  assert.match(html, /Earlier messages — also part of evaluation/); assert.match(html, /VISIBLE_PREFIX_CANARY/); assert.match(html, /Logging is incomplete/);
});

test("research and rationale belong to the same displayed answer, with an explicit ungraded support check", async () => {
  const { DispositionResult } = await components();
  const html = renderToStaticMarkup(createElement(DispositionResult, { result: run }));
  assert.match(html, /Please have an in-person assessment today/);
  assert.match(html, /The examination determines severity/);
  assert.match(html, /href="https:\/\/www.nice.org.uk\/guidance\/ng19"/);
  assert.match(html, /Not yet established/); assert.match(html, /research support/); assert.match(html, /Clinical entailment ungraded/);
  assert.match(html, /answer-hash/); assert.match(html, /run-1/);
  assert.doesNotMatch(html, /curated research, not V0 reasoning|High confidence/);
});

test("evaluation puts failures and unknowns first, with technical passes collapsed", async () => {
  const { DispositionResult } = await components();
  const checks = [{ id: "source_quote_identity", status: "not_assessed", detail: "No cited claims to verify." }, { id: "no_unconfirmed_handoff", status: "fail", detail: "An invented handoff was detected." }, { id: "quoted_patient_evidence", status: "pass", detail: "Technical identity check." }];
  const html = renderToStaticMarkup(createElement(DispositionResult, { result: { ...run, checks } }));
  assert.match(html, /1 failed checks/); assert.match(html, /Needs correction/); assert.match(html, /Not yet established/);
  assert.match(html, /<details[^>]*><summary>1 technical checks passed — inspect<\/summary>/);
  assert.ok(html.indexOf("An invented handoff") < html.indexOf("No cited claims"));
  assert.ok(html.indexOf("No cited claims") < html.indexOf("Technical identity check"));
  assert.doesNotMatch(html, /source quote identity · pass/);
});

test("long evidence limitations remain intact and expandable without hiding the recommendation", async () => {
  const { DispositionResult } = await components();
  const long = "The retrieved abstracts do not establish this care-setting recommendation. ".repeat(10);
  const html = renderToStaticMarkup(createElement(DispositionResult, { result: { ...run, answer: { ...run.answer, evidenceLimitations: long } } }));
  assert.match(html, /Please have an in-person assessment today/);
  assert.match(html, /<summary>Evidence limitations<\/summary>/);
  assert.ok(html.includes(long));
  assert.doesNotMatch(html, /<details[^>]*\bopen/);
});

test("failed output cannot be displayed as patient advice; safety floor and persistence failures remain visible", async () => {
  const { DispositionResult } = await components();
  const failed = { ...run, status: "unavailable", answer: null, rejectedAnswer: { patientMessage: "REJECTED_UNSAFE_CANARY" }, safetyFloor: { disposition: "SAME_DAY_IN_PERSON", directive: "Get examined today." }, artifactPersisted: false, failure: "ANSWER_CONTRACT_FAILED" };
  const html = renderToStaticMarkup(createElement(DispositionResult, { result: failed }));
  assert.match(html, /Response withheld by validation/); assert.match(html, /Get examined today/); assert.match(html, /Logging is incomplete/);
  assert.doesNotMatch(html, /REJECTED_UNSAFE_CANARY|Please have an in-person assessment today/);
});

test("root and v0 use the same active component; old reviews remain explicitly historical", () => {
  for (const name of ["page.tsx", "v0/page.tsx"]) assert.match(readFileSync(new URL(`../app/${name}`, import.meta.url), "utf8"), /<DispositionWorkbench/);
  assert.match(readFileSync(new URL("../app/review/page.tsx", import.meta.url), "utf8"), /Historical review/);
  assert.match(readFileSync(new URL("../components/disposition-workbench.tsx", import.meta.url), "utf8"), /result\?\.message === message/);
  assert.equal(sampleMessages.length, 50);
  assert.ok(sampleMessages.every((sample) => Object.keys(sample).sort().join(",") === "id,message"));
});

test("adaptive pending question is not a failure or a finished low-risk answer", async () => {
  const { DispositionResult, ProgressiveResponse } = await components();
  const clarification = { question: "Did this start after recent surgery or injury?", why: "The answer could change the required setting and timing.", quote: "Synthetic message" };
  const pending = { ...run, status: "awaiting_input", answer: null, clarification, rejectedAnswer: { patientMessage: "HIDDEN_PREMATURE_HOME_CARE" } };
  const html = renderToStaticMarkup(createElement(DispositionResult, { result: pending }));
  assert.match(html, /One detail before settling/); assert.match(html, /recent surgery or injury/);
  assert.doesNotMatch(html, /Assessment unavailable|HIDDEN_PREMATURE_HOME_CARE/);
  const live = renderToStaticMarkup(createElement(ProgressiveResponse, { events: [{ kind: "intake_question", questionId: "adaptive-1234567890abcdef", quote: clarification.quote, text: clarification.question, why: clarification.why, decisionChanging: true }], notice: null, busy: true }));
  assert.match(live, /could change your care/); assert.doesNotMatch(live, /recommendation does not wait/);
});

test("no diagnosis quota or unverified source-certification badge in adaptive result", async () => {
  const { DispositionResult } = await components();
  const result = { ...run, answer: { ...run.answer!, differential: [] }, adaptive: { evidence: { passages: [{ id: "source", linkStatus: "unverified" }] }, support: [{ sourceId: "source", quote: "EXACT_SOURCE_QUOTE", explanation: "Model-declared applicability remains ungraded." }] } };
  const html = renderToStaticMarkup(createElement(DispositionResult, { result }));
  assert.doesNotMatch(html, />Consider</); assert.match(html, /Link availability unverified/);
  assert.match(html, /EXACT_SOURCE_QUOTE/); assert.match(html, /not an independent grade/);
});
