# Disposition model case review

[Open the hosted case viewer](https://bgoatnote.github.io/counselcodex/#index), or download [index.html](https://github.com/bGOATnote/counselcodex/raw/refs/heads/main/publication/medgemma-case-review/index.html) and open it directly in a browser. The file works offline and opens the case index. A case deep link opens only that case. All 50 synthetic messages, saved model rationales, physician v3 accepted dispositions and original CSV labels are embedded. Selecting a case hides the index. The index and case details are separate screens; only one is visible at a time.

## Present from the browser

Use C22 → C47 → C49 to discuss failure modes, then **Roadmap** and **Live demo**.
The header restores the **Prepared for** Counsel badge and keeps **Case index**,
**Live demo**, **Roadmap**, **Repo** and **Presentation view** accessible. Demo,
roadmap and repository links open separate tabs, preserving the selected case.
The proposed roadmap is a graphic-only page based on presentation slides 15–16;
it does not claim that later clinical stages are implemented or approved.

**Live demo** links to http://localhost:4120/stripped. This is the viewing
computer, not a public inference server. **Get disposition** sends one fresh
Anthropic request using the frozen Fable settings; opening the page does not.
Keep the local server running and provider access available. The saved viewer
works without that server. Keep both HTML files together for offline presenting;
only live calls and repository/source links need external connectivity.

C22 includes the same two metadata-stripped discussion photos as the PowerPoint.
They were added after evaluation, are not model inputs, and are not verified
images of the synthetic case. Asset provenance and unresolved permissions remain
in the repository disclosures. No saved results or prompts were changed.

## Review controls

- Search by case ID, symptom, disposition or rationale. Each index link includes an exact message excerpt.
- Filter to the six Fable/MedGemma disagreements, under-escalations or over-escalations. Filters and case alerts use the three primary models and selected Nemotron repetition; V25 is separate historical context.
- Deep links include `index.html#C22`, `index.html#C47` and `index.html#C49`.
- Nemotron defaults to unchanged baseline A repetition 1. Repetition 2 is selectable; no best-response selection occurs.
- The sticky header’s **Case index** link returns to the index from any scroll position. Search, filters and Nemotron selection are preserved. **Clear filters** returns all 50 case links.
- The index is always hidden while a case is open. **Presentation view** enlarges the case text. Left/right arrows move through matching cases; Escape or / returns to the index. Browser Back and Forward restore index/case navigation.
- Three primary cards show a bucket, one comparison label and the saved rationale. The collapsed **Historical pipeline · V25** section preserves its response, completion status, early actions and source links.
- **Record details** contains each model configuration and source links. **About the study** contains provenance, reference notes and interpretation limits. Reference cards show only their labels and dispositions.

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

The reviewed Counsel wordmark is embedded unchanged under **Prepared for**. About the study identifies Counsel as the intended audience of this independent project, not a sponsor or endorser.

All case and model text is rendered as text, not executable markup. The standalone document blocks scripted network connections and external assets with a Content Security Policy; only embedded data images are admitted. Images are pinned by SHA-256. Live-demo navigation is an explicit link, never an embedded frame or background request.
