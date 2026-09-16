import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { applyHardGate, routeResidual } from "../../domain/routing.mjs";
import {
  dispositionResultSchema,
  emergencyResultSchema,
  gatedDispositionSchema,
  inboundSchema,
  intentResultSchema,
} from "../schemas.ts";
import { intentHistoryTool } from "../tools/intent-history.ts";
import { redFlagChecklistTool } from "../tools/red-flag-checklist.ts";

const emergencyStep = createStep(redFlagChecklistTool);
const intentStep = createStep(intentHistoryTool);

const hardEscalationGate = createStep({
  id: "hard-escalation-gate",
  description: "Irreversibly promotes any positive or degraded safety result before residual routing.",
  inputSchema: z.object({
    "red-flag-checklist": emergencyResultSchema,
    "intent-history": intentResultSchema,
  }),
  outputSchema: gatedDispositionSchema,
  execute: async ({ inputData }) => gatedDispositionSchema.parse(applyHardGate({
    emergency: inputData["red-flag-checklist"],
    history: inputData["intent-history"],
  })),
});

const dispositionRouter = createStep({
  id: "disposition-router",
  description: "Routes only gate-clear messages and enforces postconditions on the final disposition.",
  inputSchema: gatedDispositionSchema,
  outputSchema: dispositionResultSchema,
  execute: async ({ inputData }) => {
    const routed = routeResidual(inputData);
    const { history, ...withoutHistory } = routed;
    return dispositionResultSchema.parse({
      ...withoutHistory,
      questions: withoutHistory.locked ? [] : history.questions,
      guideline: withoutHistory.locked ? null : history.guideline,
    });
  },
});

export const counselDispositionWorkflow = createWorkflow({
  id: "counsel-disposition-v0",
  description: "Synthetic disposition workflow with a parallel emergency branch and a deterministic hard escalation gate.",
  inputSchema: inboundSchema,
  outputSchema: dispositionResultSchema,
})
  .parallel([emergencyStep, intentStep])
  .then(hardEscalationGate)
  .then(dispositionRouter)
  .commit();
