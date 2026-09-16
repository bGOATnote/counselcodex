# Security and safety review — updated 2026-09-07

## Scope and threat model

Review scope: synthetic-message ingestion, normalization, parallel safety and
intent branches, hard-gate routing, Mastra schemas/tools/workflow, local storage,
traces, CI, dependencies, and evaluation claims. Threats include dangerous
under-triage, unsafe overrides, malformed/adversarial text, branch/provider
failure, prompt injection in the clinical-intake agent, PHI/credential leakage, unauthorized
clinical side effects, cross-tenant access, stale policy, and misleading metrics.

No real patient data, executed model API, chart system, mutating clinical tool, external
telemetry exporter, or production identity provider is in scope. Their absence is
a safety boundary, not a completed production control.

## Findings

1. **Critical — raw clinical text in step output/trace (resolved for this
   artifact).** The former intent branch emitted `facts.originalMessage`, and the
   gate copied it forward. Outputs now contain no message or external case ID;
   programmatic Mastra runs hide trace input/output, the local exporter uses
   full sensitive-field redaction, and durable raw workflow snapshot persistence
   is disabled. Active executions still hold input transiently in process memory.
   Canary tests cover both runtimes. Residual:
   key-name redaction cannot discover PHI embedded in arbitrary unlabelled text;
   only approved local/synthetic use is permitted.
   Evidence: [`src/mastra/index.ts`](../src/mastra/index.ts#L31),
   [`tests/workflow.test.mjs`](../tests/workflow.test.mjs#L60), and
   [`tests/mastra.test.ts`](../tests/mastra.test.ts#L38).
2. **Critical — example-only Mastra adapter could not be validated (resolved).**
   The declaration-only file was replaced with executable typed tools, workflow,
   schemas, storage, observability, scorers, smoke tests, and a Studio surface.
   Evidence: [`src/mastra/workflows/disposition-workflow.ts`](../src/mastra/workflows/disposition-workflow.ts#L17)
   and [`tests/mastra.test.ts`](../tests/mastra.test.ts#L14).
3. **High — parallel branch failure could abort without a disposition
   (resolved).** The safety branch catches operational failure and produces a
   locked `safety_system_failure` escalation. Intent failure deterministically
   falls back to asynchronous human review. Synthetic fault injection verifies
   both paths.
   Evidence: [`src/domain/branches.mjs`](../src/domain/branches.mjs#L4) and
   [`scripts/red-team.mjs`](../scripts/red-team.mjs#L28).
4. **High — urgent decision integrity relied on routing convention (resolved).**
   Postconditions now require urgent, locked, override-blocked, and hard-gate
   origin to agree. Corrupted states throw, and a binary Mastra gate scores the
   invariant.
   Evidence: [`src/domain/routing.mjs`](../src/domain/routing.mjs#L84) and
   [`src/mastra/scorers/disposition.ts`](../src/mastra/scorers/disposition.ts#L14).
5. **High — text normalization and negation weaknesses (partially resolved).**
   NFKC, curly punctuation, zero-width/format characters, control characters,
   whitespace, empty input, and a 12,000-character boundary are covered. A narrow
   negation heuristic reduces obvious false positives. It is not a clinical NLP
   solution; temporality, experiencer, uncertainty, multilingual input, typos,
   speech-to-text artifacts, and complex negation remain unvalidated.
   Evidence: [`src/domain/rules.mjs`](../src/domain/rules.mjs#L56) and
   [`data/red_team_cases.jsonl`](../data/red_team_cases.jsonl).
6. **High — evaluation leakage/overfitting (open; blocks clinical claims).** The
   rules were authored with the 50 cases visible, so 50/50 is in-sample. The red
   team is also authored. A frozen external hold-out, a calibrated clinical
   reference process, representative subgroups, human factors, and prospective
   shadow mode are required.
7. **High — clinical coverage is intentionally incomplete (open; blocks clinical
   use).** Added sentinels improve regression coverage for stroke, respiratory
   distress, overdose, postpartum hemorrhage, ectopic rupture, pulmonary
   embolism, sepsis, neonatal fever, and prolonged seizure, but regex lists cannot
   establish clinical completeness. Intended use, evidence ownership, policy
   update process, and specialist validation are absent.
8. **High — production identity, privacy, and operations are absent (open; blocks
   PHI).** Local storage/redaction/cardinality controls are configured. Production
   authentication/RBAC, tenant isolation, consent/legal basis, encryption/key
   management, retention/deletion, audit review, vendor agreements, backup/
   restore, disaster recovery, alerting, and incident response are not.
9. **High — future side-effect tools could turn classification into care delivery
   (controlled by absence).** Current tools declare read-only, non-destructive,
   idempotent, closed-world MCP semantics. Orders, refills, chart updates,
   messages, scheduling, or dispatch must require server-side authorization and
   explicit approval; an agent prompt cannot confer permission.
10. **Medium — supply-chain/runtime drift (baseline resolved).** Runtime and
    Mastra packages are exact-pinned, the lockfile is checked in, CI uses
    `npm ci`, Dependabot is configured, and the reviewed dependency graph reports
    zero known npm vulnerabilities. Continuous provenance, SBOM, signed releases,
    secret scanning, and container/deployment scanning remain release work.
    Evidence: [`package.json`](../package.json), [`package-lock.json`](../package-lock.json),
    and [`.github/dependabot.yml`](../.github/dependabot.yml).
11. **Medium — duplicate Python rules could silently diverge (resolved).** The
    Python CLI now delegates to the authoritative TypeScript workflow, and the
    unused LLM disposition prompt was removed. There is one decision-rule source
    plus a parity-tested Mastra adapter.
    Evidence: [`python/dispo_agent.py`](../python/dispo_agent.py#L34) and
    [`tests/python-compat.test.mjs`](../tests/python-compat.test.mjs).
12. **High — future vector retrieval can introduce stale evidence, prompt
    injection, or cross-tenant leakage (controlled by absence; offline candidate
    rejected).** The current
    retriever performs an immutable exact lookup over five synthetic demo
    policies. Its typed metadata declares context-only authority, mandatory
    provenance, and no permission to change disposition or downgrade urgency.
    A hostile-context regression test verifies the hard gate remains dominant.
    A governed sparse hybrid saturated its visible development set but failed
    the registered temporal holdout at 0.588 Recall@3 and 0.714 abstention, so it
    was not admitted and was not tuned after reveal.
    Before vector retrieval, require server-side authorization, corpus/version
    governance, retrieval and citation evaluation, adversarial-document tests,
    tenant-isolation tests, and a conservative failure path.
    Evidence: [`src/domain/retrieval-contract.mjs`](../src/domain/retrieval-contract.mjs),
   [`tests/architecture.test.mjs`](../tests/architecture.test.mjs), and
   [`docs/ARCHITECTURE_EVOLUTION.md`](ARCHITECTURE_EVOLUTION.md).
13. **High — ordinary-language emergency paraphrases can evade a narrow
    lexicon (one discovered regression resolved; systemic risk open).** A live
    Studio run initially routed “crushing chest pain and trouble breathing” to
    asynchronous review. The ACS rule now recognizes plain-language dyspnea;
    the exact case is locked into unit and red-team regression suites and was
    re-run through Studio to a locked urgent result. This fixes the observed
    phrase, not the open-world recall problem described in findings 6 and 7.
    Evidence: [`src/domain/rules.mjs`](../src/domain/rules.mjs),
    [`data/red_team_cases.jsonl`](../data/red_team_cases.jsonl), and
    [`docs/STUDIO_VERIFICATION.md`](STUDIO_VERIFICATION.md).
14. **High — a model-backed intake agent adds hallucination, prompt-injection,
    and tool-compliance risk (bounded but not clinically validated).** The agent
    runs only after cumulative deterministic screening, has one read-only tool,
    no memory or clinical side effects, and returns a schema-bounded clinician
    handoff. Postconditions require exactly one successful retrieval and an exact
    source-ID match. It cannot lower urgency; a safety concern can only promote
    to immediate clinician review. Model, tool, or schema failure closes to a
    same-day physician handoff. Multi-turn, prompt-injection, missing-tool,
    malformed-output, and one-way-escalation tests use deterministic fixtures.
    Residual: those tests establish orchestration behavior, not open-world
    clinical reasoning, calibration, or provider robustness.
    Evidence: [`src/mastra/agents/clinical-intake-agent.ts`](../src/mastra/agents/clinical-intake-agent.ts),
    [`src/mastra/workflows/clinical-intake-workflow.ts`](../src/mastra/workflows/clinical-intake-workflow.ts),
    and [`scripts/clinical-agent-eval.ts`](../scripts/clinical-agent-eval.ts).
15. **Low — the original three-role adjudication app expanded both scope and
    attack surface (resolved).** Re-reading the assignment showed that the
    candidate is the single clinician-engineer and no third reviewer is
    available. The multi-user roles, state-changing HTTP routes, and local event
    store were removed. The replacement evaluation workbench is a static,
    read-only join over synthetic repository artifacts with no mutation API.
    Evidence: [`docs/EVALUATION_WORKBENCH_SECURITY_REVIEW.md`](EVALUATION_WORKBENCH_SECURITY_REVIEW.md).
16. **High — single unguarded browser checkpoint could crash and strand review
    progress (resolved for the local synthetic artifact).** The former UI wrote
    to one origin-scoped `localStorage` key without exception handling or
    read-back. It now uses versioned revisions, a rotating valid backup, an
    IndexedDB mirror, newest-valid recovery, visible save state, lifecycle
    flushes, monotonic stale-write rejection, cross-tab conflict freeze,
    canonical `localhost` routing, damaged-payload download, and a route error
    boundary. Quota, corruption, mismatch, migration, competing revisions,
    reset, and reload recovery are tested. Residual: browser/profile/device deletion still
    requires a portable JSON export; this is not a PHI-grade persistence layer.
    Evidence: [`apps/evaluation/lib/durable-review-storage.ts`](../apps/evaluation/lib/durable-review-storage.ts)
    and [`docs/EVALUATION_WORKBENCH_SECURITY_REVIEW.md`](EVALUATION_WORKBENCH_SECURITY_REVIEW.md).

## Decision

Suitable for synthetic engineering demonstration and further controlled
evaluation. Not suitable for patient-facing use, PHI, autonomous advice,
clinical record mutation, emergency dispatch, or a medical-performance claim.
Findings 6–9 are release blockers and require institutional clinical, safety,
privacy, security, legal, and human-factors ownership. Finding 12 becomes a
release blocker if retrieval expands beyond the exact local demo-policy lookup.

## References used

- [Mastra workflows](https://mastra.ai/docs/workflows/overview), [tools](https://mastra.ai/docs/agents/using-tools), [observability](https://mastra.ai/docs/observability/overview), [evals](https://mastra.ai/docs/evals/overview), and [Studio](https://mastra.ai/docs/studio/overview).
- [FDA/Health Canada/MHRA Good Machine Learning Practice](https://www.fda.gov/medical-devices/software-medical-device-samd/good-machine-learning-practice-medical-device-development-guiding-principles).
- [FDA Clinical Decision Support Software guidance](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software).
- [NIST AI Risk Management Framework: Generative AI Profile](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence).
- [HHS HIPAA Security Rule summary](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html).
