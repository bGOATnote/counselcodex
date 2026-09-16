/** Optional frozen embedding comparison. Synthetic messages only; no clinical reference imports. */
import assert from "node:assert/strict";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileHash, ledgerState, readBudget, readJSON, reserveAndStart, settle, sha256, within, withDirectoryLock, writeExclusiveJSON } from "./budget.ts";
import type { Budget } from "./budget.ts";
import { evidenceCardSetHash, evidenceEmbeddingText, parseEvidenceCards, retrieveEvidence, renderEvidenceForPrompt } from "./evidence.ts";
import type { FrozenDenseVectors } from "./evidence.ts";

const MODEL = "text-embedding-3-large", DIMENSIONS = 1536, RATE_USD_PER_MILLION = 0.13;
const DEADLINE = "2026-09-16T14:41:47Z";
const SOURCES = ["src/research/workflow-aware/embeddings.ts", "src/research/workflow-aware/evidence.ts", "src/research/workflow-aware/budget.ts", "scripts/workflow-aware-evidence.ts"];
type Message = { id: string; message: string };
type Entry = { kind: "card" | "message"; id: string; text: string; textSHA256: string };
type EmbeddingBody = { model: string; dimensions: number; encoding_format: string; input: string[] };
type Job = { id: string; entries: Entry[]; request: EmbeddingBody; requestSHA256: string; reservedUSD: number };
type Manifest = {
  schema: "workflow-aware-embeddings/v1"; studyId: string; frozenAt: string; deadlineUTC: string;
  model: string; dimensions: number; revision: string; asOf: string;
  budget: { path: string; sha256: string }; sourceHashes: Record<string, string>;
  messagesPath: string; messagesSHA256: string; cardsPath: string; cardsSHA256: string; cardSetHash: string;
  entries: Entry[]; jobs: Job[]; calls: number; retries: 0; rateUSDPerMillion: number; rateSource: string;
  runtime: { lockPath: string; lockSHA256: string };
};

export function validateMessages(value: unknown): Message[] {
  assert(Array.isArray(value) && value.length > 0 && value.length <= 500, "Invalid message list");
  const ids = new Set<string>();
  for (const row of value) {
    assert(row && typeof row === "object" && Object.keys(row).sort().join(",") === "id,message", "Only id and message are allowed; references and metadata are prohibited");
    assert(typeof row.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(row.id) && !ids.has(row.id), "Invalid or duplicate ID");
    assert(typeof row.message === "string" && row.message.trim() && Buffer.byteLength(row.message) <= 16000, "Invalid embedding input");
    ids.add(row.id);
  }
  return value as Message[];
}

export function buildEmbeddingJobs(entries: Entry[]): Job[] {
  const jobs: Job[] = [];
  for (let i = 0; i < entries.length; i += 64) {
    const batch = entries.slice(i, i + 64);
    assert(batch.every(e => e.text.trim() && Buffer.byteLength(e.text) <= 16000 && e.textSHA256 === sha256(e.text)), "Invalid source text");
    const request = { model: MODEL, dimensions: DIMENSIONS, encoding_format: "float", input: batch.map(e => e.text) };
    jobs.push({ id: `embedding-${jobs.length + 1}`, entries: batch, request, requestSHA256: sha256(JSON.stringify(request)),
      reservedUSD: ((Buffer.byteLength(JSON.stringify(request)) + 2048) * RATE_USD_PER_MILLION) / 1e6 });
  }
  return jobs;
}

export function parseEmbeddingResponse(value: unknown, expected: number) {
  assert(value && typeof value === "object", "Invalid embedding response");
  const raw = value as { model?: unknown; data?: unknown; usage?: { prompt_tokens?: unknown; total_tokens?: unknown } };
  assert.equal(raw.model, MODEL, "Embedding model mismatch");
  assert(Array.isArray(raw.data) && raw.data.length === expected, "Embedding count mismatch");
  const vectors: number[][] = Array(expected), seen = new Set<number>();
  for (const row of raw.data as { index: number; embedding: number[] }[]) {
    assert(Number.isInteger(row.index) && row.index >= 0 && row.index < expected && !seen.has(row.index), "Invalid embedding index");
    assert(Array.isArray(row.embedding) && row.embedding.length === DIMENSIONS && row.embedding.every(Number.isFinite)
      && row.embedding.some(x => x !== 0) && Number.isFinite(Math.hypot(...row.embedding)), "Invalid embedding vector");
    seen.add(row.index); vectors[row.index] = row.embedding;
  }
  assert(typeof raw.usage?.total_tokens === "number" && Number.isSafeInteger(raw.usage.total_tokens) && raw.usage.total_tokens >= 0, "Missing embedding accounting");
  return { vectors, totalTokens: raw.usage.total_tokens, accountedUSD: raw.usage.total_tokens * RATE_USD_PER_MILLION / 1e6 };
}

export function planEmbeddings({ root, out, messagesPath, cardsPath, budgetPath, deadlineUTC }: { root: string; out: string; messagesPath: string; cardsPath: string; budgetPath: string; deadlineUTC: string }) {
  assert(!existsSync(out), "Embedding plan requires a new directory");
  assert(Number.isFinite(Date.parse(deadlineUTC)) && Date.parse(deadlineUTC) <= Date.parse(DEADLINE), "Invalid or unauthorized deadline");
  const messages = validateMessages(readJSON(messagesPath)), cards = parseEvidenceCards(readJSON(cardsPath));
  const budget = readBudget(budgetPath, root);
  const entries: Entry[] = [...cards.map(card => ({ kind: "card" as const, id: card.id, text: evidenceEmbeddingText(card) })),
    ...messages.map(row => ({ kind: "message" as const, id: row.id, text: row.message }))].map(entry => ({ ...entry, textSHA256: sha256(entry.text) }));
  const jobs = buildEmbeddingJobs(entries);
  assert(jobs.reduce((sum, job) => sum + job.reservedUSD, 0) <= budget.embeddingEarmarkUSD, "Embedding reservation exceeds earmark");
  const names = { messagesPath: relative(root, messagesPath), cardsPath: relative(root, cardsPath) };
  Object.values(names).forEach(name => within(root, name));
  const manifest: Manifest = {
    schema: "workflow-aware-embeddings/v1", studyId: "workflow-evidence-2026-09-16", frozenAt: new Date().toISOString(), deadlineUTC,
    model: MODEL, dimensions: DIMENSIONS, revision: "provider-alias; immutable weight revision is not exposed",
    asOf: "2026-09-16", budget: { path: relative(root, budgetPath), sha256: budget.sha256 },
    sourceHashes: Object.fromEntries(SOURCES.map(name => [name, fileHash(within(root, name))])), ...names,
    messagesSHA256: fileHash(messagesPath), cardsSHA256: fileHash(cardsPath), cardSetHash: evidenceCardSetHash(cards),
    entries, jobs, calls: jobs.length, retries: 0, rateUSDPerMillion: RATE_USD_PER_MILLION,
    rateSource: "https://developers.openai.com/api/docs/models/text-embedding-3-large",
    runtime: { lockPath: "runtime/package-lock.json", lockSHA256: fileHash(join(root, "package-lock.json")) },
  };
  mkdirSync(out, { recursive: true, mode: 0o700 });
  mkdirSync(join(out, "runtime"), { mode: 0o700 });
  // Preserve exact bytes, not a reserialized dependency graph.
  const lockBytes = readFileSync(join(root, "package-lock.json"));
  const lockFD = openSync(join(out, manifest.runtime.lockPath), "wx", 0o600);
  try { writeFileSync(lockFD, lockBytes); fsyncSync(lockFD); } finally { closeSync(lockFD); }
  const runtimeFD = openSync(join(out, "runtime"), "r");
  try { fsyncSync(runtimeFD); } finally { closeSync(runtimeFD); }
  writeExclusiveJSON(join(out, "manifest.json"), manifest);
  const lexical = messages.map(row => ({ id: row.id, packet: retrieveEvidence(row.message, cards, { asOf: manifest.asOf }) }));
  writeExclusiveJSON(join(out, "lexical-inventory.json"), { status: "unreviewed-retrieval-inventory-not-clinical-targets", rows: lexical });
  writeExclusiveJSON(join(out, "plan-complete.json"), { schema: "workflow-aware-embedding-plan-freeze/v1", frozenAt: new Date().toISOString(),
    manifestSHA256: fileHash(join(out, "manifest.json")), lexicalInventorySHA256: fileHash(join(out, "lexical-inventory.json")) });
  return { callsPlanned: jobs.length, sourceCards: cards.length, messages: messages.length, reservedUSD: jobs.reduce((sum, job) => sum + job.reservedUSD, 0), manifestSHA256: fileHash(join(out, "manifest.json")) };
}

function verify(out: string, root: string, verificationMode: "generation" | "frozen" = "generation") {
  const manifest = readJSON(join(out, "manifest.json")) as Manifest;
  assert.equal(manifest.schema, "workflow-aware-embeddings/v1");
  assert.equal(manifest.model, MODEL); assert.equal(manifest.dimensions, DIMENSIONS);
  assert.equal(manifest.retries, 0); assert.equal(manifest.rateUSDPerMillion, RATE_USD_PER_MILLION);
  assert.equal(manifest.runtime.lockPath, "runtime/package-lock.json");
  assert.equal(fileHash(join(out, manifest.runtime.lockPath)), manifest.runtime.lockSHA256, "Archived runtime lock drift");
  if (verificationMode === "generation") assert.equal(fileHash(join(root, "package-lock.json")), manifest.runtime.lockSHA256, "Runtime changed before inference");
  else assert(existsSync(join(out, "generation-complete.json")), "Archived verification requires completed generation");
  assert(Number.isFinite(Date.parse(manifest.deadlineUTC)) && Date.parse(manifest.deadlineUTC) <= Date.parse(DEADLINE), "Unauthorized deadline");
  assert.deepEqual(Object.keys(manifest.sourceHashes).sort(), [...SOURCES].sort(), "Incomplete source coverage");
  const seal = readJSON(join(out, "plan-complete.json")) as { schema: string; manifestSHA256: string; lexicalInventorySHA256: string };
  assert.equal(seal.schema, "workflow-aware-embedding-plan-freeze/v1");
  assert.equal(seal.manifestSHA256, fileHash(join(out, "manifest.json")), "Embedding manifest drift");
  assert.equal(seal.lexicalInventorySHA256, fileHash(join(out, "lexical-inventory.json")), "Lexical inventory drift");
  for (const [path, hash] of Object.entries(manifest.sourceHashes)) assert.equal(fileHash(within(root, path)), hash, "Embedding source drift");
  assert.equal(fileHash(within(root, manifest.messagesPath)), manifest.messagesSHA256, "Message drift");
  assert.equal(fileHash(within(root, manifest.cardsPath)), manifest.cardsSHA256, "Card drift");
  const budget = readBudget(within(root, manifest.budget.path), root);
  assert.equal(budget.sha256, manifest.budget.sha256, "Budget drift");
  const cards = parseEvidenceCards(readJSON(within(root, manifest.cardsPath))), messages = validateMessages(readJSON(within(root, manifest.messagesPath)));
  const entries: Entry[] = [...cards.map(card => ({ kind: "card" as const, id: card.id, text: evidenceEmbeddingText(card) })),
    ...messages.map(row => ({ kind: "message" as const, id: row.id, text: row.message }))].map(entry => ({ ...entry, textSHA256: sha256(entry.text) }));
  assert.equal(evidenceCardSetHash(cards), manifest.cardSetHash, "Embedding card identity drift");
  assert.deepEqual(entries, manifest.entries, "Embedding entries differ from original sources");
  assert.deepEqual(buildEmbeddingJobs(manifest.entries), manifest.jobs, "Embedding request drift");
  assert.equal(manifest.calls, manifest.jobs.length);
  return { manifest, budget, manifestSHA256: fileHash(join(out, "manifest.json")) };
}

function verifiedJob(out: string, manifest: Manifest, budget: Budget, job: Job) {
  const key = `${manifest.studyId}--${job.id}`;
  const state = withDirectoryLock(budget.ledgerPath, () => ledgerState(budget));
  const start = state.starts.get(key), settlement = state.settlements.get(key);
  assert(start && settlement, "Embedding job lacks durable start and settlement; no retry");
  assert.equal(start.model, "embedding"); assert.equal(start.manifestSHA256, fileHash(join(out, "manifest.json")));
  assert.equal(start.requestSHA256, job.requestSHA256); assert.equal(start.reservedUSD, job.reservedUSD);
  assert(Date.parse(start.beganAt) >= Date.parse(manifest.frozenAt) && Date.parse(start.beganAt) < Date.parse(manifest.deadlineUTC), "Invalid embedding dispatch time");
  const rawPath = join(out, `${job.id}-raw.json`), receiptPath = join(out, `${job.id}-receipt.json`);
  const raw = readJSON(rawPath) as { jobId: string; requestSHA256: string; status: number; responseText: string; failure: string | null; completedAt: string };
  assert.equal(raw.jobId, job.id); assert.equal(raw.requestSHA256, job.requestSHA256); assert.equal(raw.status, 200); assert.equal(raw.failure, null);
  assert(Date.parse(raw.completedAt) >= Date.parse(start.beganAt), "Embedding completion precedes dispatch");
  const parsed = parseEmbeddingResponse(JSON.parse(raw.responseText), job.entries.length);
  const receipt = readJSON(receiptPath);
  assert.deepEqual(receipt, { jobId: job.id, rawSHA256: fileHash(rawPath), valid: true, failure: null,
    entries: job.entries.map((entry, index) => ({ kind: entry.kind, id: entry.id, textSHA256: entry.textSHA256, vector: parsed.vectors[index] })),
    totalTokens: parsed.totalTokens, accountedUSD: parsed.accountedUSD, usageKnown: true }, "Embedding receipt differs from raw response");
  assert.equal(settlement.parsedSHA256, fileHash(receiptPath)); assert.equal(settlement.accountedUSD, parsed.accountedUSD);
  assert.equal(settlement.estimatedUSD, parsed.accountedUSD); assert.equal(settlement.usageKnown, true);
  assert(parsed.accountedUSD <= job.reservedUSD + 1e-12, "Embedding exceeded allowance");
  return parsed;
}

export async function generateEmbeddings({ root, out, apiKey, fetchImpl = fetch }: { root: string; out: string; apiKey: string | undefined; fetchImpl?: typeof fetch }) {
  const { manifest, budget, manifestSHA256 } = verify(out, root);
  assert(apiKey, "OPENAI_API_KEY is required; no fallback");
  assert(!existsSync(join(out, "generation-complete.json")), "Embedding generation is already frozen");
  for (const job of manifest.jobs) {
    const state = withDirectoryLock(budget.ledgerPath, () => ledgerState(budget));
    if (state.starts.has(`${manifest.studyId}--${job.id}`)) { verifiedJob(out, manifest, budget, job); continue; }
    assert(Date.now() + 60_000 < Date.parse(manifest.deadlineUTC), "Deadline would be exceeded");
    assert(!existsSync(join(out, `${job.id}-raw.json`)), "Embedding job already dispatched; no retry");
    reserveAndStart(budget, { studyId: manifest.studyId, jobId: job.id, model: "embedding", manifestSHA256,
      requestSHA256: job.requestSHA256, reservedUSD: job.reservedUSD, beganAt: new Date().toISOString() });
    const began = performance.now();
    let status: number | null = null, responseText: string | null = null, requestId: string | null = null, failure: string | null = null;
    try {
      const response: Response = await fetchImpl("https://api.openai.com/v1/embeddings", { method: "POST", redirect: "error", signal: AbortSignal.timeout(60_000),
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(job.request) });
      status = response.status; requestId = response.headers.get("x-request-id");
      const text = await response.text();
      if (text.includes(apiKey)) failure = "Body withheld because it contained a credential; no retry.";
      else responseText = text;
    } catch { failure = "Embedding transport failed; no retry."; }
    const rawPath = join(out, `${job.id}-raw.json`);
    writeExclusiveJSON(rawPath, { jobId: job.id, requestSHA256: job.requestSHA256, status, requestId, responseText, failure, latencyMs: Math.round(performance.now() - began), completedAt: new Date().toISOString() });
    let parsed: ReturnType<typeof parseEmbeddingResponse> | null = null;
    try { assert.equal(status, 200); assert(responseText && !failure); parsed = parseEmbeddingResponse(JSON.parse(responseText), job.entries.length); }
    catch { failure ??= "Embedding response failed validation; no vectors admitted."; }
    const receiptPath = join(out, `${job.id}-receipt.json`);
    writeExclusiveJSON(receiptPath, { jobId: job.id, rawSHA256: fileHash(rawPath), valid: parsed !== null, failure,
      entries: parsed ? job.entries.map((entry, index) => ({ kind: entry.kind, id: entry.id, textSHA256: entry.textSHA256, vector: parsed.vectors[index] })) : [],
      totalTokens: parsed?.totalTokens ?? null, accountedUSD: parsed?.accountedUSD ?? job.reservedUSD, usageKnown: parsed !== null });
    settle(budget, { studyId: manifest.studyId, jobId: job.id, settledAt: new Date().toISOString(), parsedSHA256: fileHash(receiptPath),
      accountedUSD: parsed?.accountedUSD ?? job.reservedUSD, estimatedUSD: parsed?.accountedUSD ?? null, usageKnown: parsed !== null });
    assert(parsed, "Embedding failed; stopping without retry or silent lexical replacement");
    assert(parsed.accountedUSD <= job.reservedUSD + 1e-12, "Embedding exceeded conservative allowance; stop");
  }
  const names = ["manifest.json", "plan-complete.json", "runtime/package-lock.json", "lexical-inventory.json", ...manifest.jobs.flatMap(job => [`${job.id}-raw.json`, `${job.id}-receipt.json`])];
  for (const job of manifest.jobs) verifiedJob(out, manifest, budget, job);
  writeExclusiveJSON(join(out, "generation-complete.json"), { schema: "workflow-aware-embeddings-complete/v1", completedAt: new Date().toISOString(), calls: manifest.jobs.length,
    artifactHashes: Object.fromEntries(names.map(name => [name, fileHash(join(out, name))])) });
  return { complete: true, calls: manifest.jobs.length };
}

function deriveEvidencePackets(root: string, out: string, verificationMode: "generation" | "frozen" = "generation") {
  const { manifest, budget } = verify(out, root, verificationMode);
  const completion = readJSON(join(out, "generation-complete.json")) as { schema: string; calls: number; artifactHashes: Record<string, string> };
  assert.equal(completion.schema, "workflow-aware-embeddings-complete/v1"); assert.equal(completion.calls, manifest.jobs.length);
  const expected = ["manifest.json", "plan-complete.json", "runtime/package-lock.json", "lexical-inventory.json", ...manifest.jobs.flatMap(job => [`${job.id}-raw.json`, `${job.id}-receipt.json`])];
  assert.deepEqual(Object.keys(completion.artifactHashes).sort(), expected.sort(), "Incomplete embedding artifact coverage");
  for (const [name, hash] of Object.entries(completion.artifactHashes)) assert.equal(fileHash(within(out, name)), hash, "Embedding artifact drift");
  const cards = parseEvidenceCards(readJSON(within(root, manifest.cardsPath))), messages = validateMessages(readJSON(within(root, manifest.messagesPath)));
  const vectors = new Map<string, number[]>();
  for (const job of manifest.jobs) {
    const parsed = verifiedJob(out, manifest, budget, job);
    job.entries.forEach((entry, index) => vectors.set(`${entry.kind}:${entry.id}`, parsed.vectors[index]));
  }
  const cardVectors = Object.fromEntries(cards.map(card => [card.id, { contentHash: card.contentHash, embeddingTextHash: sha256(evidenceEmbeddingText(card)), vector: vectors.get(`card:${card.id}`)! }]));
  const rows = messages.map(row => {
    const dense: FrozenDenseVectors = { model: manifest.model, revision: manifest.revision, dimensions: manifest.dimensions, cardSetHash: manifest.cardSetHash,
      queryHash: sha256(row.message), queryVector: vectors.get(`message:${row.id}`)!, cardVectors };
    const lexical = retrieveEvidence(row.message, cards, { asOf: manifest.asOf });
    const hybrid = retrieveEvidence(row.message, cards, { asOf: manifest.asOf, dense });
    return { id: row.id, inputSHA256: sha256(row.message), lexical, hybrid,
      selectedOrderChanged: lexical.selected.map(x => x.id).join(",") !== hybrid.selected.map(x => x.id).join(","),
      evidenceText: renderEvidenceForPrompt(hybrid) };
  });
  const packets = { schema: "workflow-aware-evidence-packets/v1", packets: rows.map(row => ({ inputSHA256: row.inputSHA256, evidenceText: row.evidenceText,
    evidenceMetadata: { mode: row.hybrid.mode, packetHash: row.hybrid.packetHash, cardSetHash: row.hybrid.cardSetHash, selectedIds: row.hybrid.selected.map(x => x.id), embeddingCompletionSHA256: fileHash(join(out, "generation-complete.json")) } })) };
  return { rows, packets, dependencies: [...expected, "generation-complete.json", "retrieval-comparison.json", "evidence-packets.json"].map(name => relative(root, join(out, name))) };
}

export function freezeEvidencePackets({ root, out }: { root: string; out: string }) {
  const { rows, packets } = deriveEvidencePackets(root, out);
  writeExclusiveJSON(join(out, "retrieval-comparison.json"), { schema: "workflow-aware-retrieval-comparison/v1", status: "unreviewed-retrieval-not-clinical-performance", messages: rows.length,
    selectedOrderChanged: rows.filter(row => row.selectedOrderChanged).length, hybridNoHit: rows.filter(row => row.hybrid.selected.length === 0).length, rows });
  writeExclusiveJSON(join(out, "evidence-packets.json"), packets);
  return { messages: rows.length, selectedOrderChanged: rows.filter(row => row.selectedOrderChanged).length, packetsPath: relative(root, join(out, "evidence-packets.json")) };
}

export function assertFrozenEvidencePackets({ root, evidencePath, verificationMode = "generation" }: { root: string; evidencePath: string; verificationMode?: "generation" | "frozen" }) {
  const path = resolve(evidencePath), out = resolve(path, "..");
  assert.equal(path, join(out, "evidence-packets.json"), "Unexpected evidence packet filename");
  within(root, relative(root, path));
  const { packets, dependencies } = deriveEvidencePackets(root, out, verificationMode);
  assert.deepEqual(readJSON(path), packets, "Evidence text or metadata differs from authenticated source selection");
  return { additionalInputFiles: dependencies };
}
