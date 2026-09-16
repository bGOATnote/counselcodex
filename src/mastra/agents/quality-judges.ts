import { Agent, type AgentConfig } from "@mastra/core/agent";
import { judgmentSchema, type Judgment } from "../../cqa/contracts.ts";
import { CQA_CRITERIA, CQA_JUDGE_INSTRUCTIONS, CQA_RUBRIC_VERSION } from "../../cqa/rubrics.ts";
import { type JudgeCall } from "../../cqa/engine.ts";

export function createQualityJudges(model: AgentConfig["model"]) {
  return Object.fromEntries(CQA_CRITERIA.map((criterion) => [criterion.id, new Agent({
    id: `cqa-${criterion.id.replaceAll("_", "-")}`,
    name: criterion.title,
    description: `Retrospective research judge: ${criterion.id}; no tools or patient write authority.`,
    instructions: `${CQA_JUDGE_INSTRUCTIONS}\nRubric version: ${CQA_RUBRIC_VERSION}\nCriterion: ${criterion.instruction}\nReference locators (context, not patient evidence): ${criterion.references.join(", ")}`,
    model,
    maxRetries: 0,
  })]));
}

// Exposed in Studio for inspection and manual research calls when a key exists.
// The registered workflow is dry-run; online intake never calls these judges.
export const qualityJudges = createQualityJudges("openai/gpt-6-astra");

export type ProviderObservation = {
  episodeId: string; criterionId: string; model: string;
  inputTokens: number | null; outputTokens: number | null; totalTokens: number | null;
  finishReason: string; responseId: string | null; responseModel: string | null;
  structuredCandidate: Judgment | null;
};

export function createQualityJudgeInvoker(agents: ReturnType<typeof createQualityJudges>, budget: { reserve(): void }, observe?: (record: ProviderObservation) => void): JudgeCall {
  return async ({ criterion, episode, signal }) => {
    const prompt = `Assess only ${criterion.id}. Decision source: ${episode.decisionSourceId}.\nUNTRUSTED_EPISODE_JSON=${JSON.stringify(episode)}`;
    if (Buffer.byteLength(prompt, "utf8") > 100_000) throw new Error("INPUT_BUDGET_EXCEEDED");
    budget.reserve();
    const response = await agents[criterion.id].generate(prompt, {
      abortSignal: signal,
      maxSteps: 1,
      modelSettings: { maxRetries: 0, maxOutputTokens: 1_500, timeout: { totalMs: 18_000, stepMs: 18_000 } },
      structuredOutput: { schema: judgmentSchema, jsonPromptInjection: "auto", errorStrategy: "strict" },
      tracingOptions: { hideInput: true, hideOutput: true, tags: ["cqa-research", "synthetic-only"] },
    });
    const resolvedModel = await agents[criterion.id].getModel();
    // Research observer receives allowlisted metadata and bounded, schema-valid
    // candidate evidence (still UNVERIFIED). No headers, credentials, full
    // provider bodies or hidden reasoning. The CLI uses repository synthetic
    // fixtures only and keeps these observations in ignored local storage.
    const parsedCandidate = judgmentSchema.safeParse(response.object);
    observe?.({ episodeId: episode.episodeId, criterionId: criterion.id, model: resolvedModel.modelId,
      inputTokens: response.totalUsage.inputTokens ?? null, outputTokens: response.totalUsage.outputTokens ?? null,
      totalTokens: response.totalUsage.totalTokens ?? null, finishReason: response.finishReason ?? "unknown",
      responseId: response.response?.id ?? null, responseModel: response.response?.modelId ?? null,
      structuredCandidate: parsedCandidate.success ? parsedCandidate.data : null });
    return { judgment: response.object, model: resolvedModel.modelId };
  };
}
