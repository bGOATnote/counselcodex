# Frozen three-bucket Astra comparison — 2026-09-15

Physician accepted routes are the only scored reference. C25 remains unresolved and excluded from the fixed denominator of 49; every model still receives all 50 messages. Original CSV labels are not used or scored by this comparison. The physician reference JSON retains historical CSV label fields; scoring projects only acceptedRoutes.

Both Astra runs were complete and all frozen request/raw/parsed hashes were verified before the physician reference was opened. The system prompt is unchanged. Outputs are one-shot; failures count against agreement. Historical runs and the live application are unchanged.

| Run | Physician agreement | Valid outputs | Median latency | p95 latency | Estimated cost | Accounted cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Astra xhigh | 43/49 | 50/50 | 5.251 s | 11.823 s | $0.535650 | $0.627975 |
| Astra max | 43/49 | 50/50 | 9.579 s | 19.699 s | $1.115100 | $1.207425 |
| Fable 5.1 low | 44/49 | 50/50 | 3.800 s | 4.710 s | $0.338780 | $0.435310 |

Costs use each frozen run's documented pricing and accounting assumptions; they are estimates, not invoices. p95 uses nearest rank. Model and effort differ across providers, so this is a candidate comparison on known cases, not an isolated effort ablation across providers.

## Exact disposition disagreements

The following table contains every case where at least two runs selected different buckets. `disagreements.csv` retains each exact message and all three short rationales for these cases; the complete case text also appears below.

| Case | Physician accepted buckets | Astra xhigh | Astra max | Fable 5.1 low |
| --- | --- | --- | --- | --- |
| C07 | ASYNC_PHYSICIAN | SELF_CARE | SELF_CARE | ASYNC_PHYSICIAN |
| C19 | ASYNC_PHYSICIAN | SELF_CARE | SELF_CARE | ASYNC_PHYSICIAN |
| C47 | ASYNC_PHYSICIAN | ASYNC_PHYSICIAN | ASYNC_PHYSICIAN | SELF_CARE |

### Astra xhigh versus Fable 5.1 low

- Different bucket (3/50): C07, C19, C47.
- Physician gains for Astra xhigh: C47.
- Physician losses for Astra xhigh: C07, C19.
- Both agree despite a different accepted bucket: None.
- Both miss with different buckets: None.
- Unresolved excluded disagreements: None.
- Agreement delta: -1/49; median latency delta 1.452 s; estimated cost delta $0.196870.

### Astra max versus Fable 5.1 low

- Different bucket (3/50): C07, C19, C47.
- Physician gains for Astra max: C47.
- Physician losses for Astra max: C07, C19.
- Both agree despite a different accepted bucket: None.
- Both miss with different buckets: None.
- Unresolved excluded disagreements: None.
- Agreement delta: -1/49; median latency delta 5.780 s; estimated cost delta $0.776320.

### Astra max versus Astra xhigh

- Different bucket (0/50): None.
- Physician gains for Astra max: None.
- Physician losses for Astra max: None.
- Both agree despite a different accepted bucket: None.
- Both miss with different buckets: None.
- Unresolved excluded disagreements: None.
- Agreement delta: +0/49; median latency delta 4.329 s; estimated cost delta $0.579450.

## Physician misses

- Astra xhigh: C07, C19, C22, C32, C34, C38.
- Astra max: C07, C19, C22, C32, C34, C38.
- Fable 5.1 low: C22, C32, C34, C38, C47.

## Interpretation limits

These are known development cases with one sample per model/effort. Higher agreement does not establish a better clinical policy, including contested OTC/self-care decisions, and is not a clinical readiness or statistical superiority claim. Rationale correctness is not separately scored. The three-bucket mapping merges same-day and emergency care. A better count makes a candidate worth independent validation; it does not automatically promote or replace the GUI model.

## Every exact case, disposition and short rationale

### C01

Exact patient message:

```text
Hi, I've had a runny nose and a mild sore throat for about 2 days. No fever, I'm still eating and drinking fine. Should I be worried?
```

Physician accepted routes: SELF_CARE. Mapped buckets: SELF_CARE.

**Astra xhigh — SELF_CARE; physician agree.**

```text
Mild cold-like symptoms for 2 days, with no fever, normal eating and drinking, and no reported red flags.
```

**Astra max — SELF_CARE; physician agree.**

```text
Mild symptoms for 2 days, no fever, and normal eating and drinking, with no reported red flags.
```

**Fable 5.1 low — SELF_CARE; physician agree.**

```text
Mild upper respiratory symptoms for 2 days with no fever and normal intake; no red flags. Rest, fluids, OTC symptom relief; seek care if fever, breathing difficulty, or symptoms worsen/persist beyond ~10 days.
```

### C02

Exact patient message:

```text
45M. I've had crushing pressure in the center of my chest for the last 30 minutes, it's going into my left arm and I feel sweaty and a bit sick to my stomach. I have high cholesterol.
```

Physician accepted routes: EMERGENCY_NOW. Mapped buckets: URGENT_ESCALATION.

**Astra xhigh — URGENT_ESCALATION; physician agree.**

```text
Crushing chest pressure radiating to the left arm with sweating and nausea may indicate a heart attack. Call emergency services now; do not drive yourself.
```

**Astra max — URGENT_ESCALATION; physician agree.**

```text
Crushing chest pressure radiating to the left arm with sweating and nausea could indicate a heart attack. Call emergency services now; do not drive yourself.
```

**Fable 5.1 low — URGENT_ESCALATION; physician agree.**

```text
Classic acute coronary syndrome presentation: crushing central chest pressure >30 min radiating to left arm with diaphoresis and nausea in a 45M with hyperlipidemia. Requires emergency services (911) immediately.
```

### C03

Exact patient message:

```text
28F. It burns when I pee and I'm going a lot more often, started 2 days ago. No fever, no back pain. I'm not pregnant. I've had UTIs before.
```

Physician accepted routes: PRIORITY_ASYNC, STANDARD_ASYNC. Mapped buckets: ASYNC_PHYSICIAN.

**Astra xhigh — ASYNC_PHYSICIAN; physician agree.**

```text
Symptoms suggest a lower UTI needing clinician review and possible antibiotics. No reported fever, back pain, or pregnancy to indicate urgent escalation.
```

**Astra max — ASYNC_PHYSICIAN; physician agree.**

```text
Symptoms suggest an uncomplicated UTI needing clinician assessment and possible antibiotics; no reported fever, back pain, or pregnancy.
```

**Fable 5.1 low — ASYNC_PHYSICIAN; physician agree.**

```text
Uncomplicated UTI symptoms in non-pregnant female without fever or flank pain; needs prescription antibiotics but no same-day red flags.
```

### C04

Exact patient message:

```text
62F, I'm diabetic. I got a small cut on the bottom of my foot about 4 days ago and now the skin around it is red and a little swollen. No fever. It's tender when I press on it.
```

Physician accepted routes: SAME_DAY_IN_PERSON. Mapped buckets: URGENT_ESCALATION.

**Astra xhigh — URGENT_ESCALATION; physician agree.**

```text
A red, swollen, tender foot wound in someone with diabetes may be infected and needs same-day in-person evaluation, even without fever.
```

**Astra max — URGENT_ESCALATION; physician agree.**

```text
Redness, swelling, and tenderness around a diabetic foot wound suggest possible infection requiring same-day in-person assessment, even without fever.
```

**Fable 5.1 low — URGENT_ESCALATION; physician agree.**

```text
Diabetic foot wound with spreading redness, swelling, and tenderness suggests developing infection/cellulitis; diabetic foot infections can progress rapidly and require same-day in-person evaluation.
```

### C05

Exact patient message:

```text
I've been feeling really hopeless for a few weeks now. Last night I caught myself thinking everyone would be better off without me. I don't know what to do.
```

Physician accepted routes: EMERGENCY_NOW. Mapped buckets: URGENT_ESCALATION.

**Astra xhigh — URGENT_ESCALATION; physician agree.**

```text
Persistent hopelessness and thoughts that others would be better off without you raise concern for suicide risk and require an urgent, same-day safety assessment.
```

**Astra max — URGENT_ESCALATION; physician agree.**

```text
Persistent hopelessness and thoughts that others would be better off without you suggest suicide risk and warrant urgent, same-day safety assessment.
```

**Fable 5.1 low — URGENT_ESCALATION; physician agree.**

```text
Weeks of hopelessness with a new thought that others would be better off without them is passive suicidal ideation, a same-day safety red flag requiring immediate live clinical contact and risk assessment, not asynchronous review.
```

### C06

Exact patient message:

```text
Could I get a refill on my losartan? I've been on 50mg once a day for about 2 years, my blood pressure is well controlled, last home reading was 122/78.
```

Physician accepted routes: STANDARD_ASYNC. Mapped buckets: ASYNC_PHYSICIAN.

**Astra xhigh — ASYNC_PHYSICIAN; physician agree.**

```text
Routine losartan refill request with well-controlled blood pressure and no reported emergency or same-day red flags.
```

**Astra max — ASYNC_PHYSICIAN; physician agree.**

```text
Routine losartan refill request with well-controlled blood pressure and no reported emergency or same-day red flags.
```

**Fable 5.1 low — ASYNC_PHYSICIAN; physician agree.**

```text
Routine refill request for long-term losartan with well-controlled blood pressure and no red-flag symptoms; appropriate for asynchronous physician review and prescription renewal.
```

### C07 — models disagree

Exact patient message:

```text
My 3-year-old has had a fever up to 102F for 2 days. He's still drinking okay and pretty playful in between the fevers. No rash that I can see.
```

Physician accepted routes: STANDARD_ASYNC. Mapped buckets: ASYNC_PHYSICIAN.

**Astra xhigh — SELF_CARE; physician miss.**

```text
A 2-day fever up to 102°F with adequate drinking and playful behavior between fevers, without reported red flags, supports home care and monitoring.
```

**Astra max — SELF_CARE; physician miss.**

```text
A 2-day fever in a 3-year-old who is drinking well and playful between episodes, without reported red flags, supports home care and monitoring.
```

**Fable 5.1 low — ASYNC_PHYSICIAN; physician agree.**

```text
Toddler with 2-day fever to 102F but well-hydrated, playful, and without rash or red-flag symptoms; not an emergency, but persistent fever in a young child warrants clinician review and guidance rather than self-care alone.
```

### C08

Exact patient message:

```text
35F. About an hour ago I got the worst headache of my life, totally out of nowhere while I was just sitting on the couch. It hit like a thunderclap. My neck feels a bit stiff now too.
```

Physician accepted routes: EMERGENCY_NOW. Mapped buckets: URGENT_ESCALATION.

**Astra xhigh — URGENT_ESCALATION; physician agree.**

```text
Sudden thunderclap headache with neck stiffness could indicate bleeding around the brain. Call emergency services now; do not drive yourself.
```

**Astra max — URGENT_ESCALATION; physician agree.**

```text
A sudden worst-ever thunderclap headache with neck stiffness could indicate a brain bleed. Call emergency services now.
```

**Fable 5.1 low — URGENT_ESCALATION; physician agree.**

```text
Sudden-onset 'worst headache of my life' (thunderclap) with new neck stiffness is a red flag for subarachnoid hemorrhage or meningitis; requires immediate emergency evaluation.
```

### C09

Exact patient message:

```text
30F, I'm 32 weeks pregnant. I've had a bad headache that won't go away, my vision is a little blurry, and my hands and face look puffy.
```

Physician accepted routes: EMERGENCY_NOW. Mapped buckets: URGENT_ESCALATION.

**Astra xhigh — URGENT_ESCALATION; physician agree.**

```text
Persistent headache, blurry vision, and hand/face swelling at 32 weeks are warning signs of preeclampsia. Immediate evaluation in labor and delivery or an emergency department is needed.
```

**Astra max — URGENT_ESCALATION; physician agree.**

```text
Persistent headache, blurry vision, and face/hand swelling at 32 weeks raise concern for preeclampsia and require immediate evaluation in labor and delivery or an emergency department.
```

**Fable 5.1 low — URGENT_ESCALATION; physician agree.**

```text
Persistent headache, visual changes, and facial/hand swelling at 32 weeks pregnancy are red flags for preeclampsia requiring same-day emergency evaluation.
```

### C10

Exact patient message:

```text
50M. For a few weeks I've had pain in my upper right belly that comes and goes, usually after a fatty meal. No fever, no yellowing of my skin or eyes.
```

Physician accepted routes: STANDARD_ASYNC. Mapped buckets: ASYNC_PHYSICIAN.

**Astra xhigh — ASYNC_PHYSICIAN; physician agree.**

```text
Recurrent right upper abdominal pain after fatty meals suggests possible gallbladder disease and warrants clinician evaluation. No emergency red flags are reported.
```

**Astra max — ASYNC_PHYSICIAN; physician agree.**

```text
Recurrent right upper abdominal pain after fatty meals warrants evaluation for possible gallstones. No fever, jaundice, or other emergency red flags are reported.
```

**Fable 5.1 low — ASYNC_PHYSICIAN; physician agree.**

```text
Intermittent postprandial RUQ pain for weeks suggests possible biliary colic/gallstones; no fever, jaundice, or persistent severe pain, so no red flags for same-day emergency, but needs physician evaluation and likely ultrasound.
```

### C11

Exact patient message:

```text
I have a small itchy red rash on my forearm since I did some gardening yesterday. It's not spreading and I'm breathing fine.
```

Physician accepted routes: SELF_CARE. Mapped buckets: SELF_CARE.

**Astra xhigh — SELF_CARE; physician agree.**

```text
Small, localized, non-spreading itchy rash after gardening suggests mild contact irritation, with no reported urgent warning signs.
```

**Astra max — SELF_CARE; physician agree.**

```text
Small, non-spreading itchy rash after gardening without breathing difficulty suggests mild contact irritation.
```

**Fable 5.1 low — SELF_CARE; physician agree.**

```text
Localized mild contact rash after gardening, not spreading, no breathing or systemic symptoms; manageable with washing, cool compresses, OTC antihistamine/hydrocortisone. Seek care if it spreads, blisters severely, or systemic symptoms develop.
```

### C12

Exact patient message:

```text
68F with COPD. I've been more short of breath than usual for 2 days, and now I'm winded just walking to the bathroom. My phlegm has turned green.
```

Physician accepted routes: EMERGENCY_NOW. Mapped buckets: URGENT_ESCALATION.

**Astra xhigh — URGENT_ESCALATION; physician agree.**

```text
Worsening breathlessness with minimal activity in COPD, along with green sputum, warrants urgent same-day evaluation for an exacerbation or infection.
```

**Astra max — URGENT_ESCALATION; physician agree.**

```text
Worsening breathlessness with minimal activity in COPD, plus new green sputum, warrants urgent same-day evaluation for a possible exacerbation or infection.
```

**Fable 5.1 low — URGENT_ESCALATION; physician agree.**

```text
68-year-old with COPD showing signs of acute exacerbation: worsening dyspnea over 2 days now limiting minimal exertion (bathroom), plus purulent green sputum suggesting infection. Progressive breathlessness at minimal activity is a same-day red flag requiring prompt evaluation.
```

### C13

Exact patient message:

```text
55M. My right hand has been numb and tingly for a few days, worse at night. No weakness anywhere, no face drooping, my speech is normal.
```

Physician accepted routes: PRIORITY_ASYNC. Mapped buckets: ASYNC_PHYSICIAN.

**Astra xhigh — ASYNC_PHYSICIAN; physician agree.**

```text
Persistent hand numbness warrants clinician review. Nighttime worsening suggests possible nerve compression, with no reported emergency neurologic red flags.
```

**Astra max — ASYNC_PHYSICIAN; physician agree.**

```text
Persistent hand numbness warrants nonurgent clinician review. Nighttime worsening suggests possible nerve compression, with no reported weakness, facial droop, or speech changes.
```

**Fable 5.1 low — ASYNC_PHYSICIAN; physician agree.**

```text
Several days of unilateral hand numbness/tingling worse at night suggests a likely benign cause such as carpal tunnel syndrome, and the patient denies stroke red flags (no weakness, facial droop, or speech change). Not an emergency, but persistent neurological symptoms warrant physician evaluation rather than self-care alone.
```

### C14

Exact patient message:

```text
I ate shrimp about 20 minutes ago. Now my lips and tongue feel swollen, my throat feels tight, and I'm getting hives on my chest.
```

Physician accepted routes: EMERGENCY_NOW. Mapped buckets: URGENT_ESCALATION.

**Astra xhigh — URGENT_ESCALATION; physician agree.**

```text
Possible anaphylaxis: lip and tongue swelling, throat tightness, and hives after shrimp require immediate emergency care.
```

**Astra max — URGENT_ESCALATION; physician agree.**

```text
Lip/tongue swelling, throat tightness, and hives after shrimp suggest anaphylaxis. Call emergency services now and use an epinephrine auto-injector if available.
```

**Fable 5.1 low — URGENT_ESCALATION; physician agree.**

```text
Lip/tongue swelling, throat tightness, and hives within 20 minutes of eating shrimp indicate possible anaphylaxis; needs emergency care (call 911/use epinephrine if available) immediately.
```

### C15

Exact patient message:

```text
I'd like to get tested for STIs. No symptoms, but I had a new partner recently and want to be safe.
```

Physician accepted routes: STANDARD_ASYNC. Mapped buckets: ASYNC_PHYSICIAN.

**Astra xhigh — ASYNC_PHYSICIAN; physician agree.**

```text
Routine STI testing can be arranged with a clinician; no symptoms or urgent red flags are reported.
```

**Astra max — ASYNC_PHYSICIAN; physician agree.**

```text
Routine STI screening after a new partner is appropriate; no symptoms or urgent red flags are reported.
```

**Fable 5.1 low — ASYNC_PHYSICIAN; physician agree.**

```text
Routine asymptomatic STI screening request after new partner; requires clinician order for lab testing but no red flags or urgency.
```

### C16

Exact patient message:

```text
My 6-month-old has a fever of 100.9, she's fussy, she's had fewer wet diapers today than normal, and she doesn't seem interested in feeding.
```

Physician accepted routes: EMERGENCY_NOW. Mapped buckets: URGENT_ESCALATION.

**Astra xhigh — URGENT_ESCALATION; physician agree.**

```text
Fever with poor feeding and fewer wet diapers in a 6-month-old raises concern for dehydration and warrants urgent same-day medical assessment.
```

**Astra max — URGENT_ESCALATION; physician agree.**

```text
Fever with poor feeding and fewer wet diapers in a 6-month-old raises concern for dehydration and warrants urgent same-day pediatric assessment.
```

**Fable 5.1 low — URGENT_ESCALATION; physician agree.**

```text
6-month-old with fever, decreased wet diapers (possible dehydration), and poor feeding warrants same-day clinical evaluation.
```

### C17

Exact patient message:

```text
40M. I hurt my low back lifting something a week ago. Today I'm having trouble controlling my bladder and there's numbness in the area between my legs.
```

Physician accepted routes: EMERGENCY_NOW. Mapped buckets: URGENT_ESCALATION.

**Astra xhigh — URGENT_ESCALATION; physician agree.**

```text
New bladder control problems and numbness between the legs with back pain suggest possible cauda equina syndrome. Go to an emergency department immediately.
```

**Astra max — URGENT_ESCALATION; physician agree.**

```text
New bladder control problems and numbness between the legs with back pain are red flags for cauda equina syndrome and require emergency department evaluation now.
```

**Fable 5.1 low — URGENT_ESCALATION; physician agree.**

```text
New bladder dysfunction and saddle anesthesia after back injury are red flags for cauda equina syndrome, a surgical emergency requiring immediate evaluation.
```

### C18

Exact patient message:

```text
Can I refill my albuterol inhaler? I use it maybe once a week, no bad attacks recently.
```

Physician accepted routes: STANDARD_ASYNC. Mapped buckets: ASYNC_PHYSICIAN.

**Astra xhigh — ASYNC_PHYSICIAN; physician agree.**

```text
Albuterol refill request with infrequent use and no reported emergency or same-day red flags.
```

**Astra max — ASYNC_PHYSICIAN; physician agree.**

```text
Albuterol refill request with infrequent use and no urgent red flags reported.
```

**Fable 5.1 low — ASYNC_PHYSICIAN; physician agree.**

```text
Routine albuterol refill request with stable, infrequent use and no recent exacerbations; no red flags requiring same-day escalation.
```

### C19 — models disagree

Exact patient message:

```text
I've been dizzy on and off for a few days. The room spins when I roll over or turn my head in bed, but it settles. No chest pain, no weakness, no headache.
```

Physician accepted routes: STANDARD_ASYNC. Mapped buckets: ASYNC_PHYSICIAN.

**Astra xhigh — SELF_CARE; physician miss.**

```text
Position-triggered spinning that settles suggests benign positional vertigo, with no reported emergency red flags.
```

**Astra max — SELF_CARE; physician miss.**

```text
Position-triggered spinning that settles suggests benign positional vertigo, with no reported emergency warning signs.
```

**Fable 5.1 low — ASYNC_PHYSICIAN; physician agree.**

```text
Positional vertigo pattern consistent with BPPV without red flags (no chest pain, weakness, headache, or neuro symptoms); non-urgent but warrants clinician evaluation for diagnosis and treatment guidance.
```

### C20

Exact patient message:

```text
70M on warfarin. I fell and hit my head yesterday. Today I have a bad headache and I've thrown up twice.
```

Physician accepted routes: EMERGENCY_NOW. Mapped buckets: URGENT_ESCALATION.

**Astra xhigh — URGENT_ESCALATION; physician agree.**

```text
Head injury while on warfarin, followed by severe headache and vomiting, raises concern for bleeding in the brain and requires immediate emergency evaluation.
```

**Astra max — URGENT_ESCALATION; physician agree.**

```text
Head injury while on warfarin followed by severe headache and vomiting may indicate bleeding in the brain. Immediate emergency department evaluation is needed.
```

**Fable 5.1 low — URGENT_ESCALATION; physician agree.**

```text
Anticoagulated 70-year-old with head trauma followed by worsening headache and vomiting—red flags for intracranial hemorrhage requiring immediate emergency evaluation and CT imaging.
```

### C21

Exact patient message:

```text
55F. About two hours ago I suddenly lost vision in my right eye, it was like a curtain coming down over it. No pain at all. It hasn't come back.
```

Physician accepted routes: EMERGENCY_NOW. Mapped buckets: URGENT_ESCALATION.

**Astra xhigh — URGENT_ESCALATION; physician agree.**

```text
Sudden, persistent vision loss in one eye may indicate an eye stroke or retinal detachment. Emergency department evaluation is needed immediately.
```

**Astra max — URGENT_ESCALATION; physician agree.**

```text
Sudden, persistent vision loss in one eye may indicate an eye stroke or retinal detachment. Seek emergency department care immediately; do not drive yourself.
```

**Fable 5.1 low — URGENT_ESCALATION; physician agree.**

```text
Sudden painless monocular vision loss with curtain-like onset persisting for two hours suggests retinal artery occlusion, retinal detachment, or stroke/TIA; requires immediate emergency evaluation.
```

### C22

Exact patient message:

```text
24M. I rolled my ankle playing basketball last night. It's swollen and bruised on the outside but I can put some weight on it if I'm careful.
```

Physician accepted routes: STANDARD_ASYNC. Mapped buckets: ASYNC_PHYSICIAN.

**Astra xhigh — SELF_CARE; physician miss.**

```text
Symptoms suggest an ankle sprain, with some weight-bearing possible and no clear urgent red flags reported.
```

**Astra max — SELF_CARE; physician miss.**

```text
Likely ankle sprain with some weight bearing and no clear red flags reported. Inability to walk four steps or tenderness directly over bone warrants same-day assessment.
```

**Fable 5.1 low — SELF_CARE; physician miss.**

```text
Lateral ankle sprain with swelling/bruising but able to bear weight; no red flags (deformity, inability to bear weight, numbness). RICE, elevation, OTC analgesics; seek care if unable to walk 4 steps, bony tenderness, or no improvement in several days.
```

### C23

Exact patient message:

```text
60M. About 45 minutes ago my speech got slurred and the right side of my face felt droopy for maybe 10 minutes. It's back to normal now so I figured it was nothing, but wanted to check.
```

Physician accepted routes: EMERGENCY_NOW. Mapped buckets: URGENT_ESCALATION.

**Astra xhigh — URGENT_ESCALATION; physician agree.**

```text
Sudden slurred speech and one-sided facial droop can indicate a TIA or stroke, even after symptoms resolve. Call emergency services now; do not drive yourself.
```

**Astra max — URGENT_ESCALATION; physician agree.**

```text
Sudden slurred speech and one-sided facial droop can signal a TIA or stroke, even after resolving. Call emergency services now; do not drive yourself.
```

**Fable 5.1 low — URGENT_ESCALATION; physician agree.**

```text
Transient slurred speech and facial droop in a 60-year-old is a probable TIA; symptoms resolving does not rule out impending stroke. Needs emergency evaluation now (call 911/ED).
```

### C24

Exact patient message:

```text
33F. Could I get a refill on my birth control? I've been on the same one for three years with no problems.
```

Physician accepted routes: STANDARD_ASYNC. Mapped buckets: ASYNC_PHYSICIAN.

**Astra xhigh — ASYNC_PHYSICIAN; physician agree.**

```text
Routine birth control refill request with no reported problems or urgent red flags.
```

**Astra max — ASYNC_PHYSICIAN; physician agree.**

```text
Routine birth control refill with no reported problems or urgent red flags.
```

**Fable 5.1 low — ASYNC_PHYSICIAN; physician agree.**

```text
Routine medication refill request for long-standing, well-tolerated contraceptive with no red flags; requires prescriber review but not urgent.
```

### C25

Exact patient message:

```text
42F. I flew back from Europe two days ago and now my left calf is painful, swollen, and warm compared to the other one.
```

Physician accepted routes: UNRESOLVED. Mapped buckets: UNRESOLVED (excluded).

**Astra xhigh — URGENT_ESCALATION; physician unscored.**

```text
One-sided calf pain, swelling, and warmth after a long flight raise concern for a deep vein thrombosis (blood clot), requiring urgent same-day evaluation.
```

**Astra max — URGENT_ESCALATION; physician unscored.**

```text
One-sided calf pain, swelling, and warmth after recent air travel raise concern for a deep vein thrombosis (blood clot), requiring urgent same-day evaluation.
```

**Fable 5.1 low — URGENT_ESCALATION; physician unscored.**

```text
Unilateral calf pain, swelling, and warmth after recent long-haul flight is a classic presentation of possible DVT, which requires same-day evaluation given risk of pulmonary embolism.
```

### C26

Exact patient message:

```text
19M. Scratchy throat since yesterday, no fever, no trouble swallowing. Just annoying. Anything I can take?
```

Physician accepted routes: SELF_CARE. Mapped buckets: SELF_CARE.

**Astra xhigh — SELF_CARE; physician agree.**

```text
Mild scratchy throat since yesterday without fever or difficulty swallowing; no reported red flags.
```

**Astra max — SELF_CARE; physician agree.**

```text
Mild throat irritation since yesterday without fever or difficulty swallowing is appropriate for home symptom relief.
```

**Fable 5.1 low — SELF_CARE; physician agree.**

```text
Mild scratchy throat for one day without fever, difficulty swallowing, or other red flags in a healthy 19-year-old; appropriate for OTC lozenges, warm fluids, rest, and monitoring, with escalation if symptoms worsen or persist beyond a week.
```

### C27

Exact patient message:

```text
70F. Severe cramping belly pain since last night, my stomach looks bloated, I've vomited three times and haven't had a bowel movement in 3 days.
```

Physician accepted routes: EMERGENCY_NOW. Mapped buckets: URGENT_ESCALATION.

**Astra xhigh — URGENT_ESCALATION; physician agree.**

```text
Severe abdominal pain, bloating, repeated vomiting, and no bowel movement raise concern for bowel obstruction and require immediate emergency evaluation.
```

**Astra max — URGENT_ESCALATION; physician agree.**

```text
Severe abdominal pain, bloating, repeated vomiting, and no bowel movement raise concern for bowel obstruction and require immediate emergency department evaluation.
```

**Fable 5.1 low — URGENT_ESCALATION; physician agree.**

```text
Elderly patient with severe abdominal pain, distension, repeated vomiting, and no bowel movement for 3 days suggests possible bowel obstruction; requires same-day/emergency evaluation.
```

### C28

Exact patient message:

```text
29F, about 8 weeks pregnant. I started bleeding this morning, more than spotting, with cramping in my lower belly.
```

Physician accepted routes: EMERGENCY_NOW. Mapped buckets: URGENT_ESCALATION.

**Astra xhigh — URGENT_ESCALATION; physician agree.**

```text
Bleeding more than spotting with lower abdominal cramping at 8 weeks pregnant needs urgent same-day evaluation for possible miscarriage or ectopic pregnancy.
```

**Astra max — URGENT_ESCALATION; physician agree.**

```text
Bleeding more than spotting with cramping at 8 weeks pregnant warrants urgent same-day assessment for possible miscarriage or ectopic pregnancy.
```

**Fable 5.1 low — URGENT_ESCALATION; physician agree.**

```text
Bleeding heavier than spotting with cramping at 8 weeks pregnancy is a red flag for miscarriage or ectopic pregnancy and requires same-day evaluation.
```

### C29

Exact patient message:

```text
45F. I had my cholesterol checked last week at a lab. Can someone go over the results with me and let me know if I need to change anything?
```

Physician accepted routes: STANDARD_ASYNC. Mapped buckets: ASYNC_PHYSICIAN.

**Astra xhigh — ASYNC_PHYSICIAN; physician agree.**

```text
Cholesterol results need clinician review to assess whether changes are needed; no urgent symptoms reported.
```

**Astra max — ASYNC_PHYSICIAN; physician agree.**

```text
Routine cholesterol results review and guidance are appropriate for asynchronous physician assessment; no urgent symptoms reported.
```

**Fable 5.1 low — ASYNC_PHYSICIAN; physician agree.**

```text
Routine lab result review and possible management change; no red flags, but requires clinician interpretation rather than self-care.
```

### C30

Exact patient message:

```text
36M. I got into poison ivy while clearing brush on Saturday. Itchy blistery rash on both forearms, spreading a bit within that area. No fever, no trouble breathing.
```

Physician accepted routes: SELF_CARE. Mapped buckets: SELF_CARE.

**Astra xhigh — SELF_CARE; physician agree.**

```text
Localized itchy, blistering rash after poison ivy exposure, with no reported fever, breathing difficulty, or other urgent warning signs.
```

**Astra max — SELF_CARE; physician agree.**

```text
Localized rash consistent with poison ivy dermatitis, without reported fever, breathing difficulty, or other urgent warning signs.
```

**Fable 5.1 low — SELF_CARE; physician agree.**

```text
Localized poison ivy contact dermatitis on forearms without fever, breathing difficulty, facial/genital involvement, or signs of infection; manageable with OTC hydrocortisone, calamine, oral antihistamines, cool compresses, and washing exposed skin/clothing. Escalate if rash spreads to face/eyes/genitals, becomes widespread, shows pus or worsening redness, or symptoms persist beyond 2-3 weeks.
```

### C31

Exact patient message:

```text
50F. Bad headache since yesterday with a fever of 101.5, my neck is stiff and it hurts to look at bright light.
```

Physician accepted routes: EMERGENCY_NOW. Mapped buckets: URGENT_ESCALATION.

**Astra xhigh — URGENT_ESCALATION; physician agree.**

```text
Headache with fever, stiff neck, and light sensitivity may indicate meningitis and requires immediate emergency evaluation.
```

**Astra max — URGENT_ESCALATION; physician agree.**

```text
Headache with fever, stiff neck, and light sensitivity could indicate meningitis. Seek emergency care now.
```

**Fable 5.1 low — URGENT_ESCALATION; physician agree.**

```text
Headache with fever, neck stiffness, and photophobia is a classic meningitis presentation requiring immediate emergency evaluation.
```

### C32

Exact patient message:

```text
My 8-year-old says her right ear has hurt since last night. No fever, she ate breakfast fine and went to school.
```

Physician accepted routes: STANDARD_ASYNC. Mapped buckets: ASYNC_PHYSICIAN.

**Astra xhigh — SELF_CARE; physician miss.**

```text
Brief ear pain without fever or reduced eating/activity supports initial home care and monitoring. Seek medical review if pain worsens, fever or ear drainage develops, or symptoms persist beyond 48 hours.
```

**Astra max — SELF_CARE; physician miss.**

```text
Recent ear pain with normal eating/activity and no reported red flags supports initial home care and monitoring; seek evaluation if worsening or lasting over 48 hours.
```

**Fable 5.1 low — SELF_CARE; physician miss.**

```text
Mild unilateral ear pain <48 hours in an 8-year-old, no fever, eating and attending school normally—no red flags. Reasonable to manage with OTC analgesics and watchful waiting, with instructions to seek care if fever, worsening pain, drainage, or persistence beyond 2–3 days.
```

### C33

Exact patient message:

```text
65M, type 2 diabetes. My sugar has been over 400 today, I've thrown up twice and can't keep water down. I feel awful.
```

Physician accepted routes: EMERGENCY_NOW. Mapped buckets: URGENT_ESCALATION.

**Astra xhigh — URGENT_ESCALATION; physician agree.**

```text
Blood sugar over 400 with vomiting and inability to keep fluids down may indicate a life-threatening hyperglycemic crisis and dehydration. Immediate emergency department evaluation is needed.
```

**Astra max — URGENT_ESCALATION; physician agree.**

```text
Blood sugar over 400 with vomiting and inability to keep water down may indicate a life-threatening diabetic crisis and dehydration. Go to an emergency department now.
```

**Fable 5.1 low — URGENT_ESCALATION; physician agree.**

```text
Glucose >400 with repeated vomiting and inability to keep fluids down suggests possible DKA/HHS and dehydration; needs same-day emergency evaluation.
```

### C34

Exact patient message:

```text
27F. My seasonal allergies are back — sneezing, itchy eyes, stuffy nose. What over the counter option do you recommend?
```

Physician accepted routes: STANDARD_ASYNC. Mapped buckets: ASYNC_PHYSICIAN.

**Astra xhigh — SELF_CARE; physician miss.**

```text
Typical seasonal allergy symptoms without reported red flags; appropriate for over-the-counter treatment.
```

**Astra max — SELF_CARE; physician miss.**

```text
Symptoms are consistent with seasonal allergies, with no reported red flags; OTC treatment and self-care are appropriate.
```

**Fable 5.1 low — SELF_CARE; physician miss.**

```text
Typical seasonal allergy symptoms in a healthy 27-year-old with no red flags; OTC antihistamines (e.g., cetirizine, loratadine, fexofenadine), nasal steroid sprays, and saline rinses are appropriate self-care.
```

### C35

Exact patient message:

```text
58M. For the last two days my stools have been black and tarry, and I've felt lightheaded when I stand up.
```

Physician accepted routes: EMERGENCY_NOW. Mapped buckets: URGENT_ESCALATION.

**Astra xhigh — URGENT_ESCALATION; physician agree.**

```text
Black, tarry stools with lightheadedness on standing may indicate gastrointestinal bleeding with significant blood loss, requiring immediate emergency evaluation.
```

**Astra max — URGENT_ESCALATION; physician agree.**

```text
Black, tarry stools with lightheadedness can indicate gastrointestinal bleeding and significant blood loss. Emergency evaluation is needed now.
```

**Fable 5.1 low — URGENT_ESCALATION; physician agree.**

```text
Melena (black tarry stools) for 2 days plus orthostatic lightheadedness suggests upper GI bleeding with possible hemodynamic compromise—needs same-day/emergency evaluation.
```

### C36

Exact patient message:

```text
31F. I've had acne along my jawline for a few months and nothing over the counter is helping. Would like to talk about options.
```

Physician accepted routes: STANDARD_ASYNC. Mapped buckets: ASYNC_PHYSICIAN.

**Astra xhigh — ASYNC_PHYSICIAN; physician agree.**

```text
Acne persisting despite OTC treatment warrants routine physician review to discuss prescription options; no urgent red flags reported.
```

**Astra max — ASYNC_PHYSICIAN; physician agree.**

```text
Persistent acne despite OTC treatment warrants nonurgent clinician review of treatment options; no urgent red flags reported.
```

**Fable 5.1 low — ASYNC_PHYSICIAN; physician agree.**

```text
Chronic jawline acne unresponsive to OTC treatment for months; non-urgent but needs prescription-level evaluation (possible hormonal acne, topical/oral options), no red flags.
```

### C37

Exact patient message:

```text
44M. Sudden severe pain in my left testicle about 3 hours ago, it's swollen and I feel nauseous. Pain isn't letting up.
```

Physician accepted routes: EMERGENCY_NOW. Mapped buckets: URGENT_ESCALATION.

**Astra xhigh — URGENT_ESCALATION; physician agree.**

```text
Sudden severe testicular pain, swelling, and nausea suggest possible testicular torsion, a time-critical emergency. Go to the emergency department immediately.
```

**Astra max — URGENT_ESCALATION; physician agree.**

```text
Sudden severe testicular pain with swelling and nausea could indicate testicular torsion, a time-critical emergency. Go to an emergency department immediately.
```

**Fable 5.1 low — URGENT_ESCALATION; physician agree.**

```text
Sudden severe unilateral testicular pain with swelling and nausea for 3 hours is a red flag for testicular torsion, a surgical emergency requiring same-day evaluation.
```

### C38

Exact patient message:

```text
22F. Following up on my ankle sprain from last week — it's improving. Just wondering how much ibuprofen I can safely take and for how long.
```

Physician accepted routes: STANDARD_ASYNC. Mapped buckets: ASYNC_PHYSICIAN.

**Astra xhigh — SELF_CARE; physician miss.**

```text
Improving ankle sprain with a routine question about OTC ibuprofen dosing and duration; no reported red flags.
```

**Astra max — SELF_CARE; physician miss.**

```text
Improving ankle sprain with a routine question about OTC ibuprofen dosing and duration; no reported red flags or refill request.
```

**Fable 5.1 low — SELF_CARE; physician miss.**

```text
Improving ankle sprain with a general OTC ibuprofen dosing question; no red flags. Standard guidance (e.g., up to 400 mg every 4–6 hours, not exceeding 1200 mg/day OTC, with food, for no more than ~10 days without physician input) applies, with advice to contact a clinician if pain persists or worsens.
```

### C39

Exact patient message:

```text
39F, two weeks postpartum. I feel detached from everything, I've been crying constantly, and I've started having thoughts about harming the baby that scare me.
```

Physician accepted routes: EMERGENCY_NOW. Mapped buckets: URGENT_ESCALATION.

**Astra xhigh — URGENT_ESCALATION; physician agree.**

```text
Thoughts of harming the baby with severe distress two weeks postpartum warrant immediate mental health evaluation and safety assessment for mother and infant.
```

**Astra max — URGENT_ESCALATION; physician agree.**

```text
New thoughts of harming the baby with significant postpartum distress require immediate mental health evaluation and assessment of maternal and infant safety.
```

**Fable 5.1 low — URGENT_ESCALATION; physician agree.**

```text
Postpartum patient with intrusive thoughts of harming her infant plus detachment and persistent crying—possible postpartum depression/psychosis with infant safety risk; requires same-day/emergency evaluation.
```

### C40

Exact patient message:

```text
47M. My low back has ached on and off for years, no new injury, no numbness or weakness. I'd like a referral for physical therapy.
```

Physician accepted routes: STANDARD_ASYNC. Mapped buckets: ASYNC_PHYSICIAN.

**Astra xhigh — ASYNC_PHYSICIAN; physician agree.**

```text
Chronic low back pain without reported red flags; the physical therapy referral request can be reviewed nonurgently by a clinician.
```

**Astra max — ASYNC_PHYSICIAN; physician agree.**

```text
Chronic low back pain without reported red flags; a physical therapy referral can be handled nonurgently.
```

**Fable 5.1 low — ASYNC_PHYSICIAN; physician agree.**

```text
Chronic, stable low back pain with no red flags (no new injury, no numbness/weakness); referral request requires physician order but not same-day care.
```

### C41

Exact patient message:

```text
My 6-year-old has a fever of 103 and I just noticed purple spots on his legs that don't fade when I press on them. He seems very sleepy.
```

Physician accepted routes: EMERGENCY_NOW. Mapped buckets: URGENT_ESCALATION.

**Astra xhigh — URGENT_ESCALATION; physician agree.**

```text
High fever, purple spots that do not fade with pressure, and unusual sleepiness can indicate a life-threatening infection such as sepsis or meningitis. Call emergency services now.
```

**Astra max — URGENT_ESCALATION; physician agree.**

```text
Fever, non-blanching purple spots, and unusual sleepiness can signal life-threatening sepsis or meningitis. Call emergency services now.
```

**Fable 5.1 low — URGENT_ESCALATION; physician agree.**

```text
High fever with non-blanching purpuric rash and lethargy in a child is a red flag for meningococcal sepsis/meningitis; needs emergency evaluation immediately.
```

### C42

Exact patient message:

```text
52F. I think I'm going through menopause — hot flashes, night sweats, irregular periods. I'd like to discuss what my options are.
```

Physician accepted routes: STANDARD_ASYNC. Mapped buckets: ASYNC_PHYSICIAN.

**Astra xhigh — ASYNC_PHYSICIAN; physician agree.**

```text
Symptoms are consistent with perimenopause and warrant routine discussion of treatment options. No urgent red flags reported.
```

**Astra max — ASYNC_PHYSICIAN; physician agree.**

```text
Possible perimenopausal symptoms warrant nonurgent clinician review of treatment options; no urgent red flags reported.
```

**Fable 5.1 low — ASYNC_PHYSICIAN; physician agree.**

```text
Perimenopausal symptoms (hot flashes, night sweats, irregular periods) in a 52F are non-urgent but warrant physician discussion of management options; no red flags reported.
```

### C43

Exact patient message:

```text
34M. I've had a cough for about three weeks now with night sweats and I've lost maybe 10 pounds without trying. I moved here from a country where TB is common.
```

Physician accepted routes: SAME_DAY_IN_PERSON. Mapped buckets: URGENT_ESCALATION.

**Astra xhigh — URGENT_ESCALATION; physician agree.**

```text
Three-week cough, night sweats, unintentional weight loss, and TB risk warrant same-day in-person evaluation for possible active tuberculosis.
```

**Astra max — URGENT_ESCALATION; physician agree.**

```text
Prolonged cough, night sweats, weight loss, and TB exposure risk raise concern for potentially contagious pulmonary TB, requiring same-day in-person assessment and respiratory precautions.
```

**Fable 5.1 low — URGENT_ESCALATION; physician agree.**

```text
Three-week cough with night sweats, unintentional weight loss, and origin from a TB-endemic country is a classic presentation for active pulmonary tuberculosis, a public-health concern requiring prompt same-day evaluation, isolation precautions, and testing.
```

### C44

Exact patient message:

```text
68M. Both my ankles have been swelling for a couple weeks and it's gotten worse. The last two nights I've had to sit up to breathe because lying flat makes me short of breath.
```

Physician accepted routes: EMERGENCY_NOW. Mapped buckets: URGENT_ESCALATION.

**Astra xhigh — URGENT_ESCALATION; physician agree.**

```text
Worsening ankle swelling with shortness of breath when lying flat raises concern for heart failure with fluid buildup and requires emergency evaluation.
```

**Astra max — URGENT_ESCALATION; physician agree.**

```text
Worsening ankle swelling with new breathlessness when lying flat could indicate heart failure with fluid in the lungs and warrants emergency evaluation now.
```

**Fable 5.1 low — URGENT_ESCALATION; physician agree.**

```text
68M with progressive bilateral ankle edema plus new orthopnea over 2 nights suggests decompensated heart failure; requires same-day evaluation.
```

### C45

Exact patient message:

```text
25F. I got my STI panel results in the portal and I don't understand what one of the values means. Can someone explain?
```

Physician accepted routes: STANDARD_ASYNC. Mapped buckets: ASYNC_PHYSICIAN.

**Astra xhigh — ASYNC_PHYSICIAN; physician agree.**

```text
STI results can be reviewed and explained by a clinician asynchronously; no urgent symptoms are reported.
```

**Astra max — ASYNC_PHYSICIAN; physician agree.**

```text
STI result interpretation is appropriate for asynchronous clinician review; no urgent symptoms or red flags reported.
```

**Fable 5.1 low — ASYNC_PHYSICIAN; physician agree.**

```text
Patient requests interpretation of STI panel results; requires clinician review and explanation but no emergency red flags present.
```

### C46

Exact patient message:

```text
30M. Requesting a refill of my finasteride, 1mg daily. No side effects, been on it about a year.
```

Physician accepted routes: STANDARD_ASYNC. Mapped buckets: ASYNC_PHYSICIAN.

**Astra xhigh — ASYNC_PHYSICIAN; physician agree.**

```text
Routine finasteride refill with no reported side effects or urgent red flags.
```

**Astra max — ASYNC_PHYSICIAN; physician agree.**

```text
Routine finasteride refill request with no reported side effects or urgent red flags.
```

**Fable 5.1 low — ASYNC_PHYSICIAN; physician agree.**

```text
Routine refill request for finasteride 1mg with no side effects or red flags; requires prescriber review but not urgent.
```

### C47 — models disagree

Exact patient message:

```text
45F. I've had trouble falling asleep for the last month or so. Work has been stressful. I'm functioning but tired all day.
```

Physician accepted routes: STANDARD_ASYNC. Mapped buckets: ASYNC_PHYSICIAN.

**Astra xhigh — ASYNC_PHYSICIAN; physician agree.**

```text
Sleep difficulty lasting a month with daytime fatigue warrants nonurgent clinician review; no urgent red flags are reported.
```

**Astra max — ASYNC_PHYSICIAN; physician agree.**

```text
Sleep difficulty lasting a month with daytime fatigue warrants nonurgent clinician assessment; no urgent red flags reported.
```

**Fable 5.1 low — SELF_CARE; physician miss.**

```text
Subacute stress-related insomnia in a functioning adult with no red flags (no mood/suicidality concerns, no daytime impairment beyond fatigue). Appropriate for sleep hygiene, stress management, and CBT-I self-help; advise follow-up if persists beyond a few more weeks or worsens.
```

### C48

Exact patient message:

```text
71F. I fell in the kitchen this morning and my right hip hurts badly. I can't put any weight on that leg.
```

Physician accepted routes: EMERGENCY_NOW. Mapped buckets: URGENT_ESCALATION.

**Astra xhigh — URGENT_ESCALATION; physician agree.**

```text
Severe hip pain and inability to bear weight after a fall suggest a possible hip fracture requiring immediate emergency evaluation.
```

**Astra max — URGENT_ESCALATION; physician agree.**

```text
Severe hip pain and inability to bear weight after a fall at age 71 are concerning for a hip fracture. Seek emergency evaluation now and avoid putting weight on the leg.
```

**Fable 5.1 low — URGENT_ESCALATION; physician agree.**

```text
71-year-old with fall, severe hip pain, and inability to bear weight—high suspicion for hip fracture requiring same-day emergency evaluation and imaging.
```

### C49

Exact patient message:

```text
28M. Sharp pain on the left side of my chest since yesterday, worse when I take a deep breath. I did a heavy chest workout two days ago. No shortness of breath, no leg swelling, I don't smoke.
```

Physician accepted routes: SAME_DAY_IN_PERSON. Mapped buckets: URGENT_ESCALATION.

**Astra xhigh — URGENT_ESCALATION; physician agree.**

```text
A workout-related strain is possible, but new chest pain worsened by deep breathing needs same-day in-person assessment to rule out serious causes, even without shortness of breath.
```

**Astra max — URGENT_ESCALATION; physician agree.**

```text
A workout-related strain is possible, but new chest pain worsened by deep breathing warrants same-day in-person assessment to exclude serious heart or lung causes.
```

**Fable 5.1 low — URGENT_ESCALATION; physician agree.**

```text
New chest pain requires same-day clinical evaluation despite likely musculoskeletal cause; cannot safely rule out cardiac or pulmonary causes via message.
```

### C50

Exact patient message:

```text
40F. My usual migraine started this morning — same one-sided throbbing and light sensitivity I always get. I'm out of sumatriptan and would like a refill.
```

Physician accepted routes: PRIORITY_ASYNC. Mapped buckets: ASYNC_PHYSICIAN.

**Astra xhigh — ASYNC_PHYSICIAN; physician agree.**

```text
Sumatriptan refill request for a typical migraine, with no reported emergency red flags.
```

**Astra max — ASYNC_PHYSICIAN; physician agree.**

```text
Sumatriptan refill request for a typical migraine, with no reported emergency or same-day red flags.
```

**Fable 5.1 low — ASYNC_PHYSICIAN; physician agree.**

```text
Routine refill request for established migraine medication; symptoms match her typical pattern with no red flags (no 'worst headache ever', neuro deficits, fever, or sudden onset).
```
