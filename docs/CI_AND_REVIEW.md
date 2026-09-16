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

The offline submission check verifies every declared artifact hash, the exact
case quotations, slide count and timing, source links, canonical demo address,
and agreement between deck source and the published speaker notes. This catches
stale exports and handoff metadata before publication. It does not establish
clinical correctness or guarantee Google Slides conversion fidelity.

The false-negative experiment check independently verifies saved request and
response hashes, message-only payloads and reference provenance, then reproduces
both separate scorecards. It makes no provider calls and does not change the
GUI's selected protocol. Invalid or incomplete outputs cannot silently disappear
from the relevant denominators.

The workflow-aware research replay verifies the completed 1,568-call generation
freeze before reading the separate physician and authored targets. Existing
derived scorecards must reproduce exactly. It uses the archived runtime identity
and never substitutes current dependencies for the recorded generation runtime.

The offline case-viewer check repeats that verified analysis and compares its allowlisted, deterministic HTML artifact byte for byte. The separate retrieval-candidate check uses the existing frozen vectors and source texts only; it reconstructs the original selection and verifies new candidate rankings without model calls or clinical labels. Neither check is a live RAG experiment or evidence of clinical improvement.

The publication check reads the exact checked-out Git index, including compressed
source packages and Office/PDF text. CI installs Poppler explicitly. Configured
phrase matches, forbidden local-state paths or unsupported extraction fail the
job. Raster and other visual limitations remain explicit; the check is not OCR,
a secret scanner, anonymization or proof that Git history is clean. See the
[content-check scope](PUBLIC_CONTENT_CHECKS.md) and [source-archive review](PUBLIC_ARCHIVE_REVIEW_2026-09-16.md).

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
