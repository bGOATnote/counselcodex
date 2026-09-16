# Publication review — 16 September 2026

This record covers the initial public release. The [later workflow publication review](WORKFLOW_PUBLICATION_REVIEW_2026-09-16.md), source review and archive inspection have separate scopes: [workflow security review](WORKFLOW_SECURITY_REVIEW_2026-09-16.md), [source-archive review](PUBLIC_ARCHIVE_REVIEW_2026-09-16.md). The observations below are retained as dated evidence, not a scan of every subsequent revision.

## Scope and limits

The release contains the current synthetic disposition demonstration, frozen
experiment evidence, source code, and reviewed presentation artifacts. It does
not deploy a clinical service. The current model prompt, provider requests,
physician references and frozen results were preserved.

The source security review fully examined 59 repository files at the browser,
server, provider, persistence, parser and CI boundaries. Additional architecture
mapping and searches are not counted as full-file review. Coverage is partial;
this is not an exhaustive audit or a clinical-safety certification. Canonical
scan ID: `05555f2b-a595-4918-be69-bedb9db9a333`, assessed from source revision
`a77d6084364f68627134ed125b2ec409d071f599` before remediation.

## Source findings and remediation

| Finding | Pre-fix severity | Change | Validation |
| --- | --- | --- | --- |
| Generated native Mastra server could bind beyond loopback | Medium | Native entry explicitly binds `127.0.0.1:4111` | Built artifact checked with an isolated ephemeral-port override; actual socket bound to IPv4 loopback |
| Native agent execution accepted foreign browser origins | Low | Matching Host/Origin policy, Fetch Metadata checks, restricted CORS and an explicit header for originless CLI mutations | Seven native HTTP tests; rejected requests never reached the generation stub; built artifact returned 403 for a foreign origin |

The native server policy is separate from the existing Next GUI protections.
It changes server access, not clinical generation. No model calls were made by
the security tests. The existing service on port 4111 belonged to a different
repository and was not interrupted. The listener test changed only the test
instance's port; the generated configuration retains port 4111.

These controls do not authenticate other software running as the same local
user. Native Studio's intentional raw-agent operations do not inherit the
stripped workflow's accounting. An authenticated deployment design remains
necessary before exposing either development server beyond the host.

## Publication checks

- The initial content review covered 7,883 release files, including 7,842 text
  files, one PDF and 15 Office documents. Office XML, document properties and
  PDF text/metadata were included. A separate history scan examined 8,408 blobs
  and 22 Office versions.
- No identified employee names were found in the reviewed current files.
  Historical references were found in 33 objects, including objects reachable
  through GitHub pull-request refs. Updating `main` alone cannot remove those
  read-only refs.
- Gitleaks scanned the current export and all fetched Git refs with redacted
  reports. Its sole match in each scan was an intentional test canary in
  `tests/stripped-gui-workflow.test.mjs`; it was inspected and is not a credential.
  Additional key/private-key/JWT patterns found no credential-shaped matches.
- No tracked `.env`, runtime database, local state directory or private-key
  file was identified. Ignored credentials and runtime stores are excluded from
  the release export.
- `npm audit` reported zero known advisories for the pinned dependency tree,
  including development dependencies, on the review date. This does not
  establish the absence of undisclosed vulnerabilities.
- User-supplied images are discussion material, outside the scored inputs.
  Asset provenance records their origin and metadata handling. The supplied
  Ottawa illustration has a visible qualification of its simplified
  weight-bearing criterion. The Counsel logo identifies the presentation
  audience; the prototype remains an independent submission.

Automated name matching is limited to the identified names and aliases. The
three clinical discussion images and supplied architecture image were visually
reviewed; a general OCR audit of every historical raster artifact was not run.

## Release history

The publication procedure preserves the original repository and pull requests
in a private archive and publishes the reviewed tree with fresh history at the
intended `bGOATnote/counselcodex` address. This avoids exposing historical
employee references through immutable GitHub pull-request refs. Frozen output
files remain byte-identical; their original commit identifiers remain
provenance, even where those commits are available only in the private archive.

## Verification

Passed: `npm run lint`, `npm run typecheck`, `npm test`, `npm run review:test`,
and `npm run build`. The GUI suite passed 178 tests. Builds verified both the
Next artifact and the generated Mastra dependency lock/install. The isolated
built-server check observed loopback binding and rejected a foreign-origin
request without provider execution.

Presentation validation, exact case-message checks and final artifact hashes
are recorded in the [submission manifest](../output/submission-2026-09-15/manifest.json).

The initial Ubuntu CI run exposed a macOS-specific `/private/tmp` lock path in
the local offline-study runner. The runner now uses `node:os` `tmpdir()` while
preserving exclusive directory creation, owner recording and cleanup. Its five
focused tests pass with mocked generation. Current hosted verification is
available in the [GitHub CI workflow](https://github.com/bGOATnote/counselcodex/actions/workflows/ci.yml).

Scanner telemetry reported 12,419,023 total input/output tokens across four
tasks, including 11,846,912 cached input tokens. This is the tool-reported
aggregate, not a measure of newly generated text or a financial estimate.
