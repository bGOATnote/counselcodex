import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { dataset, evaluationCases } from "../lib/cases.ts";
import { clinicalBriefs, clinicalSources } from "../lib/evidence-catalog.ts";
import { evidenceForCase } from "../lib/clinical-evidence.ts";
import { comparisonEvidenceContext } from "../lib/evidence-contract.ts";
import { appendEvent, comparisonErrors, createExportEnvelope, createWorkspace, emptyJudgment, judgmentFromDraft, parseImportedWorkspace, parseStoredWorkspace, stableStringify, summarizeWorkspace, workspaceCsv } from "../lib/review-state.ts";

test("all 50 exact source messages have bounded briefs and resolvable, typed citations", () => {
  assert.equal(clinicalBriefs.length, 50);
  assert.equal(new Set(clinicalBriefs.map((b) => b.caseId)).size, 50);
  assert.equal(new Set(clinicalSources.map((s) => s.id)).size, clinicalSources.length);
  for (const row of evaluationCases) {
    const packet = row.clinicalEvidence;
    assert.ok(packet);
    assert.equal(packet.caseId, row.id);
    assert.equal(packet.sourceDatasetHash, dataset.sourceHash);
    assert.equal(packet.messageHash, createHash("sha256").update(row.message).digest("hex"));
    assert.ok(packet.differential.length <= 3);
    assert.ok(packet.decisionPoint.length < 450);
    assert.ok(packet.sources.length > 0);
    assert.deepEqual(packet.sourceIds, packet.sources.map((s) => s.id));
    for (const source of packet.sources) {
      assert.equal(new URL(source.url).protocol, "https:");
      assert.ok(source.kind && source.accessScope && source.reviewedAt);
      if (source.linkCheck) assert.equal(source.linkCheck.claimSupportVerified, false);
    }
  }
});

test("a reused case ID, modified message, unknown case or dataset never inherits clinical references", () => {
  const row = evaluationCases[1];
  assert.equal(evidenceForCase(row.id, dataset.sourceHash, "I need a harmless refill"), null);
  assert.equal(evidenceForCase(row.id, "0".repeat(64), row.message), null);
  assert.equal(evidenceForCase("C99", dataset.sourceHash, row.message), null);
});

test("briefs preserve clinical distinctions instead of fabricating confidence or refill diagnoses", () => {
  for (const id of ["C06", "C15", "C18", "C24", "C29", "C45", "C46"]) assert.deepEqual(clinicalBriefs.find((b) => b.caseId === id)?.differential, []);
  assert.match(clinicalBriefs.find((b) => b.caseId === "C02")!.decisionPoint, /911\/EMS/);
  assert.match(clinicalBriefs.find((b) => b.caseId === "C39")!.decisionPoint, /not proof of psychosis or intent/);
  assert.match(clinicalBriefs.find((b) => b.caseId === "C49")!.decisionPoint, /do not rule out/);
});

test("actual evidence component hides all guidance until reveal and distinguishes blocked links", async () => {
  const path = new URL("../components/clinical-evidence-panel.tsx", import.meta.url);
  const { transform, loadBindings } = createRequire(import.meta.url)("next/dist/build/swc");
  await loadBindings();
  const { code: js } = await transform(readFileSync(path, "utf8"), { filename: "clinical-evidence-panel.tsx", jsc: { parser: { syntax: "typescript", tsx: true }, target: "es2022", transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
  const module = { exports: {} as { ClinicalEvidencePanel: (props: Record<string, unknown>) => ReturnType<typeof createElement> } };
  new Function("require", "module", "exports", js)(createRequire(import.meta.url), module, module.exports);
  const Component = module.exports.ClinicalEvidencePanel;
  const packet = structuredClone(evaluationCases[1].clinicalEvidence!);
  packet.sources[0].linkCheck = { sourceId: packet.sourceIds[0], requestedUrl: packet.sources[0].url, checkedAt: "2026-09-10T12:00:00.000Z", status: "access_blocked", httpStatus: 403, finalUrl: packet.sources[0].url, claimSupportVerified: false };
  assert.equal(renderToStaticMarkup(createElement(Component, { packet, revealed: false })), "");
  const html = renderToStaticMarkup(createElement(Component, { packet, revealed: true }));
  assert.match(html, /Brief differential/);
  assert.match(html, /not part of the scored V0 response/);
  assert.match(html, /access blocked/);
  assert.match(html, /referrerPolicy="no-referrer"/i);
  assert.ok(html.includes(packet.sources[0].url));
  const compact = renderToStaticMarkup(createElement(Component, { packet, revealed: true, compact: true }));
  const visibleBrief = compact.slice(0, compact.indexOf("<details"));
  assert.match(visibleBrief, /Brief differential/);
  assert.ok(visibleBrief.includes(packet.sources[0].url));
  assert.match(visibleBrief, /not a diagnosis or V0 reasoning/);
  assert.match(compact, /<details class="mt-3">/);
  assert.equal(renderToStaticMarkup(createElement(Component, { packet, revealed: false, compact: true })), "");
  assert.match(renderToStaticMarkup(createElement(Component, { packet: null, revealed: true })), /No case-bound/);
});

test("evidence context round-trips without rewriting prior answers, scores or old provenance", async () => {
  const ids = evaluationCases.map((c) => c.id);
  let workspace = createWorkspace(dataset, ids, "2026-09-10T12:00:00.000Z");
  const before = structuredClone(workspace);
  const judgment = judgmentFromDraft({ ...emptyJudgment(), disposition: "EMERGENCY_NOW", clinicalRationale: "TEST: immediate emergency assessment needed." });
  workspace.records.C02 = { ...workspace.records.C02, draft: judgment, blindJudgment: judgment, finalJudgment: judgment, blindCommittedAt: "2026-09-10T12:01:00.000Z", sourceAssessment: "action_timing_underspecified", v0Assessment: "safe_and_appropriate", comparisonNotes: "TEST: this label does not establish immediate action." };
  workspace = appendEvent(workspace, "C02", "blind_judgment_committed", "2026-09-10T12:01:00.000Z");
  assert.deepEqual(comparisonErrors(workspace.records.C02), []);
  workspace.records.C02.completedAt = "2026-09-10T12:02:00.000Z";
  workspace = appendEvent(workspace, "C02", "case_completed", "2026-09-10T12:02:00.000Z");
  const score = summarizeWorkspace(workspace, evaluationCases);
  const safety = { version: evaluationCases[1].responseSafety!.version, hash: evaluationCases[1].responseSafetyHash! };
  workspace.records.C02.comparisonEvidence = comparisonEvidenceContext(evaluationCases[1].clinicalEvidence, "2026-09-10T12:02:00.000Z", safety);
  assert.equal(workspace.records.C02.comparisonEvidence!.safetyReviewHash, safety.hash);
  assert.deepEqual(summarizeWorkspace(workspace, evaluationCases), score);
  assert.equal(score.underspecifiedSource, 1);
  assert.deepEqual(workspace.records.C01, before.records.C01);
  assert.equal(workspace.records.C01.comparisonEvidence, undefined);
  const envelope = await createExportEnvelope(workspace, dataset);
  assert.deepEqual(await parseImportedWorkspace(stableStringify(envelope), dataset, ids), workspace);
  const csv = workspaceCsv(workspace, evaluationCases);
  assert.match(csv, /evidence_catalog_sha256/);
  assert.ok(csv.includes(evaluationCases[1].clinicalEvidence!.catalogHash));
  assert.match(csv, /safety_review_sha256/);
  assert.ok(csv.includes(safety.hash));
  const incompleteSafety = structuredClone(workspace);
  delete incompleteSafety.records.C02.comparisonEvidence!.safetyReviewHash;
  assert.throws(() => parseStoredWorkspace(stableStringify(incompleteSafety), dataset, ids));
  const invalid = structuredClone(workspace);
  invalid.records.C01.comparisonEvidence = workspace.records.C02.comparisonEvidence;
  assert.throws(() => parseStoredWorkspace(stableStringify(invalid), dataset, ids), /Evidence context/);
  invalid.records.C01.comparisonEvidence = undefined;
  invalid.records.C02.comparisonEvidence!.recordedAt = "2026-09-10T11:00:00.000Z";
  assert.throws(() => parseStoredWorkspace(stableStringify(invalid), dataset, ids), /Evidence context/);
});
