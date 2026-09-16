import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { asyncAction, asyncTimingPresent, ROUTING_POLICY_VERSION, ACTION_TIMING_ADMISSION_POLICY, QUEUE_POLICY, routingFieldsValid } from "../src/disposition/routing-policy.ts";
import { checkAnswer, type DispositionAnswer } from "../src/disposition/contract.ts";
import { sha256 } from "../src/evidence/rag/model.ts";
import { graphPromptHash } from "../src/disposition/clinical-graph.ts";
import type { GraphConfig } from "../src/disposition/graph-config.ts";

const routine = { disposition: "ASYNC_PHYSICIAN", reviewPriority: "routine", workType: "clinical_review" } as const;
test("standard async requires same-day clinician review without duplicating the separate availability text", () => {
  // Exact opening from v11 historical-father control 7d2d3a68.
  const opening = "I recommend a standard (non-urgent) message review with a Counsel clinician in this thread today during service hours to go over your cholesterol numbers and what your father's heart attack means for your own risk.";
  assert.equal(asyncTimingPresent(routine, opening), true);
  assert.equal(asyncTimingPresent(routine, "I recommend review by the Counsel clinician today during service hours."), true);
  assert.equal(asyncTimingPresent(routine, "I recommend physician review with a same-day service-hours target."), true);
  assert.equal(asyncTimingPresent(routine, "I recommend clinician review today."), true);
  assert.equal(asyncTimingPresent(routine, "I recommend clinician review with a same-day target."), true);
  assert.equal(asyncTimingPresent(routine, asyncAction(routine)), true);
  assert.equal(ROUTING_POLICY_VERSION, "five-route-queue/v2");
  for (const text of [
    "Review today during service hours.", // no clinician owner
    "I recommend review today.", // no clinician owner
    "I recommend review with a same-day target.", // no clinician owner
    "I recommend clinician review during service hours.", // no timing
    "I recommend clinician review tomorrow during service hours.",
    "I recommend clinician review within 48 hours during service hours.",
  ]) assert.equal(asyncTimingPresent(routine, text), false, text);
  // Priority urgency keeps its existing same-day clinician requirement.
  assert.equal(asyncTimingPresent({ ...routine, reviewPriority: "priority" }, "Counsel clinician review is recommended today."), true);
  assert.equal(asyncTimingPresent({ ...routine, reviewPriority: "priority" }, "Counsel clinician review is recommended within 48 hours."), false);
  assert.equal(routingFieldsValid(routine), true);
  assert.equal(routingFieldsValid({ ...routine, reviewPriority: null }), false, "timing admission does not infer priority");
  assert.equal(QUEUE_POLICY.availability, "Service availability not connected. No live clinician acceptance or response ETA is available.");
  assert.equal(QUEUE_POLICY.target, "Prompt same-day review during service hours; priority requests are reviewed first. No response time is guaranteed.");
});
test("timing equivalence does not approve clinician-response guarantees or invented handoffs", () => {
  const base: DispositionAnswer = { ...routine, reason: "A cholesterol result requires clinician interpretation.", patientMessage: "", differential: [], redFlags: [], vitalSigns: "No vital-sign readings were provided.", questions: [], evidence: [], evidenceLimitations: "Test fixture, not clinical validation." };
  for (const patientMessage of [
    "Your clinician will review your message today during service hours.",
    "I have booked your appointment today during service hours; a clinician will contact you.",
    "Your message has been sent. A physician will review it today during service hours.",
    "Your clinician will review your message today.",
    "I have booked your appointment today; a clinician will contact you.",
    "Your message has been sent. A physician will review it today.",
  ]) {
    const checks = checkAnswer({ ...base, patientMessage }, "Please discuss my cholesterol result.", [], null);
    assert.equal(checks.find(c => c.id === "action_timing_present")?.status, "pass");
    assert.equal(checks.find(c => c.id === "no_unconfirmed_handoff")?.status, "fail");
  }
});

test("archived C10 wording passes timing alone without revising its frozen withheld outcome", () => {
  const url = new URL("../outputs/clinical-lift-v23-cohort-live-2026-09-14/10-C10-run.json", import.meta.url), raw = readFileSync(url, "utf8");
  assert.equal(sha256(raw), "f3e9724854b3c9d0dc65458303be706e3f583b2506827b753ffeffbbc60b8833");
  const archived = JSON.parse(raw);
  assert.equal(archived.runId, "c9f9cae1-ad94-4193-8ad4-1bb40001e1e5");
  assert.equal(archived.status, "review_required");
  assert.equal(archived.checks.find((c: { id: string }) => c.id === "action_timing_present").status, "fail");
  for (const draft of [archived.agents.find((a: { role: string }) => a.role === "disposition").output, archived.rejectedAnswer]) {
    assert.match(draft.patientMessage, /Counsel clinician review this in this thread today \(standard priority\)/);
    assert.doesNotMatch(draft.patientMessage, /service.hours/i);
    assert.equal(asyncTimingPresent(draft, draft.patientMessage), true);
    const checks = checkAnswer({ ...draft, evidence: draft.citations.map((c: { passageId: string; claim: string }) => ({ sourceId: c.passageId, claim: c.claim })) }, archived.message, archived.guidance, null);
    assert.equal(checks.find(c => c.id === "action_timing_present")?.status, "pass");
    assert.equal(checks.find(c => c.id === "no_unconfirmed_handoff")?.status, "pass");
  }
  assert.equal(sha256(readFileSync(url, "utf8")), sha256(raw));
  // Only a wording/admission regression: no replayed judge, clinical approval,
  // re-scoring of this cohort, or claim that either full answer is correct.
});

test("action timing admission has its own identity without changing the queue policy", () => {
  const manifest = JSON.parse(readFileSync(new URL("../outputs/clinical-lift-v23-cohort-plan-2026-09-14/manifest.json", import.meta.url), "utf8")) as { config: GraphConfig; promptHash: string };
  assert.equal(ROUTING_POLICY_VERSION, "five-route-queue/v2");
  assert.equal(ACTION_TIMING_ADMISSION_POLICY.version, "action-timing-admission/v1");
  assert.notEqual(graphPromptHash(manifest.config), manifest.promptHash);
  assert.notEqual(graphPromptHash(manifest.config), "963fc27ab7713c18079c84ed55e4270b9851d2752e102ac9c58b690da3f5f219", "the C36-only post-cohort identity is distinct too");
});
