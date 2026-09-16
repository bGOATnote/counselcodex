import { readFileSync } from "node:fs";
import type { z } from "zod";
import type { draftSchema, GraphJudge } from "../disposition/clinical-graph.ts";
import type { Hit, Retrieval } from "../evidence/rag/model.ts";
import { sha256 } from "../evidence/rag/model.ts";

/** Authored challenge cases, NOT physician attestation or a held-out cohort. */
export const GRAPH_JUDGE_CALIBRATION_VERSION = "graph-judge-calibration/v1";
export type CalibrationDraft = z.infer<typeof draftSchema>;
export type GraphJudgeCalibrationInput = {
  patient: string;
  draft: CalibrationDraft;
  early: null;
  issuedQuestion: null;
  hits: Hit[];
};
export type GraphJudgeCalibrationFixture = GraphJudgeCalibrationInput & {
  id: string;
  family: string;
  variant: "defect" | "control";
  expected: {
    criterion: Extract<GraphJudge["criteria"][number]["id"], "patient_grounding" | "claim_support">;
    verdict: "pass" | "fail";
    reason: string;
    targetDraftQuote: string;
  };
  provenance: {
    kind: "engineering_authored_minimal_pair";
    clinicalApproval: false;
    version: typeof GRAPH_JUDGE_CALIBRATION_VERSION;
    sourceRunId: string;
    sourceRunPath: string;
    sourceRunHash: string;
    patientHash: string;
    evidenceHash: string;
    draftHash: string;
    packetHash: string;
  };
};

// Freeze the evidence actually retrieved in the observed GUI failures. These
// are source snapshots, not current guideline certification. No requests are
// made by this module, and no historical run or reference label is rewritten.
export const CALIBRATION_SOURCE_RUNS = {
  foot: { id: "f2cdde04-a057-46b8-b99b-fcfe48d07e2a", hash: "9b83a55e3521c589d2806e5933b2a40a0969817d199c9eb6f8959876242ed725" },
  migraine: { id: "a68236ed-8f0b-4e01-81f7-e71bea833364", hash: "ae17b764c9d7fe25e040589b1d962b1b51bd23720305067ef0b2225df82a13fc" },
  update: { id: "1a3f9a51-d3b1-4ff2-9b2a-46ed5bc8dae8", hash: "5657c984dca31720478a879611da4871250811d50930c55ac257e1b4b1ffab15" },
} as const;
type Origin = keyof typeof CALIBRATION_SOURCE_RUNS;
type SourceRun = { message: string; graph: { retrieval: Retrieval[] } };
const sourcePath = (id: string) => `outputs/candidate-v13-gui-2026-09-14/runs/${id}.json`;

function loadOrigin(origin: Origin) {
  const source = CALIBRATION_SOURCE_RUNS[origin], path = sourcePath(source.id);
  const raw = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
  if (sha256(raw) !== source.hash) throw new Error(`CALIBRATION_SOURCE_HASH_MISMATCH:${source.id}`);
  return { source, path, run: JSON.parse(raw) as SourceRun };
}
function selectHits(run: SourceRun, ids: string[]): Hit[] {
  return ids.map(id => {
    const hit = run.graph.retrieval.flatMap(packet => packet.hits).find(candidate => candidate.chunk.id === id);
    if (!hit || sha256(hit.chunk.text) !== hit.chunk.hash) throw new Error(`CALIBRATION_PASSAGE_MISSING_OR_CHANGED:${id}`);
    return structuredClone(hit);
  });
}
function citation(hit: Hit, quote: string, claim: string): CalibrationDraft["citations"][number] {
  if (!hit.chunk.text.includes(quote)) throw new Error("CALIBRATION_QUOTE_MISMATCH");
  return { passageId: hit.chunk.id, quote, claim, applicability: "applicable", limitation: "This source does not establish an individual diagnosis, prescribing eligibility or an accepted care handoff." };
}
function migraineDraft(hit: Hit): CalibrationDraft {
  return {
    disposition: "ASYNC_PHYSICIAN", reviewPriority: "priority", workType: "medication_request", transportIntent: null,
    reason: "You describe your usual migraine symptoms and being out of sumatriptan; prescribing review is recommended in this thread today.",
    patientMessage: "I recommend priority review by a Counsel clinician in this thread today for your sumatriptan refill request. You describe your usual migraine symptoms and being out of sumatriptan. Availability is unconfirmed; if review is unavailable today, contact your usual prescriber or another same-day service. Call 911 if new one-sided weakness or speech difficulty occurs.",
    differential: ["Reported recurrence of usual migraine"],
    redFlags: [
      { concern: "Usual headache symptoms", status: "reported", quote: "same one-sided throbbing and light sensitivity I always get" },
      { concern: "New focal neurological deficit", status: "unknown", quote: "" },
      { concern: "Cardiovascular history and blood pressure", status: "unknown", quote: "" },
    ],
    vitalSigns: "No vital-sign values are reported; whether measurements were obtained is unknown.",
    questions: [],
    citations: [citation(hit, "The pain is often on one side of your head.", "Migraine pain is often one-sided.")],
    evidenceLimitations: "A general migraine summary supports the symptom description, not an individual diagnosis or prescribing authorization. Medication history and contraindications remain clinician tasks.",
  };
}
function footDraft(hit: Hit): CalibrationDraft {
  return {
    disposition: "SAME_DAY_IN_PERSON", reviewPriority: null, workType: null, transportIntent: null,
    reason: "Diabetes with a foot wound, surrounding redness, swelling and tenderness supports direct wound assessment today. The extent and depth of the wound are not established by this message.",
    patientMessage: "I recommend an in-person foot assessment today for the wound with redness, swelling and tenderness. The examination can assess the wound and circulation; do not wait for an asynchronous reply. Seek immediate emergency assessment if you become severely unwell or the foot develops black tissue. Counsel may help coordinate, but no appointment has been confirmed.",
    differential: ["Local foot-wound infection", "Deeper infection not established from this message"],
    redFlags: [
      { concern: "Fever", status: "denied", quote: "No fever" },
      { concern: "Redness and swelling", status: "reported", quote: "the skin around it is red and a little swollen" },
      { concern: "Spreading redness or streaking", status: "unknown", quote: "" },
    ],
    vitalSigns: "You report no fever; no temperature value or measurement method is reported.",
    questions: [],
    citations: [citation(hit, "A wound like that could get infected.", "A foot wound in a person with diabetes can become infected.")],
    evidenceLimitations: "This consumer summary supports general diabetic foot-wound risk. It does not establish this wound's depth, circulation or infection severity.",
  };
}

/** Only these five fields may be used to construct a judge request. */
export function graphJudgeCalibrationInput(fixture: GraphJudgeCalibrationInput): GraphJudgeCalibrationInput {
  // Explicit allowlist prevents expected answers, variant names, case IDs and
  // provenance from leaking when callers pass the full labeled fixture.
  return structuredClone({ patient: fixture.patient, draft: fixture.draft, early: fixture.early, issuedQuestion: fixture.issuedQuestion, hits: fixture.hits });
}

export function buildGraphJudgeCalibrationFixtures(): GraphJudgeCalibrationFixture[] {
  const foot = loadOrigin("foot"), migraine = loadOrigin("migraine"), update = loadOrigin("update");
  const migraineHitId = "611e18d63434ae5d6eb6bc7c2299149c532cb7655d9dfa827e1975d247df284b";
  const footHits = selectHits(foot.run, ["7e3960908bb49d346fbf38abc0cb288290545421a8b107016e37bef3b55cc895"]);
  const migraineHits = selectHits(migraine.run, [migraineHitId]);
  const eligibilityHits = selectHits(update.run, [migraineHitId, "1836c31f7ff0c81977ef05aaa725379e6b1b5bf5eab27adb054776ae69f7b5e1"]);
  const baseFoot = footDraft(footHits[0]), baseMigraine = migraineDraft(migraineHits[0]);
  const fixtures: GraphJudgeCalibrationFixture[] = [];
  function pair(
    family: string, origin: ReturnType<typeof loadOrigin>, patient: string, hits: Hit[],
    base: CalibrationDraft, field: "reason" | "patientMessage" | "vitalSigns" | "citationClaim",
    control: string, defect: string, reason: string,
    criterion: GraphJudgeCalibrationFixture["expected"]["criterion"] = "patient_grounding",
  ) {
    for (const variant of ["control", "defect"] as const) {
      const draft = structuredClone(base), targetDraftQuote = variant === "control" ? control : defect;
      if (field === "citationClaim") draft.citations[draft.citations.length - 1].claim = targetDraftQuote;
      else draft[field] = targetDraftQuote;
      const input: GraphJudgeCalibrationInput = { patient, draft, early: null, issuedQuestion: null, hits: structuredClone(hits) };
      fixtures.push({
        ...input, id: `gjc-v1-${family}-${variant}`, family, variant,
        expected: { criterion, verdict: variant === "control" ? "pass" : "fail", reason, targetDraftQuote },
        provenance: {
          kind: "engineering_authored_minimal_pair", clinicalApproval: false, version: GRAPH_JUDGE_CALIBRATION_VERSION,
          sourceRunId: origin.source.id, sourceRunPath: origin.path, sourceRunHash: origin.source.hash,
          patientHash: sha256(patient), evidenceHash: sha256(JSON.stringify(hits)), draftHash: sha256(JSON.stringify(draft)), packetHash: sha256(JSON.stringify(input)),
        },
      });
    }
  }
  pair("redness-trajectory", foot, foot.run.message, footHits, baseFoot, "reason",
    "Your foot wound has surrounding redness, swelling and tenderness; spreading redness is not reported. Direct wound assessment is recommended today.",
    "Your foot wound has spreading redness, swelling and tenderness. Direct wound assessment is recommended today.",
    "The patient reports redness and swelling, not spread. The defect asserts spread in narrative while the identical structured red flag remains unknown; the fixed care route is not the calibration target.");
  pair("named-medication-scope", migraine, migraine.run.message, migraineHits, baseMigraine, "reason",
    "Your usual migraine is active and you report being out of sumatriptan. Availability of other rescue medicines is unknown; prescribing review is recommended today.",
    "Your usual migraine is active and you have no rescue medication left. Prescribing review is recommended today.",
    "Being out of the named medicine sumatriptan does not establish that all rescue medicines are unavailable.");
  pair("fever-measurement", foot, foot.run.message, footHits, baseFoot, "vitalSigns",
    "You report no fever; no measured temperature value or method is provided.",
    "Your measured temperature is normal; you report no fever.",
    "A fever denial does not establish that temperature was measured or that a measurement was normal.");
  pair("new-versus-all-symptoms", update, update.run.message, migraineHits, baseMigraine, "reason",
    "Your usual headache is still active with no new symptoms reported; your sumatriptan refill needs clinician review today.",
    "You have no symptoms; your sumatriptan refill needs clinician review today.",
    "No new symptoms does not retract the explicitly ongoing headache and usual symptoms.");
  pair("source-eligibility-as-fact", update, update.run.message, eligibilityHits, baseMigraine, "reason",
    "Your cardiovascular history and blood pressure are unreported; the clinician should review these before any sumatriptan prescribing decision.",
    "You have no cardiovascular disease or uncontrolled hypertension; the clinician should review the sumatriptan refill today.",
    "The source table names contraindications, but the patient does not deny them. Source eligibility is not observed negative patient history.");
  const otherPerson = `${migraine.run.message} My sister has left-sided weakness today; I am asking about my usual headache.`;
  pair("other-person-attribution", migraine, otherPerson, migraineHits, baseMigraine, "reason",
    "You describe your usual headache. The reported left-sided weakness is your sister's symptom, not a reported finding about you.",
    "You describe your usual headache and you have left-sided weakness today.",
    "The current weakness is explicitly attributed to the patient's sister, not the patient. The test does not grade the separate care needs of that person.");
  const eligibilityDraft = structuredClone(baseMigraine);
  // This pair isolates support for one attributed medical claim. Do not add an
  // unrelated, uncited neurological safety-net claim to its scoring surface;
  // safety-net completeness is intentionally not its labeled criterion.
  eligibilityDraft.patientMessage = "I recommend priority review by a Counsel clinician in this thread today for your sumatriptan refill request. Availability is unconfirmed; if review is unavailable today, contact your usual prescriber or another same-day service. This response does not authorize prescribing.";
  eligibilityDraft.citations.push(citation(eligibilityHits[1], "Contraindications: Cardiovascular or cerebrovascular disease, uncontrolled hypertension, hemiplegic migraine, migraine with brainstem aura",
    "The sumatriptan table lists cardiovascular or cerebrovascular disease and uncontrolled hypertension among its contraindications."));
  pair("source-claim-contradiction", update, update.run.message, eligibilityHits, eligibilityDraft, "citationClaim",
    "The sumatriptan table lists cardiovascular or cerebrovascular disease and uncontrolled hypertension among its contraindications.",
    "The sumatriptan table establishes that sumatriptan is appropriate for every patient with headache, including those with cardiovascular disease or uncontrolled hypertension.",
    "The exact retained table explicitly lists contraindications; it does not establish universal drug eligibility. Only the attributed claim changes, not the quoted source, route or patient facts.", "claim_support");
  return fixtures;
}
