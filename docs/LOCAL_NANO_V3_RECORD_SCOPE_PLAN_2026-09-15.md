# Record-scope clarification: final v3 development freeze

This is the extra development revision explicitly declared in the
[v2 report](LOCAL_NANO_V2_DEVELOPMENT_REPORT_2026-09-15.md). Validation has not
been generated or inspected. No fixture, reference or expectation is changed.

One general paragraph clarifies that patient text supports what the patient
reports, and that statements ABOUT the supplied record can describe missing
information without asserting a negative clinical finding. The available record
is not a complete medical history: an omitted assessment or measurement does
not prove that it never occurred. Ordinary paraphrases and direct comparisons
are allowed; the model should not substitute a stronger claim.

No condition names, patient examples, case IDs or physician routing labels are
introduced. Weights, thinking mode, 2048 per-phase cap, temperature, seed, schema,
task packets/order, labels and utility gate remain fixed. Input guarding now
reserves both native decode phases; all 60 frozen packets fit, so this rejects
no study case and changes no model request beyond the declared prompt paragraph.

The directories `outputs/local-nano-offline-v3-2026-09-15` and
`outputs/local-nano-offline-v3-final-2026-09-15` are **unexecuted preflights**,
preserved before wording review. They made zero model calls. Review clarified
that "not assessed" is a claim about actual care, and that an uncertain fact
can be mentioned without being established. The final paragraph separates both
distinctions. Final execution uses
`outputs/local-nano-record-scope-2026-09-15`; do not combine the directories or
call the unexecuted preflights evaluated configurations.

Run 24 development requests once. If the utility gate passes, select this
identity and run the 24 authored validation requests once, then the separate
12 mining/negative tasks. Freeze selection before validation; no further model,
prompt or threshold tuning follows validation. Preserve every miss, false alarm,
abstention and failed first attempt. Deadline remains 19:37:46 UTC.

This evaluates offline engineering utility only. It cannot promote `/candidate`,
certify clinical correctness or create physician gold. All paid roles and
historical scorecards remain unchanged; no paid-provider call is required.
