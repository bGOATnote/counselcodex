# Adjudication should capture a decision, not soften it

## What changed

This is a project-designed review instrument, not a reproduction of Counsel's internal interface. The two comparators remain because the assignment asks both to audit the supplied workflow and evaluate the build. They now use the same three choices:

- **Appropriate**.
- **Wrong**, with an optional subtype: under-triaged, over-triaged, wrong channel/timing, or unspecified/other.
- **Cannot judge**, for genuine uncertainty—not a substitute for a definite failure.

An inadequate action/timing instruction can be wrong even when it shares a broad category with the clinician's answer. Under-triage is a clinician judgment about routing adequacy, not proof that patient harm occurred.

The already-required independent route and short reason are retained. New ratings do not require that reason to be typed a second time. Correction notes remain available. Brief differential and source links remain visible after reveal; detailed safety inventories and source provenance are expandable. No guidance is revealed before the independent decision.

## Where the feedback goes

| Input | Actual use |
| --- | --- |
| Locked pre-reveal disposition | Primary completed-case routing agreement and confusion matrices; four levels for V0, three-level projection for the original dataset |
| Source verdict | Separate original-workflow failure summary and case queue |
| V0 verdict | Separate V0 failure summary and case queue |
| Wrong subtype + clinical reason + correction note | Failure investigation; exported with the case and frozen prediction identity |
| Post-reveal revision | Secondary agreement only; never overwrites the independent reference |

Previously, the source rating fed a possible-under-triage count, while the V0 rating mainly gated completion and was exported. The visible feedback loop was incomplete. Both now have completed-case counts and a failure queue in Results. These ratings **do not automatically train an agent, rewrite prompts, repair rules, or establish efficacy**. The next engineering step for a confirmed failure is a versioned candidate change followed by regression and independent evaluation.

New explicit codes are additive to the existing JSON/CSV contract. Old values—including `possible_undertriage`, `clinically_conservative`, and `unsafe_or_inappropriate`—round-trip unchanged and are listed separately as earlier ratings. They are not retrospectively upgraded into the new verdicts. Existing completion validation is retained for old records. No browser responses, source CSV, prediction artifact, or prior research result was changed by this update.

## C04: clinical finding and evidence boundary

**Case-specific engineering judgment: same-day in-person assessment is the appropriate destination; asynchronous intake can coordinate it but cannot replace the examination.** The saved V0 output and the current deterministic workflow still route C04 to async physician review. This is a known baseline failure, not corrected by improving this form or adding citations. The research brief is explicitly separate from the scored V0 output. The clinician's own review has not been filled in by code.

The 2023 IWGDF/IDSA guidance bases infection diagnosis on clinical inflammatory findings and requires severity assessment. Fever is often absent; its absence cannot clear this wound. Reported local signs raise infection concern, but message text does not establish depth, perfusion or severity. Probe-to-bone and imaging recommendations address assessment for osteomyelitis; they should not become an indiscriminate precondition for every remote contact. [IWGDF/IDSA guideline](https://www.idsociety.org/practice-guideline/diabetic-foot-infections/).

NICE NG19 distinguishes immediate acute referral for limb-/life-threatening presentations from referral within one **working** day for other active foot problems, with triage within another working day. That is not an exact “within 24 hours” universal rule. The same-day destination above is our application to this new symptomatic wound, not a verbatim NICE deadline. [NICE, recommendations 1.4.1–1.4.2](https://www.nice.org.uk/guidance/ng19/chapter/Recommendations).

The cited telemedicine literature does not establish that this initial evaluation can be safely replaced by autonomous text care. Smith-Strøm's trial studied ulcer **follow-up** with coordinated primary/specialist care; its protocol uses community nurses and an interactive wound record. It is not a patient-only initial-triage validation. [Trial](https://diabetesjournals.org/care/article/41/1/96/36640/The-Effect-of-Telemedicine-Follow-up-Care-on), [protocol](https://pubmed.ncbi.nlm.nih.gov/27430301/).

Rasmussen's 2015 randomized monitoring trial did report higher mortality in the telemedical arm without significant healing/amputation differences. That signal deserves scrutiny, but does not establish a general causal mortality effect for all telehealth or for this triage system. [Primary trial abstract](https://pubmed.ncbi.nlm.nih.gov/26116717/).

These were targeted primary-source checks, not an exhaustive systematic review. The additional Malabu, Rastogi, image-validity and pandemic-framework details in the supplied model-generated commentary were not independently established here and are not used as premises for the implementation.

## Verification and remaining limits

- Verification run: 72 review tests, 65 core tests, 23 Mastra/agent tests and 18 quality-audit tests pass; production build, TypeScript checks and lint pass. These establish software behavior, not clinical safety.
- New verdict combinations, required-answer validation, independent denominators, legacy preservation, CSV/JSON/checkpoint round-trips and disk-store restart recovery are tested with isolated synthetic fixtures.
- Actual assessment component rendering checks three choices, no automatic selection, conditional subtypes and an unchanged historical-rating notice. Existing tests cover pre-reveal evidence hiding and all 50 actual Mastra executions.
- The C04 regression documents the current **known failure**, not a passing clinical standard. Matching the frozen output is implementation parity, not clinical correctness.
- The appended [link report](research/link-checks/2026-09-10T15-15-47.546Z-0f4811a51e4e.json) records HTTP 200 for both new guideline links. Other registry links remain access-blocked where observed; reachability never implies claim validation.
- Browser interaction testing has not been performed in the user's review session; no test clicked, completed or attested a real review.

Before changing the C04 router, freeze this failure, implement a versioned candidate, and test new diabetic foot wounds, negation, historical/resolved wounds, non-foot injury, afebrile infection, and emergency overrides for systemic illness, ischaemia, gangrene and deep infection. Evaluate timing and destination, not just agreement with the supplied label. Do not overwrite the frozen baseline to manufacture improvement.
