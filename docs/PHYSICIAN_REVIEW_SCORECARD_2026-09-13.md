# Current physician review and remaining routing concern

13 September 2026 · Recorded from the physician-engineer's explicit project
conversation statement. [Structured record](../data/evaluation/physician-development-review-2026-09-13.json).

## Physician review of the current system

| Review outcome | Cases |
| --- | ---: |
| Reviewed current dispositions and responses | 50/50 |
| Agreement without the stated DVT qualification | 49/50 (98%) |
| Qualified disagreement: C25, possible DVT over-escalation | 1/50 (2%) |

The physician explicitly considers C25 arguable both ways. It is **not** recorded
as an unequivocal clinical error or automatically relabeled to priority async.
The physician has not supplied an exhaustive accepted-route set for that case.

This is substantive clinical development review. It supersedes the previous
current-status claim that only two cases had been reviewed, which was based on
older form backups. Those backups remain unchanged. A second form submission
is not required to recognize this explicit review statement.

The reviewer helped design and iterate the system and then reviewed all 50.
Therefore the presentation claim is **49/50 physician-engineer agreement, with
one qualified DVT disagreement**, not 98% independently established clinical
accuracy. No emergency-miss rate, criterion-level evidence grade, or Haiku/Opus
component benefit can be calculated from this aggregate statement alone.

Code observed at recording: `1f5f702446ca25301cad62148cac0fd354e07449`,
`adaptive-disposition/v41`, `five-route-queue/v2`. The original dataset hash is
in the structured record. Exact reviewed response IDs were not enumerated;
we have not silently selected the latest run for each case and declared it
reviewed. The record is an evaluation artifact, never a runtime answer lookup.

## Confirmed architecture problem

The fast response remains valuable. The clinician-engineer explicitly rejects
Opus-only latency as the intended user experience. The issue is **how an early
judgment becomes authority**, not simply how many models are used.

In the active workflow:

1. The deterministic screen can issue an immediate emergency notice.
2. Haiku can issue emergency or same-day advice after a quoted-fragment check.
3. That early advice becomes `state.floor`. Opus receives the intake plan,
   `emergencyFloor`, and `requiredAction`, and is instructed to preserve them.
4. The final answer fails validation if its route is below that floor.

Evidence: [active workflow](../src/disposition/adaptive.ts),
[floor validation](../src/disposition/contract.ts), and
[initial screen](../src/disposition/workflow.ts).
Exact quotation establishes that words occurred, not that they justify the
route. The code's instruction to assess intake independently conflicts with
its mandatory preservation of the intake route. Final agreement is consequently
**not independent confirmation** of an early escalation. There is no evidence
here establishing what an unconditioned Opus would have chosen.

For C25 specifically, the deterministic DVT rule specifies same-day in-person
assessment. In inspected saved run `c7609d37-2dd0-468e-9cb0-1979c2fa54e6`, Haiku
selected `ED_NOW`, issued at 3.821 seconds; the completed answer arrived at
14.754 seconds. That emergency floor was model-generated, not a 0.01-second
keyword-triggered emergency. This inspected run explains the mechanism; it is
not asserted to be the exact run the physician reviewed.

## Next correction: keep speed, separate judgment from prior advice

- Keep fast intake and timely emergency communication. Removing them is not
  the default response to this concern.
- Have the final assessor formulate its clinical judgment from original patient
  information and supporting evidence, without supplying a prior route as a
  mandatory answer. Assistant questions and model-inferred findings must not
  become patient facts.
- Separately reconcile that judgment with already-issued advice. Record the
  origin, supporting facts, disagreement and reason for any revision. Neither
  “highest route always wins” nor “Opus always wins” is adequate adjudication.
- A clinically significant disagreement must not silently replace an emergency
  instruction with reassurance. A proposed reduction needs an explicit,
  testable resolution policy; unresolved conflicts remain visible for clinician
  review. Missing service capacity must not be replaced with a promised pathway.
- Test both false activations and missed emergencies, including negation,
  historical/third-person mentions, follow-up corrections and the DVT boundary.
  Score early advice as well as the final answer. Use a limited matched ablation
  to measure intake's benefit; an Opus-only arm is a comparator, not a proposed
  replacement for the clinician-approved user experience.

This turn records the physician review and diagnoses the coupling. It does not
change clinical routing, retrofit old grades, or claim this reconciliation
policy has already been implemented or validated.
