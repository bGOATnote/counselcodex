import type { ClinicalBrief, ClinicalSource } from "./evidence-catalog.ts";

export type SourceLinkCheck = {
  sourceId: string; requestedUrl: string; checkedAt: string; status: string;
  httpStatus: number | null; finalUrl: string | null; claimSupportVerified: false;
};
export type EvidencePacket = ClinicalBrief & {
  version: string; catalogHash: string; sourceDatasetHash: string; messageHash: string;
  reportHash: string | null;
  sources: Array<ClinicalSource & { linkCheck: SourceLinkCheck | null }>;
};
export type EvidenceContext = {
  safetyReviewVersion?: string; safetyReviewHash?: string;
  formVersion: "clinical-comparison/v2";
  evidenceVersion: string; catalogHash: string; messageHash: string;
  reportHash: string | null; sourceIds: string[]; recordedAt: string;
};
export function comparisonEvidenceContext(packet: EvidencePacket | null | undefined, at: string, safety?: { version: string; hash: string }): EvidenceContext | undefined {
  return packet ? { formVersion: "clinical-comparison/v2", evidenceVersion: packet.version, catalogHash: packet.catalogHash, messageHash: packet.messageHash, reportHash: packet.reportHash, sourceIds: [...packet.sourceIds], recordedAt: at, ...(safety ? { safetyReviewVersion: safety.version, safetyReviewHash: safety.hash } : {}) } : undefined;
}
