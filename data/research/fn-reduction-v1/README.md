# False-negative reduction: authored development cases

These 24 messages are wholly synthetic and newly authored for a targeted development experiment. They are **not representative clinical data, independent held-out validation, or physician-reviewed gold**. Cases were designed after C22 and C47 were known, so performance reflects a targeted regression challenge.

- `messages.json`: the only case file the generator may read; array of `{id, message}`.
- `proposed-reference.json`: AI-authored unreviewed proposed accepted buckets, potential-harm severity, timing and rationale. Scoring only, after generation has been frozen.
- `freeze-manifest.json`: input/reference byte hashes and pre-generation freeze timestamp. Freeze establishes reproducibility, not clinical validity.
- `reviewer-pack/`: blank forms and instructions for later development review and a separate future prospective study.

F01–F08 concern ankle injury, F09–F16 sleep symptoms, and F17–F24 other presentations. Proposed timing and severity are diagnostic annotations; the model still emits exactly one of the three buckets. No actual patient outcome is encoded.

Do not revise frozen messages or proposed labels after seeing output. Record any clinical correction in a separately identified review artifact and report its effect without replacing the original. Do not promote a candidate on agreement with these proposed labels.

See the [protocol and validation plan](../../../docs/FALSE_NEGATIVE_REDUCTION_PLAN_2026-09-16.md).
