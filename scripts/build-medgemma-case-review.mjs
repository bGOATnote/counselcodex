import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadCaseReview, addHistoricalModels, caseReviewArtifacts, publishCaseReview, sha256 } from "../src/research/medgemma-case-review.mjs";
import { loadHistoricalCaseReview } from "./load-historical-case-review.mjs";

export function buildMedgemmaCaseReview(verify = false) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const historical = loadHistoricalCaseReview(root);
  const data = addHistoricalModels(loadCaseReview(root), historical);
  const paths = ["scripts/build-medgemma-case-review.mjs", "src/research/medgemma-case-review.mjs", "tests/medgemma-case-review.test.mjs", "scripts/load-historical-case-review.mjs", "tests/historical-case-review.test.mjs", "output/submission-2026-09-15/content/assets/counsel-logo.svg", "output/submission-2026-09-15/content/assets/provenance.json"];
  const sourceHashes = Object.fromEntries(paths.map(path => [path, sha256(readFileSync(resolve(root, path)))]));
  publishCaseReview(resolve(root, "publication/medgemma-case-review"), caseReviewArtifacts(data, sourceHashes), verify);
  return { mode: verify ? "verified" : "built", path: "publication/medgemma-case-review/index.html", cases: data.cases.length, disagreementIds: data.disagreementIds, inferenceEnabled: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--verify"), "Usage: node scripts/build-medgemma-case-review.mjs [--verify]");
  console.log(JSON.stringify(buildMedgemmaCaseReview(process.argv[2] === "--verify"), null, 2));
}
