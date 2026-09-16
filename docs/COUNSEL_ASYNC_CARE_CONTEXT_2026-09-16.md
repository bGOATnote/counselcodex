# Async care: channel, response time and required assessment

16 September 2026 · Context clarification after the experiment · No score or reference change

## What the public source establishes

Counsel's homepage reports an average two-minute physician response. Its FAQ says a physician usually joins within 15 minutes during clinical hours, listed as 8 am–9 pm, seven days a week. It describes adult-only access (18+) and directs potentially life-threatening conditions to emergency care immediately. These are published service descriptions, not measurements from this experiment. [Counsel homepage and FAQ](https://www.counselhealth.com/)

Its consent document describes physician care primarily through asynchronous messaging, with prescribing or treatment recommendations when appropriate. It also explains that some symptoms need in-person or urgent care. [Counsel informed consent, last modified 23 June 2025](https://www.counselhealth.com/informed-consent)

## What follows, and what remains unmeasured

**Async describes a communication channel; it does not itself mean delayed or next-day care.** Rapid physician review could arrange appropriate same-day assessment, testing or treatment. It is therefore inaccurate to infer harmful delay solely from an `ASYNC_PHYSICIAN` output. Conversely, an average initial response time does not establish when a particular patient receives the required examination or treatment. We have not measured the response-time distribution, access at the message's arrival time, or completion of downstream care.

The experiment's three labels combine different dimensions:

| Dimension | Question to specify in the clinical contract |
| --- | --- |
| Next contact | Should this message reach a physician, an emergency service or a self-care response now? |
| Response deadline | How soon must a qualified clinician assess the reported concern? |
| Required capability | Can messaging complete the necessary assessment, or is examination, imaging, testing or another service needed? |
| Definitive-care deadline | By when must the indicated assessment or intervention actually occur? |

This distinction is a proposed interpretation for clinical review, not a claim about Counsel's internal routing policy or a request to add queue logic to the stripped prototype. A future reference should explicitly say whether it grades **the next appropriate contact** or **the required care setting and deadline**. These are not interchangeable targets.

## Implications for the recorded false negatives

- **C22 and C47:** the baseline selected self-care while the physician reference required clinician review. Faster async access does not remove that missed-referral classification: the model did not select the clinician channel. C47 changes to async in the candidate; C22 remains self-care.
- **C04, C43 and C49:** the candidate selected async instead of the frozen urgent target. They remain urgent-endpoint false negatives under that reference. Rapid physician review might provide timely coordination in a suitable workflow; the label alone establishes neither adequate care nor harmful delay. Clinical review must resolve the intended action, setting, deadline and available capability before changing the target.
- **F02:** the same channel-versus-setting question affects the proposed imaging-assessment case. Its urgent target remains AI-authored and unreviewed, so it requires clinical adjudication independently of model agreement.
- **Pediatric assignment cases:** the public service's stated adult scope differs from the supplied assignment set. Retain every original case and denominator. A future intended-use study should define its population before sampling and report any scope exclusions explicitly.

No patient-care workflow or clinical outcome was exercised in this one-message experiment. The updated interpretation must therefore distinguish **fixed-reference disagreements**, **hypothesized risks** and **observed outcomes**; the last category is absent here.

## Next step

Have independent clinicians review a written, service-specific decision contract. For any case proposed as acceptable for rapid async review, specify the required response deadline, available capability and completion deadline rather than relying on an average response statistic. Preserve emergency actions that must not wait for a message response. Record unresolved cases explicitly.

If that review changes accepted routes, publish a **new reference version** with actual reviewer provenance, clinical rationale and an explicit comparison against the frozen reference. Do not retroactively replace v3 labels, alter generated outputs or present contextual rescoring as improved model behavior. The [results report](FALSE_NEGATIVE_REDUCTION_RESULTS_2026-09-16.md) and [validation plan](FALSE_NEGATIVE_REDUCTION_PLAN_2026-09-16.md) retain the original counts and distinguish them from the unmeasured workflow questions.
