# Submission evidence and failure review

15 September 2026 · Physician adjudication v3; presentation revision 14 reviewed on 16 September

## Scope and conclusion

This review examines assignment coverage, reference provenance, model comparison, software evidence, and presentation claims. It is an evidence audit, not a new clinical robustness experiment or safety certification.

The current demonstration is `/stripped`: one incoming synthetic message, one Fable 5.1 low-effort call through TypeScript/Mastra, one bucket and short rationale. Frozen outputs agree on **48/50** revised physician labels, compared with **44/49** under v2. The difference comes entirely from physician-reference amendments and the inclusion of C25. **C22 and C47 remain model undertriage cases.** Slides 2 and 3 identify them as false negatives for required clinician review. Their possible harm mechanism is delayed assessment, not an observed patient outcome. The rationale in C38 omits pregnancy precautions despite agreement on the route.

## Findings and disposition

| Finding | Evidence and action | Residual limitation |
| --- | --- | --- |
| A reference revision could be mistaken for model improvement | Preserve v2, add explicit v3 amendments, show 44/49 → 47/49 on common cases → 48/50 with C25 | Review was unblinded and conducted on known development cases |
| Reference overtriage could be mislabeled as a model false positive | C32/C34/C38 are prior-reference false positives for clinician action; Fable is a true negative under v3 | The physician correction does not independently validate every model rationale |
| Missing clinical information could be treated as negative | C22 lacks a complete Ottawa assessment; C47 lacks the mood/suicidality assessment asserted in the rationale. Both slides visibly identify the missed review and potential delayed assessment | Clinical assessment and model robustness on missing-context inputs remain unvalidated; no observed harm was measured |
| A simplified educational diagram could be mistaken for the complete clinical rule | Appendix 16 visibly corrects the weight-bearing criterion and cites the clinical source; all images stay outside the scored input | The supplied illustration has unverified authorship and licensing; photographs have unverified synthetic provenance |
| Correct routing could obscure medication advice omissions | C38 receives the accepted self-care bucket; pregnancy precautions remain a separate documented concern | No complete independent rationale-quality assessment has been performed |
| A changed denominator could hide exclusions | C25 becomes URGENT_ESCALATION only in the new three-bucket reference and enters /50 | The amendment does not specify same-day versus immediate emergency action |
| A selected single pass could be presented as a stable ranking | Fable 48/50; Astra extra-high/max 47/50; all exact differences are C07/C19/C47 | One pass per setting and prior case exposure do not establish model superiority |
| Taxonomy mapping could appear to improve predictions | Historical five-way Opus 35/49 becomes 46/49 under the original three-bucket mapping; v3 gives 48/50 | This run used a different prompt; coarser labels discard clinically relevant detail |
| V25 could be compared as an equivalent workload | Retain 27/50 full releases, 21/49 exact-route and 22/49 mapped agreement under v2 | Prompt, model configuration, responsibilities, and output contract changed together |
| A historical diagram could be mistaken for the current or executed architecture | Slide 4 visibly labels the proposal and distinguishes observed V25 results, nonclinical release language, and current scorecard-only gold use | Every pictured component is not asserted to have executed; the comparison cannot isolate a causal component effect |
| Case summaries could obscure missing input facts | Slides 2/3 show exact C22/C47 messages; appendices 23–28 show the other 17 substantively discussed inputs verbatim | Exact reproduction makes review auditable but does not add clinical facts absent from the messages |
| The live interface could be mistaken for a frozen benchmark record | Demo script distinguishes fresh submissions from archived results and labeled fallbacks | Future provider availability and output variation are not guaranteed |
| A stale answer could appear after an edit | Prior browser verification exercised in-flight editing; protocol and workflow tests verify matching | Software verification does not establish clinical correctness |
| Source material could be treated as authorization | Brief, role profile, and judge paper inform the requirements and methods | No external submission or communication is inferred from an attachment |

The [v3 report](PHYSICIAN_ADJUDICATION_V3_2026-09-15.md) contains exact amendments, rationale observations, source references, model differences, and reproduction commands. The [original appendix](EVAL_APPENDIX_2026-09-15.md) remains labeled as v2 evidence.

## Endpoint definitions

For the binary **clinician-action endpoint**, `ASYNC_PHYSICIAN` and `URGENT_ESCALATION` are positive; `SELF_CARE` is negative. Fable has 41 true positives, 7 true negatives, 0 false positives and 2 false negatives under v3. These counts must not be presented as emergency-escalation sensitivity or observed harm rates.

The exact three-bucket score remains primary. A prediction of async when urgent care is accepted is a route disagreement even though both are positive for clinician action. Such disagreements remain explicit in other models' scorecards. The three-bucket urgent category itself does not establish timing, transport, or successful care delivery.

## Independence and provenance

The scorer verifies frozen request/raw/parsed hashes and applies the revised physician reference offline. It reads no CSV labels and makes no provider calls. This protects request and scoring separation, but it cannot make a development-exposed case set independent. The new labels are explicitly attributed to the user physician's post-output reassessment.

The CSV remains an archived discussion baseline. Its original scorecards are neither blended with the physician score nor used to select a candidate. Preserving them documents the supplied workflow labels without treating agreement as evidence of clinical quality.

The public clinical-quality-assurance methods and the supplied judge report motivate clinician-defined criteria and review of disagreements. Their reported performance does not transfer to this prototype. `/stripped` has no model judge, and its rationale has no comprehensive independent clinical score.

## Assignment coverage

| Objective | Current evidence | Status |
| --- | --- | --- |
| Understand and scope the routing problem | Three exact buckets; documented supplied-data mismatch and clinical boundaries | Delivered for the assignment context |
| Working lightweight prototype | `/stripped`, one Mastra step and native provider request | Implemented; prior live browser evidence retained |
| Define and evaluate the target | Original v2 plus explicit v3 physician amendments; all 50 cases | Development evaluation delivered; independent validation remains future work |
| Explain failures and alternatives | Dedicated C22/C47 slides; reference-correction slide; exact Astra/Fable differences | Delivered |
| Presentation and live demonstration | 28 slides: 15 main, seven-minute live demo, thirteen appendix slides; planned 35-minute session | Exported and rendered; timed human rehearsal remains |
| Synthetic data only | Original supplied synthetic messages and labeled edits | Maintained for evaluation. Two user-requested photographs on slide 2 have unverified synthetic provenance. The Ottawa illustration in appendix 16 has unverified authorship and licensing. All three stay outside the scored input. |
| Original 6–8-hour timebox | Extended project history disclosed | Exceeded; cannot be retroactively satisfied |
| Submission and optional repository access | Portable slide and workbook package; repository link | User submission and recipient access require separate handoff verification |

The [requirements audit](TAKE_HOME_REQUIREMENTS_AUDIT_2026-09-15.md) retains source-page mappings and neutral historical usage accounting. Financial content is absent from the current slide deck and speaker notes.

## Engineering verification and its limits

Existing protocol tests compare all 50 frozen Fable requests and replay all 50 outputs through the current parser. The six prior browser calls cover the three buckets, an edited message, and an intentionally discarded stale result. Offline integrity checks verify preserved baseline files and separately reproduce the v3 amendment scores.

The current adjudication introduces no application, model-request, prompt, retrieval, queue, or V25 change. Earlier adversarial experiments against other configurations do not establish robustness of this protocol. Negation, subject attribution, instruction attacks, multilingual inputs, and rare clinical failures require a separate evaluation.

## Next clinical review

1. Agree on the self-care boundary, prescribing-review policy, and urgency definitions before another model comparison.
2. Freeze new representative cases and instructions for independent reviewers.
3. Score disposition, missed clinician action, unnecessary escalation, and rationale quality separately.
4. Preserve disagreement and uncertainty; do not revise submitted model outputs.
5. Use review results to decide whether a change is warranted, then evaluate that change on a further independent set.

No additional model iteration is justified solely by the revised 48/50 agreement. The unresolved questions concern clinical policy, missing information, advice quality, and generalization.
