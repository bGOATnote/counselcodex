# Take-home decision record and accounting

> Historical architecture record. The current agent, evaluation and deliverable
> status are in [Current take-home accounting](CURRENT_TAKE_HOME_ACCOUNTING.md).
> The rules-first graph, model-bypass description, GUI paths and completion
> claims below describe earlier versions and must not represent today's system.

## Executive decision

The V0 remains a **disposition decision-support workflow**, not an AI doctor. It
accepts a synthetic asynchronous episode, runs an independent emergency
supervisor in parallel with an intent/history branch, applies a deterministic
hard escalation gate, and routes the message through a four-level operational
taxonomy that preserves the three requested legacy buckets. It produces no
confirmed diagnosis, prescription, order, chart write, or emergency dispatch.
Its directive is displayed for review, not sent to a patient.

A separately bounded V1 slice now uses a real Mastra `Agent` after deterministic
routing to assemble a licensed-clinician handoff: structured differential,
must-not-miss hypotheses, unknowns, and at most three decision-changing
questions. It can request a one-way promotion to immediate clinician review but
cannot downgrade urgency or take a clinical action. This makes agent engineering
executable without expanding the artifact's clinical claim.

That scope limits the prototype to routing and clinician review. It demonstrates
a workflow for presenting a message to a clinician while keeping the 50-row
synthetic exercise separate from any claim of clinical effectiveness.

## Requirement accounting

| Brief requirement | Delivered evidence | Status |
|---|---|---|
| Understand the current state | All 50 supplied rows preserved; an unattested proposal identifies 12 hypotheses; the blinded GUI captures the candidate's own current-state audit | Instrument complete; physician review pending |
| Frame goal and V0 scope | Intended output, owners, safety invariants, exclusions, and tradeoffs documented here and in the README | Complete |
| Build the prototype | Executable typed Mastra disposition graph, real clinical-intake Agent/tool loop, bounded handoff, dependency-light mirror, and Python compatibility CLI | Complete for the synthetic vertical slice |
| Decide what the right answer is | Independent route and short reason; timing for async review; optional uncertainty and notes; lock before comparison and attest only to completed work | Instrument complete; use actual saved-review denominator, not an assumed 50/50; no consensus claim |
| Evaluate the system | Live physician-reference score, unattested proposal replay, asymmetric harm analysis, naïve baselines, ablations, red team, and executed Counsel-method HealthBench emergency stress test | Deterministic external stress test failed with 28/29 emergencies missed; full Mastra agent and intended-use clinical performance remain unmeasured |
| Slide deck and live demo | Presentation artifact, visually verified render, browser-executed Studio workflow, and a timed demo runbook | Complete for synthetic demonstration |
| Optional repository | Private GitHub repository with CI, dependency lock, tests, red team, docs, and outputs | Complete |
| Agent safety behavior | Every patient turn rescanned; deterministic emergencies bypass the model; exact tool-source grounding; one-way safety promotion; agent/tool/schema failure closes to same-day physician review | Executed with deterministic model fixtures; live clinical behavior remains unvalidated |
| Scalable CQA | Nine deterministic Mastra scorers plus a separate five-Agent retrospective research workflow, decision-time source checks, explicit abstention, bounded concurrency and resumable pilot | Scripted orchestration and fault injection execute; clinical monitoring/lift remain unvalidated. See the 8 September system review |
| Benchmark and efficacy judgment | Versioned portfolio separates HealthBench/Hard, NOHARM, MedAgentBench v1/v2, HealthAgentBench, and MedSafe-Dx from local clinical evidence; executable tests forbid benchmark-to-readiness claim promotion | Counsel-method HealthBench route stress test executed with failed candidate and controls; clinical studies remain unexecuted and unclaimed |
| Synthetic data only | No real patient data or patient-system integration; a dated synthetic two-provider pilot is recorded separately | No live model calls added by the V0 GUI; see provider pilot for prior execution |

The brief says 20 messages, while the delivered CSV contains 50. The system uses
all 50. See [`data/CLINICIAN_REVIEW.md`](../data/CLINICIAN_REVIEW.md) for the
input hash and reconciliation.

## Engineering priorities informed by public sources

This is an engineering inference from Counsel's public work, not a claim about
what any named individual privately specified.

Counsel describes its mission as multiplying clinical capacity and, in its
[Mastra case study](https://mastra.ai/customers/counsel-health), describes a
TypeScript system in which core history-taking agents run alongside parallel
supervisor agents for risks such as emergencies. It also describes a physician
cockpit that surfaces relevant history, results, interactions, and
evidence-based guidance. The published research on
[g-AMIE](https://research.google/blog/enabling-physician-centered-oversight-for-amie/)
used an intentionally constrained history-taking system that produced a summary,
differential, plan, and draft response for physician review rather than sending
individualized advice directly.

These sources motivate the following proposed design principles:

1. Optimize the **human-plus-AI care pathway**, not standalone classification.
2. Run independent, non-bypassable safety supervision beside helpful AI work.
3. Preserve longitudinal context and local care-network constraints.
4. Give clinicians concise evidence, uncertainty, and an auditable override path.
5. Measure downstream access, resolution, delay, and safety rather than model
   fluency or aggregate accuracy alone.

Counsel's published [responsible-AI governance](https://www.counselhealth.com/blog/responsible-ai-governance)
emphasizes hard stops, mandatory physician escalation, audit logs, clear roles,
and lifecycle monitoring. Its [clinical quality assurance approach](https://www.counselhealth.com/blog/scaling-clinical-quality-assurance-with-ai-judges)
uses physician-defined rubrics and decomposed specialist judges across complete
threads. Company-reported performance figures on those pages describe operational
evaluation and are not treated here as independent clinical validation.

The prototype uses typed schemas, case-level evidence and a frozen input hash
to support reproducible evaluation. The development labels are a comparison
reference; their presence does not establish clinical correctness.

## What the broader engineering bar adds

Karan Singhal's coauthored [Med-PaLM evaluation work](https://research.google/pubs/large-language-models-encode-clinical-knowledge/)
argues that automated benchmarks alone are insufficient for clinical quality;
human evaluation must examine factuality, comprehension, reasoning, possible
harm, and bias. The related [health-equity evaluation toolbox](https://research.google/pubs/a-toolbox-for-surfacing-health-equity-harms-and-biases-in-large-language-models/)
uses participatory methods, adversarial datasets, and diverse raters while
warning that no single benchmark supports a holistic equity claim.

Boris Cherny's published [Claude Code engineering guidance](https://www.anthropic.com/engineering/claude-code-best-practices)
favours explicit targets, tests, screenshots, and iterative verification.
Anthropic's [property-based testing work](https://www.anthropic.com/research/property-based-testing)
adds a useful safety pattern: state the invariant, generate counterexamples,
shrink failures, and still require expert review. This V0 therefore tests gate
dominance, branch failure, malformed text, negation, privacy canaries, runtime
parity, and the actual Studio graph, not only hand-picked happy paths.

## Technology choices and their evaluation requirements

Counsel's current [full-stack role](https://jobs.ashbyhq.com/counsel/12cf0cf3-73db-49d4-84a0-dd8b280e6337/)
names Next.js, Tailwind, Postgres/Supabase, and AWS. Its current
[backend role](https://jobs.ashbyhq.com/counsel/cc81ba06-2dd8-408f-8aba-833f332e11cd)
centres an agentic retrieval harness across structured and unstructured health
data with strict permissions and audit guarantees. The Mastra case study adds a
private-cloud Kubernetes deployment.

The V0 does not add those technologies merely to resemble Counsel's stack. It
uses Next.js and Tailwind only for a read-only clinical evaluation workbench,
where the assignment benefits from a scannable case audit. The runtime exposes a
versioned retrieval contract that forbids retrieved context from changing
disposition or downgrading urgency. Vector search and Kubernetes remain gated on
evidence, corpus scale, privacy, tenancy, reliability, and load requirements.
The decisions and their admission tests are recorded in
[`docs/ARCHITECTURE_EVOLUTION.md`](ARCHITECTURE_EVOLUTION.md).

Mastra's provider-neutral model router also makes a fair GPT-versus-Claude
experiment possible without changing the surrounding workflow. The proposed
blinded, repeated, clinician-rated experiment is preregistered in
[`docs/MODEL_BAKEOFF.md`](MODEL_BAKEOFF.md) and
[`configs/model-bakeoff.json`](../configs/model-bakeoff.json). It compares only
clinician-facing synthesis after disposition is locked; it cannot turn either
model into the safety authority.

## Product contract

| Output | Operational meaning | Owner | V0 action |
|---|---|---|---|
| `SELF_CARE` | Only a named, low-risk pattern matches and no escalation signal is present | Approved content owner | Route to a reviewed self-care content path; current V0 does not send advice |
| `ASYNC_PHYSICIAN` | Clinician judgment, prescribing, testing, referral, or uncertain risk is needed | Licensed clinician | Put in the physician review queue |
| `SAME_DAY_IN_PERSON` | In-person evaluation before day’s end; do not wait for routine async review | Same-day clinical operations | Lock this latency and present the locally configured same-day pathway; no autonomous dispatch |
| `EMERGENCY_NOW` | Activate the locally appropriate emergency, crisis, obstetric, or emergency-department pathway now | Emergency clinical operations | Lock the route and present the emergency directive; no autonomous dispatch |

The supplied `URGENT_ESCALATION` label remains an assignment-compatible legacy
projection of the last two routes; it is not emitted by V1. Unknown messages
route to a clinician. Safety-system failure routes to emergency review. A
downstream component cannot downgrade a locked same-day or emergency result.
The rules are deliberately deterministic because the output is a narrow policy
decision and a probabilistic model is not needed to own the safety floor.

## Evaluation interpretation

The clinical-performance estimate is **not available**. The unattested proposal
and prototype share the same 50 development cases, so a 50/50 replay is expected
and uninformative about generalization. The supplied workflow agrees with that
proposal on 38/50 cases. Those 12 disagreements are review hypotheses until the
candidate's blinded case records confirm, reject, or reclassify them.

The take-home should therefore show an evaluation card rather than a leaderboard:

| Evidence layer | Result | Interpretation |
|---|---|---|
| Software behavior | 50/50 development replay | The rules reproduce their authored examples |
| Physician development review | Live 0–50 denominator | Complete only with signed, integrity-hashed export |
| Existing-label vs proposal | 38/50 agreement | Twelve hypotheses require blinded clinical review |
| V0 software behavior | 50/50 development replay | The rules reproduce their authored examples |
| Retrieval temporal holdout | Not admitted | The offline hybrid failed predefined relevance and abstention gates and remains outside the route |
| Clinical performance | Not estimated | No frozen external holdout |

The baseline analysis still supplies a Goodhart warning: an always-emergency
router buys escalation recall by consuming emergency capacity, while an
always-same-day router looks perfect after legacy projection but delays every
emergency. An asymmetric scalar cost can reward either clinically unusable
policy. A later study must jointly constrain emergency and same-day sensitivity
and PPV, emergency-to-same-day delay, destination accuracy, workload, and
completed time-to-escalation.

## Required tests and validations

### Software release gate for this V0

- Type and schema validation for all inputs, intermediate steps, and outputs.
- Unit tests for normalization, negation, boundaries, rules, and cost metrics.
- Property/invariant tests that same-day/emergency status, lock, hard-gate origin, and
  `overrideBlocked` cannot disagree.
- Fault injection for both parallel branches and postcondition corruption.
- Parity tests between the dependency-light mirror and actual Mastra runtime.
- Real Mastra `runEvals` gates for exact disposition and hard-gate integrity.
- Adversarial tests for Unicode, prompt injection, mixed intent, false friends,
  unsupported languages, long input, and trace leakage.
- Studio graph execution and visual inspection with synthetic cases.
- Typecheck, lint, clean install, build, dependency audit, and CI on every change.

### Gates before any clinical investigation

- Locked intended use and destination definitions, including adult-only versus
  pediatric scope and local care-network capabilities.
- Formal hazard analysis and requirements-to-test traceability.
- A frozen reference protocol and multi-clinician overlap on a statistically
  justified subset of untouched patient- and episode-level holdout data, with
  confidence intervals and error-severity review.
- Subgroup and intersectional analyses, multilingual and accessibility testing,
  out-of-distribution behaviour, and missing-context stress tests.
- Human-factors simulation under inbox load, handoff, interruption, alert
  fatigue, and downtime, measuring completed escalation rather than a displayed
  label.
- Prospective shadow mode with a clinician reviewing every result, predefined
  stop rules, incident response, rollback, and delayed-outcome review.
- Privacy, security, authorization, retention, tenant-isolation, and operational
  readiness review before any PHI or system connection.

## Mastra-specific acceptance tests

The current workflow is the right Mastra primitive for this V0: known steps,
typed contracts, parallel branches, deterministic control flow, and binary CI
gates. Official Mastra guidance distinguishes deterministic gates from scored
quality evals and recommends trace-level observability and versioned evaluation
data ([gates and verdicts](https://mastra.ai/blog/introducing-gates-and-verdicts),
[agent evaluation](https://mastra.ai/articles/ai-agent-evaluation)).

Computer-use testing is appropriate for the local Studio surface because it
verifies the registered graph and rendered execution path that unit tests cannot
see. The required synthetic runs are C08 thunderclap, C06 stable refill, C01
named low-risk URI, a mixed refill-plus-emergency case, and injected branch
failure. Inspect graph order, locked urgent output, schema errors, traces,
redaction, and restart persistence.

The executed browser check found and then regression-locked a plain-language
dyspnea miss in an ACS presentation. The graph, corrected urgent route, and
redacted trace are recorded in
[`docs/STUDIO_VERIFICATION.md`](STUDIO_VERIFICATION.md). This is direct evidence
that Studio/browser testing adds signal beyond the programmatic suite; the full
scenario matrix remains a preclinical evaluation requirement.

If a multi-turn history-taking agent is added, the best next Mastra tests are:

- entire-trajectory evals, not last-answer-only grading;
- tool-call name, arguments, order, loop count, and timeout gates;
- no question or suspension after an urgent signal;
- durable suspend/resume across process restart with stale, duplicate, and
  unauthorized resume attempts;
- `requireApproval` bound to the exact action and arguments for any side effect;
- fine-grained authorization on every protected route and resume;
- provider/model fault, context truncation, tool error, and failover behaviour;
- physician feedback attached to trace/span IDs and promoted into versioned
  datasets only through a governed review process.

## Observability and monitoring contract

The V0 uses local LibSQL/DuckDB observability, stable service identity, a Studio
storage exporter, sensitive-field redaction, serialization limits, and hidden
programmatic trace inputs/outputs. Durable raw workflow snapshots are disabled
because the input could contain health information.

A clinical successor needs minimum-necessary structured events rather than raw
message copies: workflow/rule/version IDs, branch outcomes, latency, failure
class, disposition, override and completion status, and reviewer feedback. It
must monitor urgent rate, urgent-review completion time, false-negative near
misses, over-triage burden, subgroup drift, safety-branch errors, latency,
availability, and override reasons. PHI access, retention, deletion, export,
tenant separation, and incident ownership must be independently approved.

## From routing to better access

The credible path toward broader access is staged:

1. Make the inbox safer and faster for clinicians.
2. Add constrained history collection that reduces clinician work without
   delaying urgent care.
3. Retrieve longitudinal record context, local guidelines, and in-network
   options with provenance.
4. Let physicians edit and approve summaries, plans, and patient communication.
5. Measure whether the human-plus-AI system increases safe clinical capacity for
   populations with poor access, including language, disability, digital access,
   and continuity-of-care constraints.

An "AI doctor" claim should follow evidence of safer, more equitable access; it
should not precede it. The near-term unit of value is a completed, accountable
care handoff.
