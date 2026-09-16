# Proposed clinical reference and workflow review

Prepared September 16, 2026. Research planning only. No independent physician review or prospective clinical evaluation has occurred under this protocol.

## The clinical decision to settle first

The service must define whether a routing label describes the **next responsible clinician contact** or the **care required to complete assessment and treatment**. A person may need physician messaging immediately and examination today. Those actions can coexist. An average response time cannot settle which action is adequate for an individual message.

Before collecting a new reference, qualified clinical leaders should approve a written operational scenario. It should state service population, staffed hours, the response commitment actually available, examination/testing access, emergency boundaries and responsibility for unfinished care. Use measured commitments or clearly labeled hypothetical scenarios. Do not supply the reported two-minute average as a guaranteed upper bound. [Service description](https://www.counselhealth.com/), [informed consent](https://www.counselhealth.com/informed-consent).

## Reference form

Each reviewer should independently record the following from the original message and the same operational scenario available to the model:

| Field | Required distinction |
|---|---|
| Clinician review needed now | Yes, no, or unresolved with the missing fact stated. |
| Acceptable next contact | Self-care guidance, physician messaging, direct in-person assessment, emergency action, or explicitly qualified alternatives. |
| Latest necessary action | Record a clinically justified deadline and the action it applies to. A reply and definitive treatment may have different deadlines. |
| Required capability | History clarification, prescribing assessment, physical examination, imaging/laboratory testing, procedure or emergency treatment. |
| Material unknowns | Identify what the message does not establish. Do not turn silence into a negative finding. |
| Evidence and applicability | State the relevant guidance, population, required findings and exceptions. A topic match is insufficient. |
| Possible consequence of delay | Describe a plausible mechanism and severity, with uncertainty. Do not record observed harm when no outcome exists. |
| Reference uncertainty | Preserve reasonable alternatives and reviewer disagreement rather than forcing certainty. |

The three displayed buckets can then be derived through a versioned mapping. Keep the richer reference fields so that a future timing or capability analysis does not have to invent them from a collapsed label.

## Review sequence

1. Author a genuinely new cohort from an approved synthetic or appropriately governed clinical-data process. Separate case development, any calibration set and the final evaluation set. Keep a record of who has seen which cases and outputs.
2. Have at least two qualified clinicians independently review the message-only inputs and declared service scenario before seeing model outputs or proposed labels. Use a third reviewer to resolve disagreements. Retain the original ratings and rationale.
3. Freeze the reference, accepted alternatives, exclusions, mapping and analysis before the final model evaluation. Declare exclusions prospectively. Report clinically difficult and unsupported-population cases separately instead of silently removing them.
4. Review model rationales after the route reference is locked. Record unsupported negative assertions, missing precautions and contradictions separately from bucket agreement.
5. If later outcomes are available, review them as a separate endpoint. Do not give the model or initial reference reviewers information unavailable at message arrival.

The existing 50-case v3 reassessment remains a familiar, single-physician, post-output development reference. The new 48-message challenge pack remains AI-authored and unreviewed. Subsequent review can improve either development resource, but cannot retrospectively make its original evaluation prospectively blinded or independent. Appropriate reference standards and representative evaluation are central to accepted development principles. [IMDRF principles](https://www.imdrf.org/sites/default/files/2025-02/IMDRF_AIML%20WG_GMLP_N88%20Final.pdf).

## Failure analysis and acceptance decisions

Clinical leadership should define tolerances by consequence and workflow role. A prioritization tool that leaves every message in physician review has a different failure pathway from autonomous self-care that removes review. Report sensitivity, false omission among self-care selections, unnecessary referrals and the amount of work transferred to clinicians together. [Real-message safety evaluation](https://link.springer.com/article/10.1186/s12911-026-03763-z), [human-reviewed inbox prioritization](https://academic.oup.com/jamiaopen/article/7/3/ooae078/7734326).

An engineering regression test may require zero newly introduced missed reviews on a fixed set. That does not demonstrate a zero miss rate in practice. Sample size, case prevalence, correlated variants, reference uncertainty and repeated development use all limit interpretation. Self-reported model confidence is not calibrated clinical risk.

For the current residual examples:

- **C22:** preserve the exact ankle message and identify the missing four-step and bony-tenderness assessment. Evaluate whether physician clarification occurs and whether indicated examination/imaging follows. Do not infer a fracture or treat the partial message as a negative Ottawa assessment. [Adult Ottawa guidance](https://aci.health.nsw.gov.au/ecat/appendices/ottawa-ankle-adult).
- **C47:** preserve the exact sleep complaint and evaluate whether the workflow obtains duration, frequency, daytime impairment and relevant risk information. The chronic-insomnia definition is not a requirement to wait before assessment when daily function is affected. [NHLBI assessment guidance](https://www.nhlbi.nih.gov/health/insomnia/diagnosis).

## Proposed shadow study

Keep normal care unchanged while recording the candidate recommendation in a separate research log. Measure arrival time, actual first clinician review, decision-changing clarification, time to required examination/testing or treatment, overrides, missed escalation, unnecessary referral, and unfinished-care ownership. Record unavailable capacity and outages. These are proposed measurements, not implemented queue or follow-up features.

Analyze clinically relevant subgroups and the tails of action-time distributions. Report both false-negative events and the workload created by precautionary referrals. Predetermine escalation of research findings, pause criteria and rollback responsibility before any supervised use. Early clinical evaluation should assess the human–system workflow, not only standalone model agreement. [DECIDE-AI](https://www.nature.com/articles/s41591-022-01772-9).

No employee, institution, vendor or publication has approved this proposed protocol. Implementation evidence, clinical reference quality and operational readiness remain separate decisions.
