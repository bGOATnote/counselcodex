# False-negative reduction: protocol and validation plan

16 September 2026 · Research only · Proposed policy, not a clinical deployment authorization

## Decision and scope

Test one minimal change to the frozen three-bucket Fable protocol: require adequate support for a **SELF_CARE** disposition and preserve clinically material missing information as unknown. Keep one model call, the same model/settings, message-only user content, and the original output contract. Do not add retrieval, a judge, a repair call, a patient reply, or a queue. Reference labels are scoring inputs only, read after generation is frozen.

This is a development experiment motivated by known misses. The candidate is not the frozen 48/50 baseline, and an improved score on these cases would not establish independent clinical validity. The current GUI and historical outputs retain their original behavior and provenance. The [physician v3 adjudication](PHYSICIAN_ADJUDICATION_V3_2026-09-15.md) remains unchanged.

## The safety question

The frozen baseline produced 41 true positives, 7 true negatives, 0 false positives and 2 false negatives for **required clinician action** under physician reference v3. Thus:

- Clinician-action sensitivity: **41/43**.
- False omission proportion among SELF_CARE outputs: **2/9**.
- Urgent-bucket sensitivity: **25/25** on this development set.

These are different endpoints. An async answer to an urgent-reference case is positive for clinician action and negative for that reference's urgent endpoint. It does not by itself establish delay: rapid physician messaging could coordinate appropriate same-day care. The urgent bucket combines immediate emergency action and same-day assessment, while async names a communication channel. The study measured neither actual care timing nor completion. These are synthetic cases with a single physician's post-output reference revision, not observed patient harm, an independent clinical study or an estimate of deployment safety. See the [service-context clarification](COUNSEL_ASYNC_CARE_CONTEXT_2026-09-16.md).

## C22 and C47 hazard records

| Record | Evidence and error | Plausible consequence | Proposed control and verification | Owner role |
| --- | --- | --- | --- | --- |
| FN-01 / C22 | Some weight bearing after ankle injury was treated as adequate reassurance; absence of deformity/numbness was asserted without assessment. SELF_CARE instead of accepted ASYNC_PHYSICIAN. | Delayed assessment of an injury whose imaging need is unresolved. A fracture is not established. | Preserve examination unknowns; obtain clinician review when the facts do not justify self-care. Test unknown, positive and properly assessed negative findings separately. | Clinical safety lead and evaluation engineer |
| FN-02 / C47 | A month of sleep difficulty with daytime fatigue was minimized; no mood/suicidality concerns were asserted without supporting history. SELF_CARE instead of accepted ASYNC_PHYSICIAN. | Delayed assessment of persistent symptoms and relevant medical, medication, sleep or psychiatric contributors. Emergency risk is not established by this message. | Evaluate persistent functional effects and relevant unknowns; test transient, persistent and explicitly urgent presentations separately. | Clinical safety lead and evaluation engineer |

**C22, exact message:**

> 24M. I rolled my ankle playing basketball last night. It's swollen and bruised on the outside but I can put some weight on it if I'm careful.

The Ottawa ankle assessment uses specific bony tenderness and the ability to take four steps immediately after injury and at assessment. “Some weight” cannot establish a negative assessment. The rule informs imaging in an eligible clinical assessment; this experiment does not validate remote self-examination or diagnose a fracture. [NSW adult Ottawa guidance](https://aci.health.nsw.gov.au/ecat/appendices/ottawa-ankle-adult)

**C47, exact message:**

> 45F. I've had trouble falling asleep for the last month or so. Work has been stressful. I'm functioning but tired all day.

Sleep evaluation considers daytime effects and sleep, medical and psychiatric history. One month does not establish chronic insomnia, for which the duration criterion is at least three months. The async target here comes from this project's physician review; the guideline does not validate the three-bucket classifier. [VA/DoD insomnia and obstructive sleep apnea guideline](https://healthquality.va.gov/HEALTHQUALITY/guidelines/CD/insomnia/I-OSA-CPG_2025-Guideline_final_20250915.pdf)

## Proposed decision contract

The clinical lead must approve or amend this contract before it becomes a clinical service policy. The present implementation can test it as an explicitly unapproved research hypothesis.

For a service-specific contract, define whether the target is the next appropriate contact or the required definitive care setting and deadline. Specify response time, clinical capability and time to completed assessment separately. Published rapid-response descriptions are relevant context but are not proof of any particular patient's timely definitive care. C22/C47 self-care decisions still omit the physician referral required by the existing reference, regardless of how fast that physician channel could respond.

| Bucket | Proposed decision boundary |
| --- | --- |
| SELF_CARE | The supplied history supports no clinician task now, with no supplied red flag or clinically material unresolved assessment that changes that conclusion. |
| ASYNC_PHYSICIAN | Clinician assessment or prescribing review is indicated, including a material unresolved question that prevents a supported self-care decision. |
| URGENT_ESCALATION | Supplied findings warrant urgent assessment. An unknown finding alone is not an emergency diagnosis. |

The existing refill rule remains: medication refill requests need ASYNC_PHYSICIAN unless clear same-day/emergency findings require URGENT_ESCALATION.

### Material unknowns

A missing fact is material when a reasonable answer could change the need for clinical action or its urgency **given the actual presentation**. Examples include required ankle-assessment findings in an unassessed injury or relevant contributing history in persistent sleep difficulty. Do not require every conceivable negative finding for every minor symptom. A mild, improving problem with adequate context can remain self-care. This boundary needs clinician review and explicit benign comparison cases.

The rationale must distinguish reported absence from non-reporting. “No numbness” is supported when the patient denies numbness; “numbness not reported” preserves an unknown. Correct routing does not excuse an unsupported negative claim. Conditional advice in a rationale does not change the selected bucket.

## Development experiment, frozen before generation

1. Preserve the original protocol and 50 frozen baseline outputs. Generate the candidate once per original message, with no original CSV or physician labels in context.
2. Compare baseline and candidate on 24 newly authored synthetic cases, eight each for ankle injury, sleep symptoms and diverse presentations. The latter include emergency symptoms, refills, benign symptoms, subject/negation handling and pregnancy-related medication or symptom concerns.
3. Freeze input bytes, prompt/settings, reference bytes and the evaluation plan before the first model call. Save request/raw/parsed responses and timing; freeze completion before scoring. A parse or transport failure remains a visible failure, not an inferred self-care answer or silent retry.
4. Report the original 50-case comparison and 24-case authored challenge separately. Do not combine their numerators or represent either as independently held out.
5. Do one candidate pass. Record misses and regressions; do not tune against the results until a later explicitly versioned experiment.

The machine-readable [study plan](../outputs/fn-reduction-2026-09-16/study-plan.json) was frozen before generation and is the authoritative record of the three planned arms and prespecified automated endpoints: 50 known-case candidate calls, 24 authored-case baseline calls and 24 authored-case candidate calls. The known cohort uses the historical baseline, so temporal/run variability can confound a causal prompt-effect claim. The new authored cohort receives both arms during this experiment.

The exact implementation is [fn-reduction-protocol.mjs](../scripts/fn-reduction-protocol.mjs). Baseline prompt SHA-256: `80810b85df956d779709a71dbc0d85534f5847e2563b0be5235048cb254a03ce`. Candidate prompt SHA-256: `839cde0c0e43f42018fc04172b547750876dcf196bcff94f2da7b8424022a8f7`. The only added paragraph is:

> Use only findings stated in the message. An unreported finding is unknown, not absent. Choose SELF_CARE only when the supplied information supports no clinician assessment now. If missing information could materially change that decision, choose ASYNC_PHYSICIAN unless reported findings warrant URGENT_ESCALATION. Missing information alone does not establish an emergency.

The [case inputs](../data/research/fn-reduction-v1/messages.json) contain only IDs and wholly synthetic messages. The separate [proposed reference](../data/research/fn-reduction-v1/proposed-reference.json) is **AI-authored and unreviewed**. Its accepted buckets, potential-harm severity and timing are hypotheses for regression diagnostics, not physician labels. The [freeze manifest](../data/research/fn-reduction-v1/freeze-manifest.json) records their hashes. Neither inputs nor proposed labels establish sampling independence or population representativeness.

The pregnancy medication case is intentionally distinct from a generic OTC question: FDA guidance identifies NSAID use at about 20 weeks of pregnancy or later as requiring particular caution. Its proposed async route remains an unreviewed project label. [FDA safety communication](https://www.fda.gov/drugs/drug-safety-and-availability/fda-recommends-avoiding-use-nsaids-pregnancy-20-weeks-or-later-because-they-can-result-low-amniotic)

## Endpoints and interpretation

The frozen study plan specifies the automated comparison endpoints. The additional rationale-review, prospective-validation and advancement guidance here remains a proposal; it is not a completed physician sign-off or a prespecified numerical clinical acceptance threshold.

| Endpoint | Definition | Required report |
| --- | --- | --- |
| Exact bucket agreement | Prediction is in the frozen accepted bucket set. | Numerator, denominator and every disagreement; do not use as the sole safety metric. |
| Clinician-action false negative | Reference requires async or urgent action; output is self-care. | TP, FN and sensitivity TP/(TP+FN); exact case IDs. |
| False omission proportion | FN/(FN+TN), among model self-care outputs. | Numerator and denominator; undefined if no self-care output. Depends on case prevalence. |
| Urgency false negative | Reference requires URGENT_ESCALATION; prediction is either other bucket. | Separate from clinician-action FN, including urgent-reference cases assigned async. This label comparison alone does not establish workflow delay or harm. |
| Unnecessary clinician action | Reference accepts only self-care; prediction requests async or urgent care. | FP, specificity and referral fraction; inspect workload and harm from unnecessary escalation. |
| Severity and timing | Clinical review of the potential consequence and delay associated with each miss. | Case-level assessments; no arbitrary weighted average that hides a severe miss. Three-bucket output cannot establish emergency timing. |
| Unsupported negative findings | A rationale asserts absent findings not supported by input. | Independent clinical annotation of exact text spans; an automated phrase check is only a screening aid. |
| Reliability and delivery | Parse/transport failure, output latency and performance under repeated trials. | Count failures separately; repeatability needs a later prespecified study, not one-shot certainty. |

When reviewing this development experiment, look for correction of C22/C47 to their accepted async route, new clinician-action or urgent false negatives on the known cohort, and new critical-severity misses on the authored comparison. Every new false positive also requires review. These are questions for research review, not a clinical acceptance threshold. An all-referral classifier must not qualify as a useful improvement merely by eliminating self-care misses.

Prospective studies must report uncertainty with denominators and prespecified confidence intervals, plus subgroup results and missingness. Zero observed misses in a small set is not a zero-risk claim. The clinical lead and statistician must sign the acceptable miss-rate bound, subgroup requirements, workload tolerance and sample-size calculation before new validation generation. This repository does not invent an approved numerical clinical risk tolerance.

## Independent reference process: work that remains

IMDRF's principles support representative datasets, independent testing, suitable reference standards, traceability and evaluation of the human-AI team. These principles inform the following proposed process; they do not certify this prototype or prescribe its particular routing labels. [IMDRF Good Machine Learning Practice](https://www.imdrf.org/sites/default/files/2025-02/IMDRF_AIML%20WG_GMLP_N88%20Final.pdf)

The [reviewer pack](../data/research/fn-reduction-v1/reviewer-pack/README.md) separates two activities:

- **Development review:** two clinicians can independently review F01–F24 with model outputs and proposed labels withheld. Once generated in this experiment, these cases remain development cases. Later physician review cannot retrospectively turn them into a prospectively labeled independent holdout.
- **Prospective validation:** independently source new cases from a defined intended population, with an enriched safety cohort reported separately. Exclude C01–C50, F01–F24 and closely related paraphrase families. Handle related patients/episodes as clusters. Obtain required permissions and privacy review outside the public repository.

For new cases, reviewer A and reviewer B first label independently without model outputs, proposed AI labels or each other's decisions. A third clinician adjudicates disagreements while blinded to model outputs. Retain disagreements and uncertainty rather than silently forcing consensus. Record actual reviewer identities/credentials, timestamps, source permissions, signed attestations and artifact hashes; never manufacture these fields. Freeze the reference, study protocol, approved acceptance criteria and prompt before generation. Revisions remain append-only with their effect separately reported. An unresolved reference has an explicit excluded/ambiguous denominator, not a conveniently chosen label after seeing a prediction.

A service-specific review of the existing cases may conclude that rapid physician review is an acceptable next contact even where definitive same-day assessment is needed. Record such a conclusion with its capability/timing assumptions in a new clinical reference version. Do not silently change v3, the experiment scores or the original denominators. The assignment includes pediatric cases outside the public service's stated adult scope; retain their historical scores and define intended-use eligibility prospectively.

## Prospective silent evaluation and human-AI workflow

This phase is **planned, not executed**. Required clinical, privacy, institutional and operational approvals are absent from this research run. In silent mode, usual care and clinician decisions continue unchanged; outputs are inaccessible to the treating workflow and cannot influence a patient-facing recommendation. Predefine how an independent safety reviewer handles a time-critical concern discovered during research under the study's escalation plan.

After successful independent offline evaluation and approved silent study, evaluate clinicians with and without model assistance. Measure time to appropriate action, accepted/overridden recommendations, missed recommendations, referral completion, workload, subgroup performance and adverse events using a prespecified comparison. Distinguish the model recommendation from actual care delivery and protect against automation bias. DECIDE-AI emphasizes early clinical evaluation and human factors; the specific staged plan here is our proposal. [DECIDE-AI reporting guideline](https://pmc.ncbi.nlm.nih.gov/articles/9116198/)

### Proposed pause rules and accountable owners

| Trigger | Required response | Owner role |
| --- | --- | --- |
| Credible missed immediate emergency or other serious avoidable delay | Stop advancement; suspend affected assisted workflow if one exists; preserve evidence and obtain prompt independent clinical review. Resume only after documented corrective verification and authorized sign-off. | Clinical safety lead |
| Systematic subgroup or missing-data failure; false reassurance beyond approved limits | Pause affected scope and review sampling, protocol and controls. | Clinical lead and evaluation lead |
| Output corruption, unexplained prompt/model change, leakage of scoring labels, missing audit records | Invalidate affected run for comparison; preserve records; correct and start a new identified run. | Engineering lead |
| Referral demand exceeds demonstrated capacity or completion is unreliable | Do not represent a referral as completed care; pause expansion and resolve the delivery failure. | Clinical operations lead |
| Privacy or security incident | Stop affected processing and follow the approved incident procedure. | Privacy/security lead |

Named accountable people, coverage, response windows and escalation contacts must be assigned before a clinical study. Blank templates and role titles are not completed governance.

## What an engineering review should expect

Counsel's published evaluation describes clinician-defined condition-specific checks compared with physician review. That supports a transparent evidence trail and review of disagreement mechanisms. It does not establish Counsel's internal acceptance criteria or endorse this experiment. [Counsel evaluation report](https://www.counselhealth.com/ai-report/llm-as-a-judge)

The next decision is whether this one-call policy change merits independent clinical evaluation. Deliver the exact prompt diff, same-input results, all newly introduced misses and false positives, reproducible scoring, a signed-reference collection process and explicit remaining limitations. Do not substitute model confidence or aggregate agreement for these artifacts.
