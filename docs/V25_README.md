# V25: lean disposition candidate

The default [candidate GUI](http://localhost:4120/candidate) now uses
`evidence-graph/v25`, mode `gates-release`, release policy `gates-release/v1`.
This is a simplification of the existing Mastra workflow, not another app or a
claim to reproduce Counsel's private implementation. See the [plan](V25_PLAN.md).

**Evaluation update, 15 September:** the frozen cohort now has all 50 first
attempts: 27 complete, 21/27 agreement among completed non-null references.
See [the complete report](V25_COMPLETED_REPORT.md) for every failure, denominator,
latency and cost. [The subsequent offline ablation](DISPOSITION_SIMPLIFICATION_2026-09-15.md)
is separate and has not changed this live contract.

## Runtime and guarantee changes

Parallel safety and context → context-driven retrieval → frozen selected packet
→ one disposition producer → deterministic release checks → complete or clinician
review required. Safety instructions can publish while evidence/generation continue.
Default configured roles remain Haiku safety/context and Opus disposition. Models
are configurable; no model substitution was made in this pass.

| Property | Retained full-review `hybrid` | Default `gates-release` |
|---|---|---|
| Graph identity | v24 | v25; separate prompt/release identity |
| Live judge | Required for completion | None |
| Repair / judge-triggered retrieval | Existing bounded path | None |
| Complete-release tag | `model_reviewed` | `gates_only` |
| Independent review | Stored exact-draft model verdict | `not_assessed` |
| Deterministic validation | Existing full-review contract | Shared original checks, without judge-dependent exceptions |
| Missing evidence | Existing hybrid handling | Withhold explanation; preserve issued care |
| Lower route than issued care | Existing bound correction protocol | Withhold; no silent retraction |
| Clinical accuracy established | No | No |

`no-judge` still skips the judge **and withholds**. It has not been redefined as
a release mode. `no-retrieval` also retains its prior ablation behavior. The
incumbent `/` routing implementation remains unchanged.

Completion requires an unaborted, valid draft, a nonempty integrity-valid selected
packet, and no reduction of issued emergency/in-person care. EMS-to-ED reduction
also counts, even within the emergency bin. An empty packet cannot be converted
into a completed assessment by labelling it fail-closed. Already-issued care
survives withholding; no lower-risk answer is invented.

Quotation identity, source hash/currency checks, routing-field consistency and
bounded transport wording are mechanical checks, **not semantic claim support**.
The browser and offline scorer recompute the same hash-bound release checks.
These prove record consistency, not server authenticity or clinical truth.
No independent-review or reviewed-transport metadata is manufactured.

One genuine failed producer attempt can still receive the existing bounded
recovery attempt. There is no speculative model race or short new timeout.
Five operational routes, the evidence layer, logs and integration stubs remain.

## Physician-reference scoring

The unchanged `data/evaluation/physician-system-reference-v2.json` is a physician
development reference, not a held-out validation set. Original CSV labels and
reference answers do not enter model prompts or retrieval.

- Score exact operational-route agreement only when `acceptedRoutes` is a list.
- C25 remains a qualified disagreement with `acceptedRoutes: null`: excluded
  from the 49-case agreement denominator, retained in all-case reporting.
- Keep first attempts, failures, unattempted cases, repeated runs, early advice,
  final outcomes, latency and cost visible. A crash before graph metadata is
  still an incomplete attempt; missing identity cannot earn completion credit.
- Report above/below-reference routing as disagreement, not adjudicated harm.
  Unsafe advice and unsupported claims remain `not_assessed` without an actual
  assessment. Source presence cannot turn them into a pass.
- Never pool gates-only and model-reviewed release identities, or register v25
  as a historical full-review contract. Scoring does not regrade old judge logic.

At the initial implementation of this contract no paid cohort had been run.
That historical limitation is superseded by the completed report linked above;
the study still does not establish clinical readiness or held-out generalization.

## Run and score

Use the existing corpus and database owner; do not rebuild embeddings for this
change. See the main [README](../README.md) for fresh-checkout corpus setup.

```bash
npm run build
npm run start --workspace @counselcodex/evaluation
# Open http://localhost:4120/candidate (live requests use provider APIs)

npm run test:gates
npm run lint
npm run typecheck
npm test
npm run review:test
npm run build:verify

# Offline only. Use an actual retained run's promptHash and a NEW output path.
npm run cohort:score -- PROMPT_HASH NEW_OUTPUT_DIRECTORY RUNTIME_DIRECTORY
```

`RUNTIME_DIRECTORY` defaults to `apps/evaluation/.local/clinical-evidence-graph-v1`.
The scorer makes no model calls and creates a new immutable report with selected
runs, reference hash, release identity and scorer dependency hashes. Do not score
authored fixtures as clinical performance.

## Verification completed — $0 paid spend

773 root tests passed, 48 skipped; 171 GUI tests passed. Type-checking, lint,
the Next candidate build and separate incumbent native Mastra build passed.
The 13 gates tests cover mode separation, both parallel completion orders,
missing/corrupt evidence, cancellation, issued-care preservation, transport
consistency, forged release metadata, stream admission and cohort accounting.

Two six-attempt browser passes exercised the actual built GUI, HTTP handler and
Mastra workflow with **authored provider/retrieval fixtures**. These were not live
LLM runs. The harness binds only localhost:4121, intercepts or rejects every write,
uses isolated temporary journals and displays a software-test banner. The normal
GUI on 4120 never uses this harness. An intentionally fixed 1.8-second producer
delay means the timings below are integration observations, not speed evidence.

| Final browser pass | Visible outcome | Server elapsed | Run ID |
|---|---|---|---|
| C50 | Priority async | 2.113 s | `9ffd1c59-6557-425e-b90f-88e4eed6f736` |
| C02 | Emergency / 911 | 2.036 s | `c5b471ad-3732-4038-b5d8-686a2a204614` |
| C04 | In-person today | 2.032 s | `9a6482b2-8d27-4069-a16b-685909bf5b58` |
| C04 follow-up | Original message retained; in-person care preserved | 2.029 s | `034705db-78aa-434e-9e38-35038e11559c` |
| C50, empty evidence | Clinician review required; no complete answer | 2.006 s | `4561a633-dfd3-48b1-a9c1-045d14648756` |
| C02, empty evidence | 911 remains prominent; explanation withheld | 2.017 s | `02c1a52d-1f4f-47b3-a4fb-547c9b6ba180` |

The follow-up was: “I am arranging an in-person appointment today.” Final-pass
journals are in the local temporary directory `counsel-v25-gui-fixtures-pHp6Vn`;
console log `/tmp/counsel-v25-gui-final.log`. Reproduce the software-only harness
with `node --experimental-strip-types tests/fixtures/gates-gui-proxy.ts --fixture-only`
while the production GUI runs on 4120, then use 4121/candidate in the listed order.

The first pass found misleading disclosure text suggesting clinical correctness
was separately reviewed. It was corrected and the six cases repeated. The first
pass had the same four completions and two intended withholding outcomes. Its
retained run IDs, in the same order, are:

`9e8b59fd-daf4-4007-a38e-a5825eeb0be6` (2.039 s),
`8991a0a2-f01d-4bc6-9fff-4fe15d99684e` (2.040 s),
`7afcf51a-088d-4e82-bf9d-5ebe5f105697` (2.023 s),
`05b7e882-bdb1-4411-8b32-331cba88a166` (2.025 s),
`7f3c36a1-49ce-49ee-8601-2dd97c0060aa` (2.016 s),
`6136bd7c-9918-4061-99b5-f7bc589f67e2` (2.015 s).

First-pass journals remain in `counsel-v25-gui-fixtures-c2LkMw`, with console log
`/tmp/counsel-v25-gui.log`. Both passes are software checks, never physician scores.

## Residual risk and next decision

This removes a measured architectural bottleneck, but not the need to measure
the new system. Deterministic checks miss semantic contradictions, unsupported
claims and context errors. A wrong early escalation can cause withholding; it
is not made correct by preserving it. The stricter no-judge onset check may
also withhold defensible answers. Those are comparison targets, not hidden wins.

Next, freeze the release identity and compare complete first attempts against
the physician reference and retained hybrid results. Inspect every early/final
disagreement and high-risk failure; measure time to actionable instruction,
final latency, claim support, inappropriate escalation and cost. Test novel
negated, historical, third-party and conditional trigger cases separately.
Use an independent offline judge only as a measured aid to physician review,
not as the reference or a way to erase failures. Do not switch all roles to
smaller models until the simplified path's own contribution is isolated.

Non-goals in this pass: paid model/embedding work, gold/history edits, a new
application, new supervisors, deck work, or a production-readiness claim.
