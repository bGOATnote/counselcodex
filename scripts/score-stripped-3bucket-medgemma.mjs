/** Offline MedGemma comparison. Verify all generation artifacts before reading references. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BUCKETS, compareArms, computeMetrics } from "./score-fn-reduction.mjs";
import { loadRun, validateAdjudication, writeUnchangedOrNew } from "./score-physician-adjudication-v3.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IDS = Array.from({ length: 50 }, (_, i) => `C${String(i + 1).padStart(2, "0")}`);
const REFERENCE = "data/evaluation/physician-adjudication-v3-2026-09-15.json";
const BASE_REFERENCE = "data/evaluation/physician-system-reference-v2.json";
const FABLE = Object.freeze({ key: "fableLow", path: "outputs/stripped-3bucket-fable-2026-09-15", provider: "anthropic", model: "claude-fable-5-1", effort: "low", taxonomy: "three_bucket" });
const sha256 = value => createHash("sha256").update(value).digest("hex");
const readJSON = path => JSON.parse(readFileSync(path, "utf8"));
const textJSON = value => JSON.stringify(value, null, 2) + "\n";

function validatePredictions(rows, references, label) {
  assert.deepEqual(rows.map(row => row.id), IDS, `${label}: expected 50 unique ordered cases`);
  for (const [index, row] of rows.entries()) {
    const ref = references[index];
    assert.equal(row.message, ref.message, `${label}: message mismatch for ${row.id}`);
    assert.equal(row.inputSHA256, sha256(row.message), `${label}: message hash mismatch for ${row.id}`);
    assert.equal(row.inputSHA256, ref.inputSHA256, `${label}: reference input mismatch for ${row.id}`);
    if (row.parsed === null) assert.ok(typeof row.failure === "string" && row.failure.trim(), `${label}: failed output needs a failure record`);
    else {
      assert.ok(row.parsed && BUCKETS.includes(row.parsed.disposition), `${label}: invalid disposition`);
      assert.deepEqual(Object.keys(row.parsed).sort(), ["disposition", "rationale"], `${label}: unexpected parsed fields`);
      assert.ok(typeof row.parsed.rationale === "string" && row.parsed.rationale.trim(), `${label}: missing rationale`);
      assert.equal(row.failure, null, `${label}: valid result marked failed`);
    }
  }
}

/** Pure pairing helper; no filesystem, provider or clinical-reference access. */
export function buildComparison({ medgemma, fable, reference }) {
  assert.deepEqual(reference.cases.map(row => row.id), IDS, "Reference must contain all 50 ordered cases");
  assert.deepEqual(reference.cases.find(row => row.id === "C25").acceptedBuckets, ["URGENT_ESCALATION"], "C25 urgent adjudication is required");
  validatePredictions(medgemma, reference.cases, "MedGemma");
  validatePredictions(fable, reference.cases, "Fable");
  const paired = compareArms(fable, medgemma, reference.cases,
    "Historical saved Fable low-effort outputs on identical messages and instruction text; model, serialization, decoding, quantization, runtime and inference date differ.");
  const scorecard = { schemaVersion: "medgemma-physician-scorecard/1", referenceId: reference.referenceId,
    referenceProvenance: reference.provenance, independentClinicalValidation: false, csvScored: false,
    ...computeMetrics(medgemma, reference.cases) };
  const fableRows = new Map(paired.baseline.rows.map(row => [row.id, row]));
  const rows = scorecard.rows.map(row => ({ id: row.id, message: row.message, acceptedBuckets: row.acceptedBuckets,
    medgemma: row, fable: fableRows.get(row.id), dispositionDisagrees: row.disposition !== fableRows.get(row.id).disposition }));
  return { scorecard, comparison: { schemaVersion: "medgemma-fable-comparison/1", referenceId: reference.referenceId,
    csvScored: false, ...paired, disagreementIds: rows.filter(row => row.dispositionDisagrees).map(row => row.id),
    jointlyFailedIds: rows.filter(row => row.medgemma.disposition === null && row.fable.disposition === null).map(row => row.id),
    failedOutputIds: rows.filter(row => row.medgemma.disposition === null || row.fable.disposition === null).map(row => row.id),
    rows } };
}

const median = values => {
  const sorted = [...values].sort((a, b) => a - b), n = sorted.length;
  return n ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2 : null;
};
export function summarizeLocalOperations(records) {
  assert.deepEqual(records.map(row => row.id), IDS, "Operations must cover all 50 ordered attempts");
  const latencies = records.map(row => row.latencyMs).filter(value => Number.isFinite(value) && value >= 0);
  return { attempts: records.length, latencyObservations: latencies.length,
    medianLatencyMs: median(latencies), totalObservedLatencyMs: latencies.reduce((sum, value) => sum + value, 0),
    telemetryObservations: records.filter(row => row.telemetry !== null && row.telemetry !== undefined).length,
    records: records.map(row => ({ id: row.id, latencyMs: Number.isFinite(row.latencyMs) && row.latencyMs >= 0 ? row.latencyMs : null, telemetry: row.telemetry ?? null })),
    interpretation: "Local wall times include recorded request overhead and any loading. They are descriptive observations, not a controlled hosted-versus-local speed comparison." };
}

const list = ids => ids.length ? ids.join(", ") : "None";
const escaped = value => String(value ?? "Not recorded").replaceAll("|", "\\|").replaceAll("\n", " ");
const quoted = value => String(value).split("\n").map(line => `> ${line}`).join("\n");
const resultSummary = row => `${row.disposition ?? "FAILED_OUTPUT"}; physician agreement ${row.agrees ? "yes" : "no"}; clinician action ${row.clinicianAction}; urgent action ${row.urgentAction}.`;
const seconds = ms => ms === null ? "Not recorded" : `${(ms / 1000).toFixed(2)} s`;

export function renderReport({ scorecard, comparison, audit, manifest }) {
  const selected = comparison.rows.filter(row => row.dispositionDisagrees || !row.medgemma.agrees || !row.fable.agrees);
  const provenance = manifest.provenance ?? {}, runtime = manifest.runtime ?? {};
  const hardware = provenance.hardware ?? runtime.hardware;
  const pinnedWeightURL = provenance.sourceRepository && provenance.revision && provenance.filename
    ? `https://huggingface.co/${provenance.sourceRepository}/blob/${provenance.revision}/${encodeURIComponent(provenance.filename)}` : null;
  const lines = ["# MedGemma 27B three-bucket comparison", "", `Scored after generation freeze: ${audit.scoredAt}.`, "",
    "## Result", "", `MedGemma agreed with physician adjudication v3 on **${scorecard.agree}/50** messages; the preserved Fable low-effort run agreed on **${comparison.baseline.agree}/50** under the same reference.`, "",
    "| Measure | MedGemma | Historical Fable |", "| --- | ---: | ---: |",
    `| Three-bucket agreement | ${scorecard.agree}/50 | ${comparison.baseline.agree}/50 |`,
    `| Clinician-action false negatives | ${scorecard.clinicianAction.FN}/${scorecard.clinicianAction.positiveDenominator} | ${comparison.baseline.clinicianAction.FN}/${comparison.baseline.clinicianAction.positiveDenominator} |`,
    `| Urgent-action false negatives | ${scorecard.urgentAction.FN}/${scorecard.urgentAction.positiveDenominator} | ${comparison.baseline.urgentAction.FN}/${comparison.baseline.urgentAction.positiveDenominator} |`,
    `| Clinician-action false positives | ${scorecard.clinicianAction.FP} | ${comparison.baseline.clinicianAction.FP} |`,
    `| Invalid or failed outputs | ${scorecard.failedOutputs} | ${comparison.baseline.failedOutputs} |`, "",
    `- MedGemma route misses: ${list(scorecard.missIds)}.`,
    `- MedGemma clinician-action false negatives: ${list(scorecard.clinicianActionFalseNegativeIds)}.`,
    `- MedGemma urgent-action false negatives: ${list(scorecard.urgentFalseNegativeIds)}.`,
    `- Different dispositions from historical Fable: ${list(comparison.disagreementIds)}.`,
    `- Historical Fable misses resolved: ${list(comparison.resolvedMissIds)}.`,
    `- New route misses relative to historical Fable: ${list(comparison.newMissIds)}.`, "",
    "Clinician action means ASYNC_PHYSICIAN or URGENT_ESCALATION; urgent action means URGENT_ESCALATION. These are separate endpoints. A missed urgent route can still correctly request clinician involvement. Failed outputs count against agreement and, when the reference requires action, against sensitivity. Failures on negative-reference cases are recorded separately, never as benign predictions. Three buckets do not measure emergency timing.", "",
    "## Frozen protocol and serving configuration", "", "| Property | Recorded value |", "| --- | --- |",
    `| Model alias | ${escaped(manifest.model)} |`,
    `| Upstream model | ${escaped(provenance.upstreamModel ?? provenance.modelId ?? provenance.sourceModel)} |`,
    `| Quantization | ${escaped(provenance.quantization ?? runtime.quantization)} |`,
    `| Weight source | ${escaped(provenance.sourceRepository ?? provenance.repository ?? provenance.source)} |`,
    `| Weight revision | ${escaped(provenance.revision ?? provenance.sourceRevision)} |`,
    `| Pinned weight artifact | ${pinnedWeightURL ? `[${escaped(provenance.filename)}](${pinnedWeightURL})` : "Not recorded"} |`,
    `| Upstream weight revision verification | ${escaped(provenance.upstreamWeightRevision)} |`,
    `| Downloaded GGUF SHA256 | ${escaped(provenance.sha256)} |`,
    `| Installed model blob SHA256 | ${escaped(provenance.importedBlobSHA256)} |`,
    `| Runtime | ${escaped(runtime.version)} |`,
    `| Model digest | ${escaped(runtime.modelDigest ?? runtime.digest)} |`,
    `| Template SHA256 | ${escaped(runtime.templateSHA256)} |`,
    `| Hardware | ${escaped(typeof hardware === "object" ? JSON.stringify(hardware) : hardware)} |`,
    `| Frozen instruction SHA256 | ${escaped(manifest.promptSHA256)} |`,
    `| Decoding settings | ${escaped(JSON.stringify(manifest.settings))} |`,
    `| Request timeout | ${escaped(manifest.protocol?.timeoutMs)} ms |`,
    `| Median local wall latency | ${seconds(audit.operations.medianLatencyMs)} |`,
    `| Recorded wall-latency observations | ${audit.operations.latencyObservations}/50 |`, "",
    "The frozen three-bucket instruction text and exact patient messages match the stripped baseline. Each case receives one independent local generation. No physician labels, CSV labels, case IDs, RAG, judge, retry, repair or fallback enters inference. The request settings and installed template are retained in the generation manifest. Gemma's native serialization can place the system text at the beginning of the user turn; matching instruction text does not establish identical tokenized context across model families.", "",
    `Import provenance: ${provenance.importTransformation ?? "No transformation record was supplied."} The downloaded artifact and installed blob hashes identify different stages of serving provenance; matching file size does not prove identical tensor values.`, "",
    `Structured-output mode: ${manifest.protocol?.structuredDecoding === true ? "JSON grammar-constrained decoding was enabled. This differs from historical Fable decoding and is part of the evaluated local configuration." : "No grammar-constrained JSON decoding; JSON is requested by the unchanged prompt."}`, "",
    "Quantization, tokenization, output sampling, runtime, hardware and inference date differ from the hosted Fable run. The comparison evaluates the recorded local MedGemma configuration; it does not isolate a full-precision model effect or establish a controlled latency difference. The historical Fable score of 48/50 is a v3 reassessment of its saved outputs. Identical logical Fable requests in the later study produced 45/50 and 46/50; see [workflow-aware results](WORKFLOW_AWARE_RESULTS_2026-09-16.md).", "",
    "## Reference and interpretation", "",
    "Physician adjudication v3 is a single-physician, unblinded post-output revision on 50 familiar development messages. C25 is included as URGENT_ESCALATION. Corrections to C32, C34 and C38 remain SELF_CARE. This comparison is neither independent clinical validation nor evidence that a higher agreement score defines better clinical policy on contested self-care decisions. Rationale quality, medication advice and pregnancy precautions are not validated by a matching disposition.", "",
    "Original CSV labels were not scored or combined with physician agreement. No selected GUI, frozen Fable protocol or historical V25 pipeline was modified. No clinical superiority or promotion is claimed.", "",
    "## Exact disagreements and missed cases", "",
    "This section includes every disposition disagreement and every miss by either model. Messages and generated short rationales are preserved verbatim. Endpoint classifications refer only to the recorded physician reference.", ""];
  for (const row of selected) {
    lines.push(`### ${row.id}`, "", "Patient message:", "", quoted(row.message), "",
      `Accepted bucket: **${row.acceptedBuckets.join(" or ")}**.`, "",
      `**MedGemma:** ${resultSummary(row.medgemma)}`, "", row.medgemma.rationale === null ? `Failure: ${row.medgemma.failure}` : quoted(row.medgemma.rationale), "",
      `**Historical Fable:** ${resultSummary(row.fable)}`, "", row.fable.rationale === null ? `Failure: ${row.fable.failure}` : quoted(row.fable.rationale), "");
  }
  lines.push("## Reproduce the offline score", "", "```bash", `node scripts/score-stripped-3bucket-medgemma.mjs ${audit.outputDirectory}`, "```", "",
    "The scorer verifies generation completeness, identities, hashes and raw/parsed parity before opening clinical references. Re-scoring preserves existing artifacts and refuses changed results. The generation command is separate and performs model calls.", "",
    "## Sources", "",
    "- [Google MedGemma 1 model card](https://developers.google.com/health-ai-developer-foundations/medgemma/model-card-v1): model variants, intended research use and validation limits.",
    "- [Google Gemma formatting guidance](https://ai.google.dev/gemma/docs/core/prompt-structure): native conversation serialization.",
    "- [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs): JSON schema decoding behavior.", "");
  return lines.join("\n");
}

export async function scoreMedgemma(directory) {
  // Dynamic import keeps pure tests independent of local runtime and output availability.
  const runner = await import("./stripped-3bucket-medgemma.mjs");
  const output = resolve(directory ?? runner.OUTPUT);
  const verified = runner.verifyGeneration(output);
  const fableRun = loadRun(FABLE);
  assert.equal(verified.manifest.csvSHA256, fableRun.manifest.csvSHA256, "Input CSV identity differs");
  assert.equal(verified.manifest.promptSHA256, fableRun.manifest.promptSHA256, "Instruction text differs");
  assert.equal(verified.manifest.systemPrompt, fableRun.manifest.systemPrompt, "Instruction bytes differ");
  // Clinical reference reads occur only after both frozen generations pass verification.
  const referenceBytes = readFileSync(join(ROOT, REFERENCE));
  const baseBytes = readFileSync(join(ROOT, BASE_REFERENCE));
  const reference = validateAdjudication(JSON.parse(referenceBytes), JSON.parse(baseBytes), baseBytes);
  assert.equal(reference.baseReference.datasetSha256, verified.manifest.csvSHA256);
  const fable = fableRun.predictions.map(row => ({ ...row, parsed: { disposition: row.disposition, rationale: row.rationale }, failure: null }));
  const { scorecard, comparison } = buildComparison({ medgemma: verified.predictions, fable, reference });
  assert.equal(comparison.baseline.agree, 48, "Historical Fable v3 score changed");
  const auditPath = join(output, "scoring-audit.json");
  const scoredAt = existsSync(auditPath) ? readJSON(auditPath).scoredAt : new Date().toISOString();
  assert.ok(Number.isFinite(Date.parse(scoredAt)) && Date.parse(scoredAt) >= Date.parse(verified.complete.completedAt), "Scoring preceded generation freeze");
  const audit = { schemaVersion: "medgemma-scoring-audit/1", scoredAt, generationCompletedAt: verified.complete.completedAt,
    outputDirectory: relative(ROOT, output), denominator: 50, csvScored: false,
    referencesReadAfterGenerationVerification: true, referencePath: REFERENCE, referenceSHA256: sha256(referenceBytes),
    referenceProvenance: reference.provenance, scorerSHA256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    scoringSourceHashes: Object.fromEntries(["scripts/score-stripped-3bucket-medgemma.mjs", "scripts/score-fn-reduction.mjs", "scripts/score-physician-adjudication-v3.mjs"].map(path => [path, sha256(readFileSync(join(ROOT, path)))])),
    manifestSHA256: sha256(readFileSync(join(output, "manifest.json"))), generationFreezeSHA256: sha256(readFileSync(join(output, "generation-complete.json"))),
    frozenArtifactCount: Object.keys(verified.complete.artifactHashes ?? {}).length,
    fablePath: FABLE.path, fableGenerationFreezeSHA256: sha256(readFileSync(join(ROOT, FABLE.path, "generation-complete.json"))),
    operations: summarizeLocalOperations(verified.records), provenance: verified.manifest.provenance, runtime: verified.manifest.runtime };
  for (const [name, value] of [["scorecard-A-physician-v3.json", scorecard], ["comparison-fable.json", comparison], ["scoring-audit.json", audit]]) writeUnchangedOrNew(join(output, name), textJSON(value));
  writeUnchangedOrNew(join(ROOT, "docs/MEDGEMMA_27B_COMPARISON_2026-09-16.md"), renderReport({ scorecard, comparison, audit, manifest: verified.manifest }));
  console.log(JSON.stringify({ physicianAgreement: `${scorecard.agree}/50`, historicalFable: "48/50", failedOutputs: scorecard.failedOutputs,
    clinicianActionFalseNegativeIds: scorecard.clinicianActionFalseNegativeIds, urgentFalseNegativeIds: scorecard.urgentFalseNegativeIds,
    disagreementIds: comparison.disagreementIds, output: relative(ROOT, output) }, null, 2));
  return { scorecard, comparison, audit };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await scoreMedgemma(process.argv[2]);
