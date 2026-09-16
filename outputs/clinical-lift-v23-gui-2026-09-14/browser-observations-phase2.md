# Actual browser verification, phase 2

Observed in the in-app browser at `http://localhost:4120/candidate` on 2026-09-14, after the mobility policy promotion and before source-reference repair. These are development rehearsals, not independent clinical validation. All three starts and original outcomes are retained in `capture-phase2`.

| Case | Run | Observed result | Timing |
|---|---|---|---|
| C48 | `9b07c3a4-839e-42e3-89a6-7334ba503192` | Emergency / EMS instruction visible while the independent final assessment continued; final emergency response and sources rendered. | Early action 4.127 s server / 4.96 s browser receipt; final 75.439 s server / 76.27 s browser receipt. |
| C13 | `1ebcdb1a-8994-4aec-850f-87aa017ec314` | Clinician review required. The producer proposed standard async and the raw judge accepted, but its source anchor had an invalid 58-character ID. Contract rejection was retained, not counted as a completion. | 43.602 s server; four model calls. |
| C13, gradual-onset update | `9231f110-c833-496d-a1c5-efabe3db59bc` | Self-care response, differential and sources rendered. The original message remained in the input, followed by the exact submitted update. A nonblocking question was received. This differs from phase 1's standard-async route and requires clinical assessment as an alternative, not automatic agreement or automatic failure. | Question 4.69 s browser receipt; final 53.16 s server / 53.17 s browser receipt. |

Consecutive case selection cleared the preceding response and showed the correct full message before submission. The follow-up used the actual GUI update control with: “It came on gradually over several days, not suddenly. There is still no weakness or trouble speaking.” The resulting input preserved the original 55M message and attributed the addition as patient information.

C13's failed reference quote was an exact, unique 82-character passage from a source in the judge's actual packet. The intended repair is limited to that wire-reference boundary and must preserve raw output, verdict, quotation, patient information and source content. It does not retrospectively change this run's failure.

C48's earlier instruction improved relative to the phase 1 rehearsal, but its approximately 75-second final answer remains slow; this observation is not a general latency guarantee. C13's follow-up self-care disposition is not newly physician-approved.

Accounting: three known-usage runs, $1.144598 estimated base token cost; with the prospectively declared 1.25 contingency multiplier and $0.002 per-run embedding allowance, **$1.4367475 accounted**. No unknown-cost starts. The capture script's base-cost field is not the complete contingency accounting. Browser receipt measures arrival of data, not browser paint.
