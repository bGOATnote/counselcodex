import { SAFETY_RULES, normalizeMessage, operationalDisposition } from "../domain/rules.mjs";

export const INITIAL_SCREEN_VERSION = "contextual-initial-screen/v1";

// Narrow pre-model screen. Ambiguous language is left to the live models, not
// classified as safe. Iterate every occurrence: a denied first mention must
// not hide a later affirmative one. Do not alter the historical rules baseline.
export function currentPatternHits(message, patterns) {
  const text = normalizeMessage(message);
  const hits = [];
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, "gi");
    for (const match of text.matchAll(re)) {
      const at = match.index, end = at + match[0].length;
      if ((/[a-z]/i.test(match[0][0]) && /[a-z]/i.test(text[at - 1] ?? "")) || (/[a-z]/i.test(match[0].at(-1)) && /[a-z]/i.test(text[end] ?? ""))) continue;
      const start = Math.max(text.lastIndexOf(".", at - 1), text.lastIndexOf("!", at - 1), text.lastIndexOf("?", at - 1), text.lastIndexOf(";", at - 1)) + 1;
      const stopAt = text.slice(end).search(/[.!?;]/);
      const before = text.slice(start, at).split(/\b(?:but|however|yet)\b/i).at(-1) ?? "";
      const sentence = before + text.slice(at, stopAt < 0 ? text.length : end + stopAt);
      const prefix = before.split(/:|\bnow\b|\band\s+(?=(?:i|he|she|they|my (?:wife|husband|child|mother|father))\b)/i).at(-1) ?? "";
      // Loss of function (no air/pulse, cannot breathe) is not a denial.
      if (/\b(?:no(?!\s+(?:longer|air|pulse|breath|response)\b)|not(?!\s+(?:sure|certain|only|able)\b)|without(?!\s+(?:warning|help|support)\b)|denies|denied|deny|never|isn't|wasn't|don't have|doesn't have)\b[^.!?;]*$/i.test(prefix) || /\b(?:is|are|was|were)\s+(?:absent|denied|not present)\b/i.test(text.slice(end, end + 35))) continue;
      if (/\b(?:what if|if i (?:have|had|develop)|if (?:he|she|they) (?:has|have|develop)|would (?:a|the|this)|could (?:a|the|this)|signs of|symptoms of|reading about|read about|article|leaflet|example|hypothetical|training scenario)\b/i.test(sentence)) continue;
      const remote = /\b(?:years? ago|last year|in childhood|as a child|history of|used to|in 19\d\d|in 20[01]\d)\b/i.test(sentence);
      if (remote && !/\b(?:now|today|again|returned|recurr|this morning|currently)\b/i.test(sentence)) continue;
      // Quotes in educational/quoted advice are not patient symptom assertions.
      if (/\b(?:instructions?|warning|told me to|asked (?:me|whether))\b/i.test(sentence) && /["'“”]/.test(sentence)) continue;
      hits.push(pattern.source); break;
    }
  }
  return hits;
}

export function screenCurrentRedFlags(message) {
  // A visual-metaphor rule must actually describe lost vision, not hanging
  // curtains. Similar lexical collisions are tested rather than case-ID keyed.
  const matches = SAFETY_RULES.flatMap(rule => {
    const patterns = rule.name === "retinal_or_amaurosis"
      ? [/(?:lost vision|vision (?:loss|went black)|curtain (?:coming down|over|across).{0,25}(?:eye|vision))/i]
      : rule.name === "tia_stroke" ? [/(?:speech got slurred|slurred)/i, /(?:face.{0,20}droop(?:ing|y)?|droop(?:ing|y)? face)/i]
      : rule.patterns;
    const minimum = rule.name === "retinal_or_amaurosis" ? 1 : rule.minimumHits;
    const evidence = currentPatternHits(message, patterns);
    // Anticoagulant + headache alone is not evidence of a head injury. But an
    // actual head injury while anticoagulated must not require vomiting/pain.
    if (rule.name === "ich_on_anticoag" && (!evidence.includes(patterns[0].source) || !evidence.includes(patterns[1].source))) return [];
    if (rule.name === "ich_on_anticoag" && evidence.length >= minimum) return [{ ...rule, directive: "Head injury while taking an anticoagulant needs prompt emergency-department assessment to determine whether imaging is needed. Do not wait for a message reply.", disposition: operationalDisposition(rule), evidence }];
    if (rule.name === "tia_stroke" && evidence.length >= minimum) return [{ ...rule, directive: "Speech changes with facial drooping can signal a stroke or TIA. Call 911 now, even if the symptoms have stopped.", disposition: operationalDisposition(rule), evidence }];
    return evidence.length >= minimum ? [{ ...rule, disposition: operationalDisposition(rule), evidence }] : [];
  });
  return matches.find(match => match.disposition === "EMERGENCY_NOW") ?? null;
}
