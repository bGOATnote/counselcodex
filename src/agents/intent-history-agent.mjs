import { runIntentBranch } from "../domain/branches.mjs";
import { Agent } from "../runtime/workflow-engine.mjs";
import { guidelineRetriever } from "../tools/guideline-retriever.mjs";

export const intentHistoryAgent = new Agent({
  name: "intentHistoryAgent",
  instructions: "Classify workflow intent, extract only stated facts, and ask no more than two questions. Unknown is never self-care.",
  tools: { guidelineRetriever },
  async execute({ message }) {
    return runIntentBranch(message);
  },
});
