# Saved case review: navigation and comparison refinement

The [public viewer](https://bgoatnote.github.io/counselcodex/#C49) now presents
Fable, MedGemma and Nemotron as three primary responses. V25 remains available
in a collapsed historical section: its five-route protocol and 27 completed
releases out of 50 differ materially from the simpler runs. Its original score,
incomplete releases and separately issued early actions retain their meaning.

The Counsel wordmark is reused from the reviewed presentation asset and labeled
**Prepared for**. A fixed **Case index** button restores navigation while retaining
the case and filter. **Clear filters** is separate. Cards show one care-setting
comparison badge; the repeated clinician-action and urgent-action pills have
been removed. Their source scoring fields remain intact.

## Verification

Tested release: `412eb592fe8fe9edc1b8dbf0a7ad4adf59282e38`.
[CI passed](https://github.com/bGOATnote/counselcodex/actions/runs/35122289926),
followed by [Pages deployment](https://github.com/bGOATnote/counselcodex/actions/runs/35123364162).
The public document matched the local file exactly: 401,022 bytes,
SHA-256 `c18522c4ee7c98a7416f9bf8e74e3d1b924a42255aaaec39ebc95bd1074b73c8`.

- Actual browser review at desktop width 1280 and mobile width 390: logo,
  three primary cards, collapsed V25 and one comparison badge per card verified;
  no horizontal overflow or console warnings/errors observed.
- C22, C47 and C49 selections replaced the single message/detail surface with
  the expected saved routes. No inference was performed.
- Primary under-escalation filter: C04, C19, C22, C39, C47, C49.
  Over-escalation filter: C01, C26, C30, C32, C34, C38. These use Nano repeat 1.
- Case index, `/` and Escape restored the visible index from presentation mode.
  Case and filters were retained. Escape also worked after using the Nano
  selector. Clear filters restored all 50 links without changing C49.
- Nano repeat 2 changed its displayed source to the saved repeat-2 record.
  C49 V25 remained incomplete, with its same-day early action shown separately.
- All 50 embedded study records were byte-identical to the previous viewer.
  No model output, reference label, prompt or live runtime was changed.
- Local checks: 1,075 tests passed, 48 skipped, zero failures; 15 focused
  viewer/adapter tests passed; lint, type checking and artifact verification passed.
- Publication checks covered the exact 16,615-file staged tree, including four
  replacement files rescanned after a CSS correction: zero findings/errors.
  The 40 existing visual-review warnings remain explicit limitations of automated
  extraction. The existing logo was inspected visually. Staged secret scan:
  zero findings. Hosted CI repeated the complete publication check.

This is software and presentation verification, not clinical validation.
The [earlier handoff](CASE_REVIEW_HANDOFF_2026-09-16.md) remains a dated record
of the previous four-card layout and its broader case-navigation review.
