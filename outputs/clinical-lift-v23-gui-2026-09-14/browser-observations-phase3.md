# Actual browser verification, phase 3

Two actual in-app-browser submissions at `/candidate`, using prompt hash `009cfb6ba558b03e2105bb91d6e3fc7d6db06f1ae34ab1e44cf8de17ce1d2e79` and corpus hash `af7e4a8c239c4b084525aba008d56ce833b3a08144cea6237319bf996aa30dbd`. Both completed. All starts are retained in `capture-phase3`; no replacement retries were made.

| Input | Run | Browser-visible result | Timing |
|---|---|---|---|
| Original C13 | `55c8c5c4-3c7a-4d09-9de2-c19f4564a395` | Self-care with concrete wrist-position/observation advice and return precautions; supporting sources, execution identity and saved trace visible. | Four calls; server final 44.76 s; browser question 4.43 s, reply receipt/publication 45.37 s, final 45.38 s. |
| C13 gradual-onset update | `b5a3fc25-5f8e-4e7a-8c82-405f0f2f0dbf` | Self-care after one repair; specific guidance and condition-dependent precautions; no arbitrary weeks-long waiting threshold. | Six calls; server final 70.67 s; browser question 3.37 s, reply receipt/publication/final 70.69 s. |

The correct complete original message was inspected before the first submission, and the previous result was cleared. The update control appended the predeclared exact patient statement while preserving the original message and its denials. Questions explicitly did not block assessment. Receipt versus validated publication is visible in Execution details; these are not paint measurements.

Both answers still differ from the Standard-async physician-development reference. Concrete supported self-care and removal of an unsupported observation interval improve the earlier answer's content, but do not constitute new physician approval or prove the route optimal. The second answer's conditional neurologic precautions and any residual unmet routine task remain reviewable. The full cohort and predeclared content audit must retain this uncertainty instead of converting a successful GUI rendering into clinical correctness.

Neither run required source-ID recovery. Exact recovery of the observed phase-2 failure is covered by offline regression/replay tests; these two new completions are not proof of a live repaired-ID occurrence. The original failed run remains unchanged.

Accounting: $0.820382 estimated base token cost; **$1.0294775 accounted** after the declared 1.25 multiplier plus $0.002 embedding allowance per run. The maximum $8.8164225 reservation was available before each dispatch; after the first run $9.23037875 remained. Cumulative sprint accounted cost before the full cohort is **$51.162824025**.

The capture boundary was set to 23:57:20 UTC and was checked after that boundary at 23:57:25 UTC before any cohort dispatch. No other assessment was started in this window. This phase has two recorded starts, two terminal results and no unknown-cost or unfinished start.
