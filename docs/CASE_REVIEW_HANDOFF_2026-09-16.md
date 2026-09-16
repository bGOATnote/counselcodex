# Four-model case review: publication verification

Verified 16 September 2026. [Open C49](https://bgoatnote.github.io/counselcodex/#C49).
This is saved synthetic-output inspection; no inference or patient submission.

## Published revision

- Implementation: `be8a2d8b46c5b54095c86e4ac2a8133b3290707c`.
- [CI passed](https://github.com/bGOATnote/counselcodex/actions/runs/35117389419).
- [Static deployment passed](https://github.com/bGOATnote/counselcodex/actions/runs/35118476406).
- Public `index.html`, `manifest.json` and `README.md` returned HTTP200 and matched
  the committed bytes. The source SHA-256 for `index.html` is
  `6343239ddbc22d8f374039daa2c675d2a833af84e8fad5080d2962d5f8edb21d`.
- Public PowerPoint and PDF downloads matched reviewed revision34 exports.

## Interface checks

All 50 case links were exercised in the hosted browser. Each selected case has
one full-message panel and four model panels. Under/over/incomplete filters
returned 7/6/23 cases for Nemotron repetition1; these are unions across models,
not error counts for a single model. The Fable/MedGemma filter returned exactly
C22, C32, C34, C38, C47 and C49. Search and the empty result state were checked.

Both Nano repetitions select their corresponding frozen source records. Keyboard
and button navigation, browser Back/Forward, presentation mode and its exit were
checked. C49 retains a separate V25 early-action disclosure while its final
result remains incomplete. Desktop and mobile layouts were visually inspected;
the mobile viewport had no horizontal overflow. No browser console errors or
warnings were observed. Print output and assistive-technology workflows were not
independently tested.

## Source and safety checks

The builder verifies frozen generation/raw-parsed parity, reproduces the saved
Fable/MedGemma comparison and original V25 score, and admits both Nano baseline
repetitions. Fifteen focused tests passed. The full local suite had 1,123 tests:
1,075 passed, 48 skipped, 0 failed. Syntax and TypeScript checks passed. Hosted CI
also passed its application builds and offline evidence checks.

Before publication, the exact Git index scan covered 16,614 files with 0 prohibited
name matches and 0 extraction errors. Forty image-related limitations require
visual review; this is not an OCR claim or an exhaustive security audit. Existing
presentation media bytes were unchanged, and the final PDF was rendered and
reviewed. A separate staged Gitleaks scan found no leaks. A scoped independent
AI-assisted code review found no remaining publication-workflow issue; it is
not independent clinical validation.

The workflow checks the successful same-repository main revision and publishes
only three static files. The live Fable application remains local. Physician v3,
original CSV labels, completed routes and incomplete pipeline outputs are
explicitly separated. No model or clinical-policy promotion was made.
