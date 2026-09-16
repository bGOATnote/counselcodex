# Reproduce the workflow-aware research

This is a separate, synthetic research study. It does not register a new route in the live application or change the selected `/stripped` demonstration. Read the [registered protocol](WORKFLOW_AWARE_RESEARCH_PLAN_2026-09-16.md) before interpreting its outputs.

## Offline verification and scoring

Use a supported Node version from the repository's `engines` declaration. No provider key, Ollama server, database or external telemetry service is required for the completed-study replay:

```bash
npm ci
MASTRA_TELEMETRY_DISABLED=true node --experimental-strip-types \
  scripts/score-workflow-aware.ts \
  outputs/workflow-aware-disposition-2026-09-16/study \
  --reference-freeze outputs/workflow-aware-disposition-2026-09-16/reference-freeze.json
```

The scorer refuses an incomplete generation schedule. Before opening clinical references it verifies the full generation freeze, original message-only inputs, prompts, requests, raw and parsed outputs, accounting events and local-model lifecycle. It reconstructs provider payloads and parses the saved raw response again. A missing file, changed source, malformed output or mismatched hash cannot silently disappear from a favorable denominator.

The generation runtime and dependency lock are archived in the study manifest. Completed-study verification can run after dependency maintenance; it verifies the archived dependency artifact without claiming that the new runtime performed the original calls. Resuming generation has a stricter rule: the current Node/runtime and dependency lock must still match the frozen study. Do not edit the archived lock or regenerate historical output to make a verification pass.

Scoring creates its derived JSON artifacts once. Running it again verifies that the derived objects reproduce exactly and refuses to replace a different existing score. Original physician v3 labels and proposed challenge targets remain separate from the model inputs. The CSV is not a clinical scoring target for this study.

## Artifact map

| Location under `outputs/workflow-aware-disposition-2026-09-16/` | Purpose |
|---|---|
| `messages.json` | Exactly 98 ID/message objects; no disposition labels. IDs identify saved artifacts and are excluded from provider content. |
| `study-config.json`, `budget.json`, `funding-receipt.json` | Prespecified schedule, operational limits and authorization accounting. |
| `reference-freeze.json` | Reference identities and provenance, recorded before generation; used by offline scoring only. |
| `registration.json` | Supplementary bindings for the study plan, scorer, reference freeze and generation plan. |
| `retrieval/` | Embedding requests/results, lexical/hybrid comparison and frozen source packets. |
| `study/manifest.json`, `study/plan-complete.json` | Source, runtime, input and request identities plus all planned jobs. |
| `study/preflight-*.json` | Read-only provider/local-model availability and identity checks. |
| `study/generation-complete.json` | Final generation freeze required before clinical scoring. |
| `study/scorecard-workflow-aware.json` | Separate familiar-reference and AI-authored-challenge analyses, repetitions and exact paired changes. |
| `study/operations-workflow-aware.json` | Protocol validity, inference latency and repeated execution summaries. |
| `study/budget-workflow-aware.json` | Neutral usage/accounting report; excluded from presentation slides. |
| `study/clinical-review-worksheet-workflow-aware.json` | Blank review fields with exact saved inputs and outputs; no manufactured clinician attestations. |

The top-level study registration supplements, rather than replaces, the original pre-generation reference and request freezes. Consult their recorded timestamps when auditing the sequence.

## Offline inspection aids

```bash
npm run research:review:verify
npm run research:retrieval:verify
```

The [single-file case viewer](../publication/workflow-study-review/README.md) compares all saved model/arm/repetition results with their own contemporary controls. Download its HTML and open it without a server or network access. Its verifier recomputes the completed scorecard before checking exact publication bytes.

The separate [candidate-discovery audit](RETRIEVAL_CANDIDATE_AUDIT_2026-09-16.md) reuses frozen embeddings and cards, reads no clinical targets, and makes no inference calls. Its verifier refuses absent or changed outputs. The 686 relevance/applicability pairs remain unreviewed; broader candidate discovery is not a clinical improvement.

## Generation is an explicit separate action

The CLI separates `plan`, `preflight`, `generate`, `unload`, `freeze` and `status`. Planning and status do not dispatch disposition calls. Provider keys are read only for the relevant provider operation and never serialized in requests or traces.

This runner deliberately enforces the September 16 session deadline in code. A later authorized experiment needs a **separately versioned runner**, new output directory, explicit deadline and reconciled budget, then its own frozen inputs and references. Changing this archived runner would invalidate its source binding. Do not reuse the completed study as a mutable workspace. Within an authorized version, a plan requires explicit paths:

```text
workflow-aware-study.ts plan --messages <message-only-json> \
  --config <study-config> --budget <budget-json> \
  --evidence <frozen-evidence-packets> --out <new-study-directory>
```

`generate` requires a model selection and accepts a bounded `--max-calls`. It records a durable reservation before dispatch and settles usage afterward. An uncertain dispatch is not automatically retried. Unknown accounting, identity drift, an expired deadline or an incomplete reservation stops further work. Failed requests remain evidence; there is no repair model or substitute self-care answer.

The hosted configuration uses the observed `claude-fable-5-1` alias with the original low-effort settings. That alias may not be available to another account. The local configuration uses an already installed Nemotron 3 Nano Q5 model with a pinned artifact digest, Ollama version and native renderer. The sanitized [provenance file](../data/research/workflow-aware-v1/nano-serving-provenance.json) records what was verified and what was not. The research does not claim a verified upstream checkpoint revision or equivalent inference settings across the two models.

Nano workers using the same budget ledger share a local execution lock. Separate ledgers do not provide machine-wide mutual exclusion; an operator must prevent independent studies from using the same local server concurrently. Unload the model only after its worker completes, record the lifecycle receipt, and freeze the study only after every planned job has settled. Source inspection verified native system-message rendering; literal `/think` and `/no_think` controls are rejected before planning because that renderer treats them as mode overrides.

## Focused engineering checks

```bash
npm run test:workflow-research
npm run typecheck
npm run lint
```

The tests cover message/prompt boundaries, source applicability and missing-evidence behavior, vector/request binding, raw-result integrity, durable accounting, deadline and single-call enforcement, local-model identity, archival replay, and scoring separation. These are engineering checks. They cannot substitute for independent clinical reference review, representative evaluation or observed patient outcomes.
