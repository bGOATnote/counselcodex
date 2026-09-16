# Actual-browser reproduction and repair — 2026-09-11

## Scope and acceptance

The user reported a 26-second first response and failures on the next two attempts. This repair is tested through the actual browser at `http://localhost:4120/`, not substituted with HTTP calls or fixture tests. Opus remains the final model; no Astra comparison or benchmark campaign was run. GUI runs use the existing manual-run spending policy.

Browser testing is a functional acceptance check, **not clinical validation or a controlled latency benchmark**. The local development server, provider load, cold schemas and retrieval variability are not controlled. A completed run does not establish a correct or evidence-supported clinical decision.

## Verified causes and changes

1. The user's failed C04 and C01 runs (`593ba228-5015-427f-bd7c-c23e18d00427`, `9bab9d08-5e9d-43d8-a37e-0fba6e2c25b8`) both returned model output. Their sole schema error was `answer.evidenceLimitations` exceeding 500 characters. The entire assessment was discarded for a writing target. The adaptive profile now preserves up to 4,000 characters, reports the 500-character target as a non-admission presentation check, and renders longer notes in an expandable section. The original text is not truncated. Other clinical admission checks remain active.
2. Format failures now name the invalid field paths/codes in the checks, and have a distinct GUI explanation instead of a generic unavailable/budget message. Rejected prose stays hidden.
3. The fast model no longer duplicates the final model's red-flag inventory. It can issue a source-quoted same-day action before retrieval. The final model still independently assesses the original message and available findings. Omitted intake findings mean **not collected**, not absent.
4. A valid immediate/same-day referral is not withheld for an additional intake question. An unnecessary question no longer erases otherwise valid research queries; the original model output remains in the run, while the downstream plan suppresses the question. Invalid quotations are still rejected.
5. A live C01 run added unsupported nasal-irrigation advice and failed the existing guard. Instructions now explicitly exclude unsupported procedural self-care, consistent with that guard. They also distinguish local redness from unreported spreading redness and request shorter responses without hard-truncating safety content. These instructions do not guarantee compliance.
6. Rapid case selection immediately after reload could precede React initialization and be overwritten by the default C04. Server-rendered controls now stay disabled until their handlers are ready. Browser testing confirmed C01 selection survives initialization before submission.
7. `AGENTS.md` now requires actual-browser consecutive-case and follow-up checks before a GUI handoff, with every failure retained.

## All exploratory browser runs retained

| Run ID | Version | Actual input | Outcome | Server completion |
|---|---|---|---|---:|
| `8648185e-4dd8-47dc-a684-5740fe705956` | v4 | C01 | Schema rejection: long evidence-limitations note | 21.64 s |
| `ae5bdf8f-ff0a-40f5-a8dc-725122bbdcd9` | v5 | C04 | Completed; fast model timed out, no early action | 24.30 s |
| `86e0e534-9511-42a3-b40f-a3fa83f68587` | v5 | C04 repeat | Completed; early same-day instruction at 4.93 s; unsupported spreading-redness wording observed | 21.68 s |
| `e011064d-3b51-4aaa-b31b-da28acb49792` | v5 | C01 | Clinical-contract rejection: nasal irrigation without supporting guidance | 21.82 s |
| `ec71fd23-a98b-47b1-9b9c-11146750edd2` | v6 | C04 | Completed; a requested C01 selection was lost during page initialization, so this is **not** a C01 test | 17.68 s |
| `ab6acc41-9d37-4eff-b4c5-81d9d6123796` | v6 | C01 | Server completed; UI hot reload interrupted visual verification, so not counted as GUI acceptance | 21.57 s |

No attempt was removed or relabelled as a successful test of a different case. Files live under the gitignored `apps/evaluation/.local/disposition-agent-v3/runs/` and corresponding `events/`; traces are persisted in that local runtime's database. Original CSV data, physician reviews and historical budget records were not changed.

## Fixed browser acceptance sequence — v7

Each sample was selected, its actual text checked, and **Assess message** clicked. The visible final result and timing were read. Changing cases cleared the old response.

| Case | Run ID | Browser-visible state | Early action (server) | Browser completion |
|---|---|---|---:|---:|
| C01 | `cd02632b-149c-4734-a288-ed809103933a` | Self care; completed, evidence-coverage failure visible | None | 18.43 s |
| C02 | `e3f7abf1-5eb9-4eb3-8144-9a86dd42dd2c` | Emergency now; 911 instruction visibly preceded explanation | 0.006 s | 12.98 s |
| C03 | `67f61614-cacd-41c6-9066-cd7ab819399d` | Async physician; completed, abstract citation with applicability limits | None | 26.43 s |
| C04 | `7e75b131-6bbf-4a86-9a6b-dcb53b208e93` | Same-day in person; completed, evidence-coverage failure visible | 21.23 s | 21.29 s |
| New headache | `843e4cc7-f980-4376-9351-b2b31ed6bf57` | Awaiting input; asked about sudden peak, severity and associated features; no settled low-acuity advice | None | 22.23 s |
| Headache follow-up | `6e3cb39c-fa25-48ae-9c50-099ffa886327` | Emergency now after worst-ever/seconds-to-peak update; original message preserved; abstract citation shown | 3.10 s | 20.16 s |

The new input was exactly `I have a headache that started today.` The **Update assessment** form was filled with `It hit maximum intensity within seconds and is the worst headache I have ever had.` and submitted through the browser. The final textarea retained both the original and the additional patient information, without promoting the assistant's question into reported symptoms. The final emergency response was visually inspected as well as read from the accessibility tree. The question arrived only at 22.23 seconds, a latency failure.

All six final-sequence interactions reached a usable UI state: five completed answers and one genuine pending clarification. This is **not six clinically validated answers**, nor evidence that the latency target is met. Emergency action times above are server event timestamps; only C02's early instruction was also directly observed in the browser before completion. Browser receipt is not a paint measurement.

## Verification and accounting

- Final source: adaptive workflow v7, existing `anthropic/claude-haiku-4-5` intake and `anthropic/claude-opus-5` final model, unchanged high effort. No alternate model or premium-speed mode enabled.
- `npm test`: 265 tests passed across its five suites. `npm run review:test`: 100 passed. Type-check, lint, Next production build and Mastra production build all passed on the final source.
- New regression coverage: long evidence notes remain intact and do not erase answers; notes over the resource bound and non-string values are rejected; the presentation warning cannot bypass clinical reassurance checks; same-day source identity and no emergency downgrade; early care before retrieval; valid queries retained when an extra question cannot delay care; SSR controls disabled until interactive; distinct format-error presentation; long evidence notes expandable.
- Twelve paid GUI-initiated attempts in total, including exploratory failures and the hot-reload-interrupted visual test. Twenty-four provider calls: twelve Haiku, twelve Opus. All twelve response artifacts, event logs and traces report persisted.
- Known token counts: Haiku 15,104 input / 1,093 output; Opus 64,403 input / 14,099 output. One timed-out Haiku call has unknown usage and is not assigned zero cost. At [standard published rates](https://platform.claude.com/docs/en/about-claude/pricing) of $1/$5 per million Haiku input/output and $5/$25 for Opus, **known-token estimated cost is $0.6951**, excluding the unknown call, cache/residency adjustments and any provider-account adjustments. This is not a reconciled invoice total or a claim about the remaining balance.
- Original CSV, saved physician reviews, previous results and budget ledgers unchanged. No benchmark or model-comparison run performed. Unrelated README and coding-audit edits excluded from this repair.

## Remaining failures of the target standard

- **Latency is unresolved:** C03 still took 26.4 seconds. C04's fast model joined noncontiguous text into an invalid quotation; the guard rejected it, so action waited for Opus. The four-case sequence is not evidence that the speed requirement has been met.
- **Research coverage is unresolved:** C01, C02 and C04 lacked applicable cited support in this sequence. C03's quotation/applicability checks are not an independent clinical entailment grade.
- **Intake is inconsistent:** C01 did not ask the requested surgery/trauma question. A prompt requesting it is not proof that it happens reliably.
- **Clinical quality is not established:** unsupported progression appeared in an exploratory answer. More wording-specific regressions cannot stand in for independent clinical evaluation across unseen cases.
- **No calibrated model comparison yet:** Opus and its high-effort policy remain unchanged; comparisons await GUI/format approval.

## Provider documentation checked

[Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) distinguishes supported provider schema constraints from local validation and documents cold-schema overhead. [Effort documentation](https://platform.claude.com/docs/en/build-with-claude/effort) recommends evaluating quality before reducing effort; this repair did not lower it. [Fast mode](https://platform.claude.com/docs/en/build-with-claude/fast-mode) is a separately admitted research-preview service with premium pricing and faster output generation, not a guaranteed improvement to time to first token. It was researched but not enabled or represented as available on this account.

The next latency work should preserve a fixed clinical test set and record every failure while isolating output length, retrieval contribution and provider speed/effort effects. Do not relabel an acknowledgement as actionable medical advice, release unvalidated partial prose, or hide failed responses to make timing look better.
