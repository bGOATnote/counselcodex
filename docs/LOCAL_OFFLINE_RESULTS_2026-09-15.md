# Local NVIDIA evaluation — 2026-09-15

**Use deterministic code for gold scoring and keep local models optional for
reviewed hard-negative drafting. Neither tested model qualified as a binding
critic or dependable open-ended miner. V25 remains frozen; NO PROMOTE.**

Completed 144 planned local generation requests, plus one incidental arithmetic
smoke, with **zero paid experiment-provider calls**. The useful output is an
auditable local runner, retained failures, four distinct textual pair candidates,
and a measured decision about where local inference does and does not help.

## Project and take-home scope

CounselCodex is an independent synthetic prototype: one patient message enters
an asynchronous workflow and yields a care setting, queue priority, patient
reply, rationale and source-linked evidence. The original assignment's three
destinations are represented by five operational routes: self care, priority
or standard async, in-person today, and emergency now. Queue availability,
acceptance and follow-up remain integration stubs. This work does not claim
autonomous prescribing, physician approval or presentation readiness.

The earlier task ended after a failed source-application experiment. Exact
quotations and source identifiers did not establish patient eligibility or
clinical meaning. Its candidate was not promoted. The current work tests
whether a **single M4 Max 48 GB Mac** can reduce paid development calls while
preserving that honest assessment. Attached assignment, job and judge documents
are context; they do not authorize submission, contact or new spending.

### Historical scores, reproduced with no model

| Separate workflow | Complete / eligible | Delivered reference agreement |
| --- | ---: | ---: |
| Frozen live V25 gates-release | 27/50 | 21/49 |
| Historical hybrid V22 | 39/50 | 32/49 |
| Fixed-packet application baseline | 31/50 | 24/49 |
| Fixed-packet application candidate | 27/50 | 22/49 — no promotion |

The V25 and application-study scorecards reproduced byte-for-byte with Node
code. V22 is a historical comparison, not a new replay in this task. V25's
conditional 21/27 agreement is a different denominator from 21/49 delivered
coverage. C25 remains in completion/cost counts and outside agreement because
its accepted route set is null. These 50 development cases are not a blinded
clinical holdout. The candidate does not inherit the incumbent's physician review.

## What was implemented

- An isolated loopback-only Ollama runner with schema validation, literal
  quote checks, immutable first-attempt artifacts, source/request/model hashes,
  serial execution, a fixed deadline and no retries or cloud fallback.
- Forty-eight authored binding fixtures: 12 development control/defect pairs
  and 12 different scenario pairs in the same families for authored validation.
  Only the claim changes within each pair. Family transfer is not a clinical
  holdout. One empty-box control has a disclosed supply ambiguity; its frozen
  label and denominator remain unchanged.
- Eight archived excerpt-mining tasks and four hard-negative drafting tasks,
  with 17 pinned raw source files. Inputs retain patient text and complete
  selected claims, qualifiers and source passages.
- An explicit input projection: patient, claim or draft, and source text only.
  Physician gold, expected labels, case IDs, family/variant and provenance
  sidecars never enter the model request. Gold is joined only by the scorer.
- A tested JSON-reader correction: object key order does not change a JSON
  value. Actual value/type/array changes still fail raw-result verification.

Source: [runner](../scripts/local-offline-study.ts),
[contracts and scoring](../src/evaluation/local-offline.ts),
[binding corpus](../src/evaluation/local-binding-fixtures.ts),
[mining inputs](../src/evaluation/local-mining-tasks.ts).

## Binding development results

All rows below use the same 24 authored development items; they are repeated
measurements, not independent patient cohorts. Missing, incomplete, invalid-quote
and abstaining outputs do not count as correct. The unchanged utility gate
requires at least 10/12 usable defects, 10/12 supported controls, at most one
false alarm, and at least 23/24 valid schemas and exact-span outputs.

| Configuration | Schema / spans | Usable defects | Supported controls | False alarms | Complete pairs | Gate |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Nano Q5, non-thinking, 768 | 24/24; 22/24 | 9/12 | 2/12 | 10/12 | 2/12 | Fail |
| Nano Q5, thinking, 2048 per phase | 24/24; 24/24 | 12/12 | 9/12 | 3/12 | 9/12 | Fail |
| Nano Q5, record-scope prompt | 24/24; 22/24 | 11/12 | 8/12 | 3/12 | 8/12 | Fail |
| Cascade 8B Q5, 2048 shared | 16/24; 16/24 | 9/12 | 7/12 | 0/12* | 5/12 | Fail |
| Cascade 8B Q5, 4096 shared | 23/24; 22/24 | 11/12 | 8/12 | 3/12 | 7/12 | Fail |

*Five controls and three defects in the Cascade 2048 arm exhausted the output
cap. Zero false alarms among seven assessed controls is not perfect specificity
on the fixed 12-control denominator. The 16 completed labels were correct,
which justified the separately frozen budget correction, not a success claim.

Nano's recurrent false alarms confuse a missing report with an absent clinical
finding, or demand an explicit statement that missing information is missing.
The record-scope revision also introduced quotation and source-qualifier errors.
Structured output success alone would have hidden these failures.

The larger Cascade cap rescued seven previously incomplete responses, but the
new answers revealed three false alarms. These include missing-record facts
and an over-literal temporal reading of an illness described retrospectively
as resolved. One request still exhausted 4096 tokens and another changed the
quoted target claim. No configuration passed the original utility gate, so
**no validation generation or selection occurred**. Binding development is closed.
The 120 development requests cover five configurations of the same 24 items.

### Protocol and runtime limitations

Thinking mode and output budget changed together in Nano v2. The record-scope
revision exceeded the initial one-revision limit and was disclosed before
generation. Two earlier v3 wording preflights made zero calls. The optional
8B comparison and later shared-budget amendment are also disclosed development
decisions. None used validation outputs to choose a prompt or setting.

Ollama 0.32.1 gives Nano's renderer separate reasoning and final JSON caps;
Cascade's native GGUF path shares one cap. Identical API settings were therefore
not equal decoding allowances. Cascade 4096 harmonizes maximum allowance with
Nano's two 2048 caps, not actual compute. Nano's final token counters do not
cover both phases; use whole-request wall time. Cascade's embedded ChatML
template was verified against NVIDIA's pinned tokenizer. No generic template,
new download or second computer was needed.

An attempted non-generating 8B template probe used the wrong debug field and
generated one arithmetic smoke answer. It is disclosed separately from study
counts. No dataset label entered that request. Runtime observations include
Ollama-reported model memory and sampled system swap; they are not peak RSS or
controlled whole-machine memory measurements.

### Measured development cost and resource use

| Configuration | Median / p95 request seconds | First reported load seconds |
| --- | ---: | ---: |
| Nano non-thinking | 1.90 / 3.20 | 8.99 |
| Nano native thinking | 9.97 / 16.98 | 0.12 |
| Nano record-scope revision | 10.34 / 20.40 | 1.69 |
| Cascade 2048 shared | 36.59 / 46.94 | 0.10 |
| Cascade 4096 shared | 39.67 / 72.58 | 0.91 |

All 24 requests per arm are included, including failures. P95 uses nearest rank.
The first Nano v1 call included a cold load; the original Cascade run was warm
after its incidental smoke. These are actual package-level timings on this
machine, not equal-compute throughput comparisons or deployment latency promises.
Total development request wall time was 2428.31 seconds across 120 requests.

Ollama reported 24.522 GiB for Nano and 6.756 GiB for Cascade at context 8192.
System swap used grew by 645.81 M during Nano v2 and 0.44 M during Cascade 2048;
the other development arms showed no before/after growth. Swap was already in
use and is system-wide, so these observations do not isolate inference's memory
effect. Both models loaded on this Mac; no memory failure was observed. Keep one
model and one worker, and inspect sustained pressure before increasing context.

The [independent machine-readable audit](../outputs/local-offline-development-audit-2026-09-15.json)
includes frozen identities, failures, timings, memory samples and descriptive
Wilson intervals. For scale, 12/12 has a roughly 76–100% interval under a simple
independent-binomial assumption. This authored, paired corpus is not a random
clinical population sample; those intervals do not confer clinical accuracy or
prove one model statistically superior. Raw controls, defects and pairs remain
the primary results.

## Reviewed mining and hard negatives

Each model received the same eight archived excerpts and four negative seeds,
with identical prompt messages. Cascade used 4096 shared output tokens; Nano
used 2048 per phase. All 24 submitted requests remain in the denominator.

| Outcome | Nano Q5 | Cascade 8B Q5 |
| --- | ---: | ---: |
| Mining completed final answers | 1/8 | 3/8 |
| Mining length failures | 7/8 | 5/8 |
| Mining tasks with a text-supported finding | **0/8** | **2/8** |
| Negative completed final answers | 4/4 | 4/4 |
| Negative pairs passing literal checks | 3/4 | 4/4 |
| Returned pairs meeting textual review criteria | **2/4** | **3/4** |

Cascade found a two-day versus five-day duration error and an unstated bilateral
finding. It also alleged an unsupported rash prerequisite. Nano's completed
critique raised an unresolved claim about expected EMS care. Both missed an
instruction asking the patient to notify a dispatcher after losing consciousness
or stopping breathing. Valid anchors did not make these critiques reliable.

The retained pairs cover pain polarity, deletion of a required source condition,
and two different insomnia-source mutations. Five retained observations are
**four distinct pairs across three seed tasks**: the pain pair is duplicated
across models. A potentially useful 30-to-15-minute edit was rejected as a full
pair because its compound control contained unverified medical assertions.
No failed reasoning was salvaged or returned pair repaired for credit.

The [complete review](LOCAL_MINING_REVIEW_2026-09-15.md) and
[machine-readable decisions](../outputs/local-mining-engineering-review-2026-09-15.json)
record every failure, false alarm, ambiguity and rejection. This was an
engineering-agent review using supplied text, with prior familiarity with the
excerpts. It was not blinded, human adjudication or physician approval. Retained
pairs remain proposals in that artifact; none entered gold, the source corpus,
regression tests or the live router. Textual fidelity does not certify the
underlying medical source or routing decision.

| Mining/drafting request timing, including failures | Nano Q5 | Cascade 8B Q5 |
| --- | ---: | ---: |
| All 12: median / p95 seconds | 28.95 / 34.59 | 74.36 / 98.26 |
| Eight mining tasks: median / p95 seconds | 28.95 / 29.97 | 96.63 / 98.26 |
| Four negative tasks: median / p95 seconds | 29.32 / 34.59 | 58.25 / 71.51 |
| All 12: total request seconds | 347.90 | 922.91 |

Nano's first mining request included 11.78 seconds of reported loading; Cascade
was warm (0.10 seconds). Nano's shorter time accompanies more incomplete mining
answers, so it does not establish equivalent-quality throughput. Both phases
showed no before/after system swap growth. Across all 144 planned study requests,
summed whole-request time was **3699.12 seconds (61.65 minutes)**, excluding
setup, telemetry, review and the incidental smoke.

## Practical decision for this Mac

Keep **Nano Q5 as the optional default for small, reversible drafting tasks**
when turnaround matters. It already loads and has the tested one-prompt helper.
This is an operational preference, not a quality win: Cascade yielded more useful
outputs in the small mining sample and used much less model memory, but took
longer. Use the existing 8B package only when that memory/yield tradeoff matters;
do not create a two-model review chain. Neither model earns automatic admission
or release authority from these results.

| Work | Concrete executor and acceptance |
| --- | --- |
| Batch gold scorecards | Existing Node scorers over saved outputs; no LLM, gold joined after generation |
| Routine fixture changes | Explicit claim edits and deterministic identity/pair checks; review each new control and defect |
| Optional hard-negative drafting | One local model, one claim/passage, serial requests; preserve full controls, exact spans and rejected attempts; review semantics before admission |
| Open-ended fixture mining | Inspect archived failures directly; tested local batches do not justify unattended mining |
| Binder critic | No local release integration; all five configurations failed the fixed development gate |
| Promotion-gated 50 | Preserve the actual configured paid providers, frozen same-input comparison and release checks; reconcile the ledger before dispatch |

**Local Nano is NOT a drop-in `/candidate` Opus replacement.** Current paid roles
are Haiku 4.5 context/safety, Opus 5 producer and Astra historical judge. V25 does
not invoke judge/repair. Fable is not configured; the continuation prompt now
states that explicitly. No live import, model override, source replacement or
new supervisor was added. Physician alignment remains unresolved.

The optional future download is **Nemotron-Cascade-2-30B-A3B Q4_K_M**. NVIDIA's
[model card](https://huggingface.co/nvidia/Nemotron-Cascade-2-30B-A3B) reports gains
on several general benchmarks, and [Ollama lists a 24 GB Q4 package](https://ollama.com/library/nemotron-cascade-2/tags).
It is a plausible fit at bounded context on this 48 GB Mac, not a measured
CounselCodex upgrade. No download is justified solely by this small experiment;
defer the approximately 31 GiB Omni alternatives and unavailable GPU systems.

## Cost, verification and reproduction

There were 120 binding and 24 mining/drafting HTTP generation requests, plus
one disclosed local arithmetic probe. The earlier import/disposition smoke
belongs to the preceding setup task. Nano may perform two internal decoding
phases per request; these are not additional submitted cases. Paid experiment
calls: **0**. No paid cost counterfactual was measured, so there is no dollar
savings or clinical-equivalence claim. The prior $95 mission remains separately
reconciled at $21.607845 exposure and $73.392155 remaining at its freeze; this
work did not renew that budget. Both local models were unloaded after evaluation.

Required checks passed: lint, typecheck, full `npm test`, all 12 focused local
tests, and both candidate/Mastra builds and artifact verification. The default
unit suite also passed after adding discovery of the local tests (164 passed,
21 existing skips). The full suite retained its existing opt-in skips. The
initial Mastra dependency installation failed with sandbox DNS `ENOTFOUND`;
the network-enabled Mastra retry and combined artifact verification passed.
No GUI interaction was tested in this continuation, and no GUI readiness claim
follows from these checks. Package files, physician data, clinical source/runtime
paths and prior experiment files were preserved.

[Verification manifest and saved command logs](../outputs/local-offline-verification-2026-09-15/verification.json)
record exit statuses, test counts, the initial build failure and successful
recovery, source/data hashes, 144 request/raw/result triples and zero validation
attempts. The preservation checks compare this continuation against `dac1f48`.

Historical code identities must remain available for reproducibility:

| Arm | Generation source freeze | Matching scoring checkpoint |
| --- | --- | --- |
| Nano non-thinking | `312d755` | `79bceae` |
| Nano native thinking | `74203a7` | `882e454` |
| Nano record-scope | `9b8e6cb` | `d3eb07c` |
| Cascade 2048 | `4d227ee` | `565369a`, read-only source commit `4d227ee` |
| Cascade 4096, including mining | `776a8a0` | `fa4d412` |
| Nano mining | `561419f` | `561419f` or this final documentation/test checkpoint |

Use the matching model/version/options contract when replaying an older arm.
The read-only source-commit option verifies a frozen source revision; it does
not bypass model/version checks or authorize generation with changed code.
The corrected 8B reader compares JSON values without treating key order as a
different response. Its old raw files remain unchanged.

To rescore the completed Nano mining record with **zero model calls**:

```bash
cd /path/to/counselcodex
node --experimental-strip-types scripts/local-offline-study.ts score \
  outputs/local-nano-mining-2026-09-15 561419f
```

This appends a new report; unattempted binding rows in that mining-only plan
remain unattempted. Do not invoke `run` merely to fill those rows. See the
[single-machine workflow and import/smoke command](LOCAL_NEMOTRON_WORKFLOW_2026-09-15.md)
and [revised Grok continuation prompt](GROK_LOCAL_CONTINUATION_PROMPT_2026-09-15.md).

## Audit trail

- [Original evaluation plan](LOCAL_OFFLINE_EVALUATION_PLAN_2026-09-15.md)
- [Independent Nano audit](LOCAL_NANO_INDEPENDENT_AUDIT_2026-09-15.md)
- [Corpus and template audit](LOCAL_BINDING_FIXTURE_AUDIT_2026-09-15.md)
- [Cascade 2048 report and scorer correction](LOCAL_CASCADE8B_DEVELOPMENT_REPORT_2026-09-15.md)
- [Runtime budget correction](LOCAL_MODEL_PACKAGE_BUDGET_CORRECTION_2026-09-15.md)
- [Cascade 4096 amendment](LOCAL_CASCADE8B_4096_PLAN_2026-09-15.md)
- [Bounded mining comparison](LOCAL_MINING_COMPARISON_PLAN_2026-09-15.md)
