# Resolve the request, not only the diagnosis

Status: isolated, unpromoted prompt experiment. Frozen after the completed
generated-context comparison and ledger reconciliation, before paid calls.
No live prompt or GUI change is included.

Replace one existing task-ownership paragraph, preserving the complete output,
transport, source and uncertainty contracts. No new agent, schema, classifier,
lookup table or automatic escalation rule. The proposal separates:

1. The patient's actual request and whether supported guidance can satisfy it.
2. Necessary clinician work that remains after the router's permitted guidance.
3. Urgency and required physical capabilities, assessed separately.

This is a project service-policy interpretation, not a clinical guideline that
every OTC question needs a doctor. General label education can be self-care;
individualized decisions outside the router's scope remain clinician work. More
history being possible is not itself a task, and missing history is neither a
contraindication nor an indication for emergency care.

The distinction matters: [NHS allergic-rhinitis advice](https://www.nhs.uk/conditions/allergic-rhinitis/)
supports self-treatment and pharmacist assistance. A standard-async preference
for individualized medication selection must be attributed to service ownership,
not falsely presented as medical urgency. Conversely, [NHLBI insomnia guidance](https://www.nhlbi.nih.gov/health/insomnia/diagnosis)
supports clinician discussion when sleep loss affects daily activities; a likely
benign explanation does not necessarily satisfy that assessment need.

Guideline eligibility must also remain explicit. [CDC pediatric guidance](https://www.cdc.gov/antibiotic-use/hcp/clinical-care/pediatric-outpatient.html)
ties acute otitis media diagnosis to ear findings; its selected watchful-waiting
recommendation does not establish those findings in an unexamined child.
Sources checked 2026-09-15. These links inform the proposal and are not injected
as answer-specific evidence or counted as source coverage.

## Planned test, not a claim of benefit

Use fresh paired calls with the same original messages, model, output contract,
retrieved passages and generated-context policy in both arms. Change only the
necessary-task paragraph. Freeze the exact design after the current experiment
and reconcile remaining spend before dispatch. No reference labels enter input.

Record exact physician agreement separately from clinical defensibility; C25
remains null. Preserve under/over direction, early-care conflicts, serialization
failures, response-gate replay, latency and cost. An improvement limited to OTC
queue labels is not a demonstrated clinical-safety improvement. No promotion
from reduced latency or conditional agreement alone.

Counterexamples must include general information, expected limited symptom
evolution, personalized medication questions, time-sensitive treatment access,
and already-required physical/emergency care. These are development challenges,
not independent physician gold. A policy that routes every uncertain message to
async has failed the simplification goal even if some cohort labels improve.

## Adversarial scope review before calls

The reviewer identified a loophole in “not equipped”: a model could invent a
narrow capability boundary. The revised paragraph defines permitted guidance
(supported general OTC options, label education, explanation of a supplied plan
without changes) and excludes actual prescription authorization, orders and
examination-dependent diagnosis. Personal wording and optional missing history
do not themselves create a clinician task.

Eight negative-control requirements constrain interpretation; they are not
physician route labels or a new deterministic clinical rule:

- Personal pronouns or the word “safe” alone must not create clinician work.
- Optional missing history immaterial to limited guidance must not force async.
- Restating an existing plan is not authorizing a new prescription.
- Expected limited evolution is not priority merely because “spreading” appears.
- A source mentioning a possible prescription or examination does not make it necessary now.
- Missing examination-based eligibility is neither established clearance nor blanket escalation.
- Requested treatment does not establish its indication, urgency or an accepted order.
- Adding a medication question cannot hide an already-established emergency need.

This proposal was developed after inspecting disagreements. Improved results
would be development alignment, not an independent test of generalization.

## Frozen execution

All 50 original messages, two fresh calls each. Both slots retain the original
generated context, full output schema/instructions and exact source packet.
Only the task-ownership paragraph differs. Legacy slot names `full`/`brief`
mean baseline/explicit ownership here; both contracts are full. No judge, repair,
retry or retrieval change. Every prior care conflict remains an independent
constraint, not input to steer the producer. All 100 planned slots remain in
the report, including a budget-limited unattempted slot if one occurs.

Plan: `outputs/task-ownership-ablation-2026-09-15/plan.json`.
Fingerprint: `1d36bed4143ab184a1e09beceb7632bee4d29af92522112a34d93eed2f17995f`.
Prior accounting/reservations total **$52.372861**; remaining **$37.627139** of
the same **$90** authorization. No concurrent paid phase. The runner reserves
both arms before each pair and settles known usage conservatively; unknown
usage keeps the full reservation. Planned completion depends on actual usage,
not permission to exceed the ceiling. No new funding or limit is inferred.

```sh
node --experimental-strip-types scripts/routing-brief-study.ts run outputs/task-ownership-ablation-2026-09-15 1d36bed4143ab184a1e09beceb7632bee4d29af92522112a34d93eed2f17995f
node --experimental-strip-types scripts/routing-brief-study.ts score outputs/task-ownership-ablation-2026-09-15 report-NEW.json
node --experimental-strip-types --test tests/routing-brief-study.test.ts tests/task-ownership-ablation.test.ts
```

Completed provider work is preserved even if the local evaluator throws; the
same safe evaluation wrapper is used when resuming a retained result. Neither
path reissues an already-started model call or grants clinical eligibility to
a scoring failure. These are reliability checks, not clinical validation.
