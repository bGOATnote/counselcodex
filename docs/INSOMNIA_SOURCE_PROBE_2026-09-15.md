# Isolated insomnia source-replacement producer probe

Status: prepared, **not run or promoted**. No live retrieval, embeddings, GUI, judge, repair, policy change or physician-approval claim.

## Question and intervention

Does replacing the selected MedlinePlus insomnia passage with the frozen NHLBI paragraph change the actual full-producer explanation and cited claims? The primary manual-review question is whether one-month chronicity is repeated, or the three-nights-per-week **and** three-month qualifiers are retained without diagnosing this patient's symptom duration/frequency from missing data.

Use six paired first attempts of the unchanged original insomnia message (C47). A uses the exact selected historical sources. B removes only selected chunks whose **document ID** is `medlineplus:6055`, inserts one NHLBI chunk at the first removed position, and preserves every other hit, source/quote ID and relative order. It is a counterfactual packet, not evidence of live retrieval performance. Replacement changes the passage, its provenance/length and available evidence together; this experiment cannot isolate chronicity wording from other differences in the paragraph.

Both arms use the prior ownership study's **baseline/full prompt**, original full-schema contract, original patient and generated context, model, token budget, effort and provider options. The ownership treatment paragraph is not used. Neither gold, original dataset labels, historical decisions nor early safety outputs enter either model packet. Compiler replay may inspect previously issued care as an evaluation-only no-downgrade check.

The frozen [NHLBI source candidate](NHLBI_INSOMNIA_SOURCE_CANDIDATE_2026-09-15.md) includes the complete introductory paragraph from [Insomnia — Diagnosis](https://www.nhlbi.nih.gov/health/insomnia/diagnosis), publisher update 2022-03-24. It is official patient education, not a primary guideline or an independent currency/applicability review. The source does not assign an async priority or establish this patient's diagnostic eligibility. Raw-response hash, exact selected prose, chunk offsets, licensing attribution and quote spans are retained. Reachability on the capture date is not current clinical validity.

## Freeze and accounting gates

Planning refuses while the ownership study holds a run lock, lacks any of its 100 first-attempt started/result/evaluation artifacts, or its final report differs **byte-for-byte** from deterministic rescoring. It verifies the previous execution/allocation claims and frozen files, then carries forward final accounted spend, including earlier outstanding reservations, under the existing **$90** authorization.

At preparation, the parent reported $73.353706 cumulative conservative accounting and $16.646294 remaining. These are explanatory figures only: the runner derives its budget from the verified report, never these prose numbers. Known usage uses the same doubled-input conservative estimate as the prior study; this is not a provider invoice. Unknown, invalid or interrupted usage retains its complete reservation.

Before dispatch, all **12** worst-case reservations must fit within the remaining authorization. A single fixed mission claim prevents starting another output directory with the same allowance. The plan hashes all execution/evaluation code used by the study, new source/probe files, raw response, prior plan/report/claims, all 50 bound histories and all 350 prior started/result/evaluation/reservation journals. The same 50 cases must have exactly one full and one brief slot. Runtime/ICU identity preserves quote segmentation. Started slots are never reissued on resume; raw results are saved before evaluation. An interrupted run lock requires inspection, not automatic deletion or retry.

## Commands — parent executes only after review

```bash
node --experimental-strip-types scripts/insomnia-source-probe.ts plan outputs/insomnia-source-probe-2026-09-15
# Inspect the frozen plan, exact packets, reservations and printed fingerprint.
node --experimental-strip-types scripts/insomnia-source-probe.ts run outputs/insomnia-source-probe-2026-09-15 EXACT_PRINTED_FINGERPRINT
node --experimental-strip-types scripts/insomnia-source-probe.ts score outputs/insomnia-source-probe-2026-09-15 report-replay.json
```

Do not edit frozen files after planning. Do not rerun to replace an unfavorable or failed first attempt. No call is issued by importing the module, running tests, planning or scoring.

## Reading results

`report.json` retains all 12 planned rows, attempts, raw provider outputs, failures, usage, source-reference evaluation and full compiler checks. Scoring verifies the frozen files and recomputes each stored evaluation from its bound raw result; altered or detached evaluations are rejected. `review.md` presents the original message and each arm/repetition's resolved draft or raw failed output for manual inspection. The resolved draft retains exact source quotations alongside the model's quoted claims.

Read these separately:

- Source-reference integrity: did each selected quote ID resolve to the exact retained passage? This is not entailment.
- Full-response compiler admission: did the existing deterministic checks pass? This is not clinical correctness or permission to publish a response.
- Manual claim review: does the prose accurately preserve the source's qualifiers and avoid attributing an unsupported diagnosis, patient history, duration, frequency, urgency or setting? Record the exact claim/quote and a justified adjudication separately.
- Route changes, output latency and dollar estimates: descriptive only, with missing/failed rows visible. Six correlated repetitions of one development message do not demonstrate held-out clinical lift.

Until separately reviewed, `claim_support`, `clinical_correctness`, `unsafe_advice` and `unsupported_claims` are **not_assessed**. No regex is treated as a semantic judge. Merely citing NHLBI or emitting “3 months” is not success: the full claim, scope and patient application matter.
