# Post-cohort verification

15 September 2026 UTC. This is a new implementation identity, separate from the
completed frozen v23 fifty-case comparison. No historical outcome was changed.

## Code and build checks

The sequential verification command completed successfully (terminal session
4198, native build finished 01:13:13 UTC):

```
npm run lint && npm run typecheck && npm test && npm run review:test && npm run build
```

The default build now builds and verifies both the Next-hosted Mastra candidate
and the separate native incumbent Mastra artifact. A manifest/dependency check
does not establish runtime execution or clinical accuracy.

- Candidate Build ID: `6FB29K6DhaScKy4MveF9S`.
- Candidate entry-manifest identity: `7b60d3d565a52f85aea42204d5cc5df4f7fb5d05b4bc2ec3d0ad991554e8434f`.
- Native artifact: 7 direct dependencies, 205 locked packages.
- Native package SHA-256: `dab5b0c76a5e97234fb15b94400d143e8855d18f90a55e030fe38a51fa9f21ef`.
- Native lock SHA-256: `24daf664c58a34385c8cafaae9a9ac4b1c4dbb56720179a84aa7150f58c596f8`.
- Current candidate prompt hash: `1a86dc27cadf7dad4faa66c89b295968a6c4d822881c53570d60791eb7b5a867`.

The C10 timing check retains clinician ownership and explicit same-day timing,
without requiring a duplicated literal service-hours phrase. The availability
policy and independent handoff/guarantee checks are unchanged. C36's exact vital
field attribution removes a repair-permission dead end, but does not resolve
whether its clinical wording check is too strict. Neither fix silently changes
the five-route policy or retrospectively completes a withheld cohort response.

## Browser protocol

The phase4 plan was frozen at `2026-09-15T01:13:57.704Z`, fingerprint
`067372fadca3b6a5ec555a658363badedfed97397c97a2c9695d3fd7bd18387e`,
with 221 source/compiled-file hashes. Maximum five consecutive submissions:
C10, C36, C02, C50 and a separately attributed C50 update. All starts, errors,
outcomes and timing must be captured; no substitutions or cached successes.

The first planning command failed before any provider or file creation because
of an incorrect relative import. That planning path was corrected before the
manifest was created. This was not a clinical-model attempt.

The phase reserves $18 within the existing $100 authorization; the separate
safety-reference experiment reserves $0.90. Completed earlier work accounts for
$81.008177775, leaving $0.091822225 unallocated under the worst-case reservations.
Actual browser results and reconciled spending are reported separately after
the run window closes. These checks are not new physician adjudication.
