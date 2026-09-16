/** One-call research ablation. Input is strictly labels-free; scoring is a separate process. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { SETTINGS, PROMPTS, sha256, buildRequest, validateMessages, parseDisposition, reserveUSD, accountUsage } from "./fn-reduction-protocol.mjs";
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_PATHS = ["scripts/fn-reduction-protocol.mjs", "scripts/fn-reduction-experiment.mjs"];
const readJSON = path => JSON.parse(readFileSync(path, "utf8"));
const writeJSON = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
const hashFile = path => sha256(readFileSync(path));
const sum = values => values.reduce((total, value) => total + value, 0);
const nonnegative = value => Number.isFinite(value) && value >= 0;
function within(root, name) {
  assert(typeof name === "string" && name && !isAbsolute(name), "Expected repo-relative path");
  const path = resolve(root, name), rel = relative(root, path);
  assert(rel && !rel.startsWith("..") && !isAbsolute(rel), "Path must remain inside root");
  return path;
}
function readBudget(path, root) {
  const value = readJSON(path);
  assert.equal(value.schema, "fn-reduction-budget/v1");
  for (const key of ["allocationUSD", "accountedAndOutstandingUSD", "perCallCeilingUSD", "runCeilingUSD"]) assert(nonnegative(value[key]), `Invalid budget ${key}`);
  assert(value.allocationUSD >= value.accountedAndOutstandingUSD, "Allocation already exceeded");
  assert(value.sources && Object.keys(value.sources).length, "Budget requires hashed accounting sources");
  for (const [name, hash] of Object.entries(value.sources)) assert.equal(hashFile(within(root, name)), hash, `Budget source changed: ${name}`);
  return { ...value, path, sha256: hashFile(path), ledgerPath: within(root, value.ledgerDirectory) };
}
function environment(root) {
  const path = join(root, ".env");
  return { ...(existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {}), ...process.env };
}
function lock(ledger, callback) {
  mkdirSync(ledger, { recursive: true });
  const path = join(ledger, ".lock");
  try { mkdirSync(path); } catch { throw new Error("Shared budget is locked; inspect an interrupted owner before any manual recovery"); }
  try { return callback(); } finally { rmdirSync(path); }
}
export function ledgerState(budget) {
  if (!existsSync(budget.ledgerPath)) return { obligationsUSD: 0, reservations: [], events: new Map() };
  const names = readdirSync(budget.ledgerPath).filter(name => name !== ".lock");
  assert(names.every(name => name.endsWith(".json")), "Unknown shared budget artifact");
  const events = new Map(names.map(name => [name, readJSON(join(budget.ledgerPath, name))]));
  const reservations = [...events.values()].filter(event => event.type === "run-reservation");
  let obligationsUSD = 0;
  const recognized = new Set();
  for (const reservation of reservations) {
    assert.equal(reservation.budgetSHA256, budget.sha256, "Shared ledger belongs to another reconciliation");
    const name = `${reservation.runId}-reservation.json`;
    assert.deepEqual(events.get(name), reservation, "Reservation filename mismatch");
    recognized.add(name);
    assert.equal(reservation.reservedUSD, sum(reservation.cases.map(row => row.reservedUSD)));
    for (const row of reservation.cases) {
      assert(nonnegative(row.reservedUSD) && row.reservedUSD <= budget.perCallCeilingUSD, "Invalid call reservation");
      const startName = `${reservation.runId}-${row.id}-start.json`, settledName = `${reservation.runId}-${row.id}-settlement.json`;
      const start = events.get(startName), settled = events.get(settledName);
      if (start) {
        assert.equal(start.type, "call-start"); assert.equal(start.runId, reservation.runId); assert.equal(start.id, row.id); assert.equal(start.requestSHA256, row.requestSHA256);
        recognized.add(startName);
      }
      if (settled) {
        assert(start, "Settlement without a durable start");
        assert.equal(settled.type, "call-settlement"); assert.equal(settled.runId, reservation.runId); assert.equal(settled.id, row.id);
        assert(nonnegative(settled.accountedUSD), "Invalid settlement accounting");
        recognized.add(settledName);
      }
      obligationsUSD += settled?.accountedUSD ?? row.reservedUSD;
    }
  }
  assert.equal(recognized.size, events.size, "Unrecognized or orphan shared budget event");
  return { obligationsUSD, reservations, events };
}
function verifyManifest(outputDir, root) {
  const manifestPath = join(outputDir, "manifest.json"), manifest = readJSON(manifestPath);
  assert.equal(manifest.protocol, "fn-reduction-one-call/v1");
  validateMessages(manifest.cases);
  assert.deepEqual(manifest.settings, SETTINGS);
  assert.equal(manifest.systemPrompt, PROMPTS[manifest.arm]);
  assert.equal(manifest.promptSHA256, sha256(manifest.systemPrompt));
  assert.equal(readFileSync(join(outputDir, "system-prompt.txt"), "utf8"), manifest.systemPrompt);
  assert.equal(hashFile(within(root, manifest.messagesPath)), manifest.messagesSHA256, "Messages changed after planning");
  assert.deepEqual(readJSON(within(root, manifest.messagesPath)), manifest.cases);
  for (const [name, hash] of Object.entries(manifest.sourceHashes)) assert.equal(hashFile(join(ROOT, name)), hash, "Runner changed after planning");
  const budget = readBudget(within(root, manifest.budget.path), root);
  assert.equal(budget.sha256, manifest.budget.sha256, "Budget changed after planning");
  return { manifest, budget, manifestSHA256: hashFile(manifestPath) };
}
export function plan({ messagesPath, arm, outputDir, budgetPath, root = ROOT }) {
  assert(!existsSync(outputDir), "Planning requires a new output directory");
  const messagesName = relative(root, resolve(messagesPath));
  const cases = validateMessages(readJSON(within(root, messagesName)));
  const budgetName = relative(root, resolve(budgetPath));
  const budget = readBudget(within(root, budgetName), root);
  const reservations = cases.map(row => ({ id: row.id, reservedUSD: reserveUSD(buildRequest(row.message, arm)) }));
  assert(reservations.every(row => row.reservedUSD <= budget.perCallCeilingUSD), "Per-call ceiling exceeded");
  const reservedUSD = sum(reservations.map(row => row.reservedUSD));
  assert(reservedUSD <= budget.runCeilingUSD, "Run ceiling exceeded");
  const state = ledgerState(budget);
  assert(reservedUSD <= budget.allocationUSD - budget.accountedAndOutstandingUSD - state.obligationsUSD, "Insufficient reconciled allocation");
  const manifest = { protocol: "fn-reduction-one-call/v1", runId: randomUUID(), frozenAt: new Date().toISOString(), arm,
    provider: "Anthropic Messages API", settings: SETTINGS, systemPrompt: PROMPTS[arm], promptSHA256: sha256(PROMPTS[arm]),
    messagesPath: messagesName, messagesSHA256: hashFile(messagesPath), cases,
    sourceHashes: Object.fromEntries(SOURCE_PATHS.map(name => [name, hashFile(join(ROOT, name))])),
    callPolicy: { callsPerCase: 1, automaticRetries: 0, fallbacks: 0, judgeCalls: 0, concurrency: 4 },
    contextPolicy: "The user message contains only the supplied message. No case ID, label, reference, retrieved context or previous output enters a request. Scoring occurs after generation is frozen.",
    budget: { path: budgetName, sha256: budget.sha256, reservedUSD, perCase: reservations },
    pricing: { inputUSDPerMillion: 10, outputUSDPerMillion: 50, cacheReadUSDPerMillion: .25, cacheWriteUSDPerMillion: 20, conservativeInputUSDPerMillion: 20, basis: "Frozen Fable accounting assumptions; estimates are not invoices." },
    interpretation: "Authored development ablation, not independent clinical validation or a deployed policy." };
  mkdirSync(outputDir, { recursive: true });
  writeJSON(join(outputDir, "manifest.json"), manifest);
  writeFileSync(join(outputDir, "system-prompt.txt"), manifest.systemPrompt, { flag: "wx", mode: 0o600 });
  return manifest;
}
export async function preflight({ outputDir, root = ROOT, fetchImpl = fetch, apiKey = environment(root).ANTHROPIC_API_KEY }) {
  const { manifest } = verifyManifest(outputDir, root);
  assert(apiKey, "ANTHROPIC_API_KEY required");
  assert(!existsSync(join(outputDir, "preflight.json")), "Preflight already exists");
  const response = await fetchImpl(`https://api.anthropic.com/v1/models/${SETTINGS.model}`, { headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }, signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200, `Model access preflight HTTP ${response.status}`);
  const info = await response.json();
  assert.equal(info.id, SETTINGS.model, "Unexpected model access response");
  assert(info.capabilities?.effort?.low?.supported === true, "Low effort support was not confirmed");
  assert(info.capabilities?.thinking?.types?.adaptive?.supported === true, "Adaptive thinking support was not confirmed");
  const result = { checkedAt: new Date().toISOString(), runId: manifest.runId, model: SETTINGS.model, modelInfo: info, generationCalls: 0 };
  writeJSON(join(outputDir, "preflight.json"), result);
  return result;
}
export async function generate({ outputDir, root = ROOT, fetchImpl = fetch, apiKey = environment(root).ANTHROPIC_API_KEY, progress = value => console.log(JSON.stringify(value)) }) {
  const { manifest, budget, manifestSHA256 } = verifyManifest(outputDir, root);
  assert(apiKey, "ANTHROPIC_API_KEY required");
  assert(!existsSync(join(outputDir, "generation-complete.json")), "Run is frozen; no further calls permitted");
  const access = readJSON(join(outputDir, "preflight.json"));
  assert.equal(access.runId, manifest.runId); assert.equal(access.model, SETTINGS.model);
  const planned = manifest.cases.map(row => ({ id: row.id, reservedUSD: reserveUSD(buildRequest(row.message, manifest.arm)), requestSHA256: sha256(JSON.stringify(buildRequest(row.message, manifest.arm))) }));
  lock(budget.ledgerPath, () => {
    const state = ledgerState(budget);
    for (const row of manifest.cases) {
      const start = state.events.get(`${manifest.runId}-${row.id}-start.json`);
      const settled = state.events.get(`${manifest.runId}-${row.id}-settlement.json`);
      const paths = ["request", "raw", "parsed"].map(kind => join(outputDir, `${row.id}-${kind}.json`));
      if (start && (!settled || !paths.every(existsSync))) throw new Error(`Previously started ${row.id} is incomplete; no retry or new calls permitted`);
      if (!start && paths.some(existsSync)) throw new Error(`Unreconciled existing artifacts for ${row.id}; no calls permitted`);
      if (settled) {
        assert.equal(settled.parsedSHA256, hashFile(paths[2]), "Completed result changed");
        const parsed = readJSON(paths[2]);
        assert.equal(parsed.requestSHA256, hashFile(paths[0])); assert.equal(parsed.rawSHA256, hashFile(paths[1]));
      }
    }
    const existing = state.reservations.find(event => event.runId === manifest.runId);
    if (existing) { assert.equal(existing.manifestSHA256, manifestSHA256); assert.deepEqual(existing.cases, planned); }
    else {
      const reservedUSD = sum(planned.map(row => row.reservedUSD));
      assert(planned.every(row => row.reservedUSD <= budget.perCallCeilingUSD) && reservedUSD <= budget.runCeilingUSD, "Prospective ceiling exceeded");
      assert(reservedUSD <= budget.allocationUSD - budget.accountedAndOutstandingUSD - state.obligationsUSD, "Insufficient shared allocation for full prospective run");
      writeJSON(join(budget.ledgerPath, `${manifest.runId}-reservation.json`), { type: "run-reservation", runId: manifest.runId, reservedAt: new Date().toISOString(), budgetSHA256: budget.sha256, manifestSHA256, reservedUSD, cases: planned });
    }
  });
  let stop = false;
  const runOne = async row => {
    const prefix = join(outputDir, row.id), requestPath = `${prefix}-request.json`, rawPath = `${prefix}-raw.json`, parsedPath = `${prefix}-parsed.json`;
    if (existsSync(parsedPath)) return;
    const body = buildRequest(row.message, manifest.arm), reservedUSD = reserveUSD(body), beganAt = new Date().toISOString();
    lock(budget.ledgerPath, () => {
      const freshBudget = readBudget(within(root, manifest.budget.path), root);
      assert.equal(freshBudget.sha256, manifest.budget.sha256);
      const state = ledgerState(budget);
      assert(budget.accountedAndOutstandingUSD + state.obligationsUSD <= budget.allocationUSD, "Shared allocation exceeded");
      writeJSON(join(budget.ledgerPath, `${manifest.runId}-${row.id}-start.json`), { type: "call-start", runId: manifest.runId, id: row.id, beganAt, requestSHA256: sha256(JSON.stringify(body)), reservedUSD });
      writeJSON(requestPath, { id: row.id, arm: manifest.arm, inputSHA256: sha256(row.message), beganAt, reservedUSD, body });
    });
    const began = performance.now();
    let raw;
    try {
      const response = await fetchImpl("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" }, body: JSON.stringify(body), signal: AbortSignal.timeout(180_000) });
      raw = { id: row.id, beganAt, status: response.status, requestId: response.headers.get("request-id"), responseText: await response.text() };
    } catch { raw = { id: row.id, beganAt, status: null, requestId: null, responseText: null, error: "Transport failure or timeout; no retry." }; }
    raw.latencyMs = Math.round(performance.now() - began); raw.completedAt = new Date().toISOString();
    writeJSON(rawPath, raw);
    let parsed = null, failure = null, usage = null, model = null, responseId = null;
    try {
      assert.equal(raw.status, 200, "Provider request failed");
      const response = JSON.parse(raw.responseText); usage = response.usage; model = response.model; responseId = response.id;
      assert.equal(model, SETTINGS.model, "Unexpected provider model");
      parsed = parseDisposition(response);
    } catch { failure = raw.status === 200 ? "Invalid or incomplete model response; no retry." : "Provider or transport failure; no retry."; }
    const accounting = accountUsage(usage, reservedUSD);
    const record = { id: row.id, arm: manifest.arm, parsed, failure, model, responseId, usage, providerCalls: 1, latencyMs: raw.latencyMs, ...accounting, requestSHA256: hashFile(requestPath), rawSHA256: hashFile(rawPath) };
    writeJSON(parsedPath, record);
    lock(budget.ledgerPath, () => writeJSON(join(budget.ledgerPath, `${manifest.runId}-${row.id}-settlement.json`), { type: "call-settlement", runId: manifest.runId, id: row.id, settledAt: new Date().toISOString(), accountedUSD: record.accountedUSD, estimatedUSD: record.estimatedUSD, usageKnown: record.usageKnown, parsedSHA256: hashFile(parsedPath) }));
    if (accounting.accountedUSD > reservedUSD) { stop = true; throw new Error("Usage exceeded prospective call reservation; no further dispatch permitted"); }
    progress({ id: row.id, arm: manifest.arm, disposition: parsed?.disposition ?? null, latencyMs: raw.latencyMs, failure });
  };
  let next = 0;
  const workers = await Promise.allSettled(Array.from({ length: 4 }, async () => { while (!stop && next < manifest.cases.length) { try { await runOne(manifest.cases[next++]); } catch (error) { stop = true; throw error; } } }));
  const failed = workers.find(result => result.status === "rejected");
  if (failed) throw failed.reason;
  verifyManifest(outputDir, root);
  const records = manifest.cases.map(row => readJSON(join(outputDir, `${row.id}-parsed.json`)));
  const artifactNames = ["manifest.json", "system-prompt.txt", "preflight.json", ...manifest.cases.flatMap(row => ["request", "raw", "parsed"].map(kind => `${row.id}-${kind}.json`))];
  const complete = { protocol: manifest.protocol, runId: manifest.runId, arm: manifest.arm, completedAt: new Date().toISOString(), plannedCases: manifest.cases.length, providerCalls: sum(records.map(row => row.providerCalls)), validDispositions: records.filter(row => row.parsed).length, failedCases: records.filter(row => !row.parsed).map(row => row.id), estimatedUSD: records.every(row => row.estimatedUSD !== null) ? sum(records.map(row => row.estimatedUSD)) : null, accountedUSD: sum(records.map(row => row.accountedUSD)), reservedUSD: manifest.budget.reservedUSD, promptSHA256: manifest.promptSHA256, sourceHashes: manifest.sourceHashes, artifactHashes: Object.fromEntries(artifactNames.map(name => [name, hashFile(join(outputDir, name))])) };
  assert.equal(complete.providerCalls, manifest.cases.length);
  writeJSON(join(outputDir, "generation-complete.json"), complete);
  progress({ frozen: true, arm: manifest.arm, providerCalls: complete.providerCalls, failedCases: complete.failedCases });
  return complete;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [action, ...args] = process.argv.slice(2), options = {};
  assert(args.length % 2 === 0, "Arguments require explicit values");
  for (let index = 0; index < args.length; index += 2) {
    const key = { "--messages": "messagesPath", "--arm": "arm", "--out": "outputDir", "--budget": "budgetPath" }[args[index]];
    assert(key && !Object.hasOwn(options, key), "Unknown or duplicate argument");
    options[key] = key === "arm" ? args[index + 1] : resolve(args[index + 1]);
  }
  assert(options.outputDir, "--out is required");
  let result;
  if (action === "plan") { assert(options.messagesPath && options.budgetPath && options.arm, "plan requires --messages --arm --out --budget"); result = plan(options); }
  else if (action === "preflight") result = await preflight(options);
  else if (action === "generate") result = await generate(options);
  else throw new Error("Use plan, preflight, or generate");
  console.log(JSON.stringify({ action, output: options.outputDir, runId: result.runId, arm: result.arm ?? null, plannedCases: result.cases?.length ?? result.plannedCases ?? null, reservedUSD: result.budget?.reservedUSD ?? result.reservedUSD ?? null }));
}
