# Historical source archives

These four separately named source derivatives replace the original archive files in the current repository tree. Each retained source, configuration and fixture file is byte-identical to its corresponding original member. AppleDouble metadata, `.DS_Store` files and the `src/mastra/public/.mastra` runtime-state subtree are excluded. No original archive was overwritten or recomputed.

| Snapshot | Historical original path | Current derivative and provenance |
| --- | --- | --- |
| `clinical-lift-effort-study-2026-09-14` | `outputs/clinical-lift-effort-study-2026-09-14/frozen-implementation.tar.gz` | [Source archive](clinical-lift-effort-study-2026-09-14/frozen-implementation.public-source.tar.gz) · [Manifest](clinical-lift-effort-study-2026-09-14/manifest.json) |
| `onset-judge-v23-plan-2026-09-14` | `outputs/onset-judge-v23-plan-2026-09-14/source-code-snapshot.tar.gz` | [Source archive](onset-judge-v23-plan-2026-09-14/source-code-snapshot.public-source.tar.gz) · [Manifest](onset-judge-v23-plan-2026-09-14/manifest.json) |
| `safety-mobility-v23-plan-2026-09-14` | `outputs/safety-mobility-v23-plan-2026-09-14/source-snapshot.tar.gz` | [Source archive](safety-mobility-v23-plan-2026-09-14/source-snapshot.public-source.tar.gz) · [Manifest](safety-mobility-v23-plan-2026-09-14/manifest.json) |
| `safety-reference-v23-plan-2026-09-14` | `outputs/safety-reference-v23-plan-2026-09-14/source-code-snapshot.tar.gz` | [Source archive](safety-reference-v23-plan-2026-09-14/source-code-snapshot.public-source.tar.gz) · [Manifest](safety-reference-v23-plan-2026-09-14/manifest.json) |

## Integrity and replay

Each manifest records the original and derivative archive hashes, every retained member's before/after hash, and omitted member categories, hashes and sizes. The original local archive bytes and separate private retained copies remain unchanged. Original paths are explicitly ignored to prevent accidental re-addition.

Derivatives use deterministic packaging: sorted USTAR members, fixed ownership and timestamps, and a gzip header without a source filename. All 487 retained files were verified against original member bytes, and repeated builds produced identical archive bytes.

The derivatives preserve source inspection and source-based reconstruction; they do **not** preserve local application/observability state. Exact-original checksum checks and state-dependent historical replay cannot be completed using a derivative in place of the original. Existing frozen snapshot documents still describe their original bytes and hashes. Read those documents with this mapping and the [archive review](../../docs/PUBLIC_ARCHIVE_REVIEW_2026-09-16.md); no frozen source references, results or scorecards were rewritten.

## Review scope and historical availability

The review covers these four archives and their derivatives. Dedicated secret-pattern and configured phrase scans found no matches in the retained files. This is a bounded observation, not a guarantee of no credentials or personal data. The private historical database review included read-only SQLite and DuckDB decoding on disposable archived copies. All visible DuckDB rows were exported under restricted settings; deleted or unreachable records and opaque binary content remain outside that coverage. Original opaque AppleDouble metadata was not represented as fully decoded.

Current-tree omission does not remove originals from earlier public Git commits, existing clones or downloaded copies. This packaging change does not rewrite Git history or claim historical erasure. See the [review](../../docs/PUBLIC_ARCHIVE_REVIEW_2026-09-16.md) for coverage, limitations and original archive identities.
