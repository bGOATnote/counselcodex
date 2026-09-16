# Review/repair sprint: measured changes and remaining gates

14 September 2026 · current candidate `evidence-graph/v20` · `/candidate`

## Outcome

Implemented field-local repair, a fresh whole-answer review after each repair,
reviewed-care preservation on failure, and recovery specifically for confirmed
reviewer output truncation. The real Mastra production artifact and its dependency
installation build successfully. Six actual v20 GUI submissions completed. Three
earlier v18/v19 failures are retained, not replaced with the later successes.

**This is not a presentation-ready clinical release.** Final answers in the v20
rehearsal still took 39–88 seconds. The two new emergency instructions took
8.542 and 9.098 seconds. Localized repair reduced editing time, but did not improve
whole-draft judge acceptance in the small fixed-packet comparison. Ordinary C30
self-care convergence remains unresolved; its airway stress variant is not a
substitute for the ordinary case.

The user-approved order was reliability/repair, fixed-packet calibration,
version-specific scoring, then a reconciled submission. These artifacts cover
each workstream while keeping the remaining release gates explicit.

## What changed

- **Bounded field-local edits:** exact base-draft and evidence hashes, named fields,
  atomic arrays, strict schema, no stale/duplicate/unauthorized/no-op edits. Routing
  edits require coupled patient message and reason; already-correct coupled prose
  need not be gratuitously rewritten. Unknown repair scope stops before dispatch.
- **Review binding:** a changed draft cannot inherit the previous judge's approval.
  The whole assembled draft gets fresh review plus application checks. Provider
  failures retain their actual failure code. No retry-until-accept behavior.
- **Care-only carry-forward:** when no earlier instruction exists, an independently
  reviewed emergency/in-person recommendation can survive a later repair or
  re-review failure. It is bound to patient, draft and judge hashes. Explanation
  and citations are not carried forward. Cancellation and a valid later adverse
  care review do not use this fallback. Already-issued instructions remain intact.
- **Truncation, not an arbitrary timeout:** one GUI failure was a reviewer response
  ending at exactly 2,400 output tokens with `finishReason=length`. v20 allows 6,144
  review output tokens, with one same-packet 9,216-token retry only after confirmed
  length truncation. The model time allowance remains 600 seconds; clinical
  disagreement, invalid judgment, authentication failure or slowness alone does
  not activate that recovery. These are engineering bounds, not care targets.
- **Prompt scope:** current clinician tasks and conditional future safety-net
  instructions are distinct. Self care must not silently acquire a mandatory
  clinician visit because an availability fallback was written without its trigger.

No original CSV label, historical result or physician review was edited. The
clinical route policy remains `disposition-clinical-policy/v2`. The optional
upgrade graph remains disabled/shadow-only. No new clinician queue was built.

## Fixed-packet comparison: use the corrected denominator

The network-enabled study made 28 calls: 12 targeted calibration packets and four
repair packets × two arms × repair plus fresh review. The exact historical
prompts and packets are frozen in its [manifest and raw outputs](../outputs/review-repair-sprint-network-2026-09-14/).
This is an exploratory v18-era experiment, not a v20 full-workflow benchmark.

Calibration matched the authored target in **11/12** packets: 6/6 defect packets
and 5/6 controls. The unmatched control also contained a separate potentially
problematic safety-net construction. It is **confounded**, not an established
judge false positive. Its historical label is retained; a corrected future
control should isolate one variable.

One repair packet (`013f59c4-681c-49ee-9288-0fbdc13e83ce`) selected the first
draft while its intended defect was in the later draft. Exclude that pair from
comparative claims. The manifest's phrase "complete feedback" was also too strong:
the supplied feedback was targeted and did not cover all remaining findings.
This report is the correction; immutable manifests and summaries are unchanged.
The retained v1 runner now refuses another paid run unless the caller explicitly
acknowledges the known confounds; a new confirmatory study requires corrected,
newly versioned fixtures and a fresh allocation. No further paid run was made.

| Usable packet | Full repair | Field patch | Full repair + review | Patch + review | Fresh judge verdict, both arms |
|---|---:|---:|---:|---:|---|
| C30 `c6225e23…` | 18.233 s | 18.126 s | 47.197 s | 45.775 s | Revise |
| C50 `d761d5ff…` | 20.589 s | 8.559 s | 52.928 s | 43.622 s | Revise |
| C30 airway `f4f9a7a9…` | 13.993 s | 4.370 s | 39.929 s | 32.603 s | Accept |
| **Median** | **18.233 s** | **8.559 s** | **47.197 s** | **43.622 s** | **1/3 accepted per arm** |

Editing time fell 53.1%; repair-plus-review time fell only 7.6%. There was **no
acceptance lift**. The experiment checked source identity and independent judge
validity, not every GUI release gate. One sample per arm, authored feedback and
three usable pairs do not establish superiority, confidence intervals, or
clinical accuracy. The remaining C30/C50 access/safety-net omissions in those
usable pairs were already present, not necessarily introduced by repair. The
excluded wrong-draft pair retained a preexisting unsupported mandatory clinician
task and added an unconditional clinic/urgent-care access fallback in both arms;
it remains useful failure evidence but not a valid comparison.

The first sandboxed attempt could not resolve provider hosts. Its 20 dispatch
attempts produced no valid outputs; eight conditional post-repair reviews were
not executed. [Those failures remain available](../outputs/review-repair-sprint-2026-09-14/).

## Actual GUI rehearsal: every attempt

The [final capture](../outputs/review-repair-gui-2026-09-14/capture-final/summary.json)
contains all ten starts in the declared rehearsal window, byte-identical run/event
copies and their hashes. Intermediate captures remain, including an unfinished
snapshot. Selection uses local filesystem birth time; this is not portable event
ordering and is declared in the artifact. Times below are server measurements,
not browser paint times. No run was retried until it passed.

| Version | Input | Result | Early action | Finished | Run ID |
|---|---|---|---:|---:|---|
| v18 | Original C30 | Review required | — | 86.961 s | `f495ac56-1cde-4807-b347-c9a6b3c27e85` |
| v19 | Original C30 | Review required | — | 92.766 s | `99a709a7-0c03-4c19-bb3c-7dd231ca5155` |
| v19 | Original C50 | Priority async | — | 88.994 s | `1de0bac4-a00d-4d20-bc75-a2b4ba5fe80a` |
| v19 | C50 unchanged-symptoms update | Review truncated; unavailable | — | 72.538 s | `b071f2f1-e246-4163-8fa1-2304426876db` |
| v20 | Original C50 | Priority async | — | 87.716 s | `6f43d180-44c1-4d15-a984-c51a7ed4e724` |
| v20 | C50 unchanged-symptoms update | Priority async | — | 75.856 s | `5fa95a09-028d-4b58-ab14-42e5378318e8` |
| v20 | Original C02 | Emergency now | 8.542 s | 46.432 s | `b4a774f3-0797-4ff7-837b-213436d51ead` |
| v20 | C02 active-EMS update | Emergency, retain active EMS | — | 43.661 s | `9769a731-3a6e-4635-b864-1a20241d92d8` |
| v20 | Original C04 | In-person today | — | 79.021 s | `5e0e68ba-c89b-48e5-8ced-5f8c0fab74f2` |
| v20 | C30 new lip/tongue swelling + dyspnea | Emergency now | 9.098 s | 39.254 s | `ef11d19b-be23-427a-8a8e-1ea67731e931` |

`—` means no new early action was emitted, not zero latency. On the active-EMS
follow-up, the earlier care instruction remained visible as a previous instruction.
These are ten engineering submissions across three versions, **not** ten independent
clinical test cases or a pooled accuracy result.

The v18 C30 repair introduced an unconditional clinician/urgent-care requirement
despite self care. The second judge caught it. v19 corrected that burden but the
second judge newly objected to wording that described fever/breathing denials as
symptom reports. That objection may be overstrict; it has not been physician
adjudicated. The ordinary C30 case was not re-run on v20 in this bounded plan.

In the six v20 runs, three first drafts passed without repair and three released
after field-local repair plus fresh review. This is a process observation, not a
causal repair-benefit estimate. The migraine follow-up that previously truncated
completed after the capacity change, but this was not a fixed-packet experiment
isolating that change. No v20 run needed the new truncation retry.

## Current 50-case scorecard

[Version-bound scorecard](../outputs/physician-cohort-v20-2026-09-14/scorecard.json)
and [manifest](../outputs/physician-cohort-v20-2026-09-14/manifest.json):

- 50 planned development cases; C25 remains explicitly qualified rather than an
  unambiguous exact-agreement target. The exact-agreement denominator is 49.
- Three original, exact-input v20 cases attempted (C02, C04, C50); all completed
  and matched the frozen reference. That is **3/49 covered exact-agreement targets**,
  not 100% accuracy on the 50 cases.
- 47 of the 50 planned cases remain unattempted for this version, including the
  qualified C25. Three modified/follow-up inputs are retained off-cohort.
- Stored model support is reported separately from physician reference agreement.
  No new physician or claim-level approval is inferred.

The physician's all-50 review remains valuable: it is an attributable development
reference shaped by a week of iteration. The candidate cannot inherit the
incumbent's approval or a held-out performance claim. Neither the original CSV
labels nor the physician reference enters inference.

## Budget accounting

User authorization: up to **$40 new provider spend**. No extra provider-model
comparison was run. The initial $20 study and $20 GUI allocations were preserved;
the GUI plan was prospectively amended from eight to ten starts after the first
four actual costs were known. Both plans remain in the artifact directory.

| Item | USD |
|---|---:|
| Completed network fixed-packet study, token estimate | 4.310385 |
| Ten GUI submissions, token estimate | 4.379253 |
| **Known token-cost estimate** | **8.689638** |
| Conservatively retained reservation for sandbox DNS failures | 11.340570 |
| Embedding reserve | 0.100000 |
| **Conservative accounted total** | **20.130208** |

The DNS reservation is **not confirmed provider spend**; it is retained rather
than assumed refunded. Token estimates are not invoices and do not itemize cache
billing. Embeddings are not included in model-token accounting. The reserved
total remains below $40; no unknown-cost GUI attempt remains in the final capture.

## Verification and remaining release gates

Passed: lint, TypeScript checks, core tests, all 154 review-app tests, Next
production build, and the real Mastra production build with generated dependency
installation. Focused graph/RAG tests cover patch scope and identity, stale judge
binding, failed repair, care preservation, coupled unchanged prose, provider
failure propagation and the truncation-retry predicate. The latter is a predicate
test, not a complete mocked provider-stream retry integration test.

Independent read-only audits corrected two overstatements: the wrong-draft study
pair and a stronger-than-implemented care-preservation claim. Current limitations:

1. **Convergence and judge calibration:** C30 remains unresolved. Distinguish
   clinically meaningful omissions from excessive wording objections. First review
   must identify actionable defects without a new unrelated failure each pass.
2. **Latency:** reviewer/re-review dominates; early model instructions around nine
   seconds are still too slow for the intended experience. More output capacity
   prevents one failure mode, not the latency problem.
3. **Missed practical contradiction:** the accepted C02 reply tells the patient
   to tell the dispatcher if they collapse. That instruction needs bystander-aware
   wording. It is a newly observed judge miss, not a clinician-adjudicated failure
   label and not fixed by increasing tokens.
4. **Care fallback precedence:** when an early instruction exists, repair-failure
   fallback retains it rather than promoting a stronger independently reviewed but
   not-yet-issued recommendation. No issued instruction is downgraded, but that
   stronger carry-forward case needs a precedence-aware regression test and fix.
5. **Evidence strength:** C04 retrieved consumer summaries/general risk, not the
   specialist diabetic-foot guideline support wanted for this claim. Quote identity,
   reachability, clinical applicability and semantic support remain distinct.
6. **Generalization:** expand only after calibrating these failures. Use independently
   adjudicated unseen cases, accept defensible route alternatives, retain every
   failure and separately reconstruct Counsel's filtered emergency method and a
   stress set of excluded contexts. Do not claim their unpublished exact 103 IDs.

## One current submission

- [README](../README.md), [current workflow](CURRENT_PIPELINE.md),
  [runbook](DEMO_RUNBOOK.md), and [assignment accounting](CURRENT_TAKE_HOME_ACCOUNTING.md).
- [Editable current deck](../output/presentation/counsel-disposition-current-2026-09-14-r3.pptx).
- [Candidate GUI](http://localhost:4120/candidate); incumbent remains at `/`.

Prior decks and pre-sprint documents remain historical. This expanded user-directed
project exceeds the original assignment timebox; the presentation says so. The
system recommends a route; clinician delivery, availability and follow-up remain
integration stubs. Public [Counsel/Mastra architecture](https://mastra.ai/customers/counsel-health),
[Counsel judge work](https://www.counselhealth.com/blog/scaling-clinical-quality-assurance-with-ai-judges)
and [emergency evaluation method](https://www.counselhealth.com/blog/how-counsel-leveraged-healthbench-to-assess-emergency-escalation)
inform the design, not claims about their private system or our clinical equivalence.
