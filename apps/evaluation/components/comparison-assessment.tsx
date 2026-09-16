import { useId } from "react";
import {
  assessmentLabel, assessmentVerdict, isClinicalAssessment, wrongAssessmentOptions,
  type ClinicalAssessment,
} from "../lib/comparison-assessment.ts";

export function ComparisonAssessment({ legend, value, onChange }: {
  legend: string;
  value: string | null;
  onChange: (value: ClinicalAssessment) => void;
}) {
  const id = useId();
  const verdict = assessmentVerdict(value);
  const legacy = value !== null && !isClinicalAssessment(value);
  return <fieldset className="min-w-0 rounded-xl border border-[#d1dfd8] bg-white p-4">
    <legend className="px-1 text-sm font-bold text-[#2b514b]">{legend} <span aria-hidden="true" className="text-[#a64c45]">*</span></legend>
    {legacy && <p className="mb-3 text-xs leading-5 text-[#785322]">Previously saved: <strong>{assessmentLabel(value)}</strong>. Preserved as recorded; select below only to revise.</p>}
    <div className="flex flex-wrap gap-2">
      {([ ["appropriate", "Appropriate"], ["wrong", "Wrong"], ["cannot_judge", "Cannot judge"] ] as const).map(([option, label]) => <label key={option} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold ${verdict === option ? "border-[#4f8979] bg-[#eaf5ef] text-[#174f42]" : "border-[#d9e4df] text-[#45635b] hover:bg-[#f5faf7]"}`}>
        <input type="radio" name={id} value={option} checked={verdict === option} onChange={() => onChange(option === "wrong" && verdict === "wrong" && isClinicalAssessment(value) ? value : option)} className="accent-[#176b56]" />{label}
      </label>)}
    </div>
    {verdict === "wrong" && <label className="mt-3 block text-xs font-semibold text-[#45635b]">What is wrong? <span className="font-normal">· optional</span>
      <select value={value ?? "wrong"} onChange={(event) => {
        const next = event.target.value;
        if (wrongAssessmentOptions.some(([option]) => option === next) && isClinicalAssessment(next)) onChange(next);
      }} className="mt-1.5 w-full rounded-lg border border-[#c9d9d1] bg-white p-2.5 text-sm">
        {wrongAssessmentOptions.map(([option, label]) => <option key={option} value={option}>{label}</option>)}
      </select>
    </label>}
  </fieldset>;
}
