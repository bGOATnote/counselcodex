# Clinical-benefit study: engineering verification

This is an implementation/test record, not a clinical efficacy result.
Protocol and cited research: [Does the agent improve disposition?](CLINICAL_BENEFIT_STUDY.md).

## Verified

- Initial requested remote push: `main` advanced from `2122f28` to `5efb884`.
- `npm test`: 330 software tests passed (66 unit, 84 Mastra/core,
  18 quality-audit, 24 evidence, 105 adaptive/transport/experiment,
  13 review/judge, 20 new benchmark controls).
- `npm run review:test`: 122 application tests passed.
- `npm run typecheck`, `npm run lint`, and `git diff --check`: passed.
- `npm run review:build`: passed.
- `npm run build`: passed with network access. The first restricted install
  stalled; its identified dependency-install child was stopped before the retry.
- After the last response-anchor hardening, all 20 benchmark tests, typecheck
  and lint were rerun successfully. That change affects the offline grader,
  not the patient-facing workflow bundle.
- Current-runtime plan and report commands both completed without provider calls.
- A local real-Mastra test verified the new reservation branch and preserved
  failures from injected malformed model output. It did not exercise a live model.

The two unexecuted plans are preserved. The latest is
[plan-v2.json](../../outputs/clinical-benefit-design-2026-09-13/plan-v2.json),
with private raw working directory `.cache/clinical-benefit-2026-09-13-v2`.
Version 1 preceded the response-anchor hardening. Neither contains measured
clinical outcomes. The same 12 development pilot IDs remain selected in both.

## Defects addressed

1. The default emergency benchmark previously invoked a historical workflow;
   the current command now runs the GUI's actual adaptive runtime and base Opus.
2. Failed negatives could receive true-negative credit in binary-only scoring.
   Current all-attempt scoring retains them; the legacy scorer rejects them.
3. An incorrect early emergency instruction could be lost when only the final
   answer was evaluated. Early emissions are now included in agreement and judging.
4. Interrupted generation could lose already-issued instructions. Recovery
   preserves the complete durable journal prefix without rerunning a paid attempt.
5. Partial/asymmetric paired results could look like a benefit. No overall paired
   delta is reported until both arms have observed slots for the stated partition.
6. Saved judgment scores could be trusted without replay. The report binds each
   judgment to the exact record/rubric and recalculates from its raw verdicts.
7. Patient quotes alone could be offered as proof of response behavior. Each
   criterion now requires a response anchor; research passes need claim and passage
   anchors. Semantic validity still requires a competent calibrated evaluator.
8. A historical report could be rebound to new code. Reporting now retains the
   frozen generation fingerprint; new generation requires a matching manifest.
9. Local budget exhaustion could create a batch of empty admitted attempts.
   The runner now checks remaining authorization before admitting the next run.

## Not claimed

No paid generation or judging occurred under this study. The requested new spend
authorization is pending. No new GUI clinical handoff or presentation-readiness
claim is made; clinical output and saved reviews are unchanged. No raw benchmark
questions, rubrics or generated answers are published in these artifacts.

The audit found 24 unsupported multi-turn cases in the primary 103. They remain
explicit. The new rubric judge has not yet been run or physician-calibrated.
The next measured work is the approved development pilot, failure review and
clinical fixes, followed by role-preserving multi-turn coverage and an untouched
evaluation. Source applicability, false escalation, emergency misses and latency
remain clinical release gates, not completed tasks.
