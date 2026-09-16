import { StrippedWorkbench } from "../../components/stripped-workbench";
import { sampleMessages } from "../../lib/source-messages";
import { PROTOCOL } from "../../../../src/stripped/protocol";

export const metadata = {
  title: "Independent disposition demo — Fable",
  description: "Independent synthetic-message research demonstration: one message, one disposition and a short rationale. Not for patient care.",
};

export default function StrippedPage() {
  return <StrippedWorkbench cases={sampleMessages} protocol={PROTOCOL} />;
}
