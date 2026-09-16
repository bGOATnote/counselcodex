# V25 Path B continuation — 2026-09-15

## Frozen clinical identity

`evidence-graph/v25`, `gates-release`, `gates_only`, `gates-release/v1`.
Models, prompts, corpus, clinical gates and release predicate remain unchanged.
The continuation manifest records exact source/build/config/prompt/corpus/gold
hashes before dispatch. Its nested v1 manifest retains the earlier $70 protocol
metadata; the outer v2 continuation authorization supersedes that spending
ceiling with **$90 inclusive of the prior $0.889694 conservative accounting**.
No judge or repair is added to the successful release path.

## Necessary transport correction

C04's producer and GUI verifier reconstructed different retrieval `Hit.score`
metadata for the same duplicate passage. The producer's existing round-robin
selector overwrites duplicate metadata while retaining insertion order; the
verifier previously took the first matching hit. Both now use the exact same
pure selector. This is not a retrieval ranking change or a validation bypass.
Guidance order, content and full packet hashes must still agree.

The historical C04 run replays successfully through the corrected decoder, but
**its first-attempt failure remains a failure in this scorecard**. C01–C04 raw
runs, ledgers and admissions are immutable, hashed inputs to the continuation.

## Execution and scoring

- Resume C05–C50, one real `/api/candidate` HTTP request per case, through the
  production GUI decoder. No fixture timing or external reruns.
- Record HTTP/decoder/model failures and withholds; continue to the next case.
- Charge known provider usage conservatively; unknown usage retains the full
  prospective request reserve. Start another case only if its reserve fits $90.
- Append into a new output directory; never overwrite the original four.
- Agreement denominator: acceptedRoutes non-null AND complete, admitted
  `gates_only` release. C25 remains listed but excluded from agreement/under/over.
- Under/over use minimum/maximum accepted-route acuity. Route disagreement is
  not adjudicated harm. Early/final disagreement and never-downgrade failures
  are separate. Unsafe advice and unsupported claims stay `not_assessed` absent
  a real assessment artifact.
- Latency aggregates include real provider completes only; cost accounting
  retains all attempts, including failed and unfinished work.

## Commands

After committing the correction and building/restarting production:

```sh
MASTRA_TELEMETRY_DISABLED=true node --experimental-strip-types scripts/v25-cohort-continue.ts freeze outputs/v25-path-b-live-2026-09-15 outputs/v25-continuation-plan-2026-09-15.json
PAID_EVAL_UNLOCK=90 MASTRA_TELEMETRY_DISABLED=true node --experimental-strip-types scripts/v25-cohort-continue.ts run outputs/v25-continuation-plan-2026-09-15.json outputs/v25-path-b-complete-2026-09-15 <printed-fingerprint>
```

The run is first-attempt-only and claims its manifest once. The final report
will give an offline `cohort:score` command with a **new** destination directory.

## RAG boundary

Only after all 50 rows and the completed scorecard/report exist: consider a
small, separately versioned evidence-layer experiment. Do not change V25's
live retrieval, prompts, graph, default mode, corpus, or embeddings during this
cohort. Optional RAG probe spending is capped at $15 within the remaining $90.
Existing RAG branch work stays untouched. A measured null is an acceptable
result; absent time/budget, explicitly record `RAG deferred — budget/time`.
