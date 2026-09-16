# Local mining and hard-negative review — 2026-09-15

**The tested local configurations produced a few useful textual candidates, with frequent incomplete generations and unreliable open-ended critique.** Cascade 8B produced supported narrow findings on **2/8 mining tasks** and usable returned pairs on **3/4 negative tasks**. Nano produced **0/8 supported mining findings** and **2/4 usable returned pairs**. Nothing was admitted to gold, the source corpus, regression tests or the live router.

This is an **engineering-agent review**, independent of the local generations. It is not human adjudication, physician approval, a blinded review or clinical validation. The reviewer selected these archived excerpts earlier and had prior familiarity with the engineering audits. During this review, decisions used the frozen patient/draft/source inputs and completed raw final outputs; no physician labels, expected routes or scorecard reports were consulted. Failed reasoning was not salvaged.

## Scope and denominators

All **24 planned responses** were retained: the same eight archived mining excerpts and four negative seeds for each configuration. Input fields and actual prompt messages were verified identical across models. Both used native thinking, temperature 0, seed 42 and context 8,192. Cascade used a **4,096-token shared reasoning/final cap**; Nano used **2,048 per native decoding phase**. This harmonizes maximum allowance, not actual compute. This is a comparison of the tested configurations, not an isolated estimate of model capability.

The machine-readable review's `settingsConfound` field records the API values
4096 and 2048. The [runtime audit](LOCAL_MODEL_PACKAGE_BUDGET_CORRECTION_2026-09-15.md)
clarifies their different internal semantics; those values do not establish a
twofold maximum-allowance advantage for Cascade.

| Observed outcome | Cascade 8B Q5 | Nano 30B-A3B Q5 |
|---|---:|---:|
| Mining completed final answers | 3/8 | 1/8 |
| Mining length failures, retained | 5/8 | 7/8 |
| Mining final answers passing literal checks | 3/8 | 1/8 |
| Tasks with a text-supported issue | **2/8** | **0/8** |
| Proposed issues: supported / false alarm / ambiguous | 2 / 1 / 0 | 0 / 0 / 1 |
| Completed mining answers with no issues | 1 | 0 |
| Negative completed final answers | 4/4 | 4/4 |
| Negative pairs passing literal checks | 4/4 | 3/4 |
| Returned pairs meeting this review's textual criteria | **3/4** | **2/4** |

Literal checks establish substring identity and response shape. They do not establish a supported control, a clinically valid source, or a meaningful defect. The five retained pair observations contain **four distinct pairs**: the pain-denial pair is an exact duplicate across models. The two insomnia pairs share the same control and source but use different mutations. These examples therefore do not represent five independent clinical successes.

## Review rules

- **Mining:** retain a hypothesis only when the specified error follows from the supplied patient, draft or source text. Classify unsupported allegations as false alarms and unresolved interpretations as ambiguous. Missing evidence alone does not demonstrate a false claim.
- **Negatives:** require valid literal spans, a supported returned control, a demonstrably unsupported mutation and one interpretable claim change. Keep unverified medical statements in a compound control outside acceptance, even when one edited atom is demonstrably wrong.
- **Scope:** support against a supplied passage means fidelity to that passage. It does not certify its clinical recommendation, diagnosis, applicability or routing decision.
- **Consequence:** “retain” means a candidate in this review artifact only. It grants no corpus admission, clinical approval or permission to release an answer.

## Mining findings

| Task | Cascade final | Nano final | Engineering review |
|---|---|---|---|
| 001 | Two proposed issues | Length failure | Cascade correctly identifies that two reported fever days do not support a structured five-or-more-day finding. Its additional allegation about omitted rash imports an unprovided disease-specific prerequisite and is rejected. |
| 002 | Length failure | Length failure | No completed critique. No inferred credit from partial reasoning. |
| 003 | One proposed issue | Length failure | Cascade correctly identifies that the patient did not report bilateral nasal symptoms. Retain that narrow inference problem; its added suggestion that bilateral implies symmetry is unnecessary and is not adopted. |
| 004 | Length failure | Length failure | No completed critique. |
| 005 | Length failure | Length failure | No completed critique. |
| 006 | Length failure | Length failure | No completed critique. |
| 007 | No issues | One proposed issue | Both miss the instruction asking the patient to tell the dispatcher after losing consciousness or stopping breathing, without another actor. Nano instead questions whether responders will perform an ECG and start treatment; the packet lacks a protocol to resolve that claim, so its allegation is ambiguous. |
| 008 | Length failure | Length failure | No completed critique. |

The issue in task 007 is an actor/capability contradiction visible in the draft. An empty source field does not prevent identifying that contradiction. Conversely, the same empty field does not establish that every statement about expected care is wrong. Both distinctions matter when interpreting the local critics.

Cascade's task 001 illustrates why exact anchors are insufficient: both the useful numeric finding and the unsupported rash allegation passed literal checks. The model's claim that it used no external knowledge does not validate its disease-specific explanation.

## Hard-negative decisions

| Model / task | Decision as returned | Supported scope or rejection reason |
|---|---|---|
| Cascade 009 | Reject | Changes a heart-attack association from “can mean” to “cannot mean.” The changed medical relationship has no supplied source; the patient symptom report alone does not verify it. |
| Cascade 010 | Retain textual candidate | “No pain at all.” → “Pain was present.” The original patient explicitly denies pain. One symptom-polarity change. |
| Cascade 011 | Retain textual candidate | Removes middle-ear effusion from the source's three required AOM criteria. The source explicitly requires all three. This tests source fidelity, not whether that compiled rule is clinically authoritative. |
| Cascade 012 | Retain textual candidate | Changes lack of energy to increased energy. The source supports lack of energy and the patient reports tiredness. The mutation attributes an unprovided consequence to this particular source; no universal biological exclusion is claimed. |
| Nano 009 | Reject full pair; retain the idea separately | Changing 30 to 15 minutes visibly misstates the patient. However, the returned control also asserts a heart-attack association and immediate ECG/blood-test requirements without source support. A future narrowed temporal fixture would need a separately reviewed control. No rewritten pair was admitted here. |
| Nano 010 | Retain textual candidate; exact duplicate | Same control and mutation as Cascade 010. Count as one distinct pair despite two successful generations. |
| Nano 011 | Reject | Literal failure: the claimed exact source quotation adds “Acute otitis media (AOM)” where the source says “AOM.” Separately, the mutation preserves “cannot be established” and appends an opposed source attribution, producing a compound contradiction rather than a clean replacement. Neither the quote nor the mutation was repaired. |
| Nano 012 | Retain textual candidate | Changes “can cause” to “cannot cause,” directly reversing the supplied source's statement about daytime sleepiness and lack of energy. Same underlying source/control as Cascade 012, but a different mutation. |

Nano 009 is deliberately counted conservatively. Its temporal edit is useful evidence that the model can draft a simple inconsistency, but that does not validate every clause of its returned control. Cascade 009 is more limited: the changed proposition itself requires external medical support. Neither becomes a fully supported returned pair under this review's rule.

## Practical conclusion

The observed useful role is **drafting small, source-anchored textual contrasts for later review**. These runs do not establish a dependable open-ended fixture miner, a binding critic suitable for release decisions, or a substitute for the configured paid producer. Most mining attempts exhausted their output allowance; completed criticism included a false alarm, an ambiguous allegation and missed an internally impossible instruction.

No further mining was dispatched for this review. Existing model settings, sources, router behavior and physician gold were unchanged. The selected development examples cannot establish generalization, diagnostic accuracy, safety, or a reduction in paid promotion-evaluation requirements.

## Reproducible records

- [Machine-readable review of all 24 slots](../outputs/local-mining-engineering-review-2026-09-15.json): each proposal, decision, proof, model identity, input hash and raw/result/request/plan hashes; includes all failures and duplicate relationships.
- [Cascade frozen input plan](../outputs/local-cascade8b-4096-2026-09-15/plan.json), with adjacent `mining-001` through `mining-012` raw responses and results.
- [Nano frozen input plan](../outputs/local-nano-mining-2026-09-15/plan.json), with the same adjacent artifact names.

Raw final JSON was checked against parsed result output. Every input and prompt-message pair matched across configurations. These checks establish record consistency, not clinical correctness. The machine-readable artifact explicitly records **no human review, no physician attestation, no clinical approval and no automatic gold/corpus admission**.
