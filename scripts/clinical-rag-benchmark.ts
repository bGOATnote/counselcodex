import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseEnv } from "node:util";
import { ClinicalRagStore, openAiEmbed } from "../src/evidence/rag/store.ts";
import { sha256, type Retrieval } from "../src/evidence/rag/model.ts";

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Usage: npm run rag:benchmark -- --directory INDEX --output NEW_DIRECTORY\nRuns 36 retrieval attempts across three modes; hybrid modes make paid query-embedding calls. Do not use an index concurrently owned by the GUI. No clinical models or labels are used.");
  process.exit(0);
}
function arg(key: string) { const at = args.indexOf(key); return at < 0 ? undefined : args[at + 1]; }
const directory = resolve(arg("--directory") ?? "apps/evaluation/.local/clinical-rag-v7");
const output = resolve(arg("--output") ?? `apps/evaluation/.local/rag-bench-${Date.now()}`);
mkdirSync(output, { recursive: false, mode: 0o700 });
const text = readFileSync(new URL("../data/evidence/retrieval-challenges.json", import.meta.url), "utf8");
const challenge = JSON.parse(text) as { scope: string; cases: { id: string; query: string; relevant: string[] }[] };
const env = parseEnv(readFileSync(".env", "utf8")), embed = openAiEmbed(process.env.OPENAI_API_KEY ?? env.OPENAI_API_KEY ?? "");
const store = await ClinicalRagStore.open(join(directory, "postgres"));
const attempts: any[] = [], modes: Retrieval["mode"][] = ["lexical", "hybrid", "hybrid-graph"];
try {
  // Counterbalance order. Embedding query caching is reported, not mistaken
  // for an inference-speed improvement or a cached clinical answer.
  const orders: Retrieval["mode"][][] = [["lexical", "hybrid", "hybrid-graph"], ["lexical", "hybrid-graph", "hybrid"], ["hybrid", "lexical", "hybrid-graph"], ["hybrid-graph", "lexical", "hybrid"], ["hybrid", "hybrid-graph", "lexical"], ["hybrid-graph", "hybrid", "lexical"]];
  for (const [i, c] of challenge.cases.entries()) for (const mode of orders[i % orders.length]) {
    let attempt: any;
    try {
      const r = await store.search(c.query, { mode, embed, limit: 6, signal: AbortSignal.timeout(60_000) });
      const first = r.hits.findIndex(h => c.relevant.includes(h.document.id));
      const found = new Set(r.hits.filter(h => c.relevant.includes(h.document.id)).map(h => h.document.id));
      attempt = { id: c.id, mode, retrieval: r, hitAt6: first >= 0, reciprocalRank: first >= 0 ? 1 / (first + 1) : 0, documentRecall: found.size / c.relevant.length, error: null };
    } catch (e) { attempt = { id: c.id, mode, error: e instanceof Error ? e.message : "FAILED", hitAt6: false, reciprocalRank: 0, documentRecall: 0 }; }
    writeFileSync(join(output, `${c.id}-${mode}.json`), JSON.stringify(attempt, null, 2), { flag: "wx", mode: 0o600 }); attempts.push(attempt);
    console.log(JSON.stringify({ id: c.id, mode, hitAt6: attempt.hitAt6, recall: attempt.documentRecall, ms: attempt.retrieval?.timings.totalMs, error: attempt.error }));
  }
  const mean = (values: number[]) => values.reduce((a,b)=>a+b,0) / values.length;
  const summary = { createdAt: new Date().toISOString(), challengeHash: sha256(text), scope: challenge.scope, results: modes.map(mode => { const rows = attempts.filter(a=>a.mode===mode); return { mode, attempts: rows.length, failures: rows.filter(a=>a.error).length, hitAt6: mean(rows.map(a=>Number(a.hitAt6))), mrr: mean(rows.map(a=>a.reciprocalRank)), documentRecall: mean(rows.map(a=>a.documentRecall)), corpusHashes: [...new Set(rows.map(a=>a.retrieval?.corpusHash).filter(Boolean))], meanMs: mean(rows.filter(a=>a.retrieval).map(a=>a.retrieval.timings.totalMs)), queryTokens: rows.reduce((n,a)=>n+(a.retrieval?.embeddingTokens??0),0), cachedQueries: rows.filter(a=>a.retrieval?.embeddingCacheHit).length }; }) };
  writeFileSync(join(output, "summary.json"), JSON.stringify(summary, null, 2), { flag: "wx" }); console.log(JSON.stringify({ output, summary }));
} finally { await store.close(); }
