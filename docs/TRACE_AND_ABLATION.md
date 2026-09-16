# Trace and component-ablation review

## Executive finding

The disposition authority is deliberately **less agentic than its vocabulary
suggests**. The production-shaped Mastra disposition path is a deterministic
workflow composed from typed tools and code steps. A separate bounded Mastra
`Agent` prepares a clinician-only handoff after the safety floor is clear; it
cannot lower a route, send patient guidance, write a chart, or place an order.
Live-model clinical quality remains unevaluated.

The component ablation supplies a causal software result available from the
current synthetic data: removing the emergency supervisor and hard gate misses
every case carrying an authored same-day or emergency label in both the 50-case
development slice and the 38-case red-team corpus. Removing retrieval does not
change those authored escalations; it conservatively removes self-care utility. This is
in-sample engineering evidence, not clinical-performance evidence.

## Executed topology

```text
inbound schema
    ├── red-flag-checklist ──┐
    └── intent-history ──────┤  parallel
                             ▼
                   hard-escalation-gate
                             ▼
                    disposition-router
                             ▼
                  typed disposition result
```

The hard gate is the sole authority that can produce `SAME_DAY_IN_PERSON` or
`EMERGENCY_NOW`. Once set, `locked` and `overrideBlocked` must both be true and residual routing
returns without consulting retrieved context. A safety-branch failure is itself
an `EMERGENCY_NOW` fallback. An intent or retrieval failure becomes asynchronous physician review.

## Trace contract

### Actual Mastra trace

The persisted trace contains one `workflow_run`, one `workflow_parallel`, and
four `workflow_step` spans. Calls set `hideInput` and `hideOutput`; a canary test
reads the trace back through the configured DuckDB observability store and
proves every span payload is null while topology, status, duration, tags, and
branch structure remain available.

This is privacy-minimizing observability, not a complete production audit trail.
A clinical system still needs separately governed, access-controlled evidence
linkage, retention/deletion, outcome linkage, clock guarantees, and a tamper-
evident event record. Raw clinical text must not be reintroduced merely to make
Studio convenient.

### Dependency-light trace

The local mirror now projects step results through an explicit allowlist. It
retains fixed workflow metadata such as disposition, lock state, rule name,
intent, layer, and retrieval source ID. It excludes rationale, directives,
guideline summaries, patient text, and external case IDs. Tests use canaries to
guard both direct leakage and future accidental field expansion.

### What to monitor without PHI

- workflow, rule-set, policy-corpus, and model snapshot versions;
- step status and latency, provider/tool errors, retry and timeout counts;
- disposition and escalation-completion aggregates with small-cell suppression;
- retrieval source IDs, versions, authorization decision, and citation outcome;
- invariant failures, conservative fallbacks, overrides, and incident linkage;
- token and cost totals for any future generative lane.

Do not put patient IDs, free text, exact timestamps, or unbounded labels into
metrics. Trace IDs are operational correlation identifiers, not patient keys.

## Deterministic ablation results

Run with `npm run ablate`. The machine-readable artifact is
`outputs/component-ablation-v1.json`.

### Fifty-case clinician development proposal

| Variant | Exact agreement | Any-escalation recall | Emergency recall | Weighted cost | Emergency -> same day |
|---|---:|---:|---:|---:|---:|
| Full workflow | 1.000 | 1.000 | 1.000 | 0 | 0 |
| Safety lane only | 0.880 | 1.000 | 1.000 | 6 | 0 |
| Retrieval unavailable | 0.880 | 1.000 | 1.000 | 6 | 0 |
| Intent lane, no safety gate | 0.560 | 0.000 | 0.000 | 500 | 0 |
| Always asynchronous | 0.440 | 0.000 | 0.000 | 506 | 0 |
| Always same day | 0.100 | 1.000 | 0.000 | 266 | 17 |
| Always emergency | 0.340 | 1.000 | 1.000 | 100 | 0 |

### Thirty-eight-case authored red team

| Variant | Exact agreement | Any-escalation recall | Emergency recall | Weighted cost | Emergency -> same day |
|---|---:|---:|---:|---:|---:|
| Full workflow | 1.000 | 1.000 | 1.000 | 0 | 0 |
| Safety lane only | 0.974 | 1.000 | 1.000 | 1 | 0 |
| Retrieval unavailable | 0.974 | 1.000 | 1.000 | 1 | 0 |
| Intent lane, no safety gate | 0.421 | 0.000 | 0.000 | 535 | 0 |
| Always asynchronous | 0.395 | 0.000 | 0.000 | 531 | 0 |
| Always same day | 0.053 | 1.000 | 0.000 | 273 | 20 |
| Always emergency | 0.526 | 1.000 | 1.000 | 53 | 0 |

### Interpretation

The safety lane is necessary on this corpus; the residual lane supplies routing
specificity and limited self-care utility. Retrieval is not a safety dependency
and fails conservatively. The always-emergency and always-same-day baselines
confirm that any-escalation recall alone is insufficient: workload, emergency
delay, destination correctness, and completed
escalation must be co-primary constraints.

Do not infer component effectiveness from these point estimates. Rules were
written with the same cases in view, the red team is authored, the labels are an
unattested development proposal, and no patient/episode-independent holdout
exists.

## Inversion: how to make this system fail

1. Optimize legacy aggregate accuracy and hide an emergency-to-same-day delay.
2. Let a generative history agent continue interviewing after a same-day or emergency signal.
3. Allow retrieved prose, similarity score, or an LLM judge to change the route.
4. Persist raw traces for debugging and treat redaction as authorization.
5. Reuse patients or episodes across prompt development and evaluation.
6. Let one provider judge itself or select a preferred model without estimating uncertainty in the paired comparison.
7. Retry model/tool failures without an end-to-end latency and cost budget.
8. Add Kubernetes, RAG, or a clinician interface and mistake infrastructure for
   clinical validity.
9. Show physicians confident prose without provenance, uncertainty, or the
   action they remain accountable for.
10. Deploy after the regression suite saturates instead of creating an untouched,
    representative external evaluation.

The architecture should be reviewed by asking which of these failures a change
makes easier, not only what feature it adds.

## Mastra capability map and admission decision

| Component | Current use | Highest-value next use | Admission condition |
|---|---|---|---|
| Workflows | Typed parallel safety and intent lanes | Suspend/resume for clinician review | Encrypted/tokenized state, stale/duplicate resume tests, same-day/emergency path never waits |
| Tools | Read-only, strict, idempotent, closed-world | Authorized record and guideline retrieval | Server-side FGA, tenant tests, source/version metadata, no mutation |
| Traces | Local DuckDB topology with hidden payloads | PHI-safe operational and outcome linkage | Data-flow review, RBAC, retention, tamper evidence, incident exercise |
| Scorers | Deterministic disposition and gate checks | Trajectory, retrieval, and clinician-facing quality scorers | Cross-provider judges only for subjective criteria; clinician calibration |
| Datasets/experiments | `runEvals` regression run | Versioned patient/episode holdout and paired experiments | Immutable split, schema, version pin, access controls, no raw PHI in dev |
| Model router | Preregistered, not run | GPT/Claude synthesis comparison | Locked disposition, identical tools/context, repeats, blinded review, cost caps |
| Cost controls | No model calls | Mastra token-cost processor plus provider/account hard limits | Preflight estimate, per-run cap, stop rule, usage reconciliation |
| RAG/vector | Five-policy exact lookup | Hybrid longitudinal/guideline retrieval | Recall, entailment, freshness, injection, tenancy, and non-inferiority gates |
| Studio | Local synthetic inspection | Clinician/research review surface | Authenticated roles; synthetic or approved de-identified data only |
| Kubernetes | Absent | Controlled private-cloud boundary | Owned SLO, threat model, least privilege, failover, rollback, load evidence |

Mastra's current guidance supports versioned datasets and comparable experiments,
code-based and model-based scorers, searchable traces, sensitive-data filtering,
and cost controls. Those capabilities should be adopted in this order because
each expands the evidence surface without moving disposition authority into a
model.

Sources: [Mastra experiments](https://mastra.ai/blog/mastra-experiments),
[Mastra datasets](https://mastra.ai/blog/introducing-datasets),
[Mastra sensitive-data filtering](https://mastra.ai/blog/introducing-sensitive-data-redaction),
and [Mastra platform capability index](https://mastra.ai/).
