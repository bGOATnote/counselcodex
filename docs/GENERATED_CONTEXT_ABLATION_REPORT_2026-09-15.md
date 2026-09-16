# Generated context removal: completed, not promoted

All 100 first attempts completed through the real Opus provider. Both arms kept
the full output contract and identical saved evidence; only generated context
was removed from B. This is an offline producer experiment, not a GUI release.

| Measurement | A: with context | B: without context |
|---|---:|---:|
| Provider completions | 50/50 | 50/50 |
| Eligible typed proposals | 44/50 | 43/50 |
| Agreement among eligible non-null references | 36/44 | 34/43 |
| Agreement coverage, fixed non-null cohort | 36/49 | 34/49 |
| Raw route agreement, ignoring admission (diagnostic only) | 38/49 | 36/49 |
| Full-response gate replay passes | 30/50 | 33/50 |
| Producer latency median / p95 | 14.839 / 17.817 s | 14.516 / 17.789 s |
| Median output tokens | 885.5 | 884 |

The median **within-pair** latency change was −127.5 ms. This is not a
demonstrated end-to-end speed improvement and does not remove the context call:
its queries had already determined the frozen retrieval. More mechanical gate
passes in B do not outweigh lower reference agreement or prove clinical quality.

## Decision and differences

No promotion. No disagreement was resolved by removal. A-to-B changes were:

- C05: Emergency now → In-person today, below the physician reference. The
  response still advised immediate crisis contact; this route disagreement is
  not an adjudicated harm label.
- C08: same emergency route, but B stitched a patient quotation with an ellipsis,
  failing exact-span identity. It remains in coverage as a non-success.
- C19: Standard async → Self care; both remain blocked by the same historical
  issued-care conflict. The earlier instruction is not erased or fed to either
  model to force convergence.

Both arms retained lower-acuity eligible disagreements C07, C12, C13, C22, C32,
C34, C38 and C47; B additionally had C05. Neither had an eligible higher-acuity
disagreement. Both retained issued-care/transport conflicts C16, C19, C25, C28,
C31 and C49. C25 remains null and excluded from agreement/under/over denominators.

This single paired repetition per case cannot distinguish stable causal effects
from model variability. C21/C27/C40/C48 originally had null context. Removing a
null field is not removing clinical interpretation. These repeatedly inspected
cases are development data, not a held-out estimate or inherited physician
approval. Unsafe advice and unsupported claims remain `not_assessed`; passage
and patient quote identity are not semantic clinical assessment.

## Identity, money, reproduction

Frozen plan fingerprint:
`6c8791ec6dccec2388a3b470fc8067b6823ba6cd7c1ae5aa8451727d70db39c7`.
All 59 frozen file hashes matched at completion. There were 100 result and 100
evaluation rows, no provider or local evaluator failure. Re-scoring produced a
byte-identical report. No live prompt, policy, corpus or physician record changed.

- Phase base token estimate: **$11.438960**, not a provider invoice.
- Phase conservative accounting: **$20.672295**.
- Previous accounting/reservations: **$31.700566**.
- Total exposure: **$52.372861 of $90**; remaining **$37.627139**.

Every attempt, raw provider result, usage, reservation, evaluation and per-case
pair is in [the immutable report](../outputs/generated-context-ablation-2026-09-15/report.json).
No prior funds or unknown-usage liabilities were silently reset.

```sh
node --experimental-strip-types scripts/routing-brief-study.ts score outputs/generated-context-ablation-2026-09-15 report-NEW.json
node --experimental-strip-types scripts/routing-brief-failure-audit.ts outputs/generated-context-ablation-2026-09-15
```

The next experiment replaces one existing task-ownership paragraph, with the
original full output and generated context in **both** arms. This separates
fulfilling the actual patient request from recognizing a likely diagnosis. It
must not turn optional missing history or personal wording into automatic async
care. See the [prospective proposal](TASK_OWNERSHIP_ABLATION_PROPOSAL_2026-09-15.md).
