# Clinical disposition policy: requirements, pathways and defensible alternatives

Version: `disposition-clinical-policy/v1` · authored 2026-09-14.

This is an engineer-authored policy for the research candidate, informed by public clinical guidance and the physician's prior review. It is not Counsel's private protocol, a new physician attestation, or proof of deployment readiness. The original 50 messages, supplied labels, frozen physician reference and historical results are unchanged.

## The decision being made

Select the least burdensome **feasible pathway that meets the clinical need**, not the lowest label and not the most alarming diagnosis imaginable. Separate five questions: what capability is needed, how soon, where it can occur, how the patient gets there, and who owns the next action. A precise diagnosis is not required before emergency referral. Conversely, unreported risks do not become positive findings.

Counsel publicly describes clinician-led history, record/photo review, prescribing, referrals and longitudinal coordination. That supports treating async care as a capable entry point, not as a synonym for delayed care. It does not prove that our prototype has staff, imaging access, an accepted handoff or delivered follow-up. [Counsel's clinical model](https://www.counselhealth.com/blog/the-counsel-difference)

| Route | Requirement | Timing and ownership |
|---|---|---|
| Self care | Guidance suffices; no required clinician action remains. | Advice and relevant safety net. Not a blanket absence-of-disease claim. |
| Priority async | Time-sensitive clinician assessment, prescribing or coordination can safely start in messaging. | Higher Counsel queue priority; review recommended today, without a guaranteed response time. |
| Standard async | Clinician action remains without a demonstrated need for higher priority. | Prompt same-day service-hours target, lower queue priority—not an automatic 48-hour delay. |
| In-person today | Necessary examination, measurements, testing or treatment cannot be completed by messaging alone. | State the capability and required interval; “today” does not authorize waiting until closing. Counsel may coordinate without delaying care. |
| Emergency now | Reported findings establish sufficient concern for a time-critical threat. | Immediate action; no wait for questions, retrieval or review. Specify emergency attendance versus EMS/911 according to transport need. |

Refills are a **work type**, not a sixth care setting. An active usual migraine with medication exhausted can justify Priority async without implying an in-person requirement. Medication checks belong before prescribing, not necessarily before routing to a prescribing clinician. Independent red flags, withdrawal risk and loss of rescue access can change urgency. Prior treatment, age or duration alone never clear risk.

The existing `five-route-queue/v2` encoding is retained. Service availability remains unconnected. No policy statement establishes receipt, acceptance, a prescription, test booking or follow-up delivery. A clinician-owned follow-up plan must specify what is monitored, who reviews results, when reassessment is needed, and what happens if contact or access fails; actual delivery remains a stub.

## How an alternative qualifies

An alternative needs a patient-grounded rationale, timely access to required capabilities, appropriate transport, and an actionable fallback where access is uncertain. An async coordination step is not equivalent to completion of physical assessment. A patient must not wait in an undefined queue when the needed care cannot wait.

Use these clinical adjudication categories; retain binary checks for concrete obligations:

| Judgment | Meaning |
|---|---|
| Supported preferred pathway | Meets the requirements and aligns with the preferred development reference. Label agreement alone is insufficient. |
| Defensible alternative | A different, adequately justified pathway meets the requirements without unsupported prerequisites or disproportionate burden. |
| Conditional alternative | Could be appropriate, but a necessary clinical or operational prerequisite is not demonstrated. Identify it and the immediate fallback. Not an automatic pass or a proved clinical error. |
| Unsupported/unsafe pathway | Identify the actual violated requirement: delayed necessary care, unavailable capability presented as secured, inappropriate transport, or materially unnecessary escalation. |
| Unresolved | Available information or evidence cannot settle adequacy. Do not invent a pass, a diagnosis or a failure. |

For **undertriage**, name the unmet clinical capability or timing and its patient-specific basis. For **overtriage**, name the materially unnecessary escalation and why a lower-intensity pathway can meet the need. A different preference is not sufficient. Neither “more conservative” nor “the judge said so” establishes correctness. An obviously unnecessary emergency demand need not await proof of a booked alternative appointment before being criticized.

Counsel's published framework uses condition-specific clinician-defined checks; its judges sometimes rated interactions more strictly than physicians. That argues for calibration and explicit admissibility—not automatic model authority. Its emergency benchmark emphasizes precision as well as recall, but excludes conditional emergencies and second-hand prompts; those require separate testing here. [Counsel judge framework](https://www.counselhealth.com/ai-report/llm-as-a-judge), [Counsel emergency evaluation](https://www.counselhealth.com/blog/how-counsel-leveraged-healthbench-to-assess-emergency-escalation)

## Applying the policy to the disputed cases

### C04: new inflamed diabetic plantar wound

Preserve the physician's in-person-today reference. Messaging may coordinate that examination; it does not replace it. NICE 1.4.1 directs immediate acute referral for limb/life-threatening problems, including ulceration with fever/sepsis. For other active problems, 1.4.2 specifies referral within one working day and triage within another. Our same-day setting is an operational interpretation, not NICE's literal deadline. The case says cut and no fever; do not manufacture ulceration, sepsis or a mandatory ambulance. [NICE NG19](https://www.nice.org.uk/guidance/ng19/chapter/Recommendations#diabetic-foot-problems)

### C25: possible DVT

Keep the physician's qualified disagreement; do not silently make it a scored right/wrong label. The clinical need is timely assessment and a diagnostic pathway. Priority async can be a coordination alternative only when it preserves that pathway; unconfirmed imaging access cannot be presented as booked. Same-day direct assessment or ED can be defensible when necessary access cannot be secured. New PE symptoms, instability or limb-threatening findings change urgency.

NICE uses clinical assessment/Wells probability to select testing. For likely DVT it specifies ultrasound results within four hours if possible, or its interim-treatment/24-hour imaging pathway. These are not permission for an AI to calculate an incomplete Wells score, start a DOAC, or assume pregnancy status; pregnancy is outside NG158's scope. [NICE NG158](https://www.nice.org.uk/guidance/ng158/chapter/Recommendations), [scope](https://www.nice.org.uk/guidance/ng158)

### C49: sharp pleuritic pain after a workout

Preserve in-person today as the preferred reference. ED assessment can be a defensible alternative with a grounded reason for immediate capable assessment; it is not automatically overtriage. Neither young age nor workout association proves benignity. The message does not explicitly establish exertional pain, and unknown family history is not a positive history. Sharp/pleuritic pain is less suggestive of ischemia, but serious nonischemic causes remain possible. A cautious route is still judged for necessity, transport and feasibility, not automatically passed. [ACC chest-pain guidance](https://www.acc.org/latest-in-cardiology/ten-points-to-remember/2021/10/27/14/06/2021-guideline-for-chest-pain-gl_chestpain), [ACC athlete assessment](https://www.acc.org/latest-in-cardiology/articles/2022/08/04/14/40/updated-approach-to-the-athlete-with-chest-pain)

### C50: usual migraine with sumatriptan exhausted

Preserve Priority async. Required prescribing history does not itself force physical care. New concerning headache features or inability to manage symptoms can justify another pathway. This is routing to clinical review, not approving sumatriptan. There is no blanket rule that all refills, all headaches or all missing blood pressures share one disposition.

## What is executable now

- `src/disposition/clinical-policy.ts` supplies one policy to the candidate's existing safety, disposition and judge roles. The context extractor remains independent. No extra model, vendor switch, lookup table of case answers or graph enforcement is added.
- `evidence-graph/v7` records the clinical-policy version at run start and in results; changed prompts receive a distinct hash. Source links document policy provenance; they do not enter or count toward a generated response's retrieved evidence.
- The existing seven judge criteria remain binary/abstaining checks. The judge is instructed to accept a defensible alternative, identify the concrete failure when rejecting it, or abstain when a critical prerequisite is unresolved. This is model reasoning, not a deterministic proof of clinical adequacy.
- `physician-cohort-scorecard/v3` keeps exact agreement unchanged and adds separate stored-model review status. Model-supported alternatives never increase physician-reference agreement. Qualified C25 remains separate. Old judges retain their recorded policy identity; none are retrospectively portrayed as applying this policy.
- Emergency delivery is measured separately from final agreement. Earlier wrong instructions and absent early actions remain visible even if the final answer is correct. No arbitrary latency threshold is introduced.
- The shared emergency heading is now “Emergency assessment now”; the actual ED or EMS/911 instruction remains underneath. Setting and transport are no longer conflated in the heading.

## Verification and remaining boundaries

Run `npm run clinical-policy:test` for offline policy/scoring controls and `npm run rag:test` for real-Mastra injected-provider integration. These tests establish contracts and accounting, not measured model adherence or improved clinical outcomes. The candidate needs a fixed-version live comparison; an alternative's model endorsement still requires clinician calibration.

Verification on 2026-09-14: all 483 core tests and 133 GUI/component tests passed, as did lint and TypeScript checking. Next and Mastra production builds passed in an isolated source copy, without replacing the currently running GUI or copying provider keys. The policy tests check shared definitions and invariants; the scorer tests use explicitly synthetic judge packets, not clinical performance claims.

The present judge packet does not expose elapsed delivery times. Its content acceptance therefore cannot certify timely emergency delivery. The scorecard reports retained server-event times separately; those are not browser paint, patient receipt, or completed action measurements.

The previously documented C02 early-instruction rejection remains a separate engineering defect. This policy work does not claim to fix that transport/validation path. The new policy is prepared in source; no server restart, GUI release, paid evaluation or production promotion is implied by this document.

Primary web sources reviewed on 2026-09-14. Counsel and ACC pages opened successfully. NICE recommendations were available through the indexed primary pages; direct requests intermittently returned 403, so uninterrupted direct link reachability is not claimed. These notes do not certify source currency, exact patient applicability or content redistribution rights. No guideline bodies are copied into the evidence corpus.
