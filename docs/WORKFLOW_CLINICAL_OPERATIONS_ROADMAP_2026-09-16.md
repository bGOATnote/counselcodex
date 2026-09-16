# Clinical operations roadmap after the workflow-aware study

16 September 2026. Proposed next work; no clinical approval, service integration or deployment decision is implied. This document interprets completed developmental evidence and defines a future protocol. It does not change the registered study, saved screen, references, frozen 48/50 demonstration or V25.

## Decision: define the care obligation before adding another model

The next milestone should be a clinically reviewed contract connecting each recommendation to a responsible clinician, required capability and action deadline. The completed study supports further investigation of targeted evidence, but it does not establish a replacement for the demonstration or safe autonomous self-care.

Counsel publishes an average two-minute physician response and separately describes physician access usually within 15 minutes during clinical hours of 8 am–9 pm, seven days a week. Its stated population is adults 18+. These are service descriptions, not measured response distributions or patient-level guarantees in this study. Its consent describes care primarily through asynchronous messaging while recognizing that some problems require in-person or urgent care. Rapid async review can initiate same-day care; a quick reply alone does not establish that examination, testing or treatment was completed. [Service description and FAQ](https://www.counselhealth.com/), [informed consent](https://www.counselhealth.com/informed-consent), checked 16 September 2026.

## 1. What the completed experiment actually shows

The [registration](../outputs/workflow-aware-disposition-2026-09-16/registration.json), [generation freeze](../outputs/workflow-aware-disposition-2026-09-16/study/generation-complete.json) and [scoring audit](../outputs/workflow-aware-disposition-2026-09-16/study/scoring-audit-workflow-aware.json) bind 1,568 valid one-call outputs: 98 messages, four arms, two models and two repetitions. These are repeated observations on 50 familiar cases and 48 AI-authored challenge messages in 24 pairs, not 1,568 independent patients. Scoring followed the full generation freeze. No patient outcome, care completion or independent clinical validation was measured.

| Fable arm | Known agreement, repetitions 1 / 2 | Required clinician action detected, /43 | Urgent reference detected, /25 | Self-care selections, /50 | False omission among self-care |
|---|---|---|---|---|---|
| Contemporary baseline | 45/50; 46/50 | 40; 40 | 24; 24 | 9; 10 | 3/9; 3/10 |
| Rapid async context | 45/50; 46/50 | 40; 41 | 24; 24 | 9; 8 | 3/9; 2/8 |
| Workflow contract | 45/50; 45/50 | 40; 40 | 24; 24 | 9; 9 | 3/9; 3/9 |
| Workflow contract plus evidence | 46/50; 46/50 | 41; 41 | 24; 24 | 8; 8 | 2/8; 2/8 |

The evidence arm resolved C47 in both repetitions but retained C07 and C22 as missed clinician review and C49 as an urgent-reference disagreement. It selected clinician action in 42/50 cases, including one false-positive referral under the frozen reference. The contemporary baselines selected clinician action in 41/50 and 40/50, with one and zero false-positive referrals respectively. A higher referral rate is a workload change to measure, not an unqualified safety benefit.

The historical 48/50 result remains historical. The fresh baseline's different outputs demonstrate why an older favorable result cannot substitute for a concurrent control. The study cannot identify whether variability reflects sampling, provider implementation or another unobserved serving factor.

On the unreviewed challenge targets, Fable evidence agreement was 45/48 and 44/48; required clinician action was detected in 30/33 and 29/33 definite-positive messages. The local Nano evidence arm reached 43/50 on familiar cases in both repetitions, but retained three missed clinician reviews and introduced case-level regressions against its own control. All Nano variants failed the saved familiar-cohort screen. Neither challenge compatibility nor local speed supplies clinical validation. Full case changes and all arms remain in the [scorecard](../outputs/workflow-aware-disposition-2026-09-16/study/scorecard-workflow-aware.json).

## 2. Separate the dimensions that three buckets combine

The following fields are a **proposed future contract**, not additional outputs produced by this study.

| Dimension | Question to answer | Evidence required |
|---|---|---|
| Routing modality | Who should receive the next contact: guidance, physician messaging, in-person service or emergency service? | Original message and approved intended-use definition. |
| Clinical urgency | By when must a qualified clinician assess the concern, and by when must necessary care occur? | Clinician-reviewed action-specific deadlines; an average response time is insufficient. |
| Required capability | Is clarification sufficient, or are examination, imaging, testing, prescribing assessment, a procedure or emergency treatment needed? | Explicit clinical requirements and applicable guidance. |
| Verified service capability | Can the proposed destination actually provide or arrange that capability within the deadline? | Timestamped operational evidence, or an explicitly hypothetical scenario during offline evaluation. |
| Ownership through completion | Who remains responsible until the needed action is completed, declined or transferred with acknowledgment? | A named clinical role and auditable state transitions; a generated recommendation is not acceptance. |

A proposed operational record would distinguish requested, accepted, assessed, arranged, completed and unresolved states. It would retain the accountable role, deadline, supporting event and escalation owner. Acknowledgment, first physician response and definitive care need separate timestamps. These are proposed clinical operations requirements; the stripped GUI has not implemented a queue, booking, acceptance or follow-up system.

Unknown capacity must remain unknown. Neither a successful model call nor a fast first reply can be used as evidence that a downstream appointment, examination or treatment is available. Clinical governance must define what happens outside intended population or staffed capacity before any patient-facing use.

## 3. Exact residual cases and the next test

The messages below are exact saved synthetic inputs. Unless stated otherwise, the case-level outputs in this section describe Fable. Their physician-v3 routes are retained. Questions and assessment requirements below are proposals for a new, independently reviewed protocol, not retroactive additions to the one-message experiment.

### C22: Ankle assessment remains incomplete

> 24M. I rolled my ankle playing basketball last night. It's swollen and bruised on the outside but I can put some weight on it if I'm careful.

**Frozen target:** `ASYNC_PHYSICIAN`. Both contemporary baseline, contract and evidence repetitions selected `SELF_CARE`; rapid-async context selected self-care in repetition 1 and async in repetition 2. This is a missed clinician-review endpoint when self-care is selected, not a demonstrated fracture or measured harm.

**Proposed test:** determine whether the workflow preserves the difference between some weight-bearing and a completed four-step assessment, and whether it recognizes that relevant bony tenderness was not reported. Adult Ottawa guidance includes specific tenderness sites and weight-bearing immediately after injury and at assessment. Test unknown findings separately from explicit negatives; do not manufacture a negative rule or presume that a message can replace a reliable examination. [Adult Ottawa guidance, December 2023](https://aci.health.nsw.gov.au/ecat/appendices/ottawa-ankle-adult).

### C47: Sleep difficulty with daytime symptoms

> 45F. I've had trouble falling asleep for the last month or so. Work has been stressful. I'm functioning but tired all day.

**Frozen target:** `ASYNC_PHYSICIAN`. Both baseline, context and contract repetitions selected `SELF_CARE`; both evidence repetitions selected async. This is a reproducible developmental change within two saved repetitions, not proof of a durable clinical improvement.

**Proposed test:** ask about frequency, duration, daytime impairment and relevant sleep, medication and health history when a clinician-reviewed clarification protocol calls for it. NHLBI advises discussion with a clinician when inadequate sleep affects daily activities. Its chronic-insomnia duration definition does not instruct a person to defer assessment until that duration is reached. Evaluate whether the workflow obtains decision-changing information without inventing absent concerns. [NHLBI diagnosis guidance, updated March 2022](https://www.nhlbi.nih.gov/health/insomnia/diagnosis).

### C07: Pediatric scope and missing findings

> My 3-year-old has had a fever up to 102F for 2 days. He's still drinking okay and pretty playful in between the fevers. No rash that I can see.

**Frozen target:** `ASYNC_PHYSICIAN`. All eight Fable outputs selected `SELF_CARE`. C07 is therefore a residual of the fresh baseline as well as every variant; it was not newly introduced by the evidence arm. A rationale that turns unreported findings into reassuring negatives needs separate review from its bucket score.

**Proposed test:** first resolve the intended population. This pediatric message is outside the publicly described adult service scope. Keep it in the completed 50-case denominator; do not improve a historical score by removing it. A future adult-use study should prespecify how pediatric requests are identified and directed to an appropriate staffed pathway. A pediatric clinical protocol and its questions require separate qualified review. [Published population scope](https://www.counselhealth.com/).

### C49: Messaging versus required chest-pain assessment

> 28M. Sharp pain on the left side of my chest since yesterday, worse when I take a deep breath. I did a heavy chest workout two days ago. No shortness of breath, no leg swelling, I don't smoke.

**Frozen target:** `URGENT_ESCALATION`. Both baseline, contract and evidence repetitions selected `ASYNC_PHYSICIAN`; context repetition 1 selected async and repetition 2 selected urgent. The recommendation retains clinician assessment, but the care-setting requirement disagrees with the frozen target. No clinician contact, completed action or delay was measured.

**Proposed test:** require reviewers to specify the necessary assessment, capability and deadline, and the conditions under which rapid physician messaging can coordinate that assessment. The model's exercise-related explanation cannot establish a completed clinical rule-out. NICE makes use of the pulmonary embolism rule-out criteria conditional on a clinician's low overall suspicion informed by history, examination and relevant initial assessment. The original message does not establish that process. This supports testing unsupported reassurance; it does not diagnose this synthetic case. [NICE NG158, recommendations 1.1.15–1.1.17](https://www.nice.org.uk/guidance/ng158/chapter/Recommendations).

### C43: A case-level urgent disagreement hidden by a stable total

> 34M. I've had a cough for about three weeks now with night sweats and I've lost maybe 10 pounds without trying. I moved here from a country where TB is common.

**Frozen target:** `URGENT_ESCALATION`. Both baseline, contract and evidence repetitions selected urgent. Context repetition 2 selected `ASYNC_PHYSICIAN`; context repetition 1 selected urgent. In repetition 2, the context arm resolved C49 while introducing C43 as an urgent-reference disagreement, leaving the aggregate at 24/25.

**Proposed test:** preserve the need for clinician assessment and a plan for necessary testing while separately deciding whether rapid messaging is an adequate next contact. CDC identifies this symptom pattern as relevant to possible active tuberculosis and recommends contacting a healthcare provider or health department about testing. It does not establish the service-specific completion deadline from this message. Review that deadline and any necessary precautions explicitly. [CDC symptoms and testing advice, January 2025](https://www.cdc.gov/tb/signs-symptoms/index.html).

## 4. Preserve today's screen; register a stricter future rule

The saved screen rejected new required-clinician false negatives, lower aggregate urgent detection or unresolved protocol failures. It did not reject every change in the identity of an urgent-reference miss. Thus its `no_prespecified_regression_detected` status for Fable context repetition 2 remains unchanged. The C43/C49 exchange demonstrates a limitation of that rule, not a reason to rewrite it after observing outcomes.

For a **new study**, clinical reviewers should assign critical-action requirements and severity strata before seeing model outputs. Prespecify rejection on **any newly missed critical action in any scheduled repetition**, relative to the same-case, same-model, same-repetition concurrent control, even if another case improves. Include case-level newly missed clinician review and urgent-reference actions in the report regardless of aggregate counts. Do not retroactively declare every present disagreement a clinically adjudicated critical miss.

A critical miss shared with the control remains unresolved and cannot be treated as acceptable by non-regression alone. Clinical reviewers must prespecify its consequences for advancement and the absolute safety requirements.

An improvement claim should also require the predeclared primary safety endpoint to improve, no unacceptable referral burden, and no unresolved validity or operational failure. The acceptable workload and uncertainty bounds must be set before evaluation using the intended workflow. Zero new misses on a finite development set is an engineering regression condition, not a zero-risk estimate. The current study provides no universal clinical acceptance threshold.

## 5. Measure denominators, workload and time to action

| Measure | Required reporting |
|---|---|
| Required clinician action | True positives and false negatives / all definite clinician-required cases, including failed outputs. Current known denominator: 43/50 cases. |
| Urgent endpoint | Correct urgent selections / definite urgent-reference cases. Current known denominator: 25/50. Emergency timing remains unresolved by the merged bucket. |
| False omission | Missed required clinician review / self-care selections with definite binary references; show ambiguous self-care references separately. Current Fable evidence: 2/8 in each repetition. |
| Referral burden | Number and proportion referred, false-positive referrals, repeat contacts, clinician handling time and downstream assessment burden. A higher sensitivity obtained by referring everyone must be visible. |
| Challenge reference uncertainty | Keep the 48 AI-authored messages separate: 33 definite clinician-positive cases, six ambiguous clinician-action references; 17 definite urgent cases and five ambiguous urgent references. Report unresolved cases rather than assigning convenient negatives. |
| Actual service timing | Arrival to first qualified review, decision-changing clarification, required examination/testing/treatment and completion. Report median, p90/p95, denominator, sample window, late/unresolved cases and deadline compliance, stratified by urgency and operational context. |
| Repeated observations | Show each repetition and exact unstable cases. Do not add per-phase and `ALL_PHASES` denominators or treat paired probes as independent patients. |

The saved [operations artifact](../outputs/workflow-aware-disposition-2026-09-16/study/operations-workflow-aware.json) contains inference latency. It does not measure physician response or completed clinical care. Empirical tail latency is not a service-level guarantee. An unresolved case at the end of observation must remain in the timing analysis with its censoring or failure status; it must not disappear because completion was not observed.

## 6. Evaluate evidence relevance before changing dense retrieval

The [retrieval comparison](../outputs/workflow-aware-disposition-2026-09-16/retrieval/retrieval-comparison.json) recorded **zero selected-order changes across 98 messages** and 69 no-hit packets. Hybrid ranking operated only on lexically eligible topics. This does not test whether unrestricted dense retrieval can recover a relevant synonym, and it does not demonstrate that all no-hits were errors. More embeddings or a larger corpus is therefore an untested next intervention.

First create a clinician-reviewed retrieval benchmark independent of the saved outcome labels. For each original message or newly authored query, reviewers should annotate the required action-support passage, its population and exclusions, unknown applicability, acceptable no-hit behavior and irrelevant-but-similar distractors. Include criteria-completeness failures, negation, temporal and subject changes, source-instruction attacks, stale guidance and cases outside population scope. A source hash proves identity; it does not prove relevance or applicability.

Measure exact support-span recall, irrelevant passage inclusion, incorrect applicability, unsupported citations and packet length before comparing lexical eligibility with an expanded dense candidate set or reranker. Hold the corpus, reference annotations and evaluation queries fixed. Only a measured retrieval deficiency should motivate a new retrieval arm. Then run a separately frozen decision experiment: better retrieval metrics do not themselves establish fewer missed clinical actions. Show the source passage, applicability limits and concise decision summary; do not present a rationale as a faithful account of hidden reasoning.

## 7. Small, testable engineering changes

| Proposed experiment | Controlled design | Decision before further complexity |
|---|---|---|
| Clarification under clinical ownership | A separately versioned protocol with a prespecified small question limit, clinician-approved synthetic answers, explicit unknown/unanswered states and stopping rules. Questions must not delay an already indicated critical action. | Does it obtain decision-changing information without adding unsupported findings, missing a deadline or increasing unresolved handoffs? |
| Nano as a shadow extractor | Extract exact input spans, subject, negation, timing and uncertainty. The original message still reaches the clinician or downstream model. No authority to suppress review or approve self-care. | Can it preserve clinically important facts across an independently annotated extraction set? Deterministic quotations alone do not prove correct interpretation. |
| Fixed TypeScript/Mastra workflow | Validate input and service scenario, optionally retrieve bounded evidence, make the declared decision call, validate output and retain an execution trace. Keep any evaluation offline and separate. | Do injected failures demonstrate bounded calls, no silent fallback, durable ownership events and reproducible artifacts? Avoid autonomous loops unless a defined task requires them. |
| Optional Baseten serving comparison | Confirm an existing endpoint and exact model/revision, precision, renderer and supported parameters. Keep task, inputs and output schema fixed; measure failure modes and latency distributions under a declared load. | Is the serving configuration operationally appropriate? Hosting or hardware performance does not establish clinical superiority or reproduce the local Q5 result automatically. |

Mastra documents fixed workflows as explicit execution graphs; Baseten distinguishes managed model APIs from custom model and chain endpoints. These are implementation options, not clinical evidence or evidence that an endpoint is provisioned for this project. [Mastra workflows](https://mastra.ai/docs/workflows/overview), [Baseten inference API](https://docs.baseten.co/reference/inference-api/overview), checked 16 September 2026.

## 8. Order of work and advancement criteria

| Stage | Deliverable and accountable role | Required evidence before advancing |
|---|---|---|
| Define the target | Clinical governance owner approves population, contact versus definitive-care target, capabilities, urgency, ownership and reference uncertainty. | A case can be reviewed without guessing service availability or treating an average as a deadline. |
| Adjudicate independently | At least two qualified clinicians, independent of model development, review message and declared scenario while blinded to outputs, model/arm and prior proposed targets. A third reviewer resolves disagreements; retain all original ratings. | A versioned reference and severity taxonomy. Review of familiar cases remains developmental; it does not become prospective validation retrospectively. |
| Test the mechanism | Evaluation and engineering owners freeze a small clarification, extraction or retrieval experiment and all failure criteria before generation. | Case-level benefit, full failure accounting and acceptable workload on the declared development cohort. No reuse of the current runner by editing its frozen source. |
| Evaluate fresh cases | Use genuinely new, representative inputs, independently adjudicated before model evaluation. Freeze sampling, exclusions, endpoints, repetitions and analysis. | Performance and uncertainty against the approved intended use; enough independent cases for the risk estimate being claimed. Do not tune on this evaluation set. |
| Observe in shadow | Clinical operations owns normal care; the candidate records recommendations separately and cannot remove, defer or redirect care. | Measured human–system performance, completed-action timing, missed or unnecessary referrals, subgroup review and ownership of unresolved care. |
| Consider supervised use | Clinical, engineering and governance owners review the complete evidence package and reversibility plan. | A separate explicit decision; the current study does not satisfy this stage. |

This sequence follows the distinction between development evidence and evaluation of the human–AI workflow emphasized by [DECIDE-AI](https://www.nature.com/articles/s41591-022-01772-9) and the [proposed reference review protocol](WORKFLOW_REFERENCE_REVIEW_PROTOCOL_2026-09-16.md). Approval, independent adjudication, fresh evaluation and shadow observation are pending.

### Proposed shadow stop rules

Before enrolling a shadow cohort, name the clinical safety reviewer, engineering incident owner and authority to pause the study. Prespecify immediate review and suspension of the relevant candidate pathway for a newly identified missed critical action, unsupported reassurance that could remove required review, missed action deadline, unowned handoff, data or model drift, unexplained output substitution, or a privacy/integrity failure. Pause rather than conceal invalid observations. Clinical staff retain responsibility for real care; a research recommendation is never evidence that action occurred.

Monitor referral load and unfinished work as well as misses. If the proposed pathway exceeds its prespecified burden limit or cannot meet the reviewed deadline under outages, after-hours arrival or reduced capacity, stop advancing it and review the operational contract. Preserve the triggering evidence and denominator, record the decision, and require a separately reviewed restart plan. None of these states or stop rules is implemented by the current one-shot demonstration.

**Discussion question:** can this recommendation reliably connect the right patient to a responsible clinician and required capability within a reviewed deadline, including when information or capacity is missing? The next evidence should answer that operational question before another aggregate agreement score is used to justify a broader role.
