import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkAnswer, checkAnswerForFullReview, onsetPatternCheck, ONSET_PATTERN_ADMISSION_POLICY, ONSET_PATTERN_REVIEW_DETAIL, type DispositionAnswer, type DispositionRun } from "../src/disposition/contract.ts";
import { graphPromptHash, GRAPH_VERSION } from "../src/disposition/clinical-graph.ts";
import { resolveGraphConfig } from "../src/disposition/graph-config.ts";
import { modelRoutingReview } from "../src/evaluation/physician-cohort.ts";

// Exact patient/flag text from retained GUI run d00e9457-0c05-43f9-9492-dc5e64f4c4e2.
// This checks the deterministic boundary, not the full answer's clinical quality.
const original = "40F. My usual migraine started this morning — same one-sided throbbing and light sensitivity I always get. I'm out of sumatriptan and would like a refill.";
const currentQuote = "It came on gradually, like my usual migraines";
const current = `${original}\n\nAdditional patient information: ${currentQuote}. No new weakness or trouble speaking.`;
const onsetConcern = "Thunderclap/sudden maximal-onset headache";
function checks(message: string, quote: string, concern = onsetConcern, checker = checkAnswerForFullReview) {
  const answer: DispositionAnswer = { disposition: "ASYNC_PHYSICIAN", reviewPriority: "priority", workType: "medication_request",
    patientMessage: "Counsel clinician review is recommended today; this does not confirm acceptance.",
    reason: "Synthetic contract fixture, not a clinical conclusion.", differential: [],
    redFlags: [{ concern, status: "denied", quote }], vitalSigns: "No measurements supplied; whether any were taken is unknown.",
    questions: [], evidence: [], evidenceLimitations: "No evidence is supplied by this test." };
  return checker(answer, message, [], null);
}
function onsetStatus(message: string, quote: string, concern = onsetConcern) {
  return checks(message, quote, concern).find(c => c.id === "usual_pattern_not_onset_denial")!.status;
}

test("three-state pattern guard: usual-only fails, onset language is deferred, unrelated flags pass", () => {
  for (const quote of ["My usual migraine", "same one-sided throbbing and light sensitivity I always get", "My usual migraine started this morning"]) {
    assert.equal(onsetStatus(quote, quote), "fail");
  }
  const deferred = checks(current, currentQuote).find(c => c.id === "usual_pattern_not_onset_denial")!;
  assert.equal(deferred.status, "not_assessed");
  assert.equal(deferred.detail, ONSET_PATTERN_REVIEW_DETAIL);
  assert.equal(onsetPatternCheck([]).status, "pass");
  assert.equal(onsetPatternCheck([{ concern: onsetConcern, status: "unknown", quote: "" }]).status, "pass");
  assert.equal(onsetPatternCheck([{ concern: "Change from usual symptom pattern", status: "denied", quote: "My usual migraine" }]).status, "pass");
  assert.equal(onsetPatternCheck([
    { concern: onsetConcern, status: "denied", quote: currentQuote },
    { concern: onsetConcern, status: "denied", quote: "same as always" },
  ]).status, "fail", "one onset assertion cannot cover another usual-only denial");
});

test("exact GUI onset and worst-ever severity both remain semantic questions, never regex approval", () => {
  for (const concern of [onsetConcern, "Worst-ever headache", "Sudden or worst-ever headache"]) {
    assert.equal(onsetStatus(current, currentQuote, concern), "not_assessed");
  }
  assert.equal(checks(current, currentQuote).find(c => c.id === "quoted_patient_evidence")!.status, "pass");
  assert.equal(checks(original, currentQuote).find(c => c.id === "quoted_patient_evidence")!.status, "fail");
  assert.equal(checks(current, currentQuote).find(c => c.id === "research_support")!.status, "fail", "other release checks remain independent");
});

test("contextual adversarial controls are preserved for full judge review, not falsely called parser-safe", () => {
  const controls: [string, string][] = [
    [`${original} It did not come on gradually, unlike my usual migraines.`, "It did not come on gradually, unlike my usual migraines"],
    [`${original} If ${currentQuote}, would that matter?`, currentQuote],
    [`${original} Last year ${currentQuote}.`, currentQuote],
    [`My sister's migraine came on gradually, like my usual migraines.`, "My sister's migraine came on gradually, like my usual migraines"],
    [`My migraine came on gradually, like my usual migraines. That was my episode in 2018. Today I have a different headache.`, "My migraine came on gradually, like my usual migraines"],
    [`My migraine came on gradually, like my usual migraines, when I was a teenager.`, "My migraine came on gradually, like my usual migraines"],
    [`${original} Another patient described a headache. ${currentQuote}.`, currentQuote],
    [`My current migraine came on gradually, like usual. It reached maximum intensity in ten seconds.`, "My current migraine came on gradually, like usual"],
    [`Suppose I tell you this. My migraine came on gradually, like usual.`, "My migraine came on gradually, like usual"],
    [`${original} ${currentQuote}. But TODAY it was sudden.`, currentQuote],
    [`My usual migraine came on gradually, not sudden, but this is the worst headache of my life.`, "My usual migraine came on gradually, not sudden, but this is the worst headache of my life"],
  ];
  for (const [message, quote] of controls) {
    assert.ok(message.includes(quote));
    assert.equal(onsetStatus(message, quote, "Sudden or worst-ever headache"), "not_assessed", message);
    assert.equal(checks(message, quote).find(c => c.id === "quoted_patient_evidence")!.status, "pass");
    // Exact membership is not truthful attribution. None of these tests assert
    // the full judge succeeds; prospective fixed-packet semantic tests must do so.
  }
});

test("unrelated gradual improvement is not itself onset language", () => {
  for (const quote of ["It improved gradually, like my usual migraines", "My headache got better gradually, same as usual"]) {
    assert.equal(onsetStatus(`${original} ${quote}.`, quote), "fail");
  }
  const mixed = "My usual headache started to improve gradually after treatment";
  assert.equal(onsetStatus(mixed, mixed), "not_assessed", "even an onset-verb match can need semantic rejection");
});

test("direct denial scope is deferred and the new pattern-only identity differs from pre-fix GUI", () => {
  const denial = "This is my usual migraine, not sudden or worst-ever";
  assert.equal(onsetStatus(denial, denial), "not_assessed");
  assert.equal(ONSET_PATTERN_ADMISSION_POLICY.version, "onset-pattern-admission/v1");
  assert.match(ONSET_PATTERN_REVIEW_DETAIL, /mandatory full exact-draft judge/);
  assert.notEqual(graphPromptHash(resolveGraphConfig({})), "1a86dc27cadf7dad4faa66c89b295968a6c4d822881c53570d60791eb7b5a867");
  assert.equal(checks(current, currentQuote).find(c => c.id === "unmeasured_vitals_not_dismissed")!.status, "pass");
});

test("legacy default never inherits the candidate-only semantic deferral", () => {
  for (const [quote, legacyStatus, candidateStatus] of [
    [currentQuote, "fail", "not_assessed"],
    ["My usual migraine", "fail", "fail"],
    ["This is my usual migraine, not sudden or worst-ever", "pass", "not_assessed"],
  ] as const) {
    const legacy = checks(quote, quote, onsetConcern, checkAnswer), candidate = checks(quote, quote);
    assert.equal(legacy.find(c => c.id === "usual_pattern_not_onset_denial")!.status, legacyStatus);
    assert.equal(candidate.find(c => c.id === "usual_pattern_not_onset_denial")!.status, candidateStatus);
    assert.deepEqual(candidate.filter(c => c.id !== "usual_pattern_not_onset_denial"), legacy.filter(c => c.id !== "usual_pattern_not_onset_denial"));
  }
  assert.ok(checks(current, currentQuote, onsetConcern, checkAnswer).some(c => c.id === "usual_pattern_not_onset_denial" && c.status === "fail"), "a legacy fail-only release gate still blocks this assertion without the full-review candidate");
});

test("candidate wrapper preserves every recorded base check and full review binding in both phase5 GUI runs", () => {
  const promptHash = "598165cd6840bb80192b05001eca7934f0acea10b450cda81dcf8a600f07f73f";
  if (GRAPH_VERSION === "evidence-graph/v23") assert.equal(graphPromptHash(resolveGraphConfig({})), promptHash, "isolating legacy admission changes no candidate prompt or semantics");
  else assert.notEqual(graphPromptHash(resolveGraphConfig({})), promptHash, "later producer versions must not claim the archived prompt identity");
  for (const id of ["c19ba1e2-78a2-4ad1-9f60-bef6c4385d19", "17e17bf6-2fa6-4fd4-9d26-8605e7a7fef1"]) {
    const file = new URL(`../outputs/clinical-lift-v23-gui-2026-09-14/phase5/runs/${id}.json`, import.meta.url);
    const archived = readFileSync(file, "utf8"), run = JSON.parse(archived) as DispositionRun;
    assert.equal(run.promptHash, promptHash);
    assert.equal(run.status, "complete");
    assert.ok(run.answer);
    const before = JSON.stringify(run), candidate = checkAnswerForFullReview(run.answer, run.message, run.guidance, null);
    for (const check of candidate) assert.deepEqual(check, run.checks.find(saved => saved.id === check.id), `${id}: ${check.id}`);
    assert.equal(modelRoutingReview(run, "match").status, "supported", id);
    assert.equal(JSON.stringify(run), before, "replay does not mutate the saved result");
    assert.equal(readFileSync(file, "utf8"), archived, "the actual GUI artifact remains unchanged");
  }
});
