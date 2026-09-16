import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Socket } from "node:net";
import { buildMobilityManifest, validateMobilityManifest, mobilityCost, mobilityReservation, mobilityRow, summarizeMobility, runMobilityRows, executeMobilityCall, inspectMobilityArtifacts, main, type MobilityManifest } from "../scripts/safety-mobility-study.ts";
import { GRAPH_VERSION, graphRequestSettings, safetySchema } from "../src/disposition/clinical-graph.ts";
import { graphSafetyInstructions } from "../src/disposition/graph-prompts.ts";
import { resolveGraphConfig } from "../src/disposition/graph-config.ts";
import { SAFETY_MOBILITY_POLICY } from "../src/disposition/safety-mobility-policy.ts";
import type { ModelTransportResult } from "../src/disposition/transport.ts";

const eligible = GRAPH_VERSION === "evidence-graph/v23" && !graphSafetyInstructions("full").includes(SAFETY_MOBILITY_POLICY.instruction);
const fixedTest = (name: string, fn: (t: test.TestContext) => void | Promise<void>) => test(name, { skip: !eligible && "Historical pre-promotion baseline required; execute fixed study tests in their frozen source tree." }, fn);
function execution(action = "NONE", message = "", failure: string | null = null): ModelTransportResult {
  return { output: { action, basis: action === "NONE" ? [] : [{ quote: message, interpretation: "Current injury prevents safe mobilization.", present: true, currentPatient: true }], actionBasis: action === "NONE" ? null : { indices: [0], sufficient: true }, reason: "Synthetic transport and admission fixture only.", patientMessage: "", physicalRequirement: action === "SAME_DAY_IN_PERSON" ? "Reported injury needs direct physical assessment." : null, activeEms: null },
    usage: { inputTokens: failure ? null : 100, outputTokens: failure ? null : 20 }, failure, durationMs: 10,
    transportTimings: { startResolvedMs: 1, objectResolvedMs: 8, usageResolvedMs: 9, finishReasonResolvedMs: 9, streamEndMs: 10 }, cacheUsage: { cachedInputTokens: null, cacheCreationInputTokens: null } };
}

test("mobility study cannot reinterpret a promoted or newer baseline", () => {
  if (!eligible) assert.throws(() => buildMobilityManifest(), /V23_BASELINE_REQUIRED|UNPROMOTED_FULL_HAIKU_BASELINE_REQUIRED/);
});
fixedTest("seven fixed packets include current proxy reports and only the explicit policy differs", () => {
  const m = buildMobilityManifest();
  assert.equal(m.cases.length, 7); assert.equal(m.schedule.length, 28);
  assert.equal(m.cases.filter(c => c.positive).length, 3);
  assert.deepEqual(m.cases.find(c => c.id === "current-caregiver-proxy")!.acceptedActions, ["EMS_NOW"]);
  assert.equal(m.prompts.baseline, graphSafetyInstructions("full"));
  assert.equal(m.prompts.mobility, m.prompts.baseline + "\n" + SAFETY_MOBILITY_POLICY.instruction);
  assert.deepEqual(m.schema, safetySchema.toJSONSchema());
  assert.deepEqual(m.settings, graphRequestSettings("safety", resolveGraphConfig({})));
  assert.equal(m.model, "anthropic/claude-haiku-4-5"); assert.equal(m.retrieval, "not_used");
  assert.equal(m.authorization.maximumInclusiveUSD, 1); assert.equal(m.authorization.maximumCalls, 28);
  assert.ok(readFileSync("data/patient_messages.csv", "utf8").includes(m.cases[0].message));
  for (const c of m.cases) {
    assert.deepEqual(JSON.parse(c.input), { patient: c.message });
    assert.doesNotMatch(c.input, /acceptedActions|positive|provenance|EMS_NOW/);
    const schedule = m.schedule.filter(r => r.id === c.id);
    assert.equal(schedule.length, 4);
    assert.deepEqual(schedule.slice(0, 2).map(r => r.arm), schedule.slice(2).map(r => r.arm).reverse());
  }
});
fixedTest("manifest changes cannot alter patient, policy, schema, settings, target or allocation", () => {
  const manifest = buildMobilityManifest();
  assert.deepEqual(validateMobilityManifest(JSON.parse(JSON.stringify(manifest))), manifest);
  for (const change of [
    (m: MobilityManifest) => { m.prompts.mobility += " changed"; },
    (m: MobilityManifest) => { m.cases[0].message += " changed"; },
    (m: MobilityManifest) => { m.settings.modelSettings.maxRetries = 1; },
    (m: MobilityManifest) => { m.authorization.maximumInclusiveUSD = 2; },
    (m: MobilityManifest) => { m.implementationHashes["src/disposition/clinical-graph.ts"] = "changed"; },
  ]) {
    const changed = structuredClone(manifest); change(changed);
    assert.throws(() => validateMobilityManifest(changed), /FROZEN_MOBILITY_STUDY_DRIFT/);
  }
});
fixedTest("inclusive accounting preserves unknown usage and ED is not silently equated with EMS", () => {
  const m = buildMobilityManifest(), entry = m.schedule[0], c = m.cases[0];
  assert.equal(mobilityCost(m, { inputTokens: 100, outputTokens: 20 }), 0.00025);
  assert.equal(mobilityCost(m, { inputTokens: null, outputTokens: 20 }), null);
  assert.equal(mobilityCost(m, { inputTokens: -1, outputTokens: 20 }), null);
  assert.ok(mobilityReservation(m, c.input, entry.arm) > 0.00625);
  const ed = mobilityRow(m, entry, execution("ED_NOW", c.message), 0.00025);
  assert.equal(ed.emergencySettingPreserved, true); assert.equal(ed.transport, "ed_now"); assert.equal(ed.matchedAuthoredTarget, false);
  const ems = mobilityRow(m, entry, execution("EMS_NOW", c.message), 0.00025);
  assert.equal(ems.matchedAuthoredTarget, true); assert.equal(ems.transport, "activate_ems");
  const invented = execution("EMS_NOW", "Patient quote fabricated by fixture");
  assert.equal(mobilityRow(m, entry, invented, 0.00025).matchedAuthoredTarget, false);
});
fixedTest("all 28 rows retain provider failure and failed admission without retry or inflated denominator", async t => {
  t.mock.method(console, "log", () => {});
  const m = buildMobilityManifest(), records = new Map<string, unknown>(); let calls = 0;
  const summary = await runMobilityRows(m, async (manifest, entry) => {
    calls++; const c = manifest.cases.find(c => c.id === entry.id)!;
    if (calls === 2) return execution("NONE", "", "PROVIDER_RATE_LIMITED");
    if (calls === 3) return execution("EMS_NOW", "fabricated patient phrase");
    return execution(c.positive ? "EMS_NOW" : "NONE", c.message);
  }, (name, value) => { assert.equal(records.has(name), false); records.set(name, value); });
  assert.equal(calls, 28); assert.equal(summary.calls, 28); assert.equal(summary.clinicalApproval, false); assert.equal(summary.runtimePromotion, "not_promoted");
  assert.equal([...records.keys()].filter(k => k.endsWith("-result.json")).length, 28);
  assert.equal([...records.keys()].filter(k => k.endsWith("-started.json")).length, 28);
  const rows = m.schedule.map(e => records.get(`${e.index}-result.json`) as ReturnType<typeof mobilityRow>);
  assert.equal(rows[1].status, "provider_failed"); assert.equal(rows[1].estimatedInclusiveUSD, null);
  assert.equal(rows[2].admission?.admission.status, "rejected"); assert.equal(rows[2].matchedAuthoredTarget, false);
  assert.throws(() => summarizeMobility(m, rows.slice(1)), /ALL_SCHEDULE_ROWS_REQUIRED/);
  const tampered = structuredClone(rows); tampered[2].matchedAuthoredTarget = true;
  assert.throws(() => summarizeMobility(m, tampered), /ROW_BINDING_OR_OUTCOME_MISMATCH/);
  const undercount = structuredClone(rows); undercount[0].accountedUSD = 0;
  assert.throws(() => summarizeMobility(m, undercount), /ROW_ACCOUNTING_MISMATCH/);
});
fixedTest("unknown usage retains reservations and a tighter test cap exercises the pre-dispatch stop", async t => {
  t.mock.method(console, "log", () => {});
  const m = buildMobilityManifest(), records = new Map<string, unknown>(); let calls = 0;
  const summary = await runMobilityRows(m, async () => { calls++; throw new Error("Synthetic dispatch failure"); }, (name, value) => { records.set(name, value); });
  assert.ok(summary.accountedUSD <= 1); assert.equal([...records.keys()].filter(k => k.endsWith("-result.json")).length, 28);
  assert.equal(summary.calls, calls); assert.ok(calls > 0 && calls <= 28);
  if (calls < 28) { assert.equal(summary.stopReason, "STUDY_ALLOCATION_EXHAUSTED"); assert.equal((records.get(`${calls + 1}-result.json`) as ReturnType<typeof mobilityRow>).status, "not_dispatched"); }
  // Pure helper fault injection only. The CLI rejects any changed $1 manifest.
  const tighter = structuredClone(m), boundedRecords = new Map<string, unknown>();
  tighter.authorization.maximumInclusiveUSD = mobilityReservation(m, m.cases[0].input, m.schedule[0].arm) * 1.5;
  let boundedCalls = 0;
  const stopped = await runMobilityRows(tighter, async () => { boundedCalls++; throw new Error("Unknown usage fixture"); }, (name, value) => { boundedRecords.set(name, value); });
  assert.equal(boundedCalls, 1); assert.equal(stopped.stopReason, "STUDY_ALLOCATION_EXHAUSTED");
  assert.equal(stopped.plannedCalls, 28); assert.ok(stopped.accountedUSD <= tighter.authorization.maximumInclusiveUSD);
  assert.equal((boundedRecords.get("2-result.json") as ReturnType<typeof mobilityRow>).status, "not_dispatched");
  assert.equal(boundedRecords.has("2-started.json"), false);
});
fixedTest("a broken reservation bound stops immediately and interruption inspection retains unknown spend", async t => {
  t.mock.method(console, "log", () => {});
  const m = buildMobilityManifest(), records = new Map<string, unknown>(); let calls = 0;
  const summary = await runMobilityRows(m, async () => { calls++; return { ...execution(), usage: { inputTokens: 100_000, outputTokens: 10 } }; }, (name, value) => { records.set(name, value); });
  assert.equal(calls, 1); assert.equal(summary.stopReason, "RESERVATION_BOUND_EXCEEDED");
  assert.equal((records.get("2-result.json") as ReturnType<typeof mobilityRow>).status, "not_dispatched");
  const directory = mkdtempSync(join(tmpdir(), "mobility-interrupted-"));
  writeFileSync(join(directory, "manifest.json"), JSON.stringify(m));
  writeFileSync(join(directory, "1-started.json"), JSON.stringify(records.get("1-started.json")));
  const inspected = inspectMobilityArtifacts(directory);
  assert.equal(inspected.planned, 28); assert.equal(inspected.unfinishedStarted, 1); assert.equal(inspected.missingResults, 28);
  assert.equal(inspected.studyComplete, false); assert.equal(inspected.runtimePromotion, "not_promoted");
  assert.equal(inspected.accountedInclusiveUSD, mobilityReservation(m, m.cases[0].input, m.schedule[0].arm));
  const invalidDirectory = mkdtempSync(join(tmpdir(), "mobility-invalid-state-"));
  writeFileSync(join(invalidDirectory, "manifest.json"), JSON.stringify(m));
  writeFileSync(join(invalidDirectory, "1-started.json"), JSON.stringify(records.get("1-started.json")));
  writeFileSync(join(invalidDirectory, "1-result.json"), JSON.stringify({ ...(records.get("1-result.json") as object), status: "invented_success" }));
  assert.throws(() => inspectMobilityArtifacts(invalidDirectory), /ARCHIVED_ROW_STATE_INVALID/);
  writeFileSync(join(invalidDirectory, "1-result.json"), JSON.stringify({ ...(records.get("1-result.json") as object), status: "completed", execution: null }));
  assert.throws(() => inspectMobilityArtifacts(invalidDirectory), /ARCHIVED_ROW_STATE_INVALID/);
  const changed = { ...(records.get("1-started.json") as object), inputHash: "wrong-patient" };
  writeFileSync(join(directory, "1-started.json"), JSON.stringify(changed));
  assert.throws(() => inspectMobilityArtifacts(directory), /ARCHIVED_ROW_BINDING_FAILED/);
});
fixedTest("plan is zero-spend and dispatch requires exact prospective fingerprint", async t => {
  t.mock.method(console, "log", () => {});
  let calls = 0; t.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("NO_NETWORK"); });
  const directory = mkdtempSync(join(tmpdir(), "mobility-plan-")), output = join(directory, "plan");
  await main(["--plan", `--output=${output}`]);
  const manifestPath = join(output, "manifest.json");
  assert.ok(validateMobilityManifest(JSON.parse(readFileSync(manifestPath, "utf8"))));
  await assert.rejects(main(["--live", `--output=${join(directory, "live")}`, `--manifest=${manifestPath}`, "--approved-fingerprint=incorrect"]), /EXACT_MANIFEST_AUTHORIZATION_REQUIRED/);
  assert.equal(calls, 0); assert.equal(existsSync(join(directory, "live")), false); assert.equal(existsSync(`${manifestPath}.consumed.json`), false);
});
fixedTest("both arms use actual full Haiku wire settings and no external socket can escape", async t => {
  const previousKey = process.env.ANTHROPIC_API_KEY; process.env.ANTHROPIC_API_KEY = "offline-test-only";
  t.after(() => { if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = previousKey; });
  t.mock.method(console, "error", () => {});
  let escaped = 0; t.mock.method(Socket.prototype, "connect", () => { escaped++; throw new Error("OFFLINE_EXTERNAL_TRANSPORT_BLOCKED"); });
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    assert.equal(request.url, "https://api.anthropic.com/v1/messages"); assert.equal(request.method, "POST");
    bodies.push(JSON.parse(await request.text()));
    return new Response(JSON.stringify({ type: "error", error: { type: "offline_capture", message: "Blocked before network" } }), { status: 400, headers: { "content-type": "application/json" } });
  });
  const m = buildMobilityManifest();
  for (const entry of m.schedule.slice(0, 2)) { const result = await executeMobilityCall(m, entry); assert.ok(result.failure); assert.equal(result.output, null); }
  assert.equal(bodies.length, 2); assert.equal(escaped, 0);
  for (const body of bodies) { assert.equal(body.model, m.model.split("/")[1]); assert.equal(body.max_tokens, m.settings.modelSettings.maxOutputTokens); assert.equal(body.stream, true); assert.equal(body.thinking, undefined); }
  assert.deepEqual(bodies[0].output_config, bodies[1].output_config);
  assert.deepEqual(bodies[0].messages, bodies[1].messages);
  assert.notDeepEqual(bodies[0].system, bodies[1].system);
});
