import { z } from "zod";
import { asOfDecision, digest, episodeSchema, evidenceSchema, verifyJudgment, type Criterion, type Episode } from "./contracts.ts";
import { CQA_CRITERIA, CQA_RUBRIC_VERSION } from "./rubrics.ts";

export const criterionIdSchema = z.enum(["emergency_action", "uti_pregnancy_context", "uti_systemic_risk", "uri_antibiotic_indication", "sinusitis_antibiotic_indication"]);
export const jobSchema = z.object({
  episode: episodeSchema,
  inputSha256: z.string(),
  excludedFutureSources: z.number().int().min(0),
  criterionId: criterionIdSchema,
});
export const findingSchema = z.object({
  criterionId: criterionIdSchema,
  verdict: z.enum(["PASS", "FAIL", "ABSTAIN", "NOT_APPLICABLE"]),
  origin: z.enum(["model", "eligibility", "failure"]),
  code: z.string(),
  basis: z.enum(["documented_evidence", "absence_in_complete_record", "insufficient_evidence"]).nullable(),
  rationale: z.string(),
  evidence: z.array(evidenceSchema),
  missingInformation: z.array(z.string()),
  safetyCritical: z.boolean(),
  model: z.string().nullable(),
  elapsedMs: z.number().min(0),
});
export const judgedJobSchema = jobSchema.extend({ finding: findingSchema });
export const reportSchema = z.object({
  schemaVersion: z.literal("counsel-cqa-audit/v1"),
  episodeId: z.string(), revision: z.number().int(), decisionAt: z.string(),
  inputSha256: z.string(), rubricSha256: z.string(), rubricVersion: z.string(),
  excludedFutureSources: z.number().int(),
  findings: z.array(findingSchema),
  triage: z.enum(["potential_safety_issue", "quality_review", "insufficient_evidence", "no_flag_in_assessed_criteria"]),
  mandatoryPhysicianReview: z.literal(true),
  clinicalMonitoringEligible: z.literal(false),
  patientActionTaken: z.literal(false),
  counts: z.object({ pass: z.number(), fail: z.number(), abstain: z.number(), notApplicable: z.number() }),
});
export type AuditReport = z.infer<typeof reportSchema>;
export type JudgeCall = (input: { criterion: Criterion; episode: Episode; signal: AbortSignal }) => Promise<{ judgment: unknown; model: string }>;

export function makeJobs(raw: unknown): z.infer<typeof jobSchema>[] {
  const parsed = episodeSchema.parse(raw);
  const { episode, excludedFutureSources } = asOfDecision(parsed);
  return CQA_CRITERIA.map(({ id }) => ({ episode, inputSha256: digest(parsed), excludedFutureSources, criterionId: id }));
}

function eligibility(episode: Episode, criterion: Criterion): { verdict: "ABSTAIN" | "NOT_APPLICABLE"; code: string } | null {
  if (episode.recordCompleteness !== "complete") return { verdict: "ABSTAIN", code: "RECORD_INCOMPLETE" };
  if (episode.ageYears === null || episode.ageYears < 18) return { verdict: "ABSTAIN", code: "POPULATION_NOT_VALIDATED" };
  if (episode.language !== "en") return { verdict: "ABSTAIN", code: "LANGUAGE_NOT_VALIDATED" };
  if (criterion.conditions.length > 0) {
    const diagnoses = episode.sources.filter(({ kind }) => kind === "diagnosis");
    if (diagnoses.length === 0) return { verdict: "ABSTAIN", code: "COHORT_UNKNOWN" };
    if (!diagnoses.some(({ condition }) => condition && criterion.conditions.includes(condition))) {
      return { verdict: "NOT_APPLICABLE", code: "OUTSIDE_DECLARED_COHORT" };
    }
  }
  if (criterion.requiresAntibiotic) {
    const target = episode.sources.find(({ id }) => id === episode.decisionSourceId)!;
    if (target.kind !== "order") return { verdict: "NOT_APPLICABLE", code: "TARGET_IS_NOT_AN_ORDER" };
    if (target.medicationClass === "unknown") return { verdict: "ABSTAIN", code: "MEDICATION_CLASS_UNKNOWN" };
    if (target.orderStatus !== "signed" || target.medicationClass !== "systemic_antibiotic") {
      return { verdict: "NOT_APPLICABLE", code: "NO_SIGNED_ANTIBIOTIC_AT_TARGET" };
    }
  }
  return null;
}

export async function judgeJob(raw: z.infer<typeof jobSchema>, judge?: JudgeCall, timeoutMs = 20_000): Promise<z.infer<typeof judgedJobSchema>> {
  const job = jobSchema.parse(raw);
  const criterion = CQA_CRITERIA.find(({ id }) => id === job.criterionId)!;
  const base = { criterionId: criterion.id, safetyCritical: criterion.safetyCritical, model: null, basis: null, elapsedMs: 0, evidence: [], missingInformation: [] };
  const gate = eligibility(job.episode, criterion);
  if (gate || !judge) {
    const verdict = gate?.verdict ?? "ABSTAIN";
    const code = gate?.code ?? "RESEARCH_MODEL_DISABLED";
    return { ...job, finding: { ...base, verdict, code, origin: "eligibility", rationale: code,
      missingInformation: verdict === "ABSTAIN" ? [code] : [] } };
  }
  const start = performance.now();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      judge({ criterion, episode: job.episode, signal: controller.signal }),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("JUDGE_TIMEOUT")); }, timeoutMs); }),
    ]);
    const judgment = verifyJudgment(response.judgment, job.episode);
    return { ...job, finding: { ...base, ...judgment, origin: "model", code: "PROVENANCE_SPANS_VERIFIED", model: response.model, elapsedMs: performance.now() - start } };
  } catch (error) {
    const allowed = new Set(["JUDGE_TIMEOUT", "BUDGET_EXHAUSTED", "EVIDENCE_SPAN_INVALID", "EVIDENCE_REQUIRED", "DECISION_EVIDENCE_REQUIRED", "RECORD_INCOMPLETE", "ABSTENTION_REASON_REQUIRED", "PASS_REQUIRES_DOCUMENTED_EVIDENCE", "UNCERTAINTY_REQUIRES_ABSTENTION"]);
    const code = error instanceof Error && allowed.has(error.message) ? error.message : "JUDGE_UNAVAILABLE_OR_INVALID";
    return { ...job, finding: { ...base, verdict: "ABSTAIN", code, origin: "failure", rationale: code,
      missingInformation: ["The criterion did not return a valid evidence-linked judgment."], elapsedMs: performance.now() - start } };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function aggregateJudgments(raw: z.infer<typeof judgedJobSchema>[]): AuditReport {
  const rows = z.array(judgedJobSchema).parse(raw);
  if (rows.length !== CQA_CRITERIA.length || new Set(rows.map(({ criterionId }) => criterionId)).size !== rows.length) throw new Error("INCOMPLETE_CRITERION_SET");
  const first = rows[0];
  if (!rows.every((row) => row.inputSha256 === first.inputSha256 && digest(row.episode) === digest(first.episode) && row.excludedFutureSources === first.excludedFutureSources)) throw new Error("MIXED_AUDIT_INPUTS");
  if (!rows.every((row) => row.finding.criterionId === row.criterionId && row.finding.safetyCritical === CQA_CRITERIA.find(({ id }) => id === row.criterionId)!.safetyCritical)) throw new Error("MISMATCHED_CRITERION_FINDING");
  const findings = CQA_CRITERIA.map(({ id }) => rows.find(({ criterionId }) => criterionId === id)!.finding);
  const counts = {
    pass: findings.filter(({ verdict }) => verdict === "PASS").length,
    fail: findings.filter(({ verdict }) => verdict === "FAIL").length,
    abstain: findings.filter(({ verdict }) => verdict === "ABSTAIN").length,
    notApplicable: findings.filter(({ verdict }) => verdict === "NOT_APPLICABLE").length,
  };
  const triage = findings.some(({ verdict, safetyCritical }) => verdict === "FAIL" && safetyCritical) ? "potential_safety_issue"
    : counts.fail > 0 ? "quality_review" : counts.abstain > 0 ? "insufficient_evidence" : "no_flag_in_assessed_criteria";
  return reportSchema.parse({ schemaVersion: "counsel-cqa-audit/v1", episodeId: first.episode.episodeId, revision: first.episode.revision,
    decisionAt: first.episode.decisionAt, inputSha256: first.inputSha256, rubricSha256: digest(CQA_CRITERIA), rubricVersion: CQA_RUBRIC_VERSION,
    excludedFutureSources: first.excludedFutureSources, findings, counts, triage,
    mandatoryPhysicianReview: true, clinicalMonitoringEligible: false, patientActionTaken: false });
}

export class ResearchBudget {
  #calls = 0;
  #reservedUsd = 0;
  readonly maxCalls: number;
  readonly maxReservedUsd: number;
  readonly reservationPerCallUsd: number;
  constructor(maxCalls = 10, maxReservedUsd = 20, reservationPerCallUsd = 2) {
    if (!Number.isInteger(maxCalls) || maxCalls < 1 || !Number.isFinite(maxReservedUsd) || maxReservedUsd <= 0 || !Number.isFinite(reservationPerCallUsd) || reservationPerCallUsd <= 0) throw new Error("Invalid research budget");
    this.maxCalls = maxCalls;
    this.maxReservedUsd = maxReservedUsd;
    this.reservationPerCallUsd = reservationPerCallUsd;
  }
  reserve() {
    // Synchronous reservation precedes the first await; concurrent branches
    // cannot oversubscribe the budget. Uncertain charges are never refunded.
    if (this.#calls + 1 > this.maxCalls || this.#reservedUsd + this.reservationPerCallUsd > this.maxReservedUsd) throw new Error("BUDGET_EXHAUSTED");
    this.#calls += 1;
    this.#reservedUsd += this.reservationPerCallUsd;
  }
  snapshot() { return { callsReserved: this.#calls, reservedUsd: this.#reservedUsd, maxCalls: this.maxCalls, maxReservedUsd: this.maxReservedUsd, actualBilledUsd: null }; }
}
