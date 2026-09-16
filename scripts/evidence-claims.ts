import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { answerSchema, adaptiveAnswerSchema, type DispositionRun } from "../src/disposition/contract.ts";
import { createClaimPacket, evaluateClaimJudgment } from "../src/evidence/claims.ts";
import { evidenceHash } from "../src/evidence/library.ts";

// No network/provider path. Export an exact-run packet, or verify an independently
// produced judge JSON against it. Never reload today's evidence into an old run.
const args = process.argv.slice(2);
if (args.length !== 1 && args.length !== 3) throw new Error("Usage: evidence:claims RUN_JSON [JUDGE_JSON provider/model]");
const bytes = await readFile(resolve(args[0]), "utf8");
if (Buffer.byteLength(bytes) > 512_000) throw new Error("RUN_TOO_LARGE");
const run = JSON.parse(bytes) as DispositionRun;
const adaptive = run.profile?.startsWith("adaptive-") || run.profile === "base-opus";
const answer = run.answer === null ? null : (adaptive ? adaptiveAnswerSchema : answerSchema).parse(run.answer);
if (typeof run.message !== "string" || !Array.isArray(run.guidance) || (answer === null ? run.answerHash !== null : evidenceHash(run.answer) !== run.answerHash) || evidenceHash(run.message) !== run.inputHash) throw new Error("RUN_INTEGRITY_FAILED");
const generationModel = run.agents?.find((a) => a.role === "disposition")?.model ?? run.model;
const packet = createClaimPacket(answer, run.message, run.guidance, generationModel, run.completedAt.slice(0, 10), { responseEvents: run.responseEvents, runId: run.runId, traceId: run.traceId });
const report = args.length === 3
  ? { inputRunHash: evidenceHash(bytes), packet, judgment: evaluateClaimJudgment(packet, JSON.parse(await readFile(resolve(args[1]), "utf8")), args[2]), execution: "imported_unattested_judgment" }
  : { inputRunHash: evidenceHash(bytes), packet, judgment: null, execution: "packet_only_no_model_calls" };
const directory = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/evaluation/.local/evidence-claims");
await mkdir(directory, { recursive: true, mode: 0o700 });
const path = resolve(directory, `${new Date().toISOString().replaceAll(":", "-")}-${evidenceHash(report).slice(0, 12)}.json`);
await writeFile(path, JSON.stringify(report, null, 2) + "\n", { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ path, units: packet.units.length, packetHash: packet.packetHash, status: report.judgment?.status ?? "not_assessed", clinicalCorrectness: "not_assessed", externalCalls: 0 }));
