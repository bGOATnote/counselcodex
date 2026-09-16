# Case viewer: separate index and detail screens

The [viewer](https://bgoatnote.github.io/counselcodex/#index) opens the case index.
Selecting a case hides the list. A sticky header provides **Case index**,
**Repository** and **Presentation view** controls beside the Counsel wordmark
and **Disposition Study** title. The hero, cohort score strip, print button and
reference subtitles are removed. Reference cards contain only a label and
disposition. Model configuration and sources remain under **Record details**;
provenance and limitations remain under **About the study**.

## Release verification

Tested commit: `0d35906cb0832aa393b665b7bd8fb564f6db4a4b`.
[CI](https://github.com/bGOATnote/counselcodex/actions/runs/35125831370) and
[Pages deployment](https://github.com/bGOATnote/counselcodex/actions/runs/35126911013)
passed. Public HTML matched the local artifact: 392,873 bytes, SHA-256
`24f29882cf741c930a55effcb50c0db0979bb63c23fbc39588019bc0ce51f58c`.

Actual browser checks covered desktop widths 1280 and 1100, tablet width 700,
and mobile width 390:

- Index and case details were mutually exclusive; all 50 case links remained
  available. Root navigation resolved to `#index`; reloading `#C49` opened only C49.
- C22, C47 and C49 displayed their saved dispositions. Previous/Next replaced
  the selected case. Browser Back/Forward restored the index or case screen.
- Case index returned from the bottom of mobile/tablet case content, with the
  heading and search below the sticky header. Search/filter state survived.
- Presentation view enlarged case text. Escape after selecting Nano repeat 2
  returned to the index and preserved that repetition. `/` returned to search.
- V25 remained collapsed by default; C49 retained its incomplete disposition
  and separately recorded early-action section. Model record details and study
  details were collapsed by default.
- No horizontal overflow or console warnings/errors were observed in the
  checked layouts. Temporary viewport overrides were reset after review.

Local checks passed: 1,075 tests, 48 skipped, zero failures; 15 focused
viewer/adapter tests; lint, type checking and artifact verification. The exact
staged tree was covered by the prior complete publication scan plus a scan of
all 11 changed files, with zero findings/errors and zero staged secret findings.
Hosted CI repeated the complete publication check. Existing visual-extraction
limitations remain described in the publication-check documentation.

All 50 embedded study records were byte-identical to the prior viewer. No
inference, clinical reference amendment or presentation-file change occurred.
These checks verify software behavior, not clinical safety.
