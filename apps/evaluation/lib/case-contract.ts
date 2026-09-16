import type { EvidencePacket } from "./evidence-contract.ts";
import type { ResponseSafetyReview } from "../../../src/clinical/response-safety.ts";

export type Disposition =
  | "SELF_CARE"
  | "ASYNC_PHYSICIAN"
  | "SAME_DAY_IN_PERSON"
  | "EMERGENCY_NOW";

export type LegacyDisposition =
  | "SELF_CARE"
  | "ASYNC_PHYSICIAN"
  | "URGENT_ESCALATION";

export type ReviewFinding =
  | "agreement"
  | "possible_undertriage"
  | "possible_overtriage";

export type EvaluationCase = {
  id: string;
  ordinal: number;
  message: string;
  suppliedDisposition: LegacyDisposition;
  clinicalEvidence?: EvidencePacket | null;
  responseSafety?: ResponseSafetyReview;
  responseSafetyHash?: string;
  referenceProposal: {
    disposition: Disposition;
    subtype: string;
    confidence: "high" | "medium" | "low";
    rationale: string;
    finding: ReviewFinding;
    harmIfFollowSupplied: string;
  };
  v0: {
    disposition: Disposition;
    subtype: string;
    confidence: string;
    layer: string;
    overrideBlocked: boolean;
    redFlags: string[];
    rationale: string;
    matchesReferenceProposal: boolean;
    patientDirective?: string;
  };
};

export function toLegacyDisposition(value: Disposition): LegacyDisposition {
  return value === "SAME_DAY_IN_PERSON" || value === "EMERGENCY_NOW"
    ? "URGENT_ESCALATION"
    : value;
}
