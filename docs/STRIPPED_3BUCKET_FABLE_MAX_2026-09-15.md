# Single Fable 5.1 max-effort ablation — 2026-09-15

**Physician agreement fell from 44/49 to 42/49. CSV agreement remained 31/50.**
All 50 one-shot calls completed with valid outputs. None of the five prior
physician misses flipped. The requested single ablation is complete; **no further
iteration was run**, despite the result remaining below 49/49.

## Frozen protocol

The sole provider-request change was `output_config.effort: "low" → "max"`.
Authenticated Fable model metadata confirms that max is supported. For all
50 cases, the saved request matches its prior Fable request byte-for-byte in
message and system content, and structurally in every other request field.

| Setting | Both runs |
|---|---|
| Provider / model | Anthropic Messages API / claude-fable-5-1 |
| System prompt SHA-256 | 80810b85df956d779709a71dbc0d85534f5847e2563b0be5235048cb254a03ce |
| Thinking | adaptive |
| Maximum output tokens | 4,096 |
| Concurrency | 4 independent messages |
| Calls per message | 1; no retries or fallback |
| Buckets | SELF_CARE, ASYNC_PHYSICIAN, URGENT_ESCALATION |

The exact original [system prompt](../outputs/stripped-3bucket-fable-max-2026-09-15/system-prompt.txt)
was copied without edits. User content is only the unchanged assignment message.
Gold, CSV labels, case IDs, prior outputs, and scoring maps were absent from
provider context. The input CSV is `data/patient_messages.csv`, SHA-256
`d17771ed706c6866d2b13f2d7f5344824acf51aaf281b8af6368637586d71a15`.

There was no RAG, application routing, patient reply, queue, or V25 invocation.
Live `/` and `/candidate` were unchanged. The existing low-effort artifacts,
prompts, and source files were preserved.

## Scorecard A — physician reference only

After generation froze, the offline scorer read
`physician-system-reference-v2.json` and mapped its `acceptedRoutes`:
SELF_CARE stays SELF_CARE; both async priorities become ASYNC_PHYSICIAN; both
same-day and emergency routes become URGENT_ESCALATION. Agreement is membership
in the mapped accepted set. C25 remains excluded, leaving **49 cases**.
Neither the original CSV label nor the reference's `originalSuppliedLabel`
field contributes to this score.

| Run | Physician agreements | Disagreements |
|---|---:|---:|
| Prior Fable low effort | 44/49 (89.80%) | 5 |
| Fable max effort | 42/49 (85.71%) | 7 |
| Observed change | −2 agreements; −4.08 percentage points | +2 |

### The five prior misses

| Case | Low effort | Max effort | Physician accepted bucket | Flipped? |
|---|---|---|---|---|
| C22 | SELF_CARE | SELF_CARE | ASYNC_PHYSICIAN | No |
| C32 | SELF_CARE | SELF_CARE | ASYNC_PHYSICIAN | No |
| C34 | SELF_CARE | SELF_CARE | ASYNC_PHYSICIAN | No |
| C38 | SELF_CARE | SELF_CARE | ASYNC_PHYSICIAN | No |
| C47 | SELF_CARE | SELF_CARE | ASYNC_PHYSICIAN | No |

Only two of all 50 dispositions changed, both losing physician-reference agreement:

| Case | Low effort | Max effort | Physician accepted bucket |
|---|---|---|---|
| C07 | ASYNC_PHYSICIAN | SELF_CARE | ASYNC_PHYSICIAN |
| C49 | URGENT_ESCALATION | ASYNC_PHYSICIAN | URGENT_ESCALATION |

All max-effort physician misses: **C07, C22, C32, C34, C38, C47, C49**.
C25 remains URGENT_ESCALATION in both runs and is unscored against physician gold.
The other 48 model dispositions, including C25, are unchanged.

[Max physician scorecard](../outputs/stripped-3bucket-fable-max-2026-09-15/scorecard-A-physician.json)
· [Prior physician scorecard](../outputs/stripped-3bucket-fable-2026-09-15/scorecard-A-physician.json).

## Scorecard B — original CSV, separately

Exact bucket equality against the original CSV gives **31/50 (62%)** for both
runs, including C25. C07 lost CSV agreement; C49 gained CSV agreement, producing
no net change. The physician reference is not an input to this score.

Max-effort CSV misses: **C04, C06, C07, C08, C11, C12, C16, C17, C19, C22, C23, C25, C30, C32, C35, C43, C44, C46, C47**.

[Max CSV scorecard](../outputs/stripped-3bucket-fable-max-2026-09-15/scorecard-B-csv.json)
· [Prior CSV scorecard](../outputs/stripped-3bucket-fable-2026-09-15/scorecard-B-csv.json).
There is no blended or CSV-adjusted physician score.

## Observed cost and latency delta

| Measure | Prior low | Max | Delta |
|---|---:|---:|---:|
| Standard token-price estimate | $0.338780 | $0.920680 | +$0.581900; 2.72× total |
| Conservative accounted spend | $0.435310 | $1.017210 | +$0.581900 |
| Median provider round trip | 3.7995 s | 5.3485 s | +1.549 s; +40.8% |
| p95 round trip, nearest rank | 4.710 s | 14.851 s | +10.141 s; +215.3% |
| Maximum round trip | 5.240 s | 19.779 s | +14.539 s |
| Manifest-to-completion wall time, concurrency 4 | 48.998 s | 90.847 s | +41.849 s; +85.4% |
| Input tokens | 9,653 | 9,653 | 0 |
| Output tokens | 4,845 | 16,483 | +11,638 |

All 50 responses ended with `end_turn`; none was truncated or failed parsing.
The output-token ceiling remained 4,096 per call. Latencies include direct HTTP
completion, not browser paint, and are single-run observations rather than a
repeated throughput experiment.

Estimates use [Anthropic's published Fable 5.1 prices](https://platform.claude.com/docs/en/about-claude/pricing):
$10 per million input tokens and $50 per million output tokens. They are not
invoices. Conservative accounting doubles the input charge. The $16 run ceiling
and $12.890340 prospective reservation fit the reconciled prior balance;
$1.017210 was accounted, leaving **$71.350350**. Historical ledgers were unchanged.

## Required non-claim

**Higher agreement does not imply a better clinical policy on contested
OTC/self-care physician-reference labels.** The metric measures alignment with
the designated development reference, not independently established clinical
correctness. Moving an OTC/self-care case to clinician review just to match that
reference would not itself establish clinical benefit. C34 and C38 illustrate
the label distinction: SELF_CARE matches their original CSV labels while differing
from the physician reference's ASYNC_PHYSICIAN bucket.

Here, max effort produced lower physician agreement, unchanged CSV agreement,
and higher cost/latency. This is one paired cohort pass and does not establish
a general causal claim that max effort is worse, or that either set of contested
labels is the better clinical policy. No clinical-readiness or promotion claim
is made. No tuning or new inference followed scoring.

## Freeze, artifacts, and validation

- Generation frozen: `2026-09-15T19:47:21.823Z`.
- All generation completed: `2026-09-15T19:48:52.670Z`.
- First scorer reference read: `2026-09-15T19:49:09.413Z`, after completion.
- Physician reference SHA-256: `19a37b5ab11f7ed4f266d0d4adb0bf8dd4ba977a6aed1af7c83e3b8bfc6c6598`.
- Fifty unique request IDs and response IDs, 150 frozen request/raw/parsed files,
  exact effort-only differences, and 249 existing application hashes verified.
- The original low-effort artifacts and frozen source hashes remain unchanged.

[Manifest](../outputs/stripped-3bucket-fable-max-2026-09-15/manifest.json)
· [Generation completion, usage, and accounting](../outputs/stripped-3bucket-fable-max-2026-09-15/generation-complete.json)
· [All paired cases and numerical deltas](../outputs/stripped-3bucket-fable-max-2026-09-15/comparison.json)
· [Scoring audit](../outputs/stripped-3bucket-fable-max-2026-09-15/scoring-audit.json).
The output directory contains `Cxx-request.json`, `Cxx-raw.json`, and
`Cxx-parsed.json` for every C01–C50.

Reproduction from `counselcodex`:

```sh
node scripts/stripped-3bucket-fable-max.mjs
node scripts/score-stripped-3bucket-fable-max.mjs
node --test tests/stripped-3bucket-fable-max.test.mjs
```

Completed cases are reused without inference. A started case cannot be silently
retried; scoring is offline and preserves existing scorecards. No additional
iteration is authorized or performed by this report.

Eight focused offline tests pass; full `npm test` passes **887 tests**.
Project `npm run lint` and `npm run typecheck` pass. Parent `make lint`
reports the same eight pre-existing Python violations in unrelated
`counselcodex/python` files, which were unchanged.
