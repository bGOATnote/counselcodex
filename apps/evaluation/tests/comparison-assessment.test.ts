import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { dataset, evaluationCases } from "../lib/cases.ts";
import * as contract from "../lib/comparison-assessment.ts";
import { parseCheckpoint, serializeCheckpoint } from "../lib/durable-review-storage.ts";
import { parseCsv } from "../lib/source-csv.ts";
import { reviewBackupStore } from "../lib/review-backup-store.ts";
import {
  appendEvent, comparisonErrors, createExportEnvelope, createWorkspace, emptyJudgment,
  judgmentFromDraft, parseImportedWorkspace, parseStoredWorkspace, stableStringify,
  summarizeWorkspace, workspaceCsv, type SourceAssessment, type V0Assessment,
} from "../lib/review-state.ts";

const ids = evaluationCases.map(({ id }) => id);
const at = "2026-09-10T17:00:00.000Z";

function fixture(source: SourceAssessment = "undertriaged", v0: V0Assessment = "undertriaged", notes = "") {
  let workspace = createWorkspace(dataset, ids, at);
  const judgment = judgmentFromDraft({ ...emptyJudgment(), disposition: "SAME_DAY_IN_PERSON", clinicalRationale: "TEST ONLY: in-person examination is needed; async intake is not the destination." });
  workspace.records.C04 = { ...workspace.records.C04, draft: judgment, blindJudgment: judgment, finalJudgment: judgment, blindCommittedAt: at, sourceAssessment: source, v0Assessment: v0, comparisonNotes: notes, completedAt: at };
  workspace = appendEvent(workspace, "C04", "blind_judgment_committed", at);
  return appendEvent(workspace, "C04", "case_completed", at);
}

test("both comparators accept the same explicit verdicts without duplicate reasoning or automatic answers", () => {
  for (const source of contract.clinicalAssessments) {
    for (const v0 of contract.clinicalAssessments) {
      const workspace = fixture(source, v0);
      assert.deepEqual(comparisonErrors(workspace.records.C04), []);
      assert.deepEqual(parseStoredWorkspace(stableStringify(workspace), dataset, ids), workspace);
      assert.equal(workspace.records.C01.sourceAssessment, null);
      assert.equal(workspace.attestation, null);
    }
  }
  const workspace = fixture();
  workspace.records.C04.sourceAssessment = null;
  assert.deepEqual(comparisonErrors(workspace.records.C04), ["Assess the supplied workflow label."]);
  assert.throws(() => parseStoredWorkspace(stableStringify(workspace), dataset, ids), /completed review is incomplete/);
  workspace.records.C04.sourceAssessment = "undertriaged";
  workspace.records.C04.blindJudgment!.clinicalRationale = "";
  assert.throws(() => parseStoredWorkspace(stableStringify(workspace), dataset, ids), /locked judgment is incomplete/);
});

test("definitive verdicts survive checkpoints, JSON export/import and CSV without changing the reference", async () => {
  const workspace = fixture("undertriaged", "wrong_action_or_timing");
  const serialized = serializeCheckpoint(workspace, 4);
  assert.deepEqual(parseCheckpoint(serialized, dataset, ids, "local-primary").workspace, workspace);
  const envelope = await createExportEnvelope(workspace, dataset, at);
  assert.deepEqual(await parseImportedWorkspace(stableStringify(envelope), dataset, ids), workspace);
  const row = parseCsv(workspaceCsv(workspace, evaluationCases)).find((row) => row.case_id === "C04")!;
  assert.equal(row.source_assessment, "undertriaged");
  assert.equal(row.v0_assessment, "wrong_action_or_timing");
  assert.equal(row.comparison_notes, "");
  assert.equal(row.pre_reveal_disposition, "SAME_DAY_IN_PERSON");
  assert.equal(row.clinical_rationale, row.pre_reveal_clinical_rationale);
});

test("old possible under-triage is preserved, never upgraded into a definitive wrong verdict", async () => {
  const workspace = fixture("possible_undertriage", "clinically_conservative", "TEST: preserve the earlier wording, even if later revised.");
  const envelope = await createExportEnvelope(workspace, dataset, at);
  assert.deepEqual(await parseImportedWorkspace(stableStringify(envelope), dataset, ids), workspace);
  const summary = summarizeWorkspace(workspace, evaluationCases);
  assert.equal(summary.possibleUndertriage, 1);
  assert.equal(summary.sourceVerdicts.legacy, 1);
  assert.equal(summary.sourceVerdicts.wrong, 0);
  assert.equal(summary.sourceVerdicts.undertriaged, 0);
  assert.equal(summary.v0Verdicts.legacy, 1);
  assert.equal(summary.v0Verdicts.appropriate, 0);
  assert.equal(contract.assessmentVerdict("possible_undertriage"), null);
  assert.equal(contract.assessmentVerdict("unsafe_or_inappropriate"), null);
  assert.equal(contract.assessmentLabel("possible_undertriage"), "Possible under-triage");
});

test("restarting disk storage recovers new verdicts and the earlier uncertain snapshot independently", async () => {
  const directory = mkdtempSync(join(tmpdir(), "counsel-comparison-test-"));
  const older = fixture("possible_undertriage", "clinically_conservative", "TEST: historical comparison wording.");
  const newer = fixture("undertriaged", "undertriaged");
  const store = reviewBackupStore(directory, dataset, ids);
  const oldReceipt = await store.save(stableStringify(older));
  const newReceipt = await store.save(stableStringify(newer));
  assert.notEqual(oldReceipt.id, newReceipt.id);
  const reopened = reviewBackupStore(directory, dataset, ids);
  assert.deepEqual(await parseImportedWorkspace(await reopened.load(oldReceipt.id), dataset, ids), older);
  assert.deepEqual(await parseImportedWorkspace(await reopened.load(newReceipt.id), dataset, ids), newer);
  assert.equal((await reopened.list()).backups.length, 2);
});

test("completed source and V0 judgments drive separate counts, not route agreement or draft denominators", () => {
  const workspace = fixture("undertriaged", "appropriate");
  const baseline = summarizeWorkspace(workspace, evaluationCases);
  assert.equal(baseline.sourceVerdicts.wrong, 1);
  assert.equal(baseline.sourceVerdicts.undertriaged, 1);
  assert.equal(baseline.v0Verdicts.appropriate, 1);
  assert.equal(baseline.v0Verdicts.wrong, 0);
  workspace.records.C04.v0Assessment = "wrong_action_or_timing";
  workspace.records.C04.sourceAssessment = "cannot_judge";
  const changed = summarizeWorkspace(workspace, evaluationCases);
  assert.equal(changed.v0Verdicts.wrong, 1);
  assert.equal(changed.sourceVerdicts.cannotJudge, 1);
  assert.equal(changed.independentSourceMatches, baseline.independentSourceMatches);
  assert.equal(changed.independentV0Matches, baseline.independentV0Matches);
  assert.equal(changed.complete, baseline.complete);
  workspace.records.C04.completedAt = null;
  const draft = summarizeWorkspace(workspace, evaluationCases);
  assert.equal(draft.v0Verdicts.wrong, 0);
  assert.equal(draft.complete, 0);
});

test("wrong subtypes aggregate once and unknown values cannot be counted as clinical verdicts", () => {
  const result = contract.summarizeAssessments([...contract.clinicalAssessments, "possible_undertriage", null]);
  assert.equal(result.wrong, 4);
  assert.equal(result.undertriaged, 1);
  assert.equal(result.legacy, 1);
  assert.equal(result.notRecorded, 1);
  assert.equal(result.appropriate + result.wrong + result.cannotJudge + result.legacy + result.notRecorded, 8);
  const workspace = fixture();
  const malformed = JSON.parse(stableStringify(workspace));
  malformed.records.C04.v0Assessment = "looks_good";
  assert.throws(() => parseStoredWorkspace(stableStringify(malformed), dataset, ids));
});

test("the actual form offers three consistent choices; wrong details appear only when relevant", async () => {
  const require = createRequire(import.meta.url);
  const { transform, loadBindings } = require("next/dist/build/swc");
  await loadBindings();
  const { code } = await transform(readFileSync(new URL("../components/comparison-assessment.tsx", import.meta.url), "utf8"), { filename: "comparison-assessment.tsx", jsc: { parser: { syntax: "typescript", tsx: true }, target: "es2022", transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
  const module = { exports: {} as { ComparisonAssessment: (props: Record<string, unknown>) => ReturnType<typeof createElement> } };
  new Function("require", "module", "exports", code)((id: string) => id === "../lib/comparison-assessment.ts" ? contract : require(id), module, module.exports);
  for (const legend of ["Original label", "V0 recommendation"]) {
    const render = (value: string | null) => renderToStaticMarkup(createElement(module.exports.ComparisonAssessment, { legend, value, onChange: () => {} }));
    const blank = render(null);
    assert.equal((blank.match(/type="radio"/g) ?? []).length, 3);
    assert.match(blank, /Appropriate/);
    assert.match(blank, />Wrong</);
    assert.match(blank, /Cannot judge/);
    assert.doesNotMatch(blank, /<select|checked=""|Possible under-triage/);
    assert.doesNotMatch(render("appropriate"), /<select/);
    assert.doesNotMatch(render("cannot_judge"), /<select/);
    const wrong = render("undertriaged");
    assert.match(wrong, /<option value="undertriaged" selected="">Under-triaged/);
    assert.match(wrong, /Wrong channel or timing/);
    const old = render("possible_undertriage");
    assert.match(old, /Previously saved: <strong>Possible under-triage/);
    assert.doesNotMatch(old, /checked=""|<select/);
  }
});

test("C04 research correction does not rewrite the known async routing failure or supplied data", () => {
  const sample = evaluationCases.find(({ id }) => id === "C04")!;
  assert.equal(sample.suppliedDisposition, "ASYNC_PHYSICIAN");
  assert.equal(sample.v0.disposition, "ASYNC_PHYSICIAN"); // Known baseline defect, not a desired clinical assertion.
  assert.match(sample.clinicalEvidence!.decisionPoint, /same-day in-person/);
  assert.match(sample.clinicalEvidence!.decisionPoint, /immediate acute care/);
  assert.deepEqual(sample.clinicalEvidence!.sourceIds, ["dfiinfection", "dfireferral"]);
  assert.ok(sample.clinicalEvidence!.sources.every((source) => source.url.startsWith("https://")));
  const runbook = readFileSync(new URL("../../../docs/DEMO_RUNBOOK_HISTORICAL_RULES.md", import.meta.url), "utf8");
  assert.match(runbook, /C04 · Foot wound\.\*\* Show the actual \*\*Async physician\*\*/);
  const current = readFileSync(new URL("../../../docs/DEMO_RUNBOOK.md", import.meta.url), "utf8");
  assert.match(current, /C04\*\* demonstrates same-day in-person assessment/);
  assert.match(current, /Historical HealthBench and rules-based scores describe historical candidates/);
});
