import { createScorer } from "@mastra/core/evals";
import { dispositionResultSchema, inboundSchema } from "../schemas.ts";

export const exactDispositionScorer = createScorer({
  id: "exact-disposition",
  description: "Binary software gate: final disposition must equal the unattested reference proposal used during implementation.",
  type: { input: inboundSchema, output: dispositionResultSchema },
})
  .generateScore(({ run }) => run.output.disposition === run.groundTruth ? 1 : 0)
  .generateReason(({ run, score }) => score === 1
    ? "Disposition equals the implementation reference proposal."
    : `Expected ${String(run.groundTruth)} but received ${run.output.disposition}.`);

export const hardGateIntegrityScorer = createScorer({
  id: "hard-gate-integrity",
  description: "Binary gate: same-day/emergency status, lock state, override block, and hard-gate origin must agree.",
  type: { input: inboundSchema, output: dispositionResultSchema },
}).generateScore(({ run }) => {
  const escalated = run.output.disposition === "SAME_DAY_IN_PERSON" || run.output.disposition === "EMERGENCY_NOW";
  return run.output.locked === escalated
    && run.output.overrideBlocked === escalated
    && (escalated ? run.output.layer === "hard_escalation_gate" : run.output.layer !== "hard_escalation_gate")
    ? 1
    : 0;
});
