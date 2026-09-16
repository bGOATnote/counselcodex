/** Offline, append-only comparison. This module never opens the assignment CSV or calls a provider. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BUCKETS, SYSTEM_PROMPT } from "./stripped-3bucket-baseline.mjs";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const IDS = Object.freeze(Array.from({ length: 50 }, (_, i) => `C${String(i + 1).padStart(2, "0")}`));
export const ROUTE_TO_BUCKET = Object.freeze({
  SELF_CARE: "SELF_CARE", PRIORITY_ASYNC: "ASYNC_PHYSICIAN", STANDARD_ASYNC: "ASYNC_PHYSICIAN",
  SAME_DAY_IN_PERSON: "URGENT_ESCALATION", EMERGENCY_NOW: "URGENT_ESCALATION",
});
export const DEFAULTS = Object.freeze({
  xhigh: join(ROOT, "outputs/stripped-3bucket-astra-xhigh-2026-09-15"),
  max: join(ROOT, "outputs/stripped-3bucket-astra-max-2026-09-15"),
  fable: join(ROOT, "outputs/stripped-3bucket-fable-2026-09-15"),
  reference: join(ROOT, "data/evaluation/physician-system-reference-v2.json"),
  output: join(ROOT, "outputs/stripped-3bucket-astra-comparison-2026-09-15"),
});
const sha256 = value => createHash("sha256").update(value).digest("hex");
const readJSON = path => JSON.parse(readFileSync(path, "utf8"));
const displayPath = path => relative(ROOT, resolve(path));

function verifyIds(rows, label) {
  assert.equal(rows.length, 50, `${label}: expected all 50 cases`);
  assert.deepEqual(rows.map(row => row.id), IDS, `${label}: omitted, duplicate or reordered case`);
}

export function parseRawDisposition(response, provider) {
  let blocks;
  if (provider === "openai") {
    assert.equal(response.status, "completed", "Incomplete OpenAI response");
    assert.equal(response.error ?? null, null, "Provider response has an error");
    const messages = (response.output ?? []).filter(item => item.type === "message");
    assert.equal(messages.length, 1, "Expected one final assistant message");
    assert.equal(messages[0].role, "assistant");
    assert.ok(!(response.output ?? []).some(item => !["reasoning", "message"].includes(item.type)), "Unexpected tool or output item");
    assert.ok(messages[0].content.every(item => item.type === "output_text"), "Refusal or non-text output");
    blocks = messages[0].content.map(item => item.text);
  } else {
    assert.equal(provider, "anthropic");
    assert.equal(response.stop_reason, "end_turn", "Incomplete Anthropic response");
    blocks = (response.content ?? []).filter(item => item.type === "text").map(item => item.text);
  }
  const text = blocks.join("\n").trim();
  const parsed = JSON.parse(text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```$/, ""));
  assert.deepEqual(Object.keys(parsed).sort(), ["disposition", "rationale"], "Unexpected output contract");
  assert.ok(BUCKETS.includes(parsed.disposition), "Invalid disposition");
  assert.equal(typeof parsed.rationale, "string");
  assert.ok(parsed.rationale.trim(), "Missing rationale");
  return parsed;
}

/** No reference access is possible until callers have verified both Astra freezes. */
export function verifyFreeze(directory) {
  const completePath = join(directory, "generation-complete.json");
  const complete = readJSON(completePath);
  assert.equal(complete.providerCalls, 50, "Expected 50 one-shot provider calls");
  assert.ok(Number.isFinite(Date.parse(complete.completedAt)), "Invalid generation completion time");
  assert.ok(Array.isArray(complete.failedCases));
  assert.equal(new Set(complete.failedCases).size, complete.failedCases.length);
  assert.equal(complete.validDispositions + complete.failedCases.length, 50);
  const hashes = complete.artifactHashes;
  assert.ok(hashes && typeof hashes === "object", "Missing frozen artifact hashes");
  for (const id of IDS) for (const kind of ["request", "raw", "parsed"]) {
    assert.match(hashes[`${id}-${kind}.json`] ?? "", /^[a-f0-9]{64}$/, `Unfrozen ${id}-${kind}.json`);
  }
  for (const [name, hash] of Object.entries(hashes)) {
    assert.ok(name && !name.includes("/") && !name.includes("\\") && name !== "..", "Invalid frozen artifact path");
    assert.equal(sha256(readFileSync(join(directory, name))), hash, `Frozen artifact drift: ${name}`);
  }
  return { directory, complete, completionSHA256: sha256(readFileSync(completePath)), verifiedArtifactCount: Object.keys(hashes).length };
}

function verifyRequest(body, manifest, message, provider, effort) {
  if (provider === "openai") {
    assert.deepEqual(manifest.settings, { model: "gpt-6-astra", max_output_tokens: 4096, reasoning: { effort }, store: false });
    assert.equal(body.instructions, SYSTEM_PROMPT);
    assert.deepEqual(body.input, [{ role: "user", content: message }], "Input must be one exact patient message");
    assert.equal(body.reasoning?.effort, effort);
    assert.equal(body.store, false);
    // Only the native Responses envelope is permitted. No tools, history, response-schema instructions or labels.
    assert.deepEqual(body, { ...manifest.settings, instructions: SYSTEM_PROMPT, input: [{ role: "user", content: message }] });
  } else {
    assert.deepEqual(manifest.settings, { model: "claude-fable-5-1", max_tokens: 4096, thinking: { type: "adaptive" }, output_config: { effort: "low" } });
    assert.equal(body.system, SYSTEM_PROMPT);
    assert.deepEqual(body.messages, [{ role: "user", content: message }]);
    assert.equal(body.output_config?.effort, "low");
    assert.deepEqual(body, { ...manifest.settings, system: SYSTEM_PROMPT, messages: [{ role: "user", content: message }] });
  }
  assert.equal(body.model, manifest.settings.model);
  for (const forbidden of ["tools", "previous_response_id", "conversation", "metadata"]) {
    assert.equal(body[forbidden], undefined, `Unexpected request field: ${forbidden}`);
  }
}

export function loadFrozenRun(frozen, { provider, effort }) {
  const { directory, complete } = frozen;
  const manifest = readJSON(join(directory, "manifest.json"));
  assert.equal(manifest.systemPrompt, SYSTEM_PROMPT, "Frozen system prompt changed");
  assert.equal(manifest.promptSHA256, sha256(SYSTEM_PROMPT));
  assert.equal(readFileSync(join(directory, "system-prompt.txt"), "utf8"), SYSTEM_PROMPT + "\n");
  verifyIds(manifest.cases, "Manifest");
  const requestIds = [], responseIds = [], returnedModels = [];
  const predictions = manifest.cases.map(c => {
    assert.deepEqual(Object.keys(c).sort(), ["id", "inputSHA256", "message"], "Manifest must contain messages only");
    assert.equal(typeof c.message, "string");
    assert.ok(c.message.trim());
    assert.equal(c.inputSHA256, sha256(c.message));
    const request = readJSON(join(directory, `${c.id}-request.json`));
    assert.equal(request.id, c.id);
    assert.equal(request.inputSHA256, c.inputSHA256);
    verifyRequest(request.body, manifest, c.message, provider, effort);
    const raw = readJSON(join(directory, `${c.id}-raw.json`));
    const record = readJSON(join(directory, `${c.id}-parsed.json`));
    assert.equal(raw.id, c.id);
    assert.equal(record.id, c.id);
    assert.equal(record.providerCalls, 1);
    assert.ok(Number.isFinite(raw.latencyMs) && raw.latencyMs >= 0);
    if (raw.requestId) requestIds.push(raw.requestId);
    let expected = null, response = null;
    try {
      assert.equal(raw.status, 200);
      response = JSON.parse(raw.responseText);
      if (provider === "openai") {
        assert.match(response.model, /^gpt-6-astra(?:-\d{4}-\d{2}-\d{2})?$/, "Unexpected response model");
        assert.equal(response.reasoning?.effort, effort, "Unexpected response effort");
      } else assert.equal(response.model, manifest.settings.model);
      expected = parseRawDisposition(response, provider);
    } catch {
      assert.ok(record.failure, `Unrecorded failed response: ${c.id}`);
    }
    if (response?.id) responseIds.push(response.id);
    if (response?.model) returnedModels.push(response.model);
    if (provider === "openai" && response) {
      assert.equal(record.model, response.model);
      assert.equal(record.responseId, response.id);
      assert.equal(record.responseEffort, response.reasoning?.effort ?? null);
      assert.deepEqual(record.usage, response.usage ?? null);
    }
    if (expected !== null) {
      assert.ok(raw.requestId, `Missing provider request ID: ${c.id}`);
      assert.ok(response.id, `Missing provider response ID: ${c.id}`);
      assert.deepEqual(record.usage, response.usage);
    }
    assert.deepEqual(record.parsed, expected, `Parsed output does not match raw: ${c.id}`);
    assert.equal(record.failure === null, expected !== null);
    return { id: c.id, message: c.message, parsed: record.parsed, failure: record.failure, usage: record.usage, latencyMs: raw.latencyMs };
  });
  assert.equal(new Set(requestIds).size, requestIds.length, "Reused provider request ID");
  assert.equal(new Set(responseIds).size, responseIds.length, "Reused provider response ID");
  assert.deepEqual(predictions.filter(row => row.parsed === null).map(row => row.id), complete.failedCases);
  assert.equal(predictions.filter(row => row.parsed !== null).length, complete.validDispositions);
  return { ...frozen, manifest, provider, effort, predictions, requestIds, responseIds, returnedModels: [...new Set(returnedModels)].sort() };
}

export function scorePhysician(predictions, reference) {
  verifyIds(predictions, "Predictions");
  assert.equal(reference.cases.length, 50, "Reference must retain all 50 cases");
  assert.equal(new Set(reference.cases.map(row => row.id)).size, 50);
  const rows = predictions.map(({ id, parsed }) => {
    assert.ok(parsed === null || BUCKETS.includes(parsed?.disposition), `Invalid prediction: ${id}`);
    const entry = reference.cases.find(row => row.id === id);
    assert.ok(entry, `Missing physician case: ${id}`);
    const acceptedRoutes = entry.reference.acceptedRoutes;
    if (id === "C25") {
      assert.ok(acceptedRoutes === null || (Array.isArray(acceptedRoutes) && acceptedRoutes.length === 0), "C25 must remain unresolved");
      return { id, disposition: parsed?.disposition ?? null, acceptedRoutes, acceptedBuckets: null, included: false, agrees: null };
    }
    assert.ok(Array.isArray(acceptedRoutes) && acceptedRoutes.length > 0, `Missing physician routes: ${id}`);
    assert.ok(acceptedRoutes.every(route => Object.hasOwn(ROUTE_TO_BUCKET, route)), `Unknown physician route: ${id}`);
    const acceptedBuckets = [...new Set(acceptedRoutes.map(route => ROUTE_TO_BUCKET[route]))];
    return { id, disposition: parsed?.disposition ?? null, acceptedRoutes, acceptedBuckets, included: true, agrees: acceptedBuckets.includes(parsed?.disposition ?? null) };
  });
  const agree = rows.filter(row => row.agrees === true).length;
  const missIds = rows.filter(row => row.included && !row.agrees).map(row => row.id);
  assert.equal(rows.filter(row => row.included).length, 49);
  return { scorecard: "A", reference: "physician-system-reference-v2 acceptedRoutes mapped to three buckets", mapping: ROUTE_TO_BUCKET, agree, denominator: 49, agreement: agree / 49, missCount: missIds.length, missIds, excludedIds: ["C25"], rows };
}

function metricSummary(run, scorecard) {
  const latencies = run.predictions.map(row => row.latencyMs).sort((a, b) => a - b);
  return {
    source: displayPath(run.directory), model: run.manifest.settings.model, returnedModels: run.returnedModels, effort: run.effort,
    providerCalls: 50, validDispositions: run.complete.validDispositions, failedCases: run.complete.failedCases,
    physicianAgree: scorecard.agree, physicianDenominator: 49, missIds: scorecard.missIds,
    medianLatencyMs: (latencies[24] + latencies[25]) / 2,
    p95NearestRankLatencyMs: latencies[Math.ceil(0.95 * latencies.length) - 1],
    estimatedUSD: run.complete.estimatedUSD ?? null, accountedUSD: run.complete.accountedUSD ?? null,
    usage: run.complete.usage ?? null, pricing: run.manifest.pricing ?? null,
    completedAt: run.complete.completedAt,
  };
}

export function comparePair(leftKey, rightKey, rows, metrics) {
  const different = rows.filter(row => row[leftKey].disposition !== row[rightKey].disposition);
  const left = metrics[leftKey], right = metrics[rightKey];
  const delta = field => typeof left[field] === "number" && typeof right[field] === "number" ? left[field] - right[field] : null;
  const ratio = field => typeof left[field] === "number" && typeof right[field] === "number" && right[field] !== 0 ? left[field] / right[field] : null;
  return {
    left: leftKey, right: rightKey, disagreementIds: different.map(row => row.id),
    gainsForLeftIds: different.filter(row => row[leftKey].agrees === true && row[rightKey].agrees === false).map(row => row.id),
    lossesForLeftIds: different.filter(row => row[leftKey].agrees === false && row[rightKey].agrees === true).map(row => row.id),
    bothAgreeDespiteDifferentBucketIds: different.filter(row => row[leftKey].agrees === true && row[rightKey].agrees === true).map(row => row.id),
    bothMissDifferentBucketIds: different.filter(row => row[leftKey].agrees === false && row[rightKey].agrees === false).map(row => row.id),
    excludedDisagreementIds: different.filter(row => !row.included).map(row => row.id),
    physicianAgreeDelta: delta("physicianAgree"), estimatedUSDDelta: delta("estimatedUSD"),
    accountedUSDDelta: delta("accountedUSD"), medianLatencyMsDelta: delta("medianLatencyMs"), p95NearestRankLatencyMsDelta: delta("p95NearestRankLatencyMs"),
    estimatedUSDRatio: ratio("estimatedUSD"), medianLatencyRatio: ratio("medianLatencyMs"), p95NearestRankLatencyRatio: ratio("p95NearestRankLatencyMs"),
  };
}

const quoteCSV = value => `"${String(value ?? "").replaceAll('"', '""')}"`;
export function comparisonCSV(rows) {
  const columns = ["id", "message", "physicianIncluded", "acceptedRoutes", "acceptedBuckets",
    ...["astraXhigh", "astraMax", "fable"].flatMap(key => [`${key}Disposition`, `${key}Rationale`, `${key}PhysicianAgrees`, `${key}Failure`, `${key}LatencyMs`]),
    "astraXhighVsFableDisagree", "astraMaxVsFableDisagree", "astraMaxVsXhighDisagree"];
  const data = rows.map(row => ({
    id: row.id, message: row.message, physicianIncluded: row.included,
    acceptedRoutes: row.acceptedRoutes?.join("|") ?? "UNRESOLVED", acceptedBuckets: row.acceptedBuckets?.join("|") ?? "UNRESOLVED",
    ...Object.fromEntries(["astraXhigh", "astraMax", "fable"].flatMap(key => [
      [`${key}Disposition`, row[key].disposition ?? "FAILED"], [`${key}Rationale`, row[key].rationale],
      [`${key}PhysicianAgrees`, row[key].agrees === null ? "UNSCORED" : row[key].agrees],
      [`${key}Failure`, row[key].failure], [`${key}LatencyMs`, row[key].latencyMs],
    ])),
    astraXhighVsFableDisagree: row.astraXhigh.disposition !== row.fable.disposition,
    astraMaxVsFableDisagree: row.astraMax.disposition !== row.fable.disposition,
    astraMaxVsXhighDisagree: row.astraMax.disposition !== row.astraXhigh.disposition,
  }));
  return [columns.join(","), ...data.map(row => columns.map(key => quoteCSV(row[key])).join(","))].join("\r\n") + "\r\n";
}

function fenced(text) {
  const fence = "`".repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map(match => match[0].length + 1)));
  return `${fence}text\n${text}\n${fence}`;
}
const label = { astraXhigh: "Astra xhigh", astraMax: "Astra max", fable: "Fable 5.1 low" };
const ids = values => values.join(", ") || "None";
const dollars = value => value === null ? "Unavailable" : `$${value.toFixed(6)}`;
export function comparisonMarkdown(comparison) {
  const lines = ["# Frozen three-bucket Astra comparison — 2026-09-15", "",
    "Physician accepted routes are the only scored reference. C25 remains unresolved and excluded from the fixed denominator of 49; every model still receives all 50 messages. Original CSV labels are not used or scored by this comparison. The physician reference JSON retains historical CSV label fields; scoring projects only acceptedRoutes.", "",
    "Both Astra runs were complete and all frozen request/raw/parsed hashes were verified before the physician reference was opened. The system prompt is unchanged. Outputs are one-shot; failures count against agreement. Historical runs and the live application are unchanged.", "",
    "| Run | Physician agreement | Valid outputs | Median latency | p95 latency | Estimated cost | Accounted cost |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...Object.entries(comparison.metrics).map(([key, value]) => `| ${label[key]} | ${value.physicianAgree}/49 | ${value.validDispositions}/50 | ${(value.medianLatencyMs / 1000).toFixed(3)} s | ${(value.p95NearestRankLatencyMs / 1000).toFixed(3)} s | ${dollars(value.estimatedUSD)} | ${dollars(value.accountedUSD)} |`),
    "", "Costs use each frozen run's documented pricing and accounting assumptions; they are estimates, not invoices. p95 uses nearest rank. Model and effort differ across providers, so this is a candidate comparison on known cases, not an isolated effort ablation across providers.", "",
    "## Exact disposition disagreements", "",
    "The following table contains every case where at least two runs selected different buckets. `disagreements.csv` retains each exact message and all three short rationales for these cases; the complete case text also appears below.", "",
    "| Case | Physician accepted buckets | Astra xhigh | Astra max | Fable 5.1 low |",
    "| --- | --- | --- | --- | --- |",
    ...comparison.rows.filter(row => comparison.allDisagreementIds.includes(row.id)).map(row => `| ${row.id} | ${row.acceptedBuckets?.join(", ") ?? "UNRESOLVED"} | ${row.astraXhigh.disposition ?? "FAILED"} | ${row.astraMax.disposition ?? "FAILED"} | ${row.fable.disposition ?? "FAILED"} |`), "",
    ...Object.values(comparison.pairwise).flatMap(pair => [
      `### ${label[pair.left]} versus ${label[pair.right]}`, "",
      `- Different bucket (${pair.disagreementIds.length}/50): ${ids(pair.disagreementIds)}.`,
      `- Physician gains for ${label[pair.left]}: ${ids(pair.gainsForLeftIds)}.`,
      `- Physician losses for ${label[pair.left]}: ${ids(pair.lossesForLeftIds)}.`,
      `- Both agree despite a different accepted bucket: ${ids(pair.bothAgreeDespiteDifferentBucketIds)}.`,
      `- Both miss with different buckets: ${ids(pair.bothMissDifferentBucketIds)}.`,
      `- Unresolved excluded disagreements: ${ids(pair.excludedDisagreementIds)}.`,
      `- Agreement delta: ${pair.physicianAgreeDelta >= 0 ? "+" : ""}${pair.physicianAgreeDelta}/49; median latency delta ${(pair.medianLatencyMsDelta / 1000).toFixed(3)} s; estimated cost delta ${dollars(pair.estimatedUSDDelta)}.`, "",
    ]),
    "## Physician misses", "", ...Object.entries(comparison.metrics).map(([key, value]) => `- ${label[key]}: ${ids(value.missIds)}.`), "",
    "## Interpretation limits", "",
    "These are known development cases with one sample per model/effort. Higher agreement does not establish a better clinical policy, including contested OTC/self-care decisions, and is not a clinical readiness or statistical superiority claim. Rationale correctness is not separately scored. The three-bucket mapping merges same-day and emergency care. A better count makes a candidate worth independent validation; it does not automatically promote or replace the GUI model.", "",
    "## Every exact case, disposition and short rationale", "",
  ];
  for (const row of comparison.rows) {
    lines.push(`### ${row.id}${comparison.allDisagreementIds.includes(row.id) ? " — models disagree" : ""}`, "", "Exact patient message:", "", fenced(row.message), "",
      `Physician accepted routes: ${row.acceptedRoutes?.join(", ") ?? "UNRESOLVED"}. Mapped buckets: ${row.acceptedBuckets?.join(", ") ?? "UNRESOLVED (excluded)"}.`, "");
    for (const key of ["astraXhigh", "astraMax", "fable"]) {
      const value = row[key];
      lines.push(`**${label[key]} — ${value.disposition ?? "FAILED"}; physician ${value.agrees === null ? "unscored" : value.agrees ? "agree" : "miss"}.**`, "", fenced(value.rationale ?? value.failure ?? "No output."), "");
    }
  }
  return lines.join("\n");
}

function writeAppendOnly(directory, files) {
  // Validate every existing file before adding missing files. No existing artifact is overwritten.
  for (const [name, content] of Object.entries(files)) if (existsSync(join(directory, name))) {
    assert.equal(readFileSync(join(directory, name), "utf8"), content, `Existing derived artifact differs: ${name}`);
  }
  mkdirSync(directory, { recursive: true });
  for (const [name, content] of Object.entries(files)) if (!existsSync(join(directory, name))) {
    writeFileSync(join(directory, name), content, { flag: "wx", mode: 0o600 });
  }
}

export function scoreComparison(options = {}) {
  const paths = { ...DEFAULTS, ...options };
  // Critical ordering: BOTH completion files and all hashes must verify before gold can be opened.
  const xhighFreeze = verifyFreeze(paths.xhigh);
  const maxFreeze = verifyFreeze(paths.max);
  const fableFreeze = verifyFreeze(paths.fable);
  const runs = {
    astraXhigh: loadFrozenRun(xhighFreeze, { provider: "openai", effort: "xhigh" }),
    astraMax: loadFrozenRun(maxFreeze, { provider: "openai", effort: "max" }),
    fable: loadFrozenRun(fableFreeze, { provider: "anthropic", effort: "low" }),
  };
  for (const run of Object.values(runs)) {
    assert.deepEqual(run.manifest.cases, runs.fable.manifest.cases, "Different exact input messages");
    assert.equal(run.manifest.csvSHA256, runs.fable.manifest.csvSHA256, "Different source CSV hash");
  }
  const requestIds = Object.values(runs).flatMap(run => run.requestIds);
  const responseIds = Object.values(runs).flatMap(run => run.responseIds);
  assert.equal(new Set(requestIds).size, requestIds.length, "Provider request reused across runs");
  assert.equal(new Set(responseIds).size, responseIds.length, "Provider response reused across runs");
  // First and only physician-reference read happens here, after generation and payload integrity checks.
  const referenceText = readFileSync(paths.reference, "utf8");
  const reference = JSON.parse(referenceText);
  assert.equal(reference.datasetSha256, runs.fable.manifest.csvSHA256);
  for (const c of runs.fable.manifest.cases) {
    const entry = reference.cases.find(row => row.id === c.id);
    assert.equal(entry?.message, c.message, `Physician message differs: ${c.id}`);
    assert.equal(entry?.inputHash, c.inputSHA256, `Physician input hash differs: ${c.id}`);
  }
  const scorecards = Object.fromEntries(Object.entries(runs).map(([key, run]) => [key, scorePhysician(run.predictions, reference)]));
  const metrics = Object.fromEntries(Object.entries(runs).map(([key, run]) => [key, metricSummary(run, scorecards[key])]));
  const rows = runs.fable.manifest.cases.map((c, index) => ({
    id: c.id, message: c.message, inputSHA256: c.inputSHA256,
    acceptedRoutes: scorecards.fable.rows[index].acceptedRoutes, acceptedBuckets: scorecards.fable.rows[index].acceptedBuckets,
    included: scorecards.fable.rows[index].included,
    ...Object.fromEntries(Object.entries(runs).map(([key, run]) => {
      const prediction = run.predictions[index];
      return [key, { disposition: prediction.parsed?.disposition ?? null, rationale: prediction.parsed?.rationale ?? null,
        failure: prediction.failure, agrees: scorecards[key].rows[index].agrees, latencyMs: prediction.latencyMs, usage: prediction.usage }];
    })),
  }));
  const pairwise = {
    astraXhighVsFable: comparePair("astraXhigh", "fable", rows, metrics),
    astraMaxVsFable: comparePair("astraMax", "fable", rows, metrics),
    astraMaxVsXhigh: comparePair("astraMax", "astraXhigh", rows, metrics),
  };
  const comparison = {
    protocol: "stripped-3bucket-astra-comparison/v1", promptSHA256: sha256(SYSTEM_PROMPT),
    physicianReference: { path: displayPath(paths.reference), SHA256: sha256(referenceText), datasetSHA256: reference.datasetSha256 },
    assignmentCSVFileRead: false, csvLabelsUsedForScoring: false, csvAgreementScored: false, referenceReadOnlyAfterBothAstraFreezesVerified: true,
    metrics, pairwise, allDisagreementIds: IDS.filter(id => Object.values(pairwise).some(pair => pair.disagreementIds.includes(id))), rows,
  };
  const audit = {
    protocol: comparison.protocol, scorerSHA256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    referenceReadOnlyAfterBothAstraFreezesVerified: true, assignmentCSVFileRead: false, csvLabelsUsedForScoring: false, csvAgreementScored: false,
    exactMessageOnlyPayloadsVerified: 150, parsedOutputsMatchRaw: 150,
    uniqueProviderRequestIds: requestIds.length, uniqueProviderResponseIds: responseIds.length,
    frozenArtifactCount: Object.values(runs).reduce((sum, run) => sum + run.verifiedArtifactCount, 0),
    freezes: Object.fromEntries(Object.entries(runs).map(([key, run]) => [key, { path: displayPath(run.directory), completionSHA256: run.completionSHA256, completedAt: run.complete.completedAt }])),
    physicianReference: comparison.physicianReference,
  };
  const json = value => JSON.stringify(value, null, 2) + "\n";
  writeAppendOnly(paths.output, {
    "comparison.json": json(comparison), "all-case-comparison.csv": comparisonCSV(rows),
    "disagreements.csv": comparisonCSV(rows.filter(row => comparison.allDisagreementIds.includes(row.id))),
    "COMPARISON.md": comparisonMarkdown(comparison), "scoring-audit.json": json(audit),
    ...Object.fromEntries(Object.entries(scorecards).map(([key, value]) => [`scorecard-A-${key}.json`, json(value)])),
  });
  return { comparison, audit, scorecards };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { comparison, audit } = scoreComparison();
  console.log(JSON.stringify({ metrics: comparison.metrics, pairwise: comparison.pairwise, audit }, null, 2));
}
