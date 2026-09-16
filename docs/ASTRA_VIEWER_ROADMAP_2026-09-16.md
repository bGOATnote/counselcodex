# Astra responses and supplied architecture roadmap

[Case index](https://bgoatnote.github.io/counselcodex/#index) ·
[Roadmap](https://bgoatnote.github.io/counselcodex/roadmap.html)

This update replaces the previous roadmap summary with the presenter-supplied
`goal.png` image and adds both saved Astra runs to every case. It makes no new
model calls and does not alter the live Fable application or saved study data.

## Astra evidence

Five cards are visible: Fable, Astra extra high, Astra max, MedGemma and Nemotron.
Astra uses the saved `gpt-6-astra` responses with actual efforts `xhigh` and `max`;
there is no displayed ultra run. Both runs have 50 valid one-shot results, the
same frozen system prompt as Fable, message-only user content and a 4,096-token
output limit. The adapter verifies both generation freezes, 100 exact request
payloads, 100 raw/parsed matches and 300 frozen request/raw/parsed artifacts.
Only final structured rationales are projected. Request, raw and parsed links
are available under each Astra card’s Record details.

Both efforts differ from the original Fable low-effort run on exactly:

| Case | Astra extra high | Astra max | Fable |
| --- | --- | --- | --- |
| C07 | SELF_CARE | SELF_CARE | ASYNC_PHYSICIAN |
| C19 | SELF_CARE | SELF_CARE | ASYNC_PHYSICIAN |
| C47 | ASYNC_PHYSICIAN | ASYNC_PHYSICIAN | SELF_CARE |

The **Astra ≠ Fable** index filter includes either effort and returns those three
cases. Under/over filters and case alerts cover all five visible response cards,
using the selected Nemotron repetition. V25 remains a collapsed historical
comparison, excluded from these filters and alerts.

Both Astra efforts agree with physician v3 on 47/50 known cases; C07, C19 and C22
are missed clinician-review cases. This is the same post-output reference used
in the viewer, not new clinical validation or a change to historical scorecards.
Original CSV labels remain separate. The prior 50 case records, model responses,
metrics and reference notes are unchanged apart from adding Astra entries.

## Supplied image

The roadmap page contains only the supplied architecture graphic, fitted without
cropping. It embeds the existing metadata-stripped presentation derivative:
`output/submission-2026-09-15/content/assets/historical-architecture-goal.png`.

- PNG SHA-256: `3cf1a68427c6d46d00d9a273e7a6f09f5682f58c81cb2eec6ac9acb069e5763d`.
- Dimensions: 1280 × 720.
- Decoded RGBA pixels match the supplied `goal.png` exactly, SHA-256
  `56967b1a288c9d927b9dddf423d47ca8e28eccf714299fca526d060f315e3409`.

This historical proposed architecture differs from the current live one-call
Fable path. Not every pictured component ran in V25; its frozen cohort recorded
zero judge calls. The image’s release and gold-rubric labels are historical and
do not represent clinical deployment or reference labels in producer context.
These distinctions remain in About the study and the presentation guides.

## Verification

- 20 focused viewer/adapter tests passed. Full suite: 1,080 passed, 48 skipped,
  zero failures. Syntax and TypeScript checks passed.
- Browser inspection at desktop width 1280 and mobile width 390 showed all five
  cards, exact C07/C19/C47 filter results, original rationale text and source
  links, C22’s retained images and collapsed V25.
- The index hides when a case opens. Returning from the bottom on mobile focuses
  index search below the sticky header. No horizontal overflow was observed.
- Roadmap loaded the 1280×720 PNG with contain sizing, no scripts, no visible
  added text and no external asset requests. Console warnings/errors were empty.
- No inference, clinical reference changes, frozen-output changes, live workflow
  changes or PowerPoint modifications occurred.
