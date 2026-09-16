# Unattested clinical reference proposal

`clinician_development_review.csv` is a legacy-named, AI-assisted case-by-case
proposal used to build and test the V0. It records a route, subtype, confidence,
clinical rationale, disagreement type, and potential harm for each of the 50
supplied synthetic messages. It is not evidence that the candidate personally
reviewed those cases.

The candidate authors the actual one-clinician reference in the local review
instrument (`npm run review:dev`). A case counts only after an independent
judgment is locked and the revealed comparison is completed. A full review is
evidenced by the signed, integrity-hashed JSON export. No third clinician is
required for the assignment, but neither this proposal nor a signed review is a
consensus standard, untouched holdout, or population-performance estimate.

## Source-data reconciliation

- The brief describes 20 synthetic messages; the delivered CSV contains 50.
  The repository preserves all 50 and the instrument queues every row.
- Supplied CSV SHA-256:
  `d17771ed706c6866d2b13f2d7f5344824acf51aaf281b8af6368637586d71a15`.
- `data/patient_messages.csv` is byte-identical to the supplied CSV.
- The supplied labels and reference proposal disagree in 12 of 50 cases: eight
  hypothesized under-triage errors and four hypothesized over-triage errors.
  Those counts are not physician findings until independently reviewed.
- Three messages concern children (C07, C16, C32). Pediatric scope therefore
  needs an explicit product decision even though the assignment includes those
  cases.

## Proposal disagreement register

| Case | Supplied | Proposal | Hypothesis to review |
|---|---|---|---|
| C06 | urgent | async | A stable losartan refill requires a prescriber, not emergency routing by default. |
| C08 | async | emergency now | Thunderclap headache with neck stiffness may require emergency evaluation. |
| C11 | urgent | self-care | Localized contact dermatitis without airway symptoms may not need urgent capacity. |
| C12 | async | same day in person | COPD with marked exertional dyspnea may require same-day in-person assessment. |
| C16 | async | same day in person | Infant fever, poor feeding, and fewer wet diapers may require prompt in-person assessment. |
| C17 | async | emergency now | New bladder dysfunction plus saddle numbness is a possible cauda equina emergency. |
| C23 | async | emergency now | Resolved facial droop and dysarthria remain possible TIA symptoms requiring emergency assessment. |
| C25 | async | same day in person | A unilateral warm swollen calf after long-haul travel may require same-day DVT evaluation. |
| C30 | urgent | async | Localized poison ivy without systemic or airway symptoms may be managed asynchronously. |
| C35 | async | emergency now | Melena plus orthostatic symptoms may represent clinically important GI bleeding. |
| C44 | async | same day in person | Progressive edema plus orthopnea may require same-day heart-failure assessment. |
| C46 | urgent | async | A stable finasteride refill requires prescriber review, not emergency routing by default. |

## Four-level operational split

The supplied `URGENT_ESCALATION` label is immutable source evidence. The
unattested proposal and V1 runtime split it into `SAME_DAY_IN_PERSON` and
`EMERGENCY_NOW`; both project back to the supplied value only for legacy
comparison. The split, evidence, invariants, and evaluation implications are in
[`../docs/ROUTING_TAXONOMY.md`](../docs/ROUTING_TAXONOMY.md).

The disagreement register's shorthand “urgent” refers to the supplied combined
label. The proposal CSV contains the actual four-level route.

## Ambiguous route boundaries

Several cases depend on information or operational capabilities absent from the
message: the diabetic foot wound (C04), first versus recurrent positional
vertigo (C19), individualized NSAID safety (C38), a possible TB pathway (C43),
and pleuritic chest pain without vitals or a complete risk screen (C49). The
reference proposal records a forced development target, but the product should
capture decision-critical missing context rather than manufacture certainty.

## What happens next

For this take-home, use the proposal to seed hypotheses and software tests. Use
the blinded GUI to author the candidate's own reference, audit the supplied
workflow, score V0, and explain disagreements. Do not block submission on
unavailable reviewers, and do not call unreviewed rows physician-authored.

For a later external performance claim:

1. freeze the intended population, route semantics, SLA, destinations, and
   labeling manual;
2. sample an untouched patient- and episode-independent set from the intended
   distribution;
3. use blinded multi-clinician overlap on a statistically justified subset to
   calibrate the rubric and resolve high-stakes ambiguity;
4. report disagreement, uncertainty, denominators, severity, and subgroup
   performance; and
5. retain these 50 visible cases as development regressions only.

At production scale, never attempt three-clinician review of every case. Run
deterministic safety checks and validated rubric judges on every thread. Use
100% physician review for serious incidents and near misses, probability
sampling for unbiased estimates, uncertainty/disagreement sampling for failure
discovery, and frozen sentinels for release regression.
