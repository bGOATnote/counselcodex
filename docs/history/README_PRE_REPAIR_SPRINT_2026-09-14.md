# Historical README before the September 14 repair sprint

One patient message produces **one system response**: either a decision-changing
question, or a disposition with timing, reason,
patient reply, brief differential, red flags, vital-sign limitations and research
citations. The same answer is the object of evaluation.

This is an independent synthetic take-home prototype, not a Counsel service,
medical device, clinically validated system or autonomous-care/billing authorization.

## Start here

The latest [candidate v14 GUI, retrieval, tracing and live verification report](docs/CANDIDATE_RETRIEVAL_OBSERVABILITY_2026-09-14.md)
includes all seven new browser attempts and the remaining latency/grounding
gates. The two targeted v14 migraine retests released Priority async responses,
but took 83–97 seconds; this is not a demonstrated speed improvement.

The physician's completed 50-case GUI review is now the
[frozen development reference](docs/research/PHYSICIAN_REFERENCE_ENGINEERING_2026-09-14.md).
It is used by the offline candidate scorecard, not copied into model prompts.
The DVT disagreement remains separate. Another adjudication of those 50 cases
is not required to continue engineering.

The [Counsel-aligned target architecture](docs/research/COUNSEL_DISPOSITION_TARGET_ARCHITECTURE_2026-09-13.md)
compares the supplied agent diagram with Counsel's published design and proposes
the candidate design. The [implementation and measured limitations](docs/research/EVIDENCE_GRAPH_IMPLEMENTATION_2026-09-13.md)
now document its real Mastra workflow, 1,391-document licensed corpus, hybrid
PostgreSQL/vector retrieval, independent judge and live GUI failures.
The [clinical upgrade graph](docs/research/CLINICAL_UPGRADE_GRAPH_2026-09-14.md)
adds a controlled-vocabulary matcher and real Mastra shadow step, disabled by
default. Its research seeds cannot override patient routing; clinical enforcement
requires measured benefit and extraction validation.

Try the **opt-in engineering candidate** at <http://localhost:4120/candidate>;
the incumbent routing workflow at `/` is unchanged. The candidate has **not** inherited physician
approval and is **not** a demonstrated clinical or latency improvement.
Graph expansion showed no additional relevance gain in the small retrieval
comparison and is off by default.

To rebuild the exact evidence index, use the frozen bundle (paid embeddings with
`--embed`; source ingestion itself makes no LLM calls):

```bash
npm run rag:build -- --directory apps/evaluation/.local/replayed-rag \
  --bundle outputs/evidence-graph-development-2026-09-13/corpus/manifest.json --embed
COUNSEL_RAG_DIRECTORY="$PWD/apps/evaluation/.local/replayed-rag" npm run review:dev
npm run rag:test
```

The candidate uses OpenAI embeddings, Haiku context/safety, Opus disposition and
Astra review. A separate Voyage key is not assumed. Its GUI runtime registers a
real Mastra workflow; the existing Studio default still runs the incumbent.
Keep CLI index operations separate from the running GUI's database ownership.
See the report for rights/attribution, source limitations and reproduction details.

Start with [how the right answer is defined and scored](docs/EVALUATION.md),
[the clinical-benefit study and current-runtime benchmark](docs/research/CLINICAL_BENEFIT_STUDY.md),
[the current evaluation audit](docs/research/EVALUATION_AUDIT_2026-09-13.md),
[assignment accounting](docs/CURRENT_TAKE_HOME_ACCOUNTING.md), and [demo runbook](docs/DEMO_RUNBOOK.md).
The [September 11 editable deck](output/presentation/counsel-disposition-current-2026-09-11.pptx)
predates this audit; its measurements must not be presented as current results.
The GUI is at <http://localhost:4120/>. Both async priorities identify the intended
Counsel clinician queue; delivery and follow-up are integration stubs, not a second
task-management app. Final-answer latency and source applicability
remain open release gates. Do not use the historical decks as current results.

Requires Node 22.18+ and `npm ci`.

```bash
npm run review:dev                 # http://localhost:4120/
npm run dev                        # Mastra Studio, same active workflow/store
npm run disposition:test           # deterministic software contracts; no API calls
npm run disposition:compact-pilot  # comparison protocol; no API calls by default
npm run adaptive:test             # dynamic history, retrieval and ablation contracts
npm run disposition:experiment -- plan cases.jsonl outputs/new-experiment
```

The existing root `.env` supplies `ANTHROPIC_API_KEY` for generation and
`OPENAI_API_KEY` for independent response review on the server. Never paste
keys into a patient message. Inputs are the fictional assignment messages or
new fictional cases. The primary screen has no repeated consent or cost controls.

## The entire active workflow

```text
message → immediate emergency screen (does not skip models)
          → Haiku: history / emergency assessment / evidence queries
              ├─ emergency instruction or decision-changing question
              └─ bounded public/corpus search
                     → Opus: disposition + reply + source-linked claims
                         → final recommendation OR awaiting patient information
                              → background independent review of issued content
```

- The new `adaptive-opus` research candidate uses Haiku 4.5 for a dynamic history
  and evidence plan, then Opus 5 for the final response. Clarification can block
  only with a specific routing consequence and a justified need to delay.
  Prescribing questions can be collected during clinician review; necessary referrals do not wait.
  No fixed topic list determines which cases can be searched.
- A known emergency streams an immediate instruction and **still runs Opus**;
  an unnecessary intake question is skipped. The final assessor does not receive
  the early route as an instruction. A disagreement can enter explicit
  reconciliation; it does not silently erase an earlier instruction. Failed prose
  cannot erase emergency or same-day escalation. Raw incomplete model text never
  reaches the patient panel. See the [v42 reconciliation record](docs/EARLY_ESCALATION_RECONCILIATION_2026-09-13.md).
- The patient can add a symptom update during generation. The original message
  remains in context; the older request is canceled, logged, and barred from
  replacing the new answer. The question is retained as assistant context, not
  converted into a patient finding. This is a fresh assessment, not durable
  workflow suspension/resumption.
- This is the **research/demo default**, not a clinical promotion or proven latency
  improvement. Set `COUNSEL_DISPOSITION_PROFILE=conversational-opus` for the earlier
  measured parallel low-latency baseline; `progressive-opus` retains the older
  three-call baseline. Historical profiles and outputs remain unchanged.
- Five operational routes: self-care, priority async, standard async, in-person
  today, emergency now. The versioned queue policy targets prompt same-day
  service-hours review for both async priorities, without inventing availability or a response guarantee.
- The [clinical policy and defensible-alternatives standard](docs/CLINICAL_DISPOSITION_POLICY.md)
  versions the candidate's definitions and separates exact reference agreement
  from model-assessed clinical support. It does not widen the frozen physician
  reference or infer that a different route is a clinical failure.
- No case-ID lookup supplies the answer. Original labels never enter the prompt.
- No separate “unattested proposal,” research answer or clinician-facing answer
  competes with the actual result. The brief differential is part of that result.
- Research citations identify claims inside that answer. Missing research fails
  coverage; citation presence alone does not establish claim support.
- After the response finishes, a separate Mastra workflow runs Astra against the
  exact frozen answer, early emissions, patient message and cited passages. Seven
  binary/abstention criteria assess routing, grounding, research and communication.
  This is one independent model applying seven criteria, not seven independent
  judges. Its findings appear in the response GUI, with append-only reviewer
  feedback. It cannot change the disposition or delay emergency instructions.
- The demo ends at the routing recommendation. Both async priorities share the
  intended clinician queue, with different priorities. Staffing, acceptance and
  follow-up delivery are unconnected; the interface does not simulate them.
  `/queue` explains that boundary; its old API returns 501 without reading or
  writing saved queue data. Historical queue code/data and `/review` remain
  preserved, but neither queue controls nor old reviews appear in the GUI header.
  The Counsel C symbol is static, without a playback button.

The active implementation is [src/disposition](src/disposition).
GUI, Studio and pilot share this runtime. `/` and `/v0` show the same agent;
the GUI calls `/api/disposition`.

## Evaluation: what the evidence actually says

The [clinical-benefit study](docs/research/CLINICAL_BENEFIT_STUDY.md) freezes a
paired Opus-versus-current-workflow comparison and grades issued responses against
upstream physician-authored criteria, with source support assessed separately.
`npm run clinical:benchmark -- plan .cache/clinical-benefit-v1` makes no paid calls.
Execution requires a separate approved study allocation. No clinical benefit is
claimed before that experiment runs. The reconstructed 103-case emergency subset
contains 24 multi-turn conversations the current adapter cannot yet handle; those
remain visible as unsupported, not quietly dropped or flattened into patient text.
`healthbench:eval` now targets this current workflow; old offline controls use
`healthbench:legacy-eval`. See the study for the required run arguments and limits.

The current scorer distinguishes all five routes and retains failed, missing and
contradictory early responses. A wrong early emergency cannot be erased by a
correct final async route. Current judge controls detected ten planted defects
and accepted eight target-criterion controls; these are authored mutations, not
clinical accuracy. The [all-attempt audit](docs/research/EVALUATION_AUDIT_2026-09-13.md)
reports the actual GUI cohort separately. Clinical accuracy and component lift
remain unestablished; no perfect-score headline is supported.

The first live pilot found real errors despite valid structured output:
overstated NICE timing, expanded symptom denials, questionable async routing for
pleuritic chest pain and a rejected injection-case answer. The failures are saved
locally, not overwritten. Prompt/retrieval changes and targeted regressions were
made in response. This is development iteration, **not held-out lift**.

Executable checks cover the answer contract, urgency floor, exact patient
quotes, citation IDs, and limited known phrase/attribution failures. They are not
a clinical correctness score. Citation entailment, population applicability and
clinical adequacy require independent grading of this exact output.
`not_assessed` does not mean passed.

The new candidate searches MedlinePlus summaries and PubMed-indexed abstracts via
Europe PMC. It can also search rights-cleared guideline passages supplied through
`COUNSEL_PASSAGE_CORPUS`. It distinguishes source type, quote identity, link
availability and model-declared applicability. It does **not** have comprehensive
guideline coverage or independently verified clinical support. The first public
search test found unsuitable candidate material despite successful API responses.

Read [the correction: research, implementation, failures and evaluation design](docs/ADAPTIVE_DISPOSITION_RESEARCH.md).
The [routing design](docs/research/DISPOSITION_ROUTING_DESIGN_2026-09-11.md)
separates care setting from review speed: priority and routine are subdivisions of
`ASYNC_PHYSICIAN`; a medication request is a work type, not an acuity bucket.
The former interactive queue is no longer part of the GUI workflow. `/queue`
now explains the handoff stub; historical implementation details remain in the
[queue build record](docs/research/CLINICIAN_QUEUE_BUILD_2026-09-11.md), not as evidence
of connected clinician acceptance, messaging or follow-up.
The [coding, care-episode and audit design](docs/research/CODING_EPISODES_AND_AUDIT_2026-09-11.md)
separates safe disposition from diagnosis coding and payment eligibility. It is a
research-backed implementation plan, not a working billing or HIPAA-compliance layer.
The new same-input harness compares base Opus, workflow without retrieval, retrieval,
and optional critique, preserves failures, and accepts unseen cases. No paid
clinical comparison of this candidate has been run. A 1,000-case import/planning
test is not 1,000 clinical evaluations.

The **historical** shared evidence library has 15 runtime notes: ten migrated summaries and five
with short inspected publisher excerpts. Neither status is physician approval.
Sources, excerpts, interpretations and exact-response grading are separate records.
The earlier [evidence engineering report](docs/EVIDENCE_ENGINEERING.md) contains the
Counsel/Mastra/GraphRAG research, component decisions, reproducible retrieval
comparison, source-access failures, and protocol for a new batch of cases.
With that older retriever on the original 50, 33 retrieve no candidate. This is not complete evidence
coverage or validated clinical lift. Run `npm run evidence:audit` without API calls.

The prior measured nasal-symptom intake asks about relevant surgery, head/face injury (including
penetration), timing, drainage character and respiratory risk in one early question.
[Nasal-history research, latency comparison and all red-team failures](docs/NASAL_HISTORY_2026-09-10.md)
documents the measured tradeoff: primary paired intake medians **0.89 → 1.63 s**;
latest targeted question **1.74 s**. Neither unchanged accuracy nor a latency SLA
has been established. The last wording guards were tested offline, not with another
paid live run. Original source labels and saved physician reviews remain unchanged.

Start with [the measured latency changes, red-team failures and fixes](docs/COMPACT_RESPONSE_2026-09-10.md).
The 32 automated attempts and subsequent browser runs are available in the
[offline evidence artifact](outputs/compact-latency-20260910-v1.json), including
failed attempts and checks added after the original runs. No p95, clinical
non-inferiority or zero-harm claim is made.

Read [one-answer design, rubric and limits](docs/ONE_ANSWER_SYSTEM.md).
Read [the Opus workflow change and observed failures](docs/OPUS_WORKFLOW_2026-09-10.md).
Read [progressive responses: live timings, ablations and escaped errors](docs/PROGRESSIVE_RESPONSE_2026-09-10.md).
The [live pilot report](docs/DISPOSITION_AGENT_PILOT_2026-09-10.md) records all four
attempts, the incomplete runs, and remaining clinical errors in the latest output.
Earlier [HealthBench research](docs/HEALTHBENCH_EMERGENCY_EVALUATION.md) and other
benchmark artifacts describe earlier versions unless explicitly rerun; none
establish current clinical efficacy.

## Reproducibility and costs

Each run saves the exact synthetic input/answer, answer hash, prompt/corpus
hashes, model, token usage, Mastra run/trace IDs, checks and measured step timing.
New artifacts are append-only in ignored `apps/evaluation/.local/disposition-agent-v3/`.
They include each agent's output/failure and every emitted section with sequence
and server timing. Event logs are flushed before emission, including on later failure.
The GUI offers an exact JSON download and reports failed persistence.
Mastra traces hide clinical inputs/outputs. LibSQL persists traces; aggregate
Mastra metrics are not supported by this adapter. Timing/tokens remain in runs.

This version normally uses **Haiku 4.5 + Opus 5**, no retries and bounded
input/output. Manually requested GUI runs use `manual-gui-v1`: no exhausted
historical lifetime quota blocks them. Existing experiment/Studio ledgers remain
unchanged. A provider account balance is not this project's spend or ceiling.
The user's earlier $100 instruction was subsequently clarified; do not infer a
ceiling from a screenshot or reset historical accounting.

The new independent-review pilot has its own **$20 allocation**, separate from
inference and the provider balance. Each call reserves $1.25, then reconciles
completed, known usage at conservative rates. Failed or uncertain calls retain
their reservation and are not automatically retried. The historical nine-control
pilot cost an estimated **$0.64339**. The September 13 current-rubric eighteen-control
validation cost an estimated **$1.43898** across eighteen new calls; its second
report reused twelve of those calls, not another paid eighteen. Actual GUI reviews are recorded separately.
These are usage-based estimates, not invoices. Cost mechanics stay out of the
primary patient-response panel. Real patient data is prohibited.

## Existing work is preserved, not relabeled

[Previous-version reviews](http://localhost:4120/review) retain the user's saved
judgments of the earlier rules-based answers. They are not silently treated as
reviews of new agent responses. Original CSVs, frozen predictions and historical
results are unchanged.

Earlier routing, intake and retrospective CQA experiments remain replayable via
`src/mastra/legacy-index.ts`; they are not active product agents in Studio.
The old `/api/v0` endpoint and `route`, `evaluate`, `agent:*`, `cqa:*` and
`healthbench:*` commands are historical experiment paths. Their scores must not
be presented as this agent's performance.

Historical context: [presentation review](docs/PRESENTATION_REVIEW_2026-09-10.md),
[current demo runbook](docs/DEMO_RUNBOOK.md),
[clinical response standard](docs/CLINICAL_RESPONSE_STANDARD.md),
[evidence workbench](docs/CLINICAL_EVIDENCE_WORKBENCH.md).

## Verify

```bash
npm run lint
npm run typecheck
npm test
npm run review:test
npm run review:build
npm run build
node --experimental-strip-types scripts/disposition-compact-report.ts  # offline integrity verification
node --experimental-strip-types scripts/disposition-nasal-report.ts    # all 28 new attempts; offline verification
```

Software tests establish behavior and regression protection, not zero harm.
