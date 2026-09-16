# Runtime artifact review: first four GUI attempts

This is an engineering review of exact run/event artifacts, not physician adjudication or an independent browser observation. Browser receipt observations were supplied by the root agent and are retained separately. The frozen fixed-packet judge experiment is a separate study ($2.53834); these four GUI attempts total $1.534943 in standard token-cost estimates, excluding embedding and cache-specific charges.

## C02 and active-EMS update

Both final artifacts are `complete` / `model_reviewed`, without repair. Initial C02 emergency action arrived at 8.798 seconds server time (9.32 seconds reported browser receipt); completion was 41.207 seconds. The active-EMS update completed at 38.286 seconds, without a newly emitted early action or question. A successful final review does not establish adequate early-action latency or independently verify EMS activation.

## C04: useful review correction, remaining provenance/capability limits

Run `7bfc528b-5d2e-42d9-9c7e-7a0813283eea` emitted same-day in-person action at 4.267 seconds, a nonblocking wound-visibility question at 5.917 seconds and its final reply at 79.442 seconds. It used six model calls and one repair.

The first judge identified narrative "spreading" redness that was not reported and mandatory wound probing not established by the supplied evidence. The repair removed those assertions; final review accepted the same-day in-person route. This is an observed useful interception, not a measured causal comparison with the full judge.

Material limitations remain:

- The final reply says "I can help coordinate in this thread." The judge passed ownership because no appointment acceptance was promised. In this prototype, actual coordination is stubbed; absence of a fabricated completed handoff is not proof that the claimed assistance capability exists.
- Citations are agent-compiled emergency-department cellulitis/necrotizing-fasciitis summaries, not specific diabetic-foot or telehealth guidance. One cited severity claim extrapolates a broad diabetes/immunocompromise framing; the answer marks applicability uncertain. That acknowledgement does not upgrade the source into a primary guideline or validate individual severity classification.
- The recorded retrieval includes unrelated orbital/corneal/peptic-ulcer results for a foot-wound query. These were not the final cited evidence, but they are a retrieval-specificity limitation.
- The final machine-review pass cannot substitute for source quality, applicability, or physician review.

## C50: semantic review failure, not provider timeout

Run `d761d5ff-2b0c-4ee0-bfd0-b70451b3db6a` ended `review_required` / `clinician_required` at 79.052 seconds. No action, question or patient reply was emitted. All six model executions completed without a transport/schema failure. The application emitted a conservative Priority-async clinician-review fallback rather than the drafted explanation.

The first judge rejected an invented "without aura" subtype, broadening of exhausted sumatriptan into exhausted rescue medication, a blanket red-flag statement and an absent access fallback. Those issues were repaired. However, the revised reason now called generic "aura" a red flag, whereas the supplied table specifies "Atypical aura." The second judge requested that correction and preserved the Priority-async route. With the single repair already consumed, no model-reviewed explanation was released. This remaining factual/source-qualifier error and the failed completed-answer experience are retained, not relabeled as success because the fallback route was proportionate.

## Provenance errata

The unchanged plan incorrectly calls the initial graph `clinical-evidence-graph/v15`; actual run/event artifacts identify `evidence-graph/v15`, policy `disposition-clinical-policy/v1`, concise judge style.

The capture helper's first derived summary, `summary-3-f7de0b7e1d60.json`, checked the wrong terminal spelling (`completed` rather than `complete`) and incorrectly listed the first three successful runtime releases as final failures. That derived artifact is retained with an explicit correction in v2 summaries. Original runs, events, statuses and model verdicts were not changed. Use `summary-4-1b73b5362577.json` for the corrected four-run summary.
