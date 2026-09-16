import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evidenceForCase } from "./clinical-evidence.ts";
import { parseCsv } from "./source-csv.ts";
import { buildResponseSafetyReview } from "../../../src/clinical/response-safety.ts";

import {
  toLegacyDisposition,
  type Disposition,
  type EvaluationCase,
  type LegacyDisposition,
  type ReviewFinding,
} from "./case-contract.ts";

export {
  toLegacyDisposition,
  type Disposition,
  type EvaluationCase,
  type LegacyDisposition,
  type ReviewFinding,
} from "./case-contract.ts";

type CsvRow = Record<string, string>;

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "../..");
const messagesPath = resolve(repoRoot, "data/patient_messages.csv");
const reviewPath = resolve(repoRoot, "data/clinician_development_review.csv");
const predictionsPath = resolve(repoRoot, "outputs/predictions.csv");

function disposition(value: string, source: string): Disposition {
  if (["SELF_CARE", "ASYNC_PHYSICIAN", "SAME_DAY_IN_PERSON", "EMERGENCY_NOW"].includes(value)) {
    return value as Disposition;
  }
  throw new Error(`${source} contains an invalid disposition: ${value}`);
}

function legacyDisposition(value: string, source: string): LegacyDisposition {
  if (["SELF_CARE", "ASYNC_PHYSICIAN", "URGENT_ESCALATION"].includes(value)) return value as LegacyDisposition;
  throw new Error(`${source} contains an invalid supplied disposition: ${value}`);
}

function reviewConfidence(value: string, caseId: string): "high" | "medium" | "low" {
  if (["high", "medium", "low"].includes(value)) return value as "high" | "medium" | "low";
  throw new Error(`reference proposal contains invalid confidence for ${caseId}: ${value}`);
}

function uniqueById(rows: CsvRow[], source: string): Map<string, CsvRow> {
  const result = new Map<string, CsvRow>();
  for (const row of rows) {
    if (!/^C\d{2,4}$/.test(row.id ?? "")) throw new Error(`${source} contains an invalid case id`);
    if (result.has(row.id)) throw new Error(`${source} contains duplicate case ${row.id}`);
    result.set(row.id, row);
  }
  return result;
}

const messageBytes = readFileSync(messagesPath);
const sourceHash = createHash("sha256").update(messageBytes).digest("hex");
const reviewBytes = readFileSync(reviewPath);
const predictionBytes = readFileSync(predictionsPath);
const messages = parseCsv(messageBytes.toString("utf8"));
const reviews = uniqueById(parseCsv(reviewBytes.toString("utf8")), "reference proposal");
const predictions = uniqueById(parseCsv(predictionBytes.toString("utf8")), "V0 predictions");

export const evaluationCases: EvaluationCase[] = messages.map((source, index) => {
  const responseSafety = buildResponseSafetyReview([{ role: "patient", content: source.message }]);
  const review = reviews.get(source.id);
  const prediction = predictions.get(source.id);
  if (!review || !prediction) throw new Error(`evaluation join is incomplete for ${source.id}`);
  const suppliedDisposition = legacyDisposition(source.disposition, "source messages");
  const proposalDisposition = disposition(review.clinician_disposition, "reference proposal");
  const predictedDisposition = disposition(prediction.disposition, "V0 predictions");
  const errorType = review.supplied_label_error_type;
  const finding: ReviewFinding = errorType === "missed_urgent"
    ? "possible_undertriage"
    : errorType === "false_urgent"
      ? "possible_overtriage"
      : "agreement";
  const proposalLegacyDisposition = toLegacyDisposition(proposalDisposition);
  if ((finding === "agreement") !== (suppliedDisposition === proposalLegacyDisposition)) {
    throw new Error(`supplied-label finding is inconsistent for ${source.id}`);
  }
  if (finding === "possible_undertriage"
    && (proposalLegacyDisposition !== "URGENT_ESCALATION" || suppliedDisposition === "URGENT_ESCALATION")) {
    throw new Error(`under-triage finding is inconsistent for ${source.id}`);
  }
  if (finding === "possible_overtriage"
    && (suppliedDisposition !== "URGENT_ESCALATION" || proposalLegacyDisposition === "URGENT_ESCALATION")) {
    throw new Error(`over-triage finding is inconsistent for ${source.id}`);
  }
  return {
    id: source.id,
    ordinal: index + 1,
    message: source.message,
    suppliedDisposition,
    clinicalEvidence: evidenceForCase(source.id, sourceHash, source.message),
    responseSafety,
    responseSafetyHash: createHash("sha256").update(JSON.stringify(responseSafety)).digest("hex"),
    referenceProposal: {
      disposition: proposalDisposition,
      subtype: review.clinician_subtype,
      confidence: reviewConfidence(review.clinician_confidence, source.id),
      rationale: review.clinical_rationale,
      finding,
      harmIfFollowSupplied: review.harm_if_follow_supplied,
    },
    v0: {
      disposition: predictedDisposition,
      subtype: prediction.subtype,
      confidence: prediction.confidence,
      layer: prediction.layer,
      overrideBlocked: prediction.override_blocked === "true",
      redFlags: prediction.red_flags.split("|").filter(Boolean),
      rationale: prediction.rationale,
      patientDirective: prediction.patient_directive,
      matchesReferenceProposal: predictedDisposition === proposalDisposition,
    },
  };
});

if (reviews.size !== messages.length || predictions.size !== messages.length) {
  throw new Error("evaluation inputs contain unjoined cases");
}

export const dataset = {
  version: "counsel-disposition-synthetic-v1-four-level",
  caseCount: evaluationCases.length,
  synthetic: true as const,
  sourceHash: createHash("sha256").update(messageBytes).digest("hex"),
  referenceProposalHash: createHash("sha256").update(reviewBytes).digest("hex"),
  predictionHash: createHash("sha256").update(predictionBytes).digest("hex"),
};

export const proposalSummary = {
  cases: evaluationCases.length,
  suppliedAgreement: evaluationCases.filter(({ referenceProposal }) => referenceProposal.finding === "agreement").length,
  suppliedDisagreements: evaluationCases.filter(({ referenceProposal }) => referenceProposal.finding !== "agreement").length,
  possibleUndertriage: evaluationCases.filter(({ referenceProposal }) => referenceProposal.finding === "possible_undertriage").length,
  possibleOvertriage: evaluationCases.filter(({ referenceProposal }) => referenceProposal.finding === "possible_overtriage").length,
  v0Matches: evaluationCases.filter(({ v0 }) => v0.matchesReferenceProposal).length,
  mediumConfidence: evaluationCases.filter(({ referenceProposal }) => referenceProposal.confidence !== "high").length,
  clinicalPerformanceEstimated: false as const,
};
