# Workflow-aware disposition: prespecified development study

Status: implementation and protocol review before inference. Prepared September 16, 2026. This is an independent synthetic research study, not a Counsel clinical policy, service integration, or deployment recommendation. The existing GUI, frozen model outputs, physician references and V25 remain unchanged.

## Decision being tested

An asynchronous channel does not imply delayed care. Counsel publicly reports an average two-minute physician response. Its informed consent also describes situations requiring in-person or emergency care. These establish neither a patient-level response guarantee nor completion of a necessary examination or treatment. [Service description](https://www.counselhealth.com/), [informed consent](https://www.counselhealth.com/informed-consent).

The experimental target is **the care pathway supported by the message**, with three exact assignment buckets:

| Bucket | Proposed meaning |
|---|---|
| SELF_CARE | Guidance is sufficient; no clinician assessment task is needed now. |
| ASYNC_PHYSICIAN | A physician needs to assess, clarify, prescribe or coordinate care; assessment can begin through messaging, including promptly or the same day. |
| URGENT_ESCALATION | The message supports in-person assessment today or immediate emergency action. Messaging can coordinate that care but cannot replace its required capabilities. |

These definitions remain a research proposal pending independent clinical review. They do not implement availability, acceptance, booking, follow-up, or a patient reply. Three buckets cannot distinguish emergency action from same-day assessment. Emergency timing and completed care remain unmeasured.

The frozen physician v3 reference includes C25 as urgent and all 50 cases. This is a single-physician reassessment after viewing outputs, not a blinded prospective reference. Its revised self-care decisions are retained. Existing C04/C43/C49 disagreements against urgent references do not establish observed harmful delay; rapid clinician assessment might be an acceptable next contact under a different, explicitly reviewed workflow contract. C22/C47 self-care decisions still bypass physician review in this prototype. No historical label or score is changed to fit a new model.

## What the research supports

Public implementation descriptions show that Counsel uses TypeScript and Mastra for clinician-led workflows and retrieval. That makes a small, fixed Mastra research workflow a reasonable implementation fit; it does not establish the company's internal routing thresholds or endorse this study. [Counsel case study](https://mastra.ai/customers/counsel-health).

Baseten's healthcare case studies separate serving, embeddings, retrieval and generation, with operational observability. Their throughput and latency claims are infrastructure results, not evidence of safer dispositions. The present experiment can test the existing local Nano model without adding a hosting dependency. [OpenEvidence case study](https://www.baseten.co/resources/customers/openevidence-delivers-instant-medical-information-with-baseten/), [Latent case study](https://www.baseten.co/resources/customers/latent-delivers-pharmaceutical-search-with-baseten/).

The most transferable clinical methods are blinded reference creation, thresholds fixed before evaluation, class-specific errors, and actual time to clinician action. A recent 2,000-message study found substantial review burden when pursuing high sensitivity. A deployed inbox-prioritization study retained human review for all messages; its tradeoff cannot authorize removing review through autonomous self-care. [Messaging safety study](https://link.springer.com/article/10.1186/s12911-026-03763-z), [inbox workflow study](https://academic.oup.com/jamiaopen/article/7/3/ooae078/7734326).

Retrieval is a hypothesis to test. A matched emergency-triage study reported broader agreement gains while undertriage changed from four cases to three. Better aggregate accuracy does not show that the dangerous miss mechanism was resolved. [MECR-RAG](https://pubmed.ncbi.nlm.nih.gov/41587455/).

## Frozen comparisons

| Arm | Change | Interpretation |
|---|---|---|
| baseline | Exact original prompt and original Fable settings | Contemporary control; historical 48/50 is context only. |
| async_context | Add only a paragraph explaining rapid async assessment and its limits | Tests whether channel semantics affect selection. |
| workflow_contract | Define all three care pathways and distinguish missing information from negative findings | Tests a combined, explicit decision contract; not an isolated test of a single sentence. |
| workflow_evidence | Same contract plus bounded, attributable source cards and applicability instructions | Tests the complete retrieval package against the contract alone; source content and its instructions are not separately identified effects. |

Each arm uses one disposition call per case, with no judge, retries, repair calls, fallback model or runtime reference access. The original patient message is the entire user message. Supplemental sources enter a separately marked untrusted reference-data section, never as patient facts. Retrieval uses only the message. No CSV labels, physician answers, case identifiers or exemplar answers enter a provider request.

Two models are evaluated separately:

- Fable 5.1: original adaptive thinking, low effort, 4,096 maximum output tokens. Exact contemporary baseline prompt SHA-256: `80810b85df956d779709a71dbc0d85534f5847e2563b0be5235048cb254a03ce`.
- Existing local Nemotron 3 Nano Q5 model: fixed installed digest, non-thinking mode, 8,192 context, 1,024 output limit, temperature zero, prespecified seed. Ollama enforces the same two-field JSON schema for every Nano arm. This differs from Fable's transport and quantization; results do not isolate parameter count or provider alone.

The planned development cohort has 50 familiar assignment messages and 48 newly authored messages in 24 paired development probes. Each model/arm has two prespecified repetitions: 1,568 planned disposition calls, including 784 hosted calls. The 50 familiar cases are a regression cohort. The new pairs are AI-authored, clinically unreviewed challenges, not a held-out clinical validation set. Several probes vary a symptom cluster or dose and duration rather than one isolated variable. Earlier failures informed the challenge topics and seven-topic source-card selection. Repetitions and members of a pair are correlated; report the 98 messages and 24 pair families rather than claiming 1,568 independent patients.

The full message-only input, proposed challenge reference, protocol, settings, source cards, retrieved packets, budget, code and randomized schedule must be hashed before generation. Arm order is interleaved within case/repetition blocks. Paired Nano arms use the same seed. Each model has a serial worker; no simultaneous local model loads. Inference starts only after focused checks and metadata preflight. All generation is frozen before the offline scorer opens references.

## Evidence experiment

The source-card set covers seven narrow topics: complete adult Ottawa ankle imaging criteria, sprain care and escalation, sleep impairment assessment, pregnancy/NSAID precautions, diabetic foot concerns, tuberculosis symptoms/testing, and pulmonary embolism assessment. Cards retain relevant conditions, exceptions, population limits and source attribution. Engineering preparation is not clinician attestation.

The old corpus and its database are not modified. New retrieval records source hashes, selected passages, exclusions, applicability limits and elapsed time. A missing or irrelevant result is not evidence of safety. Adjacent text does not count as selected evidence. The card hash proves the identity of the curated card, not an archived full-page snapshot or clinical correctness.

First run a local lexical inventory. If compatible embeddings are available within the reserved allocation, compare real dense-plus-lexical ranking and freeze the resulting packets before any disposition outputs are inspected. The hybrid design ranks only lexically eligible topics; it cannot recover a synonym that failed topic eligibility. A zero-change retrieval comparison is a valid negative result. Do not describe lexical fallback as hybrid or infer applicability from semantic similarity.

## Failure-first review

| How an apparent improvement could mislead | Required check |
|---|---|
| Fast response is mistaken for completed examination | State capability and timing limits; do not claim completed care. |
| Missing symptoms become reassuring negative findings | Retain exact inputs/rationales for clinical review; paired unknown-versus-negative cases. |
| All messages are referred to reduce misses | Report added referrals, unnecessary referrals and self-care coverage alongside sensitivity. |
| The enum conflicts with the rationale | Score the machine-consumed enum; supply a separate unreviewed rationale-audit worksheet. |
| Irrelevant, stale or incomplete evidence changes the answer | Test no-hit, scope, quarantine, completeness, integrity and source-instruction attacks. |
| A repaired familiar case introduces a new miss | Publish exact paired flips, including every newly missed clinician action. |
| A valid JSON object is treated as correct care | Separate protocol validity, reference compatibility and clinical review. |
| Timeout or truncation silently becomes self-care | Persist failure; never substitute a disposition. Count failed positive cases as missed required action. |
| Repeated or AI-authored cases appear independent | Report per repetition and pair family; no population-level safety claim. |
| Tuning continues until the small cohort is perfect | Freeze one protocol; no adaptive prompt edits within this study. |

## Prespecified analysis and stop rules

Report by model, arm, cohort and repetition:

1. Agreement against physician v3 /50 for the familiar cohort; the historical /49 reference remains historical. Challenge agreement is separately labeled AI-authored-target compatibility.
2. Required clinician action sensitivity; false negatives that selected self-care; failed outputs on clinician-required messages.
3. Urgent-bucket sensitivity, with the explicit limitation that emergency timing is unmeasured.
4. False omission among self-care decisions, self-care coverage, false positives and added referrals.
5. Exact changed cases, resolved misses, new misses, within-model repeatability and Fable–Nano disagreements.
6. Validity/failure counts, end-to-end generation latency, retrieval latency, token accounting and local runtime identity. Model rationale is a decision summary, not a faithful trace of private reasoning.

The CSV is not a clinical acceptance target. If reproduced for assignment discussion, report it separately; it never enters physician metrics. No automatic judge supplies physician approval. No uncertainty interval treats repeated calls or authored pairs as independent clinical patients.

A variant fails the developmental safety screen if it introduces a new required-clinician miss on the familiar cohort relative to its contemporaneous control, reduces urgent-reference sensitivity, or has unresolved protocol failures. Any apparent improvement must also show referral burden. Passing these screens only identifies material for clinical review; it cannot authorize production or overwrite the GUI baseline. The earlier generic missing-information intervention is retained as a failed ablation.

Operational stops: fixed eight-hour session deadline; no call starts when its timeout would exceed that deadline; shared spending cap; model/settings mismatch; source/request drift; unknown accounting; interrupted dispatch; invalid local model identity. No automatic retry of an uncertain request. Planned but unrun jobs remain explicit rather than disappearing from a favorable denominator.

## Roadmap after this study

| Stage | Concrete artifact | Decision enabled |
|---|---|---|
| Define | Reviewed service contract separating next contact, action deadline and capability | Agree on what an error means. |
| Test mechanisms | Frozen matched ablations, exact regressions and retrieval audits | Decide whether added complexity has evidence of benefit. |
| Establish a new reference | Independent blinded physician review of genuinely new message-only cases; retain disagreements | Estimate performance against a prospectively defined target. |
| Observe workflow | Shadow study with normal care unchanged; measure review/action time, overrides, referral burden and subgroup errors | Evaluate the human–system workflow. |
| Consider a supervised pilot | Clinical ownership, severity-specific acceptance criteria, monitored stop conditions and rollback | A separate governance decision based on new evidence. |

No universal acceptable false-negative threshold follows from these papers. Independent reference standards, representative data and human–AI workflow evaluation are prerequisites for stronger claims. [IMDRF development principles](https://www.imdrf.org/sites/default/files/2025-02/IMDRF_AIML%20WG_GMLP_N88%20Final.pdf), [DECIDE-AI](https://www.nature.com/articles/s41591-022-01772-9).

Financial authorization and accounting belong in the machine-readable research budget and results, not the presentation. The new allocation is capped at the additional USD 50 authorized for this session, with USD 1 held within that cap for an optional embedding comparison. Existing GUI allocations and historical ledgers are preserved.
