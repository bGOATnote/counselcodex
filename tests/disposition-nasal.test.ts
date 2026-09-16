import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eligibleQuestions, intakeEvent, intakeSourceIds, safetyIntakeSchema } from "../src/disposition/intake.ts";
import { guidanceCorpus, retrieveGuidance } from "../src/disposition/guidance.ts";
import { createDispositionRuntime, hash, repositoryRoot } from "../src/disposition/runtime.ts";
import { nasalCases } from "../src/evaluation/nasal-history.ts";
import { NASAL_BUDGET, NASAL_VERIFY_BUDGET, reserveNasalRun, reserveNasalVerificationRun } from "../src/disposition/opus-budget.ts";
import { checkAnswer, type DispositionAnswer } from "../src/disposition/contract.ts";
import { COMPACT_GENERATION } from "../src/disposition/compact-workflow.ts";

test("nasal history adds timing, relevant surgery, penetration and drainage without an extra output field", () => {
  const message = nasalCases[0].message;
  assert.deepEqual(eligibleQuestions(message).map((q) => q.id), ["nasal-history"]);
  const event = intakeEvent({ questionId: "nasal-history", quote: "runny nose" }, message)!;
  assert.match(event.text, /brain, sinus or nasal/); assert.match(event.text, /past head\/face injury/);
  assert.match(event.text, /object entering your nose/); assert.match(event.text, /When/);
  assert.match(event.text, /watery, one-sided or salty/); assert.match(event.text, /age.*immune suppression/);
  assert.ok(event.text.split(/\s+/).length <= 50);
  assert.deepEqual(safetyIntakeSchema.parse({ emergency: false, quote: "runny nose", questionId: "nasal-history" }), { emergency: false, quote: "runny nose", questionId: "nasal-history" });
  assert.equal(intakeEvent({ questionId: "nasal-history", quote: "runny nose" }, "My ankle hurts"), null);
  assert.equal(intakeEvent({ questionId: "nasal-history", quote: "Invented surgery" }, message), null);
  assert.ok(eligibleQuestions("Sore throat for two days").some((q) => q.id === "respiratory-risk"));
  assert.ok(!eligibleQuestions("Sore throat for two days").some((q) => q.id === "nasal-history"));
});

test("new selection never rewrites historical questions and links stay in the verified catalog", () => {
  const old = intakeEvent({ questionId: "respiratory-risk", quote: "runny nose" }, nasalCases[0].message);
  assert.match(old!.text, /^How old are you, and do you have immune suppression/);
  const ids = intakeSourceIds("nasal-history");
  assert.deepEqual(ids, ["mayo-cranial-csf", "cdc-common-cold", "cuh-pituitary-aftercare"]);
  assert.ok(ids.every((id) => guidanceCorpus.some((g) => g.id === id && g.url.startsWith("https://"))));
  assert.ok(retrieveGuidance(nasalCases[1].message).some((g) => g.id === "cuh-pituitary-aftercare"));
  assert.ok(retrieveGuidance(nasalCases[2].message).some((g) => g.id === "nhs-head-injury"));
  assert.ok(retrieveGuidance(nasalCases[7].message).some((g) => g.id === "mayo-cranial-csf"));
  assert.ok(!retrieveGuidance("Routine knee surgery four years ago").some((g) => g.id === "cuh-pituitary-aftercare"));
});

test("fast recognition of nasal penetration precedes deferred Opus and survives its failure", async () => {
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  const app = createDispositionRuntime(mkdtempSync(join(tmpdir(), "nasal-emergency-")), async (_p, _c, role) => {
    if (role === "intake") return { answer: { emergency: true, quote: "it went deep into my right nostril", questionId: "none" }, usage: { inputTokens: 20, outputTokens: 20 } };
    await gate; throw new Error("test provider failure");
  }, { profile: "conversational-opus", budget: "nasal" });
  try {
    const run = await app.assess(nasalCases[2].message, undefined, (event) => { if (event.kind === "action") release(); });
    assert.equal(run.responseEvents?.[0]?.kind, "action");
    assert.equal(run.responseEvents?.some((event) => event.kind === "intake_question"), false);
    assert.equal(run.safetyFloor?.disposition, "EMERGENCY_NOW"); assert.equal(run.answer, null);
    assert.equal(run.artifactPersisted, true); assert.equal(run.tracePersisted, true);
    assert.deepEqual(run.agents?.map((a) => a.role).sort(), ["disposition", "intake"]);
  } finally { await app.mastra.shutdown(); }
});

test("nasal pilot allowance cannot reset and all project ceilings remain below $100", () => {
  assert.equal(79 + NASAL_BUDGET.ceilingUSD, 97);
  const dir = mkdtempSync(join(tmpdir(), "nasal-budget-"));
  for (let i = 0; i < 24; i++) reserveNasalRun(dir);
  assert.throws(() => reserveNasalRun(dir), /MODEL_BUDGET_EXHAUSTED/);
  assert.equal(79 + NASAL_BUDGET.ceilingUSD + NASAL_VERIFY_BUDGET.ceilingUSD, 100);
  const verification = mkdtempSync(join(tmpdir(), "nasal-verification-budget-"));
  for (let i = 0; i < 4; i++) reserveNasalVerificationRun(verification);
  assert.throws(() => reserveNasalVerificationRun(verification), /MODEL_BUDGET_EXHAUSTED/);
});

const care: DispositionAnswer = {
  disposition: "SELF_CARE", patientMessage: "Rest and drink fluids. Seek care if symptoms worsen.",
  reason: "The reported symptom pattern can occur with a respiratory infection.", differential: ["Viral respiratory infection"],
  redFlags: [{ concern: "Fever", status: "denied", quote: "No fever" }], vitalSigns: "No vital signs were supplied.",
  questions: [], evidence: [], evidenceLimitations: "Research support has not been established.",
};
const status = (answer: DispositionAnswer, id: string, message = nasalCases[0].message as string) => checkAnswer(answer, message, [], null).find((c) => c.id === id)?.status;

test("observed punctuation and normal-vitals limitation errors do not weaken quote or clearance checks", () => {
  assert.equal(status(care, "quoted_patient_evidence"), "pass");
  assert.equal(status({ ...care, redFlags: [{ concern: "Fever", status: "denied", quote: "No fever." }] }, "quoted_patient_evidence"), "fail");
  assert.equal(status({ ...care, vitalSigns: "Normal vitals cannot be assumed from silence." }, "no_blanket_clearance"), "pass");
  for (const vitalSigns of ["Normal vitals establish stability.", "Normal vitals cannot be assumed, but normal vitals establish stability.", "Normal vitals cannot be assumed. The patient is hemodynamically stable."]) {
    assert.equal(status({ ...care, vitalSigns }, "no_blanket_clearance"), "fail");
  }
  assert.equal(status({ ...care, reason: "Mild symptoms without reported red flags." }, "no_blanket_clearance"), "fail");
});

test("nasal red-team reasoning defects fail even with a plausible disposition", () => {
  assert.equal(status({ ...care, reason: "The patient explicitly denies trauma/surgery, so CSF-leak and penetrating-injury pathways do not apply." }, "atraumatic_leak_not_excluded"), "fail");
  assert.equal(status({ ...care, reason: "No surgery or trauma was reported; a spontaneous CSF leak remains possible." }, "atraumatic_leak_not_excluded"), "pass");
  const awake = { concern: "Reduced consciousness", status: "denied" as const, quote: "I feel awake" };
  assert.equal(status({ ...care, redFlags: [awake] }, "wakefulness_not_neurologic_clearance", nasalCases[3].message), "fail");
  assert.equal(status({ ...care, redFlags: [{ ...awake, concern: "Wakefulness", status: "reported" }] }, "wakefulness_not_neurologic_clearance", nasalCases[3].message), "pass");
  assert.equal(status({ ...care, patientMessage: "Call 911 now. Sit upright, lean slightly forward." }, "no_nosebleed_positioning_in_penetration", nasalCases[2].message), "fail");
  assert.equal(status({ ...care, patientMessage: "Call 911 now. Follow the dispatcher's instructions; do not remove or probe the object." }, "no_nosebleed_positioning_in_penetration", nasalCases[2].message), "pass");
});

test("extra output headroom preserves Opus adaptive high-effort reasoning", () => {
  assert.equal(COMPACT_GENERATION.modelSettings.maxOutputTokens, 2400);
  assert.equal(COMPACT_GENERATION.modelSettings.maxRetries, 0);
  assert.deepEqual(COMPACT_GENERATION.providerOptions.anthropic, { thinking: { type: "adaptive" }, effort: "high" });
});

test("last live retest defects are blocked, not hidden by its four matching routes", () => {
  assert.equal(status({ ...care, patientMessage: "Seek care if symptoms worsen past ten days." }, "worsening_not_deferred_ten_days"), "fail");
  assert.equal(status({ ...care, patientMessage: "Seek care if symptoms worsen or persist beyond ten days." }, "worsening_not_deferred_ten_days"), "pass");
  assert.equal(status({ ...care, vitalSigns: "No readings reported; none needed given current mild symptoms." }, "unmeasured_vitals_not_dismissed"), "fail");
  assert.equal(status(care, "unmeasured_vitals_not_dismissed"), "pass");
  assert.equal(status({ ...care, patientMessage: "Rest, fluids and saline rinses help. Seek care if worse." }, "irrigation_support_missing"), "fail");
  assert.equal(status({ ...care, patientMessage: "Do not use saline rinses. Follow the surgical team's instructions." }, "irrigation_support_missing"), "pass");
});

test("all 28 live attempts remain immutable and later review still exposes final-run failures", () => {
  const { artifactHash, ...artifact } = JSON.parse(readFileSync(join(repositoryRoot(), "outputs/nasal-history-20260910-v1.json"), "utf8"));
  assert.equal(hash(artifact), artifactHash);
  assert.equal(artifact.accounting.intakeOnlyAttempts, 12);
  assert.equal(artifact.accounting.workflowAttempts, 16);
  assert.equal(artifact.accounting.allKnownReservedCeilingsUSD, 100);
  assert.equal(artifact.phases[0].pairedMedianIncreaseMs, 784);
  for (const phase of artifact.phases) {
    const { manifestHash, ...manifest } = phase.manifest;
    assert.equal(hash(manifest), manifestHash);
    for (const [path, expected] of Object.entries(manifest.sourceHashes)) assert.equal(hash(phase.sourceSnapshot[path]), expected);
    for (const row of [...phase.selections, ...phase.observations]) assert.equal(hash(row.observation), row.observationHash);
    assert.equal(phase.missingAttempts, 0);
    assert.equal(phase.historicalSummary.clinicalNonInferiorityEstablished, false);
  }
  const latest = artifact.phases.at(-1).observations;
  for (const [id, failure] of [["N01", "worsening_not_deferred_ten_days"], ["N05", "unmeasured_vitals_not_dismissed"], ["N06", "irrigation_support_missing"]]) {
    const run = latest.find((row: { observation: { id: string } }) => row.observation.id === id).observation.run;
    assert.equal(checkAnswer(run.answer, run.message, run.guidance, null).find((c) => c.id === failure)?.status, "fail");
    assert.equal(run.status, "complete", "Historical outcome is not rewritten after a new guard is added");
  }
});
