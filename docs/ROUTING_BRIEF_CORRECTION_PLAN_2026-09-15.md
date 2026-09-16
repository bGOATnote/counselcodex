# Frozen brief contract correction probe

Prepared before calling. Eight pairs / 16 planned fresh calls: C02, C14, C17,
C20, C30, C31, C32, C50. Five observed contract failures plus three mechanically
stable controls; these are development cases, not held-out clinical validation.

The v1 prompt accidentally discarded the full TRANSPORT paragraph when it split
the full prompt at OUTPUT. V2 restores that paragraph verbatim. It also restores
the original full contract's resource limits instead of rejecting a third valid
citation. Writing targets remain short and are measured, not admission gates.
No citations, patient quotations or malformed fields are sliced or repaired.
Clinical policy, typed-route and issued-care checks are unchanged. Neither brief
constitutes a full response release, successful handoff or clinical approval.

Both arms: anthropic/claude-opus-5, adaptive low effort, 2400 output-token cap,
600000 ms deadline, one step, retries zero. Identical original brief patient,
generated context and selected evidence packet. Alternating sequential pair
order. No new retrieval, embedding, judge, repair, publication or gold in prompts.
Gold remains scoring-only. All raw results, failed decoding, invalid quotations,
care conflicts, unstarted slots and usage are retained. No retry after a start.

Plan identity freezes code, prompt/schema/config, input packets, source records,
original outputs, prior ledgers and physician reference before any paid call.
All 16 reservations must fit the remaining $9.716814 of the SAME $90 mission
ceiling; expected aggregate reservation $9.557700. Known conservative usage
replaces its reservation, while unknown usage retains it. This is not a new budget.

Primary engineering endpoints: mechanical eligibility, exact quote bindings,
transport-field misuse and preserved issued care. Agreement numerator and eligible
denominator are separate from coverage /8. Below/above accepted acuities are not
harm labels. All chosen references are non-null. Latency/cost use actual provider
completes; raw failures remain rows. Claim support, unsupported claims, unsafe
advice and clinical correctness remain not_assessed absent a real assessment.
Passing a decoder or exact-quotation check is not research-supported care.

Reproduction (new directory and report name):

```bash
node --experimental-strip-types scripts/routing-brief-correction-probe.ts plan outputs/NEW
# inspect/freeze the resulting fingerprint before using authorized funds
node --experimental-strip-types scripts/routing-brief-correction-probe.ts run outputs/NEW EXACT_FINGERPRINT
node --experimental-strip-types scripts/routing-brief-correction-probe.ts score outputs/NEW report-NEW.json
```

No live V25 change will be inferred from this probe. It tests whether the earlier
brevity result was confounded by avoidable contract defects, not whether its
remaining disagreements can be declared correct. RAG provenance, source currency,
patient applicability and semantic support stay distinct. An honest null result
will be retained; no additional evidence agent is part of this change.
