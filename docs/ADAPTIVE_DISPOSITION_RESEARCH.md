# From a curated demo to a testable disposition system

Research and implementation audit · 11 September 2026

Subsequent [red-team repairs and verification boundaries](research/ADAPTIVE_RED_TEAM_2026-09-11.md)
document the streaming adapter, separated follow-up context, care-floor preservation,
and v2 whole-workflow comparison corrections. Historical measurements below remain
unchanged; they are not evidence of the revised candidate's clinical or latency lift.

## Decision

The correction is not to collect more URLs. It is to let a new message determine
what information and evidence are needed, use those inputs in one care decision,
and measure whether each added component improves that decision. This version
implements that candidate workflow. **It does not establish clinical lift, an
AMIE-equivalent system, clinical safety, or an autonomous-care authorization.**

The 55-source inventory and earlier runtime notes remain historical artifacts.
They are not the adaptive responder's retrieval universe. New retrieval searches
public health-topic summaries and indexed literature, and can search imported,
rights-cleared guideline passages. That removes the topic-catalog constraint; it
does not create a comprehensive, clinically adjudicated evidence service.

The important result of the first public-API test was a failure: technically
successful searches returned material that would be unsuitable for some patients.
For urinary retention, candidates included a catatonia case report and a pediatric
review. Ectopic-pregnancy candidates included treatment research and AI research.
These are examples of why successful retrieval, an authentic quote, and clinical
applicability must remain different measurements.

## 1. Assignment and scope

I reread the four-page original take-home PDF. It asks for a defensible account
of the current process, a scoped disposition V0, and a working demonstration with
evaluation. Its suggested small implementation is not a requirement to avoid
engineering rigor. Conversely, importing a production platform's entire stack
would not demonstrate that its complexity is useful here. The PDF says 20
synthetic messages; the supplied CSV contains 50. The original data stays intact.

The assignment's `URGENT_ESCALATION` includes same-day in-person **or** emergency
care. Our operational decisions distinguish those outcomes. A projection back to
the original three labels is a compatibility view, not the primary safety
endpoint. An emergency-to-same-day mistake cannot disappear in that projection.

Scope here: fictional text messages, clinical history, care setting/timing, a
concise patient explanation, relevant alternatives, red flags/vital limitations,
and source-linked claims. Not prescribing, appointment booking, proof of patient
receipt, completed transfer, EHR manipulation, or billing. No inference endpoint
receives supplied labels or evaluation references.

## 2. What the primary research supports—and does not

### AMIE: dialogue must affect the decision

The original AMIE work combines diagnostic conversation, iterative training and
evaluation with standardized patients. Its randomized, blinded comparison used
149 scenarios and 20 primary-care physicians. It is evidence about that research
system in that setting, not permission to describe a prompted API workflow as
AMIE or to claim patient-outcome superiority. The transferable principle is
decision-relevant dialogue evaluated as a whole interaction, rather than a
static answer followed by a history question that cannot change the decision.
[Google Research, original AMIE](https://research.google/blog/amie-a-research-ai-system-for-diagnostic-medical-reasoning-and-conversations/).

The specialist-care extension describes generating an initial response, searching
for relevant medical information, critiquing against it, and revising. In its
separate assistance comparison, general cardiologists' plans sometimes improved
and sometimes worsened after seeing AMIE's response. That does not isolate a
benefit from self-critique. Specialist settings also exposed limits.
This supports testing search and critique separately. It does not support
assuming that adding a critic produces a safer answer, or adding another
patient-facing response for the reader to reconcile.
[Google Research, specialist AMIE](https://research.google/blog/advancing-amie-towards-specialist-care-and-real-world-validation/).

The 2026 audio-visual work separates a responsive conversational component from
background planning and perception. Its controlled actor-consultation evaluation
is not an emergency-disposition latency SLA. The useful engineering analogy is
to separate early interaction from slower assessment while keeping a coherent
clinical state. Audio/video perception, model training and simulated-patient
self-play would materially expand this assignment and are not implemented.
[Google Research, audio-visual AMIE](https://research.google/blog/advancing-amie-towards-expert-level-audio-visual-clinical-consultations/).

The public research does not reveal Counsel's private prompts, data, quality
thresholds or current clinical performance. It provides no basis for claiming
that this prototype exceeds AMIE's performance or reproduces a private clinical
system.

### Counsel and Mastra: multiple calls need distinct jobs

The published case study describes TypeScript/Next.js, history-taking agents,
parallel emergency supervision, retrieval over clinical material and records,
and Mastra-based iteration. It also describes private infrastructure. It does
not publish enough detail to reproduce Counsel's complete system or prove that
a particular database or graph design is required for this V0.
[Mastra's Counsel case study](https://mastra.ai/customers/counsel-health).

Our adaptation is explicit: Haiku assembles a bounded history/evidence plan;
Opus independently produces the disposition and explanation. A third Opus call
is a critique experiment, not an obligatory production committee. A separate
cross-provider judge audits the emitted answer retrospectively. The critic is
not that judge and cannot award itself clinical approval.

Mastra supports explicit workflow steps and agent/tool calls. We use real steps
with persisted run/trace identifiers, rather than naming ordinary functions
agents. Its suspend/resume facilities also require the appropriate durable
workflow storage. Our existing runtime disables workflow snapshots; therefore
this implementation finishes a turn as `awaiting_input`, persists its artifact,
and starts a fresh assessment with the original message, question and patient
update. It does **not** pretend to implement durable suspended workflows.
[Mastra workflow agents/tools](https://mastra.ai/docs/workflows/agents-and-tools),
[Mastra suspend/resume](https://mastra.ai/docs/workflows/suspend-and-resume).

### Medical retrieval: more context is not automatically better

MIRAGE/MedRAG evaluates combinations of medical question sets, corpora and
retrieval methods. Its findings motivate controlled retrieval comparisons and
attention to context selection. They do not establish benefit for asynchronous
triage, and its reported gains are not borrowed as our performance estimate.
[MIRAGE/MedRAG paper](https://arxiv.org/html/2402.13178v2).

MedRGB separately tests ordinary retrieval, sufficiency when evidence is missing
or noisy, integration across documents, and robustness to misleading material.
This is a better model for our adversarial evidence suite than checking that
every answer contains a citation. Its medical-QA setting and model-specific
results still do not transfer directly to clinical routing.
[MedRGB paper](https://arxiv.org/html/2411.09213v1).

Anthropic recommends starting with simple compositions and adding agentic
complexity when needed, acknowledging latency and cost tradeoffs. That supports
retaining a single-model control and making critique optional—not treating an
agent count as an accomplishment.
[Building effective agents](https://www.anthropic.com/engineering/building-effective-agents).

OpenAI's evaluation guidance supports task-specific cases, representative data,
logging, automated checks calibrated against human judgment, and iteration.
Trace grading helps locate failures inside a workflow rather than scoring only
its final text. We adopt those methods in a local TypeScript harness; we do not
need another orchestration framework or a model migration to do so.
[Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices),
[Trace grading](https://developers.openai.com/api/docs/guides/trace-grading).

## 3. The implemented candidate

```text
original message + patient updates
  ├─ existing immediate emergency screen → action now, if triggered
  └─ Haiku history plan
       ├─ new emergency concern → action now
       ├─ decision-changing question → display promptly
       └─ clinical concepts → bounded source search
                                  ↓
                 Opus disposition + explanation + evidence claims
                                  ↓
                  exact-output and escalation-preservation checks
                    ├─ final → one care recommendation
                    ├─ needs information → one question, no settled low-risk answer
                    └─ failed → visible failure, earlier emergency action retained
```

The historical screen is a narrow safeguard, not a medical classifier with
known sensitivity. It does not skip the model. Neither failure to trigger that
screen nor `emergency=false` is evidence of safety. Emergency timing is kept
separate from transport: ED-now is not automatically rewritten as ambulance
activation; an already-issued immediate EMS instruction cannot be downgraded.
A failed fast planner is discarded and logged; it does not cancel the independent
Opus assessment or supply assumed-negative findings.

The history plan distinguishes reported, denied, unknown and contradictory
findings. Quote checks reject invented substrings and unsupported structural
claims; they do not establish correct attribution, temporality or interpretation.
Relevant surgery/trauma, pregnancy, medications and physiological readings are
considered as decision-changing context rather than mandatory questions for
every patient. A previous assistant question is labeled as such in the next
input, not silently converted to a patient finding.

If intake identifies an unanswered decision-changing question, the finalizer
cannot issue settled self-care or async care as though it had been answered.
It can still issue already-needed same-day or emergency referral without waiting.
This is deliberately testable: excessive questioning may reduce useful
completion, so `awaiting_input` is not counted as a completed correct disposition.
Whether the question was necessary is still a clinical evaluation item.

The answer has no minimum number of diagnoses, red flags or citations. Empty
lists are allowed when appropriate; relevant clinical omissions still require
semantic grading. Upper bounds prevent runaway output, not prescribe medical
completeness. An irrelevant differential item should lower quality, not help fill
a quota. Evidence and the patient explanation remain parts of the same response.

## 4. Evidence acquisition and verification

Two connectors operate without a new paid search account:

- **MedlinePlus health-topic API:** reusable patient-oriented summaries with
  attribution. Not a full specialty-guideline library. The provider specifies
  request limits and recommends caching; this implementation spaces requests
  and caches within a process.
  [MedlinePlus Web Service](https://medlineplus.gov/about/developers/webservices/).
- **Europe PMC core search:** PubMed-indexed guideline/review abstracts, with
  publication metadata when available. Abstract access does not imply a license
  to redistribute the full article, currency, or applicability. Case reports,
  preprints and explicit retractions are excluded from this connector.
  [Europe PMC REST service](https://europepmc.org/RestfulWebService).

`COUNSEL_PASSAGE_CORPUS` can point to a JSONL corpus following the exported
`passageSchema`. Records require source/section, exact text, population notes,
limitations, rights and review metadata. Superseded or overdue local records are
excluded before ranking. No fictitious ACOG, AFP or ABEM guideline passages were
generated to populate it. A broad, rights-cleared specialty corpus remains a
necessary acquisition task for stronger evidence coverage.

Queries are clinical concepts, not copied narratives. They are restricted to
short alphabetic phrases and fixed provider endpoints. **This is not a PHI
de-identification system:** names can be alphabetic. Synthetic-only scope remains
mandatory. Arbitrary model URLs are never fetched; citation hosts are allowlisted,
redirects are rejected, bodies and timeouts are bounded, and XML external entity
declarations are refused. A host allowlist is an access policy, not a list of the
only diseases the system can understand.

Selection is deterministic despite concurrent provider completion. It ranks
candidate passages, deduplicates IDs, and fits a 12 KB evidence budget. Long
passages are exact, explicitly truncated excerpts with offsets and original
identity retained; they are not model summaries disguised as source quotations.
Truncation can remove an exception. The model and reviewer see that limitation,
and this must be tested rather than assumed harmless.

Each cited claim has a supporting quote and a model-declared applicability
explanation. The system checks quote identity and source membership. URL HEAD
checks are recorded separately. A blocked or failed check remains `unverified`;
the API returning a summary does not make its displayed URL verified.

The existing retrospective cross-vendor judge now receives these exact passages
as well as the answer and earlier visible messages. Source entailment,
applicability and clinical inference are separate fields. No live judge run was
performed in this change. No calibration or physician endorsement is invented.
Authentic text can be irrelevant, outdated, misleading, or misapplied.

## 5. Why no graph database or vector service yet?

The decision is based on this implementation's needs, not a claim that those
technologies are unsuitable for Counsel. The useful eventual graph would connect
versioned source passages, populations, recommendations, contraindications,
claims, questions, decisions and review outcomes. These relationships are an
audit/data-model requirement before they are a graph-database requirement.

| Component | Current choice | Evidence required before adding complexity |
|---|---|---|
| Orchestration | Explicit Mastra workflow | Agent-level failures and latency localized in traces |
| Patient dialogue | One pending decision-changing question | Better routing after answers, without unnecessary delay |
| Retrieval | Public connectors + optional reviewed local passages | Unseen-case source adequacy and downstream routing gains |
| Storage | Existing local LibSQL run/trace store | Multi-user durability/security needs before service migration |
| Vector retrieval | Not added | Better relevant-passage recall than lexical/provider search, with measured cost |
| Graph retrieval | Not added | Reproducible failures requiring relationship traversal rather than passage search |
| Critique | Experimental arm | Paired improvements exceeding regressions, delay and cost |
| Kubernetes | Not added | Real deployment, scaling and operations requirement—not presentation optics |

For a larger rights-cleared corpus, PostgreSQL tables for versioned documents,
passages, claims and relations are a reasonable next implementation candidate.
Hybrid lexical/vector retrieval and reciprocal-rank fusion should be tested
against the same frozen queries. They are not installed simply to match a job
post. The current lexical retriever is a transparent baseline, not a claim of
state-of-the-art medical retrieval.

The public API limiter/cache are **per process**, not a distributed service. A
1,000-case batch needs bounded concurrency, a shared provider rate limiter,
durable retrieval caching and failure accounting. This harness runs sequentially
and freezes used evidence; it does not claim 1,000 concurrent consultations.

## 6. Measuring lift rather than celebrating valid JSON

The new experiment harness accepts arbitrary JSONL cases. Each inference call
receives only `id` and `message`; optional reference data stays outside inference.
The original CSV disposition is not accepted as implicit ground truth. References
declare whether they are clinician adjudications or development expectations,
with provenance. That declaration itself must be audited before clinical claims.

Four arms use the same message and final response contract:

1. **Base Opus:** one call, no planner or retrieval.
2. **Workflow without retrieval:** history plan plus Opus.
3. **Workflow with retrieval:** history plan, source search and Opus.
4. **Workflow with critique:** the retrieval arm's frozen passages, planning and
   disposition, followed by an Opus revision.

The critique arm does not re-search a changing web. Its independently sampled
planner and draft remain a confound: this is an end-to-end arm comparison, not a
perfectly isolated causal estimate of critique. A later exact-draft replay study
should isolate that effect. Order rotates by case/trial, subject to retrieval
preceding its paired critique. Report that dependency and possible time effects.

Manifests bind inputs, references, configuration and a source fingerprint. Each
attempt is written before execution and each result is append-only. Resume checks
identity and never silently repeats an interrupted paid attempt. Concurrent
runners are excluded by a lock; stale-lock recovery requires inspecting the
stopped process rather than deleting unknown state. Changes require a new
experiment directory rather than overwriting history.

Primary outcomes are emergency sensitivity, false emergency escalation,
accepted-route coverage, and unresolved/failed fraction. Early emergency actions
count as actions even if later prose fails; completed response coverage is
reported separately. Failed and unanswered cases remain in denominators.
Same-day-vs-emergency errors stay visible. Aggregate route agreement is not an
adequacy score for the full explanation or follow-through.

Latency includes time to question, action, reply and request termination. Emission
latencies are conditional on actually emitting; report missing outputs alongside
them. Failed requests do not vanish from end-to-end timing. Tokens are recorded;
invoice cost remains unknown unless reconciled. A question is not a medical
answer, a token is not a useful reply, and browser receipt is not a paint metric.

The report returns numerator/denominator and Wilson intervals for single-trial
proportions. Repeated measurements of the same patient are dependent; pooled
Wilson intervals cannot establish repeat-trial reliability. For a substantive
study, use case-clustered intervals, paired case-level analysis and worst-of-k
emergency failures. This implementation exposes paired improved/worsened IDs;
it does not manufacture statistical significance.

### Counsel's HealthBench analysis is a comparator, not an oracle

Counsel describes filtering 453 selected conversations to 433 English examples,
261 after removing conditional escalation, and 103 after excluding third-party
messages. It distinguishes explicit escalation flags from free responses judged
for escalation and describes clinician review of a subset. Matching those
criteria is not proof of identical case IDs or a directly comparable denominator.
The article's narrative and figure caption are not used to infer an unavailable
confusion matrix. Its assumed demographics must not become inferred facts about
our patients.
[Counsel's emergency-escalation analysis](https://www.counselhealth.com/blog/how-counsel-leveraged-healthbench-to-assess-emergency-escalation).

Use its filtered first-message task as a distinct benchmark track. Keep
conditional advice, pediatric/third-party messages and multi-turn updates as
separate challenge tracks instead of deleting them from our broader scope.
Do not let an answer produced after additional history compete as if it had
received the same input as a first-message-only baseline.

### Clinical red-team matrix

The next paid/clinician study should pre-register cases with wrong-population
evidence, absent guidelines, conflicting recommendations, stale sources, missing
exceptions, hostile retrieved instructions, and authentic but irrelevant quotes.
Include medical counterfactuals: recent surgery versus remote unrelated surgery;
current trauma versus a hypothetical; abnormal measured physiology versus absent
readings; improving symptoms after a time-critical event; and a correct route
paired with a misleading patient explanation. Assess unnecessary escalation and
question burden as well as misses. These are study requirements, not results
established by mocked tests.

## 7. Verification and honest handoff

The final new suite passed 26 tests spanning source parsing/governance, deadlines,
source/claim identity, adaptive question state, reassessment, emergency
preservation, ablation call counts, manifest binding and interrupted-run resume.
It also executes 1,000 synthetic bookkeeping inputs across all four arms with
simulated runners: 4,000 records, then a second pass with no repeated inference.
**These are not 1,000 medical inferences.** The full root suite, 96 GUI/review
tests, type-checking, lint, Next.js production build and Mastra production build
pass. GUI verification used the real component renderer and stream parser;
no browser-interaction or paid-provider latency measurement is claimed.

The first public search smoke is preserved at
`outputs/evidence-search-smoke/1789107546548.json`. Three generic queries returned
four candidate passages each in 1.03–1.70 seconds. PubMed links were reachable;
the MedlinePlus page checks were unverified. This measures source transport and
candidate retrieval only. The case-report failure led to exclusion of such
records and a larger, bounded candidate pool; it does not justify a clinical
improvement claim without a fresh comparison.

A second public-API smoke, `1789108136173.json`, returned 4–5 selected candidates
per query in 0.82–1.95 seconds. Urinary-retention results now included a guideline
abstract and an emergency-department review, but also perioperative/prevention
material. This is a useful retrieval change, not a scored clinical improvement.
Both snapshots are retained locally and ignored by Git because abstract access
does not establish redistribution rights. The public
[metadata comparison](../outputs/evidence-search-comparison-20260911.json) retains
titles, URLs, timings, link states and hashes without reproducing source text.

No new paid model or judge calls were made. Existing allocation ceilings sum to
the user's $100 limit; reserved ceilings are not actual spend. Ledgers were not
reset. The live experiment command requires explicit spend reconciliation and
uses the existing project admission ledger. A 1,000-case, one-trial four-arm
plan allows up to 8,000 model calls. That is an experiment estimate, not a request
to spend beyond the ceiling.

The unresolved high-value work is specific: acquire a broad rights-cleared
guideline corpus, test the candidate on an independently defined case set, grade
the exact emitted trajectories, and measure clinical errors, unnecessary
questions and latency together. Until then, neither a passing unit suite nor a
larger source pool warrants replacing evidence of clinical benefit with a claim
of it.

## Reproduce

```bash
npm run adaptive:test
npm run evidence:search-smoke                    # public APIs only
npm run disposition:experiment -- plan cases.jsonl outputs/new-experiment
# run requires ANTHROPIC_API_KEY, explicit spend reconciliation and available
# capacity in the EXISTING project ledger; never creates a replacement allowance.
npm run disposition:experiment -- run cases.jsonl outputs/new-experiment
```

Minimal unseen input: `{"id":"new-001","message":"A fictional presenting message."}`.
`data/examples/disposition-input.jsonl` is a runnable two-case format example,
not a held-out or adjudicated evaluation set.
`COUNSEL_PASSAGE_CORPUS=/absolute/path/rights-cleared-passages.jsonl` configures the
optional local passage corpus. See `passageSchema` in `src/evidence/search.ts` for
required fields; do not represent an abstract as a full guideline.

The candidate is `adaptive-opus`; `conversational-opus` remains the earlier
measured low-latency baseline. Historical outputs and clinician reviews are
unchanged. The new candidate's real model latency and clinical performance remain
unmeasured.
