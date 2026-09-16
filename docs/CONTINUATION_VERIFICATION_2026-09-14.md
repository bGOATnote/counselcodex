# Continuation: evidence, care preservation and GUI verification

14 September 2026 · `evidence-graph/v22` · development candidate

## Engineering changes

The safety role now distinguishes an explicitly active EMS response from a new
activation, a planned call, cancellation, another person's response and historical
care. Continuation requires a quotation about the current patient and episode;
it is not inferred from the word “ambulance.” New focal neurological symptoms are
assessed for immediate EMS transport by the model, not a phrase-matching router.

When a later repair fails, an independently reviewed, stronger emergency or
in-person instruction can survive. Previously a weaker early instruction could
mask it. The server and browser now verify the same patient, producer, evidence,
patch and reviewer bindings. A field patch is reconstructed from its exact base
and authorized fields before its review can support a care-only result. Such a
result does not carry rejected explanatory prose or citations. Cancellation and
a later valid adverse review cannot borrow an older approval. A typed transport
correction requires explicit review and reconciliation; it is not a silent
downgrade. Leading whitespace and CRLF in pasted messages retain exact identity.

The preserved-care hashes establish record consistency, not clinical truth or
authenticity against a malicious server that fabricates all records. Synthetic
failure-path tests are distinct from live clinical verification.

Final independent review found that omitting the entire proof object could bypass
the browser check for new same-day care. The client now requires review provenance
for new or corrected care-only results, including when flags are omitted. Exact
unchanged early safety advice remains available without a new model review, but
cannot acquire unreviewed explanation or citations. Explicit legacy v1–v21
records retain their historical reader contract. Current async corrections also
bind the reviewed priority and task type; they cannot borrow an urgent-care
snapshot. These final failure-path changes were verified with synthetic failures
and replay of all nine retained GUI records through the updated stream reader,
not additional paid model runs.

## Fixed-packet study: do not promote the shorter safety format

[Immutable study](../outputs/safety-materiality-continuation-live-2026-09-14/):
40 planned and completed calls, all retained, estimated **$2.529827**.
Safety: 12 inputs × two formats. Judge: four matched control/defect families ×
two prompts. Models, packets and sampling settings were held fixed within each
comparison. This is an authored development study, not held-out validation.

| Measure | Baseline | Experimental candidate |
|---|---:|---:|
| Safety action matches, authored targets | 8/12 | 7/12 |
| Median full safety-object latency | 4.659 s | 3.976 s |
| Median first text delta | 1.417 s | 1.450 s |
| C02 full safety-object latency | 8.049 s | 7.846 s |
| Judge valid target outcomes | 7/8 | 8/8 |
| Seeded defects detected | 4/4 | 4/4 |
| Median judge latency | 18.843 s | 18.839 s |

The compact safety format weakened the stroke transport decision and failed
active-EMS action admission. It is experimental and **not the default**. The full
schema remains active. Neither output brevity nor average latency compensates
for a weaker emergency decision.

The judge candidate improves materiality instructions: current care burden versus
conditional precautions; feasible actor; unknown measurement versus unreported
values; and worsening independent of service availability. Both arms detected all
four planted defects. The one target-outcome difference was a baseline control
whose review failed exact-source-anchor validation. It is not evidence of new
defect-detection lift. Examples in the prompt resemble these fixtures, so this is
a regression check rather than independent calibration.

## Full-schema safety follow-up

[Ten retained v22 calls](../outputs/safety-adherence-v22-live-2026-09-14/),
estimated **$0.043928**: nine matched the authored action target. Active EMS was
continued; cancelled, planned, other-person and historical EMS did not suppress
new activation. The new neurological-deficit case selected EMS.

C30 still produced an internal Standard async proposal, including the unsupported
phrase “reported vital stability.” No urgent notice was emitted. This internal
output is not provided to Opus and is not part of the issued-message judge packet.
It is an **unresolved safety-role grounding/necessity defect**, not a delivered
async instruction or a demonstrated error in the final route. Action-only target
scores do not measure such assertions. Record this separately; do not fail a
correct final response merely to hide the distinction.

## Where latency actually remains

The installed Mastra 1.64 implementation uses direct provider structured output
when a schema is supplied without a separate structuring model. Our calls do not
configure the latter, use one step and zero provider retries. No hidden extra
structuring call was found. Safety starts in parallel, not after retrieval or review.

In the ten-call follow-up, median first text was 1.496 s and median completed
safety output 6.813 s. The median interval after the last text delta was 156 ms
(range 5–335 ms). Skipping stream completion would not recover the missing seconds
and would sacrifice finish/schema checks. Provider delivery variability is material:
304 output tokens took 9.085 s in one case; 306 took 3.142 s in another. Those
records cannot isolate SDK startup from provider time.

Official guidance supports reducing serial work and unnecessary output while
measuring the real critical path—not publishing incomplete clinical JSON.
[OpenAI latency guidance](https://developers.openai.com/api/docs/guides/latency-optimization),
[Anthropic latency guidance](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-latency),
[Mastra structured output](https://mastra.ai/docs/agents/structured-output).

## Clinical interpretation boundaries

Expected local evolution of poison-ivy dermatitis is not equivalent to infection
or a mandatory steroid prescription. FDA describes delayed apparent spread and
specific reasons to seek care. AAD distinguishes mild home-manageable presentations
from more extensive, severe or uncertain presentations. Neither source proves a
universal SELF_CARE label for every short rash message.
[FDA](https://www.fda.gov/consumers/consumer-updates/outsmarting-poison-ivy-and-other-poisonous-plants),
[AAD](https://www.aad.org/public/everyday-care/itchy-skin/poison-ivy/treat-rash).

Sudden arm weakness and speech difficulty support immediate EMS action rather than
an ordinary refill workflow. [American Stroke Association](https://www.stroke.org/en/about-stroke/stroke-symptoms).
The active-EMS contract is an application policy for preserving the patient's
reported ongoing response, not a claim of integration with emergency dispatch.

## Actual GUI verification

Eight controlled submissions completed in the actual production GUI. The first
seven followed the [frozen case/budget plan](../outputs/continuation-gui-2026-09-14/plan.json).
The separate [capture correction](../outputs/continuation-gui-2026-09-14/capture-plan.json)
uses the plan file's observed creation time instead of its mistakenly later typed
timestamp, so the first start is included. It changes neither case selection nor
allocation. Intermediate captures retain unfinished runs rather than dropping them.

| Controlled input | Final route | Early action | Full result |
|---|---|---:|---:|
| C30 original | Self care | None | 73.875 s |
| C02 original | Emergency / EMS activation | 9.423 s | 68.214 s |
| C02 active-EMS update | Continue active EMS | 4.278 s | 44.833 s |
| C50 usual migraine refill | Priority async | None | 69.582 s |
| C50 new neurological deficit | Emergency / EMS activation | 3.342 s | 46.108 s |
| C04 diabetic foot wound | In-person today | None | 72.481 s |
| C30 new airway symptoms | Emergency / EMS activation | 3.441 s | 38.162 s |
| C02 layout verification | Emergency / EMS activation | 10.283 s | 63.580 s |

The eighth submission was prospectively authorized by the
[layout amendment](../outputs/continuation-gui-2026-09-14/layout-verification-plan.json).
Optional update entry now stays collapsed, opens for unresolved blocking
clarification, and remains accessible while early care is visible. Actual browser
interaction confirmed reopening preserves unsent text and the care instruction.
Test text was cleared without submission. Emergency updates say not to delay care.

The inclusive [nine-start capture](../outputs/continuation-gui-2026-09-14/capture-end8/summary.json)
also found C01 at 19:30:20 UTC, outside the eight controlled submissions. Its actor
is not established by these records. It completed as Self care in 68.608 s and is
retained, including its $0.569629 estimate. The capture's `capacityExceeded=true`
records this count deviation; it is not rewritten into protocol compliance. All
nine records have persisted run, event and trace status. No further controlled
provider calls were dispatched after this capture.

The [version-bound scorecard](../outputs/physician-cohort-v22-end8-2026-09-14/scorecard.json)
finds five original cases with complete first-attempt reference agreement across
the inclusive window. That covers **5/49 exact agreement targets**, not 50-case
accuracy. Forty-five of the 50 cases are unattempted, including qualified C25.
Only four distinct original cases were in the controlled GUI sequence; C01 is
the unattributed additional start. Three modified follow-ups remain off-cohort.
Automated reviewer acceptance is not new physician approval.

These results do not resolve latency: C02's final retest took 10.283 s for early
action and 63.580 s for the explanation after repair. No timeout or unfinished
submission appeared in this window; that is a small observed sample, not a
guarantee. Reordering UI content does not reduce model time.

## Further paired experiments: no promotion

The [full-schema serialization study](../outputs/safety-serialization-v22-live-2026-09-14/summary.json)
retained all 48 calls across 12 inputs, two trials and balanced arm order. Baseline
matched 24/24 authored action targets; succinct wording matched 23/24. Marginal
completion medians were 5.386 s and 4.938 s, but the median paired difference was
only **97 ms**. Cancelled, historical and other-person EMS cases became slower.
The succinct arm also invented a two-day interval and unnecessarily proposed
Standard async for one rash input. These are internal role defects, not observed
patient messages. Baseline also produced unused aspirin prose once. Neither
format's action score certifies all its reasoning. The default remains unchanged.

The [grounding-first study](../outputs/grounding-first-plan-2026-09-14/summary.json)
retained all 16 producer/reviewer calls for four fixed packets. Packet construction
was deterministically reconstructed and checked against the original v22 hashes;
it is not an originally captured HTTP body. Same sources, models and full reviewer,
with only output order and one construction instruction changed. Baseline was
release-eligible on **3/4** first drafts; grounding-first on **0/4**. All eight drafts
passed schema and exact source-quote checks. Candidate failures included falsely
excluding infection, assigning an unreported migraine subtype, and asking a patient
to act after losing consciousness. One judge response also contained a non-exact
anchor. Producer medians were 17.131 s and 17.090 s. Completed producer-plus-review
medians were 37.847 s and 37.342 s, including the invalid review. These differences
do not justify the observed regressions. This experiment is not promoted.

## Instrumentation and remaining release gates

The transport records public Mastra start/object/usage/stream-completion observations
and cache-read/write counts, with null for unobserved values. They are local promise
fulfillment times, not provider dispatch timestamps. In the serialization study,
start resolution had a 1 ms median and object-to-stream completion a 9 ms median.
The SDK completion tail did not explain the multi-second wait. Earlier GUI records
predate this instrumentation and are not backfilled.

Remaining work has a narrower, evidence-backed scope:

1. Reduce first-draft patient-grounding and practical-action errors without changing
   defensible routes. Both attempted serialization optimizations failed that test.
2. Reduce judge anchor transcription failures without weakening exact evidence
   binding. A malformed quote is distinct from a timeout or clinical rejection.
3. Resolve ambiguous rash safety-net conjunctions and report-scoped negative wording
   through targeted clinician calibration, not automatic label changes.
4. Run the remaining current-version cases and independently adjudicated new cases.
   Current development agreement is not prospective accuracy or measured agent lift.

## Budget and claims

The prior **$40** authorization remains the total sprint ceiling. This continuation's
known token estimates total **$9.274604**: $2.529827 and $0.043928 for the first two
studies, $0.207928 for serialization, $2.215090 for grounding-first, and $4.277831
for every GUI start in the window. Including prior known estimates gives $17.964242.

Current Astra cache-write pricing means historical flat-input estimates are not
universally conservative. A separate 25% contingency on all known token estimates
adds $4.491061. Keeping $11.340570 of earlier unreconciled reservations and the
$0.10 embedding reserve gives **$33.895873 conservatively accounted**, below $40.
This intentionally over-reserves the known output component and is not an invoice.
See the [cache-accounting audit](CACHE_USAGE_ACCOUNTING_2026-09-14.md). Historical
estimates and raw results remain unchanged. No new budget was inferred from
“continue,” and no further paid calls are planned for this continuation.

Original CSV data, physician reviews and earlier study artifacts remain unchanged.
Current-version agreement, model review, engineering reliability and prospective
clinical accuracy remain separate claims.

## Software verification

Local lint and TypeScript checks pass. `npm test` runs 573 tests, including the seven
serialization-study budget/protocol regressions, two historical-demo checks and
four archived-holdout checks; the GUI suites run 156 (729 total).
The study regressions now run in the standard CI path, not only a manual command.
HTTP-mocked provider failures in these tests spend no tokens and are distinct from
live-study results.
Next's production build passes. The real Mastra build installed and verified 205
locked packages with seven direct dependencies; it did not bypass dependency
installation. The non-billable production document/hydration check now includes
`/candidate` twice to verify fresh CSP nonces, alongside the legacy routes.

Remote CI initially failed on an existing evidence-search timeout test (also
present in the preceding remote run). Its mocked fetch returned only a pending
Promise, without the referenced I/O handle an actual fetch owns; Node 22 could
exit before the unreferenced `AbortSignal.timeout` fired. The test double now
models that in-flight handle, clears it on abort, and checks that both searches
receive the timeout. No production deadline or clinical assertion is weakened.
Remote CI status must be checked on the final commit separately from local passes.

After that fix, remote tests passed and exposed an independent stale-artifact
check: demo regeneration changed only the historical implementation hash. CI now
verifies every behavioral, input and rubric field without rewriting that artifact,
and checks/reports the freshly computed implementation identity separately. Normal
scripted runs write create-only, implementation-addressed files under `tmp/cqa-demo`.
Provider runs are not accepted by the scripted verifier.

The next remote gate correctly refused a fresh run under an older frozen holdout
registration: four candidate files had changed. `holdout:eval` keeps this refusal.
CI and `validate` instead call read-only archive verification: pinned historical
artifacts, frozen inputs/harness, admission arithmetic, zero-call boundaries and
current candidate drift. The report states `currentEligible: false` and
`currentCandidateEvaluated: false`; the historical retrieval result remains
`not_admitted`. The archived agent report lacks embedded implementation provenance,
which is disclosed rather than manufactured. This verifies evidence preservation,
not a fresh holdout score or promotion of the current candidate.

The [editable v22 r4b deck](../output/presentation/counsel-disposition-current-2026-09-14-r4b-verified.pptx)
was rendered and inspected on all eight slides. Its case labels are checked
against exact original messages and retained run hashes; four regression tests
prevent the discovered C19-for-C04 transcription error. The earlier r4 export is
preserved but superseded. PowerPoint application execution was not tested.

These checks cover software behavior and build reproducibility. They do not
establish clinical efficacy, a latency guarantee, or a deployment-ready service.
