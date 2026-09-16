# Applied revision r2: exact vital-field scope

The original `proposal.patch` and isolated proposal tests are preserved. That initial proposal is superseded: r2 keeps the existing `field-local-repair/v2` wire and no-op replay semantics, and adds a separate prompt-bound `mechanical-repair-scope/v1` identity. The new `proposal-r2.patch` captures the applied code and focused-test changes only.

Applied **after** the v23 50-case cohort completed. No frozen input, result, judge verdict, source passage, or score was changed. The independent complete comparison remains in `../clinical-lift-v23-comparison-2026-09-14/analysis.json` and `REPORT.md`.

## Exact boundary

- `checkAnswer` retains the existing dismissal predicate and its bounded emergency-care exemption unchanged. A failing check additionally carries typed original-string offsets and matched text for `vitalSigns` only.
- `nominateRepairFields` requires this exact check ID, a correctly typed current-field span, safe in-range integer offsets, and exact text identity. Missing/malformed/stale attribution grants no new permission. The only newly nominated field is `vitalSigns`.
- Existing base/evidence hashes, schema admission, field permissions, actual-change requirement, source validation, and fresh independent review remain in place. No direct release or clinical override was added.
- The observed C36 failure demonstrates missing mechanical attribution, **not** that its underlying clinical wording gate is necessary. Whether that statement warrants withholding remains a separate clinical-materiality question. This patch does not relax or defend that gate.

## Recorded identities

Frozen cohort prompt: `009cfb6ba558b03e2105bb91d6e3fc7d6db06f1ae34ab1e44cf8de17ce1d2e79`.

Post-patch prompt, with the exact frozen full/full/field-patch configuration: `963fc27ab7713c18079c84ed55e4270b9851d2752e102ac9c58b690da3f5f219`.

Graph remains `evidence-graph/v23`; this change has a new scope-policy/prompt identity, not a new routing policy. The scored cohort stays bound to its original prompt.

## Zero-provider verification

Command: `MASTRA_TELEMETRY_DISABLED=true node --experimental-strip-types --test tests/graph-repair-admission.test.ts`.

Result: **17 passed, 0 failed** (six new tests, eleven existing tests). Tests use actual `checkAnswer` → `nominateRepairFields` → `createRepairContract.apply` functions, including:

1. Exact current-field attribution permits only a vitalSigns patch and preserves every other field.
2. Missing draft, malformed metadata, wrong field/check, stale text, non-integer/out-of-range offsets grant nothing.
3. Emergency exemption alone remains a pass; a later unsupported dismissal still fails with correct original UTF-16 offsets, including a preceding emoji.
4. Stale hashes, no-op patches, unauthorized reason/routing edits and malformed values remain rejected.
5. Archived C36 draft/source hash replay reproduces the precise failure and permits only the narrowly attributed synthetic patch; its original file hash and failure are unchanged.
6. The wire protocol remains v2 and the same-config prompt hash differs from the frozen cohort.

Archived replay: run `afdbfdad-b302-4bf1-9d87-b173268593f5`, `36-C36-run.json` SHA-256 `21e3ded568873bfeb4a05033a3effca035dcdef04aced3d0368a84d33219fbb7`. Exact old draft hash `adc8630c8042a8e65c18cc13e7c5e1af1ef32c2b4cfb5ec2835c24f55e0db718`; retained source-order hash `0220362f925857d6f98e02ab605ff9f118c8f321b62f888d745f1ae485a8189d`.

This replay supplies a synthetic local patch solely to exercise admission. It is not a generated correction, fresh judge approval, GUI success, clinical validation, or retrospective completion. Post-patch live GUI verification must be reported separately; broad repository verification is handled by the root engineer.
