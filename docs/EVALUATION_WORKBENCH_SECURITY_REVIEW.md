# Evaluation workbench security review

## Scope decision

The workbench is a local-first interface over three versioned synthetic files.
It records physician responses in browser-local storage and accepts only its
own JSON review export for backup/restore. It does not expose API routes, call
models, connect to a clinical system, or send review data over the network.

This is a narrower and safer boundary than the original multi-role adjudication
prototype. Removing server mutation endpoints and role switching while keeping
an attributable client-side audit record better matches the one-clinician
take-home.

## Controls

- source messages, the unattested proposal, and V0 predictions are joined by validated
  case ID at build time;
- invalid dispositions, duplicate IDs, incomplete joins, and directionally
  inconsistent under/over-triage findings fail the build;
- SHA-256 digests for each input artifact are displayed in the evaluation
  method and status output;
- imported review JSON is size-bounded, schema-validated, bound to the exact
  source, proposal, and V0 hashes and case inventory, and verified against its
  SHA-256 export digest;
- cross-field invariants reject claimed completion without a blind judgment,
  comparison, matching audit events, or a valid full-review attestation;
- exported JSON preserves blind originals, post-reveal revisions, timestamps,
  reviewer attestation, and input provenance;
- browser writes use versioned monotonic revisions, read-back verification, a
  rotating valid local backup, and an independent IndexedDB mirror;
- stale and same-revision competing writes are rejected in both storage paths;
  a cross-tab change pauses autosave and requires export/reload rather than
  silently selecting a last writer;
- quota, access, corruption, timeout, and read-back failures become visible
  degraded/error states instead of uncaught render failures;
- hydration selects the newest valid revision across stores, preserves damaged
  raw payloads for download, and migrates the legacy single-copy format;
- page-hide and visibility transitions synchronously flush the latest in-memory
  workspace, and a failed final flush triggers the browser unload warning;
- `localhost` is the canonical storage origin; loopback IP access redirects
  unless the explicit recovery query is present;
- exported CSV excludes the message text and neutralizes spreadsheet formula
  prefixes in physician-authored fields;
- the UI is statically generated and has no application API routes;
- development and production servers bind to `127.0.0.1`;
- a Content Security Policy blocks external scripts, frames, objects, camera,
  microphone, and geolocation;
- the app sends `no-referrer`, `nosniff`, `DENY` framing, and restrictive
  permissions headers;
- robots indexing and following are disabled; and
- repository policy permits synthetic data only.

## Residual risk

The source message, proposal, V0 rationale, and physician response are
intentionally available to the local browser. Browser storage and downloaded
exports are not encrypted. The application is therefore not a PHI boundary.
Anyone who can access the browser profile, downloads, or local process may read
the synthetic review. Do not place real patient data in these files or expose
this server on a network.

Redundant browser stores and monotonic write checks protect against a single
corrupt or failed write and expose cross-tab conflicts. They do not protect
against browser-profile deletion, private-mode teardown, device loss, or
malicious local access. The portable JSON export remains the recovery boundary across
origins and devices. The explicit loopback recovery URL intentionally exposes
the older origin only long enough to export it.

The export digest detects accidental or unsophisticated edits but is not an
identity signature: a person who controls the file can recompute it. Reviewer
identity remains self-asserted in this take-home. A production evidence service
needs authenticated, server-derived identity and a server-controlled audit log.

Before a production clinician-evaluation service, add authenticated
server-derived identity, least-privilege authorization, tenant isolation,
encrypted storage, retention/deletion policy, access auditing, secure import,
signed dataset releases, deployment controls, accessibility testing, and a
completed privacy/security threat model.

## Verification

`npm run review:test` verifies joins, artifact hashes, blank-by-default review
state, required clinical fields, disposition/timing coherence, denominator
rules, integrity-checked import/export, and spreadsheet formula neutralization.
The durability suite adds legacy migration, newest-revision selection, backup
recovery, quota failure, read-back mismatch, and explicit reset across both
local copies.
`npm run review:build` type-checks and produces a static application with only
`/` and `/_not-found`; no API route is emitted. Browser QA covers blind review,
an actual edit reaching the two-store verified state, full-page reload with the
draft restored, recovery controls, responsive layout, and absence of console
errors.

The workbench is suitable for synthetic local demonstration. It is not suitable
for PHI, multi-user review, clinical operations, or public deployment.
