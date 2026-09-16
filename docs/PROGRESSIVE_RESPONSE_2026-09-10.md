# Progressive responses: measured implementation, not a loading animation

## What changed

The default remains three Opus 5 agents in Mastra. History and the emergency
supervisor run independently; the writer uses both. What changed is delivery:

1. Known emergency instructions are emitted immediately, and all models continue.
2. A valid supervisor decision now emits **same-day action**, too, without waiting
   for history. Same-day examination and emergency-now instructions stay distinct.
3. The writer streams structured JSON. Only a **closed disposition and complete
   patient-message field**, after supervisor and contract checks, can appear early.
   A sentence that merely looks complete inside an unfinished JSON string cannot.
4. The reason, differential, red-flag inventory, vital-sign limitations and
   claim-linked evidence arrive as the completed, checked answer. Internal history,
   speculation and raw token fragments never become a second patient response.

Earlier instructions survive late model failure or a dropped connection. Each
emitted section is saved and fsynced to an append-only event log before delivery.
The exact visible prefix remains available for evaluation even if the final
answer fails. The client checks sequence, event-log agreement, urgency preservation
and consistency with the final reply. Editing the input hides stale responses.
The Sites-guided GUI change retains one response panel rather than adding agents
or model controls to the clinical screen. This is still a local prototype.

**“Contract-checked” does not mean clinically validated.** The early gate checks
timing language, urgency floor, EMS preservation and limited known unsafe phrases.
It does not prove semantic accuracy, guideline entailment or absence of harm.

## The predeclared comparison

The 50 original messages were frozen with their hashes before calls. The paid
development pilot selected C04 and C01, two trials each, rotating the order of
three profiles: 12 runs total. Original supplied labels were never model inputs.
Expected routes were project-authored development expectations, not adjudication.

| Profile | Critical dependencies | Calls |
| --- | --- | ---: |
| `progressive-opus` — default | Opus history + Opus supervisor, then Opus writer | 3 |
| `parallel-opus` — experimental | Opus supervisor + independent Opus writer | 2 |
| `haiku-opus` — experimental | Haiku history + Opus supervisor + independent Opus writer | 3 |

The fast arm is an ablation of the history dependency, not an assertion that
Haiku independently establishes clinical safety. Haiku selects a short verbatim
reported span for a fixed acknowledgment. It cannot generate free-form advice.
That acknowledgment is suppressed once clinical action or a reply is available,
and **does not count as time to clinical guidance**. The writer in both parallel
arms receives the same original message and retrieved guidance, not Haiku's output.
Consequently, faster final times in the Haiku arm cannot be attributed to Haiku
improving the writer: provider variability and this tiny sample confound that claim.

## Measurements

All figures below are observations, not latency guarantees. Pilot times measure
server emission; HTTP times measure receipt through the actual GUI stream decoder,
not browser paint, patient reading, receipt confirmation or completed care.

### C04: two trials per profile, medians in seconds

| Profile | First action | Complete patient paragraph | Completed assessment |
| --- | ---: | ---: | ---: |
| Progressive Opus | 6.13 | 16.35 | 28.17 |
| Parallel Opus | 6.41 | 7.86 | 20.93 |
| Haiku + parallel Opus | 5.93 | 5.94 | 18.02 |

The prior observed C04 run took 28.796 seconds for its buffered answer. This is
a historical single-run comparison, not a randomized estimate of improvement.
The useful improvement is explicit care action before the explanation completes.

Across both cases, progressive Opus completed 3/4 attempts; the other arms each
completed 4/4. Haiku emitted acknowledgments in 3/4 attempts, median **2.868 s**;
one was correctly suppressed because action arrived first. All 11 completed
answers matched development route expectations. **That is not 100% clinical
accuracy:** all five completed C01 answers failed research coverage, and manual
inspection found unsupported clinical assertions in C04 outputs.

### Actual endpoint verification

| Run | Action received | Patient paragraph received | Finished | Outcome |
| --- | ---: | ---: | ---: | --- |
| C04, first HTTP run | 7.43 s | Not emitted | 10.37 s | History contract rejected; action retained |
| C02, HTTP run | **0.027 s** | 11.05 s | 19.71 s | Three-model answer completed |
| C04, after contract fix | **6.07 s** | **13.35 s** | **25.69 s** | Three-model answer completed |
| C01, after contract fix | Not applicable | 16.02 s | 24.62 s | Completed; research coverage failed |

All four HTTP runs persisted their traces, final artifacts and event logs. These
are endpoint/decoder checks plus component-render tests, not a visual browser
rehearsal. No patient delivery or clinical efficacy claim follows from them.

## Failures found, and the response to them

- **History contract mismatch:** the pilot's failed C01 and the first HTTP C04
  correctly marked details unknown but cited source context, e.g. “No fever” for
  unknown measured temperature. The validator unnecessarily required an empty
  quote for every unknown. It now accepts empty or verbatim source context for
  unknowns while preserving the unknown status and original output. Reported
  findings and denials still require nonempty exact quotes. Two regression tests
  exercise this distinction; the subsequent C04/C01 runs completed. Original
  failures remain in the denominator, not rewritten as successes.
- **Unsupported progression:** four of six pilot C04 patient paragraphs described
  *spreading* redness, although the original says the skin around the wound is red
  and a little swollen. This escaped the current checks in every architecture.
  The patient-visible prefix is therefore part of the failure, not excused by a
  subsequently correct route. This remains an unresolved semantic-grading gap.
- **Other clinical concerns:** one C04 reason calls age unknown after naming the
  patient as 62; several responses make categorical statements about emergency
  care from unassessed features. Scope and proportionality of return precautions
  need clinical grading. Exact quote presence is not entailment.
- **Research coverage:** C01 has no retrieved source in the four-note corpus.
  Every completed C01 failed coverage. `status: complete` describes execution,
  not clinical quality; the evidence score remains failed, support unassessed.
- **Fast-agent limits:** Haiku sometimes ignored the requested finding/question
  brevity. Its raw history is not exposed or treated as a completed interview.

Neither experimental profile was promoted. A defensible next clinical experiment
requires a frozen, broader paired set; blinded grading of every emitted prefix
and final answer; emergency/same-day discrimination; assertion-level attribution
and citation applicability; failed-run accounting; and cost/latency reporting.
This pilot does not establish non-inferiority, a p95, HealthBench performance,
Counsel-equivalent performance or deployment readiness.

## Reproducibility, tracing and spend

[Machine-readable observations](evaluations/progressive-latency-2026-09-10.json)
include all 16 attempts, run IDs and hashes of the immutable local artifacts.
The raw synthetic answers, rejected history and event logs remain under ignored
`apps/evaluation/.local/disposition-agent-v3/`. Prior reviews and CSVs are untouched.

```bash
npm run disposition:latency                # protocol only; no paid calls
node --experimental-strip-types scripts/disposition-latency-report.ts --verify
npm run disposition:test                  # regression contracts, no paid calls
npm run disposition:http-smoke            # describes the bounded endpoint check
```

The report verification requires the original local artifacts; a fresh checkout
can inspect the public observation file without credentials. `--live` on the
latency script cannot reuse its exhausted immutable experiment ledger. A future
paid cohort needs an explicitly budgeted new experiment, never a silent reset.

Historical provenance limitations are recorded rather than edited away: the
pilot's `firstObjectMs` actually measured the first provider text delta, not a
complete object. New runs use `firstTextDeltaMs`. Its manifest prompt hash omitted
the Haiku-specific suffix; new manifests include that suffix and source-file
hashes. The old `medianFinalMs` aggregate included a failed attempt's duration;
tables here use completed assessments only. New reports separate attempt duration
from completed-answer latency and expose missing-timing denominators.

Sixteen workflow runs (42 model invocations) used **about $1.11** at standard
token-rate estimates, not provider invoices. The conservative experiment reserved
its full **$12**. Unknown usage is never counted as free. Historical CQA $20,
Sonnet $5 and Opus $9 ceilings remain unchanged. A separate **$9 interactive demo
allowance** is now available without resetting any experiment: known allocations
total $55 of the user's $100 ceiling. No further automated live calls used it.
These are local application allowances, not provider-account billing enforcement.

## Public engineering sources

- [Counsel's Mastra case study](https://mastra.ai/customers/counsel-health): parallel
  history and emergency supervision and custom retrieval informed the roles.
  It does not publish private prompts or prove our implementation equivalent.
- [Abridge engineering discussion](https://www.latent.space/p/abridge): fast/small
  and slower/larger model staging motivated measuring separate response milestones.
- [Anthropic latency guidance](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-latency)
  and [prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching):
  streaming, bounded outputs and fewer serial dependencies are relevant; caching
  is not evidence that output generation becomes faster.
- [Mastra streaming](https://mastra.ai/docs/guides/streaming): the installed 1.64.0
  streaming types/docs were used to consume real provider deltas. Partial JSON
  objects were not assumed to contain finished text fields.

The comparison repository's pinned revision
`b7792d9f82d89d6dd0feaf820ff21b3dfec73008` was reviewed previously. Its apparent
progress animation began after a buffered response, not after actual clinical
milestones. This implementation measures real emissions and decoder receipts.
