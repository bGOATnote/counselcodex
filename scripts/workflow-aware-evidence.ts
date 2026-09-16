import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { freezeEvidencePackets, generateEmbeddings, planEmbeddings } from "../src/research/workflow-aware/embeddings.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [command, ...args] = process.argv.slice(2);
const option = (name: string) => { const index = args.indexOf(`--${name}`); assert(index >= 0 && args[index + 1] && !args[index + 1].startsWith("--"), `Missing --${name}`); return args[index + 1]; };
const out = resolve(root, option("out"));
let result: unknown;
if (command === "plan") result = planEmbeddings({ root, out, messagesPath: resolve(root, option("messages")), cardsPath: resolve(root, option("cards")), budgetPath: resolve(root, option("budget")), deadlineUTC: option("deadline") });
else if (command === "generate") {
  const envPath = resolve(root, ".env");
  const env = { ...(existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : {}), ...process.env };
  result = await generateEmbeddings({ root, out, apiKey: env.OPENAI_API_KEY });
} else if (command === "packets") result = freezeEvidencePackets({ root, out });
else throw new Error("Use plan, generate or packets; no implicit provider calls.");
console.log(JSON.stringify(result));
