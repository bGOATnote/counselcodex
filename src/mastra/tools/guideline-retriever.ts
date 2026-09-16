import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { guidelineFor } from "../../domain/policy.mjs";
import { guidelineSchema } from "../schemas.ts";

export const guidelineRetrieverTool = createTool({
  id: "guideline-retriever",
  description: "Returns immutable, provenance-bearing, context-only demo policy evidence. It cannot change disposition or downgrade urgency.",
  inputSchema: z.object({ intent: z.enum(["refill", "results", "navigation", "self_care", "clinical"]) }),
  outputSchema: guidelineSchema,
  strict: true,
  requireApproval: false,
  mcp: {
    annotations: {
      title: "Guideline retriever",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  execute: async ({ intent }) => guidelineSchema.parse(guidelineFor(intent)),
});
