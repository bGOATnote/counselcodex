# Nano and Cascade: identical requests, different decoding budgets

This append-only correction qualifies the frozen
[Cascade comparison plan](LOCAL_CASCADE8B_PLAN_2026-09-15.md). The study compares
**complete local model/runtime packages under identical API request settings**.
It does not match total decoding budgets or isolate model weights. No request,
configuration, fixture, label or historical result is changed by this note.

## Verified runtime difference

Both arms request `think:true`, a JSON schema, temperature 0, seed 42, context
8192 and `num_predict:2048`. All eight Cascade requests archived at this audit
snapshot differ from their matched Nano v2 requests only in `model`.

Cascade uses the embedded GGUF Jinja template and native chat path.
[Ollama v0.32.1](https://github.com/ollama/ollama/blob/v0.32.1/llm/llama_server.go)
sends one `/v1/chat/completions` request, maps `num_predict` to `n_predict`, and
separates the returned content and reasoning fields from that same completion.
The 2048-token cap is therefore shared by reasoning and the final answer.
Its returned `eval_count` comes from that completion's `predicted_n` timing.

Nano uses its native Ollama renderer/parser through the Go-rendered path.
The [tagged structured-output handler](https://github.com/ollama/ollama/blob/v0.32.1/server/routes.go)
first generates reasoning without the schema. On transition to final content,
it cancels that completion, appends the reasoning to the prompt and starts a
second completion with the schema. Both receive the same `opts`; the first
phase's token use is not deducted from the second phase's cap. Nano can thus
receive separate 2048-token caps. Its final returned token metrics do not
aggregate those phases. See the earlier
[Nano accounting correction](LOCAL_NANO_RUNTIME_ACCOUNTING_2026-09-15.md).

Consequently, the Cascade plan's generic wording about a per-phase budget and
final-phase token accounting does not apply to Cascade's native path. Matching
the API value `2048` did not create equal reasoning-plus-answer allowances.

## Direct archived evidence

Character lengths below are measured from the decoded `message.thinking` and
`message.content` strings, not estimated token counts.

| Package and example | Done reason | Reported `eval_count` | Thinking characters | Final characters |
| --- | --- | ---: | ---: | ---: |
| [Cascade 009](../outputs/local-cascade8b-offline-2026-09-15/binding-009-raw.json) | `length` | 2048 | 9319 | 0 |
| [Cascade 017](../outputs/local-cascade8b-offline-2026-09-15/binding-017-raw.json) | `length` | 2048 | 9794 | 89 |
| [Cascade 025](../outputs/local-cascade8b-offline-2026-09-15/binding-025-raw.json) | `length` | 2048 | 9192 | 156 |
| [Cascade 037](../outputs/local-cascade8b-offline-2026-09-15/binding-037-raw.json) | `stop` | 1839 | 7828 | 546 |
| [Nano v2 037](../outputs/local-nano-offline-v2-2026-09-15/binding-037-raw.json) | `stop` | 100 | 2367 | 418 |

The three Cascade `length` responses contain no complete final critic output;
their saved results are `LOCAL_INCOMPLETE:length`. They exhausted the shared
cap rather than the 120-second HTTP deadline. Cascade 037 completes a valid
final output before the cap. Nano 037's reported 100 tokens must not be read
as its total workload or used to calculate a cross-package token-speed ratio.
Whole-request wall time remains the operational latency measure; it still
reflects each package's actual work, not equal compute.

## Decision supported by these observations

Three incomplete first attempts already make the predeclared requirement of
23/24 valid outputs unattainable, even if every remaining example succeeds.
This is sufficient to reject **this bounded Cascade configuration** for the
proposed unattended critic role. Preserve every attempted row and the frozen
denominator; do not salvage verdicts from reasoning, repair partial JSON,
retry failed rows or increase the cap inside this study.

No additional 8B tuning is needed to support that limited operational decision.
The evidence does not establish that Cascade has worse clinical reasoning,
that its weights are inferior, or that a larger shared cap would fail. Testing
those questions would require a separately frozen comparison with explicit
aggregate-budget accounting. Neither this runtime audit nor the authored
fixture score supplies clinical validation or permission to replace `/candidate`
Opus. This audit performed no inference and inspected no validation outputs.
