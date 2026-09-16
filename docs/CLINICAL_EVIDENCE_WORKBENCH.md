# Clinical evidence workbench: what changed and what is measured

Version: `clinical-briefs/2026-09-10.1`; comparison form: `clinical-comparison/v2`.

## Clinical review, not three competing authorities

The main comparison now presents the **actual V0 route, rationale and generated patient instruction**, followed by the exact original dataset label. The old project-authored proposal is optional development provenance, not a second reference answer. Rule-assigned confidence is explicitly uncalibrated and is no longer prominent. The source label `URGENT_ESCALATION` remains unmodified, with its assignment definition explained separately.

“Action or timing underspecified” is now distinct from potential under-triage and clinical uncertainty. A broad label may fail to direct emergency action even when its three-bin projection matches an emergency reference. No new metadata changes the primary pre-reveal four-level agreement score. The original CSV, prediction artifact and earlier reviewer answers remain unchanged.

## Concise clinical support for all 50 cases

Each supplied case has a short differential (up to three entries) or a refill/results/screening review focus when a symptom-led differential is not supported. A decision-relevant caveat and adjacent source links accompany it. These are **project-authored research briefs**, not generated agent reasoning, established diagnoses, independent gold labels or evidence of agent lift. They do not upgrade the measured V0 response. Unknown or changed messages cannot inherit a brief by reusing a case ID: the source dataset hash and exact message must match.

The research panel renders only after the independent judgment is locked. This reduces additional anchoring but does not make previously exposed development cases a blinded holdout. Existing reviews are not retrospectively attributed to these sources. New comparison edits/completions record the brief version, catalog hash, message hash, source IDs, link-report hash and timestamp in JSON and CSV exports. This context records the instrument used—not proof that a clinician opened, read or endorsed each source.

Sources are differentiated by type and date: AFP evidence reviews, ACOG FAQs/clinical summaries, specialty guidance, CDC guidance and product-specific drug labels. ABEM's EM Model describes specialty content/examination coverage; it is **not** a condition-level treatment guideline, so we did not label these recommendations “ABEM-approved.” [ABEM EM Model](https://www.abem.org/resources/em-model/).

Some sources are old, some are public summaries rather than full guidelines, and some direct pages are publisher-blocked. These limitations are visible. The catalog is not a systematic review, comprehensive current standard-of-care determination, prescribing reference or general-purpose RAG system. It still needs physician review of the clinical application and a maintained source-update process.

## Reproduce the source check

```sh
node --experimental-strip-types scripts/check-clinical-sources.mjs
```

The command performs bounded, credential-free GETs to the fixed public publisher registry, revalidates redirect hosts, and writes a new immutable JSON report under `docs/research/link-checks/`. It sends no case messages. Exit code 2 reports blocked/broken/unverified transport outcomes requiring attention; it is not a successful all-links-valid result.

The initial run found **35 reachable sources (33 HTML, two PDF), seven HTTP 403 publisher blocks**. Blocked: AHA ACS patient guidance, ACOG preeclampsia, pregnancy bleeding, ectopic pregnancy, perinatal mental health, menopause, and AHA heart-failure symptom guidance. All 42 were attempted. Report: [2026-09-10 link check](research/link-checks/2026-09-10T04-11-49.216Z-0cc977b441b6.json).

An HTTP success is **not** a verified title, claim-entailment check, currency check, licensed full-text review or clinical validation. The checker deliberately labels HTML/PDF content unverified. It detects common challenge/error titles, but cannot rule out every soft-404 or changed article. Redirects, status, checked time and a bounded response-prefix hash are recorded; no copyrighted article body is stored in the repository. The workbench only uses a report matching the exact source registry. Without one it shows “not checked,” never a green result. Link checks are point-in-time and must be rerun before relying on references.

## Verification and remaining work

Automated tests cover 50-case citation coverage, exact-message binding, invalid/missing sources, no pre-reveal rendering, blocked-link presentation, export/recovery compatibility, unchanged routing scores, semantic timestamps, redirects, off-publisher/private URL rejection, HTTP errors, challenge pages and response size bounds. The actual React panel is compiled with Next's compiler and rendered in tests. No production reviewer responses are generated or modified for testing.

These are software/provenance tests, not a clinical efficacy result. Before claiming an agent improves care, grade its **actual emitted** differential, action, contraindication checks and source applicability against independently authored rubrics, then measure paired baseline-versus-system results on untouched cases. Do not score this curated support as if the agent produced it. Retrieval failure must never postpone emergency action. A future dynamic source workflow needs separate retrieval-quality, entailment, stale-guideline, conflicting-guideline, prompt-injection, latency and no-worsening evaluations.

For the user's chosen launch model, see [Utah autonomous-care readiness](research/UTAH_AUTONOMOUS_CARE_READINESS_2026-09-10.md). This workbench does not activate autonomous clinical care or billing.

Verified September 10: 46 workbench tests, 65 core unit tests, 20 Mastra/agent tests and 18 quality-audit tests passed (149 total). JavaScript syntax checks, root TypeScript checking and the workbench production build passed. Provider-backed clinical evaluations were not run and no new efficacy result is claimed. No reviewer answers were entered in the live UI for testing.
