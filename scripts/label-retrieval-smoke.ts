import { mkdirSync, writeFileSync } from "node:fs";
import { createEvidenceSearch } from "../src/evidence/search.ts";

// Frozen query pairs; public-source retrieval only, no model calls or labels.
const pairs = [["hypertension", "losartan monitoring"], ["hair loss", "finasteride safety"], ["asthma", "albuterol safety"]];
const results = [];
for (const queries of pairs) for (const medicationLabels of [false, true]) {
  const start = performance.now();
  const evidence = await createEvidenceSearch({ medicationLabels })(queries, AbortSignal.timeout(6000));
  results.push({ queries, medicationLabels, durationMs: Math.round(performance.now() - start), evidence });
}
const directory = "outputs/label-retrieval-browser-repair";
mkdirSync(directory, { recursive: true });
const path = `${directory}/${Date.now()}.json`;
writeFileSync(path, JSON.stringify({ protocol: "medication-source-ablation/v1", at: new Date().toISOString(), clinicalLift: "not assessed; retrieval diagnostic only", results }, null, 2), { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ path, results: results.map(({ queries, medicationLabels, durationMs, evidence }) => ({ queries, medicationLabels, durationMs, sources: evidence.passages.map((p) => ({ title: p.title, kind: p.kind, linkStatus: p.linkStatus })), audit: evidence.audit })) }, null, 2));
