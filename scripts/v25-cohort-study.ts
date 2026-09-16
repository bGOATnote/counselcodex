/** EVAL ONLY. Existing /api/candidate, unchanged live runtime, no offline judge. */
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, openSync, closeSync, fsyncSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseEnv } from "node:util";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { productionArtifactFiles, validateCohortEndpoint, cohortRequestBody } from "./candidate-cohort-study.ts";
import { readPhysicianReference, candidateInputs, scorePhysicianCohort } from "../src/evaluation/physician-cohort.ts";
import { estimateStudyCost, STUDY_PRICING } from "../src/evaluation/clinical-study-budget.ts";
import { resolveGraphConfig } from "../src/disposition/graph-config.ts";
import { graphPromptHash, graphRequestSettings, contextSchema, safetySchema, wireDraftSchema } from "../src/disposition/clinical-graph.ts";
import { GRAPH_INSTRUCTIONS, graphSafetyInstructions } from "../src/disposition/graph-prompts.ts";
import { DEFAULT_CANDIDATE_MODE, GATES_RELEASE_VERSION, GATES_RELEASE_POLICY, GATES_OUTPUT_INSTRUCTIONS } from "../src/disposition/gates-release.ts";
import { sha256 } from "../src/evidence/rag/model.ts";
import { EMBEDDING_POLICY } from "../src/evidence/rag/store.ts";
import { EXECUTION_POLICY } from "../src/disposition/execution-policy.ts";
import { readDispositionStream } from "../apps/evaluation/lib/disposition-stream.ts";
import type { DispositionRun } from "../src/disposition/contract.ts";
import { scoreV25PathB, type PathBAttemptAdmission } from "../src/evaluation/v25-path-b.ts";

const CSV = "data/patient_messages.csv", GOLD = "data/evaluation/physician-system-reference-v2.json";
const RUNTIME = "apps/evaluation/.local/clinical-evidence-graph-v1";
const hashFile = (p: string) => sha256(readFileSync(p));
const write = (p: string, value: unknown) => writeFileSync(p, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const filesIn = (p: string): string[] => readdirSync(p, { withFileTypes: true }).flatMap(e => e.isDirectory() ? filesIn(join(p,e.name)) : /\.(ts|js|mjs|json)$/.test(e.name) ? [join(p,e.name)] : []);
export function currentV25Config() {
  const env = existsSync(".env") ? parseEnv(readFileSync(".env", "utf8")) : {};
  const merged = { ...env, ...process.env };
  if (merged.COUNSEL_RAG_DIRECTORY) throw new Error("CUSTOM_RAG_DIRECTORY_REQUIRES_NEW_PROTOCOL");
  return resolveGraphConfig(merged);
}
export function v25Reservation(config = currentV25Config()) {
  if (config.factGraphMode !== "off" || config.safetyStyle !== "full") throw new Error("FROZEN_V25_CONFIGURATION_REQUIRED");
  const defs = [
    { role: "context", count: 1, instructions: GRAPH_INSTRUCTIONS.context, schema: contextSchema },
    { role: "safety", count: 1, instructions: graphSafetyInstructions(config.safetyStyle), schema: safetySchema },
    { role: "disposition", count: 2, instructions: GRAPH_INSTRUCTIONS.disposition + GATES_OUTPUT_INSTRUCTIONS, schema: wireDraftSchema },
  ] as const;
  const calls = defs.map(d => {
    const model = config.models[d.role], rate = STUDY_PRICING.models[model as keyof typeof STUDY_PRICING.models];
    if (!rate || !model.startsWith("anthropic/")) throw new Error("UNPRICED_V25_MODEL");
    const inputTokenBound = 60_000 + Buffer.byteLength(d.instructions + JSON.stringify(d.schema.toJSONSchema())) + 16_384;
    const outputTokenBound = graphRequestSettings(d.role, config).modelSettings.maxOutputTokens;
    return { role: d.role, model, count: d.count, inputTokenBound, outputTokenBound,
      usd: d.count * (inputTokenBound * rate.input * 2 + outputTokenBound * rate.output) / 1e6 };
  });
  return { calls, perRunUSD: calls.reduce((n,c) => n+c.usd,0) + .002, embeddingReserveUSD: .002,
    inputCacheMultiplier: 2, maximumCalls: 4,
    basis: "One context, one safety, up to two producer calls after actual failure; runtime 60KB payload cap plus instructions/schema and 16,384-token envelope allowance. Full output limits; 2x input covers highest 1h cache write price. Three short query embeddings reserve $0.002. This is a conservative token bound, not an invoice or an imposed runtime limit." };
}
export function v25Account(run: DispositionRun | null, reservation: ReturnType<typeof v25Reservation>) {
  const estimatedModelUSD = run ? estimateStudyCost(run) : null;
  const embeddingTokens = run?.graph?.retrieval.reduce((n,r) => n + r.embeddingTokens, 0) ?? null;
  const estimatedEmbeddingUSD = embeddingTokens === null ? null : embeddingTokens * EMBEDDING_POLICY.inputPricePerMillion / 1e6;
  // Missing totals are not zero. Charge the entire prospective reservation;
  // keep going only if the next whole request also fits the remaining cap.
  const unknownUsage = estimatedModelUSD === null || !Number.isFinite(estimatedModelUSD);
  const boundedModelUSD = unknownUsage ? null : (run?.agents ?? []).reduce((n,a) => { const rate=STUDY_PRICING.models[a.model as keyof typeof STUDY_PRICING.models];return n+(a.modelCalls===0?0:(a.usage.inputTokens!*rate.input*2+a.usage.outputTokens!*rate.output)/1e6); },0);
  return { estimatedModelUSD, estimatedEmbeddingUSD, unknownUsage,
    accountedUSD: unknownUsage ? reservation.perRunUSD : boundedModelUSD! + reservation.embeddingReserveUSD };
}
export function canStartV25(accountedUSD: number, reservationUSD: number) {
  return Number.isFinite(accountedUSD) && accountedUSD >= 0 && Number.isFinite(reservationUSD) && reservationUSD > 0 && accountedUSD + reservationUSD <= 70;
}
export function freezeV25() {
  if (DEFAULT_CANDIDATE_MODE !== "gates-release" || GATES_RELEASE_VERSION !== "evidence-graph/v25" || GATES_RELEASE_POLICY !== "gates-release/v1") throw new Error("V25_DEFAULT_IDENTITY_REQUIRED");
  const config = currentV25Config(), corpusPath = "apps/evaluation/.local/clinical-rag-v8/corpus.json";
  const corpus = JSON.parse(readFileSync(corpusPath,"utf8"));
  const reference = readPhysicianReference(readFileSync(GOLD,"utf8"), readFileSync(CSV,"utf8"));
  const codeFiles = [...new Set([...filesIn("src"), ...filesIn("apps/evaluation/app"), ...filesIn("apps/evaluation/lib"), ...filesIn("apps/evaluation/components"),
    "scripts/v25-cohort-study.ts", "scripts/candidate-cohort-study.ts", "scripts/physician-cohort-score.ts", "package.json", "package-lock.json", "apps/evaluation/package.json",
    "tests/gates-release.test.ts", "tests/v25-cohort-study.test.ts", CSV, GOLD])].sort();
  const commit = git("rev-parse", "HEAD");
  for (const p of codeFiles) if (sha256(execFileSync("git", ["show", `${commit}:${p}`], { maxBuffer: 32 * 1024 * 1024 })) !== hashFile(p)) throw new Error(`UNCHECKED_IN_CODE:${p}`);
  const artifactFiles = productionArtifactFiles();
  const plan = { protocol: "v25-path-b-live-http/v1", createdAt: new Date().toISOString(), commit,
    identity: { version: GATES_RELEASE_VERSION, mode: "gates-release", release: "gates_only", policy: GATES_RELEASE_POLICY },
    config, configHash: sha256(JSON.stringify(config)), promptHash: graphPromptHash(config,"gates-release"),
    providerSettings: Object.fromEntries(["context", "safety", "disposition"].map(role => [role, graphRequestSettings(role as "context" | "safety" | "disposition", config)])),
    codeFiles: Object.fromEntries(codeFiles.map(p => [p,hashFile(p)])), productionFiles: Object.fromEntries(artifactFiles.map(p => [p,hashFile(p)])),
    corpusPath, corpusFileHash: hashFile(corpusPath), corpusHash: corpus.hash, goldPath: GOLD, goldHash: hashFile(GOLD),
    cases: candidateInputs(reference), plannedN: 50, endpoint: "http://localhost:4120/api/candidate", runtime: RUNTIME,
    authorization: { usd: 70, reference: "User PAID_EVAL_UNLOCK=$70, V25 PATH B, EVAL ONLY", externalRetries: 0, judgeCalls: 0, embeddingRebuilds: 0 },
    reservation: v25Reservation(config), pricing: { ...STUDY_PRICING, checkedAt: "2026-09-15", embedding: EMBEDDING_POLICY,
      embeddingSource: "https://developers.openai.com/api/docs/models/text-embedding-3-large", caveat: "Published token-price estimates, not invoiced spend. Cache read/write categories are not used to claim discounts; conservative accounting doubles input charges, retains full output charges and reserves embeddings." },
    httpAllowanceMs: EXECUTION_POLICY.modelTimeoutMs * 3 + 120_000,
    selection: "C01-C50 original order, one fresh first attempt each. No external retries or debug calls. Runtime's existing bounded producer recovery stays part of that first attempt. Actual HTTP with production GUI decoder; not browser paint timing.",
    reserveNote: "Separate $70 authorization only. Historical ledgers and all RAG branch work remain untouched. No judge, RAG redesign, re-embedding or model changes." };
  return { ...plan, fingerprint: sha256(JSON.stringify(plan)) };
}
export type V25Plan = ReturnType<typeof freezeV25>;
export function verifyV25(plan: V25Plan) {
  const { fingerprint, ...rest } = plan;
  if (fingerprint !== sha256(JSON.stringify(rest)) || plan.protocol !== "v25-path-b-live-http/v1" || plan.authorization.usd !== 70 || plan.plannedN !== 50 || plan.cases.length !== 50) throw new Error("FROZEN_V25_PLAN_INVALID");
  if (JSON.stringify(currentV25Config()) !== JSON.stringify(plan.config) || graphPromptHash(plan.config,"gates-release") !== plan.promptHash) throw new Error("FROZEN_CONFIG_DRIFT");
  for (const [p,h] of Object.entries({ ...plan.codeFiles, ...plan.productionFiles })) if (hashFile(p) !== h) throw new Error(`FROZEN_CODE_DRIFT:${p}`);
  if (hashFile(plan.corpusPath) !== plan.corpusFileHash) throw new Error("FROZEN_CORPUS_DRIFT");
  if (JSON.stringify(productionArtifactFiles()) !== JSON.stringify(Object.keys(plan.productionFiles))) throw new Error("FROZEN_ARTIFACT_SET_DRIFT");
  validateCohortEndpoint(plan.endpoint);
}
export function v25IdentityFailures(plan: V25Plan, run: DispositionRun, message: string, start: Record<string, unknown> | null) {
  const failures: string[] = [];
  if (run.message !== message || run.inputHash !== sha256(message) || run.promptHash !== plan.promptHash) failures.push("INPUT_OR_PROMPT_DRIFT");
  if (start?.runId !== run.runId || start?.inputHash !== run.inputHash || start?.version !== plan.identity.version || start?.mode !== plan.identity.mode || start?.promptHash !== plan.promptHash || JSON.stringify(start?.config) !== JSON.stringify(plan.config)) failures.push("SERVER_STARTED_IDENTITY_DRIFT");
  if (run.graph && (run.graph.version !== plan.identity.version || run.graph.mode !== plan.identity.mode || run.graph.retrieval.some(r => r.corpusHash !== plan.corpusHash))) failures.push("GRAPH_OR_CORPUS_DRIFT");
  if (run.status === "complete" && (run.graph?.release !== "gates_only" || run.graph.gatesAdmission?.policy !== "gates-release/v1")) failures.push("COMPLETION_CONTRACT_DRIFT");
  const roles = { history: plan.config.models.context, emergency: plan.config.models.safety, disposition: plan.config.models.disposition };
  if (run.agents?.some(a => a.model !== roles[a.role as keyof typeof roles])) failures.push("ROLE_OR_MODEL_DRIFT");
  if (run.modelCalls > plan.reservation.maximumCalls) failures.push("UNEXPECTED_EXTRA_MODEL_CALLS");
  return failures;
}
export function unsettledV25Starts(started: string[], settled: string[], reservationUSD: number) {
  const unfinished = started.filter(id=>!settled.includes(id));
  return { unfinished, reservedUSD:unfinished.length*reservationUSD };
}
export async function runV25(plan: V25Plan, output: string, claim: string | undefined) {
  verifyV25(plan);
  if (claim !== plan.fingerprint || process.env.PAID_EVAL_UNLOCK !== "70") throw new Error("EXPLICIT_70_DOLLAR_UNLOCK_AND_FINGERPRINT_REQUIRED");
  if (existsSync(output)) throw new Error("NEW_OUTPUT_DIRECTORY_REQUIRED");
  mkdirSync("outputs/.v25-eval-claims", { recursive: true });
  write(join("outputs/.v25-eval-claims",`${plan.fingerprint}.json`), { output: resolve(output), claimedAt: new Date().toISOString(), ceilingUSD: 70 });
  mkdirSync(output); mkdirSync(join(output,"runtime")); mkdirSync(join(output,"runtime","runs")); mkdirSync(join(output,"runtime","diagnostic-runs"));
  write(join(output,"manifest.json"),plan);
  let accountedUSD = 0, stopReason: string | null = null;
  const attempts: Record<string, unknown>[] = [], runs: DispositionRun[] = [], started: string[] = [];
  try {
    for (const c of plan.cases) {
      verifyV25(plan);
      if (!canStartV25(accountedUSD,plan.reservation.perRunUSD)) { stopReason = "BUDGET_CANNOT_RESERVE_NEXT_REQUEST"; break; }
      const prefix = join(output,c.id), began = performance.now();
      const priorRunIds = new Set(readdirSync(join(RUNTIME,"runs")));
      write(`${prefix}-started.json`, { id:c.id, attempt:"first_attempt", at:new Date().toISOString(), inputHash:c.inputHash, reservedUSD:plan.reservation.perRunUSD, priorAccountedUSD:accountedUSD });
      started.push(c.id);
      const wireFd = openSync(`${prefix}-wire.ndjson`,"wx",0o600), receiptsFd = openSync(`${prefix}-receipts.jsonl`,"wx",0o600);
      let run: DispositionRun | null = null, failure: string | null = null, identityFailures: string[] = [];
      try {
        const url = validateCohortEndpoint(plan.endpoint);
        const response = await fetch(url, { method:"POST", headers:{"Content-Type":"application/json",Origin:url.origin,"x-counsel-review":"local-v1"}, body:JSON.stringify(cohortRequestBody(c.message)), signal:AbortSignal.timeout(plan.httpAllowanceMs) });
        write(`${prefix}-http.json`,{status:response.status,headers:Object.fromEntries(response.headers)});
        if (!response.ok || !response.body) { writeFileSync(wireFd,await response.text()); throw new Error(`HTTP_${response.status}`); }
        const captured = response.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){writeFileSync(wireFd,chunk);fsyncSync(wireFd);controller.enqueue(chunk);}}));
        run = await readDispositionStream(new Response(captured,{headers:response.headers}),c.message,()=>{},(event,timing)=>{
          writeFileSync(receiptsFd,JSON.stringify({phase:"published",receivedMs:timing.receivedAtMs-began,publishedMs:timing.publishedAtMs-began,event})+"\n");fsyncSync(receiptsFd);
        },(event,at)=>{writeFileSync(receiptsFd,JSON.stringify({phase:"received",receivedMs:at-began,event})+"\n");fsyncSync(receiptsFd);});
      } catch (error) { failure = error instanceof Error ? error.message : "HTTP_OR_DECODER_FAILURE"; }
      finally { closeSync(wireFd); closeSync(receiptsFd); }
      // A decoder refusal must not erase the actual provider run or its spend.
      if (!run) {
        const fresh = readdirSync(join(RUNTIME,"runs")).filter(n => !priorRunIds.has(n)).map(n => JSON.parse(readFileSync(join(RUNTIME,"runs",n),"utf8")) as DispositionRun).filter(r => r.message === c.message);
        if (fresh.length === 1) run = fresh[0];
      }
      if (run) {
        const eventPath = join(RUNTIME,"events",`${run.runId}.jsonl`);
        const raw = existsSync(eventPath) ? readFileSync(eventPath,"utf8") : null;
        if (raw) writeFileSync(`${prefix}-server-events.jsonl`,raw,{flag:"wx"});
        identityFailures = v25IdentityFailures(plan,run,c.message,raw ? JSON.parse(raw.split("\n")[0]) : null);
        write(`${prefix}-run.json`,run); runs.push(run);
        write(join(output,"runtime","diagnostic-runs",`${run.runId}.json`),run);
        // Only response-path accepted, identity-bound runs enter release scoring;
        // transport failures still remain in the attempt ledger/per-case report.
        if (!failure && !identityFailures.length) write(join(output,"runtime","runs",`${run.runId}.json`),run);
      }
      const cost = v25Account(run,plan.reservation); accountedUSD += cost.accountedUSD;
      const attempt = { id:c.id, attempt:"first_attempt", runId:run?.runId??null, status:run?.status??"transport_or_unfinished", httpAccepted:failure===null, failure, identityFailures, ...cost, accountedCumulativeUSD:accountedUSD,
        providerCompleteHttpMs:run?.status==="complete" && !failure && !identityFailures.length ? Math.round(performance.now()-began) : null };
      attempts.push(attempt); write(`${prefix}-attempt.json`,attempt); console.log(JSON.stringify(attempt));
      if (failure || identityFailures.length || cost.accountedUSD > plan.reservation.perRunUSD) { stopReason = failure ? "HTTP_OR_DECODER_FAILURE_STOP" : identityFailures.length ? "IDENTITY_DRIFT_STOP" : "RESERVATION_BOUND_EXCEEDED"; break; }
    }
  } catch(error) { stopReason = error instanceof Error ? error.message : "HARNESS_FAILURE"; }
  finally {
    const unsettled=unsettledV25Starts(started,attempts.map(a=>String(a.id)),plan.reservation.perRunUSD);
    accountedUSD+=unsettled.reservedUSD;
    for (const id of unsettled.unfinished) attempts.push({id,attempt:"first_attempt",runId:null,status:"unfinished",failure:stopReason??"HARNESS_INTERRUPTED",identityFailures:[],unknownUsage:true,estimatedModelUSD:null,estimatedEmbeddingUSD:null,accountedUSD:plan.reservation.perRunUSD,accountedCumulativeUSD:accountedUSD,httpAccepted:false});
    const admissions:PathBAttemptAdmission[]=attempts.map(a=>({id:String(a.id),runId:a.runId as string|null,eligible:a.httpAccepted===true&&(a.identityFailures as string[]).length===0,failure:a.failure as string|null}));
    write(join(output,"runtime","attempt-admission.json"),admissions);
    // Persist all spending before scoring: scorer failure cannot erase a paid attempt.
    write(join(output,"ledger.json"),{ceilingUSD:70,accountedUSD,remainingUSD:70-accountedUSD,stopReason,plannedN:50,started:started.length,unfinishedStarted:unsettled.unfinished,unattempted:plan.cases.slice(started.length).map(c=>c.id),
      estimatedModelUSD:attempts.reduce((n,a)=>n+Number(a.estimatedModelUSD??0),0), estimatedEmbeddingUSD:attempts.reduce((n,a)=>n+Number(a.estimatedEmbeddingUSD??0),0), unknownUsageAttempts:attempts.filter(a=>a.unknownUsage).length,
      reserveNote:plan.reserveNote, attempts});
    const admitted = readdirSync(join(output,"runtime","runs")).map(p => JSON.parse(readFileSync(join(output,"runtime","runs",p),"utf8")) as DispositionRun);
    const reference = readPhysicianReference(readFileSync(GOLD,"utf8"),readFileSync(CSV,"utf8"));
    write(join(output,"scorecard.json"),{...scorePhysicianCohort(reference,admitted,plan.promptHash),pathB:scoreV25PathB(reference,runs,plan.promptHash,admissions)});
    console.log(JSON.stringify({finished:true,output,attempted:attempts.length,accountedUSD,stopReason}));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, path, output, claim] = process.argv.slice(2);
  if (command === "freeze" && path) { const plan=freezeV25();write(path,plan);console.log(JSON.stringify({path,fingerprint:plan.fingerprint,commit:plan.commit,promptHash:plan.promptHash,config:plan.config,plannedN:50,reservationUSD:plan.reservation.perRunUSD,paidCalls:0})); }
  else if (command === "run" && path && output) await runV25(JSON.parse(readFileSync(path,"utf8")),output,claim);
  else throw new Error("Usage: v25-cohort-study.ts freeze NEW_PLAN_JSON | run PLAN_JSON NEW_OUTPUT_DIRECTORY PLAN_FINGERPRINT");
}
