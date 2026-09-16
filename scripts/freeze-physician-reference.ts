import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseCsv } from "../src/lib/csv.mjs";
import { sha256 } from "../src/evidence/rag/model.ts";
import { operationalRoute } from "../src/disposition/routing-policy.ts";
import type { DispositionRun } from "../src/disposition/contract.ts";

const output = resolve(process.argv[2] ?? "data/evaluation/physician-system-reference-v2.json");
const authorityPath = "data/evaluation/physician-development-review-2026-09-13.json";
const authorityRaw = readFileSync(authorityPath, "utf8"), authority = JSON.parse(authorityRaw);
const csv = readFileSync("data/patient_messages.csv", "utf8");
if (sha256(csv) !== authority.scope.datasetSha256) throw new Error("PHYSICIAN_DATASET_CHANGED");
const cases = parseCsv(csv) as { id: string; message: string; disposition: string }[];
const directory = "apps/evaluation/.local/disposition-agent-v3/runs";
const all = readdirSync(directory).filter(p => p.endsWith(".json")).map(p => {
  const path = join(directory, p), raw = readFileSync(path, "utf8");
  return { path, rawHash: sha256(raw), run: JSON.parse(raw) as DispositionRun };
});
// Freeze the latest issued recommendation before the designation, not the
// best answer. Later no-answer failures are retained, not used as a medical label.
const rows = cases.map(c => {
  const matches = all.filter(a => a.run.message === c.message && a.run.completedAt <= authority.recordedAt)
    .sort((a,b) => b.run.completedAt.localeCompare(a.run.completedAt) || a.run.runId.localeCompare(b.run.runId));
  const record = matches.find(a => a.run.answer || a.run.safetyFloor);
  if (!record) throw new Error(`MISSING_RECORDED_CASE_${c.id}`);
  const r = record.run;
  if (r.inputHash !== sha256(c.message)) throw new Error(`INPUT_HASH_MISMATCH_${c.id}`);
  const referenceRoute = r.answer ? operationalRoute(r.answer) : r.safetyFloor?.disposition ?? null;
  const legacyAsync = r.answer?.disposition === "ASYNC_PHYSICIAN" && !referenceRoute;
  return { id: c.id, message: c.message, inputHash: r.inputHash, originalSuppliedLabel: c.disposition,
    reference: { acceptedRoutes: c.id === "C25" ? null : legacyAsync ? ["PRIORITY_ASYNC", "STANDARD_ASYNC"] : referenceRoute ? [referenceRoute] : null,
      status: c.id === "C25" ? "physician_qualified_disagreement" : "physician_designated_system_reference",
      prioritySpecific: !legacyAsync, note: c.id === "C25" ? "Physician questioned emergency escalation; either interpretation was considered arguable. Report separately; do not score as a definite right/wrong route." : legacyAsync ? "Stored response predates explicit async priority; do not invent a priority annotation." : null },
    laterNoAnswerAttempts: matches.filter(a => a.run.completedAt > r.completedAt).map(a => ({runId:a.run.runId,path:a.path,sha256:a.rawHash,status:a.run.status,completedAt:a.run.completedAt})),
    incumbent: { path: record.path, artifactSha256: record.rawHash, runId: r.runId, completedAt: r.completedAt,
      workflowVersion: r.adaptive?.version ?? r.profile ?? r.version, status: r.status,
      answer: r.answer, safetyFloor: r.safetyFloor ?? null, responseEvents: r.responseEvents ?? [],
      durationMs: r.durationMs, firstActionMs: r.firstActionMs ?? null, firstPatientReplyMs: r.firstPatientReplyMs ?? null },
  };
});
const reference = { version: "physician-designated-system-reference/v1", createdAt: new Date().toISOString(),
  authority: { path: authorityPath, sha256: sha256(authorityRaw), statement: authority.authority.statement,
    reaffirmed: "The physician explicitly directed use of the existing GUI, shaped through a week of review, as the reference cohort." },
  selection: "Latest recorded exact-input issued incumbent recommendation at or before physician designation, including failure-preserved safety instructions. Later no-answer failures are retained separately, not converted into a clinical label. Chronological reconstruction, not proof of which exact run was viewed. No future/candidate output used.",
  scope: "Physician-designated development reference for engineering regression and improvement. Not held-out validation; no fabricated claim-level physician grades. Reference data must never enter candidate prompts or retrieval.",
  datasetSha256: sha256(csv), cases: rows };
mkdirSync(resolve(output, ".."), { recursive: true });
writeFileSync(output, JSON.stringify(reference, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, cases: rows.length, scored: rows.filter(r => r.reference.acceptedRoutes).length,
  incumbentIncomplete: rows.filter(r => r.incumbent.status !== "complete").map(r => r.id),
  unspecifiedPriorities: rows.filter(r => !r.reference.prioritySpecific).map(r => r.id) }));
