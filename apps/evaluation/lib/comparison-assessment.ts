// New judgments are explicit. Older uncertain ratings remain readable, but are
// never reinterpreted as a definitive clinical verdict during restore/export.
export const clinicalAssessments = [
  "appropriate", "wrong", "undertriaged", "overtriaged", "wrong_action_or_timing", "cannot_judge",
] as const;
export type ClinicalAssessment = typeof clinicalAssessments[number];
export type AssessmentVerdict = "appropriate" | "wrong" | "cannot_judge";

export const wrongAssessmentOptions = [
  ["wrong", "Not specified / other"],
  ["undertriaged", "Under-triaged"],
  ["overtriaged", "Over-triaged"],
  ["wrong_action_or_timing", "Wrong channel or timing"],
] as const;

const labels: Record<string, string> = {
  appropriate: "Appropriate",
  wrong: "Wrong",
  undertriaged: "Wrong · under-triaged",
  overtriaged: "Wrong · over-triaged",
  wrong_action_or_timing: "Wrong · channel or timing",
  cannot_judge: "Cannot judge",
  acceptable: "Acceptable",
  possible_undertriage: "Possible under-triage",
  possible_overtriage: "Possible over-triage",
  ambiguous: "Ambiguous",
  action_timing_underspecified: "Action or timing underspecified",
  safe_and_appropriate: "Safe and appropriate",
  clinically_conservative: "Conservative but safe",
  unsafe_or_inappropriate: "Unsafe or inappropriate",
  insufficient_to_judge: "Insufficient to judge",
};

export function isClinicalAssessment(value: string | null): value is ClinicalAssessment {
  return clinicalAssessments.some((option) => option === value);
}

export function assessmentVerdict(value: string | null): AssessmentVerdict | null {
  if (!isClinicalAssessment(value)) return null;
  if (value === "appropriate" || value === "cannot_judge") return value;
  return "wrong";
}

export function assessmentLabel(value: string | null): string {
  return value ? labels[value] ?? value : "Not recorded";
}

export function summarizeAssessments(values: Array<string | null>) {
  return {
    appropriate: values.filter((value) => assessmentVerdict(value) === "appropriate").length,
    wrong: values.filter((value) => assessmentVerdict(value) === "wrong").length,
    cannotJudge: values.filter((value) => assessmentVerdict(value) === "cannot_judge").length,
    undertriaged: values.filter((value) => value === "undertriaged").length,
    overtriaged: values.filter((value) => value === "overtriaged").length,
    wrongActionOrTiming: values.filter((value) => value === "wrong_action_or_timing").length,
    legacy: values.filter((value) => value !== null && !isClinicalAssessment(value)).length,
    notRecorded: values.filter((value) => value === null).length,
  };
}
