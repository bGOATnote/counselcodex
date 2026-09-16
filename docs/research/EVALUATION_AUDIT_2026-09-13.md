# Evaluation audit: reference answers, agents and measured system performance

13 September 2026 · evaluation-only change from `9e29e72`.

## Outcome

The evaluation was not strong enough to justify a clinical-accuracy headline.
In particular, a coarse async label hid priority errors, a correct final route
could obscure an incorrect early escalation, and fixed judge-control identities
could retrieve grades from an older rubric. These are measurement defects, not
reasons to add another generation agent. They are corrected in this iteration.

No generation prompt, clinical routing rule, provider, GUI or saved physician
answer was changed. Existing GUI attempts were audited; this was not a new
browser rehearsal or a new clinical generation experiment. The completed work
is a stronger executable measurement layer, not evidence that the underlying
agent has become clinically better.

## Questions rigorous engineering review should ask

These are our proposed review questions, informed by published methods—not
claims about the private preferences or systems of individual companies.

| Question | Published basis | Applied here |
| --- | --- | --- |
| Are we evaluating the complete system and all attempts, rather than a plausible final answer? | [Anthropic's agent-evaluation guidance](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) describes harnesses, trajectories and complementary graders. | Preserve early emissions, failed work and missing planned trials; do not erase early errors with a later correction. |
| Is the reference task-specific, and has the evaluator itself been checked? | [OpenAI's evaluation guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices) emphasizes task-specific tests, logging and human calibration. | Separate source labels, project assertions, physician references and model judgments; add positive/negative judge controls. |
| Does the conversation help the decision, not merely produce a diagnosis? | [Google's AMIE work](https://research.google/blog/amie-a-research-ai-system-for-diagnostic-medical-reasoning-and-conversations/) uses multidimensional evaluation of diagnostic conversations with clinicians and patient actors. | Evaluate delay necessity, patient-grounding, action, timing, precautions and evidence separately. This is not an AMIE replication. |
| Does a component improve the same task enough to pay for its cost and delay? | [NVIDIA's SkillEvaluator methodology](https://developer.nvidia.com/blog/evaluating-ai-agent-skill-performance-with-nvidia-skillevaluator/) compares the same tasks with and without a skill. | Label the current four-arm runs whole-workflow comparisons; do not attribute improvements to retrieval or critique while planners/drafts also change. NVIDIA's study is nonclinical. |
| Does a medical judge agree with a defensible clinical reference, including low-quality cases? | [Counsel's published judge framework](https://www.counselhealth.com/ai-report/llm-as-a-judge) uses clinician-defined, targeted criteria and reports comparison with physician review. | Test known judge failures now; retain physician calibration as a distinct, uncompleted measurement. Seven criteria in one call are not seven independent judges. |

Counsel reports URI judge accuracy of 96.59% on 230 threads and sinusitis accuracy
of 81.52% on 92, with kappas of 0.557 and 0.551 respectively. Those figures do not
translate into this disposition system's accuracy, and high agreement on easy
controls is not comparable to their clinical evaluation. [Reported results](https://www.counselhealth.com/ai-report/llm-as-a-judge).

## What counts as the right answer

The primary object is the issued care recommendation: setting, priority, action,
timing, ownership and words actually emitted given the information then available.
An unmeasured vital is unknown, not normal. An optional diagnostic question is
not permission to block appropriate clinician review. An emergency directive
does not establish that care was received.

[EVALUATION.md](../EVALUATION.md) is now the current reference/scoring contract.
It maps every active component to its intended benefit and the comparison needed
to justify keeping it. The five operational routes use the versioned queue
policy, including priority versus standard async. Both async paths target
prompt same-day service-hours review; actual service availability is unverified.

Three exact-input [development controls](../../data/evaluation/routing-policy-controls-v1.jsonl)
were explicitly authored after seeing these cases: C02 emergency now, C46 standard
async and C50 priority async. They are not a clinical gold set, a holdout, or a
new physician adjudication. They do not enter inference. Other inputs remain
unreferenced rather than acquiring labels from the evaluated agent.

C02's chest-pressure/arm-radiation/diaphoresis presentation supports immediate
emergency action; [AHA warning-sign guidance](https://www.heart.org/en/health-topics/heart-attack/warning-signs-of-a-heart-attack)
supports calling 911 without waiting for diagnostic certainty. C46 and C50's
relative internal queue priorities are project clinical/operational judgments,
not claims that a guideline mandates those queues. The narrow NICE migraine
excerpt in judge controls supports an acute-treatment option—not remote
prescribing eligibility, physical attendance or an SLA. Its direct page returned
403 in this session; official indexed recommendation text was available. Link
reachability is not source entailment or independent clinical verification.

The latest inspected local physician backup contains two completed reviews and
no attestation. Browser-only work may be newer. This is a metadata inventory,
not a judgment about the clinician's work or identity. Those historical answers
cannot calibrate judgments of a different, current generated response.

## Implemented and regression-tested corrections

1. **Five-route scoring:** disposition plus async priority; null priority earns
   no operational-route credit. Set-valued references are preserved. Older coarse
   references remain explicitly coarse.
2. **Early/final consistency:** an incorrect early emergency or in-person action
   remains an error even when the final label matches. Separate route-only and
   route-plus-issued-escalation metrics expose this distinction.
3. **Attempt accounting:** manifest-bound summaries include missing case/arm/trial
   slots; validate input and record hashes; reject duplicates and mixed simulated/
   provider records. Missing work cannot improve latency or outcome rates.
4. **Dependent samples:** declared episode families, identical inputs and repeated
   trials do not receive independent-case Wilson intervals. Unmarked paraphrases
   still need review/grouping; hashes cannot identify them reliably.
5. **Judge controls:** rubric/model/patient/answer/source-bound identities avoid
   stale fixed-UUID results. Positive/negative controls cover all seven criteria.
   Missing and abstained judgments retain their denominators.
6. **Read-only scorecard:** verify selected raw artifacts and current judge
   bindings, retain unfinished event logs, separate workflow versions, and report
   reference/attestation availability. No raw physician text is exported. Release
   status in this report is an audit conclusion, not a new runtime deployment gate.

## Measurements

### Current judge: known-defect detection, not clinical accuracy

[Frozen packets and expected target criteria](../../outputs/response-review-pilot-1789273319276/manifest.json)
and [all results](../../outputs/response-review-pilot-1789273319276/summary.json):

- Ten planted target-criterion defects detected; eight target-criterion controls
  accepted. No target false acceptance, false alarm, abstention or unfinished job.
- Controls include emergency misses, unnecessary escalation, an erroneous early
  action, patient injection, invented vitals, inappropriate source population/dose,
  unsupported source-attributed timing, and manufactured clarification delay.
- Each reported result concerns its **prespecified target criterion**, not an
  assertion that the entire control response passed all clinical dimensions.
- These mostly related migraine mutations overlap examples already in the rubric.
  They should be easy. Saturation demonstrates known-defect coverage, not
  independent clinical generalization, reference reliability or zero harm.
- Eighteen new judge calls in this iteration cost an estimated **$1.43898**.
  The first twelve-call report was reused in the expanded report; adding the two
  report totals would double-count those twelve calls. No generation comparison
  was purchased. The separate unchanged $20 review ledger reports $7.7258375
  allocated after conservative reconciliation, including prior work/uncertainty.
  These figures are usage/allocation estimates, not provider invoices.

### Actual GUI attempts: no hidden failures or mixed-version accuracy

The [scorecard v3](../../outputs/assignment-evaluation-2026-09-13/scorecard-v3.json)
audits all 15 attempts listed in the existing September 12 rehearsal manifest.
It verifies local original hashes rather than regenerating responses. There are
ten complete, three unavailable and two awaiting-input artifacts; no orphaned
attempts in that selected window. This is a debugging cohort, not a representative
or prospective clinical study. “Complete” means software completion, not safety.

| Workflow | Complete / attempts | Judge concerns / attempts | Policy-control success / referenced attempts | Median end time |
| --- | ---: | ---: | ---: | ---: |
| v33 | 1 / 3 | 3 / 3 | 0 / 1 | 56.47 s |
| v34 | 1 / 2 | 1 / 2 | 1 / 1 | 30.49 s |
| v35 | 4 / 5 | 4 / 5 | 1 / 1 | 27.68 s |
| v36 | 2 / 3 | 1 / 3 | 1 / 1 | 21.20 s |
| v37 | 2 / 2 | 1 / 2 | No reference | 39.40 s |

Five of the 15 had no judge flags, ten had concerns. These are model findings,
not physician-adjudicated error rates. All 15 had a completed, current-rubric
review. Unreferenced inputs are excluded from policy-match calculations, not
counted as correct. The post-hoc controls do not establish comparative performance.

The latest v37 attempts in this cohort finished in **24.41 and 54.38 seconds**.
They concern the hand-symptom case and update; one retained a return-precaution
judge concern. Neither has a qualified independent reference here. Consequently
**current clinical accuracy and component lift are unestablished**, not 100%.
These runs are too few/dependent to estimate production tails or causal improvement.

Scorecard v1 is retained with its original lower-middle even-sample percentile
implementation. V2 corrected the median; v3 adds missing-judge/orphan artifact
validation and overall missing-attempt accounting. Use v3. No original source
result was overwritten to make these corrections.

## Remaining work, in value order

1. Obtain attributable route/rationale references and clinician feedback on exact
   judge findings. The solo physician can author development targets; reserve
   independent overlap for reliability/ambiguity rather than inventing a third
   reviewer or stopping engineering until one exists.
2. Freeze a prospective, episode-separated sample and criteria before running it.
   Include common low-acuity care and same-day needs as well as emergencies;
   report over-escalation and unresolved work, not just emergency sensitivity.
3. Add an adapter for the **current adaptive workflow** to the external emergency
   protocol. The existing HealthBench adapter/results concern older workflows.
   Counsel's published 453 → 433 → 261 → 103 filtering excludes non-English,
   conditional and second-hand cases; exact IDs are unpublished. Our reconstruction
   has different intermediate counts. Keep excluded contexts in a separate stress
   track and do not import their assumed healthy 35-year-old male into these cases.
   [Counsel's method](https://www.counselhealth.com/blog/how-counsel-leveraged-healthbench-to-assess-emergency-escalation).
4. Isolate component effects: same input and final model with/without intake;
   frozen passages with/without retrieval context; **same draft** with/without
   critique. Compare complete live-search workflows separately. Record extra
   questions, changed decisions, emergency misses, false escalation, claim support,
   unfinished work, action time, total latency and cost. No component earns its
   place merely by being called an agent.
5. Extend grading to complete episodes and downstream queue transitions. The
   existing reviewer evaluates one run plus its early emissions, not all prior
   assistant turns, delivered patient messages, actual acceptance or completed
   follow-up. The queue remains a local operational simulation.

The next priority is reference calibration and these controlled comparisons,
not a new model leaderboard, vector database or more agent names. New generation
changes must be retested through the actual GUI before another GUI handoff.

## Reproduce

```bash
npm run review:judge-test
npm run evaluation:scorecard -- outputs/gui-rehearsal-2026-09-12/1789245919577.json outputs/new-scorecard.json
npm run disposition:experiment -- plan data/evaluation/routing-policy-controls-v1.jsonl outputs/new-policy-control-plan
npm run review:judge-pilot              # current frozen packets, no paid calls
npm run review:judge-pilot -- --live     # bounded review ledger; preserves prior attempts
```

The local scorecard requires the retained raw GUI artifacts and review database;
these are deliberately not published. Checked-in hashes/metadata support review,
not full public replay of private local state. Control packets and verdicts are
available in the repository. No claim of public, byte-identical provider reruns.

Verification: 309 root software tests and 122 GUI/queue tests (431 total),
TypeScript checking, the repository JavaScript syntax checker, Next production
build and Mastra production build passed. The initial Mastra dependency install
stalled under network restrictions; the verified task-only process was stopped
and the network-enabled build completed. No patient-facing browser test is
claimed for this evaluation-only patch.

The original assignment CSV SHA-256 remains
`d17771ed706c6866d2b13f2d7f5344824acf51aaf281b8af6368637586d71a15`.
Historical attempts, source passages and saved reviews were not edited.
Software verification does not establish clinical readiness.
