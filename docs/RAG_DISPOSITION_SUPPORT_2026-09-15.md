# Disposition support, not just topic retrieval

## Scope and result

This is an offline development audit. It changes neither live retrieval nor the V25 release path, frozen outputs, original data, physician reference, or queue policy. No paid calls, corpus rebuild, source ingestion, or network retrieval were performed by the replay. Earlier source research used public web pages only.

The main failure patterns are:

- A likely benign explanation is mistaken for absence of a clinician task.
- An examination needed to establish a diagnosis is mistaken for an examination required today.
- A post-diagnosis or post-treatment management recommendation is applied before its eligibility conditions have been established.
- A source about the correct condition is cited for a management, timing, or medication claim that its quoted passage does not support.

These are different defects. Increasing topic-document recall alone cannot establish that any one of them is fixed.

## Existing corpus and smallest useful change

The retained corpus hash is `af7e4a8c239c4b084525aba008d56ce833b3a08144cea6237319bf996aa30dbd`: 1,393 retained documents (1,021 patient summaries, 370 research syntheses, two documents labelled primary guidelines), with 5,205 active chunks. These are inventory counts and metadata labels, not endorsements of completeness, source classification, currency, or clinical accuracy. The existing quarantine remains respected.

The strongest immediately reusable passages include NIH/NHLBI suspected-heart-attack action advice, CDC stroke action advice, CDC thromboembolism testing advice, and the licensed migraine consensus article's treatment-review recommendations. Patient summaries containing explicit emergency instructions must not be categorically demoted beneath an agent-authored ED synthesis. Conversely, a synthesis's `Disposition` heading does not establish primary-source authority or remote applicability.

An especially instructive error paired a **definition of vertigo** with a claim about neurological emergency warnings. The correct conditional warning already exists later in the retained MedlinePlus document. Thus this is not necessarily a missing-source problem: the wrong quotation was selected for the claim. Exact quote identity and correct document retrieval both coexist with unsupported attribution.

Read-only replay of that saved citation returned `identityBound: true`, `exactAuthoredClaim: true`, and `support: authored_support_span_missing`. The regression also covers the harder accounting case where the correct warning is elsewhere in the same chunk: it still cannot rescue the wrong submitted quotation. This narrow oracle is not a general contradiction detector and is never used as a live release gate.

The proposed next retrieval experiment is small: preserve the topic query and add the unresolved **decision need** (home-management eligibility, diagnostic examination/testing, medication safety, or care-setting criteria). Preserve patient facts, negation, and uncertainty without inventing symptoms. Retrieve the supporting passage plus its conditions; do not insert expected routes, case identifiers, or physician reference answers into retrieval documents or prompts. Compare at a fixed passage budget before changing the live selector. No additional retrieval agent is justified by this audit alone.

## Offline support-span measurement

New evaluator files under `src/evidence/rag/disposition-support*` provide two distinct checks:

1. **Support opportunity:** are all exact, author-labelled supporting spans available in the selected packet? This is a stricter retrieval witness than a topic-document hit, not a general semantic judge.
2. **Authored citation regression:** for an exact, pre-authored claim, do its bound quotations include the required supporting spans? Support elsewhere in the same chunk cannot rescue a wrong submitted quote. New or paraphrased claims remain unassessed rather than being fuzzily assigned a passing label.

Every requirement must match; there is no empty-requirement pass. Empty packets, retrieval failures, degraded retrieval, invalid hashes, conflicting identities, and incomplete query accounting are retained. A partial packet surviving a retrieval failure does not turn the failed attempt into a success. Superseded/retracted passages cannot supply support. Metadata is not support text. Patient applicability and clinical correctness remain `not_assessed` even after an authored match.

Five witnesses cover suspected cardiac emergency action, stroke symptom-plus-action conjunction, thromboembolism testing, migraine treatment review, and the conditional vertigo warning. All required spans are present in the retained active corpus. Four witnesses can be replayed against existing saved retrieval probes; the vertigo pair is a focused citation regression. These witnesses were authored **retrospectively after examining failures**, are not physician gold, and are not a held-out clinical evaluation.

### Saved-packet replay

The replay uses four previously authored queries, each in raw/hinted lexical/hybrid variants, with both selectors: 32 replay rows from 16 saved packet files. A topic hit means the expected document appeared, regardless of section; a support opportunity requires every authored supporting span. Both selectors produced identical counts:

| Saved retrieval mode | Topic documents present | Required support opportunities present | V25 versus V26 |
| --- | ---: | ---: | --- |
| Lexical, raw | 2/4 | 1/4 | Identical |
| Lexical, intent hinted | 3/4 | 2/4 | Identical |
| Hybrid, raw | 4/4 | 3/4 | Identical |
| Hybrid, intent hinted | 4/4 | 3/4 | Identical |

All 32 replay rows were accounted for, with zero empty packets and zero retrieval/integrity failures in these saved inputs. That is **not** evidence that empty packets or failures cannot occur; separate regression tests inject them and retain them in the denominator. The migraine review witness was missing from selected spans in every group even when its topic document was present. Failure to retrieve this exact witness is not proof that every other passage is semantically incapable of supporting a similar claim.

This subset demonstrates **no selector lift**. It does not estimate patient-level accuracy, justify promotion, establish new response latency, or grade live generated claims. Ranking weights were not tuned after this replay.

Reproduce without APIs or output-file mutation:

```bash
node --experimental-strip-types --test src/evidence/rag/disposition-support.test.ts src/evidence/rag/v26.test.ts
node --experimental-strip-types src/evidence/rag/disposition-support-replay.ts
```

The replay prints source hashes, probe hash, corpus hash and saved-input file hashes with its results. It fails closed on a corpus mismatch and retains per-probe artifact failures. It does not require API keys. Focused verification initially passed all 17 tests; these software tests are separate from clinical evidence.

## Clinical support boundaries and missing evidence

These are generalizable task definitions, not case lookup rules. The physician-designated reference remains the development comparator. Its available rationale is the designated prior system output; blank free-text physician notes must not be represented as independently authored rationales.

| Clinical task | What the evidence supports | What it does not establish |
| --- | --- | --- |
| Young child with fever | Remote assessment should identify serious-illness features; home care is allowed after a low-risk assessment, with return precautions. | Drinking/playfulness alone is not a complete risk assessment; neither does all fever mandate escalation. Use the remote-assessment recommendations, not an ED discharge assumption. [NICE NG143 §1.3](https://www.nice.org.uk/guidance/NG143/chapter/recommendations) |
| Worsening COPD with activity limitation | Place of care depends on severity, deterioration, ability to cope, physiology and available resources. Some exacerbations affecting daily activity are treated in the community. | Purulent sputum or age alone does not mandate ambulance transport; absent measurements cannot be declared normal. A disease definition does not choose the care setting. [NICE NG115 §1.3 and table 7](https://www.nice.org.uk/guidance/ng115/chapter/Recommendations) |
| New hand sensory symptoms | Onset and pattern determine urgency. Sudden unilateral numbness requires vascular assessment; the short-lived waking-tingling exception has specific conditions. | Nocturnal worsening does not establish a confirmed peripheral diagnosis. Referral timing within this service is a separate physician-approved workflow policy. [NICE NG127 §1.10](https://www.nice.org.uk/guidance/ng127/chapter/Recommendations-for-adults-aged-over-16) |
| Ankle injury | Clinical weight-bearing and bony-tenderness criteria inform the imaging decision. | Partial weight-bearing is not a completed negative Ottawa assessment. Missing criteria alone do not establish an emergency. [ACR ankle criteria](https://acsearch.acr.org/docs/69436/Narrative/) |
| Child with new ear pain | AOM diagnosis requires middle-ear findings. Selected mild AOM can undergo watchful waiting with shared decision-making. | Undifferentiated ear pain is not already confirmed mild AOM. Diagnostic assessment need does not automatically imply same-day emergency assessment. [CDC pediatric guidance](https://www.cdc.gov/antibiotic-use/hcp/clinical-care/pediatric-outpatient.html) |
| Familiar seasonal-allergy OTC request | Pharmacist/OTC self-management is often appropriate without GP review. | A more conservative clinician-owned personalized medication policy is not a universal guideline mandate. Drug-specific advice still needs contraindication and label support. [NHS allergic rhinitis](https://www.nhs.uk/conditions/allergic-rhinitis/) |
| Personalized ibuprofen dose/duration | Product labelling supplies dose/duration limits, warnings, and circumstances requiring professional advice. | Sprain healing information cannot support medication safety; general label education and an individualized safe regimen are different tasks. [DailyMed label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cd3060a5-3b90-42e4-89cd-3b620859045f) |
| Persistent insomnia and daytime burden | NIH advises clinician discussion when sleep problems affect daily activities and assessment of contributors. | One month alone is not the current chronic-insomnia threshold; persistent burden should not be deferred merely because it is not an emergency. [NHLBI diagnosis](https://www.nhlbi.nih.gov/health/insomnia/diagnosis) |
| Positional vertigo | Diagnostic differentiation and positional examination can matter. Observation with follow-up is an option for assessed BPPV. | An examination needed eventually does not prove examination is required today. Observation evidence does not confirm a diagnosis from chat. [AAO-HNS guideline summary, p.28](https://bulletin.entnet.org/wp-content/uploads/2017/02/Bulletin_Mar17_web.pdf) |

**Reachability and reuse caveat:** CDC, NHS, NHLBI and DailyMed content opened successfully in the research tool on this date. NICE and ACR official content was retrieved through indexed results, but direct opens returned access errors; do not label them successfully HTTP-verified. The AAO-HNS landing page opened, and its published summary was available through indexed official content; the PDF was not independently downloaded/rendered. These links are research citations, not newly ingested corpus documents. Successful access does not establish a redistribution licence. In particular, do not copy NHS/NICE/ACR or society text into an Apache-2.0 corpus solely because it is publicly readable; verify each source's permitted reuse or retain citation-only provenance.

## Next acceptance criteria

- Keep clinician task ownership, clinical urgency, service availability and eventual examination need distinct. A statement of uncertainty must not automatically become either home care or emergency care.
- Require an explicit delay-harm/capability rationale for an examination-today instruction, not just the existence of a physical-exam dependency.
- Evaluate the exact generated claim against its exact cited quote, including omitted conditions, independently of passage identity and HTTP status.
- Add a small prospectively frozen challenge set of decision needs and eligible alternatives before changing ranking or adding sources; retain absent-source and empty-packet failures. This audit's retrospective witnesses cannot become a held-out result.
- Evaluate clinician-policy agreement and clinical support separately. Do not overwrite the physician comparator or treat every defensible alternative as a guideline violation. No model or source attestation is manufactured here.
