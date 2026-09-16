import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { graphPromptHash } from "../../src/disposition/clinical-graph.ts";
import { productionArtifactFiles } from "../../scripts/candidate-cohort-study.ts";

// Planning only: no model calls, application imports, index opening or key reads.
const path = "outputs/clinical-lift-v23-gui-2026-09-14/phase4-plan.json";
const frozen = JSON.parse(readFileSync("outputs/clinical-lift-v23-cohort-live-2026-09-14/manifest.json", "utf8"));
const summary = JSON.parse(readFileSync("outputs/clinical-lift-v23-cohort-live-2026-09-14/summary.json", "utf8"));
if (summary.results !== 50 || summary.starts !== 50 || summary.unfinishedStarted || summary.unknownUsageAttempts || summary.stopReason) throw new Error("COMPLETED_ACCOUNTED_COHORT_REQUIRED");
const priorAccountedUSD = 51.162824025 + summary.accountedUSD;
const allocationUSD = 18;
if (priorAccountedUSD + allocationUSD > 100) throw new Error("SPRINT_CEILING_EXCEEDED");
const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const buildPaths = productionArtifactFiles();
const sourcePaths = Object.keys(frozen.files).filter(p => !p.startsWith("apps/evaluation/.next/"));
const files = Object.fromEntries([...new Set([...sourcePaths, ...buildPaths, "apps/evaluation/.next/BUILD_ID"])].sort().map(p => [p, hash(readFileSync(p))]));
const promptHash = graphPromptHash(frozen.config);
if (promptHash === frozen.promptHash) throw new Error("POST_COHORT_SCOPE_POLICY_IDENTITY_REQUIRED");
const plan = {
  protocol: "clinical-lift-v23-gui/v4", createdAt: new Date().toISOString(),
  purpose: "Actual GUI after C10 timing admission, C36 exact vital-field repair nomination and build-surface correction. Separate from the frozen full-50 score.",
  endpoint: "http://localhost:4120/candidate", version: "evidence-graph/v23",
  promptHash, previousFrozenPromptHash: frozen.promptHash, config: frozen.config,
  sourceHash: frozen.corpusHash, files,
  casesInOrder: ["C10", "C36", "C02", "C50", "C50-update"],
  cases: ["C10", "C36", "C02", "C50"].map(id => frozen.cases.find((c: {id: string}) => c.id === id)),
  update: { caseId: "C50", message: "It came on gradually, like my usual migraines. No new weakness or trouble speaking." },
  maximumAssessments: 5, allocationUSD, perAssessmentReservationUSD: frozen.reservation.perRunUSD,
  sprintAccountedBeforeThisPhaseUSD: priorAccountedUSD, sprintCeilingUSD: 100,
  authorizationAmendment: "After the $40 frozen cohort completed at $29.84535375 accounted, release its unused reservation. Prospectively allocate $18 of the remaining $18.991822225 sprint capacity to at most five sequential actual-GUI starts, including an attributed symptom update. Separately reserve $0.90 for the offline safety quote-ID study, leaving $0.091822225 unallocated. No new grant or replacement of a failed cohort case is inferred. Existing plans/results remain unchanged.",
  accounting: "Before each start retain the full $8.8164225 reservation. Reconcile known token estimates times 1.25 plus $0.002 per assessment; unknown usage retains full reservation. No external retries or replacements. Stop if remaining allocation cannot cover the next full reservation.",
  checks: ["original message and stale-response clearing", "first emergency instruction and final care", "actual rendered sources and response", "trace and raw-event persistence", "exact current prompt/source identity", "receipt versus validated-publication timing"],
  limitations: "Development software/GUI verification, not a new clinical score or held-out validation. C36 may not recreate the stochastic vital assertion; deterministic historical-packet replay separately tests that exact repair path. HTTP receipts are not paint measurements.",
};
writeFileSync(path, JSON.stringify({ ...plan, fingerprint: hash(JSON.stringify(plan)) }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ path, promptHash, files: Object.keys(files).length, priorAccountedUSD, allocationUSD, maximumTotalWithOtherReservationsUSD: priorAccountedUSD + allocationUSD + 0.90, providerCalls: 0 }));
