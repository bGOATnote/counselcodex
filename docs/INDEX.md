# Repository guide

## Start here

1. [Current submission package](../output/submission-2026-09-15/README.md): PowerPoint, PDF, evaluation workbooks and artifact manifest.
2. [Presentation narrative](INTERVIEW_DECK_2026-09-15.md) and [demo script](DEMO_SCRIPT_2026-09-15.md).
3. [Physician adjudication v3](PHYSICIAN_ADJUDICATION_V3_2026-09-15.md): current 48/50 agreement, corrected reference labels, and C22/C47 false negatives.
4. [Requirements audit](TAKE_HOME_REQUIREMENTS_AUDIT_2026-09-15.md) and [failure review](SUBMISSION_RED_TEAM_2026-09-15.md).
5. [GUI access and troubleshooting](GUI_ACCESS.md).
6. [Project disclosures](../DISCLOSURES.md), [security boundary](../SECURITY.md) and [publication review](PUBLICATION_REVIEW_2026-09-16.md).

## Current implementation

| Location | Role |
| --- | --- |
| `src/stripped/` | Frozen three-bucket protocol, one-step workflow and local accounting |
| `apps/evaluation/app/stripped/` | Current local GUI |
| `apps/evaluation/app/api/stripped/` | Current local HTTP endpoint |
| `data/patient_messages.csv` | Original synthetic assignment messages and discussion labels |
| `data/evaluation/` | Versioned physician references and amendments; offline scoring only |
| `outputs/stripped-*` | Frozen requests, responses, scorecards and verification records |

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

Files remain at their established paths so scripts, hashes and archived
references remain reproducible. Use this index rather than inferring the
current version from a dated filename.
