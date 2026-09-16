import { normalizeMessage } from "../domain/rules.mjs";
import { applyHardGate, routeResidual } from "../domain/routing.mjs";
import { emergencySupervisor } from "../agents/emergency-supervisor.mjs";
import { intentHistoryAgent } from "../agents/intent-history-agent.mjs";
import { createStep, createWorkflow } from "../runtime/workflow-engine.mjs";

export const emergencySupervisorStep = createStep({
  id: "emergencySupervisor",
  async execute({ inputData }) {
    return emergencySupervisor.generate(inputData);
  },
});

export const intentHistoryStep = createStep({
  id: "intentHistory",
  async execute({ inputData }) {
    return intentHistoryAgent.generate(inputData);
  },
});

export const hardEscalationGate = createStep({
  id: "hardEscalationGate",
  async execute({ inputData }) {
    const emergency = inputData.emergencySupervisor;
    const history = inputData.intentHistory;
    return applyHardGate({ emergency, history });
  },
});

export const dispositionRouter = createStep({
  id: "dispositionRouter",
  async execute({ inputData }) {
    return routeResidual(inputData);
  },
});

export const dispositionWorkflow = createWorkflow({ id: "counsel-disposition-v0" })
  .parallel([emergencySupervisorStep, intentHistoryStep])
  .then(hardEscalationGate)
  .then(dispositionRouter)
  .commit();

/**
 * @param {{message: string, id?: string | null}} input
 */
export async function routeMessage({ message, id = null }) {
  if (typeof message !== "string" || message.trim().length === 0) throw new TypeError("message must be a non-empty string");
  normalizeMessage(message);
  const run = dispositionWorkflow.createRun();
  const execution = await run.start({ inputData: { id, message } });
  const { history, ...publicResult } = execution.result;
  return {
    id,
    ...publicResult,
    questions: publicResult.locked ? [] : history.questions,
    guideline: publicResult.locked ? null : history.guideline,
    trace: execution.trace,
  };
}
