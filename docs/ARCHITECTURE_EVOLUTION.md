# Architecture evolution: evidence before infrastructure

## Executive decision

Counsel's public materials support four technology directions: RAG and search,
vector-capable storage, Next.js/Tailwind product surfaces, and private-cloud
Kubernetes. They do not justify adding all four to a disposition take-home.

The V0 keeps its deterministic routing path unchanged. A first controlled
increment now adds a **read-only retrieval lane and a real Mastra Agent for
clinician-only intake synthesis**. It is exercised with deterministic fixtures;
no frontier-model clinical result is claimed. The next evidence step is the
preregistered cross-provider comparison on a frozen clinician-rated sample. A
read-only Tailwind evaluation workbench is included because it directly helps
the assignment's case audit; a clinician care cockpit still requires workflow
and usability research. Kubernetes should follow a real PHI, tenancy,
reliability, and scale envelope.

This is the project's architecture admission rule:

> A component enters the clinical path only after a paired evaluation shows
> useful improvement and every safety invariant remains non-inferior.

## Confirmed public signals

Reviewed September 5, 2026.

| Signal | Public evidence | Implication for this project |
|---|---|---|
| TypeScript product stack | Counsel's current full-stack role lists React, TypeScript, Next.js, React Native, Postgres/Supabase, Tailwind, and AWS | Keep the agent and eventual product surface in one TypeScript system |
| Retrieval is a platform primitive | Counsel's current backend role names an agentic retrieval harness spanning structured and unstructured health data with strict permission and audit guarantees | Treat retrieval as governed infrastructure, not a prompt helper |
| RAG supports physicians and safety agents | Counsel's RAG article describes longitudinal records, validated external sources, prior interactions, and parallel safeguards | Retrieve patient context and evidence with provenance; preserve an independent safety path |
| Mastra coordinates the care workflow | The Counsel/Mastra case study describes history agents, parallel emergency supervisors, special-purpose routing, RAG tools, record search, and a physician cockpit | Use workflows for deterministic control and agents only where open-ended synthesis adds value |
| Private-cloud Kubernetes hosts the production system | The Counsel/Mastra case study states that Mastra and application servers run in a private-cloud Kubernetes cluster | Design portable services and observability now; do not imply production readiness with a demo manifest |

Sources: [current full-stack role](https://jobs.ashbyhq.com/counsel/12cf0cf3-73db-49d4-84a0-dd8b280e6337/),
[current backend role](https://jobs.ashbyhq.com/counsel/cc81ba06-2dd8-408f-8aba-833f332e11cd),
[Counsel RAG](https://www.counselhealth.com/blog/rag-ai-framework-enhancing-patient-care),
and the [Counsel/Mastra case study](https://mastra.ai/customers/counsel-health).

## Technology admission ledger

| Technology | Decision | Benefit | New failure mode | Required admission evidence |
|---|---|---|---|---|
| RAG + vector search | Next controlled increment | Patient-specific context, current guidance, source links, less clinician search time | Stale or irrelevant retrieval, prompt injection, cross-tenant leakage, missing critical context | Retrieval recall by clinical concept; citation entailment; freshness; permission isolation; latency; no degradation in urgent routing |
| Tailwind evaluation workbench | Included, read-only | Scannable case disagreement, V0 trace, evidence boundary, and scale plan | False certainty or conflating development fit with performance | Typed static build, case-join tests, visible claim boundary, browser and accessibility checks |
| Tailwind care cockpit | After retrieval and workflow research | Physician-facing provenance, uncertainty, and action controls | Alert fatigue, accidental action, accessibility regression | Task completion time, escalation recognition, edit burden, error recovery, WCAG checks, keyboard-only tests, clinician usability study |
| Kubernetes | Production deployment boundary | Isolation, controlled rollout, autoscaling, recovery, unified service operations | Configuration drift, secret leakage, excess privilege, silent partial failure, operational overhead | Threat model, tenant isolation, workload identity, network policy, backup/restore, failover, rollback, SLO/load test, incident exercise |
| GPT/Claude through Mastra | Controlled bakeoff | Provider-neutral experiments, model replacement, shared tools/traces/scorers | Model drift, different tool behavior, self-judging bias, cost and latency variance | Frozen prompt/tool contract, pinned snapshots, repeated blinded trials, cross-provider judge, clinician review, paired uncertainty |

## Retrieval and agent contract already implemented

The current `guidelineRetriever` remains an exact lookup over five immutable
demo policies. Vector search would add no useful recall at this corpus size.
The returned object now declares:

- `authority: context_only`
- `canChangeDisposition: false`
- `canDowngradeUrgency: false`
- a schema version, corpus version, retrieval mode, and source ID
- mandatory provenance

The urgent path returns no guideline context, and the patient directive comes
from the deterministic emergency policy rather than retrieved text. A regression
test injects a hostile retrieval instruction and verifies that the locked urgent
state survives unchanged.

For gate-clear asynchronous cases, `clinicalIntakeAgent` calls the same read-only
tool and returns a schema-limited physician handoff. A deterministic postcondition
requires exactly one successful tool result and exact equality between every
cited source ID and the retrieved source ID. Missing tool use, malformed output,
or unsupported citations close to a same-day physician handoff. The agent has no
memory or mutating tools and cannot generate a patient-facing message.

The workflow enforces that envelope at both retrieval and residual-routing
boundaries. Missing or altered authority metadata is discarded and the message
degrades to asynchronous physician review; it cannot enter self-care routing.

This contract creates a safe replacement seam. A vector implementation may
replace exact lookup only if it preserves the output schema and passes the
admission tests below.

## Proposed RAG and vector design

### Separate corpora and authorities

1. Store approved clinical guidance separately from longitudinal patient data.
2. Give every guidance chunk a source, version, effective date, review owner,
   population, jurisdiction, and supersession state.
3. Keep patient-document authorization at query time. Never rely on metadata
   filtering inside a model prompt for tenant separation.
4. Retrieve structured facts directly when an exact field or code exists. Use
   vector or hybrid search for unstructured notes and guidance.
5. Present retrieval as evidence with uncertainty. Do not convert similarity
   score into clinical confidence.

### Retrieval evaluation

- Build clinician-authored queries with decision-changing relevant passages and
  hard negatives, including superseded guidance and near-duplicate patients.
- Measure recall at K before generation, then citation precision, entailment,
  completeness, freshness, and unsupported-claim rate after generation.
- Slice results by condition, document age, language, record length, site,
  missingness, and access permissions.
- Test prompt injection inside retrieved documents, adversarial metadata,
  duplicate chunks, unavailable stores, embedding drift, and reranker failure.
- On retrieval failure, preserve disposition and route the context task to a
  clinician. Never fall back to unsourced model memory for a clinical claim.

Mastra provides typed chunking, embedding, vector-store, metadata-filtering,
reranking, tracing, and evaluation primitives. A production Counsel-aligned
choice would likely use Postgres with pgvector first because the public stack
already includes Postgres/Supabase. That remains a hypothesis until the corpus,
latency target, tenancy model, and operational ownership are known.

The first offline governed-hybrid candidate is now rejected. It saturated the
visible 20-query development set, then achieved only 0.588 Recall@3 and 0.714
abstention accuracy on its registered 24-query temporal holdout. It remains out
of the workflow and will not be tuned against the revealed holdout. A dense
embedding and reranker configuration must be registered before a separately
authored v2 is unsealed; see
[`FROZEN_HOLDOUT_EVIDENCE.md`](FROZEN_HOLDOUT_EVIDENCE.md).

Source: [Mastra RAG pipeline](https://mastra.ai/rag-pipeline).

## Tailwind surfaces

Tailwind belongs in a product surface, not in the routing algorithm. The
included physician review instrument collects an independent clinical judgment
before exposing the supplied label, V0 decision, or unattested proposal. It
persists only in the local browser with read-back-verified local and IndexedDB
checkpoints, rejects stale and cross-tab-conflicting revisions, exports an
integrity-hashed audit bundle, and has no clinical side
effects or server mutation API. Mastra Studio remains
the engineering surface for the actual graph, inputs, outputs, and traces.

The first custom interface should be clinician-facing. It should show the
original message, locked disposition, red-flag evidence, retrieved sources with
dates, missing decision-changing facts, and the accountable next action. It
should distinguish AI text from clinician edits and require explicit approval
for any side effect. The usability study should measure whether this surface
reduces review time without increasing missed warnings, alert fatigue, or
automation bias.

## Kubernetes boundary

A Kubernetes manifest in this repository would demonstrate syntax, not clinical
or operational readiness. The current V0 has no PHI, identity provider, tenant
model, service-level objective, or measured load. Shipping a manifest would risk
communicating a maturity level the artifact has not earned.

Before Kubernetes, define the service contract and workload envelope. Then test
private networking, default-deny egress, workload identity, least-privilege
service accounts, managed secrets, encryption and key rotation, admission
policies, signed images/SBOMs, pod disruption, autoscaling, multi-zone recovery,
audit export, and rollback. Run failure exercises that kill the retrieval store,
model provider, observability backend, and one availability zone while verifying
that the deterministic urgent path remains available or fails to immediate human
review.

## Why Mastra remains the right orchestration layer

Mastra gives this project one TypeScript graph for deterministic workflow steps,
provider-neutral agents, tools, schemas, local Studio inspection, traces,
versioned evals, and model experiments. It also keeps the model outside the
disposition authority while allowing GPT and Claude candidates to share the same
context and tool contract.

Provider neutrality permits repeated comparisons as model quality, latency,
pricing and behavior change. The frozen clinical task, safety constraints,
provenance requirements and evaluation record support those comparisons.

## Promotion sequence

1. Freeze the current routing protocol and sample an untouched patient-and-
   episode holdout with a calibrated clinical reference process.
2. Add retrieval offline. Prove relevance, provenance, permission isolation, and
   urgent-route non-interference.
3. Run the blinded GPT/Claude experiment in `MODEL_BAKEOFF.md` on clinician-facing
   synthesis only.
4. Prototype the Tailwind cockpit and evaluate real clinician work under load.
5. Run shadow mode with every result reviewed and predefined stop rules.
6. Introduce Kubernetes only for a defined controlled environment with an owned
   SLO, incident process, and rollback path.

No step inherits permission from the prior step. Each requires its own clinical,
safety, privacy, security, and operational review.
