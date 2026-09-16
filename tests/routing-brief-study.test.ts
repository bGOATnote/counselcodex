import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { makeBriefPlan, makeContextPlan, makeTaskOwnershipPlan, reservationForBrief, briefCost, scoreBriefStudy, safeEvaluate } from "../scripts/routing-brief-study.ts";
import { wireDraftSchema } from "../src/disposition/graph-output.ts";
import { replaceTaskOwnership, TASK_OWNERSHIP_PARAGRAPH } from "../src/evaluation/task-ownership-ablation.ts";
import { sha256 } from "../src/evidence/rag/model.ts";
import type { ModelTransportResult } from "../src/disposition/transport.ts";

// Planning and scoring only. These tests never call main(), Agent.stream(), or
// a provider. Temporary rows below are deliberately incomplete software fixtures.
test("fixed-packet plan has 100 unique slots and independent label-free producer inputs", () => {
  const plan = makeBriefPlan();
  assert.equal(plan.cases.length, 50);
  assert.equal(plan.schedule.length, 100);
  assert.equal(new Set(plan.schedule.map(s => `${s.id}-${s.arm}`)).size, 100);
  for (const c of plan.cases) {
    const { outputInstructions: _instructions, ...common } = c.packets.full;
    assert.deepEqual(common, c.packets.brief);
    for (const packet of Object.values(c.packets)) for (const key of ["acceptedRoutes", "gold", "safety", "issued", "originalAdmission"]) {
      assert.equal(Object.hasOwn(packet, key), false, `${c.id}:${key}`);
    }
  }
  assert.equal(plan.cases.find(c => c.id === "C04")!.originalAdmission.eligible, false);
});

test("reservation and known-token accounting use the same doubled-input policy", () => {
  const plan = makeBriefPlan(), c = plan.cases[0];
  for (const arm of ["full", "brief"] as const) {
    const inputBound = Buffer.byteLength(JSON.stringify(c.packets[arm]) + plan.prompts[arm] + JSON.stringify(plan.schemas[arm])) + 8192;
    const reservation = reservationForBrief(plan, c, arm);
    assert.equal(reservation, (2 * inputBound * plan.pricing.inputPerMillionUSD + plan.settings.maxOutputTokens * plan.pricing.outputPerMillionUSD) / 1e6);
    const execution = { usage: { inputTokens: inputBound, outputTokens: plan.settings.maxOutputTokens } } as ModelTransportResult;
    assert.equal(briefCost(execution, plan)!.accountedUSD, reservation);
  }
  for (const usage of [{ inputTokens: null, outputTokens: 1 }, { inputTokens: 1, outputTokens: null }]) {
    assert.equal(briefCost({ usage } as ModelTransportResult, plan), null);
  }
});

test("scoring retains missing slots, failed evaluations and outstanding pair reservations", () => {
  const plan = makeBriefPlan(), directory = mkdtempSync(join(tmpdir(), "routing-brief-score-test-"));
  const write = (name: string, value: unknown) => writeFileSync(join(directory, name), JSON.stringify(value));
  try {
    write("plan.json", plan);
    const initial = scoreBriefStudy(directory);
    assert.equal(initial.rows.length, 100);
    assert.equal(initial.arms.full.attempted, 0);
    assert.equal(initial.arms.brief.attempted, 0);
    assert.deepEqual(initial.arms.full.agreement, { numerator: 0, denominator: 0 });

    const c = plan.cases[0], fullReserve = reservationForBrief(plan, c, "full"), briefReserve = reservationForBrief(plan, c, "brief");
    write(`${c.id}-reservation.json`, { pairReservationUSD: fullReserve + briefReserve });
    write(`${c.id}-full-started.json`, { softwareFixture: true });
    const interrupted = scoreBriefStudy(directory);
    assert.equal(interrupted.arms.full.attempted, 1);
    assert.equal(interrupted.arms.brief.attempted, 0);
    assert.equal(interrupted.spend.currentAccountedAndOutstandingUSD, fullReserve + briefReserve);
    assert.equal(interrupted.pairedProducerDelta.n, 0);

    write(`${c.id}-full-result.json`, { softwareFixture: true, reservationUSD: fullReserve, accountedUSD: .1, baseUSD: .06 });
    write(`${c.id}-full-evaluation.json`, { id: c.id, arm: "full", error: "LOCAL_EVALUATOR_FAILURE_RESULT_RETAINED" });
    const failed = scoreBriefStudy(directory);
    assert.equal(failed.rows.length, 100);
    assert.equal(failed.arms.full.attempted, 1);
    assert.equal(failed.arms.full.providerComplete, 0);
    assert.deepEqual(failed.arms.full.agreement, { numerator: 0, denominator: 0 });
    assert.equal(failed.arms.full.producerLatency.n, 0);
    assert.ok(Math.abs(failed.spend.currentAccountedAndOutstandingUSD - (briefReserve + .1)) < 1e-12);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("C25 null reference is excluded even from an eligible experimental proposal", () => {
  const plan = makeBriefPlan(), directory = mkdtempSync(join(tmpdir(), "routing-brief-null-test-"));
  try {
    writeFileSync(join(directory, "plan.json"), JSON.stringify(plan));
    writeFileSync(join(directory, "C25-brief-evaluation.json"), JSON.stringify({
      id: "C25", arm: "brief", eligibleRoutingProposal: true,
      proposal: { route: "SAME_DAY_IN_PERSON" }, providerComplete: false,
    }));
    const report = scoreBriefStudy(directory);
    assert.equal(report.arms.brief.eligibleProposals, 1);
    assert.deepEqual(report.arms.brief.agreement, { numerator: 0, denominator: 0 });
    assert.deepEqual(report.arms.brief.rawRouteAgreementDiagnostic, { numerator: 0, denominator: 0 });
    assert.deepEqual(report.arms.brief.under, []);
    assert.deepEqual(report.arms.brief.over, []);
    assert.equal(report.arms.brief.agreementCoverage.denominator, 49);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("context plan keeps full policies and schemas in both fresh arms, changing only generated context", () => {
  const baseline = makeBriefPlan(), plan = makeContextPlan();
  assert.equal(plan.experiment, "context");
  assert.deepEqual(plan.armLabels, { full: "with_generated_context", brief: "without_generated_context" });
  assert.deepEqual(plan.contracts, { full: "full", brief: "full" });
  assert.equal(plan.prompts.full, baseline.prompts.full);
  assert.equal(plan.prompts.brief, baseline.prompts.full);
  assert.equal(plan.promptHashes.full, plan.promptHashes.brief);
  assert.deepEqual(plan.schemas.full, wireDraftSchema.toJSONSchema());
  assert.deepEqual(plan.schemas.brief, wireDraftSchema.toJSONSchema());
  assert.deepEqual(plan.settings, baseline.settings);
  assert.equal(plan.cases.length, 50);
  assert.equal(new Set(plan.schedule.map(s => `${s.id}-${s.arm}`)).size, 100);
  assert.deepEqual(plan.schedule, baseline.schedule);
  for (const c of plan.cases) {
    const original = baseline.cases.find(b => b.id === c.id)!;
    assert.deepEqual(c.packets.full, original.packets.full);
    const { context: _context, ...withoutContext } = original.packets.full;
    assert.deepEqual(c.packets.brief, withoutContext);
    assert.equal(Object.hasOwn(c.packets.brief, "context"), false);
    assert.equal(c.commonInputHash, sha256(JSON.stringify(withoutContext)));
    assert.deepEqual(c.hits, original.hits);
    assert.deepEqual(c.sources, original.sources);
    assert.deepEqual(c.issued, original.issued);
    assert.deepEqual(c.originalAdmission, original.originalAdmission);
    for (const packet of Object.values(c.packets)) for (const key of ["acceptedRoutes", "gold", "safety", "issued", "originalAdmission"]) {
      assert.equal(Object.hasOwn(packet, key), false, `${c.id}:${key}`);
    }
  }
  // Building the new plan does not mutate the legacy prompt/schema objects.
  assert.deepEqual(makeBriefPlan().prompts, baseline.prompts);
  assert.deepEqual(makeBriefPlan().schemas, baseline.schemas);
});

test("context plan carries prior completed spend forward and the historical report still replays exactly", () => {
  const directory = "outputs/routing-brief-network-replication-2026-09-15";
  const path = `${directory}/report.json`, before = readFileSync(path, "utf8"), previous = JSON.parse(before);
  assert.equal(JSON.stringify(scoreBriefStudy(directory)), JSON.stringify(previous));
  const baseline = makeBriefPlan(), plan = makeContextPlan();
  assert.ok(Math.abs(plan.budget.priorAccountedAndReservedUSD - baseline.budget.priorAccountedAndReservedUSD - previous.spend.currentAccountedAndOutstandingUSD) < 1e-10);
  assert.equal(plan.budget.remainingUSD, 90 - plan.budget.priorAccountedAndReservedUSD);
  assert.notEqual(plan.budget.exclusiveClaim, baseline.budget.exclusiveClaim);
  assert.equal(plan.files[path], sha256(before));
  assert.equal(plan.files["src/evaluation/context-ablation.ts"], sha256(readFileSync("src/evaluation/context-ablation.ts")));
  assert.equal(readFileSync(path, "utf8"), before);
});

test("context report evaluates both legacy artifact slots as full-response contracts", () => {
  const plan = makeContextPlan(), directory = mkdtempSync(join(tmpdir(), "context-score-contract-test-"));
  try {
    writeFileSync(join(directory, "plan.json"), JSON.stringify(plan));
    for (const arm of ["full", "brief"]) writeFileSync(join(directory, `C01-${arm}-evaluation.json`), JSON.stringify({
      id: "C01", arm, eligibleRoutingProposal: false, providerComplete: false,
      fullResponseGateReplay: { admission: { released: true } },
    }));
    const report = scoreBriefStudy(directory);
    assert.deepEqual(report.armLabels, plan.armLabels);
    assert.equal(report.arms.full.fullResponseGatesPassed, 1);
    assert.equal(report.arms.brief.fullResponseGatesPassed, 1);
    assert.equal(report.rows.length, 100);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("ownership plan changes one prompt paragraph with identical full WITH-context packets and contracts", () => {
  const baseline = makeBriefPlan(), plan = makeTaskOwnershipPlan();
  assert.equal(plan.experiment, "ownership");
  assert.equal(plan.protocol, "fixed-packet-task-ownership/v1");
  assert.deepEqual(plan.armLabels, { full: "baseline_task_ownership", brief: "explicit_task_ownership" });
  assert.deepEqual(plan.contracts, { full: "full", brief: "full" });
  assert.equal(plan.prompts.full, baseline.prompts.full);
  assert.equal(plan.prompts.brief, replaceTaskOwnership(baseline.prompts.full));
  const start = baseline.prompts.full.indexOf("NECESSARY CLINICIAN TASK:");
  const end = baseline.prompts.full.indexOf("\nSAFETY-NET LOGIC:", start);
  assert.equal(plan.prompts.brief, baseline.prompts.full.slice(0, start) + TASK_OWNERSHIP_PARAGRAPH + baseline.prompts.full.slice(end));
  assert.notEqual(plan.promptHashes.full, plan.promptHashes.brief);
  assert.deepEqual(plan.settings, baseline.settings);
  assert.equal(plan.model, baseline.model);
  assert.equal(plan.cases.length, 50);
  assert.deepEqual(plan.schedule, baseline.schedule);
  assert.equal(new Set(plan.schedule.map(s => `${s.id}-${s.arm}`)).size, 100);
  for (const arm of ["full", "brief"] as const) {
    assert.deepEqual(plan.schemas[arm], wireDraftSchema.toJSONSchema());
    assert.equal(plan.promptHashes[arm], sha256(plan.prompts[arm]));
  }
  for (const c of plan.cases) {
    const original = baseline.cases.find(b => b.id === c.id)!;
    assert.deepEqual(c.packets.full, original.packets.full);
    assert.deepEqual(c.packets.brief, original.packets.full);
    assert.notEqual(c.packets.full, c.packets.brief);
    assert.equal(c.commonInputHash, sha256(JSON.stringify(original.packets.full)));
    assert.equal(c.packetHashes.full, c.commonInputHash);
    assert.equal(c.packetHashes.brief, c.commonInputHash);
    assert.deepEqual(c.hits, original.hits);
    assert.deepEqual(c.sources, original.sources);
    assert.deepEqual(c.issued, original.issued);
    assert.deepEqual(c.originalAdmission, original.originalAdmission);
    for (const packet of Object.values(c.packets)) {
      assert.deepEqual(Object.keys(packet), ["patient", "context", "outputInstructions", "sources"]);
      for (const key of ["acceptedRoutes", "gold", "safety", "issued", "originalAdmission"])
        assert.equal(Object.hasOwn(packet, key), false, `${c.id}:${key}`);
    }
  }
  assert.equal(plan.cases.find(c => c.id === "C04")!.originalAdmission.eligible, false);
  assert.deepEqual(makeBriefPlan().prompts, baseline.prompts);
});

test("ownership plan carries the complete context exposure once and freezes predecessor identity", () => {
  const directory = "outputs/generated-context-ablation-2026-09-15";
  const previous = JSON.parse(readFileSync(`${directory}/report.json`, "utf8"));
  const previousPlan = JSON.parse(readFileSync(`${directory}/plan.json`, "utf8"));
  const plan = makeTaskOwnershipPlan();
  assert.equal(plan.budget.priorAccountedAndReservedUSD,
    previous.spend.priorAccountedAndReservedUSD + previous.spend.currentAccountedAndOutstandingUSD);
  assert.equal(plan.budget.remainingUSD, 90 - plan.budget.priorAccountedAndReservedUSD);
  assert.ok(Math.abs(plan.budget.remainingUSD - 37.627139) < 1e-9);
  assert.notEqual(plan.budget.exclusiveClaim, previousPlan.budget.exclusiveClaim);
  assert.notEqual(plan.budget.exclusiveClaim, makeBriefPlan().budget.exclusiveClaim);
  for (const path of [`${directory}/plan.json`, `${directory}/report.json`, `${directory}/execution-claim.json`,
    `${previousPlan.budget.exclusiveClaim}/claim.json`, "src/evaluation/task-ownership-ablation.ts"])
    assert.equal(plan.files[path], sha256(readFileSync(path)));
});

test("completed brief and context reports remain byte-identical on offline replay", () => {
  for (const directory of ["outputs/routing-brief-network-replication-2026-09-15", "outputs/generated-context-ablation-2026-09-15"]) {
    const path = `${directory}/report.json`, before = readFileSync(path, "utf8");
    assert.equal(JSON.stringify(scoreBriefStudy(directory), null, 2) + "\n", before);
    assert.equal(readFileSync(path, "utf8"), before);
  }
});

const providerFixture = (): ModelTransportResult => ({
  output: {}, failure: null, usage: { inputTokens: 100, outputTokens: 20 }, durationMs: 127, firstTextDeltaMs: 17,
  failureDetails: { stage: "complete", finishReason: "stop", httpStatus: 200 },
  streamProgress: { lastTextDeltaMs: 110, textDeltaCount: 3, textCharacters: 140 },
  transportTimings: { startResolvedMs: 4, objectResolvedMs: 115, usageResolvedMs: 117, finishReasonResolvedMs: 120, streamEndMs: 121 },
  cacheUsage: { cachedInputTokens: 30, cacheCreationInputTokens: 10 },
});

test("safe evaluator fails closed while retaining completed provider metadata and scorer latency", () => {
  const plan = makeTaskOwnershipPlan(), c = plan.cases[0];
  const broken = { ...c, hits: null as unknown as typeof c.hits }; // Deliberate local scoring fault, not a provider failure.
  const execution = providerFixture(), before = structuredClone(execution);
  const row = safeEvaluate(broken, "brief", execution, "full");
  assert.equal(row.failure, "LOCAL_EVALUATOR_FAILURE_RESULT_RETAINED");
  assert.equal(row.firstAttempt, true);
  assert.equal(row.providerComplete, true);
  assert.equal(row.producerMs, execution.durationMs);
  assert.equal(row.firstTextMs, execution.firstTextDeltaMs);
  assert.deepEqual(row.usage, execution.usage);
  assert.equal(row.eligibleRoutingProposal, false);
  assert.equal(row.output, null);
  assert.equal(row.proposal, null);
  assert.equal(row.fullResponseGateReplay, null);
  assert.equal(row.unsafe_advice, "not_assessed");
  assert.equal(row.unsupported_claims, "not_assessed");
  assert.equal(row.clinicalApproval, false);
  assert.equal(row.patientAdvicePublished, false);
  assert.ok("providerFailure" in row);
  assert.equal(row.providerFailure, null);
  for (const key of ["failureDetails", "streamProgress", "transportTimings", "cacheUsage"] as const)
    assert.deepEqual(row[key], execution[key]);
  assert.deepEqual(execution, before);
  // Replaying the same retained first attempt is deterministic and needs no call.
  assert.deepEqual(safeEvaluate(broken, "brief", execution, "full"), row);
  const directory = mkdtempSync(join(tmpdir(), "ownership-local-failure-test-"));
  try {
    writeFileSync(join(directory, "plan.json"), JSON.stringify(plan));
    writeFileSync(join(directory, `${c.id}-brief-evaluation.json`), JSON.stringify(row));
    const report = scoreBriefStudy(directory);
    assert.equal(report.arms.brief.providerComplete, 1);
    assert.deepEqual(report.arms.brief.producerLatency, { n: 1, median: 127, p95: 127 });
    assert.deepEqual(report.arms.brief.agreement, { numerator: 0, denominator: 0 });
    assert.equal(report.arms.brief.agreementCoverage.denominator, 49);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("safe evaluator never upgrades failed or unknown-usage provider work after a local fault", () => {
  const c = makeBriefPlan().cases[0], broken = { ...c, hits: null as unknown as typeof c.hits };
  for (const execution of [
    { ...providerFixture(), failure: "MODEL_TIMEOUT" },
    { ...providerFixture(), usage: { inputTokens: null, outputTokens: 20 } },
  ]) {
    const row = safeEvaluate(broken, "full", execution, "full");
    assert.equal(row.failure, "LOCAL_EVALUATOR_FAILURE_RESULT_RETAINED");
    assert.equal(row.providerComplete, false);
    assert.equal(row.eligibleRoutingProposal, false);
    assert.ok("providerFailure" in row);
    assert.equal(row.providerFailure, execution.failure);
    assert.deepEqual(row.usage, execution.usage);
  }
});
