# Lean disposition release plan

The take-home asks for a lightweight incoming-message router and an evaluation
against a defensible reference. It does not require a full autonomous care platform.
This pass adds one release mode to the existing candidate, not another application.

## Keep and cut

Keep Mastra's parallel safety branch, context-driven retrieval, frozen selected
passages, one disposition producer, five operational routes, early care preservation,
the existing output contract, append-only run journals, and the physician reference.
Keep the incumbent `/` unchanged. Keep v24 hybrid and no-judge behavior in-tree.

Remove judge, repair, and judge-triggered retrieval from the default `/candidate`
execution. Do not delete historical experiment code or change provider choices.
The default is v25/gates-release; v24 remains the recorded full-review contract.

## Precise deviations from the supplied proposal

- Empty evidence cannot be both a completed answer and clinician_required. It
  withholds the explanation, preserving already-issued care.
- A typed emergency intent cannot claim an independent reviewer. The new mode
  checks directive consistency without creating reviewed transport metadata.
- The old onset guard defers some claims to a mandatory judge. Use the original
  stricter deterministic guard in gates-release; keep the hybrid guard unchanged.
- Do not register v25 gates-only in the full-review compatibility registry.
  Bind a separate release policy, selected-packet hash, draft hash and mode.

## Changes and verification

Core: gates-release.ts, clinical-graph.ts, graph-runtime.ts. Boundary: the existing
stream reader and disposition GUI. Evaluation: physician-cohort.ts and new targeted
tests. Validate both parallel branch orders, abort, missing/corrupt evidence,
no silent care-setting or EMS downgrade, forged release metadata, C25 exclusion,
and unchanged hybrid/no-judge semantics. Run the existing test, lint and build suite.

No paid runs, embedding rebuild, reference edits, new supervisors or deployment
claims in this implementation pass. Controlled GUI responses establish software
integration only. Prospective latency and patient-message safety remain unmeasured.
