# Adaptive workflow red team and repairs

11 September 2026 · local research candidate, not a clinical release

## Outcome

Three independent engineering reviewers examined clinical contracts, transport and
failure handling, and evaluation validity. Findings were reproduced with controlled
fixtures before repairs. A second review caught regressions and omissions in those
repairs. No paid model calls were made. Original case data, saved physician reviews,
and historical experiment results were not edited.

The default remains a bounded Mastra workflow: history/emergency planning, evidence
retrieval, then an independently prompted disposition. Optional same-model critique
is a revision experiment, **not independent grading**. Retrospective cross-provider
evidence auditing remains separate. No additional model call was added to the default.

## Reproductions and fixes

| Failure | Repair and regression evidence |
|---|---|
| Valid emergency + invalid URL/query, finding type or clarification could disappear at whole-object validation; bad self-care could then complete. | Transport preserves the minimal safety envelope; complete output is locally validated before publication. An independently valid quoted emergency is retained before optional-field validation. Both real Mastra with a synthetic model and the actual workflow's mocked streaming branch are tested. |
| `needs_information` could hide an already-needed same-day examination. | Same-day/emergency action is emitted and retained; a valid care answer is published without waiting for history. Raw inconsistent model output remains in the execution record. |
| Initial ED instruction could override a later EMS determination; introductory text could hide an existing 911 instruction from an action-first matcher. | Trusted action recognition is distinct from final-reply formatting. Destination urgency is monotonic; unconditional EMS cannot become conditional transport advice. |
| Assistant questions flattened into patient text could trigger an emergency rule. | Patient-only message plus a bounded prior-run/question reference. The server resolves the actual previously emitted question, checks input/question identity and update lineage, and supplies separate question/answer context. Patient-written role markers are never stripped. |
| A follow-up could discard an earlier emitted care instruction. | Verified conversation context carries actual emitted same-day/emergency floors, including EMS requirements. A follow-up within that episode cannot silently lower the floor. This is not a general longitudinal clinical-clearance system. |
| Negation guard rejected loss of function such as “no longer able to speak.” | Targeted polarity regression protects absent airflow/speech/function from being interpreted as symptom denial. Broader semantic attribution remains unproven. |
| Duplicate citation IDs could satisfy a count-based support check while leaving another support item unused. | Require a one-to-one mapping of citations and support entries. Exact quotation still does not establish entailment or applicability. |
| Pre-aborted or late-rejecting work could cause unhandled rejection; retrieval's timeout was not sent to its dependency. | Lazy cancellation-safe dispatch, observed abandoned promises, and the same composed deadline passed to search and its caller. Search failure duration is measured, not hard-coded to five seconds. |
| Truncation/schema failures discarded already-known usage; traces could hold completion indefinitely. | Streaming records first text delta, available usage, finish/error stage and safe status. No partial clinical prose is published. Trace confirmation has a one-second wait limit and explicit unconfirmed status; clinical-workflow and trace-wait timing are separate. |
| Interrupted/skipped comparisons appeared as approximately zero-millisecond completions. | Versioned comparison records distinguish execution from non-execution/unknown duration. Latency denominators are explicit; failures remain in clinical-outcome denominators. |
| Repeated cases received independence-based intervals; mixed reference quality was pooled. | Repeated-case confidence intervals are suppressed pending clustered analysis. Clinician-adjudicated and development-expectation references are separated. |
| Runner exceptions erased already-emitted action evidence from summaries. | Capture validated response events independently of final success; preserve them on exceptions. Hard-process-crash recovery still requires a separate event-log reconciliation protocol. |
| Corrupt or ungradable judge packets could spend budget before failing. | Freeze and validate packet identity and complete unit coverage before reservation. Empty or >100-unit packets fail without spending or truncation. Judge dispatch shares a bounded cancellation signal. |

## What current platform documentation changed

Streaming transports incremental events and may report errors after a connection
has opened. Receiving a text delta or HTTP success is not a completed assessment.
The implementation therefore observes deltas for timing but only publishes locally
validated completed advice or controlled care-action notices.
[Anthropic streaming documentation](https://platform.claude.com/docs/en/build-with-claude/streaming).

Mastra exposes final structured output through its streaming interface. Supplying
a separate `structuredOutput.model` would introduce another model call; we do not
do that. The installed Mastra 1.64 transport was inspected and exercised with a
synthetic language model, rather than assuming that newer documentation exactly
matches the pinned implementation.
[Mastra structured output](https://mastra.ai/docs/agents/structured-output).

Anthropic recommends adding complexity when it earns its cost. We used parallel
engineering reviewers for separable investigations, not a runtime committee with
unmeasured clinical authority. Retrieval still depends on planned queries; the final
evidence-based answer still depends on retrieval. Streaming alone does not prove a
faster validated answer.
[Building effective agents](https://www.anthropic.com/engineering/building-effective-agents).

## Evaluation interpretation

New reports use `disposition-workflow-comparison/v2` and a new output directory.
Older reports are immutable; their timing and intervals are not retroactively
certified. The four configurations still require at most eight model calls per
case/trial in total (1 + 2 + 2 + 3), with no retries or new budget allowance.

These are **whole-workflow comparisons**, not isolated component-lift estimates.
The critique configuration re-samples planning and drafting and replays the paired
retrieval output without its live-search delay. Constrained run ordering is not a
balanced Latin design. Reports disclose these confounds and include a direct
adaptive-versus-critique comparison. A true critique-only experiment must freeze
the exact draft as well as the evidence, then adjudicate improvements and harms.

## Verification boundary

Regression tests exercise malformed auxiliary fields, care-floor retention,
EMS precedence, follow-up attribution, source mapping, cancellation, truncation,
mid-stream errors, trace stalls, judge preflight and evaluation denominators.
The existing 1,000-case simulated persistence test writes and resumes 4,000
configuration records without model calls. This tests batch engineering, **not
1,000 clinical dispositions or safety on unseen patients**.

Final local verification:

- `npm test`: 257 software tests passed across unit, Mastra, quality-audit,
  evidence and adaptive suites.
- `npm run review:test`: 98 interface/HTTP/storage tests passed.
- `npm run lint`, `npm run typecheck`, `npm run review:build`, and
  `npm run build`: passed. The Mastra build's dependency-install step required
  network access; it did not invoke clinical model APIs.
- Existing `http://localhost:4120/`: HTTP 200. No browser-interaction testing
  or live patient-model inference is claimed for this verification.
- Additional provider API spend for this red-team turn: $0.

Real Mastra adapter tests use a scripted language model. They do not establish live
Anthropic server acceptance, clinical behavior, answer-quality non-inferiority or
latency. Historical latency figures belong to their historical profiles. New live
same-input trials require reconciled remaining spend and frozen evaluation inputs.

Remaining limits: semantic polarity/subject/temporality errors, incomplete evidence
coverage and source applicability, partial/truncated emergency output before a
complete safety envelope, uncalibrated clinical grading, confirmed patient receipt,
durable episode coordination across simultaneous clients, clinical clearance of
prior action floors, and hard-process-crash reconciliation. Local hashes and
append-only files are not authenticated tamper-proof logs or HIPAA certification.
Cancellation bounds our wait; it cannot guarantee a remote provider stops billing.

No clinical deployment, zero-harm, AMIE equivalence, isolated agent lift or improved
live latency claim follows from this patch.
