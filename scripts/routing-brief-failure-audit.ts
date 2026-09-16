/** Read-only CLI. Emits diagnostics to stdout; never writes study artifacts. */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { auditRoutingBriefFailure, ROUTING_BRIEF_FAILURE_AUDIT } from "../src/evaluation/routing-brief-failure-audit.ts";
import { sha256 } from "../src/evidence/rag/model.ts";
import type { SafetyNotice } from "../src/disposition/contract.ts";

type Plan = { node: string; icu: string; files: Record<string, string>;
  contracts?: Record<"full" | "brief", "full" | "brief">;
  schedule: { id: string; arm: "full" | "brief" }[];
  cases: { id: string; message: string; issued: SafetyNotice[]; sources: { id: string; text: string }[] }[] };

export function readRoutingBriefFailureAudit(directory: string) {
  const inputHashes: Record<string, string> = {};
  function read(path: string): unknown {
    const bytes = readFileSync(path); inputHashes[path] = sha256(bytes); return JSON.parse(bytes.toString("utf8"));
  }
  const plan = read(join(directory, "plan.json")) as Plan;
  if (plan.node !== process.version || plan.icu !== process.versions.icu) throw new Error("QUOTE_SPAN_RUNTIME_CHANGED");
  if (new Set(plan.schedule.map(s => `${s.id}-${s.arm}`)).size !== plan.schedule.length) throw new Error("DUPLICATE_AUDIT_SLOT");
  const rows = plan.schedule.map(slot => {
    if (!/^C\d{2}$/.test(slot.id) || !["full", "brief"].includes(slot.arm)) throw new Error("INVALID_AUDIT_SLOT");
    const c = plan.cases.find(c => c.id === slot.id);
    if (!c) throw new Error("AUDIT_CASE_BINDING_MISSING");
    const resultPath = join(directory, `${slot.id}-${slot.arm}-result.json`), evaluationPath = join(directory, `${slot.id}-${slot.arm}-evaluation.json`);
    const resultPresent = existsSync(resultPath), evaluationPresent = existsSync(evaluationPath);
    const readErrors: { path: string; failure: string }[] = [];
    function optional(path: string, present: boolean): Record<string, unknown> | null {
      if (!present) return null;
      try { const value = read(path); return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
      catch { readErrors.push({ path, failure: "UNREADABLE_ARTIFACT_AT_SNAPSHOT" }); return null; }
    }
    const result = optional(resultPath, resultPresent), evaluation = optional(evaluationPath, evaluationPresent);
    if (evaluation && (evaluation.id !== slot.id || evaluation.arm !== slot.arm)) throw new Error("EVALUATION_SLOT_MISMATCH");
    const execution = result?.execution as { output?: unknown; failure?: string | null } | undefined;
    return { ...slot, resultPresent, evaluationPresent, readErrors,
      audit: result || evaluation ? auditRoutingBriefFailure({ arm: slot.arm, contract: plan.contracts?.[slot.arm], patient: c.message, issued: c.issued,
        sources: c.sources, execution: execution ?? null, evaluation }) : null };
  });
  const changedFrozenFiles = Object.entries(plan.files).filter(([path, hash]) => !existsSync(path) || sha256(readFileSync(path)) !== hash).map(([path]) => path);
  const snapshotChangedFiles = Object.entries(inputHashes).filter(([path, hash]) => sha256(readFileSync(path)) !== hash).map(([path]) => path);
  return { protocol: ROUTING_BRIEF_FAILURE_AUDIT, sourceDirectory: resolve(directory), observedAt: new Date().toISOString(),
    scheduledSlots: rows.length, availableResults: rows.filter(r => r.resultPresent).length,
    availableEvaluations: rows.filter(r => r.evaluationPresent).length, inputHashes, changedFrozenFiles, snapshotChangedFiles,
    rows, clinicalApproval: false, patientAdvicePublished: false, originalEligibilityChanged: false, originalScoresChanged: false,
    interpretation: "Partial-study snapshot and failure taxonomy only. Raw typed intent can exist despite whole-response rejection. No repair, new eligibility, physician-reference score, or semantic safety assessment is performed." };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [directory] = process.argv.slice(2);
  if (!directory) throw new Error("Usage: routing-brief-failure-audit.ts STUDY_DIRECTORY (stdout only)");
  console.log(JSON.stringify(readRoutingBriefFailureAudit(directory), null, 2));
}
