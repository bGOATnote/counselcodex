# Live disposition demo

Re-reviewed 16 September 2026. Slide 9 allocates seven minutes inside the
35-minute main presentation. The current surface is
**/stripped, Fable 5.1 low effort, three buckets, one provider call per submit**.
Frozen traces are an explicitly labeled fallback, never a claimed live completion.
The live workflow has no judge or retrieval step; saved comparative evaluation
is shown separately. Slides 2–4 introduce C22, C47 and C49 before the demonstration.

## Before the session

1. Follow the [GUI access guide](GUI_ACCESS.md), run `npm run demo`, and open
   [the local server](http://localhost:4120/stripped). Localhost requires a server
   on the viewing machine. The separate [public saved-results viewer](https://bgoatnote.github.io/counselcodex/#C49)
   opens C49. Check that it loads before the session and keep the offline copy
   available.
2. Confirm Fable 5.1, low effort. Expand **Model configuration** and compare the
   prompt hash with the [GUI guide](STRIPPED_FABLE_GUI_2026-09-15.md).
3. Confirm the sample picker and submit button are enabled. Keep the API key
   server-side. Open this script and the [four-model case viewer](../publication/medgemma-case-review/index.html)
   from the local checkout. It works offline and embeds all 50 exact messages,
   historical Fable, MedGemma, Nano and V25 results. Its records are separate from
   live submissions. Keep the [workflow-study viewer](../publication/workflow-study-review/index.html)
   available for retrieval-ablation questions.
4. Keep the [latest five-call handoff manifest](../outputs/stripped-gui-handoff-2026-09-16/manifest.json)
   and [original six-call verification](../outputs/stripped-gui-2026-09-15/manifest.json)
   available. These are dated integration checks, separate
   from both the frozen benchmark and fresh interview calls.
5. Preserve any configuration, usage-limit, or provider error. Do not repeat
   requests solely to obtain an expected answer.

The expanded trace includes a neutral estimated-cost row. To keep financial figures
out of the presentation, use Model configuration and the saved comparison viewer
in the prepared walkthrough. Inspect the complete trace separately.

## Timed walkthrough

| Time | Action | Suggested words |
| --- | --- | --- |
| 0:00–0:40 | Show /stripped and the three-bucket contract. | “This classifies one opening message. Each submit makes one native Fable call through one Mastra step. It does not send a clinician task or claim that care has happened.” |
| 0:40–1:25 | Select C01. Verify the runny nose, mild sore throat, no fever, and preserved intake. Submit and inspect loading and the actual answer. | “I am sending this message now. The bucket and rationale are generated for this call. The frozen benchmark is a different record.” |
| 1:25–2:15 | Select C02. Verify chest pressure, left-arm radiation, sweating, and nausea. Submit. | “This exercises the urgent category. It combines same-day and emergency care, so route agreement alone does not establish appropriate transport or timing.” |
| 2:15–3:05 | Select C06, stable losartan refill. Submit. | “The explicit refill rule assigns a physician-review category unless clear red flags require escalation.” |
| 3:05–4:00 | Append the synthetic update below to C06. Show the old result disappearing. Submit. | “The edit starts a new assessment using only the edited message. No prior answer or reference label enters the request.” |
| 4:00–5:00 | Expand Model configuration and show the one-call workflow implementation. Keep Request & response trace collapsed during the prepared presentation. | “The prompt and model settings are fixed. One Mastra step sends one message-only user turn. Complete execution records remain available for separate technical inspection.” |
| 5:00–6:15 | Switch explicitly to the saved four-model viewer at C49. Show the exact message and distinct physician/CSV panels. Compare recorded routes and rationales; select C22 or C47 to revisit the opening slides. | “These are frozen outputs. C49 separates urgent from async routing; C22 and C47 expose missed clinician involvement. The physician reference and original CSV are displayed separately. This comparison did not make a new model call.” |
| 6:15–7:00 | Show Nano’s repetition selector and V25’s completion status, then return to the evaluation slides. | “Nano defaults to the first unchanged baseline repetition; the second remains visible. V25 completed 27 of 50 attempts, and incomplete releases remain explicit. These familiar cases help inspect failures; they do not establish clinical readiness or a controlled model ranking.” |

Exact synthetic update to append to C06:

```text
Update: I now have crushing chest pressure, sweating, and pain going into my left arm.
```

Do not paste an expected disposition, reference label, or saved answer into the
message. Describe what actually appears, even if it differs from prior runs.

## Reading the saved comparison

The viewer starts at C49 and supports search, case links, under/over-escalation
filters and **Presentation view**. Its Disagreements filter refers specifically
to the six historical Fable/MedGemma differences. Displayed physician v3 agreement
uses an unblinded post-output reference; CSV labels are discussion context only.
Nano repetitions are separate observations, not a best-response selector. V25’s
original 21/49 result remains distinct from the derived three-bucket v3 display;
rejected drafts and early actions are not completed dispositions.

For a question about retrieval, use the separate workflow-study viewer: its source
package changes C47 to physician review in both Fable repetitions while C22 remains
self-care. This experiment has not been added to the live GUI.

## Failure handling and labeled fallback

If a call fails or becomes slow enough to derail the session, preserve the
visible failure and run ID if present. Avoid repeated clicks. Say: “The live
attempt did not complete. Here is a saved, dated verification of the interface.”
Then open the artifact and state its date and run ID.

| Input | Frozen run ID | Recorded bucket | Server / browser timing |
| --- | --- | --- | --- |
| C01 | `4619dbd2-5001-4f32-b018-ddbd5499eaf3` | SELF_CARE | 4.802 s / about 4.99 s |
| C02 | `451a0307-8b44-48f1-a893-15e7eae3dec4` | URGENT_ESCALATION | 4.171 s / about 4.18 s |
| C06 | `4709c058-d859-4013-8966-db500431f078` | ASYNC_PHYSICIAN | 4.601 s / about 4.61 s |
| C06 plus update | `020bc741-6523-4387-8623-0c12969e408d` | URGENT_ESCALATION | 3.688 s / 3.695 s |

These September 15 records live in [the original GUI verification directory](../outputs/stripped-gui-2026-09-15/).
An additional in-flight edit check discarded the browser's C01 result while the
server preserved the call. The final-build C06 check returned ASYNC_PHYSICIAN
in 3.949 seconds. All six completed with valid JSON and no provider failures.
The test harness's download-event listener timed out, but the actual saved JSON
was verified by filesystem readback.

The [September 16 handoff report](HANDOFF_REVIEW_2026-09-16.md) documents five
additional successful browser submissions. Its final C06 run used the updated
dependencies and supported Node runtime. Use the dated artifact that matches
the claim being demonstrated; neither batch is independent clinical validation.

## Questions to invite

- “Which incoming messages should create a physician task even when self-care advice is reasonable?”
- “Where should emergency action separate from same-day routing in your workflow?”
- “What evidence would you want before using this beyond an offline prototype?”

Listen, restate the policy, and connect it to a specific contract or evaluation
change. New design ideas remain separate from the frozen result being presented.
