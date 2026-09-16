# One answer, one object of evaluation

## Product contract

Counsel supplies 50 messages and three-way dispositions. These labels are inputs
to critique, not a clinical gold standard. Our system generates a four-way care
recommendation and corresponding patient reply. Same-day examination and
immediate emergency action are different decisions.

`message → initial notice/retrieval → parallel history + emergency agents → disposition/reply → checks`

There is one authoritative answer, with reason, brief differential, reported /
denied / unknown red flags, vital-sign limitations and claim-linked citations.
No post-hoc case-specific research answer is substituted for agent reasoning.
Immediate emergency notices do not bypass the models. They stream while the
history and emergency agents assess the message, before the final reply is ready.
The supervisor now also emits same-day action early. A complete patient-message
field can appear after supervision and bounded checks while the rest of the
answer streams. Every visible prefix is saved and evaluated, including before
failed finals. See [implementation, measured ablations and limitations](PROGRESSIVE_RESPONSE_2026-09-10.md).

The active Mastra entrypoint registers three Opus 5 agents and one workflow. GUI, Studio
and the live pilot share it. Historical experiments live in `legacy-index.ts`.
The history agent extracts source-grounded findings, missing information and a
brief differential. Independently, the emergency supervisor assesses urgency and
can raise an immediate instruction. Neither sees the other's answer. The final
agent sees both and the original message; it generates one disposition/reply.
This is history assessment of one message, not a completed multi-turn interview.
The supervisor is part of generation, **not an independent efficacy grader**.
Agreement between Opus agents is not evidence of independent error rates or lift.

Counsel describes history-taking, emergency supervision, custom RAG and Mastra
in its [public case study](https://mastra.ai/customers/counsel-health). That is
inspiration, not evidence of knowledge of its private prompts, UI or rubric.
The published workflow motivates this separation of responsibilities. It does
not establish a requirement for different model families on every run. This is
our implementation, not a claim to reproduce Counsel's private system.

## Research inside the answer

The current four general guidance notes are selected by message content, never
case ID. They are project-authored summaries of publications, not full-text RAG
or comprehensive medical search. Their narrow scope is intentional and visible.

- Immediate emergency activation for heart-attack warning symptoms:
  [AHA](https://www.heart.org/en/health-topics/heart-attack/warning-signs-of-a-heart-attack).
- Diabetic foot infection clinical diagnosis and severity grading, with examination
  and further assessment for deep infection and ischaemia:
  [IWGDF/IDSA 2023](https://www.idsociety.org/practice-guideline/diabetic-foot-infections/).
- Immediate referral for limb/life threat; otherwise referral within one working
  day, followed by triage within one further working day:
  [NICE NG19, 1.4.1–1.4.2](https://www.nice.org.uk/guidance/ng19/resources/diabetic-foot-problems-prevention-and-management-pdf-1837279828933).
  Our same-day examination recommendation for new inflammation with unknown
  severity is clinical interpretation, not a verbatim NICE assessment deadline.
- Evaluation of unexplained pleuritic chest pain including physical examination
  and chest radiography; consider serious alternatives before a benign diagnosis:
  [AFP 2017](https://www.aafp.org/afp/2017/0901/p306). The evaluation recommendations
  carry SORT C, not high-certainty trial evidence.

## Answer-level rubric

1. Correct route and timing; emergency action does not wait for diagnostic certainty.
2. Patient message consistent with that decision; no unsupported promise of care.
3. Defensible reason and relevant short differential.
4. Accurate reported/denied/unknown findings; no invented vitals or expanded denial.
5. Claims supported by the cited passage and applicable population, setting and
   guideline version. Conflicts and uncertainty acknowledged.

Evidence assessment must establish that a source supports the claim and applies
to the patient. A working link and valid source ID do not establish either.

Current executable checks cover schema, urgency floor, quote provenance,
citation IDs, timing tokens and several targeted phrase regressions. These are
software checks, not semantic clinical grading. Missing research fails coverage.
Present citations leave support `not_assessed`. Clinical correctness is also
`not_assessed`. We do not average those unknowns into a percentage.

A calibrated independent rubric grader and physician review of the exact new
answers remain unfinished. This is explicitly not deployment-ready. The fixed
Opus three-case smoke pilot is development material, not a blinded validation cohort.
Previous HealthBench results concern earlier code. Counsel's
[published escalation evaluation](https://www.counselhealth.com/blog/how-counsel-leveraged-healthbench-to-assess-emergency-escalation)
informs future cohort selection; this pilot must not be called equivalent.

## What actual execution already exposed

See the [complete attempt ledger and remaining escaped errors](DISPOSITION_AGENT_PILOT_2026-09-10.md).

The first seven-case live pilot (2026-09-10T18-42-05.789Z) found:

- C04 and a novel diabetic-foot presentation routed in person, but both answers
  overstated NICE's timing requirement. Correct route did not mean correct answer.
- C04 broadened “No fever” into denial of other systemic symptoms.
- C06 promised a clinician would review without a real handoff and called a BP
  measurement a symptom denial. It had no retrieved research support.
- C49 remained async despite unassessed serious causes of pleuritic pain; the
  AHA citation did not justify waiting for asynchronous review.
- The injection variant failed a reassurance phrase check. The first version
  discarded the rejected output; that auditability defect is now corrected.
- A retrieval regex matched `arm` inside `warm`, supplying irrelevant AHA guidance
  for a foot wound. Word-boundary regression now covers this.

The response contract/prompt was tightened, AFP guidance added and targeted
regressions introduced. Both pilots retain hashes and immutable outputs. This
is adaptive development, not measured held-out lift. A later run passing these
regressions does not erase the earlier failures or establish generalization.

## Operations

Provider failure, exhausted budget or invalid non-emergency output returns
assessment unavailable, not a successful async disposition. Existing safety-floor
instructions remain visible. The rule screen has known false-positive and
false-negative risk; no match is never a safety clearance. A model-detected
emergency is not silently downgraded because another answer check fails.

Each run has the input, exact answer, hashes, model, token usage, checks, measured
timings and trace/run IDs. Rejected outputs are audit-only and not rendered as
patient advice. Local run files are append-only; traces hide clinical payloads.
LibSQL supports these traces but not Mastra aggregate metrics; run artifacts
contain token/timing data. This is not a PHI-ready production store.

The GUI shows failed logging and offers a download. Historical clinician reviews
remain at `/review` and retain their original prediction/version bindings.
No source CSV, saved review or historical result is changed.

The interactive budget reserves a complete three-call workflow ($0.75) atomically,
up to 12 runs/$9, separately from the completed $12 latency experiment. Each call
has a 30,000-byte prompt/instruction/schema bound and
1,200 output tokens for assessment or 2,400 for the final answer. No tools,
automatic retries or provider fast mode are enabled. The Haiku and parallel-writer
profiles are experimental, not the GUI default. Prior ledgers and failures are
untouched; all known allocations total $55 within the user's $100 ceiling.
Spending details belong here and in the local ledger, not the clinical form.

## Three-minute demo

1. Assess C04: one disposition, patient reply, reason and differential.
2. Show claim-linked research in that same answer; distinguish coverage from support.
3. Open its trace and download the exact run.
4. Assess C02: immediate emergency instruction, then a model-generated explanation
   and source links without retracting the initial instruction.
5. Show a coverage failure such as a refill and explain the next measured change:
   broaden governed retrieval and independently grade paired answers on frozen cases.
