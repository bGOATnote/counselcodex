# Cache telemetry and sprint accounting — September 14, 2026

## Verified meaning

The installed `@mastra/core` version is **1.64.0**. Its OpenAI adapter reads provider `input_tokens_details.cache_write_tokens` (Responses) or `prompt_tokens_details.cache_write_tokens` (Chat Completions); it does **not** derive cache writes from the uncached remainder. Mastra maps that value to the public `usage.cacheCreationInputTokens` field.

Exact installed implementation sites:

- `node_modules/@mastra/core/dist/dist-rYWLu0px.js:4001` — Chat Completions cache-write field.
- `node_modules/@mastra/core/dist/dist-rYWLu0px.js:6178` — Responses cache-write field.
- `node_modules/@mastra/core/dist/stream-D9EXCTM5.js:1149` — normalized `cacheCreationInputTokens` mapping.
- `node_modules/@mastra/core/dist/trip-wire-D8UqG8U-.js:4408` — public aggregated usage, including preserved `raw` usage.

These generated filenames describe this installed dependency, not a stable upstream import API. `src/disposition/transport.ts` records public usage fields only. Its cache counts are **Mastra-reported cache reads/writes, not invoice-verified charges**; absent values remain unknown. The current run artifacts do not retain raw provider usage. Mastra's aggregate `raw` field may represent only the last step, so future multi-step accounting must not mistake it for all-step totals.

## Current official pricing

The earlier assumption that OpenAI has no cache-write charge is outdated for Astra. The [official Astra model page](https://developers.openai.com/api/docs/models/gpt-6-astra) lists standard rates per million tokens: ordinary input **$10**, cached input **$1**, cache writes **$12.50**, output **$50**. The [official prompt-caching guide](https://developers.openai.com/api/docs/guides/prompt-caching) documents writes at 1.25 times ordinary input for GPT-5.6 and later, and subtracts reads and writes from total input before applying the ordinary rate. The [Responses reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/create) includes `usage.input_tokens_details.cache_write_tokens`. Pages opened September 14, 2026; actual account/service-tier billing still requires reconciliation.

Run `333c0f75-eb4c-41ff-af4e-e2fd1fb92bb0` recorded 9,388 input tokens: 4,202 reads, 5,183 writes, and therefore 3 ordinary tokens. With 1,207 output tokens, its standard-price estimate is **$0.1293695**. The historical flat-input helper returns **$0.154230**. Although that overestimates this run, it can underestimate cold-write runs. Historical estimates must not be described as universally conservative.

## Current sprint reserve, not an invoice

The parent/operator applies a **25% contingency to the entire known token-cost estimate**, including output, for the current authorized $40 sprint. This intentionally differs from exact provider cache pricing. Previously written experiment results remain immutable.

| Reserve component | USD |
|---|---:|
| Known token estimates: 14.413616 × 1.25 | 18.017020 |
| Retained unknown/DNS-failure reservations | 11.340570 |
| Embedding reserve | 0.100000 |
| Accounted/reserved before next studies | **29.457590** |
| Next allocations: (1 safety + 5 comparison + optional 2 GUI) × 1.25 | **10.000000** |
| Maximum planned accounted/reserved total | **39.457590** |

This is the operator's reconciliation snapshot, not permission to replenish or dispatch calls independently. Unknown usage retains its existing reservation; do not discount failures or count the 25% contingency twice. Unexpected prices, usage, tier changes or tool fees require renewed reconciliation before further dispatch.

## Deferred helper correction

`src/evaluation/clinical-study-budget.ts:58` currently estimates total input/output using `STUDY_PRICING` and ignores cache metadata; historical experiment scripts also contain flat-rate formulas. Preserve those frozen methods and artifacts. A future versioned helper should return **base estimate, cache-aware estimate, reserve, pricing version, and unknown components separately**; validate finite nonnegative integer counts, require reads + writes ≤ total input, account per model/step and cache lifetime, and retain conservative reservations when details are unavailable. Add cold-write, cache-hit, mixed, missing/invalid usage, multi-step, failure and modifier tests before changing any live ledger. No source or ledger behavior was changed for this audit.
