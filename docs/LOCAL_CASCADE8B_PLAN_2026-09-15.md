# One optional 8B comparison, frozen before scored generation

Nano's three development configurations failed the declared utility gate.
The user allowed the existing smaller model when useful; this is the single
additional model comparison justified in the record-scope rejection report.

Use `counsel-cascade-8b-q5`, digest
`9f4b89cbee529c485cbd37415e3ca8b59578557253e0fdf5a4a043f388575fdd`.
It was imported from the existing 5,851,113,536-byte Q5_K_M GGUF, with no
download. Nano is unloaded. One worker runs on the same M4 Max 48 GB Mac.

## Controlled comparison

Restore the original binding prompt used by Nano v2. Preserve its schema,
`think:true`, temperature 0, seed 42, context 8192, `num_predict:2048`, task
packets/order, labels, first-attempt accounting and utility thresholds. Model
identity and its native model-specific chat rendering are the intervention.
The corrected two-phase context guard does not change any accepted request.
Whole HTTP wall time is the latency measure; final-reported token counts do
not describe the full two-phase thinking workload.

Plan: `outputs/local-cascade8b-offline-2026-09-15`, SHA256
`71e7d0baf6ff75cf13de24f9c21f23ba033d338dcf42fb821ccb752d25f6e12e`.
Run 24 development examples once. Require at least 10/12 usable defect
detections, 10/12 supported controls, at most one false alarm, 23/24 valid
schemas and 23/24 valid literal spans. If it passes, record selection before
the one authored validation pass. Do not revise prompts after validation.
If it fails, neither model has earned unattended critic use; mining can
still be evaluated as exploratory suggestions requiring independent review.
The 12 mining/negative tasks use their already-frozen separate prompts.

## Import and incidental smoke accounting

The GGUF embeds NVIDIA's ChatML template and thinking directive. Ollama's
displayed default `{{ .Prompt }}` does not establish missing chat formatting:
models without a Go template or renderer use the native embedded Jinja path.
See [NVIDIA's model card](https://huggingface.co/nvidia/Nemotron-Cascade-8B-Thinking#chat-template)
and [Ollama 0.32.1 routing](https://github.com/ollama/ollama/blob/v0.32.1/server/routes.go).
No generic Qwen/Nano template was added.

An attempted non-generating template probe used `debug_render_only` instead
of the actual `_debug_render_only` field. The server ignored that unknown
field and generated one arithmetic smoke answer to “calculate 1+1?”. It
returned separate thinking and a correct answer, with 4.298 seconds server
total, 2.430 seconds load and 104 reported generated tokens. This is one
additional local inference, excluded from scored studies and their call
counts. It incurred no paid provider call and exposed no evaluation label.
The model is warm at the start of this study; report that latency limitation.

No physician gold enters these requests. V25, production providers, release
checks and historical scorecards remain unchanged. Authored textual checks
cannot establish clinical alignment. Deadline: 2026-09-15 19:37:46 UTC.
