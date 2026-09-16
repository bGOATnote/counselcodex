# Clinical response latency: enterprise evidence and the next architecture

## Executive assessment

The current prototype is not meeting a credible conversational standard. In the COPD example, useful care instructions appeared after 12.588 seconds, the patient paragraph after 17.425 seconds, and the completed assessment after 26.255 seconds. This is predominantly a model-output and dependency problem, not a slow frontend or a limitation imposed by Mastra.

The recommended next candidate is **a short patient-facing intake turn alongside a compact Opus disposition assessment**. Remove the mandatory full history essay and subsequent full writer essay from the first-response path. Keep one conversation, one authoritative care recommendation, claim-linked evidence, and a record of exactly what appeared when. A faster model can ask a relevant question before Opus finishes; allowing it to independently recommend treatment or a lower-acuity route is a separate, higher-risk experiment.

Enterprise evidence supports selective parallelism, specialized models, reused context, and separate response-depth budgets. It does not establish that adding agents automatically improves care, that every company uses the same architecture, or that an API-based prototype will match a company operating its own inference stack. The proposed latency targets below are acceptance criteria to test—not performance already achieved or universal clinical standards.

## 1. Published enterprise evidence

### Counsel: history-taking with parallel supervision

Counsel's Mastra case study describes history-taking agents running alongside supervisor agents, including emergency detection. It also describes task-specific agents, guideline retrieval, medical-record search, Next.js interfaces, and a private-cloud Kubernetes deployment. It does **not** disclose per-turn model choices, exact release gates, or first-response p50/p95 measurements. The architectural lesson is concurrent clinical responsibilities with shared context; the case study does not require three long Opus generations for each message. [1](https://mastra.ai/customers/counsel-health)

Our current history branch extracts findings internally and explicitly does not talk to the patient. That is not the same interaction as a patient-facing history-taking agent. Calling both components “history agents” obscured this important difference.

### OpenEvidence: different depths have different time budgets

OpenEvidence's September 3, 2026 company release describes Osler as the default, approximately five-second answer; Sackett as approximately 30 seconds with deeper search and interactive clarification; and Snow as approximately five minutes for a parallel literature investigation. These are company-reported approximate answer times, without a disclosed percentile, load profile, or independently reproduced measurement. They concern clinician-facing evidence assistance, not an emergency-triage service-level agreement. [2](https://kxlt.marketminute.com/article/bizwire-2026-9-3-introducing-the-openevidence-model-family)

The transferable product decision is explicit depth selection. A routine interaction should not silently incur the cost of a deep report. The present prototype effectively asks for a report-sized output on every run.

### Abridge: specialization and inference engineering

Abridge's engineering leader describes using faster, cheaper models to triage work for larger models and optimizing the measured bottleneck rather than defaulting to the largest model everywhere. This is firsthand engineering discussion, not a published guarantee about a particular production request graph. [3](https://www.latent.space/p/abridge)

Separately, Abridge's March 2024 NVIDIA announcement describes a system containing several specialized models and inference optimization using NIM and TensorRT-LLM; it reports a reduction from minutes to seconds. That historical claim does not supply a current numerical p95 and refers to documentation workflows, not initial patient advice. [4](https://www.abridge.com/press-release/collaboration-nvidia)

The applicable lesson is to specialize and measure. Reproducing GPU infrastructure is not the appropriate first remedy for a local service that spends approximately 14 milliseconds screening and retrieving context.

### Ambience: prepare and reuse task-relevant clinical context

Ambience's August 24, 2026 Chorus article describes maintaining a source-linked, reconciled patient understanding across workflows, rather than repeatedly sending an entire chart to each capability. Its website advertises 50% less latency and 95% less EHR transaction load; the available page does not specify the baseline or latency distribution. These relative figures cannot be converted into a two-second response promise. [5](https://www.ambiencehealthcare.com/blog/introducing-ambience-chorus----part-1-system-of-context) [6](https://www.ambiencehealthcare.com/)

For this prototype, the immediate analogue is much smaller: prepare relevant guideline context once, reuse it across branches, and do not repeatedly generate the same findings. For longitudinal care, context also needs source timestamps, conflict handling, patient isolation, and invalidation when new information arrives.

### Hippocratic AI: the closest published conversational example

Hippocratic AI's June 2026 engineering account distinguishes a live conversational model from parallel specialist supervisors. Some supervisors synchronously block unsafe utterances; others monitor work that can safely complete later. This is a materially more useful description than “use multiple agents.” Its current Polaris page reports 1.5 seconds to first audio. That is a company measurement of a voice milestone, not time to a finished evidence-backed disposition or independently demonstrated equivalence to our task. [7](https://hippocraticai.com/building-ai-for-healthcare-conversations-part-2/) [8](https://hippocraticai.com/polaris/)

An earlier technical account explains selective supervisor invocation, concurrent execution, cache warming, prefix caching, quantization, continuous batching, and kernel-level inference optimization. Those techniques are relevant to a company controlling its models and serving stack; an application using a hosted API does not directly control most of them. [9](https://hippocraticai.com/polaris2/)

**Engineering inference:** separate what must be correct before the patient acts from what can enrich the record afterward. An asynchronous critic cannot undo harmful advice already read. Medication instructions and potentially delaying reassurance cannot be released merely because a reviewer will eventually arrive.

### Cross-company comparison

| System | Published timing evidence | Transferable decision | Important limitation |
| --- | --- | --- | --- |
| Counsel | No comparable per-turn distribution found | History-taking beside emergency supervision | Exact private graph and release policy undisclosed |
| OpenEvidence | Approximately 5 s / 30 s / 5 min by depth | Separate default answer from deep investigation | Company report; clinician evidence product |
| Abridge | Historical minutes-to-seconds statement | Specialized work and optimized inference | Documentation workflow; no usable current p95 |
| Ambience | Advertised 50% latency reduction | Shared, task-ready context | Relative metric; baseline not disclosed |
| Hippocratic AI | Reported 1.5 s to first audio | Conversational model plus selective supervisors | Voice metric; proprietary serving stack |

The sources above support these rows. None supports a claim that this repository already matches their clinical performance.

## 2. The measured critical path in this repository

The screenshot corresponds to stored run `a213bb7f-edc8-4048-a894-bad1d5994f58`, profile `progressive-opus`, completed at `2026-09-10T21:59:13.796Z`. The message describes a 68-year-old with COPD, two days of increased breathlessness, becoming winded walking to the bathroom, and green sputum.

| Component | Duration | First text delta, relative to that call | Output tokens |
| --- | ---: | ---: | ---: |
| Screen and retrieve | 14 ms | Not applicable | 0 |
| Opus history | 8,080 ms | 1,946 ms | 559 |
| Opus emergency supervisor | 12,561 ms | 5,807 ms | 875 |
| Opus disposition writer | 13,605 ms | 1,523 ms | 1,013 |

History and supervision run concurrently. The writer begins after their join. The observed critical dependency is therefore approximately `max(8.080, 12.561) + 13.605 = 26.166 seconds`, consistent with the 26.255-second total. This decomposition is based on one recorded run, not a latency distribution.

The first model text delta is not the first clinical instruction, and the writer's 1.523-second figure is **not** measured from the patient's submission. The first action was emitted at 12.588 seconds. The browser-visible screenshot reports server timing; browser paint and patient comprehension were not measured.

### Specific causes

The supervisor must finish its entire structured output before releasing its decision. It produced 875 tokens, including an extended explanation and repeated concerns. Ordering the disposition first in JSON did not help: the branch still waits for the completed object.

The final writer then receives both completed analyses and generates another assessment. Its instructions require a 60–110-word patient paragraph, plus a reason, differential, red flags, vital-sign commentary, questions, citations, and limitations. The early-release parser waits for the complete patient-message field. This is structured streaming, but not a compact conversational first turn.

The code uses `Agent.stream()`, yet most of its useful content is still buffered behind application-level completion requirements. There is no evidence that changing frameworks or adding Kubernetes would remove those requirements.

There is a separate quality defect: retrieval returned **zero sources** for the COPD message. The current corpus has four project-authored notes, with no COPD coverage, and a keyword selector. It is not a broad clinical evidence service. Faster generation cannot correct that omission; nor should a later citation be retroactively counted as support available to an earlier response.

### What the previous fast-model pilot did—and did not—test

The `haiku-opus` arm asked Haiku to extract a quote for a fixed acknowledgment. It did not ask a patient-facing question or make a clinical care decision. The independent Opus writer did not consume Haiku's output. Accordingly, its approximately 2.9-second acknowledgment is not evidence that a useful clinical intake agent has been built.

The prior two-trial-per-case experiment suggested that eliminating the writer's dependency could reduce time, but it was too small to establish a p95 or clinical non-inferiority. Unsupported statements such as “spreading” redness escaped the checks. The [previous measurement report](PROGRESSIVE_RESPONSE_2026-09-10.md) preserves the failures; it should not be presented as a successful clinical-speed validation.

## 3. Reasonable latency targets

There is no identified authoritative standard saying that a medical chatbot's full answer must finish within a particular number of seconds. Classic interaction research distinguishes roughly 0.1-second immediate feedback, one-second continuity, and a substantial loss of attention around ten seconds. These are UX heuristics, not medical safety thresholds. [10](https://www.nngroup.com/articles/response-times-3-important-limits/?lm=website-response-times&pt=article)

For this text interface, the following are proposed engineering acceptance targets. Measure from submission to **client rendering of a complete useful unit**, with server milestones recorded separately.

| Milestone | Proposed p50 target | Proposed p95 target | What counts |
| --- | ---: | ---: | --- |
| Submission feedback | ≤100 ms | ≤200 ms | Input visibly accepted; not clinical guidance |
| Recognized emergency protocol instruction | ≤250 ms | ≤500 ms | Complete immediate action for a supported trigger; report trigger coverage separately |
| First useful conversational turn | ≤2 s | ≤4 s | A relevant, non-redundant clinical question or an appropriate care instruction |
| Compact care recommendation | ≤3 s | ≤5 s | Action, timing, and destination—not a raw enum or status message |
| Concise supported assessment | ≤5 s | ≤8 s | Care recommendation with short rationale, applicable sources, and necessary uncertainty |
| Optional expanded analysis | Separate explicit budget | Separate explicit budget | Clinician detail or deep research; not the silent default |

These are deliberately demanding candidate targets. The present measurements do not demonstrate that the current provider and model combination can meet them. If a configuration fails, report that fact; do not relabel an acknowledgment as success, hide unsuccessful requests, or extend the target after seeing the results.

A 20–30-second expanded report can be useful after an actionable exchange or when explicitly requested. It is a poor default for someone waiting for an initial response. A shorter first turn must also reduce decision burden: dumping a long differential earlier is not conversational progress.

## 4. What an initial response should look like

For the COPD example, the first turn should address **current severity**, not just advise what to do if emergency symptoms develop later. A proposed clinician-review example is:

> Please get assessed in person today. Are you struggling to get words out because of your breathing, or suddenly confused? If either is happening, call 911 now—don't wait for this chat.

This is an illustrative response, not a newly adjudicated reference label. Same-day in-person assessment is a case-specific clinical interpretation of the reported functional deterioration and unassessed severity. NICE describes assessment factors including breathlessness, functioning, consciousness, cyanosis, and oxygenation; NHS guidance identifies severe breathing difficulty and sudden confusion as emergency features. The example localizes the UK emergency number to the US setting; it does not assert that the publications prescribe this exact wording or a universal same-day rule. [11](https://www.nice.org.uk/guidance/ng115/chapter/Recommendations) [12](https://www.nhs.uk/symptoms/shortness-of-breath/)

In the interface, relevant guideline links can appear directly below the instruction. Reading a link or collecting a pulse-oximeter reading must not be a prerequisite to emergency action. If an oxygen reading is already available, capture its value, units, time, baseline, and oxygen use in the next appropriate turn; do not infer normal physiology from missing measurements.

For the already-recognized suspected-heart-attack example, a question must not precede the action:

> Call 911 now. Your symptoms could be a heart attack. Do not drive yourself or wait for this chat. An ambulance team can start assessment and treatment before you reach the hospital.

This example follows the action-first principle in AHA warning-sign guidance. It does not require a diagnosis, probability estimate, literature review, or further symptom development before escalation. [13](https://www.heart.org/en/health-topics/heart-attack/warning-signs-of-a-heart-attack)

For messages without an established emergency, a short question can be useful while the disposition assessment runs. It must be chosen because the answer could change care—not to fill waiting time. The system must accept the patient's reply immediately and cancel or supersede generation based on the older message.

The two-second intake target and the care-instruction target are different. The complete COPD example above includes a care recommendation and must wait for the appropriate clinical admission check; it is not permission for the fast intake model to recommend same-day care independently. Before that decision, a bounded question about current breathing severity can appear, with any clinically approved emergency warning handled by the applicable protocol. A model-generated “please wait” does not satisfy either target.

## 5. Recommended candidate architecture

### One conversation, two live responsibilities

The first candidate should retain Mastra and use two concurrent responsibilities:

1. **Conversation/intake agent:** a fast model, initially Haiku as an experimental candidate. It acknowledges only supported facts and asks at most one decision-changing question. It cannot independently clear an emergency, prescribe, invent normal findings, or issue lower-acuity reassurance while assessment is incomplete.
2. **Disposition and safety agent:** Opus, receiving the original message and applicable retrieved evidence immediately. It produces a compact care decision, patient instruction, short rationale, brief differential, critical unknowns, and claim-linked source identifiers. It no longer waits for a separate history essay or requires a second writer to repeat the decision.

The patient sees one coherent conversation. The system renders the authoritative instruction when ready and suppresses an intake opening that has become redundant. Internal reasoning, competing drafts, and judge output do not become additional patient messages. A scorer can evaluate the same emitted response and subsequent turns without blocking delivery merely to calculate a score.

This is a proposed simplification, not a reconstruction of Counsel's private system. It preserves the useful separation between interaction and clinical supervision while removing duplicate synthesis. Whether removing the separate history branch loses important findings is an empirical question for the ablation, not an assumption that it was useless.

### Compact output contract

The first care decision should contain the four-bin disposition, destination, a short patient instruction, and a small set of supporting facts/source IDs. Aim initially for about 200–350 output tokens for the concise assessment, rather than over 1,000. This is an experimental budget, not a cap that may truncate necessary safety instructions.

If a complete first-action object is separated from a later expanded assessment, the action object must be independently schema-valid and clinically checkable. A partially emitted enum inside a larger unfinished JSON object is not sufficient. Truncation must produce an explicit incomplete state, not a fabricated completed answer.

The runtime should emit the compact response as soon as its required checks pass. Extended clinician detail is optional continuation, not a mandatory second model call for every case. Count all continuations and retries in latency and cost. Do not claim “two calls” if a third call is actually required to finish the displayed result.

### Gates depend on what is being said

A factual acknowledgment or bounded intake question does not need to wait for a full differential. A self-care recommendation, medication instruction, or assurance that waiting is appropriate does require the relevant safety assessment. Known emergency instructions remain available immediately, while model assessment and explanation continue; the rules do not replace the model or establish safety when they do not fire.

A bounded pattern screen is only supplemental protection. Its sensitivity outside its authored examples is inadequate as the sole emergency detector. “No rule fired” must never release reassuring prose by itself. A malformed or timed-out safety result also must not default to a low-acuity answer.

Replacing Opus with Haiku for the **authoritative care decision** is a separate experiment. It should be tested only after the compact Opus baseline exposes the remaining provider latency. Moving risk into a cheaper model and relying on Opus to correct it later is not a safe shortcut.

### Research remains part of the scored response

Maintain a governed source corpus with clinical scope, version, source section, publication date, review date, claim mapping, and link-check status. Fetch and verify material ahead of the patient interaction where possible. At runtime, retrieve applicable passages or faithful reviewed summaries, not a full web investigation for every common presentation.

A link being reachable is not proof that it supports a claim. Evaluation needs both coverage and entailment, including population, setting, recommendation strength, and temporal applicability. If support arrives after a displayed claim, score the earlier claim using the evidence available at that time; do not rewrite its provenance.

Expand missing COPD coverage before evaluating that case as evidence-supported. Test lexical and vector/hybrid retrieval against the same frozen query set; choose the smallest approach that improves recall and applicability. Adding embeddings to four notes does not create the missing guideline. Unrestricted live search should not delay a required emergency action or become the only route to basic clinical guidance.

## 6. Mastra and comparable framework mechanics

Mastra's `.parallel()` runs branches concurrently but waits for all branches before the next step. That join is useful for a final aggregate; it should not determine when a completed first-response event may be displayed. Our current graph makes the writer a post-join dependency. [14](https://mastra.ai/docs/workflows/control-flow)

The installed Mastra 1.64.0 documentation exposes agent streams, workflow lifecycle events, partial and final structured output, and workflow-step `writer.write()` events. Write calls must be awaited. The implementation can therefore emit an admitted clinical unit from a branch without awaiting the final report. The application remains responsible for deciding what may be emitted. [15](https://mastra.ai/docs/guides/streaming) [16](https://mastra.ai/reference/streaming/workflows/stream)

Current background-task documentation also supports task lifecycle streaming and agent continuations. `untilIdle` spans continuations in `fullStream`, while aggregate text/output properties still refer to the first turn; a suspended task resumed after a process restart requires re-registering its executor. These details need integration tests before relying on them for durable care follow-through. They are not a reason to introduce a dynamic orchestration layer into a two-branch V0. [17](https://mastra.ai/docs/harness/background-tasks)

LangGraph similarly exposes custom, token, state, and subgraph streaming. Switching to it would not remove a decision to wait for a completed supervisor followed by a completed writer. Both frameworks can support incremental delivery; the dependency graph and release policy determine the result. [18](https://docs.langchain.com/oss/javascript/langgraph/streaming)

Anthropic's multi-agent research system parallelizes both agents and tools for open-ended research, reporting substantial reductions in research time. Its unit of work is a research investigation, often still taking minutes. That architecture is appropriate for an optional evidence investigation, not an argument for an autonomous lead agent to plan and delegate every short patient turn. [19](https://www.anthropic.com/engineering/multi-agent-research-system)

### Provider and serving optimizations

Anthropic recommends smaller models where appropriate, shorter outputs, and streaming. Shorter semantic units matter more here than animated typing indicators. Reducing a token ceiling without changing the output contract can simply increase truncation failures. [20](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-latency)

Prompt caching can reduce repeated-prefix processing, not output-generation time. Current documentation gives different minimums by model: 512 tokens for Opus 5 and 4,096 for Haiku 4.5. A short Haiku intake prompt may not qualify. Record actual cache-read/write usage; do not assume a hit, pad prompts merely to create a cache benchmark, or share patient-specific context across tenants. [21](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)

Native structured output can incur grammar-compilation latency on a new schema, with subsequent schema caching. Whether that mechanism explains any local delay is **unmeasured**: first verify the installed provider adapter's actual request and the cold/warm difference. Keep schemas stable and record their hashes. [22](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)

Anthropic's current fast-mode preview reports up to 2.5 times higher output speed for supported Opus models, not a reduction in time to first token; access and separate limits apply. It is more expensive and has not been enabled for this study. Even an illustrative 2.5-fold reduction of the supervisor's post-first-delta interval leaves `5.807 + (12.561−5.807)/2.5 ≈ 8.51 seconds`. This is not a forecast, but it shows why an output-speed switch alone cannot meet a two-second goal when the first text delta itself took 5.807 seconds. [23](https://platform.claude.com/docs/en/build-with-claude/fast-mode)

Production deployment should keep the interactive service warm, preserve connection reuse, bound concurrency, and distinguish queueing from inference. Cache and retrieval invalidation must preserve clinical correctness. GPU serving, model distillation, and quantization become relevant only after a demonstrated workload and quality case; they are not a proportionate first step for this repository.

## 7. Measurement and clinical release criteria

### Instrument the actual experience

Record timestamps for submission, server acceptance, context readiness, each model request, first provider text delta, first complete action, each admission decision, durable event append, client receipt, client paint, and final completion. Separate thinking/reasoning usage if provided; the current code comment is not evidence that the provider spent no time reasoning.

Mastra supports child spans, point-in-time event spans, trace metadata, and error records. Use those to explain the critical path rather than reporting only total workflow duration. A trace identifier alone does not prove a useful trace was exported. [24](https://mastra.ai/reference/observability/tracing/spans)

Each experiment record should include model identity, actual provider settings and service tier, prompt/schema/corpus hashes, cache usage, token counts, retries, concurrency, cold/warm state, failure class, and exact patient-visible events. Reconcile server and browser timing; do not subtract unrelated clocks without a synchronization model. Keep clinical event payloads out of unrestricted telemetry.

Report p50/p95/p99 only with sample sizes and uncertainty appropriate to the data. Include timeout and failure counts and the fraction of **all eligible attempts** receiving an appropriate instruction by the deadline. A low median among successful completions can coexist with an unacceptable product.

### Test every visible prefix, not only the final answer

The safety unit is the response the patient could act on at each moment. A later correct answer cannot repair an earlier unsafe reassurance for evaluation purposes. Measure clinical appropriateness by deadline alongside eventual quality, rather than multiplying a vague safety score by average speed.

Required deterministic tests include event ordering, no cross-run leakage, cancellation on a new message, preserving already-issued emergency action, invalid/truncated JSON, supervisor failure, missing evidence, duplicate submissions, disconnected clients, failed persistence, and recovery after restart. No progress or internal-draft event should count as clinical guidance. Failure of optional explanation must not remove a required emergency instruction.

Clinical tests must include the original 50 as development data plus frozen unseen variants: COPD with and without severe features, already-abnormal vitals, uncertain measurement reliability, diabetic foot infection, chest-pain mimics, pregnancy, pediatrics, negation, misspellings, third-party descriptions, multiple concerns, and new emergency disclosures during generation. Evaluate both under-triage and unnecessary escalation, exact destination/timing, question usefulness, unsupported assertions, and source applicability.

Counsel's HealthBench emergency analysis used English-language cases and excluded conditional emergency instructions and secondhand accounts, leaving 103 cases. Reproduce that cohort separately if claiming comparability. Those exclusions must **not** become exclusions from product testing: conditional symptoms and caregiver messages remain important clinical interactions. Nor does emergency recall measure initial response quality or time to action. [25](https://www.counselhealth.com/blog/how-counsel-leveraged-healthbench-to-assess-emergency-escalation)

Abridge describes offline evaluation, blinded clinician comparisons, staged deployment, continued online monitoring, and LLM judges validated against clinician annotations. The relevant standard here is the connection between automated checks and actual clinical judgment, not a large count of uncalibrated judge scores. [26](https://tech.abridge.com/blog/ai-evaluation-at-abridge)

For a solo clinician-engineer, targeted blinded comparison of disputed or high-risk prefixes is more useful than another sprawling form. Preserve a small fixed rubric: right action/timing, unsupported or misleading statement, useful question, and applicable evidence. This is development adjudication, not independent clinical validation or proof of zero harm.

## 8. Implementation sequence and decision gates

### First: make the output and benchmark honest

Freeze the current commit, prompts, corpus, input hashes, and observed failures. Add client-render timing and failure-inclusive deadline metrics. Define the compact response schema and expected clinical content before inspecting new outputs. Build mocked stream and failure tests without paid calls.

The initial GUI should show a short conversational question or care instruction, followed by a concise supported response. Detailed differential, red-flag provenance, vital-sign context, and execution traces should be accessible without occupying the entire first screen. Evidence should be readable beside the claims it supports, not represented by a green badge alone.

### Second: compare compact Opus with the current graph

Run a paired development comparison of the existing three-call graph and a compact Opus assessment starting directly from source input and retrieved guidance. Keep model and evidence constant to isolate the cost of duplicate history/writer work. Inspect lost findings as carefully as saved seconds.

Then add the bounded Haiku intake turn concurrently. Measure whether it supplies useful, safe clarification—not merely whether a text event appears earlier. This arm tests the interaction that the earlier Haiku acknowledgment experiment did not implement.

### Third: decide whether faster clinical routing is necessary

Only if compact Opus misses the care-instruction target should a faster model's authoritative routing be evaluated as a distinct candidate. Keep the source corpus, case set, and scoring fixed. Require a predefined acceptable clinical-risk margin with confidence intervals, not “both got the 50 cases right.” Cross-model agreement is not independent corroboration when both share the same missing evidence.

No experimental configuration should be promoted solely for speed. A newly introduced safety-critical error blocks promotion; zero observed errors in a small sample still does not establish general safety. Larger independent validation and operational care-pathway testing remain necessary for deployment claims.

### Fourth: validate delivery under realistic failure and load

Exercise warm and cold calls, concurrency, rate limits, provider timeout, incomplete evidence, slow storage, and browser reconnection. Use computer-use/browser testing to verify first paint, question submission while assessment is running, visibility of emergency instructions, and absence of stale output after editing. Persist patient-visible events and confirm replay matches the display.

Do not implement background work as an untracked promise that may disappear when the request ends. Use managed task state, explicit ownership, cancellation, and reconciliation. Generating “a clinician will review” is not equivalent to creating a monitored handoff; no such integration should be implied unless it exists.

### Spend and scope

This research adds no paid model calls. A new pilot should be separately capped only after reconciling the current ledger with the existing $100 project ceiling. A small screening pilot can reject bad designs; it cannot establish a robust clinical non-inferiority margin or enterprise p95. No new hosting, GPU, or premium-inference purchase is justified before the application-level comparison.

The immediate recommendation is therefore **not another visual loading improvement**. It is a compact, evidence-supported decision produced without redundant serial synthesis, paired with a genuinely useful short intake turn and evaluated at the moment each clinical statement becomes visible.

## Local evidence and reproducibility

The current-state diagnosis refers to commit `ddb8156`, not older architecture/accounting documents describing earlier prototypes. Implementation references are `src/disposition/workflow.ts`, `src/disposition/progressive.ts`, and `src/disposition/guidance.ts`. The original CSV, clinician reviews, and prior result artifacts are unchanged by this report.

The exact screenshot run remains in the ignored local file:

`apps/evaluation/.local/disposition-agent-v3/runs/a213bb7f-edc8-4048-a894-bad1d5994f58.json`

Its SHA-256 is `83a1c3bf6900662dca8adece2008538dcd13cdbbb60e74f15f7a31cad76d4fe4`. This artifact was inspected read-only. A fresh checkout does not contain the ignored raw run; the timing table above is a transcription of its recorded fields. The earlier public [pilot observation file](evaluations/progressive-latency-2026-09-10.json) is a different cohort and should not be mistaken for this later screenshot run.

## Sources

Sources were checked on September 10, 2026. Company-reported measurements are identified as such; none was independently benchmarked here. Public documentation can change. Several pages expose no publication date. The OpenEvidence website returned access restrictions and the original Business Wire URL did not render in the research reader; citation 2 is an accessible syndicated copy of the company-authored release, with the original linked inside it. This is not an independently reported benchmark. NICE's recommendations page was available through indexed excerpts, but direct retrieval returned HTTP 403 during the final link check; that is an access limitation, not proof of a broken clinical source. No exhaustive search can establish undisclosed private architecture or service-level objectives.

1. Mastra / Counsel Health. [Counsel Health Is Multiplying the World's Clinical Capacity with Mastra](https://mastra.ai/customers/counsel-health). Undated case study; firsthand description of stack and agent responsibilities.
2. OpenEvidence. [Introducing the OpenEvidence Model Family](https://kxlt.marketminute.com/article/bizwire-2026-9-3-introducing-the-openevidence-model-family). September 3, 2026. Company-authored Business Wire release, syndicated by MarketMinute; approximate model-depth timings.
3. Latent Space, interview with Abridge engineering leadership. [Abridge engineering discussion](https://www.latent.space/p/abridge). Discussion around 49 minutes; firsthand fast/slow-model design account. Publication date not relied upon.
4. Abridge. [NVIDIA collaboration announcement](https://www.abridge.com/press-release/collaboration-nvidia). March 19, 2024. Historical inference-engineering announcement.
5. Ambience Healthcare. [Introducing Ambience Chorus – Part 1: System of Context](https://www.ambiencehealthcare.com/blog/introducing-ambience-chorus----part-1-system-of-context). August 24, 2026. Shared clinical-context architecture.
6. Ambience Healthcare. [Platform website](https://www.ambiencehealthcare.com/). Undated current page; company latency/load reduction claims.
7. Vivek Muppalla, Sathvik Perkari, Dishank Jhaveri / Hippocratic AI. [Building AI for Healthcare Conversations, Part 2](https://hippocraticai.com/building-ai-for-healthcare-conversations-part-2/). June 18, 2026. Synchronous versus asynchronous supervision.
8. Hippocratic AI. [Polaris 5.0](https://hippocraticai.com/polaris/). Undated current product page; company-reported first-audio timing.
9. Subhabrata Mukherjee / Hippocratic AI. [Polaris 2.0](https://hippocraticai.com/polaris2/). September 1, 2024. Selective concurrent models and inference optimizations.
10. Jakob Nielsen / Nielsen Norman Group. [Response Times: The 3 Important Limits](https://www.nngroup.com/articles/response-times-3-important-limits/?lm=website-response-times&pt=article). January 1, 1993. General interaction heuristics, not clinical standards.
11. NICE. [NG115: Chronic obstructive pulmonary disease in over 16s—recommendations](https://www.nice.org.uk/guidance/ng115/chapter/Recommendations). Published 2018, updated 2019. Adult COPD severity/setting considerations; indexed guideline excerpts available, direct HTML access restricted during final verification.
12. NHS. [Shortness of breath](https://www.nhs.uk/symptoms/shortness-of-breath/). Current patient guidance; emergency breathing features. UK care pathways require localization.
13. American Heart Association. [Warning Signs of a Heart Attack](https://www.heart.org/en/health-topics/heart-attack/warning-signs-of-a-heart-attack). Last reviewed December 12, 2024. Prompt EMS activation.
14. Mastra. [Workflow control flow](https://mastra.ai/docs/workflows/control-flow). Current framework documentation; parallel-join behavior.
15. Mastra. [Streaming guide](https://mastra.ai/docs/guides/streaming). Current documentation, also inspected in installed `@mastra/core` 1.64.0 references.
16. Mastra. [Run.stream() reference](https://mastra.ai/reference/streaming/workflows/stream). Current workflow event and output interface.
17. Mastra. [Background tasks](https://mastra.ai/docs/harness/background-tasks). Current documentation; continuation, cancellation, stream aggregation, and resume caveats.
18. LangChain. [LangGraph JavaScript streaming](https://docs.langchain.com/oss/javascript/langgraph/streaming). Current framework documentation.
19. Anthropic. [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system). June 2025. Parallel research architecture; different workload from rapid clinical dialogue.
20. Anthropic. [Reducing latency](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-latency). Current API engineering guidance.
21. Anthropic. [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching). Current model-specific thresholds and usage accounting.
22. Anthropic. [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs). Current schema-compilation and caching behavior.
23. Anthropic. [Fast mode—research preview](https://platform.claude.com/docs/en/build-with-claude/fast-mode). Current eligibility and output-speed scope; not enabled in this study.
24. Mastra. [Tracing spans](https://mastra.ai/reference/observability/tracing/spans). Current child/event spans and export interfaces.
25. Counsel Health. [How Counsel leveraged HealthBench to assess emergency escalation](https://www.counselhealth.com/blog/how-counsel-leveraged-healthbench-to-assess-emergency-escalation). August 26, 2025; updated August 5, 2026. Emergency-evaluation cohort and exclusions.
26. Samir Khan, Catherine Chen, Michael Oberst, Alex Chouldechova / Abridge. [AI Evaluation at Abridge](https://tech.abridge.com/blog/ai-evaluation-at-abridge). August 17, 2026. Offline/online evaluation, blinded review, and calibrated judges.
