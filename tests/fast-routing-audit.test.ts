import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Socket } from "node:net";
import { FAST_AUDIT, fastAuditPacket, makeFastAuditPlan, validateFastAuditPlan, fastAuditReservation, fastAuditResult, summarizeFastAudit, runFastAudit, inspectFastAudit, executeFastAudit, main, type FastAuditPlan, type FastAuditCase } from "../scripts/fast-routing-audit.ts";
import { sha256 } from "../src/evidence/rag/model.ts";
import type { DispositionRun } from "../src/disposition/contract.ts";
import type { ModelTransportResult } from "../src/disposition/transport.ts";
const digest = (v: unknown) => sha256(JSON.stringify(v));
const originalPath = "outputs/clinical-lift-v23-gui-2026-09-14/phase5/runs/17e17bf6-2fa6-4fd4-9d26-8605e7a7fef1.json";
const archived = () => JSON.parse(readFileSync(originalPath, "utf8")) as DispositionRun;
function fixture(modes = ["complete", "withheld", "unstarted", "unfinished"] as const) {
  const directory = mkdtempSync(join(tmpdir(), "fast-audit-input-")), run = archived();
  const cases = modes.map((_, i) => ({ id: `C${String(i + 1).padStart(2, "0")}`, message: run.message, inputHash: run.inputHash }));
  const manifest = { protocol: "fast-routing-http/v1", cases, reservation: { perRunUSD: 1 }, authorization: { priorAccountedUSD: FAST_AUDIT.minimumPriorUSD }, promptHash: run.promptHash };
  const fingerprint = digest(manifest); writeFileSync(join(directory, "manifest.json"), JSON.stringify({ ...manifest, fingerprint }));
  let starts = 0, results = 0, accountedUSD = 0;
  modes.forEach((mode, i) => {
    const c = cases[i], prefix = join(directory, `${String(i + 1).padStart(2, "0")}-${c.id}`);
    if (mode === "unstarted") return;
    starts++; writeFileSync(`${prefix}-started.json`, JSON.stringify({ index: i + 1, id: c.id, inputHash: c.inputHash }));
    if (mode === "unfinished") { accountedUSD += 1; return; }
    const value = structuredClone(run);
    if (mode === "withheld") { value.status = "review_required"; value.failure = "CLINICIAN_REVIEW_REQUIRED"; value.rejectedAnswer = JSON.parse(fastAuditPacket(run).packet.units.find(u => u.id === "draft")!.text); value.answer = null; value.answerHash = null; }
    writeFileSync(`${prefix}-run.json`, JSON.stringify(value));
    writeFileSync(`${prefix}-result.json`, JSON.stringify({ index: i + 1, id: c.id, run: value, failure: null, identityFailures: [], receipts: value.responseEvents!.map(event => ({ phase: "published", event })), accountedUSD: 0.3 }));
    results++; accountedUSD += 0.3;
  });
  writeFileSync(join(directory, "summary.json"), JSON.stringify({ fingerprint, planned: cases.length, starts, results, accountedUSD, totalAccountedUSD: manifest.authorization.priorAccountedUSD + accountedUSD }));
  return { directory, prior: manifest.authorization.priorAccountedUSD + accountedUSD };
}
function plan() { const f = fixture(); return makeFastAuditPlan(f.directory, f.prior); }
function raw(output: unknown = null, failure: string | null = null): ModelTransportResult { return { output, failure, durationMs: 20, usage: { inputTokens: 100, outputTokens: 20 }, transportTimings: { startResolvedMs: 1, objectResolvedMs: 17, usageResolvedMs: 18, finishReasonResolvedMs: 18, streamEndMs: 20 }, cacheUsage: { cachedInputTokens: null, cacheCreationInputTokens: null } }; }
function review(c: FastAuditCase) {
  const patient = c.packet!.units.find(u => u.id === "patient")!, source = c.packet!.units.find(u => u.id.startsWith("source:"))!;
  return { reviewScope: "draft-and-issued-question/v2", verdict: "accept", earlyAction: c.packet!.hasIssuedEarlyAction ? "supported" : "none", earlyCorrection: null, correction: "", repairTargets: [], evidenceQueries: [],
    criteria: ["undertriage", "overtriage", "patient_grounding", "claim_support", "safety_net", "clarification_delay", "ownership"].map(id => ({ id, verdict: "pass", reason: "Synthetic contract response, not clinical review.", anchors: [{ unit: id === "claim_support" ? source.id : "patient", quote: id === "claim_support" ? source.text.split("\n")[1].slice(0, 30) : patient.text.slice(0, 30) }] })) };
}
test("actual final repaired producer is audited, with no historical verdicts or labels in packet", () => {
  const run = archived(), before = JSON.stringify(run), p = fastAuditPacket(run), d = JSON.parse(p.packet.units.find(u => u.id === "draft")!.text);
  assert.equal(p.draftHash, run.graph!.repair!.resultDraftHash); assert.equal(d.patientMessage, run.answer!.patientMessage); assert.equal(p.reviewedArtifact, "published_final");
  assert.doesNotMatch(JSON.stringify(p.packet), /"criteria":|repairTargets|"reference":|historicalPacketHash|clinicalApproval/);
  assert.equal(JSON.stringify(run), before);
  const tampered = structuredClone(run); tampered.answer!.patientMessage += " unbound edit"; assert.throws(() => fastAuditPacket(tampered), /FINAL_ANSWER/);
});
test("every source row stays in denominators and withheld acceptance cannot become completion", () => {
  const p = plan(); assert.equal(p.cases.length, 4); assert.equal(p.cases.filter(c => c.packet).length, 2);
  assert.equal(p.cases[1].reviewedArtifact, "withheld_draft_diagnostic_only"); assert.equal(p.cases[1].generationComplete, false);
  const rows = p.cases.map(c => fastAuditResult(p, c, c.packet ? raw(review(c)) : null));
  const s = summarizeFastAudit(p, rows, null); assert.equal(s.validReviews, 2); assert.equal(s.completedAndAccepted, 1); assert.equal(s.unavailable, 2); assert.equal(s.generationComplete, 1);
  assert.throws(() => summarizeFastAudit(p, rows.slice(1), null), /ALL_GENERATION_CASES/);
});
test("audit reconstruction failure does not rewrite the source completion count", () => {
  const f = fixture(), prefix = join(f.directory, "01-C01"), run = JSON.parse(readFileSync(`${prefix}-run.json`, "utf8")), result = JSON.parse(readFileSync(`${prefix}-result.json`, "utf8"));
  run.agents.at(-1).reviewInputBinding.draftHash = "0".repeat(64); result.run = run;
  writeFileSync(`${prefix}-run.json`, JSON.stringify(run)); writeFileSync(`${prefix}-result.json`, JSON.stringify(result));
  const p = makeFastAuditPlan(f.directory, f.prior); assert.equal(p.cases[0].generationComplete, true); assert.equal(p.cases[0].packet, null); assert.equal(p.cases[0].unavailable, "FINAL_PRODUCER_BINDING_FAILED");
});
test("Astra configuration is independent of live judge; prompts/schema/source/accounting are frozen", () => {
  const p = plan(), frozen = { ...p, fingerprint: digest(p) }; assert.deepEqual(validateFastAuditPlan(frozen), p);
  assert.equal(p.model, "openai/gpt-6-astra"); assert.equal(p.config.judgeStyle, "full"); assert.equal(p.settings.modelSettings.maxRetries, 0); assert.equal(p.timeoutMs, 600_000);
  for (const mutate of [(v: FastAuditPlan) => { v.instructions += " leaked expected label"; }, (v: FastAuditPlan) => { v.cases[0].packet!.units[0].text += " mismatch"; }, (v: FastAuditPlan) => { v.settings.modelSettings.maxRetries = 1; }]) {
    const copy = structuredClone(p); mutate(copy); assert.throws(() => validateFastAuditPlan({ ...copy, fingerprint: digest(copy) }), /AUDIT_FROZEN/);
  }
  const f = fixture(); assert.throws(() => makeFastAuditPlan(f.directory, f.prior - 0.1), /AUTHORITY/); assert.throws(() => makeFastAuditPlan(f.directory, 190), /AUTHORITY/); assert.throws(() => makeFastAuditPlan(f.directory, f.prior, 21), /AUTHORITY/);
});
test("emitted early advice and question are bound; multiple actions cannot be silently reduced", () => {
  const r = archived(); r.responseEvents = [{ kind: "action", notice: { disposition: "SAME_DAY_IN_PERSON", directive: "Seek in-person evaluation today.", source: "emergency_agent" }, elapsedMs: 30 }];
  const p = fastAuditPacket(r); assert.equal(p.packet.hasIssuedEarlyAction, true); assert.match(p.packet.units.find(u => u.id === "early")!.text, /Seek in-person evaluation today/);
  r.responseEvents.push({ ...r.responseEvents[0] }); assert.throws(() => fastAuditPacket(r), /MULTIPLE_ISSUED_ACTIONS/);
  const f = fixture(); const path = join(f.directory, "01-C01-result.json"), result = JSON.parse(readFileSync(path, "utf8"));
  result.receipts.push({ phase: "published", event: r.responseEvents[0] }); writeFileSync(path, JSON.stringify(result)); assert.throws(() => makeFastAuditPlan(f.directory, f.prior), /PUBLISHED_EARLY/);
});
test("parseable provider failures remain failures, raw output and exact packet bindings survive", () => {
  const p = plan(), c = p.cases[0], j = review(c), result = fastAuditResult(p, c, raw(j, "INCOMPLETE_MODEL_STREAM"));
  assert.equal(result.status, "audit_failed"); assert.equal(result.verdict, null); assert.deepEqual(result.execution!.rawOutput, j); assert.equal(result.execution!.output, null);
  assert.equal(result.execution!.reviewInputBinding!.packetHash, c.packetHash); assert.equal(result.raw!.output, j); assert.equal(result.accountedUSD, 0.0025);
});
test("single sequential attempts, unknown reservation, interruption and tamper accounting", async () => {
  const p = plan(), writes = new Map<string, unknown>(); let active = 0, calls = 0;
  const s = await runFastAudit(p, async c => { calls++; active++; assert.equal(active, 1); await Promise.resolve(); active--; return calls === 1 ? raw(review(c)) : raw(null, "MODEL_FAILED"); }, (name, value) => { assert.equal(writes.has(name), false); writes.set(name, value); });
  assert.equal(calls, 2); assert.equal(s.failed, 1); assert.equal(s.promotion, "not_promoted");
  const d = mkdtempSync(join(tmpdir(), "fast-audit-inspect-")); writeFileSync(join(d, "01-C01-started.json"), JSON.stringify(writes.get("01-C01-started.json")));
  const inspected = inspectFastAudit(d, p); assert.equal(inspected.unfinished, 1); assert.equal(inspected.accountedUSD, fastAuditReservation(p, p.cases[0]));
  const limited = { ...p, authorization: { ...p.authorization, allocationUSD: fastAuditReservation(p, p.cases[0]) + 0.001 } };
  const stopped = await runFastAudit(limited, async () => { throw new Error("unknown"); }, () => {}); assert.equal(stopped.calls, 1); assert.equal(stopped.notDispatched, 1); assert.equal(stopped.unavailable, 2);
  const altered = structuredClone(s.rows); altered[0].accountedUSD = 0; assert.throws(() => summarizeFastAudit(p, altered, null), /ACCOUNTING_MISMATCH/);
});
test("keyless planning and incorrect claim cannot dispatch or consume a plan", async t => {
  t.mock.method(console, "log", () => {}); let requests = 0; t.mock.method(globalThis, "fetch", async () => { requests++; throw new Error("NO_NETWORK"); });
  const f = fixture(), directory = mkdtempSync(join(tmpdir(), "fast-audit-plan-")), output = join(directory, "plan");
  await main(["--plan", `--study=${f.directory}`, `--prior-accounted-usd=${f.prior}`, `--output=${output}`]);
  const manifest = join(output, "manifest.json"); assert.ok(existsSync(manifest));
  await assert.rejects(main(["--live", `--manifest=${manifest}`, `--output=${join(directory, "live")}`, "--claim=wrong"]), /EXACT_AUDIT_CLAIM/);
  assert.equal(requests, 0); assert.equal(existsSync(`${manifest}.consumed.json`), false);
});
test("real adapter uses frozen full Astra request only; network mocked and socket escapes blocked", async t => {
  const old = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "offline-test"; t.after(() => { if (old === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = old; });
  t.mock.method(console, "error", () => {}); let escaped = 0; t.mock.method(Socket.prototype, "connect", () => { escaped++; throw new Error("OFFLINE_SOCKET"); });
  const requests: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => { const r = input instanceof Request ? input : new Request(input, init); assert.equal(r.url, "https://api.openai.com/v1/responses"); requests.push(JSON.parse(await r.text())); return new Response(JSON.stringify({ error: { message: "mock", type: "invalid_request_error" } }), { status: 400, headers: { "Content-Type": "application/json" } }); });
  const p = plan(), result = await executeFastAudit(p, p.cases[0]); assert.ok(result.failure); assert.equal(requests.length, 1); assert.equal(escaped, 0);
  assert.equal(requests[0].model, "gpt-6-astra"); assert.equal(requests[0].max_output_tokens, 6144); assert.deepEqual(requests[0].reasoning, { effort: "low" });
  const text = JSON.stringify(requests[0].input); assert.ok(text.includes(JSON.stringify(p.cases[0].packet).slice(1, 20).replaceAll('"', '\\"'))); assert.doesNotMatch(text, /generationComplete|withheld_draft_diagnostic_only|clinicalApproval/);
});
