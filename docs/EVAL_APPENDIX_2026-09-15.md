# Evaluation appendix — final submission

> **Reference version note:** This appendix preserves the original v2 evaluation
> and its separate CSV/accounting analyses. It is historical where it calls C25
> unresolved or lists five Fable misses. The [current v3 adjudication](PHYSICIAN_ADJUDICATION_V3_2026-09-15.md)
> corrects C32/C34/C38 to self-care and includes C25 as urgent: Fable **48/50**,
> Astra extra-high/max **47/50**. Fable's remaining misses are C22 and C47.
> Model outputs did not change. The CSV is discussion evidence only. The
> current slides contain no financial content.


15 September 2026 · Current demonstration: **Fable 5.1, low effort, three buckets, `/stripped`**.

**Frozen result: 50/50 valid outputs; 44/49 physician-development reference agreement; 31/50 original CSV agreement.** These measure routing agreement on a known synthetic development cohort. They do not establish clinical accuracy, a stable model ranking, or readiness for patient use.

[Deck](INTERVIEW_DECK_2026-09-15.md) · [Demo](DEMO_SCRIPT_2026-09-15.md) · [Red-team review](SUBMISSION_RED_TEAM_2026-09-15.md) · [All-case comparison CSV](../outputs/submission-audit-2026-09-15/all-case-comparison.csv) · [Offline audit](../outputs/submission-audit-2026-09-15/audit.json)

## 1. What counts as a right answer?

The assignment describes existing workflow dispositions and explicitly allows redesigning the buckets and using the data for development or evaluation. Its PDF says 20 messages; the supplied CSV used here contains **50**. All 50 were retained. The assignment is task context, not an instruction to submit materials automatically.

| Reference | Construction | Scoring | Limitation |
| --- | --- | --- | --- |
| Original assignment CSV | Existing workflow's three labels | Exact bucket equality across all **50** rows | An observed workflow decision is not automatically clinical truth |
| Physician-designated development reference | Physician-engineer reviewed the incumbent after iterative development; frozen reference reconstructs eligible incumbent routes before designation | Membership in accepted route sets; **49** scoreable rows | Unblinded, development-derived, and version-specific; exact viewed response IDs were not enumerated |
| C25, DVT case | Physician expressed a qualified disagreement and said either interpretation could be argued | `acceptedRoutes = null`; exclude only from physician agreement | Keep in completion, CSV, failure, and cost accounting; do not invent a definitive physician label |

The [frozen reference](../data/evaluation/physician-system-reference-v2.json) explicitly calls its selection a chronological reconstruction, **not proof of which exact run was viewed**. The earlier 49/50 physician review applies to that incumbent. It is not a newly adjudicated Fable score and is not transferable clinical approval.

**The two references agree on only 32/49 scoreable cases after mapping to the same three buckets.** Their 17 disagreements are C04, C06, C08, C11, C12, C16, C17, C19, C23, C30, C34, C35, C38, C43, C44, C46, and C49. This is newly derived descriptive arithmetic, reproduced by the [audit script](../scripts/submission-evidence-audit.mjs). Independent adjudication of disputed policy and patient requirements is the next step; choosing the reference with the larger model score would not settle correctness.

### Inference and development boundaries

The stripped provider receives the fixed system prompt and unchanged patient message. Case IDs, physician accepted routes, CSV labels, prior outputs, and scoring maps are absent. Scoring reads references after generation freezes. The audit verifies saved request content and artifact hashes.

That protects the **request boundary**. It does not make this held-out: the cohort and its failures informed earlier development, selection, and experiments. A scoring-time reference read cannot undo prior development exposure. No independent clinical generalization result is claimed.

## 2. Results with explicit taxonomy and output contracts

The map is `SELF_CARE → SELF_CARE`; both async priorities → `ASYNC_PHYSICIAN`; same-day in-person and emergency → `URGENT_ESCALATION`.

| Frozen run | Output delivered / attempts | Physician, three buckets | Original CSV | Contract / provenance |
| --- | ---: | ---: | ---: | --- |
| **Fable 5.1 low — current demo protocol** | **50/50** | **44/49** | **31/50** | One disposition and short rationale; one call per message |
| Fresh Opus 5 low, three-bucket prompt | 50/50 | 42/49 | 33/50 | Same prompt and settings; model changed |
| Fable 5.1 max | 50/50 | 42/49 | 31/50 | Same Fable requests except effort |
| Earlier five-way Opus low, mapped afterward | 50/50 | 46/49 | 35/50 | Different prompt and output taxonomy; no new inference for collapse |
| V25 completed releases, mapped afterward | 27/50 | **22/49 delivered agreement** | Not recomputed | Broader response/release contract; post-hoc analysis, no new inference |

Sources: [three-bucket comparison](STRIPPED_3BUCKET_COMPARISON_2026-09-15.md), [max-effort study](STRIPPED_3BUCKET_FABLE_MAX_2026-09-15.md), [five-way baseline](STRIPPED_BASELINE_REPORT_2026-09-15.md), [original V25 report](V25_COMPLETED_REPORT.md), and [new offline audit](../outputs/submission-audit-2026-09-15/audit.json).

**Fable is the selected demonstration configuration. A stable ranking is not established.** It has two more physician agreements than fresh three-bucket Opus, but two fewer CSV agreements, higher measured cost, and longer provider latency. Earlier five-way Opus outputs have two more mapped physician agreements than Fable. Each arm is one pass through the known cohort, without repeated trials or an untouched model-selection test.

### Preserve the original five-way results

| Historical artifact | Original exact five-way score | Post-hoc three-bucket score | Why it changes |
| --- | ---: | ---: | --- |
| Stripped five-way Opus | **35/49** | **46/49** | Eleven disagreements disappear through taxonomy collapse alone |
| V25 delivered releases | **21/49** | **22/49** | Only C12 changes: same-day versus emergency merges into urgent escalation |

The original artifacts and scores remain unchanged. For V25, **21/27** is the original conditional agreement among completed eligible releases; **22/27** is its mapped conditional counterpart. Neither conditional denominator replaces all-case delivered agreement. C13 remains a miss: self-care versus accepted priority async.

Taxonomy collapse can conceal clinically relevant distinctions, particularly same-day attendance versus immediate emergency action. More agreements after collapse do not demonstrate better decisions. V25 also attempts a complete response, evidence, and release handling that the stripped router does not attempt. Even after aligning taxonomy, these are **different product contracts**, not a controlled component ablation. The comparison cannot identify which removed component caused a difference.

## 3. Original v2 discrepancies

| Arm | Every physician-reference miss under three buckets |
| --- | --- |
| Fable low | **C22, C32, C34, C38, C47** |
| Fresh Opus low | C07, C22, C34, C38, C43, C47, C49 |
| Fable max | C07, C22, C32, C34, C38, C47, C49 |
| Earlier five-way Opus, mapped | C34, C38, C49 |
| V25 completed mapped disagreements | C13, C22, C32, C38, C47; non-completions also remain non-successes |

Under v2, all five Fable-low discrepancies are self-care instead of physician-reference async review. C34 and C38 agree with the original CSV's self-care label. Inspect the required clinician task and policy; the discrepancy is not by itself adjudicated harm, and changing a route merely to match the reference does not prove clinical benefit.

The max-effort pass repaired **none** of the five prior Fable misses. It changed only C07 and C49, losing physician-reference agreement on both. CSV agreement stayed 31/50 because one changed case gained CSV agreement and one lost it. This supports retaining low effort for this demonstration; it does not establish a universal claim about reasoning effort.

### V25 failures remain visible

| Original first-attempt outcome | Count |
| --- | ---: |
| Completed and exact five-way reference agreement | 21 |
| Completed five-way reference disagreement | 6 |
| Gate withholds, including unresolved C25 | 22 |
| Original C04 decoder failure | 1 |
| **All attempts** | **50** |

Among 49 reference-eligible rows, the original numerator stays 21 and the mapped numerator becomes 22; 21 eligible withholds and one decoder failure receive no completed-agreement credit. A retained early instruction or matching rejected draft is not a completed response. Later fixes do not retroactively convert the original C04 failure into success.

## 4. Cost and latency

### One-shot stripped experiments — all 50 calls per arm

| Arm | Median provider round trip | p95, nearest rank | Standard token-price estimate | Conservative accounted amount |
| --- | ---: | ---: | ---: | ---: |
| Earlier five-way Opus low | 2.648 s | 4.082 s | $0.277440 | $0.387455 |
| Fresh three-bucket Opus low | 2.3015 s | 3.526 s | $0.154065 | $0.201830 |
| **Fable low** | **3.7995 s** | **4.710 s** | **$0.338780** | **$0.435310** |
| Fable max | 5.3485 s | 14.851 s | $0.920680 | $1.017210 |

These use rates and usage recorded in dated experiment ledgers, not invoices or future price/latency promises. Latency measures direct HTTP completion, not browser paint or clinician response time. Four independent messages ran concurrently within each arm. Costs include every call in that arm. Fable max cost 2.72 times the low-effort estimate; p95 increased by 10.141 seconds while agreement declined by two cases.

The four baseline experiments total **200 calls**, **$1.690965** estimated and **$2.041805** conservatively accounted. Six later GUI checks add **$0.040810** estimated and **$0.053070** accounted: **$1.731775 / $2.094875 for this specific 206-call slice**. This is not the expanded project's cost. Earlier experiments have separate ledgers.

### Historical V25 — different measurement population

V25 made **150 model calls across 50 first attempts, zero judge calls**. The all-attempt estimate, including query embeddings and failures, was **$6.08540647**; conservative cap accounting was **$11.063796**. No attempts had unknown usage. Final server latency was **18.634 s median / 22.807 s p95 among 27 real completed releases only**. Early-action latency was **3.1135 s median / 5.813 s p95 among 12 completes with an early action**. These completion-conditioned latencies exclude failures. [Frozen report and ledger](V25_COMPLETED_REPORT.md)

Do not present stripped-versus-V25 differences as equal-workload speedups: output responsibility, calls, retrieval, and release behavior differ.

## 5. Browser evidence is separate from the benchmark

`/stripped` uses one real Mastra workflow step and one native Anthropic request. The builder matches all 50 frozen Fable-low requests; its parser reproduces all 50 stored responses. Protocol parity does not promise identical future generations.

The [GUI report](STRIPPED_FABLE_GUI_2026-09-15.md) records **six provider calls, six valid dispositions, five visible final results, and one intentionally discarded browser result**. It tested C01 self-care, C02 urgent escalation, C06 async, C06 edited with new red-flag symptoms, and an in-flight selection change. An abandoned answer did not appear under the newly selected message; server usage remained accounted.

The download-event listener timed out, but filesystem readback verified the saved JSON. The archive records no provider failures or browser console errors for those checks. [Six-run manifest](../outputs/stripped-gui-2026-09-15/manifest.json)

These are synthetic interface checks, not independent clinical validation or a new cohort score. An interview submission creates a new trace and can differ from the frozen result. A saved-record fallback must be identified as saved.

## 6. What this evaluation has not established

| Area | Current evidence / limit | Work needed before relying on it |
| --- | --- | --- |
| Clinical reasoning and rationale | Route agreement scored; complete clinical meaning unscored. A short rationale can contain advice | Independent physician review of facts, action, timing, uncertainty, and material errors |
| Stripped safety generalization | Known cohort and software/GUI checks; no established clinical red-team performance | Frozen unseen cases, adversarial wording, context shifts, repeated trials, subgroup review |
| Urgent timing or transport | Three buckets merge same-day and emergency | Explicit ownership and separately validated timing/transport decisions |
| Care completion | No delivery, acceptance, prescription, or follow-up integration | Observable handoff events and failure handling |
| Patient outcomes | No patient deployment or outcome study | Appropriate prospective clinical and operational study |
| Judge calibration | Authored examples and software graders; neither stripped nor V25 uses a live judge | Intended-use physician labels, failure sensitivity, false rejection, abstention, repeatability, drift |
| RAG correctness | Historical source identity checks did not establish patient applicability | Patient-grounded support assessment and equal-input comparison before adding retrieval |

The supplied Counsel judge report informs **retrospective clinical quality assurance**. It does not validate this router or require a serial live judge. [Report interpretation](CLINICAL_JUDGE_PROGRAM.md#what-the-supplied-counsel-report-establishes) · [Unapproved calibration examples](JUDGE_CALIBRATION_2026-09-14.md)

V25's global `unsafe_advice` and `unsupported_claims` remain `not_assessed`. Valid JSON, correct quotations, mechanical checks, and software tests are different evidence from clinical correctness. The stripped protocol has no separate patient-reply generator, but its rationale can contain medical recommendations; route scoring does not certify that field.

## 7. Earlier experiments — separate decisions

| Experiment | Result | Decision and boundary |
| --- | --- | --- |
| Fixed-packet application study | Eligible reference-agreement coverage **24/49 → 22/49** | No promotion; not a new live V25 score. [Report](ALIGNMENT_STATUS_APPLICATION_2026-09-15.md) |
| Local Nano/Cascade binding critic | Five configurations failed authored development gates | No release authority or Opus-equivalence claim; optional reviewed drafting. [Report](LOCAL_OFFLINE_RESULTS_2026-09-15.md) |
| Historical deterministic ablation | Authored in-sample 1.000 | Engineering regression evidence only. [Interpretation](TRACE_AND_ABLATION.md#interpretation) |
| Historical incumbent physician review | 49/50 after iterative development, qualified C25 concern | Development input; no independent 98% accuracy claim. [Scorecard](PHYSICIAN_REVIEW_SCORECARD_2026-09-13.md) |

The expanded repository exceeded the assignment's 6–8-hour target. Those experiments are a research extension, not evidence that every component belonged in V0. Start with a small routing baseline; require each addition to earn its complexity on matched, clinically meaningful evaluation.

## 8. Offline reproduction and artifact integrity

From the repository root:

```bash
node scripts/submission-evidence-audit.mjs
```

This performs **zero inference calls**. It verifies 600 request/raw/parsed hashes across four frozen baseline runs, six GUI hashes, unchanged patient message content in saved requests, unique provider IDs, score numerators/denominators, latency summaries, and the post-hoc V25 map. It creates derived files only if absent; existing files must reproduce byte-for-byte and are never overwritten. Original results are unchanged.

- [Audit script](../scripts/submission-evidence-audit.mjs)
- [Summary and source hashes](../outputs/submission-audit-2026-09-15/audit.json)
- [All 50 cases, every baseline, and V25 delivery status](../outputs/submission-audit-2026-09-15/all-case-comparison.csv)
- [Fable physician scorecard](../outputs/stripped-3bucket-fable-2026-09-15/scorecard-A-physician.json)
- [Fable original CSV scorecard](../outputs/stripped-3bucket-fable-2026-09-15/scorecard-B-csv.json)

Provider calls are not reproducible deterministically from a random seed. Saved original outputs are reproducible evidence; fresh generations are new observations.
