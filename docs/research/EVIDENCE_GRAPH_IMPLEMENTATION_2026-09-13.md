# Evidence-first disposition candidate: implementation, research and development evidence

September 13, 2026. This report accompanies `/candidate`; it does not replace the incumbent at `/` or transfer the physician's earlier approval to new outputs.

## Decision

Built a real Mastra/TypeScript candidate with an independent rapid safety assessment, context-driven hybrid retrieval, Opus disposition and Astra review. There is no keyword-to-route shortcut, lookup of the 50 answers, or cached clinical response in this candidate. It uses the original message rather than an upstream model's summary as its clinical source of truth.

The evidence layer is substantially more reproducible than the earlier collection of links. That is an engineering improvement, **not established clinical lift**. Live GUI testing exposed slow serial revision cycles, early over-escalation and inconsistent claim grading. The candidate is deliberately opt-in and is not presentation-ready as a replacement. The accompanying immutable export retains unsuccessful attempts as well as completed ones.

## What the industry evidence actually supports

Counsel's published implementation uses specialized agents, parallel supervision and a TypeScript/Mastra application. Its practicality article also warns against waiting for a committee of models. The architectural lesson is to separate necessary responsibilities and measure them, not reproduce every box in a diagram. This candidate is our interpretation, not a claim about Counsel's private production graph. [Mastra case study](https://mastra.ai/customers/counsel-health), [Counsel on practicality](https://www.counselhealth.com/blog/the-importance-of-practicality-in-medical-ai).

Baseten reports reducing OpenEvidence's inference latency from over 700 ms to 160 ms, with optimized embedding serving, its performance client and capacity infrastructure. This does **not** establish that clinical graph nodes caused the improvement, or that a complete sourced medical answer takes 160 ms. Baseten's execution graph and a medical knowledge graph are different things. Our measured generation/review calls dominate local retrieval; reducing a subsecond search will not eliminate a minute-long revision cycle. [Baseten/OpenEvidence](https://www.baseten.co/resources/customers/openevidence-delivers-instant-medical-information-with-baseten/), [Baseten RAG execution chains](https://docs.baseten.co/examples/chains-build-rag).

Counsel's clinical quality work supports explicit, physician-referenced criteria and evaluation of actual responses. It does not establish that one general-purpose judge authorizes every production message. AMIE is an important research model for conversational reasoning, but its controlled simulated-conversation results cannot be borrowed as evidence for this router. [Counsel LLM-as-a-judge](https://www.counselhealth.com/ai-report/llm-as-a-judge), [AMIE](https://research.google/blog/amie-a-research-ai-system-for-diagnostic-medical-reasoning-and-conversations/).

For this assignment, the highest-value output is a defensible care setting, timing/priority, intended owner and brief explanation with applicable evidence. Full autonomous prescribing, billing, a second clinician-queue application or a new graph database is not necessary. HHS describes telehealth across triage, ED collaboration and follow-up, while explicitly retaining in-person care. An async route must depend on the services actually available, not an imagined ultrasound order or accepted clinician handoff. [HHS emergency telehealth](https://telehealth.hhs.gov/providers/best-practice-guides/telehealth-for-emergency-departments/getting-started).

## Implemented execution graph

```text
Original patient message + run identity
  ├─ Haiku: rapid safety → typed action → early instruction, if justified
  └─ Haiku: facts + 1–3 concept queries + optional nonblocking question
          → evidence tool: PostgreSQL full-text + pgvector + provenance
          → Opus: independent disposition and concise clinical response
       join → Astra: current draft, issued question, sources, separate early-action audit
            ├─ accepted → release response; record any justified care correction
            ├─ repairable → one retrieval repair + Opus revision + Astra review
            └─ unresolved/failed → clinician-review-required outcome
```

Four model calls on the normal path; six with one revision. One actual failed initial Opus generation may be retried, with both attempts logged. A valid slow request is not duplicated just because it is slow. The inherited 600-second request bound is an operational resource boundary, not clinical evidence that a 100-second answer should be abandoned. HTTP keepalives and durable emitted-event records are separate from response generation. A browser disconnect still cancels this candidate: resumable worker ownership is not implemented.

The early action is chosen by Haiku from the patient message. A deterministic renderer expresses its typed destination/timing; it does not choose a clinical route from words such as “stroke.” Raw unissued Haiku prose remains available for audit but cannot introduce extra procedures or contradictory transport instructions. Exact quoted spans and subject/time flags are checked; these checks are not semantic proof that the model interpreted the quote correctly.

Opus initially receives no early route. Original patient statements remain available to both assessors and the judge. Retrieved sources, prior assistant questions and model-generated context are untrusted data, not instructions or patient findings. No original disposition, case identifier or physician-review answer is embedded in the corpus.

The five operational routes remain self-care, standard async, priority async, in-person today and emergency now; ED versus EMS transport is specified separately. Both async priorities identify intended Counsel clinician ownership without inventing acceptance, staffing or delivery. Medication refill is a task type, not an automatic care setting. A technical judge failure routes toward clinician assessment, not fabricated emergency physiology. If an emergency instruction has already been issued, failure does not silently erase it.

## Evidence layer and source rights

Frozen corpus: **1,391 documents; 5,209 exact-offset chunks and vectors; 3,649 provenance-bearing topic/differential edges**.

Corpus SHA-256: `1bb200918d063325df27bcc3b252c992220367482181a42e77e671305321b5ff`.

| Material | Included | Rights and clinical boundary |
|---|---:|---|
| OpenEM Tier 1 | 370 documents | Apache-2.0; pinned Git objects at `c913c62bc13158b0173272760e69ce55f16abc6e`. Secondary synthesis, not original guideline text. 290 agent-compiled records and 80 with upstream review metadata; neither approves this system. |
| MedlinePlus English health-topic summaries | 1,016 | Selected public-domain NLM XML summaries. External linked articles, ADAM encyclopedia and ASHP drug content are not ingested. |
| NIH/NHLBI and CDC selected agency sections | 3 | Text-only, identity-checked sections with agency attribution and no endorsement; images/logos and unrelated sections excluded. |
| PMC primary guidance | 2 | Exact article identity and CC-BY-4.0 grants verified. Migraine consensus (2021) and WSES mesenteric ischemia guidance (2022), with scoped extraction. |

The corpus is **not blanket Apache-2.0**, comprehensive emergency guidance or a telehealth prescribing library. Public access is not permission to relicense. NC/ND/SA material is excluded from this permissively reusable pool; it is not judged clinically inferior. A 2020 WAO article was excluded on rights; other candidates failed retrieval or usable-body checks. Those rejections remain in ingestion records. [NLM content policy](https://medlineplus.gov/about/using/usingcontent/), [NLM XML](https://medlineplus.gov/xml.html), [PMC reuse interface](https://pmc.ncbi.nlm.nih.gov/tools/oai/), [CDC conditions](https://www.cdc.gov/other/agencymaterials.html), [NHLBI attribution policy](https://www.nhlbi.nih.gov/about/contact/trademark-branding-and-logo).

Each document records publisher, URL, source version, license, attribution, content hash, extraction scope, publication/review metadata and acquisition time. **Every record's independent currentness assessment is still `not_assessed`.** Download date is not evidence that a recommendation remains current. Content can be marked superseded/retracted and excluded from active chunks. Production needs scheduled version-diff review and a clinician-owned invalidation process; it is not implemented by retaining a timestamp.

Source passages preserve character offsets and hashes. Tables are excluded by default; the two explicitly selected migraine tables propagate row-spanning qualifiers into labeled cells, retain footnotes and reject ambiguous layouts. The outdated preventive-treatment table is not included. Figures, supplements and reference lists do not silently become claim support. A citation listed inside OpenEM is not represented as a retrieved original paper. [Migraine consensus](https://pmc.ncbi.nlm.nih.gov/articles/PMC8321897/), [WSES guidance](https://pmc.ncbi.nlm.nih.gov/articles/PMC9580452/).

The targeted DVT source distinguishes prompt evaluation of leg symptoms from immediate help for PE symptoms; it does not mandate ambulance transport for every swollen calf, nor establish that unconnected async care can deliver same-day imaging. The NIH source directly supports emergency activation/transport for possible heart attack. These are clinical distinctions to reason over, not case-specific output templates. [CDC VTE](https://www.cdc.gov/blood-clots/about/), [NHLBI heart attack](https://www.nhlbi.nih.gov/health/heart-attack/symptoms), [CDC stroke](https://www.cdc.gov/stroke/signs-symptoms/index.html).

## Retrieval design and measured comparison

PGlite supplies real local PostgreSQL with full-text search and pgvector. It is a single-process prototype, not a production multi-host database. The embedding provider is OpenAI `text-embedding-3-large`, reduced to 1,536 dimensions. Existing Anthropic credentials do not automatically authenticate Voyage; no Voyage access was assumed. The embedding interface is replaceable, but another provider/dimension requires a separately versioned index. [OpenAI embeddings](https://developers.openai.com/api/docs/guides/embeddings), [Anthropic embedding guidance](https://platform.claude.com/docs/en/build-with-claude/embeddings), [pgvector](https://github.com/pgvector/pgvector), [PGlite](https://pglite.dev/docs/about).

Implemented: section-aware overlapping exact chunks; title/alias/section context in embeddings; weighted full-text retrieval; vector search; reciprocal-rank fusion; bounded document diversity; round-robin query coverage; citation pinning during evidence repair; immutable index identity; content-addressed embedding reuse; query-vector cache; lexical degradation when embeddings fail. This cache contains vectors, **not patient answers**. RRF scores are retrieval order, not clinical confidence. This is not a claim to have implemented learned reranking or Anthropic's model-generated contextual retrieval technique. [Contextual retrieval research](https://www.anthropic.com/engineering/contextual-retrieval).

Twelve authored topic probes were frozen before the final retrieval comparison, with counterbalanced execution order across three modes (36 attempts). They test retrieval, not disposition or clinical correctness. On the exported v7 comparison:

| Mode | Topic hit rate | Reciprocal rank | Expected-source recall | Mean observed retrieval |
|---|---:|---:|---:|---:|
| Ranked lexical | 9/12 | 0.590 | 0.667 | 19 ms |
| Hybrid | 12/12 | 0.833 | 0.958 | 367 ms |
| Hybrid + one-hop graph | 12/12 | 0.833 | 0.958 | 289 ms |

Graph expansion added **no measured relevance lift**, so the live candidate uses hybrid without expansion. The mean-latency difference is not a speed claim: query caching, network variation, small sample size and run order remain relevant. Repetitions, p95 load testing and HNSW-versus-exact recall comparison are still needed. Earlier weak-AND lexical and imbalanced-cache experiments remain local historical artifacts; they are not used as the headline comparison.

## Judge scope, recovery and observed failures

The reviewer has seven explicit criteria: undertriage, overtriage, patient grounding, claim support, safety net, necessity of clarification delay, and ownership. It must supply exact anchors; missing criteria, invented anchors, unsupported source passes and malformed review objects are rejected. All material management claims must be assessed, not only the claims the generator chose to cite.

GUI testing found an important scope defect: Astra sometimes failed the draft's overtriage criterion because an **earlier** ED notice was wrong, even though it found the draft's same-day physical assessment appropriate. That could prevent correction of the very early error being criticized. The revised contract scopes the seven criteria to the current draft and actually issued question. Early action has its own verdict/correction record. Anchors to the early unit cannot be used to score current-draft criteria. Unissued context questions are no longer presented as patient-facing responses.

A supported correction of care can now be released separately from an unapproved clinical explanation. It requires all non-evidence care criteria and applicable structural checks, exact patient quotes and a justified lower route; it cannot turn an evidence-only failure into clearance for self-care. Reducing unconditional EMS below emergency requires affirmative trigger misattribution/correction, not merely model preference or missing information. Historical early errors remain scored and logged. This policy still needs prospective physician challenge; one uncalibrated judge can be wrong in either direction.

The live development cohort contains failures and several prompt/corpus iterations. It is not a fixed-version efficacy trial. Before the final scope correction, 12 actual GUI runs included only two completed responses; one completed chest-pain run lacked an early emission, and another took almost two minutes. DVT runs retained an excessive early ED instruction despite a same-day draft. Usual-migraine runs often required repair of evidence or wording. These are release failures, not inconvenient outliers to delete. Final retests and every attempt appear in the accompanying export and verification appendix below.

## Reproduction and audit artifacts

`outputs/evidence-graph-development-2026-09-13/` contains normalized licensed corpus sections, a SHA-256 manifest, per-document attributions, acquisition metadata, all candidate GUI run records, all 36 final retrieval attempts and summary statistics. It excludes credentials, provider account details, patient identifiers and embeddings. Inputs are synthetic. Full generated answers, source excerpts and internal model outputs are retained for this research audit; this is **not a production PHI logging policy**.

The bundle importer checks compressed bytes, normalized corpus identity, document/chunk counts and bounded decompression before rebuilding an index. It establishes reproducibility, not publisher authenticity or clinical validity. Failed attempts with missing usage stay unknown-cost rather than becoming zero-cost. Dollar amounts in the export are estimates under the repository's recorded model prices, not invoices. Query-embedding usage is recorded separately from generation.

```bash
npm ci
npm run rag:build -- --directory apps/evaluation/.local/replayed-rag \
  --bundle outputs/evidence-graph-development-2026-09-13/corpus/manifest.json --embed
COUNSEL_RAG_DIRECTORY="$PWD/apps/evaluation/.local/replayed-rag" npm run review:dev
# Open http://localhost:4120/candidate
npm run rag:test
npm run rag:benchmark -- --help  # inspect script arguments before paid execution
```

The build with `--embed` makes paid embedding calls using the local `.env`; omitting it builds lexical-only storage. Do not run CLI index operations against a directory simultaneously owned by the GUI process. The candidate registers its actual workflow in its GUI runtime; it is not yet the default workflow in Mastra Studio. Source bundles are read-only; new source versions require a new directory and manifest.

## What would satisfy the physician-engineer's burden of proof

1. **Reference integrity:** bind the physician's reviewed decisions to exact input, response and policy versions; preserve C25's qualified disagreement. Do not call unreviewed reruns gold. Independently adjudicate unseen cases, preferably before showing model output.
2. **Clinical scope:** add applicable primary evidence for each clinically consequential question, not a target number of URLs. Prioritize diagnostic uncertainty, pediatric/pregnancy context, refill constraints, remote-exam limitations and real service capabilities. License checks, source fidelity, currentness, entailment and patient applicability are separate gates.
3. **Matched agent ablation:** compare Opus alone, Opus plus fixed retrieval, rapid safety plus Opus, and the full reviewed workflow on identical cases, passages and output contracts. Grade every arm with the same blinded external evaluator. A no-judge runtime arm cannot be compared by “release completed” if its policy deliberately never releases; score its retained draft independently. Existing research switches are not a completed ablation study.
4. **Whole-trajectory outcomes:** count wrong early alerts even when corrected, missed emergencies, unnecessary ED/EMS referrals, same-day versus async-priority errors, unsupported management claims, unnecessary questions/delay, clinician work, time to appropriate action, completion rate, final latency and total cost. Preserve all planned slots and failures. Report clustering/uncertainty, not only an aggregate agreement percentage.
5. **Benchmark discipline:** reproduce Counsel's 103-case filtered emergency methodology separately from broader stress cases, preserving English/conditional/second-hand exclusions. Do not import an assumed healthy 35-year-old male into the supplied cases. The existing benchmark adapter does not yet evaluate this new candidate end-to-end, and its documented multi-turn exclusions remain unresolved. [Counsel HealthBench method](https://www.counselhealth.com/blog/how-counsel-leveraged-healthbench-to-assess-emergency-escalation).
6. **Operational readiness:** durable run ownership/reconnect, bounded provider recovery, explicit judge abstention, safe concurrency, source-refresh governance, reproducible builds, actual GUI rehearsal and real handoff acceptance before deployment claims. A disclaimer or test count does not supply those properties. [Mastra workflow control](https://mastra.ai/docs/workflows/control-flow), [suspend/resume](https://mastra.ai/docs/workflows/suspend-and-resume), [Anthropic agent design](https://www.anthropic.com/engineering/building-effective-agents).

The practical next gate is not another agent: validate the early safety role and reduce avoidable evidence/revision failures on a frozen, physician-scored cohort. Until then, keep the reviewed incumbent available and present this as a transparent engineering candidate—not a superior clinical system.

## Verification appendix

### All-attempt accounting

The frozen export contains **16 actual GUI attempts: 2 completed assessments and 14 clinician-review-required outcomes**, using 94 model calls. The known generation/review cost estimate is **$6.311973**, with one additional attempt whose usage is unknown. Embedding usage is separate. These are mixed development iterations, selected to investigate defects, not an accuracy estimate or an unbiased final-version comparison. An accepted response is not a physician-validated response.

The last four runs used the same prompt hash (`31e748ea09dbd328e92557b1d21158573b1a783139e4637595dc5791da932bd4`) and v7 corpus:

| Actual GUI regression | Early action | Finished | Observed outcome |
|---|---:|---:|---|
| C25, calf symptoms after travel | ED now at 3.36 s | 91.27 s | Early ED instruction was judged excessive and corrected to in-person today. Explanation still failed support review. |
| C50, usual migraine and sumatriptan refill | In-person today at 4.26 s | 91.11 s | Early physical-care requirement was judged unsupported. Opus proposed priority async, but evidence/safety-net failures blocked correction; the excessive early route remained. This is a release blocker. |
| Novel educational question quoting, then explicitly denying, melena/lightheadedness | No early emergency | 70.52 s | No keyword-triggered emergency. The self-care draft failed evidence/wording checks and fell back to priority clinician review. This remains unnecessary review burden. |
| C25 updated through the GUI with new breathlessness, chest pain and near-fainting | 911 at 9.36 s | 78.22 s | The original message and new symptoms were retained. Emergency instruction survived, but the explanation failed claim review. |

Run IDs, respectively: `b5898fe0-14af-4025-a7b6-4431c7de40bf`, `0642569d-8312-4a11-8dd2-003cbdd04ce1`, `bd83f9d9-58f6-4925-95eb-efb8b36d94f0`, and `d3b284e2-fc6a-4af1-8934-678dd5f48a5c`. The first twelve attempts are equally retained in `summary.json` and the full run files. None of these times measures browser paint or patient receipt.

The final four all failed to release a complete supported explanation. The structural scope fix helped correct C25's care setting; it did not solve clinical reliability or latency. Available corpus passages about emergency services/first aid were not consistently selected for transport claims. That is partly a retrieval-planning problem, not proof that adding more URLs is the solution. Some reviewer objections may also be overly literal; that must be resolved through physician-labeled claim/inference examples and judge calibration, not by silently disabling evidence checks.

### Software and artifact checks

- Full root `npm test` chain passed, plus **27 RAG tests** and **131 evaluation-app tests**.
- Type-check, repository lint command, Mastra production build and Next production build passed. The lint command checks JavaScript syntax; it is not a comprehensive TypeScript style/static-analysis gate.
- The frozen corpus was rebuilt in a fresh directory (`/tmp/counsel-rag-replay.5PCXhN`) **without network source acquisition or paid embeddings**. It reproduced the exact corpus hash, 1,391 documents, 5,209 chunks and 3,649 edges. The replay index has zero vectors until `--embed` is explicitly requested.
- Actual browser checks covered new input, reruns, a symptom update and progressive action/care correction. Visual inspection confirmed the single response panel keeps emergency instructions prominent and details collapsed. This is not a complete accessibility or cross-device audit.
- The exported corpus is v7. Earlier runs retain the exact passages supplied at the time, but the full earlier corpus versions are not bundled; the bundle alone cannot reproduce their complete retrieval rankings. Live provider outputs are not expected to replay deterministically.

### Remaining release gates

1. Eliminate or demonstrably reduce inappropriate early escalation without suppressing genuine emergencies. Evaluate the complete trajectory, not only the final route.
2. Improve evidence selection and concise generation; calibrate support versus clinical inference using physician-reviewed claim-level examples. Measure unnecessary clinician fallback alongside unsafe release.
3. Run a frozen, matched clinical ablation and an unseen-case evaluation. Topic retrieval hits do not establish agent benefit.
4. Implement durable run ownership/reconnection and explicit question lineage. This candidate currently accepts self-contained symptom updates; a bare “yes” or “no” is not reliably bound to a prior candidate question. Do not present it as completed longitudinal history-taking.
5. Add database ownership/concurrency protection and production-grade source-refresh governance. The local PGlite prototype must not be opened by a CLI and server simultaneously.

The candidate remains opt-in. The incumbent and original physician-review artifacts were not replaced. Software checks establish implementation behavior, not clinical safety, and these observed failures prohibit a presentation-readiness claim for the candidate.
