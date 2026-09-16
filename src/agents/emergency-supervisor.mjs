import { Agent } from "../runtime/workflow-engine.mjs";
import { redFlagChecklist } from "../tools/red-flag-checklist.mjs";

export const emergencySupervisor = new Agent({
  name: "emergencySupervisor",
  instructions: "Independently inspect the message for named emergencies. Never consider convenience or downstream workload.",
  tools: { redFlagChecklist },
  async execute({ message }) {
    const checklist = await redFlagChecklist.execute({ context: { message } });
    return { supervisor: "emergency", ...checklist };
  },
});
