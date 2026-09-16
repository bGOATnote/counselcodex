# Nasal history: useful early intake, with measured tradeoffs

## Shipped change

The Haiku intake selector can now ask, in the existing answer panel:

> Any recent surgery—especially brain, sinus or nasal—or past head/face injury, including an object entering your nose? When? Is the drainage watery, one-sided or salty? Also, your age and any immune suppression or major medical conditions?

This replaces the respiratory-risk-only question **for nasal presentations**, not for every patient. It preserves the age/immune-risk questions, adds no model call, and leaves Opus running independently. Relevant public sources appear under “Why these questions?” The question is selected by the model and rendered from a fixed catalog; it does not assert that surgery, trauma, leakage or a reassuring negative history exists. Old saved questions retain their original wording. New patient information uses the existing cancellation/reassessment flow; it does not retroactively validate the earlier answer.

The Sites workflow kept this within the current compact interface—no new form, consent screen or parallel answer card. The original 50-row CSV, original labels and saved physician reviews were not changed. The prior ten commits through `05cc745` were pushed to `main` at the user's explicit request before this extension.

## Clinical evidence and action distinctions

| Presentation | Source-supported concern | Project routing interpretation |
| --- | --- | --- |
| Mild runny nose with unknown history | Cranial CSF leaks can follow injury/surgery but also occur spontaneously. Unilateral watery drainage and altered taste are relevant features. [Mayo Clinic](https://www.mayoclinic.org/diseases-conditions/csf-leak/symptoms-causes/syc-20522246) | Ask targeted history; do not diagnose a leak from a cold or exclude one solely because trauma is denied. |
| Clear/salty drainage after pituitary surgery | The postoperative leaflet directs patients to seek advice for these features; ordinary mucus/crusting can also occur. [Cambridge University Hospitals](https://www.cuh.nhs.uk/patient-information/going-home-following-removal-of-a-pituitary-tumour/) | Contact the operating team **now** for prompt in-person assessment; ED if unavailable. This deadline/fallback is our clinical interpretation, not a universal 911 instruction quoted from the leaflet. |
| Recent head injury with clear nasal/ear fluid, or a wound containing an object | These are emergency warning signs in [NHS head-injury advice](https://www.nhs.uk/conditions/head-injury-and-concussion/). [NICE NG232](https://www.nice.org.uk/guidance/ng232/chapter/Recommendations) also addresses remote emergency referral for suspected penetrating injury. | Immediate emergency action before questions; US localization uses 911. A fall driving an object deeply into the nose raises concern for penetration; intracranial involvement remains unverified. Do not ask patients to remove/probe the object. |
| Postoperative drainage with fever and severe headache/stiff neck or new neurological changes | CUH lists fever/headache/stiff neck and visual deterioration among warning features. | Immediate emergency assessment; do not leave this in an async queue or await intake completion. |

Neither the rarity of a dangerous condition nor normal/missing vital signs clears a time-sensitive presentation. Conversely, remote knee surgery, negated trauma, or a story about someone else's injury must not become a current emergency finding. The prototype's lexical retrieval only selects background notes; it cannot establish subject, timing or clinical meaning. The small corpus now has ten general guidance notes, not a comprehensive RAG service.

All seven research/provider URLs received HTTP 200 in the [final timestamped check](research/link-checks/2026-09-11T00-40-55.854Z-f5238bc1c486.json). A prior transient Mayo network failure is preserved in the [intermediate check](research/link-checks/2026-09-11T00-36-29.219Z-b76a46db53a3.json), as is the [initial five-source check](research/link-checks/2026-09-11T00-19-49.886Z-ec6e0d84befd.json). Body-prefix hashing/truncation is disclosed. Reachability does not establish currency, full-text review, claim entailment or clinical appropriateness.

## What happened to speed?

The [frozen baseline](../data/evaluations/nasal-intake-baseline-v1.json), [predeclared development cases](../src/evaluation/nasal-history.ts), source snapshots and every attempt are retained in the [immutable evidence export](../outputs/nasal-history-20260910-v1.json).

Six paired Haiku-only trials used the same original cold message, rotating baseline/candidate order. Timing ends at complete structured selection, not first token, browser paint or disposition. All 12 selections were structurally valid and selected the expected question.

| Endpoint | Baseline | Initial candidate |
| --- | ---: | ---: |
| Median complete intake selection | 892.5 ms | 1,630.5 ms |
| Slowest observed selection | 1,273 ms | 2,386 ms |
| Median within-pair increase | — | **784 ms** |

The candidate met the exploratory median ≤2-second target but **missed** the ≤500-ms paired-increase target. Difference of medians is 738 ms; it is not the same estimator as median paired difference. Six repetitions of one message cannot establish a percentile SLA or non-inferiority. The broader prompt was subsequently corrected; those six pairs were not repeated on the final prompt. Final targeted N01 intake arrived in **1,739 ms**, versus 1,879 ms in the intermediate retest. These are workflow/server event times, not browser paint measurements.

The change adds a catalog choice and a short safety instruction, not a serial agent. Haiku still returns only `emergency`, `quote` and `questionId`; Opus runs in parallel. The strategy follows Anthropic's advice to measure latency, bound output and stream useful responses, while keeping unchecked token fragments out of the patient response. [Anthropic latency guidance](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-latency).

Two Opus answers initially hit the 1,400-output-token ceiling. Opus 5 defaults to adaptive thinking, and thinking shares that ceiling with answer text. Installed Mastra provider code confirms the setting was previously omitted, rather than explicitly disabled. The new configuration makes **adaptive thinking/high effort explicit**, with 2,400 tokens of headroom; it does not reduce reasoning effort or raise the 170-word target. One repaired postoperative answer used 1,536 output tokens—more than the old ceiling. This is consistent with the truncation diagnosis, not an isolated causal trial. [Opus 5 behavior](https://platform.claude.com/docs/en/models/opus-5/whats-new-opus-5), [effort control](https://platform.claude.com/docs/en/build-with-claude/effort).

Final care remains slower than intake: the last four targeted runs took **7.40–15.46 seconds**, and the intermediate postoperative answer took **17.99 seconds**. This work does not meet a universal sub-10-second final-answer target.

## Red-team findings—not just label agreement

Primary phase: 12 isolated intake calls plus ten complete-workflow attempts. Six of ten workflow attempts completed; four were rejected/failed. Seven routes/floors matched the broad development expectation, but that number hid an inappropriate automatic 911 call in the isolated postoperative case. These are not clinical accuracy scores.

| Observed failure | Correction and verification |
| --- | --- |
| Postoperative clear/salty drainage without other emergency features triggered automatic 911 | Strong contrasting Haiku instruction: surgery is not acute traumatic head injury. Intermediate N02 retest selected no fast emergency and Opus recommended same-day surgical assessment, team now/ED fallback. This is one retest, not validated specificity. |
| Exact quote changed `No fever,` to `No fever.` | Prompt now forbids added punctuation; exact substring validation remains strict. New quote test and subsequent N01 runs. |
| N02/N05 lost final answers at the output cap | Increased headroom while preserving high effort; later runs completed. No retries or hidden substitute answer. |
| Routine nosebleed positioning added to a penetrating injury | Prompt and targeted rejection; N03 retest removed it. Emergency action preceded the question/final answer at **1,315 ms**. |
| `I feel awake` became denial of reduced consciousness | Narrow provenance/interpretation regression. Report wakefulness; do not infer a neurological examination. |
| Denied surgery/trauma was used to exclude a CSF-leak pathway | Prompt and targeted causal-phrase check; spontaneous leakage remains possible. |
| Appropriate `normal vitals cannot be assumed` failed the clearance check | Exempt only that bounded limitation phrase, not its full sentence. A later unsupported clearance still fails. |
| Intermediate N01 said `without reported red flags` despite unknown breathing status | Extend the blanket-clearance check; subsequent N01 named specific symptoms instead. |
| Final N01 said `worsen past ten days` | New targeted check separates worsening from persistence. Prompt corrected **after** the last paid run. |
| Final N05 declared absent readings unnecessary; N05/N06 recommended saline rinses without technique/water-safety support | New checks reject those observed assertions; current corpus/prompt does not support nasal-irrigation advice. This is not a general clinical prohibition on irrigation. **Offline regression only**, not a subsequent live retest. |

All four final retests originally passed the then-current software checks and matched the expected routes. Subsequent review still found the last two rows above. The export preserves those historical results and the replay state at export; the current test suite explicitly replays N01/N05/N06 to demonstrate the newly detected failures. **Do not present 4/4 route matches as 100% clinical correctness.** N03's certainty about injury depth and the scope/completeness of every safety-net instruction still merit independent review.

The final safeguards were verified with **256 software tests** (65 core, 79 Mastra/agent, 18 CQA, 94 UI/storage/HTTP), TypeScript, syntax checks and production builds. Software checks reject selected known errors; they are not a general clinical reasoner or calibrated independent judge. The last wording-only prompt/check changes were not live-retested because the allocated project ceiling was reached. They may increase rejection frequency; this remains unmeasured.

## Audit, costs and reproducibility

All **28 attempts** are accounted for: 12 isolated intake calls and 16 workflow attempts across three phases. Every phase has a hashed pre-dispatch manifest, source snapshot, starts, outputs/failures, usage and summary. Actual full workflows preserve Mastra run/trace IDs and persisted event sequences. Isolated intake timing trials are directly logged Mastra Agent calls, not complete workflow traces. Source labels and adjudications never enter the model prompt. Historical output is never rewritten after a guard changes.

Estimated known token cost of these attempts: **$0.651376**; no missing usage within this pilot. This is not a provider invoice. The conservative new reservation ceilings were $18 plus a separate final $3 verification allowance. Existing $79 + $21 = **$100 allocated ceiling**, not $100 spent. Old ledgers remain unchanged; no further automated allowance was created. Existing interactive allowance is unchanged, not replenished.

```bash
npm run disposition:nasal-pilot                # dry protocol, no provider call
node --experimental-strip-types scripts/disposition-nasal-report.ts  # offline integrity verification
npm run disposition:test
npm test
npm run review:test
npm run typecheck
npm run lint
npm run review:build
npm run build
```

Do not delete ledgers or regenerate an export to hide failures. Next validation should be a separately funded, frozen repeated study with independently reviewed nasal and non-nasal cases, emergency sensitivity/over-alerting, denial and temporality errors, final-answer rejection rate, claim entailment and browser latency under load. No physician adjudication, HealthBench result, clinical non-inferiority or zero-harm guarantee is claimed for this iteration.
