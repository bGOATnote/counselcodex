# Evidence engineering: useful structure, measured lift

Research and implementation review · 11 September 2026

## Decision

Build a **versioned evidence library and exact-response audit**, before adding a
graph database or another patient-path model. The clinical product remains one
message → one disposition and patient reply, with early emergency action.

This revision implements a small provenance graph, scoped lexical retrieval,
source/excerpt integrity checks, and a retrospective claim-grading interface.
It does **not** establish clinical efficacy, complete evidence coverage, or
non-inferior model answers. No paid provider experiments were run in this revision.
The changed retrieval context therefore remains a research/demo candidate.

## What Counsel actually publishes

The [Mastra case study](https://mastra.ai/customers/counsel-health) describes
history-taking workflows, parallel supervisory agents watching for emergencies,
task-specific agents, a custom clinical-guideline RAG tool, and medical-record
search. It also describes TypeScript, Next.js, Studio-based iteration and
Kubernetes in a private cloud. That supports using explicit workflows and
traceable retrieval—not inventing Counsel's private implementation.

Counsel's [engineering job posting](https://jobs.ashbyhq.com/counsel/03060ca5-2775-40ed-b673-3c083e74e005)
lists TypeScript/React, Next.js, Postgres/Supabase, Tailwind and AWS, and emphasizes
simplicity. It does not say that guideline retrieval uses Postgres, pgvector,
Neo4j, a particular embedding model, or a particular number of calls per message.
Those would be **our architectural choices**, not discoveries about Counsel.

**Inference:** a shared typed evidence service with separate online and offline
workflows fits the published stack. Copying infrastructure without measuring its
effect would not demonstrate clinical engineering judgment.

## Three different meanings of “graph”

| Structure | Question it answers | Decision here |
|---|---|---|
| Mastra workflow graph | What executes concurrently, what waits, what survives failure? | Keep the existing bounded intake/disposition workflow. |
| Evidence provenance graph | Which source, excerpt and interpretation underlie this claim? What changed? | Implement now as typed records and explicit edges. |
| LLM-extracted knowledge graph / GraphRAG | How are entities and corpus-wide themes connected? | Defer pending a task-specific ablation. |
| HNSW vector index | Which vectors are approximately nearest? | An index optimization, not medical knowledge or proof. |

The [GraphRAG paper](https://arxiv.org/abs/2404.16130) studies global
query-focused summarization over large corpora. Its generated entity graphs and
community summaries are not evidence that graph extraction improves short-message
clinical routing. Microsoft's [query documentation](https://microsoft.github.io/graphrag/query/overview/)
also distinguishes local entity retrieval from global community-summary queries.
Our dominant question is narrower: “what evidence supports this action, timing
and population?” An invented edge can be as dangerous as an invented citation.

The implemented graph has source, passage and recommendation nodes. Its edges
mean “excerpt of,” “attributed to,” or **“inspection anchor, not full entailment.”**
There is deliberately no inferred “proves safe” edge. Exact answer units and
their proposed passage links are recorded in the claim packet, separately from
the source graph.

## Implemented library and retrieval

The review catalog and live responder now share bibliographic records. There are
**55 source records, 53 distinct URLs, 15 runtime notes and five short inspected
excerpts**. Stable legacy IDs remain for historical citations; duplicate URLs are
not counted as independent evidence. The 44-entry review catalog is unchanged in
content. Its case-specific briefs do not enter the clinical prompt.

Ten existing summaries remain explicitly `legacy_summary`. Five newly inspected
notes cover adult thunderclap headache, DKA warning features, meningococcal symptoms,
anaphylaxis and suicide assessment. None has been represented as physician-approved.
Short excerpts establish an inspectable anchor, **not support for every sentence
of the associated summary**. The broader library remains substantially incomplete.

Each returned record contains a library hash, recommendation hash, source ID,
review window, population metadata, exact excerpts and their hashes, limitations,
and a content-binding hash. Changing the URL, summary, excerpt or metadata
invalidates the returned record's integrity check. These hashes detect changed
content; they are not digital signatures or a defense against a malicious
maintainer who rewrites and rehashes everything.

The active retriever:

1. Uses message content, never case IDs or original disposition labels.
2. Applies limited topic/negation and explicit-population filters, then BM25
   lexical ranking with bounded concept aliases.
3. Excludes withdrawn, expired or future-reviewed notes. Unknown age does not
   silently become adult; applicability remains unresolved.
4. Returns bounded candidates or an explicit no-candidate result, plus exclusion
   reasons, ranking scores, version hashes and local timing.

This is **not** an LLM history extractor, comprehensive medical ontology or dense
semantic search. Scope rules can miss paraphrases and mishandle subject/time.
They must not supply negative clinical findings or decide a disposition.
Retrieval failure never cancels an emergency instruction.

Only useful source text and limitations enter the clinical prompt. Execution
hashes stay in the run artifact. Retrieval adds **zero external calls**. The
existing emergency fast path still runs Opus for its explanation and skips an
unnecessary intake question. We did not add a third online judge.

## Source verification: what each result means

The maintenance command accepts only the checked-in publisher registry, uses
credential-free public GETs, validates redirects, limits bytes/time, records
content hashes, and writes a new report rather than overwriting history.
For the five excerpt-backed entries it checks document identity and exact
normalized excerpt presence, and binds the expected content in the receipt.
PDF reachability is not PDF text verification.

The [final public check](research/link-checks/2026-09-11T03-52-03.429Z-9cb8d25585eb.json) found **44 reachable HTML records, three reachable PDFs, and
eight access-blocked records**. All five stored excerpts matched. The earlier
sandbox-denied attempt is also retained. Reports live in
[research/link-checks](research/link-checks/). No blocked source became verified.

The NHS anaphylaxis page itself shows a next-review date of June 2026, already
past at this inspection. Its overdue publisher review is recorded in the source
and returned limitations. A new local inspection date does not repair that.
For production, a clinical owner must decide whether to refresh, replace or
withdraw such content; the present notes are not a production-approved corpus.
[NHS source](https://www.nhs.uk/conditions/anaphylaxis/)

An ideal maintenance process would retain licensed source versions, jurisdiction,
population, strength of recommendation, supersession links and reviewer sign-off.
Source changes should create new versions, identify affected recommendations and
answers, and trigger targeted re-evaluation. Our graph represents dependencies;
automated change monitoring, historical answer invalidation and content approval
workflows are **not implemented**. Live web search per patient is not the default:
it introduces latency, unstable results and another untrusted-input boundary.

## Claim-level evaluation of the actual response

`src/evidence/claims.ts` enumerates answer units before judging: disposition,
patient reply, explanation, differential, red flags, vital-sign statements,
questions, citations and **earlier visible response events**. This prevents a
good final paragraph from concealing an unsafe early instruction.

The packet binds original input, exact output, original retrieved evidence,
evaluation date, model and trace/run identifiers. A later library is never
silently substituted into a historical answer. Every unit must be returned
exactly once. Each proposed grade distinguishes:

- Source entailment: supported, unsupported, contradicted or not assessed.
- Patient grounding: exact original quotation, not an invented finding.
- Applicability: applicable, inapplicable, unknown or not applicable.
- Clinical inference: our reasoning, not a claim made by a publisher.

The server rejects changed packets, omitted/duplicate units and same-vendor
“independent” grading. Invented quotes, missing passages and unsupported
grounding cannot pass. A contradiction creates a failed evidence audit without
rewriting the clinical output or suppressing its emergency instruction.

The Mastra judge adapter has no tools, bounded output/time, no retries, redacted
trace payloads and a mandatory budget-reservation callback. It constructs the
agent from the recorded model, rather than accepting a model label attached to
some other agent. Injected test runs are labeled simulated. An imported judgment
is labeled unattested. Even an all-supported judge result is
`supported_by_judge`, **not clinical approval**.

This adapter was tested with injected outputs, not paid provider calls. Its
semantic sensitivity, specificity and calibration are unmeasured. Sentence/field
segmentation is imperfect; a unit can contain several claims, all of which must
be supported. The current short excerpts will legitimately leave many claims
unassessed. This is an executable evaluation protocol, not a calibrated grader.

Before admitting automated grades: construct a blinded set of valid claims,
plausible false claims, wrong-population citations, timing distortions, missing
qualifiers, unsupported statistics and prompt injections. Compare judgments with
physician decisions, especially false acceptance of harmful claims. Report
abstentions and uncertainty, not just agreement. Cross-vendor judging reduces
one source of dependence; it does not create an independent clinical reference.

## Measured ablation, including failures

The new harness exercises the **actual active evidence path**, not the older
sparse-vector research benchmark. It freezes the previous keyword implementation
and compares both corpus size and retrieval method.

[Final retrieval artifact](../outputs/evidence-audits/2026-09-11T03-51-14.997Z-ba0e76103954.json)
contains all 24 development sentinels, their source-relevance expectations,
code/input/library hashes, per-case outcomes, and 480 local timing samples per
configuration. Earlier failed runs remain alongside it.

| Configuration | Macro recall@5 | Precision among returned sets | Explicitly forbidden hits | Failed abstentions |
|---|---:|---:|---:|---:|
| Previous keyword rules, 10 notes | 41.2% | 50.0% | 3 | 4 |
| Scoped lexical, same 10 notes | 52.9% | 90.0% | 0 | 1 |
| Unscoped lexical, 15 notes | 88.2% | 34.1% | 4 | 7 |
| Scoped lexical, 15 notes | 82.4% | 93.3% | 0 | 1 |

Recall averages the 17 cases with relevant-source annotations; precision averages
nonempty retrievals. Seven expected-abstention cases are reported separately.
These are development annotations, not exhaustive relevance judgments. The
forbidden-hit metric counts only explicitly forbidden IDs; it is not all possible
irrelevance. Recall@5 measures the fraction of the relevant set retrieved, not
merely whether one relevant result appeared.

Four sentinels still fail: a cardiac euphemism, a stroke paraphrase, a
meningococcal paraphrase, and irrelevant family-history stroke context. They are
kept in the report. No held-out or clinical-lift claim is justified.

For Counsel's original 50 messages, any-candidate coverage changed from **14 to
17 cases**; **33 still have no candidate**. Only nine retrieve an inspected
excerpt. Dropping previously irrelevant matches is useful but must not be
marketed as worse or better clinical coverage by simple counts. The scoped
15-note retriever's local p95 was approximately **0.073 ms** on this machine.
That does not measure model latency, first useful reply or answer accuracy.
The maximum source-context payload across these inputs was 1,735 bytes.

Red-team fixes during implementation included cross-clause cardiac matching,
negation of “without me” in suicidal language, mixed animal/human context,
altered evidence records and metadata leaking into model prompts. A production
build also exposed server hashing code entering the browser; that boundary was
fixed. Test success is software behavior, not evidence of zero clinical harm.

## If another 50 cases arrive

Freeze code, source snapshot, prompts and outcome definitions **before** looking
at the new answers. Run `npm run evidence:audit -- /path/to/new-messages.csv`
for a label-free coverage report. It validates unique IDs and bounded messages;
no external calls, labels or prewritten case answers influence retrieval.

Then separate the experiment into two questions:

1. Can the retriever find applicable supporting passages and abstain from
   irrelevant ones? Label required evidence and important forbidden contexts.
2. Does that evidence improve the exact disposition and visible response?
   Compare identical messages across no-retrieval, current retrieval and proposed
   retrieval, preserving early events, failures, cost and latency.

Use original labels as audit targets, not truth. Measure emergency-now sensitivity,
same-day/async under-triage, over-escalation, unsupported reassurance, evidence
entailment/applicability, follow-up clarity and subgroup failures. Report raw
counts and intervals, failed/incomplete runs, and worst-of-repeated-trial failures.
Zero observed emergency misses in a small sample is not zero risk. Do not optimize
against the new 50 and then call them held out.

Counsel's [HealthBench analysis](https://www.counselhealth.com/blog/how-counsel-leveraged-healthbench-to-assess-emergency-escalation)
uses a filtered emergency-escalation subset: 453 candidate conversations become
433 after language filtering, 261 after conditional exclusions, then 103 after
secondhand exclusions. A comparable reproduction must keep those decisions and
reference construction explicit. A separate broad-scope challenge set must retain
children, pregnancy, conditional situations, third-person reports and incomplete
vitals. Matching the published filter is not sufficient for general triage safety.

Next content work should prioritize **high-risk uncovered presentations**, not
make the candidate count reach 50/50. Upgrade the ten old summaries into versioned
passages, obtain adequate licensed context, resolve applicable populations and
currency, then evaluate semantic retrieval on genuinely unseen language.

## Most efficient plausible production design

**Recommendation, not a claim about Counsel's private system:** use Postgres as
the system of record when multi-user curation, concurrency, recovery and query
scale justify it. Store source versions, passages, recommendations, applicability,
review events and typed edge records with foreign keys. Keep clinical case data
separate from the public evidence index. Do not append an entire EHR to a prompt.

Start with Postgres full-text search plus, if it wins an ablation, pgvector
embeddings and reciprocal-rank fusion. Native Postgres text ranking is not
automatically BM25. At this corpus size exact vector search is simpler than
approximate indexing. HNSW becomes an option only when measured scale requires
it; evaluate recall under population/version filters, not just unfiltered speed.
[pgvector documentation](https://github.com/pgvector/pgvector)

[Anthropic's contextual-retrieval experiments](https://www.anthropic.com/engineering/contextual-retrieval)
support testing offline chunk context, lexical-plus-embedding retrieval and
reranking. They report improvements on their general retrieval tasks, not
clinical-disposition safety. Any model-generated context must remain distinguishable
from the original passage. Do not allow a generated chunk introduction to invent
a guideline recommendation.

[Mastra retrieval APIs](https://mastra.ai/reference/rag/retrieval) offer metadata
filters and reranking. [Mastra Experiments](https://mastra.ai/blog/mastra-experiments)
provides an appropriate dataset/target/scorer workflow for comparisons. Reuse
these interfaces where useful; do not upgrade packages or deploy services merely
to list them in the stack. This implementation stays on the repository's pinned
Mastra versions.

| Component | Required benefit before adding or retaining it |
|---|---|
| Fast intake model | Earlier useful action/question without unsafe reassurance; cancel obsolete work. |
| Opus disposition agent | One clinically coherent action, timing and reply; compare against simpler baselines. |
| Evidence records and integrity | Replayable sources, detectable changes, honest unassessed status. Implemented. |
| Dense retrieval / reranker | Better relevant-passage recall and fewer harmful mismatches on frozen inputs, within latency budget. Not measured yet. |
| Independent claim judge | Detect harmful false support with acceptable false acceptance/abstention; calibration required. |
| Graph database / global GraphRAG | Material cross-document reasoning benefit beyond relational joins. Not established. |
| Kubernetes | Operational scaling/isolation/recovery need, not higher clinical correctness. Unnecessary for this local take-home. |

For a hosted system, the evidence-maintenance worker and retrospective judges
belong off the patient latency path. Durable task queues, idempotent updates,
review permissions and observable failure recovery matter more than agent count.
Deployment must separately establish security, clinical governance and regulatory
requirements; architectural similarity is not authorization.

## Using Codex/Astra well

The current [Astra guidance](https://developers.openai.com/api/docs/guides/latest-model)
describes `gpt-6-astra`, higher reasoning settings and updated agentic capabilities.
Its recommendation to re-examine instruction files matters here: this repository
now has its own short `AGENTS.md`, rather than inheriting irrelevant Python
benchmark commands. Extra-high reasoning is useful for architecture, adversarial
tests and cross-file review; it is not a reason to increase every patient-call
latency or claim clinical competence.

[Codex best practices](https://learn.chatgpt.com/guides/best-practices) informed
explicit acceptance criteria, bounded changes, repository context and verification.
Official [agent safety guidance](https://developers.openai.com/api/docs/guides/agent-builder-safety)
informed untrusted-data separation, structured boundaries and trace-based
evaluation. No OpenAI research or safety team reviewed or approved this repository.
Forum anecdotes were not used as evidence of clinical or performance properties.

The present engineering benefit is inspectability: every new component has a
stated purpose, a testable contract and a failure mode. Evaluation must retain
observed failures and limit conclusions to the evidence collected.

## Commands and acceptance record

```bash
npm run evidence:test                 # no provider calls
npm run evidence:audit                # original 50 + development sentinels
npm run evidence:audit -- new.csv     # arbitrary next batch, no labels used
npm run evidence:links                # public publisher GETs, no patient input
npm run evidence:claims -- run.json   # exact-run packet, includes earlier events
npm run evidence:claims -- run.json judge.json openai/gpt-6-astra
```

Claim packets are private local artifacts under
`apps/evaluation/.local/evidence-claims`; console output contains hashes/counts,
not clinical text. Importing a judge file does not attest its origin. Live judging
requires the explicit adapter and an approved, persistent budget reservation.
Existing budget allocations must be reconciled before further paid work.

Verification: **276 software tests passed**, including 20 evidence-specific tests
and 94 review/UI tests. TypeScript, JavaScript syntax lint, Next production build
and Mastra build passed. The first Mastra dependency-install attempt failed
because sandbox DNS was blocked; the network-enabled retry completed. The
packet-export CLI was also exercised against an injected-model workflow run:
14 units, no provider calls, clinical correctness explicitly not assessed.
Original CSV SHA-256 remains
`d17771ed706c6866d2b13f2d7f5344824acf51aaf281b8af6368637586d71a15`.
Saved physician reviews and historical experiment outputs were not rewritten.

### Clinical sources inspected for this revision

Each is linked directly in the runtime library and link-check receipts:

- [AFP adult acute headache, 2022](https://www.aafp.org/afp/2022/0900/acute-headache-adults)
- [CDC diabetic ketoacidosis](https://www.cdc.gov/diabetes/about/diabetic-ketoacidosis.html)
- [CDC meningococcal symptoms, 2026](https://www.cdc.gov/meningococcal/symptoms/)
- [NHS anaphylaxis; overdue publisher review noted above](https://www.nhs.uk/conditions/anaphylaxis/)
- [AFP suicide assessment, 2021](https://www.aafp.org/afp/2021/0401/p417)

The engineering sources are linked next to the supported claims above. Public
pages and living documentation were inspected on 11 September 2026. Access and
version limitations are retained rather than replaced with claims of exhaustive
or current clinical authority.
