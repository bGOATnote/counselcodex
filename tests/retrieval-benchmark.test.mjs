import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRetrievers, runRetrievalBenchmark } from "../src/evaluation/retrieval-benchmark.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readJsonLines(path) {
  const source = await readFile(path, "utf8");
  return source.trim().split("\n").map((line) => JSON.parse(line));
}

test("governed hybrid retrieval beats metadata and sparse-vector baselines on the frozen development challenge set", async () => {
  const [corpus, queries] = await Promise.all([
    readJsonLines(resolve(root, "data/retrieval/policy-corpus-v1.jsonl")),
    readJsonLines(resolve(root, "data/retrieval/retrieval-eval-v1.jsonl")),
  ]);
  const report = runRetrievalBenchmark(corpus, queries);
  const metadata = report.results.exact_metadata.summary;
  const sparse = report.results.sparse_vector.summary;
  const hybrid = report.results.governed_hybrid.summary;

  assert.ok(hybrid.recallAtThree > metadata.recallAtThree);
  assert.ok(hybrid.recallAtThree > sparse.recallAtThree);
  assert.equal(hybrid.abstentionAccuracy, 1);
  assert.equal(hybrid.forbiddenTopThreeRate, 0);
  assert.equal(report.results.governed_hybrid.stableAcrossCorpusOrder, true);
  assert.equal(report.clinicalPerformanceEstimate, null);
  assert.equal(report.externalModelCalls, 0);
  assert.match(report.corpusSha256, /^[a-f0-9]{64}$/);
  assert.match(report.querySetSha256, /^[a-f0-9]{64}$/);
});

test("retrieval input validation rejects contradictory or unknown judgments", () => {
  const corpus = [{ id: "known", title: "x", topic: "x", tags: [], text: "x", status: "active", population: "all", routeIntent: "clinical" }];
  const contradictory = [{ id: "q", text: "x", routeIntent: "clinical", population: "adult", relevantIds: ["known"], forbiddenIds: ["known"], mustAbstain: false }];
  assert.throws(() => runRetrievalBenchmark(corpus, contradictory), /both relevant and forbidden/);
});

test("governance filters superseded, cross-domain, wrong-population, and wrong-lane documents before ranking", async () => {
  const [corpus, queries] = await Promise.all([
    readJsonLines(resolve(root, "data/retrieval/policy-corpus-v1.jsonl")),
    readJsonLines(resolve(root, "data/retrieval/retrieval-eval-v1.jsonl")),
  ]);
  const retrieve = buildRetrievers(corpus).governed_hybrid;
  const injection = queries.find(({ id }) => id === "RQ-017");
  const veterinary = queries.find(({ id }) => id === "RQ-018");
  const pediatric = queries.find(({ id }) => id === "RQ-012");

  assert.deepEqual(retrieve(injection).slice(0, 1).map(({ document }) => document.id), ["policy-active-chest"]);
  assert.deepEqual(retrieve(veterinary), []);
  assert.equal(retrieve(pediatric).some(({ document }) => document.id === "policy-superseded-fever"), false);
});
