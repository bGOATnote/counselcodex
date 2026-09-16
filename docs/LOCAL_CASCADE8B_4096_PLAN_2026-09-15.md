# One shared-budget correction for Cascade 8B

## Why this additional development arm is justified

The 2048-token configuration failed: 16/24 valid outputs and eight exhausted
shared caps. Every completed response matched its label and had valid spans,
but that conditional 16/16 is not overall accuracy. A runtime audit established
that Nano receives separate caps for reasoning and final JSON, while Cascade
shares one cap. These are concrete new observations supporting one budget-only
trial before any validation or mining output has been generated.

This is a disclosed amendment to the earlier single-model-comparison limit.
The independent evaluation audit verified the eight `length` failures and
recommended a bounded new arm. Preserve every old request and failure; test
all 24 development items again under a new identity, not just the failed rows.
No additional prompt, sampler, model, schema or threshold search follows this
arm. If it fails, stop binding development. The original four-hour deadline
remains 2026-09-15 19:37:46 UTC.

## Frozen intervention

Use the unchanged `counsel-cascade-8b-q5` digest and original binding prompt.
Change `num_predict` from 2048 to **4096 shared tokens**. Keep `think:true`,
temperature 0, seed 42, context 8192, 120-second whole-request timeout, schemas,
packets/order, labels, one worker, exact-span rules and all fixed denominators.
The context guard now represents Cascade's verified **one** decoding phase.
This harmonizes maximum decoding allowance with Nano's two 2048-token caps;
it does not establish equal actual compute, reasoning length or throughput.

The largest of all 60 formatted user inputs is 3354 UTF-8 bytes. The guard
reserves 4096 generated tokens and 512 template tokens, totaling 7962 under
the 8192 context limit. It rejects overlength input rather than truncating
patient/source qualifiers. Runtime prompt counts and request outcomes remain
observable; no automatic context expansion or output repair is allowed.
The independent source audit verified that the native handler uses JSON schema
as a decoding grammar, without inserting it in the rendered prompt. The exact
embedded template adds 128 UTF-8 bytes for this one-user-message/no-tools branch,
within the 512-token reserve. See
[pinned llama.cpp rendering](https://github.com/ggml-org/llama.cpp/blob/b9888/common/chat.cpp)
and its [grammar generator](https://github.com/ggml-org/llama.cpp/blob/b9888/common/chat-auto-parser-generator.cpp#L44).

Plan: `outputs/local-cascade8b-4096-2026-09-15`, SHA256
`ffa5153b58eceeb0bab358ea8b46a6574e831678017aee5a19cd54ff942b27fb`.
The scoring-only JSON-key-order correction is already tested and frozen;
generation still requires source hashes to match this new plan.

Run all 24 development items once. The original utility gate is unchanged.
Only if it passes, write the selection artifact before running all 24 authored
validation items once. The selector now enforces the development gate in code.
Do not revise after validation or pool these results with prior arms.

## Mining preflight amendment

No mining generation occurred at 2048; its attempted preflight stopped at the
old JSON reader. For the already-planned eight mining and four negative tasks,
use this frozen 4096 Cascade configuration and Nano v2 with its separate
2048-token phase caps. Keep all mining prompts and inputs unchanged. The total
mining scope remains **24 first requests across two models**, without retries
or replacement candidates. This amendment is recorded before the first output.

Review every proposed issue and negative independently as an engineering
hypothesis. A failed binding gate remains failed even if some drafting is
useful. Nothing changes physician gold, V25, `/candidate`, paid providers or
clinical release authority. No paid inference or model download is needed.
