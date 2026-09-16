import { counselDispositionWorkflow } from "./workflows/disposition-workflow.ts";
import { dispositionResultSchema, inboundSchema } from "./schemas.ts";
import { buildResponseSafetyReview } from "../clinical/response-safety.ts";

const visibleSteps = new Set(["red-flag-checklist", "intent-history", "hard-escalation-gate", "disposition-router"]);

// Execute the real Mastra graph, not predictions.csv or the local mirror.
// No model, external tool, persistence adapter, or clinical payload exporter is
// registered in this intentionally ephemeral demo runtime.
export async function executeV0Demo(message: string) {
  const input = inboundSchema.parse({ message });
  const started = performance.now();
  const run = await counselDispositionWorkflow.createRun();
  const execution = await run.start({ inputData: input, tracingOptions: { hideInput: true, hideOutput: true } });
  if (execution.status !== "success") throw new Error("V0_EXECUTION_FAILED");
  const steps = Object.entries(execution.steps).filter(([id]) => visibleSteps.has(id)).map(([id, raw]) => {
    const step = raw as { status?: string; startedAt?: number; endedAt?: number };
    return { id, status: step.status ?? "unknown", durationMs: typeof step.startedAt === "number" && typeof step.endedAt === "number" ? Math.max(0, step.endedAt - step.startedAt) : null };
  });
  return {
    version: "v0-gui/v1" as const, runId: run.runId, completedAt: new Date().toISOString(),
    durationMs: Math.round((performance.now() - started) * 100) / 100,
    message, workflowId: "counsel-disposition-v0" as const,
    executionMode: "deterministic_mastra" as const, modelCalls: 0 as const,
    route: dispositionResultSchema.parse(execution.result),
    safetyReview: buildResponseSafetyReview([{ role: "patient", content: message }]),
    steps,
  };
}
