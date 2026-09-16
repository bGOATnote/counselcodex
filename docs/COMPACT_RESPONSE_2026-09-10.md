# Faster clinical responses: implementation, experiments, and failures

## What changed

The local demo now runs a bounded Haiku safety/intake assessment **beside** a compact Opus care assessment. Opus receives the original patient message and relevant evidence immediately. It no longer waits for a full history extraction and supervisor essay before a separate writer starts. This implements the [enterprise research recommendations](CLINICAL_RESPONSE_LATENCY_RESEARCH_2026-09-10.md), with one important change prompted by red teaming: the fast branch can identify an emergency, not merely ask a question.

```text
Original patient message → screen + retrieve relevant evidence
                              ├─ Haiku: emergency detection OR one bounded question
                              └─ Opus: one compact disposition + supported explanation
                                         ↓
                              validate → one care response
```

Known emergency triggers still produce immediate instructions, while Opus continues. A Haiku emergency finding must have a valid structured output and an exact patient quote before a fixed emergency instruction is emitted. It cannot release self-care clearance, prescribe, or downgrade urgency. An emergency already emitted cannot be downgraded by the final answer. These are operational safeguards, **not proof of clinical sensitivity or specificity**.

The GUI accepts an answer or symptom change while assessment is running. It preserves the original message, appends the patient's new information, cancels the older request, and ignores stale callbacks. Previously emitted emergency instructions remain visible. A slow optional intake branch is canceled when Opus finishes; it cannot hold up the completed care response.

No raw tokens, unfinished JSON fields, or unchecked partial patient paragraphs are displayed on this profile. The complete structured Opus answer passes the response contract before release. Research coverage is scored with that exact answer; missing coverage is visible, not silently scored as success. Emergency action does not wait for research.

This is a **local research/demo default**, not a clinical release. `COUNSEL_DISPOSITION_PROFILE=progressive-opus` selects the previous measured three-call graph. Mastra Studio and the GUI use the same selected profile and interactive budget. Original CSV labels and saved physician adjudications were not edited.

## Measured results

The [immutable evidence artifact](../outputs/compact-latency-20260910-v1.json) contains all **32 automated attempts and 7 browser attempts**, including failures and cancellation. Expected routes are development hypotheses, not newly physician-adjudicated ground truth. No HealthBench score, clinical non-inferiority, or percentile SLA is established here.

### Initial paired development comparison

Six cases (C01, C02, C04, C12, C23, C49), one attempt per profile per case, rotated profile order, shared evidence corpus. Final medians below include only completed assessments; all-attempt medians and completion counts are also shown to expose failure selection.

| Profile | Completed / attempted | Median completed assessment | Median all-attempt duration | Median first action or patient reply |
| --- | ---: | ---: | ---: | ---: |
| Previous three-call Opus graph | 5 / 6 | 22.79 s | 22.67 s | 6.35 s |
| Compact Opus alone | 6 / 6 | 9.91 s | 9.91 s | 9.87 s |
| Haiku intake + compact Opus | 5 / 6 | 9.94 s | 10.46 s | 9.88 s |

The conversational candidate asked three early questions, median **1.43 s**. A question is **not** a disposition. The first compact version completed sooner but could deliver care instructions later than the old supervisor. That tradeoff triggered the next experiment; it was not hidden by reporting only final-answer speed.

### Red team, then verification

Eight adversarial inputs tested prompt injection, negation and family-member attribution, severe dyspnea despite normal blood pressure, an afebrile inflamed diabetic foot wound, resolved stroke-like symptoms, pleuritic pain with a request for zero-risk reassurance, a gasping child with blue lips, and apparent improvement in a COPD history. All eight matched their development route hypothesis. **That did not mean their responses were clinically correct.** Unsupported claims and absent evidence still occurred.

Three missed-by-pattern emergency sentinels waited 7–12 seconds for action. We added independent fast emergency detection, shortened the care prompt, expanded pediatric breathlessness retrieval, and then repeated six sentinels:

| Repeated emergency sentinel | Before fast safety branch: action | After: action |
| --- | ---: | ---: |
| Severe dyspnea despite normal BP (RT03) | 9.71 s | 0.88 s |
| Resolved stroke-like symptoms (RT05) | 7.33 s | 1.62 s |
| Gasping child, blue lips (RT07) | 12.49 s | 1.07 s |

The six-run verification phase had a **6.62 s median completed assessment**, with one completion at **11.49 s**. Three questions arrived at a median **1.85 s**. Prompts and retrieval changed between phases, including new coverage for RT07; these are development comparisons, not isolated causal estimates or a held-out evaluation. Subsequent review still found semantic failures in three of these six answers, retained in the artifact and addressed by the targeted checks below.

### Real browser observations

The GUI was exercised through its actual HTTP endpoint, not just a mocked component:

- C12: first question received at **1.73 s**, completed response at **6.81 s**.
- A new report of breathlessness at rest and difficulty speaking canceled the previous C12 request. The replacement run emitted an emergency instruction at **1.58 s server time**; the canceled attempt remained in the log.
- A negative control with explicitly denied dyspnea and a mother's COPD did not emit an emergency instruction. It did ask an already-answered risk question; the eligibility check was subsequently corrected and unit-tested.
- A later C12 request failed after **16.34 s**, retaining its earlier question and a same-day fallback instruction. A manual retry completed at **9.41 s browser receipt**, with its question at **1.76 s**. Both attempts are retained. The retry is not substituted for the failure.

Browser receipt and server timing are labeled separately. Neither is a measured paint time, patient comprehension time, or proof that care occurred. The 16-second failure means the requested responsiveness target is **not yet consistently achieved**.

## Failures found and fixes made

| Observed failure | Change and regression coverage |
| --- | --- |
| “No fever” expanded into no systemic infection | Preserve narrow denial provenance; reject the broader unsupported assertion. |
| Eating/drinking normally treated as a denial of dehydration | Targeted contradiction check; intake is not an examination. |
| Unknown breathing difficulty described as absent in the rationale | Cross-field contradiction check and prompt correction. |
| COPD alone led to “keep using your usual inhalers” | Reject inhaler instructions without a reported medication/plan; no inferred treatment regimen. |
| Project reasoning about normal/missing oxygen readings attributed to NHS | Separate source summary from project interpretation; reject the observed over-attribution. |
| Unsupported stroke-risk timing added to persuade the patient | Reject the observed unsupported risk-timeline claim; immediate action needs no invented statistic. |
| Invalid prose/citations erased the model's same-day recommendation | Keep a fixed same-day instruction, reject the flawed answer, require review. Emergency preservation also remains enforced. |
| Severe emergencies waited for the full Opus output | Parallel fast emergency detector with a monotonic escalation floor; negative and conflicting-output tests. |
| Older requests could race with new patient information | Per-request cancellation and ownership checks; old timeouts cannot abort the new request. |
| Stream/schema failure gave little diagnostic information | Record safe failure stage, finish reason, and HTTP status where available; preserve known token usage even when structured parsing fails. Do not log raw secret-bearing exception text. |

Automated tests also cover true parallel start, no unvalidated partial text, fabricated intake quotes, optional-branch cancellation, external cancellation reaching both providers, forged/oversized streams, truncated output, fixed emergency directives, and budget exhaustion across restarts.

Final verification passed: **246 software tests** (65 core, 70 Mastra/agent, 18 CQA, 93 GUI/storage/HTTP), TypeScript checking, the existing 45-module JavaScript syntax check, both Next.js and Mastra production builds, and offline evidence-integrity verification. These totals include legacy regression suites, not 246 independent clinical evaluations.

These targeted checks **do not constitute a general semantic validator**. The artifact preserves original run checks and adds `currentContractReplay` separately: later failures never rewrite historical results. For example, the initially clean six-case verification is not relabeled a clinical pass after replay finds unsupported breathing clearance, an unverified inhaler plan, and source over-attribution.

## Evidence and observability

The bounded corpus increased from four to seven project-authored evidence notes. Added source pages were opened and checked during this work: [NHS breathlessness](https://www.nhs.uk/symptoms/shortness-of-breath/), [CDC common-cold treatment](https://www.cdc.gov/common-cold/treatment/index.html), and [American Stroke Association warning signs](https://www.stroke.org/en/about-stroke/stroke-symptoms). UK emergency-number localization and case-specific same-day decisions are project interpretations, not quotations from those organizations. URL availability does not establish claim entailment.

Each request records its original input hash, profile/prompt provenance, model roles, timings, usage or explicitly unknown usage, validated answer or rejected draft, source notes, contract checks, and emitted event sequence. Mastra traces capture the actual parallel workflow. Events are persisted before transmission. A final failure does not delete an earlier patient-visible instruction. Provider text is not exported in trace inputs/outputs; the local synthetic-data run artifact retains the response for review.

**Provenance defect disclosed:** the verification manifest's display phase was changed after its hash was computed. Original files are unchanged. The export includes both the stored manifest and the original hashed representation; restoring the original phase name reproduces the recorded hash exactly. The script now assigns phase before hashing. Initial comparison/red-team phases have source hashes but no complete historical source snapshot; exact historical code re-execution is not guaranteed. The verification phase includes a source snapshot. Saved-output replay is reproducible; identical future model generation is not promised.

## Cost and reproduction

Known token-cost estimate for these 39 attempts: **$1.392565**, with **3 attempts of unknown cost**. This is not an invoice or an upper bound on those unknown attempts. The new automated allowance reserved at most **$24**; all known project allowance ceilings total **$79**, within the user's $100 cap. Existing ledgers were not reset. All 32 automated reservations are consumed; another pilot requires a newly authorized allowance, not deleting the ledger.

```bash
npm run disposition:compact-pilot          # dry plan; no provider calls
node --experimental-strip-types scripts/disposition-compact-report.ts  # offline integrity verification
npm test
npm run review:test
npm run typecheck
npm run lint                            # existing JS syntax checker, not TS/React lint
npm run review:build
npm run build
```

The exporter uses exclusive creation for the published evidence file. Do not rerun `--write` over an existing artifact. GUI: `npm run review:dev`, then `http://localhost:4120/`. A model failure remains explicit and consumes its reservation. Advanced trace/cost details stay out of the main patient-facing response.

## What remains before a clinical or performance claim

1. Meet the original latency targets under repeated, realistic concurrency; measure p50/p95 browser rendering and tail failures. The current six-run medians do not do this. Improved failure diagnostics do not fix provider latency.
2. Independently assess sensitivity **and over-escalation** of the fast emergency detector. Exact quotation does not prove correct subject, temporality, or interpretation. A false-positive escalation cannot be undone by a later reassuring model.
3. Run clinician-reviewed, held-out semantic evaluation of the complete emitted trajectory. Concise text can still overstate certainty or an examination/imaging requirement. The final browser COPD answer's imaging recommendation deserves review; a generic NHS symptom page is not a comprehensive COPD workup guideline.
4. Expand and evaluate evidence retrieval and claim entailment. Seven notes and keyword retrieval are a deliberately small prototype, not a clinical research service. Relevant citations are neither sufficient evidence nor an endorsement of every adjacent statement.
5. Test the latest prompt/eligibility fixes in a new pre-registered, repeated live study. This pass regression-tests the exact observed failures; it does not claim they cannot recur in different wording. Preserve the independent physician adjudication boundary and the original 50 source labels.

The deliverable is a faster, instrumented candidate with exposed failure modes—not a claim that speed, schema validity, or route agreement has made autonomous care safe.
