# Mastra entry-point and artifact audit

14 September 2026. Read-only inspection during the frozen v23 cohort; no server,
build, database, provider or credential operation was performed.

## Answer

`npm run build` ships the **incumbent Mastra server**, not the current candidate.
The candidate is nevertheless a real Mastra workflow, shipped inside the separate
Next server built by `npm run review:build` and served at `/api/candidate`.
This is a genuine **CLI discoverability/deployment-surface gap**, not evidence that
the candidate is fake Mastra or that its measured endpoint bypasses Mastra.

## Exact evidence

- `src/mastra/index.ts:4-5` imports `createDispositionConfiguration` and
  `interactiveProfile` from the incumbent `runtime.ts`. It does not import the
  candidate factory. `runtime.ts:46` selects adaptive/conversational/progressive
  incumbent profiles, not `evidence-graph/v23`.
- The current `.mastra/output/mastra.mjs` ends with that same incumbent
  configuration and registers `dispositionWorkflow`. None of the generated
  top-level `.mjs` files contains `clinicalGraph`, `createClinicalGraph`, or
  `clinical-evidence-graph`. Its generated dependencies omit PGlite; preflight
  environment references describe the incumbent. These are inspected build
  outputs, not an inference from the directory name.
- `scripts/verify-mastra-artifact.mjs:43-54` verifies generated entry files,
  dependency pins, lockfiles and installed versions. Its returned scope is
  correctly **`dependency-artifact-only`**. It does not assert which clinical
  workflow is registered or exercise the candidate.
- `scripts/mastra-smoke.ts:1-9` uses `legacy-index.ts` and reports the historical
  `counsel-disposition-v0` workflow. It is not a v23 smoke test.
- `apps/evaluation/app/api/candidate/route.ts:7-12` calls
  `getClinicalGraphRuntime().assess(...)` through the request/stream handler.
  `graph-runtime.ts:38-41` constructs a real Mastra instance, registers
  `clinicalGraph`, and starts its workflow. The built Next app-paths manifest
  contains `/api/candidate/route`; the compiled route contains the same graph
  construction and `assess` wrapper.
- The candidate wrapper is substantive: `graph-runtime.ts:42-81` supplies
  cancellation, sequence/timing, per-call journaling, early-message suppression,
  trace identity, final run identity and append-only artifacts. Directly exposing
  the inner workflow is **not equivalent** to that governed execution path.
- `graph-runtime.ts:85-105` lazily loads runtime environment, verifies the v8
  index, and opens the PGlite store once **per process**. Its global promise is
  not a cross-process ownership lock. Starting an independent native candidate
  server beside Next against the same directory would create a second owner.
- README:123-125 already states that Studio's default is the incumbent. CI builds
  both surfaces (`.github/workflows/ci.yml:35-40`), but only the native dependency
  artifact has an explicit generated-artifact verification command.

There is a further portability boundary: the incumbent native entry constructs
its default runtime at import time, and `runtime.ts:38-48` searches parent
directories for a package named `counselcodex`. Copying `.mastra/output` alone
outside the workspace does not satisfy this startup contract. The dependency
check must not be described as proof of a standalone deployable candidate.

## Smallest safe next steps

1. **Make the two artifacts unmistakable.** Name the native build/smoke as
   incumbent/legacy in operator output; name the Next build and governed
   `/api/candidate` as the current candidate artifact. Keep compatibility aliases
   if commands are renamed. Put this distinction beside the run commands, not
   only at the bottom of the README. This closes misleading discovery without
   changing clinical behavior.
2. **Add a keyless candidate artifact identity check**, separate from the native
   dependency gate: require the compiled candidate route and page, their complete
   server artifact hash manifest, and the expected graph/config identity. Link
   this artifact identity to the governed endpoint's recorded `started`/run
   evidence in the controlled verification. Static markers prove inclusion, not
   clinical execution; retain both statements. Import/build checks must deny
   `.env` reads, network/provider calls and PGlite opens so they cannot accidentally
   become live runs. Existing synthetic graph/decoder tests and controlled actual
   GUI/cohort runs supply different, explicitly labeled evidence.
3. **Do not switch `src/mastra/index.ts` to an eager candidate getter.** That would
   read keys/open the index during build or Studio import, and could expose an
   unjournaled inner workflow or a second database owner. A convenience HTTP proxy
   to Next would avoid that owner but is only an adapter—not a standalone native
   candidate—and adds no demonstrated routing benefit.

If native standalone Mastra deployment becomes an explicit requirement, the
bounded design is one shared lazy candidate host with a governed public workflow
or API adapter, a private/guarded inner graph, and an explicit exclusive storage
lifecycle. Both Next and native entry points must call the same `assess` boundary;
they must not each instantiate an independent host on the same PGlite directory.
That is an entry-point refactor, not another clinical pipeline. It should wait
until the frozen cohort finishes and requires tests for:

- keyless import/build with zero environment-file reads, provider calls and
  database opens;
- concurrent initialization sharing one owner, rejected second-process ownership,
  and deterministic shutdown/reopen behavior;
- native invocation retaining the exact same graph/prompt/source hashes,
  per-call journal, ordered early/final events, cancellation and final admission;
- inability to invoke the underlying graph or individual role as a purported
  reviewed disposition without the governed wrapper;
- failed initialization leaving no stale singleton/lease or misleading success.

For this submission, the documented and actually verified Next-hosted Mastra
candidate is a valid intentional surface. Native CLI parity is not necessary to
claim Mastra orchestration, but native build success alone is not candidate
verification. No claim about Counsel's private deployment platform is implied.
