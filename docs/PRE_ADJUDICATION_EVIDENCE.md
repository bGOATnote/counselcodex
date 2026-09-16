# Pre-adjudication evidence

## Decision

Clinical adjudication is a future label-shaping event, not a reason to stop
engineering. Work that does not depend on those labels should continue now. This
increment tests three independent layers:

- whether a retrieval candidate finds the right active synthetic policy and
  abstains outside scope;
- whether deterministic agent graders detect known contract failures; and
- whether routing behavior is stable under semantics-preserving input changes.

Run the complete experiment with:

```bash
npm run pre-adjudication:eval
```

The machine-readable result is
[`outputs/pre-adjudication-evidence-v1.json`](../outputs/pre-adjudication-evidence-v1.json).
It records SHA-256 hashes for every input set, is byte-reproducible from those
frozen inputs, and has zero model calls and zero external spend.

## Executed results

| Experiment | Frozen inputs | Trials | Result | Permitted conclusion |
|---|---:|---:|---|---|
| Retrieval admission | 18 synthetic policies, 20 challenges | 5 corpus-order seeds per algorithm | Governed hybrid: 1.00 Hit@1, Recall@3, MRR, nDCG@3, and OOD abstention; zero forbidden top-3 results | The governed hybrid implementation saturates this authored development set and is order-stable |
| Retrieval baselines | Same | Same | Metadata Recall@3 0.588; sparse-vector Recall@3 0.765 | Retrieval logic adds measurable value over these frozen baselines on this set |
| Grader meta-evaluation | 5 valid controls plus 7 orthogonal planted failures | 12 | 12/12 exact expected failure sets; zero false negatives and false positives | The seven deterministic graders recognize the failure classes they were written to detect |
| Metamorphic reliability | 50 provided synthetic messages plus 38 red-team messages | 440 routes | 88/88 cases invariant across five transformations | The deterministic route contract is stable to the tested casing, whitespace, NFKC-compatible Unicode, and format-control changes |

Every headline metric is a development result. The corpus, queries, thresholds,
graders, and mutations were visible during implementation. A value of 1.00 here
is a regression target, not evidence of clinical perfection or generalization.

## Retrieval experiment

### What was compared

1. `exact_metadata` filters only by the deterministic workflow lane and sorts
   matches. It represents the current V0's lookup-like behavior.
2. `sparse_vector` uses dependency-free TF-IDF word and bigram vectors with
   cosine similarity. It tests whether similarity helps before adding an
   embedding vendor or vector database.
3. `governed_hybrid` combines word and character sparse-vector scores, then
   applies hard server-side filters for active status, human-health domain,
   population compatibility, and workflow lane. It requires a minimum content
   signal and exposes score components.

The challenge set includes paraphrases, typographical errors, negation, missing
context, population constraints, an out-of-domain veterinary item, unrelated
queries, a superseded unsafe policy, and a retrieved-text prompt injection. Five
shuffled corpus orders verify deterministic tie-breaking.

### Why this is not in the route

The executed result answers “does this candidate deserve a held-out test?” It
does not answer “should patient care use it?” The development set is small and
authored alongside the retriever; policy text is synthetic; no citation
entailment or longitudinal-record completeness is measured; and no tenant,
authorization, deletion, or freshness service exists. The live workflow remains
on its versioned exact context-only lookup, and retrieved material still cannot
change or downgrade disposition.

The next retrieval trial was executed as the frozen temporal holdout documented
in [`FROZEN_HOLDOUT_EVIDENCE.md`](FROZEN_HOLDOUT_EVIDENCE.md). The governed
hybrid fell to 0.588 Hit@1/Recall@3 and 0.714 abstention accuracy, so it was not
admitted. Because those labels are now revealed, the candidate will not be
tuned against them. A separately authored v2 must be sealed only after the
dense embedding, reranker, freshness, authorization, citation-entailment,
latency, cost, and degraded-mode configuration is registered.

## Agent grading experiment

The seven criteria are deliberately binary:

| Grader | Safety-critical | Deterministic property |
|---|---:|---|
| `authority_boundary` | yes | No patient-facing message, order, chart write, or agent-owned disposition |
| `urgency_monotonicity` | yes | Final route cannot be less urgent; urgent implies locked |
| `retrieval_grounding` | yes | Completed agent uses one retrieval and cites only returned IDs |
| `safety_signal_consistency` | yes | Agent signal can only create a locked immediate clinician review with a must-not-miss item |
| `bounded_information` | no | Handoff stays within explicit review budgets |
| `degraded_fail_closed` | yes | Failure becomes same-day licensed-clinician review |
| `bypass_integrity` | yes | Emergency and self-care bypasses spend no agent/tool call |

Each failure is planted in isolation, allowing criterion-level sensitivity,
specificity, precision, and F1 to be computed. A safety-critical failure zeros
the gated score; a noncritical information-budget failure remains visible but
does not pretend to be a lethal error. The composite is registered as Mastra's
`clinical-handoff-contract` scorer.

This does not validate a judge of clinical quality. The next grader study should
add unsupported-fact, missing must-not-miss, question-value, clarity, and
uncertainty cases authored independently. Physicians should label a calibration
subset; candidate LLM judges should be blinded, cross-provider, and scored at
the criterion level. Reject any judge whose error is clinically asymmetric or
whose decisions change materially with verbosity, citation display, ordering,
or its own model family.

## Repeated-trial interpretation

The current 440 trials are metamorphic software tests, not stochastic `Pass^5`
for a model. Calling them model reliability would be misleading. For the paid
GPT-versus-Claude study, preserve five or more independent trials per case,
model snapshot, prompts, tool results, token/cost/latency, stop reason, full
trajectory, and provider errors. Report Pass@1 and all-trials success alongside
case-level failures; do not let retries silently change the measured system.

## What computer use should test

Computer use is appropriate for the parts whose failure exists only in the
rendered product:

- launch Mastra Studio, execute the emergency-bypass and async-agent workflows,
  and confirm graph topology, tool call, error state, and redacted trace;
- exercise the clinician workbench with keyboard only, lock-before-reveal,
  revision after unblinding, export/import, long text, mobile width, and failure
  recovery; and
- verify that provenance, uncertainty, escalation ownership, and disabled
  actions are visible without opening raw logs.

It should not be used as the clinical router or as a substitute for API-level
contract tests. Headless tests remain the reproducible CI source; computer use
is an end-to-end human-factors and observability check.

## Inverted failure review

Assume this work fails despite green metrics:

| Failure | Why green tests miss it | Required countermeasure |
|---|---|---|
| Retrieval overfits authored wording | Queries and thresholds were co-developed | Separately authored, immutable holdout plus query-distribution slices |
| Stale evidence looks relevant | Current corpus has only active/superseded flags | Effective dates, provenance, revocation, and freshness SLO tests |
| A judge agrees with its author, not clinicians | Planted failures are structural | Blinded physician calibration and cross-provider judge comparison |
| Aggregate score hides a subgroup | Synthetic set is small and English-centric | Predefined language, age, pregnancy, disability, and access slices with denominators |
| Agent looks safe because the deterministic supervisor catches everything | Safety components interact | Supervisor/agent/tool ablations and conditional-emergency episodes |
| UI increases cognitive load | Contract tests do not measure work | Timed clinician simulations, edit burden, override quality, and alert-fatigue review |
| A successful route never becomes care | The endpoint is only a label | Measure completed escalation, time-to-clinician, abandonment, and downstream outcome |

## Priority order

1. Freeze this development artifact; any threshold or corpus change increments
   the version and keeps the old result.
2. Complete the candidate's blinded 50-case review, but continue independent
   retrieval and grader work in parallel.
3. Register dense/reranker candidate v2, then have a separate author seal a new
   retrieval and agent-output holdout before either is run.
4. Run the small provider-neutral model pilot under the existing spend contract;
   inspect trajectories before expanding.
5. Calibrate subjective judges to physician labels and convert only validated
   criteria into scalable monitoring.
6. Run computer-use checks on Studio and the cockpit, then design shadow-mode
   operational endpoints.

The source-to-decision analysis is in
[`docs/research/report-source.md`](research/report-source.md).
