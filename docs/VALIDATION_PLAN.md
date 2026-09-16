# Validation plan for eventual clinical investigation

This plan is intentionally stricter than a software launch checklist. The
current artifact is limited to synthetic research and must not provide patient
care, automate emergency dispatch, or mutate a clinical record.

## Required gates

1. **Intended use and hazard analysis:** define users, setting, supported
   populations, exclusions, disposition semantics, escalation ownership, and
   foreseeable misuse. Maintain a hazard log linking each severe harm to a
   control, verification, residual risk, and owner.
2. **Requirements traceability:** link every clinical and software requirement
   to source/version, implementation, unit test, system test, and change-control
   record. Expired or withdrawn guidance must be detectable.
3. **Data and reference process:** representative independent data; patient- and
   episode-level separation; calibrated clinician overlap on a sampled subset;
   label uncertainty and subgroup coverage documented. Synthetic examples alone
   are inadequate.
4. **Software verification:** schemas, branch isolation, gate dominance,
   deterministic replay, concurrency, retries, timeouts, crash recovery,
   idempotency, rate limits, malformed inputs, Unicode, performance, and
   dependency/container scanning. Restore and incident drills are required.
5. **Clinical validation:** clinically relevant endpoints with pre-specified
   thresholds and confidence intervals; false-negative harm review; subgroup and
   intersectional analyses; out-of-scope/abstention behavior; comparison with
   baseline workflow and human-AI team performance.
6. **Human factors:** representative staff use the full interface during realistic
   workload, handoff, interruption, downtime, and alert-volume scenarios.
   Measure recognition, escalation completion, override quality, and automation
   bias—not merely task completion.
7. **Privacy and security:** institutional risk analysis, data-flow inventory,
   minimum-necessary access, separate API/Studio roles, tenant isolation,
   encryption, secrets, audit review, retention/deletion, vendor agreements,
   penetration testing, threat modeling, incident response, and SBOM/provenance.
8. **Prospective shadow mode:** no patient-facing action or clinical mutation;
   qualified reviewers see every result; pre-defined stop conditions for urgent
   misses, subgroup harm, privacy events, drift, or availability failure.
9. **Change and monitoring:** version everything—rules, evidence, data, code,
   dependencies, prompts/models if introduced. Monitor input drift, disposition
   rates, overrides, safety-system failures, latency, downtime, and delayed
   outcomes. Retraining or rule changes require revalidation, not silent rollout.

## Public-benchmark gate

Run `npm run evaluation:readiness` before review. It validates that every public
benchmark has a declared construct, compatible system target, leakage controls,
required metrics, and explicit claim limits. HealthBench Hard must remain a
difficulty stress test; NOHARM must retain omission, commission, severe-event,
floor, and resilience results; and MedAgentBench must remain deferred until EHR
tools exist. A regression may block a candidate, but a pass cannot clear a
clinical release or satisfy a clinical-efficacy, deployment-readiness, or
zero-harm claim.

See
[`CLINICAL_SAFETY_EVALUATION_PORTFOLIO.md`](CLINICAL_SAFETY_EVALUATION_PORTFOLIO.md)
for the primary-source reasoning and ordered L0-L6 evidence ladder.

## Workflow-specific verification

- Run the real Mastra graph, not only the local mirror.
- Treat exact disposition and hard-gate integrity as CI gates with score 1.0.
- Inject a failure into each parallel branch; safety-check failure must lock an
  immediate human safety escalation, while intent failure must never self-route.
- Prove the router cannot invent an escalated status and cannot downgrade a locked
  status. Property/fuzz testing should exercise all reachable output states.
- Test Studio graph order, isolated tools, schema errors, trace redaction, local
  storage restart, concurrent runs, and exporter shutdown.
- If suspend/resume is added, test resume tokens, stale/duplicate resumes,
  timeout escalation, encrypted/tokenized workflow state, retention/deletion,
  and the rule that a same-day or emergency run never waits for questions.
- For the clinical-intake agent, keep CI gates for multi-turn emergency
  preemption, prompt injection, exact retrieved-source grounding, schema/tool/
  provider failure closure, bounded questions, monotonic urgency, no side
  effects, and hidden trace payloads. Add context-truncation, refusal, latency/
  cost ceilings, and repeated behavior across at least two independently hosted
  model families before making any model-quality claim. Keep the deterministic
  gate outside the model.

## Evidence package

Release evidence should include the locked protocol, risk analysis, traceability
matrix, dataset/data-sheet, labeling study, statistical analysis plan and report,
subgroup tables, human-factors report, security/privacy assessment, dependency
and model provenance, monitoring plan, incident/rollback runbook, known
limitations, and signed clinical/safety/privacy approvals.

Relevant baselines include the FDA/Health Canada/MHRA Good Machine Learning
Practice principles, FDA clinical decision support guidance, NIST AI RMF and its
Generative AI Profile, and applicable HHS HIPAA Security Rule requirements.
