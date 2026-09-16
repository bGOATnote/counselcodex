# GUI failure repair — 11 September 2026

## Status and scope

This is a browser-driven debugging rehearsal, not a clinical validation study or model comparison. The user reported failed assessments and long waits. Original Counsel messages, historical attempts and physician-review data are not rewritten. Opus remains the final model; no Astra challenger or HealthBench comparison was run. No application was deployed.

The repairs below address real software and evidence-contract defects. They do **not** establish clinical correctness, claim entailment, appropriate suicide-risk thresholds, or acceptable final-answer latency. A completed software response is not a clinical pass.

## Defects reproduced and corrected

1. **Quotation generation was an unnecessary failure surface.** Both patient findings and research excerpts now use stable integer references resolved against the exact original text. Provider JSON, reference-resolution code/version, source hashes and resolved excerpts remain available. Unknown IDs fail closed. This proves quotation identity, not that the quoted passage entails the model's claim.
2. **Source cardinality was wrong.** Multiple clinical claims can cite one source, and one claim may require multiple excerpts. The previous uniqueness/equal-length assumptions rejected valid answers. Exact duplicate entries and genuinely orphaned asserted support still fail.
3. **Rejected evidence is not asserted evidence.** Explicitly excluded source candidates remain in the record and are expandable in the UI. They cannot satisfy a cited claim. Research rejection is useful work, not grounds by itself to discard an otherwise structurally valid answer.
4. **Applicability was conflated with quotation integrity.** An exact drug-label pregnancy warning is not a false quotation merely because pregnancy status is unknown. Source identity and applicability now have separate checks. Uncertain applicability remains `not_assessed` and visibly requires review; it is never promoted to verified clinical support. Citing a source marked inapplicable still fails admission. A calibrated independent reviewer must assess whether a conditional claim was used appropriately.
5. **Emergency non-delay language was falsely rejected.** The vital-sign check confused “not required before emergency assessment” with “measurements are unnecessary.” The exception is bounded to non-delay wording in an emergency response; blanket dismissal remains rejected. This is a targeted regression guard, not a complete semantic safety verifier.
6. **False completed-handoff claims escaped checks.** Targeted checks now catch claims such as “I've sent your request.” This workflow has no prescribing, dispatch, appointment or referral-completion tool. No medication-start/stop/continue instruction is authorized by this prototype.
7. **Patient-facing crisis text contained clinician-facing instructions.** The existing conservative crisis floor now uses patient-facing wording and distinguishes 988 crisis support from 911 emergency response. The floor's threshold itself remains unvalidated; public 988/911 information does not establish that every passive death wish requires an ED referral.
8. **Retrieval discarded useful topic guidance.** The broad-query health-topic summary now retains a slot in the passage budget, with fallback to a nonempty second query. Exact source fragments and query/rank provenance are retained. Keyword-dense experimental reviews no longer necessarily displace all consumer guidance. This is retrieval coverage improvement, not measured clinical lift.
9. **Prescription questions lacked a suitable source type.** A bounded, independently ablatable openFDA label lookup now retrieves manufacturer-submitted prescription-label warnings. Exact single-drug identity checks reject OTC, unmatched and combination-drug records. An initial albuterol search incorrectly returned ipratropium/albuterol; that failure was retained and a regression test added. Formulation and patient applicability still require review.
10. **First-question timing was overwritten.** A revised question at 25.2 seconds replaced an earlier 3.7-second receipt time in the GUI. Client timing now preserves the first receipt; all later events remain logged. The full 25.2-second assessment time was real and is not relabelled as faster.
11. **The evaluation panel overemphasized passing technical checks.** Failed and unassessed checks are shown first; passed technical checks and prior events are nested. Zero supporting citations no longer produces a vacuous quotation-verification pass.

Action/timing is rendered explicitly from the selected route, preserving earlier required action. The assembled response is validated again so added instructions cannot exceed the browser contract or be silently truncated. This deterministic rendering is not a second clinical opinion and does not prove consistency of all free-text return precautions.

## Rehearsal accounting

Every persisted live attempt from the declared debugging interval is exported by `scripts/gui-rehearsal-report.ts`, including failures and pending-input outcomes. The export retains run IDs, original-file hashes, versions, prompt/input/evidence hashes, source audits, model usage, latency, checks and persistence status. Raw source passages and patient/model prose remain in the local immutable run files rather than being copied into this public report. This run-file inventory does not establish capture of a request that crashed before persistence.

The [26-attempt manifest](../../outputs/gui-rehearsal-2026-09-11/1789152276999.json) covers 17:30–18:44 UTC: 13 `complete`, 4 `unavailable`, 7 `review_required`, and 2 `awaiting_input`. These are debugging outcomes across changing versions, **not a final-version success-rate estimate**. Original run files were not modified. Provider token usage is retained; dollar charges have not been reconciled to provider invoices.

Selected browser-observed outcomes near the end of the rehearsal:

| Input | Version / run ID | Browser outcome | Server timing |
| --- | --- | --- | --- |
| C01, followed by an answer to the history question | v21 / `10d45f83-bcbc-4ee5-8419-10daac0ac919` | Completed with Common Cold citations; original message retained | Reply 17.73 s; finished 17.78 s |
| C06, losartan refill | v22 / `e48ac59d-00cb-44e5-b25f-686a1a8f9797` | Completed with label/topic citations; **unsupported “no symptoms”/“asymptomatic” wording remained** | Reply 19.29 s; finished 19.34 s |
| C04, diabetic foot wound | v22 / `e62b79c7-4db7-4cae-bdb1-8c5a158e6fde` | Completed; same-day in-person action and citations displayed; source applicability still unassessed | Action 4.49 s; reply 25.26 s; finished 25.33 s |

These timing values are server events, not screen-paint measurements. The current C04 result was visually inspected in the actual browser. Cases C02, C03 and C05 and earlier failures are also retained in the manifest; later successful attempts do not erase them. The final bounded medication-check false-positive repair was regression-tested after these live runs; it was not subjected to another paid browser run.

Commands:

```sh
node --experimental-strip-types scripts/gui-rehearsal-report.ts 2026-09-11T17:30:00Z
node --experimental-strip-types scripts/label-retrieval-smoke.ts
```

The source-only smoke uses three frozen pairs (losartan, finasteride, albuterol), with medication-label retrieval off/on. It makes no model calls. The first sandbox-network failure, the combination-drug mismatch, and the corrected retrieval run are all retained locally. An unverified link is not presented as reachable. This comparison tests coverage/identity only.

The live sequence changed prompts, native schemas, source selection and generation settings during debugging. It is neither randomized nor a causal ablation. One same-input losartan pair went from 32.8 seconds at high effort to 19.9 seconds at medium effort, but later waits remained long. Cache, provider variability and other changes confound the result. Medium effort is an interactive candidate, not an established clinical noninferiority result. Generation settings are recorded with each current run.

## Software verification

- `npm run lint` and `npm run typecheck`: passed.
- `npm test`: 281 passed; `npm run review:test`: 102 passed. These are authored software regression tests, not 383 clinically validated cases.
- `npm run review:build` and `npm run build`: passed. The first Mastra build stalled at dependency installation in the network-restricted environment; its exact build processes were stopped and the build completed with network access. No deployment was performed.
- `git diff --check`: passed. All 26 exported attempts confirmed run-artifact and trace persistence.
- Source CSV, saved physician reviews and historical run files remain unchanged. Raw retrieved abstracts remain local; only provenance/measurement metadata is included in the new export.

## Remaining release gates

- Repeated, fixed-version GUI trials must establish reliable completion, not one successful retry after a failure. Failures stay in the denominator.
- Final-answer latency remains outside the user's expectation. Early emergency action and an early history question are separate metrics and must not be substituted for final-answer latency.
- Conditional source applicability and clinical claim support need independent evaluation. A reachable link, exact excerpt or responding-model assertion does not establish either.
- Clinical findings and return precautions still need semantic review: examples observed during debugging include an unsupported dehydration-risk denial, the latest refill's unsupported “no symptoms”/“asymptomatic” wording, unnecessary differential expansion, CPR wording, and ambiguous “urgent” versus emergency precautions. The targeted software checks do not comprehensively detect these. The refill's `complete` status demonstrates this limitation directly.
- Current retrieval is a consumer-summary/abstract/label prototype, not a comprehensive, maintained specialty-guideline service for 1,000 unseen cases. Full guideline coverage, licensing, update/supersession policy and held-out retrieval evaluation remain necessary.
- All patient-facing early messages, questions, actions and final prose must be included in evaluation. A later answer does not erase an earlier error.
- No physician-adjudicated reference standard, clinical efficacy claim, billing readiness or autonomous deployment approval is created by these repairs.

## Primary-source basis

- [MedlinePlus Web Service](https://medlineplus.gov/about/developers/webservices/): health-topic summaries, query behavior, attribution and operating limits. It is not a drug-label database.
- [Europe PMC REST service](https://europepmc.org/RestfulWebService): abstract retrieval and indexing. Abstracts are not complete practice guidelines.
- [openFDA drug labeling](https://open.fda.gov/apis/drug/label/): manufacturer-submitted SPL data; openFDA warns that label contents are not independently verified and may differ from approved/current packaging. This is candidate evidence for a research prototype, not authority to prescribe.
- [Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs): provider-native structure does not establish clinical meaning or claim support.
- [Anthropic effort](https://platform.claude.com/docs/en/build-with-claude/effort): lower effort can reduce latency; task-specific evaluations must establish the quality tradeoff.
- [NIMH suicide prevention](https://www.nimh.nih.gov/health/topics/suicide-prevention): 988 crisis support versus 911 in a life-threatening emergency; not a case-specific ED disposition rule.

The Sites workflow was used for local GUI repair and rendered-interface verification. There was no hosting registration, deployment, or change to saved physician judgments.
