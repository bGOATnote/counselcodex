import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { researchFixtures } from "../data/cqa/research-fixtures.ts";
import { digest, episodeSchema, judgmentSchema, type Episode } from "../src/cqa/contracts.ts";
import { diagnoseCitations } from "../src/cqa/citation-diagnostics.ts";
import { reportSchema } from "../src/cqa/engine.ts";
import { CQA_CRITERIA } from "../src/cqa/rubrics.ts";

// No API imports or calls. Export once from local immutable synthetic receipts;
// thereafter anyone can verify/replay the checked-in artifact without keys.
const path = "outputs/cqa-provider-pilot-20260908-v1.json";
const runIds = [
  "astra-emergency-pilot-20260908-v1", "sonnet-emergency-pilot-20260908-v1",
  "sonnet-emergency-diagnostic-20260908-v2", "astra-temporal-pilot-20260908-v2", "sonnet-temporal-pilot-20260908-v2",
];
const observationSchema = z.object({
  episodeId: z.string(), criterionId: z.string(), model: z.string(),
  inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(), totalTokens: z.number().int().nonnegative(),
  finishReason: z.string(), responseModel: z.string().nullable(),
  structuredCandidate: judgmentSchema.nullable().optional(),
}); // strips non-allowlisted fields, including provider response IDs
const manifestSchema = z.object({
  version: z.literal("cqa-research-run/v1"), mode: z.literal("provider"), model: z.string(),
  rubricVersion: z.string(), rubricSha256: z.string(), implementationSha256: z.string(), inputSha256: z.string(),
  syntheticOnly: z.literal(true), temperature: z.literal("provider default"), maxOutputTokens: z.literal(1500),
  concurrency: z.literal(3), retries: z.literal(0), evaluationBoundary: z.string(),
});
const runSchema = z.object({
  runId: z.string(), diagnosticRepeat: z.boolean(), manifest: manifestSchema,
  reservations: z.array(z.object({ experimentId: z.string(), sequence: z.number().int(), reservedUsd: z.literal(2), at: z.string() })),
  observations: z.array(observationSchema),
  // Existing run hashes use JSON insertion order. Validate without reordering
  // original fixture keys; report hashes separately cover the parsed episode.
  cases: z.array(z.object({ episode: z.custom<Episode>((value) => episodeSchema.safeParse(value).success), report: reportSchema })),
});
const prices = {
  "gpt-6-astra": { inputPerMillionUsd: 10, outputPerMillionUsd: 50, source: "https://developers.openai.com/api/docs/models/gpt-6-astra" },
  "claude-sonnet-5": { inputPerMillionUsd: 2, outputPerMillionUsd: 10, source: "https://platform.claude.com/docs/en/about-claude/pricing" },
};
function summarize(runs: z.infer<typeof runSchema>[]) {
  const rows = runs.flatMap((run) => {
    if (run.observations.length !== run.reservations.length) throw new Error("OBSERVATION_RESERVATION_MISMATCH");
    if (new Set(run.observations.map((o) => `${o.episodeId}/${o.criterionId}`)).size !== run.observations.length) throw new Error("DUPLICATE_OBSERVATION");
    if (run.manifest.inputSha256 !== digest(run.cases.map(({ episode }) => episode))) throw new Error("RUN_INPUT_HASH_MISMATCH");
    return run.observations.map((observation) => {
      const entry = run.cases.find(({ episode }) => episode.episodeId === observation.episodeId);
      if (!entry || entry.report.inputSha256 !== digest(episodeSchema.parse(entry.episode)) || entry.report.rubricSha256 !== run.manifest.rubricSha256) throw new Error("REPORT_HASH_MISMATCH");
      const finding = entry.report.findings.find(({ criterionId }) => criterionId === observation.criterionId);
      if (!finding || finding.origin === "eligibility") throw new Error("OBSERVATION_FINDING_MISMATCH");
      if (!run.manifest.model.endsWith(`/${observation.model}`) || observation.responseModel !== observation.model) throw new Error("MODEL_MISMATCH");
      const price = prices[observation.model as keyof typeof prices];
      if (!price) throw new Error("UNPRICED_MODEL");
      const diagnostics = observation.structuredCandidate ? diagnoseCitations(observation.structuredCandidate, entry.episode) : null;
      if (diagnostics && diagnostics.originalCode !== finding.code) throw new Error("REPLAY_DIFFERS_FROM_RECORDED_CODE");
      return {
        runId: run.runId, diagnosticRepeat: run.diagnosticRepeat, episodeId: observation.episodeId, criterionId: observation.criterionId,
        model: observation.model, originalVerdict: finding.verdict, originalCode: finding.code,
        inputTokens: observation.inputTokens, outputTokens: observation.outputTokens,
        estimatedUncachedTokenCostUsd: (observation.inputTokens * price.inputPerMillionUsd + observation.outputTokens * price.outputPerMillionUsd) / 1_000_000,
        diagnostics,
      };
    });
  });
  const sum = (items: typeof rows) => ({
    attempts: items.length, verifiedFindings: items.filter(({ originalCode }) => originalCode === "PROVENANCE_SPANS_VERIFIED").length,
    abstentions: items.filter(({ originalVerdict }) => originalVerdict === "ABSTAIN").length,
    inputTokens: items.reduce((n, row) => n + row.inputTokens, 0), outputTokens: items.reduce((n, row) => n + row.outputTokens, 0),
    estimatedUncachedTokenCostUsd: Number(items.reduce((n, row) => n + row.estimatedUncachedTokenCostUsd, 0).toFixed(6)),
  });
  return { rows, allAttempts: sum(rows), byModel: Object.fromEntries(Object.keys(prices).map((model) => [model, sum(rows.filter((row) => row.model === model))])),
    offlineDiagnostic: {
      capturedCandidates: rows.filter(({ diagnostics }) => diagnostics !== null).length,
      originallyVerifiedAmongCaptured: rows.filter(({ diagnostics }) => diagnostics?.originalCode === "PROVENANCE_SPANS_VERIFIED").length,
      counterfactuallyVerifiedAmongCaptured: rows.filter(({ diagnostics }) => diagnostics?.counterfactualCode === "PROVENANCE_SPANS_VERIFIED").length,
      stillMissingDecisionCitation: rows.filter(({ diagnostics }) => diagnostics?.counterfactualCode === "DECISION_EVIDENCE_REQUIRED").length,
      runtimeChanged: false, clinicalCorrectnessMeasured: false,
    },
  };
}

const args = process.argv.slice(2);
if (args.length !== 1 || !["--export", "--verify"].includes(args[0])) throw new Error("Use --export (local receipts) or --verify (public artifact; no keys needed)");
if (args[0] === "--export") {
  const root = "tmp/cqa-research";
  const ledger = readFileSync(join(root, "reservations.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  const runs = runIds.map((runId) => {
    const directory = join(root, runId);
    const observations = readFileSync(join(directory, "provider-observations.jsonl"), "utf8").trim().split("\n").map((line) => observationSchema.parse(JSON.parse(line)));
    const manifest = manifestSchema.parse(JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")));
    if (manifest.rubricSha256 !== digest(CQA_CRITERIA)) throw new Error("RUBRIC_CHANGED_SINCE_PILOT");
    const cases = [...new Set(observations.map(({ episodeId }) => episodeId))].map((episodeId) => ({
      episode: researchFixtures().find(({ episode }) => episode.episodeId === episodeId)!.episode,
      report: JSON.parse(readFileSync(join(directory, `${episodeId}.json`), "utf8")),
    }));
    return runSchema.parse({ runId, diagnosticRepeat: runId.includes("diagnostic"), manifest, observations, cases, reservations: ledger.filter((entry) => entry.experimentId === runId) });
  });
  const artifact = {
    version: "cqa-provider-pilot/v1", date: "2026-09-08", syntheticOnly: true,
    boundary: "Purposive integration pilot: two episodes, no independent clinical reference. Not HealthBench, clinical accuracy, lift, harm measurement, or deployment validation. Original failures and diagnostic repeat retained.",
    rubric: CQA_CRITERIA, prices, pricesVerifiedOn: "2026-09-08",
    costBasis: "Standard uncached token estimate from provider-reported usage. Not an invoice or actual billed cost; excludes unrelated programs.",
    reservedUsd: runs.reduce((total, run) => total + run.reservations.reduce((n, row) => n + row.reservedUsd, 0), 0), actualBilledUsd: null,
    runs, summary: summarize(runs),
  };
  const bytes = JSON.stringify({ ...artifact, artifactSha256: digest(artifact) }, null, 2) + "\n";
  if (existsSync(path)) {
    if (readFileSync(path, "utf8") !== bytes) throw new Error("IMMUTABLE_ARTIFACT_EXISTS; choose a new version, do not overwrite");
  } else writeFileSync(path, bytes, { flag: "wx" });
  console.log(JSON.stringify({ artifact: path, ...artifact.summary.allAttempts, reservedUsd: artifact.reservedUsd, actualBilledUsd: null }));
} else {
  const { artifactSha256, ...artifact } = JSON.parse(readFileSync(path, "utf8"));
  if (artifactSha256 !== digest(artifact)) throw new Error("ARTIFACT_HASH_MISMATCH");
  const runs = z.array(runSchema).parse(artifact.runs);
  if (JSON.stringify(runs) !== JSON.stringify(artifact.runs)) throw new Error("NON_ALLOWLISTED_RECEIPT_FIELDS");
  if (digest(prices) !== digest(artifact.prices) || runs.some((run) => digest(artifact.rubric) !== run.manifest.rubricSha256)) throw new Error("PRICING_OR_RUBRIC_MISMATCH");
  if (JSON.stringify(summarize(runs)) !== JSON.stringify(artifact.summary)) throw new Error("SUMMARY_REPLAY_MISMATCH");
  console.log(JSON.stringify({ verified: path, providerCallsMade: 0, ...artifact.summary.allAttempts }));
}
