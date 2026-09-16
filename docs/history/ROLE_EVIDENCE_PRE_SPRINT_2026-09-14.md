# Historical role evidence before the September 14 repair sprint

The supplied role asks for one person who can combine physician judgment,
product scope, and hands-on agent engineering. This ledger maps every stated
competency to something the review team can inspect or execute. Repository
evidence demonstrates work product; it cannot prove credentials or employment
history that belong in the resume, references, and interview.

## Thirty-day outcome simulation

| Expected outcome | Evidence in this take-home |
|---|---|
| Get fluent in the stack and gaps | Current-state audit finds 12 supplied-label disagreements, including eight possible escalation misses; the Mastra graph and trace contract are documented and executed |
| Ship one V0 improvement end to end | Typed Mastra disposition workflow, deterministic emergency supervisor, bounded clinical-intake Agent, test/eval harness, CI, live demo, and clinician evaluation workbench |
| Surface a prioritized weakness list with eval cases | Case-level disagreement register, 38 adversarial cases, nine clinical-agent development cases plus a nine-case temporal holdout, failure taxonomy, trace verification, and component ablations |
| Build trust quickly through the full loop | Decision record connects scope, architecture, evaluation, red team, observability, demo, limits, and next experiment |

## Competency traceability

| Competency from role description | Inspectable evidence | Status and boundary |
|---|---|---|
| Clinical fluency | The blinded GUI requires a route, timing, decisive evidence, rationale, must-not-miss concern, unknowns, harm analysis, confidence, and evidence sufficiency for every case; the prior CSV is explicitly unattested | Demonstrated only after the candidate completes and exports the review; licensure, residency, and practice history are not repository claims |
| Gold-standard authoring and defense | Route contract, attributable case records, blind originals, post-reveal revisions, explicit assumptions, source/V0 assessments, and `docs/CLINICAL_EVALUATION_PROTOCOL.md` | Instrument complete; substantive evidence requires the candidate's signed export and is deliberately not called consensus clinical gold |
| Clinical safety and regulatory judgment | Hard escalation gate, unknown-to-clinician default, no patient action, no prescribing/order/chart tools, synthetic-only boundary, privacy controls, governance and shadow-mode gates | Demonstrated for the prototype; HIPAA/FDA/state-law conclusions require Counsel legal and compliance ownership |
| Production-oriented LLM engineering | Registered Mastra workflow and Agent, Zod contracts, provider allowlist, read-only tool, exact-source grounding, bounded steps/time/output, typed failure codes, observability, CI and production builds | Executable vertical slice; no claim that this take-home is a deployed medical product |
| Python and TypeScript | TypeScript workflow/evals/tests and a Python compatibility CLI that delegates to the single decision source | Demonstrated in passing tests and parity checks |
| Modern LLM stack judgment | Tool calling, trajectory evals, retrieval contract, offline sparse-vector and governed-hybrid admission test, provider-neutral model bakeoff, cross-model failure plan, prompt and schema controls; explicit decision not to wire vector search, fine-tuning, or Kubernetes into the route before admission evidence | Demonstrates choosing, testing, and sequencing technology |
| Technical design review strength | `docs/ARCHITECTURE_EVOLUTION.md`, trace/privacy decisions, durability boundary, failure-closed postconditions, and ablations that quantify each component's contribution | Review-ready with named tradeoffs and admission tests |
| Product mindset | V0 optimizes a completed safe handoff; route owners and SLAs are explicit; agent output stops at a licensed-clinician handoff | Product hypothesis is clear; clinician time saved and access improvement remain unmeasured |
| Bias toward simplicity | Disposition remains deterministic; the Agent is downstream and promotion-only; exact lookup replaces unjustified vector search; review is browser-local with export/import rather than a premature identity service or adjudication backend | Demonstrated by keeping the evidence workflow complete but infrastructure light |
| Extreme ownership | Repository, workflow, clinician review, data analysis, tests, red team, evaluation UI, runbook, deck, CI, and decision accounting form one executable package | Work product demonstrates end-to-end ownership; prior shipped-product history is external evidence |
| Resolving ambiguity | Brief says 20 while CSV has 50; all 50 are retained. Pediatric scope, missing context, route semantics, and the lack of a representative external clinical holdout are made explicit without blocking progress | Demonstrated; unresolved product assumptions are converted into decisions and tests |
| Clarity of thought | Results card separates current-state audit, implementation replay, and clinical performance; every headline number has a permitted interpretation | Demonstrated in README, evaluation workbench, deck, and runbook |
| Experimentalist mindset | Executed naïve baselines, component ablations, fault injection, full-graph Mastra evals, multi-turn fixtures, red team, three-method retrieval comparison, five-seed ordering trials, grader meta-evaluation, 440 metamorphic routes, a nine-case orchestration holdout, and a frozen 24-query retrieval holdout that rejected the candidate; registered eight benchmark roles and a seven-level evidence ladder | Software and contract experiments executed; retrieval failed the specified criteria, public benchmarks address distinct evaluation questions, and external model and clinical performance remain unmeasured |
| Statistical judgment | Rejects misleading Wilson intervals on leaked 50/50 replay, exposes always-emergency and always-same-day Goodhart failures, separates probability sampling from active learning, and requires intervals/weights for external claims | Demonstrated in the evaluation protocol; no population estimate is fabricated |
| Attention to detail | Input hash, byte-identical source copy, formula-injection neutralization, model/tool/schema fault tests, trace canary, exact retrieval provenance, one-way gate invariant, and 50-case join validation | Executed in automated checks |
| Cross-functional collaboration | Artifacts translate the same decision for clinicians (case rationale), engineers (contracts/tests/traces), Product (scope/owners/SLA), and operations (completed escalation and capacity metrics) | Demonstrated through shared decision surfaces; live team behavior belongs in Q&A and references |
| Communication and coachability | Concise decision record, 35-minute walkthrough, explicit claims ledger, and a substantive correction from “three-clinician completion gate” to “one-clinician take-home plus sampled future validation” | Demonstrates updating on new information rather than defending sunk work |
| Mission fit | Roadmap moves from safer inbox routing to history collection, evidence retrieval, physician approval, measured capacity, and equitable access; the model is never the outcome | Direction is explicit; actual patient-access and health outcomes require prospective measurement |

## What the live demo should prove

The [8 September component review](../QUALITY_SYSTEM_REVIEW_2026-09-08.md) extends
this map with five actual research judge Agents, temporal evidence contracts,
independent retrieval grading, a read-only evidence inspector, persisted
research-cost reservations and the next paired clinical experiment. None of
these additions establishes clinical lift or repairs the failed frozen
emergency supervisor.

1. The existing label can be wrong in a clinically important direction. Open
   C08, C17, C23, or C35 in the evaluation workbench.
2. The emergency supervisor catches the signal independently and locks the
   urgent route.
3. An async case reaches the bounded Mastra Agent, which uses one read-only
   source and produces a clinician-facing handoff.
4. A tool, schema, or grounding failure closes to clinician review rather than
   inventing evidence.
5. Traces show graph topology while hiding clinical input and output.
6. Removing the safety branch destroys both emergency and same-day recall in the ablation.

These are stronger signals than a perfect aggregate score because they show
which component owns risk, how failure is detected, and what remains for a real
clinical study.

## Evidence still required outside the repository

- physician credentials, board status, clinical practice history, and async-care experience;
- 1.5+ years of production LLM work and ownership of shipped products;
- startup or founding-operator history;
- publications, open-source impact, and engineering-organization experience;
- an untouched representative retrospective study; and
- prospective evidence of safer care, faster completed escalation, clinician
  time saved, subgroup equity, and increased access.

The presentation should not imply those facts if the candidate cannot support
them personally.
