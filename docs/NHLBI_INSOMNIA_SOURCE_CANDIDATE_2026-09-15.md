# Offline insomnia source candidate

Status: isolated and unpromoted. No live corpus, prompt, retrieval selector,
index, model, defaults, physician reference or historical run was changed. No
embedding or model calls were made.

## Source and permission

The [NHLBI insomnia diagnosis page](https://www.nhlbi.nih.gov/health/insomnia/diagnosis)
was checked on 2026-09-15 and downloaded successfully over HTTPS (HTTP 200).
The first sandboxed download failed DNS resolution and retained no response
bytes; the explicitly approved public-HTTPS retry produced this capture.
Its displayed update date is **2022-03-24**, not the capture date and not an
independent clinical currency review. Publication date remains unknown.

The [NHLBI reuse policy](https://www.nhlbi.nih.gov/about/contact/trademark-branding-and-logo)
was checked the same day. It permits public-domain website information except
where otherwise indicated and requires attribution/no implied endorsement;
logos and some third-party media have separate restrictions. The selected
introductory agency prose has no identified third-party attribution or copyright
notice. This candidate does not include media or ingest linked publications.

Attribution: Source: National Heart, Lung, and Blood Institute; National
Institutes of Health; U.S. Department of Health and Human Services. No endorsement
is implied. The document is classified as a **patient summary**, not a primary
guideline, clinical approval, or prescribing protocol.

## Retained identity and selection

`src/evidence/rag/fixtures/nhlbi-insomnia-2026-09-15/response.html` retains the
67,915-byte HTTP response body for offline replay. It is not served or rendered.
Only the selected paragraph enters `ClinicalDocument`; page navigation, markup,
logos, media references and linked content in the audit response do not enter
the corpus, and no media asset was downloaded. The public-domain designation
applies to selected agency prose, not a blanket license for every page asset.

- Captured: `2026-09-15T08:24:58.928Z`.
- Raw response SHA-256:
  `03357b093540309dafa8613a0e5e24f6761348aa24301dd8b9826b30260d1efd`.
- Canonical URL, page heading, publisher update date and whole selected paragraph
  are checked. A different response hash, date, identity or excerpt requires a
  new reviewed candidate; it is never silently accepted.
- The returned text is extracted from the retained response, with the single
  inline link and whitespace normalized, then checked against the reviewed text.
  Expected text is not substituted for failed parsing.
- Existing `documentSchema`, `chunkDocument`, exact quotation accounting and
  authored support-opportunity accounting are reused. No generic crawler or new
  clinical agent was added.

The complete first paragraph stays together in one lossless chunk. It preserves
the conditional daily-activity trigger for discussing insufficient sleep with a
doctor, tentative diagnostic wording, and both frequency and duration in the
chronicity definition. It does not establish those features in a patient, choose
a queue priority, or specify a review deadline. The optional sleep-diary paragraph
was deliberately omitted: it is not needed for these two support opportunities
and could be misread as a required delay before assessment.

## Offline comparison

The comparison includes a byte-faithful retained `ClinicalDocument` from the
existing local corpus, not a fresh replacement of its source:

- Document: `medlineplus:6055`.
- Original XML source version:
  `https://medlineplus.gov/xml/mplus_topics_2026-09-12.xml`.
- Retained document SHA-256:
  `fa3b6a9f825833727e3a46fec22968257155cbf68c2a48e271ba4b658210b01c`.
- Original corpus SHA-256:
  `af7e4a8c239c4b084525aba008d56ce833b3a08144cea6237319bf996aa30dbd`.

The fixture retains original source metadata, including its XML raw hash; that
hash is not a claim that the original full XML response was recaptured here.
The copied document itself is independently hash-checked on every replay.

| Authored exact-text opportunity | Retained Medline source | NHLBI candidate |
| --- | --- | --- |
| Conditional daily-activity assessment advice | Absent | Present |
| Chronicity frequency and three-month duration together | Absent | Present |
| Total matched selected spans | 0/2 | 2/2 |

Each arm searches its own whole-source chunks for the same selected text, bound
to that arm's document ID. There is no ID-only advantage. These are two
retrospective, deliberately source-targeted development witnesses, not a held-out
semantic benchmark. Medline already discusses provider assessment, daytime
effects and underlying problems in other wording. Exact selected-span absence
does not establish absence of all relevant clinical support.

**A conflict remains:** the retained Medline summary says chronic insomnia lasts
one month or longer. The NHLBI excerpt requires three or more nights weekly for
three months or longer. The replay flags their simultaneous presence. No source
was deleted, relabelled retracted/superseded or clinically endorsed. Simply adding
the candidate to live retrieval would retain that conflict; any promotion needs
an explicit versioned source-review decision rather than silently treating both
duration statements as interchangeable.

This measures narrow source-text availability, not retrieval ranking, patient
eligibility, generated-claim support, physician alignment, safety or routing lift.
Empty packets and injected capture failures fail their support opportunity;
matching an incomplete chronicity quote cannot pass the paired-qualifier probe.

## Replay and verification

Both commands are keyless and offline. Replay prints its report to stdout and
does not write experimental results or modify an index.

```bash
node --experimental-strip-types --test src/evidence/rag/nhlbi-insomnia-candidate.test.ts
node --experimental-strip-types src/evidence/rag/nhlbi-insomnia-candidate.ts
```

Five focused tests pass: source identity/attribution; source/date/qualifier drift;
one-chunk preservation; quotation identity versus complete support; and paired
coverage accounting with the retained conflict. Different patient-specific or
queue-priority claims remain unassessed rather than inheriting source approval.
`npm run lint`, `npm run typecheck` and the full `npm test` command also passed;
existing historical-runtime skips remain skips, not newly executed validations.
