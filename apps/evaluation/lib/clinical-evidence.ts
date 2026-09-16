import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { clinicalBriefs, clinicalSources, EVIDENCE_DATASET_SHA256, EVIDENCE_VERSION } from "./evidence-catalog.ts";
import type { EvidencePacket, SourceLinkCheck } from "./evidence-contract.ts";
import { parseCsv } from "./source-csv.ts";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const messageBytes = readFileSync(resolve(repoRoot, "data/patient_messages.csv"));
const boundMessages = hash(messageBytes) === EVIDENCE_DATASET_SHA256
  ? new Map(parseCsv(messageBytes.toString()).map((row) => [row.id, row.message])) : new Map<string, string>();
const registryHash = hash(JSON.stringify(clinicalSources));
const catalogHash = hash(JSON.stringify({ version: EVIDENCE_VERSION, dataset: EVIDENCE_DATASET_SHA256, clinicalSources, clinicalBriefs }));
const directory = resolve(repoRoot, "docs/research/link-checks");
let checks = new Map<string, SourceLinkCheck>();
let reportHash: string | null = null;
try {
  for (const file of readdirSync(directory).filter((name) => /^\d{4}-.*\.json$/.test(name)).sort().reverse()) {
    const bytes = readFileSync(resolve(directory, file));
    const report = JSON.parse(bytes.toString());
    if (report.schemaVersion !== "source-link-check/v1" || report.sourceRegistryHash !== registryHash) continue;
    const valid = Array.isArray(report.checks) && report.checks.length === clinicalSources.length
      && report.checks.every((check: SourceLinkCheck) => clinicalSources.some((source) => source.id === check.sourceId && source.url === check.requestedUrl) && typeof check.status === "string" && Number.isFinite(Date.parse(check.checkedAt)) && check.claimSupportVerified === false)
      && new Set(report.checks.map((check: SourceLinkCheck) => check.sourceId)).size === clinicalSources.length;
    if (!valid) continue;
    checks = new Map(report.checks.map((check: SourceLinkCheck) => [check.sourceId, check]));
    reportHash = hash(bytes);
    break;
  }
} catch { /* No usable check report: expose "not checked", never a green badge. */ }

export function evidenceForCase(caseId: string, datasetHash: string, message: string): EvidencePacket | null {
  if (datasetHash !== EVIDENCE_DATASET_SHA256 || boundMessages.get(caseId) !== message) return null;
  const brief = clinicalBriefs.find((item) => item.caseId === caseId);
  if (!brief) return null;
  return {
    ...brief, version: EVIDENCE_VERSION, catalogHash, sourceDatasetHash: datasetHash,
    messageHash: hash(message), reportHash,
    sources: brief.sourceIds.map((id) => {
      const source = clinicalSources.find((item) => item.id === id);
      if (!source) throw new Error(`Missing clinical source: ${id}`);
      return { ...source, linkCheck: checks.get(id) ?? null };
    }),
  };
}
