# Independent raw-output audit: patient quotation references

**Decision: keep this adapter experimental; do not promote it to the default runtime.** It prevented one reproduced C35 quote-copy rejection without changing that case's selected ED action. It did not demonstrate unchanged clinical policy: both reference-arm poison-ivy outputs selected priority rather than standard async and justified clinician need using the hypothetical airway concern. Exact quotation identity improved; clinical decision stability and clinical correctness did not thereby pass.

This is an independent read-only engineering audit of all 24 raw outputs, not independent physician adjudication. No further model calls or source changes were made for this report. The six cases are selected development examples, including the known motivating C35 failure, not a held-out cohort.

## Integrity and accounting

The exact frozen manifest validates against the current frozen implementation. Recomputing every result row and `summary.json` produced an exact match. Every planned call has a durable start and result: **24 dispatched, 24 provider-completed, zero provider failures, zero unfinished starts and zero undispatched rows**. Provider completion is not completion of the full disposition workflow. One completed baseline request failed patient-quote admission; it remains a failed admission, not a dropped run.

- Fingerprint: `9fab3f0f21abe0fd321d1d2294dfce6de0fb265fe63d203cb57dea9c0fe0fd08`.
- Token totals: 87,324 input and 3,629 output. Full-rate estimate: **$0.105469**; with the frozen 25% accounting contingency: **$0.13183625**. All usage was known; no unknown-use reservation remains. This is not a provider invoice.
- Baseline inclusive estimate: $0.06422875; references: $0.06760750.
- Maximum authorized allocation was $0.90; all-unknown planned reserve was $0.831015. No retries or recovery calls occurred.

## Measured comparison

| Measure | Baseline | References |
|---|---:|---:|
| Planned/dispatched | 12/12 | 12/12 |
| Complete canonical schema | 12/12 | 12/12 |
| Literal patient-quote identity | 11/12 | 12/12 |
| Admitted urgent actions | 3/4 | 4/4 |
| Exact authored action target, including admission | 9/12 | 10/12 |
| Negative-case physical/emergency actions admitted | 0/8 | 0/8 |
| Median complete safety-call duration | 2.5975 s | 2.7145 s |

Six outputs in each arm selected NONE with an empty basis; their literal-identity result is vacuous, not evidence that six quotations were grounded. For the six nonempty-basis outputs per arm, identity was 5/6 versus 6/6. The single extra target match is the same C35 serialization rescue, not a newly detected emergency. All four C30 outputs deviated from the authored NONE target. Those targets are engineering expectations, not an independently calibrated clinical gold standard.

Reference median minus baseline median was **+117 ms**; the median of the 12 paired latency differences was **+65 ms**. These are different statistics. This experiment provides no latency-improvement claim, browser-paint measurement or final-answer latency measurement. For C35 specifically, baseline calls took 3.444/3.271 s; references took 5.668/2.604 s.

## All-case raw review

| Case and result-file indices | Observations |
|---|---|
| C35 — baseline 1,14; references 2,13 | All four selected ED_NOW. Baseline trial 1 copied `I've felt lightheaded when stand up`, omitting the original `I`, and correctly failed the unchanged exact-quote gate. Both reference outputs selected q1 for two different symptom interpretations; both resolve to the same unchanged sentence containing stool and standing symptoms. Two interpretations of one sentence are not two independent sources. Baseline trial 2 also passed. |
| C02 active EMS — baseline 4,15; references 3,16 | All four selected CONTINUE_EMS, not duplicate activation. Each selected the same complete activation span in activeEms and actionBasis, with currentPatient/currentEpisode/active true. Both arms maintained the patient-reported current response and generated the same canonical continuation directive. |
| Quoted educational/denied symptoms — baseline 5,18; references 6,17 | All four selected NONE, empty basis, null actionBasis/activeEms. Reasons recognized an educational quotation rather than current symptoms. No current emergency was invented. |
| Historical treated symptoms — baseline 8,19; references 7,20 | All four selected NONE and preserved the lack of current symptoms. Reference trial 2 nevertheless called the prior episode a “coronary event”; the message reports prior symptoms/treatment/recovery and asks about a term, without explicitly establishing that diagnosis. This is an internal grounding concern, not a current routing change. |
| Other-person history — baseline 9,22; references 10,21 | All four selected NONE and kept the father's historical symptoms separate from the current person. Reference trial 2 changed “I feel well” into “current patient denies symptoms,” overstating the specificity of the report. No current caregiver emergency was tested in this six-case study; this negative does not establish safety for proxy reports. |
| C30 hypothetical airway question — baseline 12,23; references 11,24 | Baseline selected STANDARD_ASYNC twice; references selected PRIORITY_ASYNC twice. Every output retained the explicit absence of current tongue swelling/breathing difficulty, and none selected an emergency or physical-care action. Both arms nevertheless asserted a current clinician/treatment task; reference reasons explicitly used concern about future airway involvement to justify priority. All four fail the authored NONE target. |

## Grounding and scope concerns that identity checks cannot solve

**C30 is not clinically stable across the two formats.** Reference result 11 says spreading dermatitis requires clinician treatment assessment and airway risk stratification “given patient concern.” Result 24 calls for timely topical/systemic treatment and safety planning for possible mucosal progression, adding “patient anxiety” as an interpretation of a hypothetical question. The question is not evidence of present swelling, systemic illness, a prescription requirement or an established time-sensitive task. These outputs show that a model can preserve the qualifier literally yet still use it to create clinical work.

The baseline is not a clean clinical control. Result 12 invents an approximately 3–4-day interval from “Saturday”; the patient packet does not supply that interval or the rash-onset time. It also asserts maintained airway patency and absent systemic toxicity beyond the specific patient denials. Result 23 describes the oropharyngeal/airway state as “unremarkable” rather than limiting itself to reported symptoms. Reference result 11 uses “normal breathing confirmed” and “current normal tongue,” stronger language than patient-reported normal breathing and absence of swelling. Successful span lookup leaves these interpretation/reason assertions untouched.

**C35 action agreement is not diagnosis verification.** Both arms sometimes describe hemorrhage as established rather than suspected; reference result 13 infers orthostatic hypotension and signs of hypovolemia without supplied measurements. The routing target can be matched while the internal diagnostic explanation remains overconfident. No retrieval or independent clinical review was included to validate those statements.

**C02 attribution still matters.** Baseline result 4 says active response is “confirmed” and to “continue paramedic care,” although the message establishes a patient report that an ambulance is on its way, not paramedic arrival or independently verified care. Reference result 16 also uses confirmed dispatch wording. Reference result 3 marks reported high cholesterol `present:false`; it is an unselected contextual basis item, so the inconsistency does not change urgent admission. These are role-level wording/flag observations, not additional emergency misses.

Baseline C35 result 14 contains a nonempty `patientMessage` despite the prompt's empty-message instruction. The canonical schema permits that field, and the live safety stage renders its typed action template rather than this raw prose. This remains recorded as prompt nonconformance; it is not claimed to have been issued to a patient.

## Internal classification is not emitted care

This study called only the safety role and canonical admission helper. It did **not** run the context/retrieval/producer/judge path or publish GUI events. In the frozen runtime, `assessSafetyAdmission` returns `notice:null` and `not_requested` for NONE, STANDARD_ASYNC and PRIORITY_ASYNC. The safety step publishes an action only when a notice exists. The independent producer receives patient/context/sources, not the preliminary safety route, and the judge exposure excludes unissued preliminary async advice (`src/disposition/clinical-graph.ts`, safety step and review packet construction).

Therefore the C30 difference is a **role-level priority/necessity instability**, not proof that either arm actually routed a thread, emitted an urgent instruction or changed the final disposition. Conversely, zero emitted negative-case emergency notices does not make those internal interpretations clinically correct.

## Bounded next decision

Retain the failed baseline quote and every raw output unchanged. The evidence justifies investigating deterministic references as an exact-serialization mechanism, not default promotion or fuzzy repair of failed quotes. Any further experiment should preregister internal async-priority/clinician-necessity stability as well as emergency-action preservation, examine short spans with adjacent negation/attribution qualifiers and current caregiver reports, and independently assess interpretations/reasons rather than treating exact IDs or authored action matches as truth. Do not add a clinical-policy prompt change to the same arm and then attribute the outcome to serialization. No new study or runtime change is authorized by this report.
