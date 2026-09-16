# Candidate v22 deck, corrected r4b

Use [the corrected verified deck](../counsel-disposition-current-2026-09-14-r4b-verified.pptx).

This supersedes r4, which incorrectly labeled the diabetic-foot case C19. The correct original case is **C04**. C19 is the positional-dizziness case. The earlier r4 PPTX remains unchanged and should not be submitted.

- [Eight final slide renders](renders/)
- [Portable validation receipt](validation.json)
- [Source hashes and exact case mapping](source-manifest.json)
- [Builder](../build-continuation-deck.mjs)
- [Case mapping helper](../deck-case-mapping.mjs)
- [Four regression tests](../../../tests/presentation-case-mapping.test.mjs)

All seven controlled GUI labels were checked against the exact original messages in `data/patient_messages.csv`. The originals are C30, C02, C50 and C04. The remaining three messages are modified follow-ups and are not counted as original cohort cases. The extended window's C01 and repeated C02 identities were also checked. No other case-label mistranscription was found.

Before export, the builder checks each captured run's SHA-256 and identity, then derives its displayed case ID from exact message equality. It rejects incorrect expected IDs, changed original messages, ambiguous matches and off-cohort updates labeled as originals. Label lookup is keyed by run ID rather than table position.

Verification: all four mapping regression tests and repository JavaScript lint passed. ArtifactTool finalization reported zero package/layout findings and zero warnings, with six native editable tables. All eight final exported slides were re-imported, rendered and individually inspected. PowerPoint and Google Slides execution were not tested. The portable receipt summarizes the private finalizer result and includes the exported file hash; no private build path is needed to read it remotely.

The deck retains the seven-run controlled window, later C02 retest and unattributed C01/count deviation, negative prompt experiments and limitations. Historical physician agreement is not presented as current-candidate clinical validation. Source citations are in slide notes and [the source manifest](source-manifest.json).
