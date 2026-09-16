import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Socket } from "node:net";
import { reconstructOnsetArchive, onsetCases, makeOnsetPlan, validateOnsetPlan, onsetReservation, onsetCost, onsetReview, onsetRow, runOnsetRows, summarizeOnset, inspectOnsetArtifacts, executeOnsetCall, main, type OnsetPlan } from "../scripts/onset-judge-study.ts";
import { graphJudgeInstructions } from "../src/disposition/graph-prompts.ts";
import { GRAPH_VERSION, graphJudgeSchema, graphRequestSettings } from "../src/disposition/clinical-graph.ts";
import { sha256 } from "../src/evidence/rag/model.ts";
import type { ModelTransportResult } from "../src/disposition/transport.ts";
const digest = (v: unknown) => sha256(JSON.stringify(v));
function archivedPlan(): OnsetPlan {
  const { fingerprint, ...plan } = JSON.parse(readFileSync("outputs/onset-judge-v23-plan-2026-09-14/manifest.json", "utf8")) as OnsetPlan & { fingerprint: string };
  assert.equal(fingerprint, "9c6367e5ab95cdaa8c1bfbda35b0172b059758991388d00ba1048c6315efb2db");
  assert.equal(digest(plan), fingerprint); assert.equal(plan.graphVersion, "evidence-graph/v23");
  return plan;
}
function raw(output: unknown = null, failure: string | null = null): ModelTransportResult {
  return { output, failure, usage: { inputTokens: 100, outputTokens: 20 }, durationMs: 10, transportTimings: { startResolvedMs: 1, objectResolvedMs: 7, usageResolvedMs: 8, finishReasonResolvedMs: 8, streamEndMs: 10 }, cacheUsage: { cachedInputTokens: null, cacheCreationInputTokens: null } };
}
function authoredReview(c: ReturnType<typeof onsetCases>[number], verdict = "pass") {
  const source = c.packet.units.find(u => u.id.startsWith("source:"))!;
  return { reviewScope: "draft-and-issued-question/v2", verdict: verdict === "pass" ? "accept" : "revise", earlyAction: "none", earlyCorrection: null,
    criteria: ["undertriage", "overtriage", "patient_grounding", "claim_support", "safety_net", "clarification_delay", "ownership"].map(id => ({ id, verdict: id === "patient_grounding" ? verdict : "pass", reason: "Synthetic contract control, not a clinical judgment.", anchors: [{ unit: id === "claim_support" ? source.id : "patient", quote: id === "claim_support" ? source.text.split("\n")[1] : c.patient.slice(0, 30) }] })),
    correction: verdict === "pass" ? "" : "Review the onset claim.", repairTargets: verdict === "pass" ? [] : ["redFlags"], evidenceQueries: [] };
}
test("exact final archived draft and last review packet reconstruct without verdict leakage", () => {
  const a = reconstructOnsetArchive();
  assert.equal(digest(a.originalPacket), "853e6f667c8faf3b5bf3077658631f4e0fef0d8143410ef54153ad9955217627");
  assert.equal(digest(a.draft), "325feb87fb82066c5bf5f4b2b6d16b315a0175ac6c0f803d49ae50a51123f960");
  const c = onsetCases(a)[0]; assert.deepEqual(c.draft, a.draft); assert.equal(c.patient, a.run.message);
  assert.deepEqual(c.packet, { ...a.originalPacket, contractFindings: [] });
  assert.equal(c.packet.units.filter(u => u.id.startsWith("source:")).length, 9);
  assert.doesNotMatch(JSON.stringify(c.packet), /manualAuditRequired|expected|historicalPacketHash|repairTargets|reviewInputBinding/);
});
test("six exact-source controls modify only declared patient/onset flag fields", () => {
  const cases = onsetCases(), baseline = cases[0]; assert.equal(cases.length, 6);
  assert.equal(cases.filter(c => c.target.expected === "fail").length, 5);
  for (const c of cases) {
    assert.ok(c.patient.endsWith("No new weakness or trouble speaking."));
    assert.ok(c.patient.includes(c.draft.redFlags[0].quote)); assert.equal(c.deferredCheck.status, "not_assessed");
    assert.deepEqual({ ...c.draft, redFlags: baseline.draft.redFlags }, baseline.draft);
    assert.deepEqual(c.draft.redFlags.slice(1), baseline.draft.redFlags.slice(1));
    assert.deepEqual(c.packet.units.filter(u => u.id.startsWith("source:")), baseline.packet.units.filter(u => u.id.startsWith("source:")));
    assert.deepEqual(c.packet.contractFindings, []); assert.equal(c.packetHash, digest(c.packet));
  }
  assert.match(cases[1].patient, /get worse gradually/); assert.match(cases[2].patient, /Last year my sister/);
  assert.match(cases[3].patient, /If it came on/); assert.match(cases[4].patient, /maximum intensity in ten seconds/);
  assert.equal(cases[5].draft.redFlags[0].concern, "Sudden or worst-ever headache");
});
test("archived full prompts/schema/settings remain exact, but cannot authorize newer source", () => {
  const p = archivedPlan(), frozen = { ...p, fingerprint: digest(p) };
  assert.notEqual(GRAPH_VERSION, "evidence-graph/v23");
  assert.throws(() => makeOnsetPlan(), /V23_STUDY_SOURCE_REQUIRED/);
  assert.throws(() => validateOnsetPlan(frozen), /V23_STUDY_SOURCE_REQUIRED/);
  assert.equal(p.instructions, graphJudgeInstructions("full")); assert.deepEqual(p.schema, graphJudgeSchema.toJSONSchema());
  assert.deepEqual(p.settings, graphRequestSettings("judge", p.config)); assert.equal(p.timeoutMs, 600_000);
  assert.equal(p.authorization.maximumCalls, 6); assert.equal(p.authorization.allocationInclusiveUSD, 4);
  for (const mutate of [
    (v: OnsetPlan) => { v.settings.modelSettings.maxRetries = 1; }, (v: OnsetPlan) => { v.instructions += " answer hint"; },
    (v: OnsetPlan) => { v.cases[0].packet.units[0].text += " drift"; }, (v: OnsetPlan) => { v.authorization.allocationInclusiveUSD = 5; },
    (v: OnsetPlan) => { v.archive.historicalPacketHash = "0".repeat(64); },
  ]) { const copy = structuredClone(p); mutate(copy); assert.throws(() => validateOnsetPlan({ ...copy, fingerprint: frozen.fingerprint }), /MANIFEST_FINGERPRINT_MISMATCH/); }
});
test("parseable failed provider outputs never become accepted reviews or catches", () => {
  const p = archivedPlan(), c = p.cases[0], j = authoredReview(c), e = raw(j, "INCOMPLETE_MODEL_STREAM");
  const before = structuredClone(e), failed = onsetReview(p, c, e);
  assert.equal(failed.validJudge, false); assert.equal(failed.failure, "INCOMPLETE_MODEL_STREAM"); assert.equal(failed.execution.output, null);
  assert.deepEqual(failed.execution.rawOutput, j); assert.deepEqual(e, before);
  const valid = onsetReview(p, c, raw(j)); assert.equal(valid.verdict, "accept");
  assert.equal(valid.execution.reviewInputBinding!.packetHash, c.packetHash); assert.equal(valid.targetCatch, "not_assessed_manual_review_required");
  const unrelated = onsetReview(p, p.cases[1], raw(authoredReview(p.cases[1], "fail")));
  assert.equal(unrelated.verdict, "revise"); assert.equal(unrelated.targetCatch, "not_assessed_manual_review_required");
  assert.equal(onsetCost(p, { inputTokens: null, outputTokens: 20 }), null);
  assert.equal(onsetCost(p, { inputTokens: 100, outputTokens: 20 }), 0.002);
});
test("six sequential calls retain failures and never retry or automatically promote", async t => {
  t.mock.method(console, "log", () => {}); const p = archivedPlan(), writes = new Map<string, unknown>(); let calls = 0, active = 0;
  const summary = await runOnsetRows(p, async c => { calls++; active++; assert.equal(active, 1); await Promise.resolve(); active--;
    return calls === 2 ? raw(authoredReview(c), "PROVIDER_RATE_LIMITED") : raw(authoredReview(c));
  }, (n, v) => { assert.equal(writes.has(n), false); writes.set(n, v); });
  assert.equal(calls, 6); assert.equal(summary.calls, 6); assert.equal(summary.failed, 1); assert.equal(summary.validJudges, 5);
  assert.equal(summary.runtimePromotion, "not_promoted"); assert.equal(summary.semanticAudit, "not_assessed");
  assert.throws(() => summarizeOnset(p, summary.rows.slice(1)), /ALL_SIX/);
  const tampered = structuredClone(summary.rows); tampered[1].status = "valid_review"; assert.throws(() => summarizeOnset(p, tampered), /ROW_OUTCOME/);
});
test("unknown usage consumes reservation; cap and interruption retain missing denominator", async t => {
  t.mock.method(console, "log", () => {}); const p = archivedPlan(), records = new Map<string, unknown>();
  const s = await runOnsetRows(p, async () => { throw new Error("unknown"); }, (n, v) => records.set(n, v));
  assert.equal(s.rows.length, 6); assert.ok(s.accountedInclusiveUSD <= 4);
  assert.equal(s.accountedInclusiveUSD, s.rows.filter(r => r.status !== "not_dispatched").reduce((sum, r) => sum + r.reservationUSD, 0));
  const d = mkdtempSync(join(tmpdir(), "onset-inspect-")); writeFileSync(join(d, "1-started.json"), JSON.stringify(records.get("1-started.json")));
  const inspected = inspectOnsetArtifacts(d, p); assert.equal(inspected.unfinished, 1); assert.equal(inspected.notDispatched, 5);
  assert.equal(inspected.accountedInclusiveUSD, onsetReservation(p, p.cases[0]));
  const excess = await runOnsetRows(p, async () => ({ ...raw(), usage: { inputTokens: 1_000_000, outputTokens: 20 } }), () => {});
  assert.equal(excess.calls, 1); assert.equal(excess.notDispatched, 5); assert.equal(excess.stopReason, "RESERVATION_BOUND_EXCEEDED");
});
test("historical plan/live refuse current source even with the correct old claim, without network", async t => {
  t.mock.method(console, "log", () => {}); let network = 0; t.mock.method(globalThis, "fetch", async () => { network++; throw new Error("NO_NETWORK"); });
  const d = mkdtempSync(join(tmpdir(), "onset-plan-")), output = join(d, "plan");
  await assert.rejects(main(["--plan", `--output=${output}`]), /V23_STUDY_SOURCE_REQUIRED/);
  const p = archivedPlan(), manifest = join(d, "archived-manifest.json"); writeFileSync(manifest, JSON.stringify({ ...p, fingerprint: digest(p) }));
  await assert.rejects(main(["--live", `--manifest=${manifest}`, `--output=${join(d, "live")}`, `--claim=${digest(p)}`]), /V23_STUDY_SOURCE_REQUIRED/);
  assert.equal(existsSync(output), false); assert.equal(existsSync(join(d, "live")), false);
  assert.equal(network, 0); assert.equal(existsSync(`${manifest}.consumed.json`), false);
});
test("real Mastra call sends only exact packet and current full settings; network is mocked", async t => {
  const key = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "offline-test-only";
  t.after(() => { if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key; });
  t.mock.method(console, "error", () => {}); let escaped = 0;
  t.mock.method(Socket.prototype, "connect", () => { escaped++; throw new Error("OFFLINE_SOCKET_BLOCKED"); });
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init); assert.equal(request.url, "https://api.openai.com/v1/responses");
    bodies.push(JSON.parse(await request.text())); return new Response(JSON.stringify({ error: { message: "offline request capture", type: "invalid_request_error" } }), { status: 400, headers: { "content-type": "application/json" } });
  });
  const p = archivedPlan(), result = await executeOnsetCall(p, p.cases[0]);
  assert.ok(result.failure); assert.equal(bodies.length, 1); assert.equal(escaped, 0);
  assert.equal(bodies[0].model, "gpt-6-astra"); assert.equal(bodies[0].max_output_tokens, 6144);
  assert.deepEqual(bodies[0].reasoning, { effort: "low" }); assert.equal(bodies[0].stream, true);
  const strings = (value: unknown): string[] => typeof value === "string" ? [value] : value && typeof value === "object" ? Object.values(value).flatMap(strings) : [];
  assert.ok(strings(bodies[0].input).includes(JSON.stringify(p.cases[0].packet)));
  const input = JSON.stringify(bodies[0].input);
  assert.doesNotMatch(input, /manualAuditRequired|historicalPacketHash|expected/);
});
