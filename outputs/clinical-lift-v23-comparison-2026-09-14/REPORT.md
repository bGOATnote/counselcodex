# Independent frozen v22/v23 full-cohort comparison

Both cohorts finished all 50 sequential endpoint assessments. **v23 released four more complete responses and reduced recorded latency, but did not improve five-route agreement with the frozen physician-development reference.** This is a whole-workflow development comparison, not isolated component lift or clinical validation.

The analysis is reproducible with `node outputs/clinical-lift-v23-comparison-2026-09-14/analyze.mjs`. [analysis.json](analysis.json) retains all 100 case records, 50 exact-input pairs, raw-file hashes, source identities, first-producer diagnostics, version-specific model reviews, failure accounting and timing denominators. The script invokes no providers, runtime workflows or new judges and writes nothing itself.

## Frozen identities and population

- v22 fingerprint: `a5b835671f06263c68c0c67e7658320cb21984f41e2d1f600cc210c26488499a`.
- v23 fingerprint: `a968bdeda37b6c07f61c680eea2ae957d3c11ae21d632bff8bbacd185a514003`.
- Each case is paired on the exact patient message SHA-256, not merely case ID. Raw run and result records agree; immutable manifest/reference hashes and recorded cost accounting were independently checked.
- All 50 planned cases remain in completion denominators. The physician-designated DEVELOPMENT reference supplies 49 scoreable route targets; C25 remains qualified and excluded from route-agreement denominators. The clinician's historical incumbent judgment is preserved, not transferred to these candidate outputs.

## Completion, routing and cost

| Metric | v22 | v23 |
|---|---:|---:|
| Started / recorded terminal results | 50 / 50 | 50 / 50 |
| Complete / withheld | 39 / 11 | 43 / 7 |
| Unfinished / unattempted | 0 / 0 | 0 / 0 |
| HTTP-decoder / identity failures | 0 / 0 | 0 / 0 |
| Released five-route reference agreement | 32/49 | 31/49 |
| First actual producer route agreement | 36/49 | 37/49 |
| Stored model-supported alternatives, separate from reference agreement | 6 | 11 |
| Applied / rejected patch records | 34 / 3 | 31 / 1 |
| Provider calls | 270 | 262 |
| Estimated standard-token cost | $23.890503 | $23.796283 |
| Conservatively accounted cohort cost | $29.963129 | $29.845354 |

Costs include failed calls. Both cohorts had zero unknown-usage attempts. Accounted figures add the manifest's 1.25 contingency and per-run embedding allowance; they are not invoices or total sprint spending.

Paired releases: 34 complete→complete; nine withheld→complete (C07, C13, C16, C18, C24, C28, C37, C39, C48); five complete→withheld (C03, C10, C21, C31, C36); two withheld→withheld (C22, C46). These transitions are not automatically improvements or harms: some withholding protects against a remaining defect, while some results were blocked by software contracts.

v23 withheld C03, C10, C21, C22, C31, C36 and C46. Six have `CLINICIAN_REVIEW_REQUIRED`; C36 has `REPAIR_SCOPE_UNAVAILABLE`. Stored review categories are 43 supported, five model concerns and two unresolved; these are model conclusions, not physician adjudication. v23 had two retained `CONTEXT_CONTRACT_FAILED` agent records and no terminal transport/decoder failure. v22 retained two judge-contract failures, three context-contract failures and one incomplete judge stream, including a recovered C25 attempt.

## Latency and early emergency coverage

All values below are elapsed seconds; p95 uses nearest rank. HTTP timing is decoder receipt/completion, not actual browser clicks, paint, clinician receipt or patient action.

| Metric | v22 | v23 |
|---|---:|---:|
| Terminal HTTP median, all 50 outcomes | 68.794 | 65.054 |
| Terminal HTTP p95, all 50 | 91.971 | 81.286 |
| Terminal HTTP maximum, all 50 | 176.514 | 95.803 |
| Complete-only terminal HTTP median | 69.212 (n=39) | 63.525 (n=43) |
| Early emergency receipt median among recorded reference-emergency actions | 3.217 (n=17) | 2.989 (n=17) |
| Early emergency receipt maximum among those actions | 9.755 | 4.076 |

The median **paired** terminal difference across all 50 is −5.061 seconds. Among 34 cases completed in both versions, it is −8.711 seconds. These are distinct statistics; subtracting the two arm medians is not the paired median. Some cases were slower: the largest paired terminal increase was 30.259 seconds. Missing actions/replies are not assigned zero time.

Of 21 reference-emergency cases, 17 emitted an early emergency action in each cohort. The missing-early sets differed: v22 C05/C12/C21/C48; v23 C05/C12/C35/C39. Fourteen of those 21 completed an emergency final answer in each cohort. C05/C12 had no emergency action or displayed emergency result in either cohort; their different routes received model support. These are reference deviations needing clinical adjudication, not automatically proven emergency misses. C48's separate mobility-policy study and this live outcome should not be generalized to all emergencies.

v23 recorded reply wire receipt and post-validation publication separately: 43 replies, median additional validation delay 14ms, p95 24ms, maximum 35ms. v22 did not record that publication metric. Cross-version comparisons use receipt, not a fabricated v22 publication time. Early action and intake-question coverage are reported separately in the JSON.

## First producer versus released final

The first actual producer is the earliest disposition-role record with a paid call, not a later successful retry. Its failure flag and exact output hash are retained; full-schema admission is taken from the immutable study diagnostic bound to that output, not reinterpreted with a newer schema.

- Both cohorts changed C49 from a reference-deviating Standard async first draft to reference-matching In-person today.
- v22 introduced no released route deviation. v23 changed C32 from a reference-matching Standard async first draft to Self-care, a reference deviation supported by its online judge.
- Reference-matching first drafts withheld: v22 five (C18, C24, C37, C46, C48); v23 six (C03, C10, C21, C31, C36, C46).
- v23 model-supported nonmatching alternatives: C05, C07, C12, C13, C16, C28, C32, C34, C38, C44, C47. These eleven remain outside the 31 exact agreements. C25's model-supported qualified result is also separate.

Field edits and route changes are process diagnostics, **not counts of material clinical errors corrected or introduced**. Exact first drafts, source passages, intermediate reviews and final responses still require independent case/claim-level adjudication. Judge acceptance cannot serve as its own gold standard. The stricter v23 provenance/release rules also prevent interpreting model-support differences as a clean judge-quality comparison.

## Supplemental / post-hoc ORIGINAL-LABEL diagnostic

This source-label audit uses Counsel's three original buckets. Priority/Standard async both project to `ASYNC_PHYSICIAN`; Emergency/In-person today both project to `URGENT_ESCALATION`. It does not infer emergency-versus-same-day intent from a source escalation label.

Against the same coarsened physician-development reference (C25 excluded): original supplied labels agree **32/49**, v22 released projection **33/49**, v23 released projection **37/49**. Withheld responses remain `not_completed` (11 v22, seven v23). These three-bucket values must not be compared to five-route agreement as though they were the same metric. Original-label agreement is not a measurement of an original deployed workflow or patient outcomes. All 17 original-label differences and every candidate projection are retained in the JSON.

## Scope and next proof

This comparison includes multiple source, policy, admission, review and client changes executed sequentially at different times. It cannot isolate component causality or remove model stochasticity/provider-load effects. It shows improved completion and timing on this development cohort, not improved five-route reference agreement or independently established clinical accuracy.

The separately proposed C36 field-attribution correction is **post-cohort**. It is not included in these results. Applying it requires a new scope-policy/prompt identity and separately labeled GUI verification; the frozen C36 failure and all 50 v23 outcomes remain unchanged.
