# Smaller output: measured, but not promoted

All 100 real-provider attempts completed: 50 messages × full/brief, with the
same original patient, saved context, selected passages, Opus 5 settings and
routing policy. The changed output responsibilities did **not** establish
physician alignment. `/candidate` and the physician reference remain unchanged.

| Producer-only measure | Full | Brief |
|---|---:|---:|
| Provider completions / attempts | 50/50 | 50/50 |
| Eligible experimental routing proposals | 44/50 | 34/50 |
| Reference agreement among eligible proposals | 36/44 | 26/34 |
| Agreement coverage, all non-null references | 36/49 | 26/49 |
| Median provider latency | 14.742 s | 12.204 s |
| p95 provider latency | 17.034 s | 14.884 s |
| Median output tokens | 889 | 657 |

Median paired latency difference was −2.956 seconds. These are fresh producer
calls, **not** live workflow/browser latency or complete clinical responses.
Only 29 full drafts passed the original full-response gates on replay; brief
proposals are never put into that release denominator. C25 is listed but excluded
from agreement and under/over. Advice safety and claim support remain
`not_assessed`; exact quotations do not establish either.

The eight eligible full-arm lower-acuity disagreements were C07, C12, C13,
C22, C32, C34, C38 and C47. Brief added C05 among eligible disagreements;
C32 instead failed its output contract. Neither arm had an eligible higher-acuity
disagreement. These directions are **not adjudicated harm**. The complete
[per-case records and scorecard](../outputs/routing-brief-network-replication-2026-09-15/report.json)
retain every failure and care conflict.

## Why the smaller contract lost availability

The brief prompt retained the pre-OUTPUT routing policy, but accidentally
dropped the later paragraph defining `activationQuote`. Nine brief outputs used
that field for emergency symptoms instead of an already-active EMS quotation.
Five exceeded the two-citation bound; C17 additionally included a blank citation.
C21 stitched a patient quote that was not a contiguous original span. The native
provider schema preserves structure, but the pinned adapter converts length and
cardinality bounds into descriptions; they are not decoder guarantees.

This is a failed simplification, not evidence that more supervisors are needed.
Do not weaken care checks or silently strip invalid fields to improve the score.
The read-only diagnostic shows that C17 still contained an emergency route;
its whole-object rejection was not absence of routing intent. Conversely,
repairing C25's citation formatting would still leave a conflict with its earlier
issued care. Six full and seven raw brief outputs reduce previously issued
setting/transport; the original results remain blocked.

## Clinical and evidence findings

Repeated disagreements cannot be explained by serialization alone. Several
answers infer that a likely benign condition means no clinician task remains.
That requires checking the actual unresolved task, not blanket async escalation.
Some alternatives may be defensible without matching the development reference;
that distinction must remain visible rather than editing `acceptedRoutes`.

Generated context also broadens patient facts: C07 turns drinking into established
hydration, and C22 broadens partial weight bearing. The original patient remains
available, but duplication can anchor the final model. The next single-factor
ablation removes generated context from the producer while preserving the
original patient, exact evidence, output schema and policy. It does not change
retrieval or claim to solve every clinical disagreement.

For RAG, [claim-specific support auditing](RAG_DISPOSITION_SUPPORT_2026-09-15.md)
distinguishes finding a relevant document from finding an applicable supporting
passage. A [capacity-only section expansion](../src/evidence/rag/support-section-expansion-notes.md)
improved authored support-span availability 9/16→11/16 across 72 saved retrieval
variants, without displacing any selected passage. Both gains are the same
migraine witness in two hybrid variants, not two independent clinical wins.
An earlier replacement experiment lost a medication section and is retained as
a negative result. No corpus rebuild, new agent or paid RAG call was needed.

## Identity, failures, spend and reproduction

Frozen plan fingerprint:
`284d2a67f87a553b4b8d76101a1caa8ec1b29e008c545ff8444d3037fe762e2b`.
All frozen file hashes matched at completion; V25's separate source/build,
corpus and reference identity also verified. A fresh score replay is byte-identical.

The first sandbox launch made 100 pre-connect DNS-failed attempts. They remain
in `outputs/routing-brief-paired-2026-09-15`, not pooled with the network-enabled
replication. The [append-only reconciliation](ROUTING_BRIEF_NETWORK_RECONCILIATION_2026-09-15.json)
documents why no provider inference was dispatched and releases its conservative
reservation without rewriting unknown usage as measured zero. DNS/unauthenticated
connectivity preflight now precedes dispatch; an exclusive run lock prevents
concurrent resumption. Single-case failures remain rows, not cohort killers.

This replication's base token-cost estimate is **$10.895260**; conservative
accounting is **$19.916770**. With $11.783796 previously accounted/reserved,
**$58.299434 remains under the existing $90 ceiling**. These are token-based
estimates/reservations, not invoices. No additional authorization is inferred.

```sh
node --experimental-strip-types scripts/routing-brief-study.ts score outputs/routing-brief-network-replication-2026-09-15 report-NEW.json
node --experimental-strip-types scripts/routing-brief-failure-audit.ts outputs/routing-brief-network-replication-2026-09-15
node --experimental-strip-types --test tests/routing-brief.test.ts tests/routing-brief-study.test.ts tests/routing-brief-failure-audit.test.ts
node --experimental-strip-types src/evidence/rag/support-section-expansion-replay.ts capacity_only
```

Use a new score filename. Historical execution is bound to its saved source
hashes; a later harness edit must not masquerade as the same execution identity.
This experiment did not publish a new GUI response or create physician approval.
