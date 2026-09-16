import { createTool } from "../runtime/workflow-engine.mjs";
import { guidelineFor } from "../domain/policy.mjs";

export const guidelineRetriever = createTool({
  id: "guideline-retriever",
  description: "Returns provenance-bearing, context-only policy evidence that cannot change disposition or downgrade urgency.",
  async execute({ context: { intent } }) {
    return guidelineFor(intent);
  },
});
