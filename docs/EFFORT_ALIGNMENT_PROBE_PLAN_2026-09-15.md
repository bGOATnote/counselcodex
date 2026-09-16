# Targeted producer-effort probe — frozen before calls

Question: does additional reasoning in the **existing producer** improve patient
scope, evidence application and physician-reference agreement without another
agent or prompt expansion? No live change or promotion is authorized by this
probe itself. Prepared, not yet run; results belong in a separate report.

[Anthropic's effort guidance](https://platform.claude.com/docs/en/build-with-claude/effort),
checked September 15, recommends testing effort on the actual workload. Higher
effort may trade latency and tokens for capability; it does not guarantee better
clinical decisions. This is a one-factor experiment, not a new routing layer.

## Design

20 first-attempt calls: low versus high effort on ten **purposively selected
development** cases, one fresh pair per case, alternating pair order. This set
is not held out and is not the 50-case V25 scorecard.

- Difficult decision/scope cases: C07, C12, C13, C22, C34, C47.
- Negative and route controls: C01, C30 (Self care), C02 (Emergency), C50
  (Priority async). Those reference labels are scoring-only, never input.
- Fixed: original patient, original generated context and selected passages,
  original full producer prompt/schema, model `anthropic/claude-opus-5`, one
  step, retries zero, 600,000 ms deadline, adaptive thinking.
- **4,096 output tokens in both arms**, allowing more reasoning room than the
  prior 2,400-token studies. Do not compare their latencies as an effort effect.
- Only provider `effort` differs: low versus high. No prompt additions,
  replacement source, online judge, repair, embeddings or retrieval changes.
- C47 retains its original MedlinePlus packet. The source probe remains a
  separate experiment; this is not an effort/source factorial study.
- Legacy journal slots `full` and `brief` mean low and high respectively;
  **both use the full output contract**.

Score completed and eligible proposals separately, with failures/withholds
retained. Fixed agreement coverage uses the **ten selected non-null references**,
not 49 and not only successful calls. Exact async priority matters. Acuity is
separate from disagreement; disagreement is not adjudicated harm. Full gate
replays do not authorize publication or prove clinical correctness. The existing
scope-negation concern is reviewed across original patient, context and complete
draft, not by counting a reassuring token or citation alone.

## Identity, money, failure handling

The completed source probe is reproduced and all its raw journals and 474
inherited file hashes verified before freezing this plan. Its conservative
cumulative exposure is $75.937696, leaving $14.062304 of the same **$90** ceiling.
All 20 worst-case reservations ($12.892780) must fit before the first
call. No concurrent paid phase is allowed. Known usage uses the existing doubled
input-plus-output conservative accounting; unknown/invalid usage retains its
complete reservation. A process interruption does not authorize retrying a
started slot. Individual provider and decoder failures are retained rows, not
reasons to abandon the remaining cohort. Data-integrity or budget failure stops
dispatch, not clinical disagreement.

Gold and historical outputs are immutable. No gold, prior route or early-action
decision enters model input. Started records bind the frozen fingerprint,
packet, effort options and reservation. Raw provider output is saved before
evaluation. Scoring recomputes evaluation and cost bindings; changing a score
file cannot conceal a raw failure. `unsafe_advice`, `unsupported_claims`,
`claim_support` and `clinical_correctness` stay `not_assessed` without separately
qualified assessment artifacts.

```sh
node --experimental-strip-types --test tests/effort-alignment-probe.test.ts
node --experimental-strip-types scripts/effort-alignment-probe.ts plan outputs/effort-alignment-probe-2026-09-15
node --experimental-strip-types scripts/effort-alignment-probe.ts run outputs/effort-alignment-probe-2026-09-15 EXACT_PRINTED_FINGERPRINT
node --experimental-strip-types scripts/effort-alignment-probe.ts score outputs/effort-alignment-probe-2026-09-15 report-NEW.json
```

No calls occur on import, planning, tests or scoring. Use a new directory only
for the single frozen mission and a new filename for replay. A separate report
will preserve lift, null or regression; no automatic live configuration change.
