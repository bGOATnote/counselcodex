import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { buildSerializationManifest, validateSerializationManifest, serializationCases, serializationSchedule, serializationReservation, serializationCost, claimSerializationStudy, summarizeSerialization, main, type SerializationManifest, type SerializationRow } from "../scripts/safety-serialization-study.ts";
import { graphSafetyInstructions } from "../src/disposition/graph-prompts.ts";
import { assessSafetyAdmission, GRAPH_VERSION, safetySchema } from "../src/disposition/clinical-graph.ts";
import { safetyContinuationCases } from "../src/evaluation/continuation-fixtures.ts";
import { Agent } from "@mastra/core/agent";

const frozenV22 = GRAPH_VERSION === "evidence-graph/v22";
const fixedTest = (name: string, fn: () => void | Promise<void>) => test(name, {
  skip: !frozenV22 && "Run runtime-coupled serialization tests in the recorded frozen v22 tree; never reinterpret historical packets with the current runtime.",
}, fn);

// Accounting and bookkeeping remain testable in newer trees without pretending
// this archived manifest is eligible for dispatch against the current runtime.
function archivedManifest(): SerializationManifest {
  const value = JSON.parse(readFileSync("outputs/safety-serialization-v22-plan-2026-09-14/manifest.json", "utf8")) as SerializationManifest;
  const { fingerprint, ...payload } = value;
  assert.equal(fingerprint, "5df18e50f13ba105ef5ff8611af2c161d1c05a87f56ffcd36e45c1645268c161");
  assert.equal(createHash("sha256").update(JSON.stringify(payload)).digest("hex"), fingerprint);
  assert.equal(value.graphVersion, "evidence-graph/v22");
  return value;
}

test("archived serialization registration stays pinned and newer runtimes refuse planning or dispatch", async () => {
  const manifest = archivedManifest();
  if (frozenV22) return;
  assert.throws(() => buildSerializationManifest(), /V22_BASELINE_REQUIRED/);
  assert.throws(() => validateSerializationManifest(manifest), /V22_BASELINE_REQUIRED/);
  const directory = mkdtempSync(join(tmpdir(), "safety-serialization-version-"));
  for (const mode of ["plan", "live"]) {
    const output = join(directory, mode);
    await assert.rejects(main([`--${mode}`, `--output=${output}`, "--manifest=outputs/safety-serialization-v22-plan-2026-09-14/manifest.json"]), /V22_BASELINE_REQUIRED/);
    assert.equal(existsSync(output), false, "version refusal must precede any output, allocation claim or provider dispatch");
  }
});

fixedTest("serialization study preserves the full schema and patient-only packets, with balanced two-trial pairs", () => {
  const manifest = buildSerializationManifest(), cases = serializationCases(), original = safetyContinuationCases();
  assert.equal(cases.length, 12); assert.equal(manifest.schedule.length, 48);
  assert.equal(manifest.prompts.baseline, graphSafetyInstructions("full"));
  assert.ok(manifest.prompts.succinct.startsWith(manifest.prompts.baseline));
  assert.match(manifest.prompts.succinct, /ALL preceding clinical, attribution, chronology and admission requirements/);
  assert.match(manifest.prompts.succinct, /complete exact current-patient\/current-episode active activation quote/);
  assert.deepEqual(manifest.schema, safetySchema.toJSONSchema());
  assert.equal(manifest.settings.maxRetries, 0); assert.equal(manifest.authorization.studyMaximumUSD, 1);
  for (const c of manifest.cases) {
    assert.deepEqual(JSON.parse(c.input), { patient: c.message });
    assert.doesNotMatch(c.input, /acceptedActions|provenance|targets|CONTINUE_EMS/);
    const source = original.find(row => row.id === c.id); if (source) assert.equal(c.message, source.message);
    const schedule = serializationSchedule(cases).filter(row => row.id === c.id);
    assert.equal(schedule.length, 4);
    assert.deepEqual(schedule.slice(0, 2).map(r => r.arm), schedule.slice(2).map(r => r.arm).reverse());
    assert.deepEqual([...new Set(schedule.map(r => r.trial))], [1, 2]);
  }
  assert.deepEqual(manifest.cases.find(c => c.id === "C02-active-ems")!.targets, [{ action: "CONTINUE_EMS", transport: "continue_ems" }]);
  assert.deepEqual(original.find(c => c.id === "C02-active-ems")!.acceptedActions, ["NONE"], "historical fixture must remain untouched");
});

fixedTest("frozen prompts, targets, budget and hashes cannot change between plan and dispatch", () => {
  const manifest = buildSerializationManifest();
  assert.deepEqual(validateSerializationManifest(JSON.parse(JSON.stringify(manifest))), manifest);
  for (const mutate of [
    (m: typeof manifest) => { m.prompts.succinct += " changed"; },
    (m: typeof manifest) => { m.authorization.studyMaximumUSD = 2; },
    (m: typeof manifest) => { m.cases[0].message += " changed"; },
    (m: typeof manifest) => { m.cases[0].acceptedActions = ["NONE"]; },
    (m: typeof manifest) => { m.implementationHashes["src/disposition/transport.ts"] = "changed"; },
  ]) {
    const changed = structuredClone(manifest); mutate(changed);
    assert.throws(() => validateSerializationManifest(changed), /FROZEN_STUDY_DRIFT/);
  }
});

test("archived serialization prices retain unknown usage and conservative reservations", () => {
  const manifest = archivedManifest();
  assert.equal(serializationCost(manifest, { inputTokens: null, outputTokens: 10 }), null);
  assert.equal(serializationCost(manifest, { inputTokens: 100, outputTokens: 20 }), 0.0002);
  for (const arm of ["baseline", "succinct"] as const) assert.ok(serializationReservation(manifest, manifest.cases[0].input, arm) > 0.005);
});

test("single-use study claims remain bound to the frozen manifest across new output or claim paths", () => {
  const directory = mkdtempSync(join(tmpdir(), "safety-serialization-claim-")), path = join(directory, "manifest.json"), manifest = archivedManifest();
  writeFileSync(path, JSON.stringify(manifest));
  claimSerializationStudy(path, join(directory, "first"), manifest, join(directory, "allocation.json"));
  assert.equal(existsSync(`${path}.consumed.json`), true);
  assert.throws(() => claimSerializationStudy(path, join(directory, "second"), manifest, join(directory, "new-allocation.json")));
  assert.equal(existsSync(join(directory, "new-allocation.json")), false);
});

test("missing, failed and mismatched attempts remain explicit in paired results", () => {
  const manifest = archivedManifest(), c = manifest.cases[0];
  function row(index: number, durationMs: number, failure: string | null): SerializationRow {
    const item = manifest.schedule[index - 1];
    return { ...item, inputHash: c.inputHash, instructionsHash: manifest.promptHashes[item.arm], observedTransport: null, estimatedUSD: failure ? null : 0.01, reservationUSD: 0.02, admissionElapsedMs: durationMs,
      admission: assessSafetyAdmission(null, c.message), matchedActionAndTransport: false,
      execution: { output: null, usage: { inputTokens: failure ? null : 10, outputTokens: failure ? null : 10 }, failure, durationMs,
        transportTimings: { startResolvedMs: 0, objectResolvedMs: null, usageResolvedMs: null, finishReasonResolvedMs: null, streamEndMs: null }, cacheUsage: { cachedInputTokens: null, cacheCreationInputTokens: null } } };
  }
  const baseline = row(1, 100, null), succinct = row(2, 50, "MODEL_TIMEOUT");
  const result = summarizeSerialization(manifest, [baseline, succinct]);
  assert.equal(result.missingSchedule.length, 46); assert.equal(result.paired[0].deltaMs, -50);
  assert.equal(result.medianPairedDeltaMsBothMatched, null); assert.equal(result.runtimePromotion, "not_promoted");
  assert.equal(result.clinicalApproval, false); assert.equal(result.arms.succinct.unknownCostAttempts, 1);
  assert.throws(() => summarizeSerialization(manifest, [baseline, baseline]), /DUPLICATE_STUDY_ATTEMPT/);
  assert.throws(() => summarizeSerialization(manifest, [baseline, { ...succinct, inputHash: "different" }]), /STUDY_PAIR_BINDING_MISMATCH/);
});

fixedTest("plan mode is zero-spend and live mode requires a previously frozen manifest", () => {
  const directory = mkdtempSync(join(tmpdir(), "safety-serialization-plan-")), output = join(directory, "plan");
  const planned = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/safety-serialization-study.ts", "--plan", `--output=${output}`], { encoding: "utf8", timeout: 15000, env: { ...process.env, ANTHROPIC_API_KEY: "", MASTRA_TELEMETRY_DISABLED: "true" } });
  assert.equal(planned.status, 0, planned.stderr); assert.match(planned.stdout, /"paidCalls":0/);
  assert.equal(readdirSync(output).length, 1); assert.ok(validateSerializationManifest(JSON.parse(readFileSync(join(output, "manifest.json"), "utf8"))));
  const unplanned = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/safety-serialization-study.ts", "--live", `--output=${join(directory, "live")}`], { encoding: "utf8", timeout: 15000 });
  assert.notEqual(unplanned.status, 0); assert.match(unplanned.stderr, /FROZEN_MANIFEST_REQUIRED/); assert.equal(existsSync(join(directory, "live")), false);
});

fixedTest("offline HTTP replay retains all 48 attempts, a provider failure and transport telemetry without retrying", async () => {
  const directory = mkdtempSync(join(tmpdir(), "safety-serialization-wire-")), manifest = buildSerializationManifest(), manifestPath = join(directory, "manifest.json"), output = join(directory, "live");
  writeFileSync(manifestPath, JSON.stringify(manifest));
  const previousFetch = globalThis.fetch, previousKey = process.env.ANTHROPIC_API_KEY, previousLog = console.log;
  let calls = 0, wireSchemaSnapshot: unknown;
  process.env.ANTHROPIC_API_KEY = "synthetic-never-sent";
  console.log = () => {};
  globalThis.fetch = async (input, init) => {
    calls++; assert.match(String(input), /^https:\/\/api\.anthropic\.com\/v1\/messages/);
    const request = JSON.parse(String(init?.body));
    const wireSchema = request.output_config?.format?.schema ?? request.output_format?.schema;
    assert.ok(wireSchema);
    // Anthropic's adapter converts unsupported numeric/length constraints to
    // descriptions. Compare actual wire schemas across arms, not draft dialects.
    assert.deepEqual(Object.keys(wireSchema.properties), Object.keys(manifest.schema.properties!));
    assert.equal(wireSchema.additionalProperties, false);
    if (wireSchemaSnapshot === undefined) wireSchemaSnapshot = wireSchema;
    else assert.deepEqual(wireSchema, wireSchemaSnapshot);
    if (calls === 2) return new Response(JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "Synthetic failure" } }), { status: 429, headers: { "content-type": "application/json" } });
    const value = { action: "NONE", basis: [], actionBasis: null, reason: "Synthetic transport fixture only.", patientMessage: "", physicalRequirement: null, activeEms: null };
    const events = [
      { type: "message_start", message: { id: `msg_offline_${calls}`, type: "message", role: "assistant", model: "claude-haiku-4-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 21, output_tokens: 0, cache_read_input_tokens: 13, cache_creation_input_tokens: 5 } } },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: JSON.stringify(value) } },
      { type: "content_block_stop", index: 0 },
      { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 34 } },
      { type: "message_stop" },
    ];
    return new Response(events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  try {
    await main(["--live", `--manifest=${manifestPath}`, `--output=${output}`]);
    assert.equal(calls, 48, "a failed call must not be retried");
    const summary = JSON.parse(readFileSync(join(output, "summary.json"), "utf8"));
    assert.equal(summary.calls, 48); assert.equal(summary.missingSchedule.length, 0); assert.equal(summary.unfinishedStartedAttempts, 0);
    assert.equal(summary.runtimePromotion, "not_promoted"); assert.ok(summary.accountedUSD < 1);
    const failed = JSON.parse(readFileSync(join(output, "2-result.json"), "utf8"));
    assert.equal(failed.execution.failure, "PROVIDER_RATE_LIMITED"); assert.equal(failed.estimatedUSD, null); assert.equal(failed.matchedActionAndTransport, false);
    const valid = JSON.parse(readFileSync(join(output, "1-result.json"), "utf8"));
    assert.equal(typeof valid.execution.transportTimings.streamEndMs, "number");
    assert.deepEqual(valid.execution.cacheUsage, { cachedInputTokens: 13, cacheCreationInputTokens: 5 });
    assert.equal(readdirSync(output).filter(name => name.endsWith("-started.json")).length, 48);
    assert.equal(readdirSync(output).filter(name => name.endsWith("-result.json")).length, 48);
  } finally { globalThis.fetch = previousFetch; console.log = previousLog; if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = previousKey; }
});

fixedTest("unknown usage retains reservations and stops before the one-dollar allocation is exceeded", async () => {
  const directory = mkdtempSync(join(tmpdir(), "safety-serialization-budget-")), manifest = buildSerializationManifest(), manifestPath = join(directory, "manifest.json"), output = join(directory, "live");
  writeFileSync(manifestPath, JSON.stringify(manifest));
  const previousStream = Agent.prototype.stream, previousKey = process.env.ANTHROPIC_API_KEY, previousLog = console.log;
  let calls = 0;
  process.env.ANTHROPIC_API_KEY = "synthetic-never-sent"; console.log = () => {};
  Agent.prototype.stream = (async () => { calls++; throw Object.assign(new Error("Synthetic no-usage failure"), { statusCode: 429 }); }) as typeof Agent.prototype.stream;
  try {
    await main(["--live", `--manifest=${manifestPath}`, `--output=${output}`]);
    const summary = JSON.parse(readFileSync(join(output, "summary.json"), "utf8"));
    assert.equal(summary.stopReason, "STUDY_ALLOCATION_EXHAUSTED"); assert.equal(summary.calls, calls);
    assert.ok(calls > 0 && calls < 48); assert.ok(summary.accountedUSD <= 1);
    assert.equal(summary.missingSchedule.length, 48 - calls);
    const next = manifest.schedule[calls], input = manifest.cases.find(c => c.id === next.id)!.input;
    assert.ok(summary.accountedUSD + serializationReservation(manifest, input, next.arm) > 1);
    assert.equal(summary.arms.baseline.knownEstimatedUSD + summary.arms.succinct.knownEstimatedUSD, 0);
    assert.equal(summary.arms.baseline.unknownCostAttempts + summary.arms.succinct.unknownCostAttempts, calls);
    assert.equal(summary.runtimePromotion, "not_promoted");
  } finally { Agent.prototype.stream = previousStream; console.log = previousLog; if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = previousKey; }
});
