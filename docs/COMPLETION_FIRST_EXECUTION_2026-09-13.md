# Completion-first execution, not a 50-second abandonment deadline

Status: implemented; this incident repair is not evidence of clinical readiness.
Supersedes the execution policy in `BOUNDED_GENERATION_RECOVERY_2026-09-13.md`.
Historical reports, failed attempts and clinician reviews remain unchanged.

## Decision and provenance

The 50-second limit was application code, introduced in commit
`d7ee2676088c52a21d65e3f1f3d279fa02e36e05`, not a requirement from Counsel or a
clinical standard. The later 12-second hedge / 24-second attempt / 32-second
aggregate policy was also a project decision. It is now removed from the active
GUI. The previous rehearsal produced no hedge wins and incurred cancelled calls;
it did not justify abandoning a still-productive generation.

The active Opus disposition and Astra independent review now each allow **600
seconds per model request**. A valid response at 100 seconds is accepted through
the same clinical and evidence checks as a faster response. This is a request
allowance, not an acceptable target latency, a clinical waiting instruction, or
a promise that an external provider cannot fail. Emergency instructions remain
independent of final explanation completion.

### Primary-source basis, checked September 13, 2026

- [Anthropic TypeScript SDK — timeouts and long requests](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript#timeouts): documents a ten-minute default, configurable timeouts and streaming for long requests. This repository uses Mastra's transport, not that SDK directly, so it explicitly configures an analogous allowance. The SDK default is not a published Opus latency percentile or clinical SLA.
- [Anthropic streaming](https://platform.claude.com/docs/en/build-with-claude/streaming): long responses can deliver incremental events; a live stream is not necessarily a completed message. Keep incomplete medical text out of the issued answer until validation.
- [OpenAI background mode](https://developers.openai.com/api/docs/guides/background): reasoning can take minutes; background requests support polling, cancellation and stream resumption. This is an alternative for durable long-running jobs, not a reason to terminate a synchronous stream after 50 seconds. Its data-retention and deployment requirements must be reviewed before clinical use. Background mode is **not enabled by this change**; Astra now uses streaming through Mastra.
- [Mastra workflow error handling](https://mastra.ai/docs/workflows/error-handling): supports step-level retries and failure handling. Retry a failed generation step rather than replaying a whole workflow with queue or message side effects.
- [Counsel's Mastra case study](https://mastra.ai/customers/counsel-health): describes specialized agents and an evidence-retrieval tool. It does not publish a timeout policy that establishes 50 seconds—or our new allowance—as Counsel's internal setting.

## Implemented boundaries

| Boundary | Active policy | What it does not mean |
|---|---|---|
| Opus final generation | 600 seconds per attempt; no speculative duplicate | No 24/32/50/100-second abandonment |
| Transport recovery | At most one sequential retry after a failed attempt, with 1-second backoff | No retry to fish for a clinically acceptable diagnosis |
| Astra review | Streaming, 600-second allowance, persisted attempt metadata | Review does not gate or rewrite the issued response |
| Review interruption detection | 720 seconds, including cleanup grace | A two-minute review is not prematurely marked interrupted |
| HTTP connection | 15-second liveness frames; cleared on completion, error or cancellation | Heartbeats do not claim clinical progress or enter the care-event log |
| Intake / retrieval | Existing separate 8-second / 5-second bounds retained | An evidence-fetch failure is a recorded gap, not cancellation of the final model |
| Clinician route and safety | Existing admission checks and emergency preservation unchanged | A timeout or missing evidence cannot become a self-care answer |

Known request/configuration/authentication/rate-limit failures do not cause
duplicate-request storms. Provider retries remain disabled under the explicit
application recovery policy so nested retries do not multiply calls. Cancellation
cannot prove remote billing stopped; unknown usage remains unknown. The optional
historical workflow profiles retain their original settings for reproducibility;
the active `adaptive-opus` GUI uses `adaptive-disposition/v41` and versioned
`completion-first/v1` / `sequential-recovery/v2` policies. Artifacts and runtime
identity record the new policy. The HTTP smoke client also permits the full
sequential-attempt envelope rather than silently cancelling at 150 seconds.

No infrastructure can guarantee that provider, network, process or browser failure
never occurs. This patch fixes premature application cancellation. The local GUI
still cancels on disconnect or superseding input; it does not yet resume a clinical
generation after a browser close or process restart. A production design should
persist an idempotent job before generation, stream/poll its event log, reconnect
to the same job, and retain an owned unresolved-work item until completion or
human acceptance. A proxy/host must support the request allowance and disable
buffering; HTTP liveness frames cannot override a host's absolute execution cap.
Do not silently relabel a provider failure as a completed clinical assessment.

## Evidence: a separate layer first, an agent only with demonstrated benefit

The active workflow already has a separate `search-clinical-evidence` Mastra step
and `src/evidence/` implementation. The intake model proposes queries; the tool
retrieves bounded passages; Opus receives them before its final decision; the
independent reviewer audits the exact issued answer and those passages afterward.
The tool's verified source records are distinct from generated clinical prose.

The layer should own source identity/version/date, original passage, content hash,
retrieval query and ranking, population/scope, authority and explicit gaps. Link
reachability, quote identity, semantic support and patient applicability are four
different checks. A passing link cannot substitute for the latter two. Source
maintenance and link revalidation belong off the patient response path where
possible; cached passages must retain version and freshness information.

Do **not** add an obligatory research agent to every message merely to increase
agent count. [Anthropic's tool-engineering guidance](https://www.anthropic.com/engineering/writing-tools-for-agents)
emphasizes informative, bounded tools and evaluations;
[its workflow guidance](https://www.anthropic.com/engineering/building-effective-agents)
supports starting with simple compositions and adding complexity when it helps.
A dedicated evidence agent is a candidate for difficult query planning,
conflicting guidance or applicability assessment—not the canonical source of
truth and not a second disposition authority.

Admission test for that extra agent: freeze messages, source snapshots, final
model, contract and grading; compare tool-only retrieval versus evidence-agent
retrieval. Measure relevant-passage recall, harmful mismatches, claim support,
actual routing improvement, failures, latency and cost. Keep all attempted runs.
If it adds no measured benefit, omit it. Evidence cannot become post-hoc decoration
for a route chosen without regard to source applicability, and emergencies must
not wait for research to finish. No additional evidence-model call was added here.

## Verification

Regression tests cover survival at 50/100/110 seconds under a virtual clock,
the full 600-second boundary, no speculative duplicate, recovery after a genuine
transport failure, cancellation, unchanged clinical admission, source/event
integrity, heartbeat injection and timer cleanup. Review-store tests protect
long-running Astra jobs from the former two-minute interruption rule.

`npm run reliability:long-response` additionally spends 110 actual wall-clock
seconds through the production request handler, recovery policy and GUI decoder
with a synthetic delayed provider. It is intentionally **not** a live model test
or a browser-paint measurement. Live GUI rehearsal and exact measurements are
recorded separately in `outputs/completion-first-execution-2026-09-13.json`.

The wall-clock test completed at **110.015 seconds**, preserving the exact fixture
with one attempt and seven connection heartbeats, including one after 100 seconds.
Four actual GUI runs completed: C15 (18.205 s), its six-week-contact follow-up
(19.889 s), C02 (18.170 s), and C50 (19.293 s). C02's first emergency event was
recorded at 7 ms and was observed in the GUI while the final model was pending.
C50 remained Priority async. All four Astra reviews completed separately in
17.757–26.116 seconds, with traces and usage retained. These are nonrandomized
incident checks, not proof of a latency percentile or model/clinical superiority.

The C50 judge reported a remaining clinical wording concern: conditional advice
for new focal neurologic symptoms should specify the emergency destination/action
more explicitly. It is retained as a concern, not a passing clinical result.
This change does not address that separate wording problem or establish that the
evidence pool adequately supports every clinical decision.
