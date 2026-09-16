# Does generated clinical context earn its place?

Prospective development experiment, after the completed full-versus-brief study.
This is an input ablation, **not** a new live pipeline, reference revision or
retrieval experiment. No deployment/promotion follows automatically.

## Fixed design

All 50 original messages, two fresh calls each, one per arm. Alternating sequential
arm order. Both use Opus 5, adaptive/low, the identical original full prompt,
full output schema and settings. No judge, repair or retries. Reference labels
are scoring-only and never enter either producer packet.

- A: original patient + saved generated context + frozen selected evidence.
- B: original patient + the **same** selected evidence; omit generated context.

Output instructions are identical. The removed field contains generated queries,
findings and question: do not call this a findings-only intervention. Retrieval
has already used the original queries and is not rerun. Both arms still see the
same nine-passage maximum, source metadata, order, identifiers and exact quotes.
Safety is not fed to the producer; historical issued-care constraints are checked
separately and never silently removed.

C21, C27, C40 and C48 already have null generated context. Their pairs are
negative controls for omitting the null field, not evidence of removing clinical
interpretations.

For journal compatibility only, slots are named `full` (A) and `brief` (B).
`armLabels` and `contracts` in the manifest explicitly identify **both as full
output contracts**. This is not another comparison of long versus short replies.

## Why this deletion might help

Exact quotations do not prevent semantic inflation in an intermediate finding:
drinking is not established hydration; partial weight bearing does not establish
a negative Ottawa rule; a likely pattern is not a confirmed diagnosis. The final
model already receives the complete original patient message. Removing redundant
generated context tests whether its interpretations add value or bias.

Retain every first attempt and evaluate exact physician-route agreement,
all-case agreement coverage, care conflicts, failures, provider latency, tokens
and cost. Full-response gates are replayed in both arms, separately from typed
proposal agreement. Inspect material grounding differences; do not convert a
pass in quote identity into a clinical-safety or claim-support score. C25 stays
null/excluded. Under/over directions are not adjudicated harm.

Removing context cannot repair a deficient source packet or establish an internal
priority policy. Fewer invented facts without improved agreement is a useful but
limited result; a null or worse result is retained. This known development cohort
does not test generalization to unseen patients.

## Existing money and identity

The previous replication has 100/100 provider completions and costs $19.916770
under conservative accounting. Earlier mission accounting/reservations are
$11.783796. The remaining **$58.299434 of the existing $90 ceiling** funds this
phase; no new budget is inferred. No other paid phase runs concurrently.

The shared runner verifies the previous report by replay, hashes it into the new
manifest, reserves each pair before dispatch, settles known usage conservatively,
and retains the full reservation for unknown usage. Started calls are never
reissued on resume. DNS/connection preflight precedes authenticated dispatch.
A persistent phase claim plus a per-run lock prevent duplicate spending.
Summed worst-case reservations for all 100 calls are $59.756810, above the
remaining balance. The runner settles each completed pair before reserving the
next; all 50 pairs are planned based on expected usage, not a promise to exceed
the ceiling. Unknown usage retains its reservation and can reduce completion.

```sh
node --experimental-strip-types scripts/routing-brief-study.ts plan-context outputs/generated-context-ablation-2026-09-15
# run requires the exact fingerprint returned by plan-context
node --experimental-strip-types scripts/routing-brief-study.ts run outputs/generated-context-ablation-2026-09-15 FINGERPRINT
node --experimental-strip-types scripts/routing-brief-study.ts score outputs/generated-context-ablation-2026-09-15 report-NEW.json
```

The plan freezes before calls. Do not edit its code, policies, output contract,
corpus, packets or physician reference while it runs. No brief-contract correction
or RAG change is bundled into this comparison.
