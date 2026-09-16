/** Isolated contract correction; not imported by the live V25 workflow.
 * Fewer output responsibilities must not remove transport semantics or turn a
 * presentation target into a clinical release decision. No patient publication.
 */
import { z } from "zod";
import { draftSchema, wireDraftSchema } from "./graph-output.ts";
import { GRAPH_INSTRUCTIONS } from "./graph-prompts.ts";
import { ROUTING_BRIEF_INSTRUCTIONS } from "./routing-brief.ts";

export const ROUTING_BRIEF_V2 = "routing-brief/v2";
const fields = { disposition: true, reviewPriority: true, workType: true,
  transportIntent: true, reason: true, redFlags: true, citations: true,
  evidenceLimitations: true } as const;
// Use the original full contract's resource bounds, not chained .max() checks
// (Zod retains the tighter previous check). No truncation or citation dropping.
export const routingBriefV2Schema = draftSchema.pick(fields).strict();
export const wireRoutingBriefV2Schema = wireDraftSchema.pick(fields).strict();
export type RoutingBriefV2 = z.infer<typeof routingBriefV2Schema>;

const transport = GRAPH_INSTRUCTIONS.disposition.match(/\n(TRANSPORT: [^\n]+)\nEVIDENCE:/)?.[1];
if (!transport) throw new Error("ORIGINAL_TRANSPORT_CONTRACT_NOT_FOUND");
export const ROUTING_BRIEF_V2_INSTRUCTIONS = ROUTING_BRIEF_INSTRUCTIONS
  .replace("Use redFlags for up to four DECISION-RELEVANT findings only:",
    "Use redFlags for usually up to four DECISION-RELEVANT findings only:")
  .replace("EVIDENCE: Cite up to two supplied passageId + quoteId pairs",
    "EVIDENCE: Usually cite one or two supplied passageId + quoteId pairs")
  + `\n${transport}\nPresentation targets (not permission to omit necessary information): reason usually within 450 characters; evidenceLimitations within 350; up to four findings and two citations. Preserve necessary content within the schema resource bounds. This brief contains no patient instructions; transportIntent is a recommendation, not evidence that EMS was contacted.`;

/** Off-path presentation diagnostics only. Clinical, quote and routing checks
 * remain separate. Empty/extra citations never acquire semantic support here.
 */
export function routingBriefPresentation(value: RoutingBriefV2) {
  return { reasonWithinTarget: value.reason.length <= 450,
    evidenceLimitationsWithinTarget: value.evidenceLimitations.length <= 350,
    findingsWithinTarget: value.redFlags.length <= 4,
    citationsWithinTarget: value.citations.length <= 2,
    citedClaims: value.citations.length, emptyCitations: value.citations.length === 0,
    claim_support: "not_assessed" as const, unsupported_claims: "not_assessed" as const,
    clinical_correctness: "not_assessed" as const, clinicalApproval: false as const,
    patientAdvicePublished: false as const };
}
