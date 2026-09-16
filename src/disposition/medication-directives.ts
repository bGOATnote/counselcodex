/** A targeted prose tripwire, not a prescribing decision or clinical validator.
 * Findings retain exact field-local spans for review/repair. Patient reports of
 * a prescription or action plan are not authority for a new model instruction.
 * Absence of a finding does not establish medication safety or eligibility.
 */
export type MedicationDirectiveField = "patientMessage" | "reason";
export type MedicationDirectiveInput = {
  message: string;
  patientMessage: string;
  reason?: string;
};
export type MedicationDirectiveFinding = {
  id: "no_unverified_inhaler_plan";
  field: MedicationDirectiveField;
  matchedText: string;
  start: number;
  end: number;
  rule: "medicine_action" | "inhaled_dose" | "named_regimen" | "regimen_adoption";
  authority: "not_established";
};

const medicine = String.raw`\b(?:inhalers?|albuterol|salbutamol)\b`;
const action = String.raw`\b(?:use|using|take|taking|start|increase|repeat|continue|resume|restart|stop|reduce|decrease|double)\b`;
const quantity = String.raw`(?:\d+(?:\.\d+)?(?:\s*[-–]\s*\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|another|extra|more|several)`;
const dose = String.raw`\b${quantity}\s+(?:puffs?|inhalations?)\b`;
type Span = { start: number; end: number };

function nonDirectiveSpans(text: string, message: string): Span[] {
  const spans: Span[] = [];
  const add = (pattern: RegExp) => {
    for (const match of text.matchAll(pattern)) spans.push({ start: match.index, end: match.index + match[0].length });
  };
  // Mask only this grammatical predicate, never the rest of its conditional.
  // "If you start needing X, take four puffs" must still expose "take...".
  add(/\b(?:start|starts|started|begin|begins|began)\s+(?:needing|requiring)\b/gi);
  const object = String.raw`(?:(?:your|the|an|a|my)\s+)?(?:(?:usual|prescribed|rescue|reliever)\s+)?(?:(?:albuterol|salbutamol)\s+)?inhalers?\b`;
  // Bounded technique/history predicates, not arbitrary questions. A polite
  // instruction such as "Could you take four puffs now?" is NOT exempted.
  add(new RegExp(String.raw`\b(?:how (?:you use|(?:are|were) you using)|(?:how often|when) (?:do|did) you use|(?:are|were|have) you (?:been )?using)\s+${object}`, "gi"));
  add(new RegExp(String.raw`\byou (?:describe|described|report|reported|mention|mentioned) (?:using|taking)\s+(?:${dose}\s+(?:from|of)\s+)?${object}`, "gi"));
  // An explicitly attributed, verbatim patient quotation is evidence, not an
  // instruction. Quotes not in the original message receive no exemption.
  // Preserve all following prose, including instructions in the same sentence.
  for (const pattern of [/\byou\s+(?:said|wrote|reported|stated)\s*[:,]?\s*"([^"\n]+)"/gi, /\byou\s+(?:said|wrote|reported|stated)\s*[:,]?\s*“([^”\n]+)”/gi]) {
    for (const match of text.matchAll(pattern)) if (message.includes(match[1])) {
      // An instruction to follow the quoted text is adoption, not reporting.
      // In that case leave the quotation visible to the directive detectors.
      const prefix = text.slice(0, match.index).split(/[.!?;\n]/).at(-1) ?? "";
      if (/\b(?:follow|do|use|take|continue|repeat)\s+(?:exactly\s+)?(?:this|that)\s*[:—-]?\s*$/i.test(prefix)) continue;
      const start = match.index + match[0].indexOf(match[1]);
      spans.push({ start, end: start + match[1].length });
    }
  }
  return spans;
}

/** No trimming, paraphrase matching or whole-sentence negation exemptions.
 * Offsets use JavaScript UTF-16 indices and always slice the original field.
 * "No finding" is not proof that arbitrary medication prose is safe.
 */
export function medicationDirectiveFindings(input: MedicationDirectiveInput): MedicationDirectiveFinding[] {
  const findings: MedicationDirectiveFinding[] = [];
  for (const field of ["patientMessage", "reason"] as const) {
    const text = input[field] ?? "";
    const masked = text.split("");
    for (const span of nonDirectiveSpans(text, input.message)) for (let i = span.start; i < span.end; i++) masked[i] = " ";
    const scan = masked.join("");
    const candidates: MedicationDirectiveFinding[] = [];
    const collect = (pattern: RegExp, rule: MedicationDirectiveFinding["rule"]) => {
      for (const match of scan.matchAll(pattern)) candidates.push({ id: "no_unverified_inhaler_plan", field,
        matchedText: text.slice(match.index, match.index + match[0].length), start: match.index, end: match.index + match[0].length,
        rule, authority: "not_established" });
    };
    collect(new RegExp(String.raw`${action}[^.!?;\n]{0,65}?${medicine}`, "gi"), "medicine_action");
    // An inhaler mentioned by the patient can be omitted in a later dose
    // directive. A mention establishes topic, NOT authorization to give a dose.
    if (new RegExp(medicine, "i").test(input.message + "\n" + text)) {
      collect(new RegExp(String.raw`${action}[^.!?;\n]{0,40}?${dose}`, "gi"), "inhaled_dose");
      collect(new RegExp(String.raw`${medicine}\s*[:–—-]\s*${dose}`, "gi"), "named_regimen");
      collect(/\b(?:follow|continue|repeat|resume|restart|keep)\s+(?:(?:exactly|using|taking)\s+)?(?:that|this|the same|your usual)\s+(?:dose|dosing|regimen|schedule|plan|routine|instructions)\b/gi, "regimen_adoption");
    }
    // One field-local finding per overlapping instruction; keep the full span
    // if the medicine-action and dose detectors describe the same instruction.
    candidates.sort((a, b) => a.start - b.start || b.end - a.end);
    for (const candidate of candidates) {
      const previous = findings.at(-1);
      if (previous?.field === field && candidate.start < previous.end) {
        if (candidate.end > previous.end) { previous.end = candidate.end; previous.matchedText = text.slice(previous.start, previous.end); }
      } else findings.push(candidate);
    }
  }
  return findings;
}
