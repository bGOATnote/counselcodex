import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { episodeSchema } from "../../cqa/contracts.ts";
import { aggregateJudgments, judgedJobSchema, judgeJob, jobSchema, makeJobs, reportSchema, type JudgeCall } from "../../cqa/engine.ts";

export function createQualityAuditWorkflow(judge?: JudgeCall, id = "counsel-quality-audit-research-v1", timeoutMs = 20_000) {
  const prepare = createStep({
    id: "decision-time-evidence-and-cohort", inputSchema: episodeSchema, outputSchema: z.array(jobSchema),
    description: "Freeze evidence at the audited decision; construct independent criterion jobs.",
    execute: async ({ inputData }) => makeJobs(inputData),
  });
  const assess = createStep({
    id: "independent-quality-criterion", inputSchema: jobSchema, outputSchema: judgedJobSchema,
    description: "Check eligibility, run one bounded judge, verify evidence; failures become abstentions.",
    execute: async ({ inputData }) => judgeJob(inputData, judge, timeoutMs),
  });
  const combine = createStep({
    id: "quality-review-triage", inputSchema: z.array(judgedJobSchema), outputSchema: reportSchema,
    description: "Account for all criteria; create a retrospective physician review item.",
    execute: async ({ inputData }) => aggregateJudgments(inputData),
  });
  return createWorkflow({ id, inputSchema: episodeSchema, outputSchema: reportSchema,
    description: "Synthetic retrospective CQA research: temporal evidence, bounded independent judgments, and physician review." })
    .then(prepare).foreach(assess, { concurrency: 3 }).then(combine).commit();
}

// Inspection and safe dry-run by default. The research CLI injects the actual
// judge invoker and budget into a separate workflow only for an explicit live run.
export const counselQualityAuditWorkflow = createQualityAuditWorkflow();
