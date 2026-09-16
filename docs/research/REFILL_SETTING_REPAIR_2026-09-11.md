# Refill review is not automatically in-person care

## Incident

The user's C50 run, `8a967b8c-d373-48b2-8da6-b82d9857df3f`, incorrectly treated an unchanged migraine and sumatriptan refill as requiring same-day in-person assessment. Haiku selected the refill sentence as its same-day evidence; the application made this an irreversible care floor. Opus then rationalized the imposed setting using unassessed contraindications. The original run remains unchanged.

This is an over-triage mechanism: a valid quotation is not necessarily evidence that physical presence is required. The drug label's contraindications were relevant to prescribing, but did not substantiate a universal in-person refill requirement.

## Clinical and operational boundary

- **Asynchronous physician review:** the initial channel for clinician history, reconciliation and refill eligibility when the reported presentation does not require physical assessment. Review can be needed today; that does not make the channel an urgent-care examination. No prescription, completed referral or appointment is implied.
- **Same-day in person:** reported clinical features require examination, testing or treatment today that cannot reasonably be provided through the thread.
- **Emergency now:** time-critical assessment/action; not a same-day appointment. Concerning new symptoms override a refill request.

Unknown information is neither a negative finding nor an automatic abnormality. Medication contraindications still matter. The correction is not “all refills are async,” nor approval to prescribe sumatriptan without appropriate evaluation.

## Evidence and limits

[Sumatriptan labeling, section 5.1](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=352d2ab3-d2c7-48c8-bcd4-d46ed9bdfa85) specifies cardiovascular evaluation for triptan-naive patients with multiple cardiovascular risk factors, and periodic consideration for certain long-term users. Section 5.4 distinguishes atypical symptoms from established migraine. This does not impose an in-person visit for every renewal. Link successfully retrieved on 11 September 2026; patient/product applicability is separate.

[NICE CG150, recommendations](https://www.nice.org.uk/guidance/cg150/chapter/recommendations), updated 3 June 2025, identifies headache features that merit further investigation/referral, including rapid peak intensity, new neurological deficit and worsening headache with fever. It does not assign every listed feature to the same urgency bin. Indexed text was accessible; direct retrieval returned HTTP 403, which is not recorded as a successful link verification.

[The randomized telemedicine migraine follow-up study](https://pubmed.ncbi.nlm.nih.gov/31450969/) concerns synchronous specialist video follow-up after an initial clinical assessment. It supports the feasibility of remote follow-up in that context, **not** equivalence of unassessed autonomous asynchronous prescribing. [AMF's telemedicine account](https://americanmigrainefoundation.org/resource-library/telemedicine-for-migraine/) likewise cannot establish this prototype's efficacy. The choice of initial asynchronous clinician routing is a project clinical/operational interpretation informed by the message, these boundaries and the assignment—not a direct trial result.

## Implemented

1. One care-setting policy shared by the two agents, explicitly separating urgency, physical presence and prescribing authority.
2. Live same-day intake requires a declared physical-care need and rationale as well as an exact patient reference. Prescribing-review-only and missing-information-only reasons cannot become same-day care floors. This is a structural guard, **not** an independent semantic assessment of a rationale marked physical care.
3. Separate regression protection against calling a medication-only request “asymptomatic.” Unreported symptoms must remain unreported.
4. Original cases, reviews, previous failed outputs and provider ledgers remain unchanged. No model challenger was evaluated.
5. A short, application-authored prescription-review acknowledgment can appear after intake when no urgent action or question takes precedence. It is not a disposition, prescription approval or completed handoff. Its latency is recorded separately from the final answer.
6. The browser's stream reader and server now share that acknowledgment contract. The first v24 browser attempts exposed that the reader rejected the new text and canceled the stream. Those failures are retained; they are not provider failures or successful early responses. An initial attribution to development reloads was incomplete and is superseded by this reproduced contract mismatch.
7. Production rendering now supplies a fresh CSP nonce to hydration scripts. Previously, static HTML lacked the nonce required by the response policy, so the production controls remained disabled. Dynamic document rendering fixes this without relaxing the policy, consistent with [Next.js's nonce documentation](https://nextjs.org/docs/app/guides/content-security-policy). A repeatable production smoke check verifies all four GUI routes, distinct per-response nonces, and every script's matching nonce. Actual browser interaction remains required in addition.

The local server was changed from `next dev` to the built `next start` GUI. This avoids development rebuilds during a presentation; it is not a remote deployment. To restart it, run `npm run review:build`, then `npm run start --workspace apps/evaluation`. Do not run a development and production server against the same port/build directory during rehearsal.

## Verification

- `npm run typecheck`, `npm run lint`, `npm test` (285 tests), `npm run review:test` (104 tests), `npm run review:build`, and `npm run build`: passed after the v25 correction.
- `node --experimental-strip-types scripts/production-gui-smoke.ts`: passed on the final production build. Both root requests, `/review`, `/v0`, and `/quality` returned HTTP 200 with distinct nonces and matching script tags. Browser controls hydrated and accepted consecutive case changes.
- GUI checks used the actual selected message, Assess message button, streamed response and Update assessment form. No fixture or endpoint-only call substitutes for these observations. Authored tests are not a held-out clinical validation set.
- Three v24 browser attempts canceled after the unrecognized acknowledgment. All remain in the record. Server emission times on these failed attempts must not be interpreted as successful patient receipt.

### Browser results

[Append-only rehearsal manifest](../../outputs/gui-rehearsal-2026-09-11/1789156919239.json): **14 attempts**, including **10 completed responses, 1 awaiting-input result and 3 canceled failures**. All 14 report persisted run artifacts, traces and event logs. The original incorrectly escalated C50 incident predates this window and remains separately identified above. The debugging sequence changed versions; it is not a fixed-version success-rate estimate.

| Version / case | Observed result | Early event, server time | Final / end, server time |
|---|---|---|---|
| v23 C50, twice | Async physician, both | None | 28.12 / 23.91 s |
| v23 C08, thunderclap headache | Emergency now | Action 0.007 s | 21.66 s |
| v23 C50 + new weakness/slurred speech | Emergency now | Action 0.008 s | 20.61 s |
| v23 C04, inflamed diabetic foot wound | Same-day in person | Action 4.43 s | 24.46 s |
| v23 C06, losartan request | Async; says symptoms were not described | None | 21.17 s |
| v24 C50, three attempts | Canceled after browser rejected opening | Emitted but **not accepted** | 5.60 / 2.99 / 2.78 s |
| v25 C50, twice | Async physician, both; no in-person floor | Acknowledgment 3.13 / 3.21 s | 21.47 / 21.54 s |
| v25 C01 | Awaiting history, no final disposition | Surgery/trauma question 4.78 s | 26.77 s |
| v25 C01 update, new weakness/slurred speech | Emergency now; original context retained | Action 0.008 s | 19.69 s |
| v25 C04 | Same-day in person | Action 3.14 s | 25.22 s |

The final GUI was left showing C50's async response. Its browser final receipt was 21.55 s (server 21.54 s); the other v25 C50 browser receipt was 21.76 s. These are receipt times, not paint measurements. The early acknowledgment was observed in the actual GUI before completion. No emergency announcement or low-acuity disposition is inferred from that acknowledgment.

Final-version run IDs: C50 `cc5bdd46-067c-4dbf-a794-d9edf6a7ae18`, C01 `7f474b15-2de9-407f-88fd-f61a700d03ce`, neurological update `a1879893-b3b2-4f1c-9f2d-e75badd35b82`, C04 `55b2123d-87d7-408b-961d-1622da7fca05`, C50 repeat `61a7e956-fbde-44fd-8ece-460b5a0b911c`. All attempts and hashes, including earlier failures, are in the manifest.

Using the repository's existing uncached-token estimator, known-usage calls total approximately **$0.84**. Three canceled agent executions have unknown usage, so this is not a complete billed-cost total. No model comparison was run and no provider-spending ceiling was inferred from a screenshot.

## Still-open release gates

- Final-answer latency remains around 20–28 seconds in this rehearsal. A three-second acknowledgment is not a three-second disposition. No faster-final-answer or clinical noninferiority claim is made.
- A declared physical-care rationale is a model assertion, not proof. Unsupported over-triage can still recur when the model chooses the wrong basis; independent clinical evaluation and unseen-case tests remain necessary.
- Exact citations do not establish claim support. Some responses retrieved unnecessary or conditionally applicable abstracts and included unnecessary differential expansion. The C50 pregnancy/lactation abstract is explicitly uncertain, but is not needed to justify initial clinician routing. Retrieval relevance and concise claim-level support remain open gates.
- The new symptom-denial check catches a narrow observed failure; it does not comprehensively resolve negation, hypothetical language or attribution. “No symptoms described” must not become clinical clearance.
- The research source pool remains consumer summaries, abstracts and labels, not a comprehensive maintained specialty-guideline service. This repair does not establish autonomous prescribing, clinical efficacy or billing readiness.

The Sites workflow required browser verification and exposed integration defects that passing isolated software tests had missed. No original CSV, saved physician judgment or historical run was edited.
