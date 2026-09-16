# Frozen holdout evidence

## Decision

The retrieval candidate is **not admitted**. The agent orchestration contract
passes its amended synthetic regression suite, but that does not establish
clinical quality.
No retrieval candidate from this study enters the disposition workflow.

Run both studies with:

```bash
npm run holdout:eval
```

The registration in [`configs/frozen-evaluation-v1.json`](../configs/frozen-evaluation-v1.json)
binds every evaluated source file to a SHA-256 digest. It retains the original
registration commit `bbb5f6f` and now records a transparent amendment for the
four-route taxonomy. The results are
[`outputs/frozen-retrieval-holdout-v1.json`](../outputs/frozen-retrieval-holdout-v1.json)
and [`outputs/frozen-agent-holdout-v1.json`](../outputs/frozen-agent-holdout-v1.json).

## Retrieval result

The earlier 20-query development set was saturated. On 24 new synthetic
challenges, including 17 answerable and seven abstention cases, the same frozen
candidate produced:

| Candidate | Hit@1 | Recall@3 | MRR | Abstention accuracy | Forbidden top-3 rate | Order-stable |
|---|---:|---:|---:|---:|---:|---:|
| Exact metadata | 0.294 | 0.588 | 0.480 | 0.000 | 0.0139 | yes |
| Sparse vector | 0.412 | 0.412 | 0.412 | 0.714 | 0.0000 | yes |
| Governed hybrid | 0.588 | 0.588 | 0.588 | 0.714 | 0.0000 | yes |

The registered governed-hybrid gates required Hit@1 at least 0.85, Recall@3 at
least 0.90, abstention at least 0.80, zero forbidden selections, and stable
ordering. It passed only the last two. Seven answerable lexical shifts returned
no document; two unsupported near-domain/homonym queries returned a document.
These failures show sensitivity to wording changes and errors in abstention.
Changing thresholds on these revealed cases would require a new evaluation set.

The retrieval set remains prospective in time relative to the unchanged
retrieval implementation, but it was not independently authored: the repository
author created it and its labels are now visible. It is therefore a stronger
overfitting check than the development set and a weaker claim than an external
clinician-authored holdout. It is not a clinical-performance estimate.

## Agent orchestration result

Nine synthetic regression episodes pass the executable workflow gates:
multi-turn emergency preemption, model-free emergency and named-self-care
bypass, distinct same-day bypass, monotonic care latency, one allowed retrieval,
bounded handoff, prompt-data
isolation, invalid-schema closure, missing-tool closure, and no autonomous
action. The original eight-case fixture was relabeled and a same-day case was
added after the prior labels were visible. This amended result is consequently
digest-bound regression evidence, not a prospective holdout. It uses a
deterministic scripted language-model fixture through the real Mastra
Agent/tool/workflow path and tests orchestration postconditions—not model
reasoning, provider generalization, or clinical safety.

## What happens next

1. Keep the current exact, versioned, context-only lookup in the demo workflow.
2. Do not tune or select a dense model using this revealed holdout.
3. Before seeing a second holdout, register the dense embedding model snapshot,
   reranker, chunking, filters, citation checks, latency/cost budget, and
   degraded behavior.
4. Have a separate author create and seal holdout v2 with authorization,
   freshness/revocation, cross-tenant, prompt-injection, multilingual, typo,
   near-domain abstention, and citation-entailment slices.
5. Compare exact, sparse, governed hybrid, and the registered dense+reranker
   candidate once. Report misses and reject any candidate that weakens a hard
   gate, even if its aggregate relevance score improves.

No OpenAI or Anthropic credential was present, so the external model comparison
was not run. Total external spend for this increment was $0.
