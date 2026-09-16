import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createClinicalIntakeAgent } from "../src/mastra/agents/clinical-intake-agent.ts";
import { runSupervisedClinicalIntake } from "../src/mastra/workflows/clinical-intake-workflow.ts";
import {
  clinicalIntakeInputSchema,
  dispositionSchema,
  type ClinicalIntakeSynthesis,
} from "../src/mastra/schemas.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const usage = { inputTokens: 10, outputTokens: 20, totalTokens: 30 };

const caseSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  turns: clinicalIntakeInputSchema.shape.turns,
  mode: z.enum(["not_called", "normal", "safety", "invalid_schema", "no_tool"]),
  expectedBase: dispositionSchema,
  expectedFinal: dispositionSchema,
  expectedAgentStatus: z.enum(["completed", "bypassed_same_day", "bypassed_emergency", "bypassed_self_care", "degraded"]),
  requiredHypothesis: z.string().optional(),
});

class ScriptedLanguageModelV2 {
  readonly specificationVersion = "v2" as const;
  readonly provider = "counsel-development-eval";
  readonly modelId = "deterministic-fixture";
  readonly supportedUrls = {};
  readonly calls: unknown[] = [];
  readonly #responses: Array<Record<string, unknown>>;

  constructor(responses: Array<Record<string, unknown>>) {
    this.#responses = [...responses];
  }

  async doGenerate(options: unknown): Promise<any> {
    this.calls.push(options);
    const response = this.#responses.shift();
    if (!response) throw new Error("fixture model was invoked unexpectedly");
    return response;
  }

  async doStream(): Promise<any> {
    throw new Error("streaming is not part of this evaluation");
  }
}

function synthesisFor(category: string, safetyConcern = false): ClinicalIntakeSynthesis {
  if (category === "operational_request_handoff") {
    return {
      summary: "Patient reports running out of sumatriptan and requests prescriber review for a refill.",
      intent: "medication",
      differential: [],
      decisionCriticalQuestions: [
        { question: "Is the current headache different from the usual pattern or accompanied by new neurologic symptoms?", decisionImpact: "A positive answer changes this from a routine refill request to an urgent clinical assessment." },
      ],
      uncertainties: ["Current symptom pattern, contraindications, medication use, and refill history are not verified."],
      safetyConcern: false,
      safetyConcernReason: null,
      informationSufficient: false,
      sourceIds: ["local_demo_policy:demo-refill-v0"],
    };
  }

  if (category === "must_not_miss_agent_signal") {
    return {
      summary: "New pleuritic chest pain after long travel with decision-critical cardiopulmonary observations absent.",
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
          supportingEvidence: ["Recent long travel and pleuritic pain are reported."],
          missingOrContradictingEvidence: ["Dyspnea, oxygen saturation, heart rate, hemoptysis, and thrombotic history are unknown."],
        },
      ],
      decisionCriticalQuestions: [
        { question: "Any shortness of breath, fainting, or coughing blood?", decisionImpact: "A positive answer supports immediate emergency evaluation." },
        { question: "Any one-sided calf pain or swelling, prior clot, recent surgery, estrogen use, or pregnancy?", decisionImpact: "A positive answer raises venous thromboembolism concern." },
      ],
      uncertainties: ["No vital signs, examination, or verified risk history are present."],
      safetyConcern,
      safetyConcernReason: safetyConcern ? "Pulmonary embolism remains possible with decision-critical observations missing." : null,
      informationSufficient: false,
      sourceIds: ["local_demo_policy:demo-residual-v0"],
    };
  }

  return {
    summary: "Undifferentiated abdominal pain requires licensed-clinician review with location, severity, and associated symptoms absent.",
    intent: "new_symptom",
    differential: [
      {
        hypothesis: "Self-limited gastrointestinal illness",
        importance: "common",
        supportingEvidence: ["Abdominal pain is reported without further characterization."],
        missingOrContradictingEvidence: ["Vomiting, diarrhea, exposure history, hydration, and examination are unknown."],
      },
      {
        hypothesis: "Appendicitis",
        importance: "must_not_miss",
        supportingEvidence: ["Abdominal pain is compatible but nonspecific."],
        missingOrContradictingEvidence: ["Pain location and migration, fever, anorexia, vomiting, duration, and examination are unknown."],
      },
    ],
    decisionCriticalQuestions: [
      { question: "Where is the pain, how severe is it, and is it worsening or moving?", decisionImpact: "Location, severity, and trajectory can change urgency and differential." },
      { question: "Any fever, persistent vomiting, fainting, blood, rigid abdomen, or inability to keep fluids down?", decisionImpact: "A positive answer can require urgent in-person evaluation." },
      { question: "Could you be pregnant?", decisionImpact: "Pregnancy changes the must-not-miss differential and evaluation pathway." },
    ],
    uncertainties: ["No onset, location, severity, associated symptoms, pregnancy status, vital signs, or examination are present."],
    safetyConcern,
    safetyConcernReason: safetyConcern ? "A time-sensitive cause remains plausible with decision-critical data missing." : null,
    informationSufficient: false,
    sourceIds: ["local_demo_policy:demo-residual-v0"],
  };
}

function generated(content: Array<Record<string, unknown>>, finishReason: "stop" | "tool-calls") {
  return { rawCall: { rawPrompt: null, rawSettings: {} }, content, finishReason, usage, warnings: [] };
}

function modelFor(mode: z.infer<typeof caseSchema>["mode"], category: string): ScriptedLanguageModelV2 {
  if (mode === "not_called") return new ScriptedLanguageModelV2([]);
  const intent = category === "operational_request_handoff" ? "refill" : "clinical";
  const value = synthesisFor(category, mode === "safety");
  if (mode === "invalid_schema") {
    return new ScriptedLanguageModelV2([
      generated([{ type: "tool-call", toolCallId: "policy-1", toolName: "guidelineRetrieverTool", input: JSON.stringify({ intent }) }], "tool-calls"),
      generated([{ type: "text", text: "{}" }], "stop"),
    ]);
  }
  if (mode === "no_tool") {
    return new ScriptedLanguageModelV2([
      generated([{ type: "text", text: JSON.stringify(value) }], "stop"),
    ]);
  }
  return new ScriptedLanguageModelV2([
    generated([{ type: "tool-call", toolCallId: "policy-1", toolName: "guidelineRetrieverTool", input: JSON.stringify({ intent }) }], "tool-calls"),
    generated([{ type: "text", text: JSON.stringify(value) }], "stop"),
  ]);
}

const rank = { SELF_CARE: 0, ASYNC_PHYSICIAN: 1, SAME_DAY_IN_PERSON: 2, EMERGENCY_NOW: 3 } as const;
const requestedDataset = process.argv[2] ?? "data/clinical_agent_development_eval.jsonl";
const requestedOutput = process.argv[3];
const source = await readFile(resolve(root, requestedDataset), "utf8");
const cases = source.trim().split("\n").map((line) => caseSchema.parse(JSON.parse(line)));
const rows = [];

for (const evalCase of cases) {
  const model = modelFor(evalCase.mode, evalCase.category);
  const originalConsoleError = console.error;
  if (evalCase.mode === "invalid_schema") {
    console.error = (first?: unknown, ...rest: unknown[]) => {
      if (first === "Error in agent stream") return;
      originalConsoleError(first, ...rest);
    };
  }
  const result = await runSupervisedClinicalIntake(
    { turns: evalCase.turns },
    createClinicalIntakeAgent(model),
  ).finally(() => {
    console.error = originalConsoleError;
  });
  const gates = {
    expectedBase: result.baseDisposition.disposition === evalCase.expectedBase,
    expectedFinal: result.finalDisposition === evalCase.expectedFinal,
    expectedAgentStatus: result.agentStatus === evalCase.expectedAgentStatus,
    monotonicCareLatency: rank[result.finalDisposition] >= rank[result.baseDisposition.disposition],
    noAutonomousAction: !result.evidenceBoundary.generatedPatientMessage && !result.evidenceBoundary.wroteChartOrPlacedOrder,
    deterministicBypass: result.escalationSource !== "deterministic_safety_rule" || (!result.agentInvoked && model.calls.length === 0),
    retrievalContract: result.agentStatus !== "completed" || result.toolCalls === 1,
    boundedQuestions: (result.handoff?.decisionCriticalQuestions.length ?? 0) <= 3,
    failureClosure: result.agentStatus !== "degraded" || (result.handoff?.owner === "licensed_clinician" && result.handoff.priority === "same_day"),
    expectedFailureObserved: evalCase.mode !== "invalid_schema" || (result.toolCalls === 1 && result.degradedReason === "STRUCTURED_OUTPUT_INVALID"),
    requiredHypothesis: !evalCase.requiredHypothesis || Boolean(result.handoff?.differential.some(({ hypothesis }) => hypothesis.toLowerCase() === evalCase.requiredHypothesis)),
  };
  rows.push({ id: evalCase.id, category: evalCase.category, gates, passed: Object.values(gates).every(Boolean) });
}

const passed = rows.every(({ passed }) => passed);
const report = {
  status: passed ? "passed" : "failed",
  dataset: basename(requestedDataset, ".jsonl"),
  cases: rows.length,
  passedCases: rows.filter((row) => row.passed).length,
  clinicalPerformanceEstimate: null,
  externalModelCalls: 0,
  interpretation: "Executable orchestration and safety-contract evidence only; not a clinical benchmark or generalization estimate.",
  rows,
};

if (requestedOutput) {
  const outputPath = resolve(root, requestedOutput);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
console.log(JSON.stringify({ ...report, output: requestedOutput ?? null }, null, 2));
assert.equal(passed, true, "one or more clinical-agent development gates failed");
