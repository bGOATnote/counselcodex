import { checkAnswer, type DispositionAnswer, type Guidance, type Check } from "../disposition/contract.ts";
import { citationAudit } from "./claims.ts";

// Server-side integrity check. Browser contracts remain free of Node APIs.
export function checkAnswerWithEvidence(answer: DispositionAnswer, message: string, guidance: Guidance[], floor: string | null): Check[] {
  const audit = citationAudit(answer, guidance);
  return [...checkAnswer(answer, message, guidance, floor), {
    id: "evidence_record_integrity", status: audit.status === "fail" ? "fail" : answer.evidence.length && answer.evidence.every((c) => guidance.find((g) => g.id === c.sourceId)?.evidenceRecord) ? "pass" : "not_assessed",
    detail: "Retrieved records retain their content hashes and review window; this does not assess clinical support.",
  }];
}
