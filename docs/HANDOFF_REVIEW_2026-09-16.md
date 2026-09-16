# Public handoff review — September 16, 2026

## Review entry points

- [Public repository](https://github.com/bGOATnote/counselcodex)
- [GUI setup and saved results](GUI_ACCESS.md)
- [PowerPoint download](https://github.com/bGOATnote/counselcodex/raw/refs/heads/main/output/submission-2026-09-15/counsel-disposition-take-home.pptx)
- [Project disclosures](../DISCLOSURES.md) and [third-party notices](../THIRD_PARTY_NOTICES.md)

The repository URL previously shared by the presenter is unchanged. The
repository website field points to the public GUI guide. Slide 1 contains
separate native hyperlinks for that guide and `http://localhost:4120/stripped`.
The guide and PowerPoint download were verified without authentication; the
downloaded PowerPoint hash matched the local export. Localhost is explicitly
identified as a service on the viewing machine, not a remotely hosted demo.

## Demonstration engineering

`npm run demo` launches the built Next application on `127.0.0.1:4120`. Preflight
checks Node, installed dependencies, the production build, server-side key
availability and both loopback address families for a port conflict. It does
not print or validate the key over the network. A conflict stops startup rather
than selecting a different port or stopping an existing process.

`demo:check` performs preflight without starting a server. `demo:offline` lists
saved artifacts without dependencies or a key; it does not simulate a live
response. The older deterministic CLI remains separately named `demo:rules`.
The GUI identifies its independent research scope and Anthropic data flow before
submission, with links to disclosures and setup. The page metadata describes
this actual interface rather than the historical physician-authoring tool.

## CI and pull requests

The initial Linux failure came from a macOS-specific `/private/tmp` lock path.
It was fixed using `node:os` temporary-directory discovery, preserving exclusive
locking and cleanup. Four dependency PR failures were stale instances of that
defect. DuckDB also introduced a real type incompatibility with the older Mastra
core interface, so core was updated first.

| PR | Dependency | Updated version | Verification |
| --- | --- | --- | --- |
| [1](https://github.com/bGOATnote/counselcodex/pull/1) | `@mastra/core` | 1.66.0 | [Fresh CI passed](https://github.com/bGOATnote/counselcodex/actions/runs/35056158980) |
| [2](https://github.com/bGOATnote/counselcodex/pull/2) | `@mastra/observability` | 1.17.7 | [Fresh CI passed](https://github.com/bGOATnote/counselcodex/actions/runs/35056162410) |
| [3](https://github.com/bGOATnote/counselcodex/pull/3) | `next` | 16.3.5 | [Fresh CI passed](https://github.com/bGOATnote/counselcodex/actions/runs/35056165846) |
| [5](https://github.com/bGOATnote/counselcodex/pull/5) | `mastra` | 1.29.0 | [Fresh CI passed](https://github.com/bGOATnote/counselcodex/actions/runs/35056168643) |
| [4](https://github.com/bGOATnote/counselcodex/pull/4) | `@mastra/duckdb` | 1.8.0 | [Fresh full-combination CI passed](https://github.com/bGOATnote/counselcodex/actions/runs/35056634408) |

All five pull requests were merged after fresh successful CI. The exact
combined dependency diff passed offline evaluations, both production
builds, clean installation of the generated Mastra artifact and the native HTTP
access-policy tests. An isolated generated server bound to IPv4 loopback and
rejected foreign-origin and host-mismatch requests before generation. The test
used an ephemeral port because another repository owned port 4111; that process
was left untouched. No provider calls were made by those checks.

CI now runs on main pushes, PRs and manual dispatch, with one run per PR event,
obsolete-run cancellation, a timeout and a high/critical dependency-advisory
gate. It retains the full offline evaluation and artifact checks. No tests were
disabled. There is no automatic public or clinical deployment. See
[CI and review](CI_AND_REVIEW.md).

## Presentation and disclosures

Revision 15 retains the 28-slide structure, exact messages, C22/C47 false-negative
slides, clinical qualifications and roadmap. Only the cover's visible content
changed; the other 27 pages are pixel-identical to revision 14. The cover now
labels the Counsel logo “Prepared for,” preserves the presenter's supplied name
and former role, and states the independent-work and non-endorsement boundary.
PPTX and PDF hyperlinks, native tables, speaker notes and all 19 quoted case
messages were checked. Native PowerPoint application execution was not tested.

The disclosures distinguish personal authorship, a former affiliation, Codex
development assistance, physician decisions and vendor model output. They do
not claim institutional approval, legal clearance, blanket ownership or an
open-source license. Dataset redistribution terms, media rights and any required
subject consent remain unverified. Provenance and metadata removal do not
resolve those issues. The supplied media remains at the presenter's request.

The public Git history and current tracked content were checked for targeted
recipient/employee names, including Office XML and PDF text; no matches were
found. Secret scanning identified the existing deliberately synthetic test-key
fixture only. These are scoped checks, not a guarantee that every privacy,
security or intellectual-property risk has been eliminated.

## Frozen clinical evidence

Clinical prompts, original assignment data, physician references, historical
outputs and V25 clinical source were not edited. Framework dependencies changed;
the preserved experiments were not rerun or relabeled. The current result stays
48/50 under physician v3, with the original 44/49 preserved. New browser checks
are integration observations, not a new benchmark or evidence of clinical
readiness. Historical records and their hashes remain the evidence for earlier
model behavior.

## Final local verification

On supported Node 24.19.0, installation completed without engine warnings;
lint and typecheck passed; the main suite passed 906 tests with 48 skips and
no failures or cancellations; the UI suite passed 178/178. Both production
builds and artifact checks passed. The final GUI-only link-styling adjustment
was rebuilt separately. Dependency audit reported no known advisories at the
time of review. CI independently uses the pinned Node 22.18.0 runtime.

Five fresh browser submissions completed with one provider call each and no
provider or browser-console errors. C01 returned self-care, C02 urgent, C06
async, and an edited C06 with new red flags urgent. A final C06 smoke check
on the updated dependency stack again returned async. Loading showed no
preliminary disposition; changing a selection or editing cleared the old result.
The edited request contained exactly one user message and the frozen system
prompt. The first four observations used the prior dependency build; the final
smoke used Next 16.3.5 and Node 24.19.0.

[Run IDs, exact requests/responses, timings and accounting](../outputs/stripped-gui-handoff-2026-09-16/manifest.json)
are retained separately from the 50-case benchmark. This check does not add to
its denominator or change its agreement. A visual pass confirmed the independent
project label, data-flow notice and disclosure/setup links.
