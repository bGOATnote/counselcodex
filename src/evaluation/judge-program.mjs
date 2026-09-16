import { createHash } from "node:crypto";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function validateJudgeProgram(program, activeDefinitions) {
  assert(program?.schemaVersion === "counsel-cqa-judge-program/v1", "unexpected CQA judge program schema");
  assert(program.systemBoundary?.currentPatientFacingOutput === false, "current research system cannot be patient facing");
  assert(program.systemBoundary?.futureSolePatientWriter === "history_taking_agent", "future patient communication is reserved to the history-taking agent");
  assert(Array.isArray(program.systemBoundary?.nonSpeakingComponents), "non-speaking components must be enumerated");
  for (const component of ["emergency_supervisor", "context_retrieval", "condition_classifier", "cqa_judges"]) {
    assert(program.systemBoundary.nonSpeakingComponents.includes(component), `${component} must remain non-speaking`);
  }
  assert(program.executionPolicy?.defaultPhase === "after_thread", "unvalidated CQA judges must run after the thread");
  assert(program.executionPolicy?.mayGeneratePatientText === false, "CQA judges cannot generate patient text");
  assert(program.executionPolicy?.mayChangeCurrentDisposition === false, "unvalidated CQA judges cannot change the current disposition");
  assert(program.executionPolicy?.prospectiveBlockingEnabled === false, "prospective blocking requires later validation");

  const activePack = program.packs?.find(({ id }) => id === "clinical_intake_contract");
  assert(activePack?.status === "active_deterministic_software_contract", "the deterministic contract pack must be active");
  assert(activePack.enabled === true, "the deterministic contract pack must be enabled");
  const configuredCriteria = activePack.criteria.map(({ id }) => id).sort();
  const implementedCriteria = activeDefinitions.map(({ id }) => id).sort();
  assert(JSON.stringify(configuredCriteria) === JSON.stringify(implementedCriteria), "active judge registry and implemented criteria differ");
  assert(activePack.criteria.every(({ modality }) => modality === "deterministic"), "active software-contract criteria must be deterministic");

  const clinicalPacks = program.packs.filter(({ id }) => id !== activePack.id);
  const plannedClinicalPacks = clinicalPacks.filter(({ status }) => status === "rubric_and_physician_reference_pending");
  const requiredClinicalPackIds = ["emergency_redflag", "uti_vaginitis", "uri_sinusitis_stewardship"];
  assert(requiredClinicalPackIds.every((id) => plannedClinicalPacks.some((pack) => pack.id === id)), "emergency, UTI/vaginitis, and URI stewardship packs must remain visible");
  const clinicalJudgeActivated = clinicalPacks.some(({ enabled }) => enabled === true);
  assert(clinicalJudgeActivated === false, "unvalidated clinical packs cannot be enabled");
  assert(program.admission?.expertReferenceRequired === true, "clinical judge admission requires expert reference labels");
  assert(program.admission?.heldOutTestRequired === true, "clinical judge admission requires a held-out test split");
  assert(program.admission?.multiSystemVersionRequired === true, "judge validation must span system versions");
  assert(program.admission?.weightedSamplingRecorded === true, "non-uniform sampling weights must be recorded");
  assert(program.admission?.crossFamilyAuditRequired === true, "judge lineage bias must be audited");
  assert(program.admission?.abstentionRequired === true, "clinical judges require an abstention path to physician review");
  assert(program.admission?.currentClinicalJudgeAdmission === "blocked_pending_physician_labels", "clinical admission must stay blocked until physician labels exist");

  return {
    valid: true,
    activePackId: activePack.id,
    activeCriteria: configuredCriteria.length,
    plannedClinicalPacks: plannedClinicalPacks.map(({ id }) => id),
    clinicalJudgeActivated,
    sha256: createHash("sha256").update(`${JSON.stringify(program)}\n`).digest("hex"),
  };
}
