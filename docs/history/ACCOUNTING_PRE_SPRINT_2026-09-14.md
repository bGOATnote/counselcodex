# Historical assignment accounting before the September 14 repair sprint

13 September 2026. Supersedes the current-status claims in the historical
`TAKE_HOME_ACCOUNTING.md`; retains that document as a design-history record.

## Goal and V0 boundary

Help Counsel's responding clinician receive the right thread at the right time.
A medication refill is a task type. Its care setting and deadline depend on the
reported problem: usual active migraine can need priority remote review today,
whereas new focal weakness/speech disturbance needs emergency action. A missing
contraindication history alone does not prove an in-person examination is needed.

Five operational routes are self-care, priority async, standard async,
in-person today and emergency now. Both async queues target prompt same-day
review during service hours; priority describes ordering, not a different care
setting. Availability is unverified and no response time is guaranteed. The old
routine 48-hour default is superseded by the versioned queue policy.
The prototype neither prescribes nor claims a clinician has accepted a request.

## What satisfies each requested deliverable

| Assignment requirement | Current artifact | Boundary |
|---|---|---|
| Understand current state | Unchanged original CSV, clinician review instrument, original/updated thread context | Fifty supplied messages despite twenty mentioned in the brief. Source labels are not gold labels. |
| Frame a V0 | Care-setting/timing/work-type contract, [routing design](research/DISPOSITION_ROUTING_DESIGN_2026-09-11.md) | No autonomous care, claims submission or diagnostic coding requirement added to the routing decision. |
| Build it | Haiku intake, bounded evidence retrieval, Opus recommendation in Mastra; GUI and clinician-queue integration stub | No case-ID answer lookup or completed handoff claim. Same-day and emergency remain separate. |
| Decide what is right | [Reference-authority contract](EVALUATION.md), physician route/reason form and explicit binary review rubric with abstention | Three new policy controls are post-hoc author assertions. Saved reviews of previous versions remain previous-version reviews. No invented adjudication or consensus. |
| Evaluate it | [Full-50 physician development review](PHYSICIAN_REVIEW_SCORECARD_2026-09-13.md): 49 agreements and one qualified C25 disagreement; [eighteen-control judge validation](../outputs/response-review-pilot-1789273319276/summary.json), five-route scorer, [historical all-attempt audit](research/EVALUATION_AUDIT_2026-09-13.md) | Physician-engineer development agreement is not independent clinical accuracy or measured component benefit. Judge-control agreement is a separate metric. |
| Slide walkthrough and live demo | [September 11 editable deck](../output/presentation/counsel-disposition-current-2026-09-11.pptx) and [35-minute runbook](DEMO_RUNBOOK.md) | The deck predates the current audit; update its evidence before presenting. Final latency and source applicability remain visible limitations. |
| Optional code | TypeScript repository, pinned dependencies, tests, immutable outputs and provenance | The local demo is not a production deployment or HIPAA attestation. |

The assignment explicitly values framing and evaluation over polish, with a
6–8-hour upper bound and a request to stop by hour 11 and explain next steps.
This user-directed expanded project went beyond that scope. Do not represent
the complete repository as an eight-hour build. The presentation should isolate
the compact V0 and disclose the additional engineering/research work.

## Current evaluation changes

The physician-engineer explicitly reviewed all 50 v41 dispositions and
responses after guiding development. Agreement is 49/50, with C25 considered
potentially over-escalated but arguable both ways. The
[recorded statement](../data/evaluation/physician-development-review-2026-09-13.json)
is accepted as clinical development review; old form completion counts do not
override it. Exact reviewed run IDs and individual criterion grades are not
invented. No blanket correctness label is copied into runtime inference.

1. Five-route references now catch async priority errors hidden by the coarse
   disposition; early escalation contradictions remain failures.
2. Planned but missing runs stay in denominators, and related/repeated cases do
   not receive independent-case confidence intervals.
3. Judge controls bind exact inputs, answer, passages, rubric and model to avoid
   stale-cache judgments. Each of seven criteria has positive/negative controls.
4. The scorecard verifies local run hashes and current judge bindings, separates
   debugging versions, and leaves unreferenced cases unscored. It does not rewrite
   responses or physician work, or create a clinical-performance claim.

## Release gates still open

Final-answer latency, general source/dose/population applicability, physician
calibration of the judge, unseen-case evaluation, and false emergency floors.
The background reviewer detects concerns after issuance. It is not a validated
pre-release clinical safety gate, and cannot retract an already-issued message.

Implemented in v42: retain fast intake, remove prior routing judgments from
the final assessment prompt, and explicitly reconcile disagreements before
issuing reduced-urgency advice. Context-sensitive rule screening and the DVT
same-day/emergency distinction were tightened. See the
[fix, GUI attempts and limitations](EARLY_ESCALATION_RECONCILIATION_2026-09-13.md).
This engineering change does not inherit the physician's v41 agreement score.
Then bind future reviewed outputs to run IDs and freeze cases, patient inputs,
source passages, schema, sampling and grader for measured comparisons. The
current physician review is already attributable; no repeat review of all 50
is required to acknowledge it. Separately
compare whole retrieval workflows. Count failed/unfinished attempts, inappropriate
escalation and delayed escalation. Reconstruct Counsel's filtered emergency
method separately from a stress set retaining conditional and second-hand cases.
Do not apply a healthy 35-year-old-man assumption to the supplied patients.
