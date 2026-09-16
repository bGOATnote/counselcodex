import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReviewPacket, evaluateReview, criterionIds, validateReviewPacket, type Judgment } from "../src/evaluation/response-review.ts";
import { responseReviewStore } from "../src/evaluation/response-review-store.ts";
import { fixtureRun, rehash, reviewContrasts } from "./response-review-fixtures.ts";
import type { ReviewExecution } from "../src/evaluation/response-review-runtime.ts";
import { EXECUTION_POLICY } from "../src/disposition/execution-policy.ts";

const judgment = (): Judgment => ({ criteria: criterionIds.map(id => ({ id, verdict: "abstain", reason: "Fixture requires an independent assessment.", anchors: [{ unitId: "patient", quote: "My usual migraine" }] })) });
test("packet contains the exact issued answer and early emissions, not private drafts or dataset labels", () => {
  const run = fixtureRun(); run.rejectedAnswer = { patientMessage: "PRIVATE REJECTED DRAFT" };
  run.responseEvents = [{ kind: "opening", text: "What changed today?", quote: "usual migraine", sequence: 1, elapsedMs: 1000 }];
  const packet = createReviewPacket(run);
  assert.ok(packet.units.some(u => u.id === "early-0" && u.text.includes("What changed today?")));
  assert.ok(!JSON.stringify(packet).includes("PRIVATE REJECTED DRAFT"));
  assert.equal(packet.units.filter(u => u.kind === "source").length, 1);
  assert.throws(() => validateReviewPacket({ ...packet, packetHash: "wrong" }), /HASH_MISMATCH/);
  assert.throws(() => createReviewPacket({ ...run, message: "replaced" }), /RUN_HASH_MISMATCH/);
});
test("failed final does not erase an earlier emergency and can never become no_flags", () => {
  const run = fixtureRun(); run.answer = null; run.status = "unavailable"; run.safetyFloor = { disposition: "EMERGENCY_NOW", directive: "Call 911 now." }; rehash(run);
  const packet = createReviewPacket(run), value = judgment(); value.criteria.forEach(c => { if (c.id !== "research_support") c.verdict = "pass"; });
  assert.ok(packet.units.find(u => u.id === "final")!.text.includes("Call 911 now."));
  assert.equal(evaluateReview(packet, value).outcome, "indeterminate");
});
test("judge requires complete unique criteria, exact anchors and actual research passages", () => {
  const packet = createReviewPacket(fixtureRun());
  let value = judgment(); value.criteria[6] = value.criteria[0]; assert.throws(() => evaluateReview(packet, value), /INCOMPLETE_CRITERIA/);
  value = judgment(); value.criteria[0].anchors[0].quote = "invented phrase"; assert.throws(() => evaluateReview(packet, value), /ANCHOR_NOT_FOUND/);
  value = judgment(); value.criteria.find(c => c.id === "research_support")!.verdict = "pass"; assert.throws(() => evaluateReview(packet, value), /WITHOUT_PASSAGE/);
  value = judgment(); value.criteria[1].verdict = "fail"; const review = evaluateReview(packet, value); assert.equal(review.outcome, "concerns"); assert.equal(review.clinicalApproval, false);
});
test("oversized, altered source and same-vendor packets reject before reservation", () => {
  let run = fixtureRun(); run.message = "x".repeat(41000); rehash(run); assert.throws(() => createReviewPacket(run), /TOO_LARGE/);
  run = fixtureRun(); run.guidance[0].retrievedPassages![0].excerpt += " altered"; assert.throws(() => createReviewPacket(run), /SOURCE_HASH_MISMATCH/);
  run = fixtureRun(); run.model = "openai/gpt-6-astra"; assert.throws(() => createReviewPacket(run), /INDEPENDENT_JUDGE_REQUIRED/);
});
test("durable jobs are idempotent, bounded and never retry unknown provider completion", () => {
  const path = join(mkdtempSync(join(tmpdir(), "counsel-review-")), "reviews.db"); let now = new Date("2026-09-11T22:00:00Z");
  let store = responseReviewStore(path, () => now); const packet = createReviewPacket(fixtureRun());
  store.enqueue(packet); store.enqueue(packet); assert.equal(store.pending().length, 1);
  assert.ok(store.claim(packet.runId)); assert.equal(store.claim(packet.runId), null); assert.equal(store.budget().allocatedUsd, 1.25);
  store.close(); now = new Date(now.getTime() + 121000); store = responseReviewStore(path, () => now);
  assert.equal(store.interruptExpired(), 0, "a reasoning review can exceed two minutes");
  now = new Date(now.getTime() + EXECUTION_POLICY.reviewStaleAfterMs - 121000);
  assert.equal(store.interruptExpired(), 0, "allowance plus grace must elapse before interruption");
  now = new Date(now.getTime() + 1);
  assert.equal(store.interruptExpired(), 1); assert.equal(store.get(packet.runId)?.state, "interrupted"); assert.equal(store.claim(packet.runId), null);
  for (let i = 2; i <= 16; i++) { const p = createReviewPacket(fixtureRun(i)); store.enqueue(p); store.claim(p.runId); store.finish(p.runId, null); }
  const next = createReviewPacket(fixtureRun(17)); store.enqueue(next); assert.throws(() => store.claim(next.runId), /ALLOCATION_REACHED/); assert.equal(store.budget().allocatedUsd, 20); store.close();
});
test("result cannot attach to another input and physician feedback is append-only, not model approval", () => {
  const store = responseReviewStore(join(mkdtempSync(join(tmpdir(), "counsel-review-")), "reviews.db")); const packet = createReviewPacket(fixtureRun()); store.enqueue(packet); store.claim(packet.runId);
  const result: ReviewExecution = { review: evaluateReview(packet, judgment()), workflowRunId: "test", traceId: "test", tracePersisted: false, durationMs: 1, usage: { inputTokens: 0, outputTokens: 0 }, estimatedUsd: 0 };
  const bad = structuredClone(result); bad.review.packetHash = "wrong"; assert.throws(() => store.finish(packet.runId, bad), /MISMATCH/);
  assert.equal(store.finish(packet.runId, result), true); assert.equal(store.finish(packet.runId, null), false);
  assert.equal(store.budget().allocatedUsd, 0); assert.equal(store.budget().originalReservationsUsd, 1.25);
  store.feedback(packet.runId, packet.packetHash, "overtriage", "agree", ""); store.feedback(packet.runId, packet.packetHash, "overtriage", "disagree", "Earlier emergency message was not justified.");
  assert.equal(store.feedbackFor(packet.runId).length, 2); assert.equal(store.get(packet.runId)?.result?.review.clinicalApproval, false); store.close();
});
test("authored contrast controls are unique and frozen independently of their expected verdict", () => {
  const cases = reviewContrasts(); assert.equal(new Set(cases.map(c => c.run.runId)).size, cases.length);
  cases.forEach(c => { const packet = createReviewPacket(c.run); assert.equal("expected" in packet, false); assert.equal("criterion" in packet, false); });
});
test("judge cannot pass a blocking question on relevance alone without distinct route branches", () => {
  const run = fixtureRun(); run.answer = null; run.status = "awaiting_input"; run.clarification = { question: "Which fingers are affected?", why: "This may help diagnostic localization.", quote: "usual migraine" }; rehash(run);
  const value = judgment(); value.criteria.find(c => c.id === "clarification")!.verdict = "pass";
  assert.throws(() => evaluateReview(createReviewPacket(run), value), /CLARIFICATION_PASS_WITHOUT_ROUTING_CONSEQUENCE/);
  run.clarification.routingConsequence = { alternatives: [{ answer: "Sudden onset", route: "EMERGENCY_NOW" }, { answer: "Gradual intermittent symptoms", route: "STANDARD_ASYNC" }] };
  assert.equal(evaluateReview(createReviewPacket(run), value).outcome, "indeterminate");
  run.clarification.routingConsequence.alternatives[0].route = "STANDARD_ASYNC";
  assert.throws(() => evaluateReview(createReviewPacket(run), value), /CLARIFICATION_PASS_WITHOUT_ROUTING_CONSEQUENCE/);
});

test("invalid final JSON or mismatched status is rejected even with a valid packet hash", () => {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value !== null && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])) : value;
  for (const text of ["not JSON", "null", "[]", JSON.stringify({ status: "awaiting_input" })]) {
    const packet = createReviewPacket(fixtureRun());
    packet.units.find(u => u.id === "final")!.text = text;
    const { packetHash: _old, ...body } = packet;
    packet.packetHash = createHash("sha256").update(JSON.stringify(canonical(body))).digest("hex");
    assert.throws(() => validateReviewPacket(packet), /PACKET_FINAL_INVALID/);
  }
});
