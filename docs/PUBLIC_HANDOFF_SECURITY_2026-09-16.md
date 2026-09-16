# Public repository handoff review — September 16, 2026

## Scope and result

Reviewed the public repository at `924156f8` and the documentation/CI maintenance
changes in this handoff. No confirmed software vulnerability was identified in
the inspected source boundaries. This was a focused source review with automated
publication and dependency checks, not an exhaustive manual audit of every
historical experiment, binary asset or dependency implementation.

The public [case index](https://bgoatnote.github.io/counselcodex/#index) and
[roadmap](https://bgoatnote.github.io/counselcodex/roadmap.html) display saved
research material. The separate live Fable demonstration remains local. No
model calls, prompt changes, new clinical scores or V25 changes were made.

## Checks

| Check | Result and limit |
|---|---|
| Independent source reviews | Inspected local API guards, provider transport, persistence, retrieval, static rendering and Pages publication. No confirmed finding. Local processes with the operator's authority remain trusted. |
| Indexed publication scan | All 16,623 files in the starting index inspected: no configured name/path findings or extraction errors. Final changed files are checked again before commit. |
| Visual coverage | The scanner reports 40 existing warnings, principally raster/OCR and visual-content limitations. No media was changed in this handoff; prior image provenance and review remain applicable. Automated text checks cannot establish absence of names inside images. |
| Git-history secret scan | Gitleaks inspected 32 commits and approximately 339 MB. One result was the deliberately synthetic credential canary in a mocked-provider trace-redaction test. A single commit/file/rule/line fingerprint is documented in `.gitleaksignore`; the repeated scan reported no remaining detections. |
| Dependencies | `npm audit` reported zero advisories across the installed dependency tree. This does not establish that dependencies have no vulnerabilities. |
| Focused regression checks | 39 tests passed: frozen request parity, credential/hidden-reasoning trace exclusion, no retries, local request policy and saved-viewer behavior. No provider calls. |
| Other local verification | JavaScript syntax checks and TypeScript checks passed. The 50-case viewer reproduces exactly from saved evidence. Submission hashes are verified before commit. |
| GitHub status at review | No open pull requests, Dependabot alerts or secret-scanning alerts. The preceding `main` CI and Pages runs passed. The handoff commit must also pass CI before Pages publication. |

The public-content checker compares configured hashed phrases; it is not a
general identity detector. The secret scan and source review have separate
scope and limitations. No security certification, clinical validation or
institutional endorsement follows from these results.

## Repository controls

- Enabled GitHub secret scanning and push protection.
- Enabled automatic Dependabot security-update pull requests; updates still
  require review and passing CI and are not automatically merged.
- Enabled automatic deletion of merged branches.
- Protected `main` with the existing GitHub Actions `test` check against an
  up-to-date base, conversation resolution, and disabled force-push/deletion.
  The owner's administrator override remains available for maintenance.
- Preserved read-only workflow-token defaults and disabled review approval by
  Actions. CI checkout now also disables persistent Git credentials.
- Preserved the Pages boundary: successful same-repository `main` CI, tested
  revision, four explicit static files and a separate deployment-permission job.

See [CI and dependency-review guidance](CI_AND_REVIEW.md),
[security boundaries](../SECURITY.md), [disclosures](../DISCLOSURES.md) and
[publication-check limitations](PUBLIC_CONTENT_CHECKS.md).

## Reviewer entry points

The README now presents the public case viewer, supplied historical roadmap
graphic and Google Slides-friendly PowerPoint first. It identifies all five
saved model cards, including both Astra settings, and explains that the live
demo link requires a server on the viewer's own computer. Study limitations and
the distinction between reference amendments and model improvements remain.

The current remote check result is available in
[GitHub Actions](https://github.com/bGOATnote/counselcodex/actions); review the
commit associated with a run rather than assuming a previous green run covers
later changes.
