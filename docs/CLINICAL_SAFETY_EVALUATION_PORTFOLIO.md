# Clinical safety and efficacy evaluation portfolio

**Decision date:** September 7, 2026

**Audience:** Counsel clinical AI, engineering, product, and safety reviewers
**Current disposition:** ready for technical review as a synthetic research
artifact; **not clinically validated, efficacious, deployment-ready, or proven
harmless**.

## Executive decision

No single benchmark answers whether this system is safe or improves health.
HealthBench measures response quality. HealthBench Hard concentrates cases that
frontier models find difficult. NOHARM measures harmful omissions and
commissions in comprehensive management plans. MedAgentBench measures whether
an agent can retrieve and formulate actions in a simulated FHIR environment.
Those are valuable, different constructs. None estimates this four-level inbox
workflow's clinical performance, the safety of the human-AI team, completed
care, or patient outcomes.

The defensible portfolio is therefore:

1. use deterministic checks and frozen adversarial cases to verify the software
   contract on every change;
2. finish the attributable single-physician development review required by the
   take-home;
3. run a preregistered, untouched, representative retrospective study for the
   actual route definitions and operations context;
4. use compatible public benchmarks as stress tests without promoting their
   scores into local clinical claims;
5. test clinicians and the complete workflow under realistic pressure, then in
   prospective silent mode; and
6. require a controlled clinical evaluation before claiming efficacy.

This follows the central distinction in the IMDRF clinical-evaluation model:
valid clinical association, analytical/technical validation, and clinical
validation answer different questions. Accurate processing alone does not show
that use of the output achieves the intended purpose in the target population.
The same guidance treats clinical evaluation as continuous and risk-proportionate.
([IMDRF SaMD Clinical Evaluation N41](https://www.imdrf.org/documents/software-medical-device-samd-clinical-evaluation))

## What the current artifact is

The system under test is a synthetic, preclinical workflow for a licensed
clinician or clinical-operations reviewer. It accepts a bounded active-episode
message transcript and emits one of four dispositions, with an optional
clinician-facing handoff. It does not write to an EHR, place orders, prescribe,
or send a patient-facing response.

That boundary is a safety property, not a disclaimer. A benchmark should be run
only when its input, output, tools, and user role match the system being tested.
Scoring a route label as though it were a comprehensive management plan would
produce a number and destroy construct validity.

The machine-readable source of truth is
[`configs/clinical-evaluation-portfolio-v1.json`](../configs/clinical-evaluation-portfolio-v1.json).
`npm run evaluation:readiness` validates it against the checked-in evidence and
regenerates
[`outputs/clinical-evaluation-readiness-v1.json`](../outputs/clinical-evaluation-readiness-v1.json).
After all 50 cases are complete and attested, pass the GUI export explicitly:

```bash
npm run evaluation:readiness -- --review-bundle /path/to/counsel-physician-review.json
```

The command uses the same parser as the workbench to verify the SHA-256 digest,
the exact source/proposal/V0 provenance, the 50-case inventory and completion,
and the attestation semantics. A handwritten summary is not accepted. The
result may advance only the single-physician development-reference claim.

## Benchmark portfolio

| Instrument | What it is good for here | Decision now | What a score cannot show |
|---|---|---|---|
| HealthBench | Broad response quality, emergency referrals, context seeking, worst-of-n reliability | Run only when a compatible response system exists | Local routing safety, patient outcomes, efficacy |
| HealthBench Consensus | Narrow, higher-precision emergency and context behaviors | Pre-register a local adapted slice after the route protocol is frozen | Comprehensive safety; its higher precision has lower failure recall |
| HealthBench Hard | Unsaturated failure discovery and headroom | Future response-model stress test only | Safety or release readiness; cases were selected for model difficulty, not harm severity |
| NOHARM v2 | Severity-weighted management omissions and commissions, worst variants, resilience | Run when the system actually produces comprehensive management plans | This V0's route safety or real-world event rates |
| MedAgentBench v1 | FHIR query/action planning and exact task completion | Defer until the product has EHR tools | Safe production EHR operation or clinical benefit |
| MedAgentBench v2 | Structured-tool, planning, and governed-memory ablations | Watchlist until FHIR tools or cross-episode memory are proposed | Safe online learning or general deployment reliability |
| HealthAgentBench | Broad terminal-based multimodal and data-workflow stress | Adjacent watchlist, not a release gate | Inbox-triage safety or efficacy |
| MedSafe-Dx v0 | Escalation, false reassurance, and uncertainty failure discovery | Research watchlist subject to license and construct review | Intended-use performance; it is a v0 preprint over synthetic diagnostic cases |

### HealthBench: useful, large, and bounded

HealthBench contains 5,000 realistic single- and multi-turn conversations,
48,562 example-specific rubric criteria, and contributions from 262 physicians
with experience across 60 countries. It includes 482 emergency-referral
examples and explicitly examines worst-of-n reliability. The benchmark is a
strong portfolio measure for a health response model, not an estimate of harm
or health outcomes.
([OpenAI overview](https://openai.com/index/healthbench/),
[paper](https://cdn.openai.com/pdf/bd7a39d5-9e9f-47b3-903c-8b847ca650c7/healthbench_paper.pdf))

Its own limitations matter here. HealthBench Consensus retains 3,671 examples
and 34 multiply reviewed criteria, gaining precision while losing coverage of
possible failures. Across its consensus meta-evaluation, physician-physician and
model-physician agreement varies by theme; most other example-specific criteria
were written by one physician and not independently validated, and individual
rubrics are not comprehensive. HealthBench Hard is 1,000 examples selected
because then-frontier models struggled with them. That is a difficulty set, not
a clinical-safety set. The authors also request that examples not be republished
to reduce leakage. These facts require criterion-level reporting, grader
meta-evaluation, web-disabled inference, and a private local holdout.
([HealthBench paper](https://cdn.openai.com/pdf/bd7a39d5-9e9f-47b3-903c-8b847ca650c7/healthbench_paper.pdf),
[simple-evals](https://github.com/openai/simple-evals))

Counsel's published emergency analysis demonstrates the right adaptation
pattern: isolate a clinically coherent slice, report recall and precision rather
than aggregate accuracy, and name conditional and conversational emergencies
as remaining work. A local route-label adaptation must be called a derived
evaluation, not an official HealthBench score.
([Counsel emergency-escalation evaluation](https://www.counselhealth.com/blog/how-counsel-leveraged-healthbench-to-assess-emergency-escalation))

### NOHARM v2: harm must include what the model leaves out

The current NOHARM manuscript contains 100 real generalist-to-specialist
consultation cases plus 1,000 physician-selected perturbations across ten
specialties. Its 4,249 management options received 12,747 annotations from a
panel of 29 board-certified physicians, including 23 specialists and
subspecialists. The framework rates both commission and omission using a
modified RAND/UCLA appropriateness scale with WHO harm-severity concepts.
([NOHARM manuscript](https://arxiv.org/abs/2512.01241))

This is the most important conceptual correction for a safety-first program:
safe-looking brevity can omit necessary workup, counseling, follow-up, or
treatment. In the current study, severe errors were dominated by omissions;
model performance also degraded on clinically equivalent input perturbations.
Multi-agent systems did not reliably improve safety: gains depended on a strong
final reviewer and on team composition. An ensemble is therefore an ablation to
evaluate, not a safety control to assume.
([NOHARM manuscript](https://arxiv.org/abs/2512.01241))

The official open kit contains 30 base cases with ten perturbations per case,
reports weighted precision/recall/F1, severe-event rate, worst-variant floor,
and resilience, and uses a two-stage Gemini judge. The kit warns that preview
judge versions can drift and that cached judgments are keyed by a model name;
changing a model without changing that namespace can reuse stale results.
These requirements are encoded in the portfolio. The paper separately warns
that absolute harm rates are rubric indicators for the selected cases, not
real-world event rates.
([NOHARM open-kit README](https://github.com/ARISENetwork/mast/tree/main/benchmarks/donoharm),
[released analysis and contamination policy](https://github.com/ARISENetwork/noharm))

The current V0 does not write a comprehensive management plan, so a NOHARM run
now would test a mismatched object. It becomes high priority if the bounded
handoff expands into management recommendations.

### MedAgentBench: evaluate actions only when the product can act

MedAgentBench v1 contains 300 physician-authored tasks over 100 realistic
patient profiles and more than 700,000 FHIR records. Half of the tasks are
queries and half are action tasks. It reports pass@1, deliberately avoiding a
best-of-k interpretation for high-stakes use. The best original overall result
was 69.67%, with material differences between query and action performance.
([MedAgentBench paper](https://arxiv.org/abs/2501.14654),
[repository](https://github.com/stanfordmlgroup/MedAgentBench))

The benchmark is appropriate when an agent has FHIR tools. It is not a release
simulation: the paper says its environment lacks production security and
enterprise logging, its profiles come from one academic center, its task set
does not model the full coordination of care, and the original evaluator
validates proposed action payloads rather than a production transaction with
authorization, idempotency, reconciliation, and rollback. A production-grade
extension should verify intended action, committed world state, absence of
unauthorized side effects, and recovery from partial failure.

MedAgentBench v2 is especially instructive because it reports 91% success with
structured tools and 98% after adding memories synthesized from prior failures.
Its authors also require physician oversight of what is learned, auditable and
versioned memories attributable to corrections, human review of consequential
actions, sandboxed and logged EHR interaction, representative workflow
validation, drift monitoring, and incident reporting. The correct lesson is not
"add memory." It is to run no-memory versus governed-memory ablations on
patient- and task-family-independent partitions, prevent test-answer leakage,
and measure negative transfer.
([MedAgentBench v2 paper](https://psb.stanford.edu/psb-online/proceedings/psb26/chen_eric.pdf),
[repository](https://github.com/ARISENetwork/medagentbenchv2))

### Adjacent agent benchmarks

HealthAgentBench is a current terminal-agent benchmark with 54 tasks across
seven heterogeneous categories, including imaging, EHR data quality, ETL,
clinical-trial matching, and longitudinal event modeling. It records
attempt-level success, cost, and time; several categories require gated data and
the complete suite requires at least 30 GB of assets. Its maintainers recommend
disabling web access to avoid gold-label retrieval. It is valuable if Counsel's
agent scope expands into those workflows, but its pooled success rate is not a
triage metric.
([HealthAgentBench repository](https://github.com/microsoft/HealthAgentBench),
[project site](https://microsoft.github.io/HealthAgentBench/))

MedSafe-Dx v0 directly names missed escalation, unsafe reassurance, and
overconfident wrong output, which makes it useful for taxonomy and failure
discovery. It remains a preprint benchmark over DDXPlus synthetic cases, and its
CC BY-NC-ND license restricts reuse. It should remain a watchlist item rather
than a Counsel release gate.
([MedSafe-Dx repository](https://github.com/cortico-health/MedSafe-Dx))

## Required local evaluation

Public benchmarks complement the following intended-use study; they do not
replace it.

Their release logic is intentionally asymmetric: a regression or severe
failure may block a candidate, while a pass can never clear clinical release by
itself.

### L0 — software verification: implemented

Run on every change:

- schemas, route postconditions, determinism, and idempotency;
- zero silent downgrade after any emergency signal;
- no unauthorized patient, order, prescription, or chart action;
- model, tool, schema, timeout, and retrieval failure closure;
- Unicode, negation, conflicting-intent, prompt-injection, and multi-turn
  emergency cases;
- semantics-preserving metamorphic transformations;
- trace redaction, access controls, and canary absence; and
- complete registered Mastra graph, scorer, and production-build checks.

The current deterministic suite supplies evidence only for its checked-in
synthetic contracts. Its frozen retrieval candidate failed its preregistered
temporal holdout and remains unadmitted. That negative result is part of the
safety record, not a loose end to hide.

### L1 — one-clinician development review: pending

Complete all 50 cases in the blinded GUI, lock each independent judgment before
revealing comparisons, finish the case-level assessment, sign the attestation,
and export the integrity-hashed bundle. This demonstrates the physician-
engineer's framing and audit. It does not become a consensus label set or
external performance estimate.

### L2 — untouched retrospective intended-use validation: required

Before reading labels, freeze:

- intended users, population, episode boundary, age and language scope;
- operational meaning, destination, and SLA for each route;
- labeling manual, severity scale, and decision-changing unknowns;
- patient- and episode-independent sampling and exclusion rules;
- probability-sample weights and subgroup strata;
- multi-clinician overlap used to calibrate the reference process;
- primary and safety metrics, intervals, and stop rules; and
- exact model, prompt, tools, retrieval corpus, seeds, and grader versions.

Report the complete four-level confusion matrix, emergency and same-day
sensitivity and positive predictive value separately, any-escalation
performance, destination and timing accuracy, severity-weighted
under-triage, over-triage burden, every serious false negative, abstention, and
calibration if a score is emitted. Stratify by clinically and operationally
relevant groups and time.

Zero observed severe failures is not proof of a zero failure rate. Under a
simple independent-binomial approximation, the familiar 95% "rule of three"
places the upper bound near `3 / n`; real clinical dependence and distribution
shift can make that approximation optimistic. Report the exact one-sided
interval and design the sample around the prespecified tolerable rate, not the
other way around.

### L3 — human-factors simulation: required

Test representative clinicians and clinical-operations staff with queue
pressure, interruptions, ambiguous histories, degraded tools, and incident
drills. Counterbalance baseline and AI-assisted conditions. Measure time to the
correct destination, completed escalation, missed alerts, override behavior,
edit distance, additional-information requests, workload, and trust
calibration. A nominal human in the loop is not evidence of safety; the human-AI
team is the unit of evaluation.

This emphasis matches international transparency principles that focus on
human-AI team performance and essential information for users.
([FDA/Health Canada/MHRA transparency principles](https://www.fda.gov/medical-devices/software-medical-device-samd/transparency-machine-learning-enabled-medical-devices-guiding-principles))

### L4 — prospective shadow mode: required

Run silently on the live distribution with no patient-facing output or EHR
write. Predefine stop conditions, rollback, reconciliation, and incident
response. Measure prospective disagreement, near misses, availability, latency,
distribution drift, subgroup drift, and the opportunity for completed
escalation. Early live clinical evaluation must include actual system
performance, safety, and human factors; DECIDE-AI provides the reporting frame
but does not by itself certify methodological quality.
([DECIDE-AI](https://www.nature.com/articles/s41591-022-01772-9))

### L5–L6 — efficacy, controlled release, and monitoring: not started

Efficacy means the intervention improves a clinically meaningful endpoint in
the intended workflow—not that it agrees with a label or earns a benchmark
score. Depending on risk and equipoise, compare against current practice on:

- time to appropriate care and completed urgent escalation;
- delayed or missed urgent care and patient-safety events;
- clinician time, queue throughput, and alert burden;
- access, language, and subgroup equity; and
- patient comprehension or experience when applicable.

Use independent safety monitoring and a protocol proportionate to risk.
SPIRIT-AI and CONSORT-AI require transparent specification and reporting of the
AI intervention, inputs and outputs, user skills, integration setting,
human-AI interaction, and error cases for prospective trials.
([CONSORT-AI](https://www.nature.com/articles/s41591-020-1034-x))

After release, every model, prompt, policy, corpus, embedding, reranker, tool,
and workflow change is a versioned intervention. Monitor realized events,
completed care, overrides, complaints, latency, availability, drift, and equity;
tie thresholds to action and periodically revalidate. The FDA-hosted GMLP
principles provide a useful total-product-lifecycle discipline, although legal
device status and jurisdiction-specific requirements require Counsel's own
regulatory counsel.
([FDA GMLP page](https://www.fda.gov/medical-devices/software-medical-device-samd/good-machine-learning-practice-medical-device-development-guiding-principles))

## Agent, RAG, and judge ablations

### Agent architecture

Compare at least four frozen systems on the same intended-use sample:

1. deterministic route only;
2. deterministic emergency floor plus one bounded handoff agent;
3. same architecture with structured critique/self-review; and
4. a cross-provider reviewer or parallel ensemble.

The primary comparison is not aggregate score. Measure severe omissions and
commissions, emergency and same-day sensitivity, unsafe downgrade, abstention, clinician edits,
latency, and cost. NOHARM shows that multi-agent gains are topology- and
reviewer-dependent, so the ensemble must earn admission empirically.

### Retrieval and vector search

Keep the rejected hybrid retriever out of the route. A newly registered
candidate needs a new untouched holdout and should be evaluated on source
authorization, relevance, recall@k, reranking, abstention, freshness, conflict
handling, provenance, citation entailment, and robustness to poisoned or stale
documents. Then measure the downstream change in harmful omission, commission,
and clinician workload. Retrieval quality is necessary; a higher vector metric
without safer downstream decisions is not a clinical benefit.

### Automated graders

Prefer code or world-state checks for crisp properties. For clinical rubrics,
measure criterion-level sensitivity, specificity, positive predictive value,
negative predictive value, and calibration against blinded physicians. Include
valid negatives and single planted failures, cross-provider judges,
paraphrases, response-length perturbations, and version drift. Preserve every
judge disagreement and adjudication. Do not average away a missed severe event.

## Leakage, reproducibility, and cost protocol

Before a paid run:

1. freeze and hash the system, model, prompt, tools, corpus, adapter, judge,
   seeds, trials, and analysis plan;
2. confirm that the benchmark construct matches the output under test;
3. disable web and access to gold labels;
4. estimate the full run and judging cost and set provider-side hard limits;
5. use separate cache namespaces for every output/model change; and
6. preserve immutable raw outputs, tool trajectories, judge decisions,
   failures, latency, and reconciled cost.

This increment made no external model or judge calls and spent $0. Three
zero-cost variants were executed on the frozen 103-case Counsel-method
HealthBench Consensus reconstruction. The deterministic supervisor failed with
28/29 emergencies missed; the always- and never-emergency controls also failed.
The live Mastra agent remains unmeasured until a provider key and preregistered
spend estimate are present. See
[`HEALTHBENCH_EMERGENCY_EVALUATION.md`](HEALTHBENCH_EMERGENCY_EVALUATION.md).
The remaining benchmark plan stays within the existing $100 ceiling by
requiring a small preregistered pilot before any full run. NOHARM's own open-kit documentation
describes judge cost as a few dollars, but actual cost must be recalculated for
the selected inference model, judge versions, trial count, and token use.

## Current claims ledger

| Claim | Current answer | Why |
|---|---|---|
| Synthetic software contracts pass | Yes, after a green full validation run | Tests exercise the declared deterministic and Mastra contracts |
| Physician-authored development reference complete | No | The repository default contains no signed 50/50 export |
| Retrieval candidate admitted | No | The registered temporal-holdout gates failed |
| Clinical performance estimated | No | No untouched representative intended-use sample |
| Clinical efficacy established | No | No prospective comparative outcome study |
| Clinically deployment-ready | No | Reference, validation, human factors, shadow, governance, and outcome gates remain open |
| Zero harm established | No | Finite evaluation can discover and bound risk, never prove absence across future conditions |

The strongest review signal is not a perfect score. It is that the repository
knows which question each score answers, preserves negative evidence, prevents
claims from outrunning data, and makes the next valid experiment executable.
