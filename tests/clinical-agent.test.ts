import test from "node:test";
import assert from "node:assert/strict";
import { createClinicalIntakeAgent } from "../src/mastra/agents/clinical-intake-agent.ts";
import {
  createClinicalIntakeWorkflow,
  runSupervisedClinicalIntake,
} from "../src/mastra/workflows/clinical-intake-workflow.ts";
import { clinicalIntakeResultSchema, type ClinicalIntakeSynthesis } from "../src/mastra/schemas.ts";
import { clinicalHandoffCriterionScorers } from "../src/mastra/scorers/clinical-handoff.ts";

const usage = { inputTokens: 10, outputTokens: 20, totalTokens: 30 };

class ScriptedLanguageModelV2 {
  readonly specificationVersion = "v2" as const;
  readonly provider = "counsel-test";
  readonly modelId = "synthetic-clinical-fixture";
  readonly supportedUrls = {};
  readonly doGenerateCalls: unknown[] = [];
  readonly #responses: Array<Record<string, unknown>>;

  constructor(responses: Array<Record<string, unknown>>) {
    this.#responses = [...responses];
  }

  async doGenerate(options: unknown): Promise<any> {
    this.doGenerateCalls.push(options);
    const response = this.#responses.shift();
    if (!response) throw new Error("scripted model has no remaining response");
    return response;
  }

  async doStream(): Promise<any> {
    throw new Error("streaming is not used in this test");
  }
}

function synthesis(overrides: Partial<ClinicalIntakeSynthesis> = {}): ClinicalIntakeSynthesis {
  return {
    summary: "Pleuritic chest discomfort after travel with important risk information still unknown.",
    intent: "new_symptom",
    differential: [
      {
        hypothesis: "Musculoskeletal chest pain",
        importance: "common",
        supportingEvidence: ["Pain is described with breathing."],
        missingOrContradictingEvidence: ["Reproducibility and examination findings are unknown."],
      },
      {
        hypothesis: "Pulmonary embolism",
        importance: "must_not_miss",
        supportingEvidence: ["Recent travel and pleuritic pain are reported."],
        missingOrContradictingEvidence: ["Dyspnea, hypoxemia, tachycardia, and leg asymmetry are unknown."],
      },
    ],
    decisionCriticalQuestions: [
      { question: "Any shortness of breath, fainting, or coughing blood?", decisionImpact: "A positive answer can require immediate emergency evaluation." },
      { question: "Any one-sided calf swelling or pain?", decisionImpact: "A positive answer increases concern for venous thromboembolism." },
    ],
    uncertainties: ["No vital signs or examination are available."],
    safetyConcern: false,
    safetyConcernReason: null,
    informationSufficient: false,
    sourceIds: ["local_demo_policy:demo-residual-v0"],
    ...overrides,
  };
}

function generated(content: Array<Record<string, unknown>>, finishReason: "stop" | "tool-calls") {
  return {
    rawCall: { rawPrompt: null, rawSettings: {} },
    content,
    finishReason,
    usage,
    warnings: [],
  };
}

function modelWithSynthesis(value: ClinicalIntakeSynthesis) {
  return new ScriptedLanguageModelV2([
      generated([{
        type: "tool-call",
        toolCallId: "policy-call-1",
        toolName: "guidelineRetrieverTool",
        input: JSON.stringify({ intent: "clinical" }),
      }], "tool-calls"),
      generated([{ type: "text", text: JSON.stringify(value) }], "stop"),
  ]);
}

test("a deterministic emergency preempts the clinical agent", async () => {
  const model = modelWithSynthesis(synthesis());
  const result = await runSupervisedClinicalIntake({
    turns: [{ role: "patient", content: "Crushing chest pressure into my left arm and I am sweaty." }],
  }, createClinicalIntakeAgent(model));

  assert.equal(result.finalDisposition, "EMERGENCY_NOW");
  assert.equal(result.escalationSource, "deterministic_safety_rule");
  assert.equal(result.agentStatus, "bypassed_emergency");
  assert.equal(result.agentInvoked, false);
  assert.equal(model.doGenerateCalls.length, 0);
  assert.equal(result.safetyReview.assessedThroughTurn, 1);
  assert.equal(result.safetyReview.clinicalClearanceEstablished, false);
});

test("unsupported normal-vitals or all-clear language fails to clinician review with per-turn evidence intact", async () => {
  for (const summary of ["No red flags. Vitals are normal.", "The patient is hemodynamically stable."]) {
    const model = modelWithSynthesis(synthesis({ summary }));
    const result = await runSupervisedClinicalIntake({ turns: [{ role: "patient", content: "I have intermittent discomfort and want advice." }] }, createClinicalIntakeAgent(model));
    assert.equal(result.agentStatus, "degraded");
    assert.equal(result.degradedReason, "UNSUPPORTED_SAFETY_CLEARANCE");
    assert.equal(result.handoff?.priority, "same_day");
    assert.ok(result.safetyReview.vitalSigns.every((vital) => vital.status === "not_available"));
  }
});

test("a later patient turn is rescanned and preempts the agent", async () => {
  const model = modelWithSynthesis(synthesis());
  const result = await runSupervisedClinicalIntake({
    turns: [
      { role: "patient", content: "I have crushing pressure in the center of my chest." },
      { role: "clinician", content: "Are you having any other symptoms?" },
      { role: "patient", content: "Now I am short of breath and sweaty." },
    ],
  }, createClinicalIntakeAgent(model));

  assert.equal(result.finalDisposition, "EMERGENCY_NOW");
  assert.equal(result.agentInvoked, false);
  assert.equal(model.doGenerateCalls.length, 0);
});

test("rejected synthesis cannot erase a schema-valid emergency signal", async () => {
  for (const overrides of [{ summary: "Vitals are normal." }, { sourceIds: ["local_demo_policy:invented"] }]) {
    const model = modelWithSynthesis(synthesis({ ...overrides, safetyConcern: true, safetyConcernReason: "A time-sensitive emergency remains possible." }));
    const result = await runSupervisedClinicalIntake({ turns: [{ role: "patient", content: "I have unexplained discomfort and want advice." }] }, createClinicalIntakeAgent(model));
    assert.equal(result.agentStatus, "degraded");
    assert.equal(result.finalDisposition, "EMERGENCY_NOW");
    assert.equal(result.routingLocked, true);
    assert.equal(result.escalationSource, "agent_safety_signal");
    assert.equal(result.handoff?.priority, "immediate");
    assert.equal(result.handoff?.reviewState, "IMMEDIATE_CLINICIAN_REVIEW");
    assert.match(result.patientDirective, /emergency assessment now/);
    assert.doesNotMatch(result.handoff!.summary, /Vitals are normal/);
    assert.equal(clinicalIntakeResultSchema.safeParse({ ...result, finalDisposition: "ASYNC_PHYSICIAN", routingLocked: false }).success, false);
    assert.equal(clinicalIntakeResultSchema.safeParse({ ...result, handoff: { ...result.handoff, priority: "same_day" } }).success, false);
    assert.equal(clinicalIntakeResultSchema.safeParse({ ...result, agentStatus: "bypassed_emergency", agentInvoked: false }).success, false);
  }
});

test("a deterministic same-day route is preserved and bypasses the agent", async () => {
  const model = modelWithSynthesis(synthesis());
  const result = await runSupervisedClinicalIntake({
    turns: [{ role: "patient", content: "After a flight one calf is painful, warm, and swollen. No chest pain or shortness of breath." }],
  }, createClinicalIntakeAgent(model));

  assert.equal(result.finalDisposition, "SAME_DAY_IN_PERSON");
  assert.equal(result.escalationSource, "deterministic_safety_rule");
  assert.equal(result.agentStatus, "bypassed_same_day");
  assert.equal(result.routingLocked, true);
  assert.equal(result.agentInvoked, false);
  assert.equal(model.doGenerateCalls.length, 0);
});

test("an actual Mastra Agent uses the policy tool and returns a bounded physician handoff", async () => {
  const model = modelWithSynthesis(synthesis());
  const result = await runSupervisedClinicalIntake({
    turns: [{ role: "patient", content: "Sharp chest discomfort when I breathe after a long flight; I do not have calf swelling." }],
  }, createClinicalIntakeAgent(model));

  assert.equal(result.baseDisposition.disposition, "ASYNC_PHYSICIAN");
  assert.equal(result.finalDisposition, "ASYNC_PHYSICIAN");
  assert.equal(result.agentStatus, "completed");
  assert.equal(result.toolCalls, 1);
  assert.equal(result.handoff?.owner, "licensed_clinician");
  assert.equal(result.handoff?.differential.some(({ importance }) => importance === "must_not_miss"), true);
  assert.equal(result.handoff?.decisionCriticalQuestions.length, 2);
  assert.equal(result.handoff?.patientFacingAutomation, false);
  assert.equal(model.doGenerateCalls.length, 2);
});

test("handoff scorer requires independent retrieval evidence instead of trusting its own citations", async () => {
  const input = { turns: [{ role: "patient" as const, content: "Sharp chest discomfort when I breathe after a long flight; I do not have calf swelling." }] };
  const output = await runSupervisedClinicalIntake(input, createClinicalIntakeAgent(modelWithSynthesis(synthesis())));
  const scorer = clinicalHandoffCriterionScorers.clinicalHandoff_retrieval_grounding;
  assert.equal((await scorer.run({ input, output })).score, 0);
  assert.equal((await scorer.run({ input, output, groundTruth: { retrievedSourceIds: ["local_demo_policy:demo-residual-v0"] } })).score, 1);
  assert.equal((await scorer.run({ input, output, groundTruth: { retrievedSourceIds: ["different-observed-source"] } })).score, 0);
});

test("an agent safety signal can only promote to immediate clinician review", async () => {
  const value = synthesis({
    safetyConcern: true,
    safetyConcernReason: "Pulmonary embolism remains possible and decision-critical observations are absent.",
  });
  const result = await runSupervisedClinicalIntake({
    turns: [{ role: "patient", content: "New sharp chest pain with breathing after travel; I feel unwell." }],
  }, createClinicalIntakeAgent(modelWithSynthesis(value)));

  assert.equal(result.baseDisposition.disposition, "ASYNC_PHYSICIAN");
  assert.equal(result.finalDisposition, "EMERGENCY_NOW");
  assert.equal(result.escalationSource, "agent_safety_signal");
  assert.equal(result.routingLocked, true);
  assert.equal(result.handoff?.reviewState, "IMMEDIATE_CLINICIAN_REVIEW");
  assert.equal(result.handoff?.priority, "immediate");
  assert.equal(result.evidenceBoundary.generatedPatientMessage, false);
  assert.match(result.patientDirective, /emergency assessment now/);
  assert.doesNotMatch(result.patientDirective, /if symptoms/);
});

test("missing required tool use fails closed to a same-day physician handoff", async () => {
  const model = new ScriptedLanguageModelV2([
    generated([{ type: "text", text: JSON.stringify(synthesis()) }], "stop"),
  ]);
  const result = await runSupervisedClinicalIntake({
    turns: [{ role: "patient", content: "I have abdominal pain and am not sure what to do." }],
  }, createClinicalIntakeAgent(model));

  assert.equal(result.finalDisposition, "ASYNC_PHYSICIAN");
  assert.equal(result.agentStatus, "degraded");
  assert.equal(result.handoff?.priority, "same_day");
  assert.equal(result.degradedReason, "RETRIEVAL_REQUIRED");
});

test("a fabricated source ID fails exact retrieval grounding", async () => {
  const value = synthesis({ sourceIds: ["local_demo_policy:fabricated-policy"] });
  const result = await runSupervisedClinicalIntake({
    turns: [{ role: "patient", content: "I have an unexplained rash and need clinical guidance." }],
  }, createClinicalIntakeAgent(modelWithSynthesis(value)));

  assert.equal(result.agentStatus, "degraded");
  assert.equal(result.handoff?.priority, "same_day");
  assert.equal(result.degradedReason, "RETRIEVAL_GROUNDING_FAILED");
});

test("combined patient history is bounded before routing or model execution", async () => {
  const model = modelWithSynthesis(synthesis());
  await assert.rejects(
    runSupervisedClinicalIntake({
      turns: [
        { role: "patient", content: "a".repeat(7_000) },
        { role: "clinician", content: "Please continue." },
        { role: "patient", content: "b".repeat(5_000) },
      ],
    }, createClinicalIntakeAgent(model)),
    /combined patient turns must not exceed 12000 characters/,
  );
  assert.equal(model.doGenerateCalls.length, 0);
});

test("clinical intake result schema rejects a downgradeable escalated route", async () => {
  const value = synthesis({
    safetyConcern: true,
    safetyConcernReason: "A time-sensitive diagnosis remains possible.",
  });
  const result = await runSupervisedClinicalIntake({
    turns: [{ role: "patient", content: "New chest discomfort after travel." }],
  }, createClinicalIntakeAgent(modelWithSynthesis(value)));
  const { clinicalIntakeResultSchema } = await import("../src/mastra/schemas.ts");
  assert.throws(() => clinicalIntakeResultSchema.parse({ ...result, routingLocked: false }), /same-day or emergency final route must be locked/);
});

test("named self-care routing does not spend a model call", async () => {
  const model = modelWithSynthesis(synthesis());
  const result = await runSupervisedClinicalIntake({
    turns: [{ role: "patient", content: "Runny nose and scratchy throat, no fever, eating and drinking fine." }],
  }, createClinicalIntakeAgent(model));

  assert.equal(result.finalDisposition, "SELF_CARE");
  assert.equal(result.agentStatus, "bypassed_self_care");
  assert.equal(result.agentInvoked, false);
  assert.equal(model.doGenerateCalls.length, 0);
});

test("the composed Mastra workflow executes the same supervised contract", async () => {
  const model = modelWithSynthesis(synthesis());
  const workflow = createClinicalIntakeWorkflow(createClinicalIntakeAgent(model), "clinical-intake-test");
  const run = await workflow.createRun();
  const execution = await run.start({
    inputData: { turns: [{ role: "patient", content: "Unexplained abdominal pain since this morning." }] },
  });

  assert.equal(execution.status, "success");
  if (execution.status !== "success") assert.fail("workflow should succeed");
  assert.equal(execution.result.agentStatus, "completed");
  assert.equal(execution.result.handoff?.owner, "licensed_clinician");
});
