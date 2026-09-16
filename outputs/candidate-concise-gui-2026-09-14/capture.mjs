/** Read-only runtime capture. No providers, browser control, clinical grading or mutations. */
import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { estimateStudyCost, STUDY_PRICING } from "../../src/evaluation/clinical-study-budget.ts";

const directory = fileURLToPath(new URL(".", import.meta.url));
const root = fileURLToPath(new URL("../../", import.meta.url));
const source = join(root, "apps/evaluation/.local/clinical-evidence-graph-v1");
const hash = value => createHash("sha256").update(value).digest("hex");
const json = value => JSON.stringify(value, null, 2) + "\n";
const writeOnce = (path, value) => {
  const text = json(value);
  if (existsSync(path)) {
    if (readFileSync(path, "utf8") !== text) throw new Error(`IMMUTABLE_CAPTURE_CONFLICT:${relative(root, path)}`);
    return;
  }
  writeFileSync(path, text, { flag: "wx", mode: 0o600 });
};
const copyOnce = (from, to) => {
  const before = readFileSync(from);
  if (existsSync(to)) {
    if (hash(readFileSync(to)) !== hash(before)) throw new Error(`IMMUTABLE_SOURCE_CHANGED:${relative(root, from)}`);
  } else copyFileSync(from, to, constants.COPYFILE_EXCL);
  if (hash(readFileSync(from)) !== hash(before) || hash(readFileSync(to)) !== hash(before)) throw new Error("CAPTURE_HASH_MISMATCH");
  return { source: relative(root, from), copied: relative(root, to), sha256: hash(before), bytes: before.byteLength };
};
for (const folder of ["runs", "events", "captures"]) mkdirSync(join(directory, folder), { recursive: true });
for (const argument of process.argv.slice(2)) {
  const match = /^([^=]{1,100})=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(argument);
  if (!match) throw new Error("USAGE: node capture.mjs 'C02=<run-uuid>'");
  const [, label, runId] = match;
  const run = JSON.parse(readFileSync(join(source, "runs", `${runId}.json`), "utf8"));
  const events = readFileSync(join(source, "events", `${runId}.jsonl`), "utf8").trim().split("\n").map(line => JSON.parse(line));
  const start = events.find(event => event.type === "started");
  if (run.runId !== runId || start?.runId !== runId || start.inputHash !== run.inputHash) throw new Error("CAPTURE_RUN_IDENTITY_MISMATCH");
  // A terminal event is required to prevent archiving an actively growing log.
  if (!events.some(event => event.type === "workflow_finished")) throw new Error("CAPTURE_RUN_NOT_FINISHED");
  const files = {
    run: copyOnce(join(source, "runs", `${runId}.json`), join(directory, "runs", `${runId}.json`)),
    events: copyOnce(join(source, "events", `${runId}.jsonl`), join(directory, "events", `${runId}.jsonl`)),
  };
  const record = {
    protocol: "immutable-gui-capture/v1", label, runId, files,
    sourceCompletedAt: run.completedAt, graphVersion: run.graph?.version ?? start.version,
    runVersion: run.version, clinicalPolicyVersion: run.graph?.clinicalPolicyVersion ?? start.clinicalPolicyVersion,
    config: start.config, promptHash: run.promptHash, inputHash: run.inputHash, answerHash: run.answerHash,
    status: run.status, release: run.graph?.release ?? null, failure: run.failure ?? null,
    disposition: run.answer?.disposition ?? null, reviewPriority: run.answer?.reviewPriority ?? null,
    patientMessage: run.answer?.patientMessage ?? null, reason: run.answer?.reason ?? null,
    earlyNotices: run.safetyNotices ?? [], transportAdmission: run.graph?.transportAdmission ?? null,
    careCorrectionReleased: run.graph?.careCorrectionReleased ?? null,
    finalJudge: run.graph?.judge ?? null,
    failedApplicationChecks: (run.checks ?? []).filter(check => check.status === "fail"),
    timing: { firstActionMs: run.firstActionMs, firstQuestionMs: run.firstQuestionMs, firstPatientReplyMs: run.firstPatientReplyMs, finalMs: run.durationMs, workflowMs: run.workflowDurationMs, tracePersistenceMs: run.tracePersistenceDurationMs },
    steps: run.steps, modelCalls: run.modelCalls, repairs: run.graph?.corrections ?? null,
    agentTimings: (run.agents ?? []).map(agent => ({ role: agent.role, model: agent.model, calls: agent.modelCalls, durationMs: agent.durationMs, firstTextDeltaMs: agent.firstTextDeltaMs, usage: agent.usage, failure: agent.failure })),
    traceId: run.traceId, tracePersisted: run.tracePersisted, eventLogPersisted: run.eventLogPersisted,
    estimatedUSD: estimateStudyCost(run), pricingVersion: STUDY_PRICING.version,
    clinicalApproval: false,
    limitation: "Exact runtime artifact capture, not an independent observation of browser rendering, patient receipt, clinical correctness or delivered care. All supplied attempts are retained, including failures. Cost is the standard token estimate, not an invoice; embedding and cache-specific charges are not included.",
  };
  writeOnce(join(directory, "captures", `${runId}.json`), record);
}
const captures = readdirSync(join(directory, "captures")).filter(name => name.endsWith(".json")).sort().map(name => JSON.parse(readFileSync(join(directory, "captures", name), "utf8"))).sort((a, b) => a.sourceCompletedAt.localeCompare(b.sourceCompletedAt) || a.runId.localeCompare(b.runId));
const rows = captures.map(record => {
  const run = JSON.parse(readFileSync(join(directory, "runs", `${record.runId}.json`), "utf8"));
  return { label: record.label, runId: record.runId, graphVersion: record.graphVersion, clinicalPolicyVersion: record.clinicalPolicyVersion, promptHash: record.promptHash,
    corpusHashes: [...new Set((run.graph?.retrieval ?? []).map(result => result.corpusHash))],
    judgeStyle: record.config.judgeStyle, status: record.status, release: record.release, failure: record.failure, disposition: record.disposition, reviewPriority: record.reviewPriority, repairs: record.repairs, ...record.timing, modelCalls: record.modelCalls, estimatedUSD: record.estimatedUSD, failedChecks: record.failedApplicationChecks.map(check => check.id) };
});
const profiles = [];
for (const row of rows) {
  let profile = profiles.find(item => item.graphVersion === row.graphVersion && item.clinicalPolicyVersion === row.clinicalPolicyVersion && item.promptHash === row.promptHash);
  if (!profile) { profile = { graphVersion: row.graphVersion, clinicalPolicyVersion: row.clinicalPolicyVersion, promptHash: row.promptHash, runIds: [], estimatedUSD: 0 }; profiles.push(profile); }
  profile.runIds.push(row.runId); profile.estimatedUSD += row.estimatedUSD ?? 0;
}
const snapshot = {
  protocol: "immutable-gui-summary/v2",
  planErratum: "The unchanged plan.json initialProfile.graphVersion says clinical-evidence-graph/v15; the actual recorded initial graph version is evidence-graph/v15. This report corrects that naming typo without changing the plan.",
  captureErratum: "summary-3-f7de0b7e1d60.json used completed instead of the actual terminal enum complete and therefore mislabeled all three completed model-reviewed runs as finalFailures. That erroneous derived summary is retained; v2 corrects the classification without changing any source run, capture, status or clinical verdict.",
  attemptsCaptured: captures.length,
  estimatedUSD: captures.reduce((sum, record) => sum + (record.estimatedUSD ?? 0), 0),
  unknownCosts: captures.filter(record => record.estimatedUSD === null).map(record => record.runId),
  separateCompletedFixedPacketStudyUSD: 2.53834,
  softStopUSD: 15, maximumAssessments: 10,
  finalFailures: rows.filter(row => row.failure !== null || row.status !== "complete" || row.release !== "model_reviewed").map(row => row.runId),
  profiles,
  rows,
  limitation: "Descriptive consecutive GUI-run artifact summary; no fixed-packet baseline, no causal end-to-end speed claim, no p95 inference, no physician or clinical-readiness attestation. A model_reviewed release is a machine-review result, not clinician approval. This capture script does not dispatch or authorize calls.",
};
const path = join(directory, `summary-${captures.length}-${hash(json(snapshot)).slice(0, 12)}.json`);
writeOnce(path, snapshot);
console.log(JSON.stringify({ path: relative(root, path), ...snapshot }, null, 2));
