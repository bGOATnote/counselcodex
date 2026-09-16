# Unapplied mechanical-attribution proposal

This artifact does not change the active v23 cohort, runtime, source rubric, judge verdict, or clinical admission predicate. The prototype tests exercise a proposed permission boundary only; they are not applied-runtime or clinical validation.

## Observed software evidence

- Immutable record: `outputs/clinical-lift-v23-cohort-live-2026-09-14/36-C36-run.json`
- SHA-256: `21e3ded568873bfeb4a05033a3effca035dcdef04aced3d0368a84d33219fbb7`
- Run: `afdbfdad-b302-4bf1-9d87-b173268593f5`
- Terminal state: `review_required`, `REPAIR_SCOPE_UNAVAILABLE`.
- Exact field: `vitalSigns` = “No vital signs reported; whether any were measured is unknown. None are needed for this routing decision.”
- `unmeasured_vitals_not_dismissed` failed. The recorded critic accepted with `repairTargets: []`. The rejected repair contract therefore had `allowedFields: []`.

Only this observed mechanical failure was inspected; no partial-cohort clinical score or correctness judgment is inferred.

## Narrow correction

1. Keep the current predicate and bounded emergency-care exception unchanged.
2. Attach typed `repairLocations` only to this failing check: literal `vitalSigns`, exact matched text, and integer start/end offsets in the original field. Exemption replacement changes string length, so offsets must be computed in the original text and exempted spans excluded.
3. Pass the actual current draft to nomination. Add only `vitalSigns` when an exact, in-range location belongs to this known mechanical check. Missing, malformed or stale attribution authorizes nothing. Do not infer all fields from a check ID or model acceptance.
4. The existing field-local patch admission still enforces permissions, base/evidence hashes, schema, actual change and citation identity. The assembled draft still requires a fresh full independent review. This proposal cannot release an answer directly.

## Verification / promotion boundary

`proposal.patch` is UNAPPLIED. `proposal.mjs` and its four tests are an isolated proof of the attribution behavior, not wired production code. `git apply --check` may check patch applicability without applying it. After the cohort finishes, any implementation needs a new recorded source/prompt identity, focused runtime integration tests, and separately labeled GUI verification. Preserve the cohort's recorded C36 failure and every other historical outcome.

Required runtime regression matrix: observed field → only vitalSigns; unchanged clinical status on all existing control strings; emergency exemption alone → pass; exemption then real dismissal → fail with original offsets; wrong field/negative/fractional/out-of-range/stale span → no permission; missing current draft → no permission; unchanged patch → rejected; unauthorized route edit → rejected; accepted scoped patch → full fresh exact-draft review, not automatic publication.
