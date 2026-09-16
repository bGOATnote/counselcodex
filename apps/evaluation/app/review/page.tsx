import { EvaluationWorkbench } from "@/components/evaluation-workbench";
import { dataset, evaluationCases } from "@/lib/cases";

export default function Page() {
  return <><aside className="border-b bg-[#fff6df] px-6 py-3 text-sm">Historical review: these answers belong to the earlier rules-based V0, not the current agent. Your saved reviews are unchanged. <a className="underline" href="/">Open disposition agent</a></aside><EvaluationWorkbench cases={evaluationCases} dataset={dataset} /></>;
}
