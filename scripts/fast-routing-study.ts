import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { readDispositionStream } from "../apps/evaluation/lib/disposition-stream.ts";
import { candidateIdentityFailures, cohortAccountedCost, cohortRequestBody, productionArtifactFiles, validateCohortEndpoint } from "./candidate-cohort-study.ts";
import { GRAPH_INSTRUCTIONS, graphJudgeInstructions, graphSafetyInstructions } from "../src/disposition/graph-prompts.ts";
import { GRAPH_VERSION, GRAPH_OUTPUT_LIMITS, graphPromptHash, graphRequestSettings, contextSchema, safetySchema, wireDraftSchema, graphJudgeSchema, graphRepair } from "../src/disposition/clinical-graph.ts";
import { resolveGraphConfig, type GraphConfig } from "../src/disposition/graph-config.ts";
import { REPAIR_INSTRUCTIONS } from "../src/disposition/graph-repair.ts";
import { EXECUTION_POLICY } from "../src/disposition/execution-policy.ts";
import { STUDY_PRICING } from "../src/evaluation/clinical-study-budget.ts";
import { sha256, type Corpus } from "../src/evidence/rag/model.ts";
import { parseCsv } from "../src/lib/csv.mjs";
import type { DispositionRun } from "../src/disposition/contract.ts";

export const FAST_STUDY = Object.freeze({ protocol: "fast-routing-http/v1", totalCeilingUSD: 200, minimumPriorAccountedUSD: 87.093099025, maximumAllocationUSD: 20 });
const CSV = "data/patient_messages.csv", CORPUS = "apps/evaluation/.local/clinical-rag-v8/corpus.json";
const JOURNALS = "apps/evaluation/.local/clinical-evidence-graph-v1/events";
const hashFile = (path: string) => sha256(readFileSync(path));
const write = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
const median = (values: number[]) => { const v = [...values].sort((a, b) => a - b), i = Math.floor(v.length / 2); return v.length ? v.length % 2 ? v[i] : (v[i - 1] + v[i]) / 2 : null; };

export function selectFastStudyCases(csv: string, ids: string[]) {
  const original = parseCsv(csv) as { id: string; message: string }[];
  if (original.length !== 50 || new Set(original.map(c => c.id)).size !== 50 || original.some(c => !/^C\d{2}$/.test(c.id) || !c.message)) throw new Error("ORIGINAL_50_REQUIRED");
  if (!ids.length || ids.length > 50 || new Set(ids).size !== ids.length) throw new Error("UNIQUE_FIXED_CASE_IDS_REQUIRED");
  return ids.map(id => {
    const c = original.find(row => row.id === id);
    if (!c) throw new Error(`UNKNOWN_CASE:${id}`);
    // Only patient text reaches the endpoint. Neither source labels nor the
    // physician-development targets are inputs to this runner's model request.
    return { id, message: c.message, inputHash: sha256(c.message) };
  });
}

export function fastStudyAuthorization(priorAccountedUSD: number, allocationUSD: number) {
  if (!Number.isFinite(priorAccountedUSD) || priorAccountedUSD < FAST_STUDY.minimumPriorAccountedUSD || !Number.isFinite(allocationUSD) || allocationUSD <= 0 || allocationUSD > FAST_STUDY.maximumAllocationUSD || priorAccountedUSD + allocationUSD > FAST_STUDY.totalCeilingUSD) throw new Error("FAST_STUDY_ALLOCATION_EXCEEDS_AUTHORITY");
  return { totalCeilingUSD: FAST_STUDY.totalCeilingUSD, priorAccountedUSD, allocationUSD, externalRetries: 0,
    scope: "User-authorized $200 TOTAL ceiling; prior sprint spending is not reset. This prospective phase is capped at $20. Root must reconcile intervening GUI/other study spend before freezing another phase." };
}

/** Reuses existing token pricing/accounting, but not the historical v22/v23
 * cohort allocations. Reserve every allowed internal recovery before a POST. */
export function fastStudyReservation(config: GraphConfig) {
  if (config.factGraphMode !== "off" || config.safetyStyle !== "full" || !["full", "concise"].includes(config.judgeStyle ?? "") || config.repairMode !== "field_patch") throw new Error("FULL_SAFETY_OFF_SHADOW_FIELD_PATCH_KNOWN_JUDGE_REQUIRED");
  const judgeInstructions = graphJudgeInstructions(config.judgeStyle);
  const definitions = [
    { role: "context", count: 1, instruction: GRAPH_INSTRUCTIONS.context, schema: contextSchema, recovery: false },
    { role: "safety", count: 1, instruction: graphSafetyInstructions("full"), schema: safetySchema, recovery: false },
    { role: "disposition", count: 2, instruction: GRAPH_INSTRUCTIONS.disposition, schema: wireDraftSchema, recovery: false },
    { role: "disposition", count: 1, instruction: GRAPH_INSTRUCTIONS.disposition + REPAIR_INSTRUCTIONS, schema: graphRepair.schema, recovery: false },
    { role: "judge", count: 2, instruction: judgeInstructions, schema: graphJudgeSchema, recovery: false },
    { role: "judge", count: 2, instruction: judgeInstructions, schema: graphJudgeSchema, recovery: true },
  ] as const;
  const calls = definitions.map(d => {
    const model = config.models[d.role], price = STUDY_PRICING.models[model as keyof typeof STUDY_PRICING.models];
    if (!price) throw new Error(`UNPRICED_MODEL:${model}`);
    const schema = JSON.stringify(d.schema.toJSONSchema());
    const inputTokenBound = 60_000 + Buffer.byteLength(d.instruction + schema) + 8192;
    const outputTokenBound = graphRequestSettings(d.role, config, d.recovery).modelSettings.maxOutputTokens;
    return { role: d.role, count: d.count, model, instructionHash: sha256(d.instruction), schemaHash: sha256(schema), inputTokenBound, outputTokenBound, usd: d.count * (inputTokenBound * price.input + outputTokenBound * price.output) / 1e6 };
  });
  return { calls, maximumCalls: calls.reduce((n, c) => n + c.count, 0), cacheMultiplier: 1.25, embeddingReserveUSD: 0.002,
    perRunUSD: calls.reduce((n, c) => n + c.usd, 0) * 1.25 + 0.002,
    basis: "All nine possible admitted model calls: context, safety, two initial producer attempts, one patch, two judges and two truncation-only judge recoveries. Per-call 60,000-byte payload ceiling plus complete instruction/schema bytes and 8,192-token envelope; full output limits. Standard token rates with 1.25 contingency, no cache discount; $0.002 for bounded query embeddings. Estimate, not invoice." };
}

function codeFiles(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap(e => {
    if (e.isSymbolicLink()) throw new Error(`SYMLINKED_SOURCE_UNSUPPORTED:${join(path, e.name)}`);
    return e.isDirectory() ? codeFiles(join(path, e.name)) : /\.(ts|mjs|js|json)$/.test(e.name) ? [join(path, e.name)] : [];
  });
}
function implementationPaths() {
  return [...new Set([...codeFiles("src/disposition"), ...codeFiles("src/evidence"), ...codeFiles("apps/evaluation/lib"), ...productionArtifactFiles(),
    "apps/evaluation/app/api/candidate/route.ts", "scripts/fast-routing-study.ts", "scripts/candidate-cohort-study.ts", "tests/fast-routing-study.test.ts", "src/evaluation/clinical-study-budget.ts",
    "package.json", "package-lock.json", "apps/evaluation/package.json", CSV, CORPUS])].sort();
}
export function fastStudyProviderSettings(config: GraphConfig) {
  return { roles: Object.fromEntries((Object.keys(config.models) as (keyof GraphConfig["models"])[]).map(role => [role, graphRequestSettings(role, config)])),
    truncatedJudgeRecovery: graphRequestSettings("judge", config, true), outputLimits: GRAPH_OUTPUT_LIMITS };
}
function transportPolicy() {
  return { httpAllowanceMs: EXECUTION_POLICY.modelTimeoutMs * 9 + 120_000, sequential: true, decoder: "actual GUI readDispositionStream", externalRetries: 0 };
}
function configFromStart(start: { config: GraphConfig }) {
  const c = start.config;
  const config = resolveGraphConfig({ ...Object.fromEntries(Object.entries(c.models).map(([role, model]) => [`COUNSEL_GRAPH_${role.toUpperCase()}_MODEL`, model])),
    COUNSEL_FACT_GRAPH_MODE: c.factGraphMode, COUNSEL_GRAPH_JUDGE_STYLE: c.judgeStyle, COUNSEL_GRAPH_REPAIR_MODE: c.repairMode, COUNSEL_GRAPH_SAFETY_STYLE: c.safetyStyle });
  if (!isDeepStrictEqual(c, config)) throw new Error("UNRECOGNIZED_RUNTIME_CONFIG");
  return config;
}

export function buildFastStudyPlan(identityRunPath: string, ids: string[], priorAccountedUSD: number, allocationUSD = 20, endpoint = "http://localhost:4120/api/candidate") {
  validateCohortEndpoint(endpoint);
  const run = JSON.parse(readFileSync(identityRunPath, "utf8")) as DispositionRun;
  if (!/^[a-zA-Z0-9-]+$/.test(run.runId)) throw new Error("INVALID_IDENTITY_RUN_ID");
  const eventPath = join(JOURNALS, `${run.runId}.jsonl`), start = JSON.parse(readFileSync(eventPath, "utf8").split("\n")[0]);
  const config = configFromStart(start), corpus = JSON.parse(readFileSync(CORPUS, "utf8")) as Corpus;
  const binding = { promptHash: graphPromptHash(config), graphVersion: GRAPH_VERSION, corpusHash: corpus.hash, config };
  const failures = candidateIdentityFailures(binding, run, run.message, start, corpus);
  if (failures.length || start.version !== GRAPH_VERSION || start.mode !== "hybrid" || !run.graph?.retrieval.length) throw new Error(`GUI_IDENTITY_DOES_NOT_MATCH_CURRENT_SOURCE:${failures.join(",")}`);
  const plan = { protocol: FAST_STUDY.protocol, createdAt: new Date().toISOString(), endpoint, ...binding,
    authorization: fastStudyAuthorization(priorAccountedUSD, allocationUSD), pricing: STUDY_PRICING, reservation: fastStudyReservation(config), providerSettings: fastStudyProviderSettings(config),
    cases: selectFastStudyCases(readFileSync(CSV, "utf8"), ids), files: Object.fromEntries(implementationPaths().map(path => [path, hashFile(path)])),
    identity: { runPath: identityRunPath, runHash: hashFile(identityRunPath), eventPath, eventHash: hashFile(eventPath), runId: run.runId },
    transport: transportPolicy(),
    interpretation: "Prospectively selected original messages, no labels sent to models. HTTP NDJSON plus GUI decoder, not browser clicks or paint. Failures, unfinished and unattempted cases remain visible. Model acceptance is not independent clinical accuracy; this study cannot approve its own judge." };
  return { ...plan, fingerprint: sha256(JSON.stringify(plan)) };
}
export type FastStudyPlan = ReturnType<typeof buildFastStudyPlan>;
export function verifyFastStudyPlan(plan: FastStudyPlan) {
  const { fingerprint, ...payload } = plan;
  if (plan.protocol !== FAST_STUDY.protocol || sha256(JSON.stringify(payload)) !== fingerprint) throw new Error("INVALID_FAST_STUDY_MANIFEST");
  validateCohortEndpoint(plan.endpoint);
  if (!isDeepStrictEqual(plan.authorization, fastStudyAuthorization(plan.authorization.priorAccountedUSD, plan.authorization.allocationUSD)) || !isDeepStrictEqual(plan.pricing, STUDY_PRICING)) throw new Error("FROZEN_AUTHORITY_OR_PRICING_DRIFT");
  if (plan.graphVersion !== GRAPH_VERSION || graphPromptHash(plan.config) !== plan.promptHash || !isDeepStrictEqual(plan.providerSettings, fastStudyProviderSettings(plan.config)) || !isDeepStrictEqual(plan.reservation, fastStudyReservation(plan.config)) || !isDeepStrictEqual(plan.transport, transportPolicy())) throw new Error("FROZEN_MODEL_CONFIG_DRIFT");
  if (!isDeepStrictEqual(Object.keys(plan.files), implementationPaths())) throw new Error("FROZEN_SOURCE_SET_DRIFT");
  for (const [path, hash] of Object.entries(plan.files)) if (hashFile(path) !== hash) throw new Error(`FROZEN_SOURCE_OR_INPUT_DRIFT:${path}`);
  if (hashFile(plan.identity.runPath) !== plan.identity.runHash || hashFile(plan.identity.eventPath) !== plan.identity.eventHash) throw new Error("FROZEN_GUI_IDENTITY_DRIFT");
  if (!isDeepStrictEqual(plan.cases, selectFastStudyCases(readFileSync(CSV, "utf8"), plan.cases.map(c => c.id)))) throw new Error("FROZEN_PATIENT_INPUT_DRIFT");
  if (JSON.parse(readFileSync(CORPUS, "utf8")).hash !== plan.corpusHash) throw new Error("FROZEN_CORPUS_DRIFT");
}

export function claimFastStudyPlan(manifestPath: string, output: string, plan: FastStudyPlan, claim: string | undefined, ledger = "outputs/.fast-routing-study-claims") {
  if (claim !== plan.fingerprint) throw new Error("EXPLICIT_FINGERPRINT_REQUIRED");
  mkdirSync(ledger, { recursive: true });
  const receipt = { fingerprint: plan.fingerprint, claimedAt: new Date().toISOString(), output: resolve(output), authorization: plan.authorization };
  write(join(ledger, `${plan.fingerprint}.json`), receipt);
  write(`${resolve(manifestPath)}.consumed.json`, receipt);
}

export function requireFreshStudyOutput(output: string | undefined) {
  if (!output || existsSync(output)) throw new Error("FRESH_OUTPUT_DIRECTORY_REQUIRED");
  const root = resolve("outputs"), destination = resolve(output);
  if (!destination.startsWith(root + "/") || destination === root) throw new Error("OUTPUTS_SUBDIRECTORY_REQUIRED");
  const actualRoot = realpathSync(root), parent = realpathSync(dirname(destination));
  if (parent !== actualRoot && !parent.startsWith(actualRoot + "/")) throw new Error("OUTPUT_PARENT_ESCAPES_OUTPUTS");
}

export type FastAttempt = { index: number; id: string; run: DispositionRun | null; receipts: object[]; failure: string | null; identityFailures: string[]; durationMs: number; estimatedUSD: number | null; accountedUSD: number; unknownUsage: boolean };
export function summarizeFastStudy(plan: Pick<FastStudyPlan, "cases" | "fingerprint" | "reservation" | "authorization">, attempts: FastAttempt[], starts: number, stopReason: string | null) {
  if (!Number.isInteger(starts) || starts < attempts.length || starts > plan.cases.length || attempts.some((a, i) => a.index !== i + 1 || a.id !== plan.cases[i].id) || new Set(attempts.map(a => a.id)).size !== attempts.length) throw new Error("FAST_ATTEMPT_BINDING_MISMATCH");
  const valid = attempts.filter(a => a.run && !a.failure && !a.identityFailures.length);
  const accountedUSD = attempts.reduce((n, a) => n + a.accountedUSD, 0) + (starts - attempts.length) * plan.reservation.perRunUSD;
  return { protocol: FAST_STUDY.protocol, fingerprint: plan.fingerprint, planned: plan.cases.length, starts, results: attempts.length, unfinishedStarted: starts - attempts.length,
    unattempted: plan.cases.slice(starts).map(c => c.id), stopReason, complete: valid.filter(a => a.run!.status === "complete").length,
    transportOrDecoderFailures: attempts.filter(a => a.failure).length, identityFailures: attempts.filter(a => a.identityFailures.length).length,
    knownEstimatedUSD: attempts.reduce((n, a) => n + (a.estimatedUSD ?? 0), 0), unknownUsageAttempts: attempts.filter(a => a.unknownUsage).length,
    accountedUSD, totalAccountedUSD: plan.authorization.priorAccountedUSD + accountedUSD, medianTerminalHTTPMsAllResults: median(attempts.map(a => a.durationMs)),
    outcomes: attempts.map(a => ({ id: a.id, runId: a.run?.runId ?? null, status: a.run?.status ?? null, failure: a.failure, identityFailures: a.identityFailures, durationMs: a.durationMs,
      firstActionMs: a.run?.firstActionMs ?? null, firstPatientReplyMs: a.run?.firstPatientReplyMs ?? null, finalRoute: a.run?.answer?.disposition ?? null, finalPriority: a.run?.answer?.reviewPriority ?? null })),
    observedVia: "HTTP NDJSON and actual GUI decoder; not browser interaction or paint", clinicalAccuracy: "not independently adjudicated" };
}

export async function main(args: string[]) {
  const arg = (name: string) => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const planning = args.includes("--plan"), live = args.includes("--live"), output = arg("output");
  if (planning === live) throw new Error("CHOOSE_PLAN_OR_LIVE");
  requireFreshStudyOutput(output);
  const manifest = arg("manifest"), identity = arg("identity-run");
  if (planning && (!identity || !arg("cases") || !arg("prior-accounted-usd")) || live && !manifest) throw new Error("PLAN_NEEDS_GUI_IDENTITY_CASES_PRIOR_SPEND_LIVE_NEEDS_MANIFEST");
  const ids = arg("cases") === "all" ? Array.from({ length: 50 }, (_, i) => `C${String(i + 1).padStart(2, "0")}`) : (arg("cases") ?? "").split(",");
  const plan: FastStudyPlan = planning ? buildFastStudyPlan(identity!, ids, Number(arg("prior-accounted-usd")), Number(arg("allocation-usd") ?? 20), arg("endpoint")) : JSON.parse(readFileSync(manifest!, "utf8"));
  verifyFastStudyPlan(plan);
  if (live && arg("claim") !== plan.fingerprint) throw new Error("EXPLICIT_FINGERPRINT_REQUIRED");
  mkdirSync(output!, { recursive: false }); write(join(output!, "manifest.json"), plan);
  if (planning) { console.log(JSON.stringify({ output, fingerprint: plan.fingerprint, planned: plan.cases.length, allocationUSD: plan.authorization.allocationUSD, reservationUSD: plan.reservation.perRunUSD, providerCalls: 0 })); return; }
  claimFastStudyPlan(manifest!, output!, plan, arg("claim"));
  const attempts: FastAttempt[] = []; let starts = 0, accountedUSD = 0, stopReason: string | null = null;
  try {
    for (const [i, c] of plan.cases.entries()) {
      verifyFastStudyPlan(plan);
      if (accountedUSD + plan.reservation.perRunUSD > plan.authorization.allocationUSD) { stopReason = "REMAINING_ALLOCATION_BELOW_FULL_RUN_RESERVATION"; break; }
      const prefix = join(output!, `${String(i + 1).padStart(2, "0")}-${c.id}`), request = cohortRequestBody(c.message), began = performance.now();
      write(`${prefix}-started.json`, { index: i + 1, id: c.id, at: new Date().toISOString(), request, inputHash: c.inputHash, reservationUSD: plan.reservation.perRunUSD, priorAccountedUSD: accountedUSD }); starts++;
      let run: DispositionRun | null = null, failure: string | null = null, identityFailures: string[] = []; const receipts: object[] = [];
      const wire = openSync(`${prefix}-wire.ndjson`, "wx", 0o600), receiptFile = openSync(`${prefix}-receipts.jsonl`, "wx", 0o600);
      try {
        const url = validateCohortEndpoint(plan.endpoint), response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Origin: url.origin, "x-counsel-review": "local-v1" }, body: JSON.stringify(request), signal: AbortSignal.timeout(plan.transport.httpAllowanceMs) });
        write(`${prefix}-http.json`, { status: response.status, headers: Object.fromEntries(response.headers), receivedMs: Math.round(performance.now() - began) });
        if (!response.ok) { writeFileSync(wire, await response.text()); throw new Error(`HTTP_${response.status}`); }
        if (!response.body) throw new Error("MISSING_STREAM");
        const captured = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) { writeFileSync(wire, chunk); fsyncSync(wire); controller.enqueue(chunk); } }));
        const record = (receipt: object) => { receipts.push(receipt); writeFileSync(receiptFile, JSON.stringify(receipt) + "\n"); fsyncSync(receiptFile); };
        run = await readDispositionStream(new Response(captured, { status: response.status, headers: response.headers }), c.message, () => {},
          (event, timing) => record({ phase: "published", event, receivedMs: Math.round(timing.receivedAtMs - began), publishedMs: Math.round(timing.publishedAtMs - began) }),
          (event, receivedAtMs) => record({ phase: "received", event, receivedMs: Math.round(receivedAtMs - began) }));
        write(`${prefix}-run.json`, run);
        if (!/^[a-zA-Z0-9-]+$/.test(run.runId)) throw new Error("INVALID_SERVER_RUN_ID");
        const raw = readFileSync(join(JOURNALS, `${run.runId}.jsonl`), "utf8"), start = JSON.parse(raw.split("\n")[0]);
        writeFileSync(`${prefix}-server-events.jsonl`, raw, { flag: "wx", mode: 0o600 });
        identityFailures = candidateIdentityFailures(plan, run, c.message, start, JSON.parse(readFileSync(CORPUS, "utf8")));
        if (start.version !== plan.graphVersion || start.mode !== "hybrid") identityFailures.push("START_GRAPH_VERSION_UNBOUND");
      } catch (error) { failure = error instanceof Error ? error.message : "HTTP_STUDY_FAILED"; }
      finally { closeSync(wire); closeSync(receiptFile); }
      const cost = cohortAccountedCost(run, plan.reservation); accountedUSD += cost.accountedUSD;
      const attempt = { index: i + 1, id: c.id, run, receipts, failure, identityFailures, durationMs: Math.round(performance.now() - began), ...cost }; attempts.push(attempt);
      write(`${prefix}-result.json`, { ...attempt, accountedCumulativeUSD: accountedUSD });
      console.log(JSON.stringify({ id: c.id, runId: run?.runId, status: run?.status, durationMs: attempt.durationMs, failure, identityFailures, accountedUSD }));
      if (failure || identityFailures.length || cost.unknownUsage || cost.accountedUSD > plan.reservation.perRunUSD) { stopReason = failure ? "HTTP_OR_DECODER_FAILURE_STOP" : identityFailures.length ? "RUNTIME_IDENTITY_DRIFT_STOP" : cost.unknownUsage ? "UNKNOWN_USAGE_STOP" : "RESERVATION_BOUND_EXCEEDED_STOP"; break; }
    }
  } catch (error) { stopReason = error instanceof Error ? error.message : "HARNESS_INTERRUPTED"; throw error; }
  finally { write(join(output!, "summary.json"), summarizeFastStudy(plan, attempts, starts, stopReason)); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
