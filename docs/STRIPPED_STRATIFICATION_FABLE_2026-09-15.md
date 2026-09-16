# Conditional timing stratification after three-bucket routing

15 September 2026 · One frozen second-stage experiment · Fable 5.1, low effort

## Result

The second stage produced **41 valid timing decisions from 41 calls**, with nine self-care cases passed through. Every resulting subtype maps back to its original parent bucket.

**Three-bucket agreement remains 48/50, including C25 as urgent and C32, C34 and C38 as self-care.** All physician corrections are retained. The separate five-way score uses 49 cases only because C25 has no adjudicated emergency-versus-same-day timing label.

| Evaluation | Agreement | Meaning |
| --- | ---: | --- |
| Parent bucket | **48/50** | Inherited frozen result; no first-stage rerun |
| Async timing | **11/16** | Prompt versus routine review |
| Urgent timing | **20/24** | Emergency action now versus in-person assessment today; C25 excluded |
| Conditional subtype | **31/40** | Correct parent and an available finer physician label |
| End-to-end five-way route | **38/49** | Includes the original parent errors; C25 finer urgency unadjudicated |

The experiment shows that a valid timing label can be added without changing the parent category. It does **not** show that the finer timing decision is clinically reliable. Nine new subtype disagreements remain: four more urgent and five less urgent than the existing accepted routes. The 48/50 parent result is preserved by construction, not independently reproduced.

## Plain-language choices for the model

The user requested wording that makes the within-category task easy to recognize. The second stage answers a timing question and returns **choice 1 or 2**, with a short rationale. Code maps that choice to the canonical label.

| Fixed parent | Model-facing option | Stored subtype |
| --- | --- | --- |
| ASYNC_PHYSICIAN | 1. Needs prompt physician review | PRIORITY_ASYNC |
| ASYNC_PHYSICIAN | 2. Can wait for routine physician review | STANDARD_ASYNC |
| URGENT_ESCALATION | 1. Needs emergency action now | EMERGENCY_NOW |
| URGENT_ESCALATION | 2. Needs in-person assessment today | SAME_DAY_IN_PERSON |
| SELF_CARE | No second-stage call | SELF_CARE |

“Assessment today” is defined as same-day care without immediate emergency action, so it does not overlap with option 1. The prompts do not invent exact review deadlines or an institutional service-level commitment. The async prompt classifies medication refills and prescribing assessments as prompt review, consistent with the previously requested priority-async definition. The resulting conflict with four finer reference labels is reported below.

This run combines natural-language choices with conditioning on the parent category. It does not isolate the effect of wording from the effect of splitting the task into stages.

## Frozen execution

1. Verify the existing 50 Fable three-bucket requests, raw responses and parsed outputs against their frozen hashes.
2. Use each **model-predicted parent**, without consulting physician labels or selecting only correct cases.
3. Pass nine SELF_CARE outputs through unchanged. For 16 ASYNC_PHYSICIAN and 25 URGENT_ESCALATION outputs, call Fable once with the corresponding two-option timing prompt.
4. Send only the original patient message as user content. The fixed parent appears through the system prompt. No first-stage rationale, case ID, physician answer, CSV label, retrieval, or judge output enters the request.
5. Parse the numeric choice and map it within that parent. Reject invalid output rather than change the parent, retry, or use a fallback.
6. Freeze all generation artifacts before reading the physician references for scoring.

The model settings match the parent run: `claude-fable-5-1`, adaptive thinking, low effort, maximum output 4096 tokens. No further prompt iteration was performed after inspecting these results.

| Prompt | SHA-256 |
| --- | --- |
| Original parent, unchanged | `80810b85df956d779709a71dbc0d85534f5847e2563b0be5235048cb254a03ce` |
| Async timing | `e507edeb8b25a28b241ab4ad04f9ce45bc1659f64e9db71c0cad95811b0bed3f` |
| Urgent timing | `80a75a1394038f409ea98bf633f22de15e8df84685cca7656faafe73b9b69fae` |

[Manifest and exact prompts](../outputs/stripped-stratification-fable-2026-09-15/manifest.json) · [Generation freeze](../outputs/stripped-stratification-fable-2026-09-15/generation-complete.json).

## Finer physician reference and denominators

The existing [v3 physician reference](../data/evaluation/physician-adjudication-v3-2026-09-15.json) supplies parent buckets. Finer accepted routes are carried forward from [v2](../data/evaluation/physician-system-reference-v2.json) where the parent remains consistent. The v3 corrections for C32, C34 and C38 resolve to SELF_CARE, which has no finer split.

C25 is accepted as URGENT_ESCALATION in v3 but has no adjudicated same-day-versus-emergency label. The model chose SAME_DAY_IN_PERSON; that prediction is retained and **not scored as correct or incorrect at the finer level**.

The physician subsequently reaffirmed C25 as urgent and noted that an early-day asynchronous pathway might be feasible with sufficient resources and coordination. This is a contextual operational observation, not an additional accepted ASYNC_PHYSICIAN label. The accepted urgent bucket remains unchanged; no queue or availability assumptions enter this message-only experiment.

| Saved physician correction | Three-bucket score | Finer timing score |
| --- | --- | --- |
| C25: URGENT_ESCALATION | Included and correct in 48/50 | Emergency-versus-same-day label unscored |
| C32: SELF_CARE with watchful waiting | Included and correct in 48/50 | Included and correct in 38/49 |
| C34: SELF_CARE | Included and correct in 48/50 | Included and correct in 38/49 |
| C38: SELF_CARE; pregnancy precautions require separate review | Included and correct in 48/50 | Included and correct in 38/49 |

C22 and C47 remain parent errors. They receive no subtype call because the frozen model selected SELF_CARE. Both remain misses in the end-to-end score. The maximum possible finer agreement with these parents is therefore **47/49**.

The conditional denominator is 40: all 41 non-self-care parent predictions minus C25. All those parent predictions agree with v3. Conditional subtype agreement excludes the two parent errors by definition; the end-to-end score retains them. Any provider or parsing failure would remain in its applicable denominator. This run had none.

A separately labeled sensitivity analysis applies the original v2 finer reference to these same outputs: **35/49**. The primary v3-adjusted score is **38/49**. The difference is exactly the C32/C34/C38 reference corrections; neither computation changes a prediction. This avoids comparing the current numerator with a historical model result under a different reference. [Original-v2 sensitivity scorecard](../outputs/stripped-stratification-fable-2026-09-15/scorecard-original-v2.json).

These finer targets have not been independently re-adjudicated for this new timing task. The reference is development-derived, and v3 includes unblinded post-output corrections. Reference-relative timing disagreement is not a measured patient outcome.

## All nine new subtype disagreements

| Case | Message summary | Model subtype | Accepted finer route | Interpretation |
| --- | --- | --- | --- | --- |
| **C06** | Stable losartan refill | PRIORITY_ASYNC | STANDARD_ASYNC | Refill-rule/reference conflict |
| **C18** | Albuterol refill; infrequent use | PRIORITY_ASYNC | STANDARD_ASYNC | Refill-rule/reference conflict |
| **C24** | Stable contraceptive refill | PRIORITY_ASYNC | STANDARD_ASYNC | Refill-rule/reference conflict |
| **C46** | Stable finasteride refill | PRIORITY_ASYNC | STANDARD_ASYNC | Refill-rule/reference conflict |
| **C13** | Several days of hand numbness/tingling | STANDARD_ASYNC | PRIORITY_ASYNC | Less urgent review than accepted |
| **C12** | COPD with worsening exertional breathlessness | SAME_DAY_IN_PERSON | EMERGENCY_NOW | Less urgent action than accepted |
| **C16** | Infant with fever, reduced feeding and wet diapers | SAME_DAY_IN_PERSON | EMERGENCY_NOW | Less urgent action than accepted |
| **C28** | Early pregnancy bleeding with cramping | SAME_DAY_IN_PERSON | EMERGENCY_NOW | Less urgent action than accepted |
| **C44** | Worsening edema and breathlessness lying flat | SAME_DAY_IN_PERSON | EMERGENCY_NOW | Less urgent action than accepted |

The four refill disagreements follow an explicit prompt rule. They remain counted as misses against the current finer reference; they are not silently removed or relabeled as successes. Resolving this requires an agreed refill-priority policy, not retrospective correction of the model output.

The other five subtype disagreements request less urgent action than the accepted route. Several rationales rely on additional concerning findings not being described. That observation should be reviewed separately from the route label: unreported findings have not necessarily been assessed. This report preserves the exact rationale and makes no new physician adjudication.

[All exact messages and decisions](../outputs/stripped-stratification-fable-2026-09-15/all-case-scorecard.csv) · [All finer misses, including parent errors](../outputs/stripped-stratification-fable-2026-09-15/misses.csv) · [Physician scorecard](../outputs/stripped-stratification-fable-2026-09-15/scorecard-physician.json).

## Timing and neutral usage accounting

The added subtype call had a **4.112-second median** and **6.039-second p95**, using nearest-rank p95 over the 41 calls. Adding each case's historical parent latency to its new subtype latency gives an estimated **7.708-second median** and **9.709-second p95** over all 50 cases, including self-care pass-throughs. These sums come from separate runs; they are **not directly observed end-to-end latency from a fresh two-call pipeline**.

The 41 new calls total **$0.298400** using the existing token-price estimate and **$0.390150** under conservative accounting. The prospective reservation was $10.745520 within the reconciled allocation. Existing GUI reservation remains separate. These are scoped experiment records, not provider invoices or a total-project figure. No financial content is added to the slides.

## Implementation and review status

- [Typed protocol and mapping](../src/stripped/stratification.ts): two natural-language prompts, strict numeric-choice parsing, parent-preserving mapping.
- [Experiment runner](../scripts/stripped-stratification-fable.mjs): frozen parent replay, one conditional call per eligible case, source/request/output hashes, interrupted-run protection and usage accounting.
- [Offline scorer](../scripts/score-stripped-stratification.mjs): validates freezes before loading references and keeps parent, conditional and end-to-end outcomes separate.

The current `/stripped` demonstration remains the original three-bucket workflow. This addition is an isolated conditional experiment; the live interface, original first-stage producer and `/candidate` V25 are unchanged. Four urgent timing disagreements and the refill-policy conflict remain unresolved, so the experiment does not justify treating the five-way result as an established replacement.

Higher agreement does not imply better clinical policy on contested labels. Correct routing also does not establish safe medication advice or patient-care readiness.

## Reproduce without further model calls

```bash
node scripts/score-stripped-stratification.mjs
node --test tests/stripped-stratification-protocol.test.mjs tests/stripped-stratification-score.test.mjs
```

Generation is already frozen. The generator refuses another run in this output directory. Preserve the existing requests and outputs; scoring does not modify them or call a provider.
