# Stripped disposition baseline — 2026-09-15

**Physician agreement: 35/49 (71.43%). Frozen V25: 21/49 (42.86%).**
The stripped baseline produced 14 more agreements, an increase of 28.57 percentage
points on the same physician-reference denominator. **It is not within five of
the physician labels:** there are 14 disagreements; meeting that threshold would
require at least 44/49, nine additional agreements.

**Separate original-CSV agreement: 35/50 (70.00%).** CSV labels contribute
nothing to the physician score.

## What was tested

One unchanged synthetic patient message produced one disposition in one frontier
provider call. All 50 assignment messages ran once, with 50 valid parsed outputs,
50 unique provider request IDs, and no inference retries, fallbacks, or judge calls.
The producer is independent of the application: no patient-reply product, queue
availability/acceptance/follow-up, retrieval, gates-release stack, or Haiku dual-call.

The provider was **Anthropic Messages API, `claude-opus-5`**, using the existing
configured Anthropic key. Settings: adaptive thinking, low effort, 4,096 maximum
output tokens, four independent requests in flight, no conversation history or
tools. Model and API behavior were checked against the
[official Opus 5 documentation](https://platform.claude.com/docs/en/models/opus-5/whats-new-opus-5).
The response contract is `disposition_id`, the exact matching
`disposition_name`, a short `rationale`, and optional `evidence_cites`. No separate
chain-of-thought field was requested; raw provider responses were retained.

The exact prompt is frozen in
[system-prompt.txt](../outputs/stripped-baseline-2026-09-15/system-prompt.txt).
Its taxonomy is:

| ID | Name | Meaning |
|---|---|---|
| 1 | SELF_CARE | Guidance only; no clinician task now |
| 2 | PRIORITY_ASYNC | Time-sensitive async clinician review, including refill/prescribing assessment |
| 3 | STANDARD_ASYNC | Routine async clinician review |
| 4 | SAME_DAY_IN_PERSON | Needs in-person care today |
| 5 | EMERGENCY_NOW | Immediate emergency action |

The system prompt explicitly assigns medication refills to 2 unless novel
red-flag symptoms require 4 or 5. Patient text is treated as data. The request
contains only this fixed system prompt and the message: no case ID, CSV label,
physician route, prior output, reference narrative, or scoring mapping.

## Scorecard A — physician reference only

The scorer reads
[`physician-system-reference-v2.json`](../data/evaluation/physician-system-reference-v2.json)
**after generation completes** and tests exact name membership in each case's
`acceptedRoutes`. Both accepted async routes count for C03. C25 has null
`acceptedRoutes`, is explicitly excluded, and never contributes to agreement.
Neither `originalSuppliedLabel` within the reference nor the CSV label is used
in this score.

**35 agreements / 49 eligible cases; 14 disagreements.**

| Case | Generated disposition | Physician accepted route |
|---|---|---|
| C05 | 4 SAME_DAY_IN_PERSON | EMERGENCY_NOW |
| C06 | 2 PRIORITY_ASYNC | STANDARD_ASYNC |
| C12 | 4 SAME_DAY_IN_PERSON | EMERGENCY_NOW |
| C13 | 3 STANDARD_ASYNC | PRIORITY_ASYNC |
| C16 | 4 SAME_DAY_IN_PERSON | EMERGENCY_NOW |
| C18 | 2 PRIORITY_ASYNC | STANDARD_ASYNC |
| C24 | 2 PRIORITY_ASYNC | STANDARD_ASYNC |
| C28 | 4 SAME_DAY_IN_PERSON | EMERGENCY_NOW |
| C34 | 1 SELF_CARE | STANDARD_ASYNC |
| C38 | 1 SELF_CARE | STANDARD_ASYNC |
| C44 | 4 SAME_DAY_IN_PERSON | EMERGENCY_NOW |
| C46 | 2 PRIORITY_ASYNC | STANDARD_ASYNC |
| C48 | 4 SAME_DAY_IN_PERSON | EMERGENCY_NOW |
| C49 | 3 STANDARD_ASYNC | SAME_DAY_IN_PERSON |

The mismatch groups are six emergency-versus-same-day cases, four
standard-versus-priority refill cases, one priority-versus-standard case, two
standard-versus-self-care cases, and one same-day-versus-standard case. The four
refill disagreements (C06, C18, C24, C46) follow the user's explicit producer rule;
they remain disagreements in the unchanged physician score.

**C25, reported separately:** the baseline chose 4 SAME_DAY_IN_PERSON. The
reference records the physician's qualified DVT judgment and deliberately has
no definite accepted route. It is neither a success nor a failure in Scorecard A.

Full per-case scorecard:
[scorecard-A-physician.json](../outputs/stripped-baseline-2026-09-15/scorecard-A-physician.json).

## Scorecard B — original assignment CSV only

The mapping below is documentation/scoring code only and never enters a model
prompt. This score includes all 50 cases, including C25.

| Original CSV bucket | Accepted generated IDs |
|---|---|
| SELF_CARE | 1 |
| ASYNC_PHYSICIAN | 2 or 3 |
| URGENT_ESCALATION | 4 or 5 |

**35 agreements / 50 cases; 15 disagreements.**

| Case | Generated disposition | Original CSV bucket |
|---|---|---|
| C04 | 4 SAME_DAY_IN_PERSON | ASYNC_PHYSICIAN |
| C06 | 2 PRIORITY_ASYNC | URGENT_ESCALATION |
| C08 | 5 EMERGENCY_NOW | ASYNC_PHYSICIAN |
| C11 | 1 SELF_CARE | URGENT_ESCALATION |
| C12 | 4 SAME_DAY_IN_PERSON | ASYNC_PHYSICIAN |
| C16 | 4 SAME_DAY_IN_PERSON | ASYNC_PHYSICIAN |
| C17 | 5 EMERGENCY_NOW | ASYNC_PHYSICIAN |
| C19 | 3 STANDARD_ASYNC | SELF_CARE |
| C23 | 5 EMERGENCY_NOW | ASYNC_PHYSICIAN |
| C25 | 4 SAME_DAY_IN_PERSON | ASYNC_PHYSICIAN |
| C30 | 1 SELF_CARE | URGENT_ESCALATION |
| C35 | 5 EMERGENCY_NOW | ASYNC_PHYSICIAN |
| C43 | 4 SAME_DAY_IN_PERSON | ASYNC_PHYSICIAN |
| C44 | 4 SAME_DAY_IN_PERSON | ASYNC_PHYSICIAN |
| C46 | 2 PRIORITY_ASYNC | URGENT_ESCALATION |

Full per-case scorecard:
[scorecard-B-csv.json](../outputs/stripped-baseline-2026-09-15/scorecard-B-csv.json).
No combined, averaged, or CSV-adjusted physician score is reported.

## Interpretation of Brandon's hypothesis

This result supports the practical value of a stripped disposition baseline:
it returned a care setting on every case and achieved more all-case physician
agreements than frozen V25. It does not establish that removing any particular
component caused the improvement. The output contract and prompt also changed.

The [frozen V25 report](V25_COMPLETED_REPORT.md) records 27/50 completed releases
and 21 agreements. Its **21/49** comparison retains non-completions as
non-successes; its separate conditional figure is **21/27** among eligible
completed releases. The baseline's **35/49** is compared with **21/49**, without
substituting V25's conditional denominator. V25's broader patient-reply and
release behavior was not reproduced in this prototype.

This is one pass through a known synthetic development cohort. The physician
reference is the designated system reference, not new independent physician
adjudication of these outputs or held-out validation. Reference disagreements
are not adjudicated patient harm. Patient-advice quality, queue execution,
follow-up, citation support, and clinical readiness were not scored.

**No promotion claim. Live `/` and `/candidate` V25 were not modified.**

## Latency, cost, and provenance

| Measure | Result |
|---|---:|
| Completed / valid / attempted | 50 / 50 / 50 |
| Inference calls per case | 1 |
| Median provider round-trip latency | 2.648 s |
| p95 provider round-trip latency, nearest rank | 4.082 s |
| Maximum provider round-trip latency | 4.797 s |
| Frozen-manifest to generation completion, concurrency 4 | 35.586 s |
| Input / output tokens | 22,003 / 6,697 |
| Standard token-price estimate | $0.277440 |
| Conservative accounted spend, doubled input | $0.387455 |

Timing is direct HTTP completion, not browser paint or serial throughput. Prices
use $5/million input and $25/million output from
[Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing),
checked 2026-09-15; these are estimates, not an invoice. The new append-only
manifest records an $8 run ceiling and a $6.812670 prospective reservation within
the existing reconciled $73.392155 remaining allocation. After conservative
accounting, that balance is $73.004700. Historical ledgers were not rewritten.

- CSV: `data/patient_messages.csv`; SHA-256 `d17771ed706c6866d2b13f2d7f5344824acf51aaf281b8af6368637586d71a15`.
- Prompt SHA-256: `91e5967ecdd01f691ac90622687941a750220983e3fb8e41abcf54aa849ec987`.
- Physician reference SHA-256: `19a37b5ab11f7ed4f266d0d4adb0bf8dd4ba977a6aed1af7c83e3b8bfc6c6598`.
- Generation frozen: `2026-09-15T19:00:26.035Z`; all generation complete: `2026-09-15T19:01:01.621Z`.
- First scorer reference-read timestamp: `2026-09-15T19:02:38.523Z`.
- All 150 request/raw/parsed artifact hashes, 50 unique provider response IDs,
  unchanged input bytes, and 249 existing application-file hashes verified.
- Independent read-only audit reproduced both scores, both miss lists, and the
  no-label request boundary.

Artifacts: [manifest](../outputs/stripped-baseline-2026-09-15/manifest.json),
[generation completion and accounting](../outputs/stripped-baseline-2026-09-15/generation-complete.json),
[scoring audit](../outputs/stripped-baseline-2026-09-15/scoring-audit.json).
For every C01–C50, the output directory also contains `Cxx-request.json`,
`Cxx-raw.json`, and `Cxx-parsed.json`.

## Reproduction and verification

From the independent `counselcodex` repository, with the existing `.env` providing
`ANTHROPIC_API_KEY`:

```sh
node scripts/stripped-disposition-baseline.mjs generate data/patient_messages.csv outputs/stripped-baseline-2026-09-15
node scripts/score-stripped-disposition-baseline.mjs outputs/stripped-baseline-2026-09-15
node --test tests/stripped-disposition-baseline.test.mjs
```

The first command skips already recorded cases; a started case without a saved
completion cannot be called again. The scoring command is offline and verifies
frozen artifacts before opening the reference. Re-scoring verifies existing
scorecards without rewriting them. Exact model outputs are preserved rather
than claimed to be reproducible from a random seed.

Validation: focused offline tests, `npm run lint`, `npm run typecheck`, and
`npm test` passed. Parent `make lint` was also run; it reports eight existing
Python lint violations in `python/build_workbook.py`, `python/dispo_agent.py`,
and `python/evaluate.py` within this nested repository. Those unrelated files
were unchanged.
