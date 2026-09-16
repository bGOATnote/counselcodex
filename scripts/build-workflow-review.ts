import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadVerifiedReviewData, publishReviewArtifacts, reviewArtifacts } from "../src/research/workflow-review.ts";

export function buildWorkflowReview(verify = false) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const base = resolve(root, "outputs/workflow-aware-disposition-2026-09-16");
  const data = loadVerifiedReviewData({ root, studyDir: resolve(base, "study"), referenceFreezePath: resolve(base, "reference-freeze.json") });
  const sources = ["scripts/build-workflow-review.ts", "src/research/workflow-review.ts", "tests/workflow-review.test.ts"];
  const hashes = Object.fromEntries(sources.map(path => [path, createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex")]));
  const output = resolve(root, "publication/workflow-study-review");
  publishReviewArtifacts(output, reviewArtifacts(data, hashes), verify);
  return { mode: verify ? "verified" : "built", path: "publication/workflow-study-review/index.html", uniqueMessages: data.cases.length, savedDecisions: data.records.length, inferenceEnabled: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--verify"), "Usage: node --experimental-strip-types scripts/build-workflow-review.ts [--verify]");
  console.log(JSON.stringify(buildWorkflowReview(process.argv[2] === "--verify"), null, 2));
}
