import { StrippedWorkbench } from "../../components/stripped-workbench";
import { sampleMessages } from "../../lib/source-messages";
import { PROTOCOL } from "../../../../src/stripped/protocol";

export const metadata = { title: "Counsel — Fable disposition" };

export default function StrippedPage() {
  return <StrippedWorkbench cases={sampleMessages} protocol={PROTOCOL} />;
}
