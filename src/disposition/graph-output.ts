import { z } from "zod";
import { adaptiveAnswerSchema } from "./contract.ts";
// Client-safe canonical response contract; no model/runtime imports.
export const draftSchema = adaptiveAnswerSchema.extend({
  transportIntent: z.object({ mode: z.enum(["activate_ems", "continue_ems", "ed_now"]), activationQuote: z.string().min(3).max(600).nullable() }).strict().nullable().default(null),
  reviewPriority: z.enum(["priority", "routine"]).nullable(), workType: z.enum(["medication_request", "clinical_review"]).nullable(),
  citations: z.array(z.object({ passageId: z.string(), quote: z.string().min(10).max(600), claim: z.string().min(10).max(500), applicability: z.enum(["applicable", "uncertain"]), limitation: z.string().max(300) }).strict()).max(4),
}).omit({ evidence: true }).strict();
export const wireDraftSchema = draftSchema.extend({ citations: z.array(draftSchema.shape.citations.element.omit({ quote: true }).extend({ quoteId: z.string().regex(/^q\d+$/) }).strict()).max(4) });
