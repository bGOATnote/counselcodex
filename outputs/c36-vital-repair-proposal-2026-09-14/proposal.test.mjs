import test from 'node:test';
import assert from 'node:assert/strict';
import { proposedLocations, proposedNomination } from './proposal.mjs';
const id = 'unmeasured_vitals_not_dismissed';
const text = 'No vital signs reported; whether any were measured is unknown. None are needed for this routing decision.';
test('observed mechanical defect nominates only exact vitalSigns, without a judge target', () => {
  const draft = { disposition: 'ASYNC_PHYSICIAN', vitalSigns: text }, result = proposedLocations(draft);
  assert.equal(result.failed, true); assert.equal(result.locations.length, 1);
  assert.equal(result.locations[0].matchedText, 'None are needed');
  assert.equal(text.slice(result.locations[0].start, result.locations[0].end), 'None are needed');
  assert.deepEqual(proposedNomination({ id, repairLocations: result.locations }, draft), ['vitalSigns']);
});
test('existing emergency-only exception survives; later dismissal retains original offsets', () => {
  const safe = 'No readings are needed before emergency care.';
  assert.deepEqual(proposedLocations({ disposition: 'EMERGENCY_NOW', vitalSigns: safe }), { failed: false, locations: [] });
  assert.equal(proposedLocations({ disposition: 'SELF_CARE', vitalSigns: safe }).failed, true);
  const raw = `🙂 ${safe} However, measurements are unnecessary.`, result = proposedLocations({ disposition: 'EMERGENCY_NOW', vitalSigns: raw });
  assert.equal(result.failed, true); assert.equal(result.locations.length, 1);
  assert.equal(raw.slice(result.locations[0].start, result.locations[0].end), 'measurements are unnecessary');
});
test('no clinical check relaxation, broad-field permission or stale location rescue', () => {
  const draft = { disposition: 'SELF_CARE', vitalSigns: text }, location = proposedLocations(draft).locations[0];
  for (const altered of [ { ...location, field: 'routing' }, { ...location, start: -1 }, { ...location, start: 0.5 },
    { ...location, end: 9999 }, { ...location, matchedText: 'Unknown' }, { ...location, end: location.start } ]) {
    assert.deepEqual(proposedNomination({ id, repairLocations: [altered] }, draft), []);
  }
  assert.deepEqual(proposedNomination({ id, repairLocations: [location] }, { vitalSigns: 'Different draft.' }), []);
  assert.deepEqual(proposedNomination({ id, repairLocations: [location] }), []);
  assert.deepEqual(proposedNomination({ id: 'unknown_check', repairLocations: [location] }, draft), []);
  assert.deepEqual(proposedNomination({ id, detail: 'A field name is not attribution.' }, draft), []);
  assert.deepEqual(proposedLocations({ disposition: 'SELF_CARE', vitalSigns: 'Vital signs are unknown; the message does not establish what measurements are needed.' }), { failed: false, locations: [] });
});
test('multiple exact hits still authorize only one field', () => {
  const draft = { disposition: 'SELF_CARE', vitalSigns: 'None are needed. Readings are unnecessary.' }, result = proposedLocations(draft);
  assert.equal(result.locations.length, 2);
  assert.deepEqual(proposedNomination({ id, repairLocations: result.locations }, draft), ['vitalSigns']);
});
