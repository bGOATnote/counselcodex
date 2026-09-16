import test, { after } from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SensitiveDataFilter } from "@mastra/observability";
import { readCsv } from "../src/lib/csv.mjs";
import { GRADER_DEFINITIONS } from "../src/evaluation/handoff-graders.mjs";
import { SENSITIVE_FIELDS, mastra, observability } from "../src/mastra/legacy-index.ts";
import { routeWithMastra, runClinicalIntakeWithMastra } from "../src/mastra/run.ts";
import { clinicalHandoffCriterionScorers } from "../src/mastra/scorers/clinical-handoff.ts";
import { routeMessage } from "../src/workflows/disposition-workflow.mjs";
import { baseEpisode } from "../data/cqa/research-fixtures.ts";
import { CQA_CRITERIA } from "../src/cqa/rubrics.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
after(async () => mastra.shutdown());

test("actual Mastra workflow matches the local workflow and all 50 in-sample labels", async () => {
  const [messages, proposalRows] = await Promise.all([
    readCsv(resolve(root, "data/patient_messages.csv")),
    readCsv(resolve(root, "data/clinician_development_review.csv")),
  ]);
  const proposalById = new Map(proposalRows.map((row: Record<string, string>) => [row.id, row.clinician_disposition]));
  for (const row of messages as Record<string, string>[]) {
    const [actual, local] = await Promise.all([routeWithMastra(row.message, row.id), routeMessage({ message: row.message, id: row.id })]);
    assert.equal(actual.disposition, proposalById.get(row.id), row.id);
    assert.equal(actual.disposition, local.disposition, `${row.id} parity`);
    assert.equal(actual.overrideBlocked, local.overrideBlocked, `${row.id} gate parity`);
  }
});

test("Mastra registers the clinical agent and emergency-aware intake workflow", async () => {
  const agent = mastra.getAgent("clinicalIntakeAgent");
  assert.equal(agent.id, "clinical-intake-agent");
  assert.equal(await agent.getMemory(), undefined);

  const result = await runClinicalIntakeWithMastra({
    turns: [{ role: "patient", content: "I cannot breathe or speak in full sentences." }],
  });
  assert.equal(result.finalDisposition, "EMERGENCY_NOW");
  assert.equal(result.agentStatus, "bypassed_emergency");
  assert.equal(result.agentInvoked, false);
});

test("Mastra tools declare read-only and idempotent MCP semantics", () => {
  for (const tool of Object.values(mastra.listTools() ?? {})) {
    assert.equal(tool.requireApproval, false);
    assert.equal(tool.mcp?.annotations?.readOnlyHint, true);
    assert.equal(tool.mcp?.annotations?.destructiveHint, false);
    assert.equal(tool.mcp?.annotations?.idempotentHint, true);
    assert.equal(tool.mcp?.annotations?.openWorldHint, false);
  }
});

test("Mastra registers and executes each CQA criterion independently", async () => {
  const scorers = (mastra.listScorers() ?? {}) as Record<string, { id: string }>;
  for (const { id } of GRADER_DEFINITIONS) {
    const key = `clinicalHandoff_${id}`;
    assert.ok(scorers[key], `missing independent scorer ${key}`);
    assert.equal(scorers[key].id, `clinical-handoff-${id.replaceAll("_", "-")}`);
  }
  assert.ok(scorers.clinicalHandoffContractScorer);

  const input = { turns: [{ role: "patient" as const, content: "I cannot breathe or speak in full sentences." }] };
  const output = await runClinicalIntakeWithMastra(input);
  for (const [key, scorer] of Object.entries(clinicalHandoffCriterionScorers)) {
    const result = await scorer.run({ input, output });
    assert.equal(result.score, 1, `${key} failed: ${result.reason}`);
    assert.ok(result.reason, `${key} did not produce an auditable reason`);
  }
});

test("configured sensitive-field policy redacts clinical and credential fields", () => {
  const filter = new SensitiveDataFilter({ sensitiveFields: SENSITIVE_FIELDS, redactionStyle: "full" });
  const filtered = filter.process({
    id: "span-1",
    traceId: "trace-1",
    name: "redaction-test",
    type: "workflow_run",
    startTime: new Date(),
    input: { message: "patient words", authorization: "Bearer secret" },
    output: { originalMessage: "patient words", patientId: "patient-42", disposition: "SELF_CARE" },
    attributes: {},
    metadata: {},
  } as never) as unknown as { input: Record<string, string>; output: Record<string, string> };
  assert.equal(filtered.input.message, "[REDACTED]");
  assert.equal(filtered.input.authorization, "[REDACTED]");
  assert.equal(filtered.output.originalMessage, "[REDACTED]");
  assert.equal(filtered.output.patientId, "[REDACTED]");
  assert.equal(filtered.output.disposition, "SELF_CARE");
});

test("durable workflow snapshot persistence is disabled", async () => {
  const workflowStore = await mastra.getStorage()?.getStore("workflows");
  assert.equal(workflowStore?.constructor.name, "WorkflowsInMemory");
});

test("persisted Mastra trace retains topology but no clinical payload", async () => {
  const canary = "TRACE_PAYLOAD_CANARY_91dc";
  await routeWithMastra(`Routine question ${canary}`, "CASE_PAYLOAD_CANARY_91dc");
  await observability.flush();
  const store = await mastra.getStorage()?.getStore("observability");
  assert.ok(store);
  const listed = await store.listTraces({
    filters: { tags: ["synthetic-validation", "no-external-export"] },
    pagination: { page: 0, perPage: 1 },
    orderBy: { field: "startedAt", direction: "DESC" },
  });
  assert.equal(listed.spans.length, 1);
  const trace = await store.getTrace({ traceId: listed.spans[0].traceId });
  assert.ok(trace);
  assert.deepEqual(
    new Set(trace.spans.map(({ spanType }) => spanType)),
    new Set(["workflow_run", "workflow_parallel", "workflow_step"]),
  );
  assert.equal(trace.spans.filter(({ spanType }) => spanType === "workflow_step").length, 4);
  assert.equal(trace.spans.every(({ input, output }) => input == null && output == null), true);
  assert.equal(JSON.stringify(trace).includes(canary), false);
  assert.equal(JSON.stringify(trace).includes("CASE_PAYLOAD_CANARY_91dc"), false);
});

test("registered quality workflow is dry-run and its persisted trace excludes clinical evidence", async () => {
  const canary = "CQA_TRACE_PRIVATE_CANARY";
  const episode = baseEpisode("CQA_TRACE_ID_CANARY");
  episode.sources[0].text += ` ${canary}`;
  const registeredAgents = mastra.listAgents() as Record<string, unknown>;
  for (const { id } of CQA_CRITERIA) assert.ok(registeredAgents[`quality_${id}`]);
  const workflow = mastra.getWorkflow("counselQualityAuditWorkflow");
  const result = await (await workflow.createRun()).start({ inputData: episode, tracingOptions: { hideInput: true, hideOutput: true, tags: ["cqa-trace-test"] } });
  assert.equal(result.status, "success");
  if (result.status !== "success") assert.fail("quality workflow did not complete");
  assert.equal(result.result.counts.abstain, 3);
  assert.equal(result.result.clinicalMonitoringEligible, false);
  await observability.flush();
  const store = await mastra.getStorage()?.getStore("observability");
  assert.ok(store);
  const listed = await store.listTraces({ filters: { tags: ["cqa-trace-test"] }, pagination: { page: 0, perPage: 1 }, orderBy: { field: "startedAt", direction: "DESC" } });
  assert.equal(listed.spans.length, 1);
  const trace = await store.getTrace({ traceId: listed.spans[0].traceId });
  assert.ok(trace);
  assert.ok(trace.spans.some(({ spanType }) => spanType === "workflow_step"));
  assert.ok(trace.spans.some(({ spanType }) => spanType === "workflow_loop"));
  assert.ok(trace.spans.length >= 8, `Expected workflow, preparation, five assessments and aggregation; observed ${trace.spans.length} spans`);
  assert.equal(trace.spans.every(({ input, output }) => input == null && output == null), true);
  assert.equal(JSON.stringify(trace).includes(canary), false);
  assert.equal(JSON.stringify(trace).includes(episode.episodeId), false);
});

test("intake safety inventory is returned locally but quoted clinical data never reaches persisted traces", async () => {
  const canary = "INTAKE_SAFETY_QUOTE_CANARY";
  const output = await runClinicalIntakeWithMastra({ turns: [{ role: "patient", content: `I cannot breathe or speak in full sentences. Pulse 140 ${canary}.` }] });
  assert.equal(output.agentInvoked, false);
  assert.equal(output.finalDisposition, "EMERGENCY_NOW");
  assert.ok(JSON.stringify(output.safetyReview).includes(canary));
  await observability.flush();
  const store = await mastra.getStorage()?.getStore("observability");
  assert.ok(store);
  const listed = await store.listTraces({ filters: { tags: ["clinical-intake", "synthetic-only", "no-external-export"] }, pagination: { page: 0, perPage: 1 }, orderBy: { field: "startedAt", direction: "DESC" } });
  assert.equal(listed.spans.length, 1);
  const trace = await store.getTrace({ traceId: listed.spans[0].traceId });
  assert.ok(trace);
  assert.ok(trace.spans.some(({ spanType }) => spanType === "workflow_step"));
  assert.equal(trace.spans.every(({ input, output }) => input == null && output == null), true);
  assert.equal(JSON.stringify(trace).includes(canary), false);
});
