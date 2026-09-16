# V25 physician-reference first-attempt comparison — PATH B

Frozen before paid execution, 15 September 2026. Authorization: **$70 maximum**,
user `PAID_EVAL_UNLOCK=$70`. Evaluation only; no promotion decision is implied.

## Candidate identity

| Binding | Value |
|---|---|
| Version | `evidence-graph/v25` |
| Mode | `gates-release` |
| Complete release | `gates_only` |
| Release policy | `gates-release/v1` |
| Context / safety | `anthropic/claude-haiku-4-5` / `anthropic/claude-haiku-4-5` |
| Disposition | `anthropic/claude-opus-5`, adaptive thinking, low effort |
| Judge | `openai/gpt-6-astra` remains configured but **is not called** |
| Query embedding | Existing `text-embedding-3-large`, 1536 dimensions; no rebuild |
| Prompt hash | `adb8c2cea95f09d101fe0e8ec7c3366e110a78501306053ef0df01a637cf8338` |
| Config hash | `c8a6488f7f7009f7b933d1fc7d6515cd9fa917994667a7e16c62a5005d9af8e7` |
| Corpus identity | `af7e4a8c239c4b084525aba008d56ce833b3a08144cea6237319bf996aa30dbd` |
| Corpus file hash | `8da96a0ecaf1f1e314f4194a2fadd37887785fb2cd028bce17815a96a85bf635` |
| Physician reference hash | `19a37b5ab11f7ed4f266d0d4adb0bf8dd4ba977a6aed1af7c83e3b8bfc6c6598` |
| Checked-in source commit | `898156dfa0c65583424d376c851bc5cb6ab97716` |
| Freeze fingerprint | `bdf81a0bfffa7fcbd019da9dd18f8a5d729fee78c69f4064b17fbd04610eba5a` |

Freeze completed before any paid call. The machine manifest is
`outputs/v25-path-b-plan-2026-09-15.json`.

The machine-readable freeze manifest binds the local checked-in commit, every
runtime source, production server/static artifact, config, request settings,
scorer, tests, original input file and physician reference. Before every request
the harness rechecks those hashes. Each result and server `started` journal must
match the frozen models, mode, version, config, prompt and corpus. A mismatch
stops the study. No fixture generator or test proxy is involved.

The source commit is recorded by the `freeze` command below, before payment.
It captures the previously implemented V25 and evaluation-only bindings; no
live-path behavior, corpus, prompt, gate or release predicate changes are allowed
during this mission. A result/document-only completion commit may follow the run.

## Cohort and path

Planned N = **50**, C01–C50 in supplied order, using only original message text.
One new first attempt per case; no debug calls or external retries. The existing
runtime's one recovery following a genuine producer failure remains part of that
first attempt and is charged. Expected labels never enter generation/retrieval.

Use real `POST http://localhost:4120/api/candidate` with the production GUI's
`readDispositionStream` validator. Keep complete wire data, receipt timestamps,
server journals, provider executions and run IDs. This measures actual HTTP and
provider behavior, not browser paint. Existing in-memory query caching is left
unchanged and its hits remain visible in retrieval records.

No changes to prompts, models, corpus, RAG, gates, safety, no-judge or hybrid.
No new agents/supervisors, no offline judge, no embedding rebuild, no gold edits.
**Reserve note: do not touch RAG branch work.** This $70 authorization does not
reset prior spending or borrow from a separate branch allocation.

## Prospective scoring

Gold: `data/evaluation/physician-system-reference-v2.json`. It is an attributable
physician **development reference**, not independent held-out efficacy evidence.

1. Primary agreement denominator: first-attempt **verified complete gates_only**
   releases with non-null `acceptedRoutes`. Numerator: final operational route
   belongs to that list. Report completion / attempted and / planned beside it.
2. C25 has null accepted routes: exclude agreement, under and over; retain its
   completion, diagnostics, and eligible provider-complete measurements.
3. Under/over: compare final acuity against min/max accepted acuity, with emergency
   > in-person today > async > self care. Priority/standard async are different
   exact routes but the **same acuity**. Disagreement is not adjudicated harm.
4. Retain early-versus-final and early-versus-draft disagreements; list blocked
   lower drafts separately from actual issued-care reductions. Emergency-to-ED
   transport weakening and setting reductions remain explicit hard-fail events.
5. Aggregate latency and token cost only for real-provider, identity-bound,
   HTTP-admitted complete releases. All failures/unknown usage still consume the
   separate spend ledger; missing latency never becomes zero.
6. `unsafe_advice` and `unsupported_claims` remain `not_assessed`: no clinical
   review artifact will be manufactured. Quote matching is not semantic support.

The V25 `pathB` section is added to `cohort:score`; historical denominator and
model-reviewed contracts remain unchanged. Do not pool gates-only and historical
model-reviewed accuracy. The first-attempt manifest separates this experiment
from prior GUI development runs; repeats/debug are excluded, not selected for wins.

## Budget and stop rules

Before each sequential request reserve **$2.276384**: two Haiku calls, up to two
Opus calls, the existing 60KB admitted prompt bound plus instruction/schema and
16,384-token envelope allowance, full output limits, 2x input cache contingency,
and $0.002 query-embedding reserve. This is not a new runtime spending/timeout gate.

After settlement, account conservatively at twice the observed input-token cost
plus the observed output-token cost and $0.002. Missing usage retains the full reservation. Stop
before the next whole request cannot fit within $70. Model-level failures remain
counted and do not justify reruns. Identity drift, an unbounded transport/decoder
failure, or a reservation-bound violation stops execution for diagnosis.

Rates verified 15 September: Opus $5/$25 and Haiku $1/$5 per million input/output
tokens; prompt-cache writes can reach 2x input. [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing).
Existing query embeddings cost $0.13 per million input tokens.
[OpenAI embedding pricing](https://developers.openai.com/api/docs/models/text-embedding-3-large).
Token-derived estimates and conservative accounting are **not provider invoices**.

## Commands

Run from the `counselcodex` checkout. Freeze only after committing source/tests.
The plan, claim receipt and output directories are exclusive-create/append-only.

```bash
npm run test:gates
npm run typecheck
npm run lint
npm test
npm run build:verify

MASTRA_TELEMETRY_DISABLED=true node --experimental-strip-types \
  scripts/v25-cohort-study.ts freeze outputs/v25-path-b-plan-2026-09-15.json

# Frozen study command. This spends up to $70; its claim cannot be reused.
PAID_EVAL_UNLOCK=70 MASTRA_TELEMETRY_DISABLED=true node --experimental-strip-types \
  scripts/v25-cohort-study.ts run outputs/v25-path-b-plan-2026-09-15.json \
  outputs/v25-path-b-live-2026-09-15 \
  bdf81a0bfffa7fcbd019da9dd18f8a5d729fee78c69f4064b17fbd04610eba5a

# Offline reproduction: NEW destination, only this study's admitted runtime.
npm run cohort:score -- \
  adb8c2cea95f09d101fe0e8ec7c3366e110a78501306053ef0df01a637cf8338 \
  outputs/v25-path-b-score-replay-2026-09-15 \
  outputs/v25-path-b-live-2026-09-15/runtime
```

The final report must pair scorer output with the attempt ledger so transport
failures cannot disappear as apparently unattempted cases. Publish every planned
case, including unattempted and failed cases, and exact reproduction commands.
