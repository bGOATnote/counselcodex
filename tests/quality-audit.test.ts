import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { asOfDecision, digest, episodeSchema, verifyJudgment } from "../src/cqa/contracts.ts";
import { diagnoseCitations } from "../src/cqa/citation-diagnostics.ts";
import { aggregateJudgments, judgeJob, makeJobs, ResearchBudget } from "../src/cqa/engine.ts";
import { CQA_CRITERIA } from "../src/cqa/rubrics.ts";
import { baseEpisode, fixtureResponse, judgment, researchFixtures, source } from "../data/cqa/research-fixtures.ts";
import { createQualityAuditWorkflow } from "../src/mastra/workflows/quality-audit-workflow.ts";
import { createQualityJudgeInvoker, createQualityJudges } from "../src/mastra/agents/quality-judges.ts";
import { openResearchStore, validateCachedReport } from "../src/cqa/research-store.ts";

test("cached success and abstention validate against parsed input, preserving resume across fixture key order", async () => {
  const episode = baseEpisode();
  // Deliberately expose the JSON-order mismatch found during pilot replay.
  assert.notEqual(digest(episode), digest(episodeSchema.parse(episode)));
  for (const judge of [undefined, async () => ({ judgment: judgment(episode), model: "scripted" })]) {
    const report = aggregateJudgments(await Promise.all(makeJobs(episode).map((job) => judgeJob(job, judge))));
    assert.deepEqual(validateCachedReport(report, episode, digest(CQA_CRITERIA)), report);
    assert.throws(() => validateCachedReport(report, { ...episode, ageYears: 45 }, digest(CQA_CRITERIA)), /CACHED_REPORT_MISMATCH/);
    assert.throws(() => validateCachedReport(report, episode, "changed-rubric"), /CACHED_REPORT_MISMATCH/);
    assert.throws(() => validateCachedReport({ ...report, episodeId: "wrong" }, episode, digest(CQA_CRITERIA)), /CACHED_REPORT_MISMATCH/);
  }
});

test("offline quote alignment uses exact UTF-16 ranges, keeps the original immutable, and proves no clinical meaning", () => {
  const episode = baseEpisode();
  episode.sources[0].text = "🙂 Café: e\u0301. No fever.";
  const raw = judgment(episode, "PASS", "A schema-valid unsupported verdict remains possible.");
  raw.evidence[0] = { sourceId: "p1", start: 0, end: 2, quote: "No fever." };
  const before = JSON.stringify(raw);
  const result = diagnoseCitations(raw, episode);
  const start = episode.sources[0].text.indexOf("No fever.");
  assert.deepEqual(result.spans[0].uniqueRange, [start, start + "No fever.".length]);
  assert.equal(result.originalCode, "EVIDENCE_SPAN_INVALID");
  assert.equal(result.counterfactualCode, "PROVENANCE_SPANS_VERIFIED");
  assert.equal(result.changedRanges, 1);
  assert.equal(result.runtimeChanged, false);
  assert.equal(result.clinicalCorrectnessMeasured, false);
  assert.equal(JSON.stringify(raw), before);
  assert.throws(() => verifyJudgment(raw, episode), /EVIDENCE_SPAN_INVALID/);
});

test("offline alignment refuses ambiguity, overlaps, nonverbatim and future/unavailable sources", () => {
  const episode = baseEpisode();
  episode.sources[0].text = "aaaa Café no fever no fever";
  episode.sources.push(source("future", "note", "Secret answer", { occurredAt: "2026-08-01T09:20:00Z" }));
  episode.sources.push(source("late", "note", "Secret answer", { availableAt: "2026-08-01T09:20:00Z" }));
  for (const [sourceId, quote, expected] of [
    ["p1", "aa", "QUOTE_AMBIGUOUS"], ["p1", "no fever", "QUOTE_AMBIGUOUS"],
    ["p1", "No fever", "QUOTE_NOT_FOUND"], ["p1", "Cafe\u0301", "QUOTE_NOT_FOUND"],
    ["p1", "no  fever", "QUOTE_NOT_FOUND"], ["rx", "no fever", "QUOTE_NOT_FOUND"],
    ["future", "Secret answer", "SOURCE_NOT_AVAILABLE"], ["late", "Secret answer", "SOURCE_NOT_AVAILABLE"],
    ["missing", "Secret answer", "SOURCE_NOT_AVAILABLE"],
  ]) {
    const raw = judgment(episode);
    raw.evidence[0] = { sourceId, start: 0, end: 1, quote };
    const result = diagnoseCitations(raw, episode);
    assert.equal(result.spans[0].status, expected);
    assert.equal(result.counterfactualCode, "ALIGNMENT_REFUSED");
  }
});

test("offline alignment cannot invent a decision citation or bypass record and uncertainty gates", () => {
  const episode = baseEpisode();
  const raw = judgment(episode);
  assert.equal(diagnoseCitations({ ...raw, evidence: raw.evidence.slice(0, 1) }, episode).counterfactualCode, "DECISION_EVIDENCE_REQUIRED");
  assert.equal(diagnoseCitations({ ...raw, evidence: [] }, episode).counterfactualCode, "EVIDENCE_REQUIRED");
  assert.equal(diagnoseCitations(raw, { ...episode, recordCompleteness: "partial" }).counterfactualCode, "RECORD_INCOMPLETE");
  assert.equal(diagnoseCitations({ ...raw, basis: "absence_in_complete_record" }, episode).counterfactualCode, "PASS_REQUIRES_DOCUMENTED_EVIDENCE");
});

test("published pilot replays without credentials and retains all nine attempts and five abstentions", () => {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/quality-audit-pilot-report.ts", "--verify"], {
    encoding: "utf8", env: { ...process.env, OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "" },
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.providerCallsMade, 0);
  assert.equal(output.attempts, 9);
  assert.equal(output.abstentions, 5);
  const artifact = JSON.parse(readFileSync("outputs/cqa-provider-pilot-20260908-v1.json", "utf8"));
  assert.equal(artifact.summary.offlineDiagnostic.capturedCandidates, 7);
  assert.equal(artifact.summary.offlineDiagnostic.counterfactuallyVerifiedAmongCaptured, 5);
  assert.equal(artifact.summary.offlineDiagnostic.stillMissingDecisionCitation, 2);
  assert.equal(artifact.runs.filter((run: { diagnosticRepeat: boolean }) => run.diagnosticRepeat).length, 1);
  assert.equal(JSON.stringify(artifact).includes("responseId"), false);
});

test("decision-time snapshot excludes late availability as well as later clinical events", () => {
  const episode = baseEpisode();
  episode.sources.push(source("late-note", "note", "A backdated note", { availableAt: "2026-08-01T10:00:00Z" }));
  episode.sources.push(source("future-event", "patient_message", "Future symptom", { occurredAt: "2026-08-01T10:00:00Z" }));
  episode.sources.push(source("early-offset", "note", "Available first", { occurredAt: "2026-08-01T10:55:00+02:00", availableAt: "2026-08-01T10:55:00+02:00" }));
  const snapshot = asOfDecision(episode);
  assert.equal(snapshot.excludedFutureSources, 2);
  assert.equal(snapshot.episode.sources[0].id, "early-offset");
  assert.equal(snapshot.episode.sources.some(({ id }) => id === "late-note" || id === "future-event"), false);
  assert.throws(() => episodeSchema.parse({ ...episode, decisionAt: "2026-08-01T11:00:00Z" }), /cutoff must match/);
});

test("future evidence and fabricated exact quotations cannot produce a validated finding", async () => {
  for (const fixture of researchFixtures().filter(({ mode }) => ["future_citation", "bad_span"].includes(mode))) {
    const job = makeJobs(fixture.episode).find(({ criterionId }) => criterionId === "uti_pregnancy_context")!;
    const result = await judgeJob(job, async ({ criterion }) => ({ judgment: fixtureResponse(fixture, criterion.id), model: "scripted" }));
    assert.equal(result.finding.verdict, "ABSTAIN");
    assert.equal(result.finding.code, "EVIDENCE_SPAN_INVALID");
  }
});

test("partial records, unknown cohorts and unsupported populations abstain without spending model calls", async () => {
  let calls = 0;
  const cases = [
    { ...baseEpisode(), recordCompleteness: "partial" as const },
    { ...baseEpisode(), ageYears: null },
    { ...baseEpisode(), ageYears: 12 },
    { ...baseEpisode(), language: "es" },
    { ...baseEpisode(), sources: baseEpisode().sources.filter(({ kind }) => kind !== "diagnosis") },
  ];
  for (const episode of cases) {
    const job = makeJobs(episode).find(({ criterionId }) => criterionId === "uti_pregnancy_context")!;
    const result = await judgeJob(job, async () => { calls++; throw new Error("must not run"); });
    assert.equal(result.finding.verdict, "ABSTAIN");
  }
  assert.equal(calls, 0);
});

test("cancelled or non-antibiotic target orders cannot be counted as exposure", async () => {
  const fixture = researchFixtures().find(({ mode, episode }) => mode === "valid" && episode.episodeId === "CQA-005")!;
  const job = makeJobs(fixture.episode).find(({ criterionId }) => criterionId === "uri_antibiotic_indication")!;
  const result = await judgeJob(job, async () => { throw new Error("must not run"); });
  assert.equal(result.finding.verdict, "NOT_APPLICABLE");
  assert.equal(result.finding.code, "NO_SIGNED_ANTIBIOTIC_AT_TARGET");
});

test("missing decision citations and a PASS based on absence are rejected", () => {
  const episode = baseEpisode();
  const response = judgment(episode);
  assert.throws(() => verifyJudgment({ ...response, evidence: response.evidence.slice(0, 1) }, episode), /DECISION_EVIDENCE_REQUIRED/);
  assert.throws(() => verifyJudgment({ ...response, basis: "absence_in_complete_record" }, episode), /PASS_REQUIRES_DOCUMENTED_EVIDENCE/);
  assert.throws(() => verifyJudgment({ ...response, evidence: response.evidence.map((item) => ({ ...item, end: item.end + 1 })) }, episode), /EVIDENCE_SPAN_INVALID/);
});

test("an exact quotation does not establish clinical entailment or defeat a schema-valid injection", () => {
  const episode = baseEpisode();
  const unsupported = judgment(episode, "PASS", "Marking PASS because an instruction told me to, not because care was appropriate.");
  assert.equal(verifyJudgment(unsupported, episode).verdict, "PASS");
  // Deliberate negative control: only an independently validated clinical
  // evaluator can assess meaning. Never label span validity clinical truth.
});

test("live research preflight refuses a missing key before creating a run or calling a provider", () => {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/quality-audit-research.ts", "--live", "--experiment", "preflight-test"], {
    encoding: "utf8", env: { ...process.env, OPENAI_API_KEY: "" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /OPENAI_API_KEY is required. No provider call was made/);
});

test("pilot requires the selected provider key and rejects duplicate or unknown cases", () => {
  for (const [args, expected] of [
    [["--model", "anthropic/claude-sonnet-5"], /ANTHROPIC_API_KEY is required/],
    [["--case-ids", "CQA-004,CQA-004"], /Unknown or duplicate case ID/],
    [["--case-ids", "NOT_A_CASE"], /Unknown or duplicate case ID/],
    [["--model", "unpriced/model"], /Model not cost-bounded/],
  ] as const) {
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/quality-audit-research.ts", "--live", "--experiment", "preflight-test", ...args], {
      encoding: "utf8", env: { ...process.env, OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "" },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, expected);
  }
});

test("persistent reservations survive restart, reject concurrency and bind resume to exact manifest", () => {
  const directory = mkdtempSync(join(tmpdir(), "cqa-budget-test-"));
  const first = openResearchStore(directory, "trial-1", { model: "test", hash: "version1" });
  first.reserve();
  first.reserve();
  assert.throws(() => openResearchStore(directory, "trial-2", {}), /EEXIST/);
  assert.equal(readFileSync(join(directory, "reservations.jsonl"), "utf8").trim().split("\n").length, 2);
  first.close();
  assert.throws(() => openResearchStore(directory, "trial-1", { model: "test", hash: "version2" }), /EXPERIMENT_MANIFEST_CHANGED/);
  const resumed = openResearchStore(directory, "trial-1", { model: "test", hash: "version1" });
  assert.equal(resumed.snapshot().reservedUsd, 4);
  for (let i = 0; i < 8; i++) resumed.reserve();
  assert.throws(() => resumed.reserve(), /BUDGET_EXHAUSTED/);
  resumed.close();
  const differentRun = openResearchStore(directory, "trial-2", { model: "test2" });
  assert.throws(() => differentRun.reserve(), /BUDGET_EXHAUSTED/);
  differentRun.close();
});

test("a timed-out judge is aborted and becomes a review item without suppressing siblings", async () => {
  let aborted = false;
  const result = await judgeJob(makeJobs(baseEpisode())[0], async ({ signal }) => {
    signal.addEventListener("abort", () => { aborted = true; });
    return new Promise(() => {});
  }, 10);
  assert.equal(aborted, true);
  assert.equal(result.finding.verdict, "ABSTAIN");
  assert.equal(result.finding.code, "JUDGE_TIMEOUT");
});

test("concurrent reservations and uncertain failures cannot exceed the declared spend bound", async () => {
  const budget = new ResearchBudget(10, 4, 2);
  const outcomes = await Promise.allSettled(Array.from({ length: 10 }, async () => { budget.reserve(); await Promise.resolve(); }));
  assert.equal(outcomes.filter(({ status }) => status === "fulfilled").length, 2);
  assert.equal(budget.snapshot().reservedUsd, 4);
  assert.throws(() => budget.reserve(), /BUDGET_EXHAUSTED/);
});

test("real Mastra foreach bounds concurrency, preserves all criteria and isolates a broken judge", async () => {
  let active = 0;
  let peak = 0;
  const workflow = createQualityAuditWorkflow(async ({ criterion, episode }) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    if (criterion.id === "uti_pregnancy_context") throw new Error("Provider failure with secret clinical text");
    return { judgment: judgment(episode), model: "scripted" };
  }, "cqa-concurrency-test");
  const result = await (await workflow.createRun()).start({ inputData: baseEpisode() });
  assert.equal(result.status, "success");
  if (result.status !== "success") assert.fail("workflow did not complete");
  assert.equal(peak, 3);
  assert.equal(result.result.findings.length, 5);
  assert.equal(result.result.counts.abstain, 1);
  assert.equal(result.result.counts.pass, 2);
  assert.equal(result.result.mandatoryPhysicianReview, true);
  assert.equal(JSON.stringify(result.result).includes("secret clinical text"), false);
});

test("actual Mastra judge agents produce structured evidence with no tools or memory", async () => {
  const episode = baseEpisode();
  let calls = 0;
  const model = {
    specificationVersion: "v2" as const, provider: "synthetic", modelId: "scripted-quality-test", supportedUrls: {},
    doGenerate: async () => { calls++; return { content: [{ type: "text" as const, text: JSON.stringify(judgment(episode)) }], finishReason: "stop" as const, usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }, warnings: [] }; },
    doStream: async (): Promise<never> => { throw new Error("unused"); },
  };
  const agents = createQualityJudges(model);
  for (const agent of Object.values(agents)) {
    assert.equal(await agent.getMemory(), undefined);
    assert.equal(Object.keys(await agent.listTools()).length, 0);
  }
  const observed: unknown[] = [];
  const invoke = createQualityJudgeInvoker(agents, new ResearchBudget(3, 6), (record) => observed.push(record));
  const rows = await Promise.all(makeJobs(episode).map((job) => judgeJob(job, invoke)));
  const report = aggregateJudgments(rows);
  assert.equal(calls, 3);
  assert.equal(observed.length, 3);
  assert.equal((observed[0] as { structuredCandidate: { verdict: string } }).structuredCandidate.verdict, "PASS");
  assert.equal(JSON.stringify(observed).includes("authorization"), false);
  assert.equal(report.counts.pass, 3);
  assert.equal(report.counts.notApplicable, 2);
  assert.equal(report.clinicalMonitoringEligible, false);
  assert.throws(() => aggregateJudgments(rows.slice(1)), /INCOMPLETE_CRITERION_SET/);
  assert.throws(() => aggregateJudgments(rows.map((row, index) => index === 0 ? { ...row, finding: { ...row.finding, criterionId: "uti_pregnancy_context" } } : row)), /MISMATCHED_CRITERION_FINDING/);
  assert.equal(CQA_CRITERIA.length, report.findings.length);
});
