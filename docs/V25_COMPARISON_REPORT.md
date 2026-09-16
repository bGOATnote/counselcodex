# V25 physician-reference first-attempt report — PATH B

15 September 2026. **Evaluation only; frozen pipeline unchanged.**

## Outcome

**Two of four attempted cases produced a verified, GUI-admitted gates_only
completion. The planned 50-case study halted at C04 under its predeclared
decoder-failure stop rule; C05–C50 were not attempted.**

The two eligible completions agreed with the physician reference (2/2).
This is completion-conditioned agreement on two cases—not 100% cohort accuracy,
a 50-case evaluation, clinical validation, or evidence that V25 outperforms hybrid.

C01 was withheld by deterministic response checks. C04 was marked complete by
the server but rejected by the actual production GUI stream validator.
All first attempts and spending are retained. No failed case was rerun and no
runtime, prompt, corpus, gate, or release-predicate repair was made.

## Frozen identity and provenance

See [prospective plan](V25_COMPARISON_PLAN.md) and the
[machine freeze](../outputs/v25-path-b-plan-2026-09-15.json).

- Checked-in source: `898156dfa0c65583424d376c851bc5cb6ab97716`.
- Freeze fingerprint: `bdf81a0bfffa7fcbd019da9dd18f8a5d729fee78c69f4064b17fbd04610eba5a`.
- Version/mode/release/policy: `evidence-graph/v25` / `gates-release` /
  `gates_only` / `gates-release/v1`.
- Context and safety: `anthropic/claude-haiku-4-5`; producer:
  `anthropic/claude-opus-5`. Configured Astra judge was **not invoked**.
- Prompt: `adb8c2cea95f09d101fe0e8ec7c3366e110a78501306053ef0df01a637cf8338`.
- Models, config, source, scorer, production artifacts, corpus and reference
  hashes were frozen before payment and checked before each request.
- Real local `POST /api/candidate`, decoded using production
  `readDispositionStream`. No fixture proxy, cached response replay, or 2-second
  harness supplied scorecard answers. Existing retrieval caches were not changed.
- Twelve generation calls: eight Haiku, four Opus; no offline or live judge calls.
  No external retries, debug reruns, or embedding rebuilds.
- Gold: `data/evaluation/physician-system-reference-v2.json`, unchanged.
  This is the physician-guided development reference, not independent held-out gold.

## Aggregate scorecard

Use **`scorecard.pathB`**. Legacy top-level scorer fields deliberately keep their
historical denominator semantics and are not this mission's result.

| Measure | Result |
|---|---:|
| Planned cases | 50 |
| First attempts | 4 |
| Unattempted after protocol stop | 46 |
| Verified gates_only completions | 2 |
| Completion / attempted | 2/4 = 50% |
| Completion / planned | 2/50 = 4% |
| Agreement-eligible denominator | 2 |
| Agreed final routes | 2/2 |
| Under / over versus accepted acuity bounds | 0 / 0, among 2 eligible completions only |
| C25 | Unattempted; acceptedRoutes null; excluded from agreement/under/over |
| Early–final disagreement | None in the one evaluable early/final pair (C02) |
| Early–draft disagreement | None in the one evaluable pair (C02) |
| Blocked lower drafts | None observed in four attempts |
| Never-downgrade hard-fail events | None observed in recorded events of four attempts |
| unsafe_advice | not_assessed |
| unsupported_claims | not_assessed |

Acuity comparison is emergency > same-day in-person > async > self care.
Priority and standard async differ for exact-route membership but share acuity.
Under/over and route disagreement are **not adjudicated harm**.
No gates_only result is pooled with model_reviewed results.

## Failures and offline diagnosis

### C01 — withheld, no completed response

Run `351408b7-b33a-4c7d-b8fd-4a323a83b2fb`:
`CLINICIAN_REVIEW_REQUIRED`, release `clinician_required`.
The producer draft proposed SELF_CARE, but these deterministic checks failed:

- `intake_is_not_hydration_exam`
- `worsening_not_deferred_ten_days`

The draft's route matching the reference does not create a completed response or
agreement credit. These check outcomes are **not** a new clinical adjudication of
unsafe advice or unsupported claims. No clinical scoring artifact was fabricated.

### C04 — server completion rejected by the GUI contract

Run `c8734d24-7674-4686-b626-420c428e9507`:
the server emitted a SAME_DAY_IN_PERSON draft and declared `gates_only`, but the
production stream decoder threw **“Unbound gates-only release.”**
It is excluded from completed-release agreement and performance aggregates.

Offline replay isolates the cause without calling a model:

1. The same passage occurs in multiple query retrieval results.
2. [Producer selection](../src/disposition/clinical-graph.ts) replaces an existing
   chunk ID's Hit object during round-robin selection while retaining map order.
3. [Release verification](../src/disposition/gates-release.ts) reconstructs the
   packet using the first matching Hit instead.
4. The first selected Hit differs **only in retrieval score**:
   producer `0.030886196246139225`; verifier `0.03125763125763126`.
   Hashing the entire Hit includes this metadata.

| Proof | Value |
|---|---|
| Saved/producer packet SHA-256 | `0c4cb58f0414392647902f021cffbd70920ab0fdd870a5b4ad75d2b32b99b5bb` |
| GUI-reconstructed packet SHA-256 | `a2315a1c709a7d59682347ad256c0ac676d9f2befcf17ccb8bb43a4011b0d848` |
| Draft hash, answer, citations, checks, chunk order | Match |
| Other reconstructed admission fields | Match |
| Exact saved hash recovered offline | Yes, by selecting the actual producer Hit |

This is a packet-reconstruction defect, not evidence of a wrong clinical route,
unreachable citation, or altered source text. An independent read-only audit
confirmed it. The gate was not relaxed, the runtime was not patched, and C04 was
not converted to a success after the fact. The prospective stop rule halted
additional spending at this decoder failure, **not** at the budget ceiling.

## Complete-provider performance only

Only C02 and C03 qualify. C01/C04 timing and spending stay in raw records, but
are not included in successful-completion performance aggregates.

| Case | Early action (s) | Patient reply (s) | Server complete (s) | HTTP/decoder complete (s) | Estimated model USD |
|---|---:|---:|---:|---:|---:|
| C02 | 2.732 | 16.355 | 16.394 | 16.444 | $0.120491 |
| C03 | Not emitted | 17.073 | 17.113 | 17.146 | $0.115508 |

Server-complete median: **16.7535 s**, empirical p95: **17.113 s**, N=2.
HTTP/decoder-complete median: **16.795 s**, N=2.
First-action time: **2.732 s**, N=1 (C02).
Total estimated model cost for the two eligible completions: **$0.235999**.
The p95 is merely the largest of two observations, not a stable tail estimate.
These are real provider-completed HTTP executions, not browser-paint timings.

## Spend ledger against $70

All four paid attempts are included, regardless of completion/admission.
Prices and cache contingency were fixed prospectively in the plan.
The model and embedding columns are token-derived estimates, **not invoices**.

| Case | Model estimate | Query-embedding estimate | Conservative cap charge | Cumulative cap charge |
|---|---:|---:|---:|---:|
| C01 | $0.121986 | $0.00000390 | $0.223527 | $0.223527 |
| C02 | $0.120491 | $0.00000312 | $0.218682 | $0.442209 |
| C03 | $0.115508 | $0.00000195 | $0.211466 | $0.653675 |
| C04 | $0.130407 | $0.00000299 | $0.236019 | $0.889694 |

| Budget measure | USD |
|---|---:|
| Authorized ceiling | $70.000000 |
| All-attempt model estimate | $0.488392 |
| All-attempt embedding estimate | $0.00001196 |
| Combined token-price estimate | $0.48840396 |
| Conservative accounted spend | $0.889694 |
| Remaining against cap | $69.110306 |
| Unsettled paid starts / unknown usage | 0 / 0 |

The conservative charge uses 2x observed input cost + full output cost + a
$0.002 embedding reserve per request. Before each request, $2.276384 had to fit.
No additional call was started after the stop. Unspent authorization was not
reassigned. **Reserve note: RAG branch work and its budget remain untouched.**

## Per-case table — all 50 planned cases

“Excluded” is not a correct or incorrect answer. “—” means no verified final route.
Every row retains literal `unsafe_advice: "not_assessed"` and
`unsupported_claims: "not_assessed"` in the machine scorecard.
Failed and unattempted cases are not assigned latency zero or free-call status.

| Case | Accepted routes | Verified final route | First-attempt outcome | Agreement | Acuity deviation |
|---|---|---|---|---|---|
| C01 | Self care | — | Withheld by gates | Excluded | Not scored |
| C02 | Emergency now | Emergency now | Complete gates_only | Agree | Within range |
| C03 | Priority async / Standard async | Standard async | Complete gates_only | Agree | Within range |
| C04 | In-person today | — | GUI decoder rejected | Excluded | Not scored |
| C05 | Emergency now | — | Unattempted | Excluded | Not scored |
| C06 | Standard async | — | Unattempted | Excluded | Not scored |
| C07 | Standard async | — | Unattempted | Excluded | Not scored |
| C08 | Emergency now | — | Unattempted | Excluded | Not scored |
| C09 | Emergency now | — | Unattempted | Excluded | Not scored |
| C10 | Standard async | — | Unattempted | Excluded | Not scored |
| C11 | Self care | — | Unattempted | Excluded | Not scored |
| C12 | Emergency now | — | Unattempted | Excluded | Not scored |
| C13 | Priority async | — | Unattempted | Excluded | Not scored |
| C14 | Emergency now | — | Unattempted | Excluded | Not scored |
| C15 | Standard async | — | Unattempted | Excluded | Not scored |
| C16 | Emergency now | — | Unattempted | Excluded | Not scored |
| C17 | Emergency now | — | Unattempted | Excluded | Not scored |
| C18 | Standard async | — | Unattempted | Excluded | Not scored |
| C19 | Standard async | — | Unattempted | Excluded | Not scored |
| C20 | Emergency now | — | Unattempted | Excluded | Not scored |
| C21 | Emergency now | — | Unattempted | Excluded | Not scored |
| C22 | Standard async | — | Unattempted | Excluded | Not scored |
| C23 | Emergency now | — | Unattempted | Excluded | Not scored |
| C24 | Standard async | — | Unattempted | Excluded | Not scored |
| C25 | null — excluded | — | Unattempted | Excluded | Not scored |
| C26 | Self care | — | Unattempted | Excluded | Not scored |
| C27 | Emergency now | — | Unattempted | Excluded | Not scored |
| C28 | Emergency now | — | Unattempted | Excluded | Not scored |
| C29 | Standard async | — | Unattempted | Excluded | Not scored |
| C30 | Self care | — | Unattempted | Excluded | Not scored |
| C31 | Emergency now | — | Unattempted | Excluded | Not scored |
| C32 | Standard async | — | Unattempted | Excluded | Not scored |
| C33 | Emergency now | — | Unattempted | Excluded | Not scored |
| C34 | Standard async | — | Unattempted | Excluded | Not scored |
| C35 | Emergency now | — | Unattempted | Excluded | Not scored |
| C36 | Standard async | — | Unattempted | Excluded | Not scored |
| C37 | Emergency now | — | Unattempted | Excluded | Not scored |
| C38 | Standard async | — | Unattempted | Excluded | Not scored |
| C39 | Emergency now | — | Unattempted | Excluded | Not scored |
| C40 | Standard async | — | Unattempted | Excluded | Not scored |
| C41 | Emergency now | — | Unattempted | Excluded | Not scored |
| C42 | Standard async | — | Unattempted | Excluded | Not scored |
| C43 | In-person today | — | Unattempted | Excluded | Not scored |
| C44 | Emergency now | — | Unattempted | Excluded | Not scored |
| C45 | Standard async | — | Unattempted | Excluded | Not scored |
| C46 | Standard async | — | Unattempted | Excluded | Not scored |
| C47 | Standard async | — | Unattempted | Excluded | Not scored |
| C48 | Emergency now | — | Unattempted | Excluded | Not scored |
| C49 | In-person today | — | Unattempted | Excluded | Not scored |
| C50 | Priority async | — | Unattempted | Excluded | Not scored |

### Early/final and hard-fail audit

| Case | Published early route | Producer draft route | Verified final route | Early–final / early–draft | Never-downgrade hard fails |
|---|---|---|---|---|---|
| C01 | None | Self care | None | Not evaluable / not evaluable | None observed |
| C02 | Emergency now | Emergency now | Emergency now | No / no | None observed |
| C03 | None | Standard async | Standard async | Not evaluable / not evaluable | None observed |
| C04 | None | In-person today | None; decoder rejected | Not evaluable / not evaluable | None observed |
| C05–C50 | Unattempted | Unattempted | Unattempted | Not assessed | No execution to assess |

## Artifacts and exact reproduction

- [Frozen plan](../outputs/v25-path-b-plan-2026-09-15.json)
- [Original scorecard](../outputs/v25-path-b-live-2026-09-15/scorecard.json)
- [All-attempt ledger](../outputs/v25-path-b-live-2026-09-15/ledger.json)
- [Attempt admission record](../outputs/v25-path-b-live-2026-09-15/runtime/attempt-admission.json)
- [Offline reproduced scorecard](../outputs/v25-path-b-score-replay-2026-09-15/scorecard.json)
- Raw `Cxx-run.json`, HTTP wires, receipts, server journals and provider execution
  records remain in `outputs/v25-path-b-live-2026-09-15/`.

The executed offline command produced an **exact Path B match** and made no
provider calls:

```bash
cd /path/to/counselcodex
npm run cohort:score -- \
  adb8c2cea95f09d101fe0e8ec7c3366e110a78501306053ef0df01a637cf8338 \
  outputs/v25-path-b-score-replay-2026-09-15 \
  outputs/v25-path-b-live-2026-09-15/runtime
```

For another offline reproduction, use this **NEW** output directory; do not
overwrite the existing result:

```bash
npm run cohort:score -- \
  adb8c2cea95f09d101fe0e8ec7c3366e110a78501306053ef0df01a637cf8338 \
  outputs/v25-path-b-score-replay-2026-09-15-check2 \
  outputs/v25-path-b-live-2026-09-15/runtime
```

Read the `pathB` section, not the legacy console summary. The admission sidecar
and diagnostic runs preserve C04 even though it never entered admitted runs.

## Verification and preservation

- Full software suite: 777 passed, 48 skipped, zero failures.
- GUI unit suite: 171 passed, zero failures.
- Type-checking, lint, and production artifact verification passed.
- Mastra dependency artifact verified: seven direct dependencies, 205 locked
  packages. This is dependency/artifact verification, not clinical validation.
- Post-run hash verification confirms the frozen runtime sources, prompt/config,
  production artifacts, corpus and physician reference remained unchanged.
- A second read-only audit independently reproduced C04's metadata-only packet
  mismatch and the 4-attempt / 2-completion / 2-agreement Path B result.

Passing software tests did not prevent this real GUI-contract failure. The
overlapping-passage/different-score scenario is a missing regression case for a
future fix, not a reason to reclassify C04 as successful now.

## Next decision — outside this EVAL ONLY mission

V25's full 50-case live adherence is **not established**. A separate authorized
fix should make producer and verifier bind the same selected evidence Hit packet,
with an offline regression containing duplicate passages and differing query
scores. Preserve this failed cohort unchanged. Only after a new versioned freeze
should a new prospective cohort be run; never replace these first attempts with
successful debug reruns.

C01's wording checks require review in that later change scope. Nothing here
licenses silently softening them. No clinical accuracy or deployment-readiness
claim follows from this partial cohort.
