# Workflow-aware disposition study — September 16, 2026

## Decision and main observations

**Retain the selected GUI and existing demonstration configuration. This study supports focused clinician review and a better prospective evaluation, not promotion or a model-improvement claim.** All 1,568 planned disposition calls completed with valid structured outputs. Independent offline calculations reproduced the saved scorecard without discrepancies; this verifies artifacts and arithmetic, not clinical correctness.

- The contemporary Fable baseline agreed with the familiar physician-v3 reference on **45/50 and 46/50** messages. Historical saved outputs agreed on **48/50 when reassessed against v3**, despite exact logical request-body parity for all 100 new baseline requests.
- On familiar cases, Fable's evidence arm scored 46/50 in both repetitions and resolved C47 relative to the explicit-contract arm. Nano's evidence arm scored 43/50 versus its baseline's 40/50, but introduced required-clinician misses at C15 and C40. Higher agreement did not satisfy the registered developmental screen.
- On the 48 AI-authored challenges, Fable's async-context arm agreed with proposed targets on 45/48 in both repetitions. Evidence versus contract produced mixed changes for both models. **These targets have no independent clinician validation and are not clinical ground truth.**
- The registered screen missed a case substitution: Fable async-context repetition 2 resolved the baseline urgent miss at C49 but introduced one at C43, leaving urgent sensitivity unchanged. Its saved screen status remains unchanged; the limitation is explicit below.
- Real embeddings changed selected-card order for **0/98** messages. There is no demonstrated advantage of dense ranking over lexical selection in this run.

## Design, provenance and chronology

The [research plan](WORKFLOW_AWARE_RESEARCH_PLAN_2026-09-16.md) specified four paired arms, two models and two repetitions. Fifty familiar development messages were assessed against an unchanged single-physician **post-output** v3 reassessment. Forty-eight AI-authored development challenges form 24 paired families; their proposed accepted-route sets were frozen separately. The cohorts are never pooled as clinical evidence.

| Arm | Intervention |
|---|---|
| A — baseline | Original stripped three-bucket prompt. |
| B — async context | A plus an explanation that physician assessment can begin through messaging, without a guaranteed response deadline or confirmed examination/testing capability. |
| C — workflow contract | Explicit definitions of all three pathways, plus instructions distinguishing missing information from negative findings. This is a combined prompt intervention. |
| D — workflow evidence | C plus selected source cards and applicability/instruction-boundary guidance. D minus C tests the complete source package, not source text, embeddings or retrieval alone. |

The Fable payload used hosted alias `claude-fable-5-1`, adaptive thinking, low effort and 4,096 maximum output tokens. Nano used the installed `counsel-nano-q5` model, non-thinking mode, context 8,192, output limit 1,024, temperature zero and frozen per-job seeds shared across paired arms. Its installed digest was `36896b6271148892f83130812cb14116beeb2a518f98a0a17b469250b84901c8`. This identifies the recorded local installation; it does not establish an immutable upstream model revision or equivalence to publisher-recommended serving settings.

Each model had one serial worker, with a frozen randomized arm schedule. There was one call per job and no retries, fallback, online judge or output-repair call: 98 messages × 4 arms × 2 models × 2 repetitions = 1,568 calls, 784 per model. Every user payload exactly matched its manifest patient message; independent checks found no case-ID or label markers. Sources entered a separate reference-data section. No reference answers were provided to generation.

All times below are UTC on September 16, 2026.

| Event | Time |
|---|---|
| Known and challenge references frozen | 07:14:53.414726 |
| Embedding generation complete | 07:24:59.105 |
| Complete study plan, schedule and request freeze | 07:29:17.214 |
| First durable disposition call start | 07:30:28.752 |
| Supplementary registration record | 07:30:42.581230 |
| Global generation freeze | 08:36:23.732 |
| Registered offline scorer completed | 08:36:37.004 |
| Independent arithmetic verification completed | 08:37:04.043182 |

**Registration deviation:** the supplementary registration file was recorded **13.829 seconds after the first call start** (13.829230 seconds at stored precision). The reference, retrieval and complete execution-plan freezes preceded disposition generation. This is not a wholly pre-inference registration record, and the late timestamp must not be erased by calling the entire study prospectively registered.

The scorer verified 1,568 jobs, 4,728 generation-artifact hashes and 3,136 disposition-ledger events before reading scoring references. Independent code, without importing scoring functions, matched all 32 aggregate metric cells, 16 repeat families, 16 between-model comparisons and 24 paired baseline comparisons. All 1,568 saved raw/parsed pairs matched. Only `ALL_PHASES` cells were used; overlapping phase summaries were not added again. Hash consistency establishes artifact identity within the retained record, not external attestation or clinical validity.

### Historical baseline parity

All 100 new Fable baseline request bodies (50 messages × 2 repetitions) were deeply equal to the corresponding original 50 bodies: model, system prompt, message, thinking, effort and token limit matched exactly. The historical 150 request/raw/parsed artifacts also matched their completion hashes. The historical run used concurrency four; this study used one worker per model and a different interleaved schedule. Identical logical bodies cannot establish unchanged hosted weights, sampling state, infrastructure or timing; this comparison does not identify the cause of the output variation.

The historical **48/50 is a v3 reassessment of preserved outputs**, with route misses C22 and C47. It is not the original v2 scorecard, which reported 44/49 with C25 excluded. New baseline repetition 1 adds C07 (physician → self-care), C32 (self-care → physician) and C49 (urgent → physician) relative to the historical outputs; repetition 2 adds C07 and C49. Use each arm's contemporary same-model, same-repetition baseline for intervention comparisons. Original CSV labels were not scored as clinical references.

## Endpoint definitions and denominators

“Clinician action” combines `ASYNC_PHYSICIAN` and `URGENT_ESCALATION`; “urgent action” includes only `URGENT_ESCALATION`. A false negative (FN) misses a positive reference endpoint; a false positive (FP) assigns it to a negative reference. Thus a clinician FN is a self-care output where the frozen reference requires clinician action. These are reference-relative classifications, not measured patient harm.

An accepted-route set spanning both endpoint classes is excluded **only from that endpoint**, while route agreement still checks whether the prediction belongs to the accepted set. A failed output on a positive reference would count as an FN; failures on negative references would remain explicit. There were zero failed outputs in this study.

| Cohort | Route denominator | Clinician positive / negative / ambiguous | Urgent positive / negative / ambiguous |
|---|---:|---:|---:|
| Familiar physician-v3 development | 50 | 43 / 7 / 0 | 25 / 25 / 0 |
| AI-authored, unreviewed challenge | 48 | 33 / 9 / 6 | 17 / 26 / 5 |

For every table row, clinician TP = its positive denominator − FN and TN = its negative denominator − FP; the same applies to urgent action. Sensitivity is TP / positive denominator. **Self-care false omission** is clinician FN / endpoint-scorable self-care predictions. Ambiguous-reference self-care predictions are excluded from that denominator, so it can differ from total self-care outputs. It is not an outcome or population-risk estimate.

### Familiar 50: physician-v3 development reference

Each cell lists **repetition 1; repetition 2**. Agreement is accepted-route agreement. C and U denote clinician and urgent endpoints; self-care is the output count.

| Model / arm | Agreement | C FN | C FP | U FN | U FP | Self-care | Self-care false omission |
|---|---|---|---|---|---|---|---|
| Fable A | 45/50; 46/50 | 3; 3 | 1; 0 | 1; 1 | 0; 0 | 9; 10 | 3/9; 3/10 |
| Fable B | 45/50; 46/50 | 3; 2 | 1; 1 | 1; 1 | 0; 0 | 9; 8 | 3/9; 2/8 |
| Fable C | 45/50; 45/50 | 3; 3 | 1; 1 | 1; 1 | 0; 0 | 9; 9 | 3/9; 3/9 |
| Fable D | 46/50; 46/50 | 2; 2 | 1; 1 | 1; 1 | 0; 0 | 8; 8 | 2/8; 2/8 |
| Nano A | 40/50; 40/50 | 3; 3 | 5; 5 | 3; 3 | 0; 0 | 5; 5 | 3/5; 3/5 |
| Nano B | 37/50; 37/50 | 8; 8 | 4; 4 | 4; 4 | 0; 0 | 11; 11 | 8/11; 8/11 |
| Nano C | 41/50; 41/50 | 3; 3 | 2; 2 | 4; 4 | 0; 0 | 8; 8 | 3/8; 3/8 |
| Nano D | 43/50; 43/50 | 3; 3 | 1; 1 | 3; 3 | 0; 0 | 9; 9 | 3/9; 3/9 |

Fable B reduced clinician FN from three to two only in repetition 2; C did not improve agreement or FN counts. D consistently resolved C47 but retained C07 and C22 clinician misses and C49 urgent misses. Nano B increased clinician misses from three to eight; C reduced reference-negative referrals but introduced C40 and increased urgent misses. D reduced referrals and urgent misses relative to C while substituting clinician misses. None of these aggregate changes establishes safer clinical care.

### Authored 48: proposed targets only

The same notation applies. These are engineering diagnostics against AI-authored targets, not physician-validated performance.

| Model / arm | Agreement | C FN | C FP | U FN | U FP | Self-care | Self-care false omission |
|---|---|---|---|---|---|---|---|
| Fable A | 42/48; 43/48 | 4; 3 | 0; 0 | 2; 2 | 0; 0 | 19; 18 | 4/13; 3/12 |
| Fable B | 45/48; 45/48 | 2; 2 | 0; 0 | 1; 1 | 0; 0 | 17; 17 | 2/11; 2/11 |
| Fable C | 44/48; 45/48 | 4; 3 | 0; 0 | 0; 0 | 0; 0 | 19; 18 | 4/13; 3/12 |
| Fable D | 45/48; 44/48 | 3; 4 | 0; 0 | 0; 0 | 0; 0 | 18; 19 | 3/12; 4/13 |
| Nano A | 33/48; 33/48 | 4; 4 | 5; 5 | 7; 7 | 1; 1 | 9; 9 | 4/8; 4/8 |
| Nano B | 33/48; 33/48 | 9; 9 | 3; 3 | 6; 6 | 1; 1 | 18; 18 | 9/15; 9/15 |
| Nano C | 37/48; 37/48 | 3; 3 | 1; 1 | 7; 7 | 1; 1 | 17; 17 | 3/11; 3/11 |
| Nano D | 36/48; 36/48 | 5; 5 | 1; 1 | 7; 7 | 2; 2 | 19; 19 | 5/13; 5/13 |

Fable B has fewer target-relative clinician and urgent misses than A in both repetitions. Fable C and D remove the two baseline urgent misses, while introducing or exchanging clinician misses. Nano B leaves aggregate agreement unchanged while raising clinician misses from four to nine. Nano C improves agreement and lowers clinician FN to three, but introduces new cases; D raises clinician FN to five and urgent FP to two. A favorable total cannot resolve these case-specific tradeoffs or validate the proposed targets.

## Exact endpoint misses and new clinician misses

Lists without a repetition label are identical in both repetitions. “New versus A” compares to the contemporary baseline within the same model, cohort and repetition. The challenge lists retain their unreviewed-target status.

### Familiar 50

| Model / arm | Clinician FN IDs | Urgent FN IDs | New clinician FN IDs versus A |
|---|---|---|---|
| Fable A | C07, C22, C47 | C49 | baseline |
| Fable B | r1: C07, C22, C47; r2: C07, C47 | r1: C49; r2: C43 | none |
| Fable C | C07, C22, C47 | C49 | none |
| Fable D | C07, C22 | C49 | none |
| Nano A | C19, C39, C47 | C04, C39, C49 | baseline |
| Nano B | C04, C09, C13, C19, C22, C39, C40, C47 | C04, C09, C39, C49 | C04, C09, C13, C22, C40 |
| Nano C | C19, C40, C47 | C04, C12, C23, C49 | C40 |
| Nano D | C15, C19, C40 | C04, C23, C49 | C15, C40 |

### Authored 48

| Model / arm | Clinician FN IDs | Urgent FN IDs | New clinician FN IDs versus A |
|---|---|---|---|
| Fable A | r1: WP01A, WP04B, WP05B, WP06B; r2: WP01A, WP04B, WP05B | WP02B, WP03B | baseline |
| Fable B | WP04B, WP05B | WP02B | none |
| Fable C | r1: WP01A, WP04B, WP06B, WP07A; r2: WP01A, WP05B, WP07A | none | WP07A |
| Fable D | r1: WP01A, WP05B, WP06B; r2: WP01A, WP05B, WP06B, WP08B | none | r1: none; r2: WP06B, WP08B |
| Nano A | WP04B, WP06B, WP08B, WP16B | WP02B, WP03B, WP09A, WP16B, WP18B, WP20B, WP24B | baseline |
| Nano B | WP01A, WP02B, WP04B, WP06A, WP06B, WP08B, WP13A, WP16B, WP20B | WP02B, WP09A, WP16B, WP18B, WP20B, WP24B | WP01A, WP02B, WP06A, WP13A, WP20B |
| Nano C | WP05B, WP08B, WP13A | WP02B, WP03B, WP09A, WP18B, WP20B, WP22B, WP24B | WP05B, WP13A |
| Nano D | WP01A, WP02B, WP08B, WP13A, WP16B | WP02B, WP09A, WP16B, WP18B, WP20B, WP22B, WP24B | WP01A, WP02B, WP13A |

### D versus C: source-package effects

Abbreviations here: SC = self-care, AP = async physician, UE = urgent escalation. These are exact paired output changes, not newly assigned clinical labels.

| Cohort / model / repetition | Exact changes from C to D | Interpretation against frozen reference |
|---|---|---|
| Familiar / Fable / both | C47 SC → AP | Agreement +1; resolves one clinician FN; urgent counts unchanged. |
| Familiar / Nano / both | C12 AP → UE; C15 AP → SC; C32 AP → SC; C47 SC → AP | Agreement +2; resolves C12 urgent FN and C32 FP, introduces C15 clinician FN and resolves C47 clinician FN. Clinician FN stays 3; urgent FN falls 4 → 3. |
| Authored / Fable / r1 | WP04B SC → AP; WP05B AP → SC; WP07A SC → AP | Agreement +1; resolves two clinician misses but introduces WP05B. |
| Authored / Fable / r2 | WP06B AP → SC; WP07A SC → AP; WP08B AP → SC; WP11A AP → UE | Agreement −1; introduces WP06B and WP08B clinician misses, resolves WP07A. WP11A remains within accepted alternatives. |
| Authored / Nano / both | WP01A AP → SC; WP02B AP → SC; WP03B AP → UE; WP05B SC → AP; WP06A AP → UE; WP16B UE → SC | Agreement −1; new clinician misses WP01A, WP02B, WP16B; resolves WP05B. WP16B replaces WP03B as an urgent miss, leaving 7 urgent FN; WP06A adds an urgent FP. |

WP08B's accepted set requires clinician action but spans AP and UE, so it contributes to the clinician endpoint and is excluded from the urgent endpoint. WP02B was already an urgent miss under Nano C; becoming self-care adds a clinician miss without adding another urgent FN. These distinctions explain why one aggregate count can conceal a materially different failure.

## Registered screen and its case-substitution blind spot

The [saved scorer](../scripts/score-workflow-aware.ts) rejects a candidate when it introduces a new required-clinician FN, lowers the urgent true-positive count, or has an unresolved output/protocol failure. It does **not** reject every newly missed urgent case when another urgent case is recovered.

On familiar cases, all Fable B/C/D comparisons retain `no_prespecified_regression_detected`; all Nano B/C/D comparisons are rejected. Nano B and C introduce clinician misses and lower urgent TP; Nano D introduces clinician misses. On authored targets, Fable B is not rejected in either repetition, C is rejected in both, and D is rejected in repetition 2 only; all Nano variants are rejected. The plan's familiar-cohort screen is developmental. Challenge screen labels are additional target-relative diagnostics, not clinical adjudication.

**Fable B, familiar repetition 2:** baseline urgent FN C49 is repaired, while C43 changes UE → AP and becomes a new urgent FN. Both arms still have 24/25 urgent TP. C43 remains clinician-positive, so it is not a new clinician FN. B also resolves C22 clinician FN and adds C32 clinician FP; both arms agree on 46/50. The saved non-rejection status is correct under the registered rule and must not be reclassified retrospectively. It cannot be paraphrased as “no new urgent misses,” “no regression” or clinical safety approval. A future protocol should explicitly register case-level urgent regression checks as well as sensitivity and referral burden.

## Repetition and between-model variation

| Fable arm | Familiar routes stable | Familiar changed IDs | Challenge routes stable | Challenge changed IDs |
|---|---|---|---|---|
| A | 49/50 | C32 | 47/48 | WP06B |
| B | 47/50 | C22, C43, C49 | 48/48 | none |
| C | 50/50 | none | 45/48 | WP04B, WP05B, WP06B |
| D | 50/50 | none | 46/48 | WP08B, WP11A |

For Fable, the entire parsed disposition-plus-rationale object repeated exactly in 5/50 familiar baseline cases and in zero cases in each other arm/cohort family. A stable route does not imply a stable rationale. WP11A's challenge D route change remained within its accepted set.

Nano reproduced every route and every parsed disposition-plus-rationale object across both repetitions in all arms and both cohorts, despite the declared repeat-seed change. This is observed reproducibility for this fixed local run, not correctness, independence of trials or universal determinism.

Fable–Nano route disagreements below are **r1; r2**, with denominators 50 familiar and 48 challenge. Neither model is the reference for the other.

| Arm | Familiar disagreements | Challenge disagreements |
|---|---|---|
| A | 9; 10 | 19; 20 |
| B | 12; 15 | 18; 18 |
| C | 8; 8 | 15; 12 |
| D | 9; 9 | 13; 13 |

## Retrieval result and limits of attribution

The fixed seven-card collection covered adult ankle imaging, sprain care, sleep assessment, pregnancy/NSAIDs, diabetic foot concerns, tuberculosis assessment and pulmonary embolism assessment. Earlier failures informed these narrow topics. Two `text-embedding-3-large` calls produced 1,536-dimensional vectors for 105 entries: seven cards and 98 messages. Hybrid ranking operated only within lexically eligible topics, so it could not recover a query rejected at lexical eligibility.

For all 98 messages, lexical and hybrid selection returned the same card IDs in the same order: **zero selection changes**. Sixty-nine messages had no selected card, 19 had one and 10 had two. The embedding comparison is therefore a negative result for changed selection in this corpus. D-versus-C effects cannot be credited to dense ranking. Moreover, D changes evidence instructions even on no-hit messages, so D is not a clean selected-source-text-only ablation.

Source hashes identify curated cards and selected text; they do not prove archived full-page fidelity, patient applicability or clinical correctness. No-hit does not establish safety. Retrieved text must not supply invented patient findings. Clinical review must check complete rule prerequisites, population, setting and claim support against the exact message and rationale.

## Operational observations and settled accounting

Each row pools 196 distinct calls across the two cohorts and two repetitions for operational description only. Median uses the middle two observations; p95 is the nearest-rank empirical percentile. The table does not duplicate phase and aggregate rows. Seconds include recorded transport and generation time, not time to accepted clinician care or completed treatment.

| Model / arm | Median seconds | p95 seconds | Usage estimate USD | Conservatively accounted USD |
|---|---:|---:|---:|---:|
| Fable A | 4.4480 | 5.940 | 1.44220 | 1.85470 |
| Fable B | 4.5975 | 6.281 | 1.79463 | 2.41881 |
| Fable C | 4.5040 | 5.987 | 2.22877 | 3.31159 |
| Fable D | 4.8960 | 6.614 | 3.67049 | 6.07693 |
| Nano A | 0.9785 | 1.137 | 0.00000 | 0.00000 |
| Nano B | 1.0550 | 1.312 | 0.00000 | 0.00000 |
| Nano C | 1.0880 | 1.484 | 0.00000 | 0.00000 |
| Nano D | 1.3895 | 2.740 | 0.00000 | 0.00000 |

The additional study authorization was **USD 50**, including a USD 1 embedding earmark. Exact decimal sums of the completed ledger are:

| Component | Usage estimate USD | Conservatively accounted USD |
|---|---:|---:|
| Disposition calls | 9.13609000 | 13.66203000 |
| Embeddings | 0.00074464 | 0.00074464 |
| Total | **9.13683464** | **13.66277464** |
| Remaining within the USD 50 cap, using accounted total | — | **36.33722536** |

All 1,570 call starts have matching settlements (1,568 disposition plus two embedding calls); no reservation remains outstanding. Summed historical per-call reservation bounds are not additional spend. These are recorded usage estimates and conservative budget accounting, not invoices. Nano's zero external API charge excludes hardware, energy and operational cost. Prior ledgers and GUI allowances are outside this new allocation. Provider/runtime differences prevent attributing timing or cost differences to model size alone; no service-level or clinical-response guarantee follows.

## Clinical review status and limitations

The generated worksheet contains **1,568 rows marked `not_reviewed`**, with every reviewer, review timestamp and clinical conclusion unset. `clinicalApproval` is false. This report supplies no clinician attestation, new diagnosis, adjudication or replacement label.

Key limits are substantive:

- The familiar reference is a single physician's post-output reassessment of known development material; prior outputs influenced development. It is neither blinded independent validation nor a fresh generalization test.
- The authored challenges and accepted sets were AI-generated and informed by earlier failures. Their 24 paired families are correlated, and some change several details together. Two repetitions do not make 1,568 independent patients or support a population outcome estimate.
- Three route buckets conflate urgency and care capability. “Urgent” combines same-day assessment with immediate emergencies. An async recommendation does not establish examination/testing access, response ownership, guaranteed timing, completed handoff or treatment.
- Rationale text may omit needed reasoning or invent negative findings; structured validity and route agreement do not measure that risk. A rationale is not a faithful transcript of private model reasoning.
- Small cohorts, narrow source topics, selected development hypotheses, two correlated repetitions and many comparisons limit causal attribution. No significance or general model-improvement claim is made.
- Hosted aliases, local quantization, prompting, constrained output formats and serving settings differ. The fixed local digest and payload parity are reproducibility evidence within their scope, not control of every backend variable.
- No patient outcomes, clinician workload study, time-to-action assessment or independent clinical review has been completed. The late supplementary registration and screen blind spot further constrain interpretation.

## Actionable next decision

1. **Keep the current selected GUI and frozen references unchanged.** Treat Fable B's limited-context intervention and D's C47 change as candidates for review, not deployment choices. Nano's repeat stability and higher agreement under C/D do not override new clinician misses.
2. **Have qualified clinicians review the exact changed messages and rationales**, beginning with C43/C49, C15/C40/C47 and the challenge regressions above. Record unknown versus negative findings, enum/rationale consistency, relevant source spans, required assessment, capability and deadline. Preserve disagreement and uncertainty; do not force agreement with the model or authored target.
3. **Define the actual workflow before another efficacy test:** who owns the assessment, what messaging can accomplish, when examination/testing is required, how acceptance and completion are confirmed, and when overdue care escalates. Distinguish next contact from the required action and its time limit.
4. **Prospectively register a fresh, message-only evaluation with independent blinded physician references**, explicit ambiguity handling, case-specific clinician and urgent regression checks, referral burden and rationale review. Use genuinely new messages rather than tuning these familiar cases until scores rise. Assess subgroup and source applicability where the sample supports it.
5. **Require a demonstrated retrieval contribution before expanding complexity.** Separate evidence instructions from selected text in a future ablation, and test whether a broader eligibility/retrieval design changes relevant selection. Couple any later operational study to handoff completion and action timing; model latency alone cannot answer the workflow question.

## Retained evidence and reproducibility

Study ID: `09305122-e86a-49cd-a9c0-b1e6aa65f63f`. The frozen records are retained locally under `outputs/workflow-aware-disposition-2026-09-16/`; this report does not embed patient-message narratives or full provider artifacts. Relevant records are `reference-freeze.json`, `registration.json`, `retrieval/retrieval-comparison.json`, and the study's `manifest.json`, `generation-complete.json`, `scoring-audit-workflow-aware.json`, `scorecard-workflow-aware.json`, `operations-workflow-aware.json`, `budget-workflow-aware.json` and `clinical-review-worksheet-workflow-aware.json`. The settled start/settlement pairs are in `budget-ledger/`.

The [analysis implementation](../scripts/score-workflow-aware.ts), [research plan](WORKFLOW_AWARE_RESEARCH_PLAN_2026-09-16.md), [frozen physician-v3 reference](../data/evaluation/physician-adjudication-v3-2026-09-15.json), [authored proposed targets](../data/research/workflow-aware-v1/challenge-review-targets.json) and [source-card collection](../data/research/workflow-aware-v1/evidence-cards.json) define the scoring and provenance context. Historical parity uses preserved artifacts under `outputs/stripped-3bucket-fable-2026-09-15/`. Offline independent verification found no arithmetic or request-parity discrepancy; it did not manufacture clinical conclusions.

### Appendix: all route-disagreement IDs

Lists without repetition labels apply to both repetitions. These include over-referrals as well as endpoint misses and must not all be called dangerous misses.

**Familiar 50**

| Model / arm | Route-disagreement IDs |
|---|---|
| Fable A | r1: C07, C22, C32, C47, C49; r2: C07, C22, C47, C49 |
| Fable B | r1: C07, C22, C32, C47, C49; r2: C07, C32, C43, C47 |
| Fable C | C07, C22, C32, C47, C49 |
| Fable D | C07, C22, C32, C49 |
| Nano A | C01, C04, C19, C26, C30, C32, C38, C39, C47, C49 |
| Nano B | C01, C04, C09, C13, C19, C22, C26, C34, C38, C39, C40, C47, C49 |
| Nano C | C04, C12, C19, C23, C32, C38, C40, C47, C49 |
| Nano D | C04, C15, C19, C23, C38, C40, C49 |

**Authored 48: disagreement with unreviewed proposed targets**

| Model / arm | Route-disagreement IDs |
|---|---|
| Fable A | r1: WP01A, WP02B, WP03B, WP04B, WP05B, WP06B; r2: WP01A, WP02B, WP03B, WP04B, WP05B |
| Fable B | WP02B, WP04B, WP05B |
| Fable C | r1: WP01A, WP04B, WP06B, WP07A; r2: WP01A, WP05B, WP07A |
| Fable D | r1: WP01A, WP05B, WP06B; r2: WP01A, WP05B, WP06B, WP08B |
| Nano A | WP02B, WP03B, WP04A, WP04B, WP05A, WP06B, WP08B, WP09A, WP10A, WP12A, WP16B, WP17B, WP18B, WP20B, WP24B |
| Nano B | WP01A, WP02B, WP04B, WP05A, WP06A, WP06B, WP08B, WP09A, WP10A, WP13A, WP16B, WP17B, WP18B, WP20B, WP24B |
| Nano C | WP02B, WP03B, WP05B, WP08B, WP09A, WP13A, WP17B, WP18B, WP20B, WP22B, WP24B |
| Nano D | WP01A, WP02B, WP06A, WP08B, WP09A, WP13A, WP16B, WP17B, WP18B, WP20B, WP22B, WP24B |
