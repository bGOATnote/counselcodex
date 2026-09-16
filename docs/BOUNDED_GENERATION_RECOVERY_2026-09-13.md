# Bounded generation recovery — September 13, 2026

## Incident and response

C15 (asymptomatic STI screening after a new partner) again failed after the previous presentation/schema repair. Run `47ab984b-1f09-46bf-bd42-f36cc425669f`, v38, took **53.927 seconds**. Its Opus call reached the 50-second application deadline while still emitting text: last delta at **49.970 seconds**. This was not evidence of exhausted provider credits. The earlier fix did not establish reliability.

The new manual-GUI path changes generation, not just the timeout label:

1. **Reduce repeated generation.** One compact citation record supplies the claim, source/fragment references and applicability explanation. Deterministic expansion reconstructs the existing evidence/support contract. The model no longer writes separate, repeated evidence and support records or copies retrieval telemetry. All retrieved passage fragments, clinical fields and audit metadata remain available in their appropriate layers. This changes the wire format; it does not establish clinical equivalence.
2. **Bound one recovery attempt.** If the first Opus attempt remains pending after 12 seconds, launch one identical-input Opus attempt. Each attempt has a 24-second deadline; the generation stage has a 32-second aggregate deadline. An early transient transport failure can start recovery sooner. Intake and retrieval precede this stage, so 32 seconds is **not** an end-to-end SLO.
3. **Select transport completion, not a preferred diagnosis.** The first complete result must still pass clinical/output admission. Clinical rejection does not trigger a search for an answer that passes. Any already-completed emergency envelope is preserved. Unfinished JSON/prose is not presented as a completed assessment.
4. **Cancel and account for the other attempt.** Attempts, offsets, selection, failures, stream progress and known/unknown usage are retained. Known authentication, request, rate-limit and prompt-size errors do not trigger additional requests. Cancellation is not proof of zero provider billing.
5. **Keep emergency actions independent.** Previously issued emergency/same-day instructions survive explanation failure. The background Astra review does not block the displayed response and is not a care authorization.

Opus remains the final model, Haiku the intake model, and effort remains medium. No provider substitution, ledger reset, cached demonstration answer, or whole-workflow retry was introduced. Recovery is enabled only for the manually requested adaptive GUI profile. Reserved experiments retain their call allocation; a future study must freeze its own new runtime identity.

## What the published sources support

Counsel's published case study describes a history-taking agent with a parallel emergency supervisor, specialized agents and retrieval. It does **not** publish a timeout-recovery policy, exact per-turn latency distribution or the model-selection details needed to reproduce those internally. The implementation here is our engineering choice, not an assertion about Counsel's private system. [Counsel / Mastra case study](https://mastra.ai/customers/counsel-health).

Mastra documents per-step retries, error results and alternative branches for transient failures. Retrying an entire clinical workflow can repeat already-issued actions; this repair instead isolates bounded recovery to generation while preserving the existing workflow and durable events. [Mastra error handling](https://mastra.ai/docs/workflows/error-handling).

Anthropic documents streaming events and errors; receiving text is not proof that a complete structured answer exists. Its effort guidance distinguishes reasoning effort from visible answer length, so we kept effort unchanged and explicitly reduced duplicate output rather than assuming lower effort would solve decoding time. [Streaming](https://platform.claude.com/docs/en/build-with-claude/streaming), [effort](https://platform.claude.com/docs/en/build-with-claude/effort), [performance guidance](https://claude.com/blog/reducing-cost-and-improving-performance-with-claude-platform). Sources accessed September 13, 2026.

## Actual GUI verification, including the failure

All attempts were made through the local production GUI, not a fixture endpoint. After each code build the verified loopback server was restarted. Each retained artifact identifies its actual workflow version. All original messages and historical physician reviews remain unchanged; the six-week update below is a clearly synthetic test message, not a physician adjudication.

| Build | Case | Completion | Result |
| --- | --- | ---: | --- |
| v39 | C15, first | 20.501 s | Standard async |
| v39 | C15, repeat | 19.851 s | Standard async |
| v39 | C15 + six-week update | 25.471 s | **Failed: ANSWER_CONTRACT_FAILED** |
| v40 | C15 | 24.911 s | Standard async |
| v40 | C15 + same update | 25.482 s | Standard async |
| v40 | C08, thunderclap headache | 22.073 s | Emergency now |
| v40 | C04, diabetic foot wound | 21.218 s | In-person today |
| v40 | C50, usual migraine/refill | 20.305 s | Priority async; not emergency/in-person |
| v40 | C15, repeat after other cases | 15.385 s | Standard async |
| v40 | C02, chest pressure | 17.715 s | Emergency now |

The failed follow-up exposed a separate deterministic bug: a finding marked **unknown** cited the exact patient statement “I do not know of any infection in my partner.” The codec rejected all non-null unknown references. v40 permits an exact contextual quote while retaining the unknown status. Unmentioned findings can remain unquoted; invalid reference IDs still fail. The original failed output is preserved and the regression tests cover both valid unknown context and invalid IDs.

For C02 the browser visibly displayed the 911 alert while the explanation was still pending. The saved response event is at **8 ms**, with the safety-notice callback at 16 ms; neither is a screen-paint measurement. C08's initial ED instruction was at 12 ms, with the model's explicit 911 instruction at 3.819 seconds. C04's in-person-today instruction appeared at 2.056 seconds.

**Seven consecutive v40 GUI runs completed without a timeout or admission failure.** This is incident verification, not a reliability estimate: cases are repeated/dependent, retrieval varies and there is no randomized control. All selected answers came from the first attempt. Nine replacement attempts across v39/v40 were cancelled; one run finished before recovery was needed. Consequently **live benefit from hedging is not demonstrated** in these samples; its cost is real/uncertain and its recovery behavior is established only by fault-injection tests. Shared-provider congestion could affect both attempts.

[Machine-readable ledger](../outputs/bounded-generation-recovery-2026-09-13.json) includes all ten runs, exact IDs and artifact hashes, timings, every model attempt, independent-review findings and cost uncertainty. The failed v39 update is not omitted from the denominator.

## Tests and accounting

- **344 root tests and 124 GUI/storage/HTTP tests passed (468 total).** New tests cover stalled streams, recovery selection, cancellation, two-attempt failure, known nonretryable errors, no clinical answer fishing, complete-output admission, exact citation expansion and unknown-context provenance. A native Anthropic-adapter test uses a mocked network boundary with the real compact grammar; it is not a live clinical evaluation.
- Lint, TypeScript, whitespace checks, Next production build and Mastra production build passed. GUI execution details show both attempts distinctly, their selection/cancellation and unknown usage without adding another clinical answer panel.
- Known generation estimate: **$0.808116**. Completed background-review estimate: **$1.037440**. Nine cancelled generation calls have unknown actual usage. An additional $0.40 planning allowance for each gives **$5.445556** including uncertainty, not an invoice or enforced ceiling. No historical reservations were released or overwritten.
- Original source CSV SHA-256 remains `d17771ed706c6866d2b13f2d7f5344824acf51aaf281b8af6368637586d71a15`.

## Remaining release gates

1. **Latency/reliability:** 15–25.5-second explanations still exceed the requested experience. A small series of completed runs cannot establish a production tail-latency target. Measure completion, time to actionable instruction, recovery-win rate and extra cost on a frozen representative set before selecting this policy as a proven improvement.
2. **Claim support:** v40 C04's judge flagged the categorical instruction that this particular wound must be probed today; examination should decide which procedures are indicated. v39 C15 also over-attributed an oral sampling claim. Preserve these findings; a reachable link or matching quote does not establish support for every instruction.
3. **Safety-net wording:** v40 C50's judge requested explicit 911 instructions for new focal neurologic symptoms rather than generic emergency-care language. An earlier C15 response also lacked a clear conditional time-sensitive PEP pathway. These are recorded review findings, not new adjudicated labels for the original cases.
4. **Retrieval quality and clinical evidence:** irrelevant/specialized abstracts still appear. Neither the wire optimization, hedging nor uncalibrated independent review establishes clinical accuracy. Clinical deployment and complete interview readiness remain unproven.

The repair improves the failure-handling mechanism and passes the listed GUI checks. It does not justify a guarantee that a remote model will never time out.
