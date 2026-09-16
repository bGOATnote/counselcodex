import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { clinicianQueueStore } from "../lib/clinician-queue-store.ts";
import { queueHandler } from "../lib/clinician-queue-handler.ts";
import { queueStateLabel } from "../lib/clinician-queue-presentation.ts";
import { routingFieldsValid, routingTiming, asyncAction, operationalRoute, routingLabel, ROUTING_POLICY_VERSION } from "../../../src/disposition/routing-policy.ts";
import { checkAnswer, type DispositionRun } from "../../../src/disposition/contract.ts";

const message = "My usual migraine started today. I need a refill.";
const run = (priority: "priority" | "routine" = "priority", text = message): DispositionRun => ({
  runId: randomUUID(), message: text, status: "complete", safetyFloor: null,
  answer: { disposition: "ASYNC_PHYSICIAN", reviewPriority: priority, workType: "medication_request", reason: "This request needs a prescribing review.", patientMessage: asyncAction({ disposition: "ASYNC_PHYSICIAN", reviewPriority: priority }), redFlags: [], differential: [], questions: [], vitalSigns: "No measurements supplied.", evidence: [], evidenceLimitations: "Evidence requires review." },
} as unknown as DispositionRun);
function setup() {
  let time = new Date("2026-09-11T18:00:00Z");
  const path = join(mkdtempSync(join(tmpdir(), "counsel-queue-test-")), "queue.db");
  return { path, clock: () => time, advance: (minutes: number) => { time = new Date(time.getTime() + minutes * 60_000); } };
}
test("five operational routes preserve distinct async priority without forcing physical care", () => {
  assert.equal(operationalRoute(run().answer!), "PRIORITY_ASYNC");
  assert.equal(operationalRoute(run("routine").answer!), "STANDARD_ASYNC");
  assert.equal(routingLabel(run("routine").answer!), "Standard async");
  assert.ok(routingFieldsValid(run().answer!));
  assert.ok(routingFieldsValid({ disposition: "EMERGENCY_NOW", reviewPriority: null, workType: null }));
  assert.equal(routingFieldsValid({ disposition: "ASYNC_PHYSICIAN" }), false);
  assert.equal(routingFieldsValid({ disposition: "SAME_DAY_IN_PERSON", reviewPriority: "priority", workType: "medication_request" }), false);
  for (const priority of ["priority", "routine"] as const) {
    const answer = run(priority).answer!;
    assert.equal(checkAnswer(answer, message, [], null).find(c => c.id === "action_timing_present")?.status, "pass");
    assert.equal(checkAnswer(answer, message, [], null).find(c => c.id === "no_unconfirmed_handoff")?.status, "pass");
    assert.match(routingTiming(answer, "legacy"), /messaging care/);
    assert.doesNotMatch(answer.patientMessage, /Arrange review with a clinician within 24|in-person check/);
  }
});
test("disk queue survives restart; duplicate enqueue never resets its deadline", () => {
  const env = setup(), id = randomUUID(); let store = clinicianQueueStore(env.path, env.clock);
  const revision = store.begin(id, message); store.finish(id, revision, run());
  const first = store.act(id, revision, "enqueue", null); assert.equal(first.dueAt, null);
  env.advance(20); store.close(); store = clinicianQueueStore(env.path, env.clock);
  const duplicate = store.act(id, revision, "enqueue", null);
  assert.equal(duplicate.dueAt, first.dueAt); assert.equal(duplicate.overdue, false);
  assert.equal(duplicate.policy, ROUTING_POLICY_VERSION); assert.equal(store.service().status, "not_connected");
  assert.equal(store.service().responseEta, null);
  assert.equal(store.list().length, 1); assert.equal(store.events(id).filter(e => e.kind === "queued").length, 1); store.close();
});
test("usual migraine cannot silently become a denied thunderclap", () => {
  const answer = run().answer!;
  answer.redFlags = [{ concern: "Thunderclap onset", status: "denied", quote: "My usual migraine started today." }];
  assert.equal(checkAnswer(answer, message, [], null).find(c => c.id === "usual_pattern_not_onset_denial")?.status, "fail");
  answer.redFlags[0] = { concern: "Thunderclap onset", status: "unknown", quote: "" };
  assert.equal(checkAnswer(answer, message, [], null).find(c => c.id === "usual_pattern_not_onset_denial")?.status, "pass");
});
test("technique review is not an inhaler instruction and does not excuse a later instruction", () => {
  const answer = run().answer!;
  answer.patientMessage = "A clinician can review how you use the inhaler and refill eligibility in this thread.";
  const status = () => checkAnswer(answer, "Can I refill my albuterol inhaler?", [], null).find(c => c.id === "no_unverified_inhaler_plan")?.status;
  assert.equal(status(), "pass");
  answer.patientMessage += " Use albuterol now while waiting.";
  assert.equal(status(), "fail");
  answer.patientMessage = "You describe using your albuterol inhaler about once a week.";
  assert.equal(status(), "pass");
  answer.patientMessage += " Keep using your inhaler while waiting.";
  assert.equal(status(), "fail");
  answer.vitalSigns = "No vital signs were provided; none are needed for triage here.";
  assert.equal(checkAnswer(answer, message, [], null).find(c => c.id === "unmeasured_vitals_not_dismissed")?.status, "fail");
});
test("routine target is operational, acceptance and response require explicit state transitions", () => {
  const env = setup(), store = clinicianQueueStore(env.path, env.clock), id = randomUUID();
  const revision = store.begin(id, message); store.finish(id, revision, run("routine"));
  const queued = store.act(id, revision, "enqueue", null); assert.equal(queued.dueAt, null);
  assert.throws(() => store.act(id, revision, "respond", 1, "Not yet accepted"), /INVALID_TRANSITION/);
  const accepted = store.act(id, revision, "accept", queued.version);
  assert.equal(accepted.owner, "Demo reviewer");
  assert.throws(() => store.act(id, revision, "accept", queued.version), /STALE_TASK/);
  assert.throws(() => store.act(id, revision, "respond", accepted.version, ""), /NOTE_REQUIRED/);
  const response = store.act(id, revision, "respond", accepted.version, "Simulated review completed; no prescription issued.");
  assert.throws(() => store.act(id, revision, "resolve", response.version, "This cannot erase pending follow-up."), /FOLLOW_UP_OPEN/);
  const followUp = store.act(id, revision, "follow_up", response.version, "Demo review: no further check-in indicated for this test.", { state: "not_needed", dueAt: null });
  const resolved = store.act(id, revision, "resolve", followUp.version, "Demo follow-up ownership recorded, no real care delivered.");
  assert.equal(resolved.state, "resolved"); assert.equal(store.events(id).at(-1)?.kind, "resolved"); store.close();
});
test("updates invalidate old acceptance and stale runs; emergency survives failed completion", () => {
  const env = setup(), store = clinicianQueueStore(env.path, env.clock), id = randomUUID();
  const r1 = store.begin(id, message); store.finish(id, r1, run()); const queued = store.act(id, r1, "enqueue", null);
  store.act(id, r1, "accept", queued.version);
  const updated = message + "\n\nAdditional patient information: My right arm is weak and I cannot speak clearly.";
  const r2 = store.begin(id, updated);
  assert.equal(store.list()[0].state, "reassessment");
  assert.throws(() => store.act(id, r1, "respond", 2, "A stale response is unsafe."), /STALE_ASSESSMENT/);
  assert.equal(store.finish(id, r1, run()), false);
  store.notice(id, r2, { disposition: "EMERGENCY_NOW", directive: "Call 911 now.", source: "emergency_agent" });
  store.fail(id, r2);
  assert.equal(store.list()[0].state, "escalated"); assert.equal(store.list()[0].safetyNotice?.directive, "Call 911 now.");
  assert.match(queueStateLabel(store.list()[0]), /^Emergency now/);
  assert.equal(queueStateLabel({ ...store.list()[0], run: null, safetyNotice: { disposition: "SAME_DAY_IN_PERSON", directive: "Assessment today.", source: "emergency_agent" } }), "Same-day in-person care required");
  assert.throws(() => store.act(id, r2, "enqueue", null), /ASYNC_ASSESSMENT_REQUIRED/);
  store.finish(id, r2, run("routine", updated));
  assert.equal(store.list()[0].state, "escalated");
  assert.ok(store.events(id).some(e => e.kind === "assessment_failed")); store.close();
});
test("unrelated messages cannot merge; failed queue operations roll back and do not fabricate receipts", () => {
  const env = setup(), store = clinicianQueueStore(env.path, env.clock), id = randomUUID();
  store.begin(id, message);
  assert.throws(() => store.begin(id, "Different patient's request"), /EPISODE_INPUT_CONFLICT/);
  assert.throws(() => store.act(id, 1, "enqueue", null), /ASYNC_ASSESSMENT_REQUIRED/);
  assert.deepEqual(store.list(), []); assert.equal(store.events(id).length, 1); store.close();
});
test("failed, pending, emergency and legacy answers cannot enter a routine prescribing queue", () => {
  for (const kind of ["unavailable", "awaiting_input", "emergency", "legacy", "retained_floor", "retained_notice"]) {
    const env = setup(), store = clinicianQueueStore(env.path, env.clock), id = randomUUID(), result = run();
    if (kind === "legacy") { delete result.answer!.reviewPriority; delete result.answer!.workType; }
    else if (kind === "emergency") result.answer!.disposition = "EMERGENCY_NOW";
    else if (kind === "retained_floor") result.safetyFloor = { disposition: "EMERGENCY_NOW", directive: "Call 911 now." } as DispositionRun["safetyFloor"];
    else if (kind === "retained_notice") result.safetyNotices = [{ disposition: "SAME_DAY_IN_PERSON", directive: "Assessment today.", source: "emergency_agent" }];
    else { result.status = kind as "unavailable" | "awaiting_input"; result.answer = null; }
    const revision = store.begin(id, message); store.finish(id, revision, result);
    assert.throws(() => store.act(id, revision, "enqueue", null), /ASYNC_ASSESSMENT_REQUIRED/); store.close();
  }
});
test("queue API rejects forged clinical records and cross-origin writes before opening storage", async () => {
  let opened = 0; const env = setup(), store = clinicianQueueStore(env.path, env.clock);
  const handler = queueHandler(() => { opened++; return store; });
  const request = (body: unknown, origin = "http://localhost:4120") => new Request("http://localhost:4120/api/clinician-queue", { method: "POST", headers: { host: "localhost:4120", origin, "Content-Type": "application/json", "x-counsel-review": "local-v1" }, body: JSON.stringify(body) });
  assert.equal((await handler(request({}, "https://evil.example"))).status, 403);
  assert.equal((await handler(request({ episodeId: randomUUID(), revision: 1, version: null, action: "enqueue", run: run(), owner: "real physician" }))).status, 400);
  assert.equal(opened, 0);
  const failure = await queueHandler(() => { throw new Error("SECRET_LOCAL_PATH"); })(request({ episodeId: randomUUID(), revision: 1, version: null, action: "enqueue" }));
  assert.equal(failure.status, 503); assert.doesNotMatch(await failure.text(), /SECRET_LOCAL_PATH/); store.close();
});
test("follow-up is durable, overdue is visible, and completion is not fabricated delivery", () => {
  const env = setup(), id = randomUUID(); let store = clinicianQueueStore(env.path, env.clock);
  const rev = store.begin(id, message); store.finish(id, rev, run()); let task = store.act(id, rev, "enqueue", null);
  task = store.act(id, rev, "accept", task.version);
  assert.throws(() => store.act(id, rev, "follow_up", task.version, "Cannot plan a check in yesterday.", { state: "planned", dueAt: "2026-09-10T18:00:00Z" }), /FOLLOW_UP_INVALID/);
  task = store.act(id, rev, "follow_up", task.version, "Check whether the medication request was addressed and symptoms changed.", { state: "planned", dueAt: "2026-09-11T18:30:00Z" });
  assert.equal(task.followUp?.delivery, "not_connected"); assert.equal(task.followUp?.owner, "Demo reviewer");
  task = store.act(id, rev, "respond", task.version, "Demo response recorded; the check-in remains outstanding.");
  env.advance(31); store.close(); store = clinicianQueueStore(env.path, env.clock);
  task = store.list()[0]; assert.equal(task.followUpOverdue, true); assert.equal(task.state, "responded");
  assert.throws(() => store.act(id, rev, "resolve", task.version, "Cannot close before accounting for check-in."), /FOLLOW_UP_OPEN/);
  task = store.act(id, rev, "follow_up", task.version, "Demo check-in outcome recorded, not sent to any patient.", { state: "completed", dueAt: null });
  assert.equal(task.followUpOverdue, false); assert.equal(task.followUp?.delivery, "not_connected");
  task = store.act(id, rev, "resolve", task.version, "Demo episode closed after recorded follow-up outcome.");
  assert.equal(task.state, "resolved"); assert.equal(store.events(id).filter(e => e.kind === "follow_up_recorded").length, 2);
  const updated = message + "\n\nAdditional patient information: The headache has changed today.";
  store.begin(id, updated); assert.equal(store.list()[0].followUp?.state, "needs_plan"); store.close();
});
test("priority async sorts ahead of standard without invented response deadlines", () => {
  const env = setup(), store = clinicianQueueStore(env.path, env.clock);
  for (const priority of ["routine", "priority"] as const) { const id = randomUUID(), rev = store.begin(id, message); store.finish(id, rev, run(priority)); store.act(id, rev, "enqueue", null); env.advance(1); }
  assert.equal(store.list()[0].run?.answer?.reviewPriority, "priority");
  assert.ok(store.list().every(task => task.dueAt === null)); store.close();
});
