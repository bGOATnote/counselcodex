import { z } from "zod";
import { toLegacyDisposition, type Disposition, type EvaluationCase } from "./case-contract.ts";
import type { EvidenceContext } from "./evidence-contract.ts";
import { clinicalAssessments, isClinicalAssessment, summarizeAssessments } from "./comparison-assessment.ts";

const LEGACY_WORKSPACE_SCHEMA_VERSION = "counsel-physician-review-workspace/v1" as const;
const LEGACY_EXPORT_SCHEMA_VERSION = "counsel-physician-review-export/v1" as const;
export const WORKSPACE_SCHEMA_VERSION = "counsel-physician-review-workspace/v2" as const;
export const EXPORT_SCHEMA_VERSION = "counsel-physician-review-export/v2" as const;
export const MAX_IMPORT_BYTES = 8 * 1024 * 1024;
export const FOCUSED_REVIEW_FORM_VERSION = "focused/v1" as const;
const LEGACY_ATTESTATION_STATEMENT = "I personally reviewed every synthetic case, recorded my independent disposition before seeing the supplied label or V0 output, and have identified any post-reveal revisions in the audit record.";
export const ATTESTATION_STATEMENT = "I personally reviewed every synthetic case, recorded my own disposition with comparison labels hidden for this review pass, and identified any post-reveal revisions. These previously visible development cases are not a blinded holdout.";

export const actionTimings = [
  "SELF_CARE_ONLY",
  "ASYNC_SAME_DAY",
  "ASYNC_ROUTINE",
  "SAME_DAY_IN_PERSON",
  "EMERGENCY_NOW",
] as const;

export const confidenceLevels = ["high", "medium", "low"] as const;
export const evidenceSufficiencyLevels = ["sufficient", "borderline", "insufficient"] as const;
export const sourceAssessments = [...clinicalAssessments, "acceptable", "possible_undertriage", "possible_overtriage", "ambiguous", "action_timing_underspecified"] as const;
export const v0Assessments = [...clinicalAssessments, "safe_and_appropriate", "clinically_conservative", "unsafe_or_inappropriate", "insufficient_to_judge"] as const;

const DispositionSchema = z.enum(["SELF_CARE", "ASYNC_PHYSICIAN", "SAME_DAY_IN_PERSON", "EMERGENCY_NOW"]);
const ActionTimingSchema = z.enum(actionTimings);
const ConfidenceSchema = z.enum(confidenceLevels);
const EvidenceSufficiencySchema = z.enum(evidenceSufficiencyLevels);
const SourceAssessmentSchema = z.enum(sourceAssessments);
const V0AssessmentSchema = z.enum(v0Assessments);
const CaseIdSchema = z.string().regex(/^C\d{2,4}$/);
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const ReviewTextSchema = z.string().max(4000);

export type ActionTiming = z.infer<typeof ActionTimingSchema>;
export type Confidence = z.infer<typeof ConfidenceSchema>;
export type EvidenceSufficiency = z.infer<typeof EvidenceSufficiencySchema>;
export type SourceAssessment = z.infer<typeof SourceAssessmentSchema>;
export type V0Assessment = z.infer<typeof V0AssessmentSchema>;

export type JudgmentDraft = {
  formVersion?: typeof FOCUSED_REVIEW_FORM_VERSION;
  disposition: Disposition | "";
  actionTiming: ActionTiming | "";
  decisiveEvidence: string;
  clinicalRationale: string;
  mustNotMiss: string;
  missingInformation: string;
  riskIfWrong: string;
  confidence: Confidence | "";
  evidenceSufficiency: EvidenceSufficiency | "";
};

export type ClinicalJudgment = {
  formVersion?: typeof FOCUSED_REVIEW_FORM_VERSION;
  disposition: Disposition;
  actionTiming: ActionTiming;
  decisiveEvidence: string;
  clinicalRationale: string;
  mustNotMiss: string;
  missingInformation: string;
  riskIfWrong: string;
  confidence: Confidence | "";
  evidenceSufficiency: EvidenceSufficiency | "";
};

export type ReviewRecord = {
  comparisonEvidence?: EvidenceContext;
  caseId: string;
  draft: JudgmentDraft;
  blindJudgment: ClinicalJudgment | null;
  finalJudgment: ClinicalJudgment | null;
  blindCommittedAt: string | null;
  postRevealRevisedAt: string | null;
  sourceAssessment: SourceAssessment | null;
  v0Assessment: V0Assessment | null;
  comparisonNotes: string;
  completedAt: string | null;
};

export type ReviewEvent = {
  sequence: number;
  caseId: string | null;
  action: "blind_judgment_committed" | "post_reveal_judgment_revised" | "case_completed" | "attestation_signed" | "attestation_invalidated" | "workspace_imported";
  at: string;
};

export type ReviewWorkspace = {
  schemaVersion: typeof WORKSPACE_SCHEMA_VERSION;
  datasetVersion: string;
  datasetHash: string;
  referenceProposalHash: string;
  predictionHash: string;
  startedAt: string;
  updatedAt: string;
  reviewer: {
    name: string;
    credentials: string;
  };
  records: Record<string, ReviewRecord>;
  events: ReviewEvent[];
  attestation: {
    reviewerName: string;
    statement: string;
    signedAt: string;
  } | null;
};

export type DatasetIdentity = {
  version: string;
  sourceHash: string;
  referenceProposalHash: string;
  predictionHash: string;
};

const JudgmentSchema = z.object({
  formVersion: z.literal(FOCUSED_REVIEW_FORM_VERSION).optional(),
  disposition: DispositionSchema,
  actionTiming: ActionTimingSchema,
  decisiveEvidence: ReviewTextSchema,
  clinicalRationale: ReviewTextSchema,
  mustNotMiss: ReviewTextSchema,
  missingInformation: ReviewTextSchema,
  riskIfWrong: ReviewTextSchema,
  confidence: z.union([ConfidenceSchema, z.literal("")]),
  evidenceSufficiency: z.union([EvidenceSufficiencySchema, z.literal("")]),
}).strict();

const DraftSchema = z.object({
  formVersion: z.literal(FOCUSED_REVIEW_FORM_VERSION).optional(),
  disposition: z.union([DispositionSchema, z.literal("")]),
  actionTiming: z.union([ActionTimingSchema, z.literal("")]),
  decisiveEvidence: ReviewTextSchema,
  clinicalRationale: ReviewTextSchema,
  mustNotMiss: ReviewTextSchema,
  missingInformation: ReviewTextSchema,
  riskIfWrong: ReviewTextSchema,
  confidence: z.union([ConfidenceSchema, z.literal("")]),
  evidenceSufficiency: z.union([EvidenceSufficiencySchema, z.literal("")]),
}).strict();

const ReviewRecordSchema = z.object({
  comparisonEvidence: z.object({
    safetyReviewVersion: z.string().min(1).max(100).optional(), safetyReviewHash: HashSchema.optional(),
    formVersion: z.literal("clinical-comparison/v2"),
    evidenceVersion: z.string().max(100), catalogHash: HashSchema, messageHash: HashSchema,
    reportHash: HashSchema.nullable(), sourceIds: z.array(z.string().regex(/^[a-z]+$/)).min(1).max(10),
    recordedAt: z.string().datetime(),
  }).strict().refine((value) => Boolean(value.safetyReviewVersion) === Boolean(value.safetyReviewHash), "Safety review version and hash must be recorded together").optional(),
  caseId: CaseIdSchema,
  draft: DraftSchema,
  blindJudgment: JudgmentSchema.nullable(),
  finalJudgment: JudgmentSchema.nullable(),
  blindCommittedAt: z.string().datetime().nullable(),
  postRevealRevisedAt: z.string().datetime().nullable(),
  sourceAssessment: SourceAssessmentSchema.nullable(),
  v0Assessment: V0AssessmentSchema.nullable(),
  comparisonNotes: z.string().max(8000),
  completedAt: z.string().datetime().nullable(),
}).strict();

const ReviewWorkspaceSchema = z.object({
  schemaVersion: z.literal(WORKSPACE_SCHEMA_VERSION),
  datasetVersion: z.string().max(200),
  datasetHash: HashSchema,
  referenceProposalHash: HashSchema,
  predictionHash: HashSchema,
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  reviewer: z.object({ name: z.string().max(200), credentials: z.string().max(400) }).strict(),
  records: z.record(CaseIdSchema, ReviewRecordSchema),
  events: z.array(z.object({
    sequence: z.number().int().positive(),
    caseId: CaseIdSchema.nullable(),
    action: z.enum(["blind_judgment_committed", "post_reveal_judgment_revised", "case_completed", "attestation_signed", "attestation_invalidated", "workspace_imported"]),
    at: z.string().datetime(),
  }).strict()).max(10000),
  attestation: z.object({ reviewerName: z.string().max(200), statement: z.string().max(1000), signedAt: z.string().datetime() }).strict().nullable(),
}).strict();

const ExportEnvelopeSchema = z.object({
  schemaVersion: z.literal(EXPORT_SCHEMA_VERSION),
  exportedAt: z.string().datetime(),
  provenance: z.object({
    datasetVersion: z.string().max(200),
    sourceHash: HashSchema,
    referenceProposalHash: HashSchema,
    predictionHash: HashSchema,
    synthetic: z.literal(true),
  }).strict(),
  workspace: ReviewWorkspaceSchema,
  integrity: z.object({ algorithm: z.literal("SHA-256"), digest: HashSchema }).strict(),
}).strict();

function migratedDisposition(value: unknown, timing: unknown): unknown {
  if (value !== "URGENT_ESCALATION") return value;
  if (timing === "EMERGENCY_NOW") return "EMERGENCY_NOW";
  if (timing === "SAME_DAY_IN_PERSON") return "SAME_DAY_IN_PERSON";
  // A partially completed V1 draft did not contain enough information to
  // recover which route the reviewer intended. Preserve every narrative field
  // but require an explicit new route selection instead of guessing.
  return "";
}

function migrateLegacyWorkspace(candidate: unknown, expectedDataset: DatasetIdentity): unknown {
  if (!candidate || typeof candidate !== "object") return candidate;
  const source = candidate as Record<string, unknown>;
  if (source.schemaVersion !== LEGACY_WORKSPACE_SCHEMA_VERSION) return candidate;
  const migrated = structuredClone(source) as Record<string, unknown>;
  migrated.schemaVersion = WORKSPACE_SCHEMA_VERSION;
  migrated.datasetVersion = expectedDataset.version;
  migrated.referenceProposalHash = expectedDataset.referenceProposalHash;
  migrated.predictionHash = expectedDataset.predictionHash;
  const records = migrated.records;
  if (records && typeof records === "object") {
    for (const record of Object.values(records as Record<string, unknown>)) {
      if (!record || typeof record !== "object") continue;
      const typedRecord = record as Record<string, unknown>;
      for (const key of ["draft", "blindJudgment", "finalJudgment"] as const) {
        const judgment = typedRecord[key];
        if (!judgment || typeof judgment !== "object") continue;
        const typedJudgment = judgment as Record<string, unknown>;
        typedJudgment.disposition = migratedDisposition(typedJudgment.disposition, typedJudgment.actionTiming);
      }
      // The V1 comparison was made against the old three-level V0. Preserve the
      // blinded clinical judgment, but invalidate every revealed comparison so
      // the upgraded evidence cannot silently claim review of different output.
      if (typedRecord.blindJudgment) {
        typedRecord.finalJudgment = structuredClone(typedRecord.blindJudgment);
        typedRecord.postRevealRevisedAt = null;
        typedRecord.sourceAssessment = null;
        typedRecord.v0Assessment = null;
        typedRecord.comparisonNotes = "";
        typedRecord.completedAt = null;
      }
    }
  }
  const events = migrated.events;
  if (Array.isArray(events)) {
    migrated.events = events
      .filter((event) => event && typeof event === "object" && (event as Record<string, unknown>).action === "blind_judgment_committed")
      .map((event, index) => ({ ...(event as Record<string, unknown>), sequence: index + 1 }));
  }
  migrated.attestation = null;
  return migrated;
}

function migrateLegacyEnvelope(candidate: unknown, expectedDataset: DatasetIdentity): unknown {
  if (!candidate || typeof candidate !== "object") return candidate;
  const source = candidate as Record<string, unknown>;
  if (source.schemaVersion !== LEGACY_EXPORT_SCHEMA_VERSION) return candidate;
  const migrated = structuredClone(source) as Record<string, unknown>;
  migrated.schemaVersion = EXPORT_SCHEMA_VERSION;
  migrated.workspace = migrateLegacyWorkspace(migrated.workspace, expectedDataset);
  return migrated;
}

export function emptyJudgment(): JudgmentDraft {
  return {
    disposition: "",
    actionTiming: "",
    decisiveEvidence: "",
    clinicalRationale: "",
    mustNotMiss: "",
    missingInformation: "",
    riskIfWrong: "",
    confidence: "",
    evidenceSufficiency: "",
  };
}

function emptyRecord(caseId: string): ReviewRecord {
  return {
    caseId,
    draft: emptyJudgment(),
    blindJudgment: null,
    finalJudgment: null,
    blindCommittedAt: null,
    postRevealRevisedAt: null,
    sourceAssessment: null,
    v0Assessment: null,
    comparisonNotes: "",
    completedAt: null,
  };
}

export function createWorkspace(dataset: DatasetIdentity, caseIds: string[], now = new Date().toISOString()): ReviewWorkspace {
  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    datasetVersion: dataset.version,
    datasetHash: dataset.sourceHash,
    referenceProposalHash: dataset.referenceProposalHash,
    predictionHash: dataset.predictionHash,
    startedAt: now,
    updatedAt: now,
    reviewer: { name: "", credentials: "" },
    records: Object.fromEntries(caseIds.map((caseId) => [caseId, emptyRecord(caseId)])),
    events: [],
    attestation: null,
  };
}

export const timingByDisposition: Record<Disposition, ActionTiming[]> = {
  SELF_CARE: ["SELF_CARE_ONLY"],
  ASYNC_PHYSICIAN: ["ASYNC_SAME_DAY", "ASYNC_ROUTINE"],
  SAME_DAY_IN_PERSON: ["SAME_DAY_IN_PERSON"],
  EMERGENCY_NOW: ["EMERGENCY_NOW"],
};

function effectiveTiming(draft: JudgmentDraft): ActionTiming | "" {
  const options = draft.disposition ? timingByDisposition[draft.disposition] : [];
  // The route itself defines these timings. Never guess between async options
  // or replace an explicitly contradictory timing in a restored record.
  return draft.actionTiming || (options.length === 1 ? options[0] : "");
}

export function validateJudgment(draft: JudgmentDraft): string[] {
  const errors: string[] = [];
  const parsed = DraftSchema.safeParse(draft);
  if (!parsed.success) return ["Check the review fields: text must be within 4,000 characters and choices must be valid."];
  const timing = effectiveTiming(draft);
  if (!draft.disposition) errors.push("Choose a disposition.");
  if (draft.disposition === "ASYNC_PHYSICIAN" && !timing) errors.push("Choose same-day or routine physician review.");
  if (draft.disposition && timing && !timingByDisposition[draft.disposition].includes(timing)) {
    errors.push("The action timing must match the selected disposition.");
  }
  if (draft.clinicalRationale.trim().length < 8) errors.push("Give a short reason for this route (at least 8 characters).");
  return errors;
}

export function judgmentFromDraft(draft: JudgmentDraft): ClinicalJudgment {
  const errors = validateJudgment(draft);
  if (errors.length > 0) throw new Error(errors.join(" "));
  return JudgmentSchema.parse({ ...draft, actionTiming: effectiveTiming(draft), formVersion: FOCUSED_REVIEW_FORM_VERSION });
}

export function comparisonErrors(record: ReviewRecord): string[] {
  const errors: string[] = [];
  if (!record.sourceAssessment) errors.push("Assess the supplied workflow label.");
  if (!record.v0Assessment) errors.push("Assess the V0 route.");
  // Preserve validation of historical records. The concise instrument already
  // requires a clinical reason before reveal; it does not demand duplicate prose.
  if ((record.sourceAssessment && !isClinicalAssessment(record.sourceAssessment) && record.sourceAssessment !== "acceptable")
    || (record.v0Assessment && !isClinicalAssessment(record.v0Assessment) && record.v0Assessment !== "safe_and_appropriate")) {
    if (record.comparisonNotes.trim().length < 12) errors.push("Explain the disagreement, uncertainty, or safety concern.");
  }
  return errors;
}

export type ReviewStatus = "not_started" | "in_progress" | "independent_locked" | "complete";

export function recordStatus(record: ReviewRecord): ReviewStatus {
  if (record.completedAt) return "complete";
  if (record.blindCommittedAt) return "independent_locked";
  if (Object.values(record.draft).some((value) => value !== "")) return "in_progress";
  return "not_started";
}

export function appendEvent(workspace: ReviewWorkspace, caseId: string | null, action: ReviewEvent["action"], at: string): ReviewWorkspace {
  return {
    ...workspace,
    updatedAt: at,
    events: [...workspace.events, { sequence: workspace.events.length + 1, caseId, action, at }],
    attestation: action === "attestation_signed" ? workspace.attestation : null,
  };
}

export function summarizeWorkspace(workspace: ReviewWorkspace, cases: EvaluationCase[]) {
  const records = cases.map(({ id }) => workspace.records[id]).filter(Boolean);
  const complete = records.filter((record) => recordStatus(record) === "complete");
  const independentLocked = records.filter((record) => recordStatus(record) === "independent_locked");
  const inProgress = records.filter((record) => recordStatus(record) === "in_progress");
  const exactSourceMatches = complete.filter((record) => {
    const source = cases.find(({ id }) => id === record.caseId);
    return source && record.finalJudgment
      ? toLegacyDisposition(record.finalJudgment.disposition) === source.suppliedDisposition
      : false;
  }).length;
  const exactV0Matches = complete.filter((record) => {
    const source = cases.find(({ id }) => id === record.caseId);
    return source && record.finalJudgment?.disposition === source.v0.disposition;
  }).length;
  return {
    total: cases.length,
    independentSourceMatches: complete.filter((record) => {
      const row = cases.find(({ id }) => id === record.caseId);
      return row && record.blindJudgment && toLegacyDisposition(record.blindJudgment.disposition) === row.suppliedDisposition;
    }).length,
    independentV0Matches: complete.filter((record) => {
      const row = cases.find(({ id }) => id === record.caseId);
      return row && record.blindJudgment?.disposition === row.v0.disposition;
    }).length,
    complete: complete.length,
    independentLocked: independentLocked.length,
    inProgress: inProgress.length,
    notStarted: cases.length - complete.length - independentLocked.length - inProgress.length,
    revisedAfterReveal: complete.filter((record) => record.postRevealRevisedAt).length,
    uncertaintyRecorded: complete.filter((record) => record.blindJudgment?.evidenceSufficiency).length,
    uncertainReference: complete.filter((record) => ["borderline", "insufficient"].includes(record.blindJudgment?.evidenceSufficiency ?? "")).length,
    possibleUndertriage: complete.filter((record) => record.sourceAssessment === "possible_undertriage").length,
    possibleOvertriage: complete.filter((record) => record.sourceAssessment === "possible_overtriage").length,
    ambiguousSource: complete.filter((record) => record.sourceAssessment === "ambiguous").length,
    underspecifiedSource: complete.filter((record) => record.sourceAssessment === "action_timing_underspecified").length,
    sourceVerdicts: summarizeAssessments(complete.map((record) => record.sourceAssessment)),
    v0Verdicts: summarizeAssessments(complete.map((record) => record.v0Assessment)),
    exactSourceMatches,
    exactV0Matches,
    attested: Boolean(workspace.attestation),
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]));
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value), null, 2);
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createExportEnvelope(workspace: ReviewWorkspace, dataset: DatasetIdentity, exportedAt = new Date().toISOString()) {
  const payload = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt,
    provenance: {
      datasetVersion: dataset.version,
      sourceHash: dataset.sourceHash,
      referenceProposalHash: dataset.referenceProposalHash,
      predictionHash: dataset.predictionHash,
      synthetic: true as const,
    },
    workspace,
  };
  return {
    ...payload,
    integrity: { algorithm: "SHA-256" as const, digest: await sha256(stableStringify(payload)) },
  };
}

function hasEvent(workspace: ReviewWorkspace, action: ReviewEvent["action"], caseId: string | null, at: string): boolean {
  return workspace.events.some((event) => event.action === action && event.caseId === caseId && event.at === at);
}

function validateWorkspaceSemantics(workspace: ReviewWorkspace): void {
  workspace.events.forEach((event, index) => {
    if (event.sequence !== index + 1) throw new Error("The review event sequence is invalid.");
    if (event.caseId && !workspace.records[event.caseId]) throw new Error("The review event references an unknown case.");
  });

  for (const [caseId, record] of Object.entries(workspace.records)) {
    if (record.caseId !== caseId) throw new Error(`The review record identity is inconsistent for ${caseId}.`);
    for (const judgment of [record.blindJudgment, record.finalJudgment]) {
      if (judgment && validateJudgment(judgment).length > 0) throw new Error(`The locked judgment is incomplete or inconsistent for ${caseId}.`);
    }
    const locked = Boolean(record.blindJudgment && record.blindCommittedAt);
    if (record.comparisonEvidence && (!locked || Date.parse(record.comparisonEvidence.recordedAt) < Date.parse(record.blindCommittedAt!)
      || new Set(record.comparisonEvidence.sourceIds).size !== record.comparisonEvidence.sourceIds.length)) {
      throw new Error(`Evidence context cannot precede an independent judgment or duplicate sources for ${caseId}.`);
    }
    if (Boolean(record.blindJudgment) !== Boolean(record.blindCommittedAt)) {
      throw new Error(`The blind judgment state is inconsistent for ${caseId}.`);
    }
    if ((record.finalJudgment || record.postRevealRevisedAt || record.sourceAssessment || record.v0Assessment || record.comparisonNotes || record.completedAt) && !locked) {
      throw new Error(`The revealed review state exists without a blind judgment for ${caseId}.`);
    }
    if (record.blindCommittedAt && !hasEvent(workspace, "blind_judgment_committed", caseId, record.blindCommittedAt)) {
      throw new Error(`The blind judgment event is missing for ${caseId}.`);
    }
    if (record.postRevealRevisedAt && (!record.finalJudgment || !hasEvent(workspace, "post_reveal_judgment_revised", caseId, record.postRevealRevisedAt))) {
      throw new Error(`The post-reveal revision event is missing for ${caseId}.`);
    }
    if (record.completedAt) {
      if (!record.finalJudgment || comparisonErrors(record).length > 0) {
        throw new Error(`The completed review is incomplete for ${caseId}.`);
      }
      if (!hasEvent(workspace, "case_completed", caseId, record.completedAt)) {
        throw new Error(`The completion event is missing for ${caseId}.`);
      }
    }
  }

  if (workspace.attestation) {
    const reviewerName = workspace.reviewer.name.trim();
    if (!reviewerName || !workspace.reviewer.credentials.trim()) throw new Error("The attested review is missing reviewer identity.");
    if (workspace.attestation.reviewerName !== reviewerName || ![ATTESTATION_STATEMENT, LEGACY_ATTESTATION_STATEMENT].includes(workspace.attestation.statement)) {
      throw new Error("The review attestation does not match the accountable reviewer and statement.");
    }
    if (Object.values(workspace.records).some((record) => !record.completedAt)) {
      throw new Error("The review was attested before every case was completed.");
    }
    if (!hasEvent(workspace, "attestation_signed", null, workspace.attestation.signedAt)) {
      throw new Error("The attestation event is missing.");
    }
  }
}

function validateWorkspaceInventory(candidate: unknown, expectedDataset: DatasetIdentity, caseIds: string[]): ReviewWorkspace {
  const workspace = ReviewWorkspaceSchema.parse(candidate);
  if (workspace.datasetVersion !== expectedDataset.version
    || workspace.datasetHash !== expectedDataset.sourceHash
    || workspace.referenceProposalHash !== expectedDataset.referenceProposalHash
    || workspace.predictionHash !== expectedDataset.predictionHash) {
    throw new Error("The review belongs to different source, proposal, or V0 artifacts.");
  }
  const expected = [...caseIds].sort();
  const actual = Object.keys(workspace.records).sort();
  if (stableStringify(expected) !== stableStringify(actual)) throw new Error("The review case inventory does not match this dataset.");
  validateWorkspaceSemantics(workspace);
  return workspace;
}

function rejectOversizedPayload(raw: string): void {
  if (new TextEncoder().encode(raw).byteLength > MAX_IMPORT_BYTES) {
    throw new Error(`The review bundle exceeds the ${MAX_IMPORT_BYTES / (1024 * 1024)} MiB import limit.`);
  }
}

export function parseStoredWorkspace(raw: string, expectedDataset: DatasetIdentity, caseIds: string[]): ReviewWorkspace {
  rejectOversizedPayload(raw);
  return validateWorkspaceInventory(migrateLegacyWorkspace(JSON.parse(raw) as unknown, expectedDataset), expectedDataset, caseIds);
}

export async function parseImportedWorkspace(raw: string, expectedDataset: DatasetIdentity, caseIds: string[]): Promise<ReviewWorkspace> {
  rejectOversizedPayload(raw);
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || !("workspace" in parsed)) {
    throw new Error("Import an audit bundle exported by this review instrument.");
  }
  const envelope = parsed as { workspace: unknown; integrity?: { algorithm?: string; digest?: string } };
  if (!envelope.integrity || envelope.integrity.algorithm !== "SHA-256" || !envelope.integrity.digest) {
    throw new Error("The export is missing its integrity digest.");
  }
  const { integrity: _integrity, ...payload } = parsed as Record<string, unknown>;
  const actual = await sha256(stableStringify(payload));
  if (actual !== envelope.integrity.digest) throw new Error("The export integrity digest does not match.");
  const migrated = migrateLegacyEnvelope(parsed, expectedDataset);
  const validated = ExportEnvelopeSchema.parse(migrated);
  if (validated.provenance.datasetVersion !== expectedDataset.version
    || validated.provenance.sourceHash !== expectedDataset.sourceHash
    || validated.provenance.referenceProposalHash !== expectedDataset.referenceProposalHash
    || validated.provenance.predictionHash !== expectedDataset.predictionHash) {
    throw new Error("The review bundle belongs to different source, proposal, or V0 artifacts.");
  }
  return validateWorkspaceInventory(validated.workspace, expectedDataset, caseIds);
}

function protectSpreadsheetCell(value: string): string {
  const trimmed = value.trimStart();
  return /^[=+\-@]/.test(trimmed) ? `'${value}` : value;
}

function csvCell(value: unknown): string {
  const text = protectSpreadsheetCell(String(value ?? ""));
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function workspaceCsv(workspace: ReviewWorkspace, cases: EvaluationCase[]): string {
  const headers = [
    "case_id", "review_status", "clinician_disposition", "action_timing", "confidence", "evidence_sufficiency",
    "decisive_evidence", "clinical_rationale", "must_not_miss", "missing_information", "risk_if_wrong",
    "supplied_disposition", "source_assessment", "v0_disposition", "v0_assessment", "comparison_notes",
    "blind_committed_at", "post_reveal_revised_at", "completed_at",
    "pre_reveal_disposition", "pre_reveal_action_timing", "pre_reveal_clinical_rationale", "primary_evaluation_eligible",
    "pre_reveal_evidence_sufficiency", "pre_reveal_form_version", "post_reveal_form_version",
    "comparison_form_version", "evidence_version", "evidence_catalog_sha256", "evidence_message_sha256", "link_report_sha256", "source_ids", "evidence_context_recorded_at",
    "safety_review_version", "safety_review_sha256",
  ];
  const rows = cases.map((reviewCase) => {
    const record = workspace.records[reviewCase.id];
    const judgment = record.finalJudgment;
    return [
      reviewCase.id, recordStatus(record), judgment?.disposition, judgment?.actionTiming, judgment?.confidence,
      judgment?.evidenceSufficiency, judgment?.decisiveEvidence, judgment?.clinicalRationale, judgment?.mustNotMiss,
      judgment?.missingInformation, judgment?.riskIfWrong, reviewCase.suppliedDisposition, record.sourceAssessment,
      reviewCase.v0.disposition, record.v0Assessment, record.comparisonNotes, record.blindCommittedAt,
      record.postRevealRevisedAt, record.completedAt,
      record.blindJudgment?.disposition, record.blindJudgment?.actionTiming, record.blindJudgment?.clinicalRationale,
      Boolean(record.completedAt && record.blindJudgment),
      record.blindJudgment?.evidenceSufficiency, record.blindJudgment?.formVersion, record.finalJudgment?.formVersion,
      record.comparisonEvidence?.formVersion, record.comparisonEvidence?.evidenceVersion, record.comparisonEvidence?.catalogHash,
      record.comparisonEvidence?.messageHash, record.comparisonEvidence?.reportHash, record.comparisonEvidence?.sourceIds.join("|"), record.comparisonEvidence?.recordedAt,
      record.comparisonEvidence?.safetyReviewVersion, record.comparisonEvidence?.safetyReviewHash,
    ].map(csvCell).join(",");
  });
  return `${headers.join(",")}\n${rows.join("\n")}\n`;
}
