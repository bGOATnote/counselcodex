# Local allowance failure and model-selection evidence

Date: 2026-09-11. Scope: the two GUI failures reported today and current model-selection evidence. No provider changes, paid inference, reservation resets, or retrospective edits to saved assessments/reviews.

## What actually failed

Two separate persisted records establish different causes:

- `ad386db4-77b8-466b-a4eb-79bb0f2228a0`: completed in 844 ms with HTTP 400 recorded for both Haiku intake and Opus disposition. Token usage is unknown, not zero. The artifact retained only sanitized HTTP status/stage, not the provider's detailed rejection reason. Therefore the exact historical 400 cause cannot be conclusively recovered from this record.
- `2a0af7f5-ca68-4c2c-a690-f937119c507d`: no model dispatch; blocked by `reserveInteractiveRun`. The emergency instruction was preserved.

The interactive ledger contains **12/12 reservations at $0.75 per run, $9 reserved**. The last reservation was created at `2026-09-11T15:01:25.412Z`, immediately before the failed C01 attempt. These are local admission slots, not Anthropic balance checks. Provider credits do not reset them. Failed/unknown requests remain reserved rather than being silently refunded.

The source allocates $20 CQA + $5 v1 + $9 v2 + $12 latency + $9 interactive + $24 compact + $18 nasal + $3 nasal verification = $100. This is an allocation total, **not an invoice or proof that $100 was spent**. A metadata inventory found recorded tokens for many historical calls but also unknown usage and reservations without a matched completed run. It is not a completed billing reconciliation. No new spend is admitted by this repair.

The right replacement is a shared, dollar-denominated project ledger: record reservation ID on each run and provider request; reserve a conservative token-cost bound atomically; settle from verified usage including cache writes/reads and reasoning; retain holds for interrupted/unknown calls; distinguish provider credit, provider rate limit, and project admission. Historical ledgers must remain intact. Migrating their allowance requires explicit authorization and defensible reconciliation, not deletion of slot files or reuse based on an account screenshot.

## Repair implemented

The previous transport tried to preserve emergency fields by using `z.unknown()` for ancillary fields, with their intended schemas embedded only in descriptions. The resulting provider request had untyped grammar nodes. A description does not impose a JSON type. The HTTP 400s are consistent with this request defect, but live provider confirmation remains pending.

The replacement uses Mastra's public Standard Schema interface: a fully typed, closed JSON schema guides provider output; a separate minimal local envelope preserves completed emergency output for inspection; the full original clinical contract remains mandatory before admitting any patient prose. No extra repair-model call or partial-text publication was introduced. Anthropic documents a constrained JSON Schema subset and HTTP 400 for unsupported features; its adapter also removes unsupported length constraints. [Anthropic structured-output contract](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).

New tests exercise **the installed real Anthropic adapter through intercepted HTTP fetch**, with synthetic keys and responses. They assert typed nodes and closed objects on both Haiku and Opus wire requests, streaming parsing, token accounting, and no fallback to real networking. Existing tests still verify that a malformed query/finding cannot erase a valid emergency signal and that invalid clinical prose is rejected. This is stronger transport coverage than mocking `Agent.stream`, but it is not a live provider or clinical evaluation.

The GUI now distinguishes local allowance exhaustion, HTTP 400 rejection (including historical artifacts), authentication, and rate limiting. Emergency instructions remain visible. Models and historical failure codes/records are unchanged.

## Benchmark evidence: do not merge incompatible leaderboards

### Original HealthBench: Anthropic's September system card

| Model | Raw score | Length-adjusted score |
|---|---:|---:|
| Claude Opus 5 | 67.1 | 57.8 |
| Claude Fable 5.1 | 66.7 | 60.0 |
| Claude Fable 5 | 61.2 | 60.4 |
| Claude Sonnet 5 | 59.2 | 58.7 |

Source: [Fable 5.1 / Mythos 5.1 system card, pp. 198–199](https://www.anthropic.com/claude-fable-5-1-mythos-5-1-system-card). Verified against the original PDF text and rendered charts. These runs used adaptive thinking/max effort, an Opus 4.8 grader, five trials, no tools/custom system prompt, and an Opus 5 refusal fallback for Fable 5.1. Its Professional results are also different from OpenAI's re-evaluation. Opus leads this raw table but not its length-adjusted table; neither is a clinical pass probability.

### OpenAI's September comparison

| Model | HealthBench Professional, length-adjusted |
|---|---:|
| GPT-6 Astra | 63.4 |
| Claude Fable 5 | 60.9 |
| GPT-5.6 Sol | 60.5 |
| Claude Fable 5.1 | 58.1 |
| Claude Opus 5 | 56.4 |

Source: [Astra release, science/health table and footnote 11](https://openai.com/index/gpt-6-astra/). OpenAI re-evaluated the Claude models with GPT-5.4 grading and length-adjusted, unclipped scores; Fable 5.1 used an Opus 5 refusal fallback. This is a provider-run comparison, not independent clinical validation.

Astra's original HealthBench score is **58.1 length-adjusted / 59.7 raw**; Hard is **36.3 / 37.8**. These are not interchangeable with the Professional score or Anthropic's differently graded runs. [Astra system card, Table 6](https://deploymentsafety.openai.com/gpt-6-astra).

Current xAI documentation lists Grok 4.6, but this search did not find a directly comparable, primary-source HealthBench result establishing it as superior. Missing evidence does not mean a poor score. [xAI model documentation](https://docs.x.ai/developers/models).

## Assignment recommendation

Retain Opus as the incumbent and evaluate Astra as the first challenger. Keep intake, cases, retrieved passages, output contract, grader and sampling policy fixed when isolating final-model effects; separately compare the complete live retrieval workflow. Record failures and unfinished runs, emergency misses, unnecessary escalation, appropriate same-day routing, claim support, time to actionable instruction, final-answer latency, and dollar cost. A larger public benchmark score is a candidate-selection signal, not measured lift in this system.

Reproduce Counsel's **103-case filtered emergency subset** separately from the full benchmark: English, exclusion of conditional emergencies and second-hand prompts. Also retain a clearly separate stress set containing those exclusions because the assignment's messages include such contexts. Do not silently apply Counsel's assumed healthy 35-year-old male context to the 50 supplied cases or impute absent history. [Counsel's published method](https://www.counselhealth.com/blog/how-counsel-leveraged-healthbench-to-assess-emergency-escalation).

## Validation and outstanding boundary

- 259 root tests + 99 GUI tests = **358 software tests passed**.
- Type-checking, lint, Next production build and Mastra production build passed.
- Provider inference spend in this repair: **$0**. Current model and keys were not changed.
- Live acceptance of the revised schema, live latency and clinical benefit remain unverified. The local interactive allowance is still closed pending authorized reconciliation/reallocation under the original project ceiling.
