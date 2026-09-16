# Continuous integration and dependency review

The [CI workflow](../.github/workflows/ci.yml) runs on changes to `main`, pull
requests, and manual dispatch. It runs once for a pull-request branch rather
than duplicating push and pull-request jobs. A newer run cancels an obsolete
run for the same branch or pull request. Jobs have read-only repository
permissions and a 30-minute timeout; action dependencies are pinned by commit.

## Required evidence

The workflow installs the checked-in lockfile, audits installed dependencies
for high/critical advisories, and runs syntax checks, TypeScript checks, unit
and integration tests, offline evaluation checks, the Next application build,
and the native Mastra build. It independently installs the generated Mastra
runtime lock and verifies that artifact's versions. No live provider credential
is configured or needed for these checks. A green run is software verification,
not clinical validation or a new model evaluation.

The current demo's protocol tests compare the request bytes against all 50
frozen requests. Native HTTP tests exercise loopback host/origin enforcement
before handler dispatch. These checks matter when reviewing framework updates,
even when an update is described as a patch or minor release.

## Dependency pull requests

Review the declared dependency and lockfile diff together. Update the branch
against current `main` before interpreting an old failure. Merge compatible
framework changes in dependency order and rerun CI on the actual proposed
combination. Do not weaken a failing test or replace a frozen model result to
make a dependency update pass. New advisories require triage; an audit is not a
complete security review.

The September 16 portability fix replaced a macOS-specific temporary lock path
with the operating system's temporary directory. The initial DuckDB update also
required a newer Mastra core interface; it must not be merged ahead of that
compatible core update. Exact pull-request resolutions and verification are
recorded in [the handoff report](HANDOFF_REVIEW_2026-09-16.md).

## Deployment boundary

There is no automatic clinical or public service deployment. CI produces and
checks local research artifacts; it does not publish a live patient-input API,
run paid benchmarks or promote V25. The supported demonstration is the
[loopback-only GUI](GUI_ACCESS.md). A future hosted deployment needs a separate
review of authentication, data handling, operating ownership and clinical use.
