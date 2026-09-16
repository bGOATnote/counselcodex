# Necessary clinician-task ownership: completed paired study

**Decision: no promotion. Physician alignment remains incomplete.** Replacing one
task-ownership paragraph added one reference-aligned eligible proposal on the
fixed 49-case denominator. It did not establish clinical lift or a latency gain.
No live prompt, GUI, evidence corpus, gate or physician reference was changed.

## Design and identity

All 50 original messages received two fresh producer calls: baseline ownership
(`full` journal slot) and explicit task ownership (`brief` slot). **Both use the
full output contract.** Original patient, generated context, source passages and
quote IDs, model, settings and ordering policy are fixed. Only the necessary-task
paragraph differs. No gold, previous route, judge or repair enters either prompt.
Previously issued care is checked after generation, not supplied to steer it.

- Freeze commit: `8f03179`.
- Plan: `outputs/task-ownership-ablation-2026-09-15/plan.json`.
- Fingerprint: `1d36bed4143ab184a1e09beceb7632bee4d29af92522112a34d93eed2f17995f`.
- Model: `anthropic/claude-opus-5`, adaptive/low, 2,400 output-token ceiling,
  one step, no retries, 600,000 ms timeout. No artificial slow-response cutoff.
- Baseline prompt hash: `10932bf94f1354cc162246ba7eecb2291924970f51f29669991ae0d525d9e1a2`.
- Candidate prompt hash: `7166af58e8807dcc25a8c25b9c2b511fb3279a377b974ef9e3997a363102dd30`.

Alternating sequential pair order; all started/result/evaluation artifacts remain
on disk. The full per-case table, exact drafts and checks are in `report.json`.
`report-replay.json` is byte-identical. These are isolated producer experiments,
**not 100 GUI runs or clinical releases**, and cannot replace V25's scorecard.

## Results

| Metric | Baseline | Explicit task ownership |
| --- | ---: | ---: |
| Provider completes / planned | 50/50 | 50/50 |
| Eligible routing proposals | 43/50 | 43/50 |
| Agreement among eligible, non-null reference | 34/43 | 35/43 |
| Agreement coverage, fixed non-null reference | 34/49 | 35/49 |
| Raw route agreement, diagnostic only | 36/49 | 38/49 |
| Eligible under-reference-acuity disagreements | 9 | 7 |
| Eligible over-reference-acuity disagreements | 0 | 0 |
| Full response gate replay passes | 28/50 | 30/50 |
| Producer median / p95 | 14.815 / 16.681 s | 14.775 / 18.730 s |
| Median output tokens | 879 | 900 |

The median within-pair candidate-minus-baseline latency difference was **+26 ms**.
Latencies use completed provider executions, not workflow, browser receipt, first
action or paint. Zero provider failures does not mean zero validation failures.
Full-response gate passes are mechanical replay results, not clinical approvals.

C25 remains listed but excluded from agreement and under/over denominators.
Standard versus Priority async can disagree exactly without differing in the
four-level acuity ordering. Route disagreement is not adjudicated harm.
`unsafe_advice` and `unsupported_claims` remain **not_assessed** in both arms.

## Changes and unresolved differences

- C05 changed from In-person today to Emergency now and gained exact agreement.
  Its candidate transport wording still failed the full-response transport check.
- C13 changed Self care to Standard async: a clinician task was recognized, but
  the reference calls for Priority async. This is still an exact disagreement.
- C19 changed Self care to Standard async, matching the raw reference, but both
  drafts conflict with the already-issued in-person action and remain blocked.
- C49 changed Self care to Standard async; both remain below the issued and
  reference in-person route. No credit is earned for that change.
- C21's candidate emitted an inexact patient quote. Its emergency route is not
  counted as an eligible agreement. C48's baseline reduced issued transport;
  its candidate did not. These opposing eligibility changes also affect counts.

Candidate eligible disagreements: **C07, C12, C13, C22, C32, C34, C38, C47**.
Seven are below reference acuity; C13 differs in async priority only. C07, C22,
C32, C34, C38 and C47 still receive Self care. C12 receives In-person today
versus the emergency reference. Exact rationales and citations are retained.

Issued-care conflicts are C16, C19, C25, C28, C31 and C49 in the candidate,
plus C48 in the baseline. C31/C48 illustrate why matching the coarse emergency
label does not establish preserved EMS/transport instructions. No conflict was
silently cleared, and no previously issued action was deleted.

The wording checks also identify recurring async timing failures and isolated
medication/transport concerns. A missing prescribed timing token must be audited
separately from an actually unsafe delay. We have not removed gates merely to
inflate completion. See the separate draft-citation audit for whether available
assessment prerequisites were actually quoted; quote identity alone is not
semantic use or patient applicability.

## Spend and reproduction

| Accounting | USD |
| --- | ---: |
| Earlier accounted exposure / retained reservations | 52.372861 |
| This study base usage estimate | 11.600085 |
| This study conservative accounted exposure | 20.980845 |
| Cumulative against the same $90 authorization | 73.353706 |
| Remaining before any further probes | 16.646294 |

Base estimates and conservative accounting are alternative views, not amounts
to add together. Unknown usage retains its reservation; no missing attempt is
turned into zero spend. No parallel paid phase ran during this study.

```sh
node --experimental-strip-types scripts/routing-brief-study.ts score outputs/task-ownership-ablation-2026-09-15 report-NEW.json
node --experimental-strip-types --test tests/routing-brief-study.test.ts tests/task-ownership-ablation.test.ts
```

Use a **new** score filename; do not overwrite history or rerun started slots.
The known development reference is scoring-only. The next evidence probe changes
one demonstrably conflicting source packet, not routes or acceptedRoutes. More
agents, a larger prompt, and more citations are not substitutes for measured
decision support. None of these results establishes deployment readiness.
