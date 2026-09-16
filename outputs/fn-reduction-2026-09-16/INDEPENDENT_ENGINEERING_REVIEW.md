# Separate engineering review of the false-negative reduction experiment

Date: September 16, 2026

## Review status and scope

This is an AI-assisted engineering review, including a separate arithmetic recomputation from saved raw provider responses. It is **not independent clinical adjudication**, physician approval, a blinded reference review, or evidence that either protocol is safe for patient care. The reviewer also contributed scoring code; “separate” describes the verification pass, not institutional or clinical independence.

The review covered the three completed new arms, their frozen artifact hashes, exact provider request envelopes, raw responses, reference mappings, paired changes, and accounting records. No additional model calls were made, no reference labels were revised, and no clinical runtime was changed.

## Verification findings

- Exactly 98 new attempts were recorded: 50 known-case candidate calls, 24 authored-case baseline calls, and 24 authored-case candidate calls.
- A separate script recomputed the new-arm metrics directly from raw response text and reference buckets. Its results matched the scorecards.
- All 303 new generation-artifact hashes matched: 153 for the known candidate and 75 for each authored arm. The scorer additionally verified 150 archived baseline artifacts before reference access.
- All 98 new request bodies matched their registered settings, registered system prompt, and one message-only user item. No reference labels, case IDs, prior answers, or retrieved material entered the user content.
- No failed or invalid outputs were observed. The scorer's tested failure handling retains positive-reference failures in sensitivity denominators and never converts them into self-care.
- The shared ledger contains three reservations, 98 durable starts, and 98 settlements. Summed settled accounting and completed-run accounting match to floating-point precision. Estimated usage was $0.80616; conservative accounted usage was $1.09497. These are accounting estimates, not invoices. No budget discrepancy was found.
- The complete local test log reports 977 tests: 929 passed, 48 skipped, zero failed or cancelled. Skipped historical-runtime tests do not constitute new verification of those historical versions.

## Metric interpretation

| Reference and endpoint | Baseline | Candidate | Interpretation |
| --- | ---: | ---: | --- |
| Known development set: route agreement | 48/50 | 44/50 | Comparison uses an archived historical control and a post-output physician reference. |
| Known set: any-clinician-action sensitivity | 41/43 | 41/43 | Two misses remain in each arm, but their identities change. |
| Known set: urgent-bucket sensitivity | 25/25 | 22/25 | Three additional urgent-to-async disagreements appear. |
| Known set: false omission among self-care outputs | 2/9 | 2/8 | This denominator is predicted self-care, not all 50 messages. |
| Known set: unnecessary clinician review against the reference | 0/7 | 1/7 | C32 changes to async despite a self-care reference. |
| Authored challenge: route agreement | 22/24 | 23/24 | Targets were authored by AI and remain clinically unreviewed. |
| Authored challenge: any-clinician-action sensitivity | 17/18 | 18/18 | F01 changes from self-care to async. This is authored regression behavior. |
| Authored challenge: urgent-bucket sensitivity | 9/10 | 9/10 | F02 remains an urgent-to-async disagreement in both arms. |

The unchanged 41/43 any-action sensitivity must not obscure the urgent-routing regressions. Async and urgent are both positive at the first boundary. Therefore that binary endpoint cannot detect a change from urgent to async.

The 25/25 historical urgent result does not establish zero population miss risk and does not evaluate emergency-versus-same-day timing. The three-bucket protocol cannot distinguish those two timings. No patient outcomes or actual harm were observed in this synthetic experiment.

## Exact changed-case accounting

The known-case candidate changes six dispositions:

- **C47:** self-care to async; resolves a disagreement with the physician v3 reference.
- **C07:** async to self-care; creates a clinician-action false negative relative to that reference.
- **C32:** self-care to async; adds clinician review relative to the self-care reference.
- **C04, C43, C49:** urgent to async; creates three urgent-boundary false negatives relative to that reference.

**C22 remains self-care in both arms.** Thus fixing C47 did not reduce the number of known-set clinician-action false negatives. A reference-relative disagreement on C07 or C32 is not, by itself, proof of inappropriate clinical management; those policies still require independent clinical review.

In the authored challenge set, **F01 is the only disposition change**. **F02 remains async in both arms**, against an unreviewed proposed urgent target. Complete exact messages and both rationales are preserved in the separate scorecards. The manual rationale-review template remains unfilled; no assertion-level clinical approval has occurred.

## Safety hypothesis supported by the saved rationales

The response text suggests that the model sometimes interprets `URGENT_ESCALATION` as requiring an emergency, even though the frozen prompt includes both emergency and same-day red flags. This is a hypothesis based on recorded output, not access to internal model reasoning or proof of the prompt's causal effect.

- C04's candidate rationale chooses async after saying reported findings do not warrant “emergency escalation.” The physician reference is urgent, which also includes same-day care.
- C49's candidate rationale identifies potentially important chest-pain causes and unknown findings, then chooses async because an “emergency threshold” is not met.
- C43's candidate rationale acknowledges a need for prompt evaluation but does not map the reported concern to the physician's urgent route.
- F02 in both arms identifies a need for ankle imaging but uses non-emergency wording to support async. Its proposed reference timing is **same-day in-person**, not immediate emergency action. This does not prove that its unreviewed target is clinically correct or that an async clinician could never arrange appropriate care.
- C22's candidate response still treats partial weight-bearing as supporting self-care despite the retained uncertainty about the full ankle assessment. The added paragraph did not consistently change that behavior.

These observations support reviewing the meanings of **care setting, required timeframe, and communication channel** before another model comparison. They do not support describing C04, C43, C49, or F02 as confirmed missed emergencies, fractures, or adverse outcomes.

## Recommended next decision

**Do not promote this candidate or replace the frozen demonstration protocol.** The known development results do not support the intended reduction in false negatives, and urgent-boundary performance worsened in this run. Retaining the baseline demonstration is not a clinical deployment endorsement.

Before another experiment, obtain a clinician-reviewed decision contract that distinguishes same-day assessment from emergency action, states when async review is an acceptable route, and identifies decision-critical missing facts. Use the recorded examples to discuss this contract, not to create case-specific overrides.

Have independent clinicians review the proposed challenge targets and document disagreements. Such review would now be retrospective. For a genuinely prospective evaluation, author a separate new case set, freeze blinded clinician labels and acceptance criteria before generation, and report urgent sensitivity, clinician-action sensitivity, false omission, referral burden, and uncertainty separately. Subsequent studies also need repeated-run stability and evaluation of the clinician-plus-system workflow.

No additional calls or automatic deployment follow from this review.
