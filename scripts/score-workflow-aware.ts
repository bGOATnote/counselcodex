/** Offline developmental evaluation. No provider calls, clinical judging, or promotion. */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { computeMetrics, compareArms } from "./score-fn-reduction.mjs";
import { accountUsage, fileHash, ledgerState, readJSON, sha256 } from "../src/research/workflow-aware/budget.ts";
import { PROTOCOL_ADAPTER, BUCKETS, type Disposition } from "../src/research/workflow-aware/protocol.ts";
import { verifyFrozenStudy, OWN_SOURCES, type Manifest, type Job, type ParsedRecord } from "../src/research/workflow-aware/runner.ts";
import { NANO_RUNTIME_VERSION, NANO_TEMPLATE_SHA256, type RawResponse } from "../src/research/workflow-aware/transport.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
type ReferenceCase = { id: string; acceptedBuckets: string[]; message?: string; inputSHA256?: string; [key: string]: unknown };
type GenerationFreeze = { schema: string; studyId: string; completedAt: string; plannedJobs: number; providerCalls: number; validOutputs: number; failedJobs: string[]; accountedUSD: number; usageKnown: boolean; artifactHashes: Record<string, string>; ledgerEventHashes: Record<string, string> };
type ReferenceFreeze = { schema: string; frozenAt: string; generationStartedAtFreeze: false;
  known: { path: string; sha256: string; expectedCases: number; status: string };
  challenge: { path: string; sha256: string; messagesPath: string; messagesSHA256: string; expectedCases: number; status: string } };
export type VerifiedRecord = Job & { id: string; message: string; parsed: Disposition | null; failure: string | null; usage: unknown; latencyMs: number; beganAt: string; completedAt: string; requestId: string | null; responseId: string | null; accountedUSD: number; estimatedUSD: number | null; usageKnown: boolean };
type Group = { cohort: string; phase: string; model: string; arm: string; replicate: number; records: VerifiedRecord[] };
const object = (x: unknown): Record<string, unknown> => { assert(x !== null && typeof x === "object" && !Array.isArray(x), "Expected an object"); return x as Record<string, unknown>; };
const stamp = (x: string) => { const n = Date.parse(x); assert(Number.isFinite(n), "Invalid timestamp"); return n; };
const sorted = (x: string[]) => [...x].sort();
const exactKeys = (value: object, keys: string[], label: string) => assert.deepEqual(sorted(Object.keys(value)), sorted(keys), `${label}: unexpected fields`);
function inside(root: string, name: string) {
  assert(typeof name === "string" && name.length > 0 && !isAbsolute(name), "Artifact path must be relative");
  const path = resolve(root, name), rel = relative(root, path);
  assert(rel && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), "Artifact path escapes its directory");
  return path;
}
const hashArtifacts = (dir: string, hashes: Record<string, string>) => {
  for (const [name, hash] of Object.entries(hashes)) { assert.match(hash, /^[a-f0-9]{64}$/); assert.equal(fileHash(inside(dir, name)), hash, `Frozen artifact changed: ${name}`); }
};
const metadataKeys = (manifest: Manifest) => manifest.config.models.flatMap(model => manifest.config.arms.map(arm => `${model}/${arm}`));

/** This entire verification pass precedes all clinical-reference reads. Incomplete schedules are refused. */
export function verifyWorkflowGeneration(outputDir: string, root = ROOT) {
  outputDir = resolve(outputDir);
  assert(existsSync(join(outputDir, "generation-complete.json")), "Generation is not finalized; no clinical score may be computed for a partial schedule");
  const complete = readJSON(join(outputDir, "generation-complete.json")) as GenerationFreeze;
  assert.equal(complete.schema, "workflow-aware-generation-freeze/v1");
  const earlyManifest = readJSON(join(outputDir, "manifest.json")) as Manifest;
  // A generation manifest must not point the verifier at labels or scorecards.
  for (const path of Object.keys({ ...earlyManifest.inputFiles, ...earlyManifest.sourceHashes })) {
    assert(!/(?:physician-adjudication|challenge-review-targets|proposed-reference|scorecard|reference-freeze|review-targets)/i.test(path), "Clinical reference file leaked into generation inputs");
  }
  const { manifest, budget, manifestSHA256 } = verifyFrozenStudy(outputDir, PROTOCOL_ADAPTER, root);
  assert.equal(complete.studyId, manifest.studyId);
  assert.equal(complete.plannedJobs, manifest.jobs.length);
  assert.equal(complete.providerCalls, manifest.jobs.length, "Missing planned jobs must not disappear from the denominator");
  assert(stamp(complete.completedAt) >= stamp(manifest.frozenAt));
  assert(stamp(complete.completedAt) <= Date.now(), "Generation freeze has not occurred yet");
  const requiredSources = [...OWN_SOURCES, ...PROTOCOL_ADAPTER.sourceFiles];
  for (const path of requiredSources) assert(Object.hasOwn(manifest.sourceHashes, path), `Required implementation source not frozen: ${path}`);
  for (const path of Object.keys(manifest.sourceHashes)) inside(root, path);
  exactKeys(manifest.protocolMetadata, metadataKeys(manifest), "Protocol metadata");
  for (const model of manifest.config.models) for (const arm of manifest.config.arms)
    assert.deepEqual(manifest.protocolMetadata[`${model}/${arm}`], PROTOCOL_ADAPTER.protocolMetadata({ model, arm }), "Frozen prompt/settings metadata differs from implementation");
  const batches = readdirSync(join(outputDir, "batches")).sort();
  const lifecycle = readdirSync(join(outputDir, "lifecycle")).sort();
  const required = ["manifest.json", "plan-complete.json", manifest.runtime.packageLockPath, ...manifest.config.models.map(m => `preflight-${m}.json`),
    ...manifest.jobs.flatMap(j => [j.requestPath, `raw/${j.jobId}.json`, `parsed/${j.jobId}.json`]), ...batches.map(n => `batches/${n}`), ...lifecycle.map(n => `lifecycle/${n}`)];
  assert.deepEqual(sorted(Object.keys(complete.artifactHashes)), sorted(required), "Generation freeze omits or adds artifacts");
  hashArtifacts(outputDir, complete.artifactHashes);
  for (const kind of ["raw", "parsed"]) assert.deepEqual(readdirSync(join(outputDir, kind)).sort(), manifest.jobs.map(j => `${j.jobId}.json`).sort(), `Unexpected ${kind} result set`);

  const packets = new Map<string, { evidenceText: string; evidenceMetadata: unknown }>();
  if (manifest.inputs.evidencePath) {
    const bundle = object(readJSON(inside(root, manifest.inputs.evidencePath)));
    assert.equal(bundle.schema, "workflow-aware-evidence-packets/v1"); assert(Array.isArray(bundle.packets));
    for (const item of bundle.packets) {
      const packet = object(item); assert.equal(typeof packet.inputSHA256, "string"); assert.equal(typeof packet.evidenceText, "string");
      assert(!packets.has(packet.inputSHA256 as string), "Duplicate evidence packet");
      packets.set(packet.inputSHA256 as string, { evidenceText: packet.evidenceText as string, evidenceMetadata: packet.evidenceMetadata });
    }
    assert.deepEqual(sorted([...packets.keys()]), sorted([...new Set(manifest.messages.map(m => sha256(m.message)))]));
  }
  const expectedLedger = manifest.jobs.flatMap(j => ["start", "settlement"].map(kind => relative(root, join(budget.ledgerPath, `${manifest.studyId}--${j.jobId}-${kind}.json`))));
  assert.deepEqual(sorted(Object.keys(complete.ledgerEventHashes)), sorted(expectedLedger), "Generation freeze omits ledger events");
  hashArtifacts(root, complete.ledgerEventHashes);
  if (manifest.config.models.includes("nano")) {
    const nanoHashes = Object.fromEntries(manifest.jobs.filter(j => j.model === "nano").map(j => [`parsed/${j.jobId}.json`, fileHash(join(outputDir, "parsed", `${j.jobId}.json`))]));
    assert(lifecycle.some(name => {
      const receipt = object(readJSON(join(outputDir, "lifecycle", name)));
      if (receipt.studyId !== manifest.studyId || receipt.done !== true || receipt.doneReason !== "unload") return false;
      try { assert.deepEqual(receipt.parsedArtifactHashes, nanoHashes); return true; } catch { return false; }
    }), "Nano unload receipt does not cover the finalized local jobs");
  }
  const state = ledgerState(budget);
  const records: VerifiedRecord[] = manifest.jobs.map(job => {
    const message = manifest.messages.find(m => m.id === job.caseId)!.message;
    const request = object(readJSON(join(outputDir, job.requestPath)));
    const { requestPath: _path, requestSHA256: _hash, promptSHA256: _prompt, ...requestIdentity } = job;
    const packet = job.arm === "workflow_evidence" ? packets.get(job.inputSHA256) : undefined;
    const expectedBody = PROTOCOL_ADAPTER.buildRequest({ model: job.model, arm: job.arm, message, replicate: job.replicate, seed: job.seed, ...(packet ?? {}) });
    assert.deepEqual(request, { ...requestIdentity, body: expectedBody }, `Request differs from the frozen message-only protocol: ${job.jobId}`);
    assert.equal(job.inputSHA256, sha256(message));
    const rawPath = join(outputDir, "raw", `${job.jobId}.json`), parsedPath = join(outputDir, "parsed", `${job.jobId}.json`);
    const raw = readJSON(rawPath) as RawResponse & { jobId: string; beganAt: string };
    const parsed = readJSON(parsedPath) as ParsedRecord;
    assert.equal(raw.jobId, job.jobId);
    for (const key of ["jobId", "caseId", "model", "arm", "phase", "replicate", "seed"] as const) assert.equal(parsed[key], job[key]);
    assert.equal(parsed.providerCalls, 1); assert.equal(parsed.requestSHA256, job.requestSHA256); assert.equal(parsed.rawSHA256, fileHash(rawPath));
    assert.equal(parsed.latencyMs, raw.latencyMs); assert(Number.isFinite(raw.latencyMs) && raw.latencyMs >= 0);
    assert(stamp(raw.beganAt) >= stamp(manifest.frozenAt), "Call preceded protocol freeze");
    assert(stamp(raw.completedAt) >= stamp(raw.beganAt) && stamp(raw.completedAt) <= stamp(complete.completedAt), "Call timestamps escape generation interval");
    let response: unknown = null, reparsed: Disposition | null = null;
    try { if (raw.responseText !== null) response = JSON.parse(raw.responseText); } catch { /* Invalid JSON remains failed. */ }
    try { assert.equal(raw.status, 200); assert.equal(raw.error, null); reparsed = PROTOCOL_ADAPTER.parseResponse({ model: job.model, arm: job.arm, response }); } catch { /* Never repair or silently classify a failed output. */ }
    assert.deepEqual(parsed.result, reparsed, `Raw/parsed parity failure: ${job.jobId}`);
    if (reparsed) assert.equal(parsed.failure, null); else assert(typeof parsed.failure === "string" && parsed.failure.trim(), "A failed output needs an explicit failure record");
    const accounting = accountUsage(response, job.model, job.reservedUSD);
    for (const key of ["usage", "usageKnown", "accountedUSD", "estimatedUSD"] as const) assert.deepEqual(parsed[key], accounting[key], `Accounting/usage parity failure: ${job.jobId}`);
    const responseId = job.model === "fable" && response && typeof object(response).id === "string" ? object(response).id as string : null;
    if (job.model === "fable" && reparsed) { assert(typeof raw.requestId === "string" && raw.requestId.trim(), "Missing provider request identity"); assert(responseId, "Missing provider response identity"); }
    const key = `${manifest.studyId}--${job.jobId}`, start = state.starts.get(key), settlement = state.settlements.get(key);
    assert(start && settlement, `Job is not durably settled: ${job.jobId}`);
    assert.equal(start.requestSHA256, job.requestSHA256); assert.equal(start.manifestSHA256, manifestSHA256); assert.equal(start.model, job.model); assert.equal(start.reservedUSD, job.reservedUSD); assert.equal(start.beganAt, raw.beganAt);
    assert.equal(settlement.parsedSHA256, fileHash(parsedPath)); assert.equal(settlement.accountedUSD, parsed.accountedUSD); assert.equal(settlement.estimatedUSD, parsed.estimatedUSD); assert.equal(settlement.usageKnown, parsed.usageKnown);
    return { ...job, id: job.caseId, message, parsed: reparsed, failure: parsed.failure, usage: parsed.usage, latencyMs: raw.latencyMs, beganAt: raw.beganAt, completedAt: raw.completedAt,
      requestId: raw.requestId, responseId, accountedUSD: parsed.accountedUSD, estimatedUSD: parsed.estimatedUSD, usageKnown: parsed.usageKnown };
  });
  for (const key of ["requestId", "responseId"] as const) { const ids = records.filter(r => r.model === "fable").map(r => r[key]).filter(Boolean); assert.equal(new Set(ids).size, ids.length, `Duplicate Fable ${key}`); }
  for (const model of manifest.config.models) {
    const p = object(readJSON(join(outputDir, `preflight-${model}.json`)));
    assert.equal(p.studyId, manifest.studyId); assert.equal(p.provider, model); assert.equal(p.generationCalls, 0);
    assert.equal(p.model, model === "fable" ? "claude-fable-5-1" : "counsel-nano-q5");
    if (model === "nano") {
      assert.equal(String(p.digest).replace(/^sha256:/, ""), manifest.config.nanoDigest.replace(/^sha256:/, ""));
      const runtime = object(p.runtime); assert.equal(runtime.version, NANO_RUNTIME_VERSION); assert.equal(runtime.templateSHA256, NANO_TEMPLATE_SHA256);
      assert.equal(runtime.generationCalls, 0); assert.equal(runtime.unquantizedCheckpointProvenance, "not_verified");
    }
    else { assert.equal(p.adaptive, true); assert.equal(p.effort, "low"); }
    assert(stamp(String(p.checkedAt)) <= Math.min(...records.filter(r => r.model === model).map(r => stamp(r.beganAt))), "Preflight followed inference");
  }
  const seenBatchJobs = new Set<string>();
  for (const name of batches) {
    const b = object(readJSON(join(outputDir, "batches", name)));
    assert.equal(b.studyId, manifest.studyId); assert.equal(b.manifestSHA256, manifestSHA256);
    assert.equal(b.preflightSHA256, fileHash(join(outputDir, `preflight-${b.model}.json`)));
    assert(Array.isArray(b.completedJobs)); assert.equal(b.providerCalls, b.completedJobs.length);
    for (const id of b.completedJobs) { assert(typeof id === "string" && !seenBatchJobs.has(id), "Batch repeats a job"); const job = manifest.jobs.find(j => j.jobId === id); assert(job && job.model === b.model, "Batch references an unknown/wrong-model job"); seenBatchJobs.add(id); }
  }
  // An interrupted batch may have durable settled calls but no batch receipt; the job artifacts and ledger remain authoritative.
  assert.equal(complete.validOutputs, records.filter(r => r.parsed).length);
  assert.deepEqual(complete.failedJobs, records.filter(r => r.failure).map(r => r.jobId));
  assert.equal(complete.accountedUSD, records.reduce((s, r) => s + r.accountedUSD, 0)); assert.equal(complete.usageKnown, records.every(r => r.usageKnown));
  return { manifest, complete, records, audit: { plannedJobs: manifest.jobs.length, verifiedJobs: records.length, unrunJobs: 0, verifiedArtifactCount: required.length,
    sourceFiles: Object.keys(manifest.sourceHashes).length, exactFrozenRequests: records.length, rawParsedParity: records.length, batchReceiptJobs: seenBatchJobs.size,
    manifestSHA256, completionSHA256: fileHash(join(outputDir, "generation-complete.json")) } };
}

export function operationsSummary(records: VerifiedRecord[]) {
  const latencies = records.map(r => r.latencyMs).sort((a, b) => a - b), n = latencies.length;
  return { providerCalls: n, failedOutputs: records.filter(r => !r.parsed).length, latencyObservations: n,
    medianLatencyMs: n ? (latencies[Math.floor((n - 1) / 2)] + latencies[Math.floor(n / 2)]) / 2 : null,
    p95LatencyMs: n ? latencies[Math.ceil(.95 * n) - 1] : null, p95Method: "Nearest-rank empirical percentile; not a service-level guarantee.",
    records: records.map(r => ({ jobId: r.jobId, latencyMs: r.latencyMs, usage: r.usage, failure: r.failure })),
    localTimingNote: "Nano timing includes local transport and inference. Token counts and latency are not directly equivalent across model architectures." };
}
export function screenComparison(comparison: ReturnType<typeof compareArms>) {
  const reasons: string[] = [];
  if (comparison.newClinicianActionFnIds.length) reasons.push("new_required_clinician_false_negatives");
  if (comparison.candidate.urgentAction.TP < comparison.baseline.urgentAction.TP) reasons.push("lower_urgent_true_positive_count");
  if (comparison.baseline.failedOutputs || comparison.candidate.failedOutputs) reasons.push("unresolved_output_or_protocol_failures");
  return { status: reasons.length ? "rejected_by_development_screen" : "no_prespecified_regression_detected", reasons,
    automaticPromotion: false, clinicalValidation: false,
    interpretation: "A developmental rejection rule against the contemporaneous same-model baseline. Passing it is not clinical approval or a deployment recommendation. Ambiguous reference endpoints are reported separately." };
}
function groupRecords(records: VerifiedRecord[], cohortById: Map<string, string>, aggregatePhases = false) {
  const groups = new Map<string, Group>();
  for (const record of records) {
    const cohort = cohortById.get(record.caseId)!; assert(cohort, "Case has no reference cohort");
    const phase = aggregatePhases ? "ALL_PHASES" : record.phase;
    const key = `${cohort}/${phase}/${record.model}/${record.arm}/r${record.replicate}`;
    if (!groups.has(key)) groups.set(key, { cohort, phase, model: record.model, arm: record.arm, replicate: record.replicate, records: [] });
    groups.get(key)!.records.push(record);
  }
  for (const group of groups.values()) group.records.sort((a, b) => a.id.localeCompare(b.id));
  return new Map([...groups].sort(([a], [b]) => a.localeCompare(b)));
}
export function repeatSummary(groups: Map<string, Group>) {
  const families = new Map<string, Group[]>();
  for (const group of groups.values()) { const key = `${group.cohort}/${group.phase}/${group.model}/${group.arm}`; families.set(key, [...(families.get(key) ?? []), group]); }
  return Object.fromEntries([...families].map(([key, repeats]) => {
    repeats.sort((a, b) => a.replicate - b.replicate);
    const ids = repeats[0].records.map(r => r.id);
    for (const repeat of repeats) assert.deepEqual(repeat.records.map(r => r.id), ids, "Repeat case sets differ");
    const cases = ids.map(id => { const rows = repeats.map(g => g.records.find(r => r.id === id)!); const valid = rows.every(r => r.parsed !== null);
      return { id, message: rows[0].message, allOutputsValid: valid, dispositionStable: valid && new Set(rows.map(r => r.parsed!.disposition)).size === 1,
        exactParsedOutputStable: valid && new Set(rows.map(r => JSON.stringify({ disposition: r.parsed?.disposition, rationale: r.parsed?.rationale }))).size === 1,
        repeats: rows.map(r => ({ replicate: r.replicate, disposition: r.parsed?.disposition ?? null, rationale: r.parsed?.rationale ?? null, failure: r.failure })) }; });
    return [key, { replicates: repeats.length, independentCases: ids.length, observedCalls: repeats.length * ids.length,
      dispositionStableCases: repeats.length > 1 ? cases.filter(c => c.dispositionStable).length : null,
      exactOutputStableCases: repeats.length > 1 ? cases.filter(c => c.exactParsedOutputStable).length : null,
      reproducibilityMeasured: repeats.length > 1, cases, note: "Repeated calls are correlated observations on the same cases; they are not additional independent clinical cases." }];
  }));
}
function writeNewArtifacts(directory: string, artifacts: Record<string, unknown>) {
  for (const [name, value] of Object.entries(artifacts)) if (existsSync(join(directory, name))) assert.deepEqual(readJSON(join(directory, name)), value, `Refusing to overwrite a different score artifact: ${name}`);
  for (const [name, value] of Object.entries(artifacts)) if (!existsSync(join(directory, name))) writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}

export function scoreWorkflowAware(outputDir: string, options: { referenceFreezePath: string; root?: string; expectedCohortSizes?: { known: number; challenge: number }; write?: boolean;
  readReferenceFile?: (path: string) => string } ) {
  const root = options.root ?? ROOT;
  const verified = verifyWorkflowGeneration(outputDir, root);
  // No clinical reference, target, or reference manifest is opened above this boundary.
  const readReference = options.readReferenceFile ?? ((path: string) => readFileSync(path, "utf8"));
  const freezeText = readReference(options.referenceFreezePath), freeze = JSON.parse(freezeText) as ReferenceFreeze;
  assert.equal(freeze.schema, "workflow-aware-reference-freeze/v1"); assert.equal(freeze.generationStartedAtFreeze, false);
  assert(stamp(freeze.frozenAt) <= Math.min(...verified.records.map(r => stamp(r.beganAt))), "References were not frozen before inference");
  const expected = options.expectedCohortSizes ?? { known: 50, challenge: 48 };
  assert.equal(freeze.known.expectedCases, expected.known); assert.equal(freeze.challenge.expectedCases, expected.challenge);
  const knownText = readReference(inside(root, freeze.known.path)), challengeText = readReference(inside(root, freeze.challenge.path));
  assert.equal(sha256(knownText), freeze.known.sha256, "Physician reference changed after freeze");
  assert.equal(sha256(challengeText), freeze.challenge.sha256, "Unreviewed challenge targets changed after freeze");
  const known = JSON.parse(knownText) as { schemaVersion: string; provenance: { blinded: boolean; heldOutValidation: boolean }; cases: ReferenceCase[] };
  const challenge = JSON.parse(challengeText) as { status: string; frozenAt: string; caseSetSha256: string; cases: ReferenceCase[]; pairs: unknown[] };
  assert.equal(known.schemaVersion, "physician-adjudication/3"); assert.equal(known.provenance.blinded, false); assert.equal(known.provenance.heldOutValidation, false);
  assert.equal(known.cases.length, expected.known); assert.equal(challenge.cases.length, expected.challenge);
  assert.equal(freeze.known.status, "single_physician_post_output_reassessment_of_known_development_set");
  assert.equal(freeze.challenge.status, "ai_authored_unreviewed"); assert.equal(challenge.status, "ai_authored_unreviewed");
  assert(stamp(challenge.frozenAt) <= stamp(freeze.frozenAt), "Challenge target revision followed reference freeze");
  const messageText = readReference(inside(root, freeze.challenge.messagesPath));
  assert.equal(sha256(messageText), freeze.challenge.messagesSHA256); assert.equal(challenge.caseSetSha256, freeze.challenge.messagesSHA256);
  const challengeMessages = JSON.parse(messageText) as { id: string; message: string }[];
  const allRefs = new Map([...known.cases, ...challenge.cases].map(c => [c.id, c]));
  assert.equal(allRefs.size, expected.known + expected.challenge, "Duplicate reference IDs");
  assert.equal(verified.manifest.messages.length, allRefs.size, "Known and challenge cases must completely cover the frozen schedule");
  const sourceMessages = new Map(challengeMessages.map(c => [c.id, c.message]));
  assert.equal(sourceMessages.size, expected.challenge);
  for (const message of verified.manifest.messages) {
    const ref = allRefs.get(message.id); assert(ref, "Unreferenced planned case");
    assert(Array.isArray(ref.acceptedBuckets) && ref.acceptedBuckets.length && ref.acceptedBuckets.every(b => BUCKETS.includes(b as typeof BUCKETS[number])), "Invalid accepted buckets");
    if (known.cases.some(c => c.id === message.id)) { assert.equal(ref.message, message.message); assert.equal(ref.inputSHA256, sha256(message.message)); }
    else assert.equal(sourceMessages.get(message.id), message.message);
  }
  if (expected.known === 50) assert.deepEqual(allRefs.get("C25")?.acceptedBuckets, ["URGENT_ESCALATION"], "C25 urgent adjudication must be included");
  const cohortById = new Map([...known.cases.map(c => [c.id, "knownDevelopment"] as const), ...challenge.cases.map(c => [c.id, "authoredChallenge"] as const)]);
  const groups = groupRecords(verified.records, cohortById);
  assert(!verified.manifest.config.phases.some(p => p.id === "ALL_PHASES"), "Phase name ALL_PHASES is reserved for offline summaries");
  const cohortGroups = groupRecords(verified.records, cohortById, true);
  const analysisGroups = new Map([...groups, ...cohortGroups]);
  const referenceStatuses = { knownDevelopment: freeze.known.status, authoredChallenge: freeze.challenge.status };
  const allMetrics = Object.fromEntries([...analysisGroups].map(([key, group]) => [key, { cohort: group.cohort, phase: group.phase, model: group.model, arm: group.arm, replicate: group.replicate,
    referenceStatus: referenceStatuses[group.cohort as keyof typeof referenceStatuses], plannedDenominator: group.records.length, independentClinicalValidation: false,
    ...computeMetrics(group.records, group.records.map(r => allRefs.get(r.id)!)) }]));
  const metrics = Object.fromEntries([...groups.keys()].map(key => [key, allMetrics[key]]));
  const cohortSummaries = Object.fromEntries([...cohortGroups.keys()].map(key => [key, allMetrics[key]]));
  const comparisons: Record<string, unknown> = {}, operations: Record<string, unknown> = {}, crossModel: Record<string, unknown> = {};
  for (const [key, group] of analysisGroups) {
    operations[key] = operationsSummary(group.records);
    if (group.arm !== "baseline") {
      const baseline = analysisGroups.get(`${group.cohort}/${group.phase}/${group.model}/baseline/r${group.replicate}`);
      if (!baseline) { comparisons[key] = { status: "baseline_not_planned", automaticPromotion: false }; continue; }
      assert.deepEqual(group.records.map(r => r.id), baseline.records.map(r => r.id));
      const comparison = compareArms(baseline.records, group.records, group.records.map(r => allRefs.get(r.id)!), "Contemporaneous one-call-per-job paired baseline and candidate; schedule randomized before generation. These are developmental comparisons, not observed patient outcomes.");
      comparisons[key] = { ...comparison, screen: screenComparison(comparison), pairedOperations: group.records.map((r, i) => ({ id: r.id, baselineLatencyMs: baseline.records[i].latencyMs, candidateLatencyMs: r.latencyMs, latencyDeltaMs: r.latencyMs - baseline.records[i].latencyMs })) };
    }
    if (group.model === "fable") {
      const nano = analysisGroups.get(`${group.cohort}/${group.phase}/nano/${group.arm}/r${group.replicate}`);
      if (!nano) continue;
      assert.deepEqual(group.records.map(r => r.id), nano.records.map(r => r.id));
      const pairs = group.records.map((r, i) => ({ id: r.id, message: r.message, replicate: r.replicate, acceptedBuckets: allRefs.get(r.id)!.acceptedBuckets,
        fable: { disposition: r.parsed?.disposition ?? null, rationale: r.parsed?.rationale ?? null, failure: r.failure },
        nano: { disposition: nano.records[i].parsed?.disposition ?? null, rationale: nano.records[i].parsed?.rationale ?? null, failure: nano.records[i].failure } }));
      crossModel[`${group.cohort}/${group.phase}/${group.arm}/r${group.replicate}`] = { denominator: pairs.length,
        bothValid: pairs.filter(p => p.fable.disposition && p.nano.disposition).length,
        disagreementCases: pairs.filter(p => p.fable.disposition !== p.nano.disposition), failedOutputCases: pairs.filter(p => !p.fable.disposition || !p.nano.disposition),
        note: "Null outputs are failures, not self-care or valid inter-model agreements. Neither model is a clinical reference." };
    }
  }
  const repeats = repeatSummary(groups);
  const scorecard = { schema: "workflow-aware-scorecard/v1", studyId: verified.manifest.studyId, referenceStatuses, independentClinicalValidation: false,
    csvScored: false, metrics, cohortSummaries, denominatorNote: `Per-phase and ALL_PHASES summaries overlap; do not add their denominators. Report ${expected.known} known cases and ${expected.challenge} challenge messages (${challenge.pairs.length} paired scenarios) separately. Planned jobs include repeated model/arm observations, not additional independent cases.`, contemporaneousComparisons: comparisons, withinArmRepeats: repeats, cohortRepeatSummaries: repeatSummary(cohortGroups), fableNanoComparisons: crossModel,
    challengePairDefinitions: challenge.pairs, automaticPromotion: false,
    limitations: ["Known cases use one physician's post-output developmental reassessment.", "Challenge targets are AI-authored and unreviewed; accepted alternatives are not clinical consensus.", "Timing and completed care are unmeasured by three bucket names.", "Repeat calls and paired variants are correlated observations.", "No automatic rationale-quality or clinical-harm judgment was performed."] };
  const worksheet = { schema: "workflow-aware-clinical-review-template/v1", status: "not_reviewed", clinicalApproval: false,
    instruction: "Blank human-review worksheet. No reviewer attestation or automated clinical judgment is represented. Inspect exact message and rationale, distinguish unknown from negative findings, and record source spans and the required action/time/capability.",
    rows: verified.records.map(r => ({ jobId: r.jobId, cohort: cohortById.get(r.id), caseId: r.id, model: r.model, arm: r.arm, replicate: r.replicate, message: r.message,
      disposition: r.parsed?.disposition ?? null, rationale: r.parsed?.rationale ?? null, failure: r.failure, reviewStatus: "not_reviewed", reviewer: null, reviewedAt: null,
      unsupportedNegativeAssertions: null, sourceEvidenceSpans: null, decisionCriticalUnknowns: null, enumRationaleConsistency: null,
      clinicianAssessmentNeeded: null, requiredCapabilities: null, actionDeadline: null, potentialHarm: null, clinicalConclusion: null })) };
  const budgetReport = { schema: "workflow-aware-accounting/v1", providerCalls: verified.records.length, budgetReference: verified.manifest.budget,
    accountedUSD: verified.complete.accountedUSD, usageKnown: verified.complete.usageKnown,
    byModelArm: Object.fromEntries([...new Set(verified.records.map(r => `${r.model}/${r.arm}`))].sort().map(key => { const records = verified.records.filter(r => `${r.model}/${r.arm}` === key); return [key, {
      providerCalls: records.length, accountedUSD: records.reduce((s, r) => s + r.accountedUSD, 0), estimatedUSD: records.every(r => r.estimatedUSD !== null) ? records.reduce((s, r) => s + r.estimatedUSD!, 0) : null,
      reservedBoundUSD: records.reduce((s, r) => s + r.reservedUSD, 0) }]; })),
    note: "Neutral recorded estimates and conservative accounting; not provider invoices. Local Nano has zero external API charge in this ledger, not zero hardware or operational cost. Accounting is separate from clinical metrics." };
  const auditName = "scoring-audit-workflow-aware.json";
  const scoredAt = existsSync(join(outputDir, auditName)) ? object(readJSON(join(outputDir, auditName))).scoredAt : new Date().toISOString();
  const audit = { schema: "workflow-aware-scoring-audit/v1", studyId: verified.manifest.studyId, scoredAt, ...verified.audit,
    generationIntegrityVerifiedBeforeReferenceRead: true, referenceFreezeSHA256: sha256(freezeText), physicianReferenceSHA256: freeze.known.sha256,
    challengeReferenceSHA256: freeze.challenge.sha256, scorerSHA256: fileHash(fileURLToPath(import.meta.url)), clinicalValidation: false, csvScored: false };
  if (options.write !== false) writeNewArtifacts(outputDir, { "scorecard-workflow-aware.json": scorecard, "operations-workflow-aware.json": operations,
    "budget-workflow-aware.json": budgetReport, "clinical-review-worksheet-workflow-aware.json": worksheet, [auditName]: audit });
  return { scorecard, operations, budgetReport, worksheet, audit };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert(process.argv.length === 5 && process.argv[3] === "--reference-freeze", "Usage: node --experimental-strip-types scripts/score-workflow-aware.ts <study-dir> --reference-freeze <path>");
  const result = scoreWorkflowAware(resolve(process.argv[2]), { referenceFreezePath: resolve(process.argv[4]) });
  console.log(JSON.stringify({ studyId: result.audit.studyId, verifiedJobs: result.audit.verifiedJobs, groups: Object.keys(result.scorecard.metrics).length, independentClinicalValidation: false, automaticPromotion: false }, null, 2));
}
