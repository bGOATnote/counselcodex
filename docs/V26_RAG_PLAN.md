# V26 disposition-evidence selection experiment

Started only after V25's complete 50-row scorecard/report were saved and committed
as c9dc9ac. This is an **offline research candidate**, not a replacement for
V25 and not an OpenEvidence clone.

## Archaeology

ClinicalRagStore.search uses PostgreSQL full-text ranked disjunction, optional
query embeddings, reciprocal-rank fusion, and a two-chunks-per-document cap.
The live candidate requests hybrid search (five hits per query); hybrid-graph
is not enabled. Context extraction supplies bounded queries. The producer then
receives up to nine passages chosen by round-robin, without disposition-aware
selection. V25 generation and verification now share that exact selector.

The frozen corpus contains 1,393 source records / 5,205 eligible chunks:
1,021 patient summaries, 370 research syntheses (290 marked agent_compiled and
80 upstream_physician_reviewed), two primary guidelines. These are metadata
labels, not new clinical adjudication. Two documents are locally quarantined. Many OpenEM disposition
sections assume completed examinations or diagnoses. Metadata or a section
heading cannot establish safe use for initial telehealth routing.

## Candidate (src/evidence only)

1. Bounded intent hints for setting/timing, management and red flags. Preserve
   every original query character; if the added hint exceeds 300 characters,
   use the unchanged query. Do not invent findings, ages, or risk factors.
2. Score topic overlap, original retrieval rank, and action/setting text rather
   than allocating the packet only by round-robin. Keep per-query representation.
   Semantic-only hits remain eligible; no exact-keyword exclusion gate.
3. Small source-class prior only after topic relevance. Soft patient summaries
   may be demoted, but explicit emergency-action summaries are not. Agent-compiled
   content receives no authority bonus. Source class never certifies a claim.
4. Exact immutable quotes/context/provenance and conflicting-ID rejection.
5. Eval-facing missing-reference, unbound-reference and empty-packet accounting.
   Semantic support and applicability remain not_assessed.

## Frozen authored probes and ablation

18 authored probes: 16 document+section relevance targets and two no-target
controls, defined in src/evidence/rag/v26-challenges.ts before execution. These
are retrieval annotations, not physician gold, exhaustive relevance judgments,
or independent clinical approval. Several queries deliberately use condition
names: success does not establish performance on novel symptom paraphrases.

Use the unchanged corpus in an isolated **in-memory lexical index**; no paid
corpus rebuild, new source ingestion, embedding build or access to the GUI's
live database. Compare four configurations on the same two-query inputs:

- Raw queries + V25 selection (baseline).
- Raw queries + V26 selection (isolates selector).
- Hinted queries + V25 selection (isolates hints).
- Hinted queries + V26 selection (combined).

Report target Hit@1/3/9 and MRR@9, original candidates versus selected targets,
per-query coverage, empty packets, no-target-control leakage, source-class mix,
retained failures, local retrieval/selection timings, and unchanged quote hashes.
No target means undefined hit/MRR, not a successful match. Both controls still
count as attempts. Fixed weights are not tuned after seeing probe results.

## Money and promotion rule

$0 lexical first. Optional query-embedding probes are capped at $15 inside the
remaining $78.936204 of the inclusive $90 mission cap; not $15 extra. No Astra,
judge, repair, additional live disposition cohort, or paid embedding rebuild.
If no hybrid probes run, explicitly report hybrid performance not measured.

Land the experimental module/tests/docs only after the V25 scorecard freeze.
Do not import it in V25, alter default candidate mode, change clinical-graph
release logic, or mutate corpus/gold/history. A null or regression stays visible.
Promotion would require passage-level claim/application review and a separate
versioned live study; retrieval-target lift alone is insufficient.
