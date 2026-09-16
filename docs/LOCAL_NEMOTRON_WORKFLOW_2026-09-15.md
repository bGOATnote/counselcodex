# Single-Mac local model continuation

## Decision after evaluation

Use **deterministic code for gold scoring** and keep **Nano Q5 optional for
reviewed hard-negative drafting**. Both local models loaded on this M4 Max /
48 GB Mac with Ollama 0.32.1. Neither passed the binding-critic gate, and
open-ended mining was unreliable. Nano remains the simple default when drafting
turnaround matters. Cascade yielded more useful outputs in a small sample and
used less memory, but was slower. This is an operational preference, not a
clinical-quality or model-superiority claim. Use one model and one serial worker.

This replaces the initial setup-only role suggestions with the
[completed 144-request evaluation](LOCAL_OFFLINE_RESULTS_2026-09-15.md) and
[review of all mining/negative outputs](LOCAL_MINING_REVIEW_2026-09-15.md).
No second laptop, H100, new model download or paid experiment call was used.

## Recovered project truth

The preceding task, **Create counselcodex repo**, ended at `a4d472e`; its next
two turns failed during compaction. That work and the initial local setup were
pushed at `dac1f48`. The rejected application experiment was not restarted.

| Separate workflow | Complete / eligible | Delivered reference agreement |
| --- | ---: | ---: |
| Frozen V25 gates-release | 27/50 | 21/49 |
| Historical hybrid V22 | 39/50 | 32/49 |
| Fixed-packet application baseline | 31/50 | 24/49 |
| Fixed-packet application candidate | 27/50 | 22/49 — **NO PROMOTE** |

These are different conditions. V25's conditional 21/27 is different from
21/49 coverage. C25 stays in completion/cost and outside agreement because its
accepted route set is null. All 50 are development cases, not a clinical holdout.
V25 and application scorecards reproduced byte-for-byte with no model. Exact
quotations still do not establish clinical meaning or patient applicability.

## Models for this machine

| Package | Measured role and limits |
| --- | --- |
| Existing Nano 3 30B-A3B Q5_K_M | Imported as `counsel-nano-q5`; sampled model allocation 24.52 GiB. No binding gate passed; 0/8 supported mining findings, 2/4 reviewed textual pairs. Optional small negative drafts. |
| Existing Cascade 8B Thinking Q5_K_M | Imported as `counsel-cascade-8b-q5`; sampled allocation 6.76 GiB. No binding gate passed; 2/8 mining tasks with supported findings, 3/4 reviewed textual pairs. Optional lower-memory drafting experiment. |
| Nemotron-Cascade-2-30B-A3B Q4_K_M | Future same-packet A/B candidate; Ollama `nemotron-cascade-2:30b-a3b-q4_K_M` lists 24 GB. Fit estimated, not loaded or tested here. |
| Existing approximately 31 GiB Omni Q6 alternatives | Defer: tighter memory budget and no measured advantage for this text-only work. |

[NVIDIA's Cascade-2 card](https://huggingface.co/nvidia/Nemotron-Cascade-2-30B-A3B)
reports gains on several general benchmarks. That makes it worth considering
for a future bounded comparison, not a proven CounselCodex upgrade.
[Ollama's tags](https://ollama.com/library/nemotron-cascade-2/tags) identify the
24 GB Q4 package. No download is required now. GB and GiB differ; active MoE
parameters do not remove the need to store all weights. Skip Super/Ultra and
unavailable GPU configurations.

Use context 8192, bounded output, one loaded model and serial requests. Include
input, template and output in the context budget; reject oversized packets or
split only at complete claim/passage boundaries, retaining qualifiers. Nano's
thinking binding arm showed 645.81 M of system swap growth; neither mining
phase showed before/after growth. These are system-wide observations, not
exclusive attribution or peak RSS. Observe sustained memory pressure before
increasing context. Both models were unloaded after evaluation.

Ollama 0.32.1 gives Nano separate reasoning/final caps; Cascade's native GGUF
path shares one cap. The mining comparison used Nano 2048 per phase and Cascade
4096 shared. Native templates were verified; do not substitute a generic
Qwen/Nano template. Nano's final counters omit the earlier thinking phase.
Use whole-request time including failures. See the
[runtime correction](LOCAL_MODEL_PACKAGE_BUDGET_CORRECTION_2026-09-15.md).

## Short import and one-prompt smoke

Both models are already imported. No repeat smoke is needed for this handoff;
this block is available for a future transport check:

```bash
cd /path/to/counselcodex
cat > /tmp/CounselNano.Modelfile <<EOF
FROM $HOME/Downloads/Nemotron-3-Nano-30B-A3B-Q5_K_M.gguf
PARAMETER num_ctx 8192
PARAMETER num_predict 384
PARAMETER temperature 0
EOF
OLLAMA_HOST=127.0.0.1:11434 ollama create counsel-nano-q5 -f /tmp/CounselNano.Modelfile && node scripts/local-nemotron-smoke.mjs
```

The [helper](../scripts/local-nemotron-smoke.mjs) sends one synthetic refill
message and validates one structured disposition. It uses native loopback
`/api/chat`, JSON Schema, `think:false`, temperature 0, seed 42, context 8192,
output 384 and a 180-second deadline, with no retries. It checks the installed
digest, rejects redirects, reads neither keys nor gold, has no cloud fallback,
retains failure artifacts and unloads the model. This compact smoke schema is
not the live response contract. Reimport uses the same model data and may occupy
another model-sized copy; it does not download or requantize the original.
[Ollama import documentation](https://docs.ollama.com/import).

The earlier [recorded smoke](../outputs/local-nemotron-smoke-2026-09-15T15-21-25.465Z-4894b436/summary.json)
returned `STANDARD_ASYNC`, schema valid, clinical correctness not assessed:
10.197 seconds total including 8.486 seconds load, 190 prompt tokens and 81
output tokens. This is a short-prompt measurement, not a latency SLA.
Nano digest: `36896b6271148892f83130812cb14116beeb2a518f98a0a17b469250b84901c8`.
Its native renderer/parser handles chat despite the displayed `.Prompt`
template. Structured JSON establishes shape, not semantic or clinical correctness.

## Concrete division of work

| Work | Executor and acceptance |
| --- | --- |
| Batch gold scorecards | Existing Node code joins frozen references to saved outputs after generation; retain failures, C25 and fixed denominators. No LLM. |
| Fixture mining | Inspect archived failures directly. Tested open-ended critique did not earn an unattended local role. |
| Binder critic | No automatic local integration. All five configurations failed the unchanged development gate; zero validation generation. |
| Hard negatives | Optional Nano drafts, deterministic pair/span checks, then semantic review. Four distinct textual candidates remain in the review artifact only. Use 8B if its lower memory or observed yield warrants the latency. |
| Promotion-gated 50 | Preserve actual paid providers and release checks; freeze a decision-changing hypothesis, identities and reconciled budget before comparison. |

**Local Nano is NOT a drop-in `/candidate` Opus replacement.** Neither is
Cascade. No new local gate, supervisor, repair chain or source substitution
was added. Current providers are Haiku 4.5 context/safety, Opus 5 producer and
Astra historical judge. V25 does not call judge/repair. **Fable is not configured**;
any deliberate future experiment needs a separate identity and comparison.

## Implemented local runner

The [runner](../scripts/local-offline-study.ts) supports `prepare`, explicit
`run` splits, `score` and gated `select`. Immutable source/model/request hashes
bind each first attempt. It rejects redirects, oversized packets and changed
source freezes, with no cloud fallback or automatic retry. Selection requires
all development result artifacts and the original utility threshold. All
studied arms failed; do not run unused validation rows to fill the plans.

For a separately justified future batch, freeze a bounded question and new
identity first. Send only patient, claim/draft and source text. Gold/CSV labels,
expected verdicts, IDs, family/variant and provenance stay outside model inputs.
Retain every raw response and failure. Check spans in code, then review control
support and the proposed defect before a separate admission decision. Agent
review is not human adjudication or physician approval. Textual fidelity does
not certify source authority or a routing decision.

Existing `graph-judge-calibration.ts` and `repair-sprint.ts` runners call paid
providers; do not mistake them for local runners. Matching model/version/options
and historical source checkpoints are required for old score replay; the
read-only source-commit option does not bypass those contracts.

### Code-only gold replay

These completed replays already match the historical scorecards. If a later
verification is needed, choose new destinations; neither command calls a model:

```bash
npm run cohort:score -- \
  adb8c2cea95f09d101fe0e8ec7c3366e110a78501306053ef0df01a637cf8338 \
  outputs/v25-local-replay-NEW \
  outputs/v25-path-b-complete-2026-09-15/runtime

node --experimental-strip-types scripts/disposition-study.ts score \
  outputs/application-alignment-2026-09-15 local-replay-NEW.json
```

Read V25's `scorecard.pathB`, not the older outer CLI summary. The application
replay appends under its study directory and verifies frozen dependencies.
Never edit inputs to make replay pass. Gold enters only the scorer.

## Scope and budget

The assignment describes a small asynchronous router and 20 messages; the actual
CSV contains 50. The job brief and judge framework inform evaluation design,
not submission, contact, clinical attestation or spending instructions. The
full project exceeds the original assignment's timebox; this continuation does
not claim otherwise.

The prior $95 mission recorded $21.607845 exposure and $73.392155 remaining at
freeze; earlier missions remain separate. Reconcile the ledger before future
paid dispatch. This evaluation used zero paid experiment calls and granted no
new budget. No matched paid-cost counterfactual was measured, so dollar savings
are not quantified. [Revised Grok prompt](GROK_LOCAL_CONTINUATION_PROMPT_2026-09-15.md).
