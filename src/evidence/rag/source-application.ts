/** Isolated, partial application-contract audit. No routing, model calls or
 * clinical approval. Authored patterns cover named regressions, not arbitrary
 * entailment. A clean result is NOT a support/applicability pass.
 */
import { auditAuthoredCitation } from "./disposition-support.ts";
import { accountClaimLinks } from "./v26.ts";
import { documentSchema, sha256, type Hit } from "./model.ts";
import { sameRepairValue } from "../../disposition/repair-values.ts";

export const SOURCE_APPLICATION_VERSION = "authored-source-application/v1";
type Rule = "aom-observation" | "insomnia-daytime-impact";
type Condition = { id: string; requirement: string; evidenceRequired: "diagnostic_assessment" | "patient_report" };
type Seed = {
  id: string; rule: Rule; documentId: string; sourceVersion: string; rawHash: string;
  canonicalClaim: string; qualifyingQuotes: string[]; conditions: Condition[]; boundary: string;
};
const compiledAomConditions: Condition[] = [
  { id: "aom-acute-onset", evidenceRequired: "patient_report", requirement: "The target patient's current ear episode has acute onset." },
  { id: "aom-middle-ear-effusion", evidenceRequired: "diagnostic_assessment", requirement: "Middle ear effusion has been established for the target patient's current ear episode." },
  { id: "aom-middle-ear-inflammation", evidenceRequired: "diagnostic_assessment", requirement: "Middle ear inflammation has been established for the target patient's current ear episode." },
];
const cdcAomConditions: Condition[] = [
  { id: "aom-otoscopic-diagnostic-pattern", evidenceRequired: "diagnostic_assessment", requirement: "The target patient's current episode satisfies one of the complete alternative otoscopic diagnostic patterns in the quoted CDC Diagnosis cell, including its otorrhea exclusion or mild-bulging qualifiers." },
  { id: "aom-middle-ear-effusion", evidenceRequired: "diagnostic_assessment", requirement: "Middle ear effusion has been established for the target patient's current episode based on pneumatic otoscopy and/or tympanometry, as stated by this source." },
  { id: "aom-conditional-observation", evidenceRequired: "diagnostic_assessment", requirement: "The target patient has mild AOM with the source's age/laterality combination (unilateral at 6–23 months, or unilateral/bilateral over 2 years), and watchful waiting is based on shared decision-making." },
];
// Source versions and complete witness wording were inspected in retained
// packets. These conditions are ENGINEER interpretations, not publisher rules
// or physician-attested eligibility. No patient, case, reference route or gold.
const seeds: readonly Seed[] = [
  { id: "compiled-aom-observation", rule: "aom-observation", documentId: "openem:pediatric-acute-otitis-media",
    sourceVersion: "c913c62bc13158b0173272760e69ce55f16abc6e", rawHash: "53385ae4af66eacf5722a88783c68301097b3a5b663f6d5857d91ee4c2b543fd",
    canonicalClaim: "The compiled AOM source requires acute onset, middle ear effusion and middle ear inflammation for its AOM diagnosis.",
    qualifyingQuotes: ["AOM requires: (1) acute onset, (2) middle ear effusion, AND (3) middle ear inflammation.",
      "Most episodes are self-limited: 80% resolve spontaneously within 3 days without antibiotics."],
    conditions: compiledAomConditions, boundary: "These are the compiled source's AOM diagnostic conditions, not a complete observation-eligibility rule. Without antibiotics does not by itself mean without clinician assessment. The compiled severity table is not independently endorsed. This contract does not mandate assessment for all earache or choose a route." },
  { id: "retained-insomnia-daytime-impact", rule: "insomnia-daytime-impact", documentId: "medlineplus:6055",
    sourceVersion: "https://medlineplus.gov/xml/mplus_topics_2026-09-12.xml", rawHash: "64f432c381cad613a5c7246c454301bec6d1d8151ed94c6b8d85231d71b37e22",
    canonicalClaim: "The retained insomnia source describes possible daytime sleepiness and lack of energy.",
    qualifyingQuotes: ["Insomnia can cause daytime sleepiness and a lack of energy."],
    conditions: [{ id: "daytime-sleepiness-or-low-energy", evidenceRequired: "patient_report", requirement: "The target patient currently reports daytime sleepiness or lack of energy." }],
    boundary: "A possible effect is not an observed patient finding. This condition preserves report scope; it does not resolve diagnosis, chronicity, clinician necessity or timing." },
  { id: "cdc-aom-observation", rule: "aom-observation", documentId: "cdc:pediatric-outpatient-aom",
    sourceVersion: "9fc7b9f9ff90d39919ce5f69e9e03198c9ca42e32b2a78501d20fda7881934f4", rawHash: "9fc7b9f9ff90d39919ce5f69e9e03198c9ca42e32b2a78501d20fda7881934f4",
    canonicalClaim: "The CDC AOM summary preserves diagnostic requirements and makes watchful waiting conditional.",
    qualifyingQuotes: ["Definitive diagnosis requires either:\n- Moderate or severe bulging of tympanic membrane (TM) or new onset otorrhea not due to otitis externa.\n- Mild bulging of the TM AND recent (<48h) onset of otalgia (holding, tugging, rubbing of the ear in a nonverbal child) or intense erythema of the TM.",
      "Do not diagnose AOM in children without middle ear effusion (based on pneumatic otoscopy and/or tympanometry).",
      "Mild cases with unilateral symptoms in children 6-23 months of age or unilateral or bilateral symptoms in children >2 years may be appropriate for watchful waiting based on shared decision-making."],
    conditions: cdcAomConditions, boundary: "Retain diagnostic, age, severity and shared-decision qualifiers. The publisher summary does not assign a route or mandate initial assessment for every earache." },
  { id: "nhlbi-insomnia-daytime-impact", rule: "insomnia-daytime-impact", documentId: "nhlbi:insomnia-diagnosis",
    sourceVersion: "03357b093540309dafa8613a0e5e24f6761348aa24301dd8b9826b30260d1efd", rawHash: "03357b093540309dafa8613a0e5e24f6761348aa24301dd8b9826b30260d1efd",
    canonicalClaim: "The NHLBI source conditions clinician contact advice on sleep loss affecting daily activities.",
    qualifyingQuotes: ["If not getting enough sleep is affecting your daily activities, talk to your doctor."],
    conditions: [{ id: "daytime-impact", evidenceRequired: "patient_report", requirement: "Not getting enough sleep is currently affecting the target patient's daily activities." }],
    boundary: "Not established and definitely absent are different. This contract does not establish impact, diagnosis, required care or safe delay." },
];

type Witness = { passageId: string; chunkHash: string; start: number; end: number; quote: string };
export type SourceApplicationContract = {
  protocol: typeof SOURCE_APPLICATION_VERSION; id: string; rule: Rule;
  authorship: "engineer_authored"; publisherReviewed: false; clinicalReview: "not_assessed";
  source: { documentId: string; sourceVersion: string; rawHash: string; metadataHash: string };
  canonicalClaim: string; witnesses: Witness[]; conditions: Condition[]; boundary: string; contractHash: string;
};
const payload = (contract: SourceApplicationContract) => { const { contractHash: _hash, ...rest } = contract; return rest; };
const metadataSchema = documentSchema.omit({ sections: true });

/** Build conditions only for exact known source versions with ALL qualifying
 * witnesses present in selected chunk TEXT. Context-only/missing witnesses do
 * not silently acquire citation support. No Ottawa rule is active: no retained
 * complete Ottawa witness was established in the existing task-support audit.
 */
export function applicationContractsForHits(hits: Hit[]): SourceApplicationContract[] {
  accountClaimLinks(hits, []); // Existing selected-passage integrity checks.
  const contracts: SourceApplicationContract[] = [];
  for (const seed of seeds) {
    const relevant = hits.filter(h => h.document.id === seed.documentId && h.document.sourceVersion === seed.sourceVersion
      && h.document.rawHash === seed.rawHash && h.document.currency === "not_assessed");
    if (!relevant.length) continue;
    if (relevant.some(h => !sameRepairValue(h.document, relevant[0].document))) throw new Error("APPLICATION_SOURCE_METADATA_CONFLICT");
    const witnesses = seed.qualifyingQuotes.map(quote => {
      const hit = relevant.find(h => h.chunk.text.includes(quote));
      if (!hit) return null;
      const start = hit.chunk.text.indexOf(quote);
      return { passageId: hit.chunk.id, chunkHash: hit.chunk.hash, start, end: start + quote.length, quote };
    });
    if (witnesses.some(w => w === null)) continue;
    const body: Omit<SourceApplicationContract, "contractHash"> = {
      protocol: SOURCE_APPLICATION_VERSION, id: seed.id, rule: seed.rule,
      authorship: "engineer_authored", publisherReviewed: false, clinicalReview: "not_assessed",
      source: { documentId: seed.documentId, sourceVersion: seed.sourceVersion, rawHash: seed.rawHash, metadataHash: sha256(JSON.stringify(metadataSchema.parse(relevant[0].document))) },
      canonicalClaim: seed.canonicalClaim, witnesses: witnesses as Witness[], conditions: structuredClone(seed.conditions), boundary: seed.boundary,
    };
    contracts.push({ ...body, contractHash: sha256(JSON.stringify(body)) });
  }
  return contracts;
}

/** Model input sidecar contains source conditions, never patient-derived facts,
 * desired routes or model-certified applicability. The caller must bind this
 * sidecar alongside the complete input, not only the original Hit packet hash.
 */
export function applicationSidecar(contracts: SourceApplicationContract[]): unknown {
  const invalid = (c: SourceApplicationContract) => {
    const seed = seeds.find(s => s.id === c.id);
    return !seed || c.contractHash !== sha256(JSON.stringify(payload(c))) || c.protocol !== SOURCE_APPLICATION_VERSION
      || c.authorship !== "engineer_authored" || c.publisherReviewed !== false || c.clinicalReview !== "not_assessed"
      || c.rule !== seed.rule || c.source.documentId !== seed.documentId || c.source.sourceVersion !== seed.sourceVersion
      || c.source.rawHash !== seed.rawHash || !/^[a-f0-9]{64}$/.test(c.source.metadataHash)
      || c.canonicalClaim !== seed.canonicalClaim || c.boundary !== seed.boundary
      || JSON.stringify(c.conditions) !== JSON.stringify(seed.conditions)
      || JSON.stringify(c.witnesses.map(w => w.quote)) !== JSON.stringify(seed.qualifyingQuotes)
      || c.witnesses.some(w => !/^[a-f0-9]{64}$/.test(w.passageId) || !/^[a-f0-9]{64}$/.test(w.chunkHash)
        || !Number.isInteger(w.start) || w.start < 0 || w.end !== w.start + w.quote.length);
  };
  if (new Set(contracts.map(c => c.id)).size !== contracts.length || contracts.some(invalid))
    throw new Error("APPLICATION_CONTRACT_IDENTITY_INVALID");
  return { protocol: SOURCE_APPLICATION_VERSION, authorship: "engineer_authored", publisherReviewed: false,
    clinicalReview: "not_assessed", semanticCoverage: "partial_authored_regressions_only",
    conditions: structuredClone(contracts),
    instruction: "These source-bound engineer-authored conditions do not establish patient eligibility. Read the original patient independently. Preserve unknown prerequisites; do not turn missing eligibility into an emergency or automatically require clinician care. Do not infer a negative finding from preserved function or partial assessment. General information and conditional precautions are distinct from applying a source to the current patient. An exact quotation or a clean audit is not clinical approval." };
}

type Citation = { passageId: string; quote: string; claim: string; applicability?: string; limitation?: string };
export type ApplicationDraft = { reason: string; citations: Citation[]; patientMessage?: string;
  redFlags?: { concern: string; status: string; quote: string }[] };
type Field = "reason" | "patientMessage" | `citations.${number}.claim` | `citations.${number}.limitation` | `redFlags.${number}.quote`;
type Finding = { ruleId: string; code: string; field: Field | "contract"; start: number | null; end: number | null; text: string; conditionIds: string[] };

export type SourceApplicationBinding = {
  contractId: string; contractHash: string; packetHash: string; patientHash: string;
  use: "general_information" | "conditional_precaution" | "patient_application";
  conditions: { conditionId: string; state: "unknown" | "reported_met" | "not_met";
    patientSpans: { start: number; end: number; quote: string }[] }[];
};

/** Structural foundation, separate from the free-prose regression audit. A
 * producer can misinterpret a perfectly bound quote; this API never certifies
 * that interpretation. All authored conditions form a strict AND conjunction.
 * Frozen live full/brief schemas do not produce these records; a separately
 * versioned experimental producer schema may supply them through the adapter.
 */
export function auditApplicationBinding(input: { patient: string; hits: Hit[]; contract: SourceApplicationContract; application: SourceApplicationBinding }) {
  const errors: string[] = [], a = input.application;
  let missingConditions: string[] = [];
  try {
    const expected = applicationContractsForHits(input.hits).find(c => c.id === input.contract.id);
    if (!expected || !sameRepairValue(expected, input.contract)) throw new Error("APPLICATION_CONTRACT_PACKET_MISMATCH");
    if (a.contractId !== expected.id || a.contractHash !== expected.contractHash || a.patientHash !== sha256(input.patient)
      || a.packetHash !== sha256(JSON.stringify(input.hits))) throw new Error("APPLICATION_BINDING_HASH_MISMATCH");
    if (!["general_information", "conditional_precaution", "patient_application"].includes(a.use) || !Array.isArray(a.conditions))
      throw new Error("APPLICATION_BINDING_INVALID");
    const ids = a.conditions.map(c => c.conditionId), wanted = expected.conditions.map(c => c.id);
    missingConditions = wanted.filter(id => !ids.includes(id));
    if (new Set(ids).size !== ids.length || ids.some(id => !wanted.includes(id)) || missingConditions.length)
      throw new Error("APPLICATION_CONDITION_COVERAGE_INVALID");
    for (const c of a.conditions) {
      if (!["unknown", "reported_met", "not_met"].includes(c.state) || !Array.isArray(c.patientSpans)
        || (c.state === "unknown" ? c.patientSpans.length !== 0 : c.patientSpans.length === 0))
        throw new Error("APPLICATION_CONDITION_STATE_INVALID");
      const spanIds = new Set<string>();
      for (const s of c.patientSpans) {
        const id = `${s.start}:${s.end}`;
        if (!Number.isInteger(s.start) || !Number.isInteger(s.end) || s.start < 0 || s.end <= s.start || s.end > input.patient.length
          || !s.quote.trim() || input.patient.slice(s.start, s.end) !== s.quote || spanIds.has(id)) throw new Error("APPLICATION_PATIENT_SPAN_INVALID");
        spanIds.add(id);
      }
    }
  } catch (error) { errors.push(error instanceof Error ? error.message : "APPLICATION_BINDING_FAILED"); }
  const conjunction = errors.length ? null : a.conditions.every(c => c.state === "reported_met");
  return { protocol: SOURCE_APPLICATION_VERSION, status: errors.length ? "fail" as const : "not_assessed" as const,
    errors, missingConditions, bindingValid: errors.length === 0, reportedPrerequisiteConjunction: conjunction,
    applicationStatus: errors.length ? "invalid_binding" as const : a.use !== "patient_application" ? "not_applying_to_current_patient" as const
      : conjunction ? "reported_prerequisites_bound" as const : "no_current_eligibility" as const,
    // This is an assertion-contract result, NOT a clinical eligibility result.
    currentApplicationMeetsDeclaredConditions: a.use === "patient_application" && conjunction === true,
    semanticVerification: "not_assessed" as const, patientEligibility: "not_assessed" as const,
    clinicalApproval: false as const, routeChanged: false as const,
    limitation: "Exact original-patient spans bind reported states only. Subject, episode, negation, clinical predicate meaning and evidence class are not verified. All-met can still be a false interpretation; it is not permission to publish or choose a route." };
}

export type CitationApplication = {
  citationIndex: number; ruleId: string; use: SourceApplicationBinding["use"];
  conditions: { conditionId: string; state: "reported_met" | "reported_not_met" | "unknown";
    patientSpans: { start: number; end: number }[] }[];
};

/** Candidate-only coverage adapter. Every (cited source contract, citation)
 * requires one application record; an empty array cannot evade a known rule.
 * Unknown sources stay unassessed. Known unknown/not-met prerequisites block
 * only an asserted CURRENT application, not general/conditional information.
 */
export function auditApplicationBindings(input: { patient: string; hits: Hit[]; contracts: SourceApplicationContract[];
  applications: CitationApplication[]; citations: Citation[] }) {
  const errors: string[] = [], rows: { citationIndex: number; ruleId: string;
    binding: ReturnType<typeof auditApplicationBinding>; authoredClaimSupport: ReturnType<typeof auditAuthoredCitation> }[] = [];
  let expectedApplications: { citationIndex: number; ruleId: string }[] = [];
  let coverageValidated = false;
  try {
    const expectedContracts = applicationContractsForHits(input.hits);
    if (!sameRepairValue(expectedContracts, input.contracts)) throw new Error("APPLICATION_CONTRACT_PACKET_MISMATCH");
    const links = accountClaimLinks(input.hits, input.citations.map((c, i) => ({ id: String(i), references: [{ passageId: c.passageId, quote: c.quote }] })));
    if (links.claims.some(c => c.missingReferences || c.unboundReferences)) throw new Error("APPLICATION_CITATION_IDENTITY_INVALID");
    expectedApplications = input.citations.flatMap((citation, citationIndex) => {
      const hit = input.hits.find(h => h.chunk.id === citation.passageId)!;
      return expectedContracts.filter(c => c.source.documentId === hit.document.id).map(c => ({ citationIndex, ruleId: c.id }));
    });
    const key = (a: { citationIndex: number; ruleId: string }) => `${a.citationIndex}:${a.ruleId}`;
    const wanted = expectedApplications.map(key), actual = input.applications.map(key);
    if (new Set(actual).size !== actual.length || wanted.length !== actual.length || actual.some(k => !wanted.includes(k)))
      throw new Error("APPLICATION_CITATION_COVERAGE_INVALID");
    coverageValidated = true;
    for (const application of input.applications) {
      const contract = expectedContracts.find(c => c.id === application.ruleId)!;
      if (!application.conditions.every(c => ["reported_met", "reported_not_met", "unknown"].includes(c.state)))
        throw new Error("APPLICATION_CONDITION_STATE_INVALID");
      const bound = auditApplicationBinding({ patient: input.patient, hits: input.hits, contract, application: {
        contractId: contract.id, contractHash: contract.contractHash, packetHash: sha256(JSON.stringify(input.hits)), patientHash: sha256(input.patient),
        use: application.use, conditions: application.conditions.map(c => ({ conditionId: c.conditionId,
          state: c.state === "reported_not_met" ? "not_met" : c.state,
          patientSpans: c.patientSpans.map(s => ({ ...s, quote: input.patient.slice(s.start, s.end) })) })),
      } });
      if (!bound.bindingValid) errors.push(...bound.errors.map(e => `${application.citationIndex}:${application.ruleId}:${e}`));
      else if (bound.applicationStatus === "no_current_eligibility") errors.push(`${application.citationIndex}:${application.ruleId}:CURRENT_APPLICATION_PREREQUISITES_UNESTABLISHED`);
      const citation = input.citations[application.citationIndex];
      const authoredClaimSupport = auditAuthoredCitation({ id: contract.id, claim: contract.canonicalClaim, boundary: contract.boundary,
        spans: contract.witnesses.map(w => ({ documentId: contract.source.documentId, quote: w.quote })) }, citation.claim,
      [{ passageId: citation.passageId, quote: citation.quote }], input.hits);
      rows.push({ citationIndex: application.citationIndex, ruleId: application.ruleId, binding: bound, authoredClaimSupport });
    }
  } catch (error) { errors.push(error instanceof Error ? error.message : "APPLICATION_BINDINGS_FAILED"); }
  return { protocol: SOURCE_APPLICATION_VERSION, status: errors.length ? "fail" as const : "not_assessed" as const,
    errors, expectedApplications, applications: rows,
    completeBindingCoverage: coverageValidated && rows.length === expectedApplications.length && rows.every(r => r.binding.bindingValid),
    semanticVerification: "not_assessed" as const, patientEligibility: "not_assessed" as const,
    clinicalApproval: false as const, routeChanged: false as const,
    patientHash: sha256(input.patient), packetHash: sha256(JSON.stringify(input.hits)), contractsHash: sha256(JSON.stringify(input.contracts)),
    applicationsHash: sha256(JSON.stringify(input.applications)), citationsHash: sha256(JSON.stringify(input.citations)),
    limitation: "A complete declared conjunction with exact quotes is not semantic verification. State/subject/episode interpretation remains producer-asserted. General/conditional labels do not prove the surrounding free prose avoids current application. Uncatalogued sources and noncanonical claims remain unassessed." };
}

// Deliberately bounded, inspectable regressions. They neither classify every
// medical sentence nor trust applicability="uncertain" to excuse an assertion.
// Unknown/not-established statements and general/conditional source quotations
// are not matched. Exact field offsets preserve the actual offending text.
function candidates(rule: Rule, text: string) {
  const patterns = rule === "aom-observation" ? [
    /\b(?:supports?|supporting|justifies?|justifying) (?:initial )?(?:symptom care|home observation|watchful waiting) without (?:immediate )?(?:clinician|clinical|medical) assessment\b/gi,
    /\b(?:this patient|this child|the patient|the child) (?:is eligible|qualifies) for (?:AOM )?watchful waiting\b/gi,
  ] : [
    /\b(?:preserved (?:daytime )?function(?:ing)?|(?:patient |she |he |you )(?:is |are )?functioning|functioning)\s+(?:means|establishes|confirms|proves)\s+(?:that )?(?:(?:the )?(?:daily[- ]activity |clinician[- ]contact )?threshold (?:is |has )?(?:not (?:currently )?met|not been met)|(?:there is )?no (?:daytime |functional )?impairment)\b/gi,
    /\b(?:daily[- ]activity impact|functional impairment|daytime impairment|(?:the )?(?:daily[- ]activity |clinician[- ]contact )?threshold) (?:is |was )?(?:absent|denied|not (?:currently )?met) (?:because|since|as) (?:the patient |she |he |you )(?:is |are )?(?:still )?functioning\b/gi,
  ];
  return patterns.flatMap((pattern, index) => [...text.matchAll(pattern)].map(match => ({ match, unresolved: rule === "aom-observation" && index === 1 }))).filter(({ match }) => {
    // Negating the covered predicate does not authorize blanket sentence masks.
    const prefix = text.slice(0, match.index).split(/[.!?;\n]|\bbut\b/i).at(-1) ?? "";
    return !/\b(?:if|when|unless|whether)\b/i.test(prefix)
      && !/\b(?:not|never|cannot|can't|does not|doesn't|do not|don't)\s*$|\b(?:do not|don't|cannot|can't) (?:say|claim|infer|assume) (?:that )?$|\bnot true that $/i.test(prefix);
  });
}

export function auditSourceApplications(input: { patient: string; hits: Hit[]; draft: ApplicationDraft; contracts?: SourceApplicationContract[] }) {
  const findings: Finding[] = [], coveredApplications: { ruleId: string; citationIndices: number[]; sourceWitnessBinding: string }[] = [];
  const unresolvedApplications: Finding[] = [];
  let contracts: SourceApplicationContract[] = [];
  try {
    contracts = applicationContractsForHits(input.hits);
    if (input.contracts && !sameRepairValue(input.contracts, contracts)) throw new Error("APPLICATION_CONTRACT_PACKET_MISMATCH");
    const links = accountClaimLinks(input.hits, input.draft.citations.map((c, i) => ({ id: String(i), references: [{ passageId: c.passageId, quote: c.quote }] })));
    if (links.claims.some(c => c.unboundReferences || c.missingReferences)) throw new Error("APPLICATION_CITATION_IDENTITY_INVALID");
    for (const contract of contracts) {
      const citationIndices = input.draft.citations.flatMap((c, i) => input.hits.some(h => h.chunk.id === c.passageId
        && h.document.id === contract.source.documentId) ? [i] : []);
      if (!citationIndices.length) continue;
      const probe = { id: contract.id, claim: contract.canonicalClaim, boundary: contract.boundary,
        spans: contract.witnesses.map(w => ({ documentId: contract.source.documentId, quote: w.quote })) };
      const support = auditAuthoredCitation(probe, contract.canonicalClaim,
        contract.witnesses.map(w => ({ passageId: w.passageId, quote: w.quote })), input.hits);
      coveredApplications.push({ ruleId: contract.id, citationIndices, sourceWitnessBinding: support.support });
      const fields: { field: Field; text: string }[] = [{ field: "reason", text: input.draft.reason }];
      if (input.draft.patientMessage) fields.push({ field: "patientMessage", text: input.draft.patientMessage });
      for (const i of citationIndices) fields.push({ field: `citations.${i}.claim`, text: input.draft.citations[i].claim },
        { field: `citations.${i}.limitation`, text: input.draft.citations[i].limitation ?? "" });
      for (const { field, text } of fields) for (const { match, unresolved } of candidates(contract.rule, text)) (unresolved ? unresolvedApplications : findings).push({
        ruleId: contract.id, code: unresolved ? "OBSERVATION_ELIGIBILITY_NOT_ASSESSED" : contract.rule === "aom-observation" ? "WITHOUT_ANTIBIOTICS_NOT_WITHOUT_ASSESSMENT" : "FUNCTIONING_DOES_NOT_ESTABLISH_ABSENT_IMPACT",
        field, start: match.index, end: match.index + match[0].length, text: match[0], conditionIds: contract.conditions.map(c => c.id),
      });
      if (contract.rule === "insomnia-daytime-impact") for (const [i, flag] of (input.draft.redFlags ?? []).entries()) {
        // Exact observed inference class: a positive functioning statement is
        // not an explicit denial of impairment. Do not generalize this to all
        // positive activity reports, all denials or arbitrary patient facts.
        if (flag.status === "denied" && /^(?:daytime )?(?:functional )?impairment$/i.test(flag.concern.trim())
          && /\bfunctioning\s+but\s+(?:I(?:['’]m| am)\s+)?(?:tired|sleepy|exhausted)\b/i.test(flag.quote)
          && !/\b(?:no|not|never|without|cannot|can't|doesn't|don't|unaffected|zero)\b/i.test(flag.quote)
          && flag.quote.trim() && input.patient.includes(flag.quote)) findings.push({ ruleId: contract.id,
          code: "FUNCTIONING_QUOTE_DOES_NOT_DENY_IMPAIRMENT", field: `redFlags.${i}.quote`, start: 0, end: flag.quote.length,
          text: flag.quote, conditionIds: contract.conditions.map(c => c.id) });
      }
    }
  } catch (error) {
    findings.push({ ruleId: "identity", code: error instanceof Error ? error.message : "APPLICATION_AUDIT_FAILED", field: "contract", start: null, end: null, text: "", conditionIds: [] });
  }
  return { protocol: SOURCE_APPLICATION_VERSION, patientHash: sha256(input.patient), packetHash: sha256(JSON.stringify(input.hits)),
    draftHash: sha256(JSON.stringify(input.draft)), contractsHash: sha256(JSON.stringify(contracts)),
    status: findings.length ? "fail" as const : "not_assessed" as const, findings, unresolvedApplications, coveredApplications,
    semanticCoverage: "partial_authored_regressions_only" as const, claimSupport: "not_assessed" as const,
    patientEligibility: "not_assessed" as const, clinicalCorrectness: "not_assessed" as const,
    routeChanged: false as const, clinicalApproval: false as const, patientAdvicePublished: false as const,
    limitation: "No finding is not a pass. Patient text is identity-bound, not generally semantically parsed. Reported diagnoses/examinations do not acquire independent verification. Only enumerated applications associated with cited, contracted sources are inspected; other paraphrases, uncited sources and arbitrary prose remain unassessed. The red-flag check covers only impairment denial from mixed functioning-but-tired/sleepy/exhausted quotations without an explicit negative cue. No Ottawa exclusion rule is activated without an established source witness." };
}
