import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGraphRuntime } from "../src/disposition/graph-runtime.ts";
import { assessSafetyAdmission, assessEmergencyTransport, noticeFromSafety, validateGraphJudge, reviewHandoffLanguage, graphSourceIntegrity, selectGraphEvidence, graphCareDirective, canReleaseCareCorrection, draftSchema, wireDraftSchema, graphRepair, type GraphGenerate, type GraphJudge } from "../src/disposition/clinical-graph.ts";
import { buildCorpus, type ClinicalDocument, type Hit, type Retrieval, sha256 } from "../src/evidence/rag/model.ts";
import { checkAnswerForFullReview as checkAnswer, handoffLanguageFindings, validAdaptiveQuestion, type ResponseEvent, type DispositionAnswer } from "../src/disposition/contract.ts";
import { responseEventSchema } from "../src/disposition/progressive.ts";
import { asyncAction, asyncTimingPresent } from "../src/disposition/routing-policy.ts";
import { quoteSpans, sourceWithQuoteSpans, resolveSourceQuoteReferences } from "../src/disposition/source-quote-refs.ts";
import { resolveGraphConfig, type GraphConfig } from "../src/disposition/graph-config.ts";
import { CLINICAL_POLICY_VERSION } from "../src/disposition/clinical-policy.ts";
import { boundEmergencyTransport, hasUnconditional911Opening, reducesEmergencyTransport } from "../src/disposition/care-setting.ts";
import { GRAPH_INSTRUCTIONS } from "../src/disposition/graph-prompts.ts";
import { exactStructuredJudgeAnchor } from "../src/disposition/judge-anchors.ts";
import { admitGraphContext, traceGraphSearch, reviewedCareSnapshot, selectSupportedCare, retryTruncatedJudge, GRAPH_OUTPUT_LIMITS, compactSafetyWireSchema, normalizeSafetyWire } from "../src/disposition/clinical-graph.ts";
import { GRAPH_TRACE_POLICY } from "../src/disposition/graph-runtime.ts";
import { SpanType, type TracingContext } from "@mastra/core/observability";
import { nominateRepairFields, REPAIR_INSTRUCTIONS } from "../src/disposition/graph-repair.ts";
import { readDispositionStream } from "../apps/evaluation/lib/disposition-stream.ts";
import { verifyPreservedCare } from "../apps/evaluation/lib/preserved-care.ts";
import { modelReviewDetail, modelReviewProvenance } from "../src/disposition/model-review-provenance.ts";

const patient = "My usual migraine started today. I need a refill. No fever.";
const sourceText = "Migraine may produce one-sided throbbing pain and sensitivity to light. Treatment should be individualized.";
const document: ClinicalDocument = { id: "test-migraine", title: "Migraine source fixture", url: "https://medlineplus.gov/migraine.html", publisher: "Test", kind: "patient_summary", license: "US-PUBLIC-DOMAIN", licenseUrl: "https://medlineplus.gov/about/using/usingcontent/", attribution: "Test fixture", sourceVersion: "test-v1", rawHash: sha256(sourceText), retrievedAt: "2026-09-13T00:00:00Z", publicationDate: null, reviewDate: null, reviewStatus: "publisher_reviewed", currency: "not_assessed", scope: "Synthetic test source only", aliases: [], concepts: [], related: [], sections: [{ title: "Overview", text: sourceText }] };
const corpus = buildCorpus([document]), { sections: _sections, ...meta } = document;
const hit: Hit = { document: meta, chunk: corpus.chunks[0], score: 1, channels: ["lexical"], context: { before: "", after: "" } };
const retrieval: Retrieval = { query: "migraine refill", corpusHash: corpus.hash, mode: "hybrid", hits: [hit], timings: { totalMs: 1 }, warnings: [], embeddingTokens: 0, embeddingCacheHit: false };
const context = { queries: ["migraine refill"], findings: [{ finding: "Usual migraine", status: "reported", quote: "usual migraine" }], question: null };
const none = { action: "NONE", basis: [], reason: "No early escalation is established from this input.", patientMessage: "" };
const draft = draftSchema.parse({ disposition: "ASYNC_PHYSICIAN", reviewPriority: "priority", workType: "medication_request", patientMessage: asyncAction({ disposition: "ASYNC_PHYSICIAN", reviewPriority: "priority" }) + " Seek emergency care if sudden severe headache or new weakness develops.", reason: "A time-sensitive refill request needs prescribing review by the Counsel clinician.", differential: ["Reported recurrence of usual migraine"], redFlags: [{ concern: "Fever", status: "denied", quote: "No fever" }, { concern: "Neurological deficit", status: "unknown", quote: "" }], vitalSigns: "No measured vital signs supplied; their context remains unknown.", questions: [], citations: [{ passageId: hit.chunk.id, quote: sourceText, claim: "Migraine can produce throbbing pain and light sensitivity.", applicability: "applicable", limitation: "This source does not establish prescribing eligibility." }], evidenceLimitations: "The source describes symptoms; the case-specific routing decision still requires clinical assessment." });
const ids = ["undertriage", "overtriage", "patient_grounding", "claim_support", "safety_net", "clarification_delay", "ownership"];
function judgment(data: { units: { id: string; text: string }[] }, early = "none") {
  return { reviewScope: "draft-and-issued-question/v2", verdict: "accept", earlyAction: early, earlyCorrection: early === "unsupported" ? { reason: "The exact current history supports the lower route; the early trigger was misattributed.", patientQuotes: ["usual migraine"], triggerMisattributedOrCorrected: true } : null, correction: "", criteria: ids.map(id => ({ id, verdict: "pass", reason: "The supplied fixture satisfies this test criterion.", anchors: [{ unit: id === "claim_support" ? `source:${hit.chunk.id}` : "patient", quote: id === "claim_support" ? sourceText : "usual migraine" }] })) };
}
const usage = { inputTokens: 10, outputTokens: 10 };
test("source criteria and revision instructions preserve patient-fact provenance without case-specific routing rules", () => {
  // Prompt contract only: actual adherence requires generated-response review.
  for (const instructions of Object.values(GRAPH_INSTRUCTIONS)) {
    assert.match(instructions, /clinical knowledge, not observations about this patient/);
    assert.doesNotMatch(instructions, /\bC(?:0[1-9]|[1-4]\d|50)\b|acceptedRoutes|incumbentRunId/);
  }
  assert.match(GRAPH_INSTRUCTIONS.disposition, /minimum clinical content needed to justify safe routing/);
  assert.match(GRAPH_INSTRUCTIONS.disposition, /unreported eligibility stays uncertain/);
  assert.match(GRAPH_INSTRUCTIONS.disposition, /fix only the anchored defect and necessarily coupled fields/);
  assert.match(GRAPH_INSTRUCTIONS.disposition, /Recheck against the ORIGINAL patient and CURRENT passages/);
  assert.match(GRAPH_INSTRUCTIONS.disposition, /OMIT unnecessary drug checks, doses, treatment changes, CPR\/procedural instructions/);
  for (const role of ["disposition", "judge"] as const) {
    assert.match(GRAPH_INSTRUCTIONS[role], /being out of one named medicine does not establish that no other medicines are available/);
    assert.match(GRAPH_INSTRUCTIONS[role], /Avoid blanket statements/);
  }
});
test("blanket-clearance repair identifies its exact field and phrase without relaxing the check", async () => {
  let passes = 0;
  const original = { ...draft, reason: "The current symptoms have no reported red flags; clinician review is recommended." };
  const finding = checkAnswer({ ...original, evidence: [] }, patient, [], null).find(c => c.id === "no_blanket_clearance")!;
  assert.equal(finding.status, "fail"); assert.match(finding.detail, /"field":"reason","phrase":"no reported red flags"/);
  const { result } = await run(async (role, prompt) => {
    if (role === "disposition" && ++passes === 2) {
      const packet = JSON.parse(prompt);
      assert.match(JSON.stringify(packet.contractFindings), /no reported red flags/);
      assert.match(JSON.stringify(packet.contractFindings), /reason/);
    }
    return { output: role === "context" ? context : role === "safety" ? none : role === "disposition" ? passes === 1 ? original : draft : judgment(JSON.parse(prompt)), usage };
  });
  assert.equal(result.status, "complete"); assert.equal(result.graph?.corrections, 1); assert.equal(result.modelCalls, 6);
  assert.equal(result.answer?.disposition, original.disposition); assert.equal(result.answer?.reason, draft.reason);
});
test("citation span selection resolves exact original text and rejects unknown or short references", () => {
  const text = "Warning. Get emergency help for chest discomfort that does not go away or happens while resting. Call 911. More context applies.";
  const spans = quoteSpans(text), source = sourceWithQuoteSpans({ id: "s1", text });
  assert.ok(source.quoteSpans.some(s => s.text === "Warning." && !s.selectable)); // context never dropped
  for (const s of spans) assert.equal(text.slice(s.start, s.end), s.text);
  const chosen = spans.find(s => s.text.startsWith("Get emergency"))!;
  const wire = { citations: [{ passageId: "s1", quoteId: chosen.id, claim: "Emergency help is recommended for persistent chest discomfort." }] };
  const resolved = resolveSourceQuoteReferences(wire, [{ id: "s1", text }]);
  assert.equal(resolved.citations[0].quote, chosen.text);
  assert.match(resolved.citations[0].quote, /or happens while resting/);
  assert.ok(!("quoteId" in resolved.citations[0]));
  assert.throws(() => resolveSourceQuoteReferences({ citations: [{ ...wire.citations[0], quoteId: "q999" }] }, [{ id: "s1", text }]), /INVALID_SOURCE/);
  assert.throws(() => resolveSourceQuoteReferences(wire, [{ id: "wrong", text }]), /INVALID_SOURCE/);
  assert.throws(() => resolveSourceQuoteReferences({ citations: [{ ...wire.citations[0], quoteId: "q0" }] }, [{ id: "s1", text }]), /INVALID_SOURCE/);
});
test("long source spans preserve every non-whitespace character and deterministic offsets", () => {
  const text = "Very long context " + "qualified clinical statement ".repeat(100) + " Do not omit this restriction.";
  const spans = quoteSpans(text);
  assert.equal(spans.map(s => s.text).join("").replace(/\s/g,""), text.replace(/\s/g,""));
  assert.ok(spans.every(s => s.text.length <= 580));
  assert.deepEqual(quoteSpans(text), spans);
});
test("provider citation contract requires span references and canonical output retains exact quotes", () => {
  const { quote: _quote, ...citation } = draft.citations[0];
  const wire = { ...draft, citations: [{ ...citation, quoteId: "q0" }] };
  assert.equal(wireDraftSchema.safeParse(wire).success, true);
  assert.equal(wireDraftSchema.safeParse(draft).success, false); // no free-text fallback
  assert.equal(wireDraftSchema.safeParse({ ...wire, citations: [{ ...wire.citations[0], quote: "Changed quotation" }] }).success, false);
  const canonical = draftSchema.parse(resolveSourceQuoteReferences(wire, [{ id: hit.chunk.id, text: sourceText }]));
  assert.equal(canonical.citations[0].quote, quoteSpans(sourceText)[0].text);
  assert.equal(graphSourceIntegrity(canonical, [hit]), true);
  assert.equal(draftSchema.safeParse(wire).success, false); // wire IDs never masquerade as stored quotes
});
test("emergency action validation accepts standard and hyphenated 911 without selecting a route", () => {
  const answer: DispositionAnswer = { ...draft, disposition: "EMERGENCY_NOW", reviewPriority: null, workType: null, evidence: [] };
  for (const number of ["911", "9-1-1", "9‑1‑1", "9 1 1"]) assert.equal(checkAnswer({ ...answer, patientMessage: `Call ${number} now. Do not wait for a reply.` }, patient, [], null).find(c => c.id === "action_timing_present")?.status, "pass");
  assert.equal(checkAnswer({ ...answer, patientMessage: "The number 911 exists." }, patient, [], null).find(c => c.id === "action_timing_present")?.status, "fail");
});
test("evidence selection balances questions and includes repair hits before old tails", () => {
  const packet = (prefix: string): Retrieval => ({ ...retrieval, hits: Array.from({ length: 8 }, (_, i) => ({ ...hit, chunk: { ...hit.chunk, id: `${prefix}${i}` } })) });
  const a = packet("a"), b = packet("b"), repair = packet("r");
  assert.deepEqual(selectGraphEvidence([a, b], 4).map(h => h.chunk.id), ["a0", "b0", "a1", "b1"]);
  assert.deepEqual(selectGraphEvidence([repair, a, b], 4, [a.hits[3]]).map(h => h.chunk.id), ["a3", "r0", "a0", "b0"]);
});
async function run(generate: GraphGenerate, search = async () => retrieval, config?: GraphConfig) {
  // Preserve full-regeneration coverage; field-local path is exercised below.
  const directory = mkdtempSync(join(tmpdir(), "counsel-graph-")), runtime = createGraphRuntime(directory, search, generate, undefined, config ?? resolveGraphConfig({ COUNSEL_GRAPH_REPAIR_MODE: "full_regeneration" })), events: ResponseEvent[] = [];
  try { const result = await runtime.assess(patient, e => events.push(e)); return { result, events, directory }; } finally { await runtime.close(); }
}
test("review provenance describes model and provider IDs without claiming error independence", () => {
  for (const [producer, reviewer, relationship] of [
    ["anthropic/claude-haiku-4-5", "anthropic/claude-haiku-4-5", "same_model"],
    ["anthropic/claude-opus-5", "anthropic/claude-haiku-4-5", "same_provider"],
    ["anthropic/claude-opus-5", "openai/gpt-6-astra", "different_provider"],
    ["gateway/provider/model", "gateway/other/model", "same_provider"],
  ]) {
    assert.deepEqual(modelReviewProvenance(producer, reviewer), { producerModel: producer, reviewerModel: reviewer, relationship });
    const detail = modelReviewDetail(true, producer, reviewer);
    assert.ok(detail.includes(producer)); assert.ok(detail.includes(reviewer));
    assert.match(detail, /do not establish independent errors or clinical approval/);
    assert.doesNotMatch(detail, /Cross-vendor reviewer accepted/);
  }
  for (const absent of [undefined, null, "", "unknown", "anthropic/model\nforged"]) {
    assert.equal(modelReviewProvenance("anthropic/claude-haiku-4-5", absent).relationship, "unknown");
    assert.match(modelReviewDetail(false, "anthropic/claude-haiku-4-5", absent), /reviewer: not recorded/);
  }
});
test("all-Haiku provenance changes no review requirement or legacy profile discriminator", async () => {
  const model = "anthropic/claude-haiku-4-5";
  const config = resolveGraphConfig({ COUNSEL_GRAPH_DISPOSITION_MODEL: model, COUNSEL_GRAPH_JUDGE_MODEL: model });
  for (const accept of [true, false]) {
    const { result } = await run(async (role, prompt) => {
      const review = role === "judge" ? judgment(JSON.parse(prompt)) : null;
      if (review && !accept) { review.verdict = "human_review"; review.criteria[0].verdict = "abstain"; }
      return { output: role === "context" ? context : role === "safety" ? none : role === "disposition" ? draft : review, usage };
    }, async () => retrieval, config);
    assert.equal(result.modelCalls, 4);
    assert.equal(result.status, accept ? "complete" : "review_required");
    assert.equal(result.profile, "evidence-graph-opus"); // Historical reader ID, not model identity.
    assert.equal(result.model, model);
    assert.equal(result.agents?.find(a => a.role === "critic")?.model, model);
    const check = result.checks.find(c => c.id === "independent_review")!;
    assert.equal(check.status, accept ? "pass" : "fail");
    assert.match(check.detail, /same model ID/);
    assert.ok(check.detail.includes(`Producer: ${model}; reviewer: ${model}`));
    assert.doesNotMatch(check.detail, /Cross-vendor/);
  }
});
test("field-local repair preserves all unedited fields and receives a fresh whole-response review", async () => {
  let drafts = 0, judges = 0;
  const original = { ...draft, reason: "The current symptoms have no reported red flags; clinician review is recommended." };
  const { result } = await run(async (role, prompt) => {
    const packet = JSON.parse(prompt);
    if (role === "disposition") {
      if (++drafts === 1) return { output: original, usage };
      assert.deepEqual(packet.repairContract.allowedFields, ["reason"]);
      assert.ok(packet.sources[0].quoteSpans);
      return { output: { baseDraftHash: packet.repairContract.baseDraftHash, evidenceHash: packet.repairContract.evidenceHash, edits: [{ field: "reason", value: draft.reason }] }, usage };
    }
    if (role === "judge") {
      judges++;
      if (judges === 2) { assert.doesNotMatch(prompt, /reviewerFeedback|previousDraft/); assert.doesNotMatch(JSON.stringify(packet.contractFindings), /no reported red flags/); }
      return { output: judgment(packet), usage };
    }
    return { output: role === "context" ? context : none, usage };
  }, async () => retrieval, resolveGraphConfig());
  assert.equal(result.status, "complete"); assert.equal(judges, 2); assert.equal(result.graph?.repair?.status, "applied");
  assert.deepEqual(result.graph?.repair?.changedFields, ["reason"]); assert.equal(result.answer?.patientMessage, draft.patientMessage);
});
test("patch contract rejects stale, duplicate, no-op, extra-path and unauthorized mutations atomically", () => {
  const sources = [{ id: hit.chunk.id, text: sourceText }], binding = graphRepair.prepare(draft, sources, ["reason"]);
  const good = { baseDraftHash: binding.baseDraftHash, evidenceHash: binding.evidenceHash, edits: [{ field: "reason", value: "Only the reported refill request supports this clinician task." }] };
  const before = JSON.stringify(draft);
  const applied = graphRepair.apply(draft, sources, ["reason"], good);
  assert.equal(applied.audit.status, "applied"); assert.equal(applied.output?.patientMessage, draft.patientMessage);
  for (const raw of [{ ...good, baseDraftHash: "0".repeat(64) }, { ...good, evidenceHash: "0".repeat(64) }, { ...good, edits: [...good.edits, ...good.edits] }, { ...good, edits: [{ field: "reason", value: draft.reason }] }, { ...good, edits: [{ field: "/redFlags/0", value: "anything" }] }, { ...good, edits: [{ field: "patientMessage", value: draft.patientMessage + " Unexpected change." }] }, { ...good, unexpected: true }]) {
    assert.equal(graphRepair.apply(draft, sources, ["reason"], raw).output, null);
    assert.equal(JSON.stringify(draft), before);
  }
  assert.equal(graphRepair.apply(draft, [{ ...sources[0], text: "Changed source snapshot." }], ["reason"], good).output, null);
});
test("reviewed emergency care survives failed repair, including a weaker early notice, never a valid later rejection", async () => {
  for (const earlyAction of ["NONE", "SAME_DAY_IN_PERSON"] as const) {
  for (const fault of ["stale_patch", "provider_failure", "invalid_second_review", "later_care_rejected"] as const) {
    let drafts = 0, judges = 0;
    const message = "I have crushing chest pressure and feel sweaty.";
    const emergency = draftSchema.parse({ ...draft, disposition: "EMERGENCY_NOW", reviewPriority: null, workType: null,
      transportIntent: { mode: "activate_ems", activationQuote: null }, patientMessage: "Call 911 now. Do not drive yourself.",
      reason: "The reported chest pressure and sweating require emergency assessment.", redFlags: [{ concern: "Chest pressure", status: "reported", quote: "crushing chest pressure" }] });
    const review = () => ({ ...judgment({units:[]}), earlyAction: earlyAction === "NONE" ? "none" : "supported", verdict: "revise", repairTargets: ["citations"], correction: "Repair the cited claim; emergency care is supported.",
      transportReview: { mode: "activate_ems", verdict: "supported", draftQuote: "Call 911 now.", activation: null },
      criteria: judgment({units:[]}).criteria.map(c => ({...c, verdict: c.id === "claim_support" ? "fail" : "pass", anchors: [{unit:"patient",quote:"crushing chest pressure"}]})) });
    const directory = mkdtempSync(join(tmpdir(), "reviewed-care-"));
    const runtime = createGraphRuntime(directory, async()=>retrieval, async(role,prompt)=> {
      if (role === "disposition") {
        if (++drafts === 1) return {output:emergency,usage};
        if (fault === "provider_failure") throw new Error("Synthetic provider failure");
        const packet=JSON.parse(prompt);
        return {output:{baseDraftHash:fault === "stale_patch" ? "0".repeat(64) : packet.repairContract.baseDraftHash,evidenceHash:packet.repairContract.evidenceHash,edits:[{field:"citations",value:[]}]},usage};
      }
      if (role === "judge") {
        if (++judges === 2) return {output:fault === "invalid_second_review" ? {} : {...review(),criteria:review().criteria.map(c=>({...c,verdict:c.id === "overtriage" ? "fail" : c.verdict}))},usage};
        return {output:review(),usage};
      }
      return {output:role === "safety" ? earlyAction === "NONE" ? none : { ...none, action: earlyAction, basis: [{quote:"crushing chest pressure",interpretation:"Current symptom for assessment",currentPatient:true,present:true}], actionBasis:{indices:[0],sufficient:true}, physicalRequirement:"Examination for the reported symptoms." } : {...context,findings:[]},usage};
    }, undefined, resolveGraphConfig());
    const events:ResponseEvent[]=[];
    try {
      const result=await runtime.assess(message,e=>events.push(e));
      assert.equal(result.status,"review_required"); assert.equal(events.some(e=>e.kind === "patient_reply"),false);
      assert.equal(result.graph?.careCarryForward?.used,fault !== "later_care_rejected");
      assert.equal(result.graph?.careCarryForward?.draftHash,sha256(JSON.stringify(emergency)));
      if (fault !== "later_care_rejected") {
        assert.match(result.answer!.patientMessage,/^Call 911 now/); assert.deepEqual(result.answer?.evidence,[]); assert.equal(result.graph?.judge,null);
        assert.equal(await verifyPreservedCare(result,message),true);
        const response = new Response([...events.map(event=>({type:"response_event",event})),{type:"result",result}].map(x=>JSON.stringify(x)).join("\n")+"\n",{headers:{"content-type":"application/x-ndjson"}});
        assert.equal((await readDispositionStream(response,message,()=>{})).answer?.emergencyTransport?.mode,"activate_ems");
      }
      else if (earlyAction === "NONE") assert.equal(result.answer,null);
      else assert.equal(result.answer?.disposition,"SAME_DAY_IN_PERSON"); // later rejection cannot resurrect the old reviewed emergency
      const j=review() as GraphJudge, checks=checkAnswer({...emergency,evidence:[]},message,[],null), hash=sha256(JSON.stringify(emergency));
      assert.ok(reviewedCareSnapshot(emergency,j,hash,message,checks));
      assert.equal(reviewedCareSnapshot(emergency,j,"0".repeat(64),message,checks),null);
      for (const id of ids.filter(id=>id!=="claim_support")) assert.equal(reviewedCareSnapshot(emergency,{...j,criteria:j.criteria.map(c=>c.id === id ? {...c,verdict:"abstain"}:c)},hash,message,checks),null);
    } finally { await runtime.close(); }
  }
  }
});
test("care-only stream provenance rejects replay, altered transport, later valid review and leaked explanation", async () => {
  for (const repairResult of ["failure", "evidence_still_missing"] as const) {
  for (const mode of ["activate_ems","continue_ems","same_day"] as const) {
    const message="  I have chest pressure. I called 911; an ambulance is coming for me now.\r\n";
    const intent=mode==="same_day"?null:{mode,activationQuote:mode==="continue_ems"?"I called 911; an ambulance is coming for me now.":null};
    const clinical=draftSchema.parse({...draft,disposition:mode==="same_day"?"SAME_DAY_IN_PERSON":"EMERGENCY_NOW",reviewPriority:null,workType:null,transportIntent:intent,
      patientMessage:mode==="same_day"?"Seek an in-person assessment today.":mode==="continue_ems"?"Continue the ambulance response you reported activating; follow the dispatcher.":"Call 911 now. Do not drive yourself.",
      redFlags:[{concern:"Chest pressure",status:"reported",quote:"chest pressure"}]});
    const review={...judgment({units:[]}),verdict:"revise",repairTargets:["citations"],correction:"Repair evidence only; care criteria are independently supported.",
      transportReview:intent?{mode,verdict:"supported",draftQuote:clinical.patientMessage,activation:mode==="continue_ems"?{quote:intent.activationQuote,currentPatient:true,currentEpisode:true,active:true}:null}:null,
      criteria:judgment({units:[]}).criteria.map(c=>({...c,verdict:c.id==="claim_support"?"fail":"pass",anchors:[{unit:"patient",quote:"chest pressure"}]}))};
    let drafts=0;
    const runtime=createGraphRuntime(mkdtempSync(join(tmpdir(),"care-stream-")),async()=>retrieval,async(role,prompt)=> {
      if(role==="disposition"&&++drafts>1){
        if(repairResult==="failure")throw new Error("Synthetic repair failure");
        const packet=JSON.parse(prompt);
        return {output:{baseDraftHash:packet.repairContract.baseDraftHash,evidenceHash:packet.repairContract.evidenceHash,edits:[{field:"citations",value:[]}]},usage};
      }
      return {output:role==="disposition"?clinical:role==="judge"?review:role==="safety"?none:{...context,findings:[]},usage};
    });
    try {
      const result=await runtime.assess(message);
      assert.equal(await verifyPreservedCare(result,message),true,mode);
      const stream=(value:typeof result)=>new Response([...value.responseEvents!.map(event=>({type:"response_event",event})),{type:"result",result:value}].map(x=>JSON.stringify(x)).join("\n")+"\n",{headers:{"content-type":"application/x-ndjson"}});
      assert.equal((await readDispositionStream(stream(result),message,()=>{})).answer?.disposition,clinical.disposition);
      const original=JSON.stringify(result);
      const mutations:((r:typeof result)=>void)[]=[
        r=>{delete r.graph!.preservedCare;},r=>{r.agents=[];},r=>{r.message+=" Other patient.";},r=>{r.graph!.preservedCare={...r.graph!.preservedCare!,draftHash:"0".repeat(64)};},
        r=>{r.graph!.preservedCare={...r.graph!.preservedCare!,judgeHash:"0".repeat(64)};},r=>{r.graph!.preservedCare={...r.graph!.preservedCare!,directive:"Changed instruction"};},
        r=>{r.graph!.preservedCare={...r.graph!.preservedCare!,origin:repairResult==="failure"?"current_review":"pre_repair_review"};},r=>{r.failure="RUN_CANCELLED";},
        r=>{r.answer!.reason="Rejected explanation leaked.";},
        r=>{r.agents!.filter(a=>a.role==="critic"&&!a.failure).at(-1)!.reviewInputBinding!.draftHash="f".repeat(64);},
        r=>{r.agents!.push({...r.agents!.find(a=>a.role==="critic")!,output:{...review,verdict:"human_review"}});},
        r=>{r.graph!.judge=review as GraphJudge;}
      ];
      if(mode!=="same_day")mutations.push(r=>{r.answer!.emergencyTransport!.directive="Unbound directive";});
      if(repairResult==="evidence_still_missing")mutations.push(
        r=>{r.graph!.repair!.baseDraftHash="0".repeat(64);},
        r=>{r.graph!.repair!.evidenceHash="0".repeat(64);},
        r=>{r.graph!.repair!.changedFields=[];},
        r=>{r.agents!.find(a=>a.repairInputBinding)!.repairInputBinding!.baseDraftHash="0".repeat(64);},
      );
      if(mode==="continue_ems")mutations.push(r=>{
        const critic=r.agents!.filter(a=>a.role==="critic"&&!a.failure).at(-1)!,value=critic.output as GraphJudge;
        value.transportReview!.activation!.active=false;
        const judgeHash=sha256(JSON.stringify(value));r.graph!.preservedCare={...r.graph!.preservedCare!,judgeHash};r.graph!.careCarryForward={...r.graph!.careCarryForward!,judgeHash};
      });
      for(const [mutationIndex,mutate] of mutations.entries()){
        const modified=JSON.parse(original) as typeof result;mutate(modified);
        assert.equal(await verifyPreservedCare(modified,message),false,mode+" "+repairResult+" mutation "+mutationIndex);
        await assert.rejects(readDispositionStream(stream(modified),message,()=>{}));
      }
    } finally {await runtime.close();}
  }
  }
});
test("early EMS continuation requires bound active current-patient episode and never reactivates", () => {
  const quote="I called 911 and the ambulance is on its way for me now.",message="My chest still hurts. "+quote;
  const value={...none,action:"CONTINUE_EMS",basis:[{quote,interpretation:"Patient reports current active emergency response",currentPatient:true,present:true}],
    actionBasis:{indices:[0],sufficient:true},activeEms:{quote,currentPatient:true,currentEpisode:true,active:true}};
  const admitted=assessSafetyAdmission(value,message);
  assert.equal(admitted.admission.status,"admitted");
  assert.equal(admitted.notice?.disposition,"EMERGENCY_NOW");
  assert.match(admitted.notice!.directive,/^Continue with the emergency response you reported/);
  assert.doesNotMatch(admitted.notice!.directive,/Call 911 now/);
  for(const raw of [
    {...value,actionBasis:null},{...value,activeEms:null},
    ...["currentPatient","currentEpisode","active"].map(key=>({...value,activeEms:{...value.activeEms,[key]:false}})),
    {...value,activeEms:{...value.activeEms,quote:"Somebody else called an ambulance."}},
    {...value,action:"EMS_NOW"}, {...value,basis:[{...value.basis[0],quote:"My chest still hurts."}]},
  ]) assert.equal(assessSafetyAdmission(raw,message).notice,null);
  for(const text of ["I might call 911.", "I cancelled the ambulance.", "An ambulance came for my father last year."])
    assert.equal(assessSafetyAdmission(value,text).notice,null);
  // Quote/flag admission is not semantic clinical validation. LLM-generated
  // attribution on historical/hypothetical variants is tested prospectively.
});
test("typed emergency care-only correction round-trips and continuation cannot silently become ED transport", async () => {
  const message="I have chest pressure. I called 911 and an ambulance was on its way for me, but dispatch has now cancelled it and told me to go to the emergency department.";
  const activationQuote="I called 911 and an ambulance was on its way for me";
  for(const action of ["EMS_NOW","CONTINUE_EMS"] as const){
    for(const corrected of [false,true]){
      const proposed=draftSchema.parse({...draft,disposition:"EMERGENCY_NOW",reviewPriority:null,workType:null,
        patientMessage:"Go to the emergency department now. Do not wait for a message reply.",transportIntent:{mode:"ed_now",activationQuote:null},citations:[],
        redFlags:[{concern:"Chest pressure",status:"reported",quote:"chest pressure"}]});
      const review={...judgment({units:[]}),verdict:"revise",earlyAction:corrected?"unsupported":"supported",repairTargets:[],
        earlyCorrection:corrected?{reason:"The patient reports that dispatch changed the active transport plan while emergency assessment remains necessary.",patientQuotes:["dispatch has now cancelled it and told me to go to the emergency department"],triggerMisattributedOrCorrected:true}:null,
        transportReview:{mode:"ed_now",verdict:"supported",draftQuote:proposed.patientMessage,activation:null},
        criteria:judgment({units:[]}).criteria.map(c=>({...c,verdict:c.id==="claim_support"?"fail":"pass",anchors:[{unit:"patient",quote:"chest pressure"}]}))};
      const safety={...none,action,basis:[{quote:action==="CONTINUE_EMS"?activationQuote:"chest pressure",interpretation:"Model-assessed current response for this fixture",currentPatient:true,present:true}],
        actionBasis:{indices:[0],sufficient:true},activeEms:action==="CONTINUE_EMS"?{quote:activationQuote,currentPatient:true,currentEpisode:true,active:true}:null};
      const runtime=createGraphRuntime(mkdtempSync(join(tmpdir(),"care-correction-")),async()=>retrieval,async(role)=>({output:role==="disposition"?proposed:role==="judge"?review:role==="safety"?safety:{...context,findings:[]},usage}));
      try{
        const result=await runtime.assess(message),events=result.responseEvents!;
        assert.equal(result.graph?.careCorrectionReleased,corrected);
        const response=(value:typeof result)=>new Response([...events.map(event=>({type:"response_event",event})),{type:"result",result:value}].map(x=>JSON.stringify(x)).join("\n")+"\n",{headers:{"content-type":"application/x-ndjson"}});
        assert.equal((await readDispositionStream(response(result),message,()=>{})).status,"review_required");
        if(corrected){assert.equal(result.answer?.emergencyTransport?.mode,"ed_now");assert.equal(await verifyPreservedCare(result,message),true);}
        else{
          assert.equal(result.answer?.patientMessage,events.find(e=>e.kind==="action")?.notice.directive);
          assert.equal(result.answer?.emergencyTransport,undefined);
        }
      }finally{await runtime.close();}
    }
  }
});
test("supported care precedence preserves setting and typed emergency transport, not an explanation", () => {
  const snapshot = {patientHash:"p",draftHash:"d",judgeHash:"j",disposition:"EMERGENCY_NOW" as const,directive:"Call 911 now.",emergencyTransport:{mode:"activate_ems" as const,activationQuote:null,directive:"Call 911 now.",review:"independent_model" as const}};
  const day = {disposition:"SAME_DAY_IN_PERSON" as const,directive:"Arrange an in-person assessment today.",source:"emergency_agent" as const};
  const ed = {...day,disposition:"EMERGENCY_NOW" as const,directive:"Seek emergency department assessment now. Call 911 if you cannot travel safely."};
  const ems = {...ed,directive:"Call 911 now. Do not drive yourself."};
  assert.equal(selectSupportedCare(day,snapshot).care,snapshot);
  assert.equal(selectSupportedCare(ed,snapshot).care,snapshot);
  assert.equal(selectSupportedCare(ems,{...snapshot,emergencyTransport:{...snapshot.emergencyTransport,mode:"ed_now"}}).care,ems);
  assert.equal(selectSupportedCare(ems,{...snapshot,disposition:"SAME_DAY_IN_PERSON",emergencyTransport:undefined}).care,ems);
  const active = {...snapshot,emergencyTransport:{...snapshot.emergencyTransport,mode:"continue_ems" as const,activationQuote:"Ambulance is coming"}};
  assert.equal(selectSupportedCare(ems,active).care,active); // a previously bound active response remains a continuation
  assert.equal(selectSupportedCare(ed,active).care,active);
  assert.equal(selectSupportedCare(day,null).care,day);
  assert.equal(selectSupportedCare(null,snapshot).care,snapshot);
});
test("compact safety retains complete attributed evidence and rejects partial or extra prose", () => {
  const message="My lips and tongue are swelling and I cannot breathe.";
  const compact={action:"EMS_NOW",basis:[{quote:"My lips and tongue are swelling and I cannot breathe",interpretation:"Current airway symptoms require immediate help",currentPatient:true,present:true}],actionBasis:{indices:[0],sufficient:true},reason:"The reported airway symptoms need emergency assessment.",physicalRequirement:null};
  const normalized=normalizeSafetyWire(compact,true);
  assert.equal(normalized.patientMessage,"");assert.deepEqual(normalized.basis,compact.basis);
  assert.equal(assessSafetyAdmission(normalized,message).admission.status,"admitted");
  const expanded={...compact,basis:[{...compact.basis[0],interpretation:"A longer but still bounded explanation. ".repeat(5)}]};
  assert.equal(compactSafetyWireSchema.safeParse(expanded).success,false);
  assert.equal(assessSafetyAdmission(normalizeSafetyWire(expanded,true),message).admission.status,"admitted");
  assert.equal(normalizeSafetyWire(expanded,true).basis[0].interpretation,expanded.basis[0].interpretation);
  assert.throws(()=>normalizeSafetyWire({...compact,actionBasis:null},true),/COMPACT_ACTION_BASIS_REQUIRED/);
  const {actionBasis:_basis,...missingBasis}=compact;assert.throws(()=>normalizeSafetyWire(missingBasis,true),/COMPACT_ACTION_BASIS_REQUIRED/);
  for(const raw of [{action:"EMS_NOW"},{...compact,patientMessage:"Hidden optional instruction"},{...compact,reason:"a"},{...compact,basis:[]}]){
    const parsed=compactSafetyWireSchema.safeParse(raw);
    assert.ok(!parsed.success||assessSafetyAdmission(normalizeSafetyWire(raw,true),message).admission.status==="rejected");
  }
  for(const invalid of [{...compact,actionBasis:{indices:[0,0],sufficient:true}},{...compact,actionBasis:{indices:[1],sufficient:true}},{...compact,actionBasis:{indices:[0],sufficient:false}},{...compact,basis:[{...compact.basis[0],present:false}]},{...compact,basis:[{...compact.basis[0],currentPatient:false}]},{...compact,basis:[{...compact.basis[0],quote:"Fabricated quotation"}]},{...compact,action:"SAME_DAY_IN_PERSON"}]){
    assert.equal(assessSafetyAdmission(normalizeSafetyWire(invalid,true),message).admission.status,"rejected");
  }
});
test("cancellation during revision retrieval cannot promote unissued reviewed care", async () => {
  const controller=new AbortController(),message="I have crushing chest pressure and feel sweaty.";
  const emergency=draftSchema.parse({...draft,disposition:"EMERGENCY_NOW",reviewPriority:null,workType:null,patientMessage:"Call 911 now. Do not drive yourself.",redFlags:[{concern:"Chest pressure",status:"reported",quote:"crushing chest pressure"}]});
  let searches=0,dispositions=0;
  const runtime=createGraphRuntime(mkdtempSync(join(tmpdir(),"cancel-reviewed-care-")),async()=>{if(++searches>1)controller.abort(new Error("RUN_CANCELLED"));return retrieval;},async(role,prompt)=>{
    if(role==="disposition"){dispositions++;return{output:emergency,usage};}
    if(role==="judge")return{output:{...judgment(JSON.parse(prompt)),verdict:"revise",repairTargets:[],evidenceQueries:["additional source"],criteria:judgment(JSON.parse(prompt)).criteria.map(c=>({...c,verdict:c.id==="claim_support"?"fail":"pass",anchors:[{unit:"patient",quote:"crushing chest pressure"}]}))},usage};
    return{output:role==="context"?{...context,findings:[]}:none,usage};
  });
  try{const events:ResponseEvent[]=[];const result=await runtime.assess(message,e=>events.push(e),controller.signal);
    assert.equal(result.failure,"RUN_CANCELLED");assert.equal(result.answer,null);assert.equal(result.safetyFloor,null);assert.equal(dispositions,1);assert.equal(result.graph?.careCarryForward?.used,false);assert.equal(events.filter(e=>e.kind==="action"||e.kind==="patient_reply").length,0);
  }finally{await runtime.close();}
});
test("mechanical route and transport failures nominate atomic fields; unknown scope stays empty", () => {
  const coupled = ["routing", "patientMessage", "reason"];
  assert.deepEqual(nominateRepairFields([], [{id:"routing_fields",detail:"Inconsistent metadata."}], false), coupled);
  assert.deepEqual(nominateRepairFields([], [], true), coupled);
  assert.deepEqual(nominateRepairFields([], [{id:"unknown",detail:"Unmapped finding."}], false), []);
  assert.match(REPAIR_INSTRUCTIONS, /access fallback stay conditional on NEW findings/);
  assert.match(GRAPH_INSTRUCTIONS.disposition, /SELF_CARE needs concrete supported guidance\/observation, not an unconditional clinician fallback/);
});
test("reviewer output capacity and retry distinguish truncation from clinical disagreement", () => {
  const execution = {role:"critic" as const,model:"openai/test",modelCalls:1,output:null,usage,failure:"INCOMPLETE_MODEL_STREAM",durationMs:10,failureDetails:{stage:"structured-output",finishReason:"length",httpStatus:null}};
  assert.ok(GRAPH_OUTPUT_LIMITS.judge > 2400);
  assert.ok(GRAPH_OUTPUT_LIMITS.truncatedJudgeRecovery > GRAPH_OUTPUT_LIMITS.judge);
  assert.equal(retryTruncatedJudge(execution,false),true);
  assert.equal(retryTruncatedJudge(execution,true),false);
  for (const failure of [null,"JUDGE_CONTRACT_FAILED","MODEL_TIMEOUT","PROVIDER_AUTH_FAILED"]) assert.equal(retryTruncatedJudge({...execution,failure},false),false);
  assert.equal(retryTruncatedJudge({...execution,failureDetails:{...execution.failureDetails,finishReason:"stop"}},false),false);
});
test("actual Mastra stream boundary retries the identical judge packet once only for truncation", async () => {
  for (const fault of ["length_once", "length_twice", "tripwire_length", "invalid_stop", "rate_limit", "negative"] as const) {
    const directory = mkdtempSync(join(tmpdir(), "judge-stream-"));
    const runtime = createGraphRuntime(directory, async () => retrieval);
    const judgeCalls: {prompt:string;limit:number}[] = [];
    for (const role of ["context", "safety", "disposition", "judge"] as const) {
      // Exercise production serialization/transport/recovery, not GraphGenerate.
      const agent = runtime.mastra.getAgent(role);
      agent.stream = (async (prompt: string, options: {modelSettings:{maxOutputTokens:number}}) => {
        let output: unknown = role === "context" ? context : role === "safety" ? none : {...draft,citations:draft.citations.map(({quote:_quote,...c})=>({...c,quoteId:"q0"}))};
        let finishReason = "stop", tripwire: unknown;
        if (role === "judge") {
          judgeCalls.push({prompt,limit:options.modelSettings.maxOutputTokens});
          output = judgment(JSON.parse(prompt));
          if (fault === "rate_limit") throw Object.assign(new Error("Synthetic rate limit"),{statusCode:429});
          if (fault === "invalid_stop") output = {};
          if (fault === "negative") output = {...judgment(JSON.parse(prompt)),verdict:"human_review",criteria:judgment(JSON.parse(prompt)).criteria.map(c=>({...c,verdict:c.id === "undertriage" ? "abstain" : c.verdict}))};
          if (fault === "length_twice" || fault === "tripwire_length" || fault === "length_once" && judgeCalls.length === 1) finishReason = "length";
          if (fault === "tripwire_length") tripwire = {reason:"Synthetic safety tripwire"};
        }
        return {fullStream:(async function*(){yield {type:"text-delta",payload:{text:"synthetic partial"}};})(),object:Promise.resolve(output),usage:Promise.resolve(usage),finishReason:Promise.resolve(finishReason),tripwire};
      }) as unknown as typeof agent.stream;
    }
    try {
      const events:ResponseEvent[]=[];
      const result = await runtime.assess(patient,e=>events.push(e));
      const retried = fault === "length_once" || fault === "length_twice";
      assert.equal(judgeCalls.length,retried ? 2 : 1,fault);
      assert.equal(judgeCalls[0].limit,GRAPH_OUTPUT_LIMITS.judge);
      if (retried) { assert.equal(judgeCalls[1].limit,GRAPH_OUTPUT_LIMITS.truncatedJudgeRecovery); assert.equal(judgeCalls[0].prompt,judgeCalls[1].prompt); }
      const reviews = result.agents!.filter(a=>a.role === "critic");
      assert.equal(reviews.length,judgeCalls.length);
      if (retried) { assert.equal(reviews[0].failure,"INCOMPLETE_MODEL_STREAM"); assert.deepEqual(reviews[0].usage,usage); }
      assert.equal(result.status,fault === "length_once" ? "complete" : "review_required",fault);
      assert.equal(events.filter(e=>e.kind === "patient_reply").length,fault === "length_once" ? 1 : 0);
      if (fault === "tripwire_length") assert.equal(reviews[0].failure,"MODEL_TRIPWIRE");
    } finally {await runtime.close();}
  }
});
test("compact safety wire is normalized and retained through the real stream boundary", async () => {
  for(const expanded of [false,true]){
    const runtime=createGraphRuntime(mkdtempSync(join(tmpdir(),"compact-safety-stream-")),async()=>retrieval,undefined,undefined,resolveGraphConfig({COUNSEL_GRAPH_SAFETY_STYLE:"compact"}));
    const wire={action:"NONE",basis:[],actionBasis:null,physicalRequirement:null,reason:expanded?"No acute care instruction established. ".repeat(8):"No early care instruction established."};
    for(const role of ["context","safety","disposition","judge"] as const){
      const agent=runtime.mastra.getAgent(role);
      agent.stream=(async(prompt:string)=>({fullStream:(async function*(){yield{type:"text-delta",payload:{text:"partial never displayed"}};})(),object:Promise.resolve(role==="context"?context:role==="safety"?wire:role==="disposition"?{...draft,citations:draft.citations.map(({quote:_quote,...c})=>({...c,quoteId:"q0"}))}:judgment(JSON.parse(prompt))),usage:Promise.resolve(usage),finishReason:Promise.resolve("stop")})) as unknown as typeof agent.stream;
    }
    try{const result=await runtime.assess(patient);const safety=result.agents!.find(a=>a.role==="emergency")!;
      assert.equal(result.status,"complete");assert.deepEqual(safety.rawOutput,wire);assert.deepEqual(safety.output,{...wire,patientMessage:"",activeEms:null});
      assert.equal((result.graph as unknown as {safetyWireConformance:string}).safetyWireConformance,expanded?"expanded_envelope":"conformant");assert.equal(result.responseEvents?.some(e=>e.kind==="action"),false);
    }finally{await runtime.close();}
  }
});
test("routing metadata repair revalidates coupled prose without gratuitous wording changes", () => {
  const sources=[{id:hit.chunk.id,text:sourceText}], allowed=["routing","patientMessage","reason"] as const;
  const binding=graphRepair.prepare(draft,sources,[...allowed]);
  const applied=graphRepair.apply(draft,sources,[...allowed],{...binding,protocol:undefined,allowedFields:undefined,edits:[
    {field:"routing",value:{disposition:draft.disposition,reviewPriority:draft.reviewPriority,workType:"clinical_review",transportIntent:null}},
    {field:"patientMessage",value:draft.patientMessage},{field:"reason",value:draft.reason}
  ]});
  // Build the strict wire object; protocol/allowedFields are request-only.
  const raw={baseDraftHash:binding.baseDraftHash,evidenceHash:binding.evidenceHash,edits:[{field:"routing",value:{disposition:draft.disposition,reviewPriority:draft.reviewPriority,workType:"clinical_review",transportIntent:null}},{field:"patientMessage",value:draft.patientMessage},{field:"reason",value:draft.reason}]};
  assert.equal(applied.output,null);
  const fixed=graphRepair.apply(draft,sources,[...allowed],raw);
  assert.equal(fixed.audit.status,"applied"); assert.deepEqual(fixed.audit.changedFields,["routing"]);
  assert.equal(fixed.output?.patientMessage,draft.patientMessage); assert.equal(fixed.output?.reason,draft.reason);
});
test("revise without an actionable repair scope retains the draft and makes no impossible paid call", async () => {
  const {result} = await run(async (role,prompt) => {
    if (role === "judge") { const j = judgment(JSON.parse(prompt)); j.verdict="revise"; j.correction="A clinician must resolve an unspecified remaining concern."; j.criteria[0].verdict="fail"; return {output:j,usage}; }
    return {output:role === "context" ? context : role === "safety" ? none : draft, usage};
  }, async()=>retrieval, resolveGraphConfig());
  assert.equal(result.failure,"REPAIR_SCOPE_UNAVAILABLE"); assert.equal(result.modelCalls,4);
  assert.equal(result.graph?.corrections,0); assert.equal(result.graph?.repair?.status,"rejected");
  assert.equal(result.answer,null); assert.deepEqual(result.rejectedAnswer,draft);
});
test("patch citations use current span IDs, arrays replace atomically and routing cannot change alone", () => {
  const sources = [{ id: hit.chunk.id, text: sourceText }];
  const bind = graphRepair.prepare(draft, sources, ["citations", "routing"]);
  const patch = { baseDraftHash: bind.baseDraftHash, evidenceHash: bind.evidenceHash, edits: [{ field: "citations", value: [{ ...draft.citations[0], quote: undefined, quoteId: "q0" }] }] };
  // Undefined quote is still an unknown key: strict wire boundary rejects it.
  assert.equal(graphRepair.apply(draft, sources, ["citations"], patch).output, null);
  const { quote: _quote, ...citation } = draft.citations[0];
  patch.edits[0].value = [{ ...citation, quote: undefined, quoteId: "q999" }];
  const valid = { ...patch, edits: [{ field: "citations", value: [{ ...citation, quoteId: "q0" }] }] };
  assert.equal(graphRepair.apply(draft, sources, ["citations"], valid).output?.citations[0].quote, quoteSpans(sourceText)[0].text);
  assert.equal(graphRepair.apply(draft, sources, ["citations"], { ...valid, edits: [{ field: "citations", value: [{ ...citation, quoteId: "q999" }] }] }).output, null);
  assert.equal(graphRepair.apply(draft, sources, ["routing"], { ...valid, edits: [{ field: "routing", value: { disposition: "SELF_CARE", reviewPriority: null, workType: null, transportIntent: null } }] }).audit.failure, "INCOMPLETE_ROUTING_REPAIR");
});
test("retrieval hints survive rejected clinical extraction, never becoming accepted patient facts", () => {
  const invalid = { ...context, findings: [{ finding: "Invented weakness", status: "reported", quote: "new weakness" }], question: { text: "Are you weak now?", why: "This could change care timing.", quote: "new weakness" } };
  const admitted = admitGraphContext(invalid, patient);
  assert.equal(admitted.context, null);
  assert.deepEqual(admitted.admission, { clinicalContextAccepted: false, querySource: "isolated_query_hints", queries: context.queries, clinicalValidation: false });
  assert.equal(admitGraphContext(context, patient).admission.querySource, "accepted_context");
  assert.equal(admitGraphContext({ ...context, findings: [{ finding: "Fever", status: "unknown", quote: "No fever" }] }, patient).context, null);
  for (const queries of [[], ["  "], ["x".repeat(161)], ["patient\nmessage"], ["aab", "bbc", "ccd", "dde"], "migraine"]) {
    const a = admitGraphContext({ ...invalid, queries }, patient);
    assert.equal(a.admission.querySource, "unavailable"); assert.deepEqual(a.admission.queries, []);
  }
  assert.equal(admitGraphContext(null, patient).admission.querySource, "unavailable");
  assert.deepEqual(admitGraphContext({ ...invalid, queries: ["migraine refill", "migraine refill"] }, patient).admission.queries, ["migraine refill"]);
});
test("a finding quote failure no longer forces an evidence-free first draft or publishes its question", async () => {
  let searches = 0, drafts = 0;
  const { result, events, directory } = await run(async (role, prompt) => {
    if (role === "disposition") {
      drafts++; const packet = JSON.parse(prompt);
      assert.equal(packet.patient, patient); assert.equal(packet.context, null);
      assert.ok(packet.sources.some((s: { id: string }) => s.id === hit.chunk.id));
      assert.doesNotMatch(prompt, /Invented weakness/);
    }
    return { output: role === "context" ? { ...context, findings: [{ finding: "Invented weakness", status: "reported", quote: "not in the patient message" }], question: { text: "Do you have weakness?", why: "This could change care timing.", quote: "usual migraine" } } : role === "safety" ? none : role === "disposition" ? draft : judgment(JSON.parse(prompt)), usage };
  }, async () => { searches++; return retrieval; });
  assert.equal(result.status, "complete"); assert.equal(result.modelCalls, 4);
  assert.equal(searches, 1); assert.equal(drafts, 1); assert.equal(result.graph?.corrections, 0);
  assert.equal(result.graph?.context, null); assert.equal(result.graph?.contextAdmission?.querySource, "isolated_query_hints");
  assert.equal(result.agents?.find(a => a.role === "history")?.failure, "CONTEXT_CONTRACT_FAILED");
  assert.ok(!events.some(e => e.kind === "intake_question"));
  const journal = readFileSync(join(directory, "events", `${result.runId}.jsonl`), "utf8").trim().split("\n").map(x => JSON.parse(x));
  assert.deepEqual(journal.find(e => e.type === "context_admission")?.admission, result.graph?.contextAdmission);
  assert.deepEqual(journal[0].tracePolicy, GRAPH_TRACE_POLICY);
});
test("retrieval telemetry is bounded, redacted, and cannot discard usable evidence", async () => {
  const records: unknown[] = [];
  const tracing = { currentSpan: { createChildSpan: (options: unknown) => { records.push(options); return { end: (metadata: unknown) => records.push(metadata), error: (error: unknown) => records.push(error) }; } } } as unknown as TracingContext;
  assert.equal(await traceGraphSearch(async () => retrieval, "private query", new AbortController().signal, tracing, "initial", 0), retrieval);
  assert.match(JSON.stringify(records), /queryHash|corpusHash|hitCount/); assert.doesNotMatch(JSON.stringify(records), /private query|Migraine source fixture/);
  const broken = { currentSpan: { createChildSpan: () => { throw new Error("broken telemetry"); } } } as unknown as TracingContext;
  assert.equal(await traceGraphSearch(async () => retrieval, "query", new AbortController().signal, broken, "revision", 1), retrieval);
  assert.equal(await traceGraphSearch(async () => { throw new Error("private provider body"); }, "query", new AbortController().signal, tracing, "revision", 1), null);
  assert.equal((records.at(-1) as { error: Error }).error.message, "RETRIEVAL_FAILED");
  const cancelled = new AbortController(); cancelled.abort();
  assert.equal(await traceGraphSearch(async () => { throw new Error("private cancelled request"); }, "query", cancelled.signal, tracing, "initial", 0), null);
  assert.equal((records.at(-1) as { error: Error }).error.message, "RETRIEVAL_CANCELLED");
  assert.doesNotMatch(JSON.stringify(records), /private provider body/);
  assert.deepEqual(GRAPH_TRACE_POLICY.excludeSpanTypes, [SpanType.MODEL_CHUNK]); // model generations, steps, usage and failures stay
});
test("Mastra shadow step logs after context and before retrieval without anchoring or overriding clinical models", async () => {
  const prompts: Record<string, string>[] = [], config = resolveGraphConfig({ COUNSEL_FACT_GRAPH_MODE: "shadow", COUNSEL_GRAPH_CONTEXT_MODEL: "openai/offline-fixture" });
  // Intentionally false fact extraction, but exact quote identity. A mandatory
  // floor here would recreate the migraine over-triage that this user found.
  const factObservations = [{ factId: "anaphylaxis_pattern", subject: "patient", episodeId: "now", status: "present", temporality: "current", quote: "usual migraine" }];
  const { result, directory, events } = await run(async (role, prompt) => {
    prompts.push({ role, prompt });
    return { output: role === "context" ? { ...context, factObservations } : role === "safety" ? none : role === "disposition" ? draft : judgment(JSON.parse(prompt)), usage };
  }, async () => retrieval, config);
  assert.equal(result.status, "complete"); assert.equal(result.modelCalls, 4);
  assert.equal(result.answer?.disposition, "ASYNC_PHYSICIAN"); assert.equal(result.answer?.reviewPriority, "priority");
  assert.equal(result.graph?.factGraph?.candidateFloor, "EMERGENCY_NOW");
  assert.equal(result.graph?.factGraph?.affectedRouting, false);
  assert.equal(result.agents?.find(a => a.role === "history")?.model, "openai/offline-fixture");
  assert.ok(!events.some(e => e.kind === "action"));
  for (const { role, prompt } of prompts.filter(p => p.role !== "context")) {
    assert.doesNotMatch(prompt, /anaphylaxis_pattern|factObservations|candidateFloor|GRAPH_PATHS|research_seed/, role);
  }
  const records = readFileSync(join(directory, "events", `${result.runId}.jsonl`), "utf8").trim().split("\n").map(x => JSON.parse(x));
  const shadowIndex = records.findIndex(r => r.type === "fact_graph_shadow");
  assert.ok(shadowIndex > records.findIndex(r => r.execution?.role === "history"));
  assert.ok(shadowIndex < records.findIndex(r => r.execution?.role === "disposition"));
  assert.deepEqual(records[shadowIndex].report, result.graph?.factGraph);
});
test("missing or invalid shadow observations do not invalidate otherwise valid context or patient response", async () => {
  for (const factObservations of [undefined, [{ factId: "unrecognized" }], [{ factId: "fever", subject: "patient", episodeId: "now", status: "present", temporality: "current", quote: "fabricated quote" }]]) {
    const { result } = await run(async (role, prompt) => ({ output: role === "context" ? { ...context, factObservations } : role === "safety" ? none : role === "disposition" ? draft : judgment(JSON.parse(prompt)), usage }), async () => retrieval, resolveGraphConfig({ COUNSEL_FACT_GRAPH_MODE: "shadow" }));
    assert.equal(result.status, "complete"); assert.deepEqual(result.graph?.context, context);
    assert.equal(result.graph?.factGraph?.candidateFloor, null); assert.ok(result.graph!.factGraph!.violations.length > 0);
    assert.equal(result.modelCalls, 4);
  }
});
test("default-off mode adds neither canonical extraction prompt nor shadow report/event", async () => {
  const { result, directory } = await run(async (role, prompt) => ({ output: role === "context" ? context : role === "safety" ? none : role === "disposition" ? draft : judgment(JSON.parse(prompt)), usage }));
  assert.equal(result.status, "complete"); assert.equal(result.graph?.factGraph, undefined);
  assert.equal(result.graph?.clinicalPolicyVersion, CLINICAL_POLICY_VERSION);
  const started = JSON.parse(readFileSync(join(directory, "events", `${result.runId}.jsonl`), "utf8").split("\n")[0]);
  assert.equal(started.clinicalPolicyVersion, CLINICAL_POLICY_VERSION);
  assert.equal(started.promptHash, result.promptHash);
  assert.doesNotMatch(readFileSync(join(directory, "events", `${result.runId}.jsonl`), "utf8"), /fact_graph_shadow|factObservations/);
});
test("attribution and quote guards do not turn trigger strings into emergency instructions", () => {
  const positive = { action: "EMS_NOW", basis: [{ quote: "chest pressure", interpretation: "Potential acute clinical concern", currentPatient: true, present: true }], reason: "Current symptoms warrant emergency action.", patientMessage: "Call 911 now. Do not drive yourself." };
  assert.equal(noticeFromSafety(positive, "No matching quote"), null);
  assert.equal(noticeFromSafety({ ...positive, basis: [{ ...positive.basis[0], present: false }] }, "I deny chest pressure"), null);
  assert.equal(noticeFromSafety(none, "chest pressure stroke black tarry stool"), null);
  assert.equal(noticeFromSafety(positive, "I have chest pressure")?.source, "emergency_agent");
  const fourQuotes = { ...positive, basis: Array.from({ length: 4 }, () => positive.basis[0]), patientMessage: "EMS will perform an invented procedure." };
  const notice = noticeFromSafety(fourQuotes, "I have chest pressure");
  assert.match(notice!.directive, /^Call 911 now/);
  assert.doesNotMatch(notice!.directive, /invented procedure/);
  assert.equal(noticeFromSafety({ ...fourQuotes, basis: [...fourQuotes.basis, { ...positive.basis[0], present: false }] }, "I have chest pressure"), null);
});
const c02Message = "45M. I've had crushing pressure in the center of my chest for the last 30 minutes, it's going into my left arm and I feel sweaty and a bit sick to my stomach. I have high cholesterol.";
// Verbatim safety classification from the retained v6 C02 failure, except the
// separately supplied v8 actionBasis in tests below. Historical results stay intact.
const c02Safety = { action: "EMS_NOW", basis: [
  { quote: "crushing pressure in the center of my chest for the last 30 minutes, it's going into my left arm and I feel sweaty and a bit sick to my stomach", interpretation: "Classic acute coronary syndrome presentation with chest pressure, radiation to left arm, diaphoresis, and nausea in a patient with high cholesterol risk factor", currentPatient: true, present: true },
  { quote: "I have high cholesterol", interpretation: "Known cardiovascular risk factor that increases probability of acute coronary event in setting of current symptoms", currentPatient: true, present: false },
], reason: "Acute chest pressure with classic ACS features requires immediate emergency transport and evaluation.", patientMessage: "", physicalRequirement: null };
test("explicit sufficient acute basis is not cancelled by an auxiliary background finding", () => {
  const legacy = assessSafetyAdmission(c02Safety, c02Message);
  assert.equal(legacy.notice, null); // never silently reinterpret historical output
  assert.equal(legacy.admission.code, "ACTION_BASIS_NOT_CURRENT_PRESENT");
  assert.equal(legacy.admission.basisMode, "legacy_all_basis");
  const current = assessSafetyAdmission({ ...c02Safety, actionBasis: { indices: [0], sufficient: true } }, c02Message);
  assert.match(current.notice!.directive, /^Call 911 now/);
  assert.deepEqual(current.admission.supportingBasisIndices, [0]);
  assert.deepEqual(current.admission.contextualBasisIndices, [1]);
  assert.equal(current.admission.code, "ACTION_ADMITTED");
  assert.equal(current.admission.clinicalValidation, false); // model assessment, not clinical proof
});
test("admission failures are distinct from no early action and never salvage invalid selected evidence", () => {
  const explicit = { ...c02Safety, actionBasis: { indices: [0], sufficient: true } };
  const code = (value: unknown, message = c02Message) => assessSafetyAdmission(value, message).admission.code;
  assert.equal(code(none), "NO_EARLY_ACTION");
  assert.equal(assessSafetyAdmission(none, c02Message).admission.status, "not_requested");
  assert.equal(code({ action: "EMS_NOW" }), "INVALID_SAFETY_OUTPUT");
  assert.equal(code({ ...explicit, actionBasis: { indices: [0], sufficient: false } }), "ACTION_BASIS_NOT_SUFFICIENT");
  for (const indices of [[0, 0], [2]]) assert.equal(code({ ...explicit, actionBasis: { indices, sufficient: true } }), "ACTION_BASIS_REFERENCE_INVALID");
  for (const indices of [[-1], [0.5], []]) assert.equal(code({ ...explicit, actionBasis: { indices, sufficient: true } }), "INVALID_SAFETY_OUTPUT");
  assert.equal(code({ ...explicit, actionBasis: { indices: [1], sufficient: true } }), "ACTION_BASIS_NOT_CURRENT_PRESENT");
  assert.equal(code({ ...explicit, basis: [{ ...c02Safety.basis[0], currentPatient: false }, c02Safety.basis[1]] }), "ACTION_BASIS_NOT_CURRENT_PRESENT");
  assert.equal(code({ ...explicit, basis: [c02Safety.basis[0], { ...c02Safety.basis[1], quote: "Invented context even though it is not selected" }] }), "PATIENT_QUOTE_MISMATCH");
});
test("admission honors essential-denial and insufficient-context judgments without inferring emergencies from text", () => {
  for (const [message, currentPatient] of [
    ["I deny chest pressure. I have high cholesterol.", true],
    ["I had chest pressure years ago. I have high cholesterol.", true],
    ["What if I develop chest pressure? I have high cholesterol.", true],
    ["My father's chest pressure worries me. I have high cholesterol.", false],
  ] as const) {
    const basis = [{ quote: "chest pressure", interpretation: "Not an established current acute symptom of this patient", currentPatient, present: false }, { quote: "I have high cholesterol", interpretation: "Positive background risk factor, not a sufficient acute emergency basis", currentPatient: true, present: true }];
    const unsafeSelection = { ...c02Safety, basis, actionBasis: { indices: [0], sufficient: true } };
    assert.equal(assessSafetyAdmission(unsafeSelection, message).admission.code, "ACTION_BASIS_NOT_CURRENT_PRESENT");
    assert.equal(assessSafetyAdmission({ ...unsafeSelection, actionBasis: { indices: [1], sufficient: false } }, message).admission.code, "ACTION_BASIS_NOT_SUFFICIENT");
    assert.equal(noticeFromSafety(none, message), null);
  }
  // A model that falsely calls a background factor sufficient can still err.
  // No substring heuristic can establish semantic sufficiency; live adversarial
  // evaluation and the independent early-action review are required separately.
});
test("C02 early instruction is issued and persisted while independent final generation remains pending", { timeout: 10_000 }, async () => {
  let finishDraft!: () => void, startedDraft!: () => void, sawAction!: () => void;
  const draftPending = new Promise<void>(resolve => { finishDraft = resolve; });
  const draftStarted = new Promise<void>(resolve => { startedDraft = resolve; });
  const actionReceived = new Promise<void>(resolve => { sawAction = resolve; });
  const directory = mkdtempSync(join(tmpdir(), "counsel-graph-c02-"));
  const runtime = createGraphRuntime(directory, async () => retrieval, async role => {
    if (role === "disposition") { startedDraft(); await draftPending; throw new Error("Offline final-model failure after controlled delay"); }
    return { output: role === "safety" ? { ...c02Safety, actionBasis: { indices: [0], sufficient: true } } : { ...context, findings: [{ finding: "Current chest pressure", status: "reported", quote: "crushing pressure" }], question: null }, usage };
  });
  const events: ResponseEvent[] = []; let completed = false;
  const pending = runtime.assess(c02Message, event => { events.push(event); if (event.kind === "action") sawAction(); }).then(result => { completed = true; return result; });
  let guard: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([Promise.all([draftStarted, actionReceived]), new Promise((_, reject) => { guard = setTimeout(() => reject(new Error("Early instruction was not issued independently")), 3000); })]);
    assert.equal(completed, false);
    assert.deepEqual(events.map(e => e.kind), ["action"]);
    finishDraft();
    const result = await pending;
    assert.equal(result.status, "review_required");
    assert.match(result.answer!.patientMessage, /^Call 911 now/);
    assert.equal(result.graph?.safetyAdmission?.code, "ACTION_ADMITTED");
    const records = readFileSync(join(directory, "events", `${result.runId}.jsonl`), "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.ok(records.findIndex(r => r.type === "response_event" && r.event.kind === "action") < records.findIndex(r => r.type === "agent_execution" && r.execution.role === "disposition"));
    assert.deepEqual(JSON.parse(readFileSync(join(directory, "runs", `${result.runId}.json`), "utf8")).graph.safetyAdmission, result.graph?.safetyAdmission);
  } finally { clearTimeout(guard); finishDraft(); await pending; await runtime.close(); }
});
test("judge requires all criteria, exact anchors, and source support rather than citation presence", () => {
  const units = [{ id: "patient", text: patient }, { id: `source:${hit.chunk.id}`, text: sourceText }], j = judgment({ units });
  assert.ok(validateGraphJudge(j, units, true, null));
  assert.equal(validateGraphJudge(j, units, false, null), null);
  assert.equal(validateGraphJudge({ ...j, criteria: j.criteria.slice(1) }, units, true, null), null);
  assert.equal(validateGraphJudge({ ...j, criteria: j.criteria.map(c => ({ ...c, anchors: [{ unit: "invented", quote: "usual migraine" }] })) }, units, true, null), null);
  assert.equal(graphSourceIntegrity({ ...draft, citations: [{ ...draft.citations[0], quote: "An invented claim appears nowhere." }] }, [hit]), false);
  const earlyUnits = [...units, { id: "early", text: "Incorrect emergency instruction" }];
  assert.equal(validateGraphJudge({ ...j, criteria: j.criteria.map(c => c.id === "overtriage" ? { ...c, anchors: [{ unit: "early", quote: "Incorrect emergency instruction" }] } : c) }, earlyUnits, true, null), null);
  assert.equal(validateGraphJudge({ ...j, reviewScope: "mixed-all-agent-artifacts" }, units, true, null), null);
});
test("structured judge anchors preserve exact decoded quotations without hiding a real revision", () => {
  const disputed = 'Patient states "No fever" but this is self-assessed, not a measured temperature.';
  const units = [{ id: "patient", text: patient }, { id: "draft", text: JSON.stringify({ ...draft, vitalSigns: disputed }) }, { id: `source:${hit.chunk.id}`, text: sourceText }];
  const j = judgment({ units }); j.verdict = "revise";
  j.criteria = j.criteria.map(c => c.id === "patient_grounding" ? { ...c, verdict: "fail", reason: "A symptom denial does not establish whether temperature was measured.", anchors: [{ unit: "draft", quote: disputed }] } : c);
  const result = validateGraphJudge(j, units, true, null);
  assert.equal(result?.verdict, "revise");
  assert.equal(result?.criteria.find(c => c.id === "patient_grounding")?.verdict, "fail");
  assert.equal(units[1].text.includes(disputed), false);
  for (const text of ['A "quoted" value', "Line one\nLine two", "A backslash \\ value"]) {
    assert.equal(exactStructuredJudgeAnchor({ id: "draft", text: JSON.stringify({ value: text }) }, text), true);
    assert.equal(exactStructuredJudgeAnchor({ id: "issued_question", text: JSON.stringify([{ text }]) }, text), true);
    for (const id of ["patient", "source:fixture", "invented"]) assert.equal(exactStructuredJudgeAnchor({ id, text: JSON.stringify({ value: text }) }, text), false);
  }
  assert.equal(exactStructuredJudgeAnchor({ id: "draft", text: JSON.stringify({ first: "alpha", second: "beta" }) }, "alphabeta"), false);
  assert.equal(exactStructuredJudgeAnchor({ id: "draft", text: JSON.stringify({ value: 'No "fever"' }) }, 'No "pain"'), false);
  assert.equal(exactStructuredJudgeAnchor({ id: "draft", text: '{"value":broken}' }, 'No "fever"'), false);
  j.criteria[2].anchors = [{ unit: "patient", quote: disputed }];
  assert.equal(validateGraphJudge(j, units, true, null), null);
});

const taskClause = "The clinician will review your medication history and contraindications before prescribing.";
const taskRecommendation = "I recommend priority review by a Counsel clinician in this thread today about renewing your prescription.";
const taskAvailability = "If today's review isn't available here, contact your usual prescriber or another same-day prescribing service rather than waiting.";
function taskReview(value = draftSchema.parse({ ...draft, patientMessage: `${taskRecommendation} ${taskClause} ${taskAvailability}` })) {
  const units = [{ id: "patient", text: patient }, { id: "draft", text: JSON.stringify(value) }, { id: `source:${hit.chunk.id}`, text: sourceText }];
  const j = judgment({ units });
  j.criteria = j.criteria.map(c => c.id === "ownership" ? { ...c, anchors: [{ unit: "draft", quote: taskClause }] } : c);
  const reviewed = validateGraphJudge({ ...j, ownershipTaskReview: [{ clause: taskClause, classification: "recommended_task", recommendationQuote: taskRecommendation, availabilityQuote: taskAvailability }] }, units, true, null)!;
  const raw = checkAnswer({ ...value, evidence: [] }, patient, [], null).find(c => c.id === "no_unconfirmed_handoff")!;
  return { value, reviewed, raw, hash: sha256(JSON.stringify(value)) };
}
test("future clinician-task finding needs exact independently reviewed current-draft context", () => {
  const { value, reviewed, raw, hash } = taskReview();
  assert.equal(raw.status, "fail");
  const result = reviewHandoffLanguage(value, reviewed, hash, raw);
  assert.equal(result.check.status, "pass");
  assert.equal(result.audit.raw.status, "fail");
  assert.equal(result.audit.status, "resolved_recommended_task");
  assert.equal(result.audit.clinicalApproval, false);
  for (const mutate of [
    (j: GraphJudge) => { j.ownershipTaskReview = []; },
    (j: GraphJudge) => { j.ownershipTaskReview![0].classification = "unconfirmed_commitment"; },
    (j: GraphJudge) => { j.ownershipTaskReview![0].recommendationQuote = "I recommend invented context."; },
    (j: GraphJudge) => { j.ownershipTaskReview![0].availabilityQuote = null; },
    (j: GraphJudge) => { j.ownershipTaskReview![0].clause = "The clinician will review"; },
    (j: GraphJudge) => { j.criteria.find(c => c.id === "ownership")!.anchors = [{ unit: "draft", quote: "The clinician will review" }]; },
    (j: GraphJudge) => { j.criteria.find(c => c.id === "ownership")!.verdict = "abstain"; },
    (j: GraphJudge) => { j.verdict = "revise"; },
  ]) { const changed = structuredClone(reviewed); mutate(changed); assert.equal(reviewHandoffLanguage(value, changed, hash, raw).check.status, "fail"); }
  assert.equal(reviewHandoffLanguage(value, reviewed, "stale-draft-hash", raw).check.status, "fail");
  assert.equal(reviewHandoffLanguage({ ...value, reason: "A changed draft requires a new bound review." }, reviewed, hash, raw).check.status, "fail");
  assert.equal(reviewHandoffLanguage(value, null, hash, raw).check.status, "fail");
});
test("ownership context never clears actual operations, response guarantees or unqualified promises", () => {
  for (const extra of ["I've sent your request to a clinician.", "I have booked your appointment.", "Your request has been accepted.", "A clinician has accepted your case.", "I've dispatched an ambulance.", "A clinician will review within 24 hours."]) {
    const { value, reviewed, raw, hash } = taskReview(draftSchema.parse({ ...draft, patientMessage: `${taskRecommendation} ${taskClause} ${taskAvailability} ${extra}` }));
    assert.equal(reviewHandoffLanguage(value, reviewed, hash, raw).check.status, "fail", extra);
  }
  const { reviewed } = taskReview();
  const value = draftSchema.parse({ ...draft, patientMessage: taskClause });
  const raw = checkAnswer({ ...value, evidence: [] }, patient, [], null).find(c => c.id === "no_unconfirmed_handoff")!;
  assert.equal(reviewHandoffLanguage(value, reviewed, sha256(JSON.stringify(value)), raw).check.status, "fail", "no qualifying recommendation or fallback exists");
  for (const limitation of ["This recommendation does not confirm a clinician has accepted the request.", "There is no confirmation that a clinician has accepted the request."]) {
    assert.equal(handoffLanguageFindings(limitation).length, 0);
    assert.equal(handoffLanguageFindings(`${limitation} Your request has been accepted.`).length, 1);
    assert.equal(handoffLanguageFindings(limitation.replace(/\.$/, "; I have booked your appointment.")).length, 1);
  }
});
test("contextually resolved ownership heuristic releases without an unnecessary repair and retains audit", async () => {
  const { value, reviewed } = taskReview();
  const { result, directory } = await run(async role => ({ output: role === "context" ? context : role === "safety" ? none : role === "disposition" ? value : reviewed, usage }));
  assert.equal(result.status, "complete");
  assert.equal(result.modelCalls, 4);
  assert.equal(result.graph?.corrections, 0);
  assert.equal(result.graph?.ownershipLanguageReview?.raw.status, "fail");
  assert.equal(result.graph?.ownershipLanguageReview?.status, "resolved_recommended_task");
  assert.equal(JSON.parse(readFileSync(join(directory, "runs", `${result.runId}.json`), "utf8")).graph.ownershipLanguageReview.raw.status, "fail");
});
test("judge sees issued questions but not unissued context drafts", async () => {
  const prompts: string[] = [];
  await run(async (role, prompt) => { if (role === "judge") prompts.push(prompt); return { output: role === "context" ? { ...context, question: { text: "Any recent head injury?", why: "A new injury could change the clinical evaluation.", quote: "usual migraine" } } : role === "safety" ? none : role === "disposition" ? draft : judgment(JSON.parse(prompt)), usage }; });
  const units = JSON.parse(prompts[0]).units as {id: string; text: string}[];
  assert.ok(units.some(u => u.id === "issued_question"));
  assert.ok(!units.some(u => u.id === "context"));
});
test("candidate nonblocking question metadata makes no relevance verdict and cannot create a routing hold", () => {
  const event = { kind: "intake_question" as const, questionId: "adaptive-0123456789abcdef", text: "Any recent head injury?", quote: "usual migraine", why: "An injury could change the necessary clinical evaluation.", blocksRouting: false as const };
  assert.equal(validAdaptiveQuestion(event, patient), true);
  assert.equal(responseEventSchema.safeParse(event).success, true);
  assert.equal(event.blocksRouting, false);
  assert.ok(!("decisionChanging" in event));
  for (const extra of [{ blocksRouting: true }, { decisionChanging: true }, { decisionChanging: false }, { routingConsequence: null }, { interimInstruction: "Please wait for an answer." }]) {
    const contradictory = { ...event, ...extra };
    assert.equal(responseEventSchema.safeParse(contradictory).success, false);
    assert.equal(validAdaptiveQuestion(contradictory as Extract<ResponseEvent, { kind: "intake_question" }>, patient), false);
  }
  const { blocksRouting: _blocks, ...legacy } = event;
  assert.equal(validAdaptiveQuestion({ ...legacy, decisionChanging: false }, patient), true); // incumbent contract unchanged
});
test("question publication waits for safety in both branch orders without holding retrieval or disposition", { timeout: 15_000 }, async () => {
  const question = { text: "Any recent head injury?", why: "A new injury could change the necessary evaluation.", quote: "usual migraine" };
  const emergency = { ...none, action: "EMS_NOW", basis: [{ quote: "usual migraine", interpretation: "Synthetic publication ordering fixture, not clinical assessment", currentPatient: true, present: true }] };
  const cases = [
    { name: "normal", output: none, status: "published", action: false },
    { name: "emergency", output: emergency, status: "suppressed_emergency", action: true },
    { name: "rejected emergency", output: { ...emergency, basis: [{ ...emergency.basis[0], present: false }] }, status: "suppressed_emergency", action: false },
    { name: "invalid safety", output: { action: "NONE" }, status: "suppressed_safety_unavailable", action: false },
    { name: "missing safety", output: null, status: "suppressed_safety_unavailable", action: false },
  ];
  for (const first of ["context", "safety"] as const) for (const item of cases) {
    let releaseOther!: () => void, firstCall!: () => void, clinicalAdvanced!: () => void;
    const gate = new Promise<void>(resolve => { releaseOther = resolve; });
    const firstFinished = new Promise<void>(resolve => { firstCall = resolve; });
    const reachedDraft = new Promise<void>(resolve => { clinicalAdvanced = resolve; });
    const directory = mkdtempSync(join(tmpdir(), "counsel-question-order-"));
    const packets: { units: { id: string; text: string }[]; questionSemantics: string }[] = [], events: ResponseEvent[] = [];
    let searches = 0;
    const runtime = createGraphRuntime(directory, async () => { searches++; return retrieval; }, async (role, prompt) => {
      if ((role === "safety" && first === "context") || (role === "context" && first === "safety")) await gate;
      if (role === first) firstCall();
      if (role === "context") return { output: { ...context, question }, usage };
      if (role === "safety") { if (item.output === null) throw new Error("Safety model unavailable"); return { output: item.output, usage }; }
      if (role === "disposition") { clinicalAdvanced(); return { output: draft, usage }; }
      const packet = JSON.parse(prompt); packets.push(packet);
      return { output: judgment(packet, item.action ? "supported" : "none"), usage };
    });
    const pending = runtime.assess(patient, event => events.push(event));
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([first === "context" ? reachedDraft : firstFinished.then(() => new Promise<void>(resolve => setImmediate(resolve))), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(`${first}/${item.name} branch stalled`)), 3000); })]);
      if (first === "context") { assert.ok(searches > 0); assert.equal(events.length, 0); } // only publication is waiting
      else assert.deepEqual(events.map(event => event.kind), item.action ? ["action"] : []);
      releaseOther();
      const result = await pending;
      const questions = events.filter(event => event.kind === "intake_question");
      assert.equal(questions.length, item.status === "published" ? 1 : 0, `${first}/${item.name}`);
      assert.equal(result.graph?.questionPublication?.status, item.status);
      assert.deepEqual(result.graph?.context?.question, question); // suppressed proposals remain inspectable
      for (const packet of packets) {
        assert.equal(packet.units.some(unit => unit.id === "issued_question"), item.status === "published");
        assert.match(packet.questionSemantics, /not a decisionChanging verdict/);
      }
      if (questions.length) { assert.equal(questions[0].blocksRouting, false); assert.equal(questions[0].decisionChanging, undefined); assert.equal(validAdaptiveQuestion(questions[0], patient), true); }
      const persisted = JSON.parse(readFileSync(join(directory, "runs", `${result.runId}.json`), "utf8"));
      assert.deepEqual(persisted.responseEvents, events);
      assert.equal(result.modelCalls, 4);
    } finally { clearTimeout(timeout); releaseOther(); await pending; await runtime.close(); }
  }
});
test("a genuinely inappropriate published question remains a failed review after bounded repair", async () => {
  const question = { text: "What is your favorite color?", why: "Deliberately irrelevant clinical question fixture.", quote: "usual migraine" };
  const { result, events } = await run(async (role, prompt) => {
    const data = JSON.parse(prompt), j = judgment(data);
    return { output: role === "context" ? { ...context, question } : role === "safety" ? none : role === "disposition" ? draft : { ...j, verdict: "revise", correction: "This irrelevant issued question cannot be undone by a later correct draft.", criteria: j.criteria.map(c => c.id === "clarification_delay" ? { ...c, verdict: "fail", reason: "The actually issued question was irrelevant to any necessary clinical decision.", anchors: [{ unit: "issued_question", quote: question.text }] } : c) }, usage };
  });
  assert.equal(result.status, "review_required");
  assert.equal(result.graph?.corrections, 1);
  assert.equal(result.graph?.judge?.criteria.find(c => c.id === "clarification_delay")?.verdict, "fail");
  assert.equal(result.graph?.questionPublication?.status, "published");
  assert.deepEqual(events.map(event => event.kind), ["intake_question"]);
  assert.equal(result.modelCalls, 6);
});
test("publisher enforces the shared question contract and retains rejected internal proposals", async () => {
  const question = { text: "Can you wait for a reply before seeking help?", why: "Deliberately invalid waiting instruction fixture.", quote: "usual migraine" };
  const { result, events } = await run(async (role, prompt) => ({ output: role === "context" ? { ...context, question } : role === "safety" ? none : role === "disposition" ? draft : judgment(JSON.parse(prompt)), usage }));
  assert.equal(result.status, "complete");
  assert.equal(result.graph?.questionPublication?.status, "rejected_question_contract");
  assert.deepEqual(result.graph?.context?.question, question);
  assert.ok(!events.some(event => event.kind === "intake_question"));
  assert.equal(result.modelCalls, 4);
});
test("preliminary async classifications never become patient instructions or judge exposures", async () => {
  for (const action of ["PRIORITY_ASYNC", "STANDARD_ASYNC"]) {
    const prompts: string[] = [];
    const { result, events } = await run(async (role, prompt) => {
      if (role === "judge") prompts.push(prompt);
      return { output: role === "context" ? context : role === "safety" ? { ...none, action } : role === "disposition" ? draft : judgment(JSON.parse(prompt)), usage };
    });
    assert.equal(result.status, "complete");
    assert.ok(!events.some(e => e.kind === "action"));
    const packet = JSON.parse(prompts[0]);
    assert.equal(packet.hasIssuedEarlyAction, false);
    assert.ok(!packet.units.some((u: {id: string}) => u.id === "early"));
    assert.equal(result.graph?.safety?.action, action); // preserved in trace
  }
});
test("same-day early care needs an explicit model-assessed physical dependency", () => {
  const value = { ...none, action: "SAME_DAY_IN_PERSON", basis: [{ quote: "foot wound", interpretation: "Reported wound needs direct assessment", currentPatient: true, present: true }] };
  assert.equal(noticeFromSafety(value, "A foot wound is swollen"), null);
  assert.equal(noticeFromSafety({ ...value, physicalRequirement: "Direct assessment of the swollen wound and perfusion today" }, "A foot wound is swollen")?.disposition, "SAME_DAY_IN_PERSON");
  assert.equal(noticeFromSafety({ ...value, physicalRequirement: "Direct assessment of the swollen wound and perfusion today" }, "No matching statement"), null);
});
test("unknown vital limitation is not blanket clearance; later clearance still fails", () => {
  const answer = { ...draft, evidence: [], vitalSigns: "Absence of values is not evidence of normal vitals." };
  const check = (vitalSigns: string) => checkAnswer({ ...answer, vitalSigns }, patient, [], null).find(c => c.id === "no_blanket_clearance")?.status;
  assert.equal(check(answer.vitalSigns), "pass");
  assert.equal(check("Missing readings does not establish normal vitals."), "pass");
  assert.equal(check(answer.vitalSigns + " But your vitals are normal."), "fail");
  assert.equal(check("You have normal vitals."), "fail");
});
test("parallel safety bypasses delayed retrieval; Opus receives no early route; all four calls persisted", async () => {
  const prompts: string[] = [];
  const result = await run(async (role, prompt) => { prompts.push(`${role}:${prompt}`); return { output: role === "context" ? context : role === "safety" ? none : role === "disposition" ? draft : judgment(JSON.parse(prompt)), usage }; });
  assert.equal(result.result.status, "complete", JSON.stringify(result.result.checks.filter(c => c.status === "fail")));
  assert.equal(result.result.modelCalls, 4); assert.equal(result.result.answer?.reviewPriority, "priority");
  assert.doesNotMatch(prompts.find(p => p.startsWith("disposition:"))!, /earlyAction|independent-safety|minimumDisposition|safetyFloor/);
  assert.equal(result.result.artifactPersisted, true); assert.equal(result.result.eventLogPersisted, true);
  assert.equal(JSON.parse(readFileSync(join(result.directory, "runs", `${result.result.runId}.json`), "utf8")).promptHash, result.result.promptHash);
  const records = readFileSync(join(result.directory, "events", `${result.result.runId}.jsonl`), "utf8").trim().split("\n").map(x => JSON.parse(x));
  assert.equal(records.filter(r => r.type === "agent_execution").length, 4);
});
test("same-day priority review by Counsel is a valid ownership/timing statement", () => {
  assert.equal(asyncTimingPresent(draft, "My recommendation is priority same-day asynchronous review by Counsel."), true);
  assert.equal(asyncTimingPresent(draft, "Review might help sometime."), false);
});
test("late context question cannot follow emergency action even across parallel step contexts", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const early = { action: "EMS_NOW", basis: [{ quote: "usual migraine", interpretation: "Synthetic event-order fixture, not clinical classification", currentPatient: true, present: true }], reason: "Testing ordering only", patientMessage: "Call 911 now. Do not drive yourself." };
  const directory = mkdtempSync(join(tmpdir(), "counsel-graph-"));
  const runtime = createGraphRuntime(directory, async () => retrieval, async role => { if (role === "context") { await gate; return { output: { ...context, question: { text: "Any recent head injury?", why: "Synthetic late-context-question test", quote: "usual migraine" } }, usage }; } if (role === "disposition") throw new Error("offline"); return { output: early, usage }; });
  const events: ResponseEvent[] = [];
  try { await runtime.assess(patient, e => { events.push(e); if (e.kind === "action") release(); }); assert.deepEqual(events.map(e => e.kind), ["action"]); } finally { release(); await runtime.close(); }
});
test("judge outage yields unresolved review without inventing a clinical priority", async () => {
  const { result } = await run(async role => { if (role === "judge") throw new Error("Provider unavailable"); return { output: role === "context" ? context : role === "safety" ? none : draft, usage }; });
  assert.equal(result.status, "review_required"); assert.equal(result.answer, null); assert.equal(result.safetyFloor, null); assert.equal(result.graph?.judge, null); assert.equal(result.graph?.clinicalApproval, false);
});
test("judge outage cannot make an unrelated quoted refill into a new emergency or in-person floor", async () => {
  const message = "I need a finasteride refill. No symptoms.";
  for (const disposition of ["EMERGENCY_NOW", "SAME_DAY_IN_PERSON"] as const) {
    const directory = mkdtempSync(join(tmpdir(), "counsel-graph-refill-"));
    const unreviewed = { ...draft, disposition, reviewPriority: null, workType: null, patientMessage: disposition === "EMERGENCY_NOW" ? "Seek emergency department assessment now. Do not wait for a reply." : "Arrange an in-person assessment today. Do not wait for a reply.", redFlags: [{ concern: "Incorrectly escalated refill fixture", status: "reported", quote: "finasteride refill" }] };
    const runtime = createGraphRuntime(directory, async () => retrieval, async role => {
      if (role === "judge") throw new Error("Judge unavailable");
      return { output: role === "context" ? { ...context, findings: [{ finding: "Refill request", status: "reported", quote: "finasteride refill" }] } : role === "safety" ? none : unreviewed, usage };
    });
    try {
      const result = await runtime.assess(message);
      assert.equal(result.status, "review_required");
      assert.equal(result.answer, null);
      assert.equal(result.safetyFloor, null);
      assert.equal(result.graph?.judge, null);
      assert.equal((result.rejectedAnswer as typeof unreviewed)?.disposition, disposition);
      assert.ok(!result.responseEvents?.some(event => event.kind === "action"));
    } finally { await runtime.close(); }
  }
});
test("one evidence repair precedes revision; repeated reviewer rejection cannot loop or count as approval", async () => {
  const queries: string[] = [];
  const { result } = await run(async (role, prompt) => ({ output: role === "context" ? context : role === "safety" ? none : role === "disposition" ? draft : { ...judgment(JSON.parse(prompt)), verdict: "revise", evidenceQueries: ["headache emergency warning signs"], correction: "Missing management support must be retrieved." }, usage }), async () => { queries.push("search"); return retrieval; });
  assert.equal(queries.length, 2); assert.equal(result.graph?.corrections, 1);
  assert.equal(result.modelCalls, 6); assert.equal(result.status, "review_required");
  assert.equal(result.graph?.retrieval.length, 2);
});
test("mechanical failures reach judge and bounded repair even when judge accepts the clinical route", async () => {
  const prompts: {role: string; data: Record<string, unknown>}[] = [];
  let drafts = 0;
  const { result } = await run(async (role, prompt) => {
    const data = JSON.parse(prompt); prompts.push({ role, data });
    const output = role === "context" ? context : role === "safety" ? none : role === "disposition"
      ? ++drafts === 1 ? { ...draft, vitalSigns: "No measurements are needed." } : draft
      : judgment(data);
    return { output, usage };
  });
  assert.equal(result.status, "complete"); assert.equal(result.graph?.corrections, 1);
  assert.equal(result.modelCalls, 6);
  const judgePacket = prompts.find(p => p.role === "judge")!.data;
  assert.ok(JSON.stringify(judgePacket.contractFindings).includes("unmeasured_vitals_not_dismissed"));
  const repair = prompts.filter(p => p.role === "disposition")[1].data;
  assert.equal(repair.patient, patient); // revision retains original facts, not source eligibility criteria
  assert.ok(JSON.stringify(repair.contractFindings).includes("unmeasured_vitals_not_dismissed"));
  assert.equal((repair.reviewerFeedback as {verdict: string}).verdict, "accept"); // never rewrite verdicts
});
test("review explicitly corrects an early over-escalation and emits a bound revision", async () => {
  const early = { action: "SAME_DAY_IN_PERSON", physicalRequirement: "An incorrect examination dependency supplied by the test model", basis: [{ quote: "need a refill", interpretation: "Incorrect physical-care interpretation", present: true, currentPatient: true }], reason: "Early model over-escalation fixture", patientMessage: "Arrange an in-person assessment today. Do not wait for an asynchronous reply." };
  const { result, events } = await run(async (role, prompt) => ({ output: role === "context" ? context : role === "safety" ? early : role === "disposition" ? draft : judgment(JSON.parse(prompt), "unsupported"), usage }));
  assert.equal(result.status, "complete"); assert.equal(result.answer?.disposition, "ASYNC_PHYSICIAN"); assert.deepEqual(events.map(e => e.kind), ["action", "care_revision", "patient_reply"]);
});
test("an evidence-only failure does not preserve an independently corrected emergency route", async () => {
  const early = { action: "ED_NOW", basis: [{ quote: "usual migraine", interpretation: "Incorrect emergency interpretation in fixture", present: true, currentPatient: true }], reason: "Synthetic over-escalation fixture", patientMessage: "Seek emergency care now." };
  const j = (prompt: string) => ({ ...judgment(JSON.parse(prompt), "unsupported"), verdict: "revise", correction: "Repair source support, not the agreed care route.", criteria: judgment(JSON.parse(prompt)).criteria.map(c => ({ ...c, verdict: c.id === "claim_support" ? "fail" : "pass" })) });
  const { result, events } = await run(async (role, prompt) => ({ output: role === "context" ? context : role === "safety" ? early : role === "disposition" ? draft : j(prompt), usage }));
  assert.equal(result.status, "review_required"); assert.equal(result.graph?.careCorrectionReleased, true);
  assert.equal(result.answer?.disposition, "ASYNC_PHYSICIAN"); assert.equal(result.answer?.reviewPriority, "priority");
  assert.deepEqual(events.map(e => e.kind), ["action", "care_revision"]);
  assert.deepEqual(result.answer?.evidence, []); assert.equal(result.graph?.release, "clinician_required");
});
test("current async care corrections carry exact reviewed priority and task proof through NDJSON", async () => {
  for (const reviewPriority of ["priority", "routine"] as const) for (const workType of ["medication_request", "clinical_review"] as const) {
    const proposed = draftSchema.parse({ ...draft, reviewPriority, workType, patientMessage: asyncAction({ disposition: "ASYNC_PHYSICIAN", reviewPriority }) + " Seek emergency care if sudden severe headache or new weakness develops." });
    const early = { ...none, action: "ED_NOW", basis: [{ quote: "usual migraine", interpretation: "Synthetic early over-escalation fixture", present: true, currentPatient: true }] };
    let drafts = 0;
    const runtime = createGraphRuntime(mkdtempSync(join(tmpdir(), "async-care-proof-")), async () => retrieval, async (role, prompt) => {
      const packet = JSON.parse(prompt);
      if (role === "disposition" && ++drafts > 1) return { output: { baseDraftHash: packet.repairContract.baseDraftHash, evidenceHash: packet.repairContract.evidenceHash, edits: [{ field: "citations", value: [] }] }, usage };
      const review = { ...judgment(packet, "unsupported"), verdict: "revise", repairTargets: ["citations"], correction: "Repair evidence only; the explicitly corrected async care and queue metadata are supported.", criteria: judgment(packet).criteria.map(c => ({ ...c, verdict: c.id === "claim_support" ? "fail" : "pass" })) };
      return { output: role === "context" ? context : role === "safety" ? early : role === "disposition" ? proposed : review, usage };
    });
    try {
      const result = await runtime.assess(patient);
      assert.equal(result.graph?.careCorrectionReleased, true);
      assert.equal(result.graph?.repair?.status, "applied");
      assert.equal(result.graph?.preservedCare?.origin, "current_review");
      assert.equal(result.graph?.careCarryForward, undefined, "ordinary carry remains urgent-only");
      assert.equal(result.answer?.reviewPriority, reviewPriority); assert.equal(result.answer?.workType, workType);
      assert.equal(await verifyPreservedCare(result, patient), true);
      const stream = (value: typeof result) => new Response([...value.responseEvents!.map(event => ({ type: "response_event", event })), { type: "result", result: value }].map(x => JSON.stringify(x)).join("\n") + "\n", { headers: { "content-type": "application/x-ndjson" } });
      assert.equal((await readDispositionStream(stream(result), patient, () => {})).answer?.reviewPriority, reviewPriority);
      const mutations: ((value: typeof result) => void)[] = [
        r => { delete r.graph!.preservedCare; },
        r => { r.answer!.reviewPriority = reviewPriority === "priority" ? "routine" : "priority"; },
        r => { r.answer!.workType = workType === "medication_request" ? "clinical_review" : "medication_request"; },
        r => { const proof = r.graph!.preservedCare!; if (proof.disposition === "ASYNC_PHYSICIAN") r.graph!.preservedCare = { ...proof, reviewPriority: reviewPriority === "priority" ? "routine" : "priority" }; },
        r => { const proof = r.graph!.preservedCare!; if (proof.disposition === "ASYNC_PHYSICIAN") r.graph!.preservedCare = { ...proof, workType: workType === "medication_request" ? "clinical_review" : "medication_request" }; },
        r => { r.reconciliation!.reason = "A different unreviewed reason for changing the care instruction."; },
        r => { r.graph!.preservedCare!.origin = "pre_repair_review"; },
        r => { r.failure = "RUN_CANCELLED"; },
      ];
      for (const mutate of mutations) {
        const modified = structuredClone(result); mutate(modified);
        assert.equal(await verifyPreservedCare(modified, patient), false);
        await assert.rejects(readDispositionStream(stream(modified), patient, () => {}));
      }
    } finally { await runtime.close(); }
  }
});
test("care-only correction requires complete care criteria and cannot clear unconditional EMS on missing data", () => {
  const j = { ...judgment({ units: [] }, "unsupported"), verdict: "revise", evidenceQueries: [] } as GraphJudge;
  const notice = { disposition: "EMERGENCY_NOW", directive: "Call 911 now. Do not drive yourself.", source: "emergency_agent" } as const;
  const checks = checkAnswer({ ...draft, evidence: [] }, patient, [], null);
  assert.equal(canReleaseCareCorrection(draft, j, notice, checks), true);
  assert.equal(canReleaseCareCorrection(draft, { ...j, earlyCorrection: { ...j.earlyCorrection!, triggerMisattributedOrCorrected: false } }, notice, checks), false);
  assert.equal(canReleaseCareCorrection(draft, null, notice, checks), false);
  for (const id of ["undertriage", "overtriage", "patient_grounding", "safety_net", "clarification_delay", "ownership"]) {
    assert.equal(canReleaseCareCorrection(draft, { ...j, criteria: j.criteria.filter(c => c.id !== id) }, notice, checks), false);
    assert.equal(canReleaseCareCorrection(draft, { ...j, criteria: j.criteria.map(c => c.id === id ? { ...c, verdict: "abstain" } : c) }, notice, checks), false);
  }
  assert.equal(canReleaseCareCorrection({ ...draft, disposition: "SELF_CARE", reviewPriority: null, workType: null }, j, notice, checks), false);
  assert.equal(canReleaseCareCorrection(draft, j, notice, checks.filter(c => c.id !== "quoted_patient_evidence")), false);
});
test("care rendering preserves unconditional hyphenated 911 but does not promote conditional warnings", () => {
  const emergency = { ...draft, disposition: "EMERGENCY_NOW", reviewPriority: null, workType: null } as const;
  assert.match(graphCareDirective({ ...emergency, patientMessage: "Call 9-1-1 now. Do not drive." }), /^Call 911 now/);
  assert.match(graphCareDirective({ ...emergency, patientMessage: "Seek emergency department assessment now; call 911 now if you faint." }), /^Seek emergency department/);
  for (const text of ["Call 911 now if you faint.", "Please call 911 now if you faint.", "Call 911 now, if symptoms worsen.", "Call 911 now — only if symptoms become severe.", "Call 911 now; but only when symptoms worsen.", "Call 911 now and only if symptoms worsen.", "Call 9‑1‑1 immediately unless safe transport is available.", "If you faint, call 911 now."]) {
    assert.equal(hasUnconditional911Opening(text), false);
    assert.match(graphCareDirective({ ...emergency, patientMessage: text }), /^Seek emergency department/);
  }
  for (const text of ["Call 911 now. Do not drive.", "Call 9‑1‑1 immediately. If you need help, alert someone nearby.", "Please call 911 now. Do not drive yourself.", "  Please\tcall  9 1 1\timmediately. Do not drive.  ", "Call 911 now — do not drive yourself, and stay with someone if you can.", "Call 911 now and stay with someone if possible."]) {
    assert.equal(hasUnconditional911Opening(text), true);
    assert.match(graphCareDirective({ ...emergency, patientMessage: text }), /^Call 911 now/);
    assert.equal(reducesEmergencyTransport({ disposition: "EMERGENCY_NOW", directive: "Call 911 now." }, { disposition: "EMERGENCY_NOW", directive: text }), false);
  }
  assert.equal(reducesEmergencyTransport({ disposition: "EMERGENCY_NOW", directive: "Call 911 now." }, { disposition: "EMERGENCY_NOW", directive: "Seek emergency department assessment now." }), true);
  assert.equal(reducesEmergencyTransport({ disposition: "EMERGENCY_NOW", directive: "Seek emergency assessment now; call 911 if needed." }, { disposition: "EMERGENCY_NOW", directive: "Seek emergency assessment now." }), false);
});
test("same-setting ambulance to ED reduction cannot bypass explicit early-action reconciliation", async () => {
  const early = { ...none, action: "EMS_NOW", basis: [{ quote: "usual migraine", interpretation: "Synthetic transport contract fixture, not clinical endorsement", present: true, currentPatient: true }] };
  const emergencyDraft = { ...draft, disposition: "EMERGENCY_NOW", reviewPriority: null, workType: null, patientMessage: "Seek emergency department assessment now. Do not wait for a reply; call 911 if you cannot travel safely." };
  const { result, events } = await run(async (role, prompt) => ({ output: role === "context" ? context : role === "safety" ? early : role === "disposition" ? emergencyDraft : judgment(JSON.parse(prompt), "supported"), usage }));
  assert.equal(result.status, "review_required");
  assert.match(result.answer!.patientMessage, /^Call 911 now/);
  assert.equal(result.graph?.careCorrectionReleased, false);
  assert.equal(result.checks.find(check => check.id === "independent_review")?.status, "pass");
  assert.equal(result.checks.find(check => check.id === "care_reconciliation")?.status, "fail");
  assert.match(result.checks.find(check => check.id === "care_reconciliation")!.detail, /Application withheld/);
  assert.equal(result.reconciliation, undefined);
  assert.deepEqual(events.map(e => e.kind), ["action"]);
});
test("accepted C02 draft with an unrelated later conditional does not become a false EMS demotion", async () => {
  // Exact first sentence from retained live v8 run 234d4b8d-35b4-40b1-903d-bc137b01f1e3.
  const patientMessage = "Call 911 now — do not drive yourself, and stay with someone if you can.";
  const currentDraft = { ...draft, disposition: "EMERGENCY_NOW", reviewPriority: null, workType: null, patientMessage, redFlags: [{ concern: "Current chest pressure", status: "reported", quote: "crushing pressure" }] };
  const directory = mkdtempSync(join(tmpdir(), "counsel-graph-c02-clause-"));
  const runtime = createGraphRuntime(directory, async () => retrieval, async (role, prompt) => {
    const j = judgment(JSON.parse(prompt), "supported");
    return { output: role === "context" ? { ...context, findings: [{ finding: "Current chest pressure", status: "reported", quote: "crushing pressure" }] } : role === "safety" ? { ...c02Safety, actionBasis: { indices: [0], sufficient: true } } : role === "disposition" ? currentDraft : { ...j, criteria: j.criteria.map(c => c.id === "claim_support" ? c : { ...c, anchors: [{ unit: "patient", quote: "crushing pressure" }] }) }, usage };
  });
  try {
    const result = await runtime.assess(c02Message);
    assert.equal(result.status, "complete");
    assert.equal(result.answer?.patientMessage, patientMessage);
    assert.equal(result.graph?.judge?.verdict, "accept");
    assert.equal(result.graph?.release, "model_reviewed");
    assert.equal(result.reconciliation, undefined);
    assert.equal(result.checks.find(check => check.id === "independent_review")?.status, "pass");
    assert.equal(result.checks.find(check => check.id === "care_reconciliation")?.status, "not_assessed");
    assert.deepEqual(result.responseEvents?.map(event => event.kind), ["action", "patient_reply"]);
  } finally { await runtime.close(); }
});
test("explicit supported transport correction preserves emergency setting and ambulance history", async () => {
  const early = { ...none, action: "EMS_NOW", basis: [{ quote: "usual migraine", interpretation: "Synthetic transport contract fixture, not clinical endorsement", present: true, currentPatient: true }] };
  const emergencyDraft = { ...draft, disposition: "EMERGENCY_NOW", reviewPriority: null, workType: null, patientMessage: "Seek emergency department assessment now. Do not wait for a reply; call 911 if you cannot travel safely." };
  for (const evidenceFailure of [false, true]) {
    const { result, events } = await run(async (role, prompt) => {
      const j = judgment(JSON.parse(prompt), "unsupported");
      return { output: role === "context" ? context : role === "safety" ? early : role === "disposition" ? emergencyDraft : { ...j, verdict: evidenceFailure ? "revise" : "accept", earlyCorrection: { ...j.earlyCorrection!, triggerMisattributedOrCorrected: false, reason: "Transport-only correction fixture: emergency assessment remains necessary; the separately reviewed facts support ED attendance." }, criteria: j.criteria.map(c => ({ ...c, verdict: evidenceFailure && c.id === "claim_support" ? "fail" : "pass" })) }, usage };
    });
    assert.equal(result.status, evidenceFailure ? "review_required" : "complete");
    assert.equal(result.answer?.disposition, "EMERGENCY_NOW");
    assert.match(result.answer!.patientMessage, /^Seek emergency department/);
    assert.equal(result.graph?.careCorrectionReleased, evidenceFailure);
    assert.equal(result.reconciliation?.from.disposition, "EMERGENCY_NOW");
    assert.equal(result.reconciliation?.to.disposition, "EMERGENCY_NOW");
    assert.match(result.reconciliation!.from.directive, /^Call 911 now/);
    assert.deepEqual(events.map(e => e.kind), evidenceFailure ? ["action", "care_revision"] : ["action", "care_revision", "patient_reply"]);
  }
});
test("typed EMS continuation requires independently bound current-patient active-episode support", () => {
  const activationQuote = "I called 911; the ambulance is coming";
  const patientMessage = "Stay with your current plan — the ambulance is on the way; do not drive yourself and do not delay.";
  const currentDraft = draftSchema.parse({ ...draft, disposition: "EMERGENCY_NOW", reviewPriority: null, workType: null, patientMessage, transportIntent: { mode: "continue_ems", activationQuote } });
  const j = { ...judgment({ units: [] }, "supported"), evidenceQueries: [], transportReview: { mode: "continue_ems", verdict: "supported", draftQuote: patientMessage, activation: { quote: activationQuote, currentPatient: true, currentEpisode: true, active: true } } } as GraphJudge;
  const result = assessEmergencyTransport(currentDraft, activationQuote, j), notice = { disposition: "EMERGENCY_NOW", directive: "Call 911 now." };
  assert.equal(result.status, "admitted");
  assert.equal(boundEmergencyTransport(result.binding, patientMessage, activationQuote), true);
  assert.equal(boundEmergencyTransport(result.binding, patientMessage + " changed", activationQuote), false);
  assert.equal(boundEmergencyTransport(result.binding, patientMessage, "No activation reported"), false);
  assert.equal(reducesEmergencyTransport(notice, { disposition: "EMERGENCY_NOW", directive: patientMessage, emergencyTransport: result.binding }), false);
  assert.equal(reducesEmergencyTransport(notice, { disposition: "EMERGENCY_NOW", directive: patientMessage }), true); // legacy remains conservative
  assert.equal(assessEmergencyTransport({ ...currentDraft, transportIntent: null }, activationQuote, null).status, "legacy");
  assert.equal(assessEmergencyTransport(currentDraft, "I have not called anyone", j).code, "TRANSPORT_CONTEXT_INVALID");
  for (const transportReview of [null, { ...j.transportReview!, verdict: "unsupported" as const }, { ...j.transportReview!, verdict: "unresolved" as const }]) assert.equal(assessEmergencyTransport(currentDraft, activationQuote, { ...j, transportReview }).status, "rejected");
  for (const flag of ["currentPatient", "currentEpisode", "active"] as const) assert.equal(assessEmergencyTransport(currentDraft, activationQuote, { ...j, transportReview: { ...j.transportReview!, activation: { ...j.transportReview!.activation!, [flag]: false } } }).code, "ACTIVATION_NOT_CURRENT_PATIENT_ACTIVE");
  for (const transportReview of [{ ...j.transportReview!, mode: "ed_now" as const }, { ...j.transportReview!, draftQuote: "Invented directive" }, { ...j.transportReview!, activation: { ...j.transportReview!.activation!, quote: "different quote" } }]) assert.equal(assessEmergencyTransport(currentDraft, activationQuote, { ...j, transportReview }).code, "TRANSPORT_REVIEW_MISMATCH");
  assert.equal(draftSchema.safeParse({ ...currentDraft, emergencyTransport: result.binding }).success, false); // models cannot author app review stamps
  const event = { kind: "patient_reply", disposition: "EMERGENCY_NOW", text: patientMessage, emergencyTransport: result.binding };
  assert.equal(responseEventSchema.safeParse(event).success, true);
  assert.equal(responseEventSchema.safeParse({ ...event, text: patientMessage + " changed" }).success, false);
  assert.equal(responseEventSchema.safeParse({ ...event, disposition: "ASYNC_PHYSICIAN" }).success, false);
});
test("historical, other-person and conditional EMS mentions cannot pass contrary independent activation findings", () => {
  // Semantic attribution is model-reviewed, not provable by quote identity.
  // These cases test that adverse independent findings cannot be discarded.
  for (const [quote, flag] of [["Last year I called 911; the ambulance was coming", "currentEpisode"], ["My neighbor called 911; their ambulance is coming", "currentPatient"], ["If I called 911, an ambulance would come", "active"], ["I cancelled the ambulance", "active"]] as const) {
    const currentDraft = draftSchema.parse({ ...draft, disposition: "EMERGENCY_NOW", reviewPriority: null, workType: null, transportIntent: { mode: "continue_ems", activationQuote: quote } });
    const j = { ...judgment({ units: [] }), evidenceQueries: [], transportReview: { mode: "continue_ems", verdict: "supported", draftQuote: currentDraft.patientMessage, activation: { quote, currentPatient: true, currentEpisode: true, active: true, [flag]: false } } } as GraphJudge;
    assert.equal(assessEmergencyTransport(currentDraft, quote, j).code, "ACTIVATION_NOT_CURRENT_PATIENT_ACTIVE");
  }
});
test("live ambulance-update continuation releases without a false EMS-to-ED correction", async () => {
  // Opening from retained v11 e00d14e0-137d-49ba-a0af-c9e18b749f7e.
  const activationQuote = "I called 911; the ambulance is coming; the chest pressure is still present.";
  const message = `${c02Message}\nAdditional patient information: ${activationQuote}`;
  const opening = "Stay with your current plan — the ambulance is on the way; do not drive yourself and do not delay.";
  const patientMessage = `${opening} Your ongoing chest pressure needs emergency assessment now.`;
  const currentDraft = { ...draft, disposition: "EMERGENCY_NOW", reviewPriority: null, workType: null, patientMessage, transportIntent: { mode: "continue_ems", activationQuote }, redFlags: [{ concern: "Current chest pressure", status: "reported", quote: "crushing pressure" }] };
  const directory = mkdtempSync(join(tmpdir(), "counsel-graph-continued-ems-")), runtime = createGraphRuntime(directory, async () => retrieval, async (role, prompt) => {
    const j = judgment(JSON.parse(prompt), "supported");
    return { output: role === "context" ? { ...context, findings: [{ finding: "Current chest pressure", status: "reported", quote: "crushing pressure" }] } : role === "safety" ? { ...c02Safety, actionBasis: { indices: [0], sufficient: true } } : role === "disposition" ? currentDraft : { ...j, transportReview: { mode: "continue_ems", verdict: "supported", draftQuote: opening, activation: { quote: activationQuote, currentPatient: true, currentEpisode: true, active: true } }, criteria: j.criteria.map(c => c.id === "claim_support" ? c : { ...c, anchors: [{ unit: "patient", quote: activationQuote }] }) }, usage };
  });
  try {
    const result = await runtime.assess(message);
    assert.equal(result.status, "complete"); assert.equal(result.modelCalls, 4); assert.equal(result.graph?.corrections, 0);
    assert.equal(result.answer?.patientMessage, patientMessage); assert.equal(result.answer?.emergencyTransport?.mode, "continue_ems");
    assert.equal(result.graph?.judge?.verdict, "accept"); assert.equal(result.graph?.transportAdmission?.status, "admitted");
    assert.equal(result.reconciliation, undefined); assert.equal(result.checks.find(c => c.id === "care_reconciliation")?.status, "not_assessed");
    assert.deepEqual(result.responseEvents?.map(e => e.kind), ["action", "patient_reply"]);
    const reply = result.responseEvents!.find(e => e.kind === "patient_reply")!;
    assert.deepEqual(reply.emergencyTransport, result.answer?.emergencyTransport);
  } finally { await runtime.close(); }
});
test("emergency survives independent final-model failure and retrieval does not gate early action", async () => {
  let release!: () => void, actionSeen = false;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const directory = mkdtempSync(join(tmpdir(), "counsel-graph-"));
  const early = { action: "EMS_NOW", basis: [{ quote: "usual migraine", interpretation: "Synthetic emergency fixture, not a clinical label", currentPatient: true, present: true }], reason: "Testing persistence, not migraine clinical correctness", patientMessage: "Call 911 now. Do not drive yourself." };
  const runtime = createGraphRuntime(directory, async () => { await pending; return retrieval; }, async role => { if (role === "disposition") throw new Error("Offline"); return { output: role === "safety" ? early : context, usage }; });
  try { const result = await runtime.assess(patient, e => { if (e.kind === "action") { actionSeen = true; release(); } }); assert.equal(actionSeen, true); assert.equal(result.answer?.disposition, "EMERGENCY_NOW"); assert.equal(result.status, "review_required"); assert.equal(result.agents?.filter(a => a.role === "disposition").length, 2); } finally { release(); await runtime.close(); }
});
