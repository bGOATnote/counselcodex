import { graphJudgePacket, graphJudgeSchema, validateGraphJudge, type GraphJudge } from "../disposition/clinical-graph.ts";
import { graphJudgeInstructions } from "../disposition/graph-prompts.ts";
import { graphJudgeCalibrationInput, type GraphJudgeCalibrationFixture } from "./graph-judge-calibration.ts";
import { sha256 } from "../evidence/rag/model.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";

export const GRAPH_JUDGE_STUDY = "fixed-judge-style/v1";
export type JudgeStyle = "full" | "concise";
export type JudgeStudyRow = { id: string; family: string; variant: "defect" | "control"; style: JudgeStyle; packetHash: string; expected: "pass" | "fail"; observed: "pass" | "fail" | "abstain" | null; valid: boolean; durationMs: number; outputTokens: number | null; estimatedUSD: number | null };
export function calibrationPacket(fixture: GraphJudgeCalibrationFixture) {
  const input = graphJudgeCalibrationInput(fixture);
  // No contractFindings supplied in either arm. The ordinary handoff-language
  // hints remain identical; no targeted-criterion detector or label is supplied.
  return graphJudgePacket({ patient: input.patient, draft: input.draft, hits: input.hits, notice: input.early });
}
export function judgeStudyFingerprint(fixtures: GraphJudgeCalibrationFixture[]): string {
  return sha256(JSON.stringify({ protocol: GRAPH_JUDGE_STUDY, schema: graphJudgeSchema.toJSONSchema(), instructions: [graphJudgeInstructions("full"), graphJudgeInstructions("concise")],
    schedule: judgeStudySchedule(fixtures).map(({ fixture, style }) => ({ id: fixture.id, style, packet: calibrationPacket(fixture), expected: fixture.expected })) }));
}
export function claimJudgeStudyAuthorization(path: string, directory: string, fingerprint: string) {
  const authorization = z.object({ approved: z.literal(true), reference: z.string().min(10), studyFingerprint: z.literal(fingerprint), maximumUSD: z.number().positive().max(100), maximumCalls: z.literal(28) }).strict().parse(JSON.parse(readFileSync(path, "utf8")));
  // One authorization permits one invocation, not another allocation for each
  // new output folder. An interrupted invocation still consumes this claim;
  // another attempt requires reconciled, explicit new authorization.
  writeFileSync(`${path}.consumed.json`, JSON.stringify({ directory, fingerprint, claimedAt: new Date().toISOString(), authorization }) + "\n", { flag: "wx", mode: 0o600 });
  return authorization;
}
export function judgeStudySchedule(fixtures: GraphJudgeCalibrationFixture[]) {
  return [...fixtures].sort((a, b) => sha256(a.id).localeCompare(sha256(b.id))).flatMap((fixture, index) =>
    (index % 2 ? ["concise", "full"] : ["full", "concise"]).map(style => ({ fixture, style: style as JudgeStyle })));
}
export function judgeStudyOutcome(fixture: GraphJudgeCalibrationFixture, output: unknown): { judge: GraphJudge | null; observed: JudgeStudyRow["observed"] } {
  const packet = calibrationPacket(fixture), judge = validateGraphJudge(output, packet.units, fixture.draft.citations.length > 0, null);
  return { judge, observed: judge?.criteria.find(c => c.id === fixture.expected.criterion)?.verdict ?? null };
}
export function judgeRequestReservation(prompt: string, style: JudgeStyle): number {
  // Conservative token estimate: UTF-8 bytes upper-bound ordinary tokenized
  // input; extra schema/envelope overhead is reserved. Not an invoice quote.
  return (Buffer.byteLength(prompt + graphJudgeInstructions(style) + JSON.stringify(graphJudgeSchema.toJSONSchema())) + 4096) * 10 / 1e6 + 2400 * 50 / 1e6;
}
export function summarizeJudgeStudy(rows: JudgeStudyRow[], plannedIds: string[]) {
  if (new Set(plannedIds).size !== plannedIds.length || rows.some(r => !plannedIds.includes(r.id) || !["full", "concise"].includes(r.style) || !Number.isFinite(r.durationMs) || r.durationMs < 0 || r.outputTokens !== null && (!Number.isFinite(r.outputTokens) || r.outputTokens < 0) || r.estimatedUSD !== null && (!Number.isFinite(r.estimatedUSD) || r.estimatedUSD < 0)) || new Set(rows.map(r => `${r.style}:${r.id}`)).size !== rows.length) throw new Error("INVALID_JUDGE_STUDY_ROWS");
  const median = (values: number[]) => { const v = [...values].sort((a, b) => a - b), i = Math.floor(v.length / 2); return v.length ? v.length % 2 ? v[i] : (v[i - 1] + v[i]) / 2 : null; };
  const arms = Object.fromEntries((["full", "concise"] as const).map(style => {
    const group = rows.filter(r => r.style === style);
    return [style, { planned: plannedIds.length, attempted: group.length, valid: group.filter(r => r.valid).length,
      omitted: plannedIds.length - group.length, matched: group.filter(r => r.valid && r.observed === r.expected).length,
      missedDefects: group.filter(r => r.expected === "fail" && r.observed !== "fail").map(r => r.id),
      falseAlarms: group.filter(r => r.expected === "pass" && r.observed === "fail").map(r => r.id),
      unresolved: group.filter(r => !r.valid || r.observed === "abstain").map(r => r.id),
      medianMsAllAttempts: median(group.map(r => r.durationMs)), medianOutputTokensKnown: median(group.flatMap(r => r.outputTokens === null ? [] : [r.outputTokens])),
      estimatedUSD: group.reduce((n, r) => n + (r.estimatedUSD ?? 0), 0), unknownCosts: group.filter(r => r.estimatedUSD === null).length }];
  })) as Record<JudgeStyle, { planned: number; attempted: number; valid: number; omitted: number; matched: number; missedDefects: string[]; falseAlarms: string[]; unresolved: string[]; medianMsAllAttempts: number | null; medianOutputTokensKnown: number | null; estimatedUSD: number; unknownCosts: number }>;
  const paired = plannedIds.flatMap(id => { const full = rows.find(r => r.id === id && r.style === "full"), concise = rows.find(r => r.id === id && r.style === "concise");
    if (full && concise && full.packetHash !== concise.packetHash) throw new Error("JUDGE_PACKET_PAIR_MISMATCH");
    return full && concise ? [{ id, deltaMs: concise.durationMs - full.durationMs }] : []; });
  const eligible = plannedIds.length > 0 && arms.concise.valid === plannedIds.length && arms.concise.matched === plannedIds.length && arms.full.valid === plannedIds.length && paired.length === plannedIds.length;
  return { protocol: GRAPH_JUDGE_STUDY, arms, paired, medianPairedDeltaMs: median(paired.map(r => r.deltaMs)),
    promotionSignal: eligible && (median(paired.map(r => r.deltaMs)) ?? 0) < 0 ? "eligible_for_gui_verification" : "not_established",
    limitation: "Engineering-authored targeted-criterion controls, one sample per packet/arm; not physician calibration, held-out efficacy, whole-answer correctness or a tail-latency guarantee." };
}
