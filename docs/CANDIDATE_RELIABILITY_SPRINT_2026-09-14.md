# Candidate reliability and live-policy adherence

## Engineering judgment

The next unit of progress is a reliably completed, patient-grounded disposition with auditable evidence—not another agent or a larger clinical graph. Preserve the approved five-route policy. The useful separation is a parallel early safety assessment, independent evidence-informed disposition, and independent review. Keep the queue as an integration boundary.

The original 50 messages are a physician-shaped **development reference**, not unseen validation data. Their historical physician approval does not automatically approve a newly generated answer. Model acceptance, exact reference agreement, defensible alternatives, and operational delivery are distinct measurements.

## Failure-first analysis and corrections

1. **Could valid emergency support be cancelled by unrelated context?** Yes. The old admission logic required every quoted basis item to be a present/current acute finding. An unrelated risk-factor item could suppress C02. The safety model now explicitly selects the sufficient supporting subset; every selected quote and attribution is checked. Negative/background context remains visible but cannot substitute for sufficient support. Clinical sufficiency is still a model judgment, not a deterministic proof.
2. **Could prose change ambulance activation without a reviewed correction?** Yes. Both backend and browser now detect same-setting EMS-to-ED reductions. Full emergency downgrades retain stricter correction requirements. A phrase such as “stay with someone if you can” is not a condition on a preceding “Call 911 now.”
3. **Could an unavailable judge manufacture an emergency?** Yes, from an unreviewed draft with a quoted red flag. That fallback is removed; only independently supported care or an already-issued instruction can establish the retained floor. A technical failure is not a new clinical finding.
4. **Could an earlier run look like a fresh fast response?** Yes. Retained advice now has separate run provenance and is excluded from current-run timing. Unresolved older advice survives repeated runs, including the third-run edge case, until equivalent/higher advice or a bound correction supersedes it.
5. **Could repairing one error introduce another?** Yes. A v9 repair removed unnecessary procedural advice but imported “at rest” from a guideline into the patient's history. v10 prompts explicitly separate guideline eligibility criteria from patient observations and require minimal, targeted revision. The failed output remains preserved.
6. **Could a parallel intake question escape before emergency action and become impossible to repair historically?** Yes. The first v10 C02 run exposed this race. Question publication must be arbitrated by the early safety result without holding retrieval or drafting. Nonblocking is not synonymous with irrelevant; the event contract must not misstate that distinction.

## Recorded version-separated failures

These are actual browser runs; receipt times include HTTP overhead and are not browser-paint measurements. Each version's failed attempt is retained, not replaced or pooled into a success score.

| Version / C02 run | Browser emergency action | Browser finish | Outcome |
|---|---:|---:|---|
| v8 / `234d4b8d` | 10.74 s | 85.35 s | Independent judge accepted revised draft; application misread an incidental conditional clause and withheld it. |
| v9 / `cb435c23` | 7.97 s | 79.80 s | Judge correctly rejected an invented rest pattern; emergency advice remained visible. |
| v10 / `6c9781e6` | 7.40 s | 88.39 s | Final draft passed six criteria; previously issued intake question failed clarification necessity. Emergency advice remained visible. |

The version-specific manifests, raw runs, scorecards and browser observations are in `outputs/live-policy-rehearsal-v8-2026-09-14`, `outputs/live-policy-rehearsal-v9-2026-09-14`, and `outputs/live-policy-rehearsal-v10-2026-09-14`.

## What the traces justify doing next

In the v8/v9 C02 runs, review/repair consumed 56.53/57.47 seconds—67–72% of total elapsed time. Repair plus the second judge alone consumed 38.83/36.53 seconds. Concurrent retrieval's longest query took 2.42/1.48 seconds. These selected failures identify a bottleneck; they do not estimate production latency percentiles.

After the current fixed-version rehearsal, test **constrained repair patches** against full regeneration, using identical initial drafts, evidence and reviewer feedback. Preserve unchanged fields mechanically, apply explicit route/transport reconciliation, and independently review the entire resulting answer. Record old draft, proposed patch, resulting draft and both judgments. Measure newly introduced patient facts, unintended route changes, repair completion, latency and cost. Do not claim this design improves anything before that comparison.

The existing `clinical:benchmark` runner targets the incumbent and includes a 90-second abort; it is not evidence of candidate performance. A candidate-specific automated study must reuse the production candidate graph, use an explicit study budget (not the manual-GUI exemption), freeze all execution/evidence versions, and preserve failures and unfinished attempts. Include repair, judging and embeddings in spending accounting; unknown usage remains unknown.

Production hardening should next make run ownership durable and reconnectable. Browser disconnection should not own the lifetime of a clinical job. This is separate from adding a clinician-queue product or weakening generation/review safeguards.

## Evidence informing the strategy

Counsel's public Mastra case study describes history taking, parallel emergency supervision, dedicated task routing and retrieval. That supports purposeful decomposition, not a claim that our implementation mirrors private production code. [Mastra / Counsel](https://mastra.ai/customers/counsel-health).

Counsel's condition-specific physician-defined evaluation supports calibrated, clinically meaningful criteria—not label equality or uncalibrated model confidence as ground truth. [Counsel judge report](https://www.counselhealth.com/ai-report/llm-as-a-judge).

Baseten's OpenEvidence case study concerns infrastructure, embedding inference, throughput and observability. Its 160-ms metric is not full medical-answer latency and does not establish the benefit of a clinical graph. [Baseten / OpenEvidence](https://www.baseten.co/resources/customers/openevidence-delivers-instant-medical-information-with-baseten/).

Repeated trials, transcript inspection, task-specific criteria and human calibration guide the rehearsal. [Anthropic evaluation guidance](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents), [OpenAI evaluation guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices).

## Live verification status

The ordered 13-attempt GUI plan is predeclared in `LIVE_POLICY_REHEARSAL_2026-09-14.md`. Software tests alone do not establish clinical accuracy, net agent benefit, or deployment readiness.

### Frozen v11 rehearsal: all 13 attempts retained

Production code `0be33ee`; prompt hash `f1545c4b41997192c600d2f9dcfe8e5a888fa1413136297c7a50a443a7b3a1e5`. Seven full responses completed; six ended in clinician-review fallback. These are operational outcomes, not seven clinically validated responses. No attempt was discarded or replaced.

| Actual GUI input | First browser action | Browser finish | Full-response outcome |
|---|---:|---:|---|
| C02 | 8.57 s | 77.91 s | Completed after one repair; emergency/911 |
| C02 repeat | 7.86 s | 41.87 s | Completed; emergency/911 |
| Novel C02 paraphrase | 6.13 s | 43.75 s | Completed; emergency/911 |
| C02 + ambulance-coming update | 6.84 s | 42.79 s | Withheld: valid EMS continuation misread as transport reduction |
| C50 usual migraine | None | 83.39 s | Priority-async draft; withheld over wording and access fallback |
| C50 actual GUI update | None | 86.09 s | Priority-async draft accepted by judge; application handoff false positive |
| C01 | None | 79.34 s | Self-care draft; judge anchor serialization error hid a substantive revision finding |
| C18 | None | 78.66 s | Standard async completed; manual audit still found unsupported measurement wording |
| C04 | 4.01 s | 56.70 s | In-person instruction retained; serialization error prevented repair of substantive defects |
| C49 | None | 84.88 s | In-person today completed with ED access fallback |
| C25 | 6.77 s | 91.40 s | In-person today completed; testing-capability pathway, qualified reference |
| Historical other-person symptoms | None | 91.44 s | No false early emergency; standard-async draft rejected by literal timing check |
| Conditional warning, no current symptoms | None | 34.60 s | Self-care explanation completed; no false early emergency |

The three C02/original-paraphrase responses issued emergency action before retrieval/final completion, without an intake question. On repeat, the previous instruction was explicitly labelled with the prior run and excluded from fresh timing. This fixes the demonstrated admission/delivery defect; three observations do not establish sensitivity, latency percentiles, or universal early detection.

Only seven unique original cases were attempted. Of six unqualified references, three first attempts had a completed matching response; C25 remains separately qualified. The 43 unattempted original cases remain visible in the scorecard. Repeats and five off-cohort inputs are separate, not pooled into a 50-case success claim. Estimated model-call cost for all 13 attempts: $5.33, excluding embeddings and without claiming this equals billed cost.

Artifacts: `outputs/live-policy-rehearsal-v11-2026-09-14/` contains raw runs, version/corpus/scorer manifest, offline scorecard and actual browser observations.

### Corrections motivated by those failures

- Bind typed EMS continuation to the patient's exact report, current episode, final directive and independent review. An ambulance reported as already coming is not an ED downgrade; actual dispatch is still not externally verified.
- Match judge quotations within individual decoded JSON string values as well as serialized text. Never fuzzy-match, join fields, or accept the wrong unit. C01's genuine unsupported “not measured” assertion must remain a revision concern.
- Treat generic future clinician-task descriptions as contextual review findings, with exact-clause independent adjudication. Fabricated sent/booked/accepted/dispatched events and response guarantees remain blocked.
- Accept “today during service hours” as equivalent timing to “same-day during service hours,” still requiring clinician ownership. This changes a wording recognizer, not the queue target.
- Strengthen the general distinction between **unreported measurements** and measurements **not performed**. Prompt instructions do not prove future adherence.

These changes define v12 and require separate live retests. Historical v11 outcomes remain unchanged.

### Remaining release risks—not hidden by a passing judge

Manual review found C18's accepted answer still asserted that no vital signs were measured, although readings were merely unreported. Pediatric consumer evidence was explicitly marked uncertain in applicability but remains weaker support for an age-unspecified refill than an appropriate prescribing protocol. In C50, a judge usefully caught delayed thunderclap instructions, yet ownership judgments changed across materially similar text. This is evidence of both useful interception and imperfect calibration, not established net agent lift.

The judge also sees full emitted question records, whereas the GUI hides a question and its internal rationale while an in-person notice is present. Emission, receipt, displayed text and actual patient exposure must be modelled separately in the next evaluation contract. Do not retrospectively call hidden text a demonstrated patient exposure or erase its internal quality defect.

The next evaluation work is a physician-reviewed calibration set covering material safety defects and defensible alternatives, followed by a budgeted candidate-runtime comparison and separately authored unseen cases. Proposed—not yet physician-approved—examples are in `JUDGE_CALIBRATION_2026-09-14.md`. Keep routing correctness, evidence coverage, wording quality, operational completion and delivery latency distinct throughout.

### Frozen v12 targeted GUI retest: all seven completed

Production code `43e335c`; prompt hash `b4482d54c0f38038e079c05ae823bc3c57a553435e651e3413a6429b99f66ed9`. All seven predeclared submissions completed and received seven-criterion model acceptance. These are application outcomes, **not seven clinically validated responses**. Both patient updates used the real GUI update form. No failed attempt was replaced, and no extra retry was added to this sequence.

| Actual GUI input | First browser action | Browser finish | Displayed final route |
|---|---:|---:|---|
| C02 | 3.96 s | 54.59 s | Emergency assessment now / activate EMS |
| C02 + ambulance-coming update | 6.69 s | 90.91 s | Emergency assessment now / continue reported EMS plan |
| C50 usual migraine | None | 74.88 s | Priority async |
| C50 actual update | None | 94.85 s | Priority async |
| C01 | None | 91.99 s | Self care |
| C04 | None | 100.36 s | In-person today |
| Historical other-person symptoms | None | 82.83 s | Standard async |

C02's live emergency notice was visually inspected while the final response was pending. Its safety model ran independently, without waiting for evidence retrieval, Opus generation or Astra review. This is a live LLM-selected action with application-rendered wording, not a cached answer or a keyword-triggered disposition. The action-basis admission fix, not a faster claimed full answer, addresses the original C02 defect. The ambulance update's final typed continuation no longer fails as an EMS-to-ED downgrade. Its early template still repeats activation wording despite reported activation; that refinement remains separate.

Only four unique original development cases were tested under v12: four completed route agreements out of four attempted unqualified references. The other 46 original cases were not retested under this version. The two updates and historical control are separate off-cohort attempts. Neither this result nor the earlier physician-shaped reference establishes performance on unseen cases.

All seven runs total 40 model calls and six repair cycles; three context-contract failures were recoverable. Estimated model-call cost: **$2.91**, excluding embeddings and without equating the estimate to invoiced cost. Every raw run and browser observation is preserved in `outputs/live-policy-rehearsal-v12-2026-09-14/`, along with corpus, prompt, policy, reference and scorer identities. Prior versions remain immutable.

#### What still is only mostly convincing

- **C50 patient-fact scope:** both accepted answers broaden “out of sumatriptan” into “no rescue medication left” or “out of rescue medication.” Priority async remains reasonable; the wider medication assertion is unsupported. A passing judge did not catch it.
- **C04 early coverage:** Haiku completed in about 7.3 seconds but selected Priority async, so no early physical-care instruction was emitted. The final model selected in-person today. Review repaired invented spreading redness, overbroad ED advice for pus and excessive examination requirements. The final correct route at 100.36 seconds does not prove fast same-day coverage.
- **Evidence applicability:** C01 retrieves a pediatric emergency reference despite unknown age; C04's cited sources are consumer summaries/ED syntheses rather than the desired diabetic-foot guideline. Limitations are disclosed, but disclosure does not supply missing support. Historical-control evidence supports the safety net more than lipid management.
- **Latency:** six repairs and serial review dominate many final responses. Final browser receipt was 54.59–100.36 seconds. Removing false release vetoes improves completion but does not solve this latency. No timeout was substituted for a valid slow response.
- **Coverage of fixes:** typed EMS continuation and decoded judge anchors were exercised live. The newly added contextual ownership-resolution branch was not: v12 runs were `not_flagged` by the raw ownership check. Its current verification is deterministic tests, not a claimed live success.

#### Separate UI continuity correction after the frozen sequence

Independent review found that the GUI retained only an early safety notice. If the final model alone identified emergency or same-day physical care, starting another assessment could erase the instruction. The workbench now selects accepted issued care from the final answer or received patient-visible events, with separate final/reply/action provenance. It never reads a rejected draft or invents emergency-agent attribution. A received reply followed by disconnection remains marked incomplete; old advice is excluded from new-run timing.

Stronger unresolved earlier advice survives a lower fallback and a third run. Exact reviewed corrections—including a released correction followed by disconnect—can supersede it; typed EMS continuation remains bound to the original report and directive. Unrelated edits clear prior-case state. The optional-update emergency warning uses the same reconciliation status as the retained banner so corrected async care is not contradicted by a stale warning.

Verification for this UI-only change: full core `npm test`, 149 GUI tests, lint, root/UI TypeScript checks and the production Next build passed. The Mastra build passed for the unchanged v12 backend. These tests establish state/contract behavior, not clinical correctness. The seven live clinical attempts preceded this UI-only change; they are not retrospectively described as reruns of the new UI.

## Senior-engineer conclusion and next decision

Keep the approved five routes. Keep clinician operations as a stub and evidence as a separately testable layer. Do not add a graph floor, another model role or a database product to address a bottleneck that these traces place predominantly in draft quality, review and repair.

The next highest-value experiment is **physician-calibrated, constrained repair versus full regeneration**, on identical frozen drafts, passages and reviewer findings. Before running it, adjudicate the proposed calibration examples—including C50's scope expansion, genuine missed emergencies, acceptable EMS/ED alternatives and missing-versus-unmeasured vitals. Predeclare success as better completed, clinically supported responses without worse routing or additional invented facts; report latency and cost separately. Use repeated, budgeted production-candidate runs and retain all unfinished/failed attempts. Follow with independently authored unseen cases before any generalization or agent-lift claim.

This candidate is demonstrably more reliable on the targeted GUI rehearsal, but **not yet presentation-ready on consistent latency or fully calibrated clinical grounding**. That conclusion follows from the retained live outputs, not an automatic failure label for defensible route alternatives.
