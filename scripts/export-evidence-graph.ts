import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { restoreCorpus, sha256 } from "../src/evidence/rag/model.ts";
import { readCorpusBundle } from "../src/evidence/rag/bundle.ts";
import { estimateStudyCost, STUDY_PRICING } from "../src/evaluation/clinical-study-budget.ts";
import type { DispositionRun } from "../src/disposition/contract.ts";

const args = process.argv.slice(2);
function arg(name: string) { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; }
const output = resolve(arg("--output") ?? "outputs/evidence-graph-development-2026-09-13");
const index = resolve(arg("--index") ?? "apps/evaluation/.local/clinical-rag-v7");
const runtime = resolve(arg("--runtime") ?? "apps/evaluation/.local/clinical-evidence-graph-v1");
const benchmark = resolve(arg("--benchmark") ?? "apps/evaluation/.local/rag-benchmark-2026-09-13-v4");
const createdAt = new Date().toISOString();
const save = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
// Fail if a prior export exists: later runs require a new immutable export.
mkdirSync(output, { recursive: false, mode: 0o700 });
for (const dir of ["runs", "retrieval", "corpus"]) mkdirSync(join(output, dir));
const source = JSON.parse(readFileSync(join(index, "corpus.json"), "utf8")), corpus = restoreCorpus(source);
const compressed = gzipSync(JSON.stringify({ version: corpus.version, hash: corpus.hash, documents: corpus.documents, ...(corpus.quarantine ? { quarantine: corpus.quarantine } : {}) }), { level: 9 });
writeFileSync(join(output, "corpus/corpus.json.gz"), compressed, { flag: "wx" });
save(join(output, "corpus/manifest.json"), { version: corpus.quarantine ? "clinical-rag-bundle/v2" : "clinical-rag-bundle/v1", createdAt, file: "corpus.json.gz", sha256: sha256(compressed), corpusHash: corpus.hash, documents: corpus.documents.length, chunks: corpus.chunks.length,
  ...(corpus.quarantine ? { quarantinePolicyHash: corpus.quarantine.policyHash } : {}), scope: "Licensed normalized source sections and provenance, not embeddings or clinical gold labels. Mixed rights: individual source licenses and attributions apply, not a blanket repository license." });
readCorpusBundle(join(output, "corpus/manifest.json"));
writeFileSync(join(output, "corpus/OpenEM-LICENSE-APACHE.txt"), readFileSync(join(index, "sources/OpenEM-LICENSE-APACHE.txt")), { flag: "wx" });
save(join(output, "corpus/attributions.json"), corpus.documents.map(({ sections: _sections, ...d }) => d));
save(join(output, "corpus/ingestion.json"), JSON.parse(readFileSync(join(index, "ingestion.json"), "utf8")));
save(join(output, "corpus/source-fetches.json"), readdirSync(join(index, "sources")).filter(f => f.endsWith(".provenance.json")).sort().map(f => JSON.parse(readFileSync(join(index, "sources", f), "utf8"))));
const runs: DispositionRun[] = readdirSync(join(runtime, "runs")).filter(f => f.endsWith(".json")).map(f => JSON.parse(readFileSync(join(runtime, "runs", f), "utf8"))).sort((a,b) => a.completedAt.localeCompare(b.completedAt));
const identities = new Set<string>();
for (const run of runs) {
  if (run.profile !== "evidence-graph-opus" || !/^[0-9a-f-]{36}$/.test(run.runId) || identities.has(run.runId) || sha256(run.message) !== run.inputHash) throw new Error("INVALID_RUN_IDENTITY");
  identities.add(run.runId); save(join(output, "runs", `${run.runId}.json`), run);
}
for (const name of readdirSync(benchmark).filter(f => /^(?:R\d+-(?:lexical|hybrid|hybrid-graph)|summary)\.json$/.test(f)).sort()) save(join(output, "retrieval", name), JSON.parse(readFileSync(join(benchmark, name), "utf8")));
const costs = runs.map(estimateStudyCost);
const rows = runs.map((r, i) => ({ runId: r.runId, inputHash: r.inputHash, completedAt: r.completedAt, promptHash: r.promptHash, corpusHashes: [...new Set(r.graph?.retrieval.map(x => x.corpusHash))], status: r.status, route: r.answer?.disposition ?? null, priority: r.answer?.reviewPriority ?? null, draftRoute: r.rejectedAnswer && typeof r.rejectedAnswer === "object" && "disposition" in r.rejectedAnswer ? r.rejectedAnswer.disposition : null, earlyAction: r.graph?.safety?.action ?? null, review: r.graph?.judge?.verdict ?? null, corrections: r.graph?.corrections ?? 0, careCorrectionReleased: r.graph?.careCorrectionReleased ?? false, firstActionMs: r.firstActionMs, durationMs: r.durationMs, modelCalls: r.modelCalls, inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, estimatedUSD: costs[i], failedChecks: r.checks.filter(c => c.status === "fail").map(c => c.id), clinicallyApproved: false }));
const summary = { version: "evidence-graph-development-pilot/v1", createdAt, scope: "All retained live GUI candidate runs, including failed and superseded development versions. Not a fixed-version efficacy trial or clinician-approved reference. Automated acceptance is not clinical correctness; early errors count even if corrected later.", attempts: runs.length, complete: runs.filter(r => r.status === "complete").length, reviewRequired: runs.filter(r => r.status === "review_required").length, modelCalls: runs.reduce((n,r)=>n+r.modelCalls,0), knownCostEstimateUSD: costs.reduce<number>((n,c)=>n+(c??0),0), attemptsWithUnknownCost: costs.filter(c=>c===null).length, pricing: STUDY_PRICING, rows };
save(join(output, "summary.json"), summary);
save(join(output, "manifest.json"), { createdAt, corpusHash: corpus.hash, runIds: rows.map(r => r.runId), reference: "The preexisting physician development review is unchanged and does not approve these new outputs.", noGoldInRetrieval: true });
console.log(JSON.stringify({ output, corpusHash: corpus.hash, bundleBytes: compressed.length, attempts: summary.attempts, complete: summary.complete, knownCostEstimateUSD: summary.knownCostEstimateUSD, unknownCostAttempts: summary.attemptsWithUnknownCost }));
