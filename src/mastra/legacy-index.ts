// Historical experiments only. The active product/Studio entrypoint is index.ts.
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Mastra } from "@mastra/core/mastra";
import { MastraCompositeStore } from "@mastra/core/storage";
import { DuckDBStore } from "@mastra/duckdb";
import { LibSQLStore } from "@mastra/libsql";
import { MastraStorageExporter, Observability } from "@mastra/observability";
import { exactDispositionScorer, hardGateIntegrityScorer } from "./scorers/disposition.ts";
import { clinicalHandoffContractScorer, clinicalHandoffCriterionScorers } from "./scorers/clinical-handoff.ts";
import { clinicalIntakeAgent } from "./agents/clinical-intake-agent.ts";
import { guidelineRetrieverTool } from "./tools/guideline-retriever.ts";
import { intentHistoryTool } from "./tools/intent-history.ts";
import { redFlagChecklistTool } from "./tools/red-flag-checklist.ts";
import { counselDispositionWorkflow } from "./workflows/disposition-workflow.ts";
import { counselClinicalIntakeWorkflow } from "./workflows/clinical-intake-workflow.ts";
import { qualityJudges } from "./agents/quality-judges.ts";
import { counselQualityAuditWorkflow } from "./workflows/quality-audit-workflow.ts";

// Integration tests must not contend with Studio or evaluation processes for
// DuckDB's single-writer lock, or touch the user's saved development traces.
const storageRoot = process.env.COUNSEL_MASTRA_TEST_STORAGE === "isolated"
  ? mkdtempSync(join(tmpdir(), "counselcodex-mastra-test-")) : resolve(".mastra");
mkdirSync(storageRoot, { recursive: true, mode: 0o700 });

const primaryStorage = new LibSQLStore({
  id: "counselcodex-primary",
  url: `file:${join(storageRoot, "counselcodex.db")}`,
});
const analyticsStorage = new DuckDBStore({
  id: "counselcodex-observability",
  path: join(storageRoot, "observability.duckdb"),
  memoryLimit: "512MB",
  threads: 2,
});
const storage = new MastraCompositeStore({
  id: "counselcodex-storage",
  default: primaryStorage,
  domains: {
    // Raw workflow inputs are not persisted. Durable resume requires a separately
    // approved encrypted/tokenized store and a retention policy.
    workflows: false,
    observability: analyticsStorage.observability,
  },
});

export const SENSITIVE_FIELDS = [
  "password", "token", "secret", "key", "apikey", "auth", "authorization", "bearer",
  "bearertoken", "jwt", "credential", "clientsecret", "privatekey", "refresh", "ssn",
  "message", "originalmessage", "patientmessage", "patientid", "caseid", "memberid", "mrn",
  "dateofbirth", "dob", "email", "phone", "address", "content", "turns", "transcript",
  "summary", "differential", "questions", "uncertainties", "sources", "text", "quote", "rationale", "episodeid", "sourceid", "decisionsourceid",
];

export const observability = new Observability({
  sensitiveDataFilter: { sensitiveFields: SENSITIVE_FIELDS, redactionStyle: "full" },
  configs: {
    default: {
      serviceName: "counselcodex-local",
      exporters: [new MastraStorageExporter()],
      includeInternalSpans: false,
      serializationOptions: { maxStringLength: 4_096, maxDepth: 8, maxArrayLength: 100, maxObjectKeys: 100 },
      cardinality: { blockUUIDs: true, blockedLabels: ["caseId", "patientId", "memberId", "mrn"] },
      logging: { enabled: true, level: "warn" },
    },
  },
});

export const mastra = new Mastra({
  agents: { clinicalIntakeAgent, ...Object.fromEntries(Object.entries(qualityJudges).map(([id, agent]) => [`quality_${id}`, agent])) },
  workflows: { counselDispositionWorkflow, counselClinicalIntakeWorkflow, counselQualityAuditWorkflow },
  tools: { redFlagChecklistTool, intentHistoryTool, guidelineRetrieverTool },
  scorers: {
    exactDispositionScorer,
    hardGateIntegrityScorer,
    clinicalHandoffContractScorer,
    ...clinicalHandoffCriterionScorers,
  },
  storage,
  observability,
});
