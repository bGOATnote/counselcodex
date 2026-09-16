# Presentation and repository red-team review

September 16, 2026. Review of the current submission, its evidence and the
reviewer handoff. This was an assisted engineering and content review, not
independent physician adjudication, legal clearance or a new clinical experiment.

## Findings and changes

| Anticipated failure | Change |
| --- | --- |
| A cover screenshot could make 48/50 look like independent accuracy. | Added a visible known-case, single-physician, post-output reassessment qualification immediately below the result. Original 44/49 remains visible. |
| Old slide numbers send a reviewer to the wrong clinical discussion. | Updated the physician-adjudication report to link directly to the current C22, C47, C25 and self-care discussion headings. |
| An old manifest URL disagrees with the demo shown on the cover. | Corrected the declared URL to `http://localhost:4120/stripped` and added an offline consistency check. |
| A reviewer has a valid API key but cannot access the frozen model. | Setup now identifies the exact `claude-fable-5-1` entitlement requirement and saved-artifact fallback; no silent model substitution. Added clone and working-directory steps. |
| An export or narrative becomes stale after an edit. | CI now checks artifact hashes, exact visible case quotations, source paths, deck/narrative consistency and canonical links. |
| Hidden theme defaults or dense tables reflow during import. | Normalized font defaults to Arial, shortened two tables while retaining detail in notes, and created a clearly named Google Slides-friendly editable PowerPoint. |
| Trace wording implies all sensitive text is removed. | The demo script now specifies omitted server API-key headers and warns that submitted text is retained. |
| Handoff documentation points only to older verification. | Added the September 16 browser records and corrected the public-access status description. |

## Clinical and evaluation review

The current score remains **48/50**, with C22 and C47 as false negatives for
required clinician review. The original **44/49** is preserved. The change in
agreement comes from physician-reference amendments and inclusion of C25,
not changed model behavior. All 19 substantively discussed messages remain
visible verbatim. C22's photos are discussion material, not case inputs or
evidence of an observed fracture. Both harm statements describe possible delay,
not observed patient outcomes.

C25 counts as urgent in the parent score; its finer urgency remains unscored.
The timing experiment preserves its parent result by construction. The roadmap
requires policy agreement, independent blinded review, a locked unseen set,
prespecified endpoints and acceptance limits, severity-specific analysis and
stop/rollback ownership. No numeric release threshold was invented from this
small known set. No unsupported clinical claim requiring a reference change
was found in this review.

## Verification and scope

The review rechecked preserved evaluation hashes and reproduced the original,
v3 and conditional-timing scorecards offline. No provider calls were made.
The clinical workflow, prompt, original CSV, physician references and archived
experiment outputs were unchanged. Dependency advisories, tracked-content
privacy patterns, publication secrets and entrypoint links were checked;
the detailed results and current artifact hashes are in the
[submission manifest](../output/submission-2026-09-15/manifest.json).

Syntax, TypeScript and repository tests were run with the supported Node runtime.
The suite passed 906 tests with 48 explicitly skipped and no failures. All 28
slides were rendered and reviewed; the final package has 18 native tables,
five embedded images and no layout warnings. Dependency audit returned no known
advisories. The public-history secret scan matched one deliberate test canary,
not a live credential; changed publication files were checked separately.
The initial sandbox test attempt could not bind loopback sockets; it was rerun
with local networking permitted. This review does not repeat the earlier full
repository security assessment or establish robustness against new clinical
instruction attacks. Dated security and browser evidence remain distinct from
the frozen clinical benchmark.

## Remaining limitations

The [Google Slides import guide](GOOGLE_SLIDES_IMPORT.md) explains the supported
export and conversion checks. Actual import into Google Slides and a timed
human rehearsal remain unverified. Images and assignment-data redistribution
permissions remain unresolved as documented in [DISCLOSURES.md](../DISCLOSURES.md).
The cover qualification does not turn a post-output reference revision into
independent validation. These limits remain visible rather than being treated
as issues a code patch can resolve.
