import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseEnv } from "node:util";
import { z } from "zod";
import { createGraphAgents, graphJudgeSchema } from "../src/disposition/clinical-graph.ts";
import { graphJudgeInstructions, GRAPH_REVIEW_PROTOCOL } from "../src/disposition/graph-prompts.ts";
import { resolveGraphConfig } from "../src/disposition/graph-config.ts";
import { consumeStructuredStream, safetyEnvelopeTransport } from "../src/disposition/transport.ts";
import { requestDeadline, EXECUTION_POLICY } from "../src/disposition/execution-policy.ts";
import { buildGraphJudgeCalibrationFixtures } from "../src/evaluation/graph-judge-calibration.ts";
import { calibrationPacket, judgeStudySchedule, judgeStudyOutcome, summarizeJudgeStudy, judgeRequestReservation, judgeStudyFingerprint, claimJudgeStudyAuthorization, GRAPH_JUDGE_STUDY, type JudgeStudyRow } from "../src/evaluation/graph-judge-study.ts";
import { sha256 } from "../src/evidence/rag/model.ts";

const args = process.argv.slice(2), live = args.includes("--live");
const destination = args.find(a => a.startsWith("--output="))?.slice(9);
if (!destination) throw new Error("EXPLICIT_OUTPUT_DIRECTORY_REQUIRED");
const directory = resolve(destination);
if (existsSync(directory)) throw new Error("IMMUTABLE_STUDY_DIRECTORY_ALREADY_EXISTS");
const authorizationPath = args.find(a => a.startsWith("--authorization="))?.slice(16);
const fixtures = buildGraphJudgeCalibrationFixtures(), schedule = judgeStudySchedule(fixtures), fingerprint = judgeStudyFingerprint(fixtures);
const rootEnv = existsSync(".env") ? parseEnv(readFileSync(".env", "utf8")) : {};
if (live) {
  // Read configured provider keys without printing or recording them.
  process.env.OPENAI_API_KEY ||= rootEnv.OPENAI_API_KEY;
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY_REQUIRED");
}
const authorization = live ? claimJudgeStudyAuthorization(authorizationPath ?? "MISSING_AUTHORIZATION", directory, fingerprint) : null;
const configurations = { full: resolveGraphConfig({ COUNSEL_GRAPH_JUDGE_STYLE: "full" }), concise: resolveGraphConfig({ COUNSEL_GRAPH_JUDGE_STYLE: "concise" }) };
mkdirSync(directory, { recursive: true });
const write = (name: string, value: unknown) => writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
write("manifest.json", { protocol: GRAPH_JUDGE_STUDY, reviewProtocol: GRAPH_REVIEW_PROTOCOL, fingerprint, createdAt: new Date().toISOString(), authorization,
  settings: { model: configurations.full.models.judge, reasoningEffort: "low", maxOutputTokens: 2400, maxSteps: 1, maxRetries: 0, temperature: "provider_default", deadlineMs: EXECUTION_POLICY.modelTimeoutMs },
  scope: "Same frozen patient/draft/source packet; full calibrated versus concise calibrated prompt. No reference label or contractFindings in model input; ordinary handoff-language hints are identical. One run per packet/style, all failures retained. Not held-out clinical validation.",
  instructions: { full: graphJudgeInstructions("full"), concise: graphJudgeInstructions("concise") }, schema: graphJudgeSchema.toJSONSchema(),
  promotion: "Every concise target correct, all 28 reviews valid, lower median paired latency; then actual GUI verification. No clinical-readiness inference.",
  schedule: schedule.map(({ fixture, style }) => ({ id: fixture.id, style, packetHash: sha256(JSON.stringify(calibrationPacket(fixture))) })),
  fixtures: fixtures.map(f => ({ id: f.id, family: f.family, variant: f.variant, expected: f.expected, provenance: f.provenance, packet: calibrationPacket(f) })) });
if (!live) { console.log(JSON.stringify({ directory, plannedCalls: schedule.length, paidCalls: 0 })); process.exit(0); }
const agents = { full: createGraphAgents(configurations.full).judge, concise: createGraphAgents(configurations.concise).judge };
const rows: JudgeStudyRow[] = [];
let accountedUSD = 0;
for (const [index, { fixture, style }] of schedule.entries()) {
  const packet = calibrationPacket(fixture), prompt = JSON.stringify(packet), reservation = judgeRequestReservation(prompt, style);
  if (accountedUSD + reservation > authorization!.maximumUSD || index >= authorization!.maximumCalls) {
    write("budget-stop.json", { index, accountedUSD, reservation, authorization }); break;
  }
  write(`${index + 1}-started.json`, { id: fixture.id, style, at: new Date().toISOString(), packetHash: sha256(prompt), reservationUSD: reservation });
  const started = performance.now();
  const deadline = requestDeadline(new AbortController().signal, EXECUTION_POLICY.modelTimeoutMs);
  let row: JudgeStudyRow, details: object;
  try {
    const execution = await consumeStructuredStream({ signal: deadline.signal, start: abortSignal => agents[style].stream(prompt, { abortSignal,
      structuredOutput: { schema: safetyEnvelopeTransport(graphJudgeSchema, z.unknown()), errorStrategy: "strict" }, maxSteps: 1,
      modelSettings: { maxOutputTokens: 2400, maxRetries: 0 }, providerOptions: { openai: { reasoningEffort: "low" } }, tracingOptions: { hideInput: true, hideOutput: true } }) });
    const result = judgeStudyOutcome(fixture, execution.output);
    const cost = execution.usage.inputTokens === null || execution.usage.outputTokens === null ? null : (execution.usage.inputTokens * 10 + execution.usage.outputTokens * 50) / 1e6;
    row = { id: fixture.id, family: fixture.family, variant: fixture.variant, style, packetHash: sha256(prompt), expected: fixture.expected.verdict,
      observed: execution.failure ? null : result.observed, valid: !execution.failure && result.judge !== null, durationMs: execution.durationMs ?? performance.now() - started,
      outputTokens: execution.usage.outputTokens, estimatedUSD: cost };
    details = { execution, judge: result.judge };
  } catch {
    row = { id: fixture.id, family: fixture.family, variant: fixture.variant, style, packetHash: sha256(prompt), expected: fixture.expected.verdict, observed: null, valid: false, durationMs: performance.now() - started, outputTokens: null, estimatedUSD: null };
    details = { failure: "STUDY_EXECUTION_FAILED" };
  } finally { deadline.dispose(); }
  // Disk failure stops dispatch. It cannot become a second provider attempt,
  // overwrite the first outcome, or count the same reservation twice.
  accountedUSD += row.estimatedUSD ?? reservation;
  write(`${index + 1}-result.json`, { ...row, ...details, accountedUSD });
  rows.push(row);
  console.log(JSON.stringify(row));
}
write("summary.json", summarizeJudgeStudy(rows, fixtures.map(f => f.id)));
console.log(JSON.stringify({ directory, accountedUSD, attempted: rows.length, summary: summarizeJudgeStudy(rows, fixtures.map(f => f.id)) }));
