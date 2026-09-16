# Insomnia source replacement: completed null routing result

**No promotion.** All 12 provider calls completed. Replacing an inconsistent
insomnia passage changed the cited evidence but did not improve physician-route
agreement. This isolated experiment changed neither the live corpus nor V25.

## Fixed comparison

Six fresh, alternating-order pairs used the unchanged original C47 message.
Both arms used the same full producer prompt, context, schema and Opus settings.
The journal's `full` slot is retained MedlinePlus; `brief` is replacement NHLBI.
**Neither arm uses a brief output contract.**

The replacement removes the two selected `medlineplus:6055` chunks, inserts one
411-character NHLBI paragraph at the first removed position, and preserves the
seven other source objects, quote spans and relative ordering exactly. Nine
sources become eight. Provenance, length and content change together; this is
not a controlled estimate of a particular sentence's effect or retrieval speed.

- Freeze commit: `950b9aa`; protocol: `fixed-packet-insomnia-source/v1`.
- Plan fingerprint: `55a7eb94f53774116fc8dde29a986f0643c644f55210f0e646ea092bd4fb5455`.
- Model: `anthropic/claude-opus-5`, adaptive/low, 2,400 output-token ceiling,
  one step, no retries, 600,000 ms deadline.
- Full plan, all raw attempts, resolved citations and gate replays:
  `outputs/insomnia-source-probe-2026-09-15/`.
- All 474 frozen file hashes remain unchanged. Deterministic report replay is
  byte-identical: SHA-256
  `37e212f46e18f4e83382f44f565143cfeb947bacaf8828c02b110968c19928cc`.

No gold, earlier route or issued action entered either producer prompt. Previously
issued care is an evaluation-only preservation check. No live retrieval,
embedding, judge, repair or patient publication occurred.

## Results

| Metric | Retained MedlinePlus | Replacement NHLBI |
| --- | ---: | ---: |
| Completed provider executions | 6/6 | 6/6 |
| Eligible routing proposals | 6/6 | 6/6 |
| Full mechanical gate replay passes | 6/6 | 6/6 |
| Self-care proposals | 6/6 | 6/6 |
| Exact agreement with C47's Standard async reference | 0/6 | 0/6 |
| Producer median / p95 | 15.3815 / 16.082 s | 14.5045 / 15.151 s |

These are repeated trials of **one known development case**, not 12 patients,
held-out accuracy, GUI completion, first-action latency or clinical approvals.
The small latency difference is descriptive and includes packet-length changes.
Route disagreement is not adjudicated harm. All six mechanical passes in the
replacement arm coexist with the interpretation concerns below.

## What actually changed in the claims

The retained summary uses a one-month chronicity boundary; the captured
[NHLBI diagnosis page](https://www.nhlbi.nih.gov/health/insomnia/diagnosis)
requires both frequency and three-month duration for chronic insomnia. It also
advises clinician contact when sleep loss affects daily activities. Its displayed
update is March 24, 2022. This is official patient education, not an individually
applicable triage guideline or an independently established current standard.
See the [source capture and scope](NHLBI_INSOMNIA_SOURCE_CANDIDATE_2026-09-15.md).

All six baseline drafts discussed the one-month acute/chronic boundary in their
citation limitations. All six replacement drafts cited the daily-activity
contact advice, not the chronicity definition. Thus preserving the complete
chronicity qualifiers in generated claims was **not demonstrated**.

Manual engineering inspection of the replacement citations found:

| Repetition | Model's application of the daily-activity condition |
| --- | --- |
| 1 | Says the patient is functioning and the threshold is not currently met |
| 2 | Says functioning means the threshold is not met on reported facts |
| 3 | Says the threshold is not established |
| 4 | Says daily-activity impact is not established |
| 5 | Says functioning means the trigger is not currently met |
| 6 | Says the threshold is not clearly met |

The original message says both functioning **and** tired all day. Repetitions
1, 2 and 5 turn retained function into a definite negative finding that the
patient did not supply. Repetitions 3, 4 and 6 retain more uncertainty, but still
do not establish that guidance alone resolves the patient's need. This is an
anchored engineering observation, not a physician attestation or comprehensive
clinical verdict. The report's `claim_support`, `unsafe_advice`,
`unsupported_claims` and `clinical_correctness` remain **not_assessed**.

Separately, all 12 drafts label functional impairment `denied`. That broader
negative-finding error is present in both arms; it cannot be attributed to the
replacement source. The unchanged generated context also describes functional
status as preserved. Neither exact patient quotation nor a label of uncertain
citation applicability repairs an unsupported definite statement elsewhere.

The next hypothesis concerns **application of source conditions and patient
facts**, not adding more references. A source may correctly be quoted while its
eligibility or exclusion conditions are incorrectly applied. Unknown eligibility
must not become either a negative finding or an automatic emergency escalation.

## Spend and reproduction

| Accounting | USD |
| --- | ---: |
| Prior accounted exposure / retained reservations | 73.353706 |
| All 12 pre-dispatch worst-case reservations | 7.727220 |
| This probe base usage estimate | 1.417170 |
| This probe conservative accounted exposure | 2.583990 |
| Cumulative against the same $90 authorization | 75.937696 |
| Remaining after this completed probe | 14.062304 |

Base and conservative estimates are alternative accounting views, not additive
charges. The ledger and every first-attempt result are preserved. No failure was
rerun or dropped. Source correctness alone did not earn promotion.

```sh
node --experimental-strip-types scripts/insomnia-source-probe.ts score outputs/insomnia-source-probe-2026-09-15 report-NEW.json
node --experimental-strip-types --test tests/insomnia-source-probe.test.ts src/evidence/rag/nhlbi-insomnia-candidate.test.ts
```

Use a new score filename. Do not overwrite the frozen plan, source capture,
physician reference, reports or started/result/evaluation journals.
