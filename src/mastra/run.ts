import { mastra } from "./legacy-index.ts";
import {
  clinicalIntakeInputSchema,
  clinicalIntakeResultSchema,
  dispositionResultSchema,
  type ClinicalIntakeInput,
  type ClinicalIntakeResult,
  type DispositionResult,
} from "./schemas.ts";

export async function routeWithMastra(message: string, id: string | null = null): Promise<DispositionResult & { id: string | null }> {
  const workflow = mastra.getWorkflow("counselDispositionWorkflow");
  const run = await workflow.createRun();
  const execution = await run.start({
    inputData: { message },
    tracingOptions: {
      hideInput: true,
      hideOutput: true,
      tags: ["synthetic-validation", "no-external-export"],
    },
  });
  if (execution.status !== "success") throw new Error(`Mastra workflow ended with status '${execution.status}'`);
  return { id, ...dispositionResultSchema.parse(execution.result) };
}

export async function runClinicalIntakeWithMastra(rawInput: ClinicalIntakeInput): Promise<ClinicalIntakeResult> {
  const input = clinicalIntakeInputSchema.parse(rawInput);
  const workflow = mastra.getWorkflow("counselClinicalIntakeWorkflow");
  const run = await workflow.createRun();
  const execution = await run.start({
    inputData: input,
    tracingOptions: {
      hideInput: true,
      hideOutput: true,
      tags: ["clinical-intake", "synthetic-only", "no-external-export"],
    },
  });
  if (execution.status !== "success") throw new Error(`Mastra clinical intake ended with status '${execution.status}'`);
  return clinicalIntakeResultSchema.parse(execution.result);
}
