import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "../src/lib/csv.mjs";
import { evidenceLibrary, evidenceHash, libraryHash } from "../src/evidence/library.ts";
import { retrieveEvidence, guidanceForPrompt, RETRIEVAL_VERSION } from "../src/evidence/retrieval.ts";
import { legacyRetrieveGuidance } from "../src/evaluation/evidence-legacy-baseline.ts";
import { evidenceSentinels } from "../src/evaluation/evidence-sentinels.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args.length > 1) throw new Error("Usage: npm run evidence:audit -- [path/to/new-messages.csv]");
const csv = await readFile(args[0] ? resolve(args[0]) : resolve(root, "data/patient_messages.csv"));
if (csv.byteLength > 2_000_000) throw new Error("CSV_TOO_LARGE");
const rows = parseCsv(csv.toString("utf8")) as { id: string; message: string }[];
if (!rows.length || rows.length > 1000 || new Set(rows.map((r) => r.id)).size !== rows.length || rows.some((r) => !r.id?.trim() || !r.message?.trim() || r.message.length > 12000)) throw new Error("INVALID_INPUT_ROWS");
const asOf = new Date().toISOString().slice(0, 10);
const oldLibrary = { ...evidenceLibrary, recommendations: evidenceLibrary.recommendations.filter((r) => r.review.status === "legacy_summary") };
const modes = {
  frozen_keyword_10: (message: string) => legacyRetrieveGuidance(message).slice(0, 5),
  scoped_lexical_10: (message: string) => retrieveEvidence(message, { library: oldLibrary, now: asOf }).guidance,
  unscoped_lexical_15: (message: string) => retrieveEvidence(message, { mode: "lexical", now: asOf }).guidance,
  scoped_lexical_15: (message: string) => retrieveEvidence(message, { now: asOf }).guidance,
};
const mean = (v: number[]) => v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
const quantile = (v: number[], p: number) => [...v].sort((a, b) => a - b)[Math.max(0, Math.ceil(v.length * p) - 1)] ?? null;
const comparisons = Object.fromEntries(Object.entries(modes).map(([name, retrieve]) => {
  const cases = evidenceSentinels.map((c) => {
    const ids = retrieve(c.message).map((g) => g.id);
    const hits = ids.filter((id) => c.relevant.includes(id)).length;
    return { id: c.id, selectedIds: ids, relevant: c.relevant, hits,
      precisionAmongReturned: ids.length ? hits / ids.length : null,
      recallAtFive: c.relevant.length ? hits / c.relevant.length : null,
      forbiddenHits: ids.filter((id) => c.forbidden?.includes(id)),
      abstentionFailure: c.abstain === true && ids.length > 0,
      retrievalFailure: c.relevant.some((id) => !ids.includes(id)),
    };
  });
  const timings: number[] = [];
  // Local CPU time only; not provider latency, prompt tokens or clinical efficacy.
  for (let repeat = 0; repeat < 20; repeat++) for (const c of evidenceSentinels) { const start = performance.now(); retrieve(c.message); timings.push(performance.now() - start); }
  const original = rows.map(({ id, message }) => {
    const guidance = retrieve(message);
    return { id, queryHash: evidenceHash(message), selectedIds: guidance.map((g) => g.id),
      promptBytes: Buffer.byteLength(JSON.stringify(guidanceForPrompt(guidance))),
      inspectedPassages: guidance.reduce((n, g) => n + (g.evidenceRecord?.passages.length ?? 0), 0) };
  });
  return [name, { cases,
    macroRecallAtFive: mean(cases.flatMap((c) => c.recallAtFive === null ? [] : [c.recallAtFive])),
    macroPrecisionAmongReturned: mean(cases.flatMap((c) => c.precisionAmongReturned === null ? [] : [c.precisionAmongReturned])),
    forbiddenRetrievals: cases.reduce((n, c) => n + c.forbiddenHits.length, 0),
    failedAbstentions: cases.filter((c) => c.abstentionFailure).length,
    failedCases: cases.filter((c) => c.retrievalFailure || c.abstentionFailure || c.forbiddenHits.length).map((c) => c.id),
    localRetrievalMs: { p50: quantile(timings, 0.5), p95: quantile(timings, 0.95), samples: timings.length },
    inputCoverage: { total: rows.length, withAnyCandidate: original.filter((r) => r.selectedIds.length).length,
      withAnInspectedPassage: original.filter((r) => r.inspectedPassages).length,
      noCandidate: original.filter((r) => !r.selectedIds.length).map((r) => r.id),
      maxPromptBytes: Math.max(...original.map((r) => r.promptBytes)), rows: original },
  }];
}));
const files = ["src/evidence/library.ts", "src/evidence/source-catalog.ts", "src/evidence/legacy-notes.ts", "src/evidence/retrieval.ts", "src/disposition/intake.ts", "src/evaluation/evidence-legacy-baseline.ts", "src/evaluation/evidence-sentinels.ts", "scripts/evidence-audit.ts"];
const codeHashes = Object.fromEntries(await Promise.all(files.map(async (path) => [path, evidenceHash(await readFile(resolve(root, path), "utf8"))])));
const report = { version: "evidence-retrieval-audit/v1", createdAt: new Date().toISOString(), asOf,
  node: process.version, inputSha256: evidenceHash(csv.toString("utf8")), libraryHash, retrievalVersion: RETRIEVAL_VERSION, codeHashes,
  limitations: ["Development sentinels, not held-out data or clinical truth.", "Candidate retrieval is not full claim support or correct disposition.", "No model calls or measured patient-answer noninferiority.", "Original disposition labels are never used.", "Macro precision excludes empty retrievals; recall includes missed relevant sets. Abstention errors reported separately."],
  externalCalls: 0, comparisons };
const directory = resolve(root, "outputs/evidence-audits");
await mkdir(directory, { recursive: true });
const path = resolve(directory, `${report.createdAt.replaceAll(":", "-")}-${evidenceHash(report).slice(0, 12)}.json`);
await writeFile(path, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ path, modes: Object.fromEntries(Object.entries(comparisons).map(([k, v]) => [k, { recall: v.macroRecallAtFive, forbidden: v.forbiddenRetrievals, failedCases: v.failedCases, inputCoverage: v.inputCoverage.withAnyCandidate, p95Ms: v.localRetrievalMs.p95 }])) }, null, 2));
