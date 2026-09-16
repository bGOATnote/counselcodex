# Clinical quality engineering review · 8 September 2026

## Decision

The next useful extension is an evidence-linked, retrospective quality-audit
workflow—not a larger committee of patient-facing agents. It is implemented
as a separate research candidate, leaving the failed, frozen disposition
baseline and its results intact. A judge finding is a review hypothesis, not
proof of harm, a physician reference label, or permission to intervene.

The highest-priority unresolved clinical issue remains the emergency
supervisor's external generalization failure: 1 true positive and 28 false
negatives among 29 emergencies in our derived HealthBench cohort. The new
quality workflow does **not** repair that supervisor, and is not on its critical
path. It can help evaluate future care decisions once its own judges have been
validated for the proposed use.

**Later on 8 September:** credentials became available and a two-provider
integration pilot executed. Its [separate report](PROVIDER_PILOT_2026-09-08.md)
retains all nine attempts, including five abstentions, and provides offline
replay. Account access is now verified; clinical accuracy and lift remain
unmeasured. The GUI and original demo below remain scripted.

## Rereading the assignment and role

The supplied take-home asks for a lightweight disposition V0, defensible
labels, execution and evaluation, and a presentation/live demonstration. It
allows the candidate to design the buckets. Its text describes 20 messages;
the delivered CSV contains 50. It suggests 6–8 hours and values clinical,
product, and engineering judgment over sophistication. This extended project
goes beyond that scope at the candidate's request. The required V0 remains
the front door; the quality-audit extension is optional material, not a new
prerequisite for completing the take-home.

The supplied physician-AI-scientist role emphasizes finding clinical gaps,
shipping scoped improvements, owning safety/clinical agents, creating the
evaluation framework, and measuring component improvement against physician
judgment. A repository can demonstrate the engineering and experimental
method. It cannot establish licensure, prior production experience, or
independent physician agreement by assertion.

For the one-clinician assignment, the candidate should personally review and
defend the development cases. No fictional second or third clinician is
required. Future evaluation at scale needs *sampled* expert assessment;
reviewing 25 million cases manually is neither the plan nor the relevant
acceptance criterion. API availability and adjudication do not prevent
contract tests, failure injection, harness validation, data audits or building
the measurement instrument.

## What the primary sources actually support

These public sources inform the engineering design. They do not establish
Counsel's internal acceptance criteria or imply company review of this prototype.

| Source, reviewed 8 September 2026 | Applicable lesson | Decision here |
|---|---|---|
| [Counsel/Mastra case study](https://mastra.ai/customers/counsel-health) | Counsel describes history-taking alongside parallel supervisors, retrieval, a physician workspace and a private Kubernetes deployment. The case study describes applying clinical research to a software-engineered system. | Distinct authority boundaries; TypeScript/Mastra integration. Kubernetes is a deployment choice, not an evaluation accomplishment. |
| [Counsel quality-judge report](https://www.counselhealth.com/ai-report/llm-as-a-judge), also supplied as PDF | Condition-specific evidence and independent criteria matter. Published weighted aggregate metrics do not by themselves measure rare-error sensitivity. | Five narrow, independently authored research criteria. Do not claim to reproduce Counsel's unpublished seven-item rubric or composite. |
| [Abridge judge validation, 19 August 2026](https://tech.abridge.com/blog/continual-monitoring-validating-and-using-llm-judges) | High agreement can still reverse the ranking of two systems. Judge validation depends on use; rare-error sampling and version-dependent bias matter. | Separate error detection, prevalence estimation and paired component comparison. Passing statistical gates is not automatic clinical admission. |
| [Physician-centered g-AMIE oversight](https://research.google/blog/enabling-physician-centered-oversight-for-amie/) | Constrained assistance and physician editing were studied in simulated encounters. Oversight burden and verbosity remain important human factors. | No autonomous patient writer. Measure review time, necessary edits and missed findings, not just perceived eloquence. |
| [Counsel on practicality](https://www.counselhealth.com/blog/the-importance-of-practicality-in-medical-ai) | Everyday care workflows and latency deserve attention alongside difficult diagnostic benchmarks. | Short condition-level outputs, bounded context, no multi-agent debate or automatic prompt optimizer on this tiny dataset. |
| [Mastra control flow](https://mastra.ai/docs/workflows/control-flow) | `foreach` supports bounded concurrency. Parallel branches join before downstream continuation. | Retrospective judges use concurrency 3. An emergency action must never await this quality-audit join. |
| [Mastra evaluations](https://mastra.ai/docs/evals/overview) and [observability](https://mastra.ai/docs/observability/overview) | Score explicit behavior and retain inspectable execution evidence. | Independent scorers, typed outcomes, topology canaries, hidden clinical payloads; no score-to-readiness shortcut. |
| [GPT-6 Astra model documentation](https://developers.openai.com/api/docs/models/gpt-6-astra) and [current-model guide](https://developers.openai.com/api/docs/guides/latest-model) | Astra supports structured outputs and tools; the published price is $10/M input and $50/M output tokens. Large context and asynchronous tool features are capabilities, not evidence of clinical benefit. | Explicit synthetic research candidate only; no default replacement of the intake model or emergency authority. Account access was subsequently verified; clinical performance remains unmeasured. |

The supplied role description and verified company work inform these proposed
engineering decisions. Public descriptions are not evidence of internal
implementation details or deployment approval.

## Agent and authority map

| Component | Input → output | Authority | Verification |
|---|---|---|---|
| Deterministic emergency supervisor | Patient turns → locked urgency floor | Can elevate urgency; cannot send a message | Existing emergency/same-day regressions, negation, turn rescan, fault tests; external benchmark currently fails |
| Clinical intake Agent | Bounded episode + one read-only policy result → summary, differential, unknowns, questions | Clinician handoff only; no prescriptions or chart writes | Actual Agent/tool-loop tests, schema limits, emergency bypass and one-way promotion |
| Decision-time preparation | Structured synthetic episode → evidence available at the audited decision | No model call | Event time **and** availability time, unique source IDs, strict target/cutoff, no silent truncation |
| Emergency-action judge | Snapshot → finding on immediate response | Retrospective flag only | Current vs negated/historical symptoms in rubric; explicit same-day/emergency fault fixture; clinical calibration pending |
| UTI pregnancy-context judge | Snapshot + signed antibiotic decision → documented context/process finding | No prescribing authority | Future answers excluded; question is not an answer; no inferred anatomy from gender or age |
| UTI systemic-risk judge | Snapshot → upper-tract/systemic assessment finding | No diagnosis or treatment action | Positive symptoms assessed with response; complete-record omission separated from missing records |
| Viral-URI antibiotic judge | Actual signed exposure + indication → finding | No cancellation or order action | Drafts, cancellations and requests are not exposure; co-indications must be considered |
| Sinusitis antibiotic judge | Symptom trajectory + actual order → finding | No treatment action | Persistent/severe/double-worsening patterns; chronology ambiguity must abstain |
| Deterministic aggregation | Exactly five findings → physician review category | Cannot certify safe care | Completeness, consistent input/rubric, criterion identity, safety priority, explicit abstention |

The retrospective path is `prepare → foreach(judge, concurrency=3) → aggregate`.
Its registered Studio workflow is dry-run by default. Five actual Mastra
Agents are registered for inspection; manually invoking one in Studio with a
key is a provider call and bypasses the research CLI's budget ledger. Use the
CLI for a cost-bounded experiment.

The clinical reference locators in the rubrics are not live retrieval.
[CDC outpatient guidance](https://www.cdc.gov/antibiotic-use/hcp/clinical-care/adult-outpatient.html)
supports bacterial sinusitis patterns and distinguishes them from routine
viral illness; even a bacterial pattern does not make antibiotics obligatory.
[ACOG's pregnancy UTI consensus](https://www.acog.org/clinical/clinical-guidance/clinical-consensus/articles/2023/08/urinary-tract-infections-in-pregnant-individuals)
is a relevant source for pregnancy-specific considerations, but the full
page could not be retrieved during this review. These draft rubrics still
need physician review, including local policy, exclusions and counterexamples.

## Component-by-component improvement and remaining test

| Aspect | Change or decision | Next evidence needed |
|---|---|---|
| Scope | Preserve small V0; isolate research extension | Candidate can defend every additional component's purpose |
| Taxonomy | Keep emergency-now separate from same-day | Explicit timing/destination reference and local escalation feasibility |
| Clinical evidence | Exact source spans and dual-time snapshot | Semantic entailment, contradictory/stale context, record completeness provenance; valid quotation alone is insufficient |
| Cohort selection | Structured diagnosis and actual target order; unknown cohort abstains | Recall of cohort selection, coding omissions, label timing, multi-condition cases, demographic scope and denominator audit |
| Orchestration | Actual typed Mastra steps and five bounded Agents | Live provider stalls, cancellation acknowledgement and throughput/load tests; research timeout is not a clinical SLA |
| Failure handling | Timeout/malformed output/provider error → ABSTAIN; siblings complete | Queue ownership, expiry and clinician acknowledgement before clinical use |
| Judge validation | F1 is zero when all positives are missed; every row must identify an independent model family; all-green metrics do not grant admission | Physician labels, split integrity and use-specific uncertainty estimates |
| Handoff grading | Remove circular grounding; scorer requires retrieved IDs from an independent tool trace | In production, trace ingestion must supply those IDs. A missing observation is unverified, not proof the clinician erred |
| Retrieval/vector work | Retain the frozen rejected retrieval candidate and exact local lookup | New versioned corpus, permissions, citation entailment, stale-guideline/poisoning tests and paired downstream quality study |
| Observability | Sensitive fields expanded; persisted CQA topology tested with private canaries; tests use isolated stores rather than contend with Studio's DuckDB lock | Raw provider/agent span leakage tests on a live synthetic run; retention, access and deletion policy for real records |
| Research durability | Immutable manifest/results, resume checks, exclusive local lock, fsynced cost reservations | OS-kill recovery drill and provider-bill reconciliation; multi-host queue needs different infrastructure |
| Physician UX | Evidence inspector with decision cutoff and linked spans, separate from existing adjudication | Timed physician usability trial: missed flags, unnecessary review, citation navigation and confidence calibration |
| Scale | Bound every call and preserve per-criterion outcomes | Tenant-scoped queues/leases, idempotency, load shedding, dead-letter review, capacity and weighted sampling; no 25M-case capacity claim |
| Model selection | Astra experimental; preserve provider-neutral architecture and existing bakeoff | Compare prompted baseline and full agent on the same cases, independent adjudicator, matched tools/context and costs |
| Human health | Keep access and completed care as endpoints | Time to appropriate care, completed escalation, avoidable utilization, recontact/adverse outcomes and subgroup access; no benefit established yet |

## Evaluation design: measure whether the added component helps

There are three different questions:

1. **Software behavior:** does the orchestrator enforce its declared
   constraints? The scripted demo injects four false PASS outputs with invalid
   provenance. The same outputs are accepted by an unchecked label-only
   baseline and rejected by the evidence-checked path. This paired ablation
   establishes a particular check's mechanical value, not clinical lift.
   A schema-valid injection or clinically irrelevant exact quotation may
   still pass; these must be included in live judge calibration.
2. **Judge validity:** can a frozen judge find the particular quality problem
   it is intended to find? Use development examples for rubric refinement,
   separate selection data, and untouched patient/episode-level test data.
   Count FAIL as the positive class. Report its sensitivity and precision,
   specificity, abstention/coverage (including among expert failures),
   per-condition and per-version support, and uncertainty. Never silently
   remove abstentions from the safety denominator. Annotate ambiguity instead
   of forcing false binary certainty.
3. **System lift:** does the candidate improve clinician-assessed care over
   a simpler baseline? Freeze the cases and evaluated outputs, randomize and
   blind their presentation, and pair comparisons within episodes. Compare
   clinician judgments with judge estimates of the *difference*, not just
   aggregate agreement. Report review burden, latency and cost with the
   safety endpoint. A cross-vendor judge reduces one dependency; it is not
   an independent physician or guaranteed unbiased.

For future population monitoring, separate a probability sample with known
inclusion weights from the active-review queue enriched for risk and
disagreement. Enrichment finds problems; it does not directly estimate their
prevalence. Weighting requires design-aware intervals and effective sample
size; current simple Wilson intervals must not be relabeled weighted or
cluster-robust. Repeated trials belong to the same episode cluster and do not
create additional independent patients.

### Counsel-method HealthBench comparison

[Counsel's emergency study](https://www.counselhealth.com/blog/how-counsel-leveraged-healthbench-to-assess-emergency-escalation)
uses Consensus emergency tags, English filtering, exclusion of conditional
emergencies and second-hand cases, ending at 103 scenarios. It compares an
explicit pipeline flag with judged free-text responses. The public article
reports all models at 100% recall in the figure caption while prose suggests
a false-negative advantage; this should not be silently resolved into an
unsupported comparative claim. Its exact retained IDs and full production
pipeline are not public. Our reconstruction must remain labeled derived,
not an exact reproduction of their private evaluation.

Keep this narrow reconstruction for comparable emergency stress testing.
Keep conditional, pediatric/caregiver and non-English cases in **separate
challenge suites** appropriate to our proposed scope. Their exclusion for
one published analysis is not evidence they are safe to ignore operationally.
Route accuracy, free-text escalation grading, full HealthBench rubric scores
and clinical CQA performance are distinct measurements.

[HealthBench](https://openai.com/index/healthbench/) is useful for
physician-rubric communication and reasoning; it is not a task-state audit
of orders. NOHARM is useful for harmful recommendations/omissions, and
MedAgentBench for clinical tool execution. The existing
`configs/clinical-evaluation-portfolio-v1.json` records their separate roles.
Do not claim any unexecuted benchmark score or pool incomparable tasks into
a single clinical performance estimate.

## Run and inspect

```bash
npm run test:cqa
npm run cqa:demo
npm run review:dev       # http://127.0.0.1:4120/quality
```

The eight displayed episodes are synthetic, scripted harness examples. The
interface is read-only and does not touch the existing clinician adjudication
store. Exact citations link to source text; post-cutoff records are visibly
excluded. Runtime timings are normalized to zero only in the reproducible
scripted artifact, never reported as speed measurements.

For a future explicitly enabled synthetic pilot, the CLI supports
`openai/gpt-6-astra` and `anthropic/claude-sonnet-5`. Select a model and bounded
case IDs; load the ignored `.env` with Node, never paste credentials into chat:

```bash
MASTRA_TELEMETRY_DISABLED=true node --env-file=.env --experimental-strip-types \
  scripts/quality-audit-research.ts --live --experiment NEW-UNUSED-RUN-ID \
  --model openai/gpt-6-astra --case-ids CQA-004
```

`npm run cqa:research` alone uses the process environment; Node's `--env-file`
above explicitly loads the local file. The original scripted demo and this
review required no provider calls. The subsequent live pilot is recorded
separately; it has already reserved nine calls, leaving only one in this
ledger. The example is not permission to erase the ledger or rerun history.

The first pilot intentionally has a **shared $20 reservation ceiling / 10
calls** across CQA experiments in `tmp/cqa-research`. A $2 reservation precedes
each call; context bytes and output tokens are bounded using the reviewed
allowlisted provider pricing. This is conservative local accounting, not a provider billing
guarantee or a global cap on unrelated programs/Studio. Reconcile actual
billing before approving more spend within the user's overall $100 limit.
Some later criteria will abstain when the cap is reached; this is a pilot,
not a completed benchmark. Errors/abstentions are cached, not automatically
retried. Changing model, inputs, prompt, dependency lock or implementation
invalidates resume under the same experiment ID.

An interrupted process may leave `runner.lock`; do not delete it without
checking that the recorded process has stopped. Never remove the budget
ledger to obtain more calls. This is conservative single-host research
storage, not a durable clinical datastore. The judge CLI retains detailed
synthetic evidence locally; the registered Mastra application separately
retains redacted topology. It does not yet provide a unified live-provider
trace-to-result observability pipeline.

## A focused reviewer demonstration

Begin with the failed external emergency baseline. Explain what its local
100% replay concealed. Show the separate same-day/emergency contract. Then
open CQA-002: a later pregnancy answer cannot justify an earlier prescription.
Show CQA-004: same-day advice is not immediate emergency action. Show a broken
judge becoming an explicit abstention while the remaining criteria finish.
Finally show the trace, the independent evidence check and the test command.

The defensible conclusion is: **we can make failure visible, reproducible and
actionable without inventing evidence of clinical success.** The next
clinical claim must be earned by the frozen comparative experiment, not by
the presentation.

### Executed browser checks

On 8 September, the local `/quality` page rendered successfully. Browser
interaction verified CQA-002's future-source exclusion and abstention,
CQA-004's emergency/same-day failure, and citation navigation to the exact
highlighted clinician response. Narrow-screen inspection prompted a compact
case selector so eight stacked case buttons no longer hid the work surface.
These checks cover the read-only inspector, not physician usability or live
clinical performance; the existing adjudication records were not modified.
