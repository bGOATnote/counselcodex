# Workflow research publication review

Prepared September 16, 2026. This review covers the completed workflow study, its offline inspection tools, revised presentation and publication checks. It is software and artifact verification, not clinical validation, legal certification or approval to expose a patient-facing service.

## What is being published

- The completed 1,568-call study, its original generation records and separate offline scorecards. The 50 familiar physician-reference cases and 48 AI-authored challenges remain distinct.
- A 45-slide editable PowerPoint and matching PDF. Fifteen main slides preserve the case-led sequence, with C22 and C47 on slides 2 and 3; thirty appendix slides retain exact cases, methods and failures. The Google Slides import copy is byte-identical to the standard PowerPoint.
- A single-file, offline viewer for all 98 messages and 1,568 saved decisions. It compares each result with its own model/repetition control and displays the selected source packet. It contains no inference controls, external requests or raw thinking fields.
- A separate, reference-free retrieval candidate audit using existing vectors. Its 686 relevance/applicability review pairs are blank; no clinician review or clinical benefit is asserted.
- Four separately named source-only historical archive derivatives. Original bytes are retained locally and privately; their previous Git availability is disclosed. No history rewrite is claimed by this update.

The historical Fable 48/50 result remains a saved observation. Contemporary controls returned 45/50 and 46/50. No research variant replaces the live demonstration. [Results](WORKFLOW_AWARE_RESULTS_2026-09-16.md), [roadmap](WORKFLOW_CLINICAL_OPERATIONS_ROADMAP_2026-09-16.md).

## Source and runtime verification

| Check | Result and boundary |
|---|---|
| Complete integrated suite | 1,096 tests: 1,048 passed, 48 historical tests skipped, zero failures or cancellations. Skipped tests require their original frozen runtime trees; they are not reported as passes. |
| GUI suite | 178 passed. The maintained Next and native Mastra artifacts build; the generated Mastra lock installs independently. |
| TypeScript and syntax | Passed; 98 JavaScript modules syntax-checked. |
| Frozen generation replay | All 1,568 jobs verified before reference admission; saved scorecards reproduce exactly. Independent calculations also matched all 32 metric groups. |
| Protected prior files | 7,961 original identities checked. The only changed file in that inventory is the separately reviewed application dependency manifest. Clinical inputs, original results, references and prior clinical source are unchanged. |
| Offline viewer | Seven focused tests; 112 browser comparisons of exact messages, outputs, paired controls and endpoint values. Zero external requests and zero provider calls. Desktop and mobile layout inspected; initial mobile overflow fixed before final verification. |
| Candidate discovery audit | Fifteen focused tests and independent code review. Read-only verification refuses missing or differing output; no label inputs or new provider calls. |
| Demo launcher | Seven existing tests pass after adding the new saved viewer/report paths to offline help. Live launch behavior is unchanged. |
| Publication guard | Thirty-one focused tests pass. Duplicate JSON values, nonempty ZIP directory streams and original TAR metadata now receive explicit inspection or rejection. Standalone structured-file processing is time-bounded. |

The [pinned source security review](WORKFLOW_SECURITY_REVIEW_2026-09-16.md) found no reportable vulnerability in its 32-file scope. The later three publication-coverage findings and deadline hardening are separately documented there; they must not be described as findings from that earlier immutable scan. The reviews do not audit every dependency or prove absence of vulnerabilities.

## Publication content and secrets

The release check reads exact Git index objects, including staged additions. The first integrated scan covered **16,391 files**, with zero configured phrase/path findings and zero extraction errors. Forty warnings identify visual or metadata work outside that automated checker; these are coverage qualifications, not ignored findings. Final metadata/documentation changes are rescanned, and CI repeats the check on the proposed revision. A successful check means no configured match was detected within its supported scope, not that every possible identifier is absent.

Dedicated Gitleaks scans of the exported index and all locally fetched history each found the same intentional fixture in `tests/stripped-gui-workflow.test.mjs`. It was inspected and is not an operational credential. No broad filename exception was introduced. A separate configured-phrase scan covered the six pinned local refs at `2015a204c82cbafb774d4053133c4c7c90c03452`: 8,084 unique blobs, 29 commit metadata objects, 387 trees and 12,770 entry names. No configured phrase matched, but four original archive blobs had unsupported extraction and 39 visual warnings remained. No remote refs were fetched for that pass, and it is not a history clearance. Original archive availability and unsupported historical content remain disclosed in the [archive review](PUBLIC_ARCHIVE_REVIEW_2026-09-16.md).

The archive derivatives retain 487 source files byte for byte and omit unnecessary AppleDouble metadata and local runtime databases. The retained original databases were separately inspected through bounded, read-only SQLite and DuckDB decoding. No configured phrase or secret pattern was detected in the visible decoded rows. Deleted, unreachable and opaque content was not established absent. Derivative publication does not retrospectively remove an original from Git history.

## Presentation and media

All 45 exported PDF pages were rendered and visually inspected. A fresh render bound to the current PDF received 90 OCR passes with no configured phrase match. The earlier raster review covered 58 unique byte identities; 57 decoded successfully and received 114 OCR passes. The two unique SVG logos were subsequently rendered on light and dark backgrounds, with page scripts disabled and network requests blocked: four renders, eight OCR passes and no configured match. All seven SVG occurrences were rehashed against those identities.

Sixteen current Office files, representing 14 unique byte sequences and 1,117 members, passed CRC and physical local-header/central-directory/end-record checks. No unexplained gaps, overlapping regions, trailing bytes, ZIP extra fields or comments were present in those files. This does not claim arbitrary embedded binary metadata was decoded. Four historical PowerPoints still contain the same malformed 67-byte one-pixel PNG; it remains explicitly undecoded and unchanged.

The current deck contains 35 native tables and five native images, uses Arial, and retains editable text. Export checks found no macros, embedded objects, SmartArt, animations or transitions, and no external media. The only external relationships are the intended cover hyperlinks. Native-layout checks report zero findings or warnings. Actual Google Slides import and PowerPoint UI conversion were not performed; the [import guide](GOOGLE_SLIDES_IMPORT.md) preserves that limitation.

Twenty-five assignment messages and seven authored challenge messages appear verbatim. Every mentioned case has its exact message visible somewhere in the deck. No financial content or individual recipient names were detected in current slide text or speaker notes. The ankle photographs and supplied diagram remain discussion assets, outside model inputs and outcome evidence. Their unresolved rights/consent qualifications remain in [disclosures](../DISCLOSURES.md).

## Remote verification and handoff

The current demonstration remains the loopback-only three-bucket GUI. Its cover link points to `http://localhost:4120/stripped`, with a separate public setup-guide link. The saved viewer opens directly from a downloaded HTML file and requires no server or account. Neither is presented as a hosted clinical service.

The [CI workflow](https://github.com/bGOATnote/counselcodex/actions/workflows/ci.yml) is the source for current hosted status. It checks the exact submitted revision, uses read-only repository permissions, and makes no inference or model-download calls. Research publication does not constitute clinical promotion. The final commit and check URLs belong in the pull-request/release handoff rather than being embedded as self-referential claims in these artifacts.
