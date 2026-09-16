import { createHash } from "node:crypto";
import type { DispositionRun } from "../disposition/contract.ts";
import { createReviewPacket, REVIEW_INSTRUCTIONS, REVIEW_MODEL, REVIEW_VERSION, criterionIds } from "./response-review.ts";

export const JUDGE_VALIDATION_VERSION = "judge-contrast-validation/v1";
type Verdict = "pass" | "fail" | "abstain";
export type JudgeControlResult = {
  id: string; criterion: string; expected: "pass" | "fail";
  observed: Verdict | null; state: string;
};
// A changed rubric, model, source, case or issued answer must not reuse an old
// judgment. Fixed UUIDs previously collided with the v1 pilot after a v2 update.
export function versionedControlRun(run: DispositionRun, instructions = REVIEW_INSTRUCTIONS, model = REVIEW_MODEL): DispositionRun {
  const packet = createReviewPacket(run);
  const identity = JSON.stringify({ version: REVIEW_VERSION, instructions, model, units: packet.units, generationModel: packet.generationModel, responseStatus: packet.responseStatus });
  const h = createHash("sha256").update(identity).digest("hex");
  return { ...structuredClone(run), runId: `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}` };
}

export function summarizeJudgeControls(rows: JudgeControlResult[]) {
  if (!rows.length || new Set(rows.map(r => r.id)).size !== rows.length || rows.some(r => !criterionIds.includes(r.criterion as typeof criterionIds[number]) || !["pass", "fail"].includes(r.expected) || (r.observed !== null && !["pass", "fail", "abstain"].includes(r.observed)))) throw new Error("INVALID_JUDGE_CONTROL_RESULTS");
  const ratio = (n: number, d: number) => ({ numerator: n, denominator: d, rate: d ? n/d : null });
  const measured = (r: JudgeControlResult) => r.state === "complete" ? r.observed : null;
  const summary = (group: JudgeControlResult[]) => {
    const defects = group.filter(r => r.expected === "fail"), controls = group.filter(r => r.expected === "pass");
    const tp = defects.filter(r => measured(r) === "fail").length, fn = defects.filter(r => measured(r) === "pass").length;
    const fp = controls.filter(r => measured(r) === "fail").length, tn = controls.filter(r => measured(r) === "pass").length;
    return { tasks: group.length, matched: ratio(tp+tn,group.length),
      defectDetection: ratio(tp,defects.length), falseAcceptance: ratio(fn,defects.length),
      falseAlarm: ratio(fp,controls.length), cleanControlAcceptance: ratio(tn,controls.length),
      precisionAmongFlags: ratio(tp,tp+fp),
      abstained: group.filter(r => measured(r) === "abstain").length,
      failedOrUnfinished: group.filter(r => measured(r) === null).length,
      unresolvedDefects: defects.filter(r => measured(r) === null || measured(r) === "abstain").map(r => r.id),
      missedDefects: defects.filter(r => measured(r) === "pass").map(r => r.id),
      falseAlarms: controls.filter(r => measured(r) === "fail").map(r => r.id),
    };
  };
  return { version: JUDGE_VALIDATION_VERSION, ...summary(rows),
    byCriterion: criterionIds.map(criterion => ({ criterion, ...summary(rows.filter(r => r.criterion === criterion)) })),
    calibration: "authored_mutation_controls_not_physician_calibration",
    limits: "These hand-authored, correlated controls test known defects, not prevalence or clinical efficacy. Missing/abstained judgments remain in denominators. No population confidence interval or clinical approval.",
  };
}
