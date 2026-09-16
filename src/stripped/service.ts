import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { parseEnv } from "node:util";
import { buildRequest } from "./protocol.ts";
import { createStrippedWorkflow } from "./workflow.ts";
import type { StrippedRun } from "./contract.ts";

function repositoryRoot() {
  let current = resolve(process.cwd());
  for (;;) {
    const file = join(current, "package.json");
    if (existsSync(file) && JSON.parse(readFileSync(file, "utf8")).name === "counselcodex") return current;
    const parent = dirname(current);
    if (parent === current) throw new Error("Counsel repository root not found");
    current = parent;
  }
}

// A separate $2 demo allowance within the $71.35035 reconciled balance on Sept 15.
// Started requests reserve their worst-case cost until a completion is persisted.
const ALLOWANCE_USD = 2;
export async function executeStripped(message: string): Promise<StrippedRun> {
  const root = repositoryRoot();
  const envPath = join(root, ".env");
  const apiKey = process.env.ANTHROPIC_API_KEY || (existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")).ANTHROPIC_API_KEY : "");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured on the server.");
  const directory = join(root, "apps/evaluation/.local/stripped-disposition");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const accounted = readdirSync(directory).filter((name) => name.endsWith("-started.json")).reduce((sum, name) => {
    const started = JSON.parse(readFileSync(join(directory, name), "utf8"));
    const completePath = join(directory, name.replace("-started.json", "-complete.json"));
    if (!existsSync(completePath)) return sum + started.reservedUSD;
    const complete = JSON.parse(readFileSync(completePath, "utf8"));
    return sum + complete.accountedUSD;
  }, 0);
  const request = buildRequest(message);
  const reservedUSD = ((Buffer.byteLength(JSON.stringify(request)) + 2048) * 20 + 4096 * 50) / 1e6;
  if (accounted + reservedUSD > ALLOWANCE_USD) throw new Error("The local demo's $2 allowance is exhausted. Saved traces remain available.");
  const id = randomUUID();
  const save = (name: string, value: unknown) => writeFileSync(join(directory, `${id}-${name}.json`), JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  save("started", { id, createdAt: new Date().toISOString(), reservedUSD, allowanceUSD: ALLOWANCE_USD, request });
  const workflow = createStrippedWorkflow({ apiKey });
  const run = await workflow.createRun({ runId: id, disableScorers: true });
  // An edited browser message does not erase an already-dispatched call or its accounting.
  const execution = await run.start({ inputData: { message }, tracingOptions: { hideInput: true, hideOutput: true } });
  if (execution.status !== "success") throw new Error("The disposition workflow failed. No retry was made.");
  const result = execution.result;
  const u = result.trace.usage;
  const accountedUSD = u ? (u.inputTokens * 20 + u.outputTokens * 50 + u.cacheReadTokens * 20 + u.cacheWriteTokens * 20) / 1e6 : reservedUSD;
  save("complete", { ...result, accountedUSD });
  return result;
}
