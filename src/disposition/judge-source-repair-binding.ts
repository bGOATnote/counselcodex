import type { AgentExecution } from "./contract.ts";
import { sameRepairValue } from "./repair-values.ts";
import { sameJudgeValueWithSchemaDefaults, verifyJudgeSourceAnchorRepairSteps } from "./judge-source-anchor-repair.ts";

/** Raw provider output may gain only the pre-existing optional schema default.
 * An unexplained source-ID, criterion, verdict or wording change is not equal. */
export function unchangedJudgeSerialization(raw: unknown, resolved: unknown): boolean {
  return sameJudgeValueWithSchemaDefaults(raw, resolved);
}

/** Shared server/browser integrity check; caller binds packet content to the
 * actual patient, reviewed draft, issued events and selected source passages.
 * This is deterministic provenance verification, not clinical entailment. */
export function* verifyJudgeSourceRepairBindingSteps(record: AgentExecution, packet: unknown): Generator<string, boolean, string> {
  if (record.failure !== null || !record.output) return false;
  const audit = record.judgeSourceRepair;
  if (!audit) return record.rawOutput === undefined || unchangedJudgeSerialization(record.rawOutput, record.output);
  if (audit.status !== "applied" || record.rawOutput === undefined || !sameRepairValue(audit.packet, packet)
    || !record.reviewInputBinding || record.reviewInputBinding.packetHash !== (yield JSON.stringify(packet))) return false;
  return yield* verifyJudgeSourceAnchorRepairSteps(record.rawOutput, record.output, audit);
}
