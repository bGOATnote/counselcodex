import { runEmergencyBranch } from "../domain/branches.mjs";
import { createTool } from "../runtime/workflow-engine.mjs";

export const redFlagChecklist = createTool({
  id: "red-flag-checklist",
  description: "Deterministically checks a synthetic message for named time-critical patterns.",
  async execute({ context: { message } }) {
    return runEmergencyBranch(message);
  },
});
