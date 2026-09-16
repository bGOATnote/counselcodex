# Independent audit: three Nano development configurations

This audit covers the completed Nano v1, v2 and final record-scope v3 development
runs. It does not cover the subsequently proposed Cascade 8B comparison. It made
no inference requests, read no provider keys and changed no source, gold or
historical result file.

**All three configurations fail the unchanged offline utility threshold.**
The artifacts support a useful engineering finding: native thinking improves
this Nano setup substantially, but its false alarms still make an automatic
binding decision unreliable on the authored controls. Nothing here changes the
live router or establishes clinical performance.

## Independently reproduced counts

| Same 24 development items | Nano v1 | Nano v2 | Nano record-scope v3 |
| --- | ---: | ---: | ---: |
| First HTTP requests completed | 24/24 | 24/24 | 24/24 |
| Schema-valid responses | 24/24 | 24/24 | 24/24 |
| Exact-span integrity | 22/24 | 24/24 | 22/24 |
| Usable defect detections | 9/12 | 12/12 | 11/12 |
| Supported controls with valid spans | 2/12 | 9/12 | 8/12 |
| False unsupported alarms on controls | 10/12 | 3/12 | 3/12 |
| Both members of pair correct | 2/12 | 9/12 | 8/12 |
| Abstentions / transport failures | 0 / 0 | 0 / 0 | 0 / 0 |
| Offline utility gate | Fail | Fail | Fail |
| Whole-request median, seconds | 1.898 | 9.970 | 10.340 |
| Whole-request nearest-rank p95, seconds | 3.199 | 16.981 | 20.405 |

There were **72 actual first-attempt HTTP requests across three configurations**,
covering the same 24 development items. This is not a 72-patient sample, three
independent clinical cohorts, or 72 distinct test examples. Total request wall
time was 59.055, 265.868 and 277.915 seconds, respectively. Internal thinking and
JSON decode phases are not separate submitted HTTP requests.

V1's first request included an 8.986-second cold load; its remaining 23 requests
had a 1.875-second median and 2.831-second p95. The table includes every request
in each arm. Do not treat the first request in every arm as an equivalent cold
load: v2's first reported load was 0.117 seconds and v3's was 1.694 seconds.
Use whole-request wall time for the thinking arms; the native handler's final
token counters do not establish total reasoning-plus-answer throughput.

## What was verified

For all 72 development responses, the audit checked the frozen plan hash,
request hash, model digest, HTTP status, terminal completion, raw final JSON,
normalized result and exact claim/patient/source quotations. It independently
recomputed the binding counts from labels and outputs and compared them with
the final stored report. All matched.

Frozen source-file hashes were checked against these git objects:

| Arm | Code freeze | Plan SHA-256 |
| --- | --- | --- |
| v1 | `312d755` | `f4fb7cb23d14cb1b20ac78d36e844810961dfc35a5ea400cabdc3c76b905b450` |
| v2 | `74203a7` | `e861c03140181ea21f4179c2fafb0e0c70b23e44a818cea94675472e31274ef0` |
| final v3 | `9b8e6cb` | `151845ef082fc3d61200da065f9c524112fecaf8f89958572d32dab87e544758` |

Task inputs, order, labels and utility thresholds match across these arms.
The shared labels sidecar hash is
`e2fe1c31b452a0e07af5fb31ca57b64f29f7d701d9041afddb9c19ae0c64ca92`.
Each historical runner should be replayed from its matching code freeze;
changing an old source hash to match newer code would invalidate the experiment.

At this audit checkpoint, none of these three arms had a validation-selection
artifact or any validation/mining request, start, raw-response or result artifact.
Both `local-nano-offline-v3-2026-09-15` and
`local-nano-offline-v3-final-2026-09-15` are zero-call wording-review preflights.
Only `local-nano-record-scope-2026-09-15` contains the 24 executed v3 requests.

## Interpretation of the remaining errors

The three v2 control false alarms persist in v3: `binding-001`, `binding-017`
and `binding-029`. They concern an unreported symptom, absence of a supplied
measurement and an unestablished source prerequisite. Their explanations
confuse the absence of a report with a claim about an absent clinical finding
or demand a separate explicit statement documenting missing information.

V3 also loses exact source-quote integrity on the qualifier pair. The control
`binding-025` has the expected supported verdict but an invalid quotation.
The defect `binding-026` has **both** an incorrect supported verdict and an
invalid quotation: its explanation transfers the older age group's laterality
option to the younger age group. The v3 deterioration is therefore not solely
a quotation-format problem. A correct label with an invalid quoted witness is
not counted as a usable finding.

V1's medication control has a disclosed ambiguity: an empty named box does not
strictly exclude another supply. Retaining the frozen label is appropriate for
the historical score; removing that one control as a sensitivity analysis would
still leave nine clear false alarms among eleven other controls. It does not
explain the rejection. Do not rewrite the fixture after observing results.

## Methodological limits and decisions

- V2 changes thinking mode and output budget together. It cannot isolate their
  individual effects. The [runtime accounting correction](LOCAL_NANO_RUNTIME_ACCOUNTING_2026-09-15.md)
  correctly documents the originally mistaken total-output-budget assumption.
- V3 is an intentional **second development revision**, beyond the initial
  one-revision limit. This deviation is disclosed before v3 generation in the
  [v2 report](LOCAL_NANO_V2_DEVELOPMENT_REPORT_2026-09-15.md). It is adaptive
  development work, not a retrospectively preregistered confirmatory result.
- The three development configurations were compared on known authored items.
  Validation variants were also authored by agents familiar with the failure
  families. An eventual validation result would measure engineering transfer
  within those families, not physician-blind or population clinical accuracy.
- A later 8B comparison needs its own frozen identity and all first attempts.
  Preserve the existing prompt/packets/gate and describe the comparison as
  model-package behavior; each architecture's required chat renderer belongs
  to that package. Select before inspecting any validation outputs.
- Reviewed fixture leads and hard-negative proposals may still be useful even
  when automatic binding fails. That utility must be demonstrated by reviewing
  actual proposed artifacts, retaining false leads and distinguishing literal
  integrity from a valid semantic defect. It cannot be assumed from speed or
  defect recall alone.

No methodological or arithmetic error found here reverses the rejection.
Do not relax the thresholds, pool configurations, count unrun validation as
success, or convert local output into physician gold.

## Historical scorecards remain separate

The independent zero-model replay reproduced both historical scorecards
byte-for-byte:

- V25 Path B: **50/50 attempted, 27/50 complete, 21/49 delivered reference
  agreement**. The 21/27 conditional agreement is a different denominator.
  The older outer scorecard's 49-attempt stdout does not replace Path B's 50
  admitted diagnostic attempts.
- Application study: baseline **31/50 eligible, 24/49 agreement**; candidate
  **27/50 eligible, 22/49 agreement — NO PROMOTE**. These fixed-packet scores
  are not new live V25 measurements.
- C25 remains in completion and cost counts and outside agreement, because its
  reference route set is null. Gold joins occur only after generation.

The physician-reference SHA-256 remains
`19a37b5ab11f7ed4f266d0d4adb0bf8dd4ba977a6aed1af7c83e3b8bfc6c6598`;
the patient CSV SHA-256 remains
`d17771ed706c6866d2b13f2d7f5344824acf51aaf281b8af6368637586d71a15`.
The separate $95 mission remains $21.607845 conservatively accounted and
$73.392155 remaining, with zero unknown/outstanding holds. This local work
does not reset that ceiling. Zero paid calls is not a measured estimate of
money saved versus an identical paid-model experiment.

## Suggested final handoff structure

1. **Decision:** which local uses earned evidence, which were rejected, and
   whether the frozen router changed.
2. **Take-home fit:** existing message-to-disposition prototype, auditable
   evaluation, concise rationale/evidence, and unresolved clinical/latency
   limitations. Separate shipped software from new local experiments.
3. **Experiment table:** development configurations, any selected validation,
   failed first attempts, false alarms, quote integrity, wall time and memory.
4. **Reviewed artifacts:** useful/rejected mining findings and proposed
   hard-negative pairs; no automatic gold or corpus admission.
5. **Reproducibility:** frozen identities, one-command local replay/run recipe,
   current source/tests/build status and remote commit.
6. **Cost and next step:** actual paid calls, unchanged budget ledger, and the
   smallest evidence-based followup. No paid cohort merely to fill the window.

## Subsequent scorer review and test-scheduling note

Review of the JSON-order correction in commit `565369a` found no blocker.
`isDeepStrictEqual` appropriately ignores object-property order while retaining
strict value, type and array-order comparison. Historical source-commit
verification is available only through scoring; generation and selection still
require the current files to match the frozen study. Validation selection now
recomputes the development utility gate and refuses a failed configuration.

An independent focused-test attempt during the live 4096-token Cascade batch
used a name filter that unexpectedly included the mocked resume test. That test
stopped at `LOCAL_RUN_LOCKED` because the real serial runner held the global
lock; it made no inference request and did not remove the owner's lock. The four
pure tests passed. A subsequent explicit skip-pattern invocation, completed
before the instruction to stop further concurrent testing arrived, ran only
those four pure tests and passed. This is a disclosed test-scheduling failure,
not evidence that the scorer or live study failed. Full mocked runner testing
belongs after inference releases the lock.

One selection edge remains in the reviewed runner: a started attempt without a
result is represented as a recorded error, so the function can select after 23
passing responses while the last request is still in flight. A later result
could change the final gate. The active study avoids this by waiting for all 24
persisted development results before selecting. A future minimal guard should
require those terminal result artifacts before selection; this does not justify
editing frozen generation sources during execution.

## Completed Cascade comparison and five-arm development decision

The [machine-readable development audit](../outputs/local-offline-development-audit-2026-09-15.json)
extends verification to both completed Cascade 8B arms. It covers **120 actual
development HTTP requests across five configurations**, still the same 24
authored development items. All frozen source hashes, request/start/raw/result
bindings and reported counts verify. No validation-selection or validation
generation artifact exists in any of the five arms. Mining is a separate phase
and its ongoing outputs were not inspected for this audit.

| Development measure | Cascade 8B, 2048 shared cap | Cascade 8B, 4096 shared cap |
| --- | ---: | ---: |
| Completed first requests, including failures | 24/24 | 24/24 |
| Schema-valid / valid exact spans | 16/24 / 16/24 | 23/24 / 22/24 |
| Usable defect detections | 9/12 | 11/12 |
| Supported controls with valid spans | 7/12 | 8/12 |
| False alarms on controls | 0/12 | 3/12 |
| Complete pairs correct | 5/12 | 7/12 |
| Length failures | 8/24 | 1/24 |
| Whole-request median / p95, seconds | 36.594 / 46.935 | 39.670 / 72.579 |
| Total request wall time, seconds | 819.721 | 1005.747 |
| Offline utility threshold | Fail | Fail |

The 2048 arm's zero false alarms came with five incomplete controls; it is not
evidence that all twelve controls were cleared. All eight failed outputs ended
with `done_reason:length` and a reported 2048 generated tokens. This justified
the separate, prospectively frozen 4096-cap arm, rather than retrying only the
failed items. It harmonizes maximum decode allowance with Nano's two internal
phases; it does not equalize compute or isolate architecture from its renderer.

At 4096, `binding-045` still reaches the length limit. `binding-030` produces the
expected unsupported verdict but misspells the literal target quote, so it
cannot count as a usable detection. False alarms remain on record-absence
controls `binding-001` and `binding-017`. The third, `binding-009`, interprets
"during a resolved illness" as saying the illness was already resolved at the
time of fever, rather than a retrospective description of an illness that has
since resolved. This exposes a wording ambiguity/overreading worth disclosing;
retain its frozen label and result. Excluding that control would still leave
two other false alarms plus the length and quote failures, so the rejection
does not depend on that one interpretation.

The machine audit contains descriptive Wilson 95% intervals with fixed
12-slot denominators. For example, Nano v2's 12/12 usable detections give
75.8–100.0%, while its 9/12 supported controls give 46.8–91.1%; the 4096 Cascade
arm's corresponding intervals are 64.6–98.5% and 39.1–86.2%. These arithmetic
intervals illustrate the small denominators. Authored, adaptively reused items
are not a random clinical sample, so these are not population clinical
confidence intervals.

All five runs total **2428.306 seconds of request wall time**. Matching-model
Ollama samples report 24.522 GiB for Nano and 6.756 GiB for Cascade, not exact
process RSS or true peak memory. System swap was unchanged during Nano v1/v3
and Cascade 4096, rose by 645.81 reported M during Nano v2, and by 0.44 reported
M during Cascade 2048. The audit retains raw start/end sysctl readings; changes
are system-wide and cannot be attributed exclusively to the model. Do not
describe all five runs as showing zero swap growth.

**No tested configuration earned automatic binder-critic utility.** No further
development tuning or threshold relaxation follows from this audit. Reviewed
mining and hard-negative drafting may still establish a narrower useful role,
but their findings require separate inspection and must not be presented as a
validation pass or a replacement for physician scorecards.

## Final mining audit and resolved selection guard

After all local inference finished, the independent audit checked every row in
the [24-slot mining review](../outputs/local-mining-engineering-review-2026-09-15.json)
against its frozen plan, input, request, start, raw response and normalized
result. All file hashes, prompt-message hashes, model settings, final-output
values and literal-integrity results match. The source freezes match `776a8a0`
for Cascade 4096 and `561419f` for Nano mining. The two configurations received
identical input fields, prompt messages and output schemas. This audit did not
run inference, salvage failed reasoning, change review decisions or run tests.

The review accounting is consistent:

- Cascade: three of eight mining attempts produced final answers; two tasks
  produced a supported narrow issue, with one additional false alarm. Five
  mining attempts hit the output limit. Three of four returned negative pairs
  met the review's textual criteria.
- Nano: one of eight mining attempts produced a final answer; its proposed
  issue remained ambiguous, so no supported mining finding was counted. Seven
  mining attempts hit the output limit. Two of four returned negative pairs
  met the review's textual criteria.
- Five retained pair observations represent **four distinct pairs**, including
  one exact cross-model duplicate. Both insomnia pairs share a control/source
  family despite using different mutations. Counts do not imply independent
  clinical successes, human adjudication or admission to gold, tests or corpus.

Latency includes every planned request in the stated group, including length
failures. Median is the central value/average; p95 uses nearest rank.

| Whole-request timing | Cascade 8B | Nano |
| --- | ---: | ---: |
| All 12: total seconds | 922.909225458 | 347.903278749 |
| All 12: median seconds | 74.360543688 | 28.947330541 |
| All 12: p95 seconds | 98.261408708 | 34.587389667 |
| Eight mining requests: total seconds | 680.836535000 | 228.674885749 |
| Eight mining requests: median / p95 seconds | 96.627816334 / 98.261408708 | 28.947330541 / 29.973972291 |
| Four negative requests: total seconds | 242.072690458 | 119.228393000 |
| Four negative requests: median / p95 seconds | 58.250033562 / 71.509755875 | 29.318756000 / 34.587389667 |
| First mining request's reported load, seconds | 0.101194209 | 11.782248917 |
| Matching-model sampled memory, GiB | 6.756250 | 24.521982 |

Both mining phases began and ended with system swap used at **6639.56 M** as
reported by sysctl, with zero observed growth during either phase. Model memory
comes from matching-digest Ollama `/api/ps` samples, not process RSS or true
peak memory. Nano's shorter wall time accompanies more incomplete mining
generations and therefore cannot be read as equivalent-quality throughput.
Its 2048 limit applies per native internal phase; Cascade's 4096 limit is shared
across its generation. These remain comparisons of tested configurations.

Across development and mining, the work contains **144 submitted study HTTP
requests** and **3699.118040707 seconds** of summed whole-request wall time
(about 61.652 minutes). This excludes setup, metadata calls, telemetry, review
and earlier smoke work. It is not elapsed project duration or total internal
decode-phase count.

The terminal-result selection edge noted above was **resolved in `561419f`**.
Source inspection confirms that selection now requires every development
result artifact before evaluating the utility gate. The added regression
removes a result from a started attempt and checks that selection raises
`DEVELOPMENT_INCOMPLETE` without creating a selection artifact. This audit
verified the code and regression diff; final test execution is reported by the
main implementation task. No frozen inference artifact was changed to resolve
the guard.
