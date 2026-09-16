# V26 isolated disposition-retrieval probes — 2026-09-15

**Selector ordering improved on this authored set; clinical claim support remains
not_assessed. Do not promote the query hints or change live V25.**

The V25 50-first-attempt scorecard/report were completed and committed as
c9dc9ac before these experiments. This is a separate offline V26 candidate,
with no live disposition, judge, repair, clinical graph, or default-mode edits.

## What was built and measured

- Disposition-oriented query hints that preserve the original query verbatim.
- A deterministic selector using topic relevance, existing retrieval rank,
  action/setting text, a small source-class prior, and query representation.
- Exact quote/provenance preservation, canonical duplicate-ID validation,
  and explicit empty-packet/missing-reference/unbound-quote accounting.
- Eighteen authored challenges: 16 document+section targets and two no-target
  controls. The targets are retrieval annotations, **not physician gold**.
- Lexical-first and existing-index hybrid probes with four same-input ablations.
  Both selectors received identical packets within each query variant.

The corpus, weights and challenge queries were not tuned after outcomes were
seen. The existing vector index was copied while the GUI server was stopped;
probes used only that isolated temporary copy. No document vectors were built.

## Results

Every configuration retained 18 attempts: 16 target-bearing attempts in the
Hit/MRR denominator, plus two separately reported controls. All 144 selector
rows completed; no retrieval exceptions, embedding failures, or degraded-hybrid
fallbacks occurred. Source quote hashes remained intact throughout.

| Retrieval | Query | Selector | Hit@1 | Hit@3 | Hit@9 | MRR@9 |
|---|---|---|---:|---:|---:|---:|
| Lexical | Raw | V25 | 0/16 | 6/16 | 7/16 | 0.1823 |
| Lexical | Raw | V26 | 5/16 | 7/16 | 7/16 | 0.3750 |
| Lexical | Hinted | V25 | 2/16 | 7/16 | 8/16 | 0.2865 |
| Lexical | Hinted | V26 | 5/16 | 8/16 | 8/16 | 0.3958 |
| Hybrid | Raw | V25 | 5/16 | 15/16 | 16/16 | 0.6198 |
| Hybrid | Raw | V26 | 12/16 | 16/16 | 16/16 | 0.8646 |
| Hybrid | Hinted | V25 | 7/16 | 15/16 | 15/16 | 0.6667 |
| Hybrid | Hinted | V26 | 10/16 | 15/16 | 15/16 | 0.7708 |

**Same-packet hybrid selector comparison:** eight target ranks improved, seven
were unchanged, one worsened. Migraine red-flag target R04 moved from rank 2 to
3; ectopic-pregnancy disposition R10 moved from 4 to 2. Raw hybrid Hit@9 did
not improve: every target was already present. This is ordering lift, not new
evidence coverage or measured response/clinical lift. The source prior was not
ablated separately, so its individual benefit is unknown.

**Hints are not ready:** hybrid anaphylaxis disposition R07 disappeared from
the retrieved candidates with hints (rank 2 before, absent after). In lexical
search, the nonsense control R17 changed from empty to nonempty. Raw hybrid
also returned passages for both no-target controls. Retrieval has no proven
relevance-abstention guarantee; a nonempty packet must not be treated as support.
No negative control is counted as a successful clinical answer.

## Latency, provenance and limits

Mean V26 selector time was 0.51 ms for raw lexical packets and 1.08 ms for raw
hybrid packets. The corresponding V25 selection times were 0.009 and 0.019 ms.
Mean measured retrieval time, **sum of two sequential queries per challenge**,
was 39 ms raw lexical and 1,514 ms raw hybrid. Hinted runs measured 57 ms and
1,174 ms respectively. Ordering, provider variability and cache effects were
not randomized; these are local observations, not production latency claims.
The live workflow's query scheduling differs from this offline harness.

Corpus composition is 1,021 patient_summary, 370 research_synthesis and two
primary_guideline records. Of the syntheses, 290 carry agent_compiled metadata
and 80 upstream_physician_reviewed. That metadata is not new clinical approval.
The plan's original description of all 370 as agent-compiled was corrected.
OpenEM disposition sections can assume an examination or established diagnosis;
their presence does not establish suitability for initial telehealth triage.

These are small, authored, condition-named development probes. Document+section
targets are incomplete relevance judgments. There was no blinded physician
review, semantic entailment grading, novel symptom/paraphrase validation or
live final-answer comparison. Claim support, unsupported claims and population
applicability remain **not_assessed**, not zero/false/pass.

Between lexical and hybrid execution, independent red-team checks prompted
identity/accounting fixes: canonical key ordering, rejection of conflicting
passage bodies in quote accounting, explicit degraded-hybrid reporting, and
finite/cumulative spend validation. Ranking weights and queries did not change.
Original lexical outputs were preserved rather than rewritten. Each run's
plan records exact code and corpus hashes. A separate read-only replay of the
current selector reproduced all 36 stored lexical selections (259 passage
entries) in exactly the same order, with zero error-status mismatches.

## Spend

| Item | Estimated token-price cost | Conservative accounting |
|---|---:|---:|
| V25 all 50 attempts, including original four and failures | $6.08540647 | $11.06379600 |
| Lexical probes | $0 | $0 |
| Hybrid query embeddings: 68 calls, 671 tokens | $0.00008723 | $0.00008723 |
| Mission total | $6.08549370 | $11.06388323 / $90 |

The hybrid run reserved $0.72 prospectively (at most 72 calls × $0.01); all
68 actual calls returned usage. Unknown-usage calls: zero. No model, judge,
Astra, or corpus-embedding calls were made for RAG. Estimates are not invoices.

The append-only RAG phase ledger retains that $0.72 reservation across fresh
output directories to prevent accidental repeat-spend authorization. Thus the
conservative amount reserved for the whole mission is $11.783796, still below
$90; its $0.72 RAG component is below the nested $15 cap. No extra budget was
inferred. No further API calls are planned in this mission.

## Reproduce and inspect

From the repository root, choose a **new** destination; neither command
overwrites historical results. The second command spends on query embeddings
and requires an isolated copy of the matching existing vector index.

```sh
node --experimental-strip-types --test src/evidence/rag/v26.test.ts src/evidence/rag/v26-probe.test.ts
node --experimental-strip-types src/evidence/rag/v26-probe.ts outputs/v26-lexical-NEW
PAID_RAG_PROBES=15 node --experimental-strip-types src/evidence/rag/v26-probe.ts outputs/v26-hybrid-NEW /private/tmp/counsel-v26-probes.8DwWPw/postgres
```

- [Experiment plan](V26_RAG_PLAN.md)
- [Lexical plan, packets and all rows](../outputs/v26-rag-lexical-2026-09-15/report.json)
- [Hybrid plan, packets and all rows](../outputs/v26-rag-hybrid-2026-09-15/report.json)
- [Hybrid spend ledger](../outputs/v26-rag-hybrid-2026-09-15/ledger.json)
- [V25 completed scorecard report](V25_COMPLETED_REPORT.md)

Final regression checks: 782 root tests passed (48 skipped), 171 GUI tests
passed, 10 isolated V26 tests passed, lint and typecheck passed. The production
Next and Mastra builds passed before the live cohort; both artifact checks and
the frozen V25 source/build/corpus/gold/history verification passed again after
the experiments. V26 is not imported by the production workflow.
The phase-ledger concurrency and degraded-query aggregation branches were
read-reviewed, not fault-injection tested; arithmetic budget caps and passage
identity failures have executable regression tests.

## Decision and merge rule

Keep the small V26 selector, tests and probe harness as an **isolated research
candidate with measured ordering lift and retained regressions**. Do not wire it
or the hints into V25. A future V26+ promotion requires source-level clinical
applicability review, broader blinded retrieval challenges including negatives,
and a fixed-input response study showing improved claim support without worse
routing, latency or completion. No OpenEvidence clone, new agents, live repair,
or corpus rebuild is part of this work. Existing RAG branch work is untouched.
