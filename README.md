# counselcodex

A synthetic disposition prototype: one incoming patient message produces
`SELF_CARE`, `ASYNC_PHYSICIAN`, or `URGENT_ESCALATION`, plus a short rationale.

Independent take-home project by **Brandon Dent, MD**. The former UNR role is
biographical; no endorsement by Counsel Health, the University of Nevada, Reno,
OpenAI or Anthropic is claimed. Developed with Codex assistance. See
[disclosures and media-rights limitations](DISCLOSURES.md) and
[third-party notices](THIRD_PARTY_NOTICES.md). Not for patient care.

## Engineering entry points

For code changes, start with [AGENTS.md](AGENTS.md) and the
[engineering guide](docs/ENGINEERING_GUIDE.md). The guide maps tasks to exact
files, distinguishes current and historical runtimes, and identifies commands
that write artifacts or call models. Use the [document index](docs/INDEX.md)
for research reports. The selected application is `/stripped`; `/candidate`
and the native Mastra development server are historical entry points.

## Current take-home submission

**Fable 5.1 low effort, one native Anthropic call, one TypeScript/Mastra step.**
Use the [GUI access guide](docs/GUI_ACCESS.md) to launch the current demo at
[http://localhost:4120/stripped](http://localhost:4120/stripped).
This address works on the machine running the server; it is not a hosted service.
The public slides and saved results below require no setup or API key.

- [Submission package](output/submission-2026-09-15/README.md): editable slides, PDF, and evaluation workbook
- [Google Slides-friendly PowerPoint](output/submission-2026-09-15/counsel-disposition-google-slides.pptx) and [import instructions](docs/GOOGLE_SLIDES_IMPORT.md)
- [Slide narrative and speaker notes](docs/INTERVIEW_DECK_2026-09-15.md): case-led presentation and seven-minute live demo
- [Live demo script](docs/DEMO_SCRIPT_2026-09-15.md)
- [Handoff verification and merged dependency reviews](docs/HANDOFF_REVIEW_2026-09-16.md)
- [Presentation and repository red-team review](docs/PRESENTATION_REPO_RED_TEAM_2026-09-16.md)
- [False-negative reduction experiment](docs/FALSE_NEGATIVE_REDUCTION_RESULTS_2026-09-16.md) and [clinical validation plan](docs/FALSE_NEGATIVE_REDUCTION_PLAN_2026-09-16.md)
- [Physician adjudication v3](docs/PHYSICIAN_ADJUDICATION_V3_2026-09-15.md): case corrections, current scores, and exact Astra/Fable differences
- [Original evaluation appendix](docs/EVAL_APPENDIX_2026-09-15.md)
- [Requirements audit](docs/TAKE_HOME_REQUIREMENTS_AUDIT_2026-09-15.md) and [red-team review](docs/SUBMISSION_RED_TEAM_2026-09-15.md)

The exported slides and workbook are available in the submission package.
The GUI runs locally; its presentation link requires the local server.
Use the [repository guide](docs/INDEX.md) to distinguish the current submission
from historical experiments and application versions.

The selected frozen Fable run returned **50 valid outputs from 50 calls**.
With the [revised physician reference](docs/PHYSICIAN_ADJUDICATION_V3_2026-09-15.md),
its historical agreement is **48/50**, with C22 and C47 remaining as undertriage cases.
The original **44/49** result is retained. C32, C34 and C38 are reference
corrections to self-care; C25 is now accepted as urgent and included in /50.
This is an unblinded physician reassessment of existing outputs, not improved
model behavior or independent clinical validation. Rationale quality remains
separately unscored; C38's pregnancy-precaution omission is documented.

The historical Astra extra-high and max runs each score **47/50**. They differ from Fable only on
**C07, C19 and C47**. All exact messages, predictions, rationales and score changes
are available in the [adjudication outputs](outputs/physician-adjudication-v3-2026-09-15/).
The original CSV is an archived discussion baseline, not the clinical target or
a model-selection objective. Its historical scorecards remain separate.

The supplied PDF describes 20 messages; the attached CSV contains 50. The repo
uses all 50, byte-identical to the supplied file. The expanded project exceeded
the brief's original 6–8 hour scope. The presentation discloses that overrun and
explains the scope of the current baseline.

## Workflow-aware experiment: repeated controls and local Nano

The completed September 16 study ran **1,568 one-shot calls**: four prompt arms,
two models and two repetitions over **50 known cases plus 48 separate authored
challenges**. Every output passed the schema check; that is not clinical validation.

The unchanged Fable baseline returned **45/50 and 46/50** against physician v3.
All 100 known-case baseline request bodies match the historical requests exactly.
The historical **48/50 did not reproduce** and remains labeled as a saved observation.
Adding rapid-async context or explicit pathway definitions did not consistently
reduce missed care. The source package returned **46/50 twice**, resolving C47
but retaining missed clinician reviews on C07 and C22. Local Nemotron 3 Nano's
highest agreement was **43/50 twice**, with new missed-review cases versus its
own control. No research arm is promoted into the GUI.

The known physician reference is a single-physician, post-output reassessment.
The 48 challenge targets are AI-authored and lack clinical review. Their results
remain separate. The retrieval comparison changed **0/98** selected source
packets, so no benefit can be attributed to embeddings. A case-level review also
found an urgent-reference miss exchanged for another despite an unchanged count.

- [Completed results and exact misses](docs/WORKFLOW_AWARE_RESULTS_2026-09-16.md)
- [Publication checks and limitations](docs/WORKFLOW_PUBLICATION_REVIEW_2026-09-16.md)
- [Offline case viewer](publication/workflow-study-review/README.md): all exact messages, saved decisions and paired comparisons; download the single HTML file to inspect without a server
- [Source-package failure analysis](docs/WORKFLOW_EVIDENCE_FAILURE_ANALYSIS_2026-09-16.md) and [retrieval candidate audit](docs/RETRIEVAL_CANDIDATE_AUDIT_2026-09-16.md)
- [Clinical and operational roadmap](docs/WORKFLOW_CLINICAL_OPERATIONS_ROADMAP_2026-09-16.md)
- [Offline reproduction and artifact map](docs/WORKFLOW_REPRODUCTION_2026-09-16.md)
- [Preserved research protocol](docs/WORKFLOW_AWARE_RESEARCH_PLAN_2026-09-16.md)

## False-negative reduction experiment

A separate one-paragraph prompt change completed **98 one-shot calls**. It did
not improve the known-case result: **48/50 → 44/50** under unchanged physician
reference v3. C47 moved to the accepted async route, but C22 remained self-care,
C07 became a new missed clinician referral, and C04/C43/C49 moved from urgent
to async. C32 became an additional referral against its accepted self-care label.
Required clinician action remained **41/43**; urgent routing fell **25/25 → 22/25**.

These are disagreements with the frozen reference, not measured treatment
delays. **Async describes a communication channel and can provide same-day
physician review.** The [Counsel service-context clarification](docs/COUNSEL_ASYNC_CARE_CONTEXT_2026-09-16.md)
separates physician response, required care timing and access to examination or
testing. A revised service-specific policy requires prospective clinical review;
the original scores and references remain unchanged.

On a separate 24-case challenge, agreement changed **22/24 → 23/24** against
**AI-authored, unreviewed proposed labels**. Those are development checks, not
physician agreement or independent clinical validation. The experiment stopped
after the planned pass. The frozen GUI remains unchanged. See the
[exact messages, paired outputs and separate scorecards](docs/FALSE_NEGATIVE_REDUCTION_RESULTS_2026-09-16.md)
and the [blank clinician-review materials](data/research/fn-reduction-v1/reviewer-pack/README.md).

## Conditional timing experiment

A new [conditional subtype experiment](docs/STRIPPED_STRATIFICATION_FABLE_2026-09-15.md)
keeps the frozen parent buckets and asks a second timing question for async and
urgent cases. Plain-language choices map to priority/routine async review and
emergency-now/same-day in-person care. All **41 calls returned valid outputs**;
nine self-care cases passed through.

Three-bucket agreement remains **48/50**, including C25 urgent and the
C32/C34/C38 self-care corrections. This result is preserved by construction,
not independently reproduced. New conditional timing agreement is **31/40**;
end-to-end five-way agreement is **38/49**, including the inherited parent
errors and all three self-care corrections. C25 counts as correct in the
three-bucket score; only its emergency-versus-same-day timing is unscored.
Four refill-policy conflicts and four emergency-versus-same-day disagreements
remain visible. The current
GUI remains the three-bucket demonstration.

## Run the current demo

Use Node 22.18.0 (pinned in `.nvmrc`, matching CI), or Node 24.11+, and `ANTHROPIC_API_KEY` in the server environment or
repository-root `.env`.

```bash
npm ci
npm run review:build
npm run demo
```

The launcher checks local prerequisites and fails clearly if port 4120 is
occupied. It does not choose a different port. Use `npm run demo:check` for
preflight only, or `npm run demo:offline` to locate saved review artifacts.
Live submission requires provider access; startup does not test that access or
make a model call. [Setup, troubleshooting and data flow](docs/GUI_ACCESS.md).

Choose a synthetic message and click **Get disposition**. Expand
**Request & response trace** for the exact request, final text, usage, timing,
and run/provider IDs. Downloaded traces omit hidden reasoning and server API-key
headers. Submitted text is retained verbatim; do not paste credentials or real
patient information into a message.
Editing clears the old answer. Each new submission is independent.

The standalone workflow needs only the Anthropic key. It has no retrieval
initialization, judge, repair, clinical gate, queue, or separate patient-reply
generator. Its short rationale can still contain advice, whose clinical quality
has not been independently graded. The TS builder matches all 50 archived Fable
request bodies byte for byte. Physician and CSV labels enter separate offline
scorecards only after generation freezes.

A local $2 demo allowance reserves spend before dispatch and persists records
under `apps/evaluation/.local/stripped-disposition/`. Keep these records across
restarts. Six documented browser calls cost $0.04081 estimated and $0.05307
conservatively accounted. See the [GUI guide](docs/STRIPPED_FABLE_GUI_2026-09-15.md)
for setup, accounting, and run IDs. This is an independent research demo,
not Counsel's deployed product or patient care.
The [September 16 handoff checks](outputs/stripped-gui-handoff-2026-09-16/manifest.json)
record five further browser submissions, including a final check on the updated
dependency stack. These are integration checks, not a new clinical benchmark.

## Frozen experiments

| Run | Original physician v2 | Revised physician v3 | v3 misses |
| --- | ---: | ---: | --- |
| Three-bucket Fable 5.1 low | 44/49 | **48/50** | C22, C47 |
| Three-bucket Astra extra-high | 43/49 | 47/50 | C07, C19, C22 |
| Three-bucket Astra max | 43/49 | 47/50 | C07, C19, C22 |
| Three-bucket Opus 5 low | 42/49 | 44/50 | C07, C22, C32, C43, C47, C49 |
| Three-bucket Fable 5.1 max | 42/49 | 46/50 | C07, C22, C47, C49 |
| Historical five-way Opus, collapsed | 46/49 | 48/50 | C32, C49; different prompt |

The original five-way Opus exact-route score was 35/49. Collapsing the same
outputs to three buckets gave 46/49 under v2. Reference revision is a separate
operation from taxonomy mapping.

Historical V25 completed 27/50 full releases, with **21/49** exact-route
agreement. The [original offline audit](outputs/submission-audit-2026-09-15/audit.json)
maps those delivered routes to **22/49**, changing only C12. Those remain v2
results; V25 is not rescored here. Its output contract differs from the stripped
prototype, so the comparison cannot isolate the effect of removing a component.

The current demonstration remains Fable low. A single pass on known synthetic
messages does not establish a stable ranking. **Higher agreement does not imply
better clinical policy on contested OTC or self-care labels.**

Reports: [current physician adjudication](docs/PHYSICIAN_ADJUDICATION_V3_2026-09-15.md),
[Astra comparison](docs/STRIPPED_3BUCKET_ASTRA_2026-09-15.md),
[original three-bucket comparison](docs/STRIPPED_3BUCKET_COMPARISON_2026-09-15.md),
[max-effort ablation](docs/STRIPPED_3BUCKET_FABLE_MAX_2026-09-15.md),
[V25 completed report](docs/V25_COMPLETED_REPORT.md).

## Verify without model calls

```bash
npm run lint
npm run typecheck
npm test
npm run review:test
npm run build
node scripts/submission-evidence-audit.mjs
node scripts/score-physician-adjudication-v3.mjs
node scripts/verify-submission-package.mjs
```

The generators under `scripts/stripped-*` make paid calls when executed.
Their frozen outputs are already present. Rerunning them is not a setup step.
Audit and parser tests are offline. Package builds may need network access to
install Mastra's output dependencies.

## Source map

- `src/stripped/protocol.ts`: frozen prompt, native request, strict parser
- `src/stripped/workflow.ts`: one Mastra step and final-output trace projection
- `src/stripped/service.ts`: server key loading and append-only accounting
- `apps/evaluation/app/stripped/`: current GUI
- `apps/evaluation/app/api/stripped/`: local HTTP endpoint
- `data/patient_messages.csv`: original synthetic assignment data
- `data/evaluation/physician-system-reference-v2.json`: original development reference, unchanged
- `data/evaluation/physician-adjudication-v3-2026-09-15.json`: physician amendments, scorecard-only
- `outputs/stripped-*`: immutable experiment and browser-verification records

## Historical application and research

V25 remains at `/candidate`; the earlier incumbent remains at `/` and `/v0`.
Their source and frozen results are unchanged by the stripped prototype. Their
setup requirements are separate. Mastra Studio's existing default is the
incumbent, not `/stripped`.

The [V25 contract](docs/V25_README.md), [historical pipeline](docs/CURRENT_PIPELINE.md),
[historical v23 demo runbook](docs/DEMO_RUNBOOK.md), and dated PowerPoints describe
their own versions. Use the current submission package for review.
The [application alignment comparison](docs/ALIGNMENT_STATUS_APPLICATION_2026-09-15.md)
retains its no-promote decision. The [local NVIDIA experiments](docs/LOCAL_OFFLINE_RESULTS_2026-09-15.md)
did not validate a binding critic or an Opus replacement. The
[clinical judge program](docs/CLINICAL_JUDGE_PROGRAM.md) is separate methodology
and research evidence, not a live judge in the stripped workflow.

Historical sources, physician records, failures, and outputs remain available.
No clinical-readiness or V25 promotion claim follows from this package.
