/** Read-only projection of both frozen Astra studies; no generation or scoring. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "../src/lib/csv.mjs";
import { IDS, loadFrozenRun, verifyFreeze } from "./score-stripped-3bucket-astra.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUCKETS = ["SELF_CARE", "ASYNC_PHYSICIAN", "URGENT_ESCALATION"];
const RUNS = Object.freeze([
  { id: "astra-xhigh", label: "Astra · extra high", effort: "xhigh", path: "outputs/stripped-3bucket-astra-xhigh-2026-09-15" },
  { id: "astra-max", label: "Astra · max", effort: "max", path: "outputs/stripped-3bucket-astra-max-2026-09-15" },
]);
const hash = value => createHash("sha256").update(value).digest("hex");

/** Only final structured output is displayed; provider reasoning is not copied. */
export function projectAstraCase(prediction, metadata, artifacts) {
  assert(IDS.includes(prediction.id));
  assert.equal(typeof prediction.message, "string");
  assert.equal(metadata.requestedModel, "gpt-6-astra");
  assert(["xhigh", "max"].includes(metadata.effort));
  if (prediction.parsed !== null) {
    assert(BUCKETS.includes(prediction.parsed?.disposition));
    assert.equal(typeof prediction.parsed.rationale, "string");
    assert(prediction.parsed.rationale.trim());
    assert.equal(prediction.failure, null);
  } else {
    assert.equal(typeof prediction.failure, "string");
    assert(prediction.failure.trim());
  }
  return {
    id: prediction.id, message: prediction.message,
    status: prediction.parsed ? "complete" : "incomplete",
    disposition: prediction.parsed?.disposition ?? null,
    rationale: prediction.parsed?.rationale ?? null,
    originalDisposition: prediction.parsed?.disposition ?? null,
    failureReason: prediction.failure,
    sourceStatus: prediction.parsed ? "complete" : "failed",
    model: metadata.requestedModel, effort: metadata.effort,
    traceSummary: {
      modelCalls: 1, requestedModel: metadata.requestedModel,
      returnedModels: [...metadata.returnedModels], effort: metadata.effort,
      promptSHA256: metadata.promptSHA256,
    },
    earlyActions: [],
    artifactPaths: Object.fromEntries(artifacts.map(a => [a.kind, a.path])),
    artifactHashes: Object.fromEntries(artifacts.map(a => [a.path, a.sha256])),
  };
}

export function loadAstraCaseReview(root = ROOT) {
  root = resolve(root);
  const sourceArtifacts = {};
  function recordArtifact(path, expected) {
    const absolute = resolve(root, path);
    assert(lstatSync(absolute).isFile() && !lstatSync(absolute).isSymbolicLink(), "Astra source must be a regular file");
    const actual = hash(readFileSync(absolute));
    if (expected !== undefined) assert.equal(actual, expected, `Astra artifact drift: ${path}`);
    sourceArtifacts[path] = actual;
    return actual;
  }

  // Verify both generation freezes before loading any display reference data.
  const frozen = RUNS.map(run => verifyFreeze(resolve(root, run.path)));
  const verified = RUNS.map((run, i) => loadFrozenRun(frozen[i], { provider: "openai", effort: run.effort }));
  const csvPath = "data/patient_messages.csv";
  const csvSHA256 = recordArtifact(csvPath);
  const cases = parseCsv(readFileSync(resolve(root, csvPath), "utf8"));
  assert.deepEqual(cases.map(c => c.id), IDS, "Assignment must contain C01–C50 once in order");
  const requestIds = verified.flatMap(run => run.requestIds);
  const responseIds = verified.flatMap(run => run.responseIds);
  assert.equal(new Set(requestIds).size, requestIds.length, "Reused Astra request across runs");
  assert.equal(new Set(responseIds).size, responseIds.length, "Reused Astra response across runs");

  const models = verified.map((run, i) => {
    const spec = RUNS[i];
    assert.equal(run.manifest.csvSHA256, csvSHA256, "Astra assignment source changed");
    for (const name of ["manifest.json", "system-prompt.txt", "generation-complete.json"]) recordArtifact(`${spec.path}/${name}`);
    for (const [name, expected] of Object.entries(run.complete.artifactHashes)) recordArtifact(`${spec.path}/${name}`, expected);
    const metadata = {
      provider: "OpenAI Responses API", requestedModel: run.manifest.settings.model,
      returnedModels: run.returnedModels, effort: spec.effort,
      maxOutputTokens: run.manifest.settings.max_output_tokens,
      promptSHA256: run.manifest.promptSHA256, completedAt: run.complete.completedAt,
      providerCalls: run.complete.providerCalls, validDispositions: run.complete.validDispositions,
      failedCases: [...run.complete.failedCases], completionSHA256: run.completionSHA256,
    };
    const records = run.predictions.map((prediction, index) => {
      assert.equal(prediction.message, cases[index].message, "Astra input differs from assignment message");
      const artifacts = ["request", "raw", "parsed"].map(kind => {
        const path = `${spec.path}/${prediction.id}-${kind}.json`;
        return { kind, path, sha256: sourceArtifacts[path] };
      });
      return projectAstraCase(prediction, metadata, artifacts);
    });
    return {
      id: spec.id, label: spec.label, default: spec.effort === "xhigh", records, metadata,
      provenance: "Frozen three-bucket study. One exact patient message and one OpenAI Responses call per case, with the same system prompt as the original Fable run. Both effort settings are retained separately.",
      referenceNote: "Physician v3 comparison is derived after generation using the revised single-author reference. Agreement is not independent clinical validation. The saved higher-effort run used max, not ultra.",
    };
  });
  assert.equal(models[0].metadata.promptSHA256, models[1].metadata.promptSHA256);
  return {
    schema: "astra-case-review-adapter/v1", sourceArtifacts, provenance: sourceArtifacts, models,
    integrity: {
      generationFreezesVerified: 2,
      exactMessageOnlyPayloadsVerified: verified.reduce((n, run) => n + run.predictions.length, 0),
      rawParsedParity: verified.reduce((n, run) => n + run.predictions.length, 0),
      frozenArtifactsVerified: verified.reduce((n, run) => n + run.verifiedArtifactCount, 0),
      promptSHA256: models[0].metadata.promptSHA256,
      efforts: models.map(model => model.metadata.effort),
    },
  };
}
