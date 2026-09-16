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
| XML / SVG | Parsed text, joined and space-delimited text runs, attribute values | Invalid XML, DTD or entity declarations fail |
| DOCX / PPTX / XLSX | Every XML/relationship member, including notes, comments and document properties; both joined and spaced text runs | Encrypted/unsafe members, duplicate names, invalid packages and unsupported embedded binaries fail |
| PDF | `pdftotext` content, standard `pdfinfo` metadata and XMP metadata | Missing tools, extraction failure, limits or invalid XMP fail |
| Recognized raster image files / Office images | Inventory and signature check only | **No image metadata extraction or OCR. Manual review is required.** |
| Other binary files / archives | Explicit failed coverage | No silent binary exclusion; unsupported files require a separate review/extraction path |

PDF content extraction is not OCR. Scanned pages, diagram labels and text rendered as images can remain undetected even when a PDF has extractable text. Every PDF receives an explicit no-OCR warning; a PDF with no extracted text gets an additional warning. Embedded document images also require review. Inspect the actual rendered presentation and other changed images separately.

The checker uses Python standard libraries and local Poppler executables; it has no network or model calls. Install `pdftotext` and `pdfinfo` through the environment's normal package management before a release scan. `--pdftotext` and `--pdfinfo` may point to approved executables. Missing tools fail when a PDF is encountered. Executables are trusted tooling and should not come from an untrusted pull request.

Defaults bound processing to 20,000 indexed files, 32 MiB per file and 512 MiB total input. An Office package may contain at most 4,096 entries, 8 MiB per expanded member and 64 MiB total expanded content. Each PDF extractor invocation has a 20-second timeout and a 16 MiB output ceiling, enforced with a subprocess file-size limit. JSON nesting is bounded. Resource options are explicit CLI flags; raising a bound should be deliberate and recorded. The implementation targets macOS/Linux and uses the standard POSIX `resource` module.

Forbidden paths include real `.env` variants, local dependency/cache directories, private-key extensions, local database files, common credential filenames and private-note paths. `.env.example`, `.env.sample` and `.env.template` are permitted paths, but their contents still require the dedicated secret scan. A path rule is a conservative publication restriction, not proof that a file contains a credential. Review legitimate public certificates or other exceptions explicitly; do not weaken the rule globally to bypass a finding.

## Results and integration

Exit codes:

- `0`: no configured phrase/path findings or extraction errors. Status remains `pass_with_limitations`; image/manual-review warnings still apply.
- `1`: one or more configured phrase/path findings.
- `2`: invalid configuration, inventory/extraction/resource failures, or inability to write the report. Findings may also be present.

Check `coverage.inventoryComplete`, `coverage.inspectionComplete`, per-file coverage and every warning. An error never becomes a clean result. Counts are engineering coverage measurements, not evidence that names or secrets are absent in unexamined media.

Suggested integration after inference freezes:

1. Review and stage the intended release files, including new research artifacts and revised presentation sources/binaries.
2. Run this checker on the index with the reviewed phrase-hash configuration and approved Poppler tools. Retain the JSON report privately until its paths have been reviewed.
3. Run a dedicated secret scanner on the staged release export and relevant Git history, using narrow documented exceptions for verified synthetic test canaries only.
4. Review changed images, rendered Office/PDF content, metadata and all extraction limitations. Preserve a dated scope statement.
5. If sensitive content exists in an immutable study artifact, retain its original privately and create a separate, explicitly redacted publication derivative with its own provenance. Never overwrite the frozen original.
6. Add the fixture test and the index check to CI separately. Install Poppler explicitly in CI, provide the reviewed hashes-only configuration and scan the checked-out revision. Do not run inference, repair results, or download model assets as part of this check.

The guard and its tests can be introduced without changing model prompts, scoring criteria, study manifests, package locks or runtime inference code. A later CI integration should preserve those boundaries.
