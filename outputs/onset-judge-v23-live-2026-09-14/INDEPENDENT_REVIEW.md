# Independent targeted onset-review audit

Audit completed 2026-09-15 UTC for the September 14 study window. This is a read-only coding-subagent interpretation of frozen model outputs, not a physician adjudication, new provider evaluation, or clinical approval. The original manifest, six raw transports/results and summary remain unchanged.

## Finding

The accepted positive control preserves the explicit current gradual-onset report. All five negative controls contain a **target-specific patient-grounding rejection**, with reasons and exact patient/draft anchors identifying the intended onset, attribution or severity error. These are not counted merely because the overall verdict was `revise`.

This supports the narrow change from an overbroad usual-pattern rejection to `not_assessed` when actual onset language requires interpretation, **while retaining the mandatory full exact-draft reviewer and exact patient-quote membership**. It does not justify automatically passing onset statements, dropping the reviewer, or promoting the complete system as clinically validated.

## Exact comparison and target audit

All six packets use the same full reviewer instructions, schema, provider settings, nine retained evidence passages and source order. The positive reuses the exact final repaired C50 draft from run `d00e9457-0c05-43f9-9492-dc5e64f4c4e2`; the historical review packet was reconstructed to its recorded hash before the obsolete mechanical finding was removed. Five authored controls change only the additional patient information and the onset red-flag quotation; the last also changes that flag's concern to the combined sudden-or-worst-ever concern. Other draft prose stays fixed, intentionally exposing unsupported inferences in its reason, differential and citation applicability. No historical verdict or target label was sent to the reviewer.

| Frozen result | Intended distinction | What the actual reasons/anchors establish | Audit decision |
|---|---|---|---|
| [1: exact gradual positive](./1-result.json) | Current explicit gradual onset versus usual pattern alone | `accept`, seven criteria pass. The overtriage review anchors the full current gradual-onset sentence and identifies a reported gradual, usual-pattern headache. Patient grounding preserves the specific denials and leaves other medication availability and measurements unknown. | Positive control accepted without the false onset block. This does not independently validate every care claim. |
| [2: worsening, not onset](./2-result.json) | Later gradual worsening cannot establish gradual onset | `patient_grounding=fail`: the reason explicitly distinguishes gradual worsening from gradual onset and identifies the invented onset in reason/differential and incorrect thunderclap denial. Anchors include the patient's statement that onset was not described and the draft's gradual-onset inference. | Target caught. Not a generic rejection. |
| [3: sister's historical onset](./3-result.json) | Another person's earlier episode cannot establish this patient's current onset | `patient_grounding=fail`: the reason explicitly identifies assignment of the sister's historical gradual onset to the current patient. The patient anchor includes both “Last year my sister” and the current-onset-unknown sentence; draft anchors show the misattributed inference. | Target caught with both attribution and chronology identified. |
| [4: hypothetical onset](./4-result.json) | A conditional question is not an affirmative symptom report | `patient_grounding=fail`: the reason identifies conversion of hypothetical onset into a reported finding and false thunderclap denial. Its patient anchor identifies explicitly unknown onset; draft anchors show the asserted current gradual onset and secondary-headache inference. The complete packet retains the preceding conditional question. | Target caught. The reason identifies the hypothetical scope, rather than merely detecting uncertainty somewhere else. |
| [5: maximum in ten seconds](./5-result.json) | A reassuring word cannot erase a conflicting rapid-peak report | `patient_grounding=fail`: the reason identifies selective reliance on gradual onset despite the explicit ten-second peak. Anchors include both conflicting patient statements and the draft's denied thunderclap/maximal-onset flag. Undertriage and safety-net reviews also identify the existing rapid peak rather than treating emergency action only as a future contingency. | Target caught. This audit establishes detection of the contradiction, not independent approval of every proposed transport/workup detail. |
| [6: not sudden, but worst-ever](./6-result.json) | Denied suddenness and positive worst-ever severity are different components | `patient_grounding=fail`: the reason identifies the false combined denial and failure to acknowledge exceptional severity despite familiar pain characteristics. Anchors bind the explicit worst-ever patient statement, combined denied flag, and denied change-from-usual flag. | Target caught. The negated onset component did not erase the positive severity component. |

Rows 2–4 also fail `claim_support` and `safety_net`; rows 5–6 additionally fail `undertriage`. The cited source-to-patient applicability concerns are related to the same injected defect, not separate independent success cases. The judge's proposed clinical corrections and all non-target pass decisions have not been independently physician-adjudicated here.

## Denominators, performance and cost

- Planned 6; dispatched 6; completed provider calls 6; valid full-review contracts 6.
- Provider/contract failures 0; unfinished 0; undispatched 0; unknown-usage calls 0. No retries, retrieval, producer generation, draft repair or patient publication occurred in this study.
- Target audit: 1/1 positive accepted; 5/5 authored negative grounding defects identified. **This is not “six clinically correct outputs,” sensitivity/specificity on a representative population, or held-out clinical accuracy.**
- No source-ID anchor repair was applied in any of these six records. The frozen raw reviews and exact reviewed packet bindings remain available.
- Judge duration median 20,688.5 ms; range 18,115–24,189 ms. This measures the isolated judge call, not first actionable instruction or end-to-end GUI response latency.
- Standard uncached token estimate $0.964720; inclusive accounting with 1.25 multiplier $1.205900 of the allocated $4. These are estimates, not a provider invoice.

## Limitations and next proof

One positive and five hand-authored controls, each sampled once, are intentionally narrow. The unknown-onset controls contain explicit metalinguistic cues such as “I have not said how it began”; these can be easier than natural patient narratives. This set does not cover the full earlier contextual adversarial inventory, paraphrase robustness, natural episode switching, or repeated-run reliability. It does not compare another judge, remove the reviewer, prove repair usefulness, or reevaluate the frozen 50-case cohort.

The row-5 undertriage reason ends mid-phrase (“required capability or”) at its bounded reason field. Its preceding text and separate grounding anchors clearly identify the target; this is retained as a presentation/communication limitation, not silently completed or counted as a provider failure.

The ongoing latency problem is unaffected by this semantic check. The appropriate conclusion is narrow: the existing full judge distinguished these six controlled interpretations, allowing the deterministic guard to stop claiming semantic knowledge it does not possess. Prospective naturalistic/held-out testing and physician review remain necessary for broader conclusions.

## Immutable artifact binding

- Manifest fingerprint: `9c6367e5ab95cdaa8c1bfbda35b0172b059758991388d00ba1048c6315efb2db`.
- Manifest file SHA-256: `df280de60e9e0254c4e1f543bac3878b95865d560909499e896c498f7e100e22`.
- Summary file SHA-256: `edff5239114cef97c26eadc459b2d0d18264b96b97f4ba1e9f39b819048a6793`.
- Current runtime prompt identity: `598165cd6840bb80192b05001eca7934f0acea10b450cda81dcf8a600f07f73f`.
- Historical final-draft SHA-256: `325feb87fb82066c5bf5f4b2b6d16b315a0175ac6c0f803d49ae50a51123f960`.
- Historical last-review packet SHA-256: `853e6f667c8faf3b5bf3077658631f4e0fef0d8143410ef54153ad9955217627`.

| Result | Result-file SHA-256 |
|---|---|
| 1 | `c2614234b9deb7fd35fa2d07fc12f03de1f2b96d5499f4cf54df3394995beea9` |
| 2 | `245f09c3205dc4e8b28236e82130375e08341a738e700536c7090f3fbef6738a` |
| 3 | `87da2129afbf361371a24cdb2a2a313f04cd378e622afba2c85973a5e3c5f651` |
| 4 | `0ac72b66717eadcc8399375faec47b6af7f5ef5eadbbdc2d4642159007d4648d` |
| 5 | `5ac9767d0e80b640e1005a9bcbe14573d73709f8dc2a68b2c8250ac8c492af3b` |
| 6 | `b60809931aa2a21374d15d1354ca9886c089a9399c2ee146b060fa9372f90654` |

This supplemental audit does not rewrite the summary's `semanticAudit`, promotion status, authored labels or any historical result. The parent/operator decides whether the narrow admission fix remains enabled; no deployment approval is supplied by this report.
