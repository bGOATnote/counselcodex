# Clinical quality judge program

**Decision:** the repository now has an executable judge control plane, but no
LLM clinical judge is authorized for monitoring or live intervention. The
active monitoring-admission checks are deterministic software-contract graders.
A separate five-Agent **synthetic research** workflow now executes draft
clinical criteria, with decision-time evidence, explicit abstention and a
cost-bounded pilot command. It is not the proprietary seven-item Counsel pack.
See the [8 September system review](QUALITY_SYSTEM_REVIEW_2026-09-08.md).
Clinical monitoring remains disabled pending physician-authored rubrics and
intended-use validation data.

## What changed

The current Mastra clinical-intake path exposes nine independent scorers in
Studio and trace evaluation:

1. authority boundary;
2. patient write-channel isolation;
3. urgency monotonicity;
4. retrieval grounding;
5. safety-signal consistency;
6. bounded information;
7. uncertainty preservation;
8. degraded-path fail closure; and
9. bypass integrity.

Each scorer tests one inspectable contract. Deterministic code combines the
bits into `excellent`, `acceptable`, `inadequate`, or `near_miss`; any
safety-critical failure becomes a near miss and receives the mandatory review
lane. This transparent rule is explicitly not represented as Counsel's
unpublished clinical composite rubric.

The versioned operating contract is
[`cqa-judge-program-v1.json`](../configs/cqa-judge-program-v1.json). The metric
implementation is [`judge-validation.mjs`](../src/evaluation/judge-validation.mjs).

## One channel, no extra clinical voice

The current take-home remains clinician-facing and produces no generated
patient message. This is the safest valid interpretation of its scope.

For a future patient-facing system, the contract reserves generation to one
history-taking agent. The emergency supervisor emits a typed flag and locked
route; retrieval provides evidence; condition classifiers select judge packs;
and judges score completed threads. None can independently compose or send a
patient response. A licensed clinician remains the sender for add-a-doctor
threads and retains authority for prescriptions, orders, and disposition.

This is a typed workflow, not an ensemble vote. Safety branches do not debate
the response generator and an LLM judge cannot overwrite the current thread.

## What the supplied Counsel report establishes

Counsel describes condition-scoped evaluation over more than 6,000
physician-led threads and 136,000 messages. Its viral URI and acute sinusitis
judges use inclusion/exclusion logic, thread/note/order evidence, and explicit
context extraction. Its UTI/vaginitis workflow uses seven independent binary
judges and a clinician-created four-level composite. Public examples include
pregnancy/breastfeeding and prior-UTI checks. The full seven-criterion rubric is
not public, so this repository does not invent it.

The reported URI judge had 96.59% accuracy, 98.6% weighted precision, 96.6%
weighted recall, 97.3% weighted F1, and Cohen's kappa 0.557 on 230 threads. The
sinusitis judge reported 81.52% accuracy, 83.1% weighted precision, 81.5%
weighted recall, 82.0% weighted F1, and kappa 0.551 on 92 threads. The
condition-specific judges were stricter than physicians in the low-quality
tail. These are useful published results, but not validation of a judge in this
repository. ([Counsel report](https://www.counselhealth.com/ai-report/llm-as-a-judge))

## Stronger validation contract

The supplied report motivates the architecture. Adjacent work clarifies the
failure controls:

- HealthBench grades individual physician-written criteria and meta-evaluates
  model grades against physician grades. It also emphasizes context seeking
  and worst-case reliability. ([OpenAI](https://openai.com/index/healthbench/))
- Mastra supports independent asynchronous scorers on agents and workflow
  steps, stored results, historical trace scoring, and Studio experiments. The
  nine active checks are registered independently rather than hidden inside
  one holistic score. ([Mastra documentation](https://mastra.ai/docs/evals/overview))
- Anthropic recommends balanced tasks, multiple trials, combined deterministic,
  model, and human graders, transcript inspection, and separating capability
  from regression suites. ([Anthropic](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents))
- Abridge reports that simple random samples can miss rare errors, judge
  agreement can vary by system version, high agreement can still reverse a
  system comparison, and judge validation must be tied to a specific use.
  ([Abridge](https://tech.abridge.com/blog/continual-monitoring-validating-and-using-llm-judges))
- Recent clinical studies found judge behavior can be too lenient or too harsh,
  degrade across language/cultural contexts, fail to abstain on difficult
  questions, and favor related model families. ([npj Digital Medicine](https://pubmed.ncbi.nlm.nih.gov/42477479/),
  [MedQADE](https://arxiv.org/abs/2607.01103))

Accordingly, the evaluator treats `FAIL` as the positive class and reports:

- failure sensitivity and specificity;
- precision, negative predictive value, F1, balanced accuracy, Matthews
  correlation, and Cohen's kappa;
- explicit `ABSTAIN` coverage and human-review load;
- unweighted confusion counts plus sampling-weighted point estimates;
- Wilson intervals for sensitivity, specificity, precision, and coverage;
- failure/pass support in every criterion-by-system-version cell;
- confidence-bounded performance and prevalence bias in every such cell; and
- judge-family versus evaluated-model-family coverage.

An attractive overall accuracy cannot hide a judge that misses every rare
failure. Abstention cannot silently become a pass. A judge must meet lower
confidence bounds in every criterion-by-system-version cell, not merely a
pooled point estimate.

## Admission before any clinical judge runs

The planned `emergency_redflag`, `uti_vaginitis`, and
`uri_sinusitis_stewardship` packs are disabled. Promotion requires:

1. a declared decision and intervention for each criterion;
2. physician-authored annotation instructions and labels;
3. weighted sampling that enriches rare failures while retaining weights;
4. critique, validation, and untouched test splits separated by patient and
   episode;
5. examples from multiple system versions, languages, and relevant subgroups;
6. explicit abstention and mandatory-review behavior;
7. cross-family bias evaluation when an LLM judge scores an LLM system;
8. criterion-specific sensitivity/specificity confidence bounds and sufficient
   positive/negative support;
9. deterministic outcome checks wherever structured data can answer the
   question; and
10. periodic blinded physician recalibration, drift monitoring, and rollback.

Only after those gates may a judge enter retrospective monitoring. Prospective
blocking requires a separate workflow/human-factors validation because the
intervention itself can introduce delay, alert fatigue, and automation bias.

## Evidence boundary

The planted-mutation meta-evaluation verifies that the software graders detect
known contract violations without cross-triggering. It does not validate
clinical semantics, estimate judge-physician agreement, or establish that any
clinical judge is safe to deploy. API credentials enable model execution; they
do not supply the missing clinical reference.
