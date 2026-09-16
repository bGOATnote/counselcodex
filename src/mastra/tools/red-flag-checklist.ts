import { createTool } from "@mastra/core/tools";
import { runEmergencyBranch } from "../../domain/branches.mjs";
import { emergencyResultSchema, inboundSchema } from "../schemas.ts";

export const redFlagChecklistTool = createTool({
  id: "red-flag-checklist",
  description: "Runs a deterministic, fail-closed checklist for explicitly versioned urgent patterns in a synthetic patient message.",
  inputSchema: inboundSchema,
  outputSchema: emergencyResultSchema,
  strict: true,
  requireApproval: false,
  mcp: {
    annotations: {
      title: "Red flag checklist",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  execute: async ({ message }) => emergencyResultSchema.parse(await runEmergencyBranch(message)),
});
