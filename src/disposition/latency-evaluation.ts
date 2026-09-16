import { checkAnswer, type DispositionRun } from "./contract.ts";
import { higherRoute, openingFromQuote, patientReplyFailures } from "./progressive.ts";
import { intakeEvent } from "./intake.ts";

// Predeclared development sentinels; these are NOT physician-adjudicated labels.
export const LATENCY_PROTOCOL = {
  version: "latency-pilot/v1", cases: ["C04", "C01"], trials: 2,
  profiles: ["progressive-opus", "parallel-opus", "haiku-opus"],
  referenceStatus: "Project-authored development expectations; clinical adjudication and independent semantic grading pending",
  expectedDevelopmentRoutes: { C04: "SAME_DAY_IN_PERSON", C01: "SELF_CARE" },
  primaryMetric: "time to first contract-checked action/reply; clinical appropriateness is separately ungraded",
  promotionRule: "No automatic promotion. Any route deviation, visible-prefix violation, incomplete answer, or ungraded clinical quality blocks a claim of non-inferiority.",
} as const;

export function evaluateVisibleTrajectory(run: DispositionRun) {
  const failures: string[] = [];
  let floor: string | null = null;
  for (const event of run.responseEvents ?? []) {
    if (event.kind === "action") {
      if (higherRoute(floor, event.notice.disposition) !== event.notice.disposition) failures.push("early_action_downgrade");
      floor = higherRoute(floor, event.notice.disposition);
    } else if (event.kind === "opening") {
      if (openingFromQuote(event.quote, run.message)?.text !== event.text) failures.push("ungrounded_opening");
    } else if (event.kind === "intake_question") {
      if (intakeEvent({ questionId: event.questionId, quote: event.quote }, run.message)?.text !== event.text) failures.push("invalid_intake_question");
    } else if (event.kind === "care_revision") {
      if (event.reconciliation.status !== "revised" || event.reconciliation.from.disposition !== floor || JSON.stringify(event.reconciliation) !== JSON.stringify(run.reconciliation)) failures.push("invalid_care_revision");
      else floor = event.reconciliation.to.disposition;
    } else {
      failures.push(...patientReplyFailures(event.disposition, event.text, floor));
      if (run.status !== "complete") failures.push("visible_reply_not_finalized");
      if (run.answer?.patientMessage !== event.text || run.answer?.disposition !== event.disposition) failures.push("visible_final_disagreement");
    }
  }
  const finalChecks = run.answer ? checkAnswer(run.answer, run.message, run.guidance, floor) : [];
  if (!run.answer || run.status !== "complete") failures.push("incomplete_assessment");
  failures.push(...finalChecks.filter((check) => check.status === "fail").map((check) => check.id));
  return {
    failures: [...new Set(failures)],
    emittedSections: run.responseEvents?.length ?? 0,
    clinicalCorrectness: "not_assessed", citationEntailment: "not_assessed",
    // No token/acknowledgment is counted as medical action. Missing data remain null.
    firstActionOrReplyMs: Math.min(...(run.responseEvents ?? []).filter((event) => event.kind === "action" || event.kind === "patient_reply").map((event) => event.elapsedMs ?? Infinity), run.answer ? run.durationMs : Infinity) === Infinity ? null
      : Math.min(...(run.responseEvents ?? []).filter((event) => event.kind === "action" || event.kind === "patient_reply").map((event) => event.elapsedMs ?? Infinity), run.answer ? run.durationMs : Infinity),
  };
}

export function estimatedRunCost(run: DispositionRun): number | null {
  if (!run.agents?.length || run.agents.some((agent) => !["anthropic/claude-opus-5", "anthropic/claude-haiku-4-5"].includes(agent.model) || agent.usage.inputTokens === null || agent.usage.outputTokens === null)) return null;
  return run.agents.reduce((sum, agent) => {
    const haiku = agent.model === "anthropic/claude-haiku-4-5";
    return sum + (agent.usage.inputTokens! * (haiku ? 1 : 5) + agent.usage.outputTokens! * (haiku ? 5 : 25)) / 1_000_000;
  }, 0);
}

export function median(values: (number | null | undefined)[]): number | null {
  const finite = values.filter((n): n is number => typeof n === "number" && Number.isFinite(n)).sort((a, b) => a - b);
  if (!finite.length) return null;
  const mid = Math.floor(finite.length / 2);
  return finite.length % 2 ? finite[mid] : (finite[mid - 1] + finite[mid]) / 2;
}
