# Current presentation

Use [September 14, v20 — seven editable slides](counsel-disposition-current-2026-09-14-r3.pptx).
Earlier dated decks are historical; their clinical/benchmark numbers are not
current candidate results.

This deck reconciles [the sprint report](../../docs/REVIEW_REPAIR_SPRINT_2026-09-14.md),
[the workflow](../../docs/CURRENT_PIPELINE.md),
[the version-specific scorecard](../../outputs/physician-cohort-v20-2026-09-14/scorecard.json)
and all six v20 GUI attempts. It does not claim clinical readiness. Speaker notes
include source and interpretation boundaries.

- Native editable text, diagram shapes and four tables; not screenshots of slides.
- Seven slides, 16:9; Helvetica Neue selected from the authoring runtime.
- Package/layout checks: zero findings; seven-slide re-import passed.
- Every rendered slide inspected; the workflow label was repaired before delivery.
- SHA-256: `46ad270d2c448a75567a29b7ff5ec221dcd20d8b9c314b59675a92774ed790d8`.
- Native Microsoft PowerPoint/Google Slides rendering has not been separately tested.

`build-current-deck.mjs` contains the authoring source. It reads the frozen final
GUI capture. Run from the repository root with the installed presentation runtime
paths in `RUNTIME_NODE_MODULES`, `PRESENTATION_SKILL_DIR`, and `RUNTIME_PYTHON`.
Set `DECK_OUTPUT_FILE` to a **new** path in this workspace; the finalizer does not
overwrite prior decks. This authoring dependency is intentionally not installed
in the clinical application. Validate and visually inspect every regenerated slide.
