# Same-document recommendation expansion — offline experiment

15 September 2026. No live workflow imports these files. No new source,
embedding, corpus/index rebuild, provider call, patient reference edit, or
historical-output rewrite was performed.

## Finding and smallest candidate

The licensed migraine consensus article was already retrieved, including its
Step 7 referral or treatment-failure subsection. The matching Recommendations
section was missing. Expanding within that already retrieved document makes its
conditional treatment-review advice available without another search/model call.

The candidate preserves V26 selection and fills unused space in the existing
nine-passage budget with at most two Recommendations sections. It follows exact
section hierarchy and query/title term overlap, never patient case identifiers,
reference routes, or the expected support-span text. Complete single-chunk
recommendation sections retain qualifiers; multi-chunk sections are skipped,
not silently truncated. Corpus restoration honors existing quarantine and
licensing metadata; source passages/metadata/context must match the active
retained corpus exactly.

**Capacity-only is the candidate.** An earlier `same_document` replacement arm
is retained explicitly as an unsuccessful comparison: replacing apparently
redundant same-document content lost an acute-migraine second-line-treatment
section. It must not be promoted or represented as unqualified improvement.

## Replayed results

All 72 saved variants were accounted for (18 previously authored probes ×
lexical/hybrid × raw/hinted). There were no retrieval/integrity failures in
these saved inputs and one empty selected packet. Tests separately exercise
empty, corrupt, mismatched, retired and unchanged cases.

| Measure | Original V26 | Replacement arm | Capacity-only candidate |
| --- | ---: | ---: | ---: |
| Exact supporting-span opportunities | 9/16 | 11/16 | 11/16 |
| Hybrid raw supporting opportunities | 3/4 | 4/4 | 4/4 |
| Hybrid hinted supporting opportunities | 3/4 | 4/4 | 4/4 |
| Lexical raw / hinted opportunities | 1/4; 2/4 | unchanged | unchanged |
| Existing document-section target losses | — | 1 | 0 |
| Existing explicit action passages lost | — | 0 | 0 |

The two gained opportunities were the same migraine review witness in different
hybrid retrieval variants, **not two independent patient improvements**. CDC and
NHLBI action advice already present in the selected packets remains present.
Patient-summary sources are not demoted by this expansion; no source class is
assigned clinical authority by the supplement.

The replacement-arm regression was `hybrid:raw:R05`, the acute-migraine therapy
probe. Capacity-only keeps every original V26-selected passage, eliminating
that displacement. It does not recover the absent migraine support span in
either lexical variant. Topic discovery and decision-support selection remain
separate problems.

One local replay measured approximately 0.42 ms median / 0.62 ms p95 selection
time after a 44 ms once-per-process corpus verification/preparation. These are
local replay CPU timings, not network, model, browser, or patient-response
latency; no end-to-end speed claim follows. Filling an unused passage slot can
increase prompt tokens; the final-model cost/latency effect is unmeasured.

## Interpretation and remaining gate

These support witnesses were authored after examining failures. The capacity
restriction was selected after observing the replacement regression. Thus
this is retrospective development evidence, not a prospectively blinded or
held-out validation. Exact-span availability does not establish patient
applicability, correct clinical routing, accurate generated claims, or that
the model will actually cite the useful passage. New source-class or clinical
decision rules are not warranted by this result.

The next paired test should freeze the capacity-only packet and compare actual
generated disposition/claims against the unchanged-packet baseline, retaining
all failures, advice errors, unsupported claims, prompt tokens and latency.
Keep live V25 and V26 unchanged until that test justifies integration.

## Reproduce without API keys or file writes

```sh
node --experimental-strip-types --test src/evidence/rag/support-section-expansion.test.ts src/evidence/rag/disposition-support.test.ts src/evidence/rag/v26.test.ts
node --experimental-strip-types src/evidence/rag/support-section-expansion-replay.ts capacity_only
node --experimental-strip-types src/evidence/rag/support-section-expansion-replay.ts same_document
```

The replay prints every selected passage ID, retained addition/removal, original
input hashes, implementation hashes, corpus hash, failure/empty accounting, and
support-span results. Corpus: `af7e4a8c239c4b084525aba008d56ce833b3a08144cea6237319bf996aa30dbd`.
