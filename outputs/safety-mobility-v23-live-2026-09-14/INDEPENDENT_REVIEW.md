# Independent review: post-injury mobility safety policy

Reviewed 2026-09-14 by a separate Codex audit agent. This is an engineering/model audit, not independent physician adjudication. The audit made no provider calls and changed no frozen inputs, raw results, or summary.

## Scope and recommendation

**Support narrow promotion of the appended mobility policy in the full early-safety role**, with actual GUI verification before the next whole-workflow cohort is frozen. This does not promote a different schema, vendor, compact safety model, final disposition policy, or raw rationale as patient-facing prose.

The policy distinguishes a current post-fall hip/proximal-thigh injury with inability to mobilize from historical, quoted, denied, or unrelated injury language, while retaining genuine current caregiver reports. Immediate hospital assessment and appropriate ambulance transport for suspected hip injury or inability to get up are supported by [NHS broken-hip guidance](https://www.nhs.uk/conditions/broken-hip/) and [NHS falls guidance](https://www.nhs.uk/conditions/falls/). The sources do not establish a definitive fracture diagnosis from a message or exclude other causes of a fall.

The parent engineer reported that this narrow promotion was implemented after this raw-output audit, with new full graph prompt hash `ba82c777affebc1a717119671d750d530fe22a2198ef4d089d31533f88834082`. Fresh GUI verification was underway when this note was written; this note does not claim its final outcome. The frozen [summary](summary.json) correctly retains `runtimePromotion: "not_promoted"`, the state at study completion. It has not been rewritten to reflect the later engineering decision.

## Exact evidence reviewed

All 28 complete raw safety outputs, their action-basis admission results, and failures were inspected: numbered `1-result.json` through `28-result.json`. The [manifest](manifest.json) fingerprint is `4b1ac64cb80b20355fd4321feded50c492b697ec6f35d10bca9d46cf10138c00`.

| Measure | Baseline | Mobility policy |
| --- | ---: | ---: |
| Planned/completed calls | 14/14 | 14/14 |
| Authored action-target matches | 12/14 | 14/14 |
| Positive trials admitted as EMS | 4/6 | 6/6 |
| Negative-control escalation trials | 0/8 | 0/8 |
| Provider failures/admission rejections/undispatched | 0/0/0 | 0/0/0 |
| Median safety-call duration | 2,657 ms | 1,987.5 ms |

C48 changed from `SAME_DAY_IN_PERSON` in both baseline trials to admitted `EMS_NOW` in both candidate trials ([1](1-result.json), [2](2-result.json), [15](15-result.json), [16](16-result.json)). The novel immobile-alone and current-caregiver cases retained EMS in both arms. Candidate positive outputs cited the reported current injury and inability to mobilize; quoted and historical controls did not acquire emergency status.

**14/14 authored action-target matches do not mean 14 clinically correct outputs.** These labels assess a narrow action distinction, not every assertion, final care plan, or patient outcome.

The overall paired median duration difference was **−163.5 ms**, independently recomputed from all 14 matched pairs. Comparing separate arm medians overstates this paired effect. C48 safety calls were 2.230–2.510 seconds with the policy versus 7.292–7.702 seconds at baseline, but one chronic-control candidate call took 8.498 seconds. This small run does not establish a general latency improvement or a response-time guarantee. These are safety-call timings, not final-answer or browser-paint measurements.

## Material limits and raw-output caveats

- Candidate [3](3-result.json) calls the event “mechanical trauma”; a reported trip does not justify excluding other contributors to a fall. Candidate [6](6-result.json) says “probable hip fracture,” stronger than the uncertainty needed to justify the route.
- Candidate [22](22-result.json) labels the ankle injury a sprain and broadly denies a need for clinician assessment. The supplied facts do not independently prove that diagnosis or settle all evaluation needs. It nevertheless did not trigger an inappropriate hip-emergency notice.
- Baseline [4](4-result.json) invents difficulty accessing a phone. Baseline [21](21-result.json) says there are no neurovascular or systemic red flags without supporting examination or denials. Passing the authored action target did not detect these assertions.
- The chronic-hip candidate changed preliminary `STANDARD_ASYNC` to `NONE` in both trials ([9](9-result.json), [10](10-result.json), [23](23-result.json), [24](24-result.json)). Both produced no early notice. `NONE` here means no early action, **not self-care or no clinician need**; it must not replace the independent final assessment.
- All raw `patientMessage` fields were empty. The admitted notice is the separate canonical action instruction. Do not expose these raw rationales as validated patient guidance or reuse them as gold labels.

Seven development inputs, including the already-known C48 defect, with two trials per arm cannot establish broad calibration, held-out safety, or current full-cohort clinical accuracy. No independent clinical judge, retrieval evaluation, final-answer comparison, or patient-outcome assessment occurred in this study. The earlier physician-reviewed incumbent cohort remains a separate reference and is not revalidated here.

Next proof: confirm the fresh GUI C48 early notice and final reconciliation, check a stable nonemergency control, then freeze the new implementation identity for the prospective whole-workflow cohort. Preserve any subsequent failures rather than pooling only successful retests with this study.
