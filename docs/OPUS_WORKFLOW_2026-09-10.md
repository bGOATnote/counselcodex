# Opus workflow: one patient answer, three purposeful assessments

## What changed

The active GUI removes the fictional-data checkbox, repeated provider/storage
disclaimer and call-budget paragraph. The fictional assignment scope remains
unchanged. One short prototype footer remains; execution metadata is expandable.

All active agents use `anthropic/claude-opus-5`. The account's read-only Models
API returned that exact ID on 2026-09-10. No Sonnet fallback is configured.
[Anthropic's model reference](https://platform.claude.com/docs/en/models/overview)
lists Opus 5 at $5/input MTok and $25/output MTok; these are not measured invoices.

The Mastra graph is:

1. Screen for an immediate instruction and retrieve relevant guidance.
2. Run history assessment and emergency supervision **in parallel**, independently
   on the original message. No supplied label or other agent's output enters either.
3. Generate one disposition and patient reply from the original message, both
   assessments, the urgency floor and retrieved guidance. Validate that answer.

This separation draws from the [Counsel Mastra case study](https://mastra.ai/customers/counsel-health),
which describes history-taking with parallel emergency supervision. It does not
establish that multiple distinct model families must be used per interaction.
Our three agents share Opus; correlated mistakes remain possible. The supervisor
is part of answer generation, not an independent efficacy grader.

## Immediate action and model explanation both happen

A known emergency emits an NDJSON `safety_notice` before any model call. There is
no emergency bypass. The independent emergency agent can also emit a notice for
an emergency the initial rules missed. The final model still explains the red
flags and proposes a disposition, with source-linked claims.

The [AHA warning-sign guidance](https://www.heart.org/en/health-topics/heart-attack/warning-signs-of-a-heart-attack)
supports calling 911 for suspected heart attack and explains that EMS can begin
treatment before hospital arrival. That reason is included in retrieved context.
No personal-risk percentage is manufactured to persuade the patient. The current
source corpus contains no quantitative risk estimates. The AHA page was readable
through web retrieval; prior direct HTTP checks were blocked with 403. We do not
claim every automated link checker can fetch it.

Emergency notices are provisional **instructions**, not completed model answers.
Neither a model failure nor a rejected explanation removes the instruction.
If an initial instruction calls for immediate EMS, final prose cannot replace it
with conditional private travel. A client disconnect stops streaming delivery,
not the bounded assessment or local audit. Receipt of streamed text is not proof
the patient acted or that a handoff occurred.

## Execution evidence and failures

Development cases C02, C04 and C01 were fixed before running this version; they
are not a held-out cohort and not HealthBench. Immutable local artifacts live
under `apps/evaluation/.local/disposition-agent-v2/`.

First pilot, `2026-09-10T19-30-14.331Z.json`:

- All three agent workflows failed an internal history-length check. The model
  produced grounded histories with more than eight findings; that display-oriented
  limit should not have prevented synthesis. Each attempted two model calls.
- C02's immediate instruction survived; it was correctly marked incomplete.
- The histories and errors were retained. The internal limit was replaced with
  a payload bound; patient-facing output retains its separate concise contract.

Second pilot, `2026-09-10T19-32-33.646Z.json`:

| Case | Disposition | Model calls | Full workflow time |
|---|---|---:|---:|
| C02 | Emergency now | 3 | 25.055 s |
| C04 | In person today | 3 | 26.727 s |
| C01 | Self-care | 3 | 22.222 s |

C02's initial notice was emitted at 11 ms, its emergency-agent notice at 5.477 s.
All three runs retained traces and exact input/output artifacts. These times are
one local execution, not latency percentiles or an availability guarantee.

Manual inspection still found defects despite the routes matching development
expectations: C04 asked whether the patient could feel bone in the wound; C02
added unnecessary collapse advice and extended a pleuritic review beyond its
population; C01 used overconfident home-care wording and had no retrieved source.
These are **not** three clinically perfect responses. The prompt was tightened,
patient-directed wound probing received a regression check, and source coverage
remains explicitly failed for C01. No earlier result was overwritten.

The first real HTTP smoke (`088d1db9-3a2f-43e6-80fa-4dc444150e31`)
then exposed a false rejection: an EMS check did not accept the parenthetical
local-number wording in an otherwise immediate 911 instruction. The test now
accepts that wording while rejecting activation conditional on worsening.
That failed run remains stored, not reclassified.

The final HTTP verification used the same endpoint as the GUI:

| Case | Run ID | Result | Full run |
|---|---|---|---:|
| C02 | `99f30eb8-252c-4565-946c-54e9aceffa1a` | Emergency; 3 model calls | 20.432 s |
| C04 | `cca1dc10-476c-46bf-84d2-41a7599a3cb5` | Same-day examination; 3 calls | 26.567 s |
| C01 | `e077db6c-8400-4ac8-9a65-4a43405176db` | Self-care; 3 calls; research coverage failed | 26.261 s |

C02's notice reached the HTTP client in 48 ms (7 ms inside the workflow), and
its final Opus answer retained immediate 911 activation and an EMS explanation.
All three responses and traces were saved. No screenshot or browser-click test
was performed. The HTTP check exercises streaming delivery, not patient receipt.

Remaining clinical review issues include C01's overlapping drooling/saliva
return precautions (same-day versus emergency), and C04's emergency advice for
purulence without further severity qualifiers. Source applicability and the
whole response still require grading; passing contract checks does not resolve
these clinical questions. The last source change separates rejected-answer
checks from fallback-answer checks so a displayed fallback is not scored as if
it were the rejected model explanation; that path is deterministically tested.

Across these ten Opus development attempts: 27 model calls, 55,500 input and
18,493 output tokens reported; approximately $0.74 at standard uncached rates,
not a provider invoice. Ten whole-run reservations total $7.50 under the $9 cap.
No further paid runs were made after this verification.

## Verification boundaries

Deterministic tests exercise parallel-agent isolation, early notice ordering,
three-call accounting, persistent budget exhaustion, emergency preservation on
malformed/failed output, EMS-action consistency, source/quote checks, response
hashes and trace persistence. Streaming tests cover split UTF-8, cancellation,
truncation, input mismatch, duplicate results and local-origin admission.

Clinical accuracy and citation entailment remain `not_assessed`; empty research
coverage is a failure, not a pass. More agents and a stronger model are hypotheses
for improvement. Paired, independently graded, frozen-case evaluation is still
needed to demonstrate lift. Historical Sonnet/HealthBench scores do not transfer.

## Bounded operation

This version allocates an additional $9 maximum, in twelve immutable $0.75
whole-workflow reservations. Each permits three calls. There are no automatic
retries, tools or fast mode; prompt/instruction/schema payloads and output tokens
are bounded. Failed runs retain reservations. Earlier Sonnet and CQA budgets
are untouched. This is not a reset of the user's overall $100 ceiling.

The primary screen intentionally omits these mechanics. Actual per-agent token
usage, failures, timestamps, prompt/corpus hashes, run IDs and trace IDs remain
in the audit artifacts. These controls are not HIPAA, billing or deployment
certification. No real patient data or external care action is involved.
