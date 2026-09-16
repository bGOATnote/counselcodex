import demo from "../../../../outputs/cqa-research-demo-v1.json";
import { episodeSchema } from "../../../../src/cqa/contracts";
import { reportSchema } from "../../../../src/cqa/engine";
import { CQA_CRITERIA } from "../../../../src/cqa/rubrics";
import { QualityInspector } from "@/components/quality-inspector";

export default function QualityPage() {
  return <QualityInspector cases={demo.cases.map((item) => ({ title: item.title, episode: episodeSchema.parse(item.episode), report: reportSchema.parse(item.report) }))} rubric={[...CQA_CRITERIA]} />;
}
