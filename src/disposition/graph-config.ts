import { z } from "zod";

export const DEFAULT_GRAPH_MODELS = { context: "anthropic/claude-haiku-4-5", safety: "anthropic/claude-haiku-4-5", disposition: "anthropic/claude-opus-5", judge: "openai/gpt-6-astra" } as const;
export type GraphModels = Record<keyof typeof DEFAULT_GRAPH_MODELS, string>;
export type GraphConfig = { models: GraphModels; factGraphMode: "off" | "shadow"; judgeStyle?: "full" | "concise"; repairMode?: "field_patch" | "full_regeneration"; safetyStyle?: "full" | "compact" };
const modelId = z.string().regex(/^[a-z][a-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._:/-]{0,150}$/);
export function resolveGraphConfig(env: Record<string, string | undefined> = {}): GraphConfig {
  const models = Object.fromEntries(Object.entries(DEFAULT_GRAPH_MODELS).map(([role, fallback]) => [role, modelId.parse(env[`COUNSEL_GRAPH_${role.toUpperCase()}_MODEL`] ?? fallback)])) as GraphModels;
  // Deliberately no enforce mode. An environment flag cannot confer clinical
  // approval on a research seed graph or unvalidated model-extracted facts.
  return { models, factGraphMode: z.enum(["off", "shadow"]).parse(env.COUNSEL_FACT_GRAPH_MODE ?? "off"), judgeStyle: z.enum(["full", "concise"]).parse(env.COUNSEL_GRAPH_JUDGE_STYLE ?? "full"), repairMode: z.enum(["field_patch", "full_regeneration"]).parse(env.COUNSEL_GRAPH_REPAIR_MODE ?? "field_patch"), safetyStyle:z.enum(["full","compact"]).parse(env.COUNSEL_GRAPH_SAFETY_STYLE ?? "full") };
}
