# Workflow-aware disposition experiment

Completed 16 September 2026. This is a synthetic development study with no clinical deployment or model promotion.

**1,568 one-shot calls completed:** two models × four arms × two repetitions × (50 familiar messages + 48 authored challenges). Every call returned valid JSON. Valid output is not clinical correctness.

The contemporaneous Fable original-prompt controls returned **45/50 and 46/50** against the unchanged physician v3 reference. The historical saved result was **48/50** under that later reference, and **44/49** under its original v2 reference. All 100 new known-case baseline request bodies match their original counterparts exactly; the older favorable score did not reproduce. No particular cause of the variation is established.

The source-package Fable arm returned **46/50 twice**, resolving C47 while retaining missed clinician reviews on C07 and C22. Nano's highest known-case agreement was **43/50 twice**, with new missed-review cases versus its own control. The complete case-level changes, safety endpoints and repeat observations remain visible.

## Read first

- [Results, denominators and exact misses](../../docs/WORKFLOW_AWARE_RESULTS_2026-09-16.md)
- [Clinical operations roadmap](../../docs/WORKFLOW_CLINICAL_OPERATIONS_ROADMAP_2026-09-16.md)
- [Evidence failure analysis](../../docs/WORKFLOW_EVIDENCE_FAILURE_ANALYSIS_2026-09-16.md)
- [Offline reproduction](../../docs/WORKFLOW_REPRODUCTION_2026-09-16.md)
- [Preserved study plan](../../docs/WORKFLOW_AWARE_RESEARCH_PLAN_2026-09-16.md)

## Evidence map

| Path | Meaning |
|---|---|
| `messages.json` | Full message-only input set; saved IDs were excluded from provider user content. |
| `reference-freeze.json` | Scoring-reference identities, kept outside generation. |
| `registration.json` | Supplementary analysis bindings; recorded 13.829 seconds after the first call start. |
| `retrieval/` | Seven source cards, real embedding artifacts and lexical/hybrid selection audit. |
| `study/manifest.json` | Frozen requests, model settings, schedule, source and runtime identities. |
| `study/generation-complete.json` | Complete generation freeze, verified before clinical scoring. |
| `study/requests/`, `study/raw/`, `study/parsed/` | All per-call saved provider bodies and outputs. |
| `study/scorecard-workflow-aware.json` | Separate familiar and authored analyses, including exact paired changes. |
| `study/clinical-review-worksheet-workflow-aware.json` | Exact messages and outputs with blank clinical-review fields. |
| `study/scoring-audit-workflow-aware.json` | Offline verification and reference-read order. |
| `study/operations-workflow-aware.json` | Validity, latency and execution summaries. |
| `study/budget-workflow-aware.json` | Settled operational accounting, separate from presentation content. |

The 50-case reference is a single physician's post-output reassessment of familiar cases. The 48 challenge messages form 24 related pairs with **AI-authored, unreviewed targets**. Never pool their agreement into a clinical accuracy figure. Phase summaries and `ALL_PHASES` summaries overlap and must not be added. Two repetitions do not create new independent patients.

The registered screen can miss a substituted urgent-reference false negative when another is corrected. Fable rapid-context repetition 2 replaces C49 with C43 at unchanged urgent true-positive count. Preserve its saved non-rejection result and inspect the exact cases; it is not a safety approval.

Embeddings changed selected-card membership/order for **0/98 messages**. This experiment does not establish a dense-retrieval advantage. Clinical applicability, instruction resistance and rationale quality require separate review. Every clinician-review attestation remains blank. No patient outcome, completed care or independent clinical validation was measured.

Original requests, outputs, references and source bindings are immutable. Replaying the scorer verifies existing derived files; it does not call a model or repair predictions.
