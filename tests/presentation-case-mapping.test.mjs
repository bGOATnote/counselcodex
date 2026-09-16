import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONTINUATION_GUI_CASES, resolveDeckCaseLabels } from '../output/presentation/deck-case-mapping.mjs';

const csv = readFileSync(new URL('../data/patient_messages.csv', import.meta.url), 'utf8');
const capture = new URL('../outputs/continuation-gui-2026-09-14/capture-final/', import.meta.url);
const summary = JSON.parse(readFileSync(new URL('summary.json', capture), 'utf8'));
const runs = summary.rows.map(row => JSON.parse(readFileSync(new URL(`runs/${row.runId}.json`, capture), 'utf8')));

test('deck derives all seven labels from exact cohort messages, retaining off-cohort updates', () => {
  const actual = resolveDeckCaseLabels(csv, runs);
  assert.deepEqual(actual.map(row => row.caseId), ['C30', 'C02', null, 'C50', null, 'C04', null]);
  assert.equal(actual[5].label, 'C04 diabetic foot');
  assert.equal(actual.filter(row => row.caseId !== null).length, 4);
});

test('mistyping diabetic foot as C19 fails before deck export', () => {
  const incorrect = CONTINUATION_GUI_CASES.map(spec => spec.expectedCaseId === 'C04' ? { ...spec, expectedCaseId: 'C19' } : spec);
  assert.throws(() => resolveDeckCaseLabels(csv, runs, incorrect), /expected C19, exact message is C04/);
});

test('reordering runs cannot transpose labels', () => {
  const reversed = resolveDeckCaseLabels(csv, [...runs].reverse());
  assert.deepEqual(reversed.map(row => row.caseId), [null, 'C04', null, 'C50', null, 'C02', 'C30']);
});

test('changed original message or a follow-up mislabeled as an original is rejected', () => {
  assert.throws(() => resolveDeckCaseLabels(csv, [{ ...runs[5], message: runs[5].message + ' New symptoms.' }]), /expected C04, exact message is null/);
  assert.throws(() => resolveDeckCaseLabels(csv, [runs[2]], [{ ...CONTINUATION_GUI_CASES[2], expectedCaseId: 'C02' }]), /expected C02, exact message is null/);
});
