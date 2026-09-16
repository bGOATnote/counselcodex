# Astra endpoint capability check

The configured OpenAI key can access `gpt-6-astra`: the read-only model lookup
returned HTTP 200. A separate, non-clinical Responses request using
`reasoning.effort: "ultra"` returned HTTP 400, identifying that field as invalid
and listing `xhigh` and `max` among accepted values. No patient case or physician
label was used in this capability check.

The experiment therefore tests **Astra xhigh and Astra max**. Max is the highest
effort listed in the [official Astra API documentation](https://developers.openai.com/api/docs/models/gpt-6-astra).
It is not labeled as Codex Ultra, and the results cannot establish Ultra's
performance. This also preserves a direct provider-call protocol instead of
introducing a coding-agent harness and its additional instructions.

- `model-preflight.json`: model lookup receipt.
- `ultra-capability.json`: exact non-clinical request and validation-error receipt.
- The rejected capability request is separate from the 100 patient-case calls.
  It returned no token usage or generated output; no measured token cost is
  attributed to it in the cohort comparison.

The API documentation lists $10/M input, $50/M output, $1/M cached input, and
$12.50/M cache writes. Cohort reports use a standard uncached estimate and
separate conservative accounting; neither is a provider invoice.
