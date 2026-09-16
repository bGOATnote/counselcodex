# Nano v2: the single development revision

V1's non-thinking pass failed: 10/12 false alarms on clean controls. All
outputs are preserved in commit `79bceae`, which also contains the exact v1
runner. Check out that commit to re-score/reproduce the v1 source freeze.
Do not edit old hashes to accept newer runner code.

Runtime inspection confirmed the imported model has native
`RENDERER nemotron-3-nano` / `PARSER nemotron-3-nano`; the displayed template
`{{ .Prompt }}` is not a defect. The [Ollama 0.32.1 renderer path](https://github.com/ollama/ollama/blob/v0.32.1/server/prompt.go)
uses the configured native renderer. [NVIDIA's Nano model card](https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16)
describes thinking as the default mode. [Ollama thinking support](https://docs.ollama.com/capabilities/thinking)
provides separate reasoning and final answer fields.

## Intervention frozen before v2 generation

Enable native `think:true` and raise total `num_predict` from 768 to 2048.
Thinking and final content share that output budget. Keep the weights/digest,
temperature 0, seed 42, context 8192, prompt, schema, packets, labels, task order,
serial worker, timeout, utility gate and no-retry policy unchanged.

This is a **reasoning-mode plus output-budget comparison**, not an isolated
estimate of either setting's effect. Retained greedy decoding controls the
comparison; it is not claimed to be NVIDIA's optimal reasoning sampler.
No token budget is reserved for final JSON. `done_reason:length`, missing final
content or invalid schema remains a failed first attempt with raw reasoning
retained. Do not repair, rerun, change temperature or add examples after seeing
validation. The original patient/source field projection stays unchanged.

Run the same 24 development rows once. If v2 passes the offline utility gate,
select it before running the 24 authored validation rows once and the 12
mining/negative-generation tasks. If it fails, report the failure; no further
development revision is authorized by this preregistration. An 8B comparison
would require a separately justified plan, not silent model shopping.

The original four-hour end time remains 2026-09-15 19:37:46 UTC. No paid calls,
gold changes, live gate changes or clinical promotion follow from this study.
