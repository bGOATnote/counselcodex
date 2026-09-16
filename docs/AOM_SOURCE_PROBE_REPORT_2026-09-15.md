# AOM source application — completed, no demonstrated routing lift

Replacing one compiled AOM Recognition passage with CDC's complete diagnosis and
management summary did not change the route. All six raw drafts chose Self care,
against the physician's Standard async reference. Better provenance did **not**
establish correct patient application. Neither arm is promoted; V25 is unchanged.

## Fixed comparison

Three alternating pairs on selected development case C32, not six independent
patients. Both arms use brief-v2, Opus 5 adaptive/low, 2,400 output tokens, one step,
no retries and the same patient/context. One of nine source slots changes; the
other eight passages and quote IDs remain identical. No gold, prior route, judge,
repair, embeddings, live retrieval, or patient publication enters the experiment.

- Freeze commit: `0eca5b9`.
- Plan: `outputs/aom-source-probe-2026-09-15/plan.json`.
- Fingerprint: `370d9dcb4aedbd98838a44eecfd764e657bf56cb4cf41572133f8a7005fda41b`.
- Report and replay are byte-identical, SHA-256
  `b01a06981eb571b33235e36f5dfe8dfef32655b0ef5f205df6ae3b4d557c10f5`.

The original passage already contained diagnostic prerequisites. This was a
source-content/application test, not retrieval-recall repair. Provenance, content
and packet length changed together; their individual effects are not isolated.

## Results, including failure

| Measure | Original compiled Recognition | CDC diagnosis and management |
| --- | ---: | ---: |
| Provider completes | 3/3 | 3/3 |
| Eligible unpublished proposals | 2/3 | 3/3 |
| Agreement among eligible proposals | 0/2 | 0/3 |
| Agreement coverage, fixed repetition denominator | 0/3 | 0/3 |
| Median provider latency | 13.243 s | 13.790 s |
| Maximum provider latency | 13.850 s | 13.876 s |
| Input tokens per call | 17,544 | 17,256 |

Median paired latency change: +0.547 seconds. Three pairs do not establish a
latency distribution or clinical accuracy. These are producer durations, not
whole-system time to care or GUI timings.

| Slot | Raw route | Structural result | Provider seconds |
| --- | --- | --- | ---: |
| 1-original | Self care | Invalid empty third citation; retained failure | 13.850 |
| 1-CDC | Self care | Eligible | 13.553 |
| 2-CDC | Self care | Eligible | 13.790 |
| 2-original | Self care | Eligible | 13.243 |
| 3-original | Self care | Eligible | 12.934 |
| 3-CDC | Self care | Eligible | 13.876 |

All five eligible proposals are below the frozen reference's acuity; this is
reference disagreement, not adjudicated harm. The failed original slot is not
included in conditional agreement. No early actions were generated, and transport
is null throughout. No full-response gate score is assigned to these briefs.

## What the evidence actually changed

The isolated source retains CDC's complete Diagnosis and Management cells in one
chunk, including effusion/otoscopy prerequisites, conditional observation, and
antibiotic-selection qualifiers. The raw response, canonical URL, date and hash,
plus the separately captured reuse policy, are retained. It is a CDC clinical
summary, **not the original AAP guideline**. Reachability and exact text are not
clinical applicability or currency certification.
[CDC clinical summary](https://www.cdc.gov/antibiotic-use/hcp/clinical-care/pediatric-outpatient.html),
[reuse policy](https://www.cdc.gov/other/agencymaterials.html).

All three CDC drafts select the observation sentence and acknowledge that AOM is
unconfirmed. None selects the diagnostic-prerequisite quotation. Each broadens
the claim to mild ear symptoms, although symptom intensity was not reported.
An uncertainty disclaimer does not establish that this patient satisfies a
condition-specific observation recommendation.

Specific engineering-review observations, not fabricated clinical grades:

- Fourteen of fifteen raw citation references resolve exactly. The remaining
  reference is a blank third citation in 1-original, correctly rejected rather
  than silently removed.
- Five of six reasons call the child well or well-appearing. Breakfast and school
  attendance support those activities, not an observed examination.
- 2-original adds spontaneous resolution to a quotation containing only mild
  duration/fever criteria. That selected quotation does not support the whole claim.
- 2-CDC and 3-CDC bundle otitis externa and foreign body into one claim but quote
  only one differential row, different rows in the two attempts.
- 1-CDC accurately says no temperature measurement was **reported**. Do not
  mislabel this as asserting that no measurement occurred.

Self care is not categorically indefensible for an initial earache: NHS guidance
allows symptom care with review for persistence or concerning features. That does
not establish Counsel's service scope or change the physician reference.
[NHS earache guidance](https://www.nhs.uk/symptoms/earache/).

`claim_support`, `unsupported_claims`, `unsafe_advice` and `clinical_correctness`
remain `not_assessed`. The specific read findings above are not a calibrated
whole-answer assessment. This study demonstrates a provenance improvement and
a null routing result, not a proven clinical lift.

## Ledger and verification

| Accounting view | USD |
| --- | ---: |
| Prior cumulative exposure | 83.533736 |
| Six-slot worst-case reservation before calling | 3.436680 |
| Actual base usage estimate, this phase | 0.632250 |
| Conservative accounted exposure, this phase | 1.154250 |
| Cumulative under the SAME $90 ceiling | 84.687986 |
| Remaining | 5.312014 |

Base and conservative estimates are alternate views, not additive charges. All
usage is known; no missing usage was set to zero. Reservations, phase claim,
packet/file identities, raw results and evaluated rows replay exactly. Started
slots were never retried. The scorer rejects a missing or altered phase claim,
including its fingerprint, output directory and allocation.

Thirty-eight combined focused tests, lint and typecheck passed before freezing.
The full configured root test command also passed during source implementation.
No live GUI or clinical release was changed or verified in this phase.

```sh
node --experimental-strip-types scripts/aom-source-probe.ts score outputs/aom-source-probe-2026-09-15 report-NEW.json
node --experimental-strip-types --test tests/aom-source-probe.test.ts src/evidence/rag/cdc-aom-candidate.test.ts
```

Use a new output filename. Preserve the failed slot and all raw drafts.
Do not pool these selected source probes into the V25 release scorecard.
