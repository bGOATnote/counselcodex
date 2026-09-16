# Attempt 8: original C30 after the v17 refinement

Run `02156242-9b83-42ba-97ba-8669b9ae7a19` used `evidence-graph/v17`, `disposition-clinical-policy/v2`, and prompt hash `69892f68726e1db858c8cb2a8d0002913f1d9e04422f3e5e3606ca4c4686bdfe`. The retrieval corpus hash remained unchanged. This is another explicitly changed-prompt retest, not an independent held-out clinical case.

The run ended `review_required` / `clinician_required`, with canonical answer **null**, after **80.708 seconds**, **six model calls**, and **one repair**. Estimated token cost: **$0.509935**. No server action, question or patient reply was emitted. Root reported browser completion at **81.15 seconds**; see the separate browser addendum. GUI spend through eight attempts: **$3.319470**.

## Why the release failed

All six provider executions completed without an API or schema failure. The initial review accepted the Self care route but rejected a safety net that directed worsening or possible infection only to messaging without review timing or an unavailable-service fallback. Its correction asked for those additions and explicitly said to retain the immediate emergency instructions.

The repaired response supplied same-day review and an urgent-care fallback. The second judge then rejected **"For facial or throat swelling or trouble breathing, call 911"**, recording both `overtriage=fail` and `claim_support=fail`. The judge distinguished isolated facial swelling in dermatitis from airway-threatening swelling; this is the exact machine-review finding, not a new physician adjudication. Since one repair had already been used, the runtime withheld the final answer.

## Independent artifact-review concerns

- The initial review passed grounding while quoting **"rash confined to both forearms"**, although other distribution remained unknown. This is the same unsupported restriction that the v16 run's second judge rejected. A pass in this draw therefore does not demonstrate reliable contradiction detection.
- Both draft versions stated that fever was denied **"by symptom report only"** while also saying whether measurements had been taken was unknown. No patient statement established that method. The final judge passed grounding without addressing it.
- The initial repair instruction said to retain emergency instructions, but the second review rejected the broad facial-swelling threshold. That delayed discovery is a review/repair reliability concern: the first review did not provide a complete actionable defect set.
- The early safety agent's unpublished output still called Standard async necessary because a clinician could assess treatment options. It did not establish a specific required clinician task. This did not become an issued emergency notice or a released route, but remains visible in the raw multiagent record.

These findings are evidence against declaring the shorter judge clinically equivalent or the entire workflow presentation-ready from the fixed-packet study. The frozen comparison showed better output economy on authored packets; this live path still exhibits missed contradictions, incomplete correction instructions, and a roughly 81-second failed release.
