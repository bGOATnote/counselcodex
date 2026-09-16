# Offline retrieval candidate audit

## Decision and scope

The original lexical filter can prevent an embedded source card from becoming a candidate. This diagnostic compares broader candidate discovery using the **existing seven cards and 98 message embeddings**. It changes no registered-study code, frozen output, source card, model prompt, runtime route or GUI. It makes no disposition or embedding calls and reads no clinical reference labels.

This is a **post-study exploratory diagnostic**, not a preregistered ablation or clinical validation. A candidate appearing in a ranking does not show that it is relevant, applicable or safe to use. The current clinical behavior remains unchanged.

## Methods

Lexical retrieval uses matching words and phrases. Dense retrieval compares numerical text embeddings. Reciprocal-rank fusion (RRF) combines ranked lists using rank positions rather than treating their different raw scores as interchangeable.

| Method | Candidate pool and ranking |
| --- | --- |
| Original lexical | Frozen topic, textual-negation/history, population, status and inspection-age filters; lexical ranking, up to three cards. |
| Original hybrid | The same filtered pool; original lexical/dense reciprocal-rank fusion, up to three cards. This is the comparison baseline. |
| Ungated dense | Cosine similarity between the frozen query vector and **all seven** frozen card vectors; top three without the original filters. |
| Union plus RRF | Deduplicated union of original lexical top three and ungated dense top three. Sum `1 / (60 + rank)` for each top-three list containing a card; absent-list contribution is zero. Rank the union and retain its top three. |

Ties use ascending ASCII card ID. Message IDs are reporting metadata; they never affect ranking. Cosine is a similarity score, not a probability or calibrated clinical confidence. No new similarity cutoff, relevance classifier or abstention threshold is inferred from these messages. Original exclusion reasons remain visible for every card, including population and other applicability exclusions that the diagnostic intentionally does not enforce.

The loader first verifies the frozen retrieval completion/plan records, exact artifact and source hashes, archived dependency lock, fixed message/card paths, card content hashes, embedding text hashes, model identity, 1,536-dimensional finite nonzero vectors, request input ordering, and raw-response/receipt vector parity. It reconstructs the original lexical/hybrid selections and evidence packets and checks them against the frozen artifacts. The embedding model is `text-embedding-3-large`; the original provider did not expose an immutable weight revision. This audit checks the existing vector bytes and disclosed identity rather than claiming a newly pinned model revision. It does not repeat the study's budget-ledger audit.

## Observations

| Observation | Count |
| --- | ---: |
| Messages | 98 |
| Source cards | 7 |
| Original hybrid selected no card | 69 |
| Original hybrid selected one card | 19 |
| Original hybrid selected two cards | 10 |
| Original hybrid selected three cards | 0 |
| Ungated dense returned three candidates | 98 |
| Dense membership differs from original hybrid | 98 |
| Union/RRF membership differs from original hybrid | 98 |
| Additional query–card memberships for each alternative | 255 |
| Original memberships removed by either alternative | 0 |
| Dense versus union/RRF membership differences | 0 |
| Dense versus union/RRF ordering differences | 1 |
| Clinically reviewed query–card pairs | 0 |

**The 98 changed memberships are largely a consequence of forcing three candidates from a seven-card corpus.** The alternatives retain all 39 original query–card memberships and add 255 memberships each. Neither the changed count nor the 98 nonempty results estimates relevant recovery, retrieval precision, clinical agreement or reduction in false negatives. RRF adds no different top-three members in this particular corpus; its ordering differs on one message.

### C49: original exclusion and newly surfaced topics

> 28M. Sharp pain on the left side of my chest since yesterday, worse when I take a deep breath. I did a heavy chest workout two days ago. No shortness of breath, no leg swelling, I don't smoke.

Original hybrid: no selected card. The original algorithm excluded `pulmonary-embolism-assessment` as `negated-or-historical-only`. That is a **retriever output**, not a clinical finding or a conclusion that all symptoms are absent.

| Dense rank | Card ID | Cosine |
| --- | --- | ---: |
| 1 | `pulmonary-embolism-assessment` | 0.395280 |
| 2 | `tb-assessment` | 0.293251 |
| 3 | `sprain-care` | 0.284069 |

Union/RRF selects the same three cards. Their relevance and applicability require review; cosine similarity does not decide the care pathway. No case-specific override was added.

### WP08B: original lexical miss and newly surfaced topics

> I'm 52 and noticed a pea-sized shallow scrape on my heel from a new shoe this afternoon. I washed it and covered it. It is not bleeding, hot, swollen, or draining, and I feel well. I have type 2 diabetes. Do I need anything beyond looking after the scrape?

Original hybrid: no selected card. The original algorithm excluded `diabetic-foot-assessment` as `no-topic-match`.

| Dense rank | Card ID | Cosine |
| --- | --- | ---: |
| 1 | `diabetic-foot-assessment` | 0.549410 |
| 2 | `sprain-care` | 0.294204 |
| 3 | `adult-ankle-imaging` | 0.276389 |

Union/RRF again selects the same three cards. The first candidate is a review opportunity, not a verified retrieval hit. The other candidates show why returning top three is not sufficient evidence of useful retrieval. No diagnostic or disposition labels were used to produce this ranking.

## Outputs and review boundary

- [Per-message candidate comparison](../outputs/retrieval-candidate-audit-2026-09-16/candidate-comparison.json): exact messages, original selections, all-card ranks/cosines, RRF ranks/scores, additions/removals and original exclusion reasons.
- [Blank clinician relevance worksheet](../outputs/retrieval-candidate-audit-2026-09-16/clinician-review-worksheet.json): all 686 message–card pairs, with reviewer, relevance, population applicability, missing-information and uncertainty fields left blank. These are not review attestations.
- [Completion and hashes](../outputs/retrieval-candidate-audit-2026-09-16/audit-complete.json): input/source/artifact hashes and zero new provider calls.
- [Source cards](../data/research/workflow-aware-v1/evidence-cards.json): full curated card clauses, source URLs and limitations; all remain clinically unreviewed.

A qualified reviewer should assess candidates against the exact message and complete source conditions, recording irrelevant and uncertain results as well as plausible matches. Any later retriever change needs its own frozen specification, relevance/applicability reference prepared before testing, and evaluation on new messages. Broader candidate discovery alone must not authorize card admission, bypass population or source-quality review, or support a clinical improvement claim.

## Reproduction and checks

```bash
node --experimental-strip-types --test tests/retrieval-candidate-audit.test.ts
node --experimental-strip-types scripts/audit-workflow-retrieval-candidates.ts --verify
```

The command uses a fixed input allowlist and has no credentials, network calls or reference-label inputs. `--verify` is strictly read-only: missing outputs fail, and existing files must match exactly without being rewritten. Initial artifact creation requires deliberately omitting `--verify`; it creates a new directory exclusively. Repeating that initial command verifies existing bytes without rewriting them. Partial, unexpected or differing artifacts fail clearly in both modes.

Tests cover malformed vectors, model/content/text/query hashes, frozen-artifact/source drift, raw/receipt parity, input redirection rejection, deterministic ties, union membership and RRF contributions, strict limits, irrelevant-query nonempty rankings, ID independence, blank review fields, absence of provider/reference dependencies, and append-only output verification. Type checking also passes. These are engineering checks, not clinical review.
