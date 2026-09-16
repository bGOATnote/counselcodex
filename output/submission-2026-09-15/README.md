# Counsel disposition take-home package

## Review in this order

1. [Slides in PDF](counsel-disposition-take-home.pdf) or [editable PowerPoint](counsel-disposition-take-home.pptx)
2. [Current physician-adjudication workbook](counsel-disposition-adjudication-v3.xlsx)
3. [Physician v3 report](../../docs/PHYSICIAN_ADJUDICATION_V3_2026-09-15.md), [requirements audit](../../docs/TAKE_HOME_REQUIREMENTS_AUDIT_2026-09-15.md), and [evidence/failure review](../../docs/SUBMISSION_RED_TEAM_2026-09-15.md)

Revision 15 contains 28 slides: 15 main slides, including a seven-minute live demo,
planned for 35 minutes. Thirteen appendix slides support 25 further minutes of discussion.
[Full narrative and speaker notes](../../docs/INTERVIEW_DECK_2026-09-15.md).
Current slides and notes contain no financial content or individual recipient names.

The cover identifies Brandon Dent, MD and the presenter-supplied former UNR role,
labels the Counsel logo “Prepared for,” and links to the local demonstration
and the [public reviewer guide](../../docs/GUI_ACCESS.md). The local link requires
`npm run demo` on the viewer’s computer. The presenter acts in a personal capacity;
the former affiliation is biographical and no institutional or vendor endorsement
is claimed. Codex provided development assistance. AI-generated reviews are not
independent physician judgments. [Project disclosures](../../DISCLOSURES.md) explain
these boundaries and the unresolved third-party media permissions.
Slides 2 and 3 show the exact C22 and C47 messages and identify both as false
negatives for required clinician review. Their harm statements concern possible
delayed assessment; no observed patient harm is claimed. C22 retains both ankle
photographs. Appendix 16 shows the Ottawa illustration with a visible correction
to its weight-bearing criterion. All three remain outside the scored input.
Slide 4 uses the supplied historical architecture diagram to connect the earlier
results with a proposal to test the simple baseline on unseen cases and add a
component only against a documented clinical failure. The proposed diagram is
not a record that every pictured component ran in V25. Its release language does
not describe clinical deployment; current gold remains scorecard-only after freeze.
Slides 14–15 set out the proposed first 30 days and following 2–6 months, with
owners, deliverables and evidence needed before expanding use.

Appendices 23–28 reproduce the exact messages for all other substantively discussed
cases: C01, C02, C06, C07, C12, C13, C16, C18, C19, C24, C25, C28, C32, C34, C38,
C44 and C46. With C22 and C47, all 19 discussed case inputs are visible verbatim.

## Current result

The frozen Fable 5.1 low-effort run produced 50 valid outputs from 50 calls.
Physician-reference agreement is **48/50 under v3**, with **C22 and C47** remaining
as undertriage cases. The original **44/49 under v2** is retained. Three
self-care labels were corrected and C25 was resolved as urgent. Model behavior
and prompt did not change. This is unblinded post-output physician reassessment,
not independent validation or evidence of model improvement.

Astra extra-high and max each score **47/50**. Exact differences with Fable occur
on **C07, C19 and C47**. The current Fable demonstration remains unchanged.
Rationale quality is a separate endpoint: C38's accepted self-care route does
not resolve its omitted pregnancy precautions.

## Additional timing experiment

Appendix slides 21–22 present the [conditional subtype experiment](../../docs/STRIPPED_STRATIFICATION_FABLE_2026-09-15.md).
The frozen parent categories remain **48/50**, including C25 urgent and the
C32/C34/C38 self-care corrections. The new timing decisions agree on 31/40
eligible cases, and complete five-way agreement is 38/49. All three self-care
corrections count as correct in that finer score. C25 counts as correct in the
three-bucket score; only its emergency-versus-same-day timing is unscored.
The nine new subtype disagreements and two original parent errors are retained.
The live GUI remains the original three-bucket workflow.
[Exact messages, outputs and misses](../../outputs/stripped-stratification-fable-2026-09-15/REPORT.md).

## Workbook guide

The new v3 workbook contains:

- **Summary:** original/revised agreement and the common 49-case comparison.
- **Clinical review:** six physician adjudications and remaining uncertainty.
- **Astra differences:** three exact messages and frozen rationales.
- **Frozen outputs:** 300 saved responses across six runs.
- **Reference:** all 50 messages with original and revised accepted buckets.

The [original evaluation workbook](counsel-disposition-evaluation.xlsx) is
preserved unchanged as historical v2 evidence. It includes the original
separate CSV scorecards and dated usage/timing records. CSV agreement is
retained for discussion; it is not a clinical model-selection objective.
The [original evaluation appendix](../../docs/EVAL_APPENDIX_2026-09-15.md)
is labeled accordingly.

Historical V25 remains at 21/49 delivered exact-route agreement and 22/49 after
the original offline three-bucket mapping, with 27/50 completed full releases.
It used a different output contract and is not rescored against v3 here.

## Working demonstration

`/stripped` accepts one synthetic patient message and returns one of three
buckets plus a rationale through TypeScript and one Mastra step. Follow the
[reviewer access guide](../../docs/GUI_ACCESS.md) to launch `npm run demo` and open
`http://localhost:4120/stripped`.
Localhost is on the presenter's machine, not a remotely hosted service.

The [demo script](../../docs/DEMO_SCRIPT_2026-09-15.md) covers routine symptoms,
urgent symptoms, a refill, an edited message, and trace inspection. Prior
browser verification is [archived](../../outputs/stripped-gui-2026-09-15/manifest.json).
Saved records are explicitly identified when used as a fallback.

The [repository](https://github.com/bGOATnote/counselcodex) and portable exports
provide the review materials. Repository access should be checked at handoff;
this artifact revision does not establish remote visibility or recipient access.
The original brief, role document, judge report and private preparation are not
included. [Image provenance](content/assets/provenance.json) records all four
user-supplied assets and the official logo, including their hashes. The two photographs have metadata removed
and unchanged decoded pixels. The Ottawa illustration has no removable metadata
segments and is retained byte for byte. Its author and license are unverified;
it is not presented as an official clinical figure. Its caption corrects the
weight-bearing criterion against the cited clinical source. Synthetic provenance
is not established for the photographs, so synthetic-only conformance is not
claimed for the entire presentation.
The historical architecture PNG has incidental EXIF metadata removed with decoded
pixels unchanged. The Counsel SVG is copied from the existing official-site asset
and rasterized without changing its paths or colors.
The extended project exceeded the brief's original timebox, which the deck
discloses. A timed human rehearsal and final submission remain outstanding.

## Reproduce the evidence offline

```bash
node scripts/submission-evidence-audit.mjs
node scripts/score-physician-adjudication-v3.mjs
```

Run from the repository root. These verify preserved records and scoring with
no inference calls. The [manifest](manifest.json) records current artifact
hashes and validation. Deck source is [content/deck.json](content/deck.json).
Artifact builders require the bundled artifact runtime; ordinary demo startup
does not require it.

Higher agreement does not imply better clinical policy on contested OTC or
self-care labels. This package does not establish patient-care readiness.
