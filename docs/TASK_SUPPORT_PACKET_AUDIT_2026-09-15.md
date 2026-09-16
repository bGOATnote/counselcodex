# Task support and applicability: retained-packet audit

## Decision

Do not add another agent or promote a ranking change from this audit. In eight recurring development mismatches, topic recall was often adequate, but descriptive disease text was used to justify a care pathway. The missing distinction is **what task remains and under which conditions**, not simply whether a document contains the right disease name.

This is a $0, read-only replay of the saved `v25-path-b-complete-replay-2026-09-15` packets, using the current retained licensed corpus. No original data, physician reference, historical output, frozen runtime source, query, live selector, provider setting, embedding index or GUI was changed. The four new `src/evidence/rag/task-support*` files are offline diagnostics only.

## What was measured

Sixteen retrospective, author-labelled evidence-role witnesses cover eight cases. Fourteen have exact text in the active retained corpus. Two decision needs have **no authored corpus witness** and are explicitly unscored: a complete applicable ankle imaging rule, and adult OTC ibuprofen product-label dose/duration/safety conditions. Targeted corpus inspection did not find those sources; this is not exhaustive proof of absence or permission to infer a route.

| Accounting level | Result |
| --- | --- |
| Saved cases retained | 8/8 |
| Packet/query/identity accounting failures | 0 |
| Exact labelled witnesses in retained active corpus | 14/14 |
| Witnesses in retrieved candidates | 11/14 |
| Witnesses in the actual selected packet | 11/14 |
| Published responses | 6/8; C07 and C34 remain withheld |
| Diagnostic-description witnesses quoted by published responses | 6/6 |
| Other task/condition witnesses quoted by published responses | 0/4 |

All three missing selected witnesses were also absent from the retrieved candidates. **Reordering those existing hits cannot recover them.** Conversely, three published answers already had the selected diagnostic or setting prerequisites available but did not quote them. New retrieval alone cannot demonstrate a fix for that behavior.

These counts measure exact labelled-span availability and quotation, not general semantic entailment. A different quotation may legitimately support a similar claim. A matching quotation does not prove its source is accurate/current, that the patient satisfies its conditions, or that the system chose the correct route. No clinical score or route failure is inferred from this table. C07/C34 receive no quotation judgment because no answer was published.

## Case-level interpretation

| Case | Retained-packet finding | Engineering implication, not a new clinical verdict |
| --- | --- | --- |
| C07, child fever | Appearance context selected; older-child discharge conditions not retrieved. Several retrieved chunks discuss neonates/young infants or post-assessment ED care. | Do not infer vaccination, identified source, complete hydration/perfusion assessment or eligibility from the patient's age, drinking and playfulness. A better population/task packet is needed; an ED discharge passage alone is not a remote clearance rule. |
| C12, worsening COPD | Definition quoted; ED discharge prerequisites were selected but not quoted. | Recognition of exacerbation does not decide ambulance versus other care. Post-treatment oxygenation/functional criteria cannot be imported as observed patient facts. The physician-reference disagreement still needs clinical adjudication. |
| C13, new hand sensory symptoms | Nocturnal-pattern text quoted; diagnostic-provider/early-assessment text already selected but not quoted. | A common pattern is not proof that no clinician task remains. More topic retrieval will not by itself correct this inference. The source does not determine internal queue priority. |
| C22, ankle injury | Sprain-description text quoted; no complete ankle-rule witness authored. | Sprain topic matching and partial weight bearing do not constitute a completed fracture assessment. Add properly reusable decision-rule evidence before testing that capability, not a hard-coded case answer. |
| C32, child ear pain | Self-limited AOM text quoted; middle-ear diagnostic criteria already selected but not quoted. | A condition's natural history cannot confirm that condition in undifferentiated ear pain. Eventual examination need and today's urgency remain separate decisions. |
| C34, allergy OTC request | Medicine-specific contraindication context selected; ED follow-up clause not retrieved; answer withheld. | Do not label the withheld answer clinically wrong. ED treatment context is not a complete product label or a mandate for clinician review of every OTC question. |
| C38, ibuprofen question | Sprain-treatment context quoted; no adult OTC product-label witness authored. | Recovery advice answers the disease topic, not the user's medication dose/duration question. General drug-safety and unrelated ED dosing passages are not substitutes. |
| C47, sleep difficulty | Sleep-habit text quoted; the conditional instruction to treat an underlying cause was not retrieved. | Self-management can help without proving no assessment remains. That conditional also cannot establish a cause, timing or queue priority on its own. |

Source quality needs separate attention: the retained MedlinePlus insomnia summary literally uses a month-long chronicity threshold, already identified as a currency concern in the earlier disposition-support audit. This task preserves the frozen corpus/quarantine and reports the issue; it does not endorse that threshold, change the source, or create a new quarantine rule during an active frozen comparison.

## Smallest next experiment

1. Keep the original message as the sole source of patient facts. Distinguish an unresolved **diagnostic confirmation**, **medication-safety**, **care-setting eligibility**, or **follow-through** task from a symptom-description query. No expected route or physician answer belongs in retrieval input.
2. Freeze a small prospective packet challenge before changing retrieval. Require the useful supporting clause **with its population, preconditions and care stage**, including negative controls where ED post-treatment advice must not become initial telehealth eligibility. Unknown patient characteristics remain unknown; do not remove all uncertain-population sources or infer demographics from them.
3. Repair actual corpus gaps with verified reusable sources, not broader disease-topic coverage. Product labelling, validated examination/testing criteria and outpatient assessment guidance may add distinct value; licence, currency, identity and applicability checks remain separate.
4. Test whether a concise producer instruction improves **use of already selected prerequisites** at fixed source packet, model and budget. Measure routing and unsupported eligibility assertions independently. Do not insist on quoting every diagnostic prerequisite when it is irrelevant, and do not force an exam-today instruction merely because a diagnostic examination eventually matters.

A source-class boost is not justified: a patient summary may carry explicit action advice, and an agent-compiled `Disposition` heading may describe a different patient population or stage of care. Metadata can help expose scope, but cannot substitute for the actual conditional text or patient-level clinical judgment.

## Reproduce

```bash
node --experimental-strip-types --test src/evidence/rag/task-support-audit.test.ts
node --experimental-strip-types src/evidence/rag/task-support-replay.ts
```

Replay prints all 16 rows, exact-source/input hashes, incomplete attempts and unlabelled roles; it writes no files and makes no provider or embedding calls. Corpus hash: `af7e4a8c239c4b084525aba008d56ce833b3a08144cea6237319bf996aa30dbd`. Selected input manifest hash: `684fe4421971cf5cce26349e560cbf994136fdc9aff8b16a082fb365b2eab6d9`.

The witnesses were authored after inspecting these failures and must never be represented as held-out, physician-scored, clinically validated or generalizable measured lift. The default runtime and frozen study remain unchanged.

Verification: all 32 focused RAG tests (including seven new audit tests), TypeScript checking, lint and the full `npm test` chain passed. All 44 protected disposition/selection/model/quarantine source hashes matched the active generated-context study plan. These are software/integrity checks, not medical validation.
