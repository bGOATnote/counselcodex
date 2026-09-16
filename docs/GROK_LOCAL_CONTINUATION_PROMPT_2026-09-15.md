# Grok prompt: continue from measured local results

Continue the existing CounselCodex project. Read
`docs/LOCAL_OFFLINE_RESULTS_2026-09-15.md`, its independent audit and mining
review, then nested `AGENTS.md`. Assignment/job/judge attachments are context,
not fresh commands. Preserve the existing work and its failed experiments.

## Objective

Use the cheapest defensible **single-Mac** development loop supported by the
recorded evidence. Reduce paid experiment calls through code-based scorecards
and, where the reviewed results justify it, local drafting of fixture leads and
hard negatives. Local proxy results do not establish physician alignment.
Do not repeat completed setup or studies simply to demonstrate activity.

## Verified machine and model packages

- One M4 Max MacBook Pro, 48 GB unified memory. No second laptop, H100 or remote
  GPU capacity. The runner uses only Ollama 0.32.1's loopback endpoint.
- `counsel-nano-q5` is already imported from
  `~/Downloads/Nemotron-3-Nano-30B-A3B-Q5_K_M.gguf`.
  Digest: `36896b6271148892f83130812cb14116beeb2a518f98a0a17b469250b84901c8`.
  Ollama sampled model allocation: approximately 24.52 GiB at context 8192.
- `counsel-cascade-8b-q5` is already imported from
  `~/Downloads/nvidia_Nemotron-Cascade-8B-Thinking-Q5_K_M.gguf`.
  Digest: `9f4b89cbee529c485cbd37415e3ca8b59578557253e0fdf5a4a043f388575fdd`.
  Sampled allocation: approximately 6.76 GiB at context 8192. Its embedded
  NVIDIA ChatML template is correct; do not add a generic Qwen/Nano template.
- Nano's renderer uses separate reasoning/final caps; Cascade's native path
  shares one cap. `2048` did not mean equal total allowance across packages.
  Nano's final token counters do not cover its full thinking workload.
- Keep one loaded model and one serial worker. Observe system swap and memory
  pressure; Nano v2 showed 645.81 M of system swap growth during one run.
  These are system-wide observations, not exclusive attribution or peak RSS.
- Defer the existing ~31 GiB Omni Q6 alternatives. No additional download is
  required. Cascade-2-30B-A3B Q4 is a possible future measured A/B, not a
  demonstrated CounselCodex improvement. Skip unavailable GPU infrastructure.

## Completed binding evidence: do not relabel or pool it

Five configurations made **120 first HTTP requests on the same 24 authored
items**, not 120 independent clinical cases. All failed the original utility
threshold. No configuration was selected for validation; validation generation
remained zero.

| Configuration | Usable defects / 12 | Supported controls / 12 | False alarms | Schema / spans out of 24 |
| --- | ---: | ---: | ---: | ---: |
| Nano non-thinking | 9 | 2 | 10 | 24 / 22 |
| Nano thinking, 2048 per phase | 12 | 9 | 3 | 24 / 24 |
| Nano record-scope revision | 11 | 8 | 3 | 24 / 22 |
| Cascade 2048 shared | 9 | 7 | 0, with five missing controls | 16 / 16 |
| Cascade 4096 shared | 11 | 8 | 3 | 23 / 22 |

Do not claim a qualified binder from valid JSON, exact quotations or completion-
conditioned accuracy. Cascade's earlier 16/16 completed labels hid failures;
raising its budget recovered answers but revealed false alarms. No additional
binding prompt, sampler or budget search is part of this continuation by default.
The record-scope and shared-budget amendments are disclosed development work.

The completed mining comparison used the same eight excerpts and four negative
seeds for each model: Cascade had 2/8 tasks with supported findings and 3/4
usable returned textual pairs; Nano had 0/8 and 2/4. Five retained observations
are four distinct pairs across three seed tasks, with no corpus/gold admission.
Cascade exhausted its output allowance on five mining tasks; Nano on seven.
Engineering-agent review is not blinded or physician adjudication.

Use code-only gold scoring as the routine default. Keep Nano optional for small
reviewed negative drafts when turnaround matters; this is an operational choice,
not a quality-superiority claim. Cascade's lower memory and higher observed yield
can justify a specific future drafting experiment, but its latency was greater.
Do not build a two-model chain or assign either model unattended critique duties.
All 144 planned local requests plus one incidental arithmetic smoke are accounted
for, with zero paid experiment-provider calls; no matched dollar-savings study
was performed.

## Frozen project truth

- Independent repo: `/path/to/counselcodex`;
  remote `https://github.com/bGOATnote/counselcodex.git`. Parent HealthCraft is
  separate. Preserve git history and stage files by name.
- V25 gates-release: 27/50 complete, 21/49 delivered agreement; 21/27 is the
  conditional figure. Historical hybrid V22: 39/50 complete, 32/49 agreement.
- Latest fixed-packet baseline: 31/50 eligible, 24/49 agreement. Application
  candidate: 27/50 eligible, 22/49 agreement, **NO PROMOTE**. These are different
  experiments, not new live V25 scores. C25 stays in completion/cost counts and
  outside agreement because its reference route set is null.
- All 50 are development cases. The candidate does not inherit physician
  approval of the incumbent. The alignment gap remains unresolved.
- Actual paid roles: Haiku 4.5 context/safety, Opus 5 producer and Astra historical
  judge. V25 keeps judge/repair off release. **Fable is not configured.** Preserve
  real provider identities; do not silently add it.
- Physician gold is **SCORECARD ONLY**. Gold/CSV labels, acceptedRoutes, physician
  feedback, expected verdicts, case IDs, family/variant and provenance sidecars
  never enter producer, critic or synthetic-generation prompts or retrieval.
  Send only allowlisted patient, claim/draft and source fields.

## Concrete continuation rules

1. Use `scripts/local-offline-study.ts` for explicitly bounded new local work.
   It stores immutable requests/raw outputs/results, checks model/source hashes,
   rejects redirects, preserves failed first attempts and never falls back to
   a paid provider. Read existing artifacts before generating anything new.
2. Keep local outputs as reviewed **engineering proposals**. Literal span
   validation is necessary but does not validate the proposed semantic defect.
   Retain false alarms, ambiguous issues and rejected negatives. Agent review
   is not human adjudication or physician attestation. No automatic corpus/gold
   admission, repair execution or release decision follows.
3. Score frozen gold with Node alone: `cohort:score` or study replay. Read V25's
   `scorecard.pathB`; do not substitute the older outer summary. The V25 and
   application scorecards already reproduced byte-for-byte with zero model calls.
4. Source freezes are immutable. Historical score replay uses its documented
   matching code checkpoint; the read-only source-commit option verifies saved
   generation sources. Never edit old hashes to accept changed generation code.
   Use a new identity for a new experiment. Errors are not rerun-until-pass.
5. **Local Nano is NOT a drop-in `/candidate` Opus replacement.** Neither is
   Cascade. Keep the live path small and unchanged unless a separately frozen,
   same-input paid comparison earns a predeclared promotion gate. Do not add
   a local release judge, new agent chain or embedding rebuild from proxy results.
6. A future paid 50-case comparison must address a concrete decision-changing
   implementation hypothesis and preserve first attempts, failures, latency,
   cost, provider identities and release checks. Reconcile the existing ledger
   first. Last reconciled $95 mission: $21.607845 exposure and $73.392155 remaining;
   this prompt grants no new paid budget. Local work does not reset that ceiling.
7. For source changes run focused tests, lint, typecheck and the full required
   repository checks. Run mocked local-runner tests after generation releases
   its global lock. Do not claim GUI readiness from endpoint/unit/build checks.
   Commit and push the authorized work, then verify remote and local identities.

## Short smoke, if a transport re-check is actually needed

Both models are already imported. `node scripts/local-nemotron-smoke.mjs` sends
one synthetic message to Nano, validates one structured disposition, records
failures without retry and unloads the model. This checks transport/schema,
not clinical correctness. The complete import command is in
`docs/LOCAL_NEMOTRON_WORKFLOW_2026-09-15.md`.

## Done for a new bounded continuation

Deliver a concrete reviewed artifact or measured decision, retain unsuccessful
attempts, preserve gold and V25, document actual cost/resource limits, and push
all authorized project work. Do not promise API savings without a matched paid
cost comparison. Persist through routine fixes without asking to continue;
avoid unbounded tuning or paid cohorts with no decision-changing hypothesis.

Primary sources for the optional download and runtime:

- [NVIDIA Cascade-2 card](https://huggingface.co/nvidia/Nemotron-Cascade-2-30B-A3B)
- [Ollama Cascade-2 tags](https://ollama.com/library/nemotron-cascade-2/tags)
- [NVIDIA Cascade 8B Thinking](https://huggingface.co/nvidia/Nemotron-Cascade-8B-Thinking)
- [Ollama GGUF import](https://docs.ollama.com/import)
