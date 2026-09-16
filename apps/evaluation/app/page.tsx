import { DispositionWorkbench } from "@/components/disposition-workbench";
import { sampleMessages } from "@/lib/source-messages";

export default function Page() {
  return <DispositionWorkbench samples={sampleMessages} />;
}
