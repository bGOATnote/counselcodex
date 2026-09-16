# Controlled concise-judge GUI verification: ten attempts

**Conclusion: do not promote this live candidate as presentation-ready or clinically validated.** The shorter judge remains an output-economy candidate, not a demonstrated end-to-end clinical improvement. Ten actual GUI assessments produced six model-reviewed releases and four withheld/clinician-required outcomes. These are descriptive outcomes across three changing versions, not a pooled accuracy score or ten independent patients.

All ten runs, including failures, are captured byte-for-byte in `runs/` and `events/`; each `captures/<run-id>.json` records SHA-256 identity, model usage, reviews, errors, versions and timings. The final machine-readable snapshot is [summary-10-dad3c12eeb5a.json](summary-10-dad3c12eeb5a.json). This independent artifact reviewer did not operate the browser or make provider calls. Browser observations were relayed by the root agent after actual GUI use and are preserved separately, with their reported precision.

## Scope and phase separation

The fixed-packet study and these GUI tests answer different questions. The earlier 28-call study held each judge packet fixed and compared full versus concise output. It found all 14 authored target labels correct in each arm, 97/98 paired criterion verdicts matching, and 14/14 release verdicts matching; concise judging was faster in each of the 14 pairs. Those engineering challenge labels are not physician validation. The GUI runs below exercise generation, retrieval, early messages, review, repair and release; there is no full-judge GUI control arm here.

| Phase | Actual graph / policy | GUI assessments | Model calls | Model-reviewed releases | Withheld outcomes | Estimated USD |
|---|---|---:|---:|---:|---:|---:|
| Baseline | `evidence-graph/v15` / policy v1 | 6 | 30 | 4 | 2 | 2.277925 |
| First correction | `evidence-graph/v16` / policy v2 | 1 | 6 | 0 | 1 | 0.531610 |
| Refined correction | `evidence-graph/v17` / policy v2 | 3 | 16 | 2 | 1 | 1.280148 |
| Retained total | Three distinct profiles | 10 | 52 | 6 | 4 | **4.089683** |

Each phase's prompt hash is retained in the final snapshot. All retrievals report the same corpus hash, `1bb200918d063325df27bcc3b252c992220367482181a42e77e671305321b5ff`. The v17 original C30 input, localized/mild update, and airway-positive update share a profile but intentionally differ in patient information. Their results must not be represented as an unchanged-case latency comparison or proof that the original input now succeeds.

## Exact GUI attempts

Server times are recorded milliseconds divided by 1,000, not browser paint estimates. A dash means that event was not emitted, not zero latency. Model-reviewed means the machine reviewer admitted the answer, not that a physician approved it.

| # | Input / run ID | Phase | Outcome | First server action | Server finish | Calls / repairs |
|---|---|---|---|---:|---:|---:|
| 1 | C02 — `8bdfda25-e247-4d3e-9cd3-b5a875ad6b61` | v15 | Emergency, model reviewed | 8.798 s | 41.207 s | 4 / 0 |
| 2 | C02 active EMS update — `b9210cef-0061-4b7b-8544-4666ba8e4ae7` | v15 | Emergency, model reviewed | — | 38.286 s | 4 / 0 |
| 3 | C04 — `7bfc528b-5d2e-42d9-9c7e-7a0813283eea` | v15 | In-person today, model reviewed | 4.267 s | 79.475 s | 6 / 1 |
| 4 | C50 — `d761d5ff-2b0c-4ee0-bfd0-b70451b3db6a` | v15 | Clinician required | — | 79.052 s | 6 / 1 |
| 5 | C50 unchanged-symptoms update — `86ee0c56-ff29-400e-9129-0037dcc6d08b` | v15 | Clinician required | — | 37.015 s | 4 / 0 |
| 6 | C30 — `013f59c4-681c-49ee-9288-0fbdc13e83ce` | v15 | Standard async, model reviewed | — | 80.278 s | 6 / 1 |
| 7 | Original C30 retest — `c6225e23-17de-4e45-a294-60db9c7663f6` | v16 | Clinician required; answer null | — | 88.697 s | 6 / 1 |
| 8 | Original C30 retest — `02156242-9b83-42ba-97ba-8669b9ae7a19` | v17 | Clinician required; answer null | — | 80.708 s | 6 / 1 |
| 9 | C30 localized/mild update — `9836179b-d3ae-4f03-9521-b5720ef8b8f4` | v17 | Self care, model reviewed | — | 79.454 s | 6 / 1 |
| 10 | C30 airway-positive update — `f4f9a7a9-a138-4845-898f-a4f119f05210` | v17 | Emergency, model reviewed | 6.940 s | 41.284 s | 4 / 0 |

Root observed the final emergency update's **Call 911 now** instruction while the GUI was still preparing the answer. Browser action arrived at **6.95 s**, with reply/finish at **41.29 s**. The input explicitly added current lip/tongue swelling and difficulty breathing after the earlier denial. The final red-flag inventory separated current breathing difficulty from initial denial, and the judge recognized that chronology. No clarification question delayed that action.

## What failed, and what remains only partly convincing

### Four withheld outcomes are still failures to release an answer

- **C50 baseline:** after one repair, the second judge rejected a blanket aura red-flag claim where the retained source said atypical aura. This was semantic review exhaustion, not provider timeout or funding exhaustion.
- **C50 update:** the judge detected grounding and ownership problems but returned `claim_support=pass` without a source anchor. Validation rejected it as `JUDGE_CONTRACT_FAILED`; no repair followed an inadmissible review. This was a contract failure, not a usable accepted review.
- **C30 v16:** the first draft invented a two-day interval from an unanchored Saturday exposure; the repair then asserted rash confinement while distribution elsewhere remained unknown. The second judge rejected the new grounding error. The corrected runtime appropriately left the canonical answer null rather than fabricating Priority async as a clinical fallback.
- **C30 v17:** the repair added same-day/access fallback language, but its second review rejected blanket 911 advice for all facial swelling. The first review had asked to retain immediate emergency instructions and did not isolate that scope issue, so the bounded repair did not finish the job.

The two C50 outcomes were not retested after later changes. No report should imply those release gates are now resolved.

### Machine acceptance still misses contradictions and capability claims

The v17 original-C30 first review passed the same **confined to forearms** assumption rejected in v16. It also missed **fever denied by symptom report only** while measurement method was explicitly unknown. These are concrete consistency gaps. A shorter schema-valid review does not guarantee complete defect detection.

C04's accepted response said **I can help coordinate in this thread**. The clarified C30 response said **Counsel can help coordinate**, partly introduced by the reviewer's own correction. The final emergency update said **I can follow up in this thread afterwards**. No artifact establishes that the stub can perform those actions. Ownership review focused on avoiding a promise of accepted care and missed these broader capability implications.

The clarified C30 final response also contains a structured row labeling extent **beyond forearms** as reported while quoting **still only on my forearms**. Its narrative is clearer than the row; the combination remains ambiguous for downstream consumers. Its general facial-swelling emergency advice is not textually identical to the original-C30 blanket 911 advice, but still deserves a precise policy/transport-scope review.

### Evidence coverage remains narrower than the clinical prose

C04 citations were agent-compiled ED cellulitis/necrotizing-infection syntheses, not primary diabetic-foot or telehealth routing guidelines. Their source identity and quote integrity do not establish the scope of a diabetes-as-immunocompromise inference. More generally, retrieved consumer summaries and agent-compiled ED syntheses are explicitly not patient-specific findings or clinical approval.

The final airway response added **Stay upright, unlock your door, and keep someone with you**. The judge's claim-support anchor establishes airway urgency, not a complete audit of those additional instructions. Retrieved material contains position-of-comfort/airway content and condition-specific upright instructions; that does not, by itself, document applicability of every optional home-management instruction. This report does not adjudicate those directives as clinically right or wrong; it records the incomplete claim-level support assessment.

### Serial repair remains the measured latency bottleneck

Six of ten runs required a repair. Their `review-and-release` stage took **51.214–62.020 seconds**, incorporating judge → repair → judge. Their total server times were **79.052–88.697 seconds**. The three successful four-call/no-repair releases took **38.286–41.284 seconds**; the other four-call run failed the judge contract. These are descriptive stage measurements across differing inputs, not proof of causal speed improvement or a tail-latency estimate.

The frozen judge comparison's median reduction of **5.0115 seconds per paired review** is real for those packets, but it does not eliminate serial repairs or establish acceptable time to a complete live response. C02's initial emergency action at 8.798 seconds also remains a separate latency concern.

## Recommended next verification gates

1. Freeze the exact missed-contradiction and reviewer-introduced-capability packets above into additional judge calibration cases. Compare full and concise styles without mutating the historical reviews, and assess every criterion as well as the final release.
2. Require the first review to identify the complete actionable defect set, with a distinction between a genuine safety defect, unsupported patient fact, optional prose, and an underspecified operational capability. Do not relax validation or erase failed turns to obtain completion.
3. Retest original C30 and both C50 flows after any fixes, with actual GUI observations and all attempts retained. A clarified C30 success does not establish original-C30 success.
4. Evaluate primary-source applicability, claim coverage and unnecessary instructions separately from URL/quote integrity. No deployment or physician-approval claim follows from these machine reviews.

This artifact review recommends **no default promotion from these ten GUI runs**. It does not demonstrate that the full judge is better: there is no paired full-judge GUI arm. It does demonstrate that live release reliability, contradiction detection, capability truthfulness and serial repair latency remain unresolved.

## Cost, provenance and limits

- **GUI subtotal:** $4.089683 estimated for all 52 model calls across ten assessments, including failed outcomes.
- **Separate fixed-packet study:** $2.538340 estimated for its 28 calls.
- **Combined reported token estimate:** $6.628023. Neither amount is a provider invoice. Cache-specific adjustments, embeddings and other provider-specific billing are not included; see [pricing-snapshot.json](pricing-snapshot.json).
- The ten-assessment limit was reached; no further calls are authorized or dispatched by this capture helper. The GUI estimate stayed below the $15 soft stop.
- All ten captured runs report persisted traces and event logs. Exact source/copy hashes are retained, but that alone does not establish HIPAA compliance, complete clinical auditability or delivered care.
- `plan.json` remains unchanged. Its initial `clinical-evidence-graph/v15` name was a typo; actual artifacts say `evidence-graph/v15`.
- The earliest derived three-run summary used `completed` rather than actual status `complete` and misclassified its three successful releases. It is retained as an explicitly documented derived-report error; corrected v2 snapshots did not alter any raw run, event, review or clinician-required outcome.
- Detail notes for earlier attempts remain in `review-notes-4.md`, `review-notes-baseline-6.md`, `review-notes-v16-7.md`, `review-notes-v17-8.md` and `review-notes-v17-9.md`. Browser observations remain separate from exact server timings.
