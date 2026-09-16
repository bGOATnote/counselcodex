/** Independent integrity regressions. All responses are local test doubles; no provider calls. */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";
import { assertFrozenEvidencePackets, buildEmbeddingJobs, freezeEvidencePackets, generateEmbeddings, planEmbeddings } from "../src/research/workflow-aware/embeddings.ts";
import { fileHash, sha256 } from "../src/research/workflow-aware/budget.ts";

const sources = ["src/research/workflow-aware/embeddings.ts", "src/research/workflow-aware/evidence.ts", "src/research/workflow-aware/budget.ts", "scripts/workflow-aware-evidence.ts", "package-lock.json"];
const originalCards = JSON.parse(readFileSync(new URL("../data/research/workflow-aware-v1/evidence-cards.json", import.meta.url), "utf8"));
function fixture(t: TestContext) {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-09-16T07:00:00Z") });
  const root = mkdtempSync(join(tmpdir(), "counsel-independent-embedding-"));
  const write = (relative: string, value: unknown) => { const path = join(root, relative); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(value)}\n`); return path; };
  for (const path of sources) write(path, { type: "offline-source-hash-fixture", path });
  const funding = write("funding.json", { authorization: "test-double-only-no-spending" });
  const messagesPath = write("messages.json", [{ id: "M1", message: "My ankle is sore after an injury." }]);
  const cardsPath = write("cards.json", originalCards);
  const budgetPath = write("budget.json", { schema: "workflow-aware-budget/v1", allocationUSD: 50, embeddingEarmarkUSD: 1,
    accountedAndOutstandingUSD: 0, perCallCeilingUSD: 1, ledgerDirectory: "ledger", sources: { "funding.json": fileHash(funding) } });
  const out = join(root, "outputs", "embeddings");
  const deadlineUTC = new Date(Date.now() + 3_600_000).toISOString();
  return { root, out, messagesPath, cardsPath, budgetPath, deadlineUTC, write, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
function response(count: number) {
  return { model: "text-embedding-3-large", data: Array.from({ length: count }, (_, index) => ({ index, embedding: Array(1536).fill(0.01) })), usage: { total_tokens: count } };
}

test("untampered frozen embedding inputs complete with one local test double and admit bound packets", async t => {
  const f = fixture(t);
  try {
    const plan = planEmbeddings(f);
    let calls = 0;
    const fetchImpl = (async (_url: unknown, request: RequestInit) => {
      calls++;
      const body = JSON.parse(String(request.body));
      return new Response(JSON.stringify(response(body.input.length)), { status: 200 });
    }) as typeof fetch;
    await generateEmbeddings({ root: f.root, out: f.out, apiKey: "test-only-key", fetchImpl });
    assert.equal(calls, plan.callsPlanned);
    assert.equal(freezeEvidencePackets({ root: f.root, out: f.out }).messages, 1);
  } finally { f.cleanup(); }
});

test("embedding dispatch rejects internally rehashed entries that differ from frozen source inputs", async t => {
  const f = fixture(t);
  try {
    planEmbeddings(f);
    const path = join(f.out, "manifest.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifest.entries[0].text = "A forbidden reference label was inserted after planning: SELF_CARE.";
    manifest.entries[0].textSHA256 = sha256(manifest.entries[0].text);
    manifest.jobs = buildEmbeddingJobs(manifest.entries);
    writeFileSync(path, JSON.stringify(manifest));
    let calls = 0;
    const fetchImpl = (async (_url: unknown, request: RequestInit) => {
      calls++;
      const body = JSON.parse(String(request.body));
      return new Response(JSON.stringify(response(body.input.length)), { status: 200 });
    }) as typeof fetch;
    await assert.rejects(() => generateEmbeddings({ root: f.root, out: f.out, apiKey: "test-only-key", fetchImpl }));
    assert.equal(calls, 0, "Integrity must fail before dispatch");
  } finally { f.cleanup(); }
});

test("dense freeze requires a complete artifact manifest and genuine durable dispatch records", t => {
  const f = fixture(t);
  try {
    planEmbeddings(f);
    const manifest = JSON.parse(readFileSync(join(f.out, "manifest.json"), "utf8"));
    for (const job of manifest.jobs) f.write(`outputs/embeddings/${job.id}-raw.json`, { status: 200, responseText: JSON.stringify(response(job.entries.length)) });
    f.write("outputs/embeddings/generation-complete.json", { artifactHashes: {} });
    assert.throws(() => freezeEvidencePackets({ root: f.root, out: f.out }), "A fabricated completion cannot certify unstarted dense vectors");
  } finally { f.cleanup(); }
});

test("rehashing altered raw vectors in completion does not bypass the durable receipt binding", async t => {
  const f = fixture(t);
  try {
    planEmbeddings(f);
    const fetchImpl = (async (_url: unknown, request: RequestInit) => {
      const body = JSON.parse(String(request.body));
      return new Response(JSON.stringify(response(body.input.length)), { status: 200 });
    }) as typeof fetch;
    await generateEmbeddings({ root: f.root, out: f.out, apiKey: "test-only-key", fetchImpl });
    const rawPath = join(f.out, "embedding-1-raw.json"), raw = JSON.parse(readFileSync(rawPath, "utf8"));
    const provider = JSON.parse(raw.responseText);
    provider.data[0].embedding[0] = 0.5;
    raw.responseText = JSON.stringify(provider);
    writeFileSync(rawPath, JSON.stringify(raw));
    const completePath = join(f.out, "generation-complete.json"), complete = JSON.parse(readFileSync(completePath, "utf8"));
    complete.artifactHashes["embedding-1-raw.json"] = fileHash(rawPath);
    writeFileSync(completePath, JSON.stringify(complete));
    assert.throws(() => freezeEvidencePackets({ root: f.root, out: f.out }), "Raw vectors must match the receipt bound in the ledger");
  } finally { f.cleanup(); }
});

test("evidence admission rejects swapped texts and changed metadata before model planning", async t => {
  const f = fixture(t);
  try {
    f.write("messages.json", [{ id: "M1", message: "My ankle is sore after an injury." }, { id: "M2", message: "I have trouble sleeping and it affects my daily work." }]);
    planEmbeddings(f);
    const fetchImpl = (async (_url: unknown, request: RequestInit) => {
      const body = JSON.parse(String(request.body));
      return new Response(JSON.stringify(response(body.input.length)), { status: 200 });
    }) as typeof fetch;
    await generateEmbeddings({ root: f.root, out: f.out, apiKey: "test-only-key", fetchImpl });
    freezeEvidencePackets({ root: f.root, out: f.out });
    const evidencePath = join(f.out, "evidence-packets.json"), original = JSON.parse(readFileSync(evidencePath, "utf8"));
    assert.ok(assertFrozenEvidencePackets({ root: f.root, evidencePath }).additionalInputFiles.length > 0);
    assert.notEqual(original.packets[0].evidenceText, original.packets[1].evidenceText);
    const swapped = structuredClone(original);
    [swapped.packets[0].evidenceText, swapped.packets[1].evidenceText] = [swapped.packets[1].evidenceText, swapped.packets[0].evidenceText];
    writeFileSync(evidencePath, JSON.stringify(swapped));
    assert.throws(() => assertFrozenEvidencePackets({ root: f.root, evidencePath }), /differs from authenticated source selection/);
    const changedMetadata = structuredClone(original);
    changedMetadata.packets[0].evidenceMetadata.embeddingCompletionSHA256 = "0".repeat(64);
    writeFileSync(evidencePath, JSON.stringify(changedMetadata));
    assert.throws(() => assertFrozenEvidencePackets({ root: f.root, evidencePath }), /differs from authenticated source selection/);
  } finally { f.cleanup(); }
});

test("embedding plan cannot extend the research authorization deadline", t => {
  const f = fixture(t);
  try {
    assert.throws(() => planEmbeddings({ ...f, deadlineUTC: "2099-01-01T00:00:00Z" }), "A future timestamp is not sufficient authorization");
  } finally { f.cleanup(); }
});

test("completed evidence replay uses its archived runtime while generation rejects current runtime drift", async t => {
  const f = fixture(t);
  try {
    planEmbeddings(f);
    const fetchImpl = (async (_url: unknown, request: RequestInit) => {
      const body = JSON.parse(String(request.body));
      return new Response(JSON.stringify(response(body.input.length)), { status: 200 });
    }) as typeof fetch;
    await generateEmbeddings({ root: f.root, out: f.out, apiKey: "test-only-key", fetchImpl });
    freezeEvidencePackets({ root: f.root, out: f.out });
    const evidencePath = join(f.out, "evidence-packets.json");
    const expected = assertFrozenEvidencePackets({ root: f.root, evidencePath, verificationMode: "frozen" });

    f.write("package-lock.json", { type: "later-runtime-lock" });
    assert.deepEqual(assertFrozenEvidencePackets({ root: f.root, evidencePath, verificationMode: "frozen" }), expected,
      "An unrelated later runtime must not invalidate replay of authenticated completed evidence");
    assert.throws(() => assertFrozenEvidencePackets({ root: f.root, evidencePath, verificationMode: "generation" }), /Runtime changed before inference/);

    f.write("outputs/embeddings/runtime/package-lock.json", { type: "altered-archived-runtime-lock" });
    assert.throws(() => assertFrozenEvidencePackets({ root: f.root, evidencePath, verificationMode: "frozen" }), /Archived runtime lock drift/,
      "Offline replay still requires the exact runtime archived before inference");
  } finally { f.cleanup(); }
});
