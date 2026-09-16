# Assignment-faithful three-bucket comparison — 2026-09-15

**Physician scorecard: Opus 42/49 (85.71%); Fable 5.1 44/49 (89.80%).**
**Separate CSV scorecard: Opus 33/50 (66%); Fable 31/50 (62%).**
Both available models completed 50 one-shot calls with 50 valid outputs each.

## Results and historical comparisons

| Run | Physician agreement | Original CSV agreement | New inference calls |
|---|---:|---:|---:|
| Three-bucket Opus 5 | 42/49 (85.71%) | 33/50 (66%) | 50 |
| Three-bucket Fable 5.1 | 44/49 (89.80%) | 31/50 (62%) | 50 |
| Frozen five-way Opus, collapsed to three buckets | 46/49 (93.88%) | 35/50 (70%) | 0 |
| Frozen V25, original exact-route historical anchor | 21/49 (42.86%) | Not recomputed | 0 |

The **frozen five-way Opus originally scored 35/49**. Mapping both its predictions
and physician accepted routes into three buckets yields **46/49**. Eleven prior
disagreements disappear solely because the mapping merges the two async priorities
and the two urgent settings. The old raw/parsed outputs and original 35/49
scorecard were preserved. Its remaining mapped misses are **C34, C38, C49**.

V25's **21/49** is retained as the requested historical anchor from the
[frozen V25 report](V25_COMPLETED_REPORT.md). It is the original exact-route
all-case figure, with non-completions retained as non-successes; V25 was not
re-scored under this three-bucket map. Its separate conditional figure is 21/27
completed eligible releases, from 27/50 completed releases overall. These
historical output contracts and taxonomies differ from the new experiment.

Fable has two more physician agreements than fresh three-bucket Opus, but two
fewer CSV agreements. Fable has five physician misses and meets the prior
within-five threshold; Opus has seven and does not. Neither fresh run exceeds
the frozen five-way outputs after collapse: Opus is four agreements lower,
Fable two lower. This single pass does not establish a stable model ranking or
identify which component of the former application caused its failures.

## Exact producer and execution

The system prompt contains only the requested taxonomy, refill rule, and JSON
contract:

```text
Choose exactly one bucket for the patient message:
1. SELF_CARE
2. ASYNC_PHYSICIAN
3. URGENT_ESCALATION

Medication refill → ASYNC_PHYSICIAN unless clear emergency/same-day red flags → URGENT_ESCALATION.
Return only JSON with "disposition" (one exact bucket name) and "rationale" (short).
```

Every user content field is the unchanged message from
`data/patient_messages.csv`. Case IDs, CSV labels, physician references, prior
outputs, and the five-to-three mapping never enter the provider context. The
result contains one exact bucket name and a short rationale, with no numeric
ID or five-way split.

Both runs use the **direct Anthropic Messages API** and the configured
`ANTHROPIC_API_KEY`. Authenticated model discovery and per-model read-only
lookups confirmed access to `claude-opus-5` and `claude-fable-5-1`; the saved
responses confirm 50 generations from each exact model. Fable was available,
so no substitute or simulated Fable run was used. Claude Code was unnecessary.

Opus exactly reuses stripped v1 provider settings: adaptive thinking, low effort,
4,096 maximum output tokens. Fable uses the same settings with only the model
ID changed. Four independent messages run concurrently within each arm. Each
case has one POST, no automatic retry, no fallback, no second call, and no
shared conversation. The model lookups are metadata requests, not inference.

This independent producer has no gates, Haiku, RAG, patient reply, queue,
availability, acceptance, or follow-up workflow. No app runtime is imported.
**Live `/` and `/candidate` V25 were unchanged. No promotion claim is made.**

## Scorecard A — physician only, after generation freeze

The offline scorer first verifies every frozen request/raw/parsed artifact,
then opens `physician-system-reference-v2.json`. Only each case's
`acceptedRoutes` determines its accepted bucket set:

| Physician route | Scored bucket |
|---|---|
| SELF_CARE | SELF_CARE |
| PRIORITY_ASYNC or STANDARD_ASYNC | ASYNC_PHYSICIAN |
| SAME_DAY_IN_PERSON or EMERGENCY_NOW | URGENT_ESCALATION |

Multiple accepted routes are mapped and deduplicated. C25 has null
`acceptedRoutes` and is excluded from agreement, leaving **49 cases**.
Both new models chose URGENT_ESCALATION for C25; it is neither a physician
success nor a physician failure. Original CSV labels, including the embedded
`originalSuppliedLabel` field in the reference file, never enter this score.

### Physician disagreements

Opus misses: **C07, C22, C34, C38, C43, C47, C49**.

Fable misses: **C22, C32, C34, C38, C47**.

The table contains every case missed by either model; matching cells are marked.

| Case | Accepted physician bucket | Opus | Fable |
|---|---|---|---|
| C07 | ASYNC_PHYSICIAN | SELF_CARE | ASYNC_PHYSICIAN (agree) |
| C22 | ASYNC_PHYSICIAN | SELF_CARE | SELF_CARE |
| C32 | ASYNC_PHYSICIAN | ASYNC_PHYSICIAN (agree) | SELF_CARE |
| C34 | ASYNC_PHYSICIAN | SELF_CARE | SELF_CARE |
| C38 | ASYNC_PHYSICIAN | SELF_CARE | SELF_CARE |
| C43 | URGENT_ESCALATION | ASYNC_PHYSICIAN | URGENT_ESCALATION (agree) |
| C47 | ASYNC_PHYSICIAN | SELF_CARE | SELF_CARE |
| C49 | URGENT_ESCALATION | ASYNC_PHYSICIAN | URGENT_ESCALATION (agree) |

All five Fable disagreements are SELF_CARE instead of accepted ASYNC_PHYSICIAN.
Opus has five such disagreements and two ASYNC_PHYSICIAN choices instead of
accepted URGENT_ESCALATION. These are reference discrepancies, not independently
adjudicated harm outcomes.

Full scorecards: [Opus A](../outputs/stripped-3bucket-opus-2026-09-15/scorecard-A-physician.json)
· [Fable A](../outputs/stripped-3bucket-fable-2026-09-15/scorecard-A-physician.json).

## Scorecard B — original CSV only

This is exact equality against the assignment CSV's SELF_CARE,
ASYNC_PHYSICIAN, and URGENT_ESCALATION labels, using all **50 cases**, including
C25. The physician reference is not an input to this score. There is no blended
or CSV-adjusted physician score.

- **Opus: 33/50**, 17 misses: C04, C06, C07, C08, C11, C12, C16, C17, C19, C22, C23, C25, C30, C35, C44, C46, C47.
- **Fable: 31/50**, 19 misses: C04, C06, C08, C11, C12, C16, C17, C19, C22, C23, C25, C30, C32, C35, C43, C44, C46, C47, C49.

Full per-case predictions and original labels:
[Opus B](../outputs/stripped-3bucket-opus-2026-09-15/scorecard-B-csv.json)
· [Fable B](../outputs/stripped-3bucket-fable-2026-09-15/scorecard-B-csv.json).
The frozen five-way Opus retains its separate **35/50** CSV score after collapse.

## Timing, usage, and accounting

| Measure | Opus | Fable |
|---|---:|---:|
| Valid outputs / calls | 50 / 50 | 50 / 50 |
| Median provider round-trip latency | 2.3015 s | 3.7995 s |
| p95 round-trip latency, nearest rank | 3.526 s | 4.710 s |
| Maximum round-trip latency | 4.391 s | 5.240 s |
| Manifest-to-completion wall time, concurrency 4 | 30.253 s | 48.998 s |
| Input tokens | 9,553 | 9,653 |
| Output tokens | 4,252 | 4,845 |
| Standard token-price estimate | $0.154065 | $0.338780 |
| Conservative accounting, doubled input | $0.201830 | $0.435310 |

Timing is direct HTTP completion, not browser paint. Estimates use the
[official Anthropic prices](https://platform.claude.com/docs/en/about-claude/pricing),
checked 2026-09-15: Opus $5/$25 and Fable 5.1 $10/$50 per million input/output
tokens. They are not invoices. Combined estimate: **$0.492845**; conservative
accounting: **$0.637140**. Run ceilings were $8 and $16; prospective reservations
were $6.443670 and $12.890340. Accounting chains from the previous baseline's
$73.004700 remaining allocation, through Opus, to **$72.367560 remaining** after
Fable. Historical ledgers were not rewritten.

## Freeze and audit trail

- Opus frozen at `2026-09-15T19:20:13.983Z`; generation complete `2026-09-15T19:20:44.236Z`.
- Fable frozen at `2026-09-15T19:20:44.687Z`; generation complete `2026-09-15T19:21:33.685Z`.
- Physician-reference scoring began only afterward: Opus `2026-09-15T19:21:58.174Z`, Fable `2026-09-15T19:21:58.163Z`.
- CSV SHA-256: `d17771ed706c6866d2b13f2d7f5344824acf51aaf281b8af6368637586d71a15`.
- Shared prompt SHA-256: `80810b85df956d779709a71dbc0d85534f5847e2563b0be5235048cb254a03ce`.
- Physician-reference SHA-256: `19a37b5ab11f7ed4f266d0d4adb0bf8dd4ba977a6aed1af7c83e3b8bfc6c6598`.
- Verified 100 unique provider request IDs, 100 unique response IDs, and all
  300 request/raw/parsed hashes. All outputs are HTTP 200 with completed
  `end_turn` responses and valid exact bucket names.
- All 249 snapshotted existing application files and the original five-way
  artifacts/source remain unchanged. An independent read-only audit reproduced
  both new scorecards, miss lists, and the 46/49 historical collapse.

Each output directory contains a manifest, exact system prompt, 50
`Cxx-request.json` / `Cxx-raw.json` / `Cxx-parsed.json` triplets, a
`generation-complete.json` with usage/accounting, two independent scorecards,
and a scoring audit:

- [Opus artifacts](../outputs/stripped-3bucket-opus-2026-09-15/)
- [Fable artifacts](../outputs/stripped-3bucket-fable-2026-09-15/)
- [Comparison summary](../outputs/stripped-3bucket-comparison-2026-09-15/comparison.json)
- [Frozen five-way collapsed physician scorecard](../outputs/stripped-3bucket-comparison-2026-09-15/frozen-fiveway-collapsed-scorecard-A-physician.json)
- [Frozen five-way collapsed CSV scorecard](../outputs/stripped-3bucket-comparison-2026-09-15/frozen-fiveway-collapsed-scorecard-B-csv.json)

## Reproduction

From `counselcodex`, with the existing Anthropic key configured:

```sh
node scripts/stripped-3bucket-baseline.mjs claude-opus-5 data/patient_messages.csv outputs/stripped-3bucket-opus-2026-09-15 outputs/stripped-baseline-2026-09-15/generation-complete.json
node scripts/stripped-3bucket-baseline.mjs claude-fable-5-1 data/patient_messages.csv outputs/stripped-3bucket-fable-2026-09-15 outputs/stripped-3bucket-opus-2026-09-15/generation-complete.json
node scripts/score-stripped-3bucket-baseline.mjs outputs/stripped-3bucket-opus-2026-09-15
node scripts/score-stripped-3bucket-baseline.mjs outputs/stripped-3bucket-fable-2026-09-15
node --test tests/stripped-3bucket-baseline.test.mjs
```

Existing completed cases are reused without another provider call. A started
case cannot be silently retried. Re-scoring is offline and verifies existing
scorecards without rewriting them. No deterministic model-output reproduction
is claimed; the exact original outputs are saved.

This is a known synthetic development cohort, not held-out validation or new
physician adjudication. The three-bucket experiment measures assignment-level
routing agreement only; it does not establish clinical readiness.

## Validation

All 21 focused tests pass, including a synthetic offline 50-call/resume test,
exact prompt and schema checks, physician route collapse, CSV independence,
and C25 denominator handling. Full `npm test` passes 879 tests;
`npm run lint` and `npm run typecheck` pass. Offline replays verify both
scorecards without rewriting them. Independent report and artifact QA passed.

Parent `make lint` was run and reports the same eight pre-existing Python
violations in `counselcodex/python/build_workbook.py`, `dispo_agent.py`, and
`evaluate.py`. Those unrelated files remain unchanged.
