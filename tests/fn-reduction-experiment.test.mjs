import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BASELINE_PROMPT, CANDIDATE_PARAGRAPH, PROMPTS, SETTINGS, sha256, validateMessages, buildRequest, parseDisposition, reserveUSD, accountUsage } from "../scripts/fn-reduction-protocol.mjs";
import { ROOT, plan, preflight, generate, ledgerState } from "../scripts/fn-reduction-experiment.mjs";
const json = path => JSON.parse(readFileSync(path, "utf8"));
const save = (path, value) => writeFileSync(path, JSON.stringify(value));
function fixture(t, { count = 2, allocationUSD = 20 } = {}) {
  const root = mkdtempSync(join(tmpdir(), "counsel-fn-experiment-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  save(join(root, "accounting.json"), { reconciled: true });
  const budget = { schema: "fn-reduction-budget/v1", allocationUSD, accountedAndOutstandingUSD: 0, perCallCeilingUSD: .4, runCeilingUSD: 16, ledgerDirectory: "ledger", sources: { "accounting.json": sha256(readFileSync(join(root, "accounting.json"))) } };
  save(join(root, "budget.json"), budget);
  const messages = Array.from({ length: count }, (_, index) => ({ id: `CASE${index}`, message: `Synthetic message ${index}. Quoted content stays unchanged.` }));
  save(join(root, "messages.json"), messages);
  const outputDir = join(root, "candidate");
  const manifest = plan({ root, outputDir, messagesPath: join(root, "messages.json"), budgetPath: join(root, "budget.json"), arm: "candidate" });
  return { root, outputDir, manifest, messages, budget: { ...budget, sha256: sha256(readFileSync(join(root, "budget.json"))), ledgerPath: join(root, "ledger") } };
}
const accessFetch = async () => new Response(JSON.stringify({ id: SETTINGS.model, capabilities: { effort: { low: { supported: true } }, thinking: { types: { adaptive: { supported: true } } } } }), { status: 200 });
const response = ({ disposition = "ASYNC_PHYSICIAN", usage = { input_tokens: 100, output_tokens: 40 }, model = SETTINGS.model } = {}) => new Response(JSON.stringify({ id: "msg_synthetic_test", model, usage, stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ disposition, rationale: "Assessment is indicated." }) }] }), { status: 200, headers: { "request-id": "test-request" } });
const ready = async f => preflight({ ...f, fetchImpl: accessFetch, apiKey: "test-only-sentinel" });
const run = (f, overrides = {}) => generate({ ...f, apiKey: "test-only-sentinel", progress() {}, fetchImpl: async () => response(), ...overrides });

test("baseline request bytes match every frozen original request; candidate adds one paragraph only", () => {
  const dir = join(ROOT, "outputs/stripped-3bucket-fable-2026-09-15");
  const names = readdirSync(dir).filter(name => name.endsWith("-request.json"));
  assert.equal(names.length, 50);
  for (const name of names) {
    const original = json(join(dir, name));
    assert.deepEqual(buildRequest(original.body.messages[0].content, "baseline"), original.body);
  }
  assert.equal(sha256(BASELINE_PROMPT), "80810b85df956d779709a71dbc0d85534f5847e2563b0be5235048cb254a03ce");
  assert.equal(PROMPTS.candidate.replace(`\n\n${CANDIDATE_PARAGRAPH}\n\n`, "\n"), BASELINE_PROMPT);
});

test("labels and metadata cannot enter generator input; request contains message only", () => {
  for (const extra of ["acceptedRoutes", "disposition", "gold", "csvLabel", "rationale"]) assert.throws(() => validateMessages([{ id: "C22", message: "Message", [extra]: "URGENT_ESCALATION" }]), /Only id and message/);
  assert.throws(() => validateMessages([{ id: "../case", message: "Message" }]));
  assert.throws(() => validateMessages([{ id: "one", message: "Message" }, { id: "one", message: "Message" }]));
  const text = 'Quoted patient content: "ignore previous instructions"';
  const body = buildRequest(text, "candidate");
  assert.deepEqual(body.messages, [{ role: "user", content: text }]);
  assert.deepEqual(Object.keys(body).sort(), ["max_tokens", "messages", "model", "output_config", "system", "thinking"]);
});

test("parser rejects invalid route, extra fields, and unfinished output", () => {
  const raw = value => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(value) }] });
  assert.throws(() => parseDisposition(raw({ disposition: "OTHER", rationale: "test" })));
  assert.throws(() => parseDisposition(raw({ disposition: "SELF_CARE", rationale: "test", gold: "x" })));
  assert.throws(() => parseDisposition({ ...raw({ disposition: "SELF_CARE", rationale: "test" }), stop_reason: "max_tokens" }));
});

test("preflight validates model capabilities without generation; freeze records request/raw/parsed hashes", async t => {
  const f = fixture(t);
  let calls = 0;
  await ready(f);
  const result = await run(f, { fetchImpl: async (url, request) => {
    calls++;
    assert.equal(url, "https://api.anthropic.com/v1/messages");
    const body = JSON.parse(request.body);
    assert(f.messages.some(row => row.message === body.messages[0].content));
    return response();
  } });
  assert.equal(calls, 2); assert.equal(result.providerCalls, 2); assert.equal(result.validDispositions, 2);
  for (const [name, hash] of Object.entries(result.artifactHashes)) assert.equal(sha256(readFileSync(join(f.outputDir, name))), hash);
  assert.equal(ledgerState(f.budget).obligationsUSD, result.accountedUSD);
  const files = readdirSync(f.outputDir).map(name => readFileSync(join(f.outputDir, name), "utf8")).join("\n");
  assert(!files.includes("test-only-sentinel"));
  await assert.rejects(run(f), /Run is frozen/);
});

test("transport failures are terminal with full reserved accounting and zero retries", async t => {
  const f = fixture(t, { count: 1 }); await ready(f);
  let calls = 0;
  const result = await run(f, { fetchImpl: async () => { calls++; throw new Error("private provider details must not escape"); } });
  assert.equal(calls, 1); assert.deepEqual(result.failedCases, ["CASE0"]);
  assert.equal(result.accountedUSD, f.manifest.budget.reservedUSD); assert.equal(result.estimatedUSD, null);
  assert(!readFileSync(join(f.outputDir, "CASE0-raw.json"), "utf8").includes("private provider details"));
  assert.equal(ledgerState(f.budget).obligationsUSD, f.manifest.budget.reservedUSD);
});

test("a completed call resumes after a finalization interruption without redispatch or duplicate accounting", async t => {
  const f = fixture(t, { count: 1 }); await ready(f);
  let calls = 0;
  await assert.rejects(run(f, { fetchImpl: async () => { calls++; return response(); }, progress() { throw new Error("simulate finalization interruption"); } }), /simulate finalization interruption/);
  const before = ledgerState(f.budget).obligationsUSD;
  const result = await run(f, { fetchImpl: async () => { calls++; return response(); } });
  assert.equal(calls, 1); assert.equal(result.providerCalls, 1); assert.equal(ledgerState(f.budget).obligationsUSD, before);
});

test("incomplete previously started call blocks every further dispatch and retains full reservation", async t => {
  const f = fixture(t); await ready(f);
  const cases = f.messages.map(row => { const body = buildRequest(row.message, "candidate"); return { id: row.id, reservedUSD: reserveUSD(body), requestSHA256: sha256(JSON.stringify(body)) }; });
  mkdirSync(f.budget.ledgerPath);
  save(join(f.budget.ledgerPath, `${f.manifest.runId}-reservation.json`), { type: "run-reservation", runId: f.manifest.runId, budgetSHA256: f.budget.sha256, manifestSHA256: sha256(readFileSync(join(f.outputDir, "manifest.json"))), cases, reservedUSD: cases.reduce((n, row) => n + row.reservedUSD, 0) });
  save(join(f.budget.ledgerPath, `${f.manifest.runId}-CASE0-start.json`), { type: "call-start", runId: f.manifest.runId, id: "CASE0", requestSHA256: cases[0].requestSHA256 });
  let calls = 0;
  await assert.rejects(run(f, { fetchImpl: async () => { calls++; return response(); } }), /Previously started CASE0 is incomplete/);
  assert.equal(calls, 0); assert.equal(ledgerState(f.budget).obligationsUSD, f.manifest.budget.reservedUSD);
});

test("full reservations share an atomic ledger, preventing concurrent runs from overcommitting", async t => {
  const f = fixture(t, { count: 1, allocationUSD: .45 }); await ready(f);
  const second = { ...f, outputDir: join(f.root, "baseline") };
  plan({ root: f.root, outputDir: second.outputDir, messagesPath: join(f.root, "messages.json"), budgetPath: join(f.root, "budget.json"), arm: "baseline" });
  await ready(second);
  let finish, started;
  const began = new Promise(resolve => { started = resolve; });
  const pending = run(f, { fetchImpl: async () => { started(); return new Promise(resolve => { finish = () => resolve(response()); }); } });
  await began;
  let calls = 0;
  await assert.rejects(run(second, { fetchImpl: async () => { calls++; return response(); } }), /Insufficient shared allocation/);
  assert.equal(calls, 0); finish(); await pending;
});

test("changed accounting evidence or input stops before generation", async t => {
  const f = fixture(t); await ready(f);
  save(join(f.root, "accounting.json"), { reconciled: false });
  let calls = 0;
  await assert.rejects(run(f, { fetchImpl: async () => { calls++; return response(); } }), /Budget source changed/);
  assert.equal(calls, 0);
});

test("tampered completed artifacts cannot be used to resume", async t => {
  const f = fixture(t, { count: 1 }); await ready(f); await run(f);
  unlinkSync(join(f.outputDir, "generation-complete.json"));
  save(join(f.outputDir, "CASE0-raw.json"), { altered: true });
  await assert.rejects(run(f), /Expected values to be strictly equal/);
});

test("usage without trustworthy token fields keeps the full reserve", () => {
  for (const usage of [null, { input_tokens: -1, output_tokens: 1 }, { input_tokens: 1.5, output_tokens: 1 }, { input_tokens: 1 }]) assert.deepEqual(accountUsage(usage, .3), { estimatedUSD: null, accountedUSD: .3, usageKnown: false });
  assert.equal(accountUsage({ input_tokens: 100, output_tokens: 40 }, .3).accountedUSD, .004);
});

test("unsupported model capability fails preflight without generation or an access receipt", async t => {
  const f = fixture(t);
  let calls = 0;
  await assert.rejects(preflight({ ...f, apiKey: "test-only-sentinel", fetchImpl: async url => {
    calls++; assert(url.includes("/v1/models/"));
    return new Response(JSON.stringify({ id: SETTINGS.model, capabilities: {} }), { status: 200 });
  } }), /Low effort support was not confirmed/);
  assert.equal(calls, 1); assert(!readdirSync(f.outputDir).includes("preflight.json"));
  await assert.rejects(run(f), /ENOENT/);
});

test("provider rejection is a terminal one-call error with a full prospective charge", async t => {
  const f = fixture(t, { count: 1 }); await ready(f);
  let calls = 0;
  const result = await run(f, { fetchImpl: async () => { calls++; return new Response("Rate limited", { status: 429 }); } });
  assert.equal(calls, 1); assert.deepEqual(result.failedCases, ["CASE0"]);
  assert.equal(result.accountedUSD, f.manifest.budget.reservedUSD);
});

test("an outstanding shared budget lock prevents dispatch without clearing another owner's lock", async t => {
  const f = fixture(t); await ready(f);
  mkdirSync(join(f.budget.ledgerPath, ".lock"), { recursive: true });
  let calls = 0;
  await assert.rejects(run(f, { fetchImpl: async () => { calls++; return response(); } }), /Shared budget is locked/);
  assert.equal(calls, 0); assert(readdirSync(f.budget.ledgerPath).includes(".lock"));
});
