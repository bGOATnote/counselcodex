# False-negative reduction experiment

16 September 2026 · 98 new one-shot provider calls completed · No promotion

**The candidate did not improve the observed safety profile.** Known physician-v3 agreement decreased from 48/50 to 44/50. Clinician-action false negatives remained two; urgent-bucket misses increased from zero to three. C47 resolved, C22 persisted, and new misses were C04, C07, C32, C43 and C49. The authored 24-case challenge improved from 22/24 to 23/24 against AI-authored unreviewed proposed labels; F02 remained an urgency miss in both arms.

The canonical [results report](../../docs/FALSE_NEGATIVE_REDUCTION_RESULTS_2026-09-16.md) contains all changed-case messages and rationales, persistent misses, limitations, operational observations and next steps. The original GUI and historical results remain unchanged. No further prompt iteration is part of this experiment.

## Evidence

- [Prespecified study plan](study-plan.json)
- [Known physician-v3 scorecard](scorecard-known-development.json)
- [Authored challenge scorecard](scorecard-authored-challenge.json)
- [Scoring and integrity audit](scoring-audit.json)
- [Operations ledger](operations-ledger.json)
- [Blank rationale-review template](manual-rationale-review-template.json)

The known-set control is historical; single-run differences are not proof of a causal prompt effect. This is development evidence, not independent clinical validation or observed patient outcomes. References were read only after generation was complete and its integrity verified; CSV agreement is not scored here.
