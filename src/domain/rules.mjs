import { EMERGENCY_NOW, SAME_DAY_IN_PERSON } from "./constants.mjs";

const rule = (name, subtype, patterns, minimumHits, directive) => ({
  name,
  subtype,
  patterns,
  minimumHits,
  directive,
});

// Operational latency is explicit and independent of destination. These rules
// require evaluation before the end of the day, but do not by themselves call
// for immediate emergency-system activation. Every other safety rule is
// EMERGENCY_NOW. This table is deliberately small and reviewable.
const SAME_DAY_RULE_NAMES = new Set([
  "infant_toxic_or_dehydrated",
  "dvt",
  "copd_exacerbation_severe",
  "chf_decompensated",
  "pregnancy_bleeding",
]);

export function operationalDisposition(candidate) {
  return SAME_DAY_RULE_NAMES.has(candidate.name) ? SAME_DAY_IN_PERSON : EMERGENCY_NOW;
}

export const MAX_MESSAGE_CHARS = 12_000;

export const SAFETY_RULES = Object.freeze([
  rule("anaphylaxis", "ed_911", [/(lips? and tongue|tongue|lips?).{0,40}(swollen|swelling)/i, /throat (feels )?tight/i, /\bhives\b/i], 2, "Possible anaphylaxis. Call 911 and use epinephrine if available. Do not wait for a message reply."),
  rule("acs", "ed_911", [/(crushing|pressure|squeez).{0,24}(chest|center of my chest)|(chest|center of my chest).{0,24}(crushing|pressure|squeez)/i, /(left arm|sweaty|sick to my stomach|nause|trouble breathing|shortness of breath|breathless)/i], 2, "Possible acute coronary syndrome. Call 911 now. Do not drive yourself."),
  rule("thunderclap_or_sah", "ed_911", [/\bheadache\b/i, /(thunderclap|worst headache of my life|out of nowhere|hit like a thunder)/i], 2, "A thunderclap headache can signal bleeding around the brain. Go to the emergency department now."),
  rule("meningitis", "ed_911", [/(neck (is |feels )?(a bit )?stiff|stiff neck|neck is stiff)/i, /(fever|101|102|103)/i, /(bright light|photophobia|headache)/i], 3, "Headache, fever, and neck stiffness require emergency evaluation now."),
  rule("meningococcemia_child", "ed_911", [/(purple spots|don'?t fade when i press|non-?blanch)/i, /(fever|103)/i, /(sleepy|letharg)/i], 2, "A febrile child with non-blanching spots and lethargy needs emergency care immediately."),
  rule("cauda_equina", "ed_911", [/(bladder|controlling my bladder)/i, /(numbness in the area between my legs|between my legs|saddle)/i], 2, "Saddle numbness with new bladder dysfunction requires emergency evaluation now."),
  rule("tia_stroke", "ed_911", [/(speech got slurred|slurred)/i, /(face felt droopy|face.{0,20}droop)/i], 2, "Resolved focal neurologic symptoms can still signal a TIA or stroke. Seek emergency assessment now; do not wait for an asynchronous reply."),
  rule("retinal_or_amaurosis", "ed_911", [/(lost vision|curtain coming down|curtain)/i, /(eye|vision)/i], 2, "Sudden monocular vision loss requires emergency evaluation now."),
  rule("ich_on_anticoag", "ed_911", [/(warfarin|anticoag|blood thinner|eliquis|xarelto|apixaban)/i, /(hit my head|fell and hit|head yesterday)/i, /(headache|thrown up|vomit)/i], 2, "Head trauma while anticoagulated with headache or vomiting requires emergency imaging now."),
  rule("preeclampsia", "ed_l_and_d", [/(pregnant|weeks pregnant)/i, /headache/i, /(blurry|puffy|vision)/i], 3, "Pregnancy with headache and visual change or edema requires labor-and-delivery assessment now; do not wait for an asynchronous reply."),
  rule("pregnancy_bleeding", "ed_same_day", [/(weeks pregnant|pregnant)/i, /bleeding/i, /(cramping|more than spotting)/i], 2, "Early-pregnancy bleeding with cramping requires same-day in-person evaluation."),
  rule("testicular_torsion", "ed_911", [/(testicle|testicular)/i, /(sudden|severe pain|hours ago)/i], 2, "Sudden testicular pain can be time-critical. Go to the emergency department now."),
  rule("gi_bleed", "ed_911", [/(black and tarry|melena|tarry)/i, /(lightheaded|dizzy when i stand|stand up)/i], 2, "Black tarry stool with lightheadedness can indicate significant bleeding. Go to the emergency department now."),
  rule("hyperglycemic_crisis", "ed_911", [/(sugar has been over 400|over 400|glucose.{0,12}400)/i, /(thrown up|vomit|can'?t keep water)/i], 2, "Very high glucose with vomiting and inability to keep fluids down requires emergency care."),
  rule("sbo_acute_abdomen", "ed_911", [/(vomited|vomiting)/i, /(haven'?t had a bowel movement|no bowel|obstip)/i, /(bloated|cramping belly|belly pain)/i], 2, "Pain, distension, vomiting, and constipation require emergency evaluation for obstruction."),
  rule("hip_fracture", "ed_911", [/fell/i, /hip/i, /(can'?t put any weight|cannot put any weight|can'?t put)/i], 3, "A fall with hip pain and inability to bear weight requires emergency evaluation."),
  rule("postpartum_or_si_crisis", "crisis_now", [/(better off without me|harming the baby|kill myself|suicidal|everyone would be better)/i], 1, "Use the crisis pathway now. Stay with the patient and contact 988 or local emergency services; do not close this as a routine thread."),
  rule("infant_toxic_or_dehydrated", "same_day_inperson", [/(6-month-old|6 month old|month-old)/i, /(fewer wet diapers|doesn'?t seem interested in feeding|not interested in feeding)/i], 2, "A young infant with fever, poor intake, or fewer wet diapers needs same-day pediatric evaluation."),
  rule("dvt", "same_day_inperson", [/(flew|flight|plane|travel)/i, /calf/i, /(swollen|warm|painful)/i], 3, "One-sided calf swelling after travel requires a same-day DVT evaluation."),
  rule("copd_exacerbation_severe", "same_day_inperson", [/\bcopd\b/i, /(winded just walking|winded|short of breath than usual)/i, /(green|phlegm)/i], 3, "COPD with limited exertional tolerance and purulent sputum needs same-day in-person assessment."),
  rule("chf_decompensated", "same_day_inperson", [/(sit (?:up|upright) to breathe|lying flat makes me short of breath|orthopnea)/i, /(ankles?.{0,24}(?:swollen|swelling)|swelling)/i], 2, "New orthopnea with progressive swelling needs same-day in-person evaluation."),
  rule("acute_stroke", "ed_911", [/(one side|one-sided|right|left).{0,24}(weak|numb|won'?t move)/i, /(can'?t speak|cannot speak|speech.{0,16}(slurred|strange)|face.{0,16}droop)/i], 2, "Possible stroke symptoms require emergency response now. Call 911 and note the last-known-well time."),
  rule("respiratory_distress", "ed_911", [/(can'?t breathe|cannot breathe|struggling to breathe|blue lips|can'?t speak (in )?full sentences)/i], 1, "Severe breathing difficulty requires emergency response now. Call 911."),
  rule("overdose_or_poisoning", "ed_911", [/(overdose|took (a )?(whole bottle|handful)|too many (pills|tablets))/i], 1, "Possible overdose or poisoning requires emergency help now. Call 911 and Poison Control where available."),
  rule("postpartum_hemorrhage", "ed_911", [/(postpartum|gave birth|delivered).{0,50}(today|yesterday|days?|weeks?)/i, /(soaking.{0,24}(pad|pads)|large clots?|faint|passing out)/i], 2, "Heavy postpartum bleeding can be life-threatening. Call emergency services now."),
  rule("ruptured_ectopic", "ed_911", [/(pregnant|positive pregnancy test)/i, /(one-sided|one sided).{0,20}(belly|abdominal|pelvic).{0,20}(pain|hurt)/i, /(shoulder pain|faint|passing out|very dizzy)/i], 2, "Pregnancy with severe one-sided pain, shoulder pain, or fainting requires emergency evaluation now."),
  rule("pulmonary_embolism", "ed_911", [/(sudden|new).{0,24}(shortness of breath|can'?t breathe|breathless)/i, /(chest pain|coughing up blood|hemoptysis)/i], 2, "Sudden breathing difficulty with chest pain or coughing blood requires emergency evaluation now."),
  rule("possible_sepsis", "ed_911", [/(fever|temperature.{0,8}(10[12-9]|4[01]))/i, /(confused|hard to wake|mottled|rapid breathing|breathing very fast)/i], 2, "Fever with altered awareness or severe systemic symptoms requires emergency evaluation now."),
  rule("neonatal_fever", "ed_911", [/(newborn|[0-9]-week-old|[0-2] month old|[0-2]-month-old|younger than 3 months)/i, /(100\.4|38\s*c|fever)/i], 2, "A fever in a baby younger than three months requires immediate clinical evaluation."),
  rule("prolonged_or_recurrent_seizure", "ed_911", [/(seizure|convuls).{0,40}(five|5|more than).{0,12}(minute|minutes)|seizures?.{0,32}(back to back|without waking|not waking)/i], 1, "A prolonged seizure or repeated seizures without recovery require emergency response now. Call 911."),
]);

export const REFILL_PATTERNS = Object.freeze([/\brefill\b/i, /out of sumatriptan/i, /requesting a refill/i]);
export const RESULTS_PATTERNS = Object.freeze([/results/i, /cholesterol checked/i, /don'?t understand what one of the values/i]);
export const NAVIGATION_PATTERNS = Object.freeze([/referral for physical therapy/i, /get tested for stis/i]);

export const SELF_CARE_RULES = Object.freeze([
  rule("viral_uri_mild", "otc_guidance", [/(runny nose|scratchy throat|mild sore throat)/i, /(no fever|no trouble swallowing|eating and drinking fine)/i], 2, "Short, well-appearing upper-respiratory illness."),
  rule("seasonal_allergies", "otc_guidance", [/(seasonal allergies|sneezing, itchy eyes|itchy eyes, stuffy)/i], 1, "Allergic rhinitis requesting over-the-counter guidance."),
  rule("contact_derm_mild", "otc_guidance", [/(itchy red rash|gardening)/i, /(breathing fine|not spreading)/i], 2, "Localized contact dermatitis with a clear airway."),
  rule("bppv", "otc_guidance", [/(room spins|dizzy)/i, /(roll over|turn my head in bed)/i], 2, "Positional vertigo without described central features."),
  rule("med_dosing_followup", "otc_guidance", [/(following up on my ankle sprain|improving)/i, /how much ibuprofen/i], 2, "Improving injury with a dosing question."),
]);

export function normalizeMessage(message) {
  if (typeof message !== "string") throw new TypeError("message must be a string");
  if (message.length > MAX_MESSAGE_CHARS) {
    throw new RangeError(`message must not exceed ${MAX_MESSAGE_CHARS} characters`);
  }
  const normalized = message
    .normalize("NFKC")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\p{Cf}/gu, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) throw new TypeError("message must be a non-empty string");
  if (normalized.length > MAX_MESSAGE_CHARS) {
    throw new RangeError(`normalized message must not exceed ${MAX_MESSAGE_CHARS} characters`);
  }
  return normalized;
}

function isNegated(text, index) {
  const clause = text.slice(Math.max(0, index - 72), index).split(/[.!?;:]|\b(?:but|however|yet)\b/i).at(-1) ?? "";
  return /\b(no|not|without|denies|denied|deny|never|isn'?t|aren'?t|wasn'?t|weren'?t|doesn'?t|didn'?t|do not)\b(?:[\s,]+\w+){0,8}[\s,]*$/i.test(clause);
}

export function matchingPatterns(text, patterns, { ignoreNegated = false } = {}) {
  const hits = [];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && (!ignoreNegated || !isNegated(text, match.index))) hits.push(pattern.source);
  }
  return hits;
}

export function checkRedFlags(message) {
  const text = normalizeMessage(message);
  const matches = [];
  for (const candidate of SAFETY_RULES) {
    const hits = matchingPatterns(text, candidate.patterns, { ignoreNegated: true });
    if (hits.length >= candidate.minimumHits) {
      matches.push({
        status: "ok",
        fired: true,
        name: candidate.name,
        disposition: operationalDisposition(candidate),
        subtype: candidate.subtype,
        evidence: hits,
        directive: candidate.directive,
      });
    }
  }
  // Never let an earlier same-day match shadow a later emergency match.
  const selected = matches.find(({ disposition }) => disposition === EMERGENCY_NOW) ?? matches[0];
  if (selected) return selected;
  return { status: "ok", fired: false, name: null, disposition: null, subtype: null, evidence: [], directive: null };
}

export function classifyIntent(message) {
  const text = normalizeMessage(message);
  if (matchingPatterns(text, REFILL_PATTERNS).length > 0) return { intent: "refill", phenotype: null, subtype: null, evidence: [] };
  if (matchingPatterns(text, RESULTS_PATTERNS).length > 0) return { intent: "results", phenotype: null, subtype: null, evidence: [] };
  if (matchingPatterns(text, NAVIGATION_PATTERNS).length > 0) return { intent: "navigation", phenotype: null, subtype: null, evidence: [] };
  for (const candidate of SELF_CARE_RULES) {
    const hits = matchingPatterns(text, candidate.patterns);
    if (hits.length >= candidate.minimumHits) {
      return { intent: "self_care", phenotype: candidate.name, subtype: candidate.subtype, evidence: hits };
    }
  }
  return { intent: "clinical", phenotype: null, subtype: null, evidence: [] };
}
