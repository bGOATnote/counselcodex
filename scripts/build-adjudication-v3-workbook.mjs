#!/usr/bin/env node
/** Build the separate physician v3 workbook from verified frozen outputs. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { ROOT, REFERENCE, scoreAdjudication } from "./score-physician-adjudication-v3.mjs";

const runtime = process.env.RUNTIME_ROOT || "/Users/kiteboard/.cache/codex-runtimes/codex-primary-runtime/dependencies";
const scratch = process.env.ADJUDICATION_WORKBOOK_TMP || "/private/tmp/counsel-adjudication-v3-workbook";
const qa = path.join(scratch, "qa");
await fs.mkdir(qa, { recursive: true });
try { await fs.symlink(path.join(runtime, "node/node_modules"), path.join(scratch, "node_modules"), "dir"); }
catch (error) { if (error.code !== "EEXIST") throw error; }
const runtimeRequire = createRequire(path.join(scratch, "resolver.cjs"));
const { Workbook, SpreadsheetFile } = await import(pathToFileURL(runtimeRequire.resolve("@oai/artifact-tool")).href);
const { scorecards, summary: sourceSummary, audit } = scoreAdjudication();
const reference = JSON.parse(await fs.readFile(REFERENCE, "utf8"));
const labels = { fableLow: "Fable 5.1 low", astraXhigh: "Astra extra-high", astraMax: "Astra max", opusLow: "Opus 5 low", fableMax: "Fable 5.1 max", historicalOpusFiveWayCollapsed: "Historical Opus, collapsed" };
const keys = Object.keys(labels);
const sources = reference.cases;
const byId = new Map(sources.map(row => [row.id, row]));
for (const row of sources) assert.equal(row.acceptedBuckets.length, 1, "This workbook requires one accepted three-bucket target per case");
const wb = Workbook.create();
const summary = wb.worksheets.add("Summary");
const clinical = wb.worksheets.add("Clinical review");
const differences = wb.worksheets.add("Astra differences");
const outputs = wb.worksheets.add("Frozen outputs");
const refs = wb.worksheets.add("Reference");
const navy = "#243866", ink = "#28354A", pale = "#EDF1F5", amber = "#FFF1D6";
function base(sheet, range, title) {
  sheet.showGridLines = false;
  sheet.getRange(range).format.font = { name: "Arial", size: 10, color: ink };
  sheet.getRange(range).format.verticalAlignment = "center";
  sheet.getRange("A2").values = [[title]];
  sheet.getRange("A2").format.font = { name: "Arial", size: 15, color: navy, bold: true };
  sheet.getRange("A2").format.rowHeight = 25;
}
function widths(sheet, definitions, lastRow) {
  for (const [col, width] of Object.entries(definitions)) sheet.getRange(`${col}1:${col}${lastRow}`).format.columnWidth = width;
}
function header(sheet, range) {
  sheet.getRange(range).format = { fill: navy, font: { name: "Arial", size: 10, bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center", verticalAlignment: "center", wrapText: true, rowHeight: 34 };
}
function table(sheet, range, name) {
  const item = sheet.tables.add(range, true, name);
  item.style = "TableStyleLight9";
  item.showFilterButton = true;
}
function longRows(sheet, range, height) {
  sheet.getRange(range).format.wrapText = true;
  sheet.getRange(range).format.verticalAlignment = "top";
  sheet.getRange(range).format.rowHeight = height;
}
function sourceNote(sheet, row, text) { sheet.getRange(`A${row}`).values = [[text]]; sheet.getRange(`A${row}`).format.rowHeight = 22; }

base(refs, "A1:F58", "Physician reference amendments");
sourceNote(refs, 4, "Source: physician-adjudication-v3-2026-09-15.json; physician-system-reference-v2.json. Repository data/evaluation/.");
sourceNote(refs, 5, "Single physician reassessment after viewing outputs. v2 values remain unchanged. C25 has no five-way amendment.");
refs.getRange("A7:F7").values = [["Case", "Exact synthetic message", "Previous five-way accepted routes", "v2 mapped target", "v3 target", "Amendment"]];
refs.getRange("A8:F57").values = sources.map(row => [row.id, row.message, row.previousAcceptedRoutes?.join("; ") ?? "UNRESOLVED", row.previousAcceptedBuckets?.join("; ") ?? "UNRESOLVED", row.acceptedBuckets[0], row.amendmentId ?? "Carried forward"]);
table(refs, "A7:F57", "ReferenceCases"); header(refs, "A7:F7");
widths(refs, { A: 8, B: 65, C: 32, D: 27, E: 27, F: 18 }, 58);
longRows(refs, "A8:F57", 74);
sources.forEach((row, i) => { refs.getRange(`A${i + 8}:F${i + 8}`).format.rowHeight = Math.max(38, Math.ceil(row.message.length / 65) * 12 + 8); });
refs.freezePanes.freezeRows(7); refs.freezePanes.freezeColumns(1);

base(outputs, "A1:M307", "Frozen outputs and separate reference scores");
sourceNote(outputs, 4, "Each row is one saved model response. The source file identifies the unmodified output. The reference is joined by case ID.");
sourceNote(outputs, 5, "Exact agreement: 1 = agree; 0 = disagree. Clinician action: TP/TN/FP/FN, defined on Summary. C25 is unscored under v2.");
outputs.getRange("A7:M7").values = [["Run", "Case", "Original disposition", "Three-bucket disposition", "v2 target", "v3 target", "v2 included", "v2 agreement", "v3 agreement", "v3 common 49", "Clinician action", "Exact frozen rationale", "Source file"]];
const outputRows = keys.flatMap(key => scorecards[key].rows.map(row => ({ ...row, key, runLabel: labels[key], source: `${scorecards[key].run.path}/${row.id}-parsed.json` })));
outputs.getRange("A8:M307").values = outputRows.map(row => [row.runLabel, row.id, row.originalDisposition, row.disposition, null, null, null, null, null, null, null, row.rationale, row.source]);
outputs.getRange("E8:K307").formulas = outputRows.map((_, i) => {
  const r = i + 8;
  return [`=VLOOKUP(B${r},Reference!$A$8:$F$57,4,FALSE)`, `=VLOOKUP(B${r},Reference!$A$8:$F$57,5,FALSE)`,
    `=IF(E${r}="UNRESOLVED",0,1)`, `=IF(G${r}=0,"unscored",IF(D${r}=E${r},1,0))`, `=IF(D${r}=F${r},1,0)`,
    `=IF(G${r}=0,"excluded",I${r})`, `=IF(F${r}="SELF_CARE",IF(D${r}="SELF_CARE","TN","FP"),IF(D${r}="SELF_CARE","FN","TP"))`];
});
table(outputs, "A7:M307", "FrozenResponses"); header(outputs, "A7:M7");
widths(outputs, { A: 29, B: 8, C: 28, D: 28, E: 28, F: 28, G: 11, H: 12, I: 12, J: 12, K: 14, L: 79, M: 95 }, 307);
longRows(outputs, "A8:M307", 86);
outputRows.forEach((row, i) => { outputs.getRange(`A${i + 8}:M${i + 8}`).format.rowHeight = Math.max(40, Math.ceil(row.rationale.length / 79) * 12 + 8); });
outputs.getRange("G8:K307").format.horizontalAlignment = "center";
outputs.getRange("H8:J307").conditionalFormats.add("cellIs", { operator: "equal", formula: 0, format: { fill: amber } });
outputs.freezePanes.freezeRows(7); outputs.freezePanes.freezeColumns(2);

base(summary, "A1:I28", "Physician adjudication v3"); summary.tabColor = navy;
sourceNote(summary, 3, "15 September 2026. Fifty synthetic messages. All predictions remain frozen.");
sourceNote(summary, 4, "Single physician, unblinded post-output reassessment. Changed agreement reflects reference amendments, not model improvement.");
summary.getRange("A6:I6").values = [["Run", "v2 agree", "v2 n", "v3 common 49 agree", "Common n", "C25 agree", "v3 agree", "v3 n", "Generation taxonomy"]];
summary.getRange("A7:I12").values = keys.map(key => [labels[key], null, null, null, null, null, null, null, key === "historicalOpusFiveWayCollapsed" ? "Five ways, mapped after generation" : "Three buckets"]);
for (const [index, key] of keys.entries()) {
  const r = index + 7, criteria = `$A${r}`;
  summary.getRange(`B${r}:H${r}`).formulas = [[
    `=SUMIFS('Frozen outputs'!$H$8:$H$307,'Frozen outputs'!$A$8:$A$307,${criteria})`,
    `=SUMIFS('Frozen outputs'!$G$8:$G$307,'Frozen outputs'!$A$8:$A$307,${criteria})`,
    `=SUMIFS('Frozen outputs'!$J$8:$J$307,'Frozen outputs'!$A$8:$A$307,${criteria})`, `=C${r}`,
    `=SUMIFS('Frozen outputs'!$I$8:$I$307,'Frozen outputs'!$A$8:$A$307,${criteria},'Frozen outputs'!$B$8:$B$307,"C25")`,
    `=SUMIFS('Frozen outputs'!$I$8:$I$307,'Frozen outputs'!$A$8:$A$307,${criteria})`,
    `=COUNTIFS('Frozen outputs'!$A$8:$A$307,${criteria})`]];
  assert.ok(scorecards[key]);
}
header(summary, "A6:I6");
widths(summary, { A: 31, B: 11, C: 9, D: 17, E: 11, F: 11, G: 11, H: 9, I: 38 }, 28);
summary.getRange("A7:I12").format.rowHeight = 32;
summary.getRange("A7:I7").format.fill = pale;
summary.getRange("B7:H12").format.horizontalAlignment = "right";
const summaryNotes = [
  "Reference changes: C25 now URGENT_ESCALATION. C32, C34 and C38 now SELF_CARE. C22 and C47 remain ASYNC_PHYSICIAN.",
  "The common-49 column applies v3 labels while retaining the original v2 denominator. C25 then increases the denominator to 50.",
  "Fable residual misses: C22 and C47. Astra residual misses: C07, C19 and C22. Exact Astra/Fable differences: C07, C19 and C47.",
  "Clinician-action endpoint: ASYNC_PHYSICIAN or URGENT_ESCALATION is positive. SELF_CARE is negative.",
  "TP = clinician action correctly selected. TN = self-care correctly selected. FP = unnecessary clinician action. FN = missed clinician action.",
  "C32, C34 and C38 were prior-reference false positives. Fable is a true negative under the amended reference.",
  "TP does not prove the correct urgency. An async prediction against an urgent target is an exact-route miss even when both are positive.",
  "Disposition agreement does not grade watchful-waiting instructions, medication recommendations or pregnancy precautions.",
  "Historical five-way Opus uses a different prompt. Its mapped score is contextual evidence, not a matched three-bucket experiment.",
  "No new inference, independent consensus or held-out validation. Original CSV agreement is outside this workbook.",
];
summaryNotes.forEach((note, i) => sourceNote(summary, 15 + i, note));

base(clinical, "A1:H14", "Six physician-reviewed cases");
sourceNote(clinical, 4, "Amendments assess the care setting. Qualifying clinical questions remain separate from disposition agreement.");
sourceNote(clinical, 5, "Source: physician-adjudication-v3-2026-09-15.json. User physician review on 15 September 2026, after model outputs.");
clinical.getRange("A7:H7").values = [["Case", "Exact message", "v2 target", "v3 target", "Fable disposition", "Fable clinician action", "Physician adjudication", "Unresolved rationale review"]];
clinical.getRange("A8:H13").values = reference.amendments.map(amendment => {
  const row = byId.get(amendment.id), fable = scorecards.fableLow.rows.find(value => value.id === row.id);
  return [row.id, row.message, row.previousAcceptedBuckets?.join("; ") ?? "UNRESOLVED", row.acceptedBuckets[0], fable.disposition, fable.clinicianAction, amendment.explanation, amendment.unresolved.join(" ") || "No additional issue specified in this amendment."];
});
table(clinical, "A7:H13", "ClinicalAmendments"); header(clinical, "A7:H7");
widths(clinical, { A: 8, B: 55, C: 24, D: 25, E: 25, F: 17, G: 69, H: 57 }, 14);
longRows(clinical, "A8:H13", 80);
clinical.getRange("F8:F13").conditionalFormats.add("containsText", { text: "FN", format: { fill: amber } });
clinical.freezePanes.freezeRows(7); clinical.freezePanes.freezeColumns(1);

base(differences, "A1:H12", "Exact Astra and Fable differences");
sourceNote(differences, 4, "Astra extra-high and max select identical dispositions on all 50 messages. Both differ from Fable on these three cases.");
sourceNote(differences, 5, "Frozen rationales are reproduced exactly. The physician v3 target is ASYNC_PHYSICIAN for all three.");
differences.getRange("A7:H7").values = [["Case", "Exact message", "Physician v3 target", "Fable disposition", "Exact Fable rationale", "Both Astra dispositions", "Exact Astra extra-high rationale", "Exact Astra max rationale"]];
const disagreementIds = sourceSummary.pairwise.astraXhighVsFableLow.disagreementIds;
differences.getRange("A8:H10").values = disagreementIds.map(id => {
  const r = byId.get(id), f = scorecards.fableLow.rows.find(row => row.id === id), x = scorecards.astraXhigh.rows.find(row => row.id === id), m = scorecards.astraMax.rows.find(row => row.id === id);
  assert.equal(x.disposition, m.disposition);
  return [id, r.message, r.acceptedBuckets[0], f.disposition, f.rationale, x.disposition, x.rationale, m.rationale];
});
table(differences, "A7:H10", "AstraFableDifferences"); header(differences, "A7:H7");
widths(differences, { A: 8, B: 55, C: 25, D: 25, E: 68, F: 27, G: 68, H: 68 }, 12);
longRows(differences, "A8:H10", 88);
sourceNote(differences, 12, "C07 and C19: Fable agrees with v3. C47: both Astra arms agree with v3. These are known development cases.");

wb.recalculate();
const calculated = summary.getRange("B7:H12").values;
const expected = keys.map(key => {
  const s = scorecards[key];
  return [s.previousV2.agree, 49, s.revisedCommon49.agree, 49, s.rows.find(row => row.id === "C25").agrees ? 1 : 0, s.agree, 50];
});
assert.deepEqual(calculated, expected, "Workbook must reproduce independent offline scores");
for (const [i, row] of outputRows.entries()) {
  const actual = outputs.getRange(`E${i + 8}:K${i + 8}`).values[0];
  assert.equal(actual[2], row.previousAgrees === null ? 0 : 1);
  assert.equal(actual[3], row.previousAgrees === null ? "unscored" : Number(row.previousAgrees));
  assert.equal(actual[4], Number(row.agrees));
  assert.equal(actual[6], row.clinicianAction);
}
// Recalculation test: a changed frozen-input copy affects the derived score, then is restored.
const original = outputs.getRange("D8").values[0][0];
outputs.getRange("D8").values = [["ASYNC_PHYSICIAN"]]; wb.recalculate();
assert.equal(summary.getRange("G7").values[0][0], 47);
assert.equal(summary.getRange("B7").values[0][0], 43);
outputs.getRange("D8").values = [[original]]; wb.recalculate();
assert.deepEqual(summary.getRange("B7:H12").values, expected);
assert.equal(outputs.getRange("H32").values[0][0], "unscored");
assert.equal(outputs.getRange("I32").values[0][0], 1);
const errorScan = await wb.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!", options: { useRegex: true, maxResults: 100 }, summary: "formula error scan" });
const inspection = await wb.inspect({ kind: "table", range: "Summary!A6:I12", include: "values,formulas", tableMaxRows: 7, tableMaxCols: 9, maxChars: 7000 });
await fs.writeFile(path.join(qa, "inspection.ndjson"), inspection.ndjson + "\n" + errorScan.ndjson);
const views = [
  ["Summary", "A1:I25", "summary"],
  ["Clinical review", "A1:F10", "clinical-messages"], ["Clinical review", "F7:H13", "clinical-adjudication"],
  ["Astra differences", "A1:F10", "astra-differences"], ["Astra differences", "F7:H10", "astra-rationales"],
  ["Frozen outputs", "A1:K10", "frozen-scores"], ["Frozen outputs", "K7:M10", "frozen-rationales"],
  ["Frozen outputs", "K269:M269", "longest-rationale"],
  ["Reference", "A1:F10", "reference"],
];
for (const [sheetName, range, name] of views) {
  const image = await wb.render({ sheetName, range, scale: 1.3, format: "png" });
  await fs.writeFile(path.join(qa, `${name}.png`), new Uint8Array(await image.arrayBuffer()));
}
const out = path.join(ROOT, "output/submission-2026-09-15/counsel-disposition-adjudication-v3.xlsx");
const exported = await SpreadsheetFile.exportXlsx(wb);
await exported.save(out);
try { await fs.rename(out + ".inspect.ndjson", path.join(qa, "export-inspection.ndjson")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const outputSHA256 = createHash("sha256").update(await fs.readFile(out)).digest("hex");
await fs.writeFile(path.join(qa, "validation.json"), JSON.stringify({ outputSHA256, sheets: 5, exactMessages: 50, frozenOutputs: 300,
  scores: calculated, formulasRecalculated: true, inputMutationAndRestorationVerified: true, c25ExcludedOnlyUnderV2: true,
  allCaseScoresChecked: true, sourceAudit: audit, pendingVisualReview: true }, null, 2));
console.log(JSON.stringify({ output: out, outputSHA256, scores: calculated, errorScan: errorScan.ndjson, qa }, null, 2));
