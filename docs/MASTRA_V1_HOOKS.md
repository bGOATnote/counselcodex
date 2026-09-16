# Mastra implementation and extension boundary

## Current candidate: model-driven clinical workflow

`/candidate` executes `src/disposition/clinical-graph.ts` through
`graph-runtime.ts`, using real Mastra workflows and registered agents:

- Independent safety supervision runs in parallel with context → hybrid retrieval → disposition.
- The final disposition does not receive the early safety route. Cross-vendor review evaluates the draft and issued messages; one bounded repair is permitted.
- Clinical findings and questions require patient-quotation checks. Separately bounded query hints can still retrieve evidence when clinical extraction is rejected; they never become patient facts.
- Local spans retain workflow/model execution, usage and errors. Token-chunk spans are excluded. Query spans contain hashed queries and small retrieval metrics, not patient/source text.
- Admitted clinical messages stream through callbacks. Native workflow-stage streaming is **not** forwarded to the GUI. Run/event journals are append-only; workflow snapshot/resume is **not** implemented.

The GUI's candidate runtime and the older Studio default are distinct. Do not
describe the deterministic baseline below as the candidate's clinical architecture.
See `CANDIDATE_RETRIEVAL_OBSERVABILITY_2026-09-14.md` for the latest verification.

## Historical deterministic baseline and Studio default

The baseline executable application lives in `src/mastra/`. The small runtime in
`src/runtime/workflow-engine.mjs` remains only as a fast, dependency-light
regression mirror and must stay parity-tested against Mastra.

The baseline graph uses the Mastra v1 workflow surface:

1. Define strict read-only tools with `createTool` and Zod contracts.
2. Convert tools to workflow steps and compose them with `.parallel()`.
3. Apply a deterministic hard gate in the next step.
4. Let the residual router act only when `overrideBlocked` is false.
5. Finalize with `.commit()` and retrieve the registered workflow through
   `mastra.getWorkflow()`.

Dependencies are exact-pinned in `package-lock.json`. Local observability uses a
LibSQL/DuckDB composite, `MastraStorageExporter` for Studio, strict serialization
limits, metric-cardinality controls, and `SensitiveDataFilter`. Clinical runs
also use `tracingOptions.hideInput/hideOutput`; no platform exporter is enabled.
The durable `workflows` storage domain is disabled because Mastra workflow
snapshots can contain raw run input; execution uses transient process memory.
Add durable suspend/resume only with an approved encrypted or tokenized store,
minimum retention, deletion, access controls, and audits.

## Historical rationale (not the candidate policy)

Disposition and the emergency floor are deterministic policy decisions. An LLM
agent can vary its output and should not control this safety invariant. If an
agent is later introduced for history-taking or response drafting, it must run
under the hard gate, use structured output, have no mutating clinical tools by
default, and be evaluated as a multi-turn trajectory. A text-quality judge is
never a substitute for deterministic gate and tool-state checks.

## Studio/computer-use acceptance path

Use synthetic cases only:

1. Run `npm run dev` and open the workflow in local Studio.
2. Execute C08 (thunderclap), C06 (stable refill), C01 (named low-risk URI), and
   a deliberate red-flag tool failure fixture.
3. Confirm both parallel branches appear before `hard-escalation-gate`.
4. Confirm C08 is locked urgent and cannot be changed by the router.
5. Run each registered tool in isolation and verify its schema errors.
6. Inspect raw trace JSON and stored traces for absent/redacted message and case
   identifiers; restart Studio and verify raw workflow runs were not persisted;
   verify no external exporter or network call.
7. Save screenshots or trace IDs only when they contain synthetic data.

## V1 work

- Split emergency, crisis, obstetric, and pediatric supervisors into separately
  scored branches with destination-specific outputs.
- Add durable history-taking with `suspend` / `resume`; ask at most two questions
  and never suspend a locked urgent run.
- Replace `guidelineRetriever` with versioned clinical guideline retrieval and a
  separately permissioned chart/FHIR search tool.
- Add clinician approval for mutating tools such as orders and refills.
- Persist traces and physician overrides in shadow mode.
- Evaluate on untouched hold-out cases with a calibrated clinical reference process before
  making any generalization claim.
- Add separate authenticated API and Studio roles, tenant isolation, retention,
  deletion, audit export, disaster recovery, and alert ownership before any PHI.
