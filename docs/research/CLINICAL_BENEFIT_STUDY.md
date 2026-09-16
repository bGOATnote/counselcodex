# Does the agent improve disposition?

## Decision and current status

The next investment is an **auditable clinical-benefit experiment on the actual
GUI workflow**, not another agent, vector database, or model swap. This report
defines what would justify those additions and implements the first experiment.
Neither Counsel nor OpenEvidence has reviewed or endorsed this prototype.

Implemented: current-runtime paired generation, frozen reference metadata,
independent physician-rubric grading, source-support assessment, all-attempt
reporting, private raw artifacts, bounded authorized spending, and recovery tests.
**No provider study has been executed under this new protocol. Clinical accuracy,
agent benefit, judge calibration and acceptable live latency remain unproved.**
Passing its software controls establishes measurement behavior, not clinical safety.

The initial requested push published the preceding verified work through
`5efb884`. This sprint does not change the original 50 messages, original labels,
physician reviews, historical results, or the patient-facing routing policy.

## What a demanding reviewer should ask

| Question | Required evidence | What cannot substitute |
|---|---|---|
| What is the right action for this message? | Reference with provenance, timing, setting, uncertainty and acceptable alternatives | Agreement with an original source label |
| Did the system issue that action? | The actual early notices and final response, with timestamps | A rejected draft, private plan, or trace saying a step succeeded |
| Did the added agent help? | Same cases, comparator, frozen contract, all attempts, paired harms and benefits | A higher public benchmark score or a selected example |
| Does the explanation justify the action? | Claim-level support and patient applicability | Citation count, title, URL status, or an exact quote alone |
| Is a question worth delaying care? | Two plausible routing consequences and why information cannot be collected during review | A medically relevant but non-routing question |
| Can the judge be trusted? | Blinded anchors, adversarial controls, physician calibration and disagreement review | A cross-vendor name, agreement among models, or unexamined pass rate |
| Did care happen? | Clinician acceptance, patient receipt and closed-loop follow-up | Generating an instruction or putting a row in a demo queue |

These are the standards this project should make easy to inspect. They are not
claims about the private practices of particular companies.

## Published methods: what transfers and what does not

Counsel's emergency study filters HealthBench by language, excludes conditional
emergencies and second-hand prompts, then evaluates emergency escalation on 103
cases. Its published baseline context assumes a healthy 35-year-old man. That
assumption is **not applied here**. The useful lesson is a precisely defined task
and filtration policy, not borrowing a headline score. Exact selected IDs are not
published, preventing a claim of identical-cohort reproduction. [Counsel emergency method](https://www.counselhealth.com/blog/how-counsel-leveraged-healthbench-to-assess-emergency-escalation)

Counsel also describes condition-specific clinical rubrics and comparisons with
physician ratings. Its reported agreement varies by condition; high raw agreement
does not imply a perfect evaluator. Our existing one-call, seven-criterion auditor
is not seven independently validated judges. The new benchmark adds upstream
physician-authored criteria; it does not confer physician calibration on Astra.
[Counsel judge report](https://www.counselhealth.com/ai-report/llm-as-a-judge)

HealthBench uses physician-authored criteria with positive and negative weights.
The Consensus subset covers a narrower set of behaviors than the full benchmark.
Conversations can contain prior assistant turns, which must remain separate from
patient statements. Benchmark questions and generated answers should not be
published in repository artifacts, to reduce contamination risk. Our adaptation
grades the entire issued response, including early notices, rather than claiming
an official full-HealthBench score. [HealthBench paper](https://arxiv.org/html/2505.08775v1)

Two recent comparisons involving OpenEvidence reach different conclusions:

- A physician-rated point-of-care study favored OpenEvidence over the compared
  general models. It used specialty-matched blinded comparisons across accuracy,
  utility, source quality, verifiability and completeness; it examined citation
  visibility and response-length effects. Its methods also report OpenEvidence's
  involvement in data collection and study planning, and respondent compensation.
  Those relationships belong in interpretation, not in a footnote-free claim of
  independent superiority. [Expert evaluation study](https://arxiv.org/html/2606.28960v1)
- A peer-reviewed study favored general-purpose models over specialized tools on
  its medical benchmarks. Some quality analyses excluded refusals, and human
  agreement varied by measure. Dataset construction, version, endpoint and missing
  response treatment matter when comparing its findings with the point-of-care
  study. [Nature Medicine comparison](https://www.nature.com/articles/s41591-026-04431-5)

Neither establishes that our retrieval pipeline helps triage. Both motivate
task-matched comparisons, separate quality dimensions, blinded review and explicit
denominators. **Do not import RealPOCQi or RCQ queries into this synthetic-only
take-home**: their real-clinical-query origins conflict with the assignment's data
boundary. Learn from the study design instead. Two September correspondence pages
on the Nature comparison were located but could not be retrieved; they are not
represented as fully reviewed evidence in this report.

OpenAI's evaluation guidance supports task-specific tests, logging failures,
human calibration, and controls for order and verbosity bias. Mastra supports
workflow/agent evaluation and observability; those facilities do not supply
clinical truth. We use the installed Mastra workflow and storage APIs, without
upgrading dependencies merely to add a new evaluator feature.
[OpenAI evaluation guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices),
[Mastra evaluation documentation](https://mastra.ai/docs/evals/overview)

## Define truth before scoring

There are three distinct reference layers:

1. **Original 50 source labels:** input to audit, not gold clinical truth. Preserve
   them byte-for-byte. The original combined escalation bucket cannot establish
   whether an immediate emergency instruction was issued.
2. **Operational physician review:** the clinician's independent decision and
   rationale can establish a development reference for the five routes. Record
   reviewer identity, revision, uncertainty and acceptable alternatives. A solo
   clinician can perform this take-home review; a second or third clinician is
   not invented or required by the assignment. Author-and-evaluator bias must
   remain explicit. Unattested proposals never become physician references.
3. **External physician-authored benchmark criteria:** a source-independent test
   of specified behaviors. Emergency labels alone do not provide the other four
   route labels. A non-emergency reference cannot certify self-care, prescribing,
   same-day timing, or adequate follow-up.

The current care contract remains self-care, priority async, standard async,
in-person today, and emergency now. Prescription refill is a work type, not a
sixth acuity class. Clinician ownership, service availability and receipt are
separate state variables. No benchmark transformation invents a response guarantee.

The new grader receives patient facts, issued response units, actual cited
passages and physician-written criterion text. It does **not** receive the
generation arm, model name, expected binary label or criterion weights. It returns
literal `met`, `not_met`, or `unresolved` with exact anchors. A negatively weighted
bad-behavior criterion being met subtracts points; the grader must not reverse its
meaning. Unresolved criteria produce bounds, not a fabricated point estimate.
Patient/response wording can still indirectly reveal a workflow; this is metadata
blinding, not a guarantee that arms are indistinguishable.

Research support is a separate verdict. A pass requires a real source anchor and
a coverage explanation; an absent passage yields abstention. This mechanical
requirement does not itself prove entailment. The judge must assess all cited
claims and applicability; physician calibration remains a release requirement.

## Dataset audit and scope

Source: pinned HealthBench Consensus JSONL, SHA-256
`fabe37553327238928b05357d8b309737b5d426d6dee432a3376da618d0969d6`.
The existing auditable selection configuration is retained, not retuned to make
counts agree with a publication.

| Stratum | Cases | Treatment |
|---|---:|---|
| Primary reconstructed emergency subset | 103 | 29 emergency; 74 non-emergency |
| Conditional-emergency stress | 176 | No unconditional binary emergency truth assigned |
| Other excluded-scope stress | 159 | Separate analysis; do not relabel every exclusion as second-hand |

Our English filter yields 438 rather than Counsel's reported 433, and the
nonconditional intermediate count differs too. A final count of 103 is not proof
of identical cases. The primary ID digest is
`076f690a7e8ea4dfc1441ff0c69ff13d55459b4e6026ddfb9bed92a0d1d07353`.

**24 of the primary conversations have multiple turns.** The current benchmark
adapter deliberately will not flatten prior assistant speech into patient text,
or discard prior turns. It records those cases as unsupported without calling a
model. All 103 stay visible in planned denominators; the supported 79-case
analysis is separately named. A role-preserving multi-turn adapter is needed
before claiming coverage of all 103. This is an implementation gap, not a dataset
exclusion justified after seeing failures.

A hash-ranked development pilot selects six supported emergency and six supported
non-emergency cases. Its IDs are frozen before generation. The remainder is
reported separately and is no longer untouched once inspected or used for tuning.
One repetition is the initial plan; it cannot establish repeat-run reliability.
The study does not copy a target benchmark pass rate from another project.

## First comparison: two arms, one question

**Does adding Haiku planning and live retrieval to Opus improve the complete
disposition workflow enough to justify its extra cost, delay and failure modes?**

- `base-opus`: Opus with the shared safeguards and response contract, without the
  Haiku plan or retrieved evidence.
- `adaptive-opus`: the GUI's current Haiku planning, public/corpus retrieval and
  Opus response workflow.

Model choice, source input, output contract and common safeguards are fixed. Arm
order is deterministically counterbalanced; all attempts are retained. Source
passages and retrieval outcomes are stored per attempt because live search is not
stationary. This measures a **whole-workflow bundle**, not an isolated agent or
RAG effect. Opus without evidence is expected to lack retrieved source support;
that absence is not, by itself, proof that its clinical route is worse.

If the bundle helps, the next component experiment must reuse the exact same
frozen plan, passages and candidate answer when testing retrieval or critique.
Resampling all upstream steps and calling the difference "critic lift" would be
confounded. A live-retrieval robustness comparison belongs in its own analysis.
No model challenger is introduced in this first experiment; Astra is the judge,
not the proposed replacement for the incumbent Opus generator.

### Outcomes, in order of clinical importance

1. Emergency instructions missed, delayed or contradicted; incorrect earlier
   escalation remains a defect even if the final answer changes.
2. Unnecessary emergency and physical same-day escalation; unjustified blocking
   clarification; loss of priority async ownership.
3. Physician-rubric outcomes, unsupported statements, inappropriate source
   application and important uncertainty omitted.
4. Completion, source-support coverage, all-attempt latency and known/unknown
   token cost. Report both time to issued action and completed-answer time.

The executable first stage measures binary emergency agreement, criterion scores,
source-support judgments, latency, completion and cost. It **cannot calculate
five-route clinical accuracy from binary reference labels**, independently verify
question-delay necessity for every benchmark item, or observe patient outcomes.
Those needs are covered by the existing seven-criterion auditor and subsequent
physician review of the assignment/stress cases, not silently marked passed here.

No weighted overall score may compensate for an introduced emergency miss. Review
every discordant case, every failure, every unresolved judgment, and a prespecified
sample of concordant cases. A component advances only with clinically defensible
benefit and an acceptable latency/cost tradeoff on a fresh evaluation. A small
pilot can find defects; it cannot establish non-inferiority or zero harm. The
current report does not emit a significance claim or confidence interval from
incomplete or clustered data. Family-clustered paired inference is a subsequent
analysis, not an independence assumption hidden behind more decimal places.

## Failure accounting and reproducibility

The old `healthbench:eval` command exercised a historical workflow rather than the
GUI candidate. Its binary-only scorer could credit a failed non-emergency run.
The default command now uses this current-runtime runner. Historical offline
controls are explicitly named `healthbench:legacy-eval`; historical live execution
is disabled, and its scorer rejects failed/degraded rows instead of awarding them
true negatives. Previously recorded results are unchanged.

Each new run has a frozen code/source/selection fingerprint, input hash, role,
workflow version, queue policy, reservation, durable emitted events, trace ID and
immutable result hash. Results and judgments are stored under `.cache/`, not public
output directories. Reports contain metadata and aggregates, never benchmark
questions, rubrics or generated answers. Checksums detect mismatch; they are not
cryptographic signatures, access control, a HIPAA certification or proof of care.

A process crash does not authorize a retry. Its durable event-journal prefix is
recovered, preserving an issued emergency instruction while the response stays
incomplete. Torn tails are not treated as valid events. A missing final answer is
not a true negative. Future replay of a judgment recomputes scores from its raw
anchored verdicts and the frozen rubric rather than trusting a saved number.
Historical reporting preserves the historical fingerprint after later code edits.

Authored controls cover always/never escalation, unavailable outputs, wrong early
actions, lost emissions, interrupted recovery, reference leakage, changed rubric
weights, malformed quotes, source-free passes, altered result hashes, concurrent
runners, missing arms, private-path escapes and budget exhaustion. A real local
Mastra workflow test injects malformed model outputs without calling a provider.

## Execute in stages

```bash
# No model calls: verify source, freeze development pilot and execution order.
npm run clinical:benchmark -- plan .cache/clinical-benefit-v1

# Requires a separately approved authorization.json in a private budget directory.
npm run clinical:benchmark -- run .cache/clinical-benefit-v1 pilot .cache/clinical-benefit-budget
npm run clinical:benchmark -- grade .cache/clinical-benefit-v1 pilot .cache/clinical-benefit-budget
npm run clinical:benchmark -- report .cache/clinical-benefit-v1
```

Do not run `primary` or `stress` automatically after the pilot. Inspect failures,
judge controls, clinical disagreements and spending first. If generation changes,
create a new immutable study directory; do not overwrite the old run or silently
rebind its manifest. `report` can read historical results after code changes.

The new ledger requires an explicit authorization reference, ceiling and pricing
version. It does not reset old allocations or use the manual-GUI exemption. Each
generation run and each grading call reserves $1 conservatively; failed or unknown
attempts keep their reservation. A 12-case, two-arm pilot plus one judge per
response needs at most 48 reservations. Reconciliation, not automatic recycling,
is required before reusing reserved capacity. These are spending limits, not a
statement that the provider balance is exhausted.

The configured standard prices are estimates based on per-agent input/output
tokens; caches and provider invoices may differ. The model call count, prompt
byte limits and output caps bound this protocol; there are no automatic retries.
Unknown usage remains unknown. No new paid authorization was inferred from the
old billing screenshot. [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing),
[Astra model pricing](https://developers.openai.com/api/docs/models/gpt-6-astra)

## Next release gates

First execute and inspect the development pilot under approved spending; then fix
reproducible defects and retest without erasing failures. Before a clinical-benefit
claim, complete the role-preserving adapter, calibrate this new judge against
blinded physician judgments, evaluate a genuinely untouched case set, and report
paired adverse tradeoffs alongside benefits. Before another GUI handoff, test
consecutive real browser runs and a clarification/update. Before deployment,
prospective clinical validation, service availability, emergency handoff,
follow-up closure, privacy/security and applicable regulatory work remain separate
requirements. A take-home demonstration does not satisfy those release gates.
