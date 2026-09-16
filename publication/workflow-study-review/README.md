# Offline workflow-study review

Download `index.html` and open it in a browser. The file contains its own data, styling and script. No server, account or network connection is needed. Source URLs and repository artifact paths are displayed as text; the page makes no external requests.

Select a case, model, arm and repetition. Compare the exact message, saved rationale and reference-defined endpoints with that model's contemporaneous baseline. Quick links surface C22, C47 and WP16B. The matrix makes every arm and repetition available. Arm D's source packet is shown with provenance, complete selected text and retrieval exclusions; other arms did not receive that packet.

Known references are one physician's post-output reassessment of familiar development cases. Authored challenge targets are unreviewed and are not clinical gold. The historical 48/50 result is not the new baseline. Repeated calls and paired variants do not create additional independent patients. This artifact measures no clinical outcomes, completed care or emergency timing and does not promote any model or runtime.

The build first verifies the entire completed generation, native-response/parsed parity, frozen inputs and reference hashes through the existing offline scorer. It recomputes the scorecard without writes and requires exact saved-scorecard and scoring-audit parity. Only an allowlisted projection is embedded: messages, routes, short rationales, reference-based endpoints, selected source cards and artifact identities. Provider accounting, credentials and raw reasoning are not embedded.

Patient and source text is inserted with DOM `textContent`. JSON escapes HTML delimiters; the page has a restrictive hash-based Content Security Policy and no external resources, event-handler attributes or HTML insertion sinks. This is a bounded inspection aid, not a security guarantee for arbitrary future changes.

Build from the repository root with the supported Node runtime:

```sh
MASTRA_TELEMETRY_DISABLED=true node --experimental-strip-types scripts/build-workflow-review.ts
MASTRA_TELEMETRY_DISABLED=true node --experimental-strip-types scripts/build-workflow-review.ts --verify
```

Build refuses to overwrite different existing artifacts. Verification recomputes the deterministic output and checks exact bytes without writing. The manifest binds the HTML, this README, embedded-data hash, builder source hashes and input artifact hashes. No study files are modified.
