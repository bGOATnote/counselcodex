import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { DispositionRun } from "../disposition/contract.ts";

export const STUDY_PRICING = {
  version: "clinical-study-pricing-2026-09-13/v1",
  source: "https://platform.claude.com/docs/en/about-claude/pricing",
  judgeSource: "https://developers.openai.com/api/docs/models/gpt-6-astra",
  models: { "anthropic/claude-opus-5": { input: 5, output: 25 }, "anthropic/claude-haiku-4-5": { input: 1, output: 5 }, "openai/gpt-6-astra": { input: 10, output: 50 } },
  unit: "USD_per_million_tokens", reservationPerRunUSD: 1,
  limitation: "Standard uncached token estimate, not provider invoice. Cache writes/reads are not itemized in current run usage. No fast mode, tool billing or residency modifier is configured in this study.",
} as const;
const authorizationSchema = z.object({
  version: z.literal("clinical-study-authorization/v1"), approved: z.literal(true),
  authorizationReference: z.string().min(10).max(500),
  ceilingUSD: z.number().int().positive().max(1000),
  pricingVersion: z.literal(STUDY_PRICING.version),
}).strict();
export function readStudyAuthorization(directory: string) {
  const path=join(directory,"authorization.json");
  if (!existsSync(path)) throw new Error("STUDY_REQUIRES_EXPLICIT_SPEND_AUTHORIZATION");
  return authorizationSchema.parse(JSON.parse(readFileSync(path,"utf8")));
}
export function studyCapacity(directory:string) {
  const authorization=readStudyAuthorization(directory),ledger=join(directory,"reservations"),snapshot=join(ledger,"authorization.json");
  if(existsSync(snapshot) && readFileSync(snapshot,"utf8")!==JSON.stringify(authorization)) throw new Error("STUDY_AUTHORIZATION_CHANGED_USE_RECONCILIATION");
  const names=existsSync(ledger)?readdirSync(ledger):[];
  const allowed=new Set(["authorization.json",...Array.from({length:authorization.ceilingUSD},(_,i)=>`run-${i+1}.json`)]);
  if(names.some(n=>!allowed.has(n))) throw new Error("STUDY_LEDGER_INVALID");
  const reserved=names.filter(n=>n!=="authorization.json").length;
  return {ceilingUSD:authorization.ceilingUSD,reservedUSD:reserved,remainingReservations:authorization.ceilingUSD-reserved};
}
export function requireStudyCapacity(directory:string) {
  if(studyCapacity(directory).remainingReservations<1) throw new Error("CLINICAL_STUDY_RESERVATIONS_EXHAUSTED");
}
export function reserveClinicalStudyRun(directory: string, purpose: "generation" | "grading" = "generation") {
  // An explicit, separate user authorization is required. Never replenish or
  // reset the historical allocations, and never use the manual GUI exemption.
  const authorization=readStudyAuthorization(directory), serialized=JSON.stringify(authorization);
  const ledger=join(directory,"reservations"); mkdirSync(ledger,{recursive:true,mode:0o700});
  const snapshot=join(ledger,"authorization.json");
  try { const fd=openSync(snapshot,"wx",0o600); try { writeFileSync(fd,serialized); fsyncSync(fd); } finally { closeSync(fd); } }
  catch(error) { if ((error as NodeJS.ErrnoException).code!=="EEXIST") throw error; }
  if(readFileSync(snapshot,"utf8")!==serialized) throw new Error("STUDY_AUTHORIZATION_CHANGED_USE_RECONCILIATION");
  const slots=authorization.ceilingUSD;
  const allowed=new Set(["authorization.json",...Array.from({length:slots},(_,i)=>`run-${i+1}.json`)]);
  if(readdirSync(ledger).some(n=>!allowed.has(n))) throw new Error("STUDY_LEDGER_INVALID");
  for(let i=1;i<=slots;i++) {
    let fd:number;
    try { fd=openSync(join(ledger,`run-${i}.json`),"wx",0o600); }
    catch(error) { if ((error as NodeJS.ErrnoException).code==="EEXIST") continue; throw error; }
    try { writeFileSync(fd,JSON.stringify({slot:i,purpose,reservedUSD:1,at:new Date().toISOString()})); fsyncSync(fd); } finally { closeSync(fd); }
    return;
  }
  throw new Error("CLINICAL_STUDY_RESERVATIONS_EXHAUSTED");
}
export function estimateStudyCost(run: DispositionRun) {
  if(!run.agents || !run.agents.length) return run.modelCalls===0 ? 0 : null;
  let usd=0,calls=0;
  for(const a of run.agents) {
    calls+=a.modelCalls;
    if(a.modelCalls===0) continue;
    const price=STUDY_PRICING.models[a.model as keyof typeof STUDY_PRICING.models];
    if(!price || a.usage.inputTokens===null || a.usage.outputTokens===null || a.usage.inputTokens<0 || a.usage.outputTokens<0) return null;
    usd+=(a.usage.inputTokens*price.input+a.usage.outputTokens*price.output)/1e6;
  }
  return calls===run.modelCalls ? usd : null;
}
