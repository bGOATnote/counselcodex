# Setting, priority and a real demonstration queue

September 11, 2026. Implements the next slice of the [routing design](DISPOSITION_ROUTING_DESIGN_2026-09-11.md), not a clinical deployment or a replica of undisclosed Counsel internals.

## Contract

Four care settings remain unchanged. `ASYNC_PHYSICIAN` now explicitly carries `reviewPriority: priority | routine` and `workType: medication_request | clinical_review`. The other settings use null. The live provider schema, output validation, action assembly and GUI share the same contract. Old artifacts retain their historical, unclassified priority and old timing text; they are never silently upgraded.

Priority remote review is not same-day **in-person** care. The active usual-migraine refill is the motivating example. The model must explain timing in its reason. Routine prescribing requests do not become guidance-only self-care, and the word refill never overrides an emergency.

For this demonstration, priority work has a 15-minute response target from enqueue; routine work has a 48-hour target. These are versioned engineering targets, **not Counsel's SLA, measured staffing capacity, guideline-defined maximum safe delays, or guaranteed appointments**. Priority means clinical review is needed today; the short operational target leaves room to act. An overdue task remains open. Acceptance does not reset the target. New information cannot extend it. No additional LLM call was added.

## Handoff and persistence

The model proposes care. A separate user action sends a completed async recommendation to the **demo** queue. The server reads its own recorded result; the client cannot submit a replacement diagnosis, disposition, physician identity or purported response. Only a committed queue write produces a saved receipt. The UI distinguishes recommendation, queued, accepted, response recorded and resolved.

This is a Node/Next application, so the queue uses the already-available [Node SQLite API](https://nodejs.org/api/sqlite.html) on local disk rather than introducing a hosted database or a second service. Transactions atomically update materialized state and append events; WAL and full synchronous durability are enabled. Prepared parameters are used for values. Episode IDs link assessment revisions to task and event history. Original model artifacts and physician adjudications are untouched.

Same-episode append-only updates reopen existing tasks for reassessment, reject stale completion/acceptance, and retain old events. An emergency event is sent to the browser **before** the queue write. Existing queued work becomes escalated, and its instruction survives failed completion. No queue operation approves a prescription, delivers a message, establishes receipt by a patient, or counts toward physician-adjudicated evaluation.

The new database is under `apps/evaluation/.local/clinician-queue-v1/queue.db`, excluded from Git. Do not copy a live SQLite file without its WAL; use a consistent SQLite backup or stop the server before copying. This prototype does not provide production authentication, tenant isolation, background paging, replicated storage, a disaster-recovery service or HIPAA certification. Local origin protections are not practitioner identity. `Demo reviewer` is intentionally not a real physician attestation.

## Validation and remaining gates

Automated tests cover routing-field consistency, timing wording, durable reopen, idempotent enqueue, unchanged deadlines, overdue detection, valid transitions, stale writes/results, same-episode continuity, unrelated-message rejection, emergency preservation after failure, pending/legacy answer rejection, and sanitized API/storage failures. Cross-origin writes and client-supplied clinical packets are rejected before storage is opened.

The first browser run exposed an existing response-admission failure: a retrieved population statistic was included even though this prototype lacks independent statistic verification. It also showed an unsupported denial of sudden onset based only on "usual migraine." Both observations are retained. The prompt was clarified and a targeted denial regression added; this is not a general semantic verifier.

Further live tests distinguished model failures from validator failures. A finasteride answer declared unmeasured vitals unnecessary; that gate remains intact and the output instructions now constrain the vital-sign statement to observations and missing data. An albuterol draft was falsely rejected because "review how you use the inhaler" matched an instruction detector. A bounded phrase exemption fixes that error without exempting a later "use albuterol" directive. These are targeted regressions, not proof of general language understanding.

The repeated finasteride run fixed the vital-sign wording but still failed source applicability: retrieval supplied finasteride labeling containing a 5 mg/older-men risk discussion, and the draft cited that inapplicable discussion for a 30-year-old taking 1 mg. The failure remains a release blocker. Dose/indication-matched label retrieval and claim selection need their own controlled evaluation; this queue feature does not fix evidence quality. No failed output was rewritten or converted into a successful physician review.

Software completion is not clinical correctness. The queue adds workflow accountability, not proven clinical lift; latency, external-evidence coverage, exact-claim support and prospective clinician validation remain separate release gates. Opus remains incumbent; no Astra comparison was run.

## Actual production-GUI rehearsal

Every submission below was made through the browser at `localhost:4120`, using Haiku intake and Opus disposition. The [machine-readable record](../../outputs/gui-rehearsal-2026-09-11/1789161819091.json) includes all 11 attempts, original-run hashes, versions, source metadata, traces, usage and failures. Five completed, five were withheld, and one awaited input. This is an adaptive debugging sequence across versions, not an accuracy estimate or a paired latency experiment. No failures or raw outputs were overwritten. The final v29 was tested in the production build, not only through HTTP or unit fixtures.

| Case / version | Run ID | Observed outcome | First visible content at server | Finished |
|---|---|---|---|---|
| C50 / v26 | `ef3eadde-70f1-43fd-824c-5fb69153a154` | Withheld: population-risk statistic | Acknowledgment 3.12 s | 25.60 s |
| C50 / v27 | `31ec5265-d9e8-451c-b006-4f7458d40bdf` | Priority async; successfully queued | Acknowledgment 2.99 s | 21.44 s |
| C50 + new weakness/slurred speech / v27 | `4756a98f-7f98-4954-a4bf-3cbd8e165f7b` | Emergency now; existing task escalated | Emergency instruction 0.01 s | 21.56 s |
| C46 / v27 | `6ca6c7bb-18b9-4227-8dd1-76541ab07ca6` | Withheld: unnecessary-vitals assertion | Acknowledgment 3.19 s | 20.75 s |
| C18 / v27 | `f1483756-bc52-4128-8ecf-88a661454cc1` | Withheld: technique-review false positive | Question 4.39 s | 27.85 s |
| C46 / v28 | `b6c7779e-4d60-41c6-b61e-9ad238f4f62c` | Withheld: inapplicable label discussion | Acknowledgment 3.59 s | 22.03 s |
| C18 / v28 | `b85c75a5-2194-4697-81e9-b814c5f31b12` | Withheld: reported-inhaler-use false positive | Question 4.34 s | 24.35 s |
| C18 / v29 | `8ec7bf90-553f-42ff-b81f-d47c715dfb20` | Awaiting clarification; no final disposition | Question 4.47 s | 25.83 s |
| C18 + explicit fictional history/supply / v29 | `686c6728-e4d0-42af-8014-3834833fbbf4` | Routine async; full queue lifecycle tested | Acknowledgment 1.50 s | 19.12 s |
| C04 / v29 | `af308037-98ad-4801-9478-a8c24d9a5bb3` | Same-day in person | Care instruction 2.27 s | 21.58 s |
| C50 / v29 | `228983c2-fcf0-4435-b1bf-c693c98ab21b` | Priority async; successfully queued | Acknowledgment 2.68 s | 21.56 s |

The C18 update explicitly supplied no medication allergies, no pregnancy/breastfeeding, no new or worsening respiratory/night-time symptoms, and 40 remaining doses. It is a **modified case**, not successful completion of the original message without additional information. Acknowledgment and question latency are not time to a definitive care instruction. Browser receipt was also inspected; it is not a paint measurement. Final-answer latency is still around 19–26 seconds on final-build submissions: the user-facing latency gate is not met.

The final C18 answer also grouped increased inhaler need and severe respiratory warning signs under one emergency instruction. Proportionality of that safety-netting, and whether the initial allergy/pregnancy question needed to precede remote clinician routing, remain clinical review items. Passing structural checks does not resolve those concerns. The finasteride source-selection failure remains open; v29 changed the inhaler validator, not drug-label retrieval.

### Queue observations

- Episode `f05a589e-a66c-4b7d-af79-7e0593731c9e`: priority C50 was queued, then a patient update created revision 2, emitted an emergency instruction, and escalated the task. The emergency label and instruction survived production-server restarts and were rechecked in the browser. It remains an open **simulation** task, not an actual emergency contact.
- Episode `3b535d16-1186-48b2-bf64-30323cd3f318`: the modified C18 run was queued at 21:20:05 UTC, accepted at 21:20:26, had a simulated response recorded at 21:20:38, and was resolved at 21:20:47. The response target stayed September 13 at 21:20:05 UTC. Reload recovered the resolved state and follow-up note. All actions were performed through the GUI; no prescription or real message was sent.
- Episode `12ab1fa3-f984-4f5f-b233-4c6b73d8bc18`: final-build C50 was queued at 21:22:30 UTC with the priority target at 21:37:30, left awaiting acceptance for demonstration. Visual inspection found no overlapping controls at the user's current narrow browser width; the layout stacks tasks above details.

Type-checking, all core tests, all **113** review/UI/queue tests, lint, Next production build and Mastra build pass. Faults, duplicate enqueue, stale revisions and disk reopen were tested in automated fixtures; no claim is made that live-provider failures, production-scale load, browser paint timing or clinical correctness have passed independent evaluation.

## Next release work, in order

1. Match prescribing evidence to dose, formulation and indication; exclude irrelevant label fragments before generation, retain exclusions, and test against held-out medication requests.
2. Measure whether clarification changes care setting or timing versus merely collecting prescribing history that belongs with the reviewing clinician. Avoid delaying queue entry for the latter.
3. Evaluate proportionality of precautions and claim support independently. Do not add more lexical exceptions as a substitute for clinical evaluation.
4. Reduce measured final latency with a controlled comparison while preserving the same cases, evidence and response obligations. The queue introduces no additional LLM calls, but that alone does not establish speed or safety lift.
