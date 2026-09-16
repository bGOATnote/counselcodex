# Nano mining-only comparison: unchanged best measured settings

This completes the previously frozen two-model mining plan. Cascade 4096
finished all 12 requests: three of eight critique requests and all four
negative drafts returned complete schema-valid outputs with literal spans;
five critiques exhausted the cap. Independent semantic review is separate.

Use Nano's v2 model/digest, original mining/negative prompts, temperature 0,
seed 42, native thinking, context 8192 and 2048 tokens per internal phase.
All 12 patient/draft/source packets and their order are unchanged. Cascade
used one shared 4096 allowance; this compares package-level behavior with
the same maximum allowance, not equal actual compute or reasoning length.
Keep one loaded model and one worker. Cascade has been unloaded.

Plan: `outputs/local-nano-mining-2026-09-15`, SHA256
`a90fa05739c9f36ad1866f8b1a682112b81c03eead002d61517be7af760ee641`.
Run **only the mining split**. The plan also stores the original authored
binding rows for identity/provenance; all will remain unattempted in this new
study. This is not another binding revision or validation pass. All five
completed binding configurations remain failures of the original gate.

The corrected JSON reader and a terminal-result selection guard are frozen
before generation. Selection now requires every development result artifact
to exist before recomputing the gate, so an in-flight 24th response cannot
change a selected decision. Focused tests cover the missing-result condition,
JSON key order, value tampering, fixed denominators and no retries; 12/12 pass,
and typecheck passes. No prior study used selection or reached validation.

Keep failed first attempts and do not salvage partial reasoning as completed
proposals. A separate engineering agent reviews the saved finals against the
frozen inputs. This is not human adjudication or clinical approval. No gold,
live release, paid model, source corpus or historical result is changed.
No extra examples or replacement attempts follow this batch. The original
19:37:46 UTC deadline remains in force. Paid inference calls: zero.
