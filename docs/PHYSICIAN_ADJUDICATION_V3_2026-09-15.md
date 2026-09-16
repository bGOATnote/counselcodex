# Physician adjudication v3: case corrections and evaluation

15 September 2026 · Three-bucket disposition · Offline reassessment of frozen outputs

## Result and interpretation

The existing Fable 5.1 low-effort outputs agree with **48/50 revised physician labels**. The original **44/49** result remains valid for physician reference v2. Fable still undertriages **C22 and C47**. Astra extra-high and max each agree on **47/50**; their remaining misses are **C07, C19 and C22**.

This is a **single physician's unblinded reassessment after output review**. Four reference labels changed, and the same frozen outputs were rescored. No inference call, prompt edit, model replacement, or application change occurred. The higher score reflects reference correction and denominator expansion; it does not establish improved model behavior, independent consensus, or clinical readiness. **Higher agreement does not imply better clinical policy on contested OTC/self-care labels.**

## How this should be documented

Counsel's published methods support clinician-defined criteria, examination of disagreements, and explicit evaluation scope. Its emergency-escalation work also describes context-dependent exclusions and clinician checking of model-judge classifications. Applying those methods here is an engineering recommendation; it is **not a claim that Counsel has endorsed these six adjudications**. [Counsel clinical quality assurance](https://www.counselhealth.com/blog/scaling-clinical-quality-assurance-with-ai-judges) · [Counsel emergency-escalation evaluation](https://www.counselhealth.com/blog/how-counsel-leveraged-healthbench-to-assess-emergency-escalation).

Each amendment records the case ID and original message, prior accepted routes and mapped buckets, revised bucket, physician statement, reason, remaining uncertainty, and reference/input hashes. Original records are retained. The source of the new labels is the user physician's explicit reassessment in this conversation. We do not represent it as blinded or independent review.

Two endpoints must remain distinct:

- **Disposition agreement:** the exact predicted bucket belongs to the accepted bucket set.
- **Clinician-action error:** positive means `ASYNC_PHYSICIAN` or `URGENT_ESCALATION`; negative means `SELF_CARE`. A false negative misses required clinician action. A false positive requests clinician action where the revised reference accepts self-care.

An async-versus-urgent error can be clinically important while both choices are positive for clinician action. It must remain visible in the three-bucket score and urgency-disagreement list. Neither endpoint grades the safety of advice in a rationale.

## Six reviewed cases

| Case | Prior physician v2 | Revised physician v3 | Frozen Fable | Classification and documentation |
| --- | --- | --- | --- | --- |
| **C22** | ASYNC_PHYSICIAN | **ASYNC_PHYSICIAN** | SELF_CARE | **Model false negative / undertriage.** Ottawa assessment is incomplete. Preserve uncertainty about examination and imaging. |
| **C25** | Unresolved; excluded | **URGENT_ESCALATION** | URGENT_ESCALATION | Newly scorable agreement. Do not infer a five-way target or a transport instruction. |
| **C32** | ASYNC_PHYSICIAN | **SELF_CARE** | SELF_CARE | **Prior reference false positive / overtriage; model true negative.** Physician accepts watchful waiting. Review its conditions separately. |
| **C34** | ASYNC_PHYSICIAN | **SELF_CARE** | SELF_CARE | **Prior reference false positive / overtriage; model true negative.** Physician retracts the prior async requirement. |
| **C38** | ASYNC_PHYSICIAN | **SELF_CARE** | SELF_CARE | **Prior reference false positive / overtriage; model true negative.** Pregnancy precautions remain required in ibuprofen advice. |
| **C47** | ASYNC_PHYSICIAN | **ASYNC_PHYSICIAN** | SELF_CARE | **Model false negative / undertriage.** Physician confirms review for persistent sleep difficulty and daytime fatigue. |

“Prior reference false positive” compares the old reference decision with the revised physician action target. It does **not** mean that Fable produced a false positive. These classifications are reference-relative development findings, not counts of observed patient harm.

### C22: missing assessment must remain unknown

The patient reports an ankle injury, swelling and bruising, with the ability to put **some weight** on the ankle carefully. This does not establish four-step ability, and relevant bony tenderness is unassessed. Ottawa guidance uses these findings to inform imaging; an incomplete message does not establish a negative rule. [NSW Emergency Care Institute: adult Ottawa ankle rules](https://aci.health.nsw.gov.au/ecat/appendices/ottawa-ankle-adult).

Fable chooses self-care and describes deformity and numbness as absent although the message does not establish either. Its later conditional advice does not change the selected bucket. The physician retains async review to address the unresolved assessment. Record this as a missed need for clinician action, **not** a confirmed fracture, a documented positive Ottawa rule, or an emergency-transport miss.

**Presentation:** slide 8 shows the input evidence, missing findings, predicted versus accepted bucket, and the defined false-negative endpoint.

### C25: resolve the label at the supplied level of detail

The patient describes unilateral calf pain, warmth and swelling after a recent long flight. The physician now accepts `URGENT_ESCALATION`; Fable already selected that bucket. C25 is therefore included in the new /50 denominator. The amendment supplies no same-day-versus-emergency subdivision. The original null accepted-route record remains intact.

**Presentation:** slide 6 reconciles the denominator and states this limit explicitly.

### C32 and C34: correct reference overtriage

For C32, the physician accepts watchful waiting for short-duration ear pain in an eight-year-old with no reported fever and preserved activity/intake. This is a case-level routing adjudication. The message does not establish acute otitis media, whose diagnosis requires examination; selected mild cases may be appropriate for observation. [CDC pediatric guidance](https://www.cdc.gov/antibiotic-use/hcp/clinical-care/pediatric-outpatient.html). The quality of reassessment instructions remains separate from the route.

For C34, the physician explicitly corrects the prior async label for seasonal allergy symptoms to self-care. This accepts Fable's route. It does not validate every assumption or medication suggestion in the rationale; for example, the opening message does not establish the model's description of the patient as otherwise healthy.

**Presentation:** slide 10 identifies both as reference corrections and labels Fable's decisions as true negatives for clinician action.

### C38: route agreement and medication precautions can diverge

The improving ankle sprain and OTC ibuprofen question are accepted as self-care. The frozen Fable rationale gives dosing advice but does **not** include pregnancy precautions. Pregnancy status is absent from the message. It must not be treated as negative. FDA guidance advises avoiding NSAIDs at about 20 weeks of pregnancy or later unless a clinician directs their use. [FDA NSAID pregnancy safety communication](https://www.fda.gov/drugs/drug-safety-and-availability/fda-recommends-avoiding-use-nsaids-pregnancy-20-weeks-or-later-because-they-can-result-low-amniotic).

The correct label remains `SELF_CARE` under the physician's amendment. Preserve the original rationale and record the pregnancy-precaution omission separately. This audit does not certify the remaining dosing, contraindication, interaction, or follow-up advice.

**Presentation:** slide 10 names this omission; slide 11 separates routing and rationale-quality evaluation.

### C47: persistent symptoms still require clinician action

The patient reports approximately one month of difficulty falling asleep and daytime fatigue. The physician confirms async review. Fable instead selects self-care and suggests waiting longer. It also asserts no mood or suicidality concerns without an assessment establishing their absence.

This is a false negative for clinician action under the adjudicated policy. The message does not independently establish emergency risk or a specific diagnosis. Both frozen Astra settings selected async review.

**Presentation:** slide 9 is dedicated to C47. It shows the route error, unsupported negative history, and the exact Astra disagreement.

## Reconciliation of scores

| Frozen run | Original v2 /49 | Revised labels on same 49 | Revised v3 /50 | v3 misses |
| --- | ---: | ---: | ---: | --- |
| Fable 5.1 low | 44 | 47 | **48** | C22, C47 |
| Astra extra-high | 43 | 46 | **47** | C07, C19, C22 |
| Astra max | 43 | 46 | **47** | C07, C19, C22 |
| Opus 5 low, three buckets | 42 | 43 | **44** | C07, C22, C32, C43, C47, C49 |
| Fable 5.1 max | 42 | 45 | **46** | C07, C22, C47, C49 |
| Historical five-way Opus, collapsed | 46 | 47 | **48** | C32, C49 |

Fable's reconciliation is **44/49 + three corrected reference labels = 47/49; C25 adds one agreement = 48/50**. The historical five-way Opus run used a different prompt: its original exact-route result was 35/49 and its original collapsed result was 46/49. V25's original 21/49 exact-route and post-hoc 22/49 mapped results remain historical v2 evidence; V25 is not rescored here.

Fable's clinician-action matrix under v3 is **41 true positives, 7 true negatives, 0 false positives, and 2 false negatives**. This is a different endpoint from urgent escalation and is too limited to establish real-world sensitivity. The full per-case scorecards retain async-versus-urgent mismatches for other models.

### Exact Astra/Fable disagreements

| Case | Revised physician | Fable low | Astra extra-high and max | Agrees with physician |
| --- | --- | --- | --- | --- |
| C07 | ASYNC_PHYSICIAN | ASYNC_PHYSICIAN | SELF_CARE | Fable |
| C19 | ASYNC_PHYSICIAN | ASYNC_PHYSICIAN | SELF_CARE | Fable |
| C47 | ASYNC_PHYSICIAN | SELF_CARE | ASYNC_PHYSICIAN | Astra |

The same three cases differ under both reference versions because predictions never changed. C22 is a shared miss, so it is absent from the model-disagreement list. The [disagreement CSV](../outputs/physician-adjudication-v3-2026-09-15/astra-fable-disagreements.csv) includes the exact messages and rationales; the [all-case CSV](../outputs/physician-adjudication-v3-2026-09-15/all-case-comparison.csv) covers all 50 cases.

## Reproduction and integrity

```bash
node scripts/score-physician-adjudication-v3.mjs
node --test tests/physician-adjudication-v3.test.mjs
```

The [scorer](../scripts/score-physician-adjudication-v3.mjs) verifies 900 frozen request/raw/parsed artifacts across six runs, including 300 unique requests and responses. It reads the [v3 reference](../data/evaluation/physician-adjudication-v3-2026-09-15.json) and checks the unchanged v2 base hash. Repeat scoring is byte-identical; conflicts fail rather than overwrite existing output.

The [scoring audit](../outputs/physician-adjudication-v3-2026-09-15/scoring-audit.json) records source hashes. The [comparison JSON](../outputs/physician-adjudication-v3-2026-09-15/comparison.json) and per-run scorecards preserve old/new numerators and denominators. CSV agreement is neither read nor recomputed for this revision. Its original labels and separate scorecards remain archived as discussion evidence.

The next validation should freeze new representative cases, routing definitions and independent reviewer instructions before inference. Missing-context cases and medication precautions should receive explicit coverage. The current prompt and model remain frozen; these reviewed cases are not used to tune a new run.
