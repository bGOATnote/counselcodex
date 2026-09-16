# Dependency maintenance — September 16, 2026

This change consolidates the package updates proposed in dependency PRs 6–10. Each PR stopped at the submission-package integrity check because a tracked package manifest or lockfile no longer matched its published hash. Passing installation and audit before that failure did not validate the remaining tests or build.

## Reviewed package changes

| Package | Previous | Current |
|---|---:|---:|
| React / React DOM | 19.2.8 | 19.3.0 together |
| React types / React DOM types | 19.2.18 / 19.2.7 | 19.3.0 together |
| Node types, root and app | 26.4.1 | 26.5.1 |
| Zod, root and app | 4.5.4 | 4.6.4 |
| Mastra LibSQL adapter | 1.22.3 | 1.22.5 |

Next remains 16.3.5, Mastra core remains 1.66.0, and other direct pins are unchanged. Relevant transitive changes are LibSQL client/core 0.18.0, scheduler 0.28.0 and undici-types 8.9.0. The combined lock contains one effective application React/React DOM pair and matching types. Existing Linux platform constraints are retained. Dependabot now groups the four React runtime/type packages so they are reviewed together.

React 19.3 includes rendering, transition, form and hydration changes; validation therefore includes the built application in a browser. The Zod interval includes parsing and JSON Schema conversion changes, making request/output contract tests relevant. LibSQL 1.22.5 fixes in-memory table loss after interactive transactions and coordinates concurrent store access; it also includes an initialization backfill for previously double-encoded experiment tags. [React release](https://github.com/react/react/releases/tag/v19.3.0), [Zod comparison](https://github.com/colinhacks/zod/compare/v4.5.4...v4.6.4), [LibSQL release changes](https://github.com/mastra-ai/mastra/blob/main/stores/libsql/CHANGELOG.md).

## Runtime and historical provenance

The maintenance checkout started from public commit [`4296ed62d6f09ae8332a31bf0cef2e9efa68b6c0`](https://github.com/bGOATnote/counselcodex/commit/4296ed62d6f09ae8332a31bf0cef2e9efa68b6c0). That commit retains the previous package manifests, lock and [submission manifest](https://github.com/bGOATnote/counselcodex/blob/4296ed62d6f09ae8332a31bf0cef2e9efa68b6c0/output/submission-2026-09-15/manifest.json).

Only the current submission manifest's three changed package artifact entries are refreshed: `package.json`, `package-lock.json` and `apps/evaluation/package.json`. Its historical `frozenRuntimeCommit`, presentation revision and other artifact hashes are retained. A separate maintenance entry records this revision and its prior public commit. The current package entries identify the maintained checkout; they do **not** assert that historical inference or the presentation used the newer dependencies.

No frozen model output, physician reference, prompt, presentation file or clinical score is revised. No model was called. This dependency change does not promote a research variant or change the clinical policy.

## Validation and limits

Validation used an isolated checkout, Node **24.19.0**, npm **11.4.2**, a separate package cache, absent provider credentials and disposable local stores. No existing development or research database was opened for migration.

- Clean workspace install; dependency audit reports zero vulnerabilities at check time; dependency-tree checks report no peer conflict.
- Lint, typecheck, complete configured test command and GUI tests pass. The main command reports 979 tests: 930 passed, 49 skipped, zero failed. GUI tests: 178 passed. Existing fixture-dependent skips remain skips; they are not counted as validated cases.
- New disposable LibSQL tests retain two workflow records through consecutive transactions and concurrent reads/writes, then reopen the file store and verify both records. Both memory and file variants pass. These tests use synthetic storage data, not clinical records.
- Existing CI's historical verification and deterministic checks pass. The Next application and Mastra artifact build; a separate clean install of the generated Mastra runtime lock and its verifier pass.
- Production-browser smoke uses three explicitly **stubbed** responses, with zero provider calls: two consecutive selections/submissions, clearing stale results, trace rendering, error recovery, hydration, response headers, and the real handler's cross-origin rejection. It does not validate provider availability or clinical behavior.

Hosted CI on **Node 22.18.0** passed for the reviewed [PR 11](https://github.com/bGOATnote/counselcodex/pull/11), merged at `0db92c50a2c80d08816817a4666b6acdadb081f1`. The [main CI run](https://github.com/bGOATnote/counselcodex/actions/runs/35072730108) also passed. Superseded dependency PRs 6–10 were closed. The isolated maintenance validation preceded integration into the research checkout; research generation and scoring froze before that integration. Its archived inference runtime remains unchanged.

Future use of the upgraded adapter with an existing database should follow a separately reviewed backup and migration procedure. The disposable tests establish compatibility for this project's tested operations, not exhaustive database-migration safety.
