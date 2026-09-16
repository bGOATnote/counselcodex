#!/usr/bin/env node
// Offline evaluation workbook. Author with the bundled artifact-tool runtime.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const repo = process.argv[2] || process.cwd();
const out = path.join(repo, 'output/submission-2026-09-15');
const runtime = process.env.RUNTIME_ROOT || '/Users/kiteboard/.cache/codex-runtimes/codex-primary-runtime/dependencies';
const scratch = process.env.SUBMISSION_WORKBOOK_TMP || '/private/tmp/counsel-workbook-runtime';
const qa = path.join(scratch, 'qa');
await fs.mkdir(scratch, { recursive: true });
try { await fs.symlink(path.join(runtime, 'node/node_modules'), path.join(scratch, 'node_modules'), 'dir'); }
catch (error) { if (error.code !== 'EEXIST') throw error; }
const requireRuntime = createRequire(path.join(scratch, 'resolver.cjs'));
const { Workbook, SpreadsheetFile } = await import(pathToFileURL(requireRuntime.resolve('@oai/artifact-tool')).href);
const read = async (p) => JSON.parse(await fs.readFile(path.join(repo, p), 'utf8'));
const sha = async (p) => createHash('sha256').update(await fs.readFile(path.join(repo, p))).digest('hex');
const referencePath = 'data/evaluation/physician-system-reference-v2.json';
const csvPath = 'data/patient_messages.csv';
const reference = await read(referencePath);
const imported = await Workbook.fromCSV(await fs.readFile(path.join(repo, csvPath), 'utf8'), { sheetName: 'Imported source' });
const csv = imported.worksheets.getItemAt(0).getRange('A2:C51').values;
if (csv.length !== 50 || new Set(csv.map((r) => r[0])).size !== 50) throw new Error('Expected 50 unique CSV cases');
const refs = new Map(reference.cases.map((c) => [c.id, c]));
const mapping = { SELF_CARE: 'SELF_CARE', PRIORITY_ASYNC: 'ASYNC_PHYSICIAN', STANDARD_ASYNC: 'ASYNC_PHYSICIAN', SAME_DAY_IN_PERSON: 'URGENT_ESCALATION', EMERGENCY_NOW: 'URGENT_ESCALATION' };
const armDefinitions = [
  { id: 'Fable low', base: 'outputs/stripped-3bucket-fable-2026-09-15', expected: [44, 31], low: true },
  { id: 'Opus low', base: 'outputs/stripped-3bucket-opus-2026-09-15', expected: [42, 33] },
  { id: 'Fable max', base: 'outputs/stripped-3bucket-fable-max-2026-09-15', expected: [42, 31] },
  { id: 'Five-way collapsed', base: 'outputs/stripped-baseline-2026-09-15', expected: [46, 35], historical: true },
];
const arms = [];
const sources = [];
async function addSource(key, file, meaning) { sources.push([key, file, await sha(file), meaning]); }
await addSource('CSV', csvPath, 'Original 50-row assignment file. Byte-identical to supplied CSV.');
await addSource('Physician reference', referencePath, 'Physician-designated incumbent development reference; chronological reconstruction; C25 unresolved.');
await addSource('Physician authority', reference.authority.path, 'Attributable development review, not blinded validation or claim-level grades.');
for (const arm of armDefinitions) {
  const rows = [];
  await addSource(`${arm.id} manifest`, `${arm.base}/manifest.json`, 'Frozen provider protocol and generation provenance.');
  await addSource(`${arm.id} completion`, `${arm.base}/generation-complete.json`, 'Frozen usage, latency and accounting.');
  for (const [id, message, csvLabel] of csv) {
    const file = `${arm.base}/${id}-parsed.json`;
    const parsed = await read(file);
    if (parsed.failure || !parsed.parsed || parsed.providerCalls !== 1) throw new Error(`Invalid frozen case ${file}`);
    const native = parsed.parsed.disposition ?? parsed.parsed.disposition_name;
    const bucket = arm.historical ? mapping[native] : native;
    if (!['SELF_CARE', 'ASYNC_PHYSICIAN', 'URGENT_ESCALATION'].includes(bucket)) throw new Error(`Unmapped ${native}`);
    const ref = refs.get(id);
    if (!ref || ref.message !== message || ref.originalSuppliedLabel !== csvLabel) throw new Error(`Source mismatch ${id}`);
    const accepted = ref.reference.acceptedRoutes;
    const mapped = accepted === null ? [] : [...new Set(accepted.map((x) => mapping[x]))];
    if (mapped.length > 1) throw new Error(`Extend explicit accepted-set calculation for ${id}`);
    rows.push({ id, message, csvLabel, native, bucket, rationale: parsed.parsed.rationale,
      rawAccepted: accepted === null ? 'null' : JSON.stringify(accepted), accepted: mapped[0] ?? '',
      note: accepted === null ? 'C25: unresolved DVT reference; excluded only from physician agreement.' : ref.reference.note ?? '',
      source: `${arm.id} ${id}`, included: accepted !== null });
    await addSource(`${arm.id} ${id}`, file, 'Unchanged model output and short rationale; not a clinical endorsement.');
  }
  const counts = [rows.filter((r) => r.included && r.accepted === r.bucket).length, rows.filter((r) => r.csvLabel === r.bucket).length];
  if (counts.some((x, i) => x !== arm.expected[i])) throw new Error(`Source score mismatch: ${arm.id}`);
  arms.push({ ...arm, rows, counts });
}

const wb = Workbook.create();
const summary = wb.worksheets.add('Summary');
const cases = wb.worksheets.add('Fable cases');
const others = wb.worksheets.add('Other runs');
const provenance = wb.worksheets.add('Sources');
const navy = '#243866', light = '#EDF1F5', ink = '#28354A', amber = '#FFF1D6';
function base(sheet, range) {
  sheet.showGridLines = false;
  sheet.getRange(range).format.font = { name: 'Arial', size: 10, color: ink };
  sheet.getRange(range).format.verticalAlignment = 'center';
}
function title(sheet, text) {
  sheet.getRange('A2').values = [[text]];
  sheet.getRange('A2').format.font = { name: 'Arial', size: 15, bold: true, color: navy };
  sheet.getRange('A2').format.rowHeight = 25;
}
function header(sheet, address) {
  sheet.getRange(address).format = { fill: navy, font: { name: 'Arial', size: 10, bold: true, color: '#FFFFFF' },
    horizontalAlignment: 'center', verticalAlignment: 'center', wrapText: true, rowHeight: 34 };
}
function table(sheet, address, name) {
  const t = sheet.tables.add(address, true, name);
  t.showFilterButton = true;
  t.style = 'TableStyleLight9';
  return t;
}
function widths(sheet, definitions, last) {
  for (const [column, width] of Object.entries(definitions)) sheet.getRange(`${column}1:${column}${last}`).format.columnWidth = width;
}

base(cases, 'A1:L57');
title(cases, 'Fable 5.1 low effort case evaluation');
cases.getRange('A4').values = [['Frozen one-shot outputs. Physician and CSV agreement are calculated separately. C25 remains in all 50 attempts.']];
cases.getRange('A5').values = [['I = physician agreement; J = original CSV agreement. 1 means agree, 0 means disagree, excluded means no physician target.']];
cases.getRange('A7:L7').values = [['Case', 'Original patient message', 'Fable bucket', 'Original Fable rationale', 'Original CSV label', 'Original acceptedRoutes', 'Mapped physician bucket', 'Physician included', 'Physician agreement', 'CSV agreement', 'Reference note', 'Source key']];
const fableRows = arms[0].rows;
cases.getRange('A8:L57').values = fableRows.map((r) => [r.id, r.message, r.bucket, r.rationale, r.csvLabel, r.rawAccepted, r.accepted, null, null, null, r.note, r.source]);
cases.getRange('H8:J57').formulas = fableRows.map((_, i) => { const n = i + 8; return [`=IF(F${n}="null",0,1)`, `=IF(H${n}=0,"excluded",IF(C${n}=G${n},1,0))`, `=IF(C${n}=E${n},1,0)`]; });
table(cases, 'A7:L57', 'FableCases');
header(cases, 'A7:L7');
widths(cases, { A: 8, B: 58, C: 25, D: 62, E: 25, F: 33, G: 25, H: 12, I: 12, J: 12, K: 45, L: 23 }, 57);
cases.getRange('A8:L57').format.wrapText = true;
cases.getRange('A8:L57').format.verticalAlignment = 'top';
cases.getRange('A8:L57').format.rowHeight = 80;
cases.getRange('H8:J57').format.horizontalAlignment = 'center';
cases.getRange('I8:J57').conditionalFormats.add('cellIs', { operator: 'equal', formula: 0, format: { fill: amber, font: { color: '#80540D' } } });
cases.getRange('I8:I57').conditionalFormats.add('containsText', { text: 'excluded', format: { fill: '#EAEAEA' } });
cases.freezePanes.freezeRows(7); cases.freezePanes.freezeColumns(1);

base(others, 'A1:L157');
title(others, 'Comparison runs and historical mapping');
others.getRange('A4').values = [['Each row is one frozen output. Five-way collapsed is a historical re-score, with zero new inference for the mapping.']];
others.getRange('A5').values = [['The five-way run originally scored 35/49 on exact routes. Its 46/49 after collapse is a taxonomy change, not model improvement.']];
others.getRange('A7:L7').values = [['Run', 'Case', 'Original prediction', 'Scored three-bucket prediction', 'Mapped physician bucket', 'Physician included', 'Physician agreement', 'Original CSV label', 'CSV agreement', 'Original rationale', 'Source key', 'Comparison scope']];
const otherRows = arms.slice(1).flatMap((a) => a.rows.map((r) => ({ ...r, arm: a.id, historical: !!a.historical })));
others.getRange('A8:L157').values = otherRows.map((r) => [r.arm, r.id, r.native, r.bucket, null, null, null, null, null, r.rationale, r.source, r.historical ? 'Historical five-route outputs collapsed to three buckets' : 'Fresh three-bucket one-shot cohort']);
others.getRange('E8:I157').formulas = otherRows.map((_, i) => { const n = i + 8; return [
  `=IF(VLOOKUP(B${n},'Fable cases'!$A$8:$L$57,8,FALSE)=0,"",VLOOKUP(B${n},'Fable cases'!$A$8:$L$57,7,FALSE))`,
  `=VLOOKUP(B${n},'Fable cases'!$A$8:$L$57,8,FALSE)`,
  `=IF(F${n}=0,"excluded",IF(D${n}=E${n},1,0))`,
  `=VLOOKUP(B${n},'Fable cases'!$A$8:$L$57,5,FALSE)`, `=IF(D${n}=H${n},1,0)`]; });
table(others, 'A7:L157', 'ComparisonRuns'); header(others, 'A7:L7');
widths(others, { A: 23, B: 8, C: 27, D: 27, E: 27, F: 12, G: 12, H: 25, I: 12, J: 68, K: 30, L: 38 }, 157);
others.getRange('A8:L157').format.wrapText = true;
others.getRange('A8:L157').format.verticalAlignment = 'top';
others.getRange('A8:L157').format.rowHeight = 90;
others.getRange('F8:G157').format.horizontalAlignment = 'center';
others.getRange('I8:I157').format.horizontalAlignment = 'center';
others.getRange('G8:G157').conditionalFormats.add('cellIs', { operator: 'equal', formula: 0, format: { fill: amber } });
others.getRange('I8:I157').conditionalFormats.add('cellIs', { operator: 'equal', formula: 0, format: { fill: amber } });
others.freezePanes.freezeRows(7); others.freezePanes.freezeColumns(2);

base(provenance, `A1:D${sources.length + 9}`);
title(provenance, 'Source identity and interpretation');
provenance.getRange('A4').values = [['Paths are repository-relative. SHA-256 identifies the exact frozen source bytes used to build this workbook.']];
provenance.getRange('A5').values = [['Reference labels enter offline scoring only. Known synthetic development cohort; no independent clinical validation.']];
provenance.getRange('A7:D7').values = [['Source key', 'Repository file', 'SHA-256', 'Meaning']];
provenance.getRange(`A8:D${sources.length + 7}`).values = sources;
table(provenance, `A7:D${sources.length + 7}`, 'SourceFiles'); header(provenance, 'A7:D7');
widths(provenance, { A: 28, B: 90, C: 72, D: 80 }, sources.length + 7);
provenance.getRange(`A8:D${sources.length + 7}`).format.rowHeight = 32;
provenance.getRange(`A8:D${sources.length + 7}`).format.wrapText = true;
provenance.freezePanes.freezeRows(7); provenance.freezePanes.freezeColumns(1);

base(summary, 'A1:I35'); summary.tabColor = navy;
title(summary, 'Counsel disposition evaluation');
summary.getRange('A3').values = [['15 September 2026 | 50 synthetic messages | Current demonstration: Fable 5.1 low effort, three buckets']];
summary.getRange('A5:I5').values = [['Run', 'Completed', 'Attempts', 'Physician agree', 'Physician n', 'Physician rate', 'CSV agree', 'CSV n', 'CSV rate']];
summary.getRange('A6:I10').values = [
  ['Fable low', null, null, null, null, null, null, null, null],
  ['Opus low', null, null, null, null, null, null, null, null],
  ['Fable max', null, null, null, null, null, null, null, null],
  ['Five-way collapsed (historical)', null, null, null, null, null, null, null, null],
  ['V25 exact routes (historical)', 27, 50, 21, 49, null, 'not scored', 'not scored', 'not scored'],
];
summary.getRange('B6:I6').formulas = [[`=COUNTA('Fable cases'!$C$8:$C$57)`, `=COUNTA('Fable cases'!$A$8:$A$57)`, `=SUM('Fable cases'!$I$8:$I$57)`, `=SUM('Fable cases'!$H$8:$H$57)`, '=D6/E6', `=SUM('Fable cases'!$J$8:$J$57)`, '=C6', '=G6/H6']];
for (let n = 7; n <= 9; n++) {
  const arm = arms[n - 6].id;
  summary.getRange(`B${n}:I${n}`).formulas = [[
    `=COUNTIFS('Other runs'!$A$8:$A$157,"${arm}")`, `=B${n}`,
    `=SUMIFS('Other runs'!$G$8:$G$157,'Other runs'!$A$8:$A$157,"${arm}")`,
    `=SUMIFS('Other runs'!$F$8:$F$157,'Other runs'!$A$8:$A$157,"${arm}")`, `=D${n}/E${n}`,
    `=SUMIFS('Other runs'!$I$8:$I$157,'Other runs'!$A$8:$A$157,"${arm}")`, `=C${n}`, `=G${n}/H${n}`]];
}
summary.getRange('F10').formulas = [['=D10/E10']];
header(summary, 'A5:I5');
summary.getRange('A6:I10').format.rowHeight = 28;
summary.getRange('A6:I6').format.fill = light;
summary.getRange('F6:F10').setNumberFormat('0.0%'); summary.getRange('I6:I9').setNumberFormat('0.0%');
summary.getRange('B6:I10').format.horizontalAlignment = 'right';
summary.getRange('A13:E13').values = [['Fresh three-bucket run', 'Median s', 'p95 s', 'Estimated USD', 'Accounted USD']];
summary.getRange('A14:E16').values = [['Fable low', 3.7995, 4.710, 0.338780, 0.435310], ['Opus low', 2.3015, 3.526, 0.154065, 0.201830], ['Fable max', 5.3485, 14.851, 0.920680, 1.017210]];
header(summary, 'A13:E13');
summary.getRange('A14:E16').format.rowHeight = 26;
summary.getRange('B14:C16').setNumberFormat('0.0000');
summary.getRange('D14:E16').setNumberFormat('$0.000000');
summary.getRange('A18').values = [['Timing is provider round trip, not browser paint. Costs are token estimates for these runs, not project totals or invoices.']];
summary.getRange('A20').values = [['Interpretation']]; summary.getRange('A20').format.font.bold = true;
const notes = [
  'Physician reference: developer-physician review of the incumbent, reconstructed from saved runs; not blinded held-out gold.',
  'C25 has no exhaustive accepted-route set. It remains in 50 attempts and CSV scoring, outside physician agreement.',
  'Fable low disagreements: C22, C32, C34, C38, C47. All predict self-care where the reference expects async care.',
  'Higher reference agreement does not prove a better clinical policy for contested OTC/self-care cases.',
  'V25: 27/50 complete, 21/49 delivered exact-route agreement; 21/27 is conditional. Different contract from the current router.',
  'Five-way Opus: 35/49 originally; 46/49 after collapsing async priorities and urgent settings. Eleven distinctions disappear.',
  'Max effort: two fewer physician agreements; unchanged CSV score; greater observed cost and latency. Single pass only.',
  'Frozen outputs and rationales remain unchanged. The workbook performs offline scoring; no new inference or adjudication.',
];
summary.getRange('A21:A28').values = notes.map((x) => [x]);
summary.getRange('A18:I28').format.rowHeight = 24;
widths(summary, { A: 40, B: 13, C: 12, D: 15, E: 15, F: 15, G: 13, H: 13, I: 13 }, 35);
await addSource('V25 scorecard', 'outputs/v25-path-b-complete-2026-09-15/scorecard.json', 'Historical exact-route releases: 27/50 complete and 21/49 delivered agreement.');
// Append the late historical source to the existing source table without changing any source bytes.
provenance.tables.items[0].rows.add(null, [sources.at(-1)]);

wb.recalculate();
const expected = [[50,50,44,49,44/49,31,50,31/50], [50,50,42,49,42/49,33,50,33/50], [50,50,42,49,42/49,31,50,31/50], [50,50,46,49,46/49,35,50,35/50]];
const calculated = summary.getRange('B6:I9').values;
for (let r = 0; r < expected.length; r++) for (let c = 0; c < expected[r].length; c++) {
  if (Math.abs(calculated[r][c] - expected[r][c]) > 1e-12) throw new Error(`Workbook score mismatch ${r}/${c}: ${calculated[r][c]}`);
}
// Recalculation boundary: changing an included prediction updates both the detail and headline.
const original = cases.getRange('C8').values[0][0];
cases.getRange('C8').values = [['ASYNC_PHYSICIAN']]; wb.recalculate();
if (summary.getRange('D6').values[0][0] !== 43 || summary.getRange('G6').values[0][0] !== 30) throw new Error('Recalculation check failed');
cases.getRange('C8').values = [[original]]; wb.recalculate();
if (summary.getRange('D6').values[0][0] !== 44 || summary.getRange('G6').values[0][0] !== 31) throw new Error('Restoration failed');
if (cases.getRange('I32').values[0][0] !== 'excluded' || cases.getRange('J32').values[0][0] !== 0) throw new Error('C25 exclusion check failed');
await fs.mkdir(qa, { recursive: true });
const metrics = await wb.inspect({ kind: 'table', range: 'Summary!A5:I10', include: 'values,formulas', tableMaxRows: 6, tableMaxCols: 9, maxChars: 6000 });
const errors = await wb.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!', options: { useRegex: true, maxResults: 100 }, summary: 'formula errors' });
await fs.writeFile(path.join(qa, 'inspection.ndjson'), metrics.ndjson + '\n' + errors.ndjson);
for (const [sheetName, range, name] of [['Summary','A1:I29','summary'], ['Fable cases','A1:D10','fable-case-text'], ['Fable cases','E7:K11','fable-scoring'], ['Fable cases','A37:D38','fable-longest'], ['Other runs','A1:I10','other-runs'], ['Other runs','I119:L120','historical-longest'], ['Sources','A1:D10','sources']]) {
  const image = await wb.render({ sheetName, range, scale: 1.5, format: 'png' });
  await fs.writeFile(path.join(qa, `${name}.png`), new Uint8Array(await image.arrayBuffer()));
}
const exported = await SpreadsheetFile.exportXlsx(wb);
await exported.save(path.join(out, 'counsel-disposition-evaluation.xlsx'));
const sidecar = path.join(out, 'counsel-disposition-evaluation.xlsx.inspect.ndjson');
try { await fs.rename(sidecar, path.join(qa, 'export-inspection.ndjson')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await fs.writeFile(path.join(qa, 'validation.json'), JSON.stringify({ calculated, sourceCount: sources.length, cases: 50, comparisonRows: 150,
  sourceRowsPreserved: true, formulaRecalculationVerified: true, c25ExcludedOnlyFromPhysician: true, noNewInference: true,
  xlsx: 'counsel-disposition-evaluation.xlsx', pendingVisualReview: true }, null, 2));
console.log(JSON.stringify({ output: path.join(out, 'counsel-disposition-evaluation.xlsx'), calculated, sourceCount: sources.length, errorScan: errors.ndjson }, null, 2));
