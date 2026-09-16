# Five routes, justified clarification, and owned follow-up

Date: 2026-09-12. Implementation: `five-route-queue/v2`, `adaptive-disposition/v37`, `response-review/v2`.

## Decision

Use five operational routes without turning queue priority into a physical care setting. Keep the original CSV and historical runs unchanged.

| Displayed route | Internal representation | Operational meaning |
| --- | --- | --- |
| Self care | `SELF_CARE` | Guidance and return precautions; no clinician action required by the recommendation. |
| Priority async | `ASYNC_PHYSICIAN`, `priority` | Time-sensitive clinician assessment/prescribing; higher internal queue priority. |
| Standard async | `ASYNC_PHYSICIAN`, `routine` | Lower queue priority, with prompt same-day review during service hours as a target. Not a 48-hour default. |
| Emergency now / 911 | `EMERGENCY_NOW` | Immediate emergency action; transport instructions remain explicit. Never wait for the queue, a question or research. |
| In-person today | `SAME_DAY_IN_PERSON` | Reported features justify hands-on assessment/testing/treatment today, distinct from emergency care. |

The stored `routine` name preserves compatibility; it now displays as Standard async. Priority and work type remain separate fields: a refill is a task, not an acuity diagnosis. Duration alone, an antibiotic request, or the mere absence of an examination does not determine urgency. An eventual need for an examination does not automatically establish a need for examination **today**.

`src/disposition/routing-policy.ts` owns the active queue version, five labels, ordering semantics, async action wording, ownership and availability statements. Historical recordings are not rewritten to appear as if this policy governed them. Earlier experimental workflow profiles retain their historical contracts; this change applies to the active adaptive GUI and clinician queue. There are no remaining 48-hour production defaults in `src/` or `apps/evaluation/`.

## What Counsel actually publishes

Counsel describes structured physician message queues, routing across shifts and time zones, physician-scheduled messages, proactive SMS/push contact, and context tools supporting continuity. These support a queue with owned follow-up, rather than treating one generated reply as completed care. They do **not** disclose an exact internal priority algorithm or establish that this prototype reproduces their implementation. [Counsel EHR article](https://www.counselhealth.com/blog/why-we-built-our-own-ehr), updated January 20, 2026; accessed September 12, 2026.

Counsel's public FAQ describes physician access usually within minutes during clinical hours, and its site advertises proactive check-ins. Those descriptions are not live staffing telemetry or an individual response guarantee. The FAQ also describes service eligibility restrictions; the assignment's synthetic case mix must not be silently dropped or relabelled to match the publicly described service eligibility criteria. [Counsel website and FAQ](https://www.counselhealth.com/), accessed September 12, 2026.

Both links were successfully retrieved during this review. Reachability establishes neither clinical applicability nor completeness of the implementation information.

## A question must earn its delay

A clarification now carries two concise **proposed** answer-to-route alternatives. They must have different routes and different answers. The existing question states the unknown; its short `why` states why routing cannot proceed first. Duplicated explanatory schema fields were removed to reduce output burden without adding an LLM call.

The final agent must reconcile intake explicitly:

- `not_needed`: no unresolved question justifies a hold;
- `collect_during_review`: useful information can be collected while async clinician review proceeds;
- `block`: a routing-critical unknown remains and the response explains the necessity of waiting.

Runtime validation rejects a blocking response with no specific consequence or two identical routes. It does not treat “which fingers?” as automatically routing-critical. Already-required emergency or in-person action proceeds without waiting for history. A hypothetical branch is not a reported finding or a validated clinical rule.

For an emergency or same-day branch, conditional action is displayed with the question and recorded in the early response event. It is judged along with the final response. No lower-acuity branch is automatically presented as clearance. An answered question is associated with the original run and input; assistant questions are not incorporated as patient symptoms.

**Important boundary:** distinct branches are necessary, not sufficient. A model can invent a difference or overstate the urgency of a broad positive answer. The instructions explicitly challenge this, including unqualified surgery/injury branches, but structural validation cannot establish clinical necessity.

## The independent judge assesses the delay

The clarification criterion is now **Necessity of delaying routing**. It assesses the unknown, plausible alternatives, whether clinician review could proceed concurrently, the specific reason a delay was necessary, and interim action. Relevance alone cannot pass a hold. No route change after one actual answer does not prove the question unnecessary: the other plausible branch also matters.

The packet includes the exact early emissions, final clarification, conditional instructions, reconciliation and queue-policy version. Invalid final JSON or a mismatched response status is rejected before reserving judge spend. Original labels and rejected drafts remain excluded. The judge cannot approve clinical care or silently change a disposition; its findings remain reviewable, including disagreements and abstentions.

## Follow-up implementation and explicit integration boundary

New queue tasks store the policy version, priority, intended Counsel ownership and no invented response deadline. Availability returns `not_connected`, `checkedAt=null`, `responseEta=null`. “Counsel clinician” describes the intended workflow owner, not a real acceptance by Counsel staff.

The local follow-up record supports:

1. Plan required after a response;
2. Clinician-owned check-in time and note;
3. Overdue visibility and queue prioritization;
4. Recorded completion, or an explicit reason no further follow-up is needed;
5. Blocking closure while the follow-up remains open;
6. Reopening the plan when new patient information changes the episode, preserving earlier events.

SQLite transactions and task versions protect against stale actions. Plans/outcomes survive reload and restart. The GUI uses one note and expandable follow-up controls instead of a separate large form.

**Stub, not delivery:** no SMS, push, real patient message, prescription, verified clinician identity or cross-shift handoff is connected. A future adapter needs verified staffing/eligibility, schedule timezone, clinician identity, delivery receipts, nonresponse escalation and handoff acknowledgment. A generated message or saved plan must never count as delivery or patient receipt. There is no fabricated “open now” or response guarantee.

## Verification and observed failures

Software verification: **422 tests pass** (300 root + 122 GUI/queue), along with type checking, lint, the Next production build and Mastra build. Tests cover route labels, no fabricated deadlines, priority ordering, clarification branches and reconciliation, trusted question lineage, early conditional-action validation, judge packet rejection, constrained citation references, stale queue actions, follow-up persistence/overdue state, and closure protection. These are not clinical efficacy measurements.

Actual browser tests, not only endpoint calls:

- C46 completed as Standard async, was enqueued, accepted as a **demo** reviewer, given an explicitly simulated response and follow-up plan. Closure while follow-up remained open was rejected. A simulated outcome then allowed resolution. No outreach occurred. Episode `b47d5d87-e601-46f1-a297-983c44097f30` is labelled Engineering test in the queue.
- C50 completed as Priority async without making routine prescribing checks a blocking prerequisite. That run's judge separately flagged inadequate explicit EMS wording in the return precautions.
- C01 displayed a routing question and conditional action. Answering through the GUI generated a fresh Self care assessment with the original message retained; it did not simply reuse the earlier disposition.
- C13 exposed clinically important variability: an earlier Standard async answer, a justified-looking but judge-challenged onset hold, and later in-person-today answers. The judge identified unjustified physical escalation and the inadequacy of “an exam would help” as a today deadline. These findings prompted the final shared-policy tightening.
- Under v36, C13 completed as Priority async while asking onset concurrently. The gradual-onset update then failed citation validation: the model had inserted `medleplus-placeholder` despite having real support references. The rejected draft was not published or silently repaired. V37 constrains both evidence IDs and support IDs to the retrieved namespace when sources exist. It adds no model call and leaves local provenance, passage identity and applicability checks intact. A source ID constraint is not semantic evidence validation; dynamic provider schemas may add compilation latency, which remains to be measured separately.
- The C02 emergency control issued an unconditional 911 action at 7 ms server-side, completed in 21.20 seconds, and did not wait for a question or retrieved evidence. Server emission time is not browser paint time or receipt by a patient.

Earlier v33 runs timed out at approximately 55–58 seconds; later completed or held runs also took approximately 24–56 seconds. All attempts, including failed runs and challenged holds, are retained. This sequential debugging run changes prompts and is not a randomized ablation, a latency improvement claim, or evidence that a route is clinically correct. Failed calls can have unknown provider cost.

The [immutable rehearsal manifest](../../outputs/gui-rehearsal-2026-09-12/1789245919577.json) covers 15 GUI attempts: 10 completed assessments, 3 unavailable assessments and 2 awaiting-input results. No unmatched event log was found in the window. All 15 independent reviews completed; their recorded judge-cost estimates sum to $1.4955. This excludes disposition/intake generation and is not a provider invoice; unknown completion costs are not treated as zero.

Final v37 browser checks:

| Input | Displayed route | Question behavior | Server completion |
| --- | --- | --- | --- |
| Original C13 | Standard async | Onset question at 6.39 s; final route completed before an answer, collecting history during review | 54.38 s |
| Same thread with gradual onset and finger distribution supplied | Standard async | Already-answered question not repeated; valid retrieved-source citations | 24.41 s |

The unchanged route in this pair is compatible with a **non-blocking** question; it does not establish whether a sudden-onset alternative would be handled correctly. Both raw runs remain recorded (`a2d770b1-88bd-41f1-8042-60307f97daf1`, `b7f5e804-727f-4ef5-8b28-eb0c4d0342b7`). The final follow-up judge still flagged ambiguous/insufficient EMS wording in return precautions. No clinical approval is inferred from completed output or any other passed criterion.

Full source passages, patient narratives and full response prose remain in original local run files, not this summary export; the short reconciliation reason is included as structured metadata. A crashed event log without a final artifact is separately accounted for using explicitly labelled filesystem birth time.

## Remaining release gates

- Repeated held-out and physician-calibrated evaluation of both unnecessary holds and missed clarification; no invented counterfactual route differences.
- Stable C13 routing across plausible onset answers and repeated trials. The presence of a judge is not itself a fix for generation errors.
- Emergency instructions tested separately from final-answer completion; a timeout must not erase required action.
- Source retrieval coverage and claim support; public consumer summaries are not specialist triage guidance.
- Consistently acceptable live latency, including failed/unfinished runs. The GUI tests still expose long waits.
- Real clinician/staffing and follow-up delivery integration before any operational or clinical-readiness claim.

The Sites workflow guided the local GUI changes and browser verification; no external hosting or deployment was created. Original CSV, saved physician adjudications, and historical result files remain unchanged.
