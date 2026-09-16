# Physician-reference-driven engineering

The physician has reviewed the 50-case GUI and designated its recommendations as the development reference. That work is accepted; another 50-case adjudication is not a prerequisite for engineering. The original supplied labels are inputs to audit, not the answer key. C25 remains a qualified disagreement, not an automatically scored emergency label.

## Reference binding

`data/evaluation/physician-system-reference-v2.json` freezes all 50 exact inputs and the latest **issued** incumbent recommendation recorded before the physician's designation. It includes original labels separately, exact response/event text, run IDs, artifact hashes, workflow versions, and later no-answer failures. A no-answer error is not a medical reference label.

There are 49 route-scoreable cases and one separately reported disputed case. C03's older stored async answer has no recorded priority, so either async priority is accepted for that row; no annotation is invented. C05, C12 and C27 use the issued safety recommendation from an incomplete incumbent assessment, with that provenance visible. The earlier `physician-system-reference-v1.json` is retained as an initial inventory; v2 is the default.

This is a chronological reconstruction of the designated system, not proof of which exact historical run the physician viewed. It is a development regression reference, not a blinded held-out trial. The physician's aggregate approval is real; new claim-level grades are not fabricated from it. Neither reference labels nor incumbent answers enter the candidate's prompts or retrieval corpus.

## Changes in the candidate

- The fast assessor can explicitly choose priority or standard async internally. Time-sensitive prescribing is no longer forced into a choice between no action and a physical visit. A same-day early instruction requires a stated physical-care dependency tied to reported evidence.
- Unissued preliminary classifications no longer enter the patient-exposure packet for the judge. They remain in the trace. The judge receives the original message, current draft, actual issued questions/actions, and retrieved passages.
- Role prompts separate patient facts, project queue policy, source-attributed claims, and clinical inference. A source need not literally name the application's queue; unsupported medical claims and false attribution still fail review.
- A bounded negated-vital limitation no longer trips the blanket-reassurance check. A subsequent actual clearance still fails.
- Application validation findings reach both the judge and the single bounded repair step. An accepted clinical verdict cannot silently hide a mechanical defect, and the stored verdict is never rewritten. A repair receives exact prior findings rather than discovering an unrepairable final-only rejection.
- Source quotations now use a provider-facing `passageId` + `quoteId` contract. The application resolves a selected span to its exact stored text. Sentence spans retain all non-whitespace source content and short contextual qualifiers; long sentences have bounded contiguous spans. Unknown IDs and free-text quotation substitutes fail validation. Raw provider IDs and the resolved canonical output are both retained. This removes the observed copying defect without pretending exact text proves claim support; the independent reviewer still assesses the claim and source context.
- Existing emergency-preservation, explicit care-revision, citation-integrity and cancellation rules remain. Technical review failure still requires clinician review; it does not fabricate emergency physiology.

The incumbent GUI remains available at `/`; these changes are in the opt-in `/candidate` workflow, except the narrow false-positive correction in the shared answer check. Original CSV, saved physician reviews, prior outputs, provider choices and budget ledgers are preserved.

## Evaluation that uses this reference

`npm run cohort:score -- PROMPT_HASH NEW_OUTPUT_DIRECTORY` makes **no provider calls**. It binds a scorecard to the reference hash, prompt hash, corpus hashes and scorer hash. It exports every selected-version attempt, including off-cohort stress inputs.

The primary result uses the first attempt ordered by estimated server start (completion timestamp minus duration), not the first successful completion. Repeats remain visible. Missing cases remain missing in the 49-case planned denominator. Completion, route agreement, initial over-escalation, emergency instructions, source-review outcome, latency and known/unknown cost are separate. An emergency instruction preserved during an explanation failure is not an emergency miss, but neither is it a completed successful assessment. Off-cohort stress tests and C25 do not inflate the primary agreement rate.

The full paid 50-case candidate regression has not been run in this iteration; a separate spend-approval question was sent before that batch. Targeted actual GUI tests continued, including failures. No automatic new cohort, benchmark, or judge spending loop was enabled.

## Actual GUI verification, including failures

All 13 attempts below were initiated through the real `/candidate` GUI. They are development iterations, **not 13 independent validation cases**. There were 72 model calls, 10 completed assessments and three review-required outcomes. The standard uncached generation/judge token estimate is $4.907916 with no unknown generation-cost attempts; it is not an invoice, and retrieval-embedding costs are not included. Sources and model providers stayed fixed; the corpus hash is `1bb200918d063325df27bcc3b252c992220367482181a42e77e671305321b5ff`.

| Version | Input | Outcome | Early action | Full result | Run ID |
|---|---|---|---|---|---|
| v2 | C50 migraine refill | Review required: unissued action confused judge; negated-vitals false positive | None | 52.97 s | `ead36793-3376-44fb-941c-2f5771123773` |
| v2 | C02 chest pressure | Complete, emergency | 6.13 s | 88.09 s | `3a18f552-6c27-4238-a5c0-179903f03023` |
| v3 | C50 | Complete, Priority async | None | 47.58 s | `1c90f065-c223-43a5-80bf-f5e7cd50985b` |
| v3 | C25 calf symptoms | Complete, in-person today; reference remains qualified | 3.00 s | 109.48 s | `04731e81-6fdd-458d-bc4d-a7594643a40c` |
| v3 | Educational quoted-trigger control | Review required: final application finding had not reached repair | None | 73.56 s | `ed6d1234-7ea2-4d60-a417-6716612820fb` |
| v3 | C25 + actual GUI update: new dyspnea, chest pain, near-syncope | Complete, emergency; original message retained | 7.45 s | 83.37 s | `dfb99fac-1263-406f-80c2-52787de00125` |
| v4 | C50 | Complete, Priority async | None | 71.29 s | `63d1d4f0-828a-4209-95a9-3e1a52d3d243` |
| v4 | Quoted-trigger control | Complete, Self care | None | 72.87 s | `f3c91af5-a4af-48a6-9513-fbe0f962c257` |
| v4 | C02 | Review required: model shortened an alleged exact quotation; emergency preserved | 5.74 s | 74.08 s | `c18ca918-2e07-4bb2-b071-96c932a30a3f` |
| v4 | C04 diabetic foot wound | Complete, in-person today | 8.35 s | 83.21 s | `1af3ca34-2b24-4e4e-a720-3a3aba15cccd` |
| v5 | C02 | Complete, emergency; source-span references resolved exactly | 5.92 s | 45.56 s | `ca7b6f28-34da-4740-b95d-43ec339e362c` |
| v5 | C50 | Complete, Priority async; no early physical/emergency instruction | None | 85.65 s | `acd0258e-9a51-4a4f-8fb8-5636e6cb9d93` |
| v5 | Quoted-trigger control | Complete, Self care; no early emergency instruction | None | 69.79 s | `c3bcb961-e65d-43c6-b030-1469769827a8` |

The quoted-trigger control explicitly denies the symptoms quoted from a leaflet and asks for the meaning of “black tarry stool.” Its complete input, sources, model outputs and timings are in the exported runs; it is not one of the physician's 50 cases.

Immutable version-specific exports: [v2](../../outputs/physician-reference-graph-v2-2026-09-14/manifest.json), [v3](../../outputs/physician-reference-graph-v3-2026-09-14/manifest.json), [v4](../../outputs/physician-reference-graph-v4-2026-09-14/manifest.json), [v5](../../outputs/physician-reference-graph-v5-2026-09-14/manifest.json). The older v3 export used scorecard/v1 (completion-time ordering); the current scorer uses v2 (estimated-start ordering). That distinction changes no v3 first-attempt result because each input has one attempt, but the original export remains untouched.

The latest [v5 scorecard](../../outputs/physician-reference-graph-v5-2026-09-14/scorecard.json) has **two complete route agreements out of two attempted reference cases**, not 49/49 or 50/50. Forty-seven scoreable reference cases remain unattempted on this version, plus qualified C25. The third v5 run is the separate educational stress control. Automated acceptance does not establish that every safety-net phrase or clinical claim is physician-approved. The current output and judge are still candidates to test, not inherited physician approval.

Verification: full `npm test`, `npm run review:test` (131 tests), `npm run typecheck`, `npm run lint`, Mastra build and Next production build passed. The final citation-contract regression brings `rag:test` to 41 passing tests. All three final-version GUI tests completed; the measured 46–86-second final latencies remain a release blocker for replacing the incumbent, not something hidden by a software test count.

## Why this follows the published engineering lessons

Counsel describes clinician-defined, task-specific binary judges and comparison against physician judgments. That supports using this physician-designated development reference and examining grader errors; it does not prove that one uncalibrated general-purpose judge should gate every live message. [Counsel's evaluation report](https://www.counselhealth.com/ai-report/llm-as-a-judge).

Anthropic distinguishes regression suites from capability evaluation and recommends combining deterministic checks, model grading and expert judgment. Here the physician defines the clinical reference, deterministic checks enforce identity/provenance, and model judgments remain inspectable rather than being equated with clinical truth. [Anthropic's evaluation guidance](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).

Baseten's OpenEvidence case study describes optimized inference, embeddings, throughput and infrastructure redundancy. Its reported 700-to-160-ms improvement is not evidence that adding clinical graph edges makes this router faster. Our generation and inline review calls dominate the observed latency; graph expansion remains off because the earlier retrieval experiment found no added relevance. [Baseten/OpenEvidence case study](https://www.baseten.co/resources/customers/openevidence-delivers-instant-medical-information-with-baseten/).

## Remaining release gates

Final-answer latency remains too high. The gate/revision architecture still requires proof of net benefit against the physician reference, including unnecessary fallback and delayed useful responses. Next, run the frozen same-input cohort, identify repeated failure clusters, then compare a smaller calibrated review contract or asynchronous review architecture without changing the evidence or inventing safety from speed. Keep sensitive case-specific review inline where warranted; do not remove review merely to improve a timing chart. Retrieval coverage, primary-source applicability and prospective unseen-case performance remain unproven.
