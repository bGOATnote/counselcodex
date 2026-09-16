# Repository guide

## Engineering navigation

Read [agent instructions](../AGENTS.md) for repository boundaries and the
[engineering guide](ENGINEERING_GUIDE.md) for task-to-file mappings, command
effects, and verification. This page catalogs reports and deliverables. Current
runtime status comes from the engineering guide and executable entry points,
not from the word “current” in a historical filename.

## Start here

1. [Current submission package](../output/submission-2026-09-15/README.md): PowerPoint, PDF, evaluation workbooks and artifact manifest.
2. [Presentation narrative](INTERVIEW_DECK_2026-09-15.md) and [demo script](DEMO_SCRIPT_2026-09-15.md).
3. [Physician adjudication v3](PHYSICIAN_ADJUDICATION_V3_2026-09-15.md): historical 48/50 agreement, corrected reference labels, and C22/C47 false negatives.
4. [Requirements audit](TAKE_HOME_REQUIREMENTS_AUDIT_2026-09-15.md) and [failure review](SUBMISSION_RED_TEAM_2026-09-15.md).
5. [GUI access and troubleshooting](GUI_ACCESS.md).
6. [Latest handoff verification](HANDOFF_REVIEW_2026-09-16.md) and [CI policy](CI_AND_REVIEW.md).
7. [Latest workflow publication checks](WORKFLOW_PUBLICATION_REVIEW_2026-09-16.md), [project disclosures](../DISCLOSURES.md), [security boundary](../SECURITY.md) and [publication review](PUBLICATION_REVIEW_2026-09-16.md).
8. [Presentation and repository red-team review](PRESENTATION_REPO_RED_TEAM_2026-09-16.md) and [Google Slides import guide](GOOGLE_SLIDES_IMPORT.md).
9. [False-negative reduction results](FALSE_NEGATIVE_REDUCTION_RESULTS_2026-09-16.md), [clinical validation plan](FALSE_NEGATIVE_REDUCTION_PLAN_2026-09-16.md), and [clinician-review templates](../data/research/fn-reduction-v1/reviewer-pack/README.md). The separate candidate was not adopted into the GUI.
10. [Counsel async service context](COUNSEL_ASYNC_CARE_CONTEXT_2026-09-16.md): communication channel, clinical deadline and examination needs are separate dimensions. Frozen label disagreement alone does not establish a treatment delay.

11. [Workflow-aware results](WORKFLOW_AWARE_RESULTS_2026-09-16.md): identical-request Fable repetitions returned 45/50 and 46/50; source-package and local Nano tradeoffs remain explicit. No research variant is promoted.
12. [Clinical operations roadmap](WORKFLOW_CLINICAL_OPERATIONS_ROADMAP_2026-09-16.md), [reference-review protocol](WORKFLOW_REFERENCE_REVIEW_PROTOCOL_2026-09-16.md) and [offline study reproduction](WORKFLOW_REPRODUCTION_2026-09-16.md).
13. [Current publication source archives](../publication/historical-sources/README.md) and [archive review](PUBLIC_ARCHIVE_REVIEW_2026-09-16.md): separate source-only derivatives, with immutable originals retained privately and historical Git availability disclosed.
14. [Offline case viewer](../publication/workflow-study-review/README.md): all 98 messages and 1,568 saved decisions, with exact model/arm/repetition contrasts and source packets.
15. [Source-package failure analysis](WORKFLOW_EVIDENCE_FAILURE_ANALYSIS_2026-09-16.md) and [retrieval candidate audit](RETRIEVAL_CANDIDATE_AUDIT_2026-09-16.md). These diagnose development failures; they do not establish improved clinical care.
16. [MedGemma 27B comparison](MEDGEMMA_27B_COMPARISON_2026-09-16.md): one local Q5_K_M run, 46/50 physician-v3 agreement, resolved C22/C47 referrals, added C32/C34/C38 referrals and a missed urgent route on C49. All six Fable disagreements include exact messages and rationales.

17. [Four-model case review](https://bgoatnote.github.io/counselcodex/#C49) and [offline instructions](../publication/medgemma-case-review/README.md): all 50 assignment messages, physician v3 and CSV references, Fable, MedGemma, Nemotron baseline repetitions and V25; directional errors and incomplete outputs kept separate.

## Current implementation

| Location | Role |
| --- | --- |
| `src/stripped/` | Frozen three-bucket protocol, one-step workflow and local accounting |
| `apps/evaluation/app/stripped/` | Current local GUI |
| `apps/evaluation/app/api/stripped/` | Current local HTTP endpoint |
| `data/patient_messages.csv` | Original synthetic assignment messages and discussion labels |
| `data/evaluation/` | Versioned physician references and amendments; offline scoring only |
| `outputs/stripped-*` | Frozen requests, responses, scorecards and verification records |
| `scripts/stripped-3bucket-medgemma.mjs` | Separate pinned local MedGemma generation and offline artifact verification; no reference access during generation |
| `scripts/score-stripped-3bucket-medgemma.mjs` | Offline physician-v3 scoring and exact historical Fable comparison after generation freeze |
| `outputs/fn-reduction-2026-09-16/` | Separate development experiment, including adverse results and unchanged-reference comparisons |
| `src/research/workflow-aware/` | Separate typed, single-call research workflow and bounded evidence selection |
| `outputs/workflow-aware-disposition-2026-09-16/` | Completed 1,568-call study, generation freeze and separate offline scorecards |
| `data/research/workflow-aware-v1/` | Versioned source cards, proposed challenge targets and local-model provenance |
| `data/research/fn-reduction-v1/` | Synthetic challenge inputs, unreviewed proposed labels and blank review forms |

## Experiments and historical applications

[Conditional timing](STRIPPED_STRATIFICATION_FABLE_2026-09-15.md) is a separate
experiment after frozen parent classification. It does not change the current
three-bucket GUI. [Astra comparisons](STRIPPED_3BUCKET_ASTRA_2026-09-15.md) and
[reference amendments](PHYSICIAN_ADJUDICATION_V3_2026-09-15.md) answer different
questions; retain their original denominators and reference versions.

The [V25 contract](V25_README.md), [historical pipeline](CURRENT_PIPELINE.md),
and files under `output/presentation/` describe earlier work. `/candidate` is
the historical V25 application; `/stripped` is the current presentation surface.
Research reports and failures remain available for inspection. Their presence
does not imply clinical deployment or adoption into the current model prompt.

Frozen inference and reference files remain at their established paths. Four historical source archives containing unnecessary metadata or local runtime state are distributed as separately named source-only derivatives; the publication index records original identities and replay limits. Use this index rather than inferring the
current version from a dated filename.
