#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateRows } from "../scripts/evaluate.mjs";
import { summarizeEvaluationReport } from "./evaluation/evidence-boundary.mjs";
import { readCsv, writeCsv } from "./lib/csv.mjs";
import { routeMessage } from "./workflows/disposition-workflow.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function argumentsFor(argv) {
  const [command = "help", ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    if (!rest[index].startsWith("--")) continue;
    const key = rest[index].slice(2);
    const next = rest[index + 1];
    options[key] = next && !next.startsWith("--") ? rest[++index] : true;
  }
  return { command, options };
}

function printable(result, includeTrace) {
  if (includeTrace) return result;
  const { trace: _trace, ...withoutTrace } = result;
  return withoutTrace;
}

async function batch() {
  const rows = await readCsv(resolve(root, "data/patient_messages.csv"));
  const predictions = [];
  for (const row of rows) {
    const result = await routeMessage({ id: row.id, message: row.message });
    predictions.push({ id: row.id, disposition: result.disposition, subtype: result.subtype, confidence: result.confidence, layer: result.layer, override_blocked: result.overrideBlocked, red_flags: result.redFlags.join("|"), rationale: result.rationale, patient_directive: result.patientDirective, message: row.message, provided_disposition: row.disposition });
  }
  const output = resolve(root, "outputs/predictions.csv");
  await mkdir(dirname(output), { recursive: true });
  await writeCsv(output, predictions);
  return { output, count: predictions.length };
}

async function evaluate() {
  await batch();
  const report = await evaluateRows({
    predictionsPath: resolve(root, "outputs/predictions.csv"),
    messagesPath: resolve(root, "data/patient_messages.csv"),
    referenceProposalPath: resolve(root, "data/clinician_development_review.csv"),
  });
  const summary = summarizeEvaluationReport(report);
  await writeFile(resolve(root, "outputs/metrics.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeCsv(resolve(root, "outputs/evaluation_cases.csv"), report.cases);
  return summary;
}

async function main() {
  const { command, options } = argumentsFor(process.argv.slice(2));
  if (command === "route") {
    if (typeof options.message !== "string") throw new Error("route requires --message \"...\"");
    console.log(JSON.stringify(printable(await routeMessage({ id: options.id ?? null, message: options.message }), Boolean(options.trace)), null, 2));
    return;
  }
  if (command === "batch") {
    console.log(JSON.stringify(await batch(), null, 2));
    return;
  }
  if (command === "evaluate") {
    console.log(JSON.stringify(await evaluate(), null, 2));
    return;
  }
  console.log("Usage:\n  node src/run.mjs route --message \"...\" [--id C01] [--trace]\n  node src/run.mjs batch\n  node src/run.mjs evaluate");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
