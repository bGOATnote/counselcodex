# Clinical lift sprint

Started 14 September 2026, 20:42 UTC. New user authorization: **up to $100**.
Earlier sprint allocations and results remain separate. Presentation work is
explicitly deferred. This document records decisions; immutable experiment
manifests and individual attempts are the evidence.

## Completed frozen comparison — read this first

Both cohorts attempted the same 50 original messages once, retaining every
failure. The v23 run finished on 15 September UTC with no HTTP/decoder or
runtime-identity failure. These are sequential development comparisons, not a
randomized clinical trial or a new physician endorsement.

| Outcome | Frozen v22 | Frozen v23 |
|---|---:|---:|
| Complete published assessments / 50 | 39 | 43 |
| Withheld assessments / 50 | 11 | 7 |
| Exact five-route development-reference agreement / 49 | 32 | 31 |
| First producer draft reference agreement / 49 | 36 | 37 |
| Median terminal HTTP time, all 50 outcomes | 68.794 s | 65.054 s |
| Nearest-rank p95 terminal HTTP time, all outcomes | 91.971 s | 81.286 s |
| Maximum terminal HTTP time, including failures | 176.514 s | 95.803 s |
| Contingency-accounted cohort cost | $29.9631 | $29.8454 |

The paired median terminal-time difference is −5.061 seconds. Terminal time
includes withheld outcomes; it is not the latency of a successfully delivered
clinical answer in every case. Nine previously withheld cases completed, while
five previously complete cases were withheld. Thus **better completion and a
shorter observed tail do not establish improved clinical accuracy**.

V23 retained 11 model-supported route alternatives separately from the 31 exact
reference matches. C25 remains the qualified physician-reference case, excluded
from that 49-case denominator. No model-supported alternative is silently
reclassified as physician approval. Within v23, review corrected one reference
deviation, introduced one different reference deviation, and withheld six
reference-matching drafts. These are route-process diagnostics, not counts of
clinical errors prevented or caused; the actual prose and care requirements
require the separate content audit.

A supplemental, post-hoc **three-bucket** projection gives 32/49 agreement for
the original supplied labels, 33/49 for v22 and 37/49 for v23. That projection
collapses both async priorities and combines emergency with same-day physical
care. It must not be compared with the five-route numbers as though it measured
the same outcome or established appropriate emergency timing.

All inputs, first drafts, reviews, repairs, emitted instructions, response
streams, failures and identity receipts remain in
`outputs/clinical-lift-v23-cohort-live-2026-09-14/`. The independent recomputation
and paired comparison are in `outputs/clinical-lift-v23-comparison-2026-09-14/`.
Any subsequent repair-scope or packaging fix and GUI rehearsal is **post-cohort**;
it cannot inherit this cohort's score without a new frozen evaluation.

### What the independent content audit adds

The predeclared 16-case audit included every withheld response. It identified
six case bundles with substantive content corrections, but also accepted
residual defects in C06, C07 and C48, an unresolved transport inconsistency in
C21, and disproportionate withholding in other cases. Its median patch plus
fresh-review time was 27.235 seconds. These are AI-assisted engineering findings,
not new physician adjudication or a clinical accuracy score.
[Exact cases, source qualifiers and emitted timelines](../outputs/clinical-lift-v23-content-audit-2026-09-14/REPORT.md).

The crucial distinction is **routing a clinician task versus approving its
treatment**. C46's corrected finasteride request did not authorize medication;
requiring a prescribing monograph just to recommend clinician review conflates
those decisions. Likewise, C36's unknown vital signs were not claimed normal;
the question is whether they must be measured before routing a chronic acne
request, not whether measurements can ever matter. Those materiality problems
need paired clinical controls; adding repair cycles is not their solution.

Post-cohort fixes remove C10's duplicate literal timing-token requirement and
C36's exact-field repair-permission dead end, while retaining the clinical
policy and independent review. The actual candidate and native incumbent now
have separately verified build surfaces. Their
[new identity and browser protocol](../outputs/clinical-lift-v23-gui-2026-09-14/POST_COHORT_VERIFICATION.md)
are separate from the frozen score above.

### Post-cohort browser findings and rejected shortcut

Five consecutive actual-GUI starts produced four complete responses and one
withheld C50 update. C02's 911 instruction appeared at 3.38 seconds browser
receipt. The other original cases completed as standard async (C10/C36) and
priority async (C50). Final replies still took 44–73 seconds. The update's final
judge accepted, but the application's usual-pattern wording check rejected the
explicit statement “It came on gradually, like my usual migraines.” That failed
attempt remains recorded, not retrospectively counted as successful.
[All five browser observations and limitations](../outputs/clinical-lift-v23-gui-2026-09-14/phase4/BROWSER_REVIEW.md).

Independent red teaming rejected an attempted contextual regex exception: it
could misattribute historical, hypothetical or another person's gradual onset.
The simpler correction makes the guard honest about its scope: a usual pattern
alone cannot establish onset; actual onset language is **not assessed by the
pattern check** and still requires the mandatory full exact-draft clinical
review. Exact patient-quote membership remains mandatory. This is not a new
deterministic clinical-clearance claim. The scorer must replay that exact state
and still require the full bound accepting judge. Its new version cannot
inherit the original cohort score.

A separate 24-call safety quotation-reference experiment recovered one exact
quote-copy failure but did not improve speed (median 2.598 → 2.715 seconds).
The reference arm also changed the internal classification of a hypothetical
poison-ivy concern from standard to priority async. Neither arm emitted an
emergency/physical action for the negative cases; the full routing pipeline was
not tested. **The adapter remains experimental, not promoted.** Preserving
literal evidence does not by itself ensure faithful clinical interpretation.
[All raw-output findings](../outputs/safety-reference-v23-live-2026-09-14/REPORT.md).

Through these five browser starts and the quotation-reference study, reconciled
sprint accounting is **$84.410829025 of $100**, including retained failures and
the declared contingency. This is a token-based estimate, not a provider bill.
[Independent component-by-component reconciliation](../outputs/clinical-lift-v23-gui-2026-09-14/phase4/ACCOUNTING.json).
Any subsequent challenge/retest has its own prospective allocation within the
remaining $15.589170975; this is not a new budget grant.

## Sprint close

### Final targeted verification, after the frozen cohorts

The false C50 onset rejection was corrected and tested in the actual browser:
the original refill request and the gradual-onset update both completed as
priority async, without an early emergency instruction. Browser final times
were **68.42 and 73.89 seconds**. Both required repair and a fresh whole-answer
review. This verifies the reproduced workflow correction, not acceptable
latency or clinical readiness.
[Both starts, exact update, identities and capture-window correction](../outputs/clinical-lift-v23-gui-2026-09-14/phase5/BROWSER_REVIEW.md).

The unchanged full judge was then challenged with six frozen exact-draft
packets: one genuine gradual-onset positive and five targeted corruptions.
It accepted the positive and identified the specific grounding error in all
five negatives: worsening versus onset, another person's historical onset,
hypothetical onset, a ten-second peak contradicting gradual onset, and denied
sudden onset paired with present worst-ever severity. All six completed with
valid bindings and known usage; no retry or source-anchor repair was used.
Independent review inspected the reasons and exact anchors, rather than
counting any rejection as a catch. Median judge time was 20.689 seconds.
[Independent audit and immutable packets](../outputs/onset-judge-v23-live-2026-09-14/INDEPENDENT_REVIEW.md).

This narrow challenge supports retaining full semantic review while removing
the false deterministic rejection. It does not measure held-out sensitivity,
clinical accuracy, successful repair of those five drafts, or live safety-role
performance. The simplistic onset exception was not reinstated.

**Final accounted spending: $87.093099025 of the authorized $100**:
$84.410829025 through phase4, $1.476370 for the two GUI retests, and $1.205900
for the six judge calls. Contingency and all failures remain included; these
are token estimates, not invoices. No further paid run is planned in this
sprint. The duplicate capture-window confirmation is not additional spending.
[Reconciled final ledger](../outputs/clinical-lift-v23-gui-2026-09-14/FINAL_ACCOUNTING.json).

### Highest-value next experiment

Keep the early safety model and the independent full judge. Change the scope
of what must be authored and reviewed: a concise route decision with required
timing, ownership, patient instruction and directly supporting evidence, with
unknowns recorded once. Do not require a prescribing-grade consultation to
route a prescribing task. Test that smaller **producer contract**, rather than
just truncating the judge, against the same fixed inputs and deliberate
contradictions. Measure material corrections, unnecessary withholding, first
action and publication latency; preserve both source applicability and the
defensible-alternative policy. Do not make this architectural change directly
in the live candidate without a new frozen comparison.

The remaining bottleneck is repeated generation/repair/review of ancillary
claims. Adding another agent, graph database, query racer or longer output does
not address the observed bottleneck. Conversely, source qualifiers, episode
attribution and current-versus-historical observations need more precise
structure. This is where additional complexity has a defensible purpose.

## The engineering question (scope)

Does each component help send this patient to the appropriate care setting,
with the appropriate priority and a clear, supported instruction? A bigger
agent graph, more citations, a stricter judge, or more passing software tests
does not answer that question.

Retain the five-route policy: self care, priority async, standard async,
in-person today, and emergency now. Refill is a **task type**, not a competing
care setting. The receiving clinician and actual service availability belong
to the handoff contract; a local demonstration must not claim an accepted
handoff. The queue remains a stub. No new prescribing or billing subsystem.

## What the previous experiments taught us

- Preserve: independent early emergency assessment; original patient text;
  explicit uncertainty; retrieved passage identity; independent whole-answer
  review; exact repair bindings; every failed attempt; physician-defined
  routes with defensible alternatives.
- Correct the priority: five of eight controlled v22 GUI submissions needed
  repair without changing the original proposed route. Invented patient
  details and ancillary instructions, not retrieval speed, drove much of the
  extra work. Repair plus re-review added roughly 23–26 seconds to those runs.
- Do not promote failed shortcuts: smaller safety outputs and reordered
  producer fields did not establish reliable benefit. Their adverse results
  remain in the [continuation report](CONTINUATION_VERIFICATION_2026-09-14.md).
- Do not add a duplicate interim-care event: replay of all nine inclusive GUI
  attempts found only one repair with an eligible earlier care-only snapshot;
  it repeated EMS advice already issued. **Zero earlier first-care benefit in
  that sample.** More publication/provenance machinery is not justified there.
- Do not confuse reference provenance with evaluation: the physician reviewed
  all 50 incumbent outputs (49 agreements plus qualified C25). This is genuine
  development adjudication. It is neither a blinded independent cohort nor
  automatic approval of each subsequent candidate version.

## What published work supports

Counsel describes history-taking with parallel supervisors, task routing and a
clinical RAG tool in Mastra—not a requirement for a committee on every output.
We retain that separation rather than imitate undisclosed internals.
[Mastra case study](https://mastra.ai/customers/counsel-health).

Counsel's emergency evaluation compares escalation behavior, validates a subset
of response classifications with clinicians, and filters a specific 103-case
HealthBench subset. Its exclusions and patient assumptions must not silently
enter these 50 cases. [Published method](https://www.counselhealth.com/blog/how-counsel-leveraged-healthbench-to-assess-emergency-escalation).

OpenAI recommends measuring task-specific outcomes alongside human judgment;
Anthropic distinguishes outcome graders from requirements to follow a
particular path regardless of outcome. These support testing the judge's net benefit, including
unnecessary repairs, rather than equating its acceptance with clinical truth.
[OpenAI evaluation guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices),
[Anthropic agent evaluation guidance](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).

The relevant optimization is total useful-response latency, not merely fastest
first-model completion. Anthropic explicitly recommends an effort sweep for
Opus 5 rather than carrying older settings forward. We compared low with
medium while holding the clinical packet and reviewer fixed (results below).
[Effort documentation](https://platform.claude.com/docs/en/build-with-claude/effort),
[OpenAI latency principles](https://developers.openai.com/api/docs/guides/latency-optimization).

Baseten's OpenEvidence case study concerns inference/embedding infrastructure;
its reported 160 ms must not be presented as a complete clinically reviewed
answer target, nor as proof of benefit from a clinical knowledge graph.
[Case study](https://www.baseten.co/resources/customers/openevidence-delivers-instant-medical-information-with-baseten/).

These public sources inform the engineering design. They do not establish
Counsel's internal requirements or indicate that the company reviewed this
prototype.

The Penda study coauthored by Karan Singhal is especially relevant to evaluation
design: clinical workflow fit, selective interruption, and independent physician
ratings were measured separately. Model raters estimated larger benefits than
physician raters; patient-reported outcomes did not differ significantly. Our
inference is to measure actual corrections and unnecessary delays, not treat the
reviewer's own acceptance as proof of benefit. Its clinician-facing EMR setting
is not this patient-message router, and its complete-H&P vital-sign requirements
must not be transplanted into a brief asynchronous message.
[Primary study](https://arxiv.org/html/2507.16947v1).

## Design decisions: necessary complexity versus avoidable complexity

- **Keep separate clinical and operational decisions.** Setting, internal async
  priority and task type answer different questions. A refill does not imply a
  physical visit; a timely recommendation does not establish queue acceptance.
- **Keep the independent early assessment.** Measure its actual sensitivity,
  over-escalations, first-action time and disagreement corrections. A correct
  final answer cannot retrospectively erase a delayed or wrong early instruction.
- **Keep review, but evaluate it.** Source-supported content and faithful patient
  facts need scrutiny. A clinical discrepancy, an invalid review contract and a
  provider failure need different diagnoses, not one generic unavailable result.
- **Avoid repeated free-form authoring of the same facts.** In the first ten
  frozen cases, narrower context did not prevent later invented red-flag status
  and narrative scope. Removing context alone would not solve this. Any future
  single-author observation contract needs a controlled comparison; it is not
  justified to silently change the live cohort midway.
- **Do not build another diagnostic consultation.** This output should justify
  the route and necessary next action. Optional treatment instructions, numerical
  thresholds and coordination promises create error surfaces without necessarily
  helping disposition. Existing prompts already prohibit several such additions;
  repeating a prohibition is not evidence that the defect has been fixed.
- **Do not equate a retrieved quote with trustworthy evidence.** The C06 audit
  found a threshold discrepancy in a cited secondary source that both reviewers
  accepted. Source correction/retirement and clinical applicability are separate
  from exact quotation and link availability.

The first-ten observations are a targeted development audit, not a randomized
clinical accuracy estimate. See the [independent first-draft audit](CLINICAL_LIFT_V22_FIRST_DRAFT_AUDIT_2026-09-14.md)
for the original assertions, sources and remaining uncertainties.

## Prospective work and spending allocation

| Work | Ceiling including contingency | Purpose |
|---|---:|---|
| Frozen v22 50-case HTTP cohort | $55 | Route agreement, completion, first-draft versus released route, early/final latency, all failures |
| Fixed-packet low/medium Opus study | $25 | Six cases, two trials per arm, at most 48 producer/judge calls; first-pass errors and acceptance |
| Controlled browser verification | $15 | Actual consecutive GUI submissions and an attributed update after any admitted change |
| Unallocated reserve | $5 | No automatic spending |

Parent/operator alone dispatches paid work. Plans must freeze before dispatch;
failed or unpriced calls retain their reservations. Known token estimates carry
a 25% cache-price contingency; retrieval embedding allowance is separate.
Estimates are not provider invoices. Unspent allocation is not an instruction
to consume it. No model or prompt change is promoted just because the study
finishes.

The 50-case batch uses the same HTTP endpoint as the GUI, but is **not browser
verification**. The reference is loaded only by the offline scorer, never by a
candidate prompt or retrieval tool. First attempts, unfinished attempts and
C25 remain visible. Matching the reference is reported separately from a
model-supported alternative and from confirmed clinical error.

The effort comparison is a selected development-case experiment, not a held-out
clinical trial. Primary target: fewer material first-draft errors and fewer
repair-eligible outputs without loss of appropriate routing. Secondary targets:
producer plus reviewer latency, completion, source identity, judge-anchor
validity, and cost. Independent review acceptance alone is not enough to
establish a preferred configuration. Any changed final pipeline still requires
live verification.

## Status

Remote was already current at `0282711` when this sprint began. No deck changes.
The full-50 HTTP run executed against the frozen v22 production artifact:
[plan](../outputs/clinical-lift-v22-cohort-plan-2026-09-14/manifest.json),
fingerprint `a5b835671f06263c68c0c67e7658320cb21984f41e2d1f600cc210c26488499a`.
The effort study ran afterward, not concurrently, to avoid deliberate
provider-load confounding. Its separate frozen source archive permits main-tree
changes without changing the evaluated implementation. No dependency installs
or concurrent paid GUI calls occurred during that study.

Protocol deviation: a delegated agent ran local tests/type-checking and began a
Mastra build while the first cohort cases were running. Conservatively retain
**21:02–21:06 UTC** as a host-load window. The build ran from 21:04:56 until
interruption at approximately 21:05:55; it did not rebuild the frozen Next
artifact. These attempts remain included, with this latency limitation. No
fresh cases are substituted to hide the overlap.

The evaluation documentation incorrectly described the incumbent's background
reviewer as the candidate's current path. It now identifies the blocking final
review and separates historical commands/results. The historical HealthBench
report has an explicit dated scope notice; its original measurements are intact.

Results below are actual recorded attempts, not implied by the plans.

The frozen cohort completed at 21:58 UTC: all 50 attempts recorded, zero transport
or identity failures, **39 complete answers**, **32/49 exact reference agreements**,
six additional model-supported alternatives and qualified C25 kept separate.
Median HTTP final-result time across all attempts was **68.794 s**. One first-draft
reference disagreement was corrected; five reference-matching drafts were withheld.
This is not evidence of clinical benefit by itself. [Immutable complete report](../outputs/clinical-lift-v22-cohort-live-2026-09-14/summary.json).
Known model estimate: $23.890503; accounted including contingency and embedding
allowance: **$29.963129**. No unknown-usage attempts.

The low/medium effort experiment executed from an isolated byte-frozen source
snapshot, with shared unchanged dependency installation and immutable prior input
artifacts. Its source archive excludes credentials and is retained with the results.
The main working copy may now receive fixes; those changes cannot enter the study.
No concurrent paid GUI requests or broad local builds are planned while it runs.
[Effort plan](../outputs/clinical-lift-effort-study-2026-09-14/manifest.json), fingerprint
`f54e5b8f2456eb2f854de6f903d0fff5f4428c53d320bebe96af535b3fca2e5e`.

Prospective reallocation: **$8 of the unused $55 cohort allocation** is reserved
for a separate fixed-packet legacy-anchor versus span-ID judge experiment: four
cases, two trials, two arms (16 calls maximum), after the effort study. This does
not increase the $100 total. It must preserve source text, patient context and
clinical criteria; serialization reliability is not clinical accuracy.

## Completed effort comparison: retain low

[All 48 calls and 24 outcomes](../outputs/clinical-lift-effort-study-2026-09-14/summary.json)
are retained. No replacement calls or repairs were used. Low had 6/12
release-eligible first answers; medium had 3/12. Median producer time was
17.512 s versus 23.335 s. Among pairs with valid producer/reviewer outputs,
medium added a median 4.189 s for producer plus judge. That paired latency
excludes one invalid low-arm judge, so it is not an all-attempt reliability
comparison. The failed review lasted 83.371 s and hit its output-token bound;
it is neither erased nor attributed to a 50-second wall-clock timeout.

The independent, timing-blind first-trial content audit found mixed improvements
and persistent unsupported assertions in both arms. The online judge missed
some contradictions and applied some judgments inconsistently. **Medium is not
promoted.** Neither arm's release count is a physician-scored accuracy rate.
Accounted cost including 25% contingency: **$8.881575**. Cumulative accounted
cohort plus effort cost: **$38.844704**; the $100 ceiling is unchanged.

## Repairs prepared during the frozen run

The helpers began as unwired, separately tested changes during the frozen v22
cohort. They are now being integrated into v23 in the main tree while fixed-packet
experiments run from their immutable source snapshot. They do not change any
evaluated case, source packet, judge verdict or historical score.

- **Repair idempotence:** C13's otherwise changed repair repeated `questions: []`.
  An identical authorized field should be recorded as a no-op, not invalidate
  genuine corrections in other fields. All-no-op, unauthorized, stale, malformed
  and incompletely coupled route patches must still fail. A changed draft still
  needs a fresh independent review.
- **Medication-check precision:** C18's conditional “start needing the inhaler”
  was misclassified as a new medication instruction. A field/span-aware tripwire
  distinguishes that predicate from actual dosing instructions, including new
  instructions later in the same sentence. It is not a semantic safety validator.
- **Judge quote serialization:** C07's judge invented an extra word in its
  quotation; C22's judge dropped Markdown characters. A packet-bound span-ID
  contract is being tested. The server resolves exact text; it cannot change
  verdicts, dismiss findings or turn source presence into claim support.
- **Defensible transitions:** C16 and C28 reached an accepted same-day draft,
  but their earlier ED instruction was judged defensible rather than wrong. The
  current contract cannot represent that distinction. An explicit, bound
  ED-to-same-day alternative decision is being prepared; activation or continuation
  of EMS cannot use that path. Unreported high-risk findings remain unknown.
- **Source quarantine:** two MedlinePlus topic documents contain the audited
  blood-pressure AND table. Their original bytes remain retained. A new local
  quarantine policy, plus narrowly extracted NHLBI patient-education material,
  is prepared for a new corpus version. This is an engineering hold, not a
  publisher retraction or physician attestation.

NICE's remote pediatric fever pathway allows face-to-face assessment with urgency
determined by clinical judgment for intermediate-risk features **without**
high-risk features; it does not make unreported high-risk findings absent. This
supports representing contextual alternatives, not automatically clearing C16
to wait or substituting a case-specific routing rule.
[NICE NG143, sections 1.2–1.3](https://www.nice.org.uk/guidance/NG143/chapter/recommendations).

C24 also shows why review benefit needs independent assessment: its second judge
objected to an unchanged contraception-subtype assertion missed initially.
Formulation-neutral wording is more faithful, but this record does not demonstrate
that the unchanged routine-async route caused harm. Do not silently expand repair
permission, retry until acceptance, or count every prose correction as a routing
improvement. C25's long wait was predominantly a truncated judge response and its
retained recovery, not slow vector search; its early same-day action still arrived.

## Independent span-ID study audit — completed fixed packets

This is a post-outcome, unblinded engineering review of all 16 retained judge
attempts, their exact first-draft packets, canonical findings and repair targets.
It is not new physician adjudication. The immutable study remains at
[`outputs/judge-span-fixed-packet-2026-09-14/`](../outputs/judge-span-fixed-packet-2026-09-14/),
with protocol `judge-span-fixed-packet/v1` and manifest fingerprint
`d75e199ac097cc6caea12f9e1ca07fee8a564b86be0b5055375e0f59d38e0f09`.
The frozen v22 reviewer, source passages, patient/draft packets and canonical
validator were held fixed; the experimental arm changed quote serialization to
packet-bound span IDs. This subsection does not alter historical artifacts.

**Accounting and reliability.** All 16 planned calls were dispatched: eight per
arm. Original serialization produced six valid reviews and two failures; span
serialization produced eight valid reviews. Every valid review was `revise`;
neither arm accepted an answer. Both failures were C07 original-arm attempts:
trial 1 failed exact-anchor validation after **20.394 s** (a spurious trailing
space in its structured quotation); trial 2 ended with `finishReason=length`
after **81.360 s**, using 6,144 output tokens. Neither is discarded, repaired or
counted as clinical acceptance. Total base token-cost estimate is **$2.818100**;
the accounted estimate including 25% contingency is **$3.522625**, not a provider
invoice. Accounted arm totals are $1.8288875 original and $1.6937375 span; the
original truncation contributes to that difference.

All-attempt median judge latency was **21.586 s original versus 16.351 s span**.
Across the six pairs in which both reviews were valid, the median paired
span-minus-original difference was **−3.6405 s**. These are judge-stage timings,
not earlier emergency instructions or complete workflow latency. Span input
tokens increased (99,904 versus 75,576 total), while total output tokens fell
(7,119 versus 14,147, including the original truncation). This small selected
study does not establish population tail reliability or a general cost saving.

| Packet | Findings retained across arms | Important qualification |
|---|---|---|
| C07 pediatric fever | Both span trials retain the unsupported maintained-hydration assertion, overbroad symptom denials and false five-day-fever flag; they retain self-care and nominate `reason`/`redFlags`. The readable original trial raises the same issues but has an invalid anchor. | Span trial 2 contains stray Tamil characters at the end of a grounding reason. The correction remains intelligible; this remains a raw reviewer-output quality defect. |
| C22 ankle injury | All four valid reviews abstain on unresolved fracture-screening sufficiency and fail grounding, claim support and safety-net criteria. Invented inversion, partial-weight-bearing clearance and the cold/pale-foot contingency remain flagged; none mandates a higher current route solely from uncertainty. | Both span trials omit the original arm's explicit unsupported one-to-two-week reassessment-interval finding and nominate narrower repair scopes without `citations`/`evidenceLimitations`. Trial 1 also omits `routing`. Core detection is retained, but full finding and repair-plan equivalence is not demonstrated. |
| C12 COPD | All four new reviews preserve same-day physical assessment and its emergency safety net, but fail the unqualified Counsel follow-up availability statement and request a patient-message repair. | This historically accepted packet no longer functions as a stable acceptance control: both original and span now return `revise`. That is reviewer instability, not demonstrated span-induced degradation or a new physician reference judgment. |
| C02 chest pain | All four reviews retain immediate EMS activation, support the early action and fail only the ancillary instruction requiring the patient to update dispatch after collapse. They nominate only `patientMessage` and do not presume a bystander exists. | This demonstrates preservation of the sampled emergency finding, not improved emergency detection or faster time to first action. |

**Recommendation:** enough evidence for a guarded, opt-in serialization
integration, not unqualified default promotion. Preserve the exact-packet
resolver, unchanged canonical acceptance checks, raw output, all negative
verdicts and the existing clinical review/repair gates. Before wider use, verify
the current v23 schema and browser provenance path, add a genuinely stable
accepted control, and measure whether the narrower C22 repair scope can actually
complete the needed corrections. No new paid calls were made for this audit.
The study supports a targeted contract-reliability and judge-stage latency
signal; it does not establish clinical superiority, judge calibration or
end-to-end repair benefit.

### Prospectively registered acceptance-control extension

Before additional provider calls, a separate eight-call manifest was frozen at
[`judge-span-positive-controls-2026-09-14/manifest.json`](../outputs/judge-span-positive-controls-2026-09-14/manifest.json),
fingerprint `ac9d02782cc8dc535ed1435642e01bc04cc20eef98da612653ad9d1033a67cc8`.
Its ceiling is **$3 inclusive of the same 25% contingency**, reallocated within
the existing sprint authorization, not a new user budget. Two trials per arm use
the same frozen v22 schema, instructions, Astra low effort and output bound;
there are no retries or replacement controls after outcomes become known.

Selection proceeded in ascending case order among historical first-judge
acceptances with complete final results. C12 was excluded for its already
identified follow-up availability assertion. C14 was selected. C15 was excluded
because absence of symptoms was used to assert that the request was not urgent
despite unknown exposure timing; C17 was excluded for reliance on a driver
without an unavailable-driver fallback. C21 was then selected. The original
patient, draft, cited passages and review bindings were inspected before these
new calls. This is an engineering suitability screen, not physician gold or
proof that every possible defect was excluded. Both controls concern emergency
care, so acceptance stability for async and self-care remains untested.

The new runner and eight focused offline tests passed in the frozen snapshot on
Node 24 and Node 22. Existing study code and all 16 earlier result artifacts
remain unchanged. The positive-control results will be reported separately;
historical acceptance is not an instruction to either new judge.

**Acceptance-control results — promotion withheld.** All eight planned calls
completed their attempt without retries; no slots were replaced. Original
serialization produced **4/4 valid accepts**. Span serialization produced
**2/4 valid accepts and two failures**:

- C14, span trial 2: `INCOMPLETE_MODEL_STREAM`, `finishReason=length`, 6,144 output
  tokens, **76.140 s**. This is a retained output-bound failure, not a 50-second
  wall-clock cutoff.
- C21, span trial 2: raw `accept`, but `UNKNOWN_JUDGE_SPAN_ID` for `s2och` in its
  grounding anchors after **13.377 s**. Exact resolution correctly rejects that
  nonexistent identifier. It is not a valid acceptance and must not be repaired
  by fuzzy matching or counted as success.

The two valid span reviews preserve their paired original reviews' essential
findings: immediate EMS for the allergy packet, immediate ED assessment with
transport fallback for the visual-loss packet, uncertain diagnoses and missing
findings left unknown, and no fabricated handoff. The failed C21 raw review also
requests no route reduction, but its unusable anchor still makes it a failure.
No patient answer was released by this isolated study.

All-attempt median judge times are **18.824 s original versus 13.923 s span**;
the median paired difference among only the two mutually valid pairs is
**−5.3015 s**. Neither faster statistic compensates for two failed span controls.
The base token-cost estimate is **$1.478910**, or **$1.8486375 accounted with the
25% contingency**, within the $3 ceiling. Across the two separately registered
studies, the accounted total is **$5.3712625**; each arm has ten valid reviews
among twelve planned attempts. This descriptive pooled count is not a
preregistered clinical or reliability effect estimate.

This extension supersedes the earlier guarded-promotion recommendation:
**retain quoted-anchor serialization as the default and do not promote span
serialization to the interview GUI on these results.** The experimental option
can remain for further development. A packet-specific allowed-ID schema is a
plausible next offline improvement, but it has not been tested in these calls
and would not itself resolve the observed truncation. Preserve both failure
artifacts and require a new frozen evaluation before any future promotion.

## Strategic assessment: what should convince the reviewer

The most defensible product is a **disposition workflow**, not an autonomous
diagnostic consultation: read the original message and attributed updates;
identify any immediate action independently; retrieve relevant evidence;
produce one care setting, async priority where applicable, a concise patient
instruction and brief supporting clinical context; review that exact response
and every issued earlier message. Route to the clinician destination stub
without claiming delivery, prescribing authority or confirmed availability.
This is consistent with Counsel's published separation of history, supervision,
clinical tools and task routing, but is not a claim to reproduce its private
implementation. [Public Mastra case study](https://mastra.ai/customers/counsel-health).

What is convincing here is the inspectable chain: original inputs remain
unchanged; sources and model requests are identifiable; disagreement is retained;
repairs cannot silently alter unrelated fields; clinician-reference agreement,
model review and actual publication are separate outcomes. A defensible ED-now
versus same-day alternative need not be mislabeled an error to reconcile the
patient instruction. The observed C16 GUI transition illustrates that mechanism,
not its general clinical accuracy. Likewise, a model-supported C07 self-care
alternative is not new physician approval.

What is **not yet convincing** is net clinical benefit at reliable latency.
The physician's review of all 50 incumbent answers is a valuable development
reference, not independent truth for the candidate or every claim in a new
response. The candidate still needs prospective, independently reviewed cases
with explicit acceptable alternatives and adjudication of disputed findings.
Counsel's filtered HealthBench emergency subset should remain a separately
reproduced evaluation, not replace these cases or import unstated patient
assumptions. [Counsel's published method](https://www.counselhealth.com/blog/how-counsel-leveraged-healthbench-to-assess-emergency-escalation).
C48's wrong early same-day instruction was a defect; a correct eventual route
did not close it. The subsequent narrow mobility-policy experiment and actual
GUI verification are recorded below. Its delayed final response remains a
separate limitation. Pending v23 cohort results cannot be treated as completed
verification.

Measure each agent's benefit by **independently adjudicated defects corrected,
defects introduced or missed, and unnecessary interruption or delay**. Keep
those outcomes separate rather than hiding their severity in one acceptance
score. Compare frozen first drafts with their reviewed final answers, and use
controlled same-input ablations to test whether a component caused benefit.
Report time to the first appropriate action, final completion, failed and
unfinished attempts, and cost alongside clinical findings. Review acceptance
alone is neither clinical correctness nor a successful intervention. This
follows the distinction between outcome grading and requirements that prescribe a particular execution path
in [Anthropic's evaluation guidance](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
and the separate model-versus-physician assessments in the
[Penda primary study](https://arxiv.org/html/2507.16947v1).

Keep complexity that protects a demonstrated boundary: patient-fact provenance,
source quarantine and version identity, exact review/repair bindings, and an
explicit reviewed alternative when an earlier instruction changes. Remove
complexity without demonstrated lift: neither medium effort nor span-ID judge
serialization earned promotion in these experiments. No additional supervisor,
graph expansion, query race or repeated prose field is justified merely because
another company uses one. Baseten's reported infrastructure latency is not a
clinically reviewed end-to-end target. [OpenEvidence infrastructure case study](https://www.baseten.co/resources/customers/openevidence-delivers-instant-medical-information-with-baseten/).
The next improvement should remove a measured source of wrong facts or wasted
repair time, then survive the same clinical, failure and GUI checks—not broaden
the assignment into an EHR, clinician queue or treatment platform.

## Subsequent verification: evidence, mobility, and reference integrity

### Evidence v8: preserve history while fixing the active index

The v8 migration retained historical documents and receipts, quarantined the two
identified MedlinePlus blood-pressure records locally, and added two bounded
NHLBI passages with the applicable adult/pediatric and symptom qualifiers.
Quarantine is an application decision, not a publisher retraction. The active
index identity now binds the corpus, embeddings and quarantine policy; startup
rejects mismatches. Existing vectors were reused rather than re-embedding an
unchanged corpus: 5,203 reused vectors plus two new chunks, 494 embedding tokens,
$0.000080275 contingency-accounted. The new corpus hash is
`af7e4a8c239c4b084525aba008d56ce833b3a08144cea6237319bf996aa30dbd`.
The migration and portable source bundle are in
`outputs/clinical-rag-v8-migration-2026-09-14/`.

This improves an identified source defect and reproducibility. It does not
establish that 1,391 eligible documents cover every new clinical case or that a
reachable source supports every generated claim. Scope, dates, qualifiers,
applicability and claim support remain distinct checks.

### Mobility: a narrow policy change earned a local promotion

Eight actual GUI starts in phase 1 all completed, but the C48 safety role still
issued same-day in-person advice before the final EMS disposition. This is a
patient-facing action defect, not merely an explanation defect. A prospectively
frozen 28-call safety-role comparison tested seven packets twice per arm: three
current injury/immobility positives and four ambulatory, chronic, historical or
quoted/denied controls. Candidate policy met all 14 authored action targets,
including all six positive EMS outcomes and no escalation in the eight negative
controls. Baseline C48 was same-day twice; candidate C48 was EMS twice at
2.230–2.510 seconds. Accounted study cost was $0.14249125.

The policy asks the model to distinguish current injury with inability to stand
or bear weight from a historical phrase or ambulatory pain. It is not a keyword
rule and does not alter the independent final model's input with a preliminary
decision. It applies to the full safety role only. NHS guidance supports
immediate hospital assessment after a suspected hip injury and emergency help
when unable to get up; mapping the emergency number to US 911 is the project's
local routing policy. [NHS broken hip](https://www.nhs.uk/conditions/broken-hip/),
[NHS falls](https://www.nhs.uk/conditions/falls/).

Independent review still found imprecise internal rationales in both arms. The
14/14 result is therefore **action-target performance on seven authored
development packets**, not 14 clinically flawless answers or a general safety
claim. The implementation, original pre-promotion source snapshot, raw calls,
negative controls and independent review are retained in
`outputs/safety-mobility-v23-live-2026-09-14/` and its adjacent plan directory.

After rebuilding, actual GUI C48 issued EMS advice at 4.127 seconds server time
(4.96 seconds browser receipt) and completed at 75.439 seconds. The early action
improved in this rehearsal; final review/repair latency did not. All three phase
2 starts, including the failure below, are retained in
`outputs/clinical-lift-v23-gui-2026-09-14/capture-phase2/`.

### Reference integrity: fix the wire format without revising the clinical review

C13 phase 2 produced standard async and a raw accepting judge review, but the
judge mistyped one long source ID. Its unchanged 82-character quotation uniquely
matched the body of a selected source in the actual judge packet. The run was
withheld as `JUDGE_CONTRACT_FAILED`, not relabeled a clinical rejection or
retrospectively counted as complete. A subsequent actual GUI update produced
self-care with a safety net, whereas phase 1's original and updated C13 both
produced standard async. That variation warrants an alternatives-aware clinical
audit, not an automatic failure or inferred physician approval.

The corrective boundary is deliberately narrow: an unknown bounded source-ID
fragment may resolve only through a unique, unchanged exact quotation in a
source body from that same packet. No fuzzy string match, metadata match,
outside source lookup, verdict change or quote rewriting is permitted. Known
IDs with incompatible quotes remain failures. The raw review, normalized review,
packet identity and repair map must all survive deterministic replay in both
the browser and offline scorer. This is serialization recovery, not semantic
entailment or a new judging model. Its post-build verification and final cohort
results must be reported separately from the original failed run.

### Browser publication and artifact verification

Ordinary patient replies now wait for the adjacent final result's provenance
validation before publication, as reviewed care revisions already did. Emergency
actions and nonblocking questions are not delayed. Transport receipt and
validated publication are recorded separately; neither is a browser paint
measurement. No new model call or clinical review round was added.

A concrete replay also found that the old 256,000-character line allowance was
too small for a valid retained audit: the 231,300-byte C43 historical result plus
two representative 26,530-byte review packets produced a 285,748-byte line.
The decoder now permits a bounded 1 MiB line / 2 MiB stream, retaining oversized
input rejection and separating line size from arbitrary network chunking.
The source packets are preserved rather than truncated to make a test pass.

Before phase 3, `npm run lint`, `npm run typecheck`, all constituent `npm test`
suites, `npm run review:test` (167 passed), `npm run review:build`, and
`npm run build` passed. Historical runtime-coupled experiment tests explicitly
skip under v23 and retain their original tested source archives; those skips are
not current-runtime passes. Mastra 1.27.3 installed 205 locked packages and
verified seven direct dependencies. This verifies the dependency artifact, not
hosted deployment or clinical performance.

Phase 3 and the prospective cohort use prompt hash
`009cfb6ba558b03e2105bb91d6e3fc7d6db06f1ae34ab1e44cf8de17ce1d2e79`.
Any further runtime change requires a new identity and freeze; prior GUI phases
are not silently pooled as one unchanged candidate.
