# Clinical evaluation protocol

**Historical protocol for the rules-based V0 and its saved review instrument.**
The deterministic routing design and four-level metrics below do not describe
the active adaptive agent. Use [EVALUATION.md](EVALUATION.md) for the current
five-route reference/scoring contract and measured-results audit. Keep prior
reviews attached to the version they actually assessed.

## Decision

Do not require third-clinician adjudication for this assignment. Counsel gave
the work to one clinician-engineer and explicitly values framing, reasoning,
building, and evaluation over a polished production system. The candidate's
responsibility is to write a defensible clinical development target, expose its
assumptions, test the V0 against it, and state what the evidence cannot support.

The 50 supplied messages are queued in the physician review instrument. The
checked-in `data/clinician_development_review.csv` is an unattested proposal
used during implementation; it is revealed only after the candidate locks an
independent judgment. It must not be presented as completed physician work.

A case counts as reviewed only when the candidate has:

1. locked an independent disposition and short clinical rationale, with an
   explicit same-day/routine timing choice for async physician review;
2. revealed and assessed the supplied workflow label and V0 route; and
3. completed the case, preserving any post-reveal revision in the audit log.

The 50-case review becomes attributable evidence only after the candidate signs
the in-app attestation and exports the integrity-hashed JSON bundle.
The source cases and labels have already been visible during development.
Hiding comparisons for this review pass reduces immediate anchoring; it does
not turn the cases into a blinded holdout. The digest detects alteration, not
reviewer identity fraud.

The focused form asks for optional uncertainty; evidence, must-not-miss concern,
decision-changing missing information, harm-if-wrong and confidence are optional
additional notes. A short rationale can cover the deciding facts and unknowns
once, without repeating them in five required narrative fields. Blank optional
fields mean not recorded and cannot support negative findings or calibration
claims. Their removal from mandatory entry does not change routing scores for
the same reference answers. New locks/revisions record `focused/v1`; existing
answers and their original field contents are not rewritten.

## Route contract to defend

| Route | Operational meaning | V0 owner |
|---|---|---|
| `SELF_CARE` | A named low-risk pattern is sufficiently specified; only reviewed content may follow | Approved content path |
| `ASYNC_PHYSICIAN` | Prescribing, testing, interpretation, referral, or uncertain clinical judgment is needed | Licensed clinician |
| `SAME_DAY_IN_PERSON` | In-person evaluation is required before day’s end; do not leave the case in the routine async queue | Same-day clinical operations |
| `EMERGENCY_NOW` | Activate the locally appropriate emergency, crisis, obstetric, or emergency-department pathway now | Emergency clinical operations |

Unknown or underspecified messages default to a clinician. A deterministic
safety branch can only increase urgency (shorten permitted time to care). When it fires, the exact route is
locked and a downstream component cannot lower it. Emergency matches outrank
same-day matches independent of rule order. The supplied `URGENT_ESCALATION`
label remains a legacy many-to-one projection only; the full rationale and
sources are in [`ROUTING_TAXONOMY.md`](ROUTING_TAXONOMY.md).

## Take-home evaluation loop

1. Review every supplied message as a physician-engineer with comparison labels
   masked. Record the route and short reason, adding uncertainty/details when useful.
2. Lock the independent judgment, then compare it with the supplied workflow
   and V0 labels. Classify
   disagreements as possible escalation under-triage, possible over-triage, or a
   different defensible path.
3. Turn safety-critical disagreements into executable regression cases.
4. Build the smallest V0 that can satisfy the route contract. Keep disposition
   deterministic; use the Mastra Agent only for a bounded clinician handoff
   after the emergency floor is clear.
5. Evaluate contracts, invariants, red-team behavior, branch failures, trace
   privacy, and the complete Mastra graph.
6. Report development replay separately from clinical performance. The 50/50
   V0 replay proves implementation fit, not generalization.

## Measures for this artifact

Primary agreement and confusion matrices use the locked pre-reveal judgment
on completed cases only. Keep final post-comparison agreement and the count of
revised cases separate: the model output cannot help author its own primary
reference. JSON exports retain both judgments; CSV identifies pre-reveal fields
and primary-evaluation eligibility. Neither reference supports generalization
claims on these previously visible cases.

- physician-review completion and attestation status;
- optional reference-uncertainty count and its recording denominator; flagged
  cases stay in the primary score, and blank is not treated as certainty;
- supplied-label agreement with the completed physician reference;
- count and case-level analysis of possible escalation misses;
- emergency-to-same-day delay count and full four-level confusion matrix;
- emergency and same-day sensitivity/positive predictive value separately;
- count and operational cost of possible over-triage;
- exact V0 agreement with the completed physician reference;
- zero silent downgrade after an emergency signal;
- no inappropriate self-care under injected branch or retrieval failure;
- deterministic parity between the dependency-light mirror and Mastra runtime;
- redacted trace topology and absence of clinical payloads; and
- ablation evidence showing which component carries safety and utility.

Before physician review, the 12 proposal conflicts—including eight hypothesized
escalation misses—are a prioritized queue, not findings. After review, the primary
take-home result is the candidate-authored case record and the safety failures
it confirms or rejects. A plain three-class legacy accuracy score remains unsafe as
the main objective.

## What would justify a clinical performance claim

A later retrospective study needs an untouched, representative, patient- and
episode-independent sample and a frozen labeling manual. Use multi-clinician
overlap where it estimates reference reliability or resolves high-stakes
ambiguity. Report emergency and same-day sensitivity and positive predictive
value separately, plus any-escalation sensitivity and positive predictive value, with
confidence intervals, severity-weighted under-triage, destination and timing
accuracy, abstention, calibration when applicable, subgroup slices, and every
serious false negative.

Adjudication is a method for validating a measurement instrument. It is not a
mandatory workflow for every development case, and it does not scale linearly
with production volume.

## Review at 25 million cases

Run deterministic escalation checks and validated rubric judges on every
thread. Automated coverage is a detection layer, not a substitute for clinician
calibration or an unbiased reference sample. Then use four separate
physician-review streams:

| Stream | Selection | Purpose |
|---|---|---|
| Incident | 100% of severe near misses, urgent overrides, complaints, and safety events | Detect and correct concrete harm mechanisms |
| Estimation | Risk-stratified probability sample across routes, conditions, languages, subgroups, sites, and time | Produce weighted population estimates with intervals |
| Discovery | Disagreement, low confidence, novelty, drift, and clinician override | Find new failure modes efficiently |
| Regression | Frozen sentinels plus every resolved critical failure | Block known regressions on every release |

The physician-review streams must remain analytically distinct. Active-learning samples are
useful for finding errors but cannot estimate prevalence without known sampling
probabilities and appropriate weighting.

Use two or more clinicians only on a calibration subset and on ambiguous or
high-severity cases where disagreement changes the reference. Track agreement
by case type and periodically re-check drift in the rubric. The goal is not
consensus for its own sake; it is a reliable evaluation process that directs
scarce clinical attention to decisions that matter.

## Release ladder

| Gate | Evidence | Permitted claim |
|---|---|---|
| Software verification | schemas, invariant tests, fault injection, trace checks | implementation behaves as specified |
| Physician development review | 50 completed, attested synthetic cases with locked pre-reveal originals and comparison records | the candidate can define and defend V0 behavior |
| Untouched retrospective sample | frozen protocol, representative sampling, calibrated reference process | performance on that sampled population |
| Prospective shadow mode | live-distribution disagreement, completion time, drift, human factors | operational performance without autonomous action |
| Controlled release | governance approval, monitoring, rollback, incident drills | only the approved intended use |

No gate inherits a stronger claim from the one above it.
