import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGraphRuntime } from "../src/disposition/graph-runtime.ts";
import { graphPromptHash, type GraphGenerate, type GraphJudge } from "../src/disposition/clinical-graph.ts";
import { GATES_RELEASE_VERSION, DEFAULT_CANDIDATE_MODE, resolveGatesSteps, verifyGatesReleaseSteps, type GraphMode } from "../src/disposition/gates-release.ts";
import { readDispositionStream } from "../apps/evaluation/lib/disposition-stream.ts";
import { readPhysicianReference, scorePhysicianCohort } from "../src/evaluation/physician-cohort.ts";
import { scoreV25PathB, pathBDeviation, issuedCareDiagnostics } from "../src/evaluation/v25-path-b.ts";
import { sha256 } from "../src/evidence/rag/model.ts";
import { resolveGraphConfig } from "../src/disposition/graph-config.ts";
import { CONTINUE_EMS_DIRECTIVE } from "../src/disposition/care-setting.ts";
import { draft, patient, context, none, usage, retrieval, hit } from "./fixtures/gates-fixture.ts";
import type { DispositionRun, ResponseEvent } from "../src/disposition/contract.ts";
import { selectGraphEvidence } from "../src/evidence/rag/selection.ts";

const config = resolveGraphConfig({ COUNSEL_FACT_GRAPH_MODE: "off" });
async function assess(options: { mode?: GraphMode; message?: string; output?: unknown; safety?: unknown; packet?: typeof retrieval;
  generate?: GraphGenerate; signal?: AbortSignal; onEvent?: (e: ResponseEvent) => void } = {}) {
  const roles: string[] = [];
  const generator: GraphGenerate = async (role, prompt, signal) => {
    roles.push(role);
    if (options.generate) return options.generate(role, prompt, signal);
    if (role === "judge") throw new Error("UNEXPECTED_JUDGE_CALL");
    return { output: role === "context" ? context : role === "safety" ? options.safety ?? none : options.output ?? draft, usage };
  };
  const runtime = createGraphRuntime(mkdtempSync(join(tmpdir(), "gates-test-")), async () => options.packet ?? retrieval, generator, options.mode ?? "gates-release", config);
  try { return { result: await runtime.assess(options.message ?? patient, options.onEvent, options.signal), roles }; }
  finally { await runtime.close(); }
}
function wire(run: DispositionRun) {
  const records = [...(run.responseEvents ?? []).map(event => ({ type: "response_event", event })), { type: "result", result: run }];
  return new Response(records.map(r => JSON.stringify(r) + "\n").join(""), { headers: { "content-type": "application/x-ndjson" } });
}
const reference = readPhysicianReference(readFileSync("data/evaluation/physician-system-reference-v2.json", "utf8"), readFileSync("data/patient_messages.csv", "utf8"));

test("candidate defaults to new gates mode; mode identities cannot pool", () => {
  assert.equal(DEFAULT_CANDIDATE_MODE, "gates-release");
  assert.match(GATES_RELEASE_VERSION, /^evidence-graph\/v[1-9]\d*$/);
  assert.notEqual(graphPromptHash(config, "hybrid"), graphPromptHash(config, "gates-release"));
  assert.notEqual(graphPromptHash(config, "no-judge"), graphPromptHash(config, "gates-release"));
});
test("C04 duplicate-query packet verifies without a judge; historical failure stays failed", async () => {
  const prior = "outputs/v25-path-b-live-2026-09-15";
  const result = JSON.parse(readFileSync(`${prior}/C04-run.json`, "utf8")) as DispositionRun;
  assert.equal(result.graph?.judge, null);
  assert.equal(resolveGatesSteps(verifyGatesReleaseSteps(result, result.message), sha256), true);
  assert.equal((await readDispositionStream(wire(result), result.message, () => {})).runId, result.runId);
  const admissions = JSON.parse(readFileSync(`${prior}/runtime/attempt-admission.json`, "utf8"));
  const score = scoreV25PathB(reference, [result], result.promptHash, admissions);
  assert.equal(score.cases.find(c => c.id === "C04")?.agreementEligible, false);
  assert.equal(score.cases.find(c => c.id === "C04")?.failure, "Unbound gates-only release.");
  for (const mutate of [
    (r: DispositionRun) => { r.guidance.reverse(); },
    (r: DispositionRun) => { r.guidance.pop(); },
    (r: DispositionRun) => { selectGraphEvidence(r.graph!.retrieval, 9)[0].score += .1; },
  ]) {
    const changed = structuredClone(result); mutate(changed);
    assert.equal(resolveGatesSteps(verifyGatesReleaseSteps(changed, changed.message), sha256), false);
    await assert.rejects(readDispositionStream(wire(changed), changed.message, () => {}));
  }
});
test("shared V25 selection preserves duplicate overwrite, insertion order and cutoff", () => {
  const duplicate = { ...hit, score: hit.score + .5 };
  const other = { ...hit, chunk: { ...hit.chunk, id: "other" } };
  const packets = [{ ...retrieval, hits: [hit, other] }, { ...retrieval, hits: [duplicate] }];
  assert.deepEqual(selectGraphEvidence(packets, 2), [duplicate, other]);
  assert.deepEqual(selectGraphEvidence(packets, 1), [hit]);
  assert.deepEqual(selectGraphEvidence(packets, 1, [other]), [other]);
});
test("gates completes with no critic or repair, and stream/scorer verify the same release", async () => {
  const c = reference.cases.find(c => c.id === "C50")!;
  const { result, roles } = await assess({ message: c.message, output: { ...draft, redFlags: [{ concern: "Other symptoms", status: "unknown", quote: "" }] } });
  assert.equal(result.status, "complete", JSON.stringify(result.checks.filter(c => c.status === "fail")));
  assert.deepEqual(roles.sort(), ["context", "disposition", "safety"]);
  assert.equal(result.graph?.release, "gates_only"); assert.equal(result.graph?.judge, null);
  for (const id of ["independent_review", "research_support", "clinical_correctness"]) assert.equal(result.checks.find(c => c.id === id)?.status, "not_assessed");
  assert.equal(resolveGatesSteps(verifyGatesReleaseSteps(result, c.message), sha256), true);
  let published = 0;
  const streamed = await readDispositionStream(wire(result), c.message, () => {}, e => { if (e.kind === "patient_reply") published++; });
  assert.equal(streamed.runId, result.runId); assert.equal(published, 1);
  const score = scorePhysicianCohort(reference, [result], result.promptHash);
  assert.equal(score.firstAttemptCompletionCount, 1); assert.equal(score.firstAttemptCompleteAgreements, 1);
  assert.equal(score.firstAttemptModelReview.supported, 0); assert.equal(score.firstAttemptModelReview.notAssessed, 1);
  assert.equal(score.cases.find(x => x.id === "C50")?.firstAttempt?.releaseContract, "gates_verified");
});
test("no-judge remains withholding; hybrid still needs its judge", async () => {
  const unreviewed = await assess({ mode: "no-judge" });
  assert.equal(unreviewed.result.status, "review_required"); assert.equal(unreviewed.result.graph?.release, "clinician_required");
  assert.equal(unreviewed.roles.includes("judge"), false);
  const hybrid = await assess({ mode: "hybrid", generate: async role => ({ output: role === "context" ? context : role === "safety" ? none : role === "disposition" ? draft : null, usage }) });
  assert.ok(hybrid.roles.includes("judge")); assert.equal(hybrid.result.status, "review_required");
  assert.equal(hybrid.result.graph?.version, "evidence-graph/v24");
});
test("empty, corrupt and superseded evidence cannot release; wrong quotes and unchecked denials fail", async () => {
  for (const packet of [{ ...retrieval, hits: [] }, { ...retrieval, hits: [{ ...hit, chunk: { ...hit.chunk, hash: "0".repeat(64) } }] },
    { ...retrieval, hits: [{ ...hit, document: { ...hit.document, currency: "superseded" as const } }] }]) {
    const { result } = await assess({ packet });
    assert.equal(result.status, "review_required"); assert.equal(result.graph?.gatesAdmission?.packetOk, false);
  }
  for (const output of [{ ...draft, citations: [{ ...draft.citations[0], quote: "This text is not in the packet." }] },
    { ...draft, redFlags: [{ concern: "Thunderclap onset", status: "denied", quote: "usual migraine" }] },
    { ...draft, patientMessage: "Your prescription has been sent to the pharmacy today. Seek emergency care for new weakness." }]) {
    const { result } = await assess({ output }); assert.equal(result.status, "review_required"); assert.equal(result.graph?.gatesAdmission?.contractOk, false);
  }
});
const emergencyMessage = "I have crushing chest pressure and feel sweaty.";
const ems = { action: "EMS_NOW", basis: [{ quote: "crushing chest pressure", interpretation: "Potential time-critical presentation.", currentPatient: true, present: true }], actionBasis: { indices: [0], sufficient: true }, reason: "Immediate assessment required by this authored test.", patientMessage: "" };
const urgent = { ...ems, action: "SAME_DAY_IN_PERSON", physicalRequirement: "An examination is required today by this authored fixture." };
const emergencyDraft = { ...draft, disposition: "EMERGENCY_NOW", reviewPriority: null, workType: null, transportIntent: { mode: "activate_ems", activationQuote: null },
  patientMessage: "Call 911 now. Do not drive yourself or wait for a message reply.", reason: "Reported chest pressure requires immediate emergency assessment.", redFlags: [{ concern: "Chest pressure", status: "reported", quote: "crushing chest pressure" }] };
test("typed emergency release never claims independent transport review", async () => {
  const { result } = await assess({ message: emergencyMessage, output: emergencyDraft, safety: ems });
  assert.equal(result.status, "complete", JSON.stringify(result.checks));
  assert.equal(result.answer?.emergencyTransport, undefined); assert.equal(result.graph?.transportAdmission, undefined);
  assert.equal(resolveGatesSteps(verifyGatesReleaseSteps(result, emergencyMessage), sha256), true);
  assert.equal((await readDispositionStream(wire(result), emergencyMessage, () => {})).status, "complete");
});
test("same-day and emergency floors survive lower drafts, empty packets and cancellation", async () => {
  for (const safety of [ems, urgent]) {
    const { result } = await assess({ message: emergencyMessage, output: { ...draft, redFlags: [] }, safety });
    assert.equal(result.status, "review_required"); assert.equal(result.graph?.gatesAdmission?.lowerThanEarly, true);
    assert.equal(result.answer?.disposition, safety === ems ? "EMERGENCY_NOW" : "SAME_DAY_IN_PERSON");
    assert.equal((await readDispositionStream(wire(result), emergencyMessage, () => {})).status, "review_required");
  }
  const empty = await assess({ message: emergencyMessage, output: emergencyDraft, safety: ems, packet: { ...retrieval, hits: [] } });
  assert.equal(empty.result.status, "review_required"); assert.equal(empty.result.safetyFloor?.disposition, "EMERGENCY_NOW");
  const controller = new AbortController();
  const cancelled = await assess({ message: emergencyMessage, output: emergencyDraft, safety: ems, signal: controller.signal,
    onEvent: e => { if (e.kind === "action") controller.abort(); } });
  assert.equal(cancelled.result.status, "review_required"); assert.equal(cancelled.result.failure, "RUN_CANCELLED");
  assert.equal(cancelled.result.safetyFloor?.disposition, "EMERGENCY_NOW");
});
test("EMS to ED within the emergency bin is not a silent downgrade", async () => {
  const ed = { ...emergencyDraft, transportIntent: { mode: "ed_now", activationQuote: null }, patientMessage: "Go to the emergency department now. Do not wait for a message reply." };
  const { result } = await assess({ message: emergencyMessage, output: ed, safety: ems });
  assert.equal(result.status, "review_required"); assert.equal(result.graph?.gatesAdmission?.lowerThanEarly, true);
  const standalone = await assess({ message: emergencyMessage, output: ed });
  assert.equal(standalone.result.status, "complete");
});
test("continuing EMS requires already-issued exact continuation, not an invented activation", async () => {
  const message = "I called 911 and the ambulance is on its way.";
  const output = { ...emergencyDraft, redFlags: [], transportIntent: { mode: "continue_ems", activationQuote: message }, patientMessage: CONTINUE_EMS_DIRECTIVE };
  assert.equal((await assess({ message, output })).result.status, "review_required");
  const safety = { ...ems, action: "CONTINUE_EMS", basis: [{ quote: message, interpretation: "Patient reports current active response.", currentPatient: true, present: true }], activeEms: { quote: message, currentPatient: true, currentEpisode: true, active: true } };
  const { result } = await assess({ message, output, safety });
  assert.equal(result.status, "complete", JSON.stringify(result.checks));
  assert.equal(result.answer?.emergencyTransport, undefined);
  assert.equal((await readDispositionStream(wire(result), message, () => {})).status, "complete");
});
test("clear ED directives accept harmless directly and punctuation variants", async () => {
  for (const patientMessage of ["Please go directly to the emergency department now.", "Go to the emergency department now; do not wait for a reply."]) {
    const { result } = await assess({ message: emergencyMessage, output: { ...emergencyDraft, patientMessage, transportIntent: { mode: "ed_now", activationQuote: null } } });
    assert.equal(result.status, "complete");
  }
});
test("join waits for safety regardless of which parallel branch finishes first", async () => {
  for (const slow of ["safety", "disposition"]) {
    const { result } = await assess({ message: emergencyMessage, generate: async role => {
      if (role === slow) await new Promise(resolve => setTimeout(resolve, 15));
      return { output: role === "context" ? context : role === "safety" ? ems : { ...draft, redFlags: [] }, usage };
    } });
    assert.equal(result.status, "review_required"); assert.equal(result.safetyFloor?.disposition, "EMERGENCY_NOW");
    assert.equal(result.responseEvents?.some(e => e.kind === "patient_reply"), false);
  }
});
test("forged release tags, proof, checks and critic metadata are rejected before publication", async () => {
  const { result } = await assess(); assert.equal(result.status, "complete");
  const changes: ((r: DispositionRun) => void)[] = [
    r => { r.graph!.mode = "hybrid"; }, r => { r.graph!.mode = "no-judge"; }, r => { r.graph!.version = "evidence-graph/v24"; },
    r => { r.graph!.release = "model_reviewed"; }, r => { r.graph!.gatesAdmission!.packetHash = "0".repeat(64); },
    r => { r.graph!.frozenPacketHash = "0".repeat(64); },
    r => { r.graph!.gatesAdmission!.draftHash = "0".repeat(64); }, r => { r.answerHash = "0".repeat(64); },
    r => { r.graph!.judge = {} as GraphJudge; }, r => { r.agents!.push({ ...r.agents![0], role: "critic" }); },
    r => { r.checks.find(c => c.id === "independent_review")!.status = "pass"; },
    r => { r.graph!.corrections = 1; }, r => { r.graph!.careCorrectionReleased = true; },
    r => { r.guidance[0].url = "https://example.org/forged"; }, r => { r.graph!.retrieval[0].hits[0].chunk.text += "changed"; },
    r => { r.responseEvents = []; }, r => { r.checks = r.checks.filter(c => c.id !== "transport_intent"); },
  ];
  for (const mutate of changes) {
    const forged = structuredClone(result); mutate(forged);
    assert.equal(resolveGatesSteps(verifyGatesReleaseSteps(forged, patient), sha256), false);
    let published = false;
    await assert.rejects(readDispositionStream(wire(forged), patient, () => {}, e => { if (e.kind === "patient_reply") published = true; }));
    assert.equal(published, false);
  }
});
test("C25 stays qualified, malformed declared completion is not agreement, mixed modes reject", async () => {
  const c = reference.cases.find(c => c.id === "C25")!;
  const { result } = await assess({ message: c.message, output: { ...draft, redFlags: [] } });
  assert.equal(result.status, "complete");
  const score = scorePhysicianCohort(reference, [result], result.promptHash);
  assert.equal(score.firstAttemptCompletionCount, 1); assert.equal(score.firstAttemptDenominator, 0);
  assert.equal(score.firstAttemptCompleteAgreements, 0); assert.deepEqual(score.qualifiedCaseIds, ["C25"]);
  assert.equal(score.cases.find(c => c.id === "C25")?.firstAttempt?.completeAgreement, null);
  const invalid = structuredClone(result); invalid.graph!.gatesAdmission!.packetHash = "0".repeat(64);
  assert.equal(scorePhysicianCohort(reference, [invalid], invalid.promptHash).firstAttemptCompletionCount, 0);
  const mixed = structuredClone(result); mixed.runId += "-other"; mixed.graph!.mode = "hybrid";
  assert.throws(() => scorePhysicianCohort(reference, [result, mixed], result.promptHash), /COHORT_RELEASE_CONTRACT_MIXED/);
});
test("workflow crashes without graph metadata stay in the cohort; stripping metadata cannot gain completion", async () => {
  const c = reference.cases.find(c => c.id === "C50")!;
  const { result } = await assess({ message: c.message, output: { ...draft, redFlags: [] } });
  const failed: DispositionRun = { ...result, runId: result.runId + "-failure", graph: undefined, status: "review_required", failure: "GRAPH_EXECUTION_FAILED", answer: null, answerHash: null };
  const score = scorePhysicianCohort(reference, [result, failed], result.promptHash);
  const attempts = score.cases.find(x => x.id === "C50")!.attempts;
  assert.equal(attempts.length, 2);
  assert.equal(attempts.find(x => x.runId === failed.runId)?.completed, false);
  assert.equal(attempts.find(x => x.runId === failed.runId)?.releaseContract, "identity_unavailable");
  assert.deepEqual(scorePhysicianCohort(reference, [failed, result], result.promptHash).releaseIdentity, score.releaseIdentity);
  assert.equal(score.releaseIdentity?.mode, "gates-release");
  assert.equal(scorePhysicianCohort(reference, [failed], result.promptHash).releaseIdentity, null);
  const forged = { ...result, graph: undefined };
  assert.equal(scorePhysicianCohort(reference, [forged], result.promptHash).firstAttemptCompletionCount, 0);
});

test("Path B separates complete-only agreement from failures, C25, acuity and fixture metrics", async () => {
  const c50 = reference.cases.find(c => c.id === "C50")!, c25 = reference.cases.find(c => c.id === "C25")!;
  const good = (await assess({ message: c50.message, output: { ...draft, redFlags: [] } })).result;
  const qualified = (await assess({ message: c25.message, output: { ...draft, redFlags: [] } })).result;
  const failed = { ...good, runId: good.runId + "-failed", completedAt: "2026-01-01T00:00:00Z", graph: undefined, status: "review_required" as const, answer: null, answerHash: null, failure: "GRAPH_EXECUTION_FAILED" };
  const score = scoreV25PathB(reference,[failed,good,qualified],good.promptHash);
  assert.equal(score.attempted,2); assert.equal(score.complete,1); assert.equal(score.agreement.denominator,0); assert.equal(score.agreement.rate,null);
  assert.equal(score.cases.find(c => c.id === "C25")?.agreement,null); assert.equal(score.cases.find(c => c.id === "C25")?.under_over,null);
  assert.equal(score.providerCompleteMetrics.n,0); assert.equal(score.cases.find(c=>c.id==="C25")?.latencyMs,null);
  assert.equal(score.unsafe_advice,"not_assessed"); assert.equal(score.unsupported_claims,"not_assessed");
  assert.equal(scoreV25PathB(reference,[good],good.promptHash).agreement.denominator,1);
  assert.equal(pathBDeviation("PRIORITY_ASYNC",["STANDARD_ASYNC"]),"within_accepted_acuity_range");
  assert.equal(pathBDeviation("STANDARD_ASYNC",["PRIORITY_ASYNC"]),"within_accepted_acuity_range");
  assert.equal(pathBDeviation("ASYNC_PHYSICIAN",["SELF_CARE","SAME_DAY_IN_PERSON"]),"within_accepted_acuity_range");
  assert.equal(pathBDeviation("SELF_CARE",["PRIORITY_ASYNC","SAME_DAY_IN_PERSON"]),"under");
  assert.equal(pathBDeviation("EMERGENCY_NOW",["PRIORITY_ASYNC","SAME_DAY_IN_PERSON"]),"over");
  const corrupted = structuredClone(good);
  corrupted.responseEvents = [{kind:"action",notice:{disposition:"EMERGENCY_NOW",directive:"Call 911 now.",source:"emergency_agent"},sequence:1,elapsedMs:1}, ...good.responseEvents!.map(e=>({...e,sequence:(e.sequence??0)+1}))];
  assert.ok(issuedCareDiagnostics(corrupted).never_downgrade_hard_fails.length);
  assert.equal(scoreV25PathB(reference,[corrupted],good.promptHash).complete,0);
  assert.deepEqual(scoreV25PathB(reference,[corrupted],good.promptHash).hardFailCaseIds,["C50"]);
  const rejected=scoreV25PathB(reference,[corrupted],good.promptHash,[{id:"C50",runId:corrupted.runId,eligible:false,failure:"DECODER_REFUSED"},{id:"C01",runId:null,eligible:false,failure:"INTERRUPTED"}]);
  assert.equal(rejected.attempted,2);assert.equal(rejected.agreement.denominator,0);assert.equal(rejected.providerCompleteMetrics.n,0);
  assert.deepEqual(rejected.hardFailCaseIds,["C50"]);assert.equal(rejected.cases.find(c=>c.id==="C01")?.attempt,"first_attempt");
});
