import test from 'node:test';
import assert from 'node:assert/strict';
import { statistics, receiptPhases, route, coarseRoute, originalLabelDiagnostic, compareCohorts, main } from './analyze.mjs';

test('missing durations are missing, never zero; p95 is nearest-rank', () => {
  assert.deepEqual(statistics([null, undefined, 10, 20, 30, 40]), { n: 4, missing: 2, median: 25, p95NearestRank: 40, min: 10, max: 40 });
  assert.equal(statistics([null]).median, null);
});
test('receipt/publication phases do not double count and must share exact event/time', () => {
  const event = { kind: 'patient_reply', sequence: 1, text: 'Synthetic.' };
  const wire = { phase: 'received', receivedMs: 10, event }, publish = { phase: 'published', receivedMs: 10, publishedMs: 13, event };
  assert.deepEqual(receiptPhases([wire, publish]), { received: [wire], published: [publish] });
  assert.equal(receiptPhases([{ receivedMs: 10, event }]).published.length, 0);
  assert.throws(() => receiptPhases([wire, wire]), /DUPLICATE/);
  assert.throws(() => receiptPhases([wire, { ...publish, receivedMs: 11 }]), /BINDING/);
  assert.throws(() => receiptPhases([publish]), /BINDING/);
});
test('async priority is explicit, not inferred from an unknown value', () => {
  assert.equal(route({ disposition: 'ASYNC_PHYSICIAN', reviewPriority: 'priority' }), 'PRIORITY_ASYNC');
  assert.equal(route({ disposition: 'ASYNC_PHYSICIAN', reviewPriority: 'routine' }), 'STANDARD_ASYNC');
  assert.equal(route({ disposition: 'ASYNC_PHYSICIAN' }), null);
});
test('post-hoc coarse projection does not invent source urgency or promote withheld/qualified cases', () => {
  assert.equal(coarseRoute('EMERGENCY_NOW'), 'URGENT_ESCALATION');
  assert.equal(coarseRoute('SAME_DAY_IN_PERSON'), 'URGENT_ESCALATION');
  const rows = [
    { id: 'A', originalSuppliedLabel: 'URGENT_ESCALATION', referenceRoutes: ['EMERGENCY_NOW'], complete: true, finalRoute: 'SAME_DAY_IN_PERSON', outcome: 'complete' },
    { id: 'B', originalSuppliedLabel: 'ASYNC_PHYSICIAN', referenceRoutes: ['PRIORITY_ASYNC', 'STANDARD_ASYNC'], complete: false, finalRoute: null, outcome: 'review_required' },
    { id: 'C25', originalSuppliedLabel: 'URGENT_ESCALATION', referenceRoutes: null, complete: true, finalRoute: 'SAME_DAY_IN_PERSON', outcome: 'complete' },
  ];
  const result = originalLabelDiagnostic(rows);
  assert.equal(result.denominator, 2); assert.equal(result.originalLabelAgreement, 2);
  assert.equal(result.thisCohortCoarseAgreement, 1); assert.equal(result.thisCohortIncomplete, 1);
  assert.equal(result.rows[0].candidateCoarseAgreement, true); // Coarse match is NOT a five-route match.
  assert.deepEqual(result.rows[1].acceptedCoarseReference, ['ASYNC_PHYSICIAN']);
  assert.equal(result.rows[1].candidateCoarseResult, 'not_completed');
  assert.equal(result.rows[2].originalLabelAgreement, null); assert.equal(result.rows[2].candidateCoarseAgreement, null);
  assert.deepEqual(result.qualifiedExcludedIds, ['C25']);
});
test('pairing checks exact input/reference; conditional timing excludes withheld responses', () => {
  const row = { id: 'X', inputHash: 'fixed', referenceRoutes: ['SELF_CARE'], eligible: true, complete: true, outcome: 'complete',
    httpTerminalMs: 100, firstActionReceiptMs: null, firstEmergencyReceiptMs: null, firstReplyReceiptMs: 90, estimatedUSD: 1, finalAgreement: true };
  const baseline = { cases: [row] }, candidate = { cases: [{ ...row, complete: false, outcome: 'review_required', httpTerminalMs: 80, firstReplyReceiptMs: null, finalAgreement: false }] };
  const result = compareCohorts(baseline, candidate);
  assert.equal(result.paired.httpAllRecordedTerminalDeltaMs.median, -20);
  assert.equal(result.paired.httpBothCompleteDeltaMs.n, 0);
  assert.equal(result.paired.replyReceiptBothPresentDeltaMs.n, 0);
  assert.deepEqual(result.paired.referenceMatchesLost, ['X']);
  assert.throws(() => compareCohorts(baseline, { cases: [{ ...row, inputHash: 'changed' }] }), /INPUT_MISMATCH/);
  assert.throws(() => compareCohorts(baseline, { cases: [{ ...row, referenceRoutes: ['EMERGENCY_NOW'] }] }), /REFERENCE_ROUTE_DRIFT/);
});
test('baseline-only reproduces frozen full-50 counts without reading the live candidate', () => {
  const { baseline, mode } = main(['--baseline-only']), a = baseline.aggregates;
  assert.equal(mode, 'baseline-only-no-candidate-score');
  assert.equal(baseline.fingerprint, 'a5b835671f06263c68c0c67e7658320cb21984f41e2d1f600cc210c26488499a');
  assert.equal(a.complete, 39); assert.equal(a.withheld, 11); assert.equal(a.calls, 270);
  assert.deepEqual(a.exactDevelopmentAgreement, { numerator: 32, denominator: 49, qualifiedIds: ['C25'] });
  assert.deepEqual(a.firstDraftDevelopmentAgreement, { numerator: 36, denominator: 49 });
  assert.equal(a.timingMs.httpAllTerminal.median, 68793.5);
  assert.equal(a.emergencyCoverage.denominator, 21); assert.equal(a.emergencyCoverage.earlyEmitted, 17);
  assert.deepEqual(a.routeProcess.referenceDeviationCorrected, ['C49']);
  assert.deepEqual(a.routeProcess.matchingDraftWithheld, ['C18', 'C24', 'C37', 'C46', 'C48']);
  assert.equal(a.modelSupportedAlternatives.length, 6);
  assert.ok(Math.abs(a.accountedUSD - 29.96312875) < 1e-7);
});
