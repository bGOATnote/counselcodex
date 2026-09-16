import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { candidateInputs, readPhysicianReference, scorePhysicianCohort } from "../src/evaluation/physician-cohort.ts";
import { estimateStudyCost, STUDY_PRICING } from "../src/evaluation/clinical-study-budget.ts";
import { GRAPH_OUTPUT_LIMITS, GRAPH_VERSION, graphPromptHash, graphRequestSettings, contextSchema, safetySchema, wireDraftSchema, graphJudgeSchema, graphRepair, draftSchema } from "../src/disposition/clinical-graph.ts";
import { GRAPH_INSTRUCTIONS, graphJudgeInstructions, graphSafetyInstructions } from "../src/disposition/graph-prompts.ts";
import { resolveGraphConfig } from "../src/disposition/graph-config.ts";
import { REPAIR_INSTRUCTIONS } from "../src/disposition/graph-repair.ts";
import { operationalRoute } from "../src/disposition/routing-policy.ts";
import { EXECUTION_POLICY } from "../src/disposition/execution-policy.ts";
import type { DispositionRun } from "../src/disposition/contract.ts";
import { sha256, type Corpus } from "../src/evidence/rag/model.ts";
import { parseCsv } from "../src/lib/csv.mjs";
import { readDispositionStream } from "../apps/evaluation/lib/disposition-stream.ts";

export const COHORT_PROTOCOL = "fresh-candidate-cohort/v1";
export const COHORT_V23_PROTOCOL = "fresh-candidate-cohort/v2";
export const COHORT_V23_BUDGET = Object.freeze({ priorAccountedUSD: 44.216046525, guiReserveUSD: 15.5, cohortAllocationUSD: 40, sprintCeilingUSD: 100 });
const CSV = "data/patient_messages.csv", REFERENCE = "data/evaluation/physician-system-reference-v2.json";
const AUTHORITY = "data/evaluation/physician-development-review-2026-09-13.json";
const RUNTIME = "apps/evaluation/.local/clinical-evidence-graph-v1";
const BUILD = "apps/evaluation/.next";
const DEFAULT_ENDPOINT = "http://localhost:4120/api/candidate";
const write = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
const hashFile = (path: string) => sha256(readFileSync(path));
const median = (values: number[]) => { const v = [...values].sort((a,b) => a-b), i = Math.floor(v.length / 2); return v.length ? v.length % 2 ? v[i] : (v[i-1] + v[i]) / 2 : null; };
function sourceFiles(path: string): string[] { return readdirSync(path, { withFileTypes: true }).flatMap(e => e.isDirectory() ? sourceFiles(join(path, e.name)) : /\.(?:ts|mjs|js|json)$/.test(e.name) ? [join(path, e.name)] : []); }
export function cohortVersionPolicy(version: string) {
  if (version === "evidence-graph/v22") return { protocol: COHORT_PROTOCOL, corpusPath: "apps/evaluation/.local/clinical-rag-v7/corpus.json", allocationUSD: 55 };
  if (version === "evidence-graph/v23") return { protocol: COHORT_V23_PROTOCOL, corpusPath: "apps/evaluation/.local/clinical-rag-v8/corpus.json", allocationUSD: COHORT_V23_BUDGET.cohortAllocationUSD };
  throw new Error("UNREGISTERED_COHORT_GRAPH_VERSION");
}
export function verifyCohortVersionBinding(plan: { graphVersion: string; protocol: string; authorization: { cohortAllocationUSD: number; maximumAssessments: number; externalRetries: number } }, currentVersion = GRAPH_VERSION) {
  const policy = cohortVersionPolicy(plan.graphVersion);
  if (plan.graphVersion !== currentVersion || plan.protocol !== policy.protocol || plan.authorization.cohortAllocationUSD !== policy.allocationUSD || plan.authorization.maximumAssessments !== 50 || plan.authorization.externalRetries !== 0) throw new Error("FROZEN_COHORT_VERSION_OR_ALLOCATION_DRIFT");
}
/** Executable server + client bytes, including HTML/assets and top-level
 * production manifests. Mutable build traces, caches, development artifacts,
 * diagnostics and generated type declarations are not serving artifacts. */
export function productionArtifactFiles(root = BUILD): string[] {
  const allFiles = (path: string): string[] => readdirSync(path, { withFileTypes: true }).flatMap(e => {
    if (e.isSymbolicLink()) throw new Error("SYMLINKED_PRODUCTION_ARTIFACT_UNSUPPORTED");
    return e.isDirectory() ? allFiles(join(path, e.name)) : e.isFile() ? [join(path, e.name)] : [];
  });
  const top = readdirSync(root, { withFileTypes: true }).filter(e => e.isFile() && !["trace", "trace-build"].includes(e.name)).map(e => join(root, e.name));
  return [...top, ...allFiles(join(root, "server")), ...allFiles(join(root, "static"))].sort();
}
export function cohortProviderSettings(config: ReturnType<typeof resolveGraphConfig>, version = GRAPH_VERSION) {
  if (version === "evidence-graph/v22") return { maxSteps:1, maxRetries:0, disposition:{ anthropic:{thinking:{type:"adaptive"},effort:"low"} }, judge:{openai:{reasoningEffort:"low"}},
    otherRoles:"provider defaults", outputLimits:GRAPH_OUTPUT_LIMITS, binding:"Provider options are hardcoded in rawCall and are NOT included in graphPromptHash; frozen source and compiled server file hashes bind these settings separately." };
  cohortVersionPolicy(version);
  return { requestSettings: { context: graphRequestSettings("context", config), safety: graphRequestSettings("safety", config), disposition: graphRequestSettings("disposition", config), judge: graphRequestSettings("judge", config), truncatedJudgeRecovery: graphRequestSettings("judge", config, true) },
    outputLimits: GRAPH_OUTPUT_LIMITS, judgeSerialization: "exact-quoted-anchors/v1", binding: "Actual graphRequestSettings are included in graphPromptHash and independently recorded here; frozen source and complete production serving artifacts bind the implementation. No span-serialization experiment is promoted." };
}
export function cohortRequestBody(message: string) { return { message, syntheticOnly: true as const }; }
export function validateCohortEndpoint(endpoint: string) {
  const url = new URL(endpoint);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/api/candidate" || url.search || url.hash || url.username || url.password) throw new Error("LOCAL_CANDIDATE_ENDPOINT_REQUIRED");
  return url;
}

/** Full maximum of admitted calls, not the observed median cost. The runtime
 * rejects payloads above 60,000 bytes before dispatch. UTF-8 bytes upper-bound
 * ordinary tokenization; instructions/schema/envelope and output are additional.
 * Both first-generation recovery and both truncation recoveries are reserved.
 */
export function cohortReservation(config: ReturnType<typeof resolveGraphConfig>, version = GRAPH_VERSION) {
  cohortVersionPolicy(version);
  if (config.factGraphMode !== "off" || config.safetyStyle !== "full" || config.repairMode !== "field_patch") throw new Error("FROZEN_FULL_V22_CONFIGURATION_REQUIRED");
  if (version === "evidence-graph/v23" && (config.judgeStyle !== "full" || (config as { judgeAnchors?: string }).judgeAnchors === "spans")) throw new Error("V23_FULL_QUOTED_JUDGE_REQUIRED");
  const definitions = [
    { role: "context", count: 1, instruction: GRAPH_INSTRUCTIONS.context, schema: contextSchema, output: GRAPH_OUTPUT_LIMITS.context },
    { role: "safety", count: 1, instruction: graphSafetyInstructions("full"), schema: safetySchema, output: GRAPH_OUTPUT_LIMITS.safety },
    { role: "disposition", count: 2, instruction: GRAPH_INSTRUCTIONS.disposition, schema: wireDraftSchema, output: GRAPH_OUTPUT_LIMITS.disposition },
    { role: "disposition", count: 1, instruction: GRAPH_INSTRUCTIONS.disposition + REPAIR_INSTRUCTIONS, schema: graphRepair.schema, output: GRAPH_OUTPUT_LIMITS.disposition },
    { role: "judge", count: 2, instruction: graphJudgeInstructions(config.judgeStyle), schema: graphJudgeSchema, output: GRAPH_OUTPUT_LIMITS.judge },
    { role: "judge", count: 2, instruction: graphJudgeInstructions(config.judgeStyle), schema: graphJudgeSchema, output: GRAPH_OUTPUT_LIMITS.truncatedJudgeRecovery },
  ] as const;
  const calls = definitions.map(d => {
    const model = config.models[d.role], rate = STUDY_PRICING.models[model as keyof typeof STUDY_PRICING.models];
    if (!rate) throw new Error("UNPRICED_MODEL");
    const inputTokenBound = 60_000 + Buffer.byteLength(d.instruction + JSON.stringify(d.schema.toJSONSchema())) + 8192;
    const outputTokenBound = version === "evidence-graph/v23" ? graphRequestSettings(d.role, config, d.output === GRAPH_OUTPUT_LIMITS.truncatedJudgeRecovery).modelSettings.maxOutputTokens : d.output;
    return { role: d.role, count: d.count, model, inputTokenBound, outputTokenBound, usd: d.count * (inputTokenBound * rate.input + outputTokenBound * rate.output) / 1e6 };
  });
  const cacheMultiplier = 1.25, embeddingReserveUSD = 0.002;
  return { calls, maximumCalls: calls.reduce((n,c) => n+c.count,0), cacheMultiplier, embeddingReserveUSD,
    perRunUSD: calls.reduce((n,c) => n+c.usd,0) * cacheMultiplier + embeddingReserveUSD,
    basis: "60,000-byte admitted payload ceiling plus instructions, schemas and 8,192-token envelope allowance per call; full output ceilings; one generation recovery, one patch, two reviews each with one truncation-only recovery. 1.25 multiplier conservatively covers cache writes; no cache discount. Five <=160-character query embeddings are covered by $0.002 per run. Estimates are not invoices." };
}

export function buildCohortPlan(identityRunPath: string, createdAt = new Date().toISOString(), endpoint = DEFAULT_ENDPOINT) {
  validateCohortEndpoint(endpoint);
  const versionPolicy = cohortVersionPolicy(GRAPH_VERSION), corpusPath = versionPolicy.corpusPath;
  if (!Number.isFinite(Date.parse(createdAt))) throw new Error("VALID_FREEZE_TIMESTAMP_REQUIRED");
  const identityRun = JSON.parse(readFileSync(identityRunPath, "utf8")) as DispositionRun;
  const identityEventPath = join(RUNTIME, "events", `${identityRun.runId}.jsonl`);
  const started = JSON.parse(readFileSync(identityEventPath, "utf8").split("\n")[0]);
  const config = resolveGraphConfig(Object.fromEntries([
    ...Object.entries(started.config.models).map(([role, model]) => [`COUNSEL_GRAPH_${role.toUpperCase()}_MODEL`, String(model)]),
    ["COUNSEL_FACT_GRAPH_MODE", started.config.factGraphMode], ["COUNSEL_GRAPH_JUDGE_STYLE", started.config.judgeStyle],
    ["COUNSEL_GRAPH_REPAIR_MODE", started.config.repairMode], ["COUNSEL_GRAPH_SAFETY_STYLE", started.config.safetyStyle],
  ]));
  const promptHash = graphPromptHash(config), corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
  if (identityRun.promptHash !== promptHash || started.promptHash !== promptHash || started.version !== GRAPH_VERSION || identityRun.graph?.version !== GRAPH_VERSION || identityRun.runId !== started.runId || started.mode !== "hybrid" || !isDeepStrictEqual(started.config, config)) throw new Error("IDENTITY_RUN_DOES_NOT_MATCH_CURRENT_GRAPH");
  if (!identityRun.graph?.retrieval.length || identityRun.graph.retrieval.some(r => r.corpusHash !== corpus.hash)) throw new Error("IDENTITY_CORPUS_MISMATCH");
  const csv = readFileSync(CSV,"utf8"), original = parseCsv(csv) as { id: string; message: string }[];
  if (original.length !== 50 || new Set(original.map(c => c.id)).size !== 50) throw new Error("ORIGINAL_50_REQUIRED");
  // Expected labels stay solely in the offline scorer; even the frozen input
  // plan contains only the original case ID, patient message and its hash.
  const cases = original.map(c => ({ id: c.id, message: c.message, inputHash: sha256(c.message) }));
  const reference = readPhysicianReference(readFileSync(REFERENCE,"utf8"), csv);
  if (JSON.stringify(candidateInputs(reference)) !== JSON.stringify(cases) || hashFile(AUTHORITY) !== reference.authority.sha256) throw new Error("REFERENCE_AUTHORITY_BINDING_MISMATCH");
  const artifactPaths = GRAPH_VERSION === "evidence-graph/v23" ? productionArtifactFiles() : null;
  const files = [...sourceFiles("src/disposition"), ...sourceFiles("src/evidence"), ...(artifactPaths ?? sourceFiles("apps/evaluation/.next/server")),
    "apps/evaluation/.next/BUILD_ID", "apps/evaluation/lib/disposition-stream.ts", "apps/evaluation/lib/preserved-care.ts", "apps/evaluation/app/api/candidate/route.ts", "apps/evaluation/lib/v0-handler.ts",
    "src/evaluation/physician-cohort.ts", "src/evaluation/clinical-study-budget.ts", "scripts/candidate-cohort-study.ts", "package-lock.json", CSV, REFERENCE, AUTHORITY, corpusPath,
    ...(GRAPH_VERSION === "evidence-graph/v23" ? ["src/evaluation/v23-review-packet.ts"] : []),
    ...(GRAPH_VERSION === "evidence-graph/v23" ? [...sourceFiles("apps/evaluation/lib"), "package.json", "apps/evaluation/package.json", "tests/physician-cohort-v23.test.ts", "tests/candidate-cohort-v23.test.ts"] : [])];
  const plan = { protocol: versionPolicy.protocol, createdAt, endpoint, graphVersion: GRAPH_VERSION, config, promptHash,
    providerSettings: cohortProviderSettings(config),
    ...(GRAPH_VERSION === "evidence-graph/v23" ? { sprintAllocation: { ...COHORT_V23_BUDGET, maximumAccountedAndReservedUSD: COHORT_V23_BUDGET.priorAccountedUSD + COHORT_V23_BUDGET.guiReserveUSD + COHORT_V23_BUDGET.cohortAllocationUSD } } : {}),
    ...(artifactPaths ? { productionArtifact: { paths: artifactPaths, scope: "All production server and static files plus top-level production build files; excludes mutable traces, caches, dev, diagnostics and generated types." } } : {}),
    corpusHash: corpus.hash as string, files: Object.fromEntries([...new Set(files)].sort().map(p => [p, hashFile(p)])),
    identity: { runId: identityRun.runId, runPath: identityRunPath, runHash: hashFile(identityRunPath), eventPath: identityEventPath, eventHash: hashFile(identityEventPath), scope: "Prior actual server identity evidence; every fresh result and its local started journal must match. Not a new clinical assessment." },
    cases, pricing: STUDY_PRICING, reservation: cohortReservation(config),
    authorization: { newSprintCeilingUSD: 100, cohortAllocationUSD: versionPolicy.allocationUSD, maximumAssessments: 50, externalRetries: 0, reference: GRAPH_VERSION === "evidence-graph/v23" ? "Parent-authorized prospective v23 full-50 workflow cohort allocation up to $40 inclusive of cache contingency and embeddings, within the existing $100 sprint. Prior accounted studies plus embeddings are $44.216046525 and GUI reserve is $15.50 after a prospective $0.50 reallocation from previously unallocated capacity: maximum total $99.716046525. These prior charges and reservations are not reset by this manifest; historical GUI plans remain unchanged." : "Parent-authorized fresh full-50 v22 cohort under user's new $100 sprint; this cohort allocation is up to $55." },
    transport: { format: "application/x-ndjson", decoder: "actual GUI readDispositionStream", browserClicks: false, sequential: true, httpAllowanceMs: EXECUTION_POLICY.modelTimeoutMs * 9 + 120_000 },
    interpretation: "Physician's incumbent 49 agreement plus qualified DVT is a development reference, not candidate validation. First provider draft and released final route agreement are paired process diagnostics, not causal clinical benefit. Different routes are not automatic clinical errors. Raw first drafts, model reviews, failures and all planned unattempted cases remain visible. No automatic promotion." };
  return { ...plan, fingerprint: sha256(JSON.stringify(plan)) };
}
export type CohortPlan = ReturnType<typeof buildCohortPlan>;
export function verifyCohortPlan(plan: CohortPlan) {
  verifyCohortVersionBinding(plan);
  const { fingerprint, ...rest } = plan;
  if (fingerprint !== sha256(JSON.stringify(rest)) || plan.cases.length !== 50) throw new Error("INVALID_FROZEN_COHORT_PLAN");
  validateCohortEndpoint(plan.endpoint);
  if (plan.graphVersion === "evidence-graph/v23") {
    const budget = { ...COHORT_V23_BUDGET, maximumAccountedAndReservedUSD: COHORT_V23_BUDGET.priorAccountedUSD + COHORT_V23_BUDGET.guiReserveUSD + COHORT_V23_BUDGET.cohortAllocationUSD };
    if (!isDeepStrictEqual(plan.sprintAllocation, budget) || plan.authorization.newSprintCeilingUSD !== budget.sprintCeilingUSD || budget.maximumAccountedAndReservedUSD > budget.sprintCeilingUSD) throw new Error("FROZEN_SPRINT_ALLOCATION_DRIFT");
    if (!plan.productionArtifact || !isDeepStrictEqual(productionArtifactFiles(), plan.productionArtifact.paths)) throw new Error("FROZEN_PRODUCTION_ARTIFACT_SET_DRIFT");
    if (JSON.stringify(cohortProviderSettings(plan.config, plan.graphVersion)) !== JSON.stringify(plan.providerSettings)) throw new Error("FROZEN_PROVIDER_SETTINGS_DRIFT");
    if (hashFile(plan.identity.runPath) !== plan.identity.runHash || hashFile(plan.identity.eventPath) !== plan.identity.eventHash) throw new Error("FROZEN_GUI_IDENTITY_DRIFT");
  }
  for (const [path, hash] of Object.entries(plan.files)) if (hashFile(path) !== hash) throw new Error(`FROZEN_IMPLEMENTATION_OR_INPUT_DRIFT:${path}`);
  if (graphPromptHash(plan.config) !== plan.promptHash || JSON.stringify(cohortReservation(plan.config, plan.graphVersion)) !== JSON.stringify(plan.reservation)) throw new Error("FROZEN_CONFIG_DRIFT");
  const original=parseCsv(readFileSync(CSV,"utf8")) as {id:string;message:string}[];
  if(JSON.stringify(plan.cases)!==JSON.stringify(original.map(c=>({id:c.id,message:c.message,inputHash:sha256(c.message)})))) throw new Error("FROZEN_PATIENT_INPUT_DRIFT");
}
export function claimCohortPlan(manifestPath: string, directory: string, plan: CohortPlan, claim: string | undefined, claimDirectory = "outputs/.candidate-cohort-claims") {
  if (claim !== plan.fingerprint) throw new Error("EXPLICIT_PLAN_HASH_CLAIM_REQUIRED");
  const receipt={ fingerprint: plan.fingerprint, output: resolve(directory), claimedAt: new Date().toISOString(), authorization: plan.authorization };
  // A copied manifest cannot reset this fingerprint's allocation. No CLI
  // override for the ledger; the optional argument is for isolated unit tests.
  mkdirSync(claimDirectory,{recursive:true});
  write(join(claimDirectory,`${plan.fingerprint}.json`),receipt);
  write(`${resolve(manifestPath)}.consumed.json`, receipt);
}
export function candidateIdentityFailures(plan: Pick<CohortPlan,"promptHash"|"graphVersion"|"corpusHash"|"config">, run: DispositionRun, message: string, start?: Record<string, unknown>, frozenCorpus?: Corpus) {
  const failures: string[] = [];
  if (run.message !== message || run.inputHash !== sha256(message)) failures.push("PATIENT_BINDING_MISMATCH");
  if (run.promptHash !== plan.promptHash || run.graph?.version !== plan.graphVersion || run.graph?.mode !== "hybrid") failures.push("RUNTIME_IDENTITY_MISMATCH");
  if (run.graph?.retrieval.some(r => r.corpusHash !== plan.corpusHash)) failures.push("RUNTIME_CORPUS_MISMATCH");
  const roleModels:Record<string,string>={history:plan.config.models.context,emergency:plan.config.models.safety,disposition:plan.config.models.disposition,critic:plan.config.models.judge};
  if (run.agents?.some(a => roleModels[a.role] !== a.model)) failures.push("RUNTIME_MODEL_MISMATCH");
  const hits=run.graph?.retrieval.flatMap(r=>r.hits)??[];
  const evidenceExpected=run.status==="complete"||Boolean(run.graph?.citations?.length)||Boolean(run.answer?.evidence?.length);
  if(evidenceExpected&&!hits.length) failures.push("RUNTIME_EVIDENCE_BINDING_MISSING");
  if(hits.length&&(!frozenCorpus||frozenCorpus.hash!==plan.corpusHash)) failures.push("FROZEN_CORPUS_UNBOUND");
  else if(frozenCorpus&&hits.some(h=>{
    const chunk=frozenCorpus.chunks.find(c=>c.id===h.chunk.id), source=frozenCorpus.documents.find(d=>d.id===h.document.id);
    if(!chunk||!source||!isDeepStrictEqual(chunk,h.chunk)||sha256(h.chunk.text)!==h.chunk.hash)return true;
    const {sections,...document}=source,section=sections[h.chunk.section];
    return !isDeepStrictEqual(document,h.document)||!section||section.text.slice(chunk.start,chunk.end)!==chunk.text
      ||h.context.before!==section.text.slice(Math.max(0,chunk.start-300),chunk.start)||h.context.after!==section.text.slice(chunk.end,chunk.end+300);
  }))failures.push("RETRIEVED_EVIDENCE_IDENTITY_MISMATCH");
  if (!start || start.runId !== run.runId || start.inputHash !== run.inputHash || start.promptHash !== plan.promptHash || JSON.stringify(start.config) !== JSON.stringify(plan.config)) failures.push("START_IDENTITY_UNBOUND");
  if (plan.graphVersion === "evidence-graph/v23" && (start?.version !== plan.graphVersion || start?.mode !== "hybrid")) failures.push("START_GRAPH_VERSION_UNBOUND");
  return failures;
}
export function cohortAccountedCost(run: DispositionRun | null, reservation: CohortPlan["reservation"]) {
  const estimate = run ? estimateStudyCost(run) : null;
  const estimatedUSD = estimate !== null && Number.isFinite(estimate) && estimate >= 0 ? estimate : null;
  return { estimatedUSD, unknownUsage: estimatedUSD === null, accountedUSD: estimatedUSD === null ? reservation.perRunUSD : estimatedUSD * reservation.cacheMultiplier + reservation.embeddingReserveUSD };
}
export function firstDraftComparison(run: DispositionRun, acceptedRoutes: string[] | null) {
  const first = run.agents?.find(a => a.role === "disposition" && a.modelCalls > 0);
  const parsed = draftSchema.safeParse(first?.output), valid=parsed.success&&Boolean(first)&&!first!.failure;
  const firstRoute = parsed.success&&valid ? operationalRoute(parsed.data) : null;
  const finalRoute = run.status === "complete" && run.answer ? operationalRoute(run.answer) : null;
  const firstMatch = acceptedRoutes && firstRoute ? acceptedRoutes.includes(firstRoute) : null;
  const finalMatch = acceptedRoutes ? Boolean(finalRoute && acceptedRoutes.includes(finalRoute)) : null;
  return { firstProviderDraftHash: first?.output ? sha256(JSON.stringify(first.output)) : null,
    firstProviderDraftSchemaValid:parsed.success,firstProviderDraftValid: valid, firstProviderAttemptFailure: first?.failure ?? null, firstRoute, finalReleasedRoute: finalRoute,
    firstReferenceAgreement: firstMatch, finalReferenceAgreement: finalMatch,
    referenceDisagreementCorrected: firstMatch === false && finalMatch === true,
    referenceDisagreementIntroduced: firstMatch === true && finalRoute !== null && finalMatch === false,
    referenceMatchingDraftWithheld: firstMatch === true && finalRoute === null,
    routeChanged: firstRoute !== null && finalRoute !== null && firstRoute !== finalRoute,
    clinicalCorrectness: "not_independently_adjudicated", judgmentScope: "Target-route comparison only; corrected/introduced are reference deviations, not proven clinical errors. A reference-matching withheld draft may still contain a material prose defect." };
}

type Attempt = { index: number; id: string; run: DispositionRun | null; receipts: object[]; failure: string | null; identityFailures: string[]; durationMs: number; estimatedUSD: number | null; accountedUSD: number; unknownUsage: boolean };
export function summarizeCohort(plan: CohortPlan, attempts: Attempt[], starts: number, stopReason: string | null) {
  if (!Number.isInteger(starts) || starts < attempts.length || starts > plan.cases.length || new Set(attempts.map(a=>a.id)).size !== attempts.length || attempts.some((a,i) => a.index !== i+1 || plan.cases[a.index-1]?.id !== a.id)) throw new Error("COHORT_ATTEMPT_BINDING_MISMATCH");
  const reference = readPhysicianReference(readFileSync(REFERENCE,"utf8"),readFileSync(CSV,"utf8"));
  const valid = attempts.filter(a => a.run && !a.identityFailures.length && (plan.graphVersion !== "evidence-graph/v23" || !a.failure)).map(a=>a.run!);
  const pairs = attempts.map(a => ({ id:a.id, runId:a.run?.runId??null, identityFailures:a.identityFailures, failure:a.failure,
    ...(a.run ? firstDraftComparison(a.run,reference.cases.find(c=>c.id===a.id)!.reference.acceptedRoutes) : { firstRoute:null,finalReleasedRoute:null,clinicalCorrectness:"not_independently_adjudicated" }) }));
  return { protocol: plan.protocol ?? COHORT_PROTOCOL, fingerprint: plan.fingerprint, planned:50, starts, results:attempts.length, unfinishedStarted: starts-attempts.length,
    unattempted:plan.cases.slice(starts).map(c=>c.id), stopReason, transportOrDecoderFailures:attempts.filter(a=>a.failure).length,
    runtimeIdentityFailures:attempts.filter(a=>a.identityFailures.length).length, complete:valid.filter(r=>r.status==="complete").length,
    knownEstimatedUSD:attempts.reduce((n,a)=>n+(a.estimatedUSD??0),0), unknownUsageAttempts:attempts.filter(a=>a.unknownUsage).length,
    accountedUSD:attempts.reduce((n,a)=>n+a.accountedUSD,0)+(starts-attempts.length)*plan.reservation.perRunUSD,
    medianHTTPFinalMsAllResults:median(attempts.map(a=>a.durationMs)), pairs,
    routeProcessDiagnostics: { referenceDisagreementCorrected:pairs.filter(p=>"referenceDisagreementCorrected" in p&&p.referenceDisagreementCorrected&&p.identityFailures.length===0&&(plan.graphVersion!=="evidence-graph/v23"||!p.failure)).length,
      referenceDisagreementIntroduced:pairs.filter(p=>"referenceDisagreementIntroduced" in p&&p.referenceDisagreementIntroduced&&p.identityFailures.length===0&&(plan.graphVersion!=="evidence-graph/v23"||!p.failure)).length,
      referenceMatchingDraftWithheld:pairs.filter(p=>"referenceMatchingDraftWithheld" in p&&p.referenceMatchingDraftWithheld&&p.identityFailures.length===0&&(plan.graphVersion!=="evidence-graph/v23"||!p.failure)).length,
      conclusion:"Neither label agreement nor the online judge's acceptance establishes clinical improvement; exact drafts and any route deviations require independent adjudication." },
    cohort:scorePhysicianCohort(reference,valid,plan.promptHash), interpretation:plan.interpretation, observedVia:"HTTP NDJSON plus GUI decoder; not browser interaction or paint timing" };
}

export async function main(args: string[]) {
  const arg = (name:string)=>args.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3), planning=args.includes("--plan"), live=args.includes("--live");
  if (planning===live) throw new Error("CHOOSE_PLAN_OR_LIVE");
  const destination=arg("output"); if(!destination||existsSync(destination)) throw new Error("FRESH_OUTPUT_DIRECTORY_REQUIRED");
  const manifestPath=arg("manifest"), identityPath=arg("identity-run");
  if(planning&&!identityPath || live&&!manifestPath) throw new Error("PLAN_REQUIRES_IDENTITY_RUN_LIVE_REQUIRES_MANIFEST");
  const plan: CohortPlan=planning?buildCohortPlan(identityPath!,undefined,arg("endpoint")):JSON.parse(readFileSync(manifestPath!,"utf8"));
  verifyCohortPlan(plan);
  if(live&&arg("claim")!==plan.fingerprint) throw new Error("EXPLICIT_PLAN_HASH_CLAIM_REQUIRED");
  mkdirSync(destination,{recursive:false}); write(join(destination,"manifest.json"),plan);
  if(planning) { console.log(JSON.stringify({destination,fingerprint:plan.fingerprint,planned:50,allocationUSD:plan.authorization.cohortAllocationUSD,reservationUSD:plan.reservation.perRunUSD,providerCalls:0})); return; }
  claimCohortPlan(manifestPath!,destination,plan,arg("claim"));
  const attempts:Attempt[]=[]; let starts=0,accountedUSD=0,stopReason:string|null=null;
  try {
    for(const [i,c] of plan.cases.entries()) {
      verifyCohortPlan(plan);
      if(accountedUSD+plan.reservation.perRunUSD>plan.authorization.cohortAllocationUSD) {stopReason="COHORT_ALLOCATION_REMAINING_BELOW_FULL_RUN_RESERVATION";break;}
      const prefix=join(destination,`${String(i+1).padStart(2,"0")}-${c.id}`), request=cohortRequestBody(c.message);
      write(`${prefix}-started.json`,{index:i+1,id:c.id,inputHash:c.inputHash,request,at:new Date().toISOString(),reservationUSD:plan.reservation.perRunUSD,priorAccountedUSD:accountedUSD});
      starts++; const began=performance.now(),receipts:object[]=[];let run:DispositionRun|null=null,failure:string|null=null,identityFailures:string[]=[];
      const fd=openSync(`${prefix}-wire.ndjson`, "wx",0o600), receiptFd=openSync(`${prefix}-receipts.jsonl`,"wx",0o600);
      try {
        const url=validateCohortEndpoint(plan.endpoint);
        const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json",Origin:url.origin,"x-counsel-review":"local-v1"},body:JSON.stringify(request),signal:AbortSignal.timeout(plan.transport.httpAllowanceMs)});
        write(`${prefix}-http.json`,{status:response.status,headers:Object.fromEntries(response.headers),receivedMs:Math.round(performance.now()-began)});
        if(!response.ok) {const body=await response.text();writeFileSync(fd,body);throw new Error(`HTTP_${response.status}`);}
        if(!response.body) throw new Error("MISSING_STREAM");
        const captured=response.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){writeFileSync(fd,chunk);fsyncSync(fd);controller.enqueue(chunk);}}));
        run=await readDispositionStream(new Response(captured,{headers:response.headers,status:response.status}),c.message,()=>{},(event,timing)=>{
          const receipt={phase:"published",receivedMs:Math.round(timing.receivedAtMs-began),publishedMs:Math.round(timing.publishedAtMs-began),event};receipts.push(receipt);writeFileSync(receiptFd,JSON.stringify(receipt)+"\n");fsyncSync(receiptFd);
        },(event,receivedAtMs)=>{
          const receipt={phase:"received",receivedMs:Math.round(receivedAtMs-began),event};receipts.push(receipt);writeFileSync(receiptFd,JSON.stringify(receipt)+"\n");fsyncSync(receiptFd);
        });
        write(`${prefix}-run.json`,run);
        const eventPath=join(RUNTIME,"events",`${run.runId}.jsonl`); let start:Record<string,unknown>|undefined;
        if(existsSync(eventPath)){const raw=readFileSync(eventPath,"utf8");writeFileSync(`${prefix}-server-events.jsonl`,raw,{flag:"wx",mode:0o600});start=JSON.parse(raw.split("\n")[0]);}
        identityFailures=candidateIdentityFailures(plan,run,c.message,start,JSON.parse(readFileSync(cohortVersionPolicy(plan.graphVersion).corpusPath,"utf8")));
      } catch(error) {failure=error instanceof Error?error.message:"HTTP_STUDY_FAILURE";}
      finally {closeSync(fd);closeSync(receiptFd);}
      const cost=cohortAccountedCost(run,plan.reservation);accountedUSD+=cost.accountedUSD;
      const result:Attempt={index:i+1,id:c.id,run,receipts,failure,identityFailures,durationMs:Math.round(performance.now()-began),...cost};attempts.push(result);
      write(`${prefix}-result.json`,{...result,accountedCumulativeUSD:accountedUSD});
      console.log(JSON.stringify({id:c.id,runId:run?.runId,status:run?.status??"unfinished_or_transport_failure",durationMs:result.durationMs,failure,identityFailures,estimatedUSD:cost.estimatedUSD,accountedUSD}));
      if(failure||identityFailures.length||cost.unknownUsage||cost.accountedUSD>plan.reservation.perRunUSD) {stopReason=failure?"HTTP_OR_DECODER_FAILURE_STOP":identityFailures.length?"RUNTIME_IDENTITY_DRIFT_STOP":cost.unknownUsage?"UNKNOWN_USAGE_STOP":"RESERVATION_BOUND_EXCEEDED_STOP";break;}
    }
  } catch(error) {stopReason=error instanceof Error?error.message:"HARNESS_INTERRUPTED";throw error;}
  finally {write(join(destination,"summary.json"),summarizeCohort(plan,attempts,starts,stopReason));}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
