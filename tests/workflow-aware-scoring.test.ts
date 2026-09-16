import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreWorkflowAware, verifyWorkflowGeneration } from "../scripts/score-workflow-aware.ts";
import { PROTOCOL_ADAPTER, type Disposition } from "../src/research/workflow-aware/protocol.ts";
import { OWN_SOURCES, planStudy, finalizeStudy, NANO_DIGEST, type Job, type ParsedRecord } from "../src/research/workflow-aware/runner.ts";
import { NANO_RUNTIME_VERSION, NANO_TEMPLATE_SHA256 } from "../src/research/workflow-aware/transport.ts";
import { accountUsage, fileHash, readBudget, reserveAndStart, settle, sha256 } from "../src/research/workflow-aware/budget.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const put = (path: string, data: unknown) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(data, null, 2) + "\n"); };
const get = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const SC = "SELF_CARE", AP = "ASYNC_PHYSICIAN", UE = "URGENT_ESCALATION";

function fixture(options: { failure?: (job: Job) => boolean; models?: ("fable" | "nano")[]; repeats?: number; splitPhases?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "workflow-score-fixture-")), out = join(root, "output");
  for (const path of [...new Set([...OWN_SOURCES, ...PROTOCOL_ADAPTER.sourceFiles, "package-lock.json"])]) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), readFileSync(join(ROOT, path))); }
  put(join(root, "funding.json"), { testOnly: true });
  put(join(root, "budget.json"), { schema: "workflow-aware-budget/v1", allocationUSD: 50, embeddingEarmarkUSD: 1, accountedAndOutstandingUSD: 0, perCallCeilingUSD: 1, ledgerDirectory: "ledger", sources: { "funding.json": fileHash(join(root, "funding.json")) } });
  const messages = [{ id: "K1", message: "Fixture: sudden severe chest symptoms." }, { id: "K2", message: "Fixture: uncomplicated mild skin irritation." },
    { id: "Q1", message: "Fixture: prescription assessment requested." }, { id: "Q2", message: "Fixture: incomplete low-acuity history." }];
  put(join(root, "messages.json"), messages);
  const config = { schema: "workflow-aware-study/v1", models: options.models ?? ["fable", "nano"], arms: ["baseline", "workflow_contract"], replicates: options.repeats ?? 2,
    seed: 42, deadlineUTC: "2026-09-16T14:41:47Z", timeoutMs: { fable: 1000, nano: 1000 }, nanoDigest: NANO_DIGEST,
    phases: options.splitPhases ? [{ id: "known_a", messageIds: ["K1"] }, { id: "known_b", messageIds: ["K2"] }, { id: "challenge", messageIds: ["Q1", "Q2"] }] : [{ id: "known", messageIds: ["K1", "K2"] }, { id: "challenge", messageIds: ["Q1", "Q2"] }] };
  put(join(root, "config.json"), config);
  const oldTime = "2026-09-16T06:00:00.000Z";
  const known = { schemaVersion: "physician-adjudication/3", provenance: { blinded: false, heldOutValidation: false }, cases: messages.slice(0, 2).map((r, i) => ({ ...r, inputSHA256: sha256(r.message), acceptedBuckets: [i ? SC : UE] })) };
  put(join(root, "known-reference.json"), known); put(join(root, "challenge-messages.json"), messages.slice(2));
  put(join(root, "challenge-targets.json"), { status: "ai_authored_unreviewed", frozenAt: oldTime, caseSetSha256: fileHash(join(root, "challenge-messages.json")),
    cases: [{ id: "Q1", acceptedBuckets: [AP] }, { id: "Q2", acceptedBuckets: [SC, AP] }], pairs: [{ id: "fixture", caseIds: ["Q1", "Q2"] }] });
  const refFreeze = join(root, "reference-freeze.json");
  put(refFreeze, { schema: "workflow-aware-reference-freeze/v1", frozenAt: oldTime, generationStartedAtFreeze: false,
    known: { path: "known-reference.json", sha256: fileHash(join(root, "known-reference.json")), expectedCases: 2, status: "single_physician_post_output_reassessment_of_known_development_set" },
    challenge: { path: "challenge-targets.json", sha256: fileHash(join(root, "challenge-targets.json")), messagesPath: "challenge-messages.json", messagesSHA256: fileHash(join(root, "challenge-messages.json")), expectedCases: 2, status: "ai_authored_unreviewed" } });
  const manifest = planStudy({ messagesPath: join(root, "messages.json"), configPath: join(root, "config.json"), budgetPath: join(root, "budget.json"), outputDir: out, protocol: PROTOCOL_ADAPTER, root });
  const budget = readBudget(join(root, "budget.json"), root), time = manifest.frozenAt;
  for (const model of config.models) put(join(out, `preflight-${model}.json`), { studyId: manifest.studyId, provider: model, model: model === "fable" ? "claude-fable-5-1" : "counsel-nano-q5",
    checkedAt: time, generationCalls: 0, ...(model === "nano" ? { digest: NANO_DIGEST, runtime: { version: NANO_RUNTIME_VERSION, templateSHA256: NANO_TEMPLATE_SHA256, generationCalls: 0, unquantizedCheckpointProvenance: "not_verified" } } : { adaptive: true, effort: "low" }) });
  for (const job of manifest.jobs) {
    let disposition: Disposition["disposition"] = job.caseId === "K1" ? UE : job.caseId === "Q1" ? AP : SC;
    if (job.arm === "workflow_contract" && job.model === "fable") disposition = job.caseId === "K1" || job.caseId === "K2" ? AP : SC;
    if (job.arm === "workflow_contract" && job.model === "nano" && job.caseId === "K1" && job.replicate === 2) disposition = SC;
    const intended: Disposition = { disposition, rationale: `Fixture only ${job.caseId} ${job.model} repeat ${job.replicate}.` };
    const failure = options.failure?.(job) ?? false;
    const response = job.model === "fable" ? { model: "claude-fable-5-1", id: `msg_${job.jobId}`, stop_reason: failure ? "max_tokens" : "end_turn", content: [{ type: "text", text: JSON.stringify(intended) }], usage: { input_tokens: 10, output_tokens: 20 } }
      : { model: "counsel-nano-q5:latest", done: true, done_reason: failure ? "length" : "stop", message: { role: "assistant", content: JSON.stringify(intended) }, prompt_eval_count: 10, eval_count: 20, total_duration: 30_000 };
    const rawPath = join(out, "raw", `${job.jobId}.json`), parsedPath = join(out, "parsed", `${job.jobId}.json`);
    reserveAndStart(budget, { studyId: manifest.studyId, jobId: job.jobId, model: job.model, manifestSHA256: fileHash(join(out, "manifest.json")), requestSHA256: job.requestSHA256, reservedUSD: job.reservedUSD, beganAt: time });
    put(rawPath, { jobId: job.jobId, beganAt: time, status: 200, requestId: job.model === "fable" ? `req_${job.jobId}` : null, responseText: JSON.stringify(response), latencyMs: 10 * job.replicate, completedAt: time, error: null });
    const accounting = accountUsage(response, job.model, job.reservedUSD);
    const parsed: ParsedRecord = { jobId: job.jobId, caseId: job.caseId, model: job.model, arm: job.arm, phase: job.phase, replicate: job.replicate, seed: job.seed,
      result: failure ? null : intended, failure: failure ? "Fixture incomplete response; no retry." : null, providerCalls: 1, requestSHA256: job.requestSHA256, rawSHA256: fileHash(rawPath), latencyMs: 10 * job.replicate, ...accounting };
    put(parsedPath, parsed);
    settle(budget, { studyId: manifest.studyId, jobId: job.jobId, settledAt: time, accountedUSD: accounting.accountedUSD, estimatedUSD: accounting.estimatedUSD, usageKnown: accounting.usageKnown, parsedSHA256: fileHash(parsedPath) });
  }
  const refreshUnload = () => {
    if (config.models.includes("nano")) put(join(out, "lifecycle", "fixture-unload.json"), { studyId: manifest.studyId, model: "counsel-nano-q5", done: true, doneReason: "unload", generationCalls: 0, unloadedAt: time,
      parsedArtifactHashes: Object.fromEntries(manifest.jobs.filter(j => j.model === "nano").map(j => [`parsed/${j.jobId}.json`, fileHash(join(out, "parsed", `${j.jobId}.json`))])) });
  };
  refreshUnload(); finalizeStudy({ outputDir: out, protocol: PROTOCOL_ADAPTER, root });
  const score = (more = {}) => scoreWorkflowAware(out, { referenceFreezePath: refFreeze, root, expectedCohortSizes: { known: 2, challenge: 2 }, write: false, ...more });
  const refinalize = () => { rmSync(join(out, "generation-complete.json")); refreshUnload(); finalizeStudy({ outputDir: out, protocol: PROTOCOL_ADAPTER, root }); };
  return { root, out, manifest, refFreeze, score, refinalize, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("full synthetic fixture verifies Fable and local Nano before separate cohort scoring", () => {
  const f = fixture(); try {
    const result = f.score(); assert.equal(result.audit.verifiedJobs, 32); assert.equal(result.audit.generationIntegrityVerifiedBeforeReferenceRead, true);
    assert.equal(Object.keys(result.scorecard.metrics).length, 16); assert.equal(result.scorecard.csvScored, false); assert.equal(result.scorecard.automaticPromotion, false);
    const metric = result.scorecard.metrics["knownDevelopment/known/fable/baseline/r1"];
    assert.equal(metric.denominator, 2); assert.equal(metric.agree, 2); assert.equal(metric.clinicianAction.TP, 1); assert.equal(metric.clinicianAction.FN, 0);
    const challenge = result.scorecard.metrics["authoredChallenge/challenge/fable/baseline/r1"];
    assert.equal(challenge.denominator, 2); assert.equal(challenge.clinicianAction.ambiguousReferenceCount, 1);
    assert.equal(challenge.falseOmission.denominator, 0); assert.equal(challenge.falseOmission.ambiguousReferenceSelfCare, 1);
    assert.equal(result.worksheet.status, "not_reviewed"); assert(result.worksheet.rows.every(r => r.reviewer === null && r.clinicalConclusion === null));
    assert(!JSON.stringify(result.scorecard).includes("accountedUSD"));
  } finally { f.cleanup(); }
});

test("paired screen exposes new required review misses, reduced urgent detection and additional referrals", () => {
  const f = fixture(); try {
    const result = f.score();
    const known = result.scorecard.contemporaneousComparisons["knownDevelopment/known/fable/workflow_contract/r1"] as { screen: { status: string; reasons: string[] }; newUnnecessaryReferralIds: string[]; changedCases: { message: string }[] };
    assert(known.screen.reasons.includes("lower_urgent_true_positive_count")); assert.deepEqual(known.newUnnecessaryReferralIds, ["K2"]);
    assert.equal(known.changedCases.length, 2); assert(known.changedCases.every(r => r.message));
    const authored = result.scorecard.contemporaneousComparisons["authoredChallenge/challenge/fable/workflow_contract/r1"] as { screen: { reasons: string[] }; newClinicianActionFnIds: string[] };
    assert.deepEqual(authored.newClinicianActionFnIds, ["Q1"]); assert(authored.screen.reasons.includes("new_required_clinician_false_negatives"));
  } finally { f.cleanup(); }
});

test("repeat instability and exact model disagreements are reported per case and repetition", () => {
  const f = fixture(); try {
    const result = f.score();
    const repeat = result.scorecard.withinArmRepeats["knownDevelopment/known/nano/workflow_contract"];
    assert.equal(repeat.replicates, 2); assert.equal(repeat.independentCases, 2); assert.equal(repeat.dispositionStableCases, 1);
    const k1 = repeat.cases.find(r => r.id === "K1")!; assert.deepEqual(k1.repeats.map(r => r.disposition), [UE, SC]);
    const cross = result.scorecard.fableNanoComparisons["knownDevelopment/known/workflow_contract/r2"] as { disagreementCases: { id: string; message: string; fable: { rationale: string }; nano: { rationale: string } }[] };
    assert(cross.disagreementCases.some(r => r.id === "K1" && r.message && r.fable.rationale && r.nano.rationale));
    const ops = result.operations["knownDevelopment/known/fable/baseline/r2"] as { medianLatencyMs: number; p95LatencyMs: number };
    assert.equal(ops.medianLatencyMs, 20); assert.equal(ops.p95LatencyMs, 20);
  } finally { f.cleanup(); }
});

test("incomplete Nano outputs remain failed required action in planned denominator", () => {
  const f = fixture({ failure: j => j.model === "nano" && j.arm === "workflow_contract" && j.caseId === "K1" && j.replicate === 1 }); try {
    const result = f.score(); const m = result.scorecard.metrics["knownDevelopment/known/nano/workflow_contract/r1"];
    assert.equal(m.denominator, 2); assert.equal(m.failedOutputs, 1); assert.equal(m.clinicianAction.FN, 1); assert.equal(m.clinicianAction.positiveReferenceFailures, 1);
    assert.equal(m.predictedSelfCare, 1); assert.equal(m.rows.find((r: { id: string }) => r.id === "K1")?.disposition, null);
    const comparison = result.scorecard.contemporaneousComparisons["knownDevelopment/known/nano/workflow_contract/r1"] as { screen: { reasons: string[] } };
    assert(comparison.screen.reasons.includes("unresolved_output_or_protocol_failures"));
  } finally { f.cleanup(); }
});

test("partial or modified generation blocks every reference read", () => {
  const f = fixture({ models: ["fable"], repeats: 1 }); try {
    rmSync(join(f.out, "generation-complete.json")); let reads = 0;
    assert.throws(() => f.score({ readReferenceFile: () => { reads++; throw new Error("Reference read too early"); } }), /not finalized/); assert.equal(reads, 0);
  } finally { f.cleanup(); }
  const g = fixture({ models: ["fable"], repeats: 1 }); try {
    const path = join(g.out, "raw", `${g.manifest.jobs[0].jobId}.json`); writeFileSync(path, readFileSync(path, "utf8") + " "); let reads = 0;
    assert.throws(() => g.score({ readReferenceFile: () => { reads++; return "{}"; } }), /Frozen (?:generation )?artifact changed/); assert.equal(reads, 0);
  } finally { g.cleanup(); }
});

test("source drift and request drift are caught before reference reads", () => {
  for (const which of ["source", "request"]) {
    const f = fixture({ models: ["fable"], repeats: 1 }); try {
      const path = which === "source" ? join(f.root, OWN_SOURCES[0]) : join(f.out, f.manifest.jobs[0].requestPath);
      writeFileSync(path, readFileSync(path, "utf8") + " "); let reads = 0;
      assert.throws(() => f.score({ readReferenceFile: () => { reads++; return "{}"; } })); assert.equal(reads, 0);
    } finally { f.cleanup(); }
  }
});

test("rehashing fabricated parsed Nano output cannot bypass raw-response parity", () => {
  const f = fixture({ models: ["nano"], repeats: 1 }); try {
    const job = f.manifest.jobs[0], path = join(f.out, "parsed", `${job.jobId}.json`), parsed = get(path);
    parsed.result.rationale = "Fabricated rationale absent from the native response."; put(path, parsed);
    const settlementPath = join(f.root, "ledger", `${f.manifest.studyId}--${job.jobId}-settlement.json`), settlement = get(settlementPath);
    settlement.parsedSHA256 = fileHash(path); put(settlementPath, settlement); f.refinalize();
    assert.throws(() => verifyWorkflowGeneration(f.out, f.root), /Raw\/parsed parity failure/);
  } finally { f.cleanup(); }
});

test("reference drift is detected after verified generation and scores remain append-only", () => {
  const f = fixture({ models: ["fable"], repeats: 1 }); try {
    const first = f.score({ write: true }), second = f.score({ write: true }); assert.deepEqual(first.audit, second.audit);
    const path = join(f.root, "challenge-targets.json"), target = get(path); target.cases[0].acceptedBuckets = [SC]; put(path, target);
    assert.throws(() => f.score(), /challenge targets changed/);
  } finally { f.cleanup(); }
});

test("single repetition does not claim measured repeatability", () => {
  const f = fixture({ models: ["fable"], repeats: 1 }); try {
    const result = f.score(); const r = result.scorecard.withinArmRepeats["knownDevelopment/known/fable/baseline"];
    assert.equal(r.reproducibilityMeasured, false); assert.equal(r.dispositionStableCases, null);
  } finally { f.cleanup(); }
});


test("archived dependency lock supports later offline verification, but archive drift blocks it", () => {
  const f = fixture({ models: ["fable"], repeats: 1 }); try {
    writeFileSync(join(f.root, "package-lock.json"), "fixture later dependency lock\n");
    assert.equal(f.score().audit.verifiedJobs, 8);
    writeFileSync(join(f.out, "runtime", "package-lock.json"), "modified archived bytes\n");
    let reads = 0;
    assert.throws(() => f.score({ readReferenceFile: () => { reads++; return "{}"; } })); assert.equal(reads, 0);
  } finally { f.cleanup(); }
});


test("cohort summaries retain the complete denominator when execution uses smaller phases", () => {
  const f = fixture({ models: ["fable"], repeats: 1, splitPhases: true }); try {
    const result = f.score();
    assert.equal(result.scorecard.metrics["knownDevelopment/known_a/fable/baseline/r1"].denominator, 1);
    assert.equal(result.scorecard.cohortSummaries["knownDevelopment/ALL_PHASES/fable/baseline/r1"].denominator, 2);
    const comparison = result.scorecard.contemporaneousComparisons["knownDevelopment/ALL_PHASES/fable/workflow_contract/r1"] as { newUnnecessaryReferralIds: string[]; screen: { reasons: string[] } };
    assert.deepEqual(comparison.newUnnecessaryReferralIds, ["K2"]); assert(comparison.screen.reasons.includes("lower_urgent_true_positive_count"));
  } finally { f.cleanup(); }
});
