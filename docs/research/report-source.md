# Research source: what should happen before adjudication?

Status: canonical research synthesis for the September 6, 2026 engineering
increment. This file separates published facts from engineering inference. It is
not a biography, endorsement, clinical validation, or statement of Counsel's
confidential plans.

## Research question

What measured, reproducible work can a solo physician-engineer complete now,
without waiting for the planned independent case review, and what would that
work demonstrate to leaders responsible for a clinically consequential AI
system?

## Answer

The strongest immediate work is not another disposition score. It is evidence
about the machinery that makes later clinical evaluation trustworthy:

1. test retrieval as an information-retrieval system, including abstention,
   provenance, freshness, scope, and hostile documents;
2. validate deterministic graders on deliberately planted failures before using
   them to grade an agent;
3. run repeated and metamorphic trials to measure sensitivity to the harness,
   normalization, ordering, faults, and model stochasticity; and
4. preserve the distinction between a saturated development set and an untouched
   estimate of clinical performance.

That conclusion is an inference from the primary evidence below. It is not a
claim that Counsel or the cited research groups reviewed this repository.

## Published evidence

### Counsel's published operating model

Counsel's public Mastra case study describes a Next.js/TypeScript product with a
history-taking agent, parallel supervisor agents including an emergency
supervisor, special-purpose routing, a guideline RAG tool, medical-record
search, and private-cloud Kubernetes deployment. It also says the earlier
architecture made parallel experiments and metrics difficult, and that Mastra
Studio improved that loop. The relevant lesson is not “add Kubernetes”; it is
that the workflow, experiment, and trace abstractions must support rapid,
inspectable comparison before infrastructure scale is justified.
([Mastra customer case](https://mastra.ai/customers/counsel-health))

Counsel describes its quality judges as small, physician-defined, evidence-based
questions rather than one holistic opinion. Its published example decomposes
diagnosis and treatment behavior into seven judges and reports evaluation over
more than 6,000 physician-led threads. Counsel also describes a progression from
retrospective evaluation to prospective warnings inside the clinician cockpit.
The directly applicable pattern is: decompose, calibrate, monitor, and keep the
clinician at the point of action.
([LLM-as-a-judge report](https://www.counselhealth.com/ai-report/llm-as-a-judge),
[quality-assurance architecture](https://www.counselhealth.com/blog/scaling-clinical-quality-assurance-with-ai-judges))

Counsel's emergency-escalation analysis narrowed HealthBench Consensus to 103
unconditional emergencies and emphasized recall, precision, and F1 rather than
accuracy alone. Counsel explicitly names conversational cases, conditional
emergencies, and human-clinician comparison as further work. That supports
separate deterministic emergency tests now while reserving real clinical claims
for a more representative study.
([Counsel emergency-escalation evaluation](https://www.counselhealth.com/blog/how-counsel-leveraged-healthbench-to-assess-emergency-escalation))

Counsel's product retrospective reports a double-digit improvement in
time-to-resolution from interface work while holding model quality constant and
names click-through, edit distance, and end-to-end clinical simulation as useful
signals. Its infrastructure writing emphasizes idempotent transactional APIs,
retries, alerts, and reconciliation. Its RAG writing frames retrieval as an agent
over history, prior treatment, labs, evidence, and policy, surrounded by
independent safeguards. Together these sources argue for evaluating the whole
care pathway, human interaction, and operational recovery—not only model text.
([product retrospective](https://www.counselhealth.com/blog/one-year-of-building-counsel),
[chat infrastructure](https://www.counselhealth.com/blog/scaling-our-chat-infrastructure),
[RAG architecture](https://www.counselhealth.com/blog/rag-ai-framework-enhancing-patient-care))

### Portable evidence and auditable clinical systems

An OHDSI network-study protocol specified standardized SQL and R
across multiple database dialects and data sources, stratifying results by time
and source. The portable-study pattern maps directly to a frozen corpus, a
versioned harness, deterministic seeds, and machine-readable output here.
([OHDSI treatment-pathways protocol](https://www.ohdsi.org/web/wiki/doku.php?id=research%3Atreatment_pathways_in_cancer_12mo))

A systematic assessment examined clinical-trial reporting across
4,347 trials at 51 academic medical centers. The relevant inference is that
denominators, exclusions, provenance, and limitations belong in the deliverable,
not only in private analysis.
([BMJ trial-reporting study](https://www.bmj.com/content/352/bmj.i637))

An official Ambience release describes point-of-care clinical documentation
and compliance. The product description
emphasizes an explainable audit trail that links a suggestion to supporting
documentation. This supports source-level evidence and traceability as explicit
grader targets.
([Ambience inpatient CDI release](https://www.ambiencehealthcare.com/blog/ambience-healthcare-becomes-first-ambient-ai-platform-to-launch-inpatient-cdi-at-the-point-of-care-built-on-openai))

### Pathway evaluation, equity, and physician oversight

A published study evaluated a digitally enabled acute-kidney-injury care
pathway in emergency admissions. The unit of evaluation was the pathway,
not an isolated alert model. A separate multicenter randomized trial evaluated
digitally measured medication adherence and lung function in asthma. These
works support outcome-oriented study design and a willingness to use stronger
experimental designs when the question warrants them.
([AKI care-pathway evaluation](https://pubmed.ncbi.nlm.nih.gov/31396561/),
[INCA Sun randomized trial](https://pubmed.ncbi.nlm.nih.gov/36963417/))

The HEAL framework begins from the fact that aggregate
performance can conceal inequity and asks evaluators to identify affected
groups and examine disaggregated performance. That makes subgroup definition
and challenge-set coverage part of evaluation design, even before a clinical
claim is possible.
([HEAL framework](https://pubmed.ncbi.nlm.nih.gov/38685924/))

The guardrailed-AMIE work separates history-taking from diagnosis and management:
the AI gathers information under guardrails, then a physician reviews the note,
diagnostic work, and draft communication in a co-designed cockpit. Its authors
warn against reading a virtual OSCE result as general clinician superiority.
That architecture closely supports this repository's bounded clinician handoff,
promotion-only safety signal, and refusal to automate a patient-facing response.
([Google Research overview](https://research.google/blog/enabling-physician-centered-oversight-for-amie/))

Recent multimodal AMIE research evaluated full conversations across 105
scenarios with patient actors and clinical artifacts. The relevant forward path
is episode-level, multi-turn, multimodal evaluation—not treating each inbox
message as permanently context-free.
([Nature Medicine record](https://pubmed.ncbi.nlm.nih.gov/42135531/))

## Comparable clinical-AI teams

### Abridge

Abridge publishes a four-axis framework—safety, accuracy, fairness/equity, and
usability—with both intrinsic and outcome measures. It describes blinded
clinical comparison, de-identified backtesting, clinician edits and follow-up
questions as feedback, validation of LLM judges against clinician annotations,
component plus end-to-end evaluation, subgroup analysis, staged release, and
post-release monitoring. Its clinical-decision-support evaluation adds rubric,
boundary/adversarial, and safety studies with clinician review of flagged cases.
([evaluation framework](https://tech.abridge.com/blog/ai-evaluation-at-abridge),
[evaluation whitepaper](https://www.abridge.com/ai/science-ai-evaluation),
[clinical decision-support evaluation](https://tech.abridge.com/blog/how-we-evaluate-clinical-decision-support))

Abridge's current measurement role explicitly calls for construct validity,
measurement-error analysis, selection-bias analysis, and experimental or
quasi-experimental studies. That is an important check against treating an
automated score as the outcome itself.
([Research Scientist, Measurement and Evaluation](https://jobs.ashbyhq.com/abridge/03a3231f-8361-405e-87a6-192d710ca912))

### Ambience

Ambience argues that transcript-only generation is insufficient and describes
longitudinal chart grounding with audit links. Its Cleveland Clinic rollout
describes piloting across specialties, phased expansion, and required provider
review of the complete note. Its Clinical AI Researcher role asks for experiment
design, success criteria, dataset curation/audit, and clinical accuracy and
reliability evaluation. These are evidence for an offline retrieval gate and a
human review workflow, not for silently switching the V0 to vector search.
([chart awareness](https://www.ambiencehealthcare.com/blog/expanding-chart-awareness-across-the-ambience-intelligence-platform),
[Cleveland Clinic rollout](https://www.ambiencehealthcare.com/blog/cleveland-clinic-announces-the-rollout-of-ambience-healthcare-s-ai-platform),
[Clinical AI Researcher role](https://jobs.ashbyhq.com/ambiencehealthcare/3adb42ca-6695-48ce-96a3-b288fd1ac145))

### OpenEvidence

Real-POCQi evaluates 620 real physician queries from 149 physicians across 30
specialties using blinded, specialty-matched graders and multiple quality axes.
It reports systematic differences between LLM judges and human experts,
including self-preference, and includes sensitivity analyses for answer length,
citation display, and user status. This directly argues for judge meta-evaluation
and harness-sensitivity analysis.
([Real-POCQi preprint](https://arxiv.org/abs/2606.28960))

The broader evidence is deliberately contradictory. A 2026 independent Nature
Medicine comparison using MedQA, HealthBench, and 100 real clinical queries
reported frontier general models outperforming OpenEvidence and UpToDate in that
study. A systematic review found encouraging guideline-based performance but
substantial study heterogeneity and called for standardized prospective work.
The defensible interpretation is that system ranking depends materially on
query distribution, versions, graders, endpoints, and sponsorship—not that one
paper supplies a universal leaderboard.
([independent comparison](https://www.nature.com/articles/s41591-026-04431-5.pdf),
[systematic review](https://www.nature.com/articles/s41746-026-03077-4))

### OpenAI

HealthBench uses 5,000 conversations and 48,562 physician-authored rubric
criteria, with multi-turn, multilingual, and adversarial coverage. It also
meta-evaluates the automated grader against physicians. HealthBench Professional
adds real clinician conversations, difficult-case enrichment, physician
baselines, and rubric adjudication by at least three physicians. These designs
support granular criteria and difficult-case slices while reminding us that the
take-home's visible 50 messages cannot produce a population estimate.
([HealthBench](https://openai.com/index/healthbench/),
[HealthBench Professional](https://cdn.openai.com/dd128428-0184-4e25-b155-3a7686c7d744/HealthBench-Professional.pdf))

GDPval uses blinded expert comparisons and says its automated grader was not
reliable enough to replace experts. OpenAI's evaluation-validity work found a
substantial share of benchmark tasks broken under expert audit, and its guidance
on third-party evaluations treats tools, retries, context, and budgets as part
of the measured system. These findings motivate planted-failure grader tests and
metamorphic harness trials.
([GDPval](https://openai.com/index/gdpval/),
[evaluation validity](https://openai.com/index/separating-signal-from-noise-coding-evaluations/),
[trustworthy evaluations](https://openai.com/index/trustworthy-third-party-evaluations/))

OpenAI's current Health research role states the target clearly: meaningful,
trustworthy, unsaturated evaluations tied to patient and clinician outcomes,
with robust generalizable improvement rather than benchmark gains. That is the
standard this repo should point toward without pretending it has already met it.
([Research Engineer/Scientist, Health](https://openai.com/careers/research-engineer-research-scientist-health-san-francisco/))

## Mastra-specific implication

Mastra's current evaluation material distinguishes deterministic gates from
nondeterministic scorers and recommends scoring trajectories, tool selection,
tool arguments, and final outputs. Its RAG material describes chunking,
embedding, vector search, metadata filters, reranking, and observability as one
pipeline. Therefore the appropriate Mastra increment is a registered,
deterministic handoff-contract scorer plus offline retrieval admission tests;
the vector retriever should not enter the clinical route until it passes a
frozen holdout and trace-level source checks.
([Mastra agent evaluation](https://mastra.ai/articles/ai-agent-evaluation),
[Mastra scorers](https://mastra.ai/blog/mastra-scorers),
[Mastra gates and verdicts](https://mastra.ai/blog/introducing-gates-and-verdicts),
[Mastra RAG pipeline](https://mastra.ai/rag-pipeline))

## Engineering decisions derived from the evidence

| Decision | Evidence basis | Falsifier / next gate |
|---|---|---|
| Keep disposition deterministic and put the Agent behind the emergency floor | Counsel parallel supervisors; g-AMIE physician oversight | A preregistered study showing an agentic route improves safety and capacity without subgroup harm |
| Add offline sparse-vector and governed-hybrid retrieval, not production RAG | Counsel/Ambience grounding; Mastra RAG pipeline | Frozen retrieval holdout fails relevance, abstention, freshness, or authorization gates |
| Grade crisp properties with code | Counsel decomposed judges; Mastra deterministic gates | Planted failures escape or valid cases cross-trigger |
| Reserve nuanced clinical-content scoring for calibrated physician/LLM evaluation | Real-POCQi and GDPval judge limitations | A blinded meta-evaluation establishes acceptable criterion-level error |
| Evaluate transformations and harness choices | OpenAI harness-validity work; Real-POCQi sensitivity analyses | Semantics-preserving transformations change the contract or model ranking flips under reasonable harnesses |
| Measure the care pathway and clinician interface | Clinical pathway studies; Counsel/Abridge/Ambience product evidence | User study shows no benefit or excess alert/edit burden |

## Claim-to-source ledger

| Claim used | Primary or official source | Limitation |
|---|---|---|
| Counsel uses parallel supervisors, RAG, medical-record search, Studio, and Kubernetes | Mastra customer case | Vendor/customer case study; no independent performance audit |
| Counsel decomposes quality into physician-defined judges | Counsel AI report | Company-reported methods and results |
| Counsel plans conversational and human comparison for emergency escalation | Counsel HealthBench article | Company-authored benchmark analysis |
| The OHDSI protocol specifies portable standardized studies across databases | OHDSI protocol | Historical observational-research context, not an agent evaluation |
| Published studies use pathway, randomized, equity, and physician-oversight evaluation methods | PubMed records and Google Research | Different clinical settings and study designs; not direct validation of this router |
| Abridge validates automated evaluation against clinical judgment | Abridge publications and role | Company-authored; operational detail is selective |
| Ambience emphasizes chart grounding, audits, and staged clinician review | Ambience publications and role | Company-authored; performance claims not reused here |
| LLM judges can diverge systematically from clinicians | Real-POCQi | Preprint; OpenEvidence-related data and potential conflicts must be considered |
| Comparative rankings vary by study design | Independent Nature Medicine study plus systematic review | Systems and versions change; not a direct replication |
| OpenAI health evaluations use granular physician rubrics and grader meta-evaluation | HealthBench papers | Large benchmark still differs from this routing task and deployment setting |
| Mastra supports deterministic gates, custom scorers, trajectories, and RAG stages | Official Mastra documentation | Framework capability does not establish clinical validity |

## Unresolved questions

- What retrieval corpus and freshness policy would Counsel authorize for this
  exact workflow?
- Which local services, completion SLAs, and destination policies implement
  `SAME_DAY_IN_PERSON` and `EMERGENCY_NOW`? The taxonomy split is resolved;
  local operational binding remains open.
- Which patient subgroups, languages, and access contexts are in initial scope?
- Which clinician-handoff criteria have acceptable automated-grader error, and
  which require human review?
- What prospective endpoint best represents improved health: completed
  escalation, time-to-treatment, avoided delay, clinician time, access, or a
  composite?
- Which current model snapshots and provider contracts satisfy privacy,
  retention, regional, latency, and cost constraints?

Those questions should shape the next study; they do not prevent the deterministic
work in this increment.

## September 7, 2026 addendum: separate same-day from emergency-now

The assignment's `URGENT_ESCALATION` bucket combines “same-day in-person
evaluation” with “emergency care” while explicitly inviting a different bucket
design. The runtime now emits `SAME_DAY_IN_PERSON` and `EMERGENCY_NOW`
separately and projects both back to the supplied label only for legacy scoring.

This is an operational-latency distinction, not a claim that the current rules
diagnose emergencies. Counsel's published emergency analysis defines emergency
as immediately seeking emergency-level care and permits non-emergency cases to
need care in another time frame or setting. NHS England similarly describes
Urgent Treatment Centres as same-day services for needs that are not
life-threatening emergencies, and its SDEC specification preserves a separate
immediate pathway for life-threatening illness. AHRQ's Emergency Severity Index
also separates immediate life-saving intervention from high-risk cannot-wait
care and lower acuity. ACEP's EMTALA summary ties an emergency medical condition
to the consequences of failing to provide immediate medical attention.

The evidence supports retaining both latencies in the output and metrics. It
does not validate a case-level reference, local destination, or deployment. The
primary evaluation must therefore use a 4×4 matrix and report
emergency-to-same-day delay separately; a three-level projection can conceal
that failure completely. See [`../ROUTING_TAXONOMY.md`](../ROUTING_TAXONOMY.md)
for the executable contract and migration policy.

| Source | Use in this decision | Boundary |
|---|---|---|
| [Counsel Health: emergency escalation](https://www.counselhealth.com/blog/how-counsel-leveraged-healthbench-to-assess-emergency-escalation) | Immediate emergency versus care in another setting/time frame | Company-authored evaluation; not validation of this V1 |
| [NHS England: Urgent Treatment Centres](https://www.england.nhs.uk/urgent-emergency-care/urgent-treatment-centres/) | Same-day urgent help that is not a life-threatening emergency | UK service model; local US destinations may differ |
| [NHS England: SDEC service specification](https://www.england.nhs.uk/long-read/same-day-emergency-care/) | Same-day assessment/treatment plus a separate immediate emergency path | Service specification, not an inbox classifier |
| [AHRQ: ESI algorithm](https://www.ahrq.gov/sites/default/files/publications2/files/esitriagealgorithm-v4_0.pdf) | Independent acuity levels for immediate intervention and cannot-wait risk | ED triage scale; not directly applied to async messages |
| [ACEP: EMTALA fact sheet](https://www.acep.org/life-as-a-physician/ethics--legal/emtala/emtala-fact-sheet) | Immediate-attention consequences in the emergency-condition concept | Legal/ED concept; not a product label |
| [CDC: stroke signs and symptoms](https://www.cdc.gov/stroke/signs-symptoms/index.html) | Current focal stroke symptoms require immediate emergency activation | Public guidance; case-specific routing still requires protocol validation |

## September 7, 2026 addendum: clinical safety and efficacy benchmark portfolio

### Research question

How should this preclinical four-level disposition workflow use HealthBench,
HealthBench Hard, NOHARM, MedAgentBench, and adjacent instruments without
mistaking benchmark performance for safety or efficacy?

### Direct answer

Use public benchmarks as construct-specific stress tests inside a local evidence
ladder. None is a release gate. HealthBench is for response quality;
HealthBench Consensus supports a narrow adapted emergency/context probe;
HealthBench Hard is an unsaturated difficulty set; NOHARM v2 is the best current
public instrument for harmful omissions and commissions in comprehensive
management plans; and MedAgentBench is appropriate only after FHIR-style tools
exist. Local clinical performance still requires an untouched representative
intended-use sample, human-factors testing, prospective shadow mode, and—before
an efficacy claim—a controlled clinical evaluation.

This conclusion is implemented in
`configs/clinical-evaluation-portfolio-v1.json`, validated by
`src/evaluation/clinical-readiness.mjs`, and rendered in
`outputs/clinical-evaluation-readiness-v1.json`.

### Primary-source findings

#### HealthBench family

- HealthBench has 5,000 single- and multi-turn conversations, 48,562 custom
  rubric criteria, and work from 262 physicians with experience in 60
  countries. Its themes include emergency referrals and context seeking, and it
  examines worst-of-n reliability.
- HealthBench Consensus includes 3,671 examples and 34 multiply reviewed
  criteria. The paper explicitly describes it as higher precision and lower
  recall for detecting failures.
- HealthBench Hard is 1,000 examples selected for then-frontier-model
  difficulty. It is not selected by intended-use prevalence or harm severity.
- Most example-specific criteria were written by one physician and were not
  independently validated. Individual rubrics are not comprehensive, and
  physician-physician and model-physician grading agreement varies by theme.
- The authors request that examples not be posted in plain text or images to
  reduce leakage.

Sources: [OpenAI overview](https://openai.com/index/healthbench/),
[HealthBench paper](https://cdn.openai.com/pdf/bd7a39d5-9e9f-47b3-903c-8b847ca650c7/healthbench_paper.pdf),
[simple-evals](https://github.com/openai/simple-evals).

#### NOHARM v2

- The current manuscript evaluates 100 real primary-care-to-specialist consult
  cases and 1,000 physician-selected perturbations across ten specialties.
- A panel of 29 board-certified physicians, including 23 specialists and
  subspecialists, produced 12,747 ratings over 4,249 possible management
  actions. The scale combines RAND/UCLA appropriateness with WHO harm severity.
- It explicitly measures both harmful omission and harmful commission. Severe
  errors were dominated by omissions, and all model groups degraded on
  clinically equivalent perturbations.
- Multi-agent configurations did not always improve results. A strong final
  reviewer and heterogeneous team composition mattered.
- The official public kit contains 30 base cases and ten perturbations per case,
  reports severity-weighted precision/recall/F1, `Severe_rate`, `F1_floor`, and
  `Resilience`, and uses two Gemini preview judges. It warns that exact numeric
  reproduction may drift and that cache names must change with the evaluated
  model or responses.
- The paper explicitly warns that its absolute scores and harm rates are
  rubric-based indicators for the selected cases, not real-world clinical event
  rates. The public/private split is a contamination control.

Sources: [NOHARM manuscript](https://arxiv.org/abs/2512.01241),
[MAST NOHARM kit](https://github.com/ARISENetwork/mast/tree/main/benchmarks/donoharm),
[released analysis](https://github.com/ARISENetwork/noharm).

#### MedAgentBench v1 and v2

- V1 provides 300 physician-authored tasks over 100 patient profiles and more
  than 700,000 FHIR records. Half are query tasks and half action tasks; task
  success is reported at pass@1.
- Its environment explicitly lacks production security and enterprise logging,
  comes from one academic center, and does not capture the full complexity and
  coordination of clinical work.
- V2 reports 91% success for a structured-tool GPT-4.1 agent without memory and
  98% after adding memories derived from prior failures; it reports 88.67% on
  300 newly created tasks. The study itself says memories need physician
  oversight, versioning, attribution, and auditing, and that consequential
  actions need human review plus sandboxing, logging, drift monitoring, and
  incident reporting.
- The necessary inference is that memory needs patient- and task-family-
  independent evaluation, contamination controls, negative-transfer analysis,
  and revocation—not that the 98% score authorizes memory in a clinical route.

Sources: [MedAgentBench v1](https://arxiv.org/abs/2501.14654),
[v1 repository](https://github.com/stanfordmlgroup/MedAgentBench),
[MedAgentBench v2](https://psb.stanford.edu/psb-online/proceedings/psb26/chen_eric.pdf),
[v2 repository](https://github.com/ARISENetwork/medagentbenchv2).

#### Adjacent benchmarks

- HealthAgentBench has 54 terminal-agent tasks across seven heterogeneous
  categories. It records task success, cost, and time, requires at least 30 GB
  of assets for a full run, uses gated data for several categories, and
  recommends web-disabled evaluation. It is relevant to future broad clinical
  workflow agents, not the current inbox route.
- MedSafe-Dx v0 surfaces missed escalation, unsafe reassurance, and
  overconfident wrong answers rather than averaging them away. It remains a
  preprint over synthetic DDXPlus cases under a CC BY-NC-ND license, so it is a
  watchlist failure-discovery tool rather than a commercial release gate.

Sources: [HealthAgentBench](https://github.com/microsoft/HealthAgentBench),
[HealthAgentBench site](https://microsoft.github.io/HealthAgentBench/),
[MedSafe-Dx](https://github.com/cortico-health/MedSafe-Dx).

### Clinical-evaluation and governance sources

- IMDRF N41 separates valid clinical association, analytical/technical
  validation, and clinical validation and asks whether use of the output
  achieves the intended purpose in the target population. It calls for
  continuous, risk-proportionate evaluation.
- IMDRF/FDA GMLP applies total-product-lifecycle discipline to safe, effective,
  high-quality AI-enabled medical devices. This repository uses it as an
  engineering lens, not as a claim that V0 is a regulated or compliant device.
- DECIDE-AI focuses early live evaluation on actual clinical performance,
  safety, and human factors; it is a reporting guideline, not a certificate of
  study quality.
- SPIRIT-AI and CONSORT-AI require clear reporting of the intervention, inputs,
  outputs, required user skills, integration setting, human-AI interaction, and
  error analysis in prospective trials.
- NIST AI RMF separates governance, mapping, measurement, and management and
  treats validity, safety, security, privacy, transparency, and harmful bias as
  contextual socio-technical properties.

Sources: [IMDRF N41](https://www.imdrf.org/documents/software-medical-device-samd-clinical-evaluation),
[FDA GMLP page](https://www.fda.gov/medical-devices/software-medical-device-samd/good-machine-learning-practice-medical-device-development-guiding-principles),
[DECIDE-AI](https://www.nature.com/articles/s41591-022-01772-9),
[CONSORT-AI](https://www.nature.com/articles/s41591-020-1034-x),
[NIST AI RMF](https://doi.org/10.6028/NIST.AI.100-1).

### Claim-to-source ledger for this increment

| Repository decision | Source basis | Scope limitation encoded |
|---|---|---|
| Do not use HealthBench Hard as a safety gate | HealthBench selection method | Difficulty is not harm severity or intended-use prevalence |
| Use HealthBench Consensus only as a declared adapted probe for this route | HealthBench Consensus design; Counsel public emergency evaluation | Derived route results are not official HealthBench scores or comprehensive safety |
| Keep omission and commission separate, with severe errors outside averages | NOHARM methods and open kit | Selected-case rubric indicators are not real-world event rates |
| Treat multi-agent review as an ablation | NOHARM multi-agent results | Improvement depends on topology, composition, and final reviewer |
| Defer MedAgentBench until FHIR tools exist | MedAgentBench task and environment contract | EHR task success is not inbox-routing safety or production authorization |
| Treat memory as governed clinical state, not a prompt trick | MedAgentBench v2 discussion | Prevent test leakage, negative transfer, unaudited learning, and irrevocable corrections |
| Require intended-use clinical and human-factors evidence after software verification | IMDRF, DECIDE-AI, CONSORT-AI | Public benchmark scores cannot establish local efficacy |
| Preserve the rejected retrieval holdout | Current registered evidence | A failed candidate needs a new candidate and new holdout, not post-hoc tuning |

### Discovery support and source-selection note

SciSpace semantic search was used to broaden discovery for clinical harm,
escalation, calibration, and agent-evaluation frameworks. Claims in the final
portfolio were checked against the primary papers, official repositories, or
regulator/standards sources linked above. Search ranking was not treated as
evidence.
