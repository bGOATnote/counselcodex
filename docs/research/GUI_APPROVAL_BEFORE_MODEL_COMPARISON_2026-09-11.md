# GUI review gate before model comparison

## User direction

On September 11 the user prioritized approving the response format and GUI before comparing Opus with Astra. The provider-balance screenshot demonstrates funds availability, not a project ceiling. The user clarified that funds can be replenished. The original $100 instruction predates that clarification; it was not inferred from the screenshot.

The GUI is at http://localhost:4120/. It remains local, not deployed to patients or published as an official Counsel service.

## Proposed experience to approve

1. Select an original Counsel message or enter a new fictional message. Original labels are not model input or reference truth.
2. Show an immediate emergency instruction when warranted. Otherwise ask a concise question only when the missing fact can change setting or timing; do not postpone already-required in-person care.
3. Produce one disposition with explicit timing, one concise patient-facing message, a brief reason/differential, and the evidence actually used. Preserve unknown findings as unknown, including unmeasured vital signs.
4. Keep detailed red flags, provenance, response checks and Mastra execution details expandable. Never display a rejected draft as an approved recommendation.

The incumbent remains Haiku intake plus Opus disposition in the adaptive Mastra workflow. No Astra calls or model comparison were run. A smaller screen or a passed schema does not establish clinical quality.

## Admission correction

The local GUI route explicitly selects `manual-gui-v1`. It no longer consumes a fixed lifetime count of twelve demo slots. Each user request runs the existing bounded two-call incumbent graph: one intake and one final assessment; no critic loop, provider retries, or automatic resubmission. Existing prompt, output-token, deadline, request-size, local-origin and concurrent-request bounds remain. This is a call/work bound, **not a dollar cap** or a guarantee about provider billing after cancellation.

The policy is recorded on each run and its start event; token usage and failures remain in saved artifacts. Unknown usage stays unknown. Historical budget directories were not changed. Default programmatic runtimes, Mastra Studio and experiment scripts retain their existing reserved admission. Removing the manual GUI slot cap does not authorize an automated sweep or a model comparison. The two-case HTTP smoke script requires explicit `--live`; it is not invoked automatically by the UI.

Tests exhaust the old ledger, execute/restart the manual GUI runtime, verify two calls and persisted policy, then confirm default experiments still refuse admission. The old ledger remains byte-identical. An unsupported manual profile is refused.

## Live smoke observations — all attempts retained

These are development checks on already-seen cases, not an evaluation of clinical efficacy. HTTP receipt is not browser paint time. Each assessment dispatched Haiku and Opus once. No automatic retries were used.

| Attempt | Case | First actionable receipt | Final receipt | Outcome |
|---|---|---:|---:|---|
| `021c9f3e-88d1-4eda-a599-84e57d301ec4` | C01 | None | 27.242 s | Intake timed out at 8 s; Opus draft rejected for inferred absence of dehydration and a delayed-worsening precaution |
| `8c265c85-0d26-4821-abe1-7942c0d4439c` | C02 | 0.028 s | 28.819 s | Emergency-now response completed; no applicable cited support. Draft added medication advice outside intended routing scope |
| `71a6ee45-4a62-498d-8604-27f19a541ff0` | C01 | None | 27.203 s | After prompt revision, intake succeeded; draft still rejected for blanket reassurance. Rejection retained |
| `e8c763c9-2663-46c2-a94e-07763cf77424` | C02 | 0.022 s | 21.601 s | After revision, concise emergency response without added medication instructions; evidence coverage still failed |

Artifacts live in `apps/evaluation/.local/disposition-agent-v3/runs/`, with matching event files and two immutable HTTP observation directories dated `2026-09-11T15-53-02.099Z` and `2026-09-11T15-55-20.208Z`. All four had confirmed run, event and trace persistence. The versioned prompt revision is `adaptive-disposition/v4`: shorter intake and reply targets, simpler initial search concepts, explicit attribution boundaries, separated worsening/persistence instructions, and no new emergency medication treatment. It adds no model call and does not weaken existing checks.

Eight calls total: seven returned recorded usage (29,301 input tokens / 5,743 output tokens across both model roles); one timed-out intake has unknown usage. These counts are not an invoice, do not account for unreported cache categories, and must not be reported as $0 or an exact settled dollar charge. Both models are Anthropic models; no OpenAI inference was used.

## Remaining blockers to presentation readiness

- C01 still fails the response contract. The UI now explains that a draft was withheld rather than suggesting budget exhaustion. Do not retry until a favorable answer appears and report only the favorable run.
- Retrieval did not supply useful emergency-disposition evidence for C02. Abstract retrieval succeeding technically is not evidence lift. Missing evidence does not cancel the emergency instruction.
- Final-answer latency remains over twenty seconds in these checks. Millisecond deterministic emergency notices are not millisecond model reasoning.
- The first C02 answer's medication advice was not caught by deterministic validation. The prompt revision removed it in one repeat; that is not a robust medication-safety guarantee.
- GUI format approval is distinct from clinical-content approval and neither establishes deployment readiness.

## Comparison gate — not started

Verification for this change: 260 root tests and 99 GUI tests passed, as did type-checking, lint, the Next production build and the Mastra production build. Those software checks do not resolve the live clinical and retrieval failures above.

After GUI/format approval and resolution of these failures, retain Opus as incumbent and use Astra as the first challenger. Freeze intake, cases, retrieved passages, output contract, grader and sampling policy for the final-model experiment; evaluate the complete live-retrieval workflow separately. Include every attempted and unfinished run. Measure emergency misses, unnecessary escalation, correct same-day routing, claim support, time to actionable instruction, final latency and reconciled dollar cost.

Reproduce [Counsel's published 103-case filtered emergency subset](https://www.counselhealth.com/blog/how-counsel-leveraged-healthbench-to-assess-emergency-escalation) separately from the full benchmark: English, excluding conditional emergencies and second-hand prompts. Maintain a separately reported stress set with those excluded contexts. Do not impute the blog's assumed healthy 35-year-old male context to the supplied 50 cases. Public benchmark scores select challengers; they do not prove lift here.
