# Independent model audit of the fresh v22 cohort

This is an engineering/model audit, **not physician adjudication** and not a new gold standard. The physician's incumbent 49 agreements and qualified DVT judgment remain unchanged. Current study: `outputs/clinical-lift-v22-cohort-live-2026-09-14`, frozen fingerprint `a5b835671f06263c68c0c67e7658320cb21984f41e2d1f600cc210c26488499a`.

## Method

For each selected case, inspect the original patient message and first provider-produced disposition before reading the current run's online judge, repair or released answer. Record findings here first. The reviewer already knows the historical project and common cases, so this is sequence-separated review, not full clinical blinding. Do not present targeted inspection as a random sample or an accuracy estimate.

Sources initially supplied to the producer are reconstructed from retained initial context-query retrievals and the frozen nine-hit selection function. All later retrievals remain available separately; they cannot retroactively ground an earlier draft. When making medical factual assessments, check primary guidance externally and distinguish new audit sources from sources supplied to the model. Literal input contradictions and impossible actors can be assessed directly. Do not infer harm from a phrase match or a route disagreement alone.

Classify changes as: material defect corrected; material defect retained/introduced; scope/evidence concern needing clinician adjudication; or presentation-only. A matching disposition does not clear contradictory prose. An online judge's acceptance is not the audit outcome.

## C01 — first-draft findings, before current judge inspection

Run `8900c01f-d4d0-4e29-9f30-db0fdd5dc69d`; first-draft hash `dbdf8fc1fed204e748496eff90be494487a277138c533d2be9b033543bd779fd`.

- The patient's two-day rhinorrhea, mild sore throat, denied fever and maintained intake are represented without inventing age or comorbidity. Self-care is a plausible provisional route on those reported facts; it is not proof that an unreported higher-risk context is absent.
- **Material safety-net concern:** “symptoms clearly worsening past about 10 days” joins worsening to a duration threshold. Worsening and persistence without improvement are separate escalation reasons. CDC lists symptoms persisting beyond ten days without improvement and symptoms that improve then return or worsen separately. The repair should separate those conditions, not change the current route merely because the sentence is flawed. [CDC common-cold guidance](https://www.cdc.gov/common-cold/treatment/index.html).
- **Evidence applicability concern:** the selected quotation is about RSV, but the attributed claim generalizes to common respiratory viral infections. The draft acknowledges that the virus and risk group are unidentified, which is useful, but this does not make an RSV-specific passage a general common-cold guideline. A directly relevant respiratory-virus/common-cold source would support this presentation more cleanly. This is narrower than declaring the overall self-care route incorrect.
- **Scope concern:** marking the combined concept “Reduced oral intake/dehydration” denied is broader than the patient's statement of eating and drinking fine. Preserved intake is reported; dehydration is not independently excluded. Whether that label materially changes the answer requires adjudication, rather than automatically promoting it to a routing error.
- The sentence “whether temperature or other vitals were measured is unknown” explicitly preserves measurement uncertainty. Its accompanying “symptom report only” wording should not automatically be treated as claiming that temperature was unmeasured.
- CDC also recommends prompt clinician contact for people at higher risk of severe respiratory illness even when symptoms are mild. That context is unreported here; this audit does not impute it. A concise risk-contingent caveat or useful nonblocking context question could address it. [CDC common-cold guidance](https://www.cdc.gov/common-cold/treatment/index.html).

The nine reconstructed initial hits include pediatric-fever and emergency-reference material, RSV, allergic rhinitis, retropharyngeal abscess and acute HIV content. That is not evidence of a population-appropriate common-cold retrieval result. The source pool and query design deserve separate evaluation; a good final route alone would not demonstrate retrieval lift.

Current online judge, repair and released outcome have not yet been inspected for this entry.

### C01 — subsequent judge/repair comparison

After recording the findings above, the current initial judge was inspected. It requested revision for the combined intake/dehydration denial, the ten-day worsening conjunction, and the delayed channel for airway-compromise contingencies. It explicitly accepted the draft's preservation of vital-measurement uncertainty. The field-local patch split intake from dehydration and separated worsening at any point from persistence without improvement; a fresh judge accepted the revised draft. The disposition remained `SELF_CARE`. The completed response took77.172seconds, with no early action.

This is evidence of correction to specific answer defects, **not routing lift**. The airway contingency was changed to immediate emergency action, using the supplied retropharyngeal-abscess passage rather than changing the patient's current route. The RSV-to-general-virus attribution remained; acceptance of that qualified inference does not independently resolve the source-applicability concern. A calibration concern also remains: the patch strengthened “no clinician visit or medicine appears needed” to “don't need a clinician visit or medicine,” while higher-risk context remains unreported. That requires clinical adjudication rather than an automatic route-error label.

## C02 — first-draft findings, before current judge inspection

Run `3549904a-47b8-48b5-9e35-8df1e0bc9224`; first-draft hash `1e48273f6457fd73b18656d9305b183152a1c5d1fa40aa1d7c8264fe63194767`.

- Immediate EMS activation is well supported by the reported persistent crushing chest pressure, arm radiation, sweating and nausea. AHA guidance advises calling 911 for this symptom pattern; this audit does not interpret age or absent vitals as reassurance. [AHA heart-attack warning signs](https://www.heart.org/en/health-topics/heart-attack/warning-signs-of-a-heart-attack).
- **Material feasible-action defect:** the draft tells the patient, “If you become faint, short of breath, or collapse, tell the 911 dispatcher immediately.” The clause assigns the same action to a patient after collapse, including a state in which the patient cannot act. Remove that contingency from the patient's instruction or explicitly assign it to a present capable bystander without inventing one. The current emergency recommendation should remain unchanged. This is a practical instruction defect, not a reason to lower the route.
- The draft distinguishes suspected ACS from confirmed diagnosis and leaves unreported vital measurements unknown. No patient-specific absent cardiovascular history is invented.
- The general chest-pain source supports immediate care for the actual symptom combination. The additional synthesis-derived “over20minutes” claim is not needed to justify the route. Its exact presence in an agent-compiled reference is not independent guideline validation; brevity could remove this unnecessary threshold without losing the sufficient justification.

Current online judge, repair and released outcome have not yet been inspected for this entry.

### C02 — subsequent judge/repair comparison

After recording the findings above, the current initial judge was inspected. It identified the incapable-actor instruction as a safety-net defect and requested a patient-message-only patch. The patch tells the patient to update the dispatcher **if able**, and assigns collapse/unresponsiveness reporting to someone **if present**. A fresh judge accepted the repaired draft. `EMERGENCY_NOW` and `activate_ems` remained unchanged. Early action arrived at6.444seconds and the completed answer at65.123seconds.

This is a concrete feasible-action correction that agrees with the pre-judge audit, not proof of a better initial disposition. The first draft already supplied the supported route. The conditional bystander wording does not assert that a bystander is present. Whether a shorter first-pass instruction could eliminate this serial repair cost is a separate experiment.

## C03 — first-draft findings, before current judge inspection

Run `ad34d0ed-646f-41e1-81fa-35f5e0b310ad`; first-draft hash `056893a65200e7c2fe90a4833c24eedf32c07655322592a79890b6539722ca81`.

- A clinician assessment task remains for two days of dysuria/frequency. The draft preserves denied fever, back pain and pregnancy, makes the diagnosis presumptive, and does not fabricate prior treatment susceptibility or measured vital signs.
- The difference between routine and priority async is a queue-policy judgment here, not established by a general UTI symptom list. Acute symptom treatment may warrant higher internal priority; the draft instead says no time-sensitive need is established. NICE allows immediate or back-up antibiotics for nonpregnant women according to severity, complication risk, prior culture/treatment and preferences. It does not make every such presentation emergent or require immediate prescribing. The appropriate internal priority needs explicit service-policy adjudication. [NICE NG109](https://www.nice.org.uk/guidance/ng109/chapter/recommendations).
- **Evidence-applicability concern:** the cited consumer summary supports UTI symptoms and clinician assessment, not an unconditional statement that this particular presentation can be treated remotely. The draft itself acknowledges that telehealth eligibility is not established by its sources. Phrase remote care as the proposed assessment channel with eligibility checks, not a source-proven treatment pathway.
- Combining denied “back/flank pain” broadens the patient's exact denial of back pain. The clinical significance is narrower than a proven route error; an explicit distinction avoids unnecessary inference.
- The initial queries include “dysuria frequency 2 days, fever” despite denied fever and omit negation in “urinary symptoms pregnancy negative” only indirectly. The selected set contains pediatric fever, pregnancy infection and ectopic-pregnancy sources alongside the relevant UTI summary. Retrieval relevance needs separate scoring; exact quote identity alone cannot demonstrate useful RAG.

Current online judge, repair and released outcome have not yet been inspected for this entry.

## C04 — first-draft findings, before current judge inspection

Run `161ea484-6eac-4d55-b4af-47c431cdf826`; first-draft hash `a3f8e5cdd4ef590935ddc3ba997e3bc88ab53782713c925906eb87afff1605b0`.

- Same-day hands-on assessment is defensible for this diabetic plantar wound with redness, swelling and tenderness. Do not claim NICE sends every active diabetic foot problem immediately to acute services: NG19 distinguishes limb/life-threatening features from other active problems, for which referral is within one working day and triage within one further working day. The first message does not establish the immediate tier. [NICE NG19 recommendations1.4.1–1.4.2](https://www.nice.org.uk/guidance/ng19/chapter/Recommendations).
- **Direct input contradiction:** the reason asserts “spreading local signs” while the patient only reports surrounding redness and the draft's own red-flag table marks spreading redness unknown. Remove the inferred spread while retaining the sufficient reported local findings.
- **Unsupported operational capability:** “I can ask a Counsel clinician to review this thread” asserts an available handoff not evidenced by this stubbed system. Ownership recommendations should not masquerade as an executed or connected capability.
- “Someone needs to look at and probe the wound directly” is too indiscriminate about actor and necessity. The narrative context implies a visit, so this is not automatically a command for self-probing, but should specify a trained clinician and leave the indicated examination to that clinician. IWGDF/IDSA recommends considering probe-to-bone with other studies for suspected osteomyelitis; it does not require probing every small cut. [IWGDF/IDSA2023 recommendations1and7](https://www.idsociety.org/practice-guideline/diabetic-foot-infections/).
- The up-to50% occult-abscess quote comes from agent-compiled general ED cellulitis material. The draft qualifies uncertain applicability, but the figure adds no necessary support for this route and has not been independently established for diabetic plantar wounds. It should not become a patient-specific risk estimate.
- The vital-sign sentence preserves unknown measurement status; the words “symptom report only” alone do not negate that explicit uncertainty. No current fever or physiologic instability should be invented.

Current online judge, repair and released outcome have not yet been inspected for this entry.

### C03 and C04 — subsequent judge/repair comparison

C03's initial judge requested a narrower remote-assessment claim, separate back-pain denial from unknown flank pain, and an access fallback. The patch made those changes without changing routine async. A fresh judge accepted it; total69.291seconds, no early action. The evidence/eligibility correction agrees with the pre-judge audit. The exact clinical importance of the back/flank taxonomy split and the routine-versus-priority choice remains an adjudication question. Adding a fallback is useful operational clarity, but cannot itself establish a clinical severity threshold.

C04's initial judge independently caught all four recorded concrete issues: invented spread, indiscriminate probing, unsupported abscess-frequency claim, and unconnected handoff capability. The patch removed spread, deferred procedures to the examining clinician, removed the statistic citation, and recommended optional Counsel review without claiming to initiate it. A fresh judge accepted the unchanged same-day in-person route. Total83.841seconds; no early action was recorded. The nonblocking question concerned drainage and progression. These are meaningful factual, evidence and capability corrections, **not route improvement**. The early safety layer supplied no actionable same-day instruction despite the producer and both reviews agreeing that hands-on care was needed. That latency is a separate system observation, not a claim that the final route was wrong.

## C05 — first-draft findings, before current judge inspection

Run `ccc5ae6c-11c0-41b2-8bb8-3276cdc5e75b`; first-draft hash `032f9ca0ab489b9884229090e9a0dedfd7b797d2f79c22c489b2194c83aeb8ad`.

- The draft identifies concerning hopelessness and burdensomeness while preserving unknown current intent, plan, means and age. It does not invent a current attempt or automatically equate passive ideation with an EMS requirement.
- **Material support/delay concern:**988 is offered only if thoughts progress toward acting, a plan or means. Current warning signs already justify immediate access to support; that should not be conditional on worsening. The supplied MedlinePlus passage itself says to get help right away. NIMH likewise offers988 for warning signs, not only imminent attempts. [NIMH warning signs](https://www.nimh.nih.gov/health/publications/warning-signs-of-suicide).
- Current suicidal thoughts, ability to stay safe and means access could change immediate disposition. A question assessing current safety has a concrete routing consequence, unlike generic background intake. The producer has no question, but the full run's earlier safety/intake question has not yet been inspected; do not label the entire system as omitting it until that check. NIMH's adult outpatient assessment distinguishes current suicidal thoughts and a feasible plan from historical/nonacute findings. Patient age is unreported, so this adult tool is an audit framework, not proven patient eligibility. [NIMH brief suicide safety assessment](https://www.nimh.nih.gov/research/research-conducted-at-nimh/asq-toolkit-materials/adult-outpatient/adult-outpatient-brief-suicide-safety-assessment-guide).
- Priority async is not necessarily sufficient as a stand-alone wait channel while current safety remains unassessed. Immediate crisis support can coexist with an internal clinician priority without pretending988 and911 are interchangeable. The proposed same-day service fallback is useful but does not establish present safety.

Current online judge, repair and released outcome have not yet been inspected for this entry.

## C06 — first-draft findings, before current judge inspection

Run `20825801-3701-4f4a-ad2f-87714d00f2a6`; first-draft hash `e927ab6465def83aacf4edc550f37ce87e495ae5d8a801dee01c7593378b4032`.

- Routine clinician refill review is a plausible route for the stated longstanding losartan request. The draft correctly does not claim a new prescription was issued, and preserves unknown remaining supply and laboratory history.
- **Unconnected capability/access concern:** “say so here so it can be prioritized” assumes this prototype can cause prioritization. More importantly, notifying the same unconfirmed channel is not an independent alternative if a necessary refill cannot be obtained there. Use a truthful access recommendation instead of an implied connected queue.
- **Source-quality concern:** the cited MedlinePlus table presents crisis as systolic above180 **and** diastolic above120. The model repeats that conjunction. A source can be quoted faithfully yet carry a clinically important table interpretation/problem. It is also unnecessary future-risk content for this refill route; do not reward the citation merely for exact identity. This warrants primary-guideline comparison before any clinical-error judgment.
- Calling controlled blood pressure “elevated blood pressure denied” is an imprecise label for a treated patient and one historical home value. It does not establish persistent normal pressure, nor does it establish an acute hypertensive emergency.

Current online judge, repair and released outcome have not yet been inspected for this entry.

## C07 — first-draft findings, before current judge inspection

Run `0e47af03-7000-4381-b17e-b5fd4a52dc72`; first-draft hash `cb41f55624ce6dfd4848e2f5fc27c5249b9348d9003ebadc55906af049113815`.

- **Direct contradiction:** “Fever5days or more” is marked reported using the patient's “for2days” quote. This is a demonstrable duration-label defect, independent of whether the final current route should change.
- The combined “poor fluid intake/dehydration” denial exceeds reported drinking okay. Playful between fevers is reassuring, but does not exclude every period of reduced alertness. Preserve reported behavior/intake without converting them into comprehensive absence claims.
- Self-care can be appropriate for a genuinely low-risk febrile child, but the current first draft treats limited reassuring reported features as “maintained hydration” and sufficient overall low risk. NICE's remote framework requires attention to serious signs; home care applies to green features without amber/red features. Unknown breathing, urine output and skin color are not all established negative. A targeted context assessment or explicitly provisional wording could address this; not every missing detail is automatically a routing blocker. [NICE NG143 remote assessment](https://www.nice.org.uk/guidance/NG143/chapter/recommendations).
- The safety net distinguishes emergency signs from same-day and prolonged-fever review. Its utility is more relevant than importing ED infant population statistics. The cited ED synthesis is not a validated remote pediatric classifier, and the draft correctly discloses caregiver-only appearance assessment.

Current online judge, repair and released outcome have not yet been inspected for this entry.

### C05–C07 — subsequent judge/repair comparison

**C05:** the judge caught the crisis-support delay and988/911 ambiguity. A patient-message/reason patch now recommends988 immediately,911 for inability to stay safe or imminent action, and priority Counsel review alongside—not instead of—immediate support. A fresh judge accepted it. The early question did ask about current thoughts/plans and access to means, so the system did not omit that assessment opportunity. It was nonblocking. Final route remained priority async, total80.705seconds. This is important **action/timing lift despite unchanged bucket**. It shows why route-agreement alone is insufficient. Immediate988 support was not emitted as an early action; the completed text still came only after repair.

**C06:** the judge repaired assumed refill arrival/queue prioritization and added a prescriber/pharmacist continuity alternative; final routine async was unchanged at93.009seconds. Both initial and final judges accepted the >180 **and** >120 table claim as source-supported. The current AHA chart uses **and/or**, and distinguishes severe hypertension without acute symptoms from hypertensive emergency. This is a concrete **source-quality blind spot**, not a claim that the current122/78 refill disposition was wrong. The unnecessary future threshold survived into the evidence claims. A reachable publisher summary and matching quote do not guarantee clinically correct rule semantics. [AHA blood-pressure categories](https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings).

**C07:** the raw judge recognized the two-day/five-day contradiction and overly broad hydration/activity assertions, but fabricated a draft anchor ending “maintained hydration nutrition”; the word “nutrition” is absent from the actual draft. Exact-anchor admission correctly rejected the invalid review as `JUDGE_CONTRACT_FAILED`. No patch ran and the canonical answer remained null after49.441seconds. Thus the judge produced useful criticism but **no delivered correction**; this failure must not be counted as successful clinical repair. The raw review also objected to a limp/floppy-child contingency being placed in the same-day rather than immediate pathway. That additional clinical judgment was not independently pre-identified here and should be labeled as such.

## C08 — first-draft findings, before current judge inspection

Run `cd822430-ad56-4ff1-8e18-504b70b58fa0`; first-draft hash `47fe62048587f65d50e78f43d543dc1e103a797cf5b4d79a4511975caaaa806a`.

- Immediate emergency assessment for thunderclap headache with neck stiffness is supported; NICE NG228 recommends immediate ED referral for suspected subarachnoid haemorrhage outside acute settings and urgent imaging following clinical assessment. This does not mean the suspected diagnosis is confirmed. [NICE NG228](https://www.nice.org.uk/guidance/ng228/chapter/Recommendations).
- The machine transport is `activate_ems`, but prose offers911 **or** someone else driving now, then repeats911 as a later worsening response. A permissible ED transport alternative and an EMS-required pathway should not be conflated. Exact transport-policy consistency needs review; it is not automatically proof of unsafe ED transport on these facts.
- **Feasible-actor concern:** the patient is told to call911 after seizure or fainting while waiting. The possibility of another driver is not an explicit capable-bystander contingency. This reproduces the C02 action-executability issue; remove incapable-actor clauses or explicitly assign them conditionally to another person. Do not weaken the current emergency action.
- Initial sources include a directly relevant migraine-consensus red-flag table with patient-report versus physical-examination limitations disclosed. The ED synthesis contains additional assertive statistics and LP claims not needed for this answer; their mere retrieval does not validate them or require showing them to the patient.

Current online judge, repair and released outcome have not yet been inspected for this entry.

## C09 — first-draft findings, before current judge inspection

Run `84a26e87-c918-499f-a6c9-c5e0a5d9affb`; first-draft hash `31efaf5974f43a27af9674404da0d9ed380917724dea3a9fbb80b49e4432b0c0`.

- Immediate obstetric/emergency assessment is defensible for persistent headache, visual disturbance and facial/hand swelling at32weeks. ACOG identifies these as preeclampsia warning symptoms requiring immediate attention; the draft correctly leaves preeclampsia as a concern, not an established diagnosis. [ACOG pregnancy headache guidance](https://www.acog.org/womens-health/faqs/headaches-and-pregnancy).
- **Feasible-actor concern:** “call911 if you ... have a seizure” assumes action during incapacity. This repeats the prior collapse/seizure class even though the current ED-now instruction is appropriate.
- “Absence of measurement” and “unmeasured here” are ambiguous next to an explicit statement that measurement status is unknown. Clarify as no values available **in this message**, but do not automatically turn an ambiguous phrase into a claim that the patient never measured blood pressure. There is no recommendation to wait for readings.
- Counsel follow-up is a recommendation, not a claimed successful handoff; do not mislabel that distinction. Exact evidence claims concern symptoms and warning signs, with diagnostic uncertainty maintained.

Current online judge, repair and released outcome have not yet been inspected for this entry.

### C08–C09 — subsequent judge/repair comparison

C08's judge caught and repaired the seizure/fainting actor defect, preserving immediate emergency attendance and the alternative assisted transport wording. Early action7.474seconds; final72.812seconds. The potential machine-transport/prose distinction was not treated as an automatic clinical error by this audit; the successful actor correction is the demonstrated change.

C09's judge also caught the seizure actor defect and required consistent “unreported, measurement status unknown” wording across fields. The patch preserved ED/labour-and-delivery now and made another person the seizure-emergency caller. Early action3.117seconds; final74.226seconds. The seizure correction is concrete; the measurement rewrite resolves ambiguity but should not be counted as proven prevention of a routing error. In neither case did the repaired final bucket differ from the first draft. Repeated incapable-actor wording across C02/C08/C09 is a producer defect class worth preventing upstream, while retaining a calibrated semantic review for novel variants.

## C10 — first-draft findings, before current judge inspection

Run `f9cc6c03-915a-483f-a2ca-790e73ac1e9d`; first-draft hash `3e092a683b546d95cdf3dbc5c286b87f0f9d4d64ff7fb709a0290e88922b8008`.

- The biliary-pattern differential and a remaining clinician evaluation task fit the reported intermittent meal-related symptoms. The draft does not claim imaging or laboratory results exist.
- “Makes a same-day or emergency setting unnecessary” is overly conclusive when episode duration and current severity are unknown. “No reported feature establishes that requirement” would be narrower. This does not mean uncertainty itself mandates emergency referral; the route can remain a defensible provisional recommendation with clear contingencies or a decision-changing question.
- **Potential safety-net under-specification:** a hard, very tender abdomen is grouped with general same-day assessment. Distinguish immediate serious abdominal signs from routine new symptoms. The original patient's abdomen is not reported rigid/tender, so this concerns future instructions, not a present emergent finding.
- **Access fallback:** the reply names Counsel's service-hours target but no alternative if the necessary evaluation cannot be obtained there. A worsening contingency is not the same as a service-access fallback.
- The cited ED synthesis supports a symptom pattern, not this individual's exclusion of complications; threshold claims and remote eligibility remain bounded by the acknowledged limitations.

Current online judge, repair and released outcome have not yet been inspected for this entry.

### C10 — subsequent judge/repair comparison

The initial judge requested immediate emergency advice for a stiff/hard/tender abdomen and a clinician-access/follow-up fallback, matching the pre-judge concerns. The patch changed only the patient message; a fresh judge accepted it. The initial routine async route remained unchanged, total 82.753 seconds. NHS advice independently places severe or touch-tender abdominal pain in immediate emergency assessment rather than a generic same-day wait. [NHS abdominal-pain guidance](https://www.nhs.uk/symptoms/stomach-ache/). NIDDK also advises prompt clinical attention for gallbladder-pattern pain lasting hours or accompanied by fever, vomiting or jaundice. [NIDDK gallstones](https://www.niddk.nih.gov/health-information/digestive-diseases/gallstones/symptoms-causes).

The stronger-than-necessary claim that higher-acuity care is “unnecessary” remained in the reason. This is a wording/uncertainty concern requiring adjudication, not independent proof that the current route should be changed.

## Locked first-ten synthesis

This section describes **C01–C10 only**, not the unfinished full cohort. No current physician-reference labels were inspected or used to author the initial findings. All ten first producer attempts completed with parseable output and no recorded provider failure. Nine initial reviews were admitted as `revise`; C07's raw `revise` was rejected for an invented exact anchor. Nine patches and nine fresh reviews completed, yielding nine canonical answers. One run remained withheld. The qualified physician DVT reference and all historical labels remain untouched.

| Observation | First-ten result | Interpretation |
| --- | --- | --- |
| Delivered final answers | 9/10 | C07 judge contract failure retained; not a successful repair |
| First-to-final route/priority changes | 0/9 completed | No observed bucket lift in this selected prefix; not proof of no action/text benefit |
| Provider calls | 58 | Nine six-call repairs; one four-call failure |
| All-start final/stop median | 75.699 s | Includes the 49.441 s withheld run |
| Completed-answer median | 77.172 s | Complete cases only; not interchangeable with all-start median |
| First producer call median | 16.524 s | Call duration, not browser first-response latency |
| Cumulative judge-call median | 46.949 s | Sum of judge calls per run; includes one single-call failure |
| Patch call median | 6.167 s | Nine completed patch calls only |

The strongest demonstrated benefits were correction of incapable-actor emergency instructions (C02/C08/C09), invented patient facts (C04), unsupported coordination capability (C04/C06), inappropriate safety-net timing (C01/C10), and making crisis support available now rather than after worsening (C05). C05 is particularly important: **the bucket did not change while the action did**. Some changes were narrower taxonomy or ambiguity cleanup (back/flank wording, measurement wording), which should not be counted equally with clinically consequential corrections.

The audit also found a retained clinically relevant source-rule concern: C06 repeats the corpus table's conjunctive blood-pressure threshold and both reviews accept it because the source says it. Exact source support is not source correctness. Several routine cases retrieve emergency, pediatric, or unrelated documents. A good route is therefore not sufficient evidence of RAG benefit.

### Highest-value next proof, after this frozen cohort finishes

1. **Prevent repeated defects at the producer, then measure net reviewer value.** Test a narrowly changed instruction for feasible actors, truthful service capability, reported-versus-unknown facts and separate worsening/access contingencies. Use matched frozen inputs, the same evidence and reviewer, plus untouched challenge cases. Count material defects removed/introduced, first-pass release, actual action/transport changes and latency—not only route agreement. Do not promote merely because fewer reviews request changes.
2. **Make judge evidence binding reliable without weakening it.** C07 shows useful review reasoning is lost when one free-written exact anchor is invented. Prefer selectable stable draft/source-span identifiers, or explicitly bounded contract-only recovery with the same immutable draft and retained failed attempt. Do not silently fuzzy-match, discard invalid anchors, accept the raw verdict, or alter the current frozen run.
3. **Evaluate source quality/applicability independently of entailment.** C06's threshold is a useful negative control: a faithful paraphrase of a defective/incomplete source must not count as clinically valid evidence. Replace unnecessary future-risk material with relevant primary guidance only after separately recording corpus provenance/version changes. Score retrieval relevance and claim necessity, and retain uncertainty for rules that the provided sources do not establish.

These findings motivate changes; they are not physician adjudication, a clinical-readiness claim, or a recommendation to bypass all reviews. This ten-case prefix contains known development cases and is neither held-out nor a random sample.

## Read-only design proposal: C07 exact-anchor recovery

Current binding is in `src/disposition/clinical-graph.ts` (`graphJudgePacket`, `validateGraphJudge`, the judge branch in `call`) and `src/disposition/judge-anchors.ts`. The validator returns null for any invalid anchor. C07's raw review is otherwise parseable but its `patient_grounding` draft anchor appends an absent word. Existing source citation generation already uses server-defined quote IDs in `src/disposition/source-quote-refs.ts`; the judge still retypes free-form quotations.

### Smallest bounded recovery to test

Do not repair the current cohort or change its outcome. In a separately versioned candidate:

1. Expose structured validation diagnostics without changing `validateGraphJudge` admission. Only consider recovery when the provider succeeded, the complete raw schema parses, the raw verdict is `revise` with at least one failed criterion, **all non-anchor checks pass**, and the sole failure class is one or more invalid criterion anchors. Do not recover provider failures, truncation, verdict inconsistency, missing source support, invalid transport/ownership binding, or `accept` reviews through this path.
2. Preserve and log the original failed execution. Bind a recovery packet to patient hash, exact draft hash, source/packet hash and raw-review hash. Supply the unchanged original review and only the failing anchor locations, plus a server-created catalog of valid exact spans for the same original units. For C07 the sole permitted location is `patient_grounding.anchors[2]`, original unit `draft`.
3. Ask for a **selection-only** response: `{rawReviewHash, packetHash, replacements:[{criterionId, anchorIndex, spanId}]}`. No verdict, criterion, reasoning, repair-target, question, source-query or patient-answer fields. Each replacement must select an actual supplied span from the same unit; no deletions, unit switches, new quotations, fuzzy text replacement or joining separate fields. Span length must satisfy the existing3–300-character anchor contract. Build spans from individual decoded draft fields or contiguous serialized entries, never concatenate unrelated fields. The existing580-character source-span helper cannot be reused unchanged for this300-character constraint.
4. The server materializes selected exact text and checks that only the authorized invalid anchor slots changed; all already-valid anchors and every clinical judgment remain byte-identical. Run the **entire existing validator** again. Failure remains failure. The recovered result can only be `revise`, not a new approval. Then follow the normal field-local producer repair and a fresh exact-draft judge before any answer release. Do not bind the pre-repair review to a revised answer.
5. Allow at most one such recovery, with its own recorded call, usage, latency and conservative reservation. This can reduce abandonment, but adds a call and does not itself solve the latency problem. It requires a new study allocation/manifest and cannot fit invisibly inside the current frozen call reservation.

### Prevention preferable after the minimal recovery experiment

Replace criterion free-text anchors in the **judge wire schema** with server-issued span IDs while retaining the full original text and the unchanged normalized exact-quote review contract. A stable catalog bound to the packet lets the model select evidence without reproducing it. This should remove this particular invented-quotation failure mode with no extra inference step. Unknown IDs, stale catalog hashes and cross-unit references still fail closed. A correct ID proves identity only: a real but irrelevant span must still be caught by calibration; it cannot prove clinical entailment. Transport and ownership quotations would need separate explicit coverage—changing criterion anchors does not silently solve their contracts.

### Zero-spend tests and the minimum scientific comparison

- Reproduce C07 unchanged as a failed raw review; recover only its invalid draft anchor to an exact permitted span; preserve `revise`, all failed criteria and the original failed record. Verify that patient-answer release still requires producer repair and a fresh review.
- Reject changed verdicts/reasons/targets, removed anchors, wrong units, nonexistent span IDs, stale patient/draft/source hashes, and any attempt to recover a provider-failed or truncated attempt.
- Reject a source-support pass when its required source anchor is absent; do not repair that semantic/structural defect by silently adding a source.
- Exercise JSON escaping, Unicode, sentence boundaries and repeated strings; never create a cross-field quote. Keep exact selection deterministic.
- Include both defective and clean first drafts, plus a negative control with a perfectly exact but irrelevant source span. Measure contract completion separately from clinical disagreement and false release/withhold.
- Compare the frozen original reviewer against span-ID output on identical packets with alternating order, retaining every failure and binding. Do not change review brevity, model effort or clinical policy in the same comparison. The existing final50 run should finish unchanged first.

## Additional targeted diagnoses: C24, C25 and C28

These were selected after failures/latency were known; this section is **not blinded**, is not part of the first-ten summary, and is not physician adjudication. Source artifacts remain unchanged in `outputs/clinical-lift-v22-cohort-live-2026-09-14/`.

### C24: an unchanged finding missed on the first review

Run `ec3c361b-7e81-41f8-90a3-c12cc41de47c` ended `review_required` after 70.096 s and six successful provider calls. The final judge's valid verdict was `revise`, not `accept`; no contract check wrongly erased an approval.

The first review requested only `patientMessage`, correcting a blanket same-day safety-net sentence. The patch did that. The second review then failed grounding for the **unchanged** differential entry, “Routine ongoing hormonal contraception refill with reported stable tolerance,” because formulation was unreported. Both reviews passed the routine async routing criteria. Therefore the new failure is a missed first-review issue, not a patch-introduced defect, and no route-level harm has been demonstrated by this comparison.

Formulation-neutral wording is more faithful: contraception includes nonhormonal methods, and method-specific eligibility differs. [CDC methods](https://www.cdc.gov/contraception/about/index.html), [CDC medical eligibility criteria](https://www.cdc.gov/mmwr/volumes/73/rr/rr7304a1.htm). However, a possible subtype in a differential, especially alongside explicit uncertainty, is not automatically equivalent to an unsafe prescription. Calibrate the materiality distinction rather than forcing every subtype mention to be a release-blocking error.

**Next proof:** frozen matched packets with formulation unknown versus explicitly reported, and neutral versus definitive subtype wording. Track first-review misses, unchanged-field reversals and actual unsafe eligibility/treatment changes separately. Do not expand every patch to all fields, silently reuse the earlier grounding pass, or add an unlimited repair loop to obtain acceptance.

### C25: retained truncation failure dominates the outlier

Run `8c46a54e-ef2d-42bb-916f-1078dd13bb07` completed in 176.425 s; initial same-day action was emitted at 3.352 s. It used seven provider calls, **one of which failed**:

| Stage | Duration | Observed result |
|---|---:|---|
| Initial context/evidence/producer workflow | 24.316 s | Draft available |
| First judge | 90.579 s | `finishReason=length`, 6,144 output tokens, `INCOMPLETE_MODEL_STREAM` |
| Same-packet truncation recovery | 24.217 s | `revise` |
| Field-local producer repair | 16.780 s | Patch applied |
| Fresh judge | 20.464 s | `accept` |

The review/release workflow consumed 152.077 s. Retrieval requests each took 0.665–0.793 s and ran in parallel; RAG is not the demonstrated bottleneck here. The failed judge emitted its first text at 3.746 s and last delta at 90.225 s; this is not a silent provider wait or a 50-second application cutoff. The counters do not retain sufficient text to diagnose the content of the long generation. Do not invent a repetition mechanism from character count alone.

Recovery corrected the assumed imaging capability of unspecified urgent care, unreported long-haul/prolonged-immobility assertions, and categorical blood-testing language. The route remained same-day in person. A capability-aware diagnostic pathway is the relevant target: NICE uses assessment and clinical probability to determine testing, not an unconditional pair of tests for every message. [NICE NG158](https://www.nice.org.uk/guidance/ng158/chapter/Recommendations).

**Do not fix by** hiding the failed call, treating seven calls as seven successes, shortening a clinical deadline, adding another clinical agent, or automatically raising the output cap again. Keep the successful bounded recovery; compare reliable judge serialization on identical packets before promotion. This qualified DVT case remains separate from the physician's 49-case incumbent agreement.

### C28: accepted draft, unsupported transition contract

Run `1d6aca7c-c436-4116-a53d-8eb0a330b319` retained emergency care after 73.360 s. The early assessor issued ED-now at 8.089 s; the main draft chose same-day in-person assessment. A patch removed the ungrounded one-pad-per-hour cutoff. The fresh judge accepted every current-draft criterion but also set `earlyAction=supported` and `earlyCorrection=null`. The sole failed release check was `care_reconciliation`.

This is the same supported-alternative schema gap as C16, not a provider or judge failure. Current code permits lowering an earlier route only through `earlyAction=unsupported` plus explicit correction. A judge cannot both consider the cautious ED recommendation defensible and approve a supported lower route through that contract.

The clinical distinction must remain explicit: NICE directs significant pain/bleeding concerns or hemodynamic instability to emergency care; other early-pregnancy complications warrant a capable assessment service with urgency based on the clinical situation. This message does not establish that unreported severity findings are absent. [NICE NG126](https://www.nice.org.uk/guidance/NG126/chapter/symptoms-and-signs-of-ectopic-pregnancy-and-initial-assessment).

**Next fix to test:** a versioned, exact-bound transition decision separate from judging the historical recommendation's defensibility. Require explicit authorization and rationale for the current route; preserve strong emergency-transport correction safeguards, all original notices, and a visible care-revision event. Do not use a pregnancy-specific bypass, silently relabel `supported` as `unsupported`, or treat a general `accept` as permission to lower prior care.

## Additional targeted diagnoses: C37 and C39

These are selected, non-blinded failure investigations, not additional physician adjudication or an extension of the locked first-ten metrics. No frozen runtime or result was changed.

### C37: second review requests a transport-transition safeguard

Run `8b1185ba-5dc8-41f8-9811-e5f499f0a35a` ended `review_required` after 74.449 s and six successful calls. The sole failed final check was `independent_review`. The first draft and revised draft both recommend immediate ED assessment; the early assessor instead issued unconditional 911 at 9.744 s.

The first review correctly identifies an incapable-actor clause, “If pain becomes unbearable, you faint, or you can't get there quickly, call 911.” The patch replaces it with calling when feeling faint, and a bystander calling after loss of consciousness. The second review passes all seven criteria but still returns `revise`, requesting that the patient continue following the dispatcher if 911 has already been called. That newly requested safeguard was absent from the first correction request. This is a serial review/transition-completeness issue, not malformed output, a rejected patch, a missed emergency route or a provider timeout. The patient has not reported actual EMS activation; the condition must remain conditional.

The narrowly allowed care-correction path releases ED-now safety-only guidance and retains the full explanation as rejected. Its reconciliation reason explicitly says that activated EMS should continue; the GUI renders that reason both during the revision event and in the final result. Therefore this safeguard is **not absent from the current GUI**. However, `graphCareDirective` projects the reviewed care into a generic canonical `answer.patientMessage` without that condition. A downstream consumer reading only the canonical directive would lose a condition the second judge considered material. The transition message and its required obligations should be part of one bound care-publication object, not dependent on consumers also reading prose metadata.

**Bounded correction:** make transition completeness an explicit scored/admitted obligation on the first review; require an overall `revise` to identify a failed/abstained criterion or a separately failed transition obligation. Do not silently coerce the observed all-pass `revise` to `accept`. For transport corrections, bind the old instruction, new instruction, patient, exact draft, activation state and required continuation/fallback wording. Preserve those obligations in the canonical directive and any safety-only projection. Test no activation report, reported active EMS, reported cancellation/planning, wrong patient, stale review and a rejected current care recommendation separately.

An additional evidence-quality concern is not the reason this run failed: the draft says salvage is “time-limited to roughly the first 6 hours.” Guidance emphasizes early treatment for maximal salvage, not zero possible benefit beyond six hours. [AUA acute-scrotum curriculum](https://www.auanet.org/documents/education/Acute-Scrotum.pdf), [RACS torsion guideline](https://www.surgeons.org/about-racs/position-papers/acute-scrotal-pain-and-suspected-testicular-torsion-guidelines-2022). Do not convert a time-to-best-outcome statement into a hard futility boundary or imply this audit established clinical correctness of every retained source claim.

### C39: another defensible-alternative transition gap

Run `94b2ca8a-a62b-4d0a-b26f-1e155f897427` ended `review_required` after 42.883 s and four successful calls. The early assessor issued ED-now at 2.700 s. The producer proposes same-day in-person mental-health assessment with emergency action if the patient cannot keep herself or the baby safe or develops hallucinations. The judge accepts all seven criteria, calls the earlier ED instruction a defensible cautious response, and sets `earlyAction=supported`, `earlyCorrection=null`. The only failed release check is `care_reconciliation`. This reproduces C16/C28's generic contract gap and does not justify another symptom-specific rule or another clinical agent.

The clinical question still requires risk assessment, not a rule that frightening thoughts establish psychosis or intent, and not a rule that absent intent documentation proves safety. NICE separately requires assessment of risk to mother and baby and immediate specialist assessment when postpartum psychosis is suspected. [NICE CG192, recommendations 1.5.12 and 1.6.3](https://www.nice.org.uk/guidance/cg192/chapter/Recommendations). This selected model audit does not settle which route is clinically preferred for the exact case.

The same explicit transition-authorization design applies. Also retain a destination-capability concern for adjudication: the draft lists a crisis line among ways to obtain an “in-person” assessment. A line can facilitate assessment but is not itself a physical examination destination. The current judge accepts this wording; label it an ambiguity to test, not a proven route error. Keep same-day access contingencies, unknown support/intent and explicit emergency fallback when testing any alternate route.

## Prepared but not applied: mixed real-change/no-op repair admission

C13's patch changes `reason` and `patientMessage` but repeats unchanged `questions: []`; its raw patch does not include a routing edit. The existing `NOOP_REPAIR_FIELD` rejection discards the whole patch despite real authorized changes. No clinical benefit has been demonstrated from rejecting such redundancy.

After the frozen studies, the smallest change is to validate schema, exact hashes, duplicate fields, authorization and source references first; then record identical authorized fields as explicit audited no-ops. Require at least one real change. Preserve array order and string identity, and compare objects structurally rather than depending on property insertion order. Actual routing changes still require explicit coupled patient-message/reason entries; merely repeating unchanged routing must not trigger coupling. No-op normalization must never waive unauthorized fields, invalid references, stale bindings, atomic failure or the fresh full exact-draft judge.

Regression matrix: admit the exact mixed C13 patch for assembly only; admit real prose plus identical authorized routing/questions; admit actual routing change with explicitly revalidated unchanged coupled prose; reject all-no-op, duplicate, unauthorized-even-identical, stale, unknown-source and invalid-final-routing patches. Test effective routing changes without coupled prose, edit-order invariance, Unicode/string identity, and fresh-review rejection/transport failure/cancellation. Preserve the raw patch and distinguish attempted changed fields from applied changes when a later validation rejects it. Successful patch assembly is not answer release or physician approval.

### Implementation after the full-cohort freeze ended

The main-workspace freeze ended after the cohort completed at 21:58:06 UTC. The separate effort comparison runs from an unchanged isolated snapshot. New `field-local-repair/v2` now records `noopFields` and requires an effective change after validating permissions and source references. A dependency-free structural comparator is shared with browser provenance reconstruction; strings and array order remain exact. Historical v1 reconstruction retains its original behavior. The browser also recognizes app-owned continue-EMS instructions in the strong correction guard, without a legacy safety bypass.

The targeted medication-directive helper is now wired into `checkAnswer`; findings include exact field, matched text and UTF-16 offsets for repair scope. Reported/technique predicates and increasing medication need are distinguished from new dosing instructions, without exempting a whole conditional sentence or treating a prescription/action-plan mention as authority for arbitrary new instructions.

Zero-spend verification: 19 focused tests passed in 146.8 ms; three selected existing workflow regressions passed in 973.7 ms, including fresh review and care-only provenance tampering. Replaying the **unchanged** raw C13 patch now assembles only `reason` and `patientMessage`, audits `questions` as a no-op, and produces draft hash `73ae34789e69cbc8f8b639de9d6701438b0aa72a06ba3ea234a66a824bfb0a5e`. No answer was released: that draft still requires fresh clinical-content review. Rechecking C18's original first draft changes the targeted inhaler check to pass; it does not retroactively release the historical run or establish clinical correctness. Both original result files were verified byte-identical after these read-only replays. No paid calls or builds were performed for this implementation subtask; main-workspace full verification and live retests remain the parent task's responsibility.

## Additional targeted diagnoses: C46, C48 and C49

These are post-outcome engineering investigations of selected cases, not blind physician adjudication. The records below remain unchanged. External references consulted for this audit were not necessarily available to the producer or online judge and cannot retroactively supply missing evidence.

### C46 — operational refill review is not medication approval

Run `bcdb1a92-2f92-4c7b-bc1e-ef2ccb91e394` received: “30M. Requesting a refill of my finasteride, 1mg daily. No side effects, been on it about a year.” Both producer versions and both critics retain routine `ASYNC_PHYSICIAN` / `medication_request`. The final result was withheld after 59.773 s, without an early action.

The first draft adds specific breast/sexual/urinary warnings and possible indication/monitoring examples despite returning no citations. The first critic correctly distinguishes the policy-supported refill-review route from those unsupported drug-specific details; it requests only `patientMessage` and `differential` changes. The patch removes those examples. The fresh critic then fails the unchanged empty citation list, requesting finasteride prescribing evidence. Its own explanation still calls routine routing proportionate. This is not demonstrated clinical misrouting. It combines a real first-draft support gap, an incomplete first repair scope, and a contract that cannot cleanly represent a policy-grounded administrative prescribing-review recommendation without asserting treatment eligibility.

Retrieval returned prostate summaries, general drug/sexual-health pages, and an unrelated migraine guideline; it did not retrieve finasteride-specific prescribing information. Context queries introduced BPH despite the patient's indication being unknown. A primary label is publicly available and distinguishes the 1 mg hair-loss indication and periodic reassessment, but does not prove this particular patient's indication or suitability. [DailyMed finasteride label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=abd87058-923f-4767-986c-278201c0e688).

**Minimal safe target:** recommend standard Counsel clinician review of the requested prescription, with indication, eligibility, dose and monitoring left to that clinician. Bind the operational destination/priority to the versioned queue policy and the patient's request, not to a medical-guideline citation. Evaluate any retained drug-specific clinical advice separately against relevant evidence. An explicit, independently checked `policy_only` support basis could make clinical evidence “not applicable” only for a narrowly operational response; it must not turn retrieval failure into clinical-support success or permit unsupported safety-net, contraindication, efficacy or continuation claims. Until that contract exists and is tested, retaining the evidence-gap status is more honest than adding an irrelevant citation or raising acuity.

### C48 — real early under-escalation, followed by a framework-only draft rejection

Run `575158dd-6f5f-475d-b20e-592e7058caf6`: a 71-year-old reports severe hip pain and inability to bear weight after a fall. Haiku issued only `SAME_DAY_IN_PERSON` and internally described a “mechanical fall,” although the mechanism was unknown. Opus's first draft instead requests `EMERGENCY_NOW` with `activate_ems`, avoiding weight bearing and awaiting assistance. This stronger route is defensible: NHS guidance calls for immediate hospital assessment and ambulance help for severe post-fall hip pain or inability to bear weight. [NHS broken-hip guidance](https://www.nhs.uk/conditions/broken-hip/).

The critic passes **all seven current-draft criteria** and supports EMS transport, but emits `verdict=revise`, `earlyAction=unsupported`, and `repairTargets=[]` solely to supersede the inadequate earlier notice. The runtime then rejects with `REPAIR_SCOPE_UNAVAILABLE`. No producer patch was needed or made. The final UI retains reviewed 911 care but withholds the full explanation. These are two distinct failures: an earlier clinical action lacking appropriate destination/transport, and release orchestration unable to publish an accepted unchanged draft while recording correction of earlier care. The historical early error must remain scored even if that release path is fixed.

The retained advanced-imaging citation comes from an agent-compiled source. NICE's actual recommendation is conditional on continued fracture suspicion despite adequate negative X-rays; MRI is preferred, with CT considered when MRI is unavailable within 24 hours or contraindicated. This supports cautious occult-fracture discussion, not an unconditional advanced-imaging mandate for every painful fall. The draft defers imaging decisions to receiving clinicians; primary-source retrieval would nevertheless be cleaner. [NICE CG124, recommendation 1.1.1](https://www.nice.org.uk/guidance/CG124/chapter/recommendations).

### C49 — substantive routing and source-application repair, not merely a label disagreement

Run `81201379-9484-4862-91c9-d32afc3b19e5` reports persistent pleuritic chest pain after a workout, denied dyspnea/leg swelling and no smoking. Early Haiku issued same-day in-person assessment. The first Opus draft lowered this to routine async, stated that no reported feature required hands-on care, and treated a PE feature list as generally “not reported” despite reported pleuritic pain. It also omitted persistent pain from its claim about a citation that explicitly includes pain that does not go away.

The critic identifies undertriage, patient-grounding, claim-support and safety-net defects. A field-local patch changes routing, reason, patient message and citations; the fresh critic accepts `SAME_DAY_IN_PERSON` with prompt capable assessment and ED fallback if that cannot be obtained. Early action was 4.118 s; completion was 91.891 s. This is the cohort's reported first-draft route correction and includes independently visible evidence-application errors. It does not establish that all workout-associated pleuritic pain requires the same setting, or that a guaranteed immediately available clinical assessment pathway could never be defensible. That capability was not connected or established here.

## Timing-blind inspection of first six effort-study pairs, trial 1

Protocol `producer-effort-fixed-packet/v1`, fingerprint `f54e5b8f2456eb2f854de6f903d0fff5f4428c53d320bebe96af535b3fca2e5e`; records were read from the isolated study directory referenced by `outputs/producer-effort-study-2026-09-14.consumed.json`. This subsection was written after reading the 12 draft files and original messages, **before reading their review/outcome files or latency values**. Arm names and prior project history were known. It is timing-blind, not blinded to treatment or clinically independent physician adjudication; trial 2 was not inspected.

Both efforts produce the same current route in all six pairs: C30/C01 self-care, C02/activeEMS emergency, C50 priority async and C04 same-day in person. Route agreement alone obscures these content differences:

- **C30:** both describe the rash as “confined” while their own tables leave spread beyond the forearms unknown. Low calls the fever denial “not a measured temperature”; medium says “not by measurement.” Because both first preserve unknown measurement status, evaluate the complete-sentence scope: medium more directly asserts an unestablished basis, while low may mean that no numeric value was provided. Neither should receive an automatic keyword-only failure. Low groups breathing difficulty with same-day advice before saying 911; medium separates emergency breathing instructions. Medium improves that action separation but does not fix the confinement issue.
- **C02:** both preserve immediate EMS. Low adds an unqualified door-unlocking instruction; removing the unnecessary task or conditioning it on safety would avoid a feasibility concern. Medium adds “whoever is with you” for a collapse contingency without establishing a bystander. “If someone is present” would avoid that assumption. Neither difference demonstrates superior current routing.
- **activeEMS:** both correctly continue the already-dispatched response, preserve the patient's activation quotation, and reserve contacting 911 again for a change/problem rather than demanding redundant activation. No material patient-fact discrepancy was identified in this bounded read.
- **C50:** both preserve priority prescribing review without issuing a refill. Medium describes review starting in messaging and names Counsel; low more strongly says the prescribing decision “can be handled remotely” and offers an unspecified pharmacy-based urgent option. Eligibility and local prescribing capability remain unestablished. Both neurological safety nets should be assessed against usual versus new/atypical aura, not mechanically rejected for mentioning neurological symptoms.
- **C04:** medium reintroduces “spreading redness” in its explanation despite unknown progression; low stays with reported surrounding redness. Both add procedural/probing language and claim Counsel “can stay involved” despite the unconnected handoff. Broad ED contingencies for any drainage/pus warrant clinical adjudication rather than an automatic failure label. More reasoning effort has not obviously removed unnecessary assertion surfaces.
- **C01:** both mark reduced intake/dehydration denied from preserved intake. Low again delays “keep worsening” until beyond about a week; medium separates worsening from persistence. Medium nevertheless uses broad swallowing-difficulty emergency language and “safely manage” reassurance, while both infer general cold guidance from RSV sources. That is a mixed content change, not a clean clinical-quality win.

These observations do not estimate pass rates or support promotion of medium effort. The preplanned full judge outcomes, failures, repeat trial and costs must be reported separately; a larger reasoning setting cannot be credited with clinical lift merely because it adds detail.

### Subsequent comparison with the trial-1 online reviews

After preserving the draft-only observations above, review/outcome records were inspected with latency fields omitted. All 12 drafts and judges were structurally valid. Both arms were release-eligible on 3/6 trial-1 packets: low accepted C30, C02 and activeEMS; medium accepted C02, activeEMS and C50. This is a descriptive first-trial result, not the completed two-trial study or an independent clinical score.

The online judge agreed on the combined intake/dehydration problem in both C01 drafts and on calibrating both C04 drainage-only ED thresholds. It rejected C50-low's broader “rescue medication exhausted” assertion while accepting the narrower sumatriptan wording in medium. This specific grounding difference is additional to the pre-judge observations.

Potential calibration misses remain. The low C01 judge explicitly passes its safety net while quoting “symptoms that keep worsening beyond about a week”; that does not separate worsening from persistence. Medium C04's patient-grounding criterion passes despite the new “spreading redness” narrative. Low C30 passes despite “confined,” whereas medium C30 is failed partly for the same confinement assertion (and additionally for inferred elapsed days and describing reported itch as unreported). These are reasons to inspect materiality and consistency, not to change the preserved outcomes or count judge disagreement as verified patient harm. Both C02 optional-action/bystander concerns were accepted online; their practical importance remains an adjudication question rather than a newly certified failure.

## Timing-blind inspection of effort-study trial 2

The 12 `*-2-draft.json` files and the six original messages/context packets were read before trial-2 reviews, outcomes or timing fields. The parent had already disclosed the full-study headline (low 6/12 versus medium 3/12 release-eligible and medium slower), so this review is outcome-aware at the aggregate level, timing-blind only at the individual-packet level, and not arm-blind or physician adjudication. Draft observations were recorded before inspecting the corresponding online reviews.

- **C30:** both retain self-care. Medium again says the rash is “limited to both forearms” while its table preserves involvement beyond the forearms as unknown. Its limitations also call “pain versus itch” unreported despite explicit itch; pain is unknown, itch is reported. Low's “localized” wording describes the reported area rather than expressly excluding other sites, and its table preserves broader involvement as unknown. Medium improves the separation of breathing/airway emergencies from same-day rash review, but neither draft establishes a reason to route the current expected local spread to a clinician. Both largely retain prior synthesis/consumer evidence rather than acquiring better evidence through greater effort.
- **C02:** both request immediate EMS. Medium introduces the concrete incapable-actor instruction, “If you become faint, collapse ... tell the 911 dispatcher”; the patient may be unable to execute that action after collapse. Low instead assigns reporting to someone who finds the patient unresponsive, although the conditional grammar could still be clearer. Medium's added symptom-specific detail does not compensate for the new practical defect. Both cite a narrow duration quotation while attaching additional ACS symptom claims; claim support should be checked against the supplied passage context, not quote identity alone.
- **activeEMS:** both correctly preserve `continue_ems` and the exact dispatch quotation. Medium newly instructs the patient to “call 911 back” after collapse, repeating the incapable-actor defect absent from low. Its added door-unlocking advice is at least conditional on being able to do so safely; it remains unnecessary to communicate the disposition. This is a meaningful first-pass instruction difference despite identical routes.
- **C50:** low marks “sudden severe or unfamiliar 'worst-ever' headache” denied from a statement about the usual pattern. The patient did not explicitly deny thunderclap onset; medium correctly separates usual-pattern denial from unknown sudden onset. Low also generalizes running out of sumatriptan to exhausted rescue medication, whereas medium's reason specifically names sumatriptan, though its patient message again generalizes to rescue medicine. Medium's claim that a clinician “can handle” the task in messaging is stronger than proposing assessment there; its own limitations preserve unverified remote eligibility and availability. Both neurological return precautions still require usual-versus-new/atypical-aura judgment, not an automatic phrase-based pass or failure.
- **C04:** both now put “spreading redness” into the patient explanation although the original says only surrounding redness. Medium explicitly acknowledges in the citation limitation that spread is unreported, making the contradiction directly visible. Both add probing expectations and assert that Counsel “can stay involved” without connected handoff capability. Medium is more prescriptive that someone must probe the wound; low at least describes a hands-on look. These are avoidable fact/procedure/capability assertions, not evidence that the agreed same-day route is wrong. Trial 2 removes the trial-1 drainage/pus-alone ED trigger, a useful change in both arms.
- **C01:** both still mark dehydration denied from maintained intake. Medium additionally calls the patient “well-appearing,” which cannot be inferred from this text, and reintroduces “symptoms worsen or persist beyond about a week,” which can attach worsening to the duration threshold. Low separates worsening throat pain from persistence beyond ten days. Both broaden RSV-specific evidence to common viral illness while acknowledging uncertain applicability. Medium's extra unknown-field language does not negate its invented examination-like descriptor.

Across these six pairs, the current settings again match. Concrete added defects in medium include two incapable-actor instructions and an unsupported “well-appearing” descriptor; medium also improves the migraine red-flag distinction. Therefore the draft-only comparison is mixed but supplies no clinical-quality rationale for an effort promotion. These are auditable text differences, not estimates of clinical harm or held-out accuracy.

### Trial-2 online review and completed-study decision

After preserving those draft observations, the trial-2 online records were inspected. Low was release-eligible on C02, activeEMS and C04 (3/6); medium was release-eligible on none (0/6). Low C50's judge returned `INCOMPLETE_MODEL_STREAM`; it is a retained failed attempt, not a clinical rejection or an excluded case. Its producer nevertheless has the independently visible onset-denial defect and the matching targeted mechanical check fails. Do not assign it a fabricated complete judge verdict.

The valid online reviews agree with the pre-judge actor-feasibility findings for medium C02 and activeEMS, the invented spread/mandatory-probing problems in medium C04, and the unsupported appearance/intake findings in medium C01. Medium C50 retains an ungrounded inference that all rescue access is lost, even though its onset distinction improved. Both C30 drafts are rejected for an overly broad future facial-swelling-to-911 threshold; that is not a rejection of current self-care or of expected localized rash evolution.

Not every initial concern is a certified defect. The low C04 judge explicitly interprets “a cut with spreading redness” as general explanation rather than a current patient assertion, and accepts its optional Counsel involvement as a recommendation rather than a completed handoff. That contextual distinction may be defensible; the narrow practical improvement is to remove ambiguity, not force every similar sentence to fail. Conversely, the medium C01 judge passes the safety net while quoting “symptoms worsen or persist beyond about a week,” leaving the duration-conjunction concern unresolved. C30-medium's grounding pass also does not discuss its unknown-itch/confinement wording. These limitations prevent using online acceptance as unqualified clinical correctness.

**Decision: do not promote medium effort.** The completed fixed-packet study records 48/48 planned calls and 24 valid producer drafts with exact source quotes. Low is release-eligible on 6/12 attempts; medium on 3/12. Low has 11/12 valid judges versus medium 12/12. Medium's median paired producer-plus-judge time is 4.189 s longer across the 11 pairs with valid judges in both arms; the 12-pair producer-only median difference is 3.551 s longer. The failed low C50 review took 83.371 s, making that observed full attempt 100.055 s; retain it in the all-attempt accounting rather than treating the conditional paired latency as reliability. The recorded budget accounting is $8.881575 inclusive of the study's 1.25 contingency factor, not an invoice total.

This does **not** establish low as clinically superior or deployment-ready. The study has six selected development packets, two draws per arm, reconstructed historical first-producer inputs, the same uncalibrated-in-parts Astra judge, fixed retrieved evidence rather than fresh end-to-end RAG, and no physician-blind adjudication. Pair counts are not 12 independent clinical cases. The protocol preserves failures and no-retry outcomes; no result, source corpus, physician reference or runtime effort setting was changed by this audit. The next improvement should target demonstrated unnecessary fact re-authoring and feasible-action defects while retaining the brief differential, red flags and supported routing explanation—not spend more reasoning by assumption or weaken the judge to raise acceptance.

## Source-v8 migration after both paid studies finished

Executed September 14, 2026, with the previous Next server stopped and port 4120 unoccupied. The original v7 PostgreSQL directory was copied to a fresh temporary donor before reuse; only the copy was opened. The complete original v7 file tree, original portable-bundle directory, patient CSV and clinician-development-review CSV were hashed before and after and remained byte-identical. All 1,391 normalized base documents also remain identical in the derived corpus. No historical run or physician reference was rewritten.

The new `apps/evaluation/.local/clinical-rag-v8` index has **1,393 retained documents and 5,205 eligible, embedded chunks**. It adds exactly two narrowly extracted NHLBI patient-education sources and places `medlineplus:34` and `medlineplus:6450` under the explicit engineering quarantine. The original held text and publisher metadata remain in the corpus and `rag_docs`; a direct SQL census found zero eligible chunks and zero graph edges referring to either held ID. This is a local source-discrepancy hold, not a publisher retraction or physician approval. The replacement documents retain the distinction between asymptomatic high readings and symptom-associated emergency action and do not create a new universal blood-pressure routing rule.

Both source fetches returned HTTP 200 at their requested URLs, with original fetch receipts and content hashes retained. Selected normalized text preserves the official diagnosis page's **OR** threshold and complete adult/pediatric context. The symptoms excerpt keeps its own five-minute asymptomatic recheck and conditional emergency instruction together; it does not silently substitute another source's interval. [NHLBI diagnosis](https://www.nhlbi.nih.gov/health/high-blood-pressure/diagnosis), [NHLBI symptoms](https://www.nhlbi.nih.gov/health/high-blood-pressure/symptoms). The full HTML snapshots stay in the local source directory; the public source-only bundle contains selected licensed normalized content, provenance and individual rights metadata, not webpage media or a blanket Apache license claim.

Exactly 5,203 eligible embeddings were reused. The donor contains 5,224 cached rows across its history; that cache-import count must not be mislabeled as the number of active embeddings reused. One authorized `text-embedding-3-large` request embedded only the two exact new chunks: **494 tokens, estimated $0.00006422**, below the separate $0.10 cap. The receipt is an API-usage-derived estimate, not an invoice. No patient-generation, judge or query-embedding calls occurred during migration.

Three real-index lexical queries returned the new diagnosis source first and returned neither held document. They also returned unrelated lower-ranked material; these checks establish availability and exclusion, not retrieval relevance, clinical fidelity or routing lift. Startup verification binds the restored corpus identity and policy to index metadata and actual document/chunk counts; it is explicitly not a full stored-content/vector/graph integrity audit. The seven focused startup-identity tests are now registered in the standard test command.

The new immutable source-only export is `outputs/clinical-rag-v8-migration-2026-09-14/corpus/manifest.json`, verified through the existing bundle reader. Corpus hash: `af7e4a8c239c4b084525aba008d56ce833b3a08144cea6237319bf996aa30dbd`; quarantine policy hash: `3c4e5d59d578c9258aac9d8d39392da0fbe84282708e55d1dc9689fb461ce281`. The export directory retains preparation, original-integrity, embedding, SQL-census, index-metadata and lexical-retrieval receipts. The migration finished at 22:29:57 UTC with all new-store handles closed. Runtime-default promotion and subsequent live GUI verification belong to the parent task and were not performed by this migration.
