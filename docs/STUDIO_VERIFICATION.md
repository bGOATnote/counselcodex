# Mastra Studio browser verification — 2026-09-05

## Scope

This check used the local Mastra Studio at `http://localhost:4111` with synthetic
text only. It exercised the registered workflow through the rendered UI, not a
mock or a direct call to the dependency-light mirror. No external model API or
paid service was invoked.

## Evidence and regression found

Studio rendered `counsel-disposition-v0` as four steps: parallel
`red-flag-checklist` and `intent-history`, then `hard-escalation-gate`, then
`disposition-router`. The first browser run used:

> I have crushing chest pain and trouble breathing.

It completed successfully but incorrectly returned `ASYNC_PHYSICIAN`. The
cause was a narrow ACS accompaniment pattern: it covered arm symptoms,
diaphoresis, and nausea but not plain-language dyspnea. This is exactly the kind
of lexical false negative that happy-path CLI tests can miss.

The rule was expanded, the same phrase was added as `RT-035`, and an exact unit
regression was added. A second Studio run returned:

```json
{
  "locked": true,
  "overrideBlocked": true,
  "disposition": "EMERGENCY_NOW",
  "subtype": "ed_911",
  "confidence": "high",
  "redFlags": ["acs"],
  "layer": "hard_escalation_gate",
  "guideline": null
}
```

The corrected execution showed both parallel steps followed by the hard gate
and router, with a successful five-millisecond local run. The timing is a local
development observation, not an SLO claim.

## Trace verification

The Studio Traces table showed the run input as
`{"message":"[REDACTED]"}`. Opening the trace showed the root workflow span,
one two-branch parallel span, and four workflow-step spans. The automated
readback test separately proves that persisted span input and output payloads
are null. Together these checks cover both rendered observability and stored
trace behavior.

## Interpretation

Computer-use testing materially improved the artifact by finding a safety miss,
but one paraphrase cannot validate clinical sensitivity. The remaining control
is an untouched, representative, patient- and episode-independent holdout with a calibrated clinical reference
with perturbation families for symptom wording, negation, temporality,
experiencer, speech-to-text noise, multilingual input, and missing context.
