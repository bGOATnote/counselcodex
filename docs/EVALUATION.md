# How the right answer is defined and the system is scored

Current candidate contract · 14 September 2026 · `evidence-graph/v23`.
Historical experiments and physician work are unchanged. The incumbent and
candidate are different workflows; this page describes the candidate unless
explicitly marked historical.

## The evaluation unit

Grade the **issued interaction**: patient information available at that moment,
early advice/questions, final action and reply, supporting passages, and
subsequent queue/handoff state. A correct route with a harmful explanation is
not success. A relevant question does not necessarily justify delaying routing.
A stored referral or follow-up plan does not establish delivered care.

The [versioned policy](../src/disposition/routing-policy.ts) defines five routes:
self care, priority async, standard async, emergency now, and in-person today.
Async priority is part of the scored action. Both async routes target prompt
same-day service-hours review by the Counsel clinical team; this prototype
cannot verify availability or guarantee an ETA. Refills are a work type.

## Reference authority

| Record | Role | Limitation |
| --- | --- | --- |
| Original 50 messages and labels | Input/current-state audit | Supplied label is not clinical truth |
| Explicit project policy and authored controls | Development reference | Design assertions, not physician adjudication |
| Completed clinician review with locked pre-reveal judgment | Attributable development reference after valid export/attestation | Previously seen cases are not a holdout |
| Physician-engineer review statement plus frozen incumbent run reconstruction | Attributable unblinded development reference | Reconstructed run selection is explicit; no new criterion-level grades or independent accuracy are invented |
| Independent model judgment | Error detection in the exact response | Cannot author its own reference or approve care |
| Untouched external sample with validated references | Generalization study | Only establishes performance for the evaluated scope |

A reference records available facts, unknowns, accepted route(s), action/timing,
a short rationale, policy/source versions and authorship. Allow several defensible
routes. Do not impute demographics, normal vitals or absent red flags.
For blocking clarification, assess both plausible answer branches and why
clinician review cannot proceed while collecting the answer.

The assignment can be completed by the solo clinician-engineer; a third clinician
is not required. Later, independent overlap can estimate reference reliability
and resolve high-risk ambiguity. Model consensus cannot replace that measurement.
The physician-engineer explicitly reported reviewing **all 50 incumbent
dispositions and responses: agreement on 49, with C25 a qualified concern about
over-escalation that could be argued both ways**. That judgment is accepted;
another adjudication form is not required. The
[source statement](PHYSICIAN_REVIEW_SCORECARD_2026-09-13.md) and
[frozen reference](../data/evaluation/physician-system-reference-v2.json)
record its scope. The reference reconstructs the latest issued incumbent care
before the physician's designation, with its selection rule and exact records.
It does not turn later candidate runs into reviewed incumbent answers.

There are 49 route-scoreable originals and one qualified C25, which remains in
the 50-case completion denominator. C03's older coarse async reference does not
invent a priority judgment: either async priority is accepted, and the limited
resolution remains explicit. Criterion-level clinical grades and blinded
independent validation were not supplied and are not fabricated.

## Each component must earn its place

| Component | Intended benefit | Comparison or validation needed |
| --- | --- | --- |
| Independent Haiku safety | Early emergency action | Misses AND false activations; subject/time/negation and active-EMS counterexamples |
| Parallel Haiku context | Decision-relevant facts, queries and at most one nonblocking question | Same-input no-context comparison; question burden, grounding and latency |
| Retrieval | Applicable support | Frozen evidence vs none; missing/conflicting sources, wrong population and unsupported inference |
| Opus finalizer | Coherent action and explanation | Five-route errors plus complete-response clinical criteria, failures and latency |
| Blocking whole-answer Astra review | Detect material defects before releasing the final answer | Seeded and naturally occurring defects; false acceptance, false alarms, abstention, necessity of repair and delay |
| One field-local Opus repair plus fresh Astra review | Correct a specific defect without introducing another | Same frozen draft/passages; corrections helped/harmed, complete-answer acceptance, cost and delay |
| Issued-care reconciliation | Explicitly correct an early/final disagreement | Exact patient/producer/reviewer binding; early false-alert burden and corrective action, not a hidden overwrite |
| Queue/follow-up integration stub | Explicit destination and async priority | Production acceptance/delivery remain outside the assignment; do not count a stub as delivered care |

The current reviewer is **one model call applying seven criteria**, not seven
independent judges. It runs **before final release**, while separately auditing
early instructions and any issued question. An early error has already reached
the interface; final acceptance cannot erase it. Repair is followed by a fresh
whole-answer review. Technical failure does not become clinical approval or an
invented emergency. Full-episode grading and real delivery remain separate needs.

The incumbent's optional/background reviewer is not this candidate's release
path. See the [actual pipeline](CURRENT_PIPELINE.md).

## Current 50-case measurement

The [cohort scorer](../src/evaluation/physician-cohort.ts) binds each attempt to
its patient and candidate fingerprint, retains all 50 planned cases, and reports
route agreement separately from completion, issued emergency actions, model
review, source bindings and latency. A difference may be a defensible alternative;
it is not automatically a clinical error. Online review acceptance is a process
metric, not a substitute reference.

The [fresh cohort harness](../scripts/candidate-cohort-study.ts) additionally
compares the **first paid producer attempt** with the released final response.
A failed first attempt is not replaced by a successful recovery. Its paired
diagnostics distinguish changed routes and withheld matching drafts; neither
alone proves the judge helped or harmed clinically. The scorer's older
`draftAgreement` field describes a retained rejected/latest draft, not necessarily
the first producer, and must not be used for this component comparison.

The current [sprint protocol](CLINICAL_LIFT_SPRINT_2026-09-14.md) freezes inputs,
configuration, effective provider settings, corpus and compiled server before
paid dispatch. HTTP verification uses the GUI decoder but is not browser testing.

## Historical scorer and experiments

- Grade disposition plus priority. Older coarse references stay explicitly
  coarse; missing priority earns no five-route credit.
- Separate final-route match from consistency with every issued escalation.
  A wrong early emergency is not erased by a correct final async answer.
- Bind records to input, manifest and hashes. Reject duplicate attempts,
  conflicting reference routes, mixed mock/provider reports and mismatched inputs.
- With a manifest, include every planned case/arm/trial slot, including missing
  files. Missing work is not fast success. Without a manifest, coverage is
  explicitly unverified.
- Keep development and declared clinician-reference metrics separate.
  Self-declared status alone does not verify identity or attestation.
- Suppress independence-based intervals for repetitions, duplicate inputs and
  declared case families. Patient/episode variants must be grouped before a split;
  the harness cannot reliably discover unmarked paraphrases.
- Report emergency actions, false escalation, incomplete work, latency and tokens
  separately. Tokens are not an invoice; questions are not actionable answers.

The [historical four-arm harness](../src/evaluation/disposition-experiment.ts)
compares incumbent workflows. Resampled planners/drafts and critique's frozen
retrieval confound isolated component attribution. No clinical lift is inferred.
For a final-model comparison, freeze patient input, passages, contract, sampling
and grader; evaluate complete live retrieval separately.

## Historical results and reproduction

[Current physician review](PHYSICIAN_REVIEW_SCORECARD_2026-09-13.md) records the
subsequent full-50 review and remaining escalation-coupling concern.
The [earlier audit](research/EVALUATION_AUDIT_2026-09-13.md)
links the exact judge controls and historical all-attempt scorecard.
The three routing-policy controls are **post-hoc development assertions**,
not prospective or physician-validated references. Other inputs remain unscored
by that historical automated report; this is separate from the current
physician's stated review of all 50.

These commands inspect the earlier incumbent studies, not the current candidate:

```bash
npm run review:judge-test              # no provider calls
npm run review:judge-pilot             # freeze current packets; no calls
npm run review:judge-pilot -- --live    # unchanged bounded ledger
npm run evaluation:scorecard -- outputs/gui-rehearsal-2026-09-12/1789245919577.json outputs/new-scorecard.json
npm run disposition:experiment -- plan cases.jsonl outputs/new-study
```

Judge control identity binds instructions, model and exact patient/response/source
units. A changed rubric cannot reuse an old grade. Report defect detection,
false acceptance, false alarms, abstention and missing results by criterion.
Easy mutation controls should saturate; that is not clinical accuracy.

## External evaluation and release

Counsel's [HealthBench method](https://www.counselhealth.com/blog/how-counsel-leveraged-healthbench-to-assess-emergency-escalation)
filters to 103 English, nonconditional, first-person cases. Exact IDs are not
published. Our [reconstruction](HEALTHBENCH_EMERGENCY_EVALUATION.md) has different
intermediate filter counts and is not an exact replication. Its September 7
results and historical live adapter evaluate older workflows, not the current
candidate. The [benchmark study design](research/CLINICAL_BENEFIT_STUDY.md)
also records its adapter's 24 unsupported multi-turn cases; no complete current
103-case candidate score is established. Keep conditional, second-hand, pediatric and multi-turn stress tracks
separate; never silently impute the article's assumed demographics.

Release review requires frozen references/exclusions, positive and negative cases
per relevant subgroup, whole-issued-response grading, calibrated judge error
estimates, no unresolved critical regressions, measured latency/failure rates,
and verified operational ownership/availability/follow-through. Prespecify
thresholds with the clinical owner before seeing results. A small synthetic
suite cannot prove zero harm.

At scale, run automated checks across threads, with distinct physician streams
for incidents, probability-sampled estimation, and disagreement-driven discovery.
Do not estimate prevalence from the disagreement queue.
