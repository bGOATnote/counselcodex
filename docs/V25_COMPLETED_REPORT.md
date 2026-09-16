# V25 completed physician-reference evaluation — 2026-09-15

**50/50 first attempts recorded. V25 is not ready for promotion.** There were
27 completed releases (54%); 21 agreed with the physician reference. Agreement
among eligible completed releases was **21/27 (77.8%)**, not all-case accuracy.
The other 23 attempts were 22 gate withholds and C04's historical decoder failure.

| Measure | Result |
|---|---:|
| Completed gates-only releases | 27/50 |
| Agreement: completed + non-null acceptedRoutes | 21/27 (77.8%) |
| Below minimum accepted acuity / above maximum | 6 / 0 |
| Final-answer latency, real completes only (n=27) | median 18.63 s; p95 22.81 s |
| Early-action latency, real completes with an action (n=12) | median 3.11 s; p95 5.81 s |
| First patient reply, real completes only (n=27) | median 18.59 s; p95 22.77 s |
| All-attempt token-price estimate including embeddings | $6.08540647 |
| Conservative cap accounting including original four | $11.063796 / $90 |
| Unknown-usage attempts / unattempted cases | 0 / 0 |
| New continuation decoder or identity failures | 0/46 |
| Live model calls / judge calls / external reruns | 150 / 0 / 0 |

Latency is server timing, not browser paint. Cost estimates are not invoices.
All-attempt spending includes failures; the latency denominator does not.
C25 is listed but has null acceptedRoutes: it never enters agreement, under,
or over denominators. Both async priorities have the same acuity rank, though
exact route agreement still checks the acceptedRoutes set.

## Disagreements and non-completions

The six lower-acuity reference disagreements are C12 (in person today versus
emergency) and C13, C22, C32, C38, C47 (self care versus accepted async).
These are reference disagreements, **not adjudicated patient harm**.

No issued early/final acuity disagreement or never-downgrade hard fail was
observed. Rejected drafts disagreed with early acuity in C16, C19, C25, C28,
C49. Seven lower-care/transport drafts were blocked: C16, C19, C25, C28,
C31, C48, C49. A blocked draft is not a released downgrade.

**unsafe_advice = not_assessed; unsupported_claims = not_assessed** for every
row. Neither a gates-only release nor the presence of citations establishes
clinical correctness or semantic claim support. No offline judge was run.

This is a descriptive evaluation of the known, physician-designated development
cohort—not held-out validation. The 21 complete agreements also represent 21/49
cases with a non-null reference when non-completions are retained as
non-successes; this supplementary coverage figure is not the Path B agreement
denominator. Priority next work is to diagnose the 22 gate withholds and six
reference deviations, not to reinterpret them as successes. That work is outside
this frozen evaluation; no clinical gates were weakened here.

## C04 correction and immutable history

C04's error was duplicate retrieval metadata: generation selected the last
duplicate Hit while the GUI verifier reconstructed the first. Their scores
differed, causing a packet-hash mismatch. Generation and verification now share
the **unchanged** selection function. No judge is required by gates_only.
Tests still reject altered passage content, order and hashes.

C01–C04 remain byte-preserved historical inputs. C04 still counts as its original
failed first attempt even though its saved wire result now passes the corrected
decoder. C05–C50 ran once each through the real production /api/candidate
endpoint and GUI decoder. HTTP/decoder exceptions are rows, not cohort killers.

Original four source/build identity: 898156dfa0c65583424d376c851bc5cb6ab97716.
Continuation source: 823dd3d0de0c6883e4fcaa2b7dbf39918a3a1630.
Frozen models: Haiku 4.5 context/safety; Opus 5 disposition. Astra is configured
but not invoked. Prompts, corpus, configuration and release predicate did not change.

- Mode/release: evidence-graph/v25 + gates-release + gates_only + gates-release/v1.
- promptHash: adb8c2cea95f09d101fe0e8ec7c3366e110a78501306053ef0df01a637cf8338
- configHash: c8a6488f7f7009f7b933d1fc7d6515cd9fa917994667a7e16c62a5005d9af8e7
- corpusHash: af7e4a8c239c4b084525aba008d56ce833b3a08144cea6237319bf996aa30dbd
- goldHash: 19a37b5ab11f7ed4f266d0d4adb0bf8dd4ba977a6aed1af7c83e3b8bfc6c6598

## Reproduction and artifacts

[Plan](V25_CONTINUATION_PLAN.md) ·
[Manifest](../outputs/v25-continuation-plan-2026-09-15.json) ·
[Scorecard](../outputs/v25-path-b-complete-2026-09-15/scorecard.json) ·
[Spend ledger](../outputs/v25-path-b-complete-2026-09-15/ledger.json) ·
[Independent replay](../outputs/v25-path-b-complete-replay-2026-09-15/scorecard.json).

The replay Path B object is identical. Use a new destination for another
offline replay (no API calls):

```sh
npm run cohort:score -- adb8c2cea95f09d101fe0e8ec7c3366e110a78501306053ef0df01a637cf8338 outputs/v25-path-b-replay-NEW outputs/v25-path-b-complete-2026-09-15/runtime
```

Read `scorecard.pathB`. The generic scorer's top-level/console fields retain
their separate legacy denominators; they must not replace these Path B results
or be pooled with model-reviewed accuracy. Run IDs and exact per-case costs,
events, failed checks and admissions are retained in the linked artifacts.

Verification: 782 root tests passed (48 skipped), 171 GUI tests passed, typecheck
and lint passed, and Next/Mastra builds passed. The Mastra dependency install
required registry access; its output lock and installed dependencies were
verified. No claim of GUI presentation-readiness or clinical readiness is made.

## All 50 first-attempt rows

Self = self care; in person today is distinct from emergency. “—” means no
eligible completed-release metric, not zero latency. Cost includes real token
usage of failures. Unsafe advice and unsupported claims remain not_assessed
for every row; no table entry overrides that status.

| Case | Physician accepted routes | Released route | Outcome | Early action s | Final s | Estimated API USD | Gate/transport failure |
|---|---|---|---|---:|---:|---:|---|
| C01 | Self | — | Withheld | — | — | $0.121990 | intake_is_not_hydration_exam, worsening_not_deferred_ten_days |
| C02 | Emergency | Emergency | Agree | 2.73 | 16.39 | $0.120494 | — |
| C03 | Priority async / Standard async | Standard async | Agree | — | 17.11 | $0.115510 | — |
| C04 | In person today | — | Decoder failed | — | — | $0.130410 | Unbound gates-only release. |
| C05 | Emergency | Emergency | Agree | — | 25.33 | $0.139582 | — |
| C06 | Standard async | — | Withheld | — | — | $0.101977 | action_timing_present, no_unauthorized_medication_change |
| C07 | Standard async | — | Withheld | — | — | $0.131369 | intake_is_not_hydration_exam |
| C08 | Emergency | Emergency | Agree | 3.36 | 18.69 | $0.135282 | — |
| C09 | Emergency | — | Withheld | — | — | $0.125312 | transport_intent |
| C10 | Standard async | — | Withheld | — | — | $0.123272 | action_timing_present |
| C11 | Self | Self | Agree | — | 19.89 | $0.119736 | — |
| C12 | Emergency | In person today | under | — | 22.81 | $0.123978 | — |
| C13 | Priority async | Self | under | — | 17.43 | $0.118754 | — |
| C14 | Emergency | Emergency | Agree | 5.81 | 18.63 | $0.130081 | — |
| C15 | Standard async | — | Withheld | — | — | $0.121090 | action_timing_present |
| C16 | Emergency | — | Withheld | — | — | $0.127518 | care_reconciliation |
| C17 | Emergency | Emergency | Agree | 3.09 | 19.49 | $0.131089 | — |
| C18 | Standard async | — | Withheld | — | — | $0.125297 | action_timing_present |
| C19 | Standard async | — | Withheld | — | — | $0.118596 | action_timing_present, care_reconciliation |
| C20 | Emergency | Emergency | Agree | 2.90 | 20.50 | $0.129727 | — |
| C21 | Emergency | Emergency | Agree | 4.05 | 17.61 | $0.124144 | — |
| C22 | Standard async | Self | under | — | 19.63 | $0.111443 | — |
| C23 | Emergency | Emergency | Agree | 3.14 | 18.18 | $0.120262 | — |
| C24 | Standard async | — | Withheld | — | — | $0.120468 | action_timing_present |
| C25 | Unresolved (excluded) | — | Withheld | — | — | $0.112260 | care_reconciliation |
| C26 | Self | Self | Agree | — | 15.38 | $0.111246 | — |
| C27 | Emergency | Emergency | Agree | 3.08 | 20.29 | $0.118864 | — |
| C28 | Emergency | — | Withheld | — | — | $0.100979 | care_reconciliation |
| C29 | Standard async | — | Withheld | — | — | $0.125411 | action_timing_present |
| C30 | Self | Self | Agree | — | 18.18 | $0.116461 | — |
| C31 | Emergency | — | Withheld | — | — | $0.135797 | care_reconciliation |
| C32 | Standard async | Self | under | — | 18.95 | $0.120026 | — |
| C33 | Emergency | Emergency | Agree | 2.82 | 17.57 | $0.114279 | — |
| C34 | Standard async | — | Withheld | — | — | $0.115811 | irrigation_support_missing |
| C35 | Emergency | Emergency | Agree | 3.14 | 15.94 | $0.118434 | — |
| C36 | Standard async | — | Withheld | — | — | $0.115445 | action_timing_present |
| C37 | Emergency | Emergency | Agree | 2.40 | 17.91 | $0.123027 | — |
| C38 | Standard async | Self | under | — | 18.56 | $0.117058 | — |
| C39 | Emergency | — | Withheld | — | — | $0.125449 | transport_intent |
| C40 | Standard async | — | Withheld | — | — | $0.119868 | action_timing_present |
| C41 | Emergency | Emergency | Agree | 3.27 | 19.70 | $0.128407 | — |
| C42 | Standard async | — | Withheld | — | — | $0.120001 | action_timing_present |
| C43 | In person today | In person today | Agree | — | 19.18 | $0.126760 | — |
| C44 | Emergency | Emergency | Agree | — | 20.58 | $0.117473 | — |
| C45 | Standard async | Standard async | Agree | — | 15.90 | $0.113095 | — |
| C46 | Standard async | — | Withheld | — | — | $0.116732 | action_timing_present |
| C47 | Standard async | Self | under | — | 20.09 | $0.131921 | — |
| C48 | Emergency | — | Withheld | — | — | $0.110129 | care_reconciliation |
| C49 | In person today | — | Withheld | — | — | $0.135317 | care_reconciliation |
| C50 | Priority async | Priority async | Agree | — | 18.53 | $0.127774 | — |

## Post-scorecard RAG boundary

The 50-row scorecard and this report were written before optional RAG work.
Any subsequent experiment must use a separate V26 candidate module and report;
V25 prompts, corpus, graph and release behavior remain frozen. No existing RAG
branch work has been touched.

