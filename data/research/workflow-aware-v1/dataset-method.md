# Workflow-aware development challenge set

Status: **AI-authored and unreviewed**. Created 2026-09-16T07:06:38.108740Z. Contains 48 fictional messages in 24 controlled pairs. No real patient data, physician approval, independent clinical validation, or deployment claim is represented.

## Purpose and separation

This set probes the proposed care-pathway contract: guidance alone; physician assessment that can begin through messaging; or required in-person/emergency capabilities. A fast asynchronous interaction can provide same-day physician review. It does not prove that examination, testing, or treatment occurs in time.

- `challenge-messages.json` contains only `id` and `message`. The runner must send **only the message string** as user content. Do not send IDs, pair membership, targets, metadata, references, or source text.
- `challenge-review-targets.json` stores AI-proposed buckets, alternatives, ambiguity, timing, source URLs, and pair-specific review checks separately. It may be read for scoring only after generation has been frozen.
- Message file SHA-256: `e5439a76fe4c9bd7ab5fc58f4debba5c2f293bf00c510b35ea87db99da97abfb`. The target wrapper records this digest and its creation timestamp. The experiment owner must include both files in the pre-generation freeze and use a new version if anything changes.
- The author reviewed prior project findings and the planned workflow contract. This is a new authored development set, **not a held-out test**. No new candidate model outputs were inspected during authoring. The cases are not copied from the assignment CSV; topic overlap is intentional.

## Pair design

Each pair changes a designated clinical fact, information state, temporal state, or untrusted instruction. Many pairs test escalation, while others deliberately test invariance: a resolved recent neurologic event still warrants emergency assessment; prompt injection does not change clinical evidence; pregnancy medication questions need not become emergencies solely because gestation is known; faster messaging cannot supply imaging.

The pair registry gives exact changed text and intended direction. Most pairs isolate one fact. WP09, WP12, and WP23 use linked symptom clusters and must not be described as single-variable causal experiments. WP19 and WP22 change temporal/baseline context. The pregnancy exposure pair changes duration and dose count together by design. Missing information is not transformed into either a positive or a negative finding.

All cases and proposed targets require qualified clinical review. Alternative accepted buckets are explicit where pathway interpretation or remote assessment leaves reasonable uncertainty. A single accepted bucket means only that the AI author proposed one, not that clinicians unanimously agree. Patient-reported ankle palpation is not a validated remote Ottawa examination. Unsupported service populations and caregiver messages require separate scope review; age alone is not an emergency.

## Coverage

Ankle information states and positive findings; brief and persistent sleep symptoms; daytime impairment; pregnancy and NSAID questions/exposure; diabetic foot injury and systemic infection; cough and hemoptysis; chest symptoms and prior-diagnosis anchoring; prescription renewals with and without active red flags; prompt injection; rapid-message preference versus required examination; historical versus current symptoms; recent resolved neurologic symptoms; pediatric service scope; caregiver reports; vomiting with urinary symptoms; and fever after chemotherapy.

## Analysis limitations

1. Sources support clinical considerations, not validated labels for these fictional messages. Local UK/Australian pathways do not define a US service's operating policy or any precise response guarantee.
2. Three buckets collapse same-day and emergency timing. Correct route agreement cannot prove timely emergency action, safe prescribing, correct counseling, or completed referral. Manual rationale checks are review prompts, not an automated clinical judge.
3. Pair members are correlated. Report 24 underlying pairs as well as 48 messages; do not use 48 independent trials to claim rare-event safety. Repeated samples add reproducibility information, not new patients.
4. Small purposive coverage does not estimate prevalence, population accuracy, subgroup fairness, clinician capacity, or clinical harm. There are no observed outcomes.
5. Report known-cohort regression separately from this authored set. Preserve ambiguous targets and avoid post-output target changes that improve a score. Prospective independent physician evaluation needs genuinely new cases and blinded review under a predeclared clinical context.
6. Clinical/publication sources and exact generation artifacts must be frozen before the run. No result from this set alone supports promotion or autonomous use.

## Basic validation performed at creation

48 unique IDs; 48 distinct nonempty message strings; 24 pairs with two linked cases each; exact three-bucket vocabulary in targets; proposed bucket belongs to accepted set; message records contain no target/label metadata and no exact bucket-name strings; no unresolved authoring placeholders. Creation tooling refuses to overwrite the three deliverables. Clinical correctness remains unreviewed.
