import assert from "node:assert/strict";
import test from "node:test";
import { dataset, evaluationCases } from "../lib/cases.ts";
import { parseCheckpoint, serializeCheckpoint } from "../lib/durable-review-storage.ts";
import {
  ATTESTATION_STATEMENT,
  appendEvent,
  createExportEnvelope,
  createWorkspace,
  emptyJudgment,
  FOCUSED_REVIEW_FORM_VERSION,
  judgmentFromDraft,
  MAX_IMPORT_BYTES,
  parseImportedWorkspace,
  parseStoredWorkspace,
  recordStatus,
  stableStringify,
  summarizeWorkspace,
  validateJudgment,
  workspaceCsv,
} from "../lib/review-state.ts";

const caseIds = evaluationCases.map(({ id }) => id);
const completeDraft = {
  disposition: "EMERGENCY_NOW" as const,
  actionTiming: "EMERGENCY_NOW" as const,
  decisiveEvidence: "Abrupt severe symptoms with a time-sensitive red flag.",
  clinicalRationale: "The message supports emergency evaluation because delay may cause avoidable harm.",
  mustNotMiss: "Time-sensitive emergency",
  missingInformation: "Vitals and focused examination",
  riskIfWrong: "Delayed diagnosis and irreversible clinical deterioration",
  confidence: "high" as const,
  evidenceSufficiency: "sufficient" as const,
};

test("a case cannot count as reviewed from a prewritten proposal", () => {
  const workspace = createWorkspace(dataset, caseIds, "2026-09-06T12:00:00.000Z");
  assert.equal(summarizeWorkspace(workspace, evaluationCases).complete, 0);
  assert.equal(recordStatus(workspace.records.C01), "not_started");
});

test("the independent judgment requires a route and short reason, with compatible timing", () => {
  assert.ok(validateJudgment({ ...completeDraft, clinicalRationale: "" }).includes("Give a short reason for this route (at least 8 characters)."));
  assert.ok(validateJudgment({ ...completeDraft, disposition: "SELF_CARE", actionTiming: "EMERGENCY_NOW" }).includes("The action timing must match the selected disposition."));
  assert.deepEqual(judgmentFromDraft(completeDraft), { ...completeDraft, formVersion: FOCUSED_REVIEW_FORM_VERSION });
});

test("focused review locks with no optional answers invented and derives only unambiguous timing", () => {
  for (const [route, timing] of [["SELF_CARE", "SELF_CARE_ONLY"], ["SAME_DAY_IN_PERSON", "SAME_DAY_IN_PERSON"], ["EMERGENCY_NOW", "EMERGENCY_NOW"]] as const) {
    const draft = { ...emptyJudgment(), disposition: route, clinicalRationale: "TEST: reason specific to this message." };
    assert.deepEqual(validateJudgment(draft), []);
    const judgment = judgmentFromDraft(draft);
    assert.equal(judgment.actionTiming, timing);
    assert.equal(judgment.formVersion, FOCUSED_REVIEW_FORM_VERSION);
    for (const field of ["decisiveEvidence", "mustNotMiss", "missingInformation", "riskIfWrong", "confidence", "evidenceSufficiency"] as const) assert.equal(judgment[field], "");
    assert.equal(draft.actionTiming, ""); // Do not mutate saved drafts on validation.
  }
  const async = { ...emptyJudgment(), disposition: "ASYNC_PHYSICIAN" as const, clinicalRationale: "TEST: physician review required." };
  assert.deepEqual(validateJudgment(async), ["Choose same-day or routine physician review."]);
  for (const timing of ["ASYNC_SAME_DAY", "ASYNC_ROUTINE"] as const) assert.equal(judgmentFromDraft({ ...async, actionTiming: timing }).actionTiming, timing);
  assert.throws(() => judgmentFromDraft({ ...async, clinicalRationale: "?", actionTiming: "ASYNC_ROUTINE" }), /short reason/);
  assert.throws(() => judgmentFromDraft({ ...async, clinicalRationale: "x".repeat(4001) }), /4,000/);
});

test("focused and existing detailed reviews retain identical routing scores; uncertainty never silently excludes a case", () => {
  const workspace = createWorkspace(dataset, caseIds);
  const record = workspace.records.C02;
  record.blindJudgment = completeDraft;
  record.finalJudgment = completeDraft;
  record.completedAt = "2026-09-08T12:02:00.000Z";
  const detailed = summarizeWorkspace(workspace, evaluationCases);
  record.blindJudgment = judgmentFromDraft({ ...emptyJudgment(), disposition: "EMERGENCY_NOW", clinicalRationale: "TEST: emergency concern in the message." });
  record.finalJudgment = record.blindJudgment;
  const focused = summarizeWorkspace(workspace, evaluationCases);
  assert.equal(focused.complete, detailed.complete);
  assert.equal(focused.independentV0Matches, detailed.independentV0Matches);
  assert.equal(focused.independentSourceMatches, detailed.independentSourceMatches);
  assert.equal(focused.uncertaintyRecorded, 0);
  record.blindJudgment.evidenceSufficiency = "insufficient";
  const uncertain = summarizeWorkspace(workspace, evaluationCases);
  assert.equal(uncertain.uncertainReference, 1);
  assert.equal(uncertain.uncertaintyRecorded, 1);
  assert.equal(uncertain.complete, 1);
  assert.equal(uncertain.independentV0Matches, focused.independentV0Matches);
});

test("old drafts and detailed locked judgments round-trip unchanged; focused references remain portable", async () => {
  let workspace = createWorkspace(dataset, caseIds);
  workspace.records.C01.draft = { ...completeDraft, clinicalRationale: "TEST: previously saved reasoning; do not rewrite.", decisiveEvidence: "?" };
  workspace.records.C02 = { ...workspace.records.C02, draft: completeDraft, blindJudgment: completeDraft, finalJudgment: completeDraft, blindCommittedAt: "2026-09-08T12:01:00.000Z" };
  workspace = appendEvent(workspace, "C02", "blind_judgment_committed", "2026-09-08T12:01:00.000Z");
  const oldEnvelope = await createExportEnvelope(workspace, dataset);
  assert.deepEqual(await parseImportedWorkspace(stableStringify(oldEnvelope), dataset, caseIds), workspace);
  assert.equal(workspace.records.C02.blindJudgment?.formVersion, undefined);

  const focused = judgmentFromDraft({ ...emptyJudgment(), disposition: "EMERGENCY_NOW", clinicalRationale: "TEST: emergency concern needs immediate assessment." });
  workspace.records.C03 = { ...workspace.records.C03, draft: focused, blindJudgment: focused, finalJudgment: focused, blindCommittedAt: "2026-09-08T12:02:00.000Z", sourceAssessment: "acceptable", v0Assessment: "safe_and_appropriate", completedAt: "2026-09-08T12:03:00.000Z" };
  workspace = appendEvent(workspace, "C03", "blind_judgment_committed", "2026-09-08T12:02:00.000Z");
  workspace = appendEvent(workspace, "C03", "case_completed", "2026-09-08T12:03:00.000Z");
  const envelope = await createExportEnvelope(workspace, dataset);
  const restored = await parseImportedWorkspace(stableStringify(envelope), dataset, caseIds);
  assert.deepEqual(restored, workspace);
  assert.deepEqual(parseCheckpoint(serializeCheckpoint(workspace, 7), dataset, caseIds, "local-primary").workspace, workspace);
  assert.equal(restored.records.C03.blindJudgment?.confidence, "");
  assert.match(workspaceCsv(restored, evaluationCases), /pre_reveal_form_version/);
  // Relaxing optional fields cannot admit a locked answer with no core reason.
  workspace.records.C03.blindJudgment!.clinicalRationale = "";
  assert.throws(() => parseStoredWorkspace(stableStringify(workspace), dataset, caseIds), /locked judgment is incomplete/);
});

test("only locked and compared cases enter result denominators", () => {
  const workspace = createWorkspace(dataset, caseIds, "2026-09-06T12:00:00.000Z");
  workspace.records.C02 = {
    ...workspace.records.C02,
    draft: completeDraft,
    blindJudgment: completeDraft,
    finalJudgment: completeDraft,
    blindCommittedAt: "2026-09-06T12:01:00.000Z",
    sourceAssessment: "acceptable",
    v0Assessment: "safe_and_appropriate",
    completedAt: "2026-09-06T12:02:00.000Z",
  };
  const summary = summarizeWorkspace(workspace, evaluationCases);
  assert.equal(summary.complete, 1);
  assert.equal(summary.exactSourceMatches, 1);
  assert.equal(summary.exactV0Matches, 1);
});

test("the export round-trips with provenance and integrity", async () => {
  const workspace = createWorkspace(dataset, caseIds, "2026-09-06T12:00:00.000Z");
  workspace.reviewer = { name: "Physician reviewer", credentials: "MD" };
  const envelope = await createExportEnvelope(workspace, dataset, "2026-09-06T13:01:00.000Z");
  const restored = await parseImportedWorkspace(stableStringify(envelope), dataset, caseIds);
  assert.equal(restored.reviewer.name, "Physician reviewer");
  assert.match(envelope.integrity.digest, /^[a-f0-9]{64}$/);
  const tampered = stableStringify(envelope).replace("Physician reviewer", "Different reviewer");
  await assert.rejects(() => parseImportedWorkspace(tampered, dataset, caseIds), /integrity digest/);
  await assert.rejects(() => parseImportedWorkspace(stableStringify(workspace), dataset, caseIds), /audit bundle/);
  assert.equal(parseStoredWorkspace(stableStringify(workspace), dataset, caseIds).reviewer.name, "Physician reviewer");
});

test("post-reveal agreement cannot inflate primary pre-reveal evaluation", () => {
  const workspace = createWorkspace(dataset, caseIds, "2026-09-06T12:00:00.000Z");
  const row = evaluationCases.find(({ v0 }) => v0.disposition === "SELF_CARE")!;
  const record = workspace.records[row.id];
  record.blindJudgment = completeDraft;
  record.blindCommittedAt = "2026-09-06T12:01:00.000Z";
  record.finalJudgment = { ...completeDraft, disposition: "SELF_CARE", actionTiming: "SELF_CARE_ONLY" };
  record.postRevealRevisedAt = "2026-09-06T12:02:00.000Z";
  record.completedAt = "2026-09-06T12:03:00.000Z";
  const summary = summarizeWorkspace(workspace, evaluationCases);
  assert.equal(summary.independentV0Matches, 0);
  assert.equal(summary.exactV0Matches, 1);
  assert.equal(summary.revisedAfterReveal, 1);
  assert.match(workspaceCsv(workspace, evaluationCases), /pre_reveal_disposition/);
  record.completedAt = null;
  assert.equal(summarizeWorkspace(workspace, evaluationCases).complete, 0);
  assert.equal(summarizeWorkspace(workspace, evaluationCases).exactV0Matches, 0);
});

test("V1 browser workspaces migrate the combined escalation without losing review text", () => {
  const legacy = createWorkspace(dataset, caseIds, "2026-09-06T12:00:00.000Z") as unknown as Record<string, any>;
  legacy.schemaVersion = "counsel-physician-review-workspace/v1";
  legacy.records.C02.draft = { ...completeDraft, disposition: "URGENT_ESCALATION" };
  legacy.records.C03.draft = {
    ...completeDraft,
    disposition: "URGENT_ESCALATION",
    actionTiming: "SAME_DAY_IN_PERSON",
    clinicalRationale: "Same-day assessment is required, but emergency activation is not supported by the message.",
  };
  legacy.records.C04.draft = {
    ...completeDraft,
    disposition: "URGENT_ESCALATION",
    actionTiming: "",
    decisiveEvidence: "Partially entered evidence remains preserved.",
  };
  legacy.records.C05 = {
    ...legacy.records.C05,
    draft: { ...completeDraft, disposition: "URGENT_ESCALATION" },
    blindJudgment: { ...completeDraft, disposition: "URGENT_ESCALATION" },
    finalJudgment: { ...completeDraft, disposition: "URGENT_ESCALATION" },
    blindCommittedAt: "2026-09-06T12:01:00.000Z",
    sourceAssessment: "acceptable",
    v0Assessment: "safe_and_appropriate",
    completedAt: "2026-09-06T12:02:00.000Z",
  };
  legacy.events = [
    { sequence: 1, caseId: "C05", action: "blind_judgment_committed", at: "2026-09-06T12:01:00.000Z" },
    { sequence: 2, caseId: "C05", action: "case_completed", at: "2026-09-06T12:02:00.000Z" },
  ];

  const restored = parseStoredWorkspace(stableStringify(legacy), dataset, caseIds);
  assert.equal(restored.schemaVersion, "counsel-physician-review-workspace/v2");
  assert.equal(restored.records.C02.draft.disposition, "EMERGENCY_NOW");
  assert.equal(restored.records.C03.draft.disposition, "SAME_DAY_IN_PERSON");
  assert.equal(restored.records.C04.draft.disposition, "");
  assert.equal(restored.records.C04.draft.decisiveEvidence, "Partially entered evidence remains preserved.");
  assert.equal(restored.records.C05.blindJudgment?.disposition, "EMERGENCY_NOW");
  assert.equal(restored.records.C05.finalJudgment?.disposition, "EMERGENCY_NOW");
  assert.equal(restored.records.C05.sourceAssessment, null);
  assert.equal(restored.records.C05.v0Assessment, null);
  assert.equal(restored.records.C05.completedAt, null);
  assert.deepEqual(restored.events.map(({ action }) => action), ["blind_judgment_committed"]);
});

test("imports reject fabricated workflow completion and attestation", async () => {
  const workspace = createWorkspace(dataset, caseIds, "2026-09-06T12:00:00.000Z");
  for (const record of Object.values(workspace.records)) record.completedAt = "2026-09-06T12:01:00.000Z";
  workspace.reviewer = { name: "Fabricated", credentials: "Unverified" };
  workspace.attestation = { reviewerName: "Fabricated", statement: ATTESTATION_STATEMENT, signedAt: "2026-09-06T12:02:00.000Z" };
  const envelope = await createExportEnvelope(workspace, dataset, "2026-09-06T12:03:00.000Z");
  await assert.rejects(() => parseImportedWorkspace(stableStringify(envelope), dataset, caseIds), /without a blind judgment/);
});

test("imports bind source, proposal, and V0 provenance and cap payload size", async () => {
  const workspace = createWorkspace(dataset, caseIds, "2026-09-06T12:00:00.000Z");
  const mismatched = { ...dataset, referenceProposalHash: "f".repeat(64), predictionHash: "e".repeat(64) };
  const envelope = await createExportEnvelope(workspace, mismatched, "2026-09-06T12:03:00.000Z");
  await assert.rejects(() => parseImportedWorkspace(stableStringify(envelope), dataset, caseIds), /different source, proposal, or V0 artifacts/);
  await assert.rejects(() => parseImportedWorkspace("x".repeat(MAX_IMPORT_BYTES + 1), dataset, caseIds), /import limit/);
});

test("a fully completed and attested review remains portable", async () => {
  let workspace = createWorkspace(dataset, caseIds, "2026-09-06T12:00:00.000Z");
  for (const caseId of caseIds) {
    const lockedAt = "2026-09-06T12:01:00.000Z";
    const completedAt = "2026-09-06T12:02:00.000Z";
    workspace.records[caseId] = {
      ...workspace.records[caseId],
      draft: completeDraft,
      blindJudgment: completeDraft,
      finalJudgment: completeDraft,
      blindCommittedAt: lockedAt,
      sourceAssessment: "acceptable",
      v0Assessment: "safe_and_appropriate",
      completedAt,
    };
    workspace = appendEvent(workspace, caseId, "blind_judgment_committed", lockedAt);
    workspace = appendEvent(workspace, caseId, "case_completed", completedAt);
  }
  const signedAt = "2026-09-06T12:03:00.000Z";
  workspace.reviewer = { name: "Physician reviewer", credentials: "MD" };
  workspace.attestation = { reviewerName: "Physician reviewer", statement: ATTESTATION_STATEMENT, signedAt };
  workspace = appendEvent(workspace, null, "attestation_signed", signedAt);

  const envelope = await createExportEnvelope(workspace, dataset, "2026-09-06T12:04:00.000Z");
  const restored = await parseImportedWorkspace(stableStringify(envelope), dataset, caseIds);
  assert.equal(summarizeWorkspace(restored, evaluationCases).complete, 50);
  assert.equal(restored.attestation?.reviewerName, "Physician reviewer");
  // Do not strand older, already signed exports after clarifying the statement.
  workspace.attestation!.statement = "I personally reviewed every synthetic case, recorded my independent disposition before seeing the supplied label or V0 output, and have identified any post-reveal revisions in the audit record.";
  const legacy = await createExportEnvelope(workspace, dataset);
  assert.equal((await parseImportedWorkspace(stableStringify(legacy), dataset, caseIds)).attestation?.statement, workspace.attestation!.statement);
});

test("CSV export preserves all cases and neutralizes formula injection", () => {
  const workspace = createWorkspace(dataset, caseIds, "2026-09-06T12:00:00.000Z");
  workspace.records.C01.draft.decisiveEvidence = "=IMPORTXML(\"https://example.test\")";
  workspace.records.C01.finalJudgment = judgmentFromDraft({ ...completeDraft, decisiveEvidence: "=IMPORTXML(\"https://example.test\")" });
  const csv = workspaceCsv(workspace, evaluationCases);
  assert.equal(csv.trim().split("\n").length, 51);
  assert.match(csv, /'\=IMPORTXML/);
});
