# Astra effort comparison against the physician reference

15 September 2026 · Frozen three-bucket protocol · Synthetic development cases

## Result and candidate decision

**Astra did not improve physician agreement over Fable in this experiment.**
Astra extra-high and max each agree on **43/49**, versus **44/49** for frozen
Fable 5.1 low. Both Astra arms completed all 50 one-shot calls and chose
identical dispositions across all 50 messages. Keep Fable as the current demo
candidate on this evidence.

| Configuration | Physician agreement | Valid outputs | Median provider latency | p95 latency | Estimated cost, 50 calls | Conservative accounting |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Fable 5.1 low, frozen comparator | **44/49** | 50/50 | **3.7995 s** | **4.710 s** | **$0.338780** | $0.435310 |
| Astra extra-high (`xhigh`) | 43/49 | 50/50 | 5.251 s | 11.823 s | $0.535650 | $0.627975 |
| Astra max (`max`) | 43/49 | 50/50 | 9.5795 s | 19.699 s | $1.115100 | $1.207425 |

Max used **2.08×** the estimated cost and **1.82×** the median latency of
extra-high, with zero disposition changes. Compared with Fable, extra-high
cost 1.58× and max cost 3.29× in these passes. Latencies measure the provider
round trip, not browser rendering. p95 uses nearest rank over all 50 attempts.

Physician accepted routes are the sole selection score. C25 remains unresolved
and excluded only from the fixed denominator of 49; it was generated in both
50-case arms. **No CSV agreement was computed for Astra.** Original assignment
labels remain historical discussion material and do not decide the candidate.

## Ultra availability

The configured OpenAI endpoint accepts `gpt-6-astra`, but rejected
`reasoning.effort: "ultra"` with HTTP 400. The error lists `xhigh` and `max` as
accepted values. The [official Astra API page](https://developers.openai.com/api/docs/models/gpt-6-astra)
also lists max as its highest effort. The experiment used **max as the highest
supported direct-API alternative**; it is not a measurement of Codex Ultra.

The [capability receipt](../outputs/stripped-3bucket-astra-access-2026-09-15/ultra-capability.json)
preserves the exact separate, non-clinical request and error. That rejected
request is outside the 100 patient-case calls and returned no generated output
or token usage. A coding-agent harness would introduce additional instructions
and would not reproduce the direct one-call protocol.

## Every Astra–Fable disposition disagreement

There are exactly **three**. Both Astra effort levels select the same bucket in
each case. All three concern the self-care versus async-review boundary; none
changes an urgent-escalation disposition between these runs.

| Case | Physician accepted bucket | Astra xhigh | Astra max | Fable low | Effect on Astra agreement |
| --- | --- | --- | --- | --- | --- |
| C07 | ASYNC_PHYSICIAN | SELF_CARE | SELF_CARE | ASYNC_PHYSICIAN | Loss |
| C19 | ASYNC_PHYSICIAN | SELF_CARE | SELF_CARE | ASYNC_PHYSICIAN | Loss |
| C47 | ASYNC_PHYSICIAN | ASYNC_PHYSICIAN | ASYNC_PHYSICIAN | SELF_CARE | Gain |

### C07 — fever in a three-year-old

Exact message:

> My 3-year-old has had a fever up to 102F for 2 days. He's still drinking okay and pretty playful in between the fevers. No rash that I can see.

Both Astra rationales use drinking and playfulness between fever episodes to
support home care. Fable identifies the persistent fever in a young child as a
reason for clinician review. The frozen physician reference accepts
`STANDARD_ASYNC`, which maps to `ASYNC_PHYSICIAN`.

### C19 — position-triggered spinning

Exact message:

> I've been dizzy on and off for a few days. The room spins when I roll over or turn my head in bed, but it settles. No chest pain, no weakness, no headache.

All three rationales describe a benign positional-vertigo pattern. Astra uses
that interpretation to select self-care; Fable still calls for clinician
evaluation and treatment guidance. The physician reference accepts
`STANDARD_ASYNC`.

### C47 — a month of difficulty falling asleep

Exact message:

> 45F. I've had trouble falling asleep for the last month or so. Work has been stressful. I'm functioning but tired all day.

Both Astra rationales use the month-long duration and daytime fatigue to select
nonurgent clinician review, matching the physician reference's
`STANDARD_ASYNC`. Fable selects self-care and describes sleep hygiene, stress
management and self-help. Fable's rationale also mentions absence of
mood/suicidality concerns, which the opening message does not establish.
That is an observable rationale issue for review, not a new scored endpoint.

The [dedicated disagreement CSV](../outputs/stripped-3bucket-astra-comparison-2026-09-15/disagreements.csv)
contains the exact three messages and all nine unedited rationales. The
[complete comparison](../outputs/stripped-3bucket-astra-comparison-2026-09-15/COMPARISON.md)
contains every original message, all 150 short rationales, and all pairwise
disagreement lists. The Astra extra-high versus max list is empty.

## Remaining physician misses

- **Astra extra-high and max:** C07, C19, C22, C32, C34, C38.
- **Fable low:** C22, C32, C34, C38, C47.
- Astra resolves one of Fable's five misses, C47, and introduces C07 and C19.
  The other four Fable misses persist.

These are discrepancies against the frozen development reference. Higher
agreement does not establish a better clinical policy on contested OTC or
self-care labels. No independent clinical adjudication or rationale-quality
score was added. This one pass establishes the observed counts, not a stable
population ranking.

## Protocol and evidence integrity

- Model: `gpt-6-astra`, through native OpenAI Responses; the returned model is
  also `gpt-6-astra` on all 100 calls.
- Efforts: `xhigh` and `max`; that setting is the only difference between Astra
  request bodies for a given message.
- Frozen system-prompt SHA-256:
  `80810b85df956d779709a71dbc0d85534f5847e2563b0be5235048cb254a03ce`.
- One exact patient message as user input. No case ID, label, reference,
  history, retrieval, tool, judge or example enters the provider payload.
- Prompt text and 4,096 output-token ceiling match Fable. Provider envelopes
  differ: OpenAI `instructions`/`input` versus Anthropic `system`/`messages`.
- Four concurrent requests across the two arms, dispatched in case order
  alternating efforts. No retries or fallback calls. All 100 outputs valid.
- Both generation-complete artifacts were written at 22:31:09 UTC before the
  scorer opened the physician reference. Scoring verifies 450 frozen
  request/raw/parsed hashes across the two Astra arms and Fable, plus 150
  distinct provider request IDs and 150 distinct response IDs.
- The scorer projects physician `acceptedRoutes` only. The reference JSON
  retains historical CSV fields; those fields are not used for scoring.

Both Astra cohorts together cost **$1.650750 estimated** and **$1.835400
conservatively accounted**. The initial worst-case reservation was $27.07085.
After both arms and reservation of the entire separate $2 GUI allowance,
**$67.51495** remains available within the prior reconciled $95 allocation.
These are token estimates and conservative reservations, not invoices.
The [combined budget receipt](../outputs/stripped-3bucket-astra-comparison-2026-09-15/budget-reconciliation.json)
separates actual conservative accounting from the GUI's remaining reservation.

Generation: [runner](../scripts/stripped-3bucket-astra.mjs).
Frozen arms: [extra-high](../outputs/stripped-3bucket-astra-xhigh-2026-09-15/)
and [max](../outputs/stripped-3bucket-astra-max-2026-09-15/).
Scoring: [offline scorer](../scripts/score-stripped-3bucket-astra.mjs) and
[integrity audit](../outputs/stripped-3bucket-astra-comparison-2026-09-15/scoring-audit.json).

```bash
# Offline verification and scoring; does not make model calls.
node scripts/score-stripped-3bucket-astra.mjs
node --test tests/stripped-3bucket-astra.test.mjs tests/stripped-3bucket-astra-score.test.mjs
```

Repeated scoring reproduces all derived files byte for byte. The current
Fable GUI, V25, frozen prompt, physician reference, CSV and historical results
are unchanged. The prior slide/workbook package remains the Fable-demo package;
this report is its new Astra comparison addendum.

[Validation](../outputs/stripped-3bucket-astra-comparison-2026-09-15/validation.json):
21 focused tests passed; the full npm suite, lint, typecheck and both production
builds passed. An independent Python recount reproduced the physician counts
and disagreement IDs. Parent `make lint` retains eight pre-existing import and
line-length findings in unchanged legacy Python files.
