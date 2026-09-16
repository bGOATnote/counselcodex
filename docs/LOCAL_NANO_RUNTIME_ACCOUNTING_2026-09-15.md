# Native thinking: accounting correction discovered during execution

The v2 plan's statement that `num_predict:2048` is a total `/api/chat` budget
was incorrect for this Ollama 0.32.1 structured-output path. This note corrects
the interpretation without rewriting the frozen plan, requests or results.

The [tagged chat handler](https://github.com/ollama/ollama/blob/v0.32.1/server/routes.go)
first generates reasoning without the JSON grammar, then appends that reasoning
and starts a separate internal completion with the schema. Both receive the
same options. Consequently 2048 is a **per-internal-completion cap**, with a
120-second whole-request deadline. One logged local HTTP request may contain
two decode phases; it is not necessarily one internal model completion.

The final API `eval_count` and `eval_duration` must be reported as final-reported
values, not verified total reasoning-plus-answer tokens or throughput. The
runner retains `message.thinking`, its character count, the raw API body and
whole-request monotonic wall time. Compare configurations by whole-request wall
time; do not use final-phase token speed as total-work throughput. No paid
provider is involved in either phase.

The same runtime review checked every frozen v2 task before validation/mining:
maximum prompt UTF-8 bytes 3354; reserving two 2048-token phases plus 512 template
tokens gives a conservative 7962 bound, within the 8192 context. The corpus
does not need truncation. For new inputs, use this stronger two-phase bound;
the initial runner's one-phase input check alone is insufficient for arbitrary
larger thinking-mode packets. Keep this limitation visible until the reusable
input guard is updated after the frozen experiment.

Native renderer/parser were already present in the original import. No template
replacement, model swap, prompt edit or new generation was performed for this
accounting investigation. Truncated/missing final answers remain unsuccessful
first attempts; never extract a verdict from the reasoning field.
