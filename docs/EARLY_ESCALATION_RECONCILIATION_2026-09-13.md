# Early escalation: independent assessment, explicit correction

13 September 2026 · Candidate `adaptive-disposition/v42`

The defect was real: early rule/Haiku advice became a mandatory floor supplied
to Opus. Agreement with that advice was therefore not independent confirmation.
The correction preserves fast communication, removes prior routing judgments
from the final prompt, and treats disagreements as explicit events to resolve
and evaluate—not as reasons to rewrite the final model's clinical judgment.

The physician-engineer's [review of all 50 v41 responses](PHYSICIAN_REVIEW_SCORECARD_2026-09-13.md)
is preserved: 49 agreements and one qualified C25 disagreement. It is not
silently reassigned to newly generated v42 responses.

## What changed

- **Independent final judgment:** Opus receives original patient information,
  literal question/answer context and retrieved passages. It no longer receives
  the intake plan, inferred findings, prior route, emergency floor or mandatory
  directive. Retrieval still uses intake-selected queries, so this is routing-
  judgment separation, not independence from every upstream influence.
- **Bounded disagreement review:** one conditional Opus call assesses a proposed
  reduction against original facts, earlier advice, final response and sources.
  Agreement needs no additional call. This is a separate same-provider review,
  not a cross-vendor judge or physician approval.
- **Explicit revision:** accepted changes identify the exact previous and new
  instructions and a reason. The GUI shows the correction, while the earlier
  advice remains in the event log and evaluation. Missing, malformed, rejected,
  fabricated-quote or canceled reviews cannot silently reduce urgency.
- **Emergency versus transport:** reducing care below emergency-now after an
  unconditional 911 instruction requires affirmative contextual correction of
  the trigger, not missing symptoms or improvement. A reviewed transport-only
  change that retains emergency-now does not falsely declare the emergency
  excluded. Unjustified transport changes remain unresolved.
- **Context-aware early rules:** phrase occurrences are checked for word
  boundaries, negation, educational/hypothetical context, remote history and
  current subject/time. Current caregiver reports and resolved recent stroke
  symptoms retain escalation. A rule miss is not clinical clearance; models
  still run. This remains a narrow deterministic screen, not general language
  understanding and not a cached patient-answer lookup.
- **DVT distinction:** isolated unilateral calf symptoms after travel prompt
  same-day assessment/testing rather than automatic emergency activation.
  Reported PE or limb-threatening features require emergency assessment.
  Unknown features remain unknown. The queue stub cannot guarantee imaging;
  priority async is not presented as a completed same-day diagnostic pathway.
- **Rendering and follow-up:** emergency text is no longer prefixed with new
  conditional transport advice when the model already supplies an explicit
  immediate-care choice. Updated instructions bind to the latest emitted
  wording. A legitimately revised action is not resurrected on later turns.
- **No hidden short browser cutoff:** removed the separate 75-second browser
  abort; the existing server execution policy and explicit cancellation remain.

The historical rule-based baseline is unchanged. The new initial-screen module
is used by the live agent workflow, not to rewrite old benchmark results.
Original CSV bytes, earlier model runs and saved clinician reviews are unchanged.

## Live GUI verification—all attempts

[Machine-readable attempt manifest](../outputs/early-escalation-reconciliation-2026-09-13.json)
contains full run IDs, input/prompt hashes, observed events, token usage,
failure codes and hashes/paths of the immutable local raw records. The eleven
attempts span successive debugging revisions; they are **not** a fixed-version
accuracy cohort or a randomized latency comparison. Every row was submitted and
inspected in the actual GUI, including two genuine symptom updates.

| Run prefix | Input / revision | First event | Final outcome / time |
|---|---|---|---|
| `f207a247` | C25, initial implementation | ED advice 3.63 s | **Unresolved**, 29.92 s; reconciliation structured output failed |
| `8fd8b13e` | C25, review transport repaired | ED advice 3.64 s | Explicit revision to in-person today, 25.71 s |
| `3ceedda4` | Usual migraine refill + father's remote stroke + denied chest symptoms | Prescribing acknowledgment 1.71 s | Priority async, 18.48 s; no emergency alert |
| `2757e7a9` | Update to preceding migraine: new speech change, facial droop and arm weakness | Rule emergency 0.007 s | Emergency / 911, 27.58 s |
| `145bfa39` | C25, fast intake distinction corrected | In-person today 2.29 s | In-person today, 19.19 s; no emergency alert |
| `2d6d8df2` | Update to preceding DVT: new stroke features | Rule emergency 0.009 s | Emergency / 911, 23.15 s |
| `bf84d649` | Repeat misleading-phrase migraine | Prescribing acknowledgment 2.09 s | Priority async, 18.35 s; no emergency alert |
| `e5dbc5fb` | DVT + new chest pain and breathlessness | Rule emergency 0.008 s | **Unresolved**, 22.74 s; transport-only conflict incorrectly required emergency exclusion |
| `ed753525` | Same PE-warning case after conflict-condition correction | Rule emergency 0.021 s | **Unresolved**, 25.88 s; reviewer identified contradictory transport wording |
| `d3e22424` | Same PE-warning case after rendering/prompt repair | Rule emergency 0.019 s | Emergency / 911, 17.70 s; two model calls |
| `6ada4d19` | Final C25 isolated-leg-symptom retest | In-person today 2.06 s | In-person today, 22.82 s; two model calls, no emergency alert |

Times above are server events; the manifest separately records browser-visible
receipt times. A millisecond rule event is not an LLM response and is not counted
as model latency. An acknowledgment is not a clinical action. A correct final
answer does not erase an inappropriate earlier emergency alert.

### Defects found during the GUI tests

1. The first review failed in structured-output handling. Its unknown usage and
   failure are retained. A larger bounded output allowance, concise-field
   instructions and safety-envelope transport fixed the observed handling issue;
   the complete local schema and quotation checks still gate approval. We cannot
   prove the original provider-side cause was token truncation.
2. The stroke rule template said “resolved” even for current symptoms. It now
   describes stroke/TIA concern without inventing resolution, retaining 911 advice.
3. Transport-only disagreement was incorrectly treated as requiring proof that
   an emergency was absent. That logical condition is corrected without allowing
   an unsupported downgrade to async or same-day care.
4. The renderer added conditional 911 wording ahead of an already explicit
   immediate emergency recommendation. It no longer introduces that condition.
   The final prompt now makes ambulance activation explicit for suspected PE with
   active chest pain and breathlessness, distinct from isolated calf symptoms.
5. Follow-up replay kept the first equally urgent template instead of the latest
   wording, which could reject a correctly bound revision. Regression covered.

## Software and mechanism tests

All **544 software tests** pass: 414 core/evaluation tests and 130 GUI tests.
Lint, TypeScript checking, the Next production build and the Mastra build pass.

The 52 initial-screen tests include 28 negative-context examples, 21 genuine
positive examples and three boundary/wording checks. Examples include “no chest
pressure,” a father's old stroke, quoted education, “curtain” as household fabric,
“hip” inside “battleship,” and anticoagulant use without head injury. Positive
controls include real head injury on anticoagulation even without headache,
current caregiver emergencies, inability to breathe, and recent resolved stroke
features. These are authored development tests, not sensitivity/specificity
estimates for unseen patients.

Twelve reconciliation mechanism tests cover accepted/rejected corrections,
unbound or invented evidence, cancellation, same-route transport, unchanged
two-call agreement and retained history. A same-input mock ablation holds the
intake, final answer and empty evidence fixed: without reconciliation the
conflicting draft is retained as unresolved (two calls, 40 mock output tokens);
with an accepted review it yields an explicit revision (three calls, 60 mock
output tokens). This isolates the mechanism, **not clinical lift or live latency**.

The eleven GUI runs used 26 model calls. Using the repository's existing
input/output-token price assumptions, the known-usage subtotal is $1.029137;
one failed call has unknown usage, so total spend is **unknown**, not that
subtotal. These are estimates, not an invoice. Normal agreement remains two
calls; the observed successful DVT reconciliation added 7.34 seconds and one
Opus call. Legacy reserved experiment budgets were not expanded; any future
live ablation must explicitly enable/fund the same reconciliation configuration
as the GUI before claiming to compare the deployed candidate.

## Clinical grounding and limits

- The [NHS DVT page](https://www.nhs.uk/conditions/deep-vein-thrombosis-dvt/)
  distinguishes urgent assessment for suspected DVT from emergency care when
  chest pain or breathlessness accompanies it, and describes timely ultrasound.
  This supports separating the settings; it does not prove that this prototype
  can arrange testing or that all DVT presentations share one route.
- [NICE head-injury guidance, recommendation 1.5.13](https://www.nice.org.uk/guidance/ng232/chapter/Recommendations)
  addresses consideration of CT after head injury in people taking specified
  anticoagulants/antiplatelets even without other indications. The corrected
  screen distinguishes actual injury from a medication name plus headache; it
  does not declare that every such patient requires a particular scan.
- [NHS stroke guidance](https://www.nhs.uk/conditions/stroke/symptoms/)
  retains emergency action for recent stroke symptoms even if they stop. U.S.
  emergency telephone wording in this prototype uses 911, not NHS service numbers.
- [Counsel's LLM-as-a-judge report](https://www.counselhealth.com/ai-report/llm-as-a-judge)
  informs criterion-based evaluation. It is not evidence that Counsel operates
  this particular live reconciliation architecture.

These primary pages were read during the investigation; link availability is
not source entailment or clinical validation. The live DVT retrieval still
returned a consumer summary plus irrelevant abstracts, not a definitive full
specialty guideline for routing. This evidence-quality gap remains visible.

The existing background Astra-review allocation was exhausted throughout these
tests. It was neither reset nor represented as successful review; no new
cross-vendor grades are claimed. The same-provider reconciliation cannot replace
physician calibration. Prompt guidance, token limits and exact-quote checks do
not prove that a model's clinical reasoning is correct.

The final GUI retests demonstrate the targeted repairs, not clinical deployment
readiness. Final-answer latency remains roughly 18–28 seconds in this debugging
series; consumer-source coverage, occasional duplicated instructions/stray
punctuation, false-alert generalization and calibration remain work. Next useful
evaluation: freeze the repaired candidate, grade early **and** final advice on
new contrast pairs, and measure false activations and missed emergencies along
with completion, time to appropriate action and cost. No “all emergencies caught”
or automatic extension of the physician's v41 approval is warranted.
