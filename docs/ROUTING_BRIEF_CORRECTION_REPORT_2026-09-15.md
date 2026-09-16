# Brief contract correction — completed, not promoted

The smaller contract was unnecessarily rejecting valid source references and
misusing its transport field. Correcting those defects increased mechanically
eligible proposals from **3/8 to 7/8**, without changing any paired raw route.
This is a real contract improvement, **not improved clinical decision-making**.
Physician alignment remains incomplete. Neither brief is a patient response or
a `gates_only` release, and the live V25 GUI remains unchanged.

## Frozen comparison

Eight selected development cases, two fresh calls each. Journal arm `full` means
brief v1; `brief` means brief v2. Both use Opus 5, adaptive low effort, 2,400 output
tokens, one step, no retries and the identical original patient/context/evidence
packet. V2 restores the original TRANSPORT paragraph and schema resource limits;
shorter writing targets become diagnostics, not clinical admission criteria.
No new clinical policy, retrieval, judge, repair, gold input or publication.

- Freeze: `568c12c`.
- Plan: `outputs/routing-brief-correction-live-2026-09-15/plan.json`.
- Fingerprint: `84e2df5bf4c0d295cc337b909018032ba0ff8371156e73e79ab98b82b6dcb1da`.
- All 596 bound files and 16 execution/accounting/evaluation records verified.
- `report.json` and `report-replay.json` are byte-identical, SHA-256
  `60b7ad21b0e3b3648aeffb3cd9483c7b2ef2ed4833eb49a034e3ed72f505a4cc`.

The earlier `outputs/routing-brief-correction-2026-09-15/plan.json` was superseded
before any call because an audit added the terminal budget assertion. That
unrun plan remains preserved; it is not an additional attempt or expense.

## Results

| Metric | Brief v1 | Brief v2 |
| --- | ---: | ---: |
| Provider completes | 8/8 | 8/8 |
| Eligible routing proposals | 3/8 | 7/8 |
| Agreement among eligible proposals | 3/3 | 6/7 |
| Agreement coverage, fixed reference denominator | 3/8 | 6/8 |
| Issued transport conflicts | 1 | 1 |
| Median producer latency | 12.707 s | 13.614 s |
| p95 producer latency, nearest rank | 17.074 s | 17.920 s |
| Median output tokens | 684.5 | 745.5 |

Median paired latency change: **+0.795 seconds**. This is provider latency, not
time to actionable care, whole-workflow latency or browser paint. All eight raw
route pairs are identical; mechanical eligibility exposes an existing C32
disagreement rather than causing a new one. No over-reference-acuity difference
was observed; C32 is below reference. Disagreement is not adjudicated harm.

| Case | Raw route, both arms | V1 admission | V2 admission |
| --- | --- | --- | --- |
| C02 | Emergency now | Eligible; reference match | Eligible; reference match |
| C14 | Emergency now | Unexpected activation quote | Eligible; reference match |
| C17 | Emergency now | Unexpected activation quote | Eligible; reference match |
| C20 | Emergency now | Three citations exceeded v1 maximum | Eligible; reference match |
| C30 | Self care | Eligible; reference match | Eligible; reference match |
| C31 | Emergency now, ED transport | Activation-quote misuse and issued 911 conflict | Issued 911 conflict remains |
| C32 | Self care | Three citations exceeded v1 maximum | Eligible; reference is Standard async |
| C50 | Priority async | Eligible; reference match | Eligible; reference match |

All **38 raw source references resolve exactly**. That does not make their
claims supported or their patient application correct. Unsafe advice, unsupported
claims, claim support and clinical correctness remain `not_assessed`; there was
no calibrated clinical assessment or patient publication.

## Clinical and RAG findings that still matter

- C32 calls the child well-appearing and says temperature was not measured.
  School attendance and eating are reported; a clinical examination and absence
  of measurement are not. It uses the natural history and severity of diagnosed
  AOM to support delaying assessment of undiagnosed ear pain. Its own limitation
  acknowledges missing otoscopy. This is an applicability problem, not a broken
  citation. It does not prove that all initial earache self-care is indefensible.
- C31 recognizes an emergency in both arms but chooses ED attendance rather than
  preserving the earlier unconditional 911 instruction. The retained block is a
  transport conflict, not a missed emergency label. Feeding that earlier answer
  into the producer merely to force agreement would not test independence.
- C20 repeats a compiled source's broad immediate-CT rule for anticoagulation or
  age over 65. The actual case has independent concerning post-traumatic symptoms;
  correct routing does not validate every generalized imaging assertion.
- C17's compiled 48-hour decompression statement is not permission to wait for
  emergency assessment. V2 calls out the statement's unverified provenance.
- C14's source language about progressive airway risk/intubation requires
  assessment; a plausible emergency route does not establish an observed airway
  stage or a confirmed treatment indication.

These are specific engineering-review observations, not a retrospective fabricated
clinical score. Better evidence requires preserving diagnostic prerequisites,
population and conditions—not simply adding citations or increasing model effort.

The preceding effort probe also exposed a limited wording detector: it catches
“saline rinses” but misses “saline nasal rinses.” Its apparent extra full-response
gate pass is therefore not established clinical improvement. Historical outputs
and gate results remain unchanged; no regex fix is silently applied to the frozen
comparison.

## Spend and verification

| Ledger | USD |
| --- | ---: |
| Prior cumulative accounted exposure | 80.283186 |
| This probe base usage estimate | 1.770750 |
| This probe conservative accounted exposure | 3.250550 |
| Cumulative against the same $90 ceiling | 83.533736 |
| Remaining before any further work | 6.466264 |

Base and conservative values are alternative accounting views, not additive.
All usage is known; no missing result has been converted to zero expense.
Thirteen new focused tests, lint, type-checking and the full configured root test
command passed. A separate read-only audit verified scoring, raw references and
accounting. No new GUI run, release, clinical approval or remote push occurred.

```sh
node --experimental-strip-types scripts/routing-brief-correction-probe.ts score outputs/routing-brief-correction-live-2026-09-15 report-NEW.json
node --experimental-strip-types --test tests/routing-brief-v2.test.ts tests/routing-brief-correction-probe.test.ts
```

Use a new report filename. Keep all started slots and raw failures. Do not pool
these selected unpublished proposals with V25's released-response denominator.
