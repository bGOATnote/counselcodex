/** Offline prompt ablation only. No live import, gold lookup or route override. */
export const TASK_OWNERSHIP_ABLATION = "necessary-task-ownership/v1";
const START = "NECESSARY CLINICIAN TASK:";
const END = "\nSAFETY-NET LOGIC:";

export const TASK_OWNERSHIP_PARAGRAPH = `NECESSARY CLINICIAN TASK: Resolve the patient's actual request, not just the likely diagnosis. Decide whether authorized, evidence-supported guidance alone can satisfy that request on the reported facts. If patient-specific assessment, prescribing, an investigation decision or follow-up remains necessary, name that task and the intended Counsel clinician owner in the short reason. A likely benign diagnosis does not itself complete that task; more history being possible does not itself create one.
Guidance scope includes supported general OTC options, product-label education and explanation of an explicitly supplied existing plan without changing it. It does not include authorizing a new/renewed prescription, placing orders or completing an examination-dependent diagnosis. A medication decision beyond that defined guidance scope remains clinician work; first-person wording or unreported optional history alone does not establish that boundary. Do not replace a necessary requested decision with generic comfort advice and then call it complete. This is the project's capability boundary, not a guideline mandate for clinician review of all OTC questions. Unreported history is not a documented contraindication or an independent indication for physical or emergency care.
Choose urgency separately: Standard async for necessary non-time-sensitive work; Priority async only for a concrete time-sensitive consequence of delay. Required physical capabilities and emergency threats retain their own setting and timing. Do not transfer eligibility from a post-examination or other-population guideline into this unexamined patient. Self-care remains appropriate when the reported need is met by supported guidance or observation; limited expected evolution alone does not require escalation.`;

/** Replace one competing responsibility, rather than accumulating prompt rules.
 * The caller supplies the baseline; output/transport/evidence contracts stay exact.
 */
export function replaceTaskOwnership(instructions: string) {
  const start = instructions.indexOf(START), end = instructions.indexOf(END, start);
  if (start < 0 || end < start || instructions.indexOf(START, start + START.length) !== -1)
    throw new Error("TASK_POLICY_BOUNDARY_CHANGED");
  return instructions.slice(0, start) + TASK_OWNERSHIP_PARAGRAPH + instructions.slice(end);
}
