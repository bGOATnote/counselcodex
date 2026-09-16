# Historical runbook before the September 14 repair sprint

Updated 13 September 2026. This walkthrough describes the active agent and its
observed defects, not the earlier rules-only demo. Allow 35 minutes followed by
25 minutes of clinical/engineering Q&A, as the assignment requests.

## Preflight

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run review:test
npm run review:build
npm run start --workspace @counselcodex/evaluation
```

Use an already-running production server instead of starting a second listener.
Open <http://localhost:4120/>. Keys stay in the
root `.env`: Anthropic for Haiku/Opus, OpenAI for the independent Astra reviewer.
The clinician reference instrument remains at `/review`, outside the demo header.
The clinician queue is a routing integration stub, not a second demo workflow.
No paid benchmark, frozen result regeneration or review reset belongs in preflight.

The GUI uses real API calls. Early action and completed-answer timings differ.
Read the measured times rather than promising a cached result or a fixed SLA.
If an assessment fails, show the failure and preserved care instruction. Never
substitute a previous successful answer while presenting it as a new run.

## Walkthrough

| Minutes | Subject | Evidence |
|---|---|---|
| 0–5 | Assignment and current-state audit | Original 50 rows unchanged. Broad source labels are observations, not clinical truth. |
| 5–10 | Clinical routing design | Five operational routes; priority/standard within async; medication renewal is a work type. |
| 10–17 | Live agent and update | C50 unchanged, then a clearly labelled fictional neurological update. |
| 17–22 | Integration boundary | Both async priorities share the clinician queue; delivery is stubbed. Inspect independent review of the actual response. |
| 22–29 | Evaluation | Eighteen current-rubric judge controls, all-attempt scorecard, references and limitations. |
| 29–35 | What improved and what remains | Source-attribution failures, final latency, uncalibrated judging and next experiment. |

## Live sequence

1. Select **C50**, unchanged. It describes a usual migraine-like headache and a
   sumatriptan refill request. The current intended route is priority async
   clinician review today. Do not present a refill as automatic prescribing,
   or equate prompt remote review with a hands-on examination.
2. Read the actual response, cited claims and limitations. The run may still have
   defects. Open **Independent clinical review** after it completes. Show any
   flags, the exact anchored text and the frozen run ID. A judge's lack of flags
   is not a clinical approval.
3. Add this **fictional engineering test update**, announcing it explicitly:
   `I now have new right arm weakness and my speech is slurred.`
   This changes the clinical problem. Show emergency action without waiting for
   final explanation or review. Never portray this as the unchanged C50 case.
4. Stay on the response. Explain which patient update changed the route. For an
   async result, show **Destination: Counsel clinician queue** and its priority.
   This is the router's integration boundary: no request is sent, no clinician
   accepts a task, and no follow-up message is delivered by this demo. The
   destination is shared by Priority async and Standard async; they are different
   priorities, not different care teams. Do not demo acceptance/resolution controls.
5. If time permits, **C04** demonstrates same-day in-person assessment for the
   concerning diabetic foot wound. **C46** demonstrates routine medication
   renewal, including the current source-population limitation discovered by the
   independent judge.

**Independent clinical review** audits the exact stored response. It does not
regenerate the clinical answer. A failed/uncertain review is not automatically retried.
Reviewer feedback is optional and append-only. Never complete it on the
physician's behalf or claim all 50 cases were reviewed.

## Evaluation claims the evidence supports

- Eighteen authored contrast controls tested whether the current judge detected
  ten specific planted defects and distinguished eight target-criterion controls.
  All matched, with no abstention. This tests known defects, not clinical accuracy
  or agreement with physician adjudication. Most are related migraine mutations.
- Live browser runs expose patient-fact strengthening, source-urgency distortion,
  remote-care attribution and dose/population mismatch. The audit record retains
  every iteration, including failures after attempted fixes.
- Early safety action can arrive before the final answer. The two latest-version
  attempts in the audited rehearsal completed in 24.41 and 54.38 seconds; one
  still had a judge concern. This remains a release gate, not a latency SLA.
- Historical HealthBench and rules-based scores describe historical candidates.
  No result here claims to reproduce Counsel's exact private 103-case cohort or
  establish current-agent HealthBench performance.

See [current accounting](CURRENT_TAKE_HOME_ACCOUNTING.md),
[reference and scoring contract](EVALUATION.md), and
[the measured audit](research/EVALUATION_AUDIT_2026-09-13.md).
The later [routing-scope GUI rehearsal](GUI_ROUTING_SCOPE_2026-09-13.md) verified
three consecutive live assessments and the queue integration stub. It did not
establish clinical readiness or obtain new independent judge scores. Rehearse
through the actual browser before presenting; the September 11 deck predates
these results.

## Questions for discussion

How should the clinical service define response deadlines and ownership? What
false-escalation burden is acceptable alongside emergency sensitivity? Which
claim-support errors should block a draft from clinician review, versus flag it?
How would physician disagreement calibrate this judge on an independent set?
Which additional agent actually improves a measured outcome enough to justify
its latency and cost?

These are proposed design-review questions, not claims about Counsel's private
system or leadership preferences. This expanded project exceeds the original
6–8-hour brief. Disclose that scope honestly and present a compact V0 narrative.
