import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { deriveCohorts, verifyUpstream } from "./healthbench-emergency.mjs";
import { adaptiveAnswerSchema, type DispositionRun, type ResponseEvent } from "../disposition/contract.ts";
import { operationalRoute, ROUTING_POLICY_VERSION } from "../disposition/routing-policy.ts";
import { responseEventSchema } from "../disposition/progressive.ts";
import { estimateStudyCost, STUDY_PRICING } from "./clinical-study-budget.ts";
import { ADAPTIVE_VERSION } from "../disposition/adaptive.ts";

export const BENCHMARK_VERSION = "current-disposition-benchmark/v1";
export const BENCHMARK_ARMS = ["base-opus", "adaptive-opus"] as const;
export type BenchmarkArm = typeof BENCHMARK_ARMS[number];
export const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const turnSchema = z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1) }).strict();
const rowSchema = z.object({ prompt_id: z.string().regex(/^[A-Za-z0-9_-]+$/), prompt: z.array(turnSchema).min(1), example_tags: z.array(z.string()), rubrics: z.array(z.object({ criterion: z.string(), points: z.number(), tags: z.array(z.string()) })) }).passthrough();
export type BenchmarkCase = {
  id: string; promptHash: string; referenceHash: string; rubricHash: string; familyId: string;
  cohort: "primary" | "conditional_stress" | "excluded_scope_stress";
  emergencyExpected: boolean | null; turns: z.infer<typeof turnSchema>[];
  rubrics: { criterion: string; points: number; tags: string[] }[];
  unsupportedReason: "MULTITURN_ADAPTER_REQUIRED" | "INPUT_LIMIT_EXCEEDED" | null;
};
// The source/config are hash-verified before any selection. Reference metadata
// stays on this side of the inference boundary; it never enters a model prompt.
export function loadClinicalBenchmark(source: string, config: Parameters<typeof deriveCohorts>[1]) {
  const raw = verifyUpstream(source, config), rows = raw.map(row => rowSchema.parse(row));
  const derived = deriveCohorts(rows, config), primaryIds = new Set(derived.primary.map((r: { prompt_id: string }) => r.prompt_id));
  const languageIds = new Set(config.selection.auditableLanguageExclusions.map((r: { promptId: string }) => r.promptId));
  const theme = rows.filter(r => r.example_tags.includes(config.selection.themeTag) && !languageIds.has(r.prompt_id));
  const cases: BenchmarkCase[] = theme.map(row => {
    const emergent = row.example_tags.includes(config.selection.categories.emergent);
    const conditional = row.example_tags.includes(config.selection.categories.conditional);
    const nonEmergent = row.example_tags.includes(config.selection.categories.nonEmergent);
    if (Number(emergent) + Number(conditional) + Number(nonEmergent) !== 1) throw new Error("INVALID_EMERGENCY_REFERENCE");
    if (row.prompt.at(-1)?.role !== "user") throw new Error("INVALID_BENCHMARK_LAST_ROLE");
    // Exact duplicate conversations are one statistical cluster, regardless of ID.
    const promptHash = digest(row.prompt);
    return { id: row.prompt_id, promptHash, familyId: promptHash,
      referenceHash: digest({ tags: row.example_tags, rubrics: row.rubrics }), rubricHash:digest(row.rubrics),
      emergencyExpected: conditional ? null : emergent,
      cohort: primaryIds.has(row.prompt_id) ? "primary" : conditional ? "conditional_stress" : "excluded_scope_stress",
      turns: row.prompt, rubrics: row.rubrics,
      unsupportedReason: row.prompt.length !== 1 ? "MULTITURN_ADAPTER_REQUIRED" : row.prompt[0].content.length > 12000 ? "INPUT_LIMIT_EXCEEDED" : null,
    };
  });
  return { cases, audit: derived.audit, upstreamHash: config.upstream.sha256, selectionHash: digest(config) };
}

export function inferenceInput(c: BenchmarkCase) {
  if (c.unsupportedReason || c.turns.length !== 1 || c.turns[0].role !== "user" || digest(c.turns) !== c.promptHash) throw new Error("BENCHMARK_INPUT_UNSUPPORTED_OR_CHANGED");
  return { id: c.id, message: c.turns[0].content };
}
type CaseIndex = Omit<BenchmarkCase, "turns" | "rubrics">;
export function benchmarkManifest(cases: BenchmarkCase[], fingerprint: string, options: { repetitions?: number; execution?: "provider" | "simulated"; seed?: string } = {}) {
  const repetitions = options.repetitions ?? 1, seed = options.seed ?? "clinical-benefit-v1";
  if (!cases.length || cases.some(c=>!/^[A-Za-z0-9_-]+$/.test(c.id)) || new Set(cases.map(c => c.id)).size !== cases.length || !fingerprint || !Number.isInteger(repetitions) || repetitions < 1 || repetitions > 5) throw new Error("INVALID_BENCHMARK_PLAN");
  const index: CaseIndex[] = cases.map(({ turns, rubrics, ...c }) => { if (digest(turns) !== c.promptHash || digest(rubrics)!==c.rubricHash) throw new Error("PROMPT_OR_RUBRIC_HASH_MISMATCH"); return c; }).sort((a,b) => a.id.localeCompare(b.id));
  const order = [...index].sort((a,b) => digest([seed,a.id]).localeCompare(digest([seed,b.id])));
  // A fixed balanced DEVELOPMENT pilot; the untouched remainder is separately
  // identified. No outcome, symptom or generation is used to select these IDs.
  const pilotIds = [true,false].flatMap(label => order.filter(c => c.cohort === "primary" && c.emergencyExpected === label && !c.unsupportedReason).slice(0,6).map(c => c.id));
  return { version: BENCHMARK_VERSION, fingerprint, workflowVersion: ADAPTIVE_VERSION, routingPolicy: ROUTING_POLICY_VERSION, seed, repetitions, execution: options.execution ?? "provider", arms: BENCHMARK_ARMS,
    index, indexHash: digest(index), pilotIds, order: order.map(c => c.id),
    comparison: "Whole-workflow effect of adding Haiku planning and live retrieval to Opus with shared safeguards/output contract. NOT isolated retrieval or critique lift.",
    reference: "Upstream physician-consensus emergency categories, not five-route clinical reference labels. Conditional rows have no binary emergency truth.",
    primaryEndpoint: "Complete five-route output with binary emergency agreement and no contradictory earlier emergency instruction; not a full clinical quality score.",
    frozenBeforeGeneration: true,
  };
}
export type BenchmarkManifest = ReturnType<typeof benchmarkManifest>;
export type BenchmarkRecord = {
  version: string; manifestHash: string; id: string; trial: number; arm: BenchmarkArm; promptHash: string;
  status: "recorded" | "failed" | "unsupported" | "interrupted";
  run: DispositionRun | null; events: ResponseEvent[]; failure: string | null;
  durationMs: number | null; eventCaptureFailed: boolean; recordHash: string;
};
export type BenchmarkRunner = (input: { id: string; message: string }, arm: BenchmarkArm, onEvent: (e: ResponseEvent) => void) => Promise<DispositionRun>;
function immutable(path: string, value: unknown) {
  const fd = openSync(path, "wx", 0o600);
  try { writeFileSync(fd, JSON.stringify(value, null, 2)); fsyncSync(fd); } finally { closeSync(fd); }
}
export function planBenchmark(directory: string, manifest: BenchmarkManifest) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory,"manifest.json");
  if (existsSync(path)) { if (digest(JSON.parse(readFileSync(path,"utf8"))) !== digest(manifest)) throw new Error("BENCHMARK_MANIFEST_CHANGED"); }
  else immutable(path, manifest);
}
const nameFor = (id: string, trial: number, arm: BenchmarkArm) => `${id}--${trial}--${arm}`;
export function readBenchmarkRecords(directory: string, manifest: BenchmarkManifest) {
  validateRecords(manifest,[]);
  const records: BenchmarkRecord[] = [];
  for (const c of manifest.index) for (let trial=1;trial<=manifest.repetitions;trial++) for (const arm of manifest.arms) {
    const path = join(directory,`${nameFor(c.id,trial,arm)}.json`);
    if (existsSync(path)) records.push(JSON.parse(readFileSync(path,"utf8")));
  }
  validateRecords(manifest,records);
  return records;
}
export async function runBenchmark(cases: BenchmarkCase[], directory: string, manifest: BenchmarkManifest, runner: BenchmarkRunner, stage: "pilot" | "primary" | "stress", signal?: AbortSignal, beforeAttempt?:()=>void) {
  if (digest(cases.map(({ turns, rubrics, ...c }) => c).sort((a,b)=>a.id.localeCompare(b.id))) !== manifest.indexHash || cases.some(c => digest(c.turns) !== c.promptHash || digest(c.rubrics)!==c.rubricHash)) throw new Error("BENCHMARK_CASES_CHANGED");
  planBenchmark(directory,manifest);
  const lockPath = join(directory,"runner.lock");
  let lock: number;
  try { lock = openSync(lockPath,"wx",0o600); writeFileSync(lock,JSON.stringify({ pid: process.pid, at: new Date().toISOString() })); fsyncSync(lock); }
  catch { throw new Error("BENCHMARK_LOCKED_INSPECT_BEFORE_RECOVERY"); }
  const chosen = manifest.order.filter(id => stage === "pilot" ? manifest.pilotIds.includes(id) : manifest.index.find(c=>c.id===id)!.cohort === "primary" ? stage === "primary" : stage === "stress");
  try {
    readBenchmarkRecords(directory,manifest);
    for (const id of chosen) for (let trial=1;trial<=manifest.repetitions;trial++) {
      const c = cases.find(c=>c.id===id)!;
      const arms = (manifest.order.indexOf(id)+trial)%2 ? [...manifest.arms] : [...manifest.arms].reverse();
      for (const arm of arms) {
        if (signal?.aborted) return readBenchmarkRecords(directory,manifest);
        const name = nameFor(id,trial,arm), path = join(directory,`${name}.json`), admission = join(directory,`${name}.attempt.json`);
        if (existsSync(path)) continue;
        let run: DispositionRun | null = null, failure: string | null = c.unsupportedReason;
        let status: BenchmarkRecord["status"] = c.unsupportedReason ? "unsupported" : "recorded";
        let durationMs: number | null = null, eventCaptureFailed = false;
        const events: ResponseEvent[] = [];
        if (!c.unsupportedReason && existsSync(admission)) {
          const prior=JSON.parse(readFileSync(admission,"utf8"));
          if(prior.manifestHash!==digest(manifest) || prior.promptHash!==c.promptHash || prior.arm!==arm || prior.trial!==trial) throw new Error("BENCHMARK_ADMISSION_MISMATCH");
          status = "interrupted"; failure = "PRIOR_ATTEMPT_UNKNOWN_NO_RETRY";
          eventCaptureFailed=true; // Absence of a journal tail is not proof of no emission.
          const journal=join(directory,`${name}.events.jsonl`);
          if(existsSync(journal)) {
            // Recover the durable, complete prefix only. A torn tail cannot erase
            // an earlier notice or be silently promoted to a valid event.
            const lines=readFileSync(journal,"utf8").split("\n");
            for(const line of lines.slice(0,-1)) {
              if(events.length>=128) break;
              try { events.push(responseEventSchema.parse(JSON.parse(line))); } catch { break; }
            }
          }
        }
        else if (!c.unsupportedReason) {
          beforeAttempt?.(); // Stop before admission when no approved capacity remains.
          immutable(admission,{ manifestHash: digest(manifest), promptHash: c.promptHash, arm, trial, at: new Date().toISOString() });
          const started = performance.now();
          let accepting = true, fd: number | undefined;
          try {
            fd = openSync(join(directory,`${name}.events.jsonl`),"wx",0o600);
            const onEvent = (e: ResponseEvent) => {
              if (!accepting) return;
              const parsed = responseEventSchema.safeParse(e);
              if (!parsed.success || events.length>=128) { eventCaptureFailed=true; return; }
              const event = structuredClone({ ...parsed.data, elapsedMs: parsed.data.elapsedMs ?? Math.round(performance.now()-started) });
              // Persist notices before accepting them as observed, even when the
              // final call throws. This is server emission, not browser receipt.
              try { writeFileSync(fd!,JSON.stringify(event)+"\n"); fsyncSync(fd!); events.push(event); } catch { eventCaptureFailed=true; }
            };
            run = await runner(inferenceInput(c),arm,onEvent);
            if (run.message !== c.turns[0].content || run.inputHash !== createHash("sha256").update(run.message).digest("hex") || run.profile !== arm || run.adaptive?.version!==manifest.workflowVersion || run.routingPolicy!==manifest.routingPolicy) { run=null; throw new Error("BENCHMARK_RUN_IDENTITY_MISMATCH"); }
            if (digest(run.responseEvents ?? []) !== digest(events)) { eventCaptureFailed=true; }
          } catch (error) { status="failed"; failure=error instanceof Error && /^BENCHMARK_/.test(error.message) ? error.message : "EXECUTION_FAILED"; }
          finally { accepting=false; if (fd!==undefined) closeSync(fd); durationMs=Math.round(performance.now()-started); }
        }
        const record = { version: BENCHMARK_VERSION, manifestHash: digest(manifest), id, trial, arm, promptHash: c.promptHash, status, run, events, failure, durationMs, eventCaptureFailed };
        immutable(path,{ ...record, recordHash: digest(record) });
      }
    }
    return readBenchmarkRecords(directory,manifest);
  } finally { closeSync(lock); unlinkSync(lockPath); }
}
function validateRecords(manifest: BenchmarkManifest, records: BenchmarkRecord[]) {
  if(manifest.indexHash!==digest(manifest.index) || manifest.version!==BENCHMARK_VERSION || manifest.index.some(c=>!/^[A-Za-z0-9_-]+$/.test(c.id)) || digest(manifest.arms)!==digest(BENCHMARK_ARMS) || new Set(manifest.index.map(c=>c.id)).size!==manifest.index.length || !Number.isInteger(manifest.repetitions) || manifest.repetitions<1 || manifest.repetitions>5) throw new Error("BENCHMARK_MANIFEST_INVALID");
  const identities = new Set<string>();
  for (const r of records) {
    const { recordHash,...payload }=r, c=manifest.index.find(c=>c.id===r.id), identity=nameFor(r.id,r.trial,r.arm);
    if (!c || identities.has(identity) || r.version!==BENCHMARK_VERSION || r.manifestHash!==digest(manifest) || r.promptHash!==c.promptHash || !manifest.arms.includes(r.arm) || !Number.isInteger(r.trial) || r.trial<1 || r.trial>manifest.repetitions || digest(payload)!==recordHash) throw new Error("BENCHMARK_RECORD_MISMATCH");
    if (r.durationMs!==null && (!Number.isFinite(r.durationMs) || r.durationMs<0)) throw new Error("BENCHMARK_DURATION_INVALID");
    if(!["recorded","failed","unsupported","interrupted"].includes(r.status) || typeof r.eventCaptureFailed!=="boolean" || (r.status==="recorded" && !r.run)) throw new Error("BENCHMARK_RECORD_STATE_INVALID");
    if(r.run && (r.run.profile!==r.arm || r.run.adaptive?.version!==manifest.workflowVersion || r.run.routingPolicy!==manifest.routingPolicy || digest([{role:"user",content:r.run.message}])!==c.promptHash || r.run.inputHash!==createHash("sha256").update(r.run.message).digest("hex") || r.run.answerHash!==(r.run.answer?digest(r.run.answer):null))) throw new Error("BENCHMARK_SAVED_RUN_IDENTITY_MISMATCH");
    if(r.run && !r.eventCaptureFailed && digest(r.events)!==digest(r.run.responseEvents??[])) throw new Error("BENCHMARK_EVENTS_MISMATCH");
    z.array(responseEventSchema).max(128).parse(r.events);
    identities.add(identity);
  }
}
export function benchmarkOutcome(record?: BenchmarkRecord) {
  const run=record?.run;
  const answer=adaptiveAnswerSchema.safeParse(run?.answer);
  const complete=record?.status==="recorded" && run?.status==="complete" && answer.success && operationalRoute(answer.data)!==null && !record.eventCaptureFailed;
  const emergencyEvent=record?.events.find(e => e.kind==="action" && e.notice.disposition==="EMERGENCY_NOW");
  // Never mine rejected drafts, quoted research or conditional return precautions
  // for an emergency referral. Score the explicit issued action contract.
  const emergency=Boolean(emergencyEvent || (complete && answer.data?.disposition==="EMERGENCY_NOW"));
  return { complete: Boolean(complete), emergency, prediction: emergency ? true : complete ? false : null,
    emergencyActionMs: emergencyEvent?.elapsedMs ?? null,
    operationalRoute: complete ? operationalRoute(answer.data!) : null,
    finalEmergency: complete ? answer.data?.disposition==="EMERGENCY_NOW" : null,
  };
}
const ratio = (n: number,d: number) => ({ numerator:n,denominator:d,rate:d?n/d:null });
const distribution = (values: number[]) => { const v=[...values].sort((a,b)=>a-b),n=v.length; return { measured:n, median:n ? (v[Math.floor((n-1)/2)]+v[Math.ceil((n-1)/2)])/2:null, p95:n?v[Math.ceil(n*.95)-1]:null }; };
export function summarizeBenchmark(manifest: BenchmarkManifest, records: BenchmarkRecord[]) {
  validateRecords(manifest,records);
  const byKey = new Map(records.map(r=>[nameFor(r.id,r.trial,r.arm),r]));
  const slots=manifest.index.flatMap(c=>Array.from({length:manifest.repetitions},(_,i)=>manifest.arms.map(arm=>{
    const record=byKey.get(nameFor(c.id,i+1,arm)), outcome=benchmarkOutcome(record);
    return { c,trial:i+1,arm,record,outcome, correct:c.emergencyExpected!==null && outcome.complete && outcome.prediction===c.emergencyExpected && outcome.finalEmergency===c.emergencyExpected };
  }))).flat();
  const partitions=["primary","primary_pilot","primary_remainder","primary_supported","excluded_scope_stress","conditional_stress"] as const;
  const matches=(c:CaseIndex,cohort:typeof partitions[number]) => cohort==="primary_pilot" ? c.cohort==="primary" && manifest.pilotIds.includes(c.id) : cohort==="primary_remainder" ? c.cohort==="primary" && !manifest.pilotIds.includes(c.id) : cohort==="primary_supported" ? c.cohort==="primary" && !c.unsupportedReason : c.cohort===cohort;
  const cohorts=partitions.map(cohort=>({ cohort,
    arms:manifest.arms.map(arm=>{
      const s=slots.filter(s=>matches(s.c,cohort) && s.arm===arm), pos=s.filter(s=>s.c.emergencyExpected===true), neg=s.filter(s=>s.c.emergencyExpected===false);
      const costs=s.map(s=>s.record?.run ? estimateStudyCost(s.record.run):null);
      return { arm, planned:s.length, recorded:s.filter(s=>s.record).length, notStarted:s.filter(s=>!s.record && !s.c.unsupportedReason).length,
        unsupported:s.filter(s=>s.c.unsupportedReason).length, complete:ratio(s.filter(s=>s.outcome.complete).length,s.length),
        emergencyInstructionCoverage:ratio(pos.filter(s=>s.outcome.emergency).length,pos.length),
        emergencyWithoutInstruction:pos.filter(s=>!s.outcome.emergency).map(s=>({id:s.c.id,trial:s.trial,state:s.record?.status ?? "not_started"})),
        falseEmergencyAlerts:ratio(neg.filter(s=>s.outcome.emergency).length,neg.length),
        nonEmergencyCompletedAgreement:ratio(neg.filter(s=>s.correct).length,neg.length),
        strictBinaryCompletedAgreement:cohort==="conditional_stress" ? null : ratio(s.filter(s=>s.correct).length,s.length),
        unresolved:s.filter(s=>s.outcome.prediction===null).length,
        durationMsAllExecuted:distribution(s.flatMap(s=>s.record?.durationMs===null || s.record?.durationMs===undefined ? []:[s.record.durationMs])),
        timeToEmergencyActionMs:distribution(pos.flatMap(s=>s.outcome.emergencyActionMs===null?[]:[s.outcome.emergencyActionMs])),
        // The denominator makes late/no instructions visible beside the latency.
        emergencyActionTimingMissing:pos.filter(s=>s.outcome.emergencyActionMs===null).length,
        runsWithUnknownUsage:s.filter(s=>s.record?.run && (s.record.run.usage.inputTokens===null || s.record.run.usage.outputTokens===null)).length,
        modelCallsKnown:s.reduce((n,s)=>n+(s.record?.run?.modelCalls??0),0),
        cost:{ pricingVersion:STUDY_PRICING.version, knownEstimateUSD:costs.reduce<number>((n,c)=>n+(c??0),0), unknownExecuted:s.filter((s,i)=>s.record?.durationMs!==undefined && s.record.durationMs!==null && costs[i]===null).length, totalEstimateUSD:s.every(s=>s.record || s.c.unsupportedReason) && s.every((s,i)=>s.c.unsupportedReason || costs[i]!==null) ? costs.reduce<number>((n,c)=>n+(c??0),0):null },
      };
    }),
  }));
  const paired=manifest.index.filter(c=>c.emergencyExpected!==null).map(c=>{
    const rates=manifest.arms.map(arm=>slots.filter(s=>s.c.id===c.id && s.arm===arm).filter(s=>s.correct).length/manifest.repetitions);
    return { id:c.id, cohort:c.cohort, familyId:c.familyId, delta:rates[1]-rates[0],
      bothAttempted:manifest.arms.every(arm=>slots.filter(s=>s.c.id===c.id && s.arm===arm).every(s=>Boolean(s.record) && !s.c.unsupportedReason)) };
  });
  return { version:BENCHMARK_VERSION,manifestHash:digest(manifest), execution:manifest.execution, cohorts,
    paired:partitions.filter(c=>c!=="conditional_stress").map(cohort=>{
      const p=paired.filter(p=>matches(manifest.index.find(c=>c.id===p.id)!,cohort));
      return { cohort,plannedCases:p.length,pairedAttemptedCases:p.filter(p=>p.bothAttempted).length,
        candidateImproved:p.filter(p=>p.bothAttempted && p.delta>0).map(p=>p.id),candidateWorsened:p.filter(p=>p.bothAttempted && p.delta<0).map(p=>p.id),
        // Asymmetric unfinished arms can invent a benefit. Publish paired delta
        // only after every supported slot is observed in both arms.
        measuredDelta:p.length && p.every(p=>p.bothAttempted) ? p.reduce((n,p)=>n+p.delta,0)/p.length : null,
      };
    }),
    clinicalAccuracy:null, isolatedAgentLift:null,
    interpretation:"Binary emergency agreement is not full HealthBench, five-route accuracy or clinical safety. Missing/failed/unsupported slots remain in planned denominators; non-emergency failures never become true negatives. Early action is server emission, not patient receipt. Pilot and untouched remainder must be analyzed separately after any tuning. No demographic/history imputation. No comparison to Counsel's unpublished exact case IDs.",
  };
}
