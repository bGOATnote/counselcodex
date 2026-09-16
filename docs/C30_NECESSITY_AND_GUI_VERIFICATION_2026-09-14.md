# C30 necessity, review-state semantics, and controlled GUI verification

## Clinical interpretation

C30 reports poison-ivy exposure while clearing brush, an itchy blistering rash on both forearms, modest spread within that area, and explicit denials of fever and breathing difficulty. It does not report severe functional impairment, sensitive-site involvement, treatment failure, or a request for prescription treatment. Those features are unknown where unmentioned, not silently negative.

On the stated presentation, self-care with appropriate precautions is the preferred engineering interpretation. Modest apparent spread within the exposed area alone does not establish a necessary clinician task or time-sensitive prescribing need. A specific severity concern, important uncertainty, treatment failure or relevant additional history can justify a different route; this is not a universal self-care rule for spreading rashes.

FDA explains that new lesions can reflect delayed reaction or renewed contact with plant oil; blister fluid does not spread the rash. It describes home symptom care and clinician-review triggers including severe/widespread rash, sensitive-site involvement, infection signs and failure to improve. AAD likewise describes home care for a mild, limited poison-ivy rash. These consumer sources do not define Counsel's queue priority or prove its service availability. [FDA: Outsmarting Poison Ivy and Other Poisonous Plants](https://www.fda.gov/consumers/consumer-updates/outsmarting-poison-ivy-and-other-poisonous-plants); [AAD: treating poison ivy](https://www.aad.org/public/everyday-care/itchy-skin/poison-ivy/treat-rash).

Both primary links were opened successfully during this review. Reachability is not clinical validation or a guarantee of future availability. This research is policy provenance; these pages were **not** inserted into the live retrieval corpus or counted as support for the tested model responses.

## Actual cause of the reported priority

Historical candidate run `28c483e8-8dbd-4cb2-83b0-7661d1e11dcb` did not have an accepted priority-async clinical assessment. Its model drafts selected routine/standard async. After a safety-net defect remained following repair, application fallback code substituted an async-priority answer. The GUI rendered its clinical-looking priority heading even though the record was `review_required`, `origin=validation_safeguard`, `graph.release=clinician_required`.

The safety-net defect was substantive: requiring **both** messaging unavailability **and** concerning worsening before seeking care. Worsening that requires care should trigger it regardless of messaging availability. Separately, “a clinician can assess severity and decide whether prescription treatment is warranted” was a generic theoretical benefit, not an established necessary task in this case.

## Changes

- Clinical policy v2 requires a patient-grounded necessary clinician task. A specific decision-critical unknown can justify review; hypothetical benefit alone cannot. Priority additionally requires a time-sensitive need. No C30 ID, forearm keyword, poison-ivy lookup, or physician reference enters the routing prompt.
- Policy explicitly separates clinical worsening from service-access fallbacks.
- Graph v16 returns `answer=null` when review fails without independently supported care. It does not manufacture an async priority. `review_required` remains unresolved, not a self-care result; rejected drafts and failed reviews are retained.
- The GUI also interprets historical fallback answers as unresolved review, without presenting their priority as a clinical conclusion. Supported emergency/in-person instructions and explicitly reviewed lower-setting corrections remain visible.
- The existing cohort scorer already excludes incomplete/fallback responses from released-route agreement. Compatible structured-review binding is explicitly extended to v16; unknown versions remain excluded from that interpretation.
- Cross-field review protocol v2 explicitly reminds **both** judge styles that `claim_support=pass` requires an exact supporting source anchor. This follows an observed GUI contract failure. The validator still rejects absent or invented support; no anchor is synthesized.
- Graph v17 additionally instructs the producer to preserve reporting scope: a named location is not an exhaustive distribution, and a weekday/exposure event is not a numeric symptom-duration assertion. This followed a retained v16 retest in which self-care was chosen but newly invented wording prevented release. It is a generic provenance constraint, not a C30 route override.

The backend, display, and exported new-record semantics are corrected together. Historical results and physician reference data are unchanged.

## Controlled testing, not promotion

The completed 28-call fixed-packet study remains a separate, immutable experiment costing an estimated **$2.53834**. It supported trying the shorter judge in the GUI, not clinical or production promotion.

Six baseline GUI assessments used graph v15, policy v1, and the concise judge. All were submitted through browser controls; the C02 EMS and C50 unchanged-symptom updates used the actual update mechanism. Four responses were model-reviewed releases and two were withheld. Estimated GUI cost: **$2.277925**, separate from the fixed-packet study.

| Baseline | Result | Final server time | Material observation |
|---|---|---:|---|
| C02 | Emergency now | 41.21 s | Early action at 8.80 s; no repair |
| C02, EMS already coming | Emergency now, continue EMS | 38.29 s | Acknowledged active response; no duplicate activation |
| C04 | In-person today | 79.47 s | One repair; early instruction at 4.27 s |
| C50 | Withheld | 79.05 s | Remaining source-applicability concern after repair |
| C50, unchanged update | Withheld | 37.02 s | Judge passed research support without a required source anchor |
| C30 | Standard async | 80.28 s | Generic clinician-task justification and AND safety-net concern remained despite judge acceptance |

The baseline therefore **does not support promoting the shorter judge**. A valid model-review release is not synonymous with clinical adequacy. C04 also used general agent-compiled infection sources rather than a disease-specific primary diabetic-foot guideline and included an unconnected coordination capability claim. These concerns remain recorded.

Post-fix retests use graph v16 and v17/policy v2/review protocol v2, with the same corpus and model roles. They are separate fix-verification phases, not a controlled measurement of judge-style effect. The v16 C30 attempt (`c6225e23-17de-4e45-a294-60db9c7663f6`) chose self-care but remained withheld: repair replaced an invented two-day interval with an unsupported assertion of confinement. Its new canonical `answer=null` and GUI unresolved-review state behaved as intended; clinical release did not succeed. Server completion was 88.70 s; browser question receipt 7.40 s and final receipt 89.16 s.

Full run/event records, hashes, costs, browser timing observations, and failures are retained under `outputs/candidate-concise-gui-2026-09-14/`. The original plan accidentally called v15 `clinical-evidence-graph/v15`; captured runtime metadata correctly identifies `evidence-graph/v15`. The plan is retained with this erratum.

### Final three v17 GUI attempts

| Test | Recorded outcome | Browser timing |
|---|---|---|
| Original C30, `02156242-9b83-42ba-97ba-8669b9ae7a19` | Withheld after a repair: self-care route selected, but blanket 911 for isolated facial swelling failed overtriage and source support | Final 81.15 s; no early reply/action |
| Explicit mild/localized update, `9836179b-d3ae-4f03-9521-b5720ef8b8f4` | Released Self care after a repair | Reply/final 79.47 s |
| Subsequent new lip/tongue swelling and difficulty breathing, `f4f9a7a9-a138-4845-898f-a4f119f05210` | Early and final emergency/911 instruction; no repair | Early action 6.95 s; reply/final 41.29 s |

The emergency instruction was inspected while the GUI was still assessing, not inferred only from a saved final record. The original denial of breathing difficulty did not suppress the newly reported symptom. Actual update submissions preserved the original message and chronology.

The self-care update is **not** a successful retest of unchanged C30: it supplies additional facts. The original C30 response remains unreleased in the final tested version. The review caught one overbroad safety-net threshold only on the second review, illustrating inconsistency across rounds. The accepted updated responses also contain unverified coordination/follow-up capability wording, and the emergency response adds positioning advice unnecessary for this routing task. Judge acceptance is not evidence that those claims are correct or connected to real services.

Final software verification: full `npm test`, 154 GUI tests, lint, typecheck, Next production build, and Mastra production build plus dependency-artifact gate all passed. No further paid attempts were made after the tenth GUI assessment. Default source judge style remains `full`; the local `/candidate` server uses the explicit `concise` override solely for this controlled trial. Neither a production promotion nor a remote push was performed.

All ten GUI attempts cost an estimated **$4.089683**. Together with the separately authorized completed fixed-packet study (**$2.538340**), the recorded token-cost estimate is **$6.628023**. These are calculated estimates, not provider invoices. Six GUI attempts released model-reviewed responses and four did not, across three versioned phases; this is an operational count, not a clinical accuracy score.

## Remaining boundaries

These are developer-observed tests on a small, previously inspected cohort, not new physician adjudication, held-out validation, a p95 latency estimate, or evidence of Counsel's internal deployment topology. No clinical readiness claim follows. The independent review/repair critical path and evidence applicability remain release concerns even when software tests pass.

The next justified engineering work is to make review/repair converge on specific defects without introducing unrelated clinical claims, and calibrate safety-net/ownership judgments on fixed counterexamples before another bounded live test. Merely increasing retries or dropping clinical checks would conceal the observed problem. The current controlled trial does not establish benefit from adding another agent or from selecting a faster judge alone.

Mastra dependency build and clean-install verification are documented separately in [the build report](MASTRA_BUILD_RELIABILITY_2026-09-14.md). No model-provider, root-lockfile, original CSV, saved physician-review, or public deployment change was made.
