# Six-attempt baseline: evidence-graph/v15

All six recorded baseline GUI attempts use concise judge style, `disposition-clinical-policy/v1`, and prompt hash `a6a85b8316e2a64cd1b6cddadf0111e223efe3bb92dc0d679a97be4976b341d7`. These are end-to-end observations, not the frozen-packet judge experiment. Do not pool later graph/policy/prompt revisions as if this were an unchanged prospective evaluation.

| Attempt | Runtime release | First server action | Server finish | Calls / repairs | Estimated USD |
|---|---|---:|---:|---:|---:|
| C02 | Model reviewed, emergency | 8.798 s | 41.207 s | 4 / 0 | 0.254601 |
| C02 active EMS update | Model reviewed, emergency | Not emitted | 38.286 s | 4 / 0 | 0.262590 |
| C04 | Model reviewed, in-person today | 4.267 s | 79.475 s | 6 / 1 | 0.503542 |
| C50 | Clinician required | Not emitted | 79.052 s | 6 / 1 | 0.514210 |
| C50 unchanged-symptoms update | Clinician required | Not emitted | 37.015 s | 4 / 0 | 0.243435 |
| C30 | Model reviewed, Standard async | Not emitted | 80.278 s | 6 / 1 | 0.499547 |

Total standard token estimate: **$2.277925**, with all six costs available. The earlier fixed-packet study's **$2.53834** is separate. Embedding/cache-specific billing is excluded; these are not provider invoices. Both unsuccessful completed-answer attempts remain included. Model review is not physician approval or evidence of deployment readiness.

The first four attempts' detailed evidence and capability caveats are in `review-notes-4.md`. Browser receipt observations are in `browser-observations-4.json` and the addenda; server timing is not substituted for browser timing.

## C50 update: a contract failure after the judge detected real defects

Run `86ee0c56-ff29-400e-9129-0037dcc6d08b` returned a critic execution with `JUDGE_CONTRACT_FAILED`; the aggregate runtime failure was `CLINICIAN_REVIEW_REQUIRED`. The reviewer detected broad medication exhaustion, an unestablished aura subtype, blanket red-flag reassurance and a missing access fallback. However, its `claim_support=pass` supplied only a draft anchor and **no source anchor**. The existing validator rejects that combination. The review therefore was not admitted and no repair ran; it was not a provider timeout, funding limit, or an accepted clinical review.

The source records preserve the distinction between the aggregate fallback and the exact internal contract failure. The invalid review cannot be counted as a correct accepted judge result merely because parts of its feedback were useful.

## C30: accepted response with unresolved clinical-policy concerns

Run `013f59c4-681c-49ee-9288-0fbdc13e83ce` ended with Standard async after one repair. The initial judge caught mistaken attribution of extent beyond the forearms, an assumed symptom-only measurement method, an inadequate airway instruction and missing access fallback. The final reviewer accepted the repaired response, but that acceptance is not a blanket clinical pass:

- The necessity rationale remains generic: a clinician could assess severity and whether prescription treatment is warranted. This does not itself establish that a clinician task is necessary for every localized contact rash. The distinction between potentially useful review and required review remains a policy concern.
- The final fallback starts **"If Counsel review isn't available today and the rash worsens"** before listing widespread involvement, sensitive sites or infection concerns. The AND construction can make independent worsening escalation appear contingent on service unavailability. The judge passed this safety net; the concern must remain visible rather than disappearing into that pass.
- Sources include agent-compiled ED contact-dermatitis references and consumer summaries. Outpatient management is not synonymous with a mandatory clinician-message task, and missing severity details must not automatically establish severe disease or prescribing need.

These observations motivate the next explicitly versioned policy/prompt changes. They do not constitute physician re-adjudication of the historical route and do not modify the original patient cohort.

## Version and capture errata

The plan's initial version name `clinical-evidence-graph/v15` is a naming typo; actual artifacts say `evidence-graph/v15`. The first derived three-run summary also used the wrong terminal-status spelling; corrected v2 summaries preserve that erratum. Raw runs/events and all clinician-required outcomes are unchanged.
