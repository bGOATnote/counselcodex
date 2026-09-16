# Physician alignment: current engineering decision

**Not obtained.** The frozen V25 evaluation has all 50 first attempts, but only
27 completed releases and 21 completed reference agreements. Its 21/27 agreement
is conditional on completion, not 50-case accuracy. C25 remains qualified/null.
The previously physician-reviewed incumbent does not confer approval on V25 or
on the subsequent unpublished drafts.

## Keep the product small

The intended product is a disposition router, not an autonomous replacement for
Counsel's whole clinical service. Retain one recommendation with setting, timing,
async priority, concise reasoning and inspectable support. Clinician acceptance,
queue delivery and follow-up execution remain explicit integration stubs.

Retain parallel early-safety and context/retrieval work, one low-effort disposition
producer, exact source and patient bindings, issued-care protection and logging.
Do not restore judge/repair to the happy path. The clinician reference remains
offline. No reference label or historical answer is a retrieval source.

Generated operational promises are unnecessary: the existing typed queue policy
can render intended ownership, priority and availability without a model claiming
that a handoff occurred. That is a narrower future UI change, not permission to
republish withheld clinical prose or call a route card complete patient guidance.

## What earned its place—and what did not

| Experiment | Observed result | Decision |
| --- | --- | --- |
| [Shorter brief v1](ROUTING_BRIEF_REPORT_2026-09-15.md) | Coverage 36/49 → 26/49 | Reject as tested |
| [Remove generated context](GENERATED_CONTEXT_ABLATION_REPORT_2026-09-15.md) | Coverage 36/49 → 34/49; no meaningful measured latency gain | Do not remove based on this study |
| [Necessary clinician task](TASK_OWNERSHIP_ABLATION_REPORT_2026-09-15.md) | Coverage 34/49 → 35/49 | Not established alignment |
| [Higher model effort](EFFORT_ALIGNMENT_PROBE_REPORT_2026-09-15.md) | Same 4/10 matches, median 14.7 → 22.7 s | Keep low effort |
| [Brief-v2 contract correction](ROUTING_BRIEF_CORRECTION_REPORT_2026-09-15.md) | Eligible 3/8 → 7/8; all raw paired routes identical | Real serialization improvement, isolated; not clinical lift |
| [Insomnia source replacement](INSOMNIA_SOURCE_PROBE_REPORT_2026-09-15.md) | No route change across six pairs | Stronger provenance, no demonstrated alignment lift |
| [CDC ear-pain source replacement](AOM_SOURCE_PROBE_REPORT_2026-09-15.md) | No route change across three pairs | Patient application still incorrect or unresolved |

Every comparison has its own fresh baseline. Selected-case repetitions are not
new cohort accuracy estimates. These producer studies are not V25 releases.

## Robust RAG means correct application, not more URLs

The evidence problem has distinct stages: source validity, retrieval, selection,
quotation and patient application. Tests must identify which stage failed.

- The [ranking replay](RAG_RANKING_COHORT_NULL_2026-09-15.md) lost three labelled
  evidence passages that met the annotated requirement; the change did not
  establish an improvement and was not selected.
- [Section expansion](RAG_EXPANSION_COHORT_NULL_2026-09-15.md) added no selected
  passages; it did not address the observed defect.
- The [task-support audit](TASK_SUPPORT_PACKET_AUDIT_2026-09-15.md) found
  assessment prerequisites already present. Adding another retriever or judge
  does not demonstrate that the producer will apply those prerequisites.
- The CDC candidate retains diagnostic and management qualifiers together,
  publisher provenance and the original response. All three drafts nevertheless
  used its conditional observation sentence for undiagnosed ear symptoms.
- C47 similarly converted maintained functioning into denied impairment despite
  all-day tiredness. Exact quotations did not prevent incorrect application.

The next evidence improvement must be tested against those failure mechanisms,
not against source count. Unknown prerequisite findings must remain unknown;
an uncertainty disclaimer is not evidence that an observation criterion is met.
Do not equate an unestablished diagnosis with mandatory emergency escalation.

## Policy distinction requiring clinician definition

C26 asks what can be taken for a scratchy throat and is Self care in the reference.
C34 asks for an OTC allergy option and is Standard async. C38 asks for a safe
individualized ibuprofen dose/duration and is also Standard async. The tested
guidance scope permits supported general OTC/product-label education. It does not
authorize prescribing or an individualized assessment that has not occurred.

A general clinical/capability rule must explain when the requested work exceeds
that guidance scope. A rule keyed to case number, allergy keywords or the known
reference would only fit the development set. Historical gold is not being changed,
and route disagreement alone is not being relabelled as harm. C22's incomplete
injury assessment, C32's evidence application and C47's unsupported functional
inference remain separate problems; this policy question does not excuse them.

## State and next action

Live V25, corpus, prompts, release predicate and gold remain frozen. No experimental
brief or source replacement was promoted. Lint, typechecking and the full configured
root tests passed after the latest probe; no new GUI handoff is claimed.

Conservative cumulative API exposure: **$84.687986 of the same $90 ceiling**;
**$5.312014 remains**. All failures are retained. No more paid tuning is justified
merely to force the unresolved service-policy boundary. Establish that general
boundary, then test a replacement of the existing policy paragraph—not another
agent, a case-specific override or a growing list of prompt exceptions.
