# Attempt 7: C30 after the v16 correction

Run `c6225e23-17de-4e45-a294-60db9c7663f6` used `evidence-graph/v16`, `disposition-clinical-policy/v2`, and prompt hash `ebeef99601056bbe34ca68c7212ac55e7c07afdf1ef089377feb0e3c62e78567`. Its retrieval corpus hash was unchanged from the six v15 baseline attempts. This is a changed-policy retest, not an additional unchanged-baseline observation.

The run finished in **88.697 seconds**, used **six model calls and one repair**, and cost an estimated **$0.531610** at the repository's standard token rates. The server emitted a nonblocking question at **6.946 seconds**, but no action or patient reply. Browser observations, with their original reported precision, are recorded separately in `browser-observations-addendum-7.json`. Total GUI spend through seven attempts is **$2.809535**; the earlier fixed-packet study remains separate.

## Release outcome and exact defects

The runtime ended `review_required` / `clinician_required`, with aggregate failure `CLINICIAN_REVIEW_REQUIRED`. Its canonical answer is **null**. Both draft/review sequences supported the Self care route, but that does not make this a successful released answer:

1. The initial draft described the eruption as occurring **two days after exposure**, despite the patient saying only that exposure occurred on Saturday. No reference date established a two-day interval. The initial review rejected this grounding error and safety-net wording.
2. The repair removed that invented interval but stated that the rash was **confined to both forearms**. The patient's message reported forearm involvement without excluding other locations; the same packet marked other distribution as unknown. The second review rejected that unsupported restriction. With the bounded repair already consumed, no final answer was released.

This demonstrates both an improvement and an unresolved limitation. The judge detected these concrete contradictions, and v16 did not manufacture Priority async as a fallback when a grounded final answer was unavailable. However, the patient still received no final disposition after roughly 89 seconds. That is a failed release, not clinical validation of Self care or evidence that the live workflow is presentation-ready.

The nonblocking distribution question was preserved in the exact event stream. Its presence does not establish that delay was necessary; the route was not blocked awaiting that answer. Future retests should distinguish a patient actually confirming localized distribution from a model inferring it from silence.
