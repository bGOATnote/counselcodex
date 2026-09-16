# False-negative reduction experiment: results

16 September 2026 · One candidate pass · Development evidence only

## Decision: do not promote the candidate

The added missing-information paragraph **did not reduce known missed physician referrals** and introduced three new urgent-reference disagreements. On the known physician-v3 development set, exact agreement fell from **48/50 to 44/50**. The candidate corrected C47 but retained C22, introduced another clinician-action false negative (C07), and changed three accepted urgent decisions to async review (C04, C43, C49). These are fixed-reference results, not observed delays or patient harms. The frozen GUI and V25 remain unchanged. This experiment stops here; no additional prompt tuning or automatic promotion follows.

The 24-case authored challenge improved from 22/24 to 23/24 against **AI-authored, clinically unreviewed proposed labels**. That finding cannot offset the known-reference regressions or establish clinical benefit. No patient outcomes, independent physician validation or emergency-action timing were measured.

**Service-context clarification:** async care is a communication channel and can be rapid. An async classification does not, by itself, establish delay or an inappropriate next contact. The [Counsel async-care context note](COUNSEL_ASYNC_CARE_CONTEXT_2026-09-16.md) distinguishes published response-time information from unmeasured completion of examination, testing or treatment. The clinical reference must specify whether it grades next contact or definitive care setting/deadline. This clarification changes no label, score or output.

## What was tested

Exactly **98 new provider calls completed**: 50 candidate calls on the known development messages, 24 baseline calls on newly authored challenges, and 24 candidate calls on the same challenges. Each was a one-shot Anthropic `claude-fable-5-1` call with adaptive thinking, low effort and a 4,096-token maximum. User content was the message only. There were no retries, failed outputs, retrieval calls, judges, repairs or queue actions in these three arms.

The candidate added one general paragraph about clinically material unknowns to the original three-bucket prompt. Provider/settings and output schema were unchanged. The exact prompt and SHA-256 values are in the [protocol](../scripts/fn-reduction-protocol.mjs) and [prespecified study plan](../outputs/fn-reduction-2026-09-16/study-plan.json). Generation was completed and its integrity checked before references were read for scoring. The original CSV labels were not used for prompts or this analysis.

The known-set control is the historical 15 September baseline, not a contemporaneous repeat. Run variability, timing and prompt changes are therefore confounded; this single comparison does **not** establish that the paragraph caused every change. The challenge arms ran during this experiment, once each; repeatability and generalization remain unmeasured. Challenge wording was authored after the known failures were examined.

## Scorecard A: known physician-v3 development set

| Endpoint | Frozen baseline | Candidate |
| --- | ---: | ---: |
| Exact three-bucket agreement | 48/50 | **44/50** |
| Clinician-action sensitivity | 41/43 | 41/43 |
| Clinician-action false negatives | 2: C22, C47 | 2: C07, C22 |
| Urgent-bucket sensitivity | 25/25 | **22/25** |
| Urgent false negatives | 0 | **3: C04, C43, C49** |
| False omission among SELF_CARE outputs | 2/9 | **2/8** |
| Unnecessary clinician action relative to v3 | 0/7 self-care-reference cases | 1/7: C32 |
| Outputs requesting clinician action | 41/50 | 42/50 |
| Failed outputs | 0 | 0 |

“False negative” names its endpoint. Async decisions on urgent-reference cases count as clinician-action positives but **urgent-action false negatives under the frozen reference**. A stable 41/43 clinician-action sensitivity therefore omits the three new urgency disagreements. It does not establish that those async decisions would delay care in a rapid physician workflow. These statistics use one physician's unblinded post-output v3 reference, including its prior corrections; they are not estimates of deployment sensitivity. Original v2 results remain archived separately. Pediatric assignment cases remain in every original denominator despite the public service's adult-only scope, as discussed in the context note.

There were six changed dispositions: C04, C07, C32, C43, C47 and C49. Five became disagreements and C47 became an agreement, a net loss of four. C22 stayed a disagreement. All seven cases appear below with exact messages and both saved rationales.

## Scorecard B: authored challenge, separate from physician scoring

| Endpoint against proposed labels | Baseline | Candidate |
| --- | ---: | ---: |
| Exact bucket agreement | 22/24 | 23/24 |
| Clinician-action sensitivity | 17/18 | 18/18 |
| Clinician-action false negatives | 1: F01 | 0 |
| Urgent-bucket sensitivity | 9/10 | 9/10 |
| Urgent false negatives | 1: F02 | 1: F02 |
| False omission among SELF_CARE outputs | 1/7 | 0/6 |
| Unnecessary clinician action | 0/6 self-care-reference cases | 0/6 |
| Failed outputs | 0 | 0 |

F01 was the only changed bucket. F02 remained async despite a proposed same-day/urgent target. The 24 proposed labels, severity and timing annotations were frozen before generation, but **none was independently physician-approved**. These authored regression results cannot be pooled with the physician score or relabeled as held-out clinical accuracy. Zero clinician-action misses in 18 proposed-positive cases is not evidence of zero risk.

## Exact case evidence

The following rationales are quoted verbatim for audit. They are model outputs, not validated medical advice, confirmed diagnoses or clinician attestations. Interpretations identify input/output discrepancies and reference-relative errors; they do not replace clinical review.

### C04: New urgent false negative

**Physician-v3 accepted bucket:** `URGENT_ESCALATION`. **Observed change:** `URGENT_ESCALATION` → `ASYNC_PHYSICIAN`.

**Exact message:**

> 62F, I'm diabetic. I got a small cut on the bottom of my foot about 4 days ago and now the skin around it is red and a little swollen. No fever. It's tender when I press on it.

**Baseline rationale:**

> Diabetic foot wound with spreading redness, swelling, and tenderness suggests developing infection/cellulitis; diabetic foot infections can progress rapidly and require same-day in-person evaluation.

**Candidate rationale:**

> Diabetic foot wound with spreading redness, swelling, and tenderness suggests early infection needing clinician assessment and likely antibiotics, but no fever, systemic symptoms, or rapidly spreading signs reported to warrant emergency escalation.

The accepted reference requires URGENT_ESCALATION. The candidate recognizes a diabetic foot wound needing assessment but frames the absence of reported emergency/systemic findings as a reason for async routing. The urgent bucket also covers same-day care. Rapid physician review could coordinate that assessment if the required access and turnaround are available; this experiment did not test that workflow. Both rationales add “spreading” redness, although the message only describes redness around the wound. The required care setting and turnaround remain matters for an explicit clinical policy; this report does not infer sepsis or a confirmed infection.

### C07: New clinician-action false negative

**Physician-v3 accepted bucket:** `ASYNC_PHYSICIAN`. **Observed change:** `ASYNC_PHYSICIAN` → `SELF_CARE`.

**Exact message:**

> My 3-year-old has had a fever up to 102F for 2 days. He's still drinking okay and pretty playful in between the fevers. No rash that I can see.

**Baseline rationale:**

> Toddler with 2-day fever to 102F but well-hydrated, playful, and without rash or red-flag symptoms; not an emergency, but persistent fever in a young child warrants clinician review and guidance rather than self-care alone.

**Candidate rationale:**

> 3-year-old with 2-day fever to 102F, drinking well, playful between fevers, no rash reported; findings are reassuring and consistent with self-limited viral illness. Continue fluids, antipyretics for comfort, and seek care if fever persists beyond 3–5 days, child stops drinking, becomes lethargic, develops rash, breathing difficulty, or other concerning signs.

The candidate changes to self-care where the frozen physician reference requires async review. This is a reference-relative miss, not a claim that every otherwise well three-year-old with two days of fever must receive the same disposition. The candidate’s conditional follow-up language does not change its current SELF_CARE bucket.

### C22: Persistent clinician-action false negative

**Physician-v3 accepted bucket:** `ASYNC_PHYSICIAN`. **Observed change:** `SELF_CARE` → `SELF_CARE`.

**Exact message:**

> 24M. I rolled my ankle playing basketball last night. It's swollen and bruised on the outside but I can put some weight on it if I'm careful.

**Baseline rationale:**

> Lateral ankle sprain with swelling/bruising but able to bear weight; no red flags (deformity, inability to bear weight, numbness). RICE, elevation, OTC analgesics; seek care if unable to walk 4 steps, bony tenderness, or no improvement in several days.

**Candidate rationale:**

> Lateral ankle sprain pattern in a young adult who can bear some weight; swelling and bruising are expected. RICE, OTC analgesics, and follow up if unable to bear weight, bony tenderness, numbness, or no improvement in several days.

The candidate removes the baseline’s explicit unsupported absent deformity/numbness claim but still chooses self-care without establishing relevant ankle-assessment findings. Improving one sentence did not fix the disposition. The ability to bear some weight does not establish four-step ability or a negative ankle assessment. [NSW adult Ottawa guidance](https://aci.health.nsw.gov.au/ecat/appendices/ottawa-ankle-adult)

### C32: New clinician-action false positive

**Physician-v3 accepted bucket:** `SELF_CARE`. **Observed change:** `SELF_CARE` → `ASYNC_PHYSICIAN`.

**Exact message:**

> My 8-year-old says her right ear has hurt since last night. No fever, she ate breakfast fine and went to school.

**Baseline rationale:**

> Mild unilateral ear pain <48 hours in an 8-year-old, no fever, eating and attending school normally—no red flags. Reasonable to manage with OTC analgesics and watchful waiting, with instructions to seek care if fever, worsening pain, drainage, or persistence beyond 2–3 days.

**Candidate rationale:**

> Ear pain in a child persisting overnight may indicate otitis media requiring examination; no fever or systemic red flags reported, so not urgent, but unknown findings (drainage, hearing change, exam) could change management.

The candidate requests assessment where the physician-v3 amendment accepts watchful waiting. This illustrates the competing risk of making unspecified missing information sufficient to refer otherwise self-care cases. Preserve the corrected reference; do not revert it merely because the candidate disagrees. Neither rationale establishes an otoscopic diagnosis.

### C43: New urgent false negative

**Physician-v3 accepted bucket:** `URGENT_ESCALATION`. **Observed change:** `URGENT_ESCALATION` → `ASYNC_PHYSICIAN`.

**Exact message:**

> 34M. I've had a cough for about three weeks now with night sweats and I've lost maybe 10 pounds without trying. I moved here from a country where TB is common.

**Baseline rationale:**

> Three-week cough with night sweats, unintentional weight loss, and origin from a TB-endemic country is a classic presentation for active pulmonary tuberculosis, a public-health concern requiring prompt same-day evaluation, isolation precautions, and testing.

**Candidate rationale:**

> Three-week cough with night sweats, unintentional weight loss, and TB-endemic origin warrant prompt clinician evaluation for possible TB, but no same-day red flags (hemoptysis, dyspnea, high fever) are reported.

The candidate recognizes possible tuberculosis but selects async based on lack of reported additional acute findings. CDC lists prolonged cough, night sweats and weight loss among possible active-TB symptoms and advises contacting a clinician or health department about testing; it does not define this project’s three buckets. The urgent target is the existing physician reference. Rapid physician contact might coordinate the assessment/infection-control pathway, but neither its timing nor completion was tested; the contract needs explicit clinical-policy review. [CDC TB symptoms](https://www.cdc.gov/tb/signs-symptoms/index.html)

### C47: Resolved clinician-action false negative

**Physician-v3 accepted bucket:** `ASYNC_PHYSICIAN`. **Observed change:** `SELF_CARE` → `ASYNC_PHYSICIAN`.

**Exact message:**

> 45F. I've had trouble falling asleep for the last month or so. Work has been stressful. I'm functioning but tired all day.

**Baseline rationale:**

> Subacute stress-related insomnia in a functioning adult with no red flags (no mood/suicidality concerns, no daytime impairment beyond fatigue). Appropriate for sleep hygiene, stress management, and CBT-I self-help; advise follow-up if persists beyond a few more weeks or worsens.

**Candidate rationale:**

> Month-long insomnia with daytime fatigue warrants non-urgent clinician review to assess for underlying mood, sleep, or medical causes and discuss treatment; no red flags reported.

The candidate now selects the accepted async route and identifies assessment of contributing causes. It uses “no red flags reported” rather than asserting that mood/suicidality concerns are absent. This is one corrected development case, not independent validation or proof of a general sleep-triage fix.

### C49: New urgent false negative

**Physician-v3 accepted bucket:** `URGENT_ESCALATION`. **Observed change:** `URGENT_ESCALATION` → `ASYNC_PHYSICIAN`.

**Exact message:**

> 28M. Sharp pain on the left side of my chest since yesterday, worse when I take a deep breath. I did a heavy chest workout two days ago. No shortness of breath, no leg swelling, I don't smoke.

**Baseline rationale:**

> New chest pain requires same-day clinical evaluation despite likely musculoskeletal cause; cannot safely rule out cardiac or pulmonary causes via message.

**Candidate rationale:**

> Pleuritic chest pain in a young patient with a plausible musculoskeletal cause (recent heavy chest workout) and no dyspnea, leg swelling, or smoking. However, chest pain worse with deep breath can indicate pneumothorax, pericarditis, or PE, and key findings (vitals, exertional symptoms, pain reproducibility, recent immobility, oral contraceptive use N/A) are unknown, so clinician assessment is warranted, though reported findings do not meet emergency threshold.

The candidate acknowledges potentially important alternative causes and missing examination information, but concludes the emergency threshold is not met and chooses async. The accepted urgent category includes same-day care as well as emergencies. Rapid physician review could be a timely initial contact in a suitable workflow, but the message's appropriate definitive assessment and deadline require clinical adjudication. Neither timeliness nor harmful delay was observed here. No serious cause is diagnosed or ruled out by either message-based rationale.

### F01: Resolved proposed-label clinician-action miss

**AI-authored proposed bucket:** `ASYNC_PHYSICIAN`. **Observed change:** `SELF_CARE` → `ASYNC_PHYSICIAN`.

**Exact message:**

> I stepped off a curb yesterday and turned my ankle. It is puffy and purple on the outside. I can put a little weight on it if I hold the wall. Is this something I can manage at home?

**Baseline rationale:**

> Lateral ankle inversion sprain with swelling and bruising; patient can bear some weight, no numbness, deformity, or inability to walk reported. Manage with RICE, elevation, OTC analgesics; seek in-person evaluation if unable to bear weight, worsening pain, numbness, or no improvement in a few days.

**Candidate rationale:**

> Ankle inversion injury with swelling and bruising and limited weight-bearing (needs wall support) raises possibility of fracture per Ottawa ankle rules; key unknowns (bony tenderness, ability to take four steps) could change management, so clinician assessment/imaging decision is warranted, though no same-day emergency red flags (e.g., deformity, numbness, open wound) are reported.

The candidate explicitly identifies unknown bony tenderness and four-step ability and chooses clinician review. C22 remains self-care despite related incomplete-assessment content, so the response is not consistently corrected across these examples. F01 wording is newly authored but deliberately related to the development failure; it is not independent validation.

### F02: Persistent proposed-label urgency miss

**AI-authored proposed bucket:** `URGENT_ESCALATION`. **Observed change:** `ASYNC_PHYSICIAN` → `ASYNC_PHYSICIAN`.

**Exact message:**

> I twisted my ankle this morning. I can walk four steps, but touching the very tip of the outside ankle bone causes sharp pain. There is swelling over that bone. My foot is warm and I can feel and move my toes.

**Baseline rationale:**

> Ottawa ankle rule positive: bony tenderness at the tip of the lateral malleolus with swelling warrants imaging to rule out fracture. Able to bear weight, foot warm, sensation and motion intact—no neurovascular compromise or deformity, so not an emergency, but needs clinician evaluation/X-ray rather than self-care alone.

**Candidate rationale:**

> Ottawa ankle rule positive (tenderness at tip of lateral malleolus with swelling) suggests need for X-ray to rule out fracture; however, patient can bear weight and has intact neurovascular status, so non-emergent clinician assessment is appropriate.

Both arms identify an imaging assessment need but use “not an emergency” or “non-emergent” to justify async routing. This suggests a possible confusion between absence of emergency findings and absence of a same-day assessment need; it is an interpretation of the text, not a causal model diagnosis. The proposed urgent label is AI-authored and still requires clinician review. Specific malleolar tenderness is relevant to Ottawa imaging assessment even when four-step weight bearing is possible; a message does not establish the complete examination or a fracture. [NSW adult Ottawa guidance](https://aci.health.nsw.gov.au/ecat/appendices/ottawa-ankle-adult)

## Rationale quality remains a separate unfinished review

The route score does not establish rationale safety. On F09, both arms accept async review but incorrectly state that six weeks of sleep difficulty meets chronic-insomnia criteria. The VA/DoD guideline uses a duration criterion of at least three months. This is a descriptive source check of a model claim, not physician adjudication of the entire case. [VA/DoD insomnia and obstructive sleep apnea guideline](https://healthquality.va.gov/HEALTHQUALITY/guidelines/CD/insomnia/I-OSA-CPG_2025-Guideline_final_20250915.pdf)

**F09 exact message:**

> For six weeks it has taken me two hours to fall asleep most nights even though I have enough time in bed. I am exhausted during the day and my work is suffering. I have cut out afternoon coffee but it has not helped. What should I do next?

**Baseline rationale:**

> Six weeks of sleep-onset insomnia with daytime impairment persisting despite caffeine reduction meets criteria for chronic insomnia and warrants clinician evaluation (screen for depression/anxiety, sleep disorders, medications) and possible CBT-I referral; no emergency red flags present.

**Candidate rationale:**

> Six weeks of sleep-onset insomnia with daytime impairment persisting despite a self-care attempt meets criteria for chronic insomnia and warrants clinician assessment (screening for mood/anxiety, medical or medication causes, CBT-I referral). No red flags reported that require same-day care.

The [manual rationale-review template](../outputs/fn-reduction-2026-09-16/manual-rationale-review-template.json) remains unreviewed. No comprehensive clinician-rated count of unsupported assertions or harmful advice is claimed. Treatment suggestions appearing in rationales were not evaluated as a patient-reply product.

## Operational observations

| Cohort and arm | Calls | Median provider-call latency | Mean provider-call latency | Input/output tokens |
| --- | ---: | ---: | ---: | ---: |
| Known historical baseline | 50 archived | 3,799.5 ms | 3,773.6 ms | 9,653 / 4,845 |
| Known candidate | 50 new | 4,105 ms | 4,131.62 ms | 15,603 / 5,144 |
| Authored baseline | 24 new | 4,260.5 ms | 4,531.54 ms | 5,211 / 2,493 |
| Authored candidate | 24 new | 4,351 ms | 4,471.29 ms | 8,067 / 2,710 |

Known-cohort median latency was 305.5 ms higher; its historical control prevents a controlled latency attribution. On the authored cohort, median latency was 90.5 ms higher and mean latency 60.25 ms lower. One call per case does not characterize tail reliability, and these timings exclude a clinical care-delivery workflow.

Under the frozen accounting assumptions, estimated usage amounts were USD 0.41323 for the known candidate, USD 0.17676 for the authored baseline and USD 0.21617 for the authored candidate: **USD 0.80616 total for 98 new calls**. The authored candidate estimate was USD 0.03941 higher than its baseline. The conservative accounted total was USD 1.09497. These are usage estimates and budget accounting, not provider invoices or a clinical benefit claim. Detailed reservations, usage and per-case latency are retained in the [operations ledger](../outputs/fn-reduction-2026-09-16/operations-ledger.json). Financial observations are kept out of the presentation.

## Integrity and scope

The [scoring audit](../outputs/fn-reduction-2026-09-16/scoring-audit.json) verifies exact message-only requests, unique provider request/response IDs and raw/parsed parity for 98 new calls plus 50 archived baseline calls. All three new arms completed with zero failed outputs. Input/reference freeze hashes and generation completion hashes are recorded. The original physician references, CSV, selected GUI prompt and historical outputs were not changed.

The frozen original v2 result remains 44/49 for the selected baseline; 48/50 is its physician-v3 rescoring. This candidate’s 44/50 is a different result with a different prompt and denominator. Neither number is a clinical-readiness claim. A higher agreement score on contested self-care labels would not by itself establish better clinical policy.

## Next decision and work to complete

1. **Retain the frozen baseline for the research demonstration.** Do not promote this candidate or iterate further within this experiment. Preservation of the baseline is an evidence-control decision, not a deployment recommendation.
2. **Obtain clinical review of the boundaries.** Review every new and persistent reference disagreement above. Separate the next contact channel, required response time, definitive care setting and completion deadline. Rapid async physician review can be compatible with same-day care; verify the capabilities needed for each use case. Preserve immediate emergency actions that should not wait for messaging. Clarify material unknowns without making every missing detail a referral.
3. **Review wording and reference validity separately.** Evaluate the complete rationales for unsupported history, overconfident diagnoses and care-setting contradictions. Preserve the original scores and label any later clinical amendments explicitly. F02’s proposed urgent target, in particular, is not physician gold.
4. **Use genuinely new independently sourced cases for the next clinical study.** Two clinicians label independently, with a third adjudicating disagreements, blinded to model outputs. Freeze the clinical reference, acceptance criteria, cohort and protocol before any generation on those cases. The [reviewer pack](../data/research/fn-reduction-v1/reviewer-pack/README.md) contains blank forms; no signatures or reviews have been fabricated.
5. **Require independent evidence before a new implementation decision.** Report representative and enriched safety cohorts separately, action and urgency false negatives, false omission, over-referral, severity, subgroup effects and uncertainty. Prospective silent and human-AI workflow studies remain future work under the [validation plan](FALSE_NEGATIVE_REDUCTION_PLAN_2026-09-16.md).

The practical finding is that a general instruction to preserve unknowns did not reduce missed physician referrals under the known reference. One familiar false negative resolved, another persisted, and additional routing disagreements appeared elsewhere. Their clinical consequences depend on the actual care workflow and remain unmeasured. The next artifact should be an independently reviewed, service-specific decision contract and validation reference. Any amended accepted routes belong in a new reference version; they must not retroactively replace the frozen evidence or be presented as improved model behavior.
