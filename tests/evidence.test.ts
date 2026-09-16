import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evidenceLibrary, evidenceHash, evidenceGraph, libraryHash, validateLibrary } from "../src/evidence/library.ts";
import { retrieveEvidence, guidanceForPrompt } from "../src/evidence/retrieval.ts";
import { citationAudit, createClaimPacket, evaluateClaimJudgment } from "../src/evidence/claims.ts";
import { judgeEvidence } from "../src/evidence/judge.ts";
import { checkSourceLink } from "../src/evaluation/source-link-checker.mjs";
import { createDispositionRuntime } from "../src/disposition/runtime.ts";
import { checkAnswerWithEvidence } from "../src/evidence/answer-checks.ts";
import type { DispositionAnswer } from "../src/disposition/contract.ts";
const asOf = "2026-09-11";
const message = "45F. Sudden thunderclap headache.";
const retrieve = (s: string) => retrieveEvidence(s, { now: asOf });
const answer: DispositionAnswer = {
  disposition: "EMERGENCY_NOW", patientMessage: "Go to the emergency department now. Do not wait for a reply.",
  reason: "An abrupt thunderclap headache needs emergency assessment.", differential: ["Intracranial hemorrhage"],
  redFlags: [{ concern: "Thunderclap headache", status: "reported", quote: "Sudden thunderclap headache" }],
  vitalSigns: "No measured vital signs were provided.", questions: [],
  evidence: [{ sourceId: "headache", claim: "An acute thunderclap headache warrants emergency-department evaluation." }],
  evidenceLimitations: "The excerpt supports urgent action, not a diagnosis.",
};
const packet = () => createClaimPacket(answer, message, retrieve(message).guidance, "anthropic/claude-opus-5", asOf);
const candidate = (p = packet()) => ({ packetHash: p.packetHash, units: p.units.map((u) => ({
  id: u.id, basis: "clinical_inference", support: "not_assessed", applicability: "unknown",
  passageIds: [], patientQuotes: [], explanation: "Requires independent clinical and applicability review.",
})) });
const judgeModel = "openai/gpt-6-astra";

test("shared evidence graph validates, is immutable, and never implies clinical approval", () => {
  assert.equal(evidenceLibrary.recommendations.length, 15);
  assert.equal(evidenceLibrary.passages.length, 5);
  assert.ok(evidenceLibrary.recommendations.every((r) => r.review.clinicianApproval === null));
  assert.equal(validateLibrary(evidenceLibrary), evidenceLibrary);
  assert.throws(() => { evidenceLibrary.passages[0].excerpt = "changed"; });
  const graph = evidenceGraph(), nodes = new Set(graph.nodes.map((n) => n.id));
  assert.ok(graph.edges.every((e) => nodes.has(e.from) && nodes.has(e.to)));
  assert.ok(graph.edges.some((e) => e.relation === "inspection_anchor_not_full_entailment"));
});
test("duplicate IDs, altered passages, wrong source links and review windows fail validation", () => {
  const mutate = (edit: (v: typeof evidenceLibrary) => void) => { const clone = structuredClone(evidenceLibrary); edit(clone); return () => validateLibrary(clone); };
  assert.throws(mutate((v) => v.sources.push(v.sources[0])), /DUPLICATE/);
  assert.throws(mutate((v) => { v.passages[0].excerpt += " edited"; }), /PROVENANCE/);
  assert.throws(mutate((v) => { v.recommendations[0].passageIds = [v.passages[0].id]; }), /CROSS_SOURCE/);
  assert.throws(mutate((v) => { v.recommendations[0].review.reviewDue = "2020-01-01"; }), /REVIEW_WINDOW/);
  assert.throws(mutate((v) => { v.sources[0].url = "http://127.0.0.1/"; }), /SOURCE_URL/);
});
test("topic and negation collisions do not promote unrelated cardiac evidence", () => {
  for (const text of [
    "I ate shrimp and my throat feels tight, my tongue swollen, and hives are on my chest.",
    "Menopause hot flashes and night sweats.",
    "The room spins. No chest pain.",
  ]) assert.equal(retrieve(text).guidance.some((g) => ["aha-heart-attack", "afp-pleuritic-2017"].includes(g.id)), false);
  assert.ok(retrieve("My lips and tongue suddenly feel swollen.").guidance.some((g) => g.id === "nhs-anaphylaxis"));
  assert.ok(retrieve("Everyone would be better off without me.").guidance.some((g) => g.id === "suicide"));
});
test("known paraphrases retrieve candidates; labels and uncovered topics never become evidence", () => {
  assert.ok(retrieve("I have pressure behind my breastbone.").guidance.some((g) => g.id === "aha-heart-attack"));
  assert.ok(retrieve("All of a sudden my words are coming out garbled.").guidance.some((g) => g.id === "asa-stroke"));
  for (const text of ["C04 ASYNC_PHYSICIAN", "Could you renew my medication?", "My dog has a diabetic foot ulcer."]) assert.equal(retrieve(text).guidance.length, 0);
  assert.ok(retrieve("My cat is well. I have new chest pressure.").guidance.some((g) => g.id === "aha-heart-attack"));
});
test("explicit age, expiry, withdrawal and future inspection filter candidates, not patient routing", () => {
  assert.equal(retrieve("My 8-year-old has a thunderclap headache.").guidance.some((g) => g.id === "headache"), false);
  assert.equal(retrieveEvidence(message, { now: "2027-01-01" }).guidance.length, 0);
  assert.equal(retrieveEvidence(message, { now: "2026-09-01" }).guidance.length, 0);
  const library = structuredClone(evidenceLibrary);
  library.recommendations.find((r) => r.id === "headache")!.review.status = "withdrawn";
  assert.equal(retrieveEvidence(message, { now: asOf, library }).guidance.length, 0);
  assert.throws(() => retrieveEvidence(message, { now: "2026-02-31" }), /OPTIONS/);
});
test("corpus order does not alter rank and audit records content, not clinical coverage", () => {
  const library = structuredClone(evidenceLibrary); library.recommendations.reverse();
  const result = retrieve("My diabetic foot has an ulcer.");
  assert.deepEqual(retrieveEvidence("My diabetic foot has an ulcer.", { now: asOf, library }).guidance.map((g) => g.id), result.audit.selectedIds);
  assert.equal(result.audit.libraryHash, libraryHash);
  assert.equal(result.audit.clinicalCoverage, "not_assessed");
  assert.equal(result.audit.externalCalls, 0);
});
test("model context contains relevant excerpts but no execution hashes or approval labels", () => {
  const guidance = retrieve(message).guidance;
  const context = JSON.stringify(guidanceForPrompt(guidance));
  assert.match(context, /acute thunderclap headache/);
  assert.doesNotMatch(context, /libraryHash|recommendationHash|recordHash|clinicianApproval|[a-f0-9]{64}/);
  assert.ok(Buffer.byteLength(context) < Buffer.byteLength(JSON.stringify(guidance)));
});
test("real source ID and matching excerpt never certify a fabricated clinical claim", () => {
  const falseAnswer = { ...answer, evidence: [{ sourceId: "headache", claim: "AFP says to stay home for sudden thunderclap headache." }] };
  const audited = citationAudit(falseAnswer, retrieve(message).guidance, asOf);
  assert.equal(audited.citations[0].provenance, "pass");
  assert.equal(audited.citations[0].support, "not_assessed");
  assert.equal(audited.clinicalCorrectness, "not_assessed");
  assert.equal(audited.status, "not_assessed");
});
test("server answer checks reject changed evidence while retaining the original emergency floor", () => {
  const guidance = structuredClone(retrieve(message).guidance); guidance[0].summary += " changed";
  const checks = checkAnswerWithEvidence(answer, message, guidance, "EMERGENCY_NOW");
  assert.equal(checks.find((c) => c.id === "evidence_record_integrity")?.status, "fail");
  assert.equal(checks.find((c) => c.id === "escalation_floor")?.status, "pass");
});
test("earlier visible instructions are independent scored units and cannot vanish in the final answer", () => {
  const p = createClaimPacket(answer, message, retrieve(message).guidance, "anthropic/claude-opus-5", asOf, { responseEvents: [{ kind: "patient_reply", disposition: "SELF_CARE", text: "Stay home and wait until tomorrow." }] });
  assert.ok(p.units.some((u) => u.id.startsWith("visibleEvent.") && /Stay home/.test(u.text)));
  assert.throws(() => evaluateClaimJudgment(p, { ...candidate(p), units: candidate(p).units.filter((u) => !u.id.startsWith("visibleEvent.")) }, judgeModel), /UNIT_COVERAGE/);
});
test("altering URL, summary, excerpt, review date or source reference invalidates a returned record", () => {
  for (const edit of [
    (g: ReturnType<typeof retrieve>["guidance"][number]) => { g.url = "https://example.com/"; },
    (g: ReturnType<typeof retrieve>["guidance"][number]) => { g.summary += " Not true."; },
    (g: ReturnType<typeof retrieve>["guidance"][number]) => { g.evidenceRecord!.passages[0].excerpt += " altered"; },
    (g: ReturnType<typeof retrieve>["guidance"][number]) => { g.evidenceRecord!.sourceId = "dka"; },
    (g: ReturnType<typeof retrieve>["guidance"][number]) => { g.evidenceRecord!.reviewDue = "2099-01-01"; },
  ]) {
    const guidance = structuredClone(retrieve(message).guidance); edit(guidance[0]);
    assert.equal(citationAudit(answer, guidance, asOf).status, "fail");
  }
  assert.equal(citationAudit({ ...answer, evidence: [{ sourceId: "fake", claim: "Unsupported citation." }] }, [], asOf).status, "fail");
});
test("claim packet binds original message, exact response, excerpts, model and evaluation date", () => {
  const p = packet();
  for (const edit of [(v: typeof p) => { v.answer!.reason += " changed"; }, (v: typeof p) => { v.asOf = "2026-09-12"; }, (v: typeof p) => { v.message += " different"; }]) {
    const clone = structuredClone(p); edit(clone);
    assert.throws(() => evaluateClaimJudgment(clone, candidate(p), judgeModel), /PACKET_CHANGED/);
  }
  assert.throws(() => evaluateClaimJudgment(p, { ...candidate(p), packetHash: evidenceHash("other") }, judgeModel), /WRONG_PACKET/);
});
test("judge cannot omit, duplicate, invent units or present same-vendor grading as independent", () => {
  const p = packet(), c = candidate(p);
  for (const units of [c.units.slice(1), [...c.units.slice(1), c.units[1]], [...c.units, { ...c.units[0], id: "invented" }]]) assert.throws(() => evaluateClaimJudgment(p, { ...c, units }, judgeModel), /UNIT_COVERAGE/);
  assert.throws(() => evaluateClaimJudgment(p, c, "anthropic/claude-haiku-4-5"), /INDEPENDENT/);
});
test("judge's invented quotes, nonexistent passages and empty support are unresolved, never passed", () => {
  const p = packet();
  for (const patch of [
    { basis: "patient", patientQuotes: ["I have normal blood pressure"] },
    { basis: "source", passageIds: ["nonexistent/p1"] },
    { basis: "source", passageIds: [] },
  ]) {
    const c = candidate(p); Object.assign(c.units[0], patch, { support: "supported", applicability: "applicable" });
    const result = evaluateClaimJudgment(p, c, judgeModel);
    assert.equal(result.units[0].invalidGrounding, true);
    assert.equal(result.status, "not_assessed");
  }
});
test("a contradiction in one claim fails the response's evidence audit without erasing disposition", () => {
  const p = packet(), c = candidate(p);
  Object.assign(c.units.find((u) => u.id.startsWith("citation."))!, { support: "contradicted", basis: "source", passageIds: ["headache/p1"] });
  const result = evaluateClaimJudgment(p, c, judgeModel);
  assert.equal(result.status, "fail"); assert.equal(result.failedUnits, 1);
  assert.equal(result.automationApproval, false); assert.equal(p.answer!.disposition, "EMERGENCY_NOW");
});
test("even an all-supported judge response is not a clinical pass or release approval", () => {
  const p = packet(), c = candidate(p);
  for (const u of c.units) Object.assign(u, { basis: "source", support: "supported", applicability: "applicable", passageIds: ["headache/p1"] });
  const result = evaluateClaimJudgment(p, c, judgeModel, "unvalidated-arbitrary-label");
  assert.equal(result.status, "supported_by_judge");
  assert.equal(result.clinicalCorrectness, "not_assessed"); assert.equal(result.automationApproval, false);
});
test("failed final generation still exposes early advice for grading, never a completed-answer pass", () => {
  const p = createClaimPacket(null, message, [], "anthropic/claude-opus-5", asOf, { responseEvents: [{ kind: "patient_reply", disposition: "SELF_CARE", text: "Stay home until tomorrow." }] });
  const result = evaluateClaimJudgment(p, candidate(p), judgeModel);
  assert.equal(result.citationAudit.missingFinalAnswer, true);
  assert.equal(result.status, "not_assessed");
  assert.equal(result.totalUnits, 1);
  assert.throws(() => createClaimPacket(null, message, [], "anthropic/claude-opus-5", asOf), /NO_VISIBLE_CONTENT/);
});
test("judge requires reservation, refuses self-judge before spending, and labels injected runs simulated", async () => {
  const p = packet(); let reservations = 0;
  const options = { model: judgeModel, reserve: () => { reservations++; }, signal: new AbortController().signal, generate: async () => ({ object: candidate(p) }) };
  await assert.rejects(judgeEvidence(p, { ...options, model: p.generationModel }), /INDEPENDENT/);
  assert.equal(reservations, 0);
  const result = await judgeEvidence(p, options);
  assert.equal(result.execution, "simulated"); assert.equal(reservations, 1);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(judgeEvidence(p, { ...options, signal: controller.signal }));
  assert.equal(reservations, 1);
});
test("judge rejects changed, oversized and rehashed incomplete packets before reserving or generating", async () => {
  let reservations = 0, generations = 0;
  const options = { model: judgeModel, reserve: () => { reservations++; }, signal: new AbortController().signal, generate: async () => { generations++; return { object: {} }; } };
  const changed = packet(); changed.message += " edited";
  await assert.rejects(judgeEvidence(changed,options),/CLAIM_PACKET_CHANGED/);
  const oversized = createClaimPacket({ ...answer, reason: "Risk. ".repeat(101) },message,retrieve(message).guidance,"anthropic/claude-opus-5",asOf);
  assert.ok(oversized.units.length > 100);
  await assert.rejects(judgeEvidence(oversized,options),/UNIT_LIMIT_NO_TRUNCATION/);
  assert.ok(oversized.units.length > 100, "No claims are truncated to force a judge pass");
  const incomplete = packet(); incomplete.units.pop();
  const { packetHash: _old, ...payload } = incomplete; incomplete.packetHash = evidenceHash(payload);
  await assert.rejects(judgeEvidence(incomplete,options),/UNIT_CONTENT_MISMATCH/);
  const empty = packet(); empty.units = [];
  const { packetHash: _emptyHash, ...emptyPayload } = empty; empty.packetHash = evidenceHash(emptyPayload);
  await assert.rejects(judgeEvidence(empty,options),/UNIT_LIMIT_NO_TRUNCATION/);
  assert.equal(reservations,0); assert.equal(generations,0);
});
test("judge freezes the validated packet across asynchronous generation", async () => {
  const original = packet(), expectedHash = original.packetHash;
  const result = await judgeEvidence(original, { model: judgeModel, reserve: () => {}, signal: new AbortController().signal,
    generate: async (prompt) => {
      const sent = JSON.parse(prompt) as typeof original;
      original.message = "changed after submission";
      return { object: candidate(sent) };
    },
  });
  assert.equal(result.packetHash,expectedHash); assert.equal(result.execution,"simulated");
});
test("pre-aborted judge requests neither reserve budget nor dispatch generation", async () => {
  const controller = new AbortController(); controller.abort(new Error("cancelled before audit"));
  let reservations = 0, generations = 0;
  await assert.rejects(judgeEvidence(packet(), {
    model: judgeModel, reserve: () => { reservations++; }, signal: controller.signal,
    generate: async () => { generations++; return { object: {} }; },
  }), /cancelled before audit/);
  assert.equal(reservations,0); assert.equal(generations,0);
});
test("judge cancellation bounds an uncooperative transport and observes its late rejection", async () => {
  const controller = new AbortController(); let reservations = 0;
  let receivedSignal: AbortSignal | undefined, rejectLate!: (error: Error) => void, confirmDispatch!: () => void;
  const dispatched = new Promise<void>((resolve) => { confirmDispatch = resolve; });
  const unhandled: unknown[] = [], capture = (reason: unknown) => { unhandled.push(reason); };
  process.on("unhandledRejection",capture);
  try {
    const pending = judgeEvidence(packet(), {
      model: judgeModel, reserve: () => { reservations++; }, signal: controller.signal,
      generate: (_prompt, signal) => {
        receivedSignal = signal; confirmDispatch();
        // Deliberately ignore abort, as a broken SDK/transport could do.
        return new Promise((_resolve,reject) => { rejectLate = reject; });
      },
    });
    const cancelled = assert.rejects(pending,/stop retrospective audit/);
    await dispatched;
    assert.ok(receivedSignal); assert.notEqual(receivedSignal,controller.signal);
    controller.abort(new Error("stop retrospective audit"));
    await cancelled;
    assert.equal(receivedSignal.aborted,true); assert.equal(reservations,1);
    rejectLate(new Error("late transport rejection"));
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(unhandled,[]);
  } finally { process.off("unhandledRejection",capture); }
});
test("document verification distinguishes wrong page, changed passage, truncation and actual excerpt match", async () => {
  const source = { id: "fake", url: "https://www.cdc.gov/test" };
  const expectedDocument = { title: "Example clinical document", passages: [{ id: "p1", excerpt: "Seek medical attention immediately." }] };
  const check = (body: string, maxBytes?: number) => checkSourceLink(source, {
    allowedHosts: new Set(["www.cdc.gov"]), expectedDocument, ...(maxBytes ? { maxBytes } : {}),
    fetchImpl: async () => new Response(body, { headers: { "content-type": "text/html" } }),
  });
  const valid = "<html><title>Example clinical document</title><p>Seek medical attention immediately.</p></html>";
  assert.equal((await check(valid)).documentVerification?.status, "identity_and_excerpt_match");
  assert.equal((await check(valid)).documentVerification?.clinicalSupportVerified, false);
  assert.equal((await check(valid.replace("Example clinical document", "Publisher home page"))).documentVerification?.status, "identity_mismatch");
  assert.equal((await check(valid.replace("immediately", "later"))).documentVerification?.status, "passage_changed_or_missing");
  assert.equal((await check(valid.replace("<p>", "<script>").replace("</p>", "</script>"))).documentVerification?.status, "passage_changed_or_missing");
  assert.equal((await check(valid, 30)).documentVerification?.status, "truncated_unverified");
});
test("active Mastra path records evidence audit; a known emergency needs no extra intake or judge call", async () => {
  const directory = mkdtempSync(join(tmpdir(), "evidence-workflow-"));
  const roles: string[] = [];
  const app = createDispositionRuntime(directory, async (prompt, _context, role) => {
    roles.push(role); assert.doesNotMatch(prompt, /recordHash|libraryHash|clinicianApproval/);
    return { answer: role === "intake" ? { emergency: false, questionId: "none", quote: "" } : answer, usage: { inputTokens: 100, outputTokens: 80 } };
  }, { profile: "conversational-opus", budget: "compact" });
  try {
    const run = await app.assess(message);
    assert.equal(run.status, "complete"); assert.equal(run.modelCalls, 1);
    assert.deepEqual(roles, ["disposition"]);
    assert.equal(run.retrievalAudit?.libraryHash, libraryHash);
    assert.equal(run.evidenceAudit?.citations[0].support, "not_assessed");
    assert.equal(run.guidanceHash, libraryHash);
    const persisted = JSON.parse(readFileSync(join(directory, "runs", run.runId + ".json"), "utf8"));
    assert.equal(persisted.guidance[0].evidenceRecord.recordHash, run.guidance[0].evidenceRecord?.recordHash);
    assert.equal(run.tracePersisted, true);
  } finally { await app.mastra.shutdown(); }
});
