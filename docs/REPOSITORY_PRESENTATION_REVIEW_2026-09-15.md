# Repository and presentation review

15 September 2026 · Presentation revision 14 reviewed on 16 September

## Current content

The current main-branch files have been reviewed for recipient names, personal-profile references, promotional language, and unsupported clinical claims. Authored documentation now uses clinical and engineering descriptions of the observed behavior, evaluation population, limitations, and required follow-up. Two test descriptions were renamed without changing their assertions.

A scan of 7,710 tracked files, including XML and relationships within Office documents, found no remaining identified recipient names or personal-profile aliases. The new submission files were checked separately. Private preparation containing names was moved outside the repository. Clinical source terminology, patient messages, physician statements, and raw model outputs are retained as evidence rather than rewritten for style.

Four tracked historical PowerPoints and six ignored local PowerPoints had recipient references removed from speaker notes. Exactly one notes member changed in each archive; every other compressed member, including visible slide content, is byte-identical to its pre-edit version. Recovery copies and detailed scan records are stored outside the repository.

## Current presentation

The current submission contains 28 slides: 15 main slides planned for 35 minutes including a seven-minute demonstration, and 13 appendix slides. All 28 final PDF pages were rendered and reviewed. The PowerPoint retains editable text, 18 native tables, five native images and a native clickable local-demo hyperlink. The cover identifies the presenter with the exact supplied name and role, and uses the existing official Counsel logo; this does not imply endorsement.

C22 and C47 are now slides 2 and 3, with the exact CSV messages visible. Both prominently state “False negative: required clinician review missed” and describe potential harm through delayed assessment. No patient outcome or observed harm was measured. The 17 other substantively discussed messages appear verbatim in appendices 23–28. All 19 visible case messages were checked against the CSV; its labels remain separate from clinical scoring.

The user-supplied ankle photographs stay on slide 2. The Ottawa illustration is appendix 16. All three are discussion material outside the scored input. The photographs preserve decoded pixels with EXIF and Photoshop metadata removed. The illustration is byte-identical to its supplied file; authorship and licensing remain unverified. Its visible caption corrects the weight-bearing criterion to require inability to take four steps both immediately after injury and at assessment. The [clinical criteria](https://aci.health.nsw.gov.au/ecat/appendices/ottawa-ankle-adult) take precedence. No diagnosis or connection to the synthetic C22 patient is inferred.

Slide 4 reproduces the user-supplied historical proposed architecture with unchanged decoded pixels and incidental EXIF metadata removed. Its visible text separates the V25 results from the proposed diagram, states that release language does not imply clinical deployment, and keeps current physician gold in scoring after freeze. The next step is validation on unseen cases, followed by a component addition only if it reduces clinically important misses. Slides 14–15 contain the proposed first-month and six-month roadmap; timing results remain on slides 21–22. [Asset provenance](../output/submission-2026-09-15/content/assets/provenance.json) records all four user-supplied images and the official logo source. Repository-access wording is neutral until the separate publication check establishes remote status.

The current deck, speaker notes, and new adjudication workbook contain no financial wording or recipient names. Historical usage ledgers and archived research presentations retain their original measurements; they are not the current presentation deliverable. Financial descriptions in current supporting documentation are factual and scoped to the recorded experiment.

The presentation distinguishes:

- C22 and C47: model false negatives for required clinician action.
- C32, C34 and C38: corrected reference overtriage; accepted self-care routes.
- C25: urgent label resolved at three-bucket granularity and included in /50.
- C38: route agreement with a separate pregnancy-precaution omission.
- Reference correction: a change to the evaluation target, not model improvement.

## Publication and historical Git content

Cleaning current files does not erase prior commits. The 16 September review found employee references in 33 historical objects, including objects reachable through GitHub pull-request refs. Those read-only refs cannot be removed by updating `main`.

The publication plan preserves the original repository, branches and pull requests in a private archive, then publishes the reviewed current tree with fresh history at the same public-facing repository URL. This reversible archive migration addresses the current publication requirement without discarding the historical record. Completion and remote accessibility require separate verification; they are not implied by the presentation export. See the [publication review](PUBLICATION_REVIEW_2026-09-16.md) for the current plan, security checks and final status. The earlier rewrite rehearsal is not the current publication plan.

## Evidence preservation

The original physician v2 reference, patient CSV, provider requests, raw/parsed outputs, and V25 source/results remain unchanged. The new v3 reference and scorecards are additive. The original evaluation workbook is also unchanged; the new adjudication workbook is a separate file.

See the [v3 report](PHYSICIAN_ADJUDICATION_V3_2026-09-15.md), [evidence review](SUBMISSION_RED_TEAM_2026-09-15.md), and [submission manifest](../output/submission-2026-09-15/manifest.json) for scoring, validation, and current artifact hashes.
