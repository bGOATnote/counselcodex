/** Offline, no environment keys, model runtime, retrieval or HTTP invocation. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readPhysicianReference } from "../src/evaluation/physician-cohort.ts";
import { scoreV25PathB, type PathBAttemptAdmission } from "../src/evaluation/v25-path-b.ts";
import { projectRoutingBoundary, compareProjectedRoute, ROUTING_BOUNDARY_ABLATION } from "../src/evaluation/routing-boundary-ablation.ts";
import { sha256 } from "../src/evidence/rag/model.ts";
import type { DispositionRun } from "../src/disposition/contract.ts";

const GOLD = "data/evaluation/physician-system-reference-v2.json";
const CSV = "data/patient_messages.csv";
const code = ["scripts/routing-boundary-ablation.ts", "src/evaluation/routing-boundary-ablation.ts",
  "src/evaluation/v25-path-b.ts", "src/evaluation/physician-cohort.ts", "src/disposition/graph-output.ts",
  "src/disposition/gates-release.ts", "src/disposition/contract.ts", "src/disposition/routing-policy.ts",
  "src/disposition/care-setting.ts", "src/evidence/rag/selection.ts"];

export function runRoutingBoundaryAblation(source: string, output: string) {
  if (existsSync(output)) throw new Error("NEW_OUTPUT_DIRECTORY_REQUIRED");
  const hashes: Record<string, string> = {};
  function read(path: string) { const text = readFileSync(path, "utf8"); hashes[path] = sha256(text); return text; }
  code.forEach(read);
  const reference = readPhysicianReference(read(GOLD), read(CSV));
  const admission = JSON.parse(read(join(source, "runtime/attempt-admission.json"))) as PathBAttemptAdmission[];
  if (admission.length !== 50 || new Set(admission.map(a => a.id)).size !== 50
    || reference.cases.some(c => !admission.some(a => a.id === c.id))) throw new Error("EXACT_50_FIRST_ATTEMPTS_REQUIRED");
  const original = JSON.parse(read(join(source, "scorecard.json"))).pathB;
  const runs = admission.map(a => {
    if (!a.runId || !/^[a-f0-9-]{36}$/.test(a.runId)) throw new Error("SAVED_RUN_ID_REQUIRED");
    return JSON.parse(read(join(source, "runtime/diagnostic-runs", `${a.runId}.json`))) as DispositionRun;
  });
  const promptHash = runs[0].promptHash;
  const baseline = scoreV25PathB(reference, runs, promptHash, admission);
  if (JSON.stringify(baseline) !== JSON.stringify(original)) throw new Error("BASELINE_REPLAY_DRIFT");
  const cases = reference.cases.map(c => {
    const a = admission.find(a => a.id === c.id)!, run = runs.find(r => r.runId === a.runId)!;
    // Projection takes no reference label, case ID or original CSV label.
    const projected = projectRoutingBoundary(run, { message: c.message, promptHash }, a);
    const route = projected.proposal?.route ?? null;
    return { id: c.id, runId: run.runId, acceptedRoutes: c.reference.acceptedRoutes,
      historicalComplete: baseline.cases.find(b => b.id === c.id)!.complete_gates_only,
      projection: projected, comparison: compareProjectedRoute(route, c.reference.acceptedRoutes),
      rawDraftDiagnostic: compareProjectedRoute(projected.draftRouteDiagnosticOnly, c.reference.acceptedRoutes) };
  });
  const proposals = cases.filter(c => c.projection.eligibleProjection);
  const eligible = proposals.filter(c => c.acceptedRoutes !== null);
  const raw = cases.filter(c => c.acceptedRoutes !== null && c.projection.draftRouteDiagnosticOnly !== null);
  const agreement = eligible.filter(c => c.comparison.agreement).length;
  const report = { protocol: ROUTING_BOUNDARY_ABLATION, source: resolve(source), frozenBaseline: baseline,
    projectionAvailability: { numerator: proposals.length, denominator: cases.length },
    projectedRouteAgreement: { numerator: agreement, denominator: eligible.length,
      definition: "Counterfactual typed-route proposals with non-null physician reference; NOT complete responses or clinical validation." },
    projectedAgreementCoverage: { numerator: agreement, denominator: reference.cases.filter(c => c.reference.acceptedRoutes !== null).length },
    rawDraftAgreementDiagnosticOnly: { numerator: raw.filter(c => c.rawDraftDiagnostic.agreement).length, denominator: raw.length },
    projectedUnderCaseIds: eligible.filter(c => c.comparison.deviation === "under").map(c => c.id),
    projectedOverCaseIds: eligible.filter(c => c.comparison.deviation === "over").map(c => c.id),
    newlyProjectedCaseIds: proposals.filter(c => !c.historicalComplete).map(c => c.id),
    originalFailedCheckCounts: Object.fromEntries([...new Set(cases.flatMap(c => c.projection.originalFailedChecks))]
      .map(id => [id, cases.filter(c => c.projection.originalFailedChecks.includes(id)).length])),
    zeroCitationCaseIds: cases.filter(c => c.projection.citationCount === 0).map(c => c.id),
    newProviderCalls: 0, apiSpendUSD: 0, newLatencyMs: null, newClinicalReleases: 0,
    unsafe_advice: "not_assessed", unsupported_claims: "not_assessed",
    limitations: "Full saved drafts already existed; this does not measure a smaller prompt, latency/cost lift, semantic safety, or clinical correctness. Optional prose is omitted, NOT approved. Original failures, calls and latency remain unchanged. C25 excluded; C04 delivery failure retained. Known development cohort, not held-out.",
    cases };
  for (const [p, h] of Object.entries(hashes)) if (sha256(readFileSync(p, "utf8")) !== h) throw new Error(`INPUT_CHANGED:${p}`);
  mkdirSync(output, { recursive: false });
  const write = (name: string, value: unknown) => writeFileSync(join(output, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
  write("manifest.json", { protocol: ROUTING_BOUNDARY_ABLATION, createdAt: new Date().toISOString(), inputsAndCodeSha256: hashes, paidCalls: 0 });
  write("report.json", report);
  const rows = cases.map(c => `| ${c.id} | ${c.historicalComplete ? "Complete" : "Not complete"} | ${c.projection.proposal?.route ?? "Unavailable"} | ${c.acceptedRoutes === null ? "Excluded: null reference" : c.comparison.agreement === null ? "Not eligible" : c.comparison.agreement ? "Agrees" : c.comparison.deviation} | ${c.projection.blocked.join(", ") || "—"} | ${c.projection.originalFailedChecks.join(", ") || "—"} |`);
  writeFileSync(join(output, "cases.md"), "# Offline typed-route projection — not live releases\n\nUnsafe advice and unsupported claims remain **not_assessed** for every row. No generated clinical prose is republished.\n\n| Case | Historical outcome | Projected route | Reference comparison | Projection blocker | Original failed checks (retained) |\n|---|---|---|---|---|---|\n" + rows.join("\n") + "\n", { flag: "wx" });
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [source, output] = process.argv.slice(2);
  if (!source || !output) throw new Error("Usage: routing-boundary-ablation.ts SAVED_V25_COHORT NEW_OUTPUT_DIRECTORY");
  const r = runRoutingBoundaryAblation(source, output);
  console.log(JSON.stringify({ output, availability: r.projectionAvailability, agreement: r.projectedRouteAgreement,
    rawDiagnostic: r.rawDraftAgreementDiagnosticOnly, under: r.projectedUnderCaseIds, over: r.projectedOverCaseIds, paidCalls: 0 }));
}
