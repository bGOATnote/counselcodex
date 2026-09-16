/** Frozen, engineering-authored single-claim binding challenges.
 *
 * These new synthetic examples exercise failure classes in the pinned project
 * modules. They are not physician cases, route labels, or a clinical holdout.
 * `supported` means the narrow claim follows from the supplied text; it does
 * not endorse a diagnosis, a treatment, a disposition, or a whole response.
 * The validation split varies the wording/scenario within the same 12 authored
 * families. Its labels must stay outside every model request.
 *
 * Provenance identifies the existing engineering source for the failure class
 * or retained source excerpt, not the origin of a real patient's history.
 * No file reads, runtime imports, gold imports, or model calls occur here.
 */
export const LOCAL_BINDING_FIXTURE_VERSION = "local-binding-fixtures/v1";
/** SHA-256 of JSON.stringify(buildLocalBindingFixtures()), including labels.
 * A scored v1 corpus must not silently change after results are inspected. */
export const LOCAL_BINDING_FIXTURE_SHA256 = "c3bc16292275afd0d35677b496b2665bf3a0c6384b7366369ae3947f8f8edcb1";

export type LocalBindingInput = {
  patient: string;
  claim: string;
  sourceText: string | null;
};

export type LocalBindingFixture = {
  id: string;
  family: string;
  split: "development" | "validation";
  variant: "control" | "defect";
  input: LocalBindingInput;
  expected: "supported" | "unsupported";
  rationale: string;
  provenance: {
    kind: "engineering_authored";
    clinicalApproval: false;
    sourcePath: string;
    sourceSha256: string;
  };
};

// Hashes bind the unchanged source modules read during authorship. These are
// evidence of provenance only; they are not clinical approval or live currency.
const origins = {
  graph: {
    sourcePath: "src/disposition/fact-graph.ts",
    sourceSha256: "0e35b184627707c6807deb226311047ab8e4712e198943720c8a310c1245f5ac",
  },
  calibration: {
    sourcePath: "src/evaluation/graph-judge-calibration.ts",
    sourceSha256: "ed5b80a3e0a9c086fcd8be0adf2bf126cb823f06d12042478079dd70219fb4f2",
  },
  application: {
    sourcePath: "src/evidence/rag/source-application.ts",
    sourceSha256: "6f65cb0ec03f5e62251c98f4e96a64b2db31664aded09c316ec46bd612be5570",
  },
  onset: {
    sourcePath: "tests/onset-denial-admission.test.ts",
    sourceSha256: "17766407df52331692826f13416533a3616ea5cae994c9892e2530c9d82d4f67",
  },
  insomnia: {
    sourcePath: "src/evidence/rag/nhlbi-insomnia-candidate.ts",
    sourceSha256: "098672be26badf84cfeca38d73dcb516544cfea1e5c5ff542e5ad0b616a609f2",
  },
} as const;

// Retained excerpts, copied exactly from their provenance module. The text is
// supplied as data for an entailment exercise, not as current medical advice.
const aomDiagnosis = "Do not diagnose AOM in children without middle ear effusion (based on pneumatic otoscopy and/or tympanometry).";
const aomObservation = "Mild cases with unilateral symptoms in children 6-23 months of age or unilateral or bilateral symptoms in children >2 years may be appropriate for watchful waiting based on shared decision-making.";
const aomResolution = "Most episodes are self-limited: 80% resolve spontaneously within 3 days without antibiotics.";
const insomniaImpact = "If not getting enough sleep is affecting your daily activities, talk to your doctor.";
const insomniaDuration = "Insomnia is considered chronic (long-term) when it occurs 3 or more nights a week and lasts for 3 months or longer.";
const insomniaSleepiness = "Insomnia can cause daytime sleepiness and a lack of energy.";
const sumatriptanContraindications = "Contraindications: Cardiovascular or cerebrovascular disease, uncontrolled hypertension, hemiplegic migraine, migraine with brainstem aura";

/** Explicit allowlist: callers may pass a full fixture, but only three input
 * strings reach the critic. IDs, labels, rationales and provenance stay offline.
 */
export function localBindingInput(fixture: LocalBindingFixture): LocalBindingInput {
  return {
    patient: fixture.input.patient,
    claim: fixture.input.claim,
    sourceText: fixture.input.sourceText,
  };
}

export function buildLocalBindingFixtures(): LocalBindingFixture[] {
  const rows: LocalBindingFixture[] = [];
  function pair(
    family: string,
    split: LocalBindingFixture["split"],
    origin: keyof typeof origins,
    patient: string,
    sourceText: string | null,
    control: string,
    defect: string,
    rationale: string,
  ) {
    for (const variant of ["control", "defect"] as const) rows.push({
      id: `lbf-v1-${family}-${split}-${variant}`,
      family, split, variant,
      input: { patient, claim: variant === "control" ? control : defect, sourceText },
      expected: variant === "control" ? "supported" : "unsupported",
      rationale,
      provenance: { kind: "engineering_authored", clinicalApproval: false, ...origins[origin] },
    });
  }

  pair("unknown-to-denied", "development", "graph",
    "The rash is on my right forearm and it itches. It began yesterday.", null,
    "The patient reports an itchy forearm rash; fever status is unreported.",
    "The patient reports an itchy forearm rash and denies fever.",
    "An omitted symptom is unknown, not an explicit denial. The message contains no fever statement.");
  pair("unknown-to-denied", "validation", "graph",
    "My ankle is sore after a long walk. I can describe the pain, but I have not mentioned swelling.", null,
    "Whether the ankle is swollen is not established by this message.",
    "The patient says the ankle is not swollen.",
    "Not mentioning swelling does not assert that swelling is absent.");

  pair("wrong-person", "development", "graph",
    "My brother has a fever today. I am writing about my own itchy eyes, which started this morning.", null,
    "The current fever is reported in the patient's brother.",
    "The patient reports having a fever today.",
    "The fever belongs to the brother; the patient's reported symptom is itchy eyes.");
  pair("wrong-person", "validation", "graph",
    "I have a sore wrist. My daughter was the one who felt dizzy at school this afternoon.", null,
    "The daughter, rather than the person with the sore wrist, felt dizzy this afternoon.",
    "The person asking about the sore wrist felt dizzy this afternoon.",
    "The message explicitly assigns dizziness to a different person.");

  pair("historical-to-current", "development", "graph",
    "In 2020 I had a fever during the flu. That illness resolved. Today I am asking about dry skin; I have no fever now.", null,
    "The reported fever occurred during a resolved illness in 2020.",
    "The patient has a fever during the current dry-skin episode.",
    "A resolved historical fever cannot be transferred to the current episode, which explicitly denies fever.");
  pair("historical-to-current", "validation", "graph",
    "Last winter my knee was swollen after a fall and then recovered. My knee is not swollen today; I want advice about a squeaking brace.", null,
    "The knee swelling described here was last winter and has resolved.",
    "The knee is swollen now while the patient is asking about the brace.",
    "Historical swelling is not a current finding; the current swelling denial is explicit.");

  pair("new-versus-all-symptoms", "development", "calibration",
    "The headache and light sensitivity are still there. Nothing new has appeared since this morning.", null,
    "The headache and light sensitivity continue, with no additional symptoms reported.",
    "The patient is now symptom-free.",
    "No new symptoms does not negate the symptoms explicitly described as continuing.");
  pair("new-versus-all-symptoms", "validation", "calibration",
    "I still have the same cough and stuffy nose. Since yesterday I have had no additional symptoms.", null,
    "The cough and stuffy nose remain present without newly added symptoms.",
    "The cough and stuffy nose have resolved.",
    "The absence of additional symptoms does not establish resolution of the existing ones.");

  pair("reported-versus-measured", "development", "calibration",
    "I do not feel feverish. My throat has been scratchy since lunch.", null,
    "The patient does not feel feverish; no temperature reading is supplied.",
    "The patient's measured temperature is normal.",
    "A symptom report supplies neither a measured temperature nor a measurement method.");
  pair("reported-versus-measured", "validation", "calibration",
    "My breathing feels comfortable while I sit. I have not supplied any device readings.", null,
    "The patient reports comfortable breathing while seated.",
    "A pulse oximeter confirms that the patient's oxygen saturation is normal.",
    "Comfortable breathing is a subjective report, not an oxygen saturation measurement.");

  pair("named-versus-all-medication", "development", "calibration",
    "My usual headache is back. The sumatriptan box is empty. I have not listed my other medicines.", null,
    "The patient has run out of sumatriptan.",
    "The patient has run out of every headache medicine.",
    "An empty supply of a named medicine does not establish the availability of all medicines.");
  pair("named-versus-all-medication", "validation", "calibration",
    "I used the last tablet in my cetirizine packet yesterday. There may be other allergy medicines in the cupboard, but I have not checked.", null,
    "The patient used the last tablet from the cetirizine packet.",
    "There are no allergy medicines available to the patient.",
    "The report is limited to cetirizine; availability of other allergy medicines remains unresolved.");

  pair("source-prerequisite-qualifier", "development", "application",
    "My child is 18 months old and has mild symptoms in both ears. I am asking what the excerpt says, without claiming a diagnosis.", aomObservation,
    "For children aged 6-23 months, this excerpt specifies unilateral symptoms when discussing possible watchful waiting.",
    "For children aged 6-23 months, this excerpt specifies either unilateral or bilateral symptoms when discussing possible watchful waiting.",
    "The unilateral-or-bilateral option is attached to the older age group; it cannot be transferred to 6-23 months.");
  pair("source-prerequisite-qualifier", "validation", "application",
    "My child has ear pain. No one has examined the ears, and no test result is available.", aomDiagnosis,
    "The excerpt requires middle ear effusion to support an AOM diagnosis in a child.",
    "The excerpt permits an AOM diagnosis in a child even when middle ear effusion is absent.",
    "Removing the explicit middle-ear-effusion requirement reverses the source's diagnostic constraint.");

  pair("conditional-to-current-eligibility", "development", "application",
    "My 4-year-old says one ear hurts a little. No clinician has assessed it, and we have not discussed watchful waiting with anyone.", aomObservation,
    "The excerpt describes possible watchful waiting based on shared decision-making, which is not established in this report.",
    "The patient has already satisfied the excerpt's shared-decision condition for watchful waiting.",
    "A conditional option in a source does not supply the patient's unestablished shared-decision state.");
  pair("conditional-to-current-eligibility", "validation", "application",
    "I have had trouble sleeping for a few nights. I have not described whether it affects my daytime activities.", insomniaImpact,
    "This excerpt's condition concerns sleep loss affecting daily activities; the patient's daily-activity impact is unreported.",
    "The patient currently meets this excerpt's condition because sleep loss is affecting their daily activities.",
    "The source's IF condition is not a patient observation. Sleep difficulty alone does not establish the unreported impact.");

  pair("diagnostic-evidence-versus-assessment", "development", "insomnia",
    "I have slept poorly four nights a week for two weeks, and I am struggling with tasks at work.", insomniaDuration,
    "The reported two-week duration is shorter than this excerpt's three-month chronic-insomnia threshold.",
    "This excerpt says the patient must wait until three months have passed before discussing the sleep problem with a clinician.",
    "A diagnostic duration definition does not state that evaluation or discussion must be delayed until that duration.");
  pair("diagnostic-evidence-versus-assessment", "validation", "application",
    "My child has ear pain today. No examination has taken place and no diagnosis has been established.", aomResolution,
    "This excerpt describes spontaneous resolution without antibiotics; it makes no statement that an initial assessment should be skipped.",
    "This excerpt establishes that the child can skip an initial assessment because most episodes resolve without antibiotics.",
    "Without antibiotics is not without assessment, and a population resolution statistic does not establish this child's diagnosis or evaluation needs.");

  pair("function-paraphrase", "development", "application",
    "I am still getting to work, but I am exhausted and need extra breaks to finish my usual tasks.", null,
    "The patient continues to attend work while reporting exhaustion and extra breaks.",
    "The patient reports normal daytime functioning with no impact on usual tasks.",
    "Continuing an activity does not erase the explicitly reported exhaustion and extra breaks.");
  pair("function-paraphrase", "validation", "application",
    "I keep up with the household chores, although they now take much longer because I have to rest between them.", null,
    "The patient still completes chores but describes taking longer and resting between them.",
    "The patient reports that household chores take their usual time without any need to rest.",
    "Preserved completion is not unchanged function; the time and rest burden are explicitly reported.");

  pair("onset-scope", "development", "onset",
    "Today's headache feels like my usual headaches. I have not said how quickly it reached full strength.", null,
    "The headache feels familiar, while its speed of onset is unreported.",
    "The patient states that today's headache built up gradually.",
    "A familiar symptom pattern does not describe onset speed.");
  pair("onset-scope", "validation", "onset",
    "The headache gradually eased after I rested. I have not described how the pain started.", null,
    "Gradual change here describes the headache easing after rest, not how it began.",
    "The headache began gradually.",
    "Gradual improvement is a different event from gradual onset.");

  pair("contradictory-source", "development", "calibration",
    "I am asking what this sumatriptan table says. I have not provided my medical history.", sumatriptanContraindications,
    "The table lists uncontrolled hypertension among the contraindications.",
    "The table states that uncontrolled hypertension is not a contraindication.",
    "The defect contradicts the supplied list. Neither claim establishes the patient's own eligibility.");
  pair("contradictory-source", "validation", "application",
    "I want to understand this sentence about insomnia. I have not described my daytime symptoms.", insomniaSleepiness,
    "The excerpt says insomnia can cause daytime sleepiness and low energy.",
    "The excerpt says insomnia cannot cause daytime sleepiness or low energy.",
    "The defect reverses can cause into cannot cause; a possible effect is not proof this patient experiences it.");

  return rows;
}
