import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runRetrievalBenchmark } from "../src/evaluation/retrieval-benchmark.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readJsonLines(path) {
  const source = await readFile(path, "utf8");
  return { source, rows: source.trim().split("\n").map((line) => JSON.parse(line)) };
}

async function verifyRegisteredFiles(registration) {
  const verified = {};
  const registeredFiles = {
    ...registration.candidateFiles,
    ...registration.inputFiles,
    ...registration.holdoutFiles,
    ...registration.evaluationHarnessFiles,
  };
  for (const [path, expectedSha256] of Object.entries(registeredFiles)) {
    const actualSha256 = sha256(await readFile(resolve(root, path)));
    if (actualSha256 !== expectedSha256) throw new Error(`${path} changed after registration: expected ${expectedSha256}, received ${actualSha256}`);
    verified[path] = actualSha256;
  }
  return verified;
}

export async function runFrozenRetrievalHoldout() {
  const registration = JSON.parse(await readFile(resolve(root, "configs/frozen-evaluation-v1.json"), "utf8"));
  const verifiedFiles = await verifyRegisteredFiles(registration);
  const [corpus, holdout] = await Promise.all([
    readJsonLines(resolve(root, "data/retrieval/policy-corpus-v1.jsonl")),
    readJsonLines(resolve(root, "data/retrieval/retrieval-temporal-holdout-v1.jsonl")),
  ]);
  const benchmark = runRetrievalBenchmark(corpus.rows, holdout.rows);
  const candidate = benchmark.results[registration.retrievalAdmission.candidate];
  const thresholds = registration.retrievalAdmission;
  const gates = {
    corpusOrderStable: candidate.stableAcrossCorpusOrder === thresholds.requireCorpusOrderStability,
    hitAtOne: candidate.summary.hitAtOne >= thresholds.minimumHitAtOne,
    recallAtThree: candidate.summary.recallAtThree >= thresholds.minimumRecallAtThree,
    abstentionAccuracy: candidate.summary.abstentionAccuracy >= thresholds.minimumAbstentionAccuracy,
    forbiddenTopThreeRate: candidate.summary.forbiddenTopThreeRate <= thresholds.maximumForbiddenTopThreeRate,
  };
  return {
    schemaVersion: "counsel-frozen-retrieval-holdout-result/v1",
    status: Object.values(gates).every(Boolean) ? "admitted" : "not_admitted",
    firstExecutedAt: registration.firstExecutedAt,
    registration,
    verifiedFiles,
    externalModelCalls: 0,
    externalSpendUsd: 0,
    gates,
    benchmark: {
      ...benchmark,
      querySetVersion: "synthetic-retrieval-temporal-holdout-v1",
      holdoutFileSha256: sha256(holdout.source),
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await runFrozenRetrievalHoldout();
  const output = resolve(root, "outputs/frozen-retrieval-holdout-v1.json");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    status: result.status,
    output,
    gates: result.gates,
    summaries: Object.fromEntries(Object.entries(result.benchmark.results).map(([name, value]) => [name, value.summary])),
    claimBoundary: result.registration.claimBoundary,
  }, null, 2));
}
