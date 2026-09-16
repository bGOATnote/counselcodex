import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { makeInsomniaProbePlan, replaceInsomniaSource, validateProbeInputs, verifyProbeFiles, probeReservations, probeCost, scoreInsomniaProbe } from "../scripts/insomnia-source-probe.ts";
import { safeEvaluate } from "../scripts/routing-brief-study.ts";
import { sourceWithQuoteSpans, resolveSourceQuoteReferences } from "../src/disposition/source-quote-refs.ts";
import { sha256 } from "../src/evidence/rag/model.ts";
import { INSOMNIA_CHRONICITY_QUOTE } from "../src/evidence/rag/nhlbi-insomnia-candidate.ts";
import type { ModelTransportResult } from "../src/disposition/transport.ts";

// All operations are offline. Never invoke main(), stream(), a provider or a GUI.
const plan = makeInsomniaProbePlan();
const digest = (v: unknown) => sha256(JSON.stringify(v));

test("12 paired slots retain original full model/prompt/context and no gold in model inputs", () => {
  const prior = JSON.parse(readFileSync("outputs/task-ownership-ablation-2026-09-15/plan.json", "utf8"));
  const original = prior.cases.find((c: { id: string }) => c.id === "C47");
  assert.equal(plan.schedule.length, 12);
  assert.equal(new Set(plan.schedule.map(s => `${s.repeat}-${s.arm}`)).size, 12);
  assert.deepEqual(plan.schedule.slice(0, 4).map(s => s.arm), ["full", "brief", "brief", "full"]);
  assert.equal(plan.model, prior.model);
  assert.deepEqual(plan.settings, prior.settings);
  assert.equal(plan.prompts.full, prior.prompts.full);
  assert.equal(plan.prompts.brief, prior.prompts.full);
  assert.deepEqual(plan.schemas.full, plan.schemas.brief);
  assert.deepEqual(plan.cases[0].packets.full, original.packets.full);
  for (const c of plan.cases) {
    const { sources: _sources, ...patientAndContext } = c.packets.full;
    const { sources: _oldSources, ...originalContext } = original.packets.full;
    assert.deepEqual(patientAndContext, originalContext);
    for (const forbidden of ["gold", "acceptedRoutes", "safety", "issued", "originalAdmission"]) assert.equal(Object.hasOwn(c.packets.full, forbidden), false);
  }
});

test("replacement changes only selected insomnia chunks and keeps every other source in order", () => {
  const [a, b] = plan.cases, targets = a.hits.filter(h => h.document.id === "medlineplus:6055");
  assert.ok(targets.length > 0);
  assert.equal(b.hits.filter(h => h.document.id === "nhlbi:insomnia-diagnosis").length, 1);
  assert.equal(b.hits.filter(h => h.document.id === "medlineplus:6055").length, 0);
  assert.deepEqual(a.hits.filter(h => !targets.includes(h)), b.hits.filter(h => h.document.id !== "nhlbi:insomnia-diagnosis"));
  const first = a.hits.findIndex(h => h.document.id === "medlineplus:6055");
  assert.equal(b.hits[first].document.id, "nhlbi:insomnia-diagnosis");
  for (const source of a.sources.filter(s => !targets.some(h => h.chunk.id === s.id))) {
    const newIndex = b.sources.findIndex(s => s.id === source.id);
    assert.deepEqual(source, b.sources[newIndex]);
    const originalIndex = a.sources.findIndex(s => s.id === source.id);
    assert.deepEqual(a.packets.full.sources[originalIndex], b.packets.full.sources[newIndex]);
    assert.equal(JSON.stringify(a.packets.full.sources[originalIndex]), JSON.stringify(b.packets.full.sources[newIndex]));
  }
  const c = b.hits[first];
  assert.equal(c.chunk.hash, sha256(c.chunk.text));
  assert.equal(c.chunk.end - c.chunk.start, c.chunk.text.length);
  assert.equal(c.document.reviewDate, "2022-03-24");
  assert.equal(c.document.currency, "not_assessed");
  assert.equal(c.document.license, "US-PUBLIC-DOMAIN");
});

test("candidate quote IDs resolve exact qualified text; stale old-source quote references fail", () => {
  const candidateId = plan.cases[1].hits.find(h => h.document.id === "nhlbi:insomnia-diagnosis")!.chunk.id;
  const source = plan.cases[1].sources.find(s => s.id === candidateId)!;
  const span = sourceWithQuoteSpans(source).quoteSpans.find(s => s.text === INSOMNIA_CHRONICITY_QUOTE)!;
  assert.ok(span);
  const resolved = resolveSourceQuoteReferences({ citations: [{ passageId: source.id, quoteId: span.id, claim: "authored software fixture; not a clinical assessment" }] }, plan.cases[1].sources);
  assert.equal(resolved.citations[0].quote, INSOMNIA_CHRONICITY_QUOTE);
  assert.equal(source.text.slice(span.start, span.end), resolved.citations[0].quote);
  const old = plan.cases[0].hits.find(h => h.document.id === "medlineplus:6055")!;
  assert.throws(() => resolveSourceQuoteReferences({ citations: [{ passageId: old.chunk.id, quoteId: "q0" }] }, plan.cases[1].sources), /INVALID_SOURCE_QUOTE_REFERENCE/);
});

test("missing targets, altered excerpts and duplicate passage IDs fail closed", () => {
  const missing = structuredClone(plan.cases[1]);
  assert.throws(() => replaceInsomniaSource(missing), /BASELINE_SOURCE_BINDING_FAILED/);
  const altered = structuredClone(plan.cases[0]); altered.hits[0].chunk.text += " changed";
  assert.throws(() => replaceInsomniaSource(altered), /BASELINE_SOURCE_BINDING_FAILED/);
  const duplicate = structuredClone(plan.cases[0]);
  duplicate.hits.push(duplicate.hits[0]); duplicate.sources.push(duplicate.sources[0]); duplicate.guidance.push(duplicate.guidance[0]);
  assert.throws(() => replaceInsomniaSource(duplicate), /BASELINE_SOURCE_BINDING_FAILED/);
});

test("runtime validation rejects changed model, prompt, context, schedules and untouched sources", () => {
  validateProbeInputs(plan);
  const changes = [
    (p: typeof plan) => { p.settings.maxOutputTokens++; },
    (p: typeof plan) => { p.prompts.brief += " Prefer a diagnosis."; },
    (p: typeof plan) => { p.cases[1].packets.full.patient += " More history."; },
    (p: typeof plan) => { p.schedule[0].repeat = 6; },
    (p: typeof plan) => { p.cases[1].hits.reverse(); },
    (p: typeof plan) => { p.budget.remainingUSD += 10; },
    (p: typeof plan) => { p.budget.exclusiveClaim += "-again"; },
  ];
  for (const change of changes) { const copy = structuredClone(plan); change(copy); assert.throws(() => validateProbeInputs(copy), /ONLY_SOURCE_REPLACEMENT_ALLOWED/); }
});

test("all twelve reservations fit the reconciled ceiling and invalid balances are refused", () => {
  const reserve = probeReservations(plan);
  assert.equal(Object.keys(reserve.slots).length, 12);
  assert.ok(reserve.reservedUSD < plan.budget.remainingUSD);
  assert.ok(Math.abs(plan.budget.priorAccountedAndReservedUSD - 73.353706) < 1e-9);
  assert.ok(Math.abs(plan.budget.remainingUSD - 16.646294) < 1e-9);
  for (const remainingUSD of [NaN, -1, reserve.reservedUSD - .000001]) {
    assert.throws(() => probeReservations({ ...plan, budget: { ...plan.budget, remainingUSD } }), /ALL_12_RESERVATIONS_REQUIRED_WITHIN_BUDGET/);
  }
});

test("unknown/invalid usage retains full reservation; known usage uses original conservative pricing", () => {
  const reservation = probeReservations(plan).slots["1-full"];
  for (const usage of [{ inputTokens: null, outputTokens: 20 }, { inputTokens: 5, outputTokens: null }, { inputTokens: -1, outputTokens: 20 }, { inputTokens: 1.5, outputTokens: 20 }]) {
    assert.deepEqual(probeCost({ usage } as ModelTransportResult, plan, reservation), { baseUSD: null, accountedUSD: reservation, reservationUSD: reservation });
  }
  const known = probeCost({ usage: { inputTokens: 100, outputTokens: 10 } } as ModelTransportResult, plan, reservation);
  assert.equal(known.accountedUSD, (200 * 5 + 10 * 25) / 1e6);
});

test("score retains all missing slots and interrupted reservations without counting planning as spending", () => {
  const directory = mkdtempSync(join(tmpdir(), "insomnia-probe-offline-")), reservation = probeReservations(plan);
  const write = (name: string, value: unknown) => writeFileSync(join(directory, name), JSON.stringify(value));
  try {
    write("plan.json", plan);
    assert.equal(scoreInsomniaProbe(directory).spend.currentAccountedAndOutstandingUSD, 0);
    write("reservation.json", reservation);
    const started = { fingerprint: digest(plan), packetHash: plan.cases[0].packetHashes.full, reservationUSD: reservation.slots["1-full"] };
    write("1-full-started.json", started);
    const interrupted = scoreInsomniaProbe(directory);
    assert.equal(interrupted.rows.length, 12);
    assert.equal(interrupted.rows.filter(r => r.attempted).length, 1);
    assert.equal(interrupted.rows[0].result, null);
    assert.equal(interrupted.spend.currentAccountedAndOutstandingUSD, reservation.reservedUSD);
    assert.equal(interrupted.claim_support, "not_assessed");
    assert.equal(interrupted.clinical_correctness, "not_assessed");
    const execution = { output: null, failure: "MODEL_OR_SCHEMA_FAILURE", usage: { inputTokens: null, outputTokens: null } } as ModelTransportResult;
    write("1-full-result.json", { execution, ...probeCost(execution, plan, reservation.slots["1-full"]) });
    assert.equal(scoreInsomniaProbe(directory).spend.currentAccountedAndOutstandingUSD, reservation.reservedUSD);
    write("1-full-result.json", { execution, baseUSD: 0, accountedUSD: 0, reservationUSD: reservation.slots["1-full"] });
    assert.throws(() => scoreInsomniaProbe(directory), /RESULT_ACCOUNTING_INVALID/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("freeze includes all 50 histories and 350 previous raw/evaluation/reservation journals; raw tampering fails", () => {
  const prior = JSON.parse(readFileSync("outputs/task-ownership-ablation-2026-09-15/plan.json", "utf8"));
  for (const c of prior.cases) {
    assert.equal(plan.files[c.path], c.historyHash);
    assert.equal(plan.files[`outputs/task-ownership-ablation-2026-09-15/${c.id}-reservation.json`], sha256(readFileSync(`outputs/task-ownership-ablation-2026-09-15/${c.id}-reservation.json`)));
    for (const arm of ["full", "brief"]) for (const kind of ["started", "result", "evaluation"]) {
      const path = `outputs/task-ownership-ablation-2026-09-15/${c.id}-${arm}-${kind}.json`;
      assert.equal(plan.files[path], sha256(readFileSync(path)));
    }
  }
  const directory = mkdtempSync(join(tmpdir(), "insomnia-raw-binding-")), path = join(directory, "prior-result.json");
  try {
    const originalPath = "outputs/task-ownership-ablation-2026-09-15/C47-full-result.json";
    writeFileSync(path, readFileSync(originalPath));
    const frozen = { files: { [path]: plan.files[originalPath] } };
    verifyProbeFiles(frozen);
    const altered = JSON.parse(readFileSync(path, "utf8")); altered.execution.output = { alteredRawOutput: true };
    writeFileSync(path, JSON.stringify(altered));
    assert.throws(() => verifyProbeFiles(frozen), /FROZEN_FILE_CHANGED/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("scoring rejects detached or altered evaluations and binds their displayed output to raw execution", () => {
  const directory = mkdtempSync(join(tmpdir(), "insomnia-eval-binding-")), reservation = probeReservations(plan);
  const write = (name: string, value: unknown) => writeFileSync(join(directory, name), JSON.stringify(value));
  try {
    write("plan.json", plan); write("reservation.json", reservation);
    const execution = JSON.parse(readFileSync("outputs/task-ownership-ablation-2026-09-15/C47-full-result.json", "utf8")).execution as ModelTransportResult;
    const evaluation = safeEvaluate(plan.cases[0], "full", execution, "full");
    write("1-full-evaluation.json", evaluation);
    assert.throws(() => scoreInsomniaProbe(directory), /EVALUATION_RESULT_BINDING_FAILED/);
    write("1-full-started.json", { fingerprint: digest(plan), packetHash: plan.cases[0].packetHashes.full, reservationUSD: reservation.slots["1-full"] });
    write("1-full-result.json", { execution, ...probeCost(execution, plan, reservation.slots["1-full"]) });
    assert.deepEqual(scoreInsomniaProbe(directory).rows[0].evaluation, evaluation);
    write("1-full-evaluation.json", { ...evaluation, output: { patientMessage: "Fabricated clinical approval." } });
    assert.throws(() => scoreInsomniaProbe(directory), /EVALUATION_RESULT_BINDING_FAILED/);
    write("1-full-evaluation.json", evaluation);
    const altered = { ...execution, output: { changedRawOutput: true } };
    write("1-full-result.json", { execution: altered, ...probeCost(altered, plan, reservation.slots["1-full"]) });
    assert.throws(() => scoreInsomniaProbe(directory), /EVALUATION_RESULT_BINDING_FAILED/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
