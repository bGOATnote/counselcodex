/** Retrospective audit labels, NOT physician gold or runtime query/ranking input.
 * Exact retained text witnesses what a passage discusses, not whether its
 * clinical claims are correct, current or applicable to an individual patient.
 */
import type { TaskWitness } from "./task-support-audit.ts";

export const TASK_SUPPORT_FIXTURES: { caseId: string; witnesses: TaskWitness[] }[] = [
  { caseId: "C07", witnesses: [
    { id: "child-fever-description", role: "diagnostic_description", need: "Characterize clinical appearance, not just temperature.",
      spans: [{ documentId: "openem:pediatric-fever-evaluation", quote: "Clinical appearance is more important than temperature magnitude." }],
      boundary: "An ED synthesis observation is not a completed remote low-risk assessment. Age, vaccination, source, perfusion and hydration cannot be imputed." },
    { id: "child-fever-discharge-conditions", role: "care_setting_conditions", need: "Retain the conditions on older-child ED discharge advice.",
      spans: [{ documentId: "openem:pediatric-fever-evaluation", quote: "**Discharge older infants/children who are:** well-appearing, identified viral source, tolerating PO, adequate hydration, reliable caregivers." }],
      boundary: "Post-assessment ED discharge is not initial telehealth eligibility. Drinking and playfulness do not establish every condition; missing conditions do not automatically mandate emergency care." },
  ] },
  { caseId: "C12", witnesses: [
    { id: "copd-description", role: "diagnostic_description", need: "Recognize sustained symptom worsening.",
      spans: [{ documentId: "openem:copd-exacerbation", quote: "Acute sustained worsening of dyspnea, cough, and/or sputum (volume or purulence) beyond normal day-to-day variation, requiring a change in therapy." }],
      boundary: "A disease definition does not select ambulance, ED, community or messaging care." },
    { id: "copd-discharge-conditions", role: "care_setting_conditions", need: "Assess functional and physiological prerequisites for post-treatment discharge.",
      spans: [{ documentId: "openem:copd-exacerbation", quote: "**Discharge requirements:** Able to ambulate, eat, sleep, and manage secretions; O2 requirement at or near baseline; reliable follow-up arranged" }],
      boundary: "The ED treatment stage differs from an unexamined patient message. No baseline oxygenation, treatment response or follow-up acceptance may be invented." },
  ] },
  { caseId: "C13", witnesses: [
    { id: "hand-nocturnal-description", role: "diagnostic_description", need: "Recognize a possible nocturnal nerve-compression pattern.",
      spans: [{ documentId: "medlineplus:179", quote: "Happen at night if you sleep with your wrists bent" }],
      boundary: "A typical pattern is not a confirmed diagnosis or proof no clinician task remains." },
    { id: "hand-diagnostic-task", role: "diagnostic_confirmation", need: "Keep the diagnostic assessment task distinct from a descriptive symptom match.",
      spans: [{ documentId: "medlineplus:179", quote: "To find out if you have carpal tunnel syndrome, your health care provider will:" },
        { documentId: "medlineplus:179", quote: "But early diagnosis and treatment can help prevent lasting damage." }],
      boundary: "This identifies an assessment rationale, not this patient's diagnosis, an urgency threshold or the feasibility of completing examination remotely." },
  ] },
  { caseId: "C22", witnesses: [
    { id: "ankle-sprain-description", role: "diagnostic_description", need: "Recognize typical sprain symptoms and early comfort measures.",
      spans: [{ documentId: "medlineplus:417", quote: "Symptoms include pain, swelling, bruising, and being unable to move your joint." }],
      boundary: "Typical sprain symptoms cannot complete a negative fracture assessment." },
    { id: "ankle-fracture-assessment", role: "diagnostic_confirmation", need: "Find an applicable, complete ankle imaging decision rule with weight-bearing and bony-tenderness criteria.",
      spans: null, boundary: "No exact corpus witness was authored in this audit; no source entitled ankle or containing Ottawa Ankle was found. This is not exhaustive proof of source absence. Partial weight-bearing is not a negative rule." },
  ] },
  { caseId: "C32", witnesses: [
    { id: "ear-infection-description", role: "diagnostic_description", need: "Identify the disease population of the self-limited-course statement.",
      spans: [{ documentId: "openem:pediatric-acute-otitis-media", quote: "Most episodes are self-limited: 80% resolve spontaneously within 3 days without antibiotics." }],
      boundary: "This is a retained agent-compiled claim, not an endorsed statistic. AOM outcome evidence is not diagnosis of undifferentiated ear pain." },
    { id: "ear-diagnostic-conditions", role: "diagnostic_confirmation", need: "Keep the middle-ear diagnostic criteria with claims about AOM management.",
      spans: [{ documentId: "openem:pediatric-acute-otitis-media", quote: "AOM requires: (1) acute onset, (2) middle ear effusion, AND (3) middle ear inflammation." }],
      boundary: "Otoscopy findings cannot be inferred from eating and school attendance. An examination prerequisite does not by itself establish that it must happen today." },
  ] },
  { caseId: "C34", witnesses: [
    { id: "allergy-medication-safety", role: "medication_safety", need: "Keep medicine-specific cautions separate from identifying allergic rhinitis.",
      spans: [{ documentId: "openem:seasonal-allergies", quote: "They are contraindicated in uncontrolled hypertension, ischemic heart disease, and hyperthyroidism." }],
      boundary: "Retained ED synthesis context is not a validated complete product label, prescribing authorization or proof this patient has a contraindication." },
    { id: "allergy-follow-through", role: "follow_through", need: "Recognize that the ED discharge plan includes OTC advice and follow-up.",
      spans: [{ documentId: "openem:seasonal-allergies", quote: "All seasonal allergic rhinitis without systemic involvement: discharge with acute antihistamine, prescription or OTC recommendation for intranasal corticosteroid, and primary care or allergy follow-up" }],
      boundary: "Discharge following assessment cannot automatically be transferred to an initial OTC query. It does not define the service's clinician-ownership policy." },
  ] },
  { caseId: "C38", witnesses: [
    { id: "sprain-recovery-description", role: "diagnostic_description", need: "Identify general early sprain treatment context.",
      spans: [{ documentId: "medlineplus:417", quote: "At first, treatment of both sprains and strains usually involves resting the injured area, icing it, wearing a bandage or device that compresses the area, and medicines." }],
      boundary: "Saying medicines are used is not ibuprofen dose, duration, contraindication or interaction support." },
    { id: "ibuprofen-product-safety", role: "medication_safety", need: "Find adult OTC ibuprofen product-label dose and duration limits and conditions requiring professional advice.",
      spans: null, boundary: "No exact product-label witness was authored in this retained corpus. Unrelated ED drug doses or a Drug Safety topic are not substitutes; this is not a personalized prescribing rule." },
  ] },
  { caseId: "C47", witnesses: [
    { id: "insomnia-habit-context", role: "diagnostic_description", need: "Identify the limited claim that sleep-habit changes may help short-term insomnia.",
      spans: [{ documentId: "medlineplus:6055", quote: "Lifestyle changes, including good sleep habits , often help relieve acute (short-term) insomnia." }],
      boundary: "Helpful habits do not resolve whether an assessment task remains. This retained summary's month-long chronicity wording is a separate currency concern, not an endorsed threshold." },
    { id: "insomnia-underlying-task", role: "follow_through", need: "Preserve the need to address an underlying problem when one causes insomnia.",
      spans: [{ documentId: "medlineplus:6055", quote: "If your insomnia is the symptom or side effect of another problem, it's important to treat that problem (if possible)." }],
      boundary: "The conditional does not establish an underlying diagnosis or queue priority; it prevents treating self-management context as evidence that no clinician task can remain." },
  ] },
];
