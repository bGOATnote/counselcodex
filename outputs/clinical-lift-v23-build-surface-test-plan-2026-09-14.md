# Unapplied build-surface proposal: verification plan

The accompanying `.patch` is a proposal only. `git apply --check` passed against
the current tree; no package, runtime, CI or documentation file was changed.
No build, model or database was started during the frozen cohort.

## Changes proposed

- Default `build` builds/verifies the actual Next-hosted candidate and the separate
  incumbent native Mastra artifact, once each.
- Explicit `build:candidate`, `build:candidate:verify`, `build:mastra`, and
  `build:mastra:verify` expose the deployment distinction. `review:build` remains a
  compatibility alias. `build:verify` checks both existing artifacts.
- Remove duplicate candidate builds from `validate` and CI. The post-`npm ci
  --prefix .mastra/output` CI step explicitly rechecks only the native artifact.
- Candidate verification reads the BUILD_ID, supported Next manifest versions,
  exact candidate API/page mappings, required generated files and traced
  Mastra/PGlite dependencies. It hashes those entry/manifests only, imports no
  compiled code, and reports runtime/clinical verification as false. It neither
  opens the index nor reads `.env` or provider keys.
- README/runbook distinguish both surfaces. No graph topology, admission,
  database ownership, request/stream handler or historical result changes.

## After cohort completion and explicit approval

1. Recheck and apply the proposal, adapting context only if root documentation
   changed. Never overwrite a historical cohort manifest or generated run.
2. Run `node --test tests/candidate-artifact.test.mjs`: twelve zero-spend tests cover
   real entry mappings, invalid manifest/trace versions, missing files, forbidden
   path escape, absent traced Mastra, content identity, no module execution and
   script recursion/duplicate-build prevention, byte hashing, symlink escapes and
   malformed/empty identity inputs. Existing `test:unit` automatically
   includes this `.mjs` file; no new dependency is needed.
3. Run the candidate verifier against the current built artifact (read-only).
   Its inclusion result is not evidence that frozen source changes were built:
   only a fresh candidate build and bound endpoint run can demonstrate that.
4. Run `npm run lint`, `npm run typecheck`, full tests and `review:test`.
5. Run `npm run build`. Confirm one Next build and one native Mastra build, both
   labeled distinctly. Native generated dependency installation still requires
   registry access; do not bypass its gate after an offline failure.
6. Run `npm run build:verify`; independently reinstall the generated native lock
   as CI does, then run `build:mastra:verify`. Capture all failures.
7. Preserve the existing governed `/api/candidate` and GUI verification. Bind any
   new live result to the fresh **complete** production artifact manifest and
   graph/prompt/source hashes. The small entry-manifest check cannot replace that
   full identity or prove routing, cancellation, early-message delivery or clinical
   correctness. No extra paid run is authorized by this proposal.

The native `mastra:smoke` remains the explicitly documented historical V0 check.
This proposal deliberately does not expose a second candidate execution surface
or claim the native incumbent bundle is a standalone candidate deployment.

## Isolated validation completed before application

The proposed script, tests and script-map fixtures were materialized only under
`/private/tmp/counsel-build-surface-proposal.mwRPvB`. All 12 tests passed on both
Node 24.3.0 and Node 22.17.1 (approximately 83 ms each). No module was imported
from the live candidate, no build/server/database was started, and no provider
was called. Invalid UTF-8 byte sequences that decode to the same replacement
character now produce distinct hashes: identity is computed from raw bytes,
not decode/reencode text. Both individual-entry and whole-artifact symlink escapes
reject, as do lexical escapes and environment-file names. The proposal remains
unapplied; these fixture tests do not verify the running candidate or v23 cohort.
