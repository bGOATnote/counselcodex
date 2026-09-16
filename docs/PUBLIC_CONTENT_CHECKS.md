# Offline publication content checks

`scripts/check-public-content.py` is a bounded publication hygiene check for **the exact Git index bytes**. It inventories all indexed files, including newly staged additions, and checks prohibited local-file paths and configured phrases. A successful run is not permission to publish, security certification, proof of anonymization, or clinical validation.

This check complements a dedicated secret scanner such as Gitleaks. It does not attempt to detect API keys or replace that scanner.

## Run against the release index

Stage only the intended files by name. Finish and freeze any active experiment before scanning its artifacts; never edit frozen results to make a publication check pass.

```bash
python3 scripts/check-public-content.py \
  --repo . --index \
  --name-hashes scripts/public-content-name-hashes.json \
  --report /private/tmp/public-content-report.json
node --test tests/public-content.test.mjs
```

The repository integration configuration is `scripts/public-content-name-hashes.json`. The script remains generic and accepts any explicitly supplied configuration path.

The hash configuration may be kept external or committed after review of its hashes-only contents. It must not contain employee names, profile aliases, identifying labels, or reviewer notes. Use an explicit path; the checker does not discover private files.

`--index` is also the default. The checker reads blob IDs from `git ls-files --stage` and obtains bytes through `git cat-file`. It does not read the worktree versions of those files. Consequently:

- Newly staged additions are checked, even if they were previously untracked.
- Unstaged modifications do not replace the bytes being checked.
- Staged deletions are absent from the publication inventory.
- Untracked files and Git history are outside this check. Run separate export/history checks before release.
- An index change during inspection causes failure. The report binds the inventory and each checked blob with hashes.
- Symlinks, submodules and unmerged index entries fail because their publication content is not established by this checker.

The report includes inventory paths, blob/content hashes, extraction coverage, safe error codes and counts. It never includes matching source excerpts, matching phrase hashes, extractor stderr, or the plaintext configuration. A path containing a configured phrase is replaced with `[redacted-sensitive-path]` and a path hash. Reports can still contain ordinary paths; review them before publication.

## Hash configuration

```json
{
  "schema": "public-content-name-hashes/v1",
  "normalization": "nfkd-casefold-markless-alnum-v1",
  "hashes": [
    { "tokens": 2, "sha256": "<64 lowercase hexadecimal characters>" }
  ]
}
```

The placeholder above is illustrative and intentionally fails validation. At least one valid entry is required. Each entry has only `tokens` (1–12) and `sha256`; do not add names or labels.

Normalization is deterministic:

1. Decode HTML character entities.
2. Apply Unicode NFKD normalization and case folding.
3. Remove Unicode combining marks (categories beginning with `M`) and format controls (`Cf`).
4. Split into runs of Unicode alphanumeric characters; all other characters separate tokens.
5. Join each candidate token sequence with one ASCII space and hash its UTF-8 bytes with SHA-256.

The script exports `normalize_tokens(text)` and `phrase_sha256(text)` for a private configuration builder. Use those functions so configuration and matching cannot drift. Plaintext inputs to that builder must remain private and must not appear in shell history, repository fixtures or reports. Tests use only a fictional fixture phrase.

Dictionary matching has limits. It cannot detect an unlisted alias, transliteration, misspelling, image text, or arbitrary identifying context. Hashes are not an anonymization guarantee: a small dictionary can be guessed and hashed. The configuration conceals plaintext in the source tree but does not establish confidentiality of the listed identities. Broad tokens can also trigger benign matches; each finding requires review.

## Extraction and limits

| Content | Coverage | Failure / limitation |
| --- | --- | --- |
| UTF-8 and BOM-marked UTF-16 text | Normalized text and path matching | Invalid encodings or embedded NUL bytes fail |
| JSON / JSONL | Raw text plus decoded keys and strings; valid JSON nested within strings is also decoded | Malformed JSON or nesting beyond 100 levels fails |
| XML / SVG | Parsed text, joined and space-delimited text runs, attribute values | Invalid XML, DTD or entity declarations fail; SVG paths or embedded raster images still need visual review |
| DOCX / PPTX / XLSX | Every XML/relationship member (including root `_rels/.rels`), notes, comments, properties, ZIP container/member comments and embedded SVG text; both joined and spaced text runs | Encrypted/unsafe members, links/devices, duplicate names, invalid packages and unsupported embedded binaries fail |
| PDF | `pdftotext` content, standard `pdfinfo` metadata and XMP metadata | Missing tools, extraction failure, limits or invalid XMP fail |
| Recognized raster image files / Office images | Inventory and signature check only | **No image metadata extraction or OCR. Manual review is required.** |
| Single-member gzip text / JSON | Decompressed text, decoded JSON, original filename and comment metadata | CRC/truncation failures, extra opaque headers, concatenated/trailing streams and expansion limits fail |
| TAR inside gzip | Regular file contents, safe member paths, owner/group and PAX metadata; no filesystem extraction | Links, devices, sparse files, duplicate paths, traversal, nested archives, nonzero trailing content and limits fail |
| AppleDouble v2 / ATTR metadata | Strict entry/attribute ranges, UTF-8 names and text values, zero Finder fields and empty resource forks | Unsupported Finder fields, opaque binary attributes, unknown entry types, overlap and unclaimed bytes fail; other TAR members continue to be checked |
| Other binary files / archives | Explicit failed coverage | No silent binary exclusion; unsupported files require a separate review/extraction path |

PDF content extraction is not OCR. Scanned pages, diagram labels and text rendered as images can remain undetected even when a PDF has extractable text. Every PDF receives an explicit no-OCR warning; a PDF with no extracted text gets an additional warning. Embedded document images also require review. SVG text and attributes are scanned, including SVG embedded in Office files, but text encoded as vector paths or embedded raster images is not recognized. Every SVG receives an explicit visual-review warning. Inspect the actual rendered presentation and other changed images separately.

The checker uses Python standard libraries and local Poppler executables; it has no network or model calls. Install `pdftotext` and `pdfinfo` through the environment's normal package management before a release scan. `--pdftotext` and `--pdfinfo` may point to approved executables. Missing tools fail when a PDF is encountered. Executables are trusted tooling and should not come from an untrusted pull request.

Defaults bound processing to 20,000 indexed files, 32 MiB per file and 512 MiB total input. An Office or TAR package may contain at most 4,096 entries, 8 MiB per expanded member and 64 MiB total expanded content. A standalone gzip payload has the same 64 MiB expanded ceiling. Office/gzip processing, including member inspection, has a 20-second wall-clock timeout. Compressed containers are read from bounded memory streams; no archive member is extracted to disk or executed. Additional nested archives are rejected, rather than recursively opened. ZIP comments are inspected as UTF-8 (or CP437 when UTF-8 is invalid); opaque control-bearing comments fail. ZIP central-directory and local-header extra-field bytes are counted separately (the combined count may include both copies), but arbitrary binary extra-field metadata is **not decoded**. Nonempty extra fields produce a manual-review warning; they are not claimed as inspected text. Each PDF extractor invocation has a 20-second timeout and a 16 MiB output ceiling, enforced with a subprocess file-size limit. JSON nesting is bounded. Resource options are explicit CLI flags; raising a bound should be deliberate and recorded. The implementation targets macOS/Linux and uses the standard POSIX `resource` and signal timer facilities.

Forbidden paths include real `.env` variants, local dependency/cache directories, private-key extensions, local database files, common credential filenames and private-note paths. `.env.example`, `.env.sample` and `.env.template` are permitted paths, but their contents still require the dedicated secret scan. A path rule is a conservative publication restriction, not proof that a file contains a credential. Review legitimate public certificates or other exceptions explicitly; do not weaken the rule globally to bypass a finding.

## Results and integration

Exit codes:

- `0`: no configured phrase/path findings or extraction errors. Status remains `pass_with_limitations`; image/manual-review warnings still apply.
- `1`: one or more configured phrase/path findings.
- `2`: invalid configuration, inventory/extraction/resource failures, or inability to write the report. Findings may also be present.

Per-file `scanned_with_manual_review` coverage means supported text was inspected but warnings remain, including images/SVG inside gzip or TAR and ZIP extra fields. TAR reports distinguish inspected members from image members whose content was not scanned.

Check `coverage.inventoryComplete`, `coverage.inspectionComplete`, per-file coverage and every warning. An error never becomes a clean result. Counts are engineering coverage measurements, not evidence that names or secrets are absent in unexamined media.

Suggested integration after inference freezes:

1. Review and stage the intended release files, including new research artifacts and revised presentation sources/binaries.
2. Run this checker on the index with the reviewed phrase-hash configuration and approved Poppler tools. Retain the JSON report privately until its paths have been reviewed.
3. Run a dedicated secret scanner on the staged release export and relevant Git history, using narrow documented exceptions for verified synthetic test canaries only.
4. Review changed images, rendered Office/PDF content, metadata and all extraction limitations. Preserve a dated scope statement.
5. If sensitive content exists in an immutable study artifact, retain its original privately and create a separate, explicitly redacted publication derivative with its own provenance. Never overwrite the frozen original.
6. Add the fixture test and the index check to CI separately. Install Poppler explicitly in CI, provide the reviewed hashes-only configuration and scan the checked-out revision. Do not run inference, repair results, or download model assets as part of this check.

The guard and its tests can be introduced without changing model prompts, scoring criteria, study manifests, package locks or runtime inference code. A later CI integration should preserve those boundaries.


## Unsupported immutable archives

No broad archive bypass or filename-only exception is implemented. If a historical immutable artifact cannot be inspected by the bounded supported extractors, keep the check failing while arranging a separate review. Any future explicit exception must bind the exact outer blob SHA-256, relative path, format, bounded extraction inventory, member-content hashes, reviewer and timestamp, tool/version, and the documented remaining coverage gap. The scanner must reject changed bytes or a mismatched path and must report the exception as a limitation, not as completed extraction. A supported extractor is preferable; do not rewrite the historical artifact or silently omit it from the release inventory.


## AppleDouble metadata scope

The narrow parser follows the public [RFC 1740 AppleDouble structure](https://www.rfc-editor.org/rfc/rfc1740.html) and the ATTR layout in [Apple's copyfile source](https://github.com/apple-oss-distributions/copyfile/blob/main/copyfile.c). It validates the v2 magic/version, entry table, byte ranges and nonoverlap; ATTR names, alignment, header/data bounds and zero padding; and supported text metadata. It never applies attributes to the filesystem. A `._` filename alone does not grant an exception.

Known historical sidecars contain `com.apple.provenance`. Its opaque binary payload is not interpreted as text or declared benign. The report retains an explicit error, nonidentifying type classification, payload length and hash for separate review. Unknown opaque attribute values and unsupported binary entry types also fail. Supported textual attributes in the same valid metadata container and subsequent regular TAR members are still checked. A metadata failure therefore does not prevent inspection of the rest of an otherwise valid archive, and the archive reports partial coverage and a failed result. Structural corruption that prevents trusted parsing remains an explicit failure. There is no opaque-payload allowlist or automatic exception.
