/** Single Fable max-effort ablation; frozen prompt and other provider settings. No application runtime imports. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { parseCsv } from "../src/lib/csv.mjs";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_OUTPUT = join(ROOT, "outputs/stripped-3bucket-fable-max-2026-09-15");
export const BUCKETS = Object.freeze(["SELF_CARE", "ASYNC_PHYSICIAN", "URGENT_ESCALATION"]);
export const SYSTEM_PROMPT = `Choose exactly one bucket for the patient message:
1. SELF_CARE
2. ASYNC_PHYSICIAN
3. URGENT_ESCALATION

Medication refill → ASYNC_PHYSICIAN unless clear emergency/same-day red flags → URGENT_ESCALATION.
Return only JSON with "disposition" (one exact bucket name) and "rationale" (short).`;
export function settingsFor(model = "claude-fable-5-1") {
  if (model !== "claude-fable-5-1") throw new Error("Unregistered model");
  return { model, max_tokens: 4096, thinking: { type: "adaptive" }, output_config: { effort: "max" } };
}
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export const readJSON = (path) => JSON.parse(readFileSync(path, "utf8"));
export const writeJSON = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });

export function loadCases(csvText) {
  // Explicit projection: neither labels nor any other CSV column can enter a request.
  const cases = parseCsv(csvText).map(({ id, message }) => ({ id, message }));
  if (cases.length !== 50 || cases.some((c, i) => c.id !== `C${String(i + 1).padStart(2, "0")}` || typeof c.message !== "string" || !c.message.trim())) {
    throw new Error("Expected exactly 50 nonempty messages in C01–C50 order");
  }
  return cases;
}

export function buildRequest({ message }, model = "claude-fable-5-1") {
  if (typeof message !== "string" || !message.trim()) throw new Error("Missing patient message");
  return { ...settingsFor(model), system: SYSTEM_PROMPT, messages: [{ role: "user", content: message }] };
}

export function parseDisposition(response) {
  if (response?.stop_reason !== "end_turn") throw new Error(`Incomplete provider response: ${response?.stop_reason}`);
  const text = (response.content ?? []).filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
  const parsed = JSON.parse(text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```$/, ""));
  if (!BUCKETS.includes(parsed?.disposition)) throw new Error("Invalid three-bucket disposition");
  if (typeof parsed.rationale !== "string" || !parsed.rationale.trim()) throw new Error("Missing short rationale");
  if (Object.keys(parsed).sort().join(",") !== "disposition,rationale") throw new Error("Unexpected output field");
  return parsed;
}

function environment() {
  const envPath = join(ROOT, ".env");
  return { ...(existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : {}), ...process.env };
}

function protectedFiles() {
  const paths = execFileSync("git", ["ls-files", "src", "apps", "package.json", "package-lock.json"], { cwd: ROOT, encoding: "utf8" }).trim().split("\n").filter(Boolean);
  return Object.fromEntries(paths.map((path) => [path, sha256(readFileSync(join(ROOT, path)))]));
}

export function verifyProtectedFiles(manifest) {
  for (const [path, hash] of Object.entries(manifest.protectedFiles)) {
    if (sha256(readFileSync(join(ROOT, path))) !== hash) throw new Error(`Existing application file changed: ${path}`);
  }
}

export async function generate(model = "claude-fable-5-1", csvPath = join(ROOT, "data/patient_messages.csv"), output = DEFAULT_OUTPUT, priorPath = join(ROOT, "outputs/stripped-3bucket-fable-2026-09-15/generation-complete.json")) {
  const SETTINGS = settingsFor(model), multiplier = model.startsWith("claude-fable") ? 2 : 1;
  const runCeilingUSD = 8 * multiplier;
  csvPath = resolve(csvPath); output = resolve(output);
  const csvText = readFileSync(csvPath, "utf8"), cases = loadCases(csvText);
  const env = environment();
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is required");
  const manifestPath = join(output, "manifest.json");
  let manifest;
  if (existsSync(manifestPath)) {
    manifest = readJSON(manifestPath);
    if (manifest.csvSHA256 !== sha256(csvText) || manifest.promptSHA256 !== sha256(SYSTEM_PROMPT) || JSON.stringify(manifest.settings) !== JSON.stringify(SETTINGS)) throw new Error("Frozen inputs or settings changed");
    verifyProtectedFiles(manifest);
  } else {
    if (existsSync(output)) throw new Error("Use a new output directory");
    const budgetSource = resolve(priorPath), prior = readJSON(budgetSource);
    const reconciledSpend = { accountedAndOutstandingUSD: prior.priorAccountedUSD + prior.accountedUSD, ceilingUSD: 95, remainingUSD: prior.remainingAllocationUSD };
    if (reconciledSpend.remainingUSD < runCeilingUSD) throw new Error("Insufficient reconciled remaining budget");
    // No inference: verify model access before consuming any case's one-call allowance.
    const preflight = await fetch(`https://api.anthropic.com/v1/models/${SETTINGS.model}`, {
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" }, signal: AbortSignal.timeout(30_000),
    });
    if (!preflight.ok) throw new Error(`Provider model preflight HTTP ${preflight.status}`);
    const modelInfo = await preflight.json();
    if (modelInfo.capabilities?.effort?.max?.supported !== true) throw new Error("MAX_EFFORT_NOT_SUPPORTED");
    manifest = {
      protocol: "stripped-3bucket-fable-max/v1", ablation: { baseline: "outputs/stripped-3bucket-fable-2026-09-15", changedSetting: "output_config.effort", from: "low", to: "max", otherProviderSettingsUnchanged: true }, frozenAt: new Date().toISOString(), provider: "Anthropic Messages API", settings: SETTINGS,
      modelInfo, csvPath, csvSHA256: sha256(csvText), promptSHA256: sha256(SYSTEM_PROMPT),
      sourceSHA256: sha256(readFileSync(fileURLToPath(import.meta.url))), systemPrompt: SYSTEM_PROMPT,
      cases: cases.map((c) => ({ ...c, inputSHA256: sha256(c.message) })),
      callPolicy: { cases: 50, callsPerCase: 1, automaticRetries: 0, fallbackCalls: 0, judgeCalls: 0, concurrency: 4 },
      scope: "Independent synthetic prototype; one message to one care setting. Physician reference is opened only after all generation artifacts are frozen. Labels never enter a provider request.",
      authorization: "User's 2026-09-15 request explicitly authorizes this separate 50-call baseline; historical ledgers are unchanged.",
      pricing: { inputUSDPerMillion: 5 * multiplier, outputUSDPerMillion: 25 * multiplier, source: "https://platform.claude.com/docs/en/about-claude/pricing", checkedAt: "2026-09-15", note: "Standard uncached token estimate, not an invoice. No tools, fast mode, or explicit caching." },
      budget: { reconciledSource: budgetSource, priorAccountedUSD: reconciledSpend.accountedAndOutstandingUSD, allocationUSD: reconciledSpend.ceilingUSD, priorRemainingUSD: reconciledSpend.remainingUSD, runCeilingUSD, note: "Separate append-only accounting for this requested baseline within the reconciled remaining allocation; no historical ledger is rewritten. Conservative accounting doubles input charges." },
      protectedFiles: protectedFiles(),
    };
    // UTF-8 byte length safely overestimates text tokens; envelope reserve is conservative.
    const reserveUSD = cases.reduce((sum, c) => sum + ((Buffer.byteLength(JSON.stringify(buildRequest(c, model))) + 2048) * 10 + SETTINGS.max_tokens * 25) * multiplier / 1e6, 0);
    if (reserveUSD > manifest.budget.runCeilingUSD) throw new Error("Prospective reservation exceeds run ceiling");
    manifest.budget.reservedUSD = reserveUSD;
    mkdirSync(output, { recursive: true });
    writeJSON(manifestPath, manifest);
    writeFileSync(join(output, "system-prompt.txt"), SYSTEM_PROMPT + "\n", { flag: "wx" });
  }
  const runOne = async (c) => {
    const prefix = join(output, c.id), requestPath = `${prefix}-request.json`, rawPath = `${prefix}-raw.json`, parsedPath = `${prefix}-parsed.json`;
    if (existsSync(parsedPath)) return;
    // A started request is never silently retried, even after interruption.
    if (existsSync(requestPath)) throw new Error(`Already started ${c.id}; no second provider call allowed`);
    const body = buildRequest(c, model), beganAt = new Date().toISOString(), began = performance.now();
    writeJSON(requestPath, { id: c.id, beganAt, inputSHA256: sha256(c.message), body });
    let raw;
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(180_000),
      });
      const responseText = await response.text();
      raw = { id: c.id, beganAt, completedAt: new Date().toISOString(), latencyMs: Math.round(performance.now() - began), status: response.status, requestId: response.headers.get("request-id"), responseText };
    } catch (error) {
      raw = { id: c.id, beganAt, completedAt: new Date().toISOString(), latencyMs: Math.round(performance.now() - began), status: null, requestId: null, responseText: null, error: String(error) };
    }
    writeJSON(rawPath, raw);
    let parsed = null, failure = null, usage = null, responseModel = null;
    try {
      if (raw.status !== 200) throw new Error(`Provider HTTP ${raw.status}: ${raw.error ?? "see raw response"}`);
      const response = JSON.parse(raw.responseText);
      usage = response.usage; responseModel = response.model;
      parsed = parseDisposition(response);
    } catch (error) { failure = String(error); }
    writeJSON(parsedPath, { id: c.id, parsed, failure, model: responseModel, usage, providerCalls: 1 });
    console.log(JSON.stringify({ id: c.id, disposition: parsed?.disposition ?? null, latencyMs: raw.latencyMs, failure }));
  };
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => { while (next < cases.length) await runOne(cases[next++]); }));
  verifyProtectedFiles(manifest);
  const records = cases.map((c) => readJSON(join(output, `${c.id}-parsed.json`)));
  const rawRecords = cases.map((c) => readJSON(join(output, `${c.id}-raw.json`)));
  const estimatedUSD = records.every((r) => r.usage) ? records.reduce((sum, r) => sum + (r.usage.input_tokens * 5 + r.usage.output_tokens * 25 + (r.usage.cache_creation_input_tokens ?? 0) * 10 + (r.usage.cache_read_input_tokens ?? 0) * (model === "claude-fable-5-1" ? .125 : .5)) * multiplier / 1e6, 0) : null;
  const accountedUSD = records.every((r) => r.usage) ? records.reduce((sum, r) => sum + ((r.usage.input_tokens + (r.usage.cache_creation_input_tokens ?? 0) + (r.usage.cache_read_input_tokens ?? 0)) * 10 + r.usage.output_tokens * 25) * multiplier / 1e6, 0) : manifest.budget.reservedUSD;
  const completion = {
    completedAt: new Date().toISOString(), plannedCases: 50, providerCalls: records.length,
    validDispositions: records.filter((r) => r.parsed).length, failedCases: records.filter((r) => !r.parsed).map((r) => r.id),
    estimatedUSD, accountedUSD,
    priorAccountedUSD: manifest.budget.priorAccountedUSD,
    remainingAllocationUSD: manifest.budget.priorRemainingUSD - accountedUSD,
    usage: records.reduce((sum, r) => ({ inputTokens: sum.inputTokens + (r.usage?.input_tokens ?? 0), outputTokens: sum.outputTokens + (r.usage?.output_tokens ?? 0) }), { inputTokens: 0, outputTokens: 0 }),
    latencyMs: rawRecords.map((r) => ({ id: r.id, latencyMs: r.latencyMs })),
    artifactHashes: Object.fromEntries(cases.flatMap((c) => ["request", "raw", "parsed"].map((kind) => { const name = `${c.id}-${kind}.json`; return [name, sha256(readFileSync(join(output, name)))]; }))),
  };
  if (!existsSync(join(output, "generation-complete.json"))) writeJSON(join(output, "generation-complete.json"), completion);
  console.log(JSON.stringify({ providerCalls: completion.providerCalls, validDispositions: completion.validDispositions, estimatedUSD, output }));
  return completion;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [model = "claude-fable-5-1", csvPath, output, priorPath] = process.argv.slice(2);
  await generate(model, csvPath, output, priorPath);
}
