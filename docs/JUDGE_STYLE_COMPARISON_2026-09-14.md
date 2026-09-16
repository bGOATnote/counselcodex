# Judge calibration and shorter review experiment

Status: the authorized 28-call fixed-packet comparison is complete. Estimated provider cost: **$2.53834 of the approved $20 maximum**. All attempts, including raw model output and usage, are retained. No provider or validation failures occurred. The shorter reviewer is eligible for controlled end-to-end verification, **not automatically promoted**. It remains opt-in (`COUNSEL_GRAPH_JUDGE_STYLE=concise`); the configured default and existing GUI process were not changed by this experiment.

## Measured result

| Measure | Full calibrated judge | Concise calibrated judge |
| --- | --- | --- |
| Completed, valid calls | 14/14 | 14/14 |
| Planted defects detected on their target criterion | 7/7 | 7/7 |
| Clean target-criterion controls passed | 7/7 | 7/7 |
| Median review completion | 19.1545 s | 13.662 s |
| Median output tokens | 1,034 | 741.5 |
| Total output tokens | 14,255 | 10,225 |
| Estimated provider cost | $1.36026 | $1.17808 |

The concise judge was faster on all 14 packets. Its median completion time was 28.7% lower; the median **within-packet** saving was 5.0115 seconds. These are judge-call times, not full response or GUI latency. No p95 estimate, clinical noninferiority, reduction in repair count, or end-to-end improvement is established by this single-draw study.

Both styles agreed on all 14 overall release verdicts and **97 of 98 paired criterion verdicts**. Agreement is not correctness: only one targeted criterion per packet had an authored reference label. An independent read-only audit confirmed that every detected planted defect identified the intended assertion, rather than rejecting for a different issue.

### Retained disagreement and promotion decision

For `gjc-v1-source-eligibility-as-fact-defect`, the draft invents absence of cardiovascular disease and uncontrolled hypertension while marking those histories unknown elsewhere. **Both judges identify that contradiction, fail patient grounding, reject the draft and request the same repair.** The full judge additionally fails `claim_support`; the concise judge passes that criterion using the genuine general migraine claim and prescribing limitation as anchors.

This is a scoring-boundary ambiguity, not an observed release regression. If claim support includes fabricated patient-specific medical facts, the concise result is a criterion-level false pass; if those facts belong exclusively to patient grounding, the full result duplicates that finding. The present rubric does not explicitly make the categories exclusive. The disagreement is not erased or counted as equivalence, and neither arm's overall release judgment is treated as a physician gold label. Inspect [full attempt 13](../outputs/judge-calibration-live-2026-09-14/13-result.json) and [concise attempt 14](../outputs/judge-calibration-live-2026-09-14/14-result.json).

The independent audit also identified a **shared evidence-coverage limitation**: both judges accepted neurological emergency precautions in sparse migraine packets without a directly supporting passage for that threshold. This is not evidence that the precaution is clinically wrong, nor a concise-versus-full regression. It does mean target perfection and judge agreement cannot establish complete source support. Retain the source-coverage gap when evaluating the broader pipeline; these controls did not supply reference labels for every medical claim.

**Decision:** retain the full default for now. The frozen study's predeclared signal is `eligible_for_gui_verification`, not permission to skip verification. Next, define the criterion boundary explicitly and test the chosen reviewer on live emergency, prescribing and follow-up paths—including issued early-action correction, EMS and handoff review, which these packets did not exercise. Do not weaken the all-criteria admission gate or rewrite this study after changing the rubric.

Immutable records: [manifest and frozen prompts](../outputs/judge-calibration-live-2026-09-14/manifest.json), [all-attempt summary](../outputs/judge-calibration-live-2026-09-14/summary.json), and the 28 started/result file pairs in that directory.

## Why this change

Seven retained v13/v14 GUI runs contain 11 critic calls: 297.705 seconds in aggregate, 12,190 output tokens, median 26.306 seconds and 1,100 output tokens. All four migraine runs required one repair. A single all-pass review could still take approximately 25 seconds. These measurements identify review and repair as a material bottleneck; they are not a population latency estimate.

The most important observed misses were semantic, not schema failures:

- C04: narrative asserted spreading redness while the structured inventory correctly marked spread unknown.
- C50: being out of sumatriptan broadened into having no rescue medication available.
- Some reviews defended a correct sentence while missing an incompatible assertion elsewhere.

Exact quotations establish evidence identity, not complete narrative coverage or entailment.

## Implementation

1. `cross-field-review/v1` requires reconciliation of patientMessage, reason, differential, vitalSigns, redFlags and citation applicability against the original patient message. It explicitly distinguishes a conditional precaution/general source statement from a patient-specific finding.
2. The concise style appends output-economy instructions to the **same** calibrated judge instructions. Models, seven decisions, schema, input packet, reasoning level, token ceiling, early-action correction, EMS binding and ownership rules stay unchanged. Brevity is not a new rejection condition; no response is truncated to meet a character target.
3. One bounded repair and independent review of the exact repaired draft remain. No final draft is published merely because it is faster or matches the reference route. No keyword routing was added.
4. Live and frozen reviews share `graphJudgePacket`. Test labels, variants, case identifiers and provenance cannot enter through that constructor. Original data, source snapshots, physician reference and historical results remain unchanged.
5. Fixed the cohort evaluator's version coupling: v13–v15 retain v12's decoded exact-quotation and typed EMS-binding semantics. Older and unknown versions retain their historical interpretation.

This approach follows task-specific evaluation and calibrated automation, rather than treating developer tests as clinical quality evidence. [OpenAI evaluation guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices). Shorter output is a plausible latency lever, but its benefit must be measured with quality held accountable. [OpenAI latency guidance](https://developers.openai.com/api/docs/guides/latency-optimization).

## Fixed-packet evaluation

Fourteen engineering-authored packets form seven balanced minimal pairs:

| Family | Defect | Target |
| --- | --- | --- |
| Symptom trajectory | Redness becomes spreading redness | Patient grounding |
| Medication scope | One unavailable medicine becomes all rescue medicines | Patient grounding |
| Measurement | Fever denial becomes measured normal temperature | Patient grounding |
| Temporal scope | No new symptoms becomes no symptoms | Patient grounding |
| Eligibility | Source contraindications become absent patient history | Patient grounding |
| Attribution | Sister's weakness becomes patient's weakness | Patient grounding |
| Source contradiction | A contraindication table becomes universal eligibility | Claim support |

Within each pair the patient, route and evidence stay fixed. A targeted assertion changes. Only the stated criterion has an authored reference label: a correct patient-grounding control does **not** assert that the whole response is clinically adequate. All other judge decisions remain in raw outputs for examination.

The design is not physician calibration, a held-out cohort, a new clinical gold standard, or an efficacy estimate. It is a regression/calibration challenge derived from observed failures. It also does not isolate the effect of adding the calibration instructions compared with v14: both experimental arms receive them. The isolated intervention is the concise-output instruction appended to the calibrated full prompt.

Executed comparison: 28 sequential calls, one per packet/style; fixed deterministic interleaving alternates arm order. Same `openai/gpt-6-astra` model, low reasoning, schema, evidence, policy and provider sampling defaults; 2,400 output-token ceiling, one step, no retries. Application `contractFindings` are omitted from both arms; ordinary handoff-language hints remain identical (empty in these fixtures). Both arms completed all seven criteria without truncation or validation failure.

The predeclared promotion signal requires all concise target labels correct, all 28 reviews structurally valid, and a lower median paired completion time. It only authorizes proceeding to GUI verification. Failures, abstentions, omissions, false alarms, missed defects, raw reviews, output tokens, durations and estimated costs are retained. One sample per packet cannot establish p95 latency or reliable clinical performance.

## Reproducibility and spending

Current immutable design: `outputs/judge-calibration-design-v2-2026-09-14/manifest.json`. The earlier design is retained rather than overwritten.

Dry run:

```sh
MASTRA_TELEMETRY_DISABLED=true node --experimental-strip-types scripts/graph-judge-calibration.ts --output=outputs/NEW-UNUSED-DIRECTORY
```

Live execution additionally requires `--live --authorization=PATH`. The authorization must contain explicit approval, its user reference, the exact manifest's `studyFingerprint`, `maximumUSD`, and `maximumCalls: 28`. The script consumes that authorization once and binds it to the study and output location. Reusing it in a fresh directory fails before provider dispatch.

The user explicitly approved $20 for these 28 calls on 2026-09-14. This is not a provider balance assumption or a change to provider/account limits. Before each call a conservative request estimate had to fit the remaining allowance; known token cost was then reconciled. Unknown usage would have retained the reservation; none occurred. Repeated failures can stop the study early; omitted calls cannot support promotion. All 28 started reservations and 28 result records are present, with no retries or omitted attempts. Cost estimates are not invoices. No extra GUI calls or repeat experiments were charged under this comparison.

Frozen study fingerprint: `c0b52eac6004d9635bc288c59b7fed9d5c908f96b0ebab662b02dc36256b599f`.
Artifact SHA-256: manifest `8d430c0005260eba76acbd74097ee9da2c4944f1bd328e0bcabb53a506e620bf`; summary `505aa6cbb097f7d5e799cb414c93b6f3d6a271fad0b6bef663b3a1c28335a9c0`.

Each attempt gets a write-once started record before dispatch and one result record. Persistence failure stops further calls; it cannot manufacture a second attempt or consume the same reservation twice. A process interruption leaves the authorization consumed and its started records available for reconciliation.

## Verification and next gate

- Full root software suite passed; evaluation-app suite passed (152 tests).
- Type-check, lint, Next and Mastra production builds passed. The sandboxed Mastra dependency install stalled; the network-enabled build completed successfully.
- Focused contradiction, study, graph and cohort regression suites were rerun after the study: all 80 passed.
- The authorized provider comparison is complete, with the scoped measurements above. Type-check and lint were rerun successfully after the study. No GUI or clinical-readiness claim is made.

All off-target criterion comparisons have now been inspected. Subsequent end-to-end verification should run consecutive actual GUI C02, C04, C50, an unchanged-migraine follow-up and an EMS follow-up. Keep the user's existing tab/reviews intact. Record early action, final latency, repair count, exact review result and all failures. Promote the shorter style only if those observations support it; do not remove necessary clinical review to improve timing.

### Subsequent GUI gate — completed, promotion not established

The requested controlled GUI verification subsequently ran ten assessments, with all attempts retained and an estimated additional cost of **$4.089683** under the later GUI-testing request—not the consumed 28-call authorization. Six v15 baseline attempts included two withheld migraine responses. Four later v16/v17 fix-verification attempts tested C30 and updates; these changed policy/prompt phases are not a judge-style ablation. Repair paths still took approximately 79–89 seconds and source/grounding/safety-net/ownership inconsistencies remained. Default judge style is still `full`; the tested local `concise` override is not a promotion.

See [C30 and GUI findings](C30_NECESSITY_AND_GUI_VERIFICATION_2026-09-14.md) and `outputs/candidate-concise-gui-2026-09-14/`. The frozen 28-call artifacts remain unchanged. Current code now includes later prompt revisions, so a new dry run produces a new study fingerprint; it is not a byte-identical rerun of the frozen comparison.
