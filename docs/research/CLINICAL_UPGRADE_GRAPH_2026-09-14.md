# Clinical upgrade graph: implemented, not promoted

The user's condition was explicit: add this only after the candidate is properly red-teamed and ready. The candidate's prior 46–86-second final responses and incomplete fixed-version cohort evaluation do not satisfy that condition. This change therefore supplies a **disabled-by-default shadow experiment**, not a new mandatory patient-routing policy. There is deliberately no `enforce` environment setting.

The physician-designated 50-case development reference remains authoritative for regression work, with the documented C25 qualification. This work neither replaces that reference with the original CSV labels nor asks the physician to repeat the prior adjudication. New graph rules and newly generated responses do not automatically inherit approval of the incumbent.

## What was red-teamed and corrected

| Proposed behavior | Implemented boundary |
|---|---|
| Bare clinical IDs establish a mandatory route | Evidence-bearing observations include status, subject, episode, temporality and exact patient quotation. Server-derived offsets and input hashes bind the text; **semantic correctness remains unassessed**. |
| Every matched relationship contributes to a floor | Only `upgrades_to` contributes to `candidateFloor`. `suggests` is separate and nonbinding. No match returns `null`, never self-care clearance. |
| Focal deficit regardless of context | The neurological seed requires sudden onset AND a focal deficit in the same current or recently resolved episode. Remote/hypothetical/denied findings cannot satisfy it when extracted faithfully. This is not an exhaustive stroke screen. |
| Exertional chest pain always means emergency | The seed uses reported new, worsening or persistent discomfort; exertion alone and a history of stable angina are insufficient. Clinical interpretation still needs validation. |
| Diabetic ulcer + fever means generic in-person today | The seed is immediate acute assessment, following NICE NG19 1.4.1. It does not independently prescribe EMS or transport. |
| Dose clarification means home care | Only a clinician/pharmacist review suggestion. Drug, concentration, exposure and timing can change urgency. No dose is calculated or recommended. |
| Four settings, with a single async bin | Preserve the existing five operational routes, including separate Priority and Standard async. |
| Shadow plumbing may fail the clinical branch | Matcher/audit exceptions are diagnostics. They cannot throw away the clinical branch. Invalid extra observations do not invalidate otherwise valid context. |

The most important adversarial test deliberately extracts `anaphylaxis_pattern=present` from a verbatim **denied** phrase. The matcher cannot detect that semantic lie from quotation identity. A second real-Mastra fixture mislabels “usual migraine” as anaphylaxis: shadow records an emergency candidate, but the independent clinical workflow still returns Priority async and issues no emergency notice. These are demonstrations of an enforcement risk, not evidence of a clinically accurate extractor.

## Eight research seeds and source review

Sources were opened and inspected on 2026-09-14. Reachability is not entailment, applicability, licensing permission to redistribute a full guideline, or physician approval. The application stores source links/sections and authored interpretations, not full copyrighted guideline bodies. These policy references are **not** injected into the patient's retrieved-evidence packet or counted as claim support for the generated answer.

| ID | All required facts | Candidate action / relation | Basis and limits |
|---|---|---|---|
| `acute-neurologic` | Sudden onset + focal deficit | Emergency / upgrade | [AHA TIA statement summary](https://newsroom.heart.org/news/stroke-symptoms-even-if-they-disappear-within-an-hour-need-emergency-assessment): recently resolved sudden symptoms still require emergency assessment. A historical deficit is different. |
| `acute-chest-discomfort` | New, worsening or persistent chest discomfort | Emergency / upgrade | [AHA unstable angina](https://www.heart.org/en/health-topics/heart-attack/angina-chest-pain/unstable-angina). [Stable angina](https://www.heart.org/en/health-topics/heart-attack/angina-chest-pain/angina-pectoris-stable-angina) demonstrates why exertion alone is too broad. |
| `anaphylaxis` | Acute allergic pattern with airway, breathing or circulation compromise | Emergency / upgrade | [Resuscitation Council UK guideline](https://www.resus.org.uk/library/additional-guidance/guidance-anaphylaxis/emergency-treatment-anaphylactic-reactions). Rash alone is not the predicate. UK treatment/telephone instructions are not copied into a US transport rule. |
| `suicidal-intent-plan` | Current intent with a plan | Emergency safety assessment / upgrade | [NIMH outpatient safety assessment](https://www.nimh.nih.gov/research/research-conducted-at-nimh/asq-toolkit-materials/adult-outpatient/adult-outpatient-brief-suicide-safety-assessment-guide). Not an exhaustive screen: imminent risk can exist without this complete fact pair. |
| `diabetic-ulcer-fever` | Diabetes + active foot ulcer + fever | Emergency acute assessment / upgrade | [NICE NG19 1.4.1](https://www.nice.org.uk/guidance/ng19/chapter/Recommendations). All facts must belong to the same patient's active foot episode. |
| `diabetic-inflamed-ulcer` | Diabetes + active foot ulcer + local inflammation | In-person today / upgrade hypothesis | NICE NG19 1.4.2 specifies referral within one working day for other active foot problems. The project's same-day setting is an operational interpretation, not a verbatim guideline deadline; more serious findings take precedence. A cut is not automatically an ulcer. |
| `rash-review-option` | Localized rash | Standard async / suggestion | [NHS cellulitis advice](https://www.nhs.uk/conditions/cellulitis/) distinguishes local inflammatory and severe systemic features. Standard-async routing is a project hypothesis, **not** something this source validates for every localized rash. |
| `dose-review-option` | Personal dose/units clarification request | Priority async / suggestion | [FDA pharmacist discussion guide](https://www.fda.gov/drugs/information-consumers-and-patients-drugs/stop-learn-go-tips-talking-your-pharmacist-learn-how-use-medicines-safely). Priority is a project hypothesis, not an FDA routing classification. |

An initially considered FDA medication-error URL returned 404; it was replaced with the inspected FDA page above. This correction is recorded rather than treating a plausible-looking URL as verification. Source-content hashes and automated policy-source drift monitoring are not implemented for these seeds; revision review remains a promotion requirement.

## Actual Mastra placement

```
patient message ─┬─ independent safety model ─ early action, if supported
                └─ context model
                   └─ optional canonical-fact shadow step → diagnostic audit only
                      └─ hybrid evidence retrieval
                         └─ disposition model → independent judge → bounded repair
```

The step is named `canonical-fact-graph-shadow`. It runs after context extraction and before retrieval/disposition. It does **not gate** the parallel safety branch. There are no invented “Supervisor A/B” roles: the implemented candidate has context, safety, disposition and judge roles. Matched paths do not enter disposition, safety or judge prompts, and do not emit response events. Feeding them to a supervisor now would contaminate the very comparison intended to establish benefit.

Important experimental limitation: shadow mode asks the existing context model for extra output. Even though paths cannot directly set the route, this added task can change that model's ordinary findings/queries and thus indirectly affect retrieval, disposition or latency. The injected-provider integration tests hold those outputs fixed; they do not prove whole-system invariance with live models. Keep this mode opt-in and measure it as a distinct prompt version. Only default-off mode leaves the context instructions/schema unchanged.

This is distinct from (1) the Mastra execution graph and (2) optional document-relation expansion in RAG. Graph retrieval expansion remains a separate, unproven component. Adding clinical rules is not an inference-speed optimization and is not a claim about Counsel's private architecture. [Mastra control-flow documentation](https://mastra.ai/docs/workflows/control-flow) describes the sequential and parallel mechanics used here. [Counsel's judge report](https://www.counselhealth.com/ai-report/llm-as-a-judge) supports task-specific, clinician-calibrated evaluation, not automatic trust in an unvalidated rule extractor.

## Contracts and reproduction

- `src/disposition/fact-graph.ts`: Zod vocabulary/observation/edge schemas, immutable eight-edge registry, matching, candidate precedence and fault isolation.
- `src/disposition/graph-config.ts`: role configuration. Existing provider/model defaults are unchanged. Model ID syntax validation is **not** model availability or structured-output compatibility testing. Alternate providers may need their own installed adapter, credentials and measured configuration.
- `src/disposition/clinical-graph.ts`: real Mastra integration, no extra model call. Shadow mode increases the context prompt/output budget; no latency neutrality is claimed.
- `src/disposition/graph-runtime.ts`: per-run configuration, prompt identity and durable `fact_graph_shadow` audit event. Complete runs also contain the report under `graph.factGraph`.

```bash
npm run fact-graph:test   # offline, no API calls
npm run rag:test          # includes real Mastra execution with injected providers

# Default: unchanged clinical behavior; no extra extraction or shadow step.
COUNSEL_FACT_GRAPH_MODE=off npm run review:dev

# Opt-in research only; restart the server after any configuration change.
COUNSEL_FACT_GRAPH_MODE=shadow npm run review:dev
```

Optional model-role variables: `COUNSEL_GRAPH_CONTEXT_MODEL`, `COUNSEL_GRAPH_SAFETY_MODEL`, `COUNSEL_GRAPH_DISPOSITION_MODEL`, `COUNSEL_GRAPH_JUDGE_MODEL`. Values use the installed Mastra provider/model syntax. Configuration and prompt hashes change when roles or shadow mode change; budget ledgers and historical results are not reset. Unknown pricing remains unknown in the scorer, not zero.

The matcher is deterministic given a fixed registry, exact message and extracted observation packet; its diagnostic timing is not deterministic. Edges require nonempty unique AND operands, target only settings, and cannot depend on observation order. Emergency takes precedence over same-day for **upgrade** edges only. Matching cannot combine patients/episodes, and conflicting observations cannot be majority-voted into a match. Quotes must occur exactly once in the original message. These constraints can reject useful ambiguous text; that rejection is diagnostic, not automatic escalation or clearance.

## Promotion gates

1. Finish the existing candidate's release gates before enabling graph enforcement. Keep all failures and unfinished runs in the denominator.
2. Evaluate canonical extraction separately: polarity, experiencer, temporality, episode binding, ambiguity and exact source fidelity. Include caregiver reports, educational quotations, old strokes, migraine/refill requests, denied symptoms, mixed-person foot/fever descriptions, and medication concentration/exposure cases.
3. Compare graph-off and shadow on the frozen physician development cohort using identical inputs, role models, corpus and sampling. C25 remains separately qualified. Never give reference labels to context extraction or retrieval.
4. Measure incremental emergency misses prevented **and** incorrect early upgrades, added questions/delay, completed-answer quality, claim support, latency and cost. A deterministic matcher passing unit tests is not clinical lift.
5. Review the new seed definitions and source applicability, including jurisdiction, operational timing and transport distinction. Add a policy-source revision process. Eight seeds are not a comprehensive emergency screen.
6. Only then design enforcement, with a correction/appeal path for mis-extracted facts. A model should not casually erase an established acute-care requirement, but a permanent lock on a false extraction is unsafe too. No-match and technical failure must never certify low risk.

## Verification

`npm test`, `npm run typecheck`, `npm run lint`, `npm run review:test`, `npm run review:build` and `npm run build` passed. `rag:test` has 55 tests, including 11 new matcher/configuration tests and three Mastra integration tests. The GUI suite has 132 tests. These establish software behavior, not clinical correctness. One initial type-check found a possibly undefined test field; it was corrected and the final checks passed. The only UI copy change makes reviewer acceptance vendor-neutral; exact role models remain recorded in each run. Existing local layout, routes and physician review data are preserved.

### Actual browser checks, graph off

Three consecutive submissions used the production-build `/candidate` GUI, including the real update control. All original messages and completed runs were inspected. The run configuration explicitly recorded `factGraphMode=off`; no shadow extraction was run live or inferred from these tests. The browser connector initially failed to connect, then recovered; that tooling failure was not a clinical model attempt.

| Input | Final result | Early action | Server final / browser receipt | Run ID |
|---|---|---|---|---|
| C50 usual migraine refill | Complete, Priority async; no early emergency/physical instruction | None | 77.65 / 78.47 s | `1007c894-cbf4-4810-afb0-a77930aaf58f` |
| C02 crushing chest pressure | Complete, Emergency now, **but early action failed** | None; a question appeared at 3.82 s | 82.42 / 82.43 s | `e7a2f837-af0b-4783-abbd-1f885e040e74` |
| C02 update: 911 called, ambulance on the way, pressure persists | Complete, Emergency now; original history retained and final text says keep ambulance coming | 6.95 s | 82.47 / 82.49 s | `b7962a00-74b9-42b5-9eb6-b3e539781b2a` |

All three needed one draft revision and six model calls each. Estimated generation/review spend totals **$1.389093**, excluding retrieval embeddings; this is the existing uncached token-cost estimate, not an invoice. No automated 50-case batch was launched and no budget ledger was reset.

The C02 early failure is a serious release blocker, not a successful test because the final route agrees. Haiku selected `EMS_NOW` with a correctly quoted positive chest-symptom basis, but added high cholesterol with `present=false`. The existing all-basis-present admission rule rejected the entire early notice. Final generation and review eventually produced the right emergency instruction, **82 seconds after submission**. This does not justify silently deleting contradictory evidence or enabling an unvalidated graph override. The next engineering priority is a minimal, auditable emergency-trigger contract with separate contextual findings and a tested conflict/recovery path; the clinical fast path must not disappear because auxiliary metadata is malformed. The judge also passed its clarification-delay criterion despite this clinically important wait: emitted-event timing needs explicit evaluation, not merely inspection of the final draft's wording.

The update's generic early message repeated “call 911” although the patient had already reported doing so; the final response acknowledged the ambulance. That is another context-handling limitation, not an example of perfect follow-through.

[Immutable export and scorecard](../../outputs/clinical-upgrade-shadow-off-2026-09-14/manifest.json): two final route agreements from two attempted reference cases, **not** 49/49. The update is separately retained as off-cohort. Forty-seven scoreable reference cases remain untested on this version, plus qualified C25. The aggregate final-route agreement must not conceal the absent early emergency instruction. The graph remains disabled, and the candidate is not presentation- or clinical-release ready.
