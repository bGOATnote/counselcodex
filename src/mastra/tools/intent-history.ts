import { createTool } from "@mastra/core/tools";
import { runIntentBranch } from "../../domain/branches.mjs";
import { inboundSchema, intentResultSchema } from "../schemas.ts";

export const intentHistoryTool = createTool({
  id: "intent-history",
  description: "Classifies a synthetic message into a narrow workflow intent; unknown clinical messages default to physician review.",
  inputSchema: inboundSchema,
  outputSchema: intentResultSchema,
  strict: true,
  requireApproval: false,
  mcp: {
    annotations: {
      title: "Intent and history classifier",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  execute: async ({ message }) => intentResultSchema.parse(await runIntentBranch(message)),
});
