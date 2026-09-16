import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createEvidenceSearch, digest } from "../src/evidence/search.ts";

// Public source transport/coverage diagnostic only. No model calls or labels.
const queries = ["acute urinary retention", "sudden vision loss", "ectopic pregnancy"];
const directory = resolve(process.argv[2] ?? "outputs/evidence-search-smoke");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const search = createEvidenceSearch();
const results = [];
for (const query of queries) {
  const start = performance.now();
  const evidence = await search([query], AbortSignal.timeout(8000));
  results.push({ query, durationMs: Math.round(performance.now()-start), evidence });
}
const artifact = { protocol: "public-source-smoke/v1", at: new Date().toISOString(), execution: "public APIs; no model", queriesHash: digest(queries), clinicalLift: "not assessed", results };
const path = join(directory, `${Date.now()}.json`);
writeFileSync(path, JSON.stringify(artifact, null, 2), { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ path, results: results.map((r) => ({ query: r.query, durationMs: r.durationMs, passages: r.evidence.passages.length, sources: r.evidence.passages.map((p) => ({ id: p.id, kind: p.kind, linkStatus: p.linkStatus })), audit: r.evidence.audit })) }, null, 2));
