# Historical archive publication review

Reviewed September 16, 2026. **Status: current-tree packaging completed.** Four separately named, verified source derivatives and provenance manifests are included under [`publication/historical-sources/`](../publication/historical-sources/README.md). Original archive files are omitted from the publication index and explicitly ignored, while unchanged local bytes and separate private retained copies are preserved. This change does not rewrite Git history or claim that prior public copies have been removed.

## Scope and finding

A bounded inspection of four historical compressed source snapshots found **537 AppleDouble metadata sidecars**. Two snapshots also included **10 local application/observability state files** and their runtime directories. Those state files are not necessary to distribute the source implementation and should be omitted from a public source package.

Original archive bytes and their recorded hashes remain unchanged. Exact copies have been retained privately. The derivatives preserve every retained source/configuration/fixture file byte for byte; only packaging metadata and explicitly omitted categories differ. Existing frozen experiment manifests, reference labels, model outputs and scorecards were not edited.

| Historical snapshot | Retained files | Retained directories | Omitted sidecar files | Omitted runtime-state files |
| --- | ---: | ---: | ---: | ---: |
| `clinical-lift-effort-study-2026-09-14` | 117 | 19 | 142 | 5 |
| `onset-judge-v23-plan-2026-09-14` | 123 | 0 | 123 | 0 |
| `safety-mobility-v23-plan-2026-09-14` | 122 | 19 | 147 | 5 |
| `safety-reference-v23-plan-2026-09-14` | 125 | 0 | 125 | 0 |

Totals: **487 retained files**, **537 omitted sidecars** (87,703 bytes), and **10 omitted runtime-state files** (1,521,028 bytes). Two runtime directories are also omitted. The exclusion rule covers all AppleDouble paths and `.DS_Store` files; no `.DS_Store` member was present in these four archives.

The runtime-state category is the complete `src/mastra/public/.mastra` subtree, including SQLite/DuckDB databases, WAL/SHM files and associated state. Sidecars are counted in the sidecar category even when associated with an omitted state file, so category counts do not overlap.

## Bounded private database review

The ten state files were copied from the verified archives to private storage. Eight were nonempty. SQLite was queried only through disposable private copies using read-only access, query-only mode, disabled trusted schema and disabled extension loading. All 88 tables across the two databases were inspected; six stored workflow snapshots were exported, including native decoding of six SQLite JSONB values. Four snapshots contained input-like strings that exactly matched a repository test fixture. The remaining two snapshots' provenance was not established by that comparison.

The initial DuckDB inspection used static strings. A subsequent review used the already-installed `@duckdb/node-api` 1.5.2-r.2 on separate disposable copies of both archived database/WAL pairs. Read-only access succeeded with external access, automatic extension installation/loading and unsigned extensions disabled, one thread, a 256 MB memory limit and no temporary disk spill. All ten visible base tables across the two copies were inspected and all 242 visible rows exported without truncation; no views were skipped. Nested JSON strings were decoded for text inspection. No read-write recovery was needed, and both preserved and disposable-copy hashes remained unchanged. No live database was opened or modified. Deleted or unreachable records and other opaque binary content are not covered by this row-level review.

Gitleaks 8.30.1 with full finding redaction detected no secret patterns in the copied raw files or private decoded/static exports, including repeat scans after SQLite JSONB and DuckDB row decoding. Configured employee-phrase hashes produced no matches in those exports. A narrow identifier-pattern screen of the SQLite JSONB exports produced no email/phone/labeled-patient-ID signals. These are scoped negative observations, **not proof of absence of credentials, personal data or real PHI**. Exact-string comparison found one DuckDB-exported substantial string in a repository test fixture; it did not establish the provenance of the other strings or all rows. Private rows, identifiers and content are not included in this report.

AppleDouble parsing validated the outer/attribute structures and scanned supported textual metadata. Opaque binary attributes remain explicitly unresolved in the original-archive review. No metadata exception or blanket approval of `._` files was applied.

## Derivative verification

Each derivative was generated twice with identical output bytes. Members are sorted; owner/group names are empty; numeric owners and timestamps are fixed; no xattrs or AppleDouble/PAX sidecars are copied. The gzip header has no private original filename. Retained executable source files keep an executable mode; other files use mode `0644`.

Every retained file was read back from the derivative and compared with its original member bytes. Separate manifests record original and derivative archive hashes, original/derivative member hashes, and each omitted member's category and size. Each derivative is a new publication artifact; it is not represented as the original frozen archive.

The four derivatives were inspected by the bounded content guard: 487 files scanned, zero configured phrase/path findings, zero extraction errors and zero visual-review warnings for those derivatives. Gitleaks 8.30.1 separately scanned all 487 reconstructed retained files and detected zero patterns. This does not extend coverage to other repository files, Git history, presentation images or future changes, and it is not a security certification.

## Completed current-tree packaging

1. Preserved the original archives at their current local paths and in separate private retention; verified both copies against the original hashes.
2. Added separately named derivatives and sanitized provenance manifests under [`publication/historical-sources/`](../publication/historical-sources/README.md). Public manifests contain no private storage paths or decoded database rows.
3. Removed only the original archives' Git index entries and added exact `.gitignore` exclusions. Original worktree bytes were not deleted, overwritten or relabeled with a new checksum.
4. Added a publication index explaining the original-versus-derivative distinction and the limitation on exact original-state replay. Existing frozen documents and checksums remain unchanged.
5. Rechecked the publication index with the bounded content guard and rescanned the retained derivative files with the dedicated secret scanner. Coverage and any warnings remain explicit; these checks are not a security certification.

The original bytes may remain accessible through earlier public commits or downloaded copies even after omission from the current tree. This review did not inspect remote availability or remove Git history. Current-tree removal is not historical erasure. Any public-history action is separate from this packaging change.

## Existing historical references

A bounded reference search found the following explicit references. They are historical evidence and were not changed:

- `outputs/safety-mobility-v23-plan-2026-09-14/source-snapshot.json` records the original archive filename/hash and original extraction-based replay instructions.
- `outputs/onset-judge-v23-plan-2026-09-14/SOURCE_SNAPSHOT.md` identifies the exact original implementation archive and checksum.
- `outputs/safety-reference-v23-plan-2026-09-14/README.md` identifies the original archive and checksum.

No direct original-archive reference was found in the current submission-package manifest or runtime scripts by that filename/hash search. That bounded search does not establish that no external bookmark or dynamically constructed reference exists. The new publication index explains the original-versus-derivative distinction without editing frozen records. Historical assertions about source-only packaging should be read with this later archive-content review.

## Archive identities

### clinical-lift-effort-study-2026-09-14

- Original: `outputs/clinical-lift-effort-study-2026-09-14/frozen-implementation.tar.gz`
- Original SHA-256: `81c59c4da8b13ba9b24178353a8d54cdf70a5f486953d94779131f1dc4140aaf`
- Public derivative: `publication/historical-sources/clinical-lift-effort-study-2026-09-14/frozen-implementation.public-source.tar.gz`
- Derivative SHA-256: `0c061a7022d90a6ee5bfad02a1332308e09480d143762fac871b7054bde610a3`

### onset-judge-v23-plan-2026-09-14

- Original: `outputs/onset-judge-v23-plan-2026-09-14/source-code-snapshot.tar.gz`
- Original SHA-256: `2b46f3b14680ed2fb2d298d224bb6a78b22f462e7483bc96a6067b58d4c351af`
- Public derivative: `publication/historical-sources/onset-judge-v23-plan-2026-09-14/source-code-snapshot.public-source.tar.gz`
- Derivative SHA-256: `a822a332cd015413e7e1969f1eaaab11dc486aed25b9874ec1fe0651b94b2564`

### safety-mobility-v23-plan-2026-09-14

- Original: `outputs/safety-mobility-v23-plan-2026-09-14/source-snapshot.tar.gz`
- Original SHA-256: `5e9bf42f8e604cca62946cc8e45cc7fc7ae4f7f4c21dbd8f3ecdf33fc8ca7833`
- Public derivative: `publication/historical-sources/safety-mobility-v23-plan-2026-09-14/source-snapshot.public-source.tar.gz`
- Derivative SHA-256: `e134f8afe5bda9469d6b3d6c23fd6e3d5f05e347dd36a046c88ee8d1e4070b6b`

### safety-reference-v23-plan-2026-09-14

- Original: `outputs/safety-reference-v23-plan-2026-09-14/source-code-snapshot.tar.gz`
- Original SHA-256: `a95a00ed4a7579107dc55383cab6c395635d33cc75a851e86ae1ccc60530cc17`
- Public derivative: `publication/historical-sources/safety-reference-v23-plan-2026-09-14/source-code-snapshot.public-source.tar.gz`
- Derivative SHA-256: `9e4663afae0430b98fc5c7152f568d3fa79ebb00d155da1421992dd806865142`
