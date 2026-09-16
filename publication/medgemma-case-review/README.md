# Disposition model case review

[Open the hosted case viewer](https://bgoatnote.github.io/counselcodex/#C49), or download [index.html](https://github.com/bGOATnote/counselcodex/raw/refs/heads/main/publication/medgemma-case-review/index.html) and open it directly in a browser. The file works offline and starts at C49. All 50 synthetic messages, saved model rationales, physician v3 accepted dispositions and original CSV labels are embedded. Selecting a case replaces the previous case; no other full patient message remains in the detail panel.

## Review controls

- Search by case ID, symptom, disposition or rationale. Each index link includes an exact message excerpt.
- Filter to the six Fable/MedGemma disagreements, under-escalations or over-escalations. Filters and case alerts use the three primary models and selected Nemotron repetition; V25 is separate historical context.
- Deep links include `index.html#C22`, `index.html#C47` and `index.html#C49`.
- Nemotron defaults to unchanged baseline A repetition 1. Repetition 2 is selectable; no best-response selection occurs.
- The fixed **Case index** button restores and focuses the index from anywhere, including presentation view, while preserving your case and filters. **Clear filters** returns all 50 case links.
- Presentation view hides the index. Left/right arrows move through the filtered list. Escape restores the index; / opens its search. Browser Back and Forward restore selection.
- Three primary cards show a bucket, one comparison label and the saved rationale. The collapsed **Historical pipeline · V25** section preserves its response, completion status, early actions and source links.
- Print exports only the selected case. Source links open the repository separately.

## Build and verify

From the repository root with the supported Node runtime:

```bash
node scripts/build-medgemma-case-review.mjs
node scripts/build-medgemma-case-review.mjs --verify
node --test tests/medgemma-case-review.test.mjs tests/historical-case-review.test.mjs
```

Build replaces only these derived presentation files. Verify requires exact saved bytes and makes no changes. Neither command makes provider calls. The builder checks frozen generation, raw/parsed parity, the original V25 score replay, and the saved Fable/MedGemma comparison. The manifest binds admitted sources and renderer files. Original experiment artifacts and references remain unchanged.

## Interpretation

Physician v3 is a single-physician, unblinded post-output reassessment of a known 50-message development set. It is not independent clinical validation. Original CSV labels are discussion context and are not combined with physician scores.

Fable is the preserved historical low-effort run. MedGemma is the recorded local Q5_K_M configuration. Nemotron uses the registered unchanged three-bucket baseline A, with two repetitions shown separately. V25 is retained in a collapsed historical section because it used a different five-route multi-stage pipeline, rather than the simple three-bucket protocol. Its original 21/49 all-case result and 21/27 completed-release agreement are distinct from this post-hoc three-bucket physician-v3 display. Only 27/50 V25 cases had an eligible completed release; 23 remain incomplete. Rejected proposals and separately issued early actions are never displayed as completed dispositions.

Under/over-escalation compares completed route order SELF_CARE < ASYNC_PHYSICIAN < URGENT_ESCALATION against accepted physician v3 buckets. It is not a patient-harm measurement. Incomplete output is a separate operational status, never a self-care prediction. The source scorecards retain the two false-negative endpoints, distinguishing omitted clinician involvement from omitted urgent escalation. Repeated endpoint pills are omitted from the cards. Rationale accuracy and care delivery are not validated by route agreement.

Model families, inference dates, runtime, quantization, decoding and pipeline scope differ. This inspection tool is not a controlled ranking, clinical validation or model promotion. It does not expose hidden reasoning or submit patient messages.

The reviewed Counsel wordmark is embedded unchanged and labeled “Prepared for.” It identifies the intended audience of this independent project, not sponsorship or endorsement.

All case and model text is rendered as text, not executable markup. The standalone document blocks network connections and external assets with a Content Security Policy. Internet access is needed only when a reviewer chooses an external source link.
