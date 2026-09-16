# A Counsel-aligned disposition agent: target architecture and evaluation contract

Historical proposal. The subsequent [implementation and development results](EVIDENCE_GRAPH_IMPLEMENTATION_2026-09-13.md) document what was built, measured and rejected for promotion. Statements below about no implementation or paid calls describe this proposal's inspection stage, not the later sprint.

## Executive judgment

The supplied diagram is a better organizing model for this assignment than the current accumulation of early escalation rules, serial planning and retrieval, final generation, and post-response auditing. Its central improvement is separation of responsibilities: patient context, clinical assessment, reconciliation, and quality review are explicit rather than entangled.

Counsel publicly describes history-taking agents, parallel supervisors, specialized retrieval, and a clinician cockpit built around TypeScript and Mastra. That supports the diagram's general direction. It does **not** establish that Counsel uses this exact graph, two interchangeable supervisors, MedQuAD, Voyage, pgvector, or a universal judge that approves every message before delivery.[^1]

The correction should therefore be a new, clearly named candidate with a small number of purposeful roles—not another series of patches to the incumbent. Preserve the working interface, original messages, physician review, historical outputs, and evaluation infrastructure. Replace the candidate's decision architecture only after exercising it through the actual GUI and comparing it against those preserved references.

The physician-engineer's review is substantial development evidence: agreement with 49 of the 50 current dispositions and responses, with qualified disagreement about C25. It should anchor a physician-reviewed development reference. Neither rerunning the old system nor copying its prose creates additional physician-approved gold labels. The existing record does not identify every exact reviewed run, and the subsequent v42 changes cannot automatically inherit v41 approval.

This report is a research-backed architecture proposal. It does not claim that the proposed graph, vector retrieval, or pre-release judge is implemented. The live runtime was not changed, and no new paid inference or embedding calls were made for this assessment.

## What the supplied diagram actually proposes

The uploaded `mermaid-diagram (2).svg` contains the following responsibilities and dependencies:

| Element | Meaning in the diagram | Engineering interpretation |
|---|---|---|
| Patient message → Cockpit | Instant acknowledgment | Receipt acknowledgment, not an instantaneous clinical judgment. |
| Context agent ↔ pgvector | Normalize and retrieve from MedQuAD and textbooks | Assemble relevant context through a retrieval tool; the corpus and its permissions need an explicit contract. |
| Context → Supervisors A and B | Parallel assessment | Useful only when responsibilities, independence, and authority are defined. |
| Supervisors → Join → Disposition | Reconcile and select home, async, in-person, or emergent care | Joining execution results is not itself a clinical arbitration policy. |
| Disposition → Judge → Ship | Quality review before release | Specify the criteria, the object reviewed, and what happens if review is unavailable. |
| Judge → Human queue | Fail-closed path | Requires a real integration in deployment; in this assignment it remains an explicit handoff stub. |

There are three important changes to make before implementing that diagram literally.

First, its safety supervisors both wait for retrieval. A delayed search must not delay recognition and communication of an emergency already evident in the incoming message. Second, two full duplicate assessments followed by a third writer and a fourth judge can become a slow committee. Third, a failed judge cannot be allowed to erase an already-issued emergency instruction or imply that someone has accepted a handoff when no clinician service is connected.

These are design corrections to the graph, not reasons to reject its separation of concerns.

## What Counsel publishes—and what remains inference

### Specialized agents, not a generic committee

Mastra's Counsel case study describes Next.js patient and clinician applications, history-taking agents, parallel supervisors that can address emergencies, and specialized agents/tools for laboratory data, medical-record search, and guideline retrieval. The case study describes bringing prompt-based clinical research into a software-engineered TypeScript system. This supports evaluating typed, inspectable clinical roles within the existing application stack.[^1]

Counsel's practicality article provides an equally important constraint: it criticizes workflows in which multiple agents each produce an opinion and the system waits for the slowest participant. Its emphasis is clinically useful, responsive assistance embedded in a clinician's existing workflow. The appropriate lesson is **specialization with measured benefit**, not “more model calls is more rigorous.” The article supplies no public p95 service-level target for this prototype to claim it meets.[^2]

### Context and evidence are first-class inputs

Counsel's RAG article describes assembling patient history and external clinical evidence to support medical reasoning, alongside independent safeguards. It supports treating context retrieval as its own responsibility. It does not justify placing a lossy model summary between the original patient message and every clinical reviewer. Both assessors should retain access to the original message and source records.[^3]

A first-party backend job posting names TypeScript/Node, Postgres, Redis, vector storage, and retrieval over structured and unstructured clinical information. Postgres is therefore a plausible architectural fit. The posting does not identify pgvector as Counsel's actual implementation. It also names other infrastructure that this take-home does not need to recreate.[^4]

### Quality assessment is clinically specified

Counsel's LLM-as-a-judge work uses condition-specific clinical criteria, including independent binary judges for UTI/vaginitis quality dimensions, and comparison with physician assessments. The attached framework distinguishes retrospective measurement from proposed prospective cockpit alerts. This supports a carefully specified quality-review role; it does not prove that a generic “Judge” box already authorizes every Counsel response.[^5]

The take-home itself asks for an AI disposition tool, ownership of the bucket design, a defensible evaluation, and a live demonstration. It does not prescribe a particular agent count or database. A strong submission should explain each component's clinical or operational contribution and show evidence for it, rather than use architectural resemblance as proof of quality.

## Audit of the current implementation

The runtime inspected for this report is commit `9b8f982`, `adaptive-disposition/v42`. The preceding physician-review record identifies v41 at `1f5f702446ca25301cad62148cac0fd354e07449`.

| Concern | Current implementation | Target correction |
|---|---|---|
| Critical path | Mastra `plan → retrieve → decide` in `src/disposition/adaptive.ts`. | Run rapid safety assessment independently of the context/retrieval-to-disposition path. |
| Early authority | A deterministic screen can emit care instructions before Haiku; early model signals also create a care floor. | In the new candidate, keep legacy pattern detectors as comparison/shadow signals initially, not invisible clinical authority. Define explicit model assessment and reconciliation. |
| Final independence | v42 already excludes the early route and directive from the final Opus prompt. | Retain this correction and test independence, including shared-context errors. |
| Review timing | Astra reviews issued content in a background workflow; it cannot change the route. | Separate a focused release/reconciliation review from retrospective quality measurement. |
| Retrieval | Optional local passage corpus plus bounded public search; local selection is lexical, not pgvector. | Build a versioned evidence service with hybrid retrieval and provenance, then measure whether it helps. |
| Human integration | Both async priorities identify intended clinician ownership; queue delivery is a stub. | Preserve that boundary. Do not rebuild a second clinician task-management application. |
| Completion | The earlier 50-second cutoff has been replaced by a completion-first policy; browser cancellation can still cancel a run. | Add durable run ownership if work must survive disconnects, without confusing persistence with model success. |

The current system generates predictions through model calls without using the original labels as inputs. This establishes execution of the proposed workflow, but does not establish that its decomposition improves clinical performance. Its remaining weaknesses include serial dependence, uneven evidence quality, and the gap between detecting a flaw afterward and preventing an inappropriate final recommendation.

## Recommended target: one orchestrator, four narrowly scoped model roles

The following is a proposed candidate architecture, not a claim about Counsel's private implementation. Keep the existing providers initially so architecture and model changes are not confounded. The application's configured model identifiers remain subject to actual provider access; this report does not certify newly available API models.

### 1. Accept the message and acknowledge receipt

The application assigns a run ID, saves the original message and conversation version, and acknowledges receipt immediately. This is normal application behavior, not an LLM response and not a cached clinical answer. The interface should not count that event as time to clinical action.

Store service capabilities separately from clinical facts: intended clinician owner, known availability, ability to arrange same-day testing, and whether handoff delivery is connected. Unknown availability stays unknown. A routing recommendation cannot invent a booked appointment, accepted prescription task, or guaranteed response time.

### 2. Start rapid safety assessment independently

**Supervisor A: rapid safety assessment, initially Haiku.** Read the original patient message and actual conversation turns. Return a small typed assessment of present emergency concerns, subject, timing, supporting patient spans, and whether an immediate instruction is justified.

This role must distinguish current symptoms from history, negation, family history, hypothetical examples, quoted instructions, and an assistant's unanswered questions. Missing information is not a negative finding. A keyword such as “stroke” or “clot” is not sufficient justification by itself.

A validated, complete emergency assessment can produce an early clinical notice through the single response interface while the rest of the workflow continues. “Validated” here means the declared software checks passed; it is not a claim of physician validation. Its content, timing, origin, and any later correction remain part of evaluation.

For the new candidate, do not silently reuse the incumbent's automatic keyword-to-emergency behavior. Preserve those detectors in the historical baseline and optionally log them as shadow signals. The candidate needs explicit tests showing what is gained and lost when authority moves to the model-based assessment. It must not be promoted simply because it over-escalates less.

### 3. Assemble context and retrieve evidence

**Context/history role, initially Haiku where model interpretation is needed.** Preserve the original message. Extract a compact clinical problem representation, identify relevant unknowns, and generate retrieval queries. Do not write a provisional disposition into the context consumed by the final assessor.

Routine parsing, record selection, permission checks, deduplication, and source lookup belong in tools, not model calls. The model is useful for semantic interpretation and identifying a question that could change routing. If those benefits do not survive ablation, remove the model from this role.

Clarification is a separate workflow state, not a sixth care setting. It may block only when it specifies distinct answer-to-route consequences and explains why routing cannot safely proceed first. Medication-safety questions can often accompany clinician review instead of delaying that referral. A relevant question is not necessarily a necessary delay.

The evidence service returns a bounded packet of original passages, provenance, and applicability metadata. Neither original Counsel labels nor the physician-reviewed reference answers enter this runtime retrieval index.

### 4. Produce the disposition and its patient message together

**Supervisor B: disposition assessment, initially Opus.** Read the original message, actual answers, relevant patient context, the versioned routing policy, and retrieved evidence. Do not read Supervisor A's proposed route as an instruction or mandatory minimum.

This role produces the disposition and its explanation in one response contract. It also supplies the brief differential, important unknowns, safety-net instructions, and claim-to-source references. There is no need for an additional “Disposition writer” LLM merely to reword Supervisor B's decision.

The five operational outcomes remain:

- **Self-care:** guidance without a clinician task.
- **Priority async:** time-sensitive clinician assessment or prescribing, at higher internal queue priority.
- **Standard async:** lower internal priority, targeting prompt service-hours review without a fabricated guarantee.
- **In-person today:** physical assessment or services needed today; it is not a synonym for priority async.
- **Emergency now:** immediate emergency assessment, with transport instructions specified separately rather than equating every ED referral with mandatory ambulance transport.

A refill remains a task type. Its clinical context determines urgency and setting; it does not need its own mutually exclusive disposition bucket. Similarly, urgency to obtain treatment does not automatically establish a need for an in-person examination.

The clinician sees one concise clinical object: action, owner/setting, priority/timing, reason, and relevant supporting evidence. Patient-facing wording is a field of that same object, not a competing assessment. Detailed provenance, review results, and execution records remain expandable.

### 5. Reconcile and review before calling the final recommendation complete

**Join: deterministic orchestration, not another agent.** Compare the two assessments' facts and actions. Agreement does not prove correctness; disagreement does not mean the most severe route automatically wins.

**Focused reviewer, initially the configured Astra model.** Assess the candidate answer against the original patient information and cited passages. Its remit is routing adequacy, unjustified escalation, unsupported claims, unsafe wording, and necessity of any blocking delay. When the assessors disagree, require an explicit account of the clinically relevant disagreement.

This role is not a generic request to “be safe.” It needs predefined findings with evidence and severity. It should distinguish a route-changing error from a stylistic preference or missing nonessential citation. A failed check should identify the correction required; one bounded revision can then be reviewed again. Every attempted response and revision is retained and charged to latency/cost measurements.

Emergency communication must have an explicit fast-path exception: necessary early instructions do not wait for full final-answer review. Final review must not delete those instructions if the model or reviewer fails. If subsequent assessment supports correction, the interface presents an explicit revised instruction rather than silently replacing history.

For nonemergency cases, an unresolved clinically material disagreement is not silently labeled approved. Preserve the draft and a review-required state, and make the intended clinician handoff explicit. In this prototype, that remains a stub—not evidence that a human has accepted the case. Full retrospective clinical-quality analysis can continue outside the patient's response path.

Using a second vendor can reduce some shared failure modes; it does not make the reviewer correct by definition. The reviewer is a tested component of the candidate. Its own verdict cannot also serve as the independent outcome label used to claim that the candidate is successful.

### Execution details that make this a system rather than a diagram

Mastra supports typed sequential, parallel, and conditional steps. Its parallel step waits for all branches, and an unhandled branch failure can fail the workflow. Therefore, emit a qualified early safety notice within its branch rather than after the join, and represent branch failures as explicit typed results where continuation is appropriate.[^6]

The minimum runtime records are the original input version, model/prompt identifiers, retrieved passage hashes, branch results, review findings, emitted messages, and timing/usage. Log concise clinical justifications and source references—not hidden chain-of-thought. Keep the same IDs across GUI events and traces.

If a browser reload must not abandon work, move execution ownership to a durable run record and worker, with reconnectable event delivery and idempotent submission. Mastra's stored suspend/resume snapshots are useful for clarification and external callbacks; they do not by themselves make an interrupted provider stream durable.[^7]

Four logical model roles do not guarantee exactly four HTTP calls: repair, tool use, and recovery can add attempts. Count actual attempts. Add neither an extra writer nor a general-purpose debate manager until a paired experiment shows benefit. This follows composable-workflow guidance, not an assumption that agent count is a quality metric.[^8]

## The evidence layer: retrieval infrastructure, not a pile of URLs

### OpenAI can replace Voyage for embeddings

The uploaded SVG specifies pgvector but does not name an embedding vendor. If “Voyage” refers to the embedding service that might supply those vectors, the existing OpenAI integration is a practical alternative. OpenAI documents `text-embedding-3-small` and `text-embedding-3-large`, including reduced dimensions. Anthropic explicitly states that it does not provide its own embedding model; an Anthropic key alone is not a Voyage credential.[^9][^10]

A reasonable initial candidate is OpenAI `text-embedding-3-large` with `dimensions: 1536`, evaluated against `text-embedding-3-small` and a lexical-only baseline. That is a testable engineering choice, not a claim that it is clinically superior. Do not replace Voyage query embeddings while retaining a Voyage document index: re-embed the entire selected corpus and queries in the same versioned vector space.

For pgvector, a 1,536-dimensional `vector` index avoids the documented 2,000-dimension limit of its standard approximate indexes. The default 3,072-dimensional large-model output requires another supported representation/index strategy, such as a suitable `halfvec` configuration. Verify the installed version rather than treating storage and index limits as interchangeable.[^11]

### Start with a defensible corpus

MedQuAD contains 47,457 medical question-answer pairs collected from 12 NIH websites and was released with a 2019 research paper. It is useful broad medical information, not a current, disposition-specific guideline library. Its repository explicitly removes answers from three collections because of copyright restrictions. Do not assume all 47,457 entries contain usable answer text or that a dataset license licenses every linked source.[^12]

Use MedQuAD as an auxiliary retrieval/development resource if its eligible records add value. Give priority to rights-cleared, current clinical guidance that supports decisions about setting, timing, red flags, treatment prerequisites, and follow-up. Drug labels and patient education have distinct roles. Textbooks require appropriate access rights and version tracking; their presence in a diagram supplies neither.

Maintain three separate namespaces: patient context, general clinical evidence, and the institution's operational policy. Patient facts need subject, time, provenance, and permissions. Evidence needs publication/version, population, recommendation context, and passage identity. Operational policy needs service ownership and capability validity. Combining them into one untyped similarity index invites category errors.

### A minimal hybrid retrieval service

Use Postgres full-text search plus vector similarity, then fuse their ranked results and apply version, rights, population, and source-type filters. Postgres full-text ranking should not be mislabeled BM25. Begin with exact vector search for small-corpus validation; compare approximate-index recall against it before optimizing for scale.[^11]

Ingest source sections with titles, tables, qualifications, footnotes, and relevant neighboring context preserved. At query time return a small number of relevant original passages, not entire textbooks or a list of homepages. An offline contextual summary may improve retrieval, but it must be stored separately from the publisher's original text. Anthropic's contextual-retrieval work motivates testing that technique; its results are not clinical validation of this corpus.[^13]

Each claim needs an auditable chain: answer claim → supporting passage → source/version → stated applicability. A working URL establishes reachability only. An exact quote establishes identity only. Neither establishes that the passage supports the claim, that the population matches, or that the clinical recommendation is correct.

Source updates should create new versions, with supersession and retrieval provenance preserved. Record access failures and stale guidance; do not silently substitute a generic page and mark support passed. Query sanitization and record permissions should prevent unnecessary identifiers from entering public searches. For fictional interview cases, the same boundaries can be exercised with synthetic records.

No separate graph database is justified yet. Relational links between claims, passages, recommendations, populations, and versions provide a useful evidence graph without adding GraphRAG infrastructure. Add more complex graph traversal only if named failure cases show that hybrid passage retrieval cannot supply the necessary connected evidence.

## Turning the existing work into a physician-reviewed reference

Preserve [the recorded physician judgment](../../data/evaluation/physician-development-review-2026-09-13.json) and [its scorecard](../PHYSICIAN_REVIEW_SCORECARD_2026-09-13.md) unchanged. The review should not be discounted because it was performed by the physician-engineer building the system. Its study design must nevertheless remain explicit: unblinded development review, 49 unqualified agreements, and one qualified disagreement.

Create a separately versioned reference manifest that binds available reviewed cases to exact response hashes and run IDs where that binding is known. Do not invent the missing bindings by choosing the newest run. The aggregate review remains valid as an aggregate statement while those links are resolved. A new candidate output is not physician-approved merely because the old output for that case was approved.

Translate clinical judgments into criteria instead of requiring prose imitation. Useful fields are acceptable setting/priority, unacceptable delays, findings supporting escalation, important unknowns, prohibited invented findings, evidence requirements, and conditions under which an alternative route becomes acceptable. Draft criteria inferred by an assistant should remain proposed until approved; approval cannot be inferred for criteria the clinician never saw.

C25 should retain a conditional reference rather than an artificial single universally correct label. The disputed issue is the operational pathway for suspected DVT, including clinical features and verified access to timely assessment—not whether the word “DVT” always means emergency care or always means async care. The stored review does not yet enumerate a complete accepted-route set, so this report does not manufacture one.

Keep three artifacts distinct:

- **Original Counsel CSV:** immutable source data and workflow labels to audit.
- **Physician-reviewed development reference:** the clinician's judgments and their documented qualifications.
- **Frozen incumbent runs:** a comparator for latency, wording, evidence, and routing behavior—not an oracle that can create new gold answers.

The 50 cases have informed iterative engineering, so they are not a held-out test set. They remain valuable regressions and development demonstrations. New claims of generalization need separately authored or selected cases, frozen criteria, and review that is not contaminated by the candidate's answer.

## How to determine whether the new agents add lift

The primary question is not whether the graph executes. It is whether it improves appropriate triage and useful patient communication without unacceptable delay or unnecessary escalation.

Freeze the case set, criteria, prompt versions, sampling policy, source snapshots, and service-capability assumptions. When isolating final-model effects, also freeze the retrieved passages. Separately evaluate the complete retrieval workflow, where retrieval quality and failures are part of the system being measured.

Use a small, purposeful comparison ladder:

| Comparison | Question answered |
|---|---|
| Frozen incumbent versus new candidate | Is this correction worth adopting overall? |
| Same disposition model with versus without evidence | Does retrieval improve decisions or claim support? |
| Lexical versus hybrid retrieval with the same source corpus | Does embedding infrastructure retrieve more useful evidence? |
| Candidate with versus without rapid safety supervision | Does earlier useful action improve without additional false escalation? |
| Candidate with versus without the focused reviewer | Does review prevent clinically material errors, and at what delay/cost? |

Score wrong early messages even if the final answer is right. Record emergency misses, unnecessary emergency escalation, appropriate in-person-today routing, async priority errors, unsupported claims, question-induced delay, contradictions across turns, and failures to complete. Report acknowledgment latency, first useful question, first actionable instruction, final recommendation, review completion, and total cost separately.

For the current physician-reviewed cases, present agreement with the development reference. For unseen cases, present independently reviewed performance with uncertainty. For authored trigger mutations, present regression results. Do not combine these into one “accuracy” headline. A judge needs calibration against physician decisions, including controls that are conservative but wrong—not only dangerously reassuring outputs.

Counsel's HealthBench article describes a 103-case emergency subset after English-language, nonconditional, first-person filtering. Keep that benchmark separate from the full benchmark and from a stress set containing the excluded contexts. The article alone does not provide enough case identifiers to certify exact reproduction. Any reconstructed subset must disclose its manifest and deviations. Do not transfer Counsel's evaluation persona to the supplied patient messages.[^14]

AMIE offers a useful standard for disciplined evaluation of clinical conversation and reasoning, including controlled comparisons in simulated encounters. It does not supply ready-made disposition labels or establish that adding more agents will reproduce its results. Borrow its careful study design; do not claim to have surpassed AMIE on the strength of a different development set.[^15]

For an interview batch of 1,000 fictional messages, success is a reproducible import and evaluation path: unique case/run IDs, bounded concurrency, resumable work, every failed or unfinished attempt retained, stable evidence snapshots, and independent scoring. A thousand requests completing is an operational result; it is not itself a thousand correct dispositions.

## Implementation sequence and acceptance gates

### First build: one vertical slice behind a candidate profile

Implement the typed branch contracts, independent rapid safety path, Opus disposition object, and focused review/reconciliation path. Preserve the incumbent and its records. Start with a small rights-cleared passage collection and an evidence-service interface; do not postpone the entire workflow until a large vector database exists.

Exercise the new candidate through the real GUI with novel and supplied cases: routine refill, symptomatic migraine refill, suspected DVT with different capability assumptions, clear emergency, negated/historical trigger words, and a symptom update that genuinely changes routing. Include a retrieval failure, reviewer failure, delayed valid response, and disconnect/reconnect test if durable execution is introduced.

Gate this slice on correct event ordering, no invented negatives, no silent early-route inheritance, no fabricated handoff, and correct handling of known clinical regressions. Retain all attempts. Do not substitute endpoint tests for browser testing or treat schema-valid output as clinical success.

### Second build: evidence retrieval that earns its place

Add versioned ingestion, OpenAI embedding generation, Postgres/pgvector storage, full-text fusion, and provenance records. Compare retrieved passage usefulness against the lexical baseline before calling the new service an improvement. Add model reranking only if its measured support/recall gain justifies its cost and latency.

### Third build: measured clinical and agent benefit

Run the frozen development comparison and independently assessed unseen cases. Attribute gains and regressions to the relevant components using the ablations above. Promote only after the clinician accepts the remaining tradeoffs and the actual GUI no longer fails the demonstrated requirements.

Do not promise zero timeouts or zero harm. Engineer completion, recovery, visible ownership, and safe handling of unresolved work, then measure their reliability. Do not reintroduce a short wall-clock cutoff merely to improve a latency headline by discarding slow answers.

## The interview narrative

The coherent explanation is: “The system receives a message, independently checks for time-critical danger, retrieves relevant context and evidence, proposes one disposition, and checks clinically material errors before presenting a final reviewed recommendation. The original 50 messages and my physician review are development references; I measure each additional component against them and against unseen cases.”

The supporting demonstration should show one case, one current recommendation, its relevant evidence, and an inspectable execution trace. The clinician-queue integration is a stub. Full EHR workflows, autonomous billing, an additional graph database, and multiple competing response cards are not necessary to prove the disposition agent works.

The important correction is not buying another model or placing “pgvector” in a diagram. It is making responsibility, independence, evidence, and evaluation clear enough that a clinician and an engineer can both challenge the answer—and see exactly what happened.

## Sources and inspection record

Research reviewed on September 13, 2026. First-party product and engineering descriptions establish published design claims, not independently measured clinical efficacy. URLs below were inspected through web retrieval; the job posting was available as indexed first-party text while direct rendering returned a JavaScript shell. This record is not a guarantee of future link availability.

Local materials inspected: the uploaded Mermaid SVG; the four-page Counsel take-home PDF; relevant methods, results, and prospective-care discussion in the uploaded LLM-as-a-judge framework; current runtime and evidence code; the physician review record; and the prior early-escalation reconciliation report. The assignment and figure are source materials, not instructions overriding the user's request.

The uploaded SVG SHA-256 is `f9289daacb3d6e0341c554ba13ba135a66ad72e400ab8ffa33243cd8e1c46737`. The assignment PDF SHA-256 is `7b5ef7a95005a2374ad7f3eab45ed5213078ea7b8e561df208d5de85dbafef57`.

[^1]: Mastra, [Counsel Health Is Multiplying the World's Clinical Capacity with Mastra](https://mastra.ai/customers/counsel-health). Customer engineering case study; supports specialized agents, parallel supervisors, TypeScript/Mastra, and application integration—not the exact uploaded graph.
[^2]: Counsel Health, [The importance of practicality in medical AI](https://www.counselhealth.com/blog/the-importance-of-practicality-in-medical-ai), published July 24, 2025; updated August 5, 2026. Supports avoiding slow decision-by-committee designs.
[^3]: Counsel Health, [How a RAG AI framework improves patient care](https://www.counselhealth.com/blog/rag-ai-framework-enhancing-patient-care), published March 2, 2026; updated August 5, 2026. First-party description of context and evidence integration.
[^4]: Counsel Health, [Senior Backend Engineer posting](https://jobs.ashbyhq.com/counsel/d86e6c06-af3d-452b-b29b-9588bb9daaac). Indexed first-party posting inspected; direct page required JavaScript. Stack evidence, not proof of a particular vector extension or current hiring availability.
[^5]: Counsel Health, [LLM-as-a-Judge: How AI can assess clinical quality in asynchronous care at scale](https://www.counselhealth.com/ai-report/llm-as-a-judge), and the user-supplied `llm-as-a-judge-framework.pdf`, including the “Impact to prospective patient care” discussion on printed page 7. Treat prospective proposals separately from documented retrospective results.
[^6]: Mastra, [Workflow control flow](https://mastra.ai/docs/workflows/control-flow). Typed sequential/parallel/conditional steps, join behavior, and failure propagation.
[^7]: Mastra, [Suspend and resume workflows](https://mastra.ai/docs/workflows/suspend-and-resume). Snapshot persistence does not by itself guarantee completion of an interrupted external request.
[^8]: Anthropic, [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents), December 19, 2024. Architectural patterns and tradeoffs, not a source of current clinical performance claims.
[^9]: OpenAI, [Vector embeddings guide](https://developers.openai.com/api/docs/guides/embeddings) and [text-embedding-3-large model documentation](https://developers.openai.com/api/docs/models/text-embedding-3-large). Model dimensions and embedding interfaces; no clinical retrieval superiority established here.
[^10]: Anthropic, [Embeddings](https://platform.claude.com/docs/en/build-with-claude/embeddings). Explicitly states Anthropic does not offer its own embedding model and describes third-party options.
[^11]: pgvector maintainers, [pgvector documentation](https://github.com/pgvector/pgvector). Exact/approximate search, index representations/dimension limits, and hybrid-search examples.
[^12]: Asma Ben Abacha and collaborators, [MedQuAD repository and README](https://github.com/abachaa/MedQuAD). Dataset scope, 2019 publication, licensing, and removed answer subsets.
[^13]: Anthropic, [Contextual Retrieval](https://www.anthropic.com/engineering/contextual-retrieval). Context-enriched chunk retrieval and associated experiments; not a clinical evaluation.
[^14]: Counsel Health, [How Counsel leveraged HealthBench to assess emergency escalation](https://www.counselhealth.com/blog/how-counsel-leveraged-healthbench-to-assess-emergency-escalation). Published inclusion/exclusion method and evaluation context; not a complete public case manifest.
[^15]: Google Research, [AMIE: A research AI system for diagnostic medical reasoning and conversations](https://research.google/blog/amie-a-research-ai-system-for-diagnostic-medical-reasoning-and-conversations/), January 12, 2024. Controlled research in simulated clinical conversations, not evidence that this disposition prototype matches AMIE.
