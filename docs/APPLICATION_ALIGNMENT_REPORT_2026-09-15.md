# Guidance scope and patient application: controlled comparison

**Physician alignment not obtained. Do not promote this candidate.** All 100
planned calls finished and parsed, but eligible reference-agreement coverage fell
from **24/49 to 22/49**. The partial application check introduced binding
failures without establishing correct application of the source to the patient. V25 remains frozen.

## What was actually changed

The unpublished candidate replaces two producer policy sections. It distinguishes
general OTC/product-label education from an unresolved individualized treatment
task, and asks the producer to retain source conditions when applying evidence.
For a source with an authored application contract, the same producer supplies
condition states and original patient quotations. The server checks source and
patient identity, complete condition coverage, and whether the producer declared
unknown/not-met prerequisites while asserting current eligibility.

No new clinical model, supervisor, judge, repair pass, retriever or embedding was
added. Nothing was imported into the live V25 path. Gold was read only by offline
scoring; it was not a producer input, query, source or application condition.

## Frozen comparison, not a new live scorecard

- Code freeze: `30b2fee`.
- Plan fingerprint: `152655044f973e6a805e6d239a0f0793e2714e80f600bcff3d436f7d9e5c37c0`.
- Artifacts: `outputs/application-alignment-2026-09-15`.
- Same 50 original patient/context/evidence packets in both arms; 100 fresh
  first-attempt producer slots, alternating arm order, no reruns or repair.
- Model: `anthropic/claude-opus-5`, adaptive low effort, 4,096 output tokens,
  one step, no retries, 600,000 ms request deadline.
- Baseline retains the full original wire schema. Candidate adds
  `sourceApplications`. This is a policy-and-output-contract experiment, **not a
  prompt-only ablation**. Both arms use the same 4,096 cap, which differs from
  historical live V25's 2,400.
- No fresh context, retrieval or early-safety calls. Historical issued notices
  are scoring-only compatibility inputs, not current early-action measurements.
- Existing V25 mechanical gates are replayed unchanged. Candidate application
  failures additionally block only the experimental candidate response.
- All cases are development cases. This is not held-out or physician-blinded
  validation. Neither arm was published to patients or the GUI.

## Denominators and non-claims

Provider completion, parsing, gate admission, eligible response and physician
agreement are different outcomes. Agreement coverage always uses the 49 cases
whose frozen `acceptedRoutes` are non-null; C25 remains a displayed completion
and cost row but is excluded from agreement and acuity deviations. Conditional
agreement includes only eligible responses with non-null reference routes.

Raw route agreement includes withheld proposals and is diagnostic, not successful
delivery. Standard and Priority async have the same acuity rank for under/over
counting: a priority disagreement can reduce route agreement without appearing
in either acuity count. Route disagreement is not adjudicated harm.

Latency measures real producer completion, not GUI paint, initial actionable
instruction or total live retrieval latency. A clean mechanical check is not
evidence of supported medical advice. Global `unsafe_advice`,
`unsupported_claims`, `claim_support` and `clinical_correctness` stay
`not_assessed`; separately identified engineering findings have their own
limited review artifacts. No physician attestation is invented for new drafts.

## What this application check does not establish

The authored source catalog is small and explicit. In the unchanged V25 packets,
contracts are present for C26/C32's compiled AOM source and C47's retained
insomnia source. Neither C26 arm cites the ear source. The two alternative CDC/NHLBI
source contracts are not substitutions in this study. No complete Ottawa witness
is present for the ankle packet, so no Ottawa eligibility rule is silently added.
This does **not** constitute generalized application coverage for all 50 cases.

Exact source identity and original-patient spans can be checked mechanically.
The producer still interprets the clinical meaning of those spans. An unrelated,
historical, negated or wrong-person quote may therefore be assigned to a false
`reported_met` condition. A `general_information` label also cannot prove that
other free prose avoids a patient-specific assertion. Clean results are labelled
`not_assessed`, never semantic approval.

Consequently this is a partial negative check and inspectable audit structure,
**not the general claim-entailment AND patient-applicability gate sought by the
mission**. Its usefulness must be measured rather than inferred from its schema.
The independent synthetic audit and actual-response boundary review below test
that distinction.

## Final results and decision

| Metric | Fresh baseline | Application candidate |
| --- | ---: | ---: |
| First attempts / planned | 50/50 | 50/50 |
| Real provider completions | 50/50 | 50/50 |
| Parsed full responses | 50/50 | 50/50 |
| Existing V25 gates admitted | 31/50 | 30/50 |
| Eligible after all experimental checks | 31/50 | 27/50 |
| Eligible physician agreement / fixed reference cohort | **24/49 (49.0%)** | **22/49 (44.9%)** |
| Agreement conditional on eligible, non-null reference | 24/31 (77.4%) | 22/27 (81.5%) |
| Raw route agreement, including withheld proposals | 37/49 | 38/49 |
| Raw lower / higher care-setting acuity than reference | 12 / 0 | 11 / 0 |
| Provider / parse / evaluator errors | 0 / 0 / 0 | 0 / 0 / 0 |
| Producer completion median | 14.805 s | 15.276 s |
| Producer completion p95 | 19.706 s | 17.160 s |
| Conservative API accounting | $10.412060 | $11.195785 |

All 100 starts have a retained result and evaluation. No missing slots, reruns,
debug retries or partial-only rows were substituted. The paired latency delta
is +0.397 s median and +2.745 s p95, candidate minus baseline. Fifty paired
development cases do not establish a stable tail-latency or clinical effect.

The higher **conditional** agreement is not a win: more answers were withheld.
Candidate eligibility before the added application block would be 30/50 with
24/49 agreement coverage, equal to baseline coverage. This is a diagnostic
ablation, not a relaxed release or permission to publish those answers. Fixing
only the new identifier failures therefore would not establish the required
completion/coverage improvement in this comparison.

Only four raw routes changed: C05 EM→IP lost agreement, C19 SELF→STD gained raw
agreement but conflicted with historical issued care, C32 SELF→STD gained raw
agreement but failed the new binding, and C49 SELF→STD remained below its IP
reference and historical issued care. C05 is a reference regression requiring
review, not an adjudicated-harm label. There is no basis for a fresh live
promotion cohort from these results.

### Did the application layer help?

The candidate made C32's reasoning more appropriate to the supplied evidence:
it cited the diagnostic prerequisites and kept examination findings unknown.
That is a specific qualitative improvement. It nevertheless returned the
sidecar's `rule` value instead of the required contract `id`. The interface
exposed both names and requested `ruleId`: this ambiguity is our engineering
defect, not a clinical failure.

Candidate application blocks were C03, C18, C32 and C47, all
`APPLICATION_CITATION_COVERAGE_INVALID`. C03/C18 invented bindings when no
source contract applied; C32/C47 used the rule name instead of the contract ID.
Only C03/C32/C47 caused additional eligibility losses because C18 already failed
core timing. **None of these four is a demonstrated semantic error detection.**

Only C32/C47 actually cited contracted sources: baseline expected three binding
records and candidate two. No valid non-vacuous binding was completed in either
arm. Baseline was never asked for those records, so its missing-binding count
cannot be compared as a clinical defect rate. Empty arrays on uncatalogued
sources are not positive application coverage.

C47 still declared absent functional decline from a mixed functioning/tiredness
report. The bounded checker caught baseline's wording but missed the candidate's
paraphrase; candidate withholding came from the identifier error. C22 remained
Self care with incomplete injury assessment, and C34/C38 remained Self care
against their async reference. C26 remained reference-concordant Self care.
The general guidance-scope policy therefore did not resolve the medication
boundary or overall alignment.

The [27 synthetic probes](APPLICATION_GATE_LIMITS_2026-09-15.md) further found
12/12 false/unestablished condition mappings and 3/3 misleading use labels
structurally complete and unblocked. All nine integrity/state/coverage negative
controls were blocked, and all three allowed controls remained unblocked. These
are deliberately authored contract probes, **not a clinical error-rate estimate**.
The main agent independently reran their network-disabled reproduction.

The [actual-response boundary review](APPLICATION_ALIGNMENT_BOUNDARY_REVIEW_2026-09-15.md)
records narrow source/patient mismatches and improvements without reading gold or
claiming blinded physician adjudication. The
[independent scoring audit](APPLICATION_ALIGNMENT_SCORING_AUDIT_2026-09-15.md)
reconciles all attempts, denominators and budget against the frozen artifacts.

### Cut / kept

- **Cut from promotion:** the new policy-and-binding candidate. Do not add its
  extra response responsibilities to the live router, call its state declarations
  verified patient predicates, or start another paid phase merely because funds
  remain. The predeclared lift criterion failed.
- **Kept off-path:** reproducible policy/application code, integrity tests,
  adversarial counterexamples and all 100 raw outputs. They are research
  artifacts, not extra stages in the product.
- **Kept live unchanged:** V25 gates-release, one disposition producer, existing
  parallel early-safety/context work, evidence packet, issued-care protection and
  logging. No judge/repair, supervisor, source replacement or embedding rebuild
  was introduced.
- **Kept immutable:** original CSV, physician acceptedRoutes, prior scorecards,
  saved reviews and earlier outputs. All 106 frozen dependency/input hashes
  remained identical after the run.

The smallest defensible next design is to stop making the producer duplicate
machine-known identifiers and operational handoff state, and to distinguish
quoted general/conditional evidence from a verified current-eligibility claim.
The latter needs trustworthy predicate evidence, not more producer-written flags.
Canonical rendering may reduce a bounded publication surface; it must not be
called a complete self-care answer or used to publish withheld clinical prose.
Those changes remain **unimplemented/unproven future work**, not this mission's
earned result. No new agents or URL expansion are justified by this experiment.

## Spend ledger and verification

| New mission accounting | USD |
| --- | ---: |
| Authorized hard ceiling | 95.000000 |
| Known base-token estimate, all 100 calls | 11.925685 |
| Conservative accounted exposure, input multiplier included | **21.607845** |
| Unknown-usage holds / unfinished slots | 0 / 0 |
| Reconciled remaining ceiling | **73.392155** |

The conservative figure is not an invoice. Token prices and accounting policy
are pinned in the plan; all calls report usage. Historical $84.687986 is a
separate prior mission and was not charged again. No further calls were made
after the completed comparison because promotion was not earned, **not because
an invented lower budget limit was reached**.

The paid command was:

```bash
PAID_EVAL_UNLOCK=95 MASTRA_TELEMETRY_DISABLED=true \
node --experimental-strip-types scripts/disposition-study.ts run \
  outputs/application-alignment-2026-09-15 \
  152655044f973e6a805e6d239a0f0793e2714e80f600bcff3d436f7d9e5c37c0
```

`npm test`, `npm run lint`, `npm run typecheck` and all 43 focused tests passed.
The complete report was independently re-scored into
`verification-report-01.json`. Physician-gold SHA-256 remains
`19a37b5ab11f7ed4f266d0d4adb0bf8dd4ba977a6aed1af7c83e3b8bfc6c6598`.
No live/shared GUI import changed, no new GUI build was promoted, and no GUI
readiness or clinical-readiness claim is made.

## Per-case first attempts, including withheld answers

Abbreviations: SELF = Self care; STD/PRI = Standard/Priority async; IP = in-person
today; EM = Emergency now. “Eligible” means the experimental mechanical checks
admitted the draft, **not physician approval**. Blocker IDs identify software
conditions, not clinical-harm labels. Issued-care conflicts include transport
reductions within the same emergency bucket.

| Case | Frozen accepted routes | Baseline route / outcome | Candidate route / outcome | Baseline blockers | Candidate blockers |
| --- | --- | --- | --- | --- | --- |
| C01 | SELF | SELF / withheld | SELF / withheld | intake_is_not_hydration_exam | intake_is_not_hydration_exam |
| C02 | EM | EM / eligible | EM / eligible | — | — |
| C03 | PRI or STD | STD / eligible | STD / withheld | — | application_binding |
| C04 | IP | IP / eligible | IP / eligible | — | — |
| C05 | EM | EM / eligible | IP / eligible | — | — |
| C06 | STD | STD / withheld | STD / withheld | action_timing_present | action_timing_present, no_unauthorized_medication_change |
| C07 | STD | SELF / eligible | SELF / withheld | — | intake_is_not_hydration_exam |
| C08 | EM | EM / eligible | EM / withheld | — | quoted_patient_evidence |
| C09 | EM | EM / withheld | EM / withheld | transport_intent | transport_intent |
| C10 | STD | STD / withheld | STD / withheld | action_timing_present | action_timing_present |
| C11 | SELF | SELF / eligible | SELF / eligible | — | — |
| C12 | EM | IP / eligible | IP / eligible | — | — |
| C13 | PRI | SELF / eligible | SELF / eligible | — | — |
| C14 | EM | EM / eligible | EM / eligible | — | — |
| C15 | STD | STD / withheld | STD / eligible | action_timing_present | — |
| C16 | EM | IP / withheld | IP / withheld | issued_care_conflict, care_reconciliation | issued_care_conflict, care_reconciliation |
| C17 | EM | EM / eligible | EM / eligible | — | — |
| C18 | STD | STD / eligible | STD / withheld | — | action_timing_present, application_binding |
| C19 | STD | SELF / withheld | STD / withheld | issued_care_conflict, care_reconciliation | issued_care_conflict, action_timing_present, care_reconciliation |
| C20 | EM | EM / eligible | EM / eligible | — | — |
| C21 | EM | EM / eligible | EM / eligible | — | — |
| C22 | STD | SELF / eligible | SELF / eligible | — | — |
| C23 | EM | EM / eligible | EM / withheld | — | issued_care_conflict, care_reconciliation |
| C24 | STD | STD / withheld | STD / withheld | action_timing_present | action_timing_present |
| C25 | null — excluded | IP / withheld | IP / withheld | issued_care_conflict, care_reconciliation | issued_care_conflict, care_reconciliation |
| C26 | SELF | SELF / eligible | SELF / eligible | — | — |
| C27 | EM | EM / eligible | EM / eligible | — | — |
| C28 | EM | IP / withheld | IP / withheld | issued_care_conflict, care_reconciliation | issued_care_conflict, care_reconciliation |
| C29 | STD | STD / withheld | STD / withheld | action_timing_present | action_timing_present |
| C30 | SELF | SELF / eligible | SELF / eligible | — | — |
| C31 | EM | EM / withheld | EM / withheld | issued_care_conflict, care_reconciliation | issued_care_conflict, care_reconciliation |
| C32 | STD | SELF / eligible | STD / withheld | — | application_binding |
| C33 | EM | EM / eligible | EM / eligible | — | — |
| C34 | STD | SELF / withheld | SELF / withheld | irrigation_support_missing | irrigation_support_missing |
| C35 | EM | EM / eligible | EM / eligible | — | — |
| C36 | STD | STD / withheld | STD / eligible | action_timing_present | — |
| C37 | EM | EM / eligible | EM / eligible | — | — |
| C38 | STD | SELF / eligible | SELF / eligible | — | — |
| C39 | EM | EM / withheld | EM / eligible | transport_intent | — |
| C40 | STD | STD / withheld | STD / withheld | action_timing_present | action_timing_present |
| C41 | EM | EM / eligible | EM / eligible | — | — |
| C42 | STD | STD / withheld | STD / withheld | action_timing_present | action_timing_present |
| C43 | IP | IP / eligible | IP / eligible | — | — |
| C44 | EM | EM / eligible | EM / eligible | — | — |
| C45 | STD | STD / eligible | STD / eligible | — | — |
| C46 | STD | STD / withheld | STD / withheld | action_timing_present | action_timing_present |
| C47 | STD | SELF / eligible | SELF / withheld | — | application_binding |
| C48 | EM | EM / eligible | EM / eligible | — | — |
| C49 | IP | SELF / withheld | STD / withheld | issued_care_conflict, care_reconciliation | issued_care_conflict, care_reconciliation |
| C50 | PRI | PRI / eligible | PRI / eligible | — | — |

## Reproduce

From the repository root, verify the frozen plan and rescore into a NEW filename:

```bash
node --experimental-strip-types scripts/disposition-study.ts score \
  outputs/application-alignment-2026-09-15 reproduction-report-01.json
node --experimental-strip-types --test \
  tests/application-policy-candidate.test.ts \
  src/evidence/rag/source-application.test.ts \
  tests/disposition-study.test.ts
```

Do not overwrite a prior report or rerun started producer slots. The original
paid command is recorded in the plan/report and uses the single separately
claimed $95 mission balance. Its fingerprint verifies the frozen dependency
closure, prompts, schemas and source packets before execution and scoring.
