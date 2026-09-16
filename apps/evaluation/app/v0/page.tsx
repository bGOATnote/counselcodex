import type { Metadata } from "next";
import { DispositionWorkbench } from "../../components/disposition-workbench";
import { sampleMessages } from "../../lib/source-messages";

export const metadata: Metadata = { title: "Counsel · V0 disposition prototype", description: "Run the synthetic Mastra disposition workflow. Independent take-home prototype, not a Counsel service." };

export default function V0Page() {
  return <DispositionWorkbench samples={sampleMessages} />;
}
