// UNAPPLIED prototype. Not imported by runtime, study harness or GUI.
// These are the existing predicate/exemption, unchanged; only attribution is new.
const dismissal = /(?:none|no (?:readings|measurements|vitals)) (?:are )?(?:needed|required)|(?:vitals|readings|measurements) (?:are )?(?:unnecessary|not needed)/gi;
const exception = /\b(?:none|no (?:readings|measurements|vitals)) (?:are )?(?:needed|required) (?:before (?:(?:seeking|obtaining|accessing) )?emergency (?:assessment|care)|to act on this)\b/gi;
export function proposedLocations(answer) {
  const raw = answer.vitalSigns;
  const excluded = answer.disposition === 'EMERGENCY_NOW' ? [...raw.matchAll(exception)] : [];
  const oldClaims = answer.disposition === 'EMERGENCY_NOW' ? raw.replace(exception, '[do not delay emergency care]') : raw;
  const failed = new RegExp(dismissal.source, 'i').test(oldClaims);
  // Keep source offsets, not offsets in the length-changing exempted string.
  const locations = failed ? [...raw.matchAll(dismissal)].filter(match => !excluded.some(exemption => match.index >= exemption.index && match.index + match[0].length <= exemption.index + exemption[0].length))
    .map(match => ({ field: 'vitalSigns', start: match.index, end: match.index + match[0].length, matchedText: match[0] })) : [];
  return { failed, locations };
}
export function proposedNomination(finding, draft) {
  if (finding.id !== 'unmeasured_vitals_not_dismissed') return [];
  return (finding.repairLocations ?? []).some(location => location.field === 'vitalSigns'
    && typeof draft?.vitalSigns === 'string' && Number.isSafeInteger(location.start) && Number.isSafeInteger(location.end)
    && location.start >= 0 && location.end > location.start && location.end <= draft.vitalSigns.length
    && typeof location.matchedText === 'string' && draft.vitalSigns.slice(location.start, location.end) === location.matchedText)
    ? ['vitalSigns'] : [];
}
