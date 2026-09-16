# Cascade 8B at a shared 2048-token cap: incomplete

All 24 development requests finished. **This configuration fails the utility
gate:** 16/24 schema-valid responses, all 16 with valid spans; 9/12 usable
defect detections, 7/12 supported controls and 5/12 complete pairs correct.
Eight requests exhausted the shared output cap: five controls and three
defects. There were no false alarms among the seven completed controls;
the five missing controls remain failures, so this is not perfect specificity.
All 16 completed responses matched their labels, which is a conditional result.

[Corrected score report](../outputs/local-cascade8b-offline-2026-09-15/report-2026-09-15T16-38-15.652Z.json).
Generation freeze: `4d227ee`; plan SHA256
`71e7d0baf6ff75cf13de24f9c21f23ba033d338dcf42fb821ccb752d25f6e12e`.
No validation selection or validation/mining generation occurred in this study.
The unsuccessful mining preflight wrote runtime telemetry only.

## Scorer correction, with no inference reruns

The original reader compared raw parsed JSON with Zod's normalized output by
stringifying both objects. Cascade orders object keys alphabetically; Zod
orders them by the declared schema. All 16 successful responses had identical
values but different object key order, so scoring incorrectly stopped with
`LOCAL_RESULT_RAW_MISMATCH`.

The correction uses Node's `isDeepStrictEqual`. Object key order is irrelevant;
values, types, array order and missing/additional fields still must match.
The regression test now returns reversed JSON keys and verifies scoring
succeeds, while a changed verdict still fails raw-result verification. No raw
response, normalized result, request, label or historical freeze was edited.

Read-only scoring can verify the original source files against an explicit
local git source commit; the report records that commit and the current scorer
hashes. Stored requests must still match regenerated requests and their frozen
hashes. Generation retains the original strict current-source check, and the
historical-source option is not available to `run`. No failed request is retried.

```bash
node --experimental-strip-types scripts/local-offline-study.ts score \
  outputs/local-cascade8b-offline-2026-09-15 4d227ee
```

Use a matching corrected 8B scorer checkpoint to reproduce this command after
switching the current model configuration. New mining work requires a fresh
plan because the generation runner changed. Failed development does not gain
validation eligibility: `select` now enforces the development utility gate
programmatically, with a test that a failed study creates no selection file.

The [runtime correction](LOCAL_MODEL_PACKAGE_BUDGET_CORRECTION_2026-09-15.md)
explains why 2048 was shared by Cascade but separately available to Nano's two
phases. This is evidence about a bounded model/runtime package, not a matched
total-budget comparison, clinical validation or a weights-quality ranking.
