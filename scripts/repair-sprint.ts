import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseEnv } from "node:util";
import { z } from "zod";
import { createGraphAgents, draftSchema, wireDraftSchema, graphRepair, graphJudgePacket, graphJudgeSchema, validateGraphJudge, graphSourceIntegrity } from "../src/disposition/clinical-graph.ts";
import { graphJudgeInstructions, GRAPH_INSTRUCTIONS } from "../src/disposition/graph-prompts.ts";
import { resolveGraphConfig } from "../src/disposition/graph-config.ts";
import { REPAIR_INSTRUCTIONS } from "../src/disposition/graph-repair.ts";
import { consumeStructuredStream, safetyEnvelopeTransport } from "../src/disposition/transport.ts";
import { requestDeadline, EXECUTION_POLICY } from "../src/disposition/execution-policy.ts";
import { sourceWithQuoteSpans, resolveSourceQuoteReferences } from "../src/disposition/source-quote-refs.ts";
import { REPAIR_SPRINT, sprintFixtures, sprintPacket, repairFixtures } from "../src/evaluation/repair-sprint.ts";
import { sha256 } from "../src/evidence/rag/model.ts";

const args = process.argv.slice(2), live = args.includes("--live"), destination = args.find(a => a.startsWith("--output="))?.slice(9);
if (!destination) throw new Error("EXPLICIT_OUTPUT_REQUIRED");
// Preserve the historical packets for audit, but do not silently spend money
// on the known wrong-draft pair or confounded control as a new comparison.
if (live && !args.includes("--allow-known-confounded-exploration")) throw new Error("HISTORICAL_FIXTURES_REQUIRE_CORRECTION_OR_EXPLICIT_EXPLORATORY_ACKNOWLEDGMENT");
const directory = resolve(destination);
if (existsSync(directory)) throw new Error("IMMUTABLE_OUTPUT_EXISTS");
const calibration = sprintFixtures(), repairs = repairFixtures(), config = resolveGraphConfig();
const priorPath = args.find(a => a.startsWith("--prior="))?.slice(8);
const prior = priorPath ? JSON.parse(readFileSync(priorPath, "utf8")) : null;
if (prior && (prior.protocol !== REPAIR_SPRINT || !Number.isFinite(prior.accountedUSD) || prior.accountedUSD < 0 || prior.accountedUSD >= 20)) throw new Error("INVALID_PRIOR_ALLOCATION");
const manifest = { protocol: REPAIR_SPRINT, createdAt: new Date().toISOString(), config, clinicalApproval: false,
  authorization: { reference: "User 2026-09-14: push then engineer order 1-4; may spend up to $40.", totalSprintUSD: 40, experimentAllocationUSD: 20, guiAllocationUSD: 20, plannedCalls: 28 },
  priorAllocation: priorPath ? { path: priorPath, sha256: sha256(readFileSync(priorPath, "utf8")), accountedUSD: prior.accountedUSD } : null,
  scope: "12 targeted calibration packets plus four fixed repair inputs, two repair arms, fresh blinded independent whole-answer review for each. One sample per arm. Repair feedback is engineering-authored targeted feedback and may be incomplete. See the September 14 audit: one wrong-draft pair is excluded from comparative claims and one control is confounded. This historical v1 fixture set is not a clean confirmatory study. No clinical validation or held-out claim.",
  prompts: { judge: graphJudgeInstructions("full"), disposition: GRAPH_INSTRUCTIONS.disposition, repair: REPAIR_INSTRUCTIONS },
  schemas: { judge: graphJudgeSchema.toJSONSchema(), draft: wireDraftSchema.toJSONSchema(), repair: graphRepair.schema.toJSONSchema() },
  calibration: calibration.map(f => ({ ...f, packet: sprintPacket(f) })),
  repairs: repairs.map(({ run: _run, ...f }) => f) };
mkdirSync(directory, { recursive: true });
const write = (name: string, value: unknown) => writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
write("manifest.json", { ...manifest, fingerprint: sha256(JSON.stringify(manifest)) });
if (!live) { console.log(JSON.stringify({ directory, plannedCalls: 28, paidCalls: 0 })); process.exit(0); }
// Single-use authorization claim across output folders, not a fresh $20 on retry.
const claim = resolve(args.find(a => a.startsWith("--claim="))?.slice(8) ?? "MISSING_AUTHORIZATION_CLAIM");
if (!args.some(a => a.startsWith("--claim="))) throw new Error("CLAIM_PATH_REQUIRED");
writeFileSync(claim, JSON.stringify({ directory, protocol: REPAIR_SPRINT, authorization: manifest.authorization }) + "\n", { flag: "wx", mode: 0o600 });
const env = parseEnv(readFileSync(".env", "utf8"));
process.env.OPENAI_API_KEY ||= env.OPENAI_API_KEY; process.env.ANTHROPIC_API_KEY ||= env.ANTHROPIC_API_KEY;
if (!process.env.OPENAI_API_KEY || !process.env.ANTHROPIC_API_KEY) throw new Error("PROVIDER_KEY_MISSING");
const agents = createGraphAgents(config);
let accountedUSD: number = prior?.accountedUSD ?? 0, calls = 0;
async function call(role: "judge" | "disposition", packet: unknown, schema: z.ZodType, label: string) {
  const prompt = JSON.stringify(packet), instructions = role === "judge" ? graphJudgeInstructions("full") : GRAPH_INSTRUCTIONS.disposition;
  const price = role === "judge" ? { input: 10, output: 50 } : { input: 5, output: 25 };
  // Reserve UTF-8 bytes as a conservative input-token upper estimate plus
  // transport overhead; unknown usage retains the reservation permanently.
  const reservation = (Buffer.byteLength(prompt + instructions + JSON.stringify(schema.toJSONSchema())) + 8192) * price.input / 1e6 + 2400 * price.output / 1e6;
  if (accountedUSD + reservation > 20 || calls >= 28) throw new Error("SPRINT_ALLOCATION_EXHAUSTED");
  const index = ++calls;
  write(`${index}-started.json`, { label, role, at: new Date().toISOString(), packetHash: sha256(prompt), packet, reservationUSD: reservation });
  const deadline = requestDeadline(new AbortController().signal, EXECUTION_POLICY.modelTimeoutMs);
  const execution = await consumeStructuredStream({ signal: deadline.signal, start: abortSignal => agents[role].stream(prompt, { abortSignal, structuredOutput: { schema: safetyEnvelopeTransport(schema, z.unknown()), errorStrategy: "strict" }, maxSteps: 1,
    modelSettings: { maxOutputTokens: 2400, maxRetries: 0 }, providerOptions: role === "judge" ? { openai: { reasoningEffort: "low" } } : { anthropic: { thinking: { type: "adaptive" }, effort: "low" } }, tracingOptions: { hideInput: true, hideOutput: true } }) }).finally(() => deadline.dispose());
  const cost = execution.usage.inputTokens === null || execution.usage.outputTokens === null ? null : (execution.usage.inputTokens * price.input + execution.usage.outputTokens * price.output) / 1e6;
  accountedUSD += cost ?? reservation;
  write(`${index}-result.json`, { label, role, execution, estimatedUSD: cost, accountedUSD });
  console.log(JSON.stringify({ index, label, failure: execution.failure, ms: execution.durationMs, estimatedUSD: cost, accountedUSD }));
  return execution;
}
const calibrationRows: object[] = [], repairRows: object[] = [];
for (const f of [...calibration].sort((a,b) => sha256(a.id).localeCompare(sha256(b.id)))) {
  const packet = sprintPacket(f), execution = await call("judge", packet, graphJudgeSchema, f.id), judge = execution.failure ? null : validateGraphJudge(execution.output, packet.units, f.draft.citations.length > 0, null);
  calibrationRows.push({ id: f.id, criterion: f.criterion, expected: f.expected, observed: judge?.criteria.find(c => c.id === f.criterion)?.verdict ?? null, valid: Boolean(judge), verdict: judge?.verdict ?? null, criteria: judge?.criteria ?? null });
}
write("calibration-summary.json", calibrationRows);
for (const [index, f] of repairs.entries()) for (const arm of index % 2 ? ["field_patch", "full_regeneration"] : ["full_regeneration", "field_patch"]) {
  const sources = f.hits.map(h => ({ id: h.chunk.id, kind: h.document.kind, scope: h.document.scope, text: h.chunk.text })), binding = graphRepair.prepare(f.draft, sources, f.allowedFields);
  const packet = { patient: f.run.message, previousDraft: f.draft, reviewerFeedback: f.feedback, sources: sources.map(sourceWithQuoteSpans), ...(arm === "field_patch" ? { repairContract: binding, outputInstructions: REPAIR_INSTRUCTIONS } : {}) };
  const execution = await call("disposition", packet, arm === "field_patch" ? graphRepair.schema : wireDraftSchema, `${f.id}:${arm}:repair`);
  let draft: typeof f.draft | null = null, admission: unknown = null;
  try {
    if (execution.failure) throw new Error(execution.failure);
    if (arm === "field_patch") { const applied = graphRepair.apply(f.draft, sources, f.allowedFields, execution.output); draft = applied.output; admission = applied.audit; }
    else draft = draftSchema.parse(resolveSourceQuoteReferences(wireDraftSchema.parse(execution.output), sources));
  } catch (e) { admission = { failure: e instanceof Error ? e.message : "INVALID_REPAIR" }; }
  // An invalid patch is not repaired by a hidden fallback. Planned second
  // review remains explicitly unexecuted; no fabricated failed model call.
  const reviewPacket = draft ? graphJudgePacket({ patient: f.run.message, draft, hits: f.hits, notice: f.notice, questions: f.questions }) : null;
  const review = reviewPacket ? await call("judge", reviewPacket, graphJudgeSchema, `${f.id}:${arm}:independent-review`) : null;
  const judge = reviewPacket && review && !review.failure ? validateGraphJudge(review.output, reviewPacket.units, Boolean(draft?.citations.length), f.notice) : null;
  const changedFields = draft ? Object.keys(f.draft).filter(k => JSON.stringify(f.draft[k as keyof typeof draft]) !== JSON.stringify(draft![k as keyof typeof draft])) : [];
  const row = { id: f.id, arm, admission, draft, judge, changedFields, sourceIdentity: draft ? graphSourceIntegrity(draft, f.hits) : false, repairMs: execution.durationMs, reviewMs: review?.durationMs ?? null, reviewExecuted: Boolean(review), clinicalApproval: false };
  repairRows.push(row); write(`${f.id}-${arm}-comparison.json`, row);
}
write("summary.json", { protocol: REPAIR_SPRINT, attemptedCalls: calls, plannedCalls: 28, accountedUSD, calibrationRows, repairRows, clinicalApproval: false });
console.log(JSON.stringify({ finished: true, calls, accountedUSD, directory }));
