# Conditional disposition stratification: Fable 5.1 low

Study date: September 15, 2026. Generation freeze recorded in UTC: 2026-09-16T02:42:11.382Z.

## Result

The frozen three-bucket decisions remain **48/50 (96.0%)** by construction. Adding a conditional subtype call produces **38/49 (77.6%)** end-to-end five-way agreement. Among correct-parent cases with an existing finer reference, subtype agreement is **31/40 (77.5%)**.

The end-to-end maximum imposed by the frozen parent predictions is 47/49. C22 and C47 are frozen SELF_CARE parent errors, and this experiment cannot reconsider that branch. The unchanged parent score preserves existing outputs; it is not a repeat demonstration of model reliability.

| Measurement | Agreement | Denominator |
|---|---:|---|
| Frozen parent, physician-v3 | 48/50 | All 50 messages |
| End-to-end five-way, v3-adjusted finer reference | 38/49 | All finer-eligible messages, retaining parent and subtype errors |
| Conditional subtype | 31/40 | Correct ASYNC/URGENT parent and finer reference available |
| Async subtype | 11/16 | Correct async parent |
| Urgent subtype | 20/24 | Correct urgent parent, excluding C25 |

41/41 new subtype calls returned valid decisions. 9 SELF_CARE records passed through without a call. No retry, fallback, judge, retrieval, parent correction or new reference label was introduced. Failures remain in the applicable denominators.

## Prompt and reference provenance

The first-stage Fable 5.1 low prompt and predictions are unchanged. The second stage receives only the original patient message as user content. The fixed parent selects a two-option system prompt; the model returns a numeric choice and short rationale. Parent rationale, case ID, physician reference and CSV labels are absent from the provider request.

The finer score carries forward physician-system-reference-v2 acceptedRoutes. Physician-v3 changed C32, C34 and C38 to SELF_CARE, so those single-route corrections supersede their former async references. C25 has an accepted urgent parent, but no adjudicated emergency-versus-same-day subtype; its subtype is reported and excluded from both finer denominators. Physician-v3 is a post-output physician reassessment, not independent blinded validation.

A separate sensitivity score applies the unchanged original v2 finer reference to these same outputs: **35/49 (71.4%)**. Historical five-way Opus was 35/49 on that original v2 reference. This is a reference-consistent descriptive comparison of different protocols and single runs, not evidence of clinical superiority. The primary v3-adjusted 38/49 numerator must not be directly contrasted with original-v2 Opus 35/49 as if their references were identical.

## Interpretation of the subtype disagreements

- Four refill cases—C06, C18, C24 and C46—follow the explicit subtype prompt by choosing PRIORITY_ASYNC, while the carried-forward physician reference accepts STANDARD_ASYNC. These are prompt/reference policy disagreements and remain counted as misses; the score is not adjusted to remove them.
- C13 chooses STANDARD_ASYNC where the reference accepts PRIORITY_ASYNC.
- C12, C16, C28 and C44 choose SAME_DAY_IN_PERSON where the reference accepts EMERGENCY_NOW. The preserved urgent parent conceals these finer timing disagreements when results are viewed only at three-bucket resolution.
- C22 and C47 remain first-stage undertriage relative to the physician reference. They receive no subtype call and are retained in the end-to-end score.
- Several rationales cite the absence of reported features when selecting a lower urgency. Unreported findings are not verified negative findings. The saved rationale is model output, not a clinician attestation or a completed assessment.

No clinical-reference revisions or prompt iterations were performed after inspecting this run. The result supports retaining the existing three-bucket demonstration while treating the finer labels as an evaluated research extension. Route agreement alone does not validate advice quality; C38 pregnancy precautions remain a separate concern from its self-care route.

## Exact misses

| Case | Error stage | Frozen parent | Final route | Accepted finer route | Direction relative to reference |
|---|---|---|---|---|---|
| C06 | subtype | ASYNC_PHYSICIAN | PRIORITY_ASYNC | STANDARD_ASYNC | more urgent than accepted |
| C12 | subtype | URGENT_ESCALATION | SAME_DAY_IN_PERSON | EMERGENCY_NOW | less urgent than accepted |
| C13 | subtype | ASYNC_PHYSICIAN | STANDARD_ASYNC | PRIORITY_ASYNC | less urgent than accepted |
| C16 | subtype | URGENT_ESCALATION | SAME_DAY_IN_PERSON | EMERGENCY_NOW | less urgent than accepted |
| C18 | subtype | ASYNC_PHYSICIAN | PRIORITY_ASYNC | STANDARD_ASYNC | more urgent than accepted |
| C22 | parent | SELF_CARE | SELF_CARE | STANDARD_ASYNC | less urgent than accepted |
| C24 | subtype | ASYNC_PHYSICIAN | PRIORITY_ASYNC | STANDARD_ASYNC | more urgent than accepted |
| C28 | subtype | URGENT_ESCALATION | SAME_DAY_IN_PERSON | EMERGENCY_NOW | less urgent than accepted |
| C44 | subtype | URGENT_ESCALATION | SAME_DAY_IN_PERSON | EMERGENCY_NOW | less urgent than accepted |
| C46 | subtype | ASYNC_PHYSICIAN | PRIORITY_ASYNC | STANDARD_ASYNC | more urgent than accepted |
| C47 | parent | SELF_CARE | SELF_CARE | STANDARD_ASYNC | less urgent than accepted |

### C06: subtype disagreement

**Patient message:** Could I get a refill on my losartan? I've been on 50mg once a day for about 2 years, my blood pressure is well controlled, last home reading was 122/78.

**Frozen parent rationale:** Routine refill request for long-term losartan with well-controlled blood pressure and no red-flag symptoms; appropriate for asynchronous physician review and prescription renewal.

**Subtype rationale:** Refill request for a chronic antihypertensive is a defined, time-sensitive prescribing task; interruption in losartan risks BP rebound, so it warrants prompt review even though the patient is stable.

**Reference:** STANDARD_ASYNC. **Final route:** PRIORITY_ASYNC.

### C12: subtype disagreement

**Patient message:** 68F with COPD. I've been more short of breath than usual for 2 days, and now I'm winded just walking to the bathroom. My phlegm has turned green.

**Frozen parent rationale:** 68-year-old with COPD showing signs of acute exacerbation: worsening dyspnea over 2 days now limiting minimal exertion (bathroom), plus purulent green sputum suggesting infection. Progressive breathlessness at minimal activity is a same-day red flag requiring prompt evaluation.

**Subtype rationale:** Likely COPD exacerbation with infective sputum change and progressive exertional dyspnea over 2 days; no red flags (rest dyspnea, inability to speak, confusion, cyanosis, chest pain) described. Needs same-day assessment and treatment, with clear advice to escalate to emergency care if breathing worsens at rest.

**Reference:** EMERGENCY_NOW. **Final route:** SAME_DAY_IN_PERSON.

### C13: subtype disagreement

**Patient message:** 55M. My right hand has been numb and tingly for a few days, worse at night. No weakness anywhere, no face drooping, my speech is normal.

**Frozen parent rationale:** Several days of unilateral hand numbness/tingling worse at night suggests a likely benign cause such as carpal tunnel syndrome, and the patient denies stroke red flags (no weakness, facial droop, or speech change). Not an emergency, but persistent neurological symptoms warrant physician evaluation rather than self-care alone.

**Subtype rationale:** Several days of nocturnal hand numbness/tingling without weakness, facial droop, or speech change suggests a benign peripheral cause (e.g., carpal tunnel), not stroke; no urgent clinician task.

**Reference:** PRIORITY_ASYNC. **Final route:** STANDARD_ASYNC.

### C16: subtype disagreement

**Patient message:** My 6-month-old has a fever of 100.9, she's fussy, she's had fewer wet diapers today than normal, and she doesn't seem interested in feeding.

**Frozen parent rationale:** 6-month-old with fever, decreased wet diapers (possible dehydration), and poor feeding warrants same-day clinical evaluation.

**Subtype rationale:** A 6-month-old with low-grade fever (100.9°F), fussiness, decreased feeding, and fewer wet diapers needs same-day pediatric evaluation for possible infection and early dehydration. No red flags for immediate emergency (e.g., lethargy/unresponsiveness, breathing difficulty, no wet diapers for 8+ hours, seizure, non-blanching rash, or age under 3 months) are described.

**Reference:** EMERGENCY_NOW. **Final route:** SAME_DAY_IN_PERSON.

### C18: subtype disagreement

**Patient message:** Can I refill my albuterol inhaler? I use it maybe once a week, no bad attacks recently.

**Frozen parent rationale:** Routine albuterol refill request with stable, infrequent use and no recent exacerbations; no red flags requiring same-day escalation.

**Subtype rationale:** Albuterol refill request is a medication refill/prescribing task, which the framework classifies as time-sensitive; patient reports stable, infrequent use with no recent exacerbations, but rescue inhaler access should not lapse.

**Reference:** STANDARD_ASYNC. **Final route:** PRIORITY_ASYNC.

### C22: parent disagreement

**Patient message:** 24M. I rolled my ankle playing basketball last night. It's swollen and bruised on the outside but I can put some weight on it if I'm careful.

**Frozen parent rationale:** Lateral ankle sprain with swelling/bruising but able to bear weight; no red flags (deformity, inability to bear weight, numbness). RICE, elevation, OTC analgesics; seek care if unable to walk 4 steps, bony tenderness, or no improvement in several days.

**Subtype rationale:** No subtype call: frozen SELF_CARE passed through.

**Reference:** STANDARD_ASYNC. **Final route:** SELF_CARE.

### C24: subtype disagreement

**Patient message:** 33F. Could I get a refill on my birth control? I've been on the same one for three years with no problems.

**Frozen parent rationale:** Routine medication refill request for long-standing, well-tolerated contraceptive with no red flags; requires prescriber review but not urgent.

**Subtype rationale:** Medication refill request for ongoing contraception is a time-sensitive prescribing task; a gap in supply risks unintended pregnancy, so prompt review is warranted even though the patient is stable.

**Reference:** STANDARD_ASYNC. **Final route:** PRIORITY_ASYNC.

### C28: subtype disagreement

**Patient message:** 29F, about 8 weeks pregnant. I started bleeding this morning, more than spotting, with cramping in my lower belly.

**Frozen parent rationale:** Bleeding heavier than spotting with cramping at 8 weeks pregnancy is a red flag for miscarriage or ectopic pregnancy and requires same-day evaluation.

**Subtype rationale:** Vaginal bleeding with cramping at 8 weeks may indicate threatened or inevitable miscarriage or ectopic pregnancy and warrants same-day in-person evaluation (exam, ultrasound, hCG, Rh status). However, the message does not describe red-flag features—heavy bleeding soaking pads hourly, severe or one-sided pain, dizziness/fainting, or signs of shock—that would require immediate emergency action.

**Reference:** EMERGENCY_NOW. **Final route:** SAME_DAY_IN_PERSON.

### C44: subtype disagreement

**Patient message:** 68M. Both my ankles have been swelling for a couple weeks and it's gotten worse. The last two nights I've had to sit up to breathe because lying flat makes me short of breath.

**Frozen parent rationale:** 68M with progressive bilateral ankle edema plus new orthopnea over 2 nights suggests decompensated heart failure; requires same-day evaluation.

**Subtype rationale:** Bilateral ankle edema with new orthopnea over two weeks suggests decompensating heart failure needing same-day evaluation, but no acute distress, chest pain, syncope, or resting dyspnea is described, so immediate emergency action is not indicated by the message.

**Reference:** EMERGENCY_NOW. **Final route:** SAME_DAY_IN_PERSON.

### C46: subtype disagreement

**Patient message:** 30M. Requesting a refill of my finasteride, 1mg daily. No side effects, been on it about a year.

**Frozen parent rationale:** Routine refill request for finasteride 1mg with no side effects or red flags; requires prescriber review but not urgent.

**Subtype rationale:** Medication refill request is a time-sensitive prescribing task per the criteria, even though finasteride for hair loss is low-risk and stable.

**Reference:** STANDARD_ASYNC. **Final route:** PRIORITY_ASYNC.

### C47: parent disagreement

**Patient message:** 45F. I've had trouble falling asleep for the last month or so. Work has been stressful. I'm functioning but tired all day.

**Frozen parent rationale:** Subacute stress-related insomnia in a functioning adult with no red flags (no mood/suicidality concerns, no daytime impairment beyond fatigue). Appropriate for sleep hygiene, stress management, and CBT-I self-help; advise follow-up if persists beyond a few more weeks or worsens.

**Subtype rationale:** No subtype call: frozen SELF_CARE passed through.

**Reference:** STANDARD_ASYNC. **Final route:** SELF_CARE.

## C25: parent accepted, finer urgency unscored

**Patient message:** 42F. I flew back from Europe two days ago and now my left calf is painful, swollen, and warm compared to the other one.

**Model subtype:** SAME_DAY_IN_PERSON.

**Subtype rationale:** Unilateral calf pain, swelling, and warmth after a long-haul flight strongly suggests DVT, which requires same-day evaluation (ultrasound, anticoagulation). No chest pain, dyspnea, syncope, or hemoptysis reported, so pulmonary embolism/emergency action is not indicated by the message; advise seeking emergency care immediately if such symptoms develop.

The user's physician reassessment established URGENT_ESCALATION only. The model's finer choice is not assigned a correct/incorrect score.

## Latency and accounting

The new subtype calls had a median latency of 4.112 seconds and p95 of 6.039 seconds. Adding each saved parent latency to its subtype latency gives an estimated sequential median of 7.708 seconds and p95 of 9.709 seconds. These sums combine separate runs and are not measured live end-to-end latency.

The new subtype run's token estimate is USD 0.298400; conservative accounting is USD 0.390150. These values cover only this extension and are not provider invoices. Financial figures are not presentation content.

## Reproduction and evidence

```sh
node scripts/score-stripped-stratification.mjs
node --test tests/stripped-stratification-score.test.mjs
```

The offline scorer verifies both generation freezes, all request bodies, raw-to-parsed consistency, original parent identity, 135 subtype artifacts and 150 original parent artifacts before loading physician references. It never opens the assignment CSV. Re-running it verifies existing derived artifacts and performs no provider calls.

- [Primary physician scorecard](scorecard-physician.json)
- [Original-v2 sensitivity score](scorecard-original-v2.json)
- [Summary and timing](summary.json)
- [Scoring audit](scoring-audit.json)
- [All case records](all-case-scorecard.csv)
- [Exact misses](misses.csv)

Async subtype prompt SHA256: `e507edeb8b25a28b241ab4ad04f9ce45bc1659f64e9db71c0cad95811b0bed3f`.

Urgent subtype prompt SHA256: `80a75a1394038f409ea98bf633f22de15e8df84685cca7656faafe73b9b69fae`.

Generation-complete SHA256: `e3ca7385b3028254d7b787eae47791918a2a0889ae205c023060d3883d206773`.
