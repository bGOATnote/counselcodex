# Smaller routing responsibility — fixed-packet comparison

This is an isolated producer experiment, not a change to `/candidate`, V25,
physician references, or the evidence corpus. The question is whether removing
optional prose responsibilities improves usable routing and latency without
losing physician-reference agreement. A typed route is not a completed medical
response, and agreement is not proof of claim support.

## Frozen comparison

- 50 original messages, two fresh first attempts each: full versus brief.
- Opus 5, adaptive thinking / low effort, 2,400 output-token allowance in both
  arms. No judge, repair, retries, new retrieval, or model switching.
- Same original patient, accepted V25 context and exact selected passages,
  source metadata, quote spans and ordering. Early safety is not shown to either
  producer; previously issued actions are checked separately for care reduction.
- Full arm retains the original prompt/schema and output instruction. Brief arm
  retains its patient-boundary and routing policy, but requests only typed
  routing/transport, a concise reason, decision-relevant findings, citations and
  a short evidence-gap statement. No patient reply, differential, separate
  vital-sign narrative, treatment or operational promises.
- Alternating arm order by case, sequential calls. Known development cohort,
  not held-out or blinded physician validation.

Plan: `outputs/routing-brief-paired-2026-09-15/plan.json`.
Fingerprint: `35abf6d84ed56447bf4741b3148e4158b81f174cb4c053d958aa35b2beae7174`.

Both arms use the same typed-route, exact patient-basis, exact citation-reference
and issued-care checks. Original full-response gates are reported separately;
brief proposals never enter V25 complete-release denominators. Report raw route
agreement separately from eligible-proposal agreement and all-49 coverage.
C25 stays excluded from agreement/under/over; C04's old failed delivery stays
unchanged. Every new failure remains its first attempt. Missing results retain
their spend reservation and are never automatically retried.

`unsafe_advice` and `unsupported_claims` stay `not_assessed` absent an actual
assessment artifact. Exact quote identity is not entailment or applicability.
Producer latency is not end-to-end response latency or browser paint.

## Money and reproducibility

The existing $90 mission ceiling applies. V25 conservative accounting plus
the outstanding RAG phase reservation totals $11.783796; remaining allocation
is $78.216204. No new budget is inferred. Prior ledgers/history/code are hashed.
One persistent exclusive phase claim prevents duplicate fresh directories from
spending the same allocation. Each pair is reserved before either call; known
usage settles at twice input-price plus output-price, with unknown usage retaining
the whole reservation. All 100 worst-case reservations total $58.6373. Current
Opus pricing is $5/M input, $25/M output, verified against
[Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing).
These are conservative estimates, not invoices.

```sh
node --experimental-strip-types scripts/routing-brief-study.ts run outputs/routing-brief-paired-2026-09-15 35abf6d84ed56447bf4741b3148e4158b81f174cb4c053d958aa35b2beae7174
node --experimental-strip-types scripts/routing-brief-study.ts score outputs/routing-brief-paired-2026-09-15 report-replay.json
```

The run command resumes without reissuing started calls. Scoring requires a new
filename. Do not change the frozen prompt or parser mid-cohort. RAG support work
is separate and cannot change these packets. Promotion requires a later explicit
decision and live GUI verification; this study alone cannot establish readiness.
