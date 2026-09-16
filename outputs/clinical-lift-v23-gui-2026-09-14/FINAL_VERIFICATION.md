# Final sprint verification — 15 September 2026 UTC

This closes verification of the post-cohort source changes. It does not replace
any failed attempt, re-score the frozen 50 cases, or establish clinical readiness.

## Final source and artifact checks

- `npm run lint`, `npm run typecheck`, all constituent `npm test` suites, and
  `npm run review:test` completed with exit code 0. The GUI suite passed 167 tests.
  Historical experiment tests that explicitly skip under changed runtime identity
  are not counted as current clinical validations.
- `npm run build` completed with exit code 0. It builds and verifies both the
  Next-hosted Mastra candidate and the separate native Mastra incumbent artifact.
- Final candidate Next build ID: `vzp7TGAX_dp1wuZrm_Na-`.
- Candidate artifact identity:
  `0b1fd2f7816136da0c7fbfb825c66560b116d240e57c3a3825d7df95fec0dcb3`.
- Native Mastra dependency artifact: seven direct dependencies and 205 locked
  packages; package SHA256
  `dab5b0c76a5e97234fb15b94400d143e8855d18f90a55e030fe38a51fa9f21ef`,
  lock SHA256
  `24daf664c58a34385c8cafaae9a9ac4b1c4dbb56720179a84aa7150f58c596f8`.

Artifact verification checks entry manifests, traced dependencies and their
identities. It is not proof of hosted deployment or clinical performance.

The production server was restarted after this build. The actual browser at
`http://localhost:4120/candidate` was reloaded and showed the 50-case selector,
editable message, assessment control and initial response panel. This final
reload was read-only and submitted no additional paid assessment.

## Relationship to the paid browser runs

The two phase-5 actual browser runs used the immediately preceding build. Both
completed as Priority async, with no early emergency action: original C50 at
68.42 seconds browser final receipt, and its explicit gradual-onset update at
73.89 seconds. See `phase5/BROWSER_REVIEW.md` for exact messages, run IDs,
failures inside the workflow, timing definitions and clinical limitations.

The final source change isolates onset-pattern deferral to paths that require
full clinical review. The legacy/default checker retains its stricter historical
behavior. Candidate runtime, preservation validation and offline scoring use
the explicit full-review checker. Regression tests replay the complete check
arrays from both actual phase-5 runs unchanged. The candidate prompt identity
remains `598165cd6840bb80192b05001eca7934f0acea10b450cda81dcf8a600f07f73f`.
This is deterministic replay equivalence, not a new live clinical run.

The scorer also recomputes the expected onset-check state from the exact answer;
changing the recorded status, detail, or both cannot manufacture release. A
bound accepting full judge remains mandatory. The six-packet live judge study
accepted the valid original packet and identified the five deliberately planted
defects; these authored controls are not held-out clinical accuracy evidence.

## Closed accounting and remaining gates

`FINAL_ACCOUNTING.json` reconciles the sprint at **$87.093099025 of $100**,
including retained failures, a 25% usage contingency and the documented per-run
allowances. It is token-based accounting, not a provider invoice. There were 766
model calls and one separately receipted embedding call. No unresolved unknown
usage remains, and the duplicate capture-window confirmation is not counted as
another call or charge. No further paid work is planned within this sprint.

The frozen v23 cohort completed 43/50 versus 39/50 for v22, but exact five-route
development-reference agreement was 31/49 versus 32/49. C25 remains separately
qualified; model-supported alternatives are not physician approvals. Final
response latency, residual content errors, unnecessary withholding, and causal
agent benefit remain unresolved. The post-cohort fixes cannot inherit the frozen
cohort's score. This is **not presentation-ready or clinically validated**.

The next justified experiment is a smaller, route-focused producer contract:
state relevant unknowns once, distinguish routing a clinician task from approving
its treatment, and measure the resulting repair burden against a frozen control.
It should not add agents, weaken the full clinical review, or claim benefit until
paired results support that change.
