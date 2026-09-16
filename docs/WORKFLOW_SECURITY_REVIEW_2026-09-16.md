# Workflow research security review

Completed September 16, 2026. This is a scoped engineering review of an immutable source change. It is not a certification, a clinical evaluation, or evidence that an externally exposed deployment would be appropriate.

## Reviewed change

- Base: `4296ed62d6f09ae8332a31bf0cef2e9efa68b6c0`
- Head: `68a2f618bfd5a631db59dac411f5ff4325f1922a`
- Tool: Codex Security 0.1.24, standard diff review
- Scan identity: `bae130f9-433a-48f3-82e6-f52027522507`
- Scope: all 32 changed files, including the 18 source/configuration inventory entries and 14 additional tests and documents
- Result: no reportable vulnerability found in this scope

The review inspected source at the pinned commit. The ongoing study's generation artifacts were deliberately excluded. A separate review covered architecture and the nine research execution modules and entry points. The final report retains the resulting threat model, scope and exclusions.

## Boundaries inspected

| Boundary | Evidence and limit |
|---|---|
| Credentials and network destinations | Explicit provider operations load credentials. Destinations are fixed provider endpoints or loopback Ollama, and redirects are rejected. Clinical message content cannot select another destination. |
| Message and evidence context | Exact message reconstruction, strict schemas and frozen source packets separate data from configuration. The research workflow exposes no prescribing, messaging, ordering or other clinical-action tool. Instructions and JSON delimiters alone do not establish prompt-injection immunity. |
| Dispatch and accounting | Locked reservations precede calls. Existing starts prevent automatic replay, and unknown accounting stops further dispatch. The controls apply to cooperating local processes and the declared ledger. |
| Generation and scoring | Source/input hashes, request reconstruction and raw/parsed parity precede reference access. Local hashes detect inconsistent changes; they do not authenticate artifacts against an actor able to rewrite the entire local workspace. |
| Publication inspection | The checker reads exact Git index objects, uses bounded extraction and reports unsupported formats. Image review, history review and dedicated secret detection remain separate activities. |
| Presentation export | The changed font-reference path is an explicit operator input to a local builder. No publishing action or lower-privilege path caller was added. |

## Verification and remaining limits

The 64 focused research regression tests, TypeScript checks and lint passed. A Gitleaks scan of the pinned source commit reported no detected secrets. These are bounded checks, not guarantees of absence.

The review did not audit unchanged dependency implementations, external presentation helpers, provider services or operating-system internals. Filesystem containment is lexical and assumes a trusted local operator. Nano execution coordination covers processes using the same ledger, not every application on the machine. Provider response byte ceilings and larger-plan admission limits remain possible hardening work before any broader service exposure.

The publication scanner's initial archive/Office extraction gaps failed closed. Expanded extraction subsequently found local database/state members in two historical source archives, as well as opaque AppleDouble metadata in four archives. Their separate [publication review](PUBLIC_ARCHIVE_REVIEW_2026-09-16.md) is not covered by this pinned source review. Source-only derivatives now omit the runtime state and metadata; original bytes remain privately retained and their historical Git availability is disclosed. A later read-only review decoded visible SQLite and DuckDB rows from disposable copies, with no detected configured phrase or secret patterns; that does not establish absence in deleted or opaque content. A subsequent independent code review found three publication-coverage bypasses outside the pinned scan: JSON duplicate members could hide earlier decoded values; a ZIP directory entry could carry ignored bytes; and a PAX override could hide original TAR owner/path metadata. The fixes retain every JSON value, reject nonempty directory streams, and inspect original physical TAR metadata before effective members. Standalone structured-file processing also receives the existing wall-clock deadline. All 31 guard tests pass, including regression fixtures that exposed the original behavior. These are content-coverage and availability findings, not evidence that a credential or employee name was actually disclosed. Later release artifacts receive a separate exact-index scan and visual review. Visual text and binary coverage limits remain explicit.

No conclusion here validates a medical recommendation, removes false negatives, establishes an acceptable clinical error rate, or authorizes changing the selected demonstration. Clinical reference quality and actual care completion require the separate [clinical and workflow review](WORKFLOW_REFERENCE_REVIEW_PROTOCOL_2026-09-16.md).

## Offline inspection tools

The later retrieval candidate audit was separately reviewed: its fixed input allowlist, raw-vector/hash parity, reconstruction of original source selection, and exclusive/read-only output handling passed 15 focused tests. It reads no clinical targets and makes no provider calls. The offline case viewer admits data only after the existing completed-generation verifier and exact saved-analysis comparison; it embeds an allowlisted projection and uses escaped JSON, text-only DOM insertion and a hash-based Content Security Policy. Seven focused tests and 112 browser comparisons passed, with zero external requests. A measured mobile overflow was corrected before those final browser checks. These later reviews are separate from the immutable 68a2 source-scan conclusion.
