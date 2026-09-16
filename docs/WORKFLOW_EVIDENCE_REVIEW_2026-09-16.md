# Evidence review: rapid physician messaging and disposition research

Reviewed September 16, 2026. This is an AI-assisted engineering synthesis of public sources; its clinical interpretation has not received independent review. It does not describe an internal company policy or imply endorsement. The [registered study plan](WORKFLOW_AWARE_RESEARCH_PLAN_2026-09-16.md) defines the experiment; this review supplies its rationale and limits.

## The decision that needs a clearer definition

The prompt should distinguish **who must act**, **what capability is needed**, and **when that action must occur**. A physician can begin assessment through messaging and still arrange examination today. A short response time does not prove that the examination or treatment occurred. Public service descriptions support considering rapid async assessment, while leaving case-specific guarantees and available capabilities unresolved. [Service description](https://www.counselhealth.com/), [informed consent](https://www.counselhealth.com/informed-consent).

This creates two different error questions:

- **Was required clinician review omitted?** A self-care selection can remove the opportunity to clarify important information. C22 and C47 illustrate this reference-defined failure in the saved demonstration.
- **Was the required setting or deadline missed?** An async selection against an urgent reference is a label disagreement. Establishing actual delay would require observing the subsequent care pathway. The three-bucket prototype does not measure that outcome.

The research keeps these endpoints separate and retains all frozen reference decisions, including C25 as urgent. Clarifying a target is a prospective protocol change, not a reason to rewrite historical scores.

## Clinical studies: methods worth transferring

| Primary source | Relevant design lesson | Limit on transfer |
|---|---|---|
| [Real-message triage evaluation, August 2026](https://link.springer.com/article/10.1186/s12911-026-03763-z) | Blinded physician review, validation-frozen thresholds, and reporting review volume alongside missed hazards. | Retrospective Medicaid population; its proposed acceptance thresholds are not adopted here. The publisher identifies the accessible version as an accepted manuscript. |
| [Human-reviewed inbox prioritization, 2024](https://academic.oup.com/jamiaopen/article/7/3/ooae078/7734326) | Measure actual time to first review and the workload of the receiving team. | All messages remained in a human workflow. A prioritization result cannot justify autonomous removal from review. |
| [Repeated synthetic inbox evaluation, 2024](https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2024.1452469/full) | Unchanged aggregate agreement can conceal different case-level errors across runs. | Synthetic nephrology scenarios and a different definition of urgency. Report repeats without treating them as new patients. |
| [Emergency-triage retrieval study, 2026](https://pubmed.ncbi.nlm.nih.gov/41587455/) | Compare the same model with and without retrieval and separate label agreement from outcome-based evaluation. | Single-center emergency-department data do not validate incoming-message routing. Aggregate improvement does not establish fewer harmful delays. |
| [Local clinical-agent study, September 2026](https://www.nature.com/articles/s41591-026-04609-x) | Examine behavioral consistency and independently review reference disagreements. An added critic needs a measured benefit. | Retrospective diagnostic tasks, residual errors and configuration-dependent thresholds; no transferable confidence cutoff for disposition. |
| [Randomized public-use study, 2026](https://www.nature.com/articles/s41591-025-04074-y) | Evaluate the person and system together: information provided, advice understood and action selected. | Simulated scenarios; favorable standalone answers did not establish effective patient decision making. |
| [Conversational evaluation, 2025](https://doi.org/10.1038/s41591-024-03328-5) | Test whether history-taking obtains information that changes a decision. | Simulated interaction is developmental evidence, not proof of a safe clarification pathway. |

These studies support a sequence of precise task definition, matched experiments, independent reference creation and workflow evaluation. They do not establish one universal acceptable false-negative rate. The current familiar cases and AI-authored probes cannot supply that threshold.

## Related methods that inform the next test

- **Report unsuccessful work.** Research on incomplete [clinical-trial reporting](https://www.bmj.com/content/352/bmj.i637) motivates preserving every prespecified experiment, including adverse results and unfinished calls. Applying that lesson to this software study is an engineering inference, not a claim that it is a clinical trial.
- **Examine how the reference selects patients.** [Phenotype-definition research](https://pmc.ncbi.nlm.nih.gov/articles/PMC10148336/) shows that inclusion rules change subgroup representation and measured performance. Its illustrative majority-vote reference is a silver standard. Here, a reviewed population and explicit care target should precede subgroup claims; the small authored pack cannot establish equity.
- **Make clinician responsibility observable.** A [physician-centered oversight preprint](https://arxiv.org/abs/2507.15743) separates intake from physician-authorized decisions. Its 60 simulated scenarios and constrained comparator limit transfer. The testable next step is whether a reviewed intake aid improves clinician decisions and time to action, not whether another agent can approve its own recommendation.
- **Define the relevant disparity before measuring it.** The [HEAL framework](https://pubmed.ncbi.nlm.nih.gov/38685924/) relates performance to domain-specific patient-group needs in a retrospective dermatology example. Future routing evaluation should predefine relevant groups, reference quality and referral burden. Its published metrics are not imported as a triage acceptance rule.

These are methodological applications of public work. No individual's preferences, private views or endorsement are inferred.

## Platform lessons: use the smallest auditable workflow

The public [Counsel/Mastra case study](https://mastra.ai/customers/counsel-health) describes TypeScript workflows, clinical retrieval and clinician oversight. That makes the repository's existing framework a reasonable fit. A case study does not disclose the company's routing rules or clinically approve this implementation.

[Mastra workflows](https://mastra.ai/docs/workflows/overview) permit a fixed sequence with explicit inputs and outputs. The experiment uses that structure for one disposition call; it does not add autonomous planning, a judge or a repair loop. [Observability](https://mastra.ai/docs/observability/overview) is useful for provenance, but tracing alone neither removes sensitive data nor establishes clinical correctness. This study uses synthetic messages and local artifacts with external telemetry disabled.

Baseten's [medical search](https://www.baseten.co/resources/customers/openevidence-delivers-instant-medical-information-with-baseten/) and [pharmaceutical retrieval](https://www.baseten.co/resources/customers/latent-delivers-pharmaceutical-search-with-baseten/) examples illustrate separating serving, retrieval and generation. Those are infrastructure lessons, not evidence of safer triage. A migration to [Chains](https://docs.baseten.co/development/chain/overview) would need an operational requirement that the present local research lacks. No additional hosting service was introduced.

## Retrieval should address a demonstrated information gap

A source can be authoritative yet irrelevant to a particular patient. The new research therefore records source identity, selected text, population scope, missing prerequisites and exceptions separately. The bounded card set keeps complete decision-relevant clauses rather than assuming adjacent unselected text reached the model. A no-hit result provides no reassurance.

The proposed ablation asks whether those selected clauses improve a fixed task while preserving clinician-action sensitivity. It does not assume that a larger corpus or a denser search index is automatically better. The old corpus and database remain unchanged. Narrow scope, prior-informed topic selection and clinically unreviewed cards limit the conclusions.

For any subsequent retrieval change, specify in advance:

1. The failure mechanism: missing source, missed retrieval, incomplete selected passage, wrong applicability, or failure to use relevant evidence.
2. A same-input comparison and cases that should **not** change.
3. Source currency, provenance, complete conditions and exceptions.
4. Clinical review of both repaired and newly introduced errors.
5. Added latency and receiving-clinician workload, without treating a source citation as approval.

## Inversion: what could make an apparent improvement unsafe?

| Failure to prevent | Observable check |
|---|---|
| A reported average becomes a guaranteed clinical deadline | Keep response statistics out of case-specific capability assumptions. |
| Missing history becomes an asserted negative finding | Compare each reassuring assertion with the original message. |
| Nearly everyone is referred and agreement rises | Show self-care coverage, false omission and added referrals together. |
| A familiar miss is repaired while a different miss appears | Publish exact paired changes and every new missed clinician action. |
| A persuasive rationale conceals the wrong machine-consumed bucket | Score the enum; review advice quality as a separate endpoint. |
| Repeated variants create the appearance of a large independent cohort | Report unique messages, pair families, repetitions and development exposure. |
| Another model acts as an unvalidated safety authority | Keep automated checks diagnostic; obtain independent clinical review. |
| A correct recommendation is mistaken for completed care | Measure actual action and ownership in a later shadow study. |

## Next decision after the development results

Use the results to decide which hypothesis deserves clinical review, including the possibility that none does. Freeze a genuinely new, representative evaluation cohort under a reviewed operational scenario. Preserve independent initial physician ratings and disagreements. Only then consider a shadow study alongside normal care, with clinically approved pause conditions and explicit responsibility for unfinished care. The [reference-review protocol](WORKFLOW_REFERENCE_REVIEW_PROTOCOL_2026-09-16.md) specifies those artifacts.

This sequence is consistent with the emphasis on reference standards and human–AI team performance in [IMDRF development principles](https://www.imdrf.org/sites/default/files/2025-02/IMDRF_AIML%20WG_GMLP_N88%20Final.pdf), and the workflow focus of [DECIDE-AI](https://www.nature.com/articles/s41591-022-01772-9). These frameworks guide evidence collection; they do not certify this prototype.
