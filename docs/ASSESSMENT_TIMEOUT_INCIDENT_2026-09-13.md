# Assessment timeout incident — September 13, 2026

## Confirmed cause and clinical impact

Two saved v37 runs reached the application's **50-second final-model deadline** while Opus was streaming. Neither was a credit-limit failure. The intake calls completed normally. No incomplete model prose was admitted as an answer.

| Case | Run | Total elapsed | Final-model elapsed | First text from final model | Outcome |
| --- | --- | ---: | ---: | ---: | --- |
| C11, localized rash after gardening | `5d417780-164d-418f-a246-884ca5953a88` | 55.749 s | 50.003 s | 6.641 s | MODEL_TIMEOUT; no completed route |
| C08, thunderclap headache | `ffe1e595-b169-4bac-8d62-49a983778a29` | 56.316 s | 50.003 s | 4.009 s | MODEL_TIMEOUT; emergency action retained |

For C08, the durable events record **emergency-department-now guidance at 9 ms**, followed by **911 guidance at 3.963 seconds**. The early commentary conflated these two messages; 911 itself was not emitted at 9 ms. The final backend state was `review_required`, with the EMS instruction retained. The GUI nevertheless used the generic heading “Assessment unavailable,” visually demoting the emergency action. The screenshot of C11 correctly has no earlier action; the absence of an action does not establish low risk.

The existing telemetry establishes timeout during generation, not the provider's internal reason for slow decoding. It does not measure grammar compilation or provider load. Missing usage on these interrupted calls remains **unknown**, not free.

## Repair

- Incomplete emergency and same-day results retain the same prominent action card used during generation. The explanation failure appears beneath it; the run remains incomplete and is not converted into a successful assessment.
- MODEL_TIMEOUT has a specific explanation, distinct from billing, authentication, rate limiting, schema rejection and clinical validation failure. A case without a prior safety action does not acquire an invented emergency or self-care route.
- v38 uses one stable, fully typed final-response grammar. Sources receive request-local integer references in the prompt. Both citation and supporting-passage references resolve against that exact run's retrieved passages before the existing membership, quote and applicability checks. Out-of-range, negative, fractional, string and absent references fail closed. Provider objects and historical artifacts are not rewritten.
- Stream telemetry now records last text arrival, delta count and character count, including on failure. It retains no partial prose and does not fabricate missing token usage.

Anthropic documents compilation latency for a new structured-output schema and grammar caching for subsequent uses. Removing the per-retrieval ID enum is a plausible optimization, **not a demonstrated explanation for all observed slowdowns**. The timeout, models, effort, token ceiling, retrieval implementation and clinical validation gates were not relaxed. [Anthropic structured-output documentation](https://platform.claude.com/docs/en/build-with-claude/structured-outputs#grammar-compilation-and-caching), accessed September 13, 2026.

## Actual GUI verification

The existing production server initially still ran v37. Two browser attempts were therefore retained as **baseline**, not patch verification. After the Next production build passed, the exact loopback server was restarted. Each repaired artifact confirms `adaptive-disposition/v38`.

| Build / case | Run ID | Server completion | Browser receipt | Outcome |
| --- | --- | ---: | ---: | --- |
| v37 baseline C11 | `65889f71-0eef-4ce7-a648-8d1134fe4102` | 23.374 s | 23.39 s | Complete, self care |
| v37 baseline C08 | `7ba447a6-2383-44fb-aaf6-1c86ae06d1dd` | 50.084 s | 50.09 s | Complete, emergency |
| v38 C11 | `cb9fdf29-4eb6-42a3-92a2-4534a1eb82ea` | 21.197 s | 21.22 s | Complete, self care |
| v38 C08 | `b6fec1ac-1e63-42b6-b6cf-10c493210a0c` | 22.776 s | 22.79 s | Complete, emergency |
| v38 C13 | `7ad1b47e-d5b8-4697-a0e2-1913b6f20da7` | 32.040 s | 32.05 s | Complete, priority async |
| v38 C13 + synthetic gradual-onset answer | `99850f19-eb7e-4c9a-86ee-5ff5f0055b9b` | 25.572 s | 25.59 s | Complete, standard async |

C08's repaired emergency action was visibly present while the model was still running: initial ED instruction at 7 ms, EMS instruction at 4.236 s. The browser received the finished response at 22.79 s; these are not paint measurements. C13 preserved the original message when adding the synthetic update. No reviewer answers or clinician acknowledgements were entered. The new intake question in that update was unnecessary according to the independent judge; completion is not a clinical pass.

Four repaired GUI attempts completed without a timeout. This is a small, nonrandomized incident retest, with variable retrieval and dependent cases—not proof of reliability, clinical accuracy, or causal latency improvement. No reruns or failures were dropped. [Machine-readable attempt ledger](../outputs/assessment-timeout-incident-2026-09-13.json) includes raw-artifact hashes, generation timing, cost estimates and independent-review outcomes. Original private run files remain in `apps/evaluation/.local/disposition-agent-v3/runs/`.

## Verification and remaining gates

- Root tests: 331 passed; GUI/storage/HTTP tests: 123 passed; **454 total**. Targeted tests include mid-stream timeout, emergency/same-day failure presentation, no-action failure, reference membership and per-run isolation. These are software tests, not patient-outcome measurements.
- Root type-check, lint, whitespace checks, Next production build, Mastra production build, and localhost hydration/CSP checks passed. The initial Next type errors were corrected before deployment; the restricted-network Mastra dependency install was stopped and rerun with network permission. No dependency upgrades were requested.
- Source CSV, physician reviews, old failed runs and budget ledgers remain unchanged. Only new GUI runs/reviews were appended. No benchmark study was launched.
- Six generation runs cost an estimated **$0.555253**; four completed background reviews cost an estimated **$0.434990**. Two failed independent reviews have unknown actual spend and retain **$2.50** of reservation. Known estimates plus retained uncertainty total **$3.490243**. These are standard-token estimates/reservations, not a provider invoice.

Open gates:

1. **Latency:** final answers still took 21–32 seconds in repaired retests. Reliable tail latency is not established. Do not raise the deadline or claim success based only on cached/repeated cases.
2. **Independent-review availability:** both baseline and repaired C08 reviews ended `INDEPENDENT_REVIEW_FAILED`; no clinical score was assigned. This is separate from completed patient-facing generation and requires its own transport/schema diagnosis. No automatic paid retries were performed.
3. **Clinical wording:** the judge flagged insufficiently explicit EMS wording in rash precautions, and overbroad emergency precautions plus unnecessary clarification in the C13 follow-up. These findings are preserved in the ledger; they require correction and measured clinical evaluation, not suppression of the judge.
4. **Evidence quality:** retrieved surgical abstracts can be poorly suited to asynchronous routing. Exact quote identity is not evidence of triage applicability or clinical benefit.

The incident's timeout cause is diagnosed, the emergency presentation defect is fixed, and four repaired live workflows completed. **This does not establish presentation or clinical deployment readiness.**
