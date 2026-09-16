import { z } from "zod";
import type { citationAudit } from "../evidence/claims.ts";
import { reviewPrioritySchema, workTypeSchema, asyncTimingPresent } from "./routing-policy.ts";
import { routingConsequenceSchema, pendingInstructionFor } from "./clarification-policy.ts";
import { boundEmergencyTransport } from "./care-setting.ts";
import { medicationDirectiveFindings } from "./medication-directives.ts";
import type { TransportTimings, TransportCacheUsage } from "./transport.ts";
import type { JudgeSourceAnchorRepairAudit } from "./judge-source-anchor-repair.ts";

export const routes = ["SELF_CARE", "ASYNC_PHYSICIAN", "SAME_DAY_IN_PERSON", "EMERGENCY_NOW"] as const;
// App-produced after independent review, never trusted merely because a draft
// names a transport mode. The directive binds the review to the released text.
export const reviewedEmergencyTransportSchema = z.object({ mode: z.enum(["activate_ems", "continue_ems", "ed_now"]), activationQuote: z.string().min(3).max(600).nullable(), directive: z.string().min(20).max(1600), review: z.literal("independent_model") }).strict().refine(v => v.mode === "continue_ems" ? v.activationQuote !== null : v.activationQuote === null);
export const answerSchema = z.object({
  disposition: z.enum(routes),
  reviewPriority: reviewPrioritySchema.nullable().optional(),
  workType: workTypeSchema.nullable().optional(),
  reason: z.string().min(12).max(900),
  patientMessage: z.string().min(20).max(1600),
  differential: z.array(z.string().min(3).max(220)).min(1).max(3),
  redFlags: z.array(z.object({
    concern: z.string().min(3).max(140),
    status: z.enum(["reported", "denied", "unknown"]),
    quote: z.string().max(300).describe("Exact patient quote for reported/denied; unknown may cite exact context or use empty text when unmentioned. Never infer a denial."),
  })).min(1).max(6),
  vitalSigns: z.string().min(8).max(500).describe("Reported values with limitations, or explicit missing measurements. No invented normal values."),
  questions: z.array(z.string().min(5).max(220)).max(3),
  evidence: z.array(z.object({ sourceId: z.string(), claim: z.string().min(8).max(600) })).max(4),
  evidenceLimitations: z.string().min(8).max(500),
}).strict();
export type DispositionAnswer = z.infer<typeof answerSchema> & { emergencyTransport?: import("./care-setting.ts").ReviewedEmergencyTransport };
// Client-safe contracts: no provider, filesystem or search imports at runtime.
export const adaptiveAnswerSchema = answerSchema.extend({
  // Resource bound, not a writing target. A long limitations note must not
  // erase an otherwise valid care recommendation or be truncated silently.
  evidenceLimitations: z.string().min(8).max(4000),
  differential: z.array(z.string().min(3).max(220)).max(5),
  redFlags: z.array(answerSchema.shape.redFlags.element).max(10),
  questions: z.array(z.string()).max(0),
});
export function presentationChecks(answer: DispositionAnswer): Check[] {
  return [{ id: "response_concision", status: answer.evidenceLimitations.length <= 500 ? "pass" : "fail", detail: "Evidence limitations should fit within 500 characters. Longer text is preserved and expandable; this presentation target is not a clinical admission gate." }];
}
export const clarificationSchema = z.object({ question: z.string().min(10).max(350), why: z.string().min(10).max(400), quote: z.string().min(3).max(160), routingConsequence: routingConsequenceSchema.nullable().optional() }).strict();
export function validClarification(value: z.infer<typeof clarificationSchema>, message: string) {
  return clarificationSchema.safeParse(value).success && message.includes(value.quote) && /\?$/.test(value.question.trim()) && !/\b(?:ignore|wait for|take \d|insert|probe|drive yourself|stop taking|start taking)\b/i.test(value.question);
}
export function validAdaptiveQuestion(event: Extract<ResponseEvent, { kind: "intake_question" }>, message: string) {
  const nonblocking = event.blocksRouting === false && event.decisionChanging === undefined && event.routingConsequence === undefined && event.interimInstruction === undefined;
  const legacy = event.blocksRouting === undefined && typeof event.decisionChanging === "boolean" && (event.interimInstruction === undefined ? event.routingConsequence === undefined : event.interimInstruction === pendingInstructionFor(event));
  return /^adaptive-[a-f0-9]{16}$/.test(event.questionId) && (nonblocking || legacy) && typeof event.why === "string" && validClarification({ question: event.text, why: event.why, quote: event.quote, routingConsequence: event.routingConsequence }, message);
}
// Provider transport enforces structure, not presentation length. Local validation
// retains an overlong rejected answer for audit instead of losing it in SDK errors.
export const transportAnswerSchema = z.object({
  disposition: z.enum(routes), patientMessage: z.string(), reason: z.string(),
  differential: z.array(z.string()),
  redFlags: z.array(z.object({ concern: z.string(), status: z.enum(["reported", "denied", "unknown"]), quote: z.string() })),
  vitalSigns: z.string(), questions: z.array(z.string()),
  evidence: z.array(z.object({ sourceId: z.string(), claim: z.string() })),
  evidenceLimitations: z.string(),
}).strict();
export type Guidance = { id: string; title: string; url: string; section: string; summary: string; reviewedAt: string; projectInterpretation?: string;
  retrievedPassages?: { id: string; sourceId: string; excerpt: string; excerptSha256: string; retrievedAt: string; sourceContentHash: string; kind: string; limitations: string }[];
  evidenceRecord?: { recordHash?: string; libraryHash: string; recommendationHash: string; sourceId: string; status: string; reviewDue: string; population: string; applicability: string; passages: import("../evidence/library.ts").Passage[]; limitations: string[]; clinicianApproval: null };
};
export type MechanicalVitalLocation = { field: "vitalSigns"; start: number; end: number; matchedText: string };
export type Check = { id: string; status: "pass" | "fail" | "not_assessed"; detail: string; repairLocations?: MechanicalVitalLocation[] };
export type SafetyNotice = { disposition: "EMERGENCY_NOW" | "SAME_DAY_IN_PERSON"; directive: string; source: "initial_screen" | "emergency_agent"; elapsedMs?: number };
export type ResponseEvent =
  | { kind: "action"; notice: SafetyNotice; elapsedMs?: number; sequence?: number }
  | { kind: "care_revision"; reconciliation: import("./reconciliation.ts").CareReconciliation; elapsedMs?: number; sequence?: number }
  | { kind: "patient_reply"; disposition: DispositionAnswer["disposition"]; text: string; emergencyTransport?: import("./care-setting.ts").ReviewedEmergencyTransport; elapsedMs?: number; sequence?: number }
  | { kind: "intake_question"; questionId: string; quote: string; text: string; why?: string; decisionChanging?: boolean; blocksRouting?: false; routingConsequence?: z.infer<typeof routingConsequenceSchema> | null; interimInstruction?: string; elapsedMs?: number; sequence?: number; runId?: string }
  | { kind: "opening"; quote: string; text: string; elapsedMs?: number; sequence?: number };
export type WorkflowProfile = "progressive-opus" | "parallel-opus" | "haiku-opus" | "compact-opus" | "conversational-opus" | "adaptive-opus" | "adaptive-no-retrieval" | "adaptive-critique" | "base-opus" | "evidence-graph-opus";
export type ReviewInputBinding = { patientHash: string; draftHash: string; packetHash: string };
export type AgentExecution = { role: "history" | "emergency" | "disposition" | "intake" | "critic" | "reconciliation"; model: string; modelCalls: number; output: unknown; rawOutput?: unknown; judgeSerialization?: { protocol: string; packetHash: string; wireHash: string }; judgeSourceRepair?: JudgeSourceAnchorRepairAudit; reviewInputBinding?: ReviewInputBinding; repairInputBinding?: { baseDraftHash: string; evidenceHash: string; allowedFields: string[] }; failure: string | null; attempt?: { number: number; offsetMs: number; selected: boolean; policy: string }; firstTextDeltaMs?: number | null; durationMs?: number; streamProgress?: { lastTextDeltaMs: number | null; textDeltaCount: number; textCharacters: number }; transportTimings?: TransportTimings; cacheUsage?: TransportCacheUsage; failureDetails?: { stage: string; finishReason: string | null; httpStatus: number | null }; usage: { inputTokens: number | null; outputTokens: number | null } };
export type Assessment = {
  graph?: import("./clinical-graph.ts").GraphMetadata;
  status: "complete" | "review_required" | "unavailable" | "awaiting_input";
  clarification?: z.infer<typeof clarificationSchema>;
  clarificationAssessment?: z.infer<typeof import("./clarification-policy.ts").clarificationAssessmentSchema>;
  routingPolicy?: string;
  reconciliation?: import("./reconciliation.ts").CareReconciliation;
  pendingInstruction?: string;
  adaptive?: { version: string; mode: string; plan: import("./adaptive.ts").ClinicalPlan | null; evidence: import("../evidence/search.ts").EvidenceSearchResult; support?: z.infer<typeof import("./adaptive.ts").adaptiveOutputSchema>["support"] };
  generation?: { effort: string; maxOutputTokens: number; execution?: typeof import("./execution-policy.ts").EXECUTION_POLICY; recovery?: typeof import("./recovery.ts").RECOVERY_POLICY | null };
  answer: DispositionAnswer | null;
  origin: "agent" | "emergency_safeguard" | "validation_safeguard" | "none";
  modelCalls: number;
  checks: Check[];
  failure: string | null;
  safetyFloor: { disposition: string; directive: string } | null;
  rejectedAnswer?: unknown;
  rejectedChecks?: Check[];
  guidance: Guidance[];
  usage: { inputTokens: number | null; outputTokens: number | null };
  agents?: AgentExecution[];
  evidenceAudit?: ReturnType<typeof citationAudit>;
  retrievalAudit?: ReturnType<typeof import("../evidence/retrieval.ts").retrieveEvidence>["audit"];
};
export type DispositionRun = Assessment & {
  handoff?: { episodeId: string; revision: number | null; persisted: boolean };
  version: "disposition-agent/v1" | "disposition-agent/v2" | "disposition-agent/v3";
  workflowId: "counsel-disposition-agent" | "clinical-evidence-graph";
  runId: string;
  traceId: string;
  tracePersisted: boolean;
  artifactPersisted: boolean;
  message: string;
  inputHash: string;
  answerHash: string | null;
  promptHash: string;
  guidanceHash: string;
  model: string;
  completedAt: string;
  durationMs: number;
  workflowDurationMs?: number;
  tracePersistenceDurationMs?: number;
  steps: { id: string; status: string; durationMs: number | null }[];
  safetyNotices?: SafetyNotice[];
  profile?: WorkflowProfile;
  responseEvents?: ResponseEvent[];
  firstActionMs?: number | null;
  firstPatientReplyMs?: number | null;
  firstOpeningMs?: number | null;
  firstQuestionMs?: number | null;
  eventLogPersisted?: boolean;
  spendPolicy?: "manual-gui-v1" | "reserved-experiment";
};

export const careTiming = {
  SELF_CARE: "Self-care guidance and return precautions",
  ASYNC_PHYSICIAN: "Counsel clinician review · priority and availability must be established",
  SAME_DAY_IN_PERSON: "In-person assessment today · do not wait for an asynchronous reply",
  EMERGENCY_NOW: "Emergency assessment now · do not wait for a reply or vital signs",
} as const;

export function hasImmediateEmsDirective(message: string): boolean {
  const prefix = /^(?:please\s+)?call\s+911(?:\s*\([^)]{1,80}\))?\s+(?:right\s+)?(?:now|immediately)\b/i.exec(message.trim())?.[0];
  return Boolean(prefix && !/\b(if|unless|when)\b/i.test(prefix));
}

// These are deliberately named contract checks, NOT a clinical quality score.
// Semantic correctness and citation entailment need a separate, calibrated review.
export type HandoffLanguageFinding = { kind: "future_clinician_task" | "unconfirmed_operation" | "response_guarantee"; clause: string; match: string };
export function handoffLanguageFindings(text: string): HandoffLanguageFinding[] {
  const future = /\b(?:a|your|the) (?:clinician|physician|doctor|care team) will (?:review|assess|contact|see)\b/gi;
  const operation = /\b(?:I|we)(?:['’](?:ve|ll)| have| will)? (?:already )?(?:sent|send|forwarded|forward|notified|notify|booked|book|scheduled|schedule|referred|refer|contacted|contact|dispatched|dispatch|accepted|accept)\b|\b(?:your|the|this) (?:message|request|refill|appointment|referral) (?:has been|was|is now) (?:sent|forwarded|booked|scheduled|approved|accepted)\b|\b(?:a|your|the|our) (?:clinician|physician|doctor|care team) (?:has |have |already )?(?:accepted|received|confirmed|scheduled|booked)\b/gi;
  const findings: HandoffLanguageFinding[] = [];
  for (const [pattern, kind] of [[future, "future_clinician_task"], [operation, "unconfirmed_operation"]] as const) for (const hit of text.matchAll(pattern)) {
    const index = hit.index!, before = text.slice(0, index), after = text.slice(index);
    // Scope only the immediate non-confirmation qualifier, never the whole
    // sentence: a following actual booking/acceptance remains a separate hit.
    if (kind === "unconfirmed_operation" && /\b(?:(?:does not|doesn't|cannot|can't|do not) (?:confirm|establish|mean|indicate|imply)(?: that)?|no (?:confirmation|evidence|indication) that)\s*$/i.test(before)) continue;
    const start = Math.max(before.lastIndexOf("."), before.lastIndexOf("!"), before.lastIndexOf("?"), before.lastIndexOf(";"), before.lastIndexOf("\n")) + 1;
    const end = after.search(/[.!?;\n]/), clause = text.slice(start, end < 0 ? text.length : index + end + 1).trim();
    // A stated response time/guarantee is not a generic description of the
    // prescribing task. Contextual model review cannot clear this hard finding.
    const guarantee = kind === "future_clinician_task" && /\b(?:within|by|guarantee\w*|definitely|certainly|today|tomorrow|tonight|this (?:morning|afternoon|evening)|in (?:\d+|one|two|three|a|an) (?:minutes?|hours?|days?))\b/i.test(clause);
    findings.push({ kind: guarantee ? "response_guarantee" : kind, clause, match: hit[0] });
  }
  return findings;
}

export function blanketClearanceFindings(answer: Pick<DispositionAnswer, "reason" | "patientMessage" | "vitalSigns">) {
  return (["reason", "patientMessage", "vitalSigns"] as const).flatMap(field => {
    // Exempt only the bounded limitation phrase, never the whole sentence.
    const text = answer[field]
      .replace(/\bnormal vitals (?:cannot|can't|must not|should not) be (?:assumed|inferred|established|confirmed)\b/gi, "[unmeasured vitals limitation]")
      .replace(/\b(?:not (?:evidence|proof) of|does not (?:establish|confirm|imply)) normal vitals\b/gi, "[unmeasured vitals limitation]");
    return [...text.matchAll(/\b((?:no|without) (?:(?:reported|obvious|apparent) )?red flags|normal vitals|vitals (?:are |all )?normal|hemodynamically stable|all red flags (?:are )?(?:absent|negative))\b/gi)].map(m => ({ field, phrase: m[0] }));
  });
}

export const ONSET_PATTERN_ADMISSION_POLICY = Object.freeze({ version: "onset-pattern-admission/v1", scope: "usual-pattern-alone-is-not-onset-evidence", onsetLanguage: "not_assessed-requires-full-exact-draft-review" });
export const ONSET_PATTERN_REVIEW_DETAIL = "onset-pattern-admission/v1: Onset language is present, not clinically validated by this pattern check. Patient attribution, chronology, negation, maximal-at-onset versus worst-ever severity, and contradictions require the mandatory full exact-draft judge; exact patient-quote membership remains separately required.";
/** Three-state wording guard, not a parser of clinical truth. An onset assertion
 * (including a negated or conditional assertion) is deferred, never auto-passed.
 * The full judge must evaluate the whole patient message and exact draft. */
export function onsetPatternCheck(flags: DispositionAnswer["redFlags"]): Check {
  const relevant = flags.filter(flag => flag.status === "denied" && /thunderclap|sudden|worst.ever/i.test(flag.concern) && /usual|same|always/i.test(flag.quote));
  const hasOnsetLanguage = (quote: string) => /\b(?:(?:come|came) on|start(?:ed)?|begin|began|develop(?:ed)?)\b[^.!?]{0,50}\b(?:gradual(?:ly)?|slow(?:ly)?|sudden(?:ly)?|instant(?:ly)?|explosive(?:ly)?)\b|\b(?:gradual|sudden|thunderclap) onset\b|\b(?:not|no|never|without)\b[^.!?]{0,40}\b(?:sudden|thunderclap|worst|explosive)\b/i.test(quote);
  const status = relevant.some(flag => !hasOnsetLanguage(flag.quote)) ? "fail" : relevant.length ? "not_assessed" : "pass";
  return { id: "usual_pattern_not_onset_denial", status, detail: status === "not_assessed" ? ONSET_PATTERN_REVIEW_DETAIL : "A usual symptom pattern does not explicitly deny thunderclap onset. Targeted observed-error regression, not a complete semantic verifier." };
}

export function checkAnswer(answer: DispositionAnswer, message: string, guidance: Guidance[], floor: string | null): Check[] {
  const rank = (route: string) => (routes as readonly string[]).indexOf(route);
  const quotesValid = answer.redFlags.every((flag) => (flag.status === "unknown" && flag.quote === "") || (flag.quote.trim().length > 0 && message.includes(flag.quote)));
  const ids = new Set(guidance.map((source) => source.id));
  const linksValid = answer.evidence.every((citation) => ids.has(citation.sourceId));
  const text = [answer.reason, answer.patientMessage, answer.vitalSigns].join(" ");
  const blanketClearance = blanketClearanceFindings(answer);
  const absenceText = text.replace(/\b(?:cannot|can't|do not|don't) (?:assume|infer|conclude|establish)(?: that)? you are asymptomatic\b/gi, "[unknown symptom status]");
  const assertsNoSymptoms = /\basymptomatic\b|\byou (?:report|have) no (?:new |current )?symptoms\b|\byou (?:are|remain) (?:without symptoms|symptom.free)\b/i.test(absenceText);
  const usualPatternClearsOnset = answer.redFlags.some(flag => flag.status === "denied" && /thunderclap|sudden|worst.ever/i.test(flag.concern) && /usual|same|always/i.test(flag.quote) && !/\b(?:not|no|never|without)\b[^.!?]{0,40}\b(?:sudden|thunderclap|worst|explosive)\b/i.test(flag.quote));
  const explicitNoSymptoms = [...message.matchAll(/\b(?:i (?:have|report) no (?:new |current )?symptoms|i(?:['’]m| am) (?:asymptomatic|symptom.free|without symptoms))\b|(?:^|[.!?]\s*)no (?:new |current )?symptoms(?:[,;.!?]|$)/gi)]
    .some(match => !/\b(?:if|whether|suppose|hypothetically)\b/i.test(message.slice(Math.max(0, match.index - 100), match.index).split(/[.!?;]/).at(-1) ?? ""));
  const directive = answer.patientMessage;
  const unsupportedPromise = handoffLanguageFindings(directive).length > 0;
  // Preserve non-delay/measurement language without exempting the rest of its
  // sentence: a later actual medication directive must still be detected.
  const medicationText = directive
    .replace(/\b(?:don['’]t|do not) stop to (?:measure|check|obtain|record)\b/gi, "[non-delay instruction]")
    .replace(/\b(?:start|stop|continue|keep) taking (?:your )?(?:readings|measurements|temperature|blood pressure|pulse|oxygen saturation)\b/gi, "[measurement instruction]");
  const medicationDirective = /\b(?:don['’]t|do not) (?:stop|skip)\b|\b(?:start|stop|continue|keep) taking\b/i.test(medicationText);
  const expandedFeverDenial = answer.redFlags.some((flag) => flag.status === "denied" && /^no fever[.!]?$/i.test(flag.quote.trim()) && /systemic|chills|rigors|confusion/i.test(flag.concern));
  const intakeClearsDehydration = answer.redFlags.some((flag) => flag.status === "denied" && /dehydrat/i.test(flag.concern) && /(?:eat|drink|oral intake)/i.test(flag.quote) && !/no dehydration|not dehydrated/i.test(flag.quote));
  const incorrectNiceTarget = answer.evidence.some((citation) => citation.sourceId === "nice-ng19" && /(?:assessment|triage).{0,30}within (?:one|1) working day/i.test(citation.claim) && !/further working day/i.test(citation.claim));
  const claims = [answer.reason, answer.patientMessage, ...answer.evidence.map((item) => item.claim)].join(" ");
  const unsupportedTimeRisk = /risk[^.!?]{0,45}(?:highest|greatest)[^.!?]{0,30}(?:first|initial)[^.!?]{0,20}hours/i.test(claims);
  const oxygenAttributedToNhs = answer.evidence.some((citation) => citation.sourceId === "nhs-breathlessness" && /(?:missing|normal|absent|regardless)/i.test(citation.claim) && /oxygen|saturation|oximetry|readings/i.test(citation.claim));
  const breathingContradiction = answer.redFlags.some((flag) => flag.status === "unknown" && /breath|dyspn|respirat/i.test(flag.concern)) && /\b(?:without|no) (?:breathing difficulty|difficulty breathing|shortness of breath)\b/i.test(answer.reason);
  const inhalerFindings = medicationDirectiveFindings({ message, patientMessage: directive, reason: answer.reason });
  const unsupportedRisk = /(?:risk|chance|probability|likelihood|mortality|fatality|die|death|kill)[^.!?]{0,70}\d+(?:\.\d+)?\s*(?:%|percent)|\d+(?:\.\d+)?\s*(?:%|percent)[^.!?]{0,70}(?:risk|chance|people|patients|die|death|surviv)|\b\d+\s+in\s+\d+\b/i.test(claims);
  const asksSelfProbing = /\b(?:feel|probe|poke|touch|insert)[^.!?]{0,65}(?:bone|wound base|wound depth|anything hard)/i.test([answer.patientMessage, ...answer.questions].join(" "));
  const awakeClearsNeuro = answer.redFlags.some((flag) => flag.status === "denied" && /conscious|neurolog|brain injur/i.test(flag.concern) && /(?:feel|am|I'm) awake/i.test(flag.quote) && !/no loss of consciousness|did not lose consciousness/i.test(flag.quote));
  const traumaRulesOutLeak = /(?:denies|denied|no |absence of |without )[^.!?]{0,60}(?:trauma|injury|surgery)[^.!?]{0,80}(?:so |therefore|making)[^.!?]{0,80}(?:CSF|leak)[^.!?]{0,80}(?:do not apply|ruled out|excluded|unsupported|not possible)/i.test(claims);
  const penetratingContext = /penetrat|(?:chopstick|object|pencil)[^.!?]{0,70}(?:deep|still inside|stuck)/i.test(message);
  const nosebleedPositioning = penetratingContext && /\b(?:sit upright|lean (?:slightly )?forward)\b/i.test(directive);
  const deferredWorsening = /\bworsen(?:ing|s)? (?:past|after|beyond) (?:about )?(?:ten|10) days\b/i.test(directive);
  // Exempt only the bounded "not before emergency care" clause, not the entire
  // sentence. A later claim that readings are unnecessary must still fail.
  const vitalClaims = answer.disposition === "EMERGENCY_NOW" ? answer.vitalSigns.replace(/\b(?:none|no (?:readings|measurements|vitals)) (?:are )?(?:needed|required) (?:before (?:(?:seeking|obtaining|accessing) )?emergency (?:assessment|care)|to act on this)\b/gi, "[do not delay emergency care]") : answer.vitalSigns;
  const unmeasuredVitalsDismissed = /(?:none|no (?:readings|measurements|vitals)) (?:are )?(?:needed|required)|(?:vitals|readings|measurements) (?:are )?(?:unnecessary|not needed)/i.test(vitalClaims);
  // Attribute the existing finding to exact offsets in the original field.
  // Replacement above can change offsets; exclude only its original spans.
  const exemptVitalSpans = answer.disposition === "EMERGENCY_NOW" ? [...answer.vitalSigns.matchAll(/\b(?:none|no (?:readings|measurements|vitals)) (?:are )?(?:needed|required) (?:before (?:(?:seeking|obtaining|accessing) )?emergency (?:assessment|care)|to act on this)\b/gi)] : [];
  const vitalRepairLocations: MechanicalVitalLocation[] = unmeasuredVitalsDismissed
    ? [...answer.vitalSigns.matchAll(/(?:none|no (?:readings|measurements|vitals)) (?:are )?(?:needed|required)|(?:vitals|readings|measurements) (?:are )?(?:unnecessary|not needed)/gi)]
      .filter(match => !exemptVitalSpans.some(exempt => match.index >= exempt.index && match.index + match[0].length <= exempt.index + exempt[0].length))
      .map(match => ({ field: "vitalSigns", start: match.index, end: match.index + match[0].length, matchedText: match[0] }))
    : [];
  const unsupportedRinses = /(?<!avoid )(?<!no )\b(?:saline rinses|nasal irrigation|neti pots?)\b/i.test(directive.replace(/\b(?:do not|don't|avoid) (?:use |recommend )?(?:saline rinses|nasal irrigation|neti pots?)\b/gi, "[irrigation not advised]"));
  const timingPresent = answer.disposition === "EMERGENCY_NOW"
    ? boundEmergencyTransport(answer.emergencyTransport, directive, message) || /\b(now|immediately)\b/i.test(directive) && /\b(9[\s\p{Pd}]*1[\s\p{Pd}]*1|emergency (?:department|room|services)|labor.and.delivery)\b/iu.test(directive)
    : answer.disposition === "SAME_DAY_IN_PERSON"
      ? /\b(today|same.day)\b/i.test(directive) && /\b(in.person|examined|examination)\b/i.test(directive)
      : answer.disposition === "ASYNC_PHYSICIAN"
        ? asyncTimingPresent(answer, directive)
        : /\b(if|worsen|seek)\b/i.test(directive);
  const check = (id: string, pass: boolean, detail: string): Check => ({ id, status: pass ? "pass" : "fail", detail });
  return [
    check("escalation_floor", floor === null || rank(answer.disposition) >= rank(floor), "The answer must not downgrade a triggered safety rule."),
    check("quoted_patient_evidence", quotesValid, "Reported and denied flags require an exact input quote; this does not prove correct interpretation."),
    check("citation_provenance", linksValid, "Every cited source must have been retrieved before generation."),
    check("no_blanket_clearance", blanketClearance.length === 0, "Limited phrase check for unsupported blanket reassurance; not a complete hallucination detector." + (blanketClearance.length ? ` Matched fields and exact phrases: ${JSON.stringify(blanketClearance)}. Replace these blanket statements with specific reported, denied or unknown findings without changing the supported care route.` : "")),
    check("unreported_symptoms_not_denied", !assertsNoSymptoms || explicitNoSymptoms, "A medication-only request does not establish that the patient is asymptomatic. Targeted assertion/provenance check, not full clinical entailment."),
    check("usual_pattern_not_onset_denial", !usualPatternClearsOnset, "A usual symptom pattern does not explicitly deny thunderclap onset. Targeted observed-error regression, not a complete semantic verifier."),
    check("action_timing_present", timingPresent, "Checks explicit timing/destination tokens or exact independently reviewed emergency-transport binding; not clinical validation or verification of EMS activation."),
    check("no_unconfirmed_handoff", !unsupportedPromise, "No claim that a clinician will review when no appointment or handoff has been made; limited phrase regression."),
    check("no_unauthorized_medication_change", !medicationDirective, "This disposition workflow cannot authorize starting, stopping or continuing medication; contraindications and prescribing review are not established. Targeted wording check, not a complete medication-safety assessment."),
    check("denial_scope", !expandedFeverDenial, "A denial of fever alone cannot clear chills, confusion or systemic infection; targeted regression, not full entailment."),
    check("intake_is_not_hydration_exam", !intakeClearsDehydration, "Reported eating or drinking does not establish absence of dehydration; targeted regression, not a complete attribution check."),
    check("guideline_deadline_fidelity", !incorrectNiceTarget, "NICE referral and further-working-day triage targets must not become a one-day assessment mandate; targeted regression."),
    check("no_unsupported_statistics", !unsupportedRisk, "Numerical population-risk claims are not admitted without independent statistic verification. A number in an abstract is not patient-specific risk; this limited pattern check is not full entailment."),
    check("no_unsupported_risk_timeline", !unsupportedTimeRisk, "The retrieved stroke note does not support a highest-risk-in-first-hours claim; preserve emergency action without inventing a timeline."),
    check("source_interpretation_boundary", !oxygenAttributedToNhs, "The NHS symptom page does not establish a normal/missing-oximetry rule; distinguish clinical interpretation from source claims."),
    check("unknown_breathing_not_cleared", !breathingContradiction, "An unknown breathing finding cannot become absent in the rationale; targeted cross-field consistency check."),
    check("no_unverified_inhaler_plan", !inhalerFindings.length, "Do not invent an inhaler or rescue regimen; a prescription/plan mention alone is not authority for a new instruction. Targeted prose finding, not prescribing validation." + (inhalerFindings.length ? ` Findings: ${JSON.stringify(inhalerFindings)}` : "")),
    check("no_patient_wound_probing", !asksSelfProbing, "Do not ask the patient to palpate or probe a wound for bone; that examination belongs to a trained clinician."),
    check("wakefulness_not_neurologic_clearance", !awakeClearsNeuro, "Reported wakefulness cannot establish absence of loss of consciousness or neurological injury; targeted observed-error check."),
    check("atraumatic_leak_not_excluded", !traumaRulesOutLeak, "Absence of surgery/trauma alone does not exclude spontaneous CSF leakage; limited causal-phrase regression, not full reasoning verification."),
    check("no_nosebleed_positioning_in_penetration", !nosebleedPositioning, "Do not import routine nosebleed positioning into suspected penetrating head injury; follow dispatcher instructions. Targeted regression."),
    check("worsening_not_deferred_ten_days", !deferredWorsening, "Worsening and ten-day persistence are separate reasons to seek care; targeted observed-wording check."),
    { ...check("unmeasured_vitals_not_dismissed", !unmeasuredVitalsDismissed, "Do not declare missing readings unnecessary from a brief message; their need is not established by this prototype."), ...(unmeasuredVitalsDismissed ? { repairLocations: vitalRepairLocations } : {}) },
    check("irrigation_support_missing", !unsupportedRinses, "This corpus does not supply nasal-irrigation technique/water-safety guidance. Do not recommend rinses without that support; not a claim that irrigation is always inappropriate."),
    { id: "research_support", status: answer.evidence.length ? "not_assessed" : "fail", detail: answer.evidence.length ? "Citations are present. Whether they support each claim and apply to this patient has NOT been graded." : "No retrieved research supports this answer. Evidence coverage is a known gap, not a pass." },
    { id: "clinical_correctness", status: "not_assessed", detail: "No physician or calibrated independent judge has scored this exact answer." },
  ];
}

/** Candidate-only checks: callers must require the full accepting exact-draft
 * judge before release. Legacy/default checks never gain semantic deferral. */
export function checkAnswerForFullReview(answer: DispositionAnswer, message: string, guidance: Guidance[], floor: string | null): Check[] {
  return checkAnswer(answer, message, guidance, floor).map(check => check.id === "usual_pattern_not_onset_denial" ? onsetPatternCheck(answer.redFlags) : check);
}
