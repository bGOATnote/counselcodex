# Reasoning effort: completed fixed-packet probe

**Decision: no promotion.** Raising Opus effort did not change any of the ten
routes. Physician-reference alignment remains incomplete. This is a selected
development subset, not held-out accuracy or a live V25 score.

## Identity and execution

Frozen at `0864ca5`, protocol `fixed-packet-effort-alignment/v1`, fingerprint
`25e172140233705d99e8152387d1de356704db3b7a83bf09ca8ca08c3f3a7068`.
All 517 bound files were verified unchanged. Both arms used
`anthropic/claude-opus-5`, adaptive thinking, the same original full prompt,
patient/context/evidence packet and full output schema, a 4096 output-token cap,
one step, zero retries and a 600000 ms deadline. Only effort differed: low/high.
Historical file labels `full`/`brief` mean **low/high**, not different schemas.
Calls alternated pair order. All 20 actual provider calls completed; none was
retried, discarded, published or clinically approved. No judge, repair,
re-retrieval, gold or prior care instruction entered model input.

## Results

| Measure | Low | High |
| --- | ---: | ---: |
| Provider completes / planned | 10/10 | 10/10 |
| Eligible routing proposals | 10/10 | 10/10 |
| Accepted-route agreement | 4/10 | 4/10 |
| Below reference acuity / above | 6 / 0 | 6 / 0 |
| Full-response gate replays passed | 8/10 | 9/10 |
| Producer median | 14.713 s | 22.666 s |
| Producer p95 (nearest-rank; n=10) | 18.580 s | 27.153 s |
| Median output tokens | 902.5 | 1680.5 |

Median paired latency increase was 8.160 s. These are producer completion
timings, not end-to-end GUI or early-action timings. The 4096 cap differs from
earlier 2400-cap studies, so comparisons with those studies are not effort effects.

| Case | Physician accepted route | Low = high route | Agreement |
| --- | --- | --- | --- |
| C01 | Self care | Self care | Yes |
| C02 | Emergency now | Emergency now | Yes |
| C07 | Standard async | Self care | No |
| C12 | Emergency now | In-person today | No |
| C13 | Priority async | Self care | No |
| C22 | Standard async | Self care | No |
| C30 | Self care | Self care | Yes |
| C34 | Standard async | Self care | No |
| C47 | Standard async | Self care | No |
| C50 | Priority async | Priority async | Yes |

All ten have non-null reference routes; this subset's denominator is 10, not
49. C25 is not in this subset. There were no early/final setting conflicts or
issued-care reductions in these pairs. Route disagreement is not adjudicated harm.

## What the unchanged routes conceal

These are engineering observations of retained outputs, not physician scoring
of these exact responses. Aggregate `unsafe_advice`, `unsupported_claims`,
`claim_support` and `clinical_correctness` remain `not_assessed`.

- **C01, both:** a quoted report of eating/drinking fine is labelled denial of
  dehydration. Exact quotation does not support that broader negative finding;
  the existing hydration gate fails both responses.
- **C47:** high effort separates reported tiredness from preserved functioning;
  low effort labels functional impairment denied from “I'm functioning but tired
  all day.” This is a useful wording difference without a routing gain. Low also
  writes “if sleep is no worse after 3–4 weeks,” an unclear follow-up condition.
- **C12, both:** name a physical-assessment need but retain same-day rather than
  the physician's immediate route. Adding a clinician-task paragraph did not
  settle the severity/timing boundary.
- **C22, both:** partial weight bearing and a sprain summary support a benign
  possibility, not a completed fracture assessment. The replies acknowledge that
  fracture is not excluded yet still select guidance-only care.
- **C34:** low effort fails the irrigation support check; high passes the current
  wording checks. Neither result establishes medication appropriateness or changes
  the service-policy disagreement about clinician involvement.
- **C50 low:** “I'm flagging your refill request” implies an operational action
  the isolated producer cannot perform. The limited handoff wording check misses
  that phrasing. Passing mechanical gates is not proof of successful handoff.

More thinking is not a substitute for precise service boundaries, faithful
patient-fact interpretation or evidence applicability. The source-replacement
probe and this probe both reject an automatic “more RAG / more reasoning” fix.

## Money and reproduction

| Ledger | USD |
| --- | ---: |
| Mission ceiling | 90.000000 |
| Previously accounted | 75.937696 |
| All-20 maximum reservations before calling | 12.892780 |
| Actual base token-cost estimate | 2.483620 |
| Current conservative accounted usage | 4.345490 |
| Cumulative conservative accounting | 80.283186 |
| Remaining mission balance | 9.716814 |

Reservations are replaced by known usage, not added to it. Conservative input
accounting is not an invoice; raw usage and all reservations are retained.

```bash
node --experimental-strip-types scripts/effort-alignment-probe.ts score \
  outputs/effort-alignment-probe-2026-09-15 report-NEW.json
```

Use a new filename; existing reports are immutable. The original report and
`report-replay.json` are byte-identical, SHA-256
`a13c871853e17436ca13140cc60eef08e17fca7de0f65a649388c82c83a9f9ff`.
See [frozen plan](EFFORT_ALIGNMENT_PROBE_PLAN_2026-09-15.md) and
[all rows, usage and checks](../outputs/effort-alignment-probe-2026-09-15/report.json).
Seven focused tests, full project tests, typecheck and lint passed. No GUI or
production change was made; this is not a GUI handoff.
