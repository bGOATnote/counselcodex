# Workflow-aware study: preflight interpretation review

Reviewed September 16, 2026, before disposition generation. This is an engineering and reporting review, **not clinical approval**. No clinical targets, prompts, source cards or historical results were changed by this review.

## Scope and conclusion

Compared the research plan with `protocol.ts`, the 48 challenge messages and proposed targets, their dataset method, the seven evidence cards, the reference freeze, and the analysis definitions. The planned comparison supports a bounded development experiment. It cannot establish safe autonomous triage, a production operating policy, or an acceptable rate of patient harm.

The following interpretation issues should accompany every results summary. The first three need explicit wording in the main study narrative; the remaining limits are already documented and must survive presentation shortening.

| Finding | Action | Review status |
|---|---|---|
| Physician v3 is a **single-physician post-output reassessment of a familiar development cohort**, as the reference freeze records. A new pre-generation freeze does not make those labels prospective or blinded. | Describe the outcome as agreement with the frozen v3 reassessment; reserve independent clinical validation for genuinely new, prospectively reviewed cases. | Main-plan clarification requested. |
| Challenge authorship and evidence-topic selection were informed by earlier failures and the proposed contract. New wording is not independent validation. | State this development dependence alongside the AI-authored, unreviewed designation; keep challenge compatibility separate from physician agreement. | Dataset method is explicit; main-plan clarification requested. |
| “24 controlled pairs” could suggest 24 isolated causal interventions. Several pairs change linked symptom clusters; one changes dose count and duration together. | Prefer “24 paired development probes.” Use each pair registry's actual change when interpreting a flip. | Dataset method is explicit; main-plan wording clarification requested. |
| The contract arm also changes handling of unknown information and patient instructions. The evidence arm adds selection, source text and applicability instructions together. | Attribute any difference to the tested package, not one sentence or retrieval alone. | Plan already identifies combined effects. |
| Fable and Nano differ in model, quantization, thinking mode, schema enforcement and output limit. Temperature-zero Nano repetitions mainly probe execution stability. | Report model-configuration comparisons and per-repetition results; do not claim isolated model-size effects, rare-error reliability or additional independent patients. | Main configuration limits are explicit; retain the repetition qualification. |
| Challenge alternatives cross endpoint boundaries: six cases permit either self-care or clinician action; five permit either async or urgent. Timing annotations are proposed review aids, not model outputs. | Retain ambiguity counts and endpoint-specific denominators. A compatible bucket does not prove that proposed timing was met. | Scorer separates ambiguous endpoints; preserve this in results. |

## Clinical meaning that must remain intact

- A rapid physician response is a channel property, not evidence that examination, imaging, treatment or transfer occurred. Public averages do not establish an individual response guarantee. The provider's [service description](https://www.counselhealth.com/) and [informed consent](https://www.counselhealth.com/informed-consent) do not supply this prototype's operating contract.
- A self-care false negative means the machine-consumed disposition omitted clinician action required by the chosen reference. The C22/C47 examples illustrate that failure mode. This study observes neither actual patient injury nor time to completed care. An urgent-reference disagreement that still selects physician review is a separate error category; it is not automatically evidence of harmful delay.
- Urgent merges same-day assessment and emergency action. Bucket agreement cannot validate emergency timing, counseling, diagnostic accuracy or referral completion. Rationale text is a decision summary, not a verified account of internal reasoning.
- The authored pediatric and caregiver probes test scope handling. They are not evidence of performance in a representative adult service population. Keep them visible rather than silently removing difficult or out-of-scope cases after generation.

## Source and applicability checks

The source-card review retains complete Ottawa weight-bearing timing and anatomic criteria; it does not validate patient self-palpation or a remote rule-out examination. The sleep card distinguishes the chronic-insomnia definition from when impaired daily function merits assessment. The pregnancy card retains the prescribed low-dose aspirin and direct-to-eye NSAID exceptions. The cards do not assign case answers or claim clinical review. [Adult Ottawa guidance](https://aci.health.nsw.gov.au/ecat/appendices/ottawa-ankle-adult), [NHLBI sleep assessment](https://www.nhlbi.nih.gov/health/insomnia/diagnosis), [FDA medication warning](https://www.fda.gov/drugs/drug-safety-and-availability/fda-recommends-avoiding-use-nsaids-pregnancy-20-weeks-or-later-because-they-can-result-low-amniotic).

Card hashes identify the curated text, not an archived publisher page or its medical correctness. Complete selected clauses matter; adjacent unselected text is not model evidence. Dense ranking operates only within lexical eligibility, so this experiment cannot measure unrestricted semantic retrieval's ability to recover missed topics. The plan states these limits accurately.

The cited 2,000-message paper supports discussion of sensitivity versus review burden; its setting and reference are different. The inbox study retains human review of all messages. Neither authorizes autonomous exclusion from clinician review here. The emergency-department retrieval study likewise does not establish async-care safety. [Messaging evaluation](https://link.springer.com/article/10.1186/s12911-026-03763-z), [inbox workflow evaluation](https://doi.org/10.1093/jamiaopen/ooae078), [emergency-triage retrieval study](https://pubmed.ncbi.nlm.nih.gov/41587455/).

## Reporting checks

The reviewed new plan, protocol, evidence and challenge materials contain no identified employee or interviewer names. This was a scoped text check, not a new audit of the entire repository or Git history.

The plan correctly preserves the existing GUI and references, distinguishes historical from contemporary controls, requires exact regressions and referral burden, and prevents a developmental screen from authorizing promotion. Report planned, attempted, failed and unrun calls explicitly. If the full frozen schedule cannot complete, an incomplete operational report must not be presented as the planned clinical comparison.

**Disposition of this review:** suitable to proceed with the bounded development study after the noted narrative clarifications. Independent clinical review, representative prospective evaluation and human-workflow measurement remain outstanding. This conclusion concerns study interpretability, not clinical readiness.

### Action closure — September 16, 2026

The study owner applied all three requested narrative clarifications to the main research plan before generation: the post-output, single-physician reference provenance; development dependence on earlier failures; and “paired development probes” terminology. These reporting actions are resolved. The clinical and measurement limitations above remain in force; closure is not clinical approval.
