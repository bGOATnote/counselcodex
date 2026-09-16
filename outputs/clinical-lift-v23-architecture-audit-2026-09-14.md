# Independent architecture audit: disposition critical path

14 September 2026. Read-only audit while the frozen v23 cohort is running.
No inference calls, builds, runtime changes, or partial-cohort outcome selection.
The measurements below are the completed **v22** cohort and completed fixed-packet
experiments, not a claim about the unfinished v23 cohort or Counsel's private stack.

## Finding

The system does not need a fresh multiagent framework. The meaningful remaining
questions are **how much clinical text it should author**, **when withholding is
clinically necessary**, and **whether context-driven retrieval earns its serial
dependency**. More supervisors, graph edges, model racing, or trace infrastructure
are not supported by the present measurements.

Current critical path: independent safety runs beside context -> retrieval ->
producer; the branches join before critic -> optional field-local repair -> fresh
critic. Safety publication does not await retrieval. This is implemented in
`src/disposition/clinical-graph.ts:397`, `:429`, `:448`, `:467`, and `:495`.

## Measured baseline

Recomputed without modifying the 50 `*-run.json` artifacts in
`outputs/clinical-lift-v22-cohort-live-2026-09-14/`. Medians include recorded failures;
p95 is the nearest-rank observed value. Stage medians are **not additive** and are
not counterfactual end-to-end savings. The early cohort's documented host-load
window remains a limitation.

| Recorded stage | Observations | Median | p95 |
|---|---:|---:|---:|
| Context role | 50 | 3.335 s | 5.442 s |
| Safety role | 50 | 3.192 s | 8.915 s |
| First producer | 50 | 17.371 s | 20.278 s |
| First critic | 50 | 22.527 s | 41.598 s |
| Additional producer/repair | 35 | 6.231 s | 16.537 s |
| Additional critic | 35 | 21.509 s | 24.974 s |
| Individual retrieval query, not whole retrieval stage | 145 | 0.679 s | 1.230 s |
| Trace persistence | 50 | 0.020 s | 0.024 s |
| Server final result | 50 | 68.710 s | 91.891 s |

Thirty-five runs entered repair; 29 completed. Their median server duration was
73.293 s versus 43.064 s for the 15 without repair (10 complete). These groups
differ in difficulty: that contrast is **not a causal repair penalty estimate**.
The immutable summary separately records 39/50 complete, 32/49 development-reference
agreements, six model-supported alternatives, qualified C25, five reference-matching
drafts withheld, and one reference deviation corrected. None establishes net
clinical benefit or unnecessary withholding without content adjudication.

## 1. Potentially unnecessary complexity: authoring a consultation around a route

The producer writes patient advice, rationale, differential, red-flag states,
vital-sign interpretation, questions, and citation claims (`graph-output.ts:4`,
`clinical-graph.ts:440`). The critic then grades their cross-field consistency.
The independent first-draft audit and prior GUI report identify invented symptom
scope, measurement status and ancillary instructions in otherwise route-matching
drafts. A shorter repair is already relatively fast; re-review remains expensive.

**Inference, not proven fix:** a narrower routing response may create fewer facts
and ancillary instructions to invent or repair. Merely collapsing GUI sections or
reordering output fields does not remove that generation/review burden. The earlier
field-reordering and compact-safety experiments did not establish reliable benefit.

**Next evidence needed before changing production:** a fixed-packet comparison of
the current response versus a route-focused response, preserving original patient
text, sources, model/settings, applicable clinical policy, and all seven review
criteria. Keep necessary care timing, transport, ownership, action-changing
uncertainty and evidence; do not shorten by omitting safety-critical conditions.
An independently adjudicated material-error and unnecessary-delay endpoint must
accompany latency and model acceptance. Preserve first drafts and all failures.
Only promote if a clinically matched counterfactual improves reliable completion
without adding emergency misses, unsupported reassurance or over-escalation.

## 2. Missing complexity: independently deciding whether a review intervention helped

Current exact packet, source, verdict and repair bindings are valuable. They prevent
a changed draft, malformed quote, stale review or failed provider from masquerading
as acceptance. The v23 unknown-source-ID correction is serialization recovery only:
the unchanged quotation must match exactly one actual packet source body. It does
not adjudicate entailment. Retaining the ordinary quoted judge is justified by the
positive-control experiment: original 4/4 accepted versus span 2/4 accepted with two
technical failures. A faster valid-only span median did not establish reliability.

The release gate couples a complete response to all seven criteria, exact citations,
care reconciliation and application checks (`clinical-graph.ts:536-552`). This can
withhold a sound route because other emitted prose is defective; it can also correctly
prevent harmful text accompanying a sound route. The route label alone cannot tell
which occurred. `physician-cohort.ts:236-256` correctly separates reference agreement
from model support, but it cannot measure the judge's clinical net benefit.

**Next evidence needed:** independently review blinded before/after packets and the
withheld packets, rating separately (a) route/action/transport correctness, (b)
material patient-facing defects, (c) whether delaying or withholding the exact response
was necessary, and (d) whether repair removed or introduced a defect. Include sound
acceptance controls and adverse controls. Count prevented errors, missed errors,
unnecessary withholding, and new repair errors—not just acceptance or route agreement.
Use this to calibrate materiality before testing a narrower reviewer or changing any
release predicate. Do not suppress a negative judgment because a reference route
matches. Do not emit an unreviewed draft as a latency shortcut.

One extra urgent care-only interim event was already replayed and found to provide
zero earlier first-care benefit in the nine-attempt sample. Do not reintroduce that
architecture without newly eligible cases and a measured benefit. The existing one
response panel, explicit care revisions and immediate safety action are preferable
to another independent answer stream.

## 3. Unmeasured complexity: mandatory context extraction before every retrieval

Context produces findings, query rewrites and a possible question; retrieval waits
for its queries, then runs those searches concurrently (`clinical-graph.ts:406-440`).
The producer still receives the original patient message, which is essential. This
dependency has real functions but its incremental retrieval/routing benefit has not
been isolated. It costs a median 3.335 s in the old cohort. Individual retrieval
queries were much shorter than producer/reviewer calls, so external rewrite racing
or a new clinical graph is not currently the first demonstrated bottleneck.

**Next evidence needed, not a deployment recommendation:** compare fixed raw-message
retrieval with context-query retrieval on prospectively selected single messages and
multi-turn updates. First measure evidence coverage, eligibility/qualifier retention,
and missing crucial sources; then hold producer/reviewer settings fixed for a bounded
end-to-end comparison if retrieval differences justify model calls. Include negated,
historical, caregiver and multi-turn context, where raw latest-text fallback can lose
clinically decisive information. Do not treat raw retrieval as equivalent until that
is shown, and never allow retrieval to gate an emergency instruction.

Preserve the existing licensed-source boundary, quarantine, index identity and exact
passage provenance. Quarantine removes an identified input defect; it is not proof
that remaining sources are current, applicable or clinically complete. More corpus
documents or graph nodes are not a substitute for task-specific coverage measurement.

## Keep, do not expand

- Keep safety independent of retrieval and producer; measure early errors and delays
  separately from corrected final routes.
- Keep one published response with explicit revisions, not multiple competing drafts.
- Keep per-call raw outputs, exact review/repair/source bindings and failure retention.
  Trace persistence measured 20 ms median; removing observability is not a supported
  speed optimization. Distinguish server events, browser receipt, paint and care action.
- Keep queue/delivery/follow-up as honest integration stubs; no new operational product
  is required to evaluate this router.
- Keep all 50 planned cases and qualified alternatives in the accounting. The frozen
  v23 cohort and independent clinical audit must finish before any new promotion claim.

This audit identifies hypotheses and the minimum counterfactual evidence to choose
between them. It authorizes no new model role, threshold, release rule or paid study.
