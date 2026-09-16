# Simplify the decision, not its accountability

## Decision

**Closer to the take-home: yes. Simple enough: not yet.** The useful product is
a disposition router with a concise, grounded explanation—not a complete
medical assistant, an EHR, a queue-management product or an ensemble debate.

The supplied assignment asks for incoming-message routing, ownership of bucket
design, and an evaluation explaining how the reference was defined. The five
operational routes fit that task: self care, priority async, standard async,
in-person today and emergency now. Medication request remains a work type;
care setting, queue priority and transport must not be conflated. The original
PDF describes 20 examples, while the supplied CSV actually contains 50; this
work keeps the actual 50-row dataset unchanged.

The clinician's judgments are the development reference. They are not silently
rewritten to agree with the candidate, and the candidate does not inherit the
physician's approval of earlier incumbent responses. C25 stays unresolved.

## What the current system really does

```text
Patient message ─┬─ Safety Haiku ──────────────────── early care instruction
                └─ Context Haiku → retrieval → Opus ─ deterministic admission
                                                     └─ final reply or withheld
```

All 50 frozen V25 attempts used exactly three model calls: 50 context, 50 safety,
50 disposition. No critic or repair ran. Mastra is doing real orchestration;
removing dormant judge files would not make those calls faster.

| Component | Recorded median across the 50 attempts |
|---|---:|
| Context | 2.76 s |
| Safety, parallel | 3.05 s |
| Slowest retrieval query within each run | 0.77 s |
| Opus disposition | 14.61 s |
| Deterministic release step | 0.008 s |
| Trace persistence | 0.026 s |

These overlapping step medians must not be added into an end-to-end percentile.
Opus received a median 18,539 input tokens and generated 884.5 output tokens.
The recorded clinical branch finished after safety in every attempt. The
measured bottleneck is generation, not Mastra or database orchestration.

Context currently returns retrieval queries, duplicated clinical findings and
a possible question. Its output **is passed to the producer**, alongside the
complete original patient message. There were 26 proposed questions, eight
published questions and a median six findings. Removing those outputs would
change model inputs; it requires a real controlled comparison, not a latency
claim based on deleting lines.

## What Counsel's publications support—and do not prove

Counsel describes Mastra history agents, parallel safety supervisors and
guideline/record retrieval within a much larger clinical platform. That supports
explicit workflow boundaries and parallel safety; it does not require copying
the whole platform into a take-home router. The topology below is our design
inference, not access to their private implementation.
[Mastra's Counsel case study](https://mastra.ai/customers/counsel-health).

Counsel explicitly discusses the practical cost of multiagent systems waiting
for their slowest participant, and the importance of workflow fit and common
clinical cases. Their published clinical-quality judges use specific clinical
rubrics; that is not evidence that every routing response needs a serial
general judge/repair loop. Keep targeted audits off the happy path unless a
paired experiment proves an online reviewer earns its latency.
[Practicality in medical AI](https://www.counselhealth.com/blog/the-importance-of-practicality-in-medical-ai),
[clinical-quality judges](https://www.counselhealth.com/blog/scaling-clinical-quality-assurance-with-ai-judges).

This also follows the composable-workflow principle: start with the smallest
working system and add orchestration when task evidence warrants it, not as
an architectural status symbol.
[Anthropic's effective-agents guide](https://www.anthropic.com/engineering/building-effective-agents),
[Mastra's orchestration guidance](https://mastra.ai/blog/multi-agent-orchestration).

## Ablation actually implemented and run: $0 API

Implemented an **offline typed-route projection**, separate from `DispositionRun`
and unavailable to the live GUI. It replays all 50 original producer records
and their packet/admission bindings. It does not call any model, change a
prompt or edit a recorded response.
This is an exploratory ablation designed after inspecting V25 failures, not a
preregistered or held-out confirmation study.

The projection keeps the typed setting, async priority/work type and emergency
transport. It renders ownership, timing and the action directive from existing
versioned policy. It does **not** copy generated rationale, differential,
medication instructions, red-flag assertions or claims of completed handoff.
All that original material remains in the immutable source run for inspection.
It retains packet and quote integrity and all issued-care conflicts. An offline
self-care proposal is not a complete self-care response without guidance.

| Measurement | Result | Interpretation |
|---|---:|---|
| Actual V25 completed responses | 27/50 | Unchanged live first-attempt result |
| Actual V25 agreement among completed, non-null references | 21/27 | Not all-case accuracy |
| Counterfactual typed-route proposals available | 42/50 | No new clinical releases |
| Projected route agreement among eligible proposals | 34/42 | Not equivalent to full-response quality |
| Projected agreement coverage across non-null references | 34/49 | Failures remain non-successes |
| Raw saved draft agreement, ignoring admission | 38/49 | Diagnostic only; unsafe as a release rule |
| New provider calls / new measured latency / new clinical releases | 0 / none / 0 | No speed or clinical-lift claim |

The eight projected lower-acuity disagreements are **C07, C12, C13, C22, C32,
C34, C38 and C47**. There are no higher-acuity projected disagreements in this
cohort. Directional route disagreement is not adjudicated harm.

All seven early-care/transport conflicts stay unavailable: C16, C19, C25, C28,
C31, C48, C49. C04 remains its historical failed delivery. C25 remains excluded
from agreement and under/over denominators. Every row records unsafe advice,
unsupported claims and route/prose semantic consistency as **not_assessed**.
All drafts had at least one citation; quotation identity does not establish
support for the projected route, particularly when the original claim described
advice omitted by this projection.

### Why not simply loosen the existing checks?

Eleven drafts failed the literal same-day/clinician-owner wording test, and
nine failed only that test. But six drafts also say “I've asked” or “I've routed”
without a real handoff, escaping the existing handoff regex. C36 suggests review
in the coming days. C01 makes an unsupported hydration denial. C24's “Keep using”
also evades the medication regex. These audit observations are not a completed
clinical-advice assessment of the cohort.

Removing a wording gate and republishing those answers would be misleading.
Canonical routing text avoids fabricated operational claims by construction;
it does not make the underlying clinical decision correct. The experiment
exposes two separate issues: route serialization coupled to whole-response
withholding **and** disagreement with the development reference. Neither may
hide the other; this experiment does not establish that those original
full-response withholds were clinically unnecessary.

## Cut, retain, prove

| Component | Decision |
|---|---|
| Five settings/priority distinctions and typed transport | Retain: they express the routing task |
| Independent fast safety | Retain for now: early action is useful; test attribution/negation and over-escalation independently |
| Context findings and unsolicited question output | Next ablation: query-only context; keep original patient text authoritative |
| One retrieval-fed disposition producer | Retain; test a shorter output contract before adding models |
| Generated ownership, timing and handoff claims | Remove from the proposed output responsibility; render from typed policy and actual integration state |
| Rich patient advice, long differential, repeated red-flag prose | Separate from routing admission; keep concise relevant explanation/evidence, never publish failed advice merely to improve availability |
| Judge, repair, extra supervisors, graph upgrade floors | No additions to the happy path; each needs measured incremental benefit |
| Clinician queue, billing, prescribing, follow-up delivery | Stub the integration boundary; no new product surface |
| Hash/quote integrity, ordered events, failure/cost records | Retain: auditability is not the dispensable complexity |
| Historical implementations and reports | Retain for reproducibility, but keep them out of the primary README story |

## Next controlled change—not a wholesale rewrite

1. Build an isolated slim-output candidate: one typed routing decision, brief
   patient-grounded reason, decision-relevant facts and passage references.
   Render operational copy from policy. A failed optional explanation cannot
   pretend the typed proposal has been clinically validated.
2. Hold the original messages, models, safety policy and retrieved packets
   fixed when testing the smaller output responsibility. Record all attempts.
   This is the cleanest next test of latency versus routing/reference retention.
3. Separately ablate context to retrieval queries only. Do not change query
   generation, evidence ranking and producer schema in one claimed causal test.
   Keep V26 retrieval ranking as its own experiment until merged deliberately.
4. Calibrate the remaining route deviations using patient-specific rationale,
   relevant management/triage passages and physician review of disagreements.
   Each clinical policy needs an explicit population, qualifying features,
   exclusions, action/timing, defensible alternatives and versioned supporting
   passages. A reachable URL or a citation about symptom description is not
   enough to substantiate a management/setting decision.
   Preserve defensible alternatives explicitly; never put acceptedRoutes into
   model context. Add paired negation, historical/third-person, chronology,
   refill-versus-new-red-flag and service-availability challenges. Those become
   development tests, not a fresh held-out score.
5. Promote only after repeated live first attempts and actual GUI testing show
   the routing, early action, contradiction handling, evidence support, latency
   and failure behavior together. A lower latency or a higher conditional
   agreement score alone is not enough. Obtain separate unseen physician-scored
   cases before claiming generalization beyond this development cohort.

The intended destination is **parallel early safety + a small evidence-grounded
router + deterministic policy rendering**, with targeted quality audits alongside
it. The system should make its evidence, uncertainty, failures and measured
operating limits inspectable. This design does not establish clinical accuracy.

## Reproduce and audit

```sh
node --experimental-strip-types --test tests/routing-boundary-ablation.test.ts
node --experimental-strip-types scripts/routing-boundary-ablation.ts \
  outputs/v25-path-b-complete-2026-09-15 \
  outputs/routing-boundary-ablation-NEW
```

The script requires a new destination, reproduces the original Path B scorecard
before projection, records source/code hashes, and checks inputs stayed unchanged.
Results: [machine-readable report](../outputs/routing-boundary-ablation-2026-09-15/report.json),
[all 50 rows](../outputs/routing-boundary-ablation-2026-09-15/cases.md),
[identity manifest](../outputs/routing-boundary-ablation-2026-09-15/manifest.json).
Historical reference: [V25 completed report](V25_COMPLETED_REPORT.md).

No live prompt, safety policy, corpus, gates predicate, GUI default or physician
reference changed. This experiment has **not** been promoted to the GUI.

Verification: all 782 existing root tests passed (48 skipped), all 171 GUI
regression tests passed, and eight new offline-ablation tests passed. Lint and
type-checking passed. The existing Next and Mastra artifacts verified; the
frozen V25 identity check confirmed its source, build, corpus, gold and original
four attempts were unchanged. A second offline replay produced a byte-identical
report. These were not new browser runs or a new production build.
