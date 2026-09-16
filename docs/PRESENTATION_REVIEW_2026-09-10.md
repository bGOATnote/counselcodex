# Presentation review — 10 September 2026

## Decision

Borrow the other repo's focused task flow and evidence proximity, not its
top-level legacy escalation badge. Concision must preserve the exact action,
uncertainty and provenance. Neither repository is clinically superior based on
this review: no paired clinical evaluation was performed.

Comparison target: private `bGOATnote/counsel-disposition-ebm`, read through the
authenticated GitHub API at commit `8b3692667064ae338706f588fb835c60e856f734`.
No code was run, dependencies installed, or changes made in that repo. Local
changes are presentation and tests; routes, source data and clinician reviews
are unchanged.

## Useful lessons

| Aspect | Other repo's strength | Applied here |
|---|---|---|
| Case selection | Compact sample chips | Four shortcuts; searchable full list remains expandable |
| Answer organization | Rationale beside source-message evidence | Action, reason and existing brief differential on the default answer |
| Interface structure | Focused composer/result surface | Removed permanent inbox and slogan; traces and full audits are expandable |
| Walkthrough | Timed, case-specific demo script | Updated our runbook to match the current GUI and 35-minute assignment |

Sources: [Composer](https://github.com/bGOATnote/counsel-disposition-ebm/blob/8b3692667064ae338706f588fb835c60e856f734/apps/gui/src/components/Composer.tsx),
[ResultCard](https://github.com/bGOATnote/counsel-disposition-ebm/blob/8b3692667064ae338706f588fb835c60e856f734/apps/gui/src/components/ResultCard.tsx),
[runbook](https://github.com/bGOATnote/counsel-disposition-ebm/blob/8b3692667064ae338706f588fb835c60e856f734/docs/DEMO_RUNBOOK.md).

## What not to import

- **Legacy label first.** ResultCard leads with `URGENT_ESCALATION`, with
  `EMERGENCY_NOW` secondary. Lead with the operational action and timing instead.
- **Stale results.** Typing in its App changes the message without invalidating
  the displayed result, and the Composer remains editable during a run. A result
  can belong to earlier input. Ours is tied to the exact message, hidden after
  edits and cleared before reruns.
  [App](https://github.com/bGOATnote/counsel-disposition-ebm/blob/8b3692667064ae338706f588fb835c60e856f734/apps/gui/src/App.tsx).
- **Fixture execution called LLM execution.** Its `llm` semantic mode still calls
  a fixture matcher, even with a key. This is not evidence of a model gain.
  Its pipeline is plain TypeScript, not Mastra. Our V0 is actual Mastra but also
  rules-based; our intake and judge Agents are separate.
  [Semantic supervisor](https://github.com/bGOATnote/counsel-disposition-ebm/blob/8b3692667064ae338706f588fb835c60e856f734/src/pipeline/semanticSupervisor.ts),
  [package](https://github.com/bGOATnote/counsel-disposition-ebm/blob/8b3692667064ae338706f588fb835c60e856f734/package.json).
- **Agreement as clinical gain.** Reported 34/50 agreement is against supplied
  labels, explicitly descriptive. The report names pipeline 0.1.0; inspected
  source names 0.2.0. Do not treat it as a current-code score or rank it against
  our different HealthBench endpoint/population. A document titled
  “preregistered” alone does not establish chronology.
  [Report](https://github.com/bGOATnote/counsel-disposition-ebm/blob/8b3692667064ae338706f588fb835c60e856f734/deliverables/evaluation_results.md),
  [pipeline](https://github.com/bGOATnote/counsel-disposition-ebm/blob/8b3692667064ae338706f588fb835c60e856f734/src/pipeline/dispositionPipeline.ts).
- **Unqualified DONE.** Its status file says all outcomes are done while provider
  scaffolding remains. Presentation readiness, working software and clinical
  validation require different evidence.
  [Status](https://github.com/bGOATnote/counsel-disposition-ebm/blob/8b3692667064ae338706f588fb835c60e856f734/docs/OUTCOME_STATUS.md).

## Our revised answer contract

One message panel, one answer panel. The default answer retains the exact V0
directive and rationale, visible safety uncertainty, and case-bound research
differential with links. Full source titles, dates, access checks, red-flag
inventory and vital quotes remain under **Safety & sources**. Actual graph
execution remains under **Execution details**. No new generated prose substitutes
for actual rule output.

The DDx remains curated research for exact matches, not generated reasoning,
a diagnosis or a scored reference. New text has no fabricated DDx. Link
reachability never becomes evidence that a clinical recommendation is supported.

## Presentation-readiness gates

| Gate | Status / required evidence |
|---|---|
| Assignment alignment | Rechecked all four pages: current-state reasoning, scoped build, evaluation, deck and live demo; 35 minutes plus Q&A |
| Executable concise GUI | Implemented; all-50-case component tests preserve action, rationale and provenance |
| Display integrity | Tests cover changed input, missing evidence, vital mentions, confidence claims and action outside collapsed details |
| Browser rehearsal | Pending this revision: four routes, editing, request failure, keyboard, narrow viewport and 200% text. Server rendering is not browser QA |
| One canonical deck | Pending: select/reconcile one deck with the four-route GUI, optional review fields and dated results; versioned decks are not automatically current |
| Defensible evaluation | Dated artifacts exist; show denominators and failures. No new clinical/model-lift estimate from this UI change |
| Physician reference | Use actual saved answers only. Do not invent completion; 50-case adjudication is not a prerequisite for honest software experiments |
| Reproducible handoff | Verify chosen commit, fresh-install checks, CLI fallback and GitHub access before sharing; local commits are not necessarily published |
| Honest effort accounting | Distinguish the assignment V0 from subsequent extensions. The brief expects 6–8 hours; do not imply days of follow-up work happened in that window |

The next high-value experiment is a frozen, paired emergency comparison of the
baseline versus a real semantic supervisor: misses, false alerts, degraded runs,
repeated-run reliability and cost reported separately. Freeze the design before
calls. The familiar 50-case development set cannot establish generalization.
This is a proposed experiment, not a result.

This review does not certify clinical usability, deployment readiness, autonomous
authorization or billability. It makes the demo easier to inspect and remaining
evidence easier to name.
