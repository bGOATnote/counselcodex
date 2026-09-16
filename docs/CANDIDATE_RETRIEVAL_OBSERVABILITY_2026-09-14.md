# Candidate v14: retrieval, observability, interface, and live verification

Date: 2026-09-14. Clinical workflow scope: `/candidate`, not promotion over the
physician-reviewed incumbent. Shared GUI presentation and clearer contract
diagnostics also apply to the incumbent; its routing workflow is unchanged.
The original 50-message CSV, physician development
reference, clinical policy, and historical runs are unchanged.

## Outcome

The candidate has a simpler clinical-first interface, isolated retrieval-query
admission, and smaller, more useful Mastra traces. Live verification exposed a
repair failure and unsupported medication generalization. v14 adds precise
repair diagnostics and medication-scope instructions; both targeted migraine
retests subsequently released Priority async responses with the named medication
scope preserved. This is limited development evidence, not a clinical accuracy
estimate or a demonstration of latency improvement.

**Latency remains a release gate.** The v14 migraine responses took 82.66 and
96.73 seconds, with no earlier clinical message. A v13 emergency follow-up took
118.21 seconds, although an emergency instruction arrived at 2.97 seconds.
These runs were allowed to finish; a slow provider was not turned into a false
50-second failure. Do not describe this candidate as meeting Counsel's standards
or as presentation-ready on responsiveness.

## What Counsel actually reports

The [Mastra customer case study](https://mastra.ai/customers/counsel-health)
describes Next.js, TypeScript, history-taking agents, parallel emergency
supervisors, special-purpose task routing, clinical RAG, medical-record search,
and private-cloud infrastructure. This supports the architecture's overall
direction, not any particular model count or our clinical correctness.

Counsel's [practical medical AI article](https://www.counselhealth.com/blog/the-importance-of-practicality-in-medical-ai)
emphasizes low latency without sacrificing quality, workflow integration, and
common-case evaluation. It explicitly criticizes slow committee-style systems.
Neither page supplies a numerical p95 response-time SLO or a directly comparable
accuracy threshold for this prototype. Those values must not be invented.

The interface retains the public site's navy/ivory palette, C symbol, serif
headings and rounded primary action. It is an independent prototype informed by
[Counsel's public presentation](https://www.counselhealth.com/), not a replica of
an authenticated patient app or private clinician cockpit. No queue delivery,
staffing availability, clinician acceptance or follow-up is simulated.

## Changes and why they exist

### Retrieval queries are not clinical facts

Previously, one invalid clinical quotation rejected the entire context object,
including usable retrieval queries. This could leave the first disposition
without evidence and push retrieval into a later repair round.

`admitGraphContext` now independently validates up to three bounded query hints.
If clinical findings fail their existing quotation contract, the clinical context
stays null and its question cannot be published; the independently admitted
queries can still search. Query text remains untrusted and never becomes a
patient finding. The original patient message remains the clinical input.
No extra LLM, speculative answer, truncated raw-message fallback, or routing
override was added.

Replay of all seven saved v12 contexts found three cases where query hints could
be retained while clinical findings remained rejected. This only establishes
query admission, not retrieval relevance or clinical benefit. A v13 live migraine
follow-up exercised the same path and retrieved evidence despite rejected context.

### Mastra tracing measures the useful work

The real parallel safety and context/retrieval/disposition workflow remains.
The observability configuration excludes `MODEL_CHUNK` spans while retaining
workflow, agent, model-generation, inference, model-step, usage and error data.
New initial and repair retrieval spans record phase, hashed query, hit count,
corpus hash, elapsed time and embedding-cache state. Raw query, patient text,
source passages and provider error bodies are not added to those spans.

Telemetry failures cannot discard successfully retrieved evidence. Failed search
spans receive sanitized failure/cancellation codes. Tests explicitly inspect the
recorded error message rather than relying on `JSON.stringify(Error)`.

All seven new live traces were persisted with zero token-chunk spans. The v13
C02 run retained 30 spans; the two v14 runs retained 38 and 39. Reduced span volume
is demonstrated; a latency benefit from that reduction is not established.

This uses the installed Mastra tracing API, consistent with its
[observability guidance](https://mastra.ai/docs/observability/tracing/overview).
It does **not** establish HIPAA compliance. Synthetic full responses and evidence
remain in append-only run/event artifacts. Native workflow-stage events are not
yet forwarded to the GUI, and snapshot/resume is not implemented. A journal is
not a durable worker. See the corrected [Mastra runtime map](MASTRA_V1_HOOKS.md).

### Repair receives the actual defect

The v13 C50 response was withheld even after its judge accepted the draft:
`reason` still contained “no reported red flags.” The judge had defended a
different qualified sentence. Both drafts also broadened “out of sumatriptan”
into exhaustion of rescue medication generally.

v14 reports the precise field and offending phrase to the existing bounded
repair and independent review. It preserves the previous matching patterns and
exemptions; it does not relax the guard or add retries. Read-only regression
review across 206 saved answers/drafts found no changed pass/fail outcomes.
Shared instructions now explicitly preserve named-medication scope. The GUI
also distinguishes judge acceptance from application withholding, rather than
implying that an accepted draft was rejected by the judge.

In the first v14 live case, the judge identified medication-scope and grounding
problems and the repaired answer addressed them. Both retests still needed one
repair. Prompt instructions alone did not prevent the initial errors.

### Clinical-first GUI

The header no longer leads with implementation notes. Prototype details live in
a footer disclosure; the independent-prototype notice remains visible. The
message field is shorter, response sections say “Why this route” and “Brief
differential,” and execution timing lives inside its disclosure. Individual agent
durations are available there. Failed logging remains visible, and complete
response/trace download remains available. Existing care text and routes are not
rewritten by these presentation changes.

Sites guidance informed the layout and actual-browser verification; no hosting
migration, new website service, or remote deployment was introduced.

## All live GUI attempts

Cases were selected and submitted in the actual browser, including symptom
updates. Plans were written before each sequence. These are three unique
original cases plus follow-ups and targeted retests, **not seven independent
patients**, not all 50 cases, and not a randomized paired trial. Times below are
browser receipt times, not paint measurements. “Released” means automated
acceptance/application admission, not physician approval.

| Version / case | First clinical event | Finished | Calls / repairs | Observed result |
|---|---:|---:|---:|---|
| v13 C02 | Emergency action 3.69 s | 48.53 s | 4 / 0 | Released emergency response and EMS instruction |
| v13 C02 + ambulance called | Emergency action 2.97 s | 118.21 s | 4 / 0 | Final response correctly continued already-activated EMS |
| v13 C50 | None | 88.64 s | 6 / 1 | Full response withheld: blanket-clearance failure |
| v13 C50 + unchanged symptoms | Reply 90.73 s | 90.73 s | 6 / 1 | Released Priority async, but broadened medication shortage |
| v13 C04 | Action/question 9.74 s | 53.56 s | 4 / 0 | Released in-person today; wording/evidence concerns remain |
| v14 C50 | Reply 82.66 s | 82.66 s | 6 / 1 | Released Priority async; named-medication scope preserved |
| v14 C50 + unchanged symptoms | Reply 96.73 s | 96.73 s | 6 / 1 | Released Priority async; symptoms and medication scope retained |

Other observed concerns remain in the record:

- The v13 ambulance follow-up's early generic ED wording did not yet reflect
  that an ambulance was coming; the final transport instruction did.
- C04's narrative referred to spreading redness, although progression was
  unreported and separately marked unknown. Its judge accepted grounding by
  looking at the structured unknown rather than reconciling the narrative.
- C04 cited general diabetic-foot risk summaries, not a specific initial
  assessment protocol. Source presence is not sufficient clinical support.
- The v14 follow-up included a conditional imaging statement qualified in its
  source details. Whether that adds anything to a refill answer remains a
  relevance/concision concern, not an automatic unsafe-route label.

Estimated standard uncached **model** token cost for all seven attempts is
**$2.922090**, using the project's versioned pricing table. This is not a provider
invoice; it excludes embedding charges and cache billing differences. All
failures and revisions are included. No funding ceiling was inferred or reset.

Artifacts:

- [v13 plan, observations, metrics, raw runs and journals](../outputs/candidate-v13-gui-2026-09-14/)
- [v14 plan, observations, metrics, raw runs and journals](../outputs/candidate-v14-gui-2026-09-14/)
- Both use corpus hash `1bb200918d063325df27bcc3b252c992220367482181a42e77e671305321b5ff`.
- The original corpus bundle and rights provenance remain under
  `outputs/evidence-graph-development-2026-09-13/corpus/manifest.json`.

## Why not add rewrite racing now?

[ElevenLabs' experiment](https://elevenlabs.io/blog/engineering-rag) reduced its
RAG-stage median from 326 to 155 ms by racing query rewrites and falling back to
raw input. It did not demonstrate a 50% reduction in complete medical answers.
Our seven frozen v12 runs instead attribute approximately 4.95% of summed
elapsed time to context extraction plus initial retrieval and 76.91% to review
and repair. This is observed stage accounting, not a causal ablation.

Adding rewrite racers would attack a small measured component while adding
cost and clinical query-integrity risks. The implemented query-isolation fix
addresses an actual lost-evidence path without adding calls. Racing may become
worth testing if later profiling shows rewrite tail latency dominates.

## Next strategic work

1. **Calibrate the judge against the errors it demonstrably missed.** Evaluate
   cross-field contradictions, named-medication scope, patient-specific claims,
   and source applicability using frozen drafts and minimal counterfactuals.
   Separate defensible routing alternatives from unsupported factual statements.
   Never use the judge's acceptance rate as the accuracy metric.
2. **Shorten the review/repair critical path with a prespecified comparison.**
   Test a concise draft/reviewer contract against the present contract with
   cases, evidence, model settings and policy fixed. Measure full completion,
   failed/unfinished runs, first actionable instruction, needed corrections,
   under/over-triage, support and cost. Keep an independent review of repaired
   content. Do not skip review or lower safety checks merely to improve timing.
3. **Expose real progress and preserve long work across reconnection.** Forward
   Mastra stage events as nonclinical progress, separate from admitted care
   instructions. Design a resumable worker and scoped persistence before claiming
   reload/reconnect recovery. Progress is not a faster clinical response.
4. **Then evaluate agent benefit on the held-out/stress protocol.** Use the
   physician-approved cohort as development reference; preserve the DVT
   alternative and do not claim untouched validation from those 50 cases.
   Report both each component's benefit and the full live pipeline's results.

These priorities are engineering inferences from our measurements and the
published design, not statements about what individual Counsel leaders would
approve. There is no evidence that scrapping the working TypeScript/Mastra
foundation would solve the dominant errors or latency.

## Verification

- Root `npm run lint`, `npm run typecheck`, and `npm test`: passed.
- Evaluation app `npm run review:test`: 152 tests passed.
- `npm run review:build` and `npm run build`: both production builds passed.
- Actual GUI: five v13 submissions, then two prospectively specified v14 retests;
  all raw attempts retained. Browser view inspected at the narrow in-app width.
- Independent read-only reviews covered Mastra capability, public GUI/stack
  alignment, bottleneck attribution, and the v14 regression boundary.

Software verification and these seven live attempts do not establish clinical
readiness, broad reliability, comparative lift, or Counsel-level performance.
