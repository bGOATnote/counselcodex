# Operational routing taxonomy

## Decision

The runtime and physician-review instrument use four operational routes:

| Route | Required latency | Operational contract |
|---|---|---|
| `SELF_CARE` | No clinician queue | Reviewed guidance and explicit return precautions are sufficient for the named low-risk pattern. |
| `ASYNC_PHYSICIAN` | Declared async service SLA | A licensed clinician owns the thread. The service may distinguish same-day async from its routine queue. |
| `SAME_DAY_IN_PERSON` | Before the end of the current day | The patient should not wait for routine asynchronous review. Direct them to a locally capable in-person service today. |
| `EMERGENCY_NOW` | Now | Activate the locally appropriate emergency, crisis, obstetric, or emergency-department pathway; do not wait for a thread reply. |

The take-home's supplied `URGENT_ESCALATION` label is retained only as a legacy
evidence value. It maps from both `SAME_DAY_IN_PERSON` and `EMERGENCY_NOW` when
the four-level output is compared with the original three-level task:

```text
SELF_CARE            -> SELF_CARE
ASYNC_PHYSICIAN      -> ASYNC_PHYSICIAN
SAME_DAY_IN_PERSON   -> URGENT_ESCALATION
EMERGENCY_NOW        -> URGENT_ESCALATION
```

This projection is one-way. The legacy label does not contain enough
information to reconstruct the correct operational route.

## Why the split is necessary

The assignment defines `URGENT_ESCALATION` as “needs same-day in-person
evaluation or emergency care” and explicitly says the candidate owns the bucket
design. Those two actions have different latency, staffing, patient
instructions, capacity cost, and failure modes.

The distinction is also consistent with external operational definitions:

- Counsel's emergency analysis treats emergency cases as cases in which the
  user should **immediately** seek emergency-level care; its non-emergency class
  can still require care in another setting or time frame. [Counsel Health,
  2025](https://www.counselhealth.com/blog/how-counsel-leveraged-healthbench-to-assess-emergency-escalation)
- NHS Urgent Treatment Centres provide same-day care specifically for needs
  that are urgent but not life-threatening emergencies. [NHS England, Urgent
  Treatment Centres](https://www.england.nhs.uk/urgent-emergency-care/urgent-treatment-centres/)
- NHS Same Day Emergency Care assesses, diagnoses, and treats appropriate
  patients within one day while retaining an immediate emergency pathway for
  life-threatening presentations. [NHS England, SDEC service
  specification](https://www.england.nhs.uk/long-read/same-day-emergency-care/)
- The Emergency Severity Index separates patients requiring an immediate
  life-saving intervention from high-risk patients who should not wait and from
  lower-acuity presentations. It is not the routing algorithm used here, but it
  demonstrates why a single acute-care bucket discards consequential latency
  information. [AHRQ, Emergency Severity Index
  algorithm](https://www.ahrq.gov/sites/default/files/publications2/files/esitriagealgorithm-v4_0.pdf)
- EMTALA's emergency-medical-condition definition turns on the consequences of
  failing to provide immediate medical attention. This is a legal screening and
  stabilization concept, not a classifier label, but reinforces the need to
  state what “now” means. [ACEP EMTALA fact
  sheet](https://www.acep.org/life-as-a-physician/ethics--legal/emtala/emtala-fact-sheet)

These sources support the **operational distinction**, not the accuracy of any
individual rule or a deployment claim.

## Invariants

The route order is monotonic:

```text
SELF_CARE < ASYNC_PHYSICIAN < SAME_DAY_IN_PERSON < EMERGENCY_NOW
```

1. A deterministic safety-rule match locks both same-day and emergency routes.
2. A downstream component cannot downgrade a locked route.
3. If multiple safety rules match, `EMERGENCY_NOW` outranks
   `SAME_DAY_IN_PERSON`; source-code order cannot create an emergency delay.
4. The bounded Mastra agent cannot choose disposition. Its only routing effect
   is a one-way promotion from `ASYNC_PHYSICIAN` to `EMERGENCY_NOW` when its
   structured output raises a must-not-miss safety concern.
5. Retrieval is context-only and cannot change or downgrade disposition.
6. A failed deterministic safety screen closes to `EMERGENCY_NOW` in this
   research prototype. The resulting over-triage burden must be measured before
   any operational use.

## Timing is not destination

`SAME_DAY_IN_PERSON` does not mean “urgent care,” and `EMERGENCY_NOW` does not
always mean “call 911.” A same-day destination may be a clinic, urgent treatment
centre, same-day emergency-care service, obstetric assessment unit, or emergency
department. An emergency-now destination may be EMS, an emergency department,
crisis response, or labor and delivery. Local capability, geography, age,
pregnancy, access, and protocol determine destination.

V0 subtypes are implementation proposals, not a validated directory of care.
The workbench therefore asks the physician to judge latency explicitly and to
record decision-changing unknowns. A production system needs a separately
versioned destination policy with local ownership and availability monitoring.

## Current development proposal

The small deterministic rule set currently proposes:

- `SAME_DAY_IN_PERSON`: infant fever/dehydration at the represented age,
  suspected DVT without emergency cardiopulmonary features, represented COPD
  exacerbation, represented heart-failure decompensation, and stable early
  pregnancy bleeding with cramping.
- `EMERGENCY_NOW`: the remaining safety rules, including current or resolved
  focal neurologic symptoms, cardiopulmonary emergencies, anaphylaxis,
  time-critical neurologic/ophthalmic/urologic presentations, major bleeding,
  severe infection, overdose, prolonged seizure, and behavioral-health crisis.

These are **unattested development proposals** authored against visible
synthetic examples. They require the single physician-engineer's blinded case
review for this assignment, then an untouched representative validation sample
before any clinical-performance statement.

## Evaluation contract

Never collapse the four-level output for primary evaluation. Report at least:

- the full 4×4 confusion matrix;
- `EMERGENCY_NOW` sensitivity and positive predictive value with intervals;
- `SAME_DAY_IN_PERSON` sensitivity and positive predictive value with
  intervals;
- any-escalation sensitivity and positive predictive value;
- emergency-to-same-day delays as a separate severe error count;
- same-day-to-emergency over-triage separately from non-escalated-to-emergency
  over-triage;
- severity-weighted under-triage, with the illustrative cost matrix clearly
  separated from clinically validated weights;
- time to completed handoff or escalation, not only the predicted label;
- abstention/failure-closure, override, workload, subgroup, access, destination,
  and temporal-drift slices; and
- every serious false negative outside aggregate averages.

The three-level projection is reported only to answer the original assignment
on its supplied terms. A perfect projected score can coexist with systematic
emergency-to-same-day delay and therefore cannot clear a safety gate.

## Workspace migration

The review workspace schema is V2. A V1 browser checkpoint with
`URGENT_ESCALATION` is migrated from its already-recorded action timing:

- `SAME_DAY_IN_PERSON` timing -> `SAME_DAY_IN_PERSON` route;
- `EMERGENCY_NOW` timing -> `EMERGENCY_NOW` route; and
- missing timing -> blank route requiring an explicit reviewer choice.

Narrative fields and independently locked judgments are preserved. Because V1
comparisons revealed a different three-level V0, their source/V0 assessments,
completion state, post-reveal revision, and attestation are invalidated; the
reviewer re-runs only the revealed comparison. The migration never guesses when
an old draft lacks enough information.

V2 workspaces bind the dataset version and the SHA-256 hashes of the source,
reference proposal, and V0 prediction artifacts. A later artifact change cannot
silently inherit a completed comparison.
