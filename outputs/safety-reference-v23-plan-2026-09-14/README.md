# Prospective safety-reference serialization experiment

This is an unpromoted, offline-prepared experiment, not a clinical reference or runtime change. No model calls were made while creating this plan.

- Manifest fingerprint: `9fab3f0f21abe0fd321d1d2294dfce6de0fb265fe63d203cb57dea9c0fe0fd08`.
- Six fixed development messages, two trials, two arms: 24 maximum calls. C35 is a known serialization failure, not a held-out case.
- Baseline: actual current full Haiku safety instructions/schema/settings. References: the same clinical policy and fields, with `basis.quoteId` and `activeEms.quoteId` resolved to exact original patient spans using existing `quoteSpans`.
- Both arms receive the complete original patient message. Only the reference arm receives its sentence-span catalog. Labels, expected actions and historical outcomes are not sent to the model.
- Maximum allocation: **$0.90 inclusive** from remaining sprint capacity; all-unknown pre-call reservations total **$0.831015**. Known estimates include a 25% contingency without cache discounts. Unknown usage, provider failures and unfinished started calls retain their full reservations. These are estimates/reserves, not invoices.
- All 24 planned rows remain in accounting; the invocation is single-use and there are no retries. The read-only `--inspect` path reports interrupted starts without replaying a request.
- Raw provider wire output is retained unchanged. Resolution audit binds patient/raw/resolved hashes and exact offsets. No quote text, action, reason, contextual flag or sufficiency judgment is corrected by the resolver.
- Sentence IDs establish identity only. They can include both a symptom and its qualifier. Incorrect model attribution can still pass structural checks; manual review of every paired raw output is required. Same-input action, typed transport and negative-case escalation outcomes are separate from quote admission.
- No automatic runtime promotion or clinical superiority claim is authorized by this experiment.

## Zero-spend verification

`tests/safety-reference-study.test.ts`: **13 passed, 0 failed/skipped** on Node 24.3.0 (432.007458 ms) and Node 22.17.1 (417.52875 ms). Tests cover stale/unknown references, full-schema preservation, exact active-EMS binding, contextual negatives, failed-provider partial output, all-row/unknown-cost accounting, interrupted artifacts, prospective authorization and real Mastra request payload capture with sockets blocked. A focused strict TypeScript check also passed with the repository's JavaScript-import settings. Tests do not establish clinical accuracy.

The frozen plan binds Node 24.3.0 and its ICU version because sentence segmentation is part of the input identity. Revalidation rejects implementation, schema, prompt, patient, settings, schedule or budget drift.

`source-code-snapshot.tar.gz` SHA-256: `a95a00ed4a7579107dc55383cab6c395635d33cc75a851e86ae1ccc60530cc17`. The archive contains allowlisted source code, this runner/test, package/lock files and original/reference fixture data; it excludes credentials, dependencies, generated bundles and database files. No historical results were changed.

Package test registration is deliberately deferred until the frozen experiment and GUI verification finish, so registration cannot silently invalidate the planned package identity.
