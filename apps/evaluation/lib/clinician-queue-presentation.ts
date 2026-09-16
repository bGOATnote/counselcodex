import type { QueueTask } from "./clinician-queue-store";

const labels: Record<QueueTask["state"], string> = {
  queued: "Awaiting acceptance", accepted: "Accepted", responded: "Response recorded",
  resolved: "Resolved", reassessment: "New information · review needed",
  escalated: "Escalated care required", failed: "Assessment failed · manual review",
};
export function queueStateLabel(task: QueueTask): string {
  if (task.state !== "escalated") return labels[task.state];
  const settings = [task.safetyNotice?.disposition, task.run?.safetyFloor?.disposition, task.run?.answer?.disposition];
  if (settings.includes("EMERGENCY_NOW")) return "Emergency now · do not wait for the queue";
  if (settings.includes("SAME_DAY_IN_PERSON")) return "Same-day in-person care required";
  return labels.escalated;
}
export function queuePreview(task: QueueTask) {
  const context = task.inputContext;
  return context?.verified && context.updates.length
    ? { label: "Latest patient update", text: context.updates.at(-1)! }
    : { label: "Original message", text: context?.original ?? task.message };
}
