import { createScorer } from "@mastra/core/evals";
import { GRADER_DEFINITIONS, gradeHandoff } from "../../evaluation/handoff-graders.mjs";
import {
  clinicalIntakeInputSchema,
  clinicalIntakeResultSchema,
  type ClinicalIntakeResult,
} from "../schemas.ts";

function gradeClinicalIntakeOutput(output: ClinicalIntakeResult, groundTruth?: unknown) {
  const observed = groundTruth && typeof groundTruth === "object" && "retrievedSourceIds" in groundTruth
    ? groundTruth.retrievedSourceIds : undefined;
  const retrievedSourceIds = Array.isArray(observed) && observed.every((id) => typeof id === "string") ? observed : [];
  return gradeHandoff({
    baseDisposition: output.baseDisposition.disposition,
    finalDisposition: output.finalDisposition,
    routingLocked: output.routingLocked,
    escalationSource: output.escalationSource,
    agentStatus: output.agentStatus,
    agentInvoked: output.agentInvoked,
    toolCalls: output.toolCalls,
    // The evaluation harness must supply IDs from observed tool results, never
    // from the answer being graded. Missing evidence cannot establish retrieval.
    retrievedSourceIds,
    handoff: output.handoff,
    evidenceBoundary: output.evidenceBoundary,
    degradedReason: output.degradedReason,
  });
}

export const clinicalHandoffContractScorer = createScorer({
  id: "clinical-handoff-contract",
  description: "Deterministic composite grader for authority, monotonic urgency, bounded synthesis, failure closure, and bypass integrity. Clinical meaning is outside this grader's scope.",
  type: { input: clinicalIntakeInputSchema, output: clinicalIntakeResultSchema },
})
  .generateScore(({ run }) => gradeClinicalIntakeOutput(run.output, run.groundTruth).gatedScore)
  .generateReason(({ run, score }) => {
    const grade = gradeClinicalIntakeOutput(run.output, run.groundTruth);
    return score === 1
      ? `Composite ${grade.composite.label}: all deterministic clinical-handoff contract criteria passed.`
      : `Composite ${grade.composite.label}: inspect ${grade.composite.reviewLane} criteria and the trace.`;
  });

export const clinicalHandoffCriterionScorers = Object.fromEntries(
  GRADER_DEFINITIONS.map(({ id }) => {
    const scorer = createScorer({
      id: `clinical-handoff-${id.replaceAll("_", "-")}`,
      description: `Independent deterministic ${id} criterion. It cannot speak to a patient or establish clinical quality.`,
      type: { input: clinicalIntakeInputSchema, output: clinicalIntakeResultSchema },
    })
      .generateScore(({ run }) => gradeClinicalIntakeOutput(run.output, run.groundTruth).criteria.find((criterion) => criterion.id === id)?.score ?? 0)
      .generateReason(({ run }) => {
        const criterion = gradeClinicalIntakeOutput(run.output, run.groundTruth).criteria.find((candidate) => candidate.id === id);
        return criterion?.reason ?? `Criterion ${id} was not found.`;
      });
    return [`clinicalHandoff_${id}`, scorer];
  }),
);
