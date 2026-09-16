# Clinical response standard: clarity without invented reassurance

Design date: 2026-09-10. Intended target: reliable longitudinal asynchronous
clinical care. Current artifact: supervised, synthetic research only.

The engineering objective is to make the right decision, communicate it clearly,
and verify that the necessary care happened. Authorization is a separate question.
A plausible answer and a high benchmark score do not establish that the
necessary care occurred. Evaluation must examine missed findings, inappropriate
recommendations and failures to complete the care pathway.

This is a proposed engineering standard, not a published professional guideline.
The cited sources support specific principles below; they do not endorse this
implementation or constitute validation of autonomous asynchronous care.

## What each response should contain

The patient gets a short, comprehensible action and explanation. The clinician
gets the same decision plus its inspectable evidence. Do not make patients read an
exhaustive differential or complete a generic review of systems before receiving
time-critical advice.

| Element | Required substance | Unacceptable substitute |
|---|---|---|
| Action and timing | Emergency now, same-day in-person, or a specific async/self-care plan; explain why that latency is acceptable | “Urgent” without a destination or deadline |
| Pertinent red flags | Exact findings reported, specific symptoms explicitly denied, and decision-relevant unknowns; identify source and time | “No red flags” because the patient did not mention them |
| Physiology | Relevant available readings with interpretation and limitations; identify important missing measurements | “Vitals normal” without measurements, or a score with missing inputs treated as zero |
| Clinical assessment | Brief prioritized differential: plausible leading explanation, serious alternatives that affect action, and discriminating evidence | A diagnosis declared certain from a short message; a long undifferentiated list |
| Next information | Only questions, examination or testing that can change the immediate plan | Repeated questions that postpone an already indicated escalation |
| Treatment, if offered | Indication, patient-specific contraindications, allergies/interactions, dose/route/duration where applicable, monitoring and stop rules | Generic treatment detached from medication, pregnancy or organ-function context |
| Safety net and ownership | What changes the plan, how quickly to act, named responsible service and follow-up deadline | “Seek care if worse” without defining the concerning change or response |
| Evidence | Claim-linked guidance, population/setting applicability, version and retrieval record | A prestigious organization's homepage or a working hyperlink treated as proof |

These are content obligations, not eight mandatory paragraphs or eight new
adjudication fields. Emergencies lead with immediate action. A routine medication
question needs medication-specific risks, not an irrelevant catalog of disasters.
The system should preserve room for the patient's own account and corrections:
AHRQ's diagnostic-safety toolkit emphasizes patient–clinician information sharing
and listening, not checklist completion alone.
[AHRQ toolkit](https://www.ahrq.gov/diagnostic-safety/tools/engaging-patients-improve.html).

### Red flags: list the evidence, not a fabricated negative screen

For every new patient turn, reconcile the pertinent safety state against the
original statements. “Not reported,” “asked but unanswered,” “explicitly denied,”
“previously denied,” “reported earlier but now resolved,” and “contradictory” are
different facts. An ideal structured record preserves these distinctions at the
**individual symptom** level. Denial is a patient report, not disease exclusion.

Example of evidence-language, not a treatment recommendation:

> **Safety review:** Patient denies fever and back pain in this message. These
> statements do not establish a measured temperature or exclude upper-tract
> infection. Vomiting, ability to drink and new systemic deterioration have not
> been established. Pregnancy is denied by the patient; testing status is unknown.

That is more clinically useful than “No red flags present.” Likewise, “no
weakness” cannot clear facial droop, speech disturbance or the entire neurologic
category. If different symptoms are reported and denied, reconcile them instead
of automatically labeling them a contradiction or a resolved episode.

At each turn, identify changes in onset, severity, trajectory and elapsed time.
Do not silently copy an earlier denial into a current negative. Resolution of a
previously concerning symptom must not automatically downgrade the plan. Preserve
both the initial event and the current report for clinical reassessment.

## Vital signs are evidence, not decoration

NICE's suspected-sepsis guidance calls for physiologic assessment including
temperature, pulse, respiratory rate, blood pressure, consciousness and oxygen
saturation. It warns that normal blood pressure does not exclude sepsis in young
people, recommends contextual interpretation, and cautions about pulse-oximeter
measurement error, including overestimation reported in people with dark skin.
Community oxygen measurement must not delay assessment or treatment. These are
specific face-to-face sepsis recommendations, not a universal asynchronous
clearance rule.
[NICE NG253, assessment](https://www.nice.org.uk/guidance/NG253/chapter/face-to-face-assessment).

Proposed observation contract:

```text
measurement = value + unit + subject + observed time + received time
            + measurement method/device + oxygen support where relevant
            + provenance + data-quality assessment
interpretation = measurement + age/pregnancy + symptoms + medications
               + baseline/trend + applicable versioned clinical policy
```

In the ideal system:

- Parse and preserve the original measurement before normalization. Never assume
  whose reading it is, whether it is current, or whether an unlabeled temperature
  is Celsius or Fahrenheit. Record patient report versus connected-device data.
- Surface abnormal, unexpectedly changing, discordant and implausible values.
  Distinguish physiologic danger from possible measurement error; a potentially
  dangerous reading must not disappear just because confirmation is desirable.
- Interpret the pattern, not only each number. A “normal” value does not erase
  concerning symptoms, an abnormal baseline does not automatically justify a new
  deterioration, and a missing measurement is neither normal nor abnormal.
- Select population- and setting-specific policies. No universal adult normal
  range copied to infants or pregnancy; no NEWS2 or other decision-rule result
  without the necessary inputs and eligibility. A rule supports judgment; it does
  not manufacture diagnostic certainty.
- Ask for measurements only when they help the decision and obtaining them is
  feasible without unsafe delay. Lack of a home device is an access constraint,
  not a patient failure. Explain when an in-person assessment is needed instead.
- Separate a missing numeric temperature from a denial of subjective fever.
  Track mental state, functional change and ability to maintain hydration when
  relevant, rather than reducing physiology to five numeric fields.

**Not implemented yet:** normalization, authenticated device ingestion, numeric
abnormality classification, threshold-driven escalation, population-specific
vital policies or a validated physiology scorer. The current inventory preserves
candidate mentions for review; it does not perform those functions.

## Orchestration that earns the answer

Target design—not a claim that every stage is shipped:

```text
Versioned conversation snapshot
  → immediate emergency recognition / action path (no retrieval or judge wait)
  → source-bound symptom and vital reconciliation
  → applicable clinical policy + concise synthesis
  → independent checks on evidence, omissions, plan and communication
  → action delivery → acknowledgment → care/follow-up completion
                             ↘ deadline breach / failed delivery → staffed response
```

The safety process must be able to interrupt synthesis. A judge timeout cannot
silence emergency instructions. No clinical agent should possess unrestricted
messaging, prescribing or chart-write authority: each action uses a typed,
validated interface with an accountable owner, idempotency and an audit record.
Critical actions need retry/duplicate protections, not duplicate care orders.

Evidence retrieval should filter by population, indication, setting and currency
before ranking, and retain source passages tied to the claims they support.
Publisher prestige is not a substitute for applicability. ACOG, AAFP and relevant
specialty guidelines can support condition-specific decisions; a board's broad
competency framework is not automatically a bedside management guideline.
When guidance conflicts or evidence is insufficient, preserve the disagreement
and its clinical consequence rather than letting the synthesizer hide it.

Use narrow quality checks with visible failure reasons. Counsel describes
specialized judges and physician-defined rubrics; its reported performance varies
by clinical task. That supports testing each judge separately, not treating an
aggregate accuracy number—or a stricter grader—as proof of safety.
[Counsel's CQA account](https://www.counselhealth.com/blog/scaling-clinical-quality-assurance-with-ai-judges).

Operational traces should record stage timing, failures, policy/model versions,
tool use and handoff state. Exact clinical evidence belongs in a separately
governed clinical record, not unrestricted observability logs. A sent message is
not proof of receipt; receipt is not proof of comprehension or successful access
to care. The system must say what it actually observed at each stage.

## Evaluation: show benefit, not checklist compliance

Freeze the evaluation plan before tuning. Keep development messages, clinician
reviewed cases and untouched test episodes separate. Test complete longitudinal
episodes, including failed delivery and new information, not only isolated
responses. A generated assertion cannot serve as its own reference answer.

| Experiment | Failure it must detect | Report |
|---|---|---|
| Symptom evidence challenge | Negation scope, quotation, another person's history, uncertain onset, omitted relevant flags | Symptom-level false negatives/false negatives-by-omission and false positives against independent review |
| Multi-turn transitions | Stale denials, new symptoms, resolved but important events, contradictions, message reordering | Missed escalations and time to correct action by episode |
| Physiology challenge | Wrong units/subject/time, device errors, pregnancy/age mismatch, abnormal trends and danger despite reassuring readings | Interpretation/action errors by population and severity; abstention coverage |
| Evidence challenge | Fabricated citation, correct URL but wrong claim, outdated or inapplicable guidance | Claim support and guideline applicability, not link reachability alone |
| Action/communication challenge | Emergency advice buried after questions, vague urgency, unsafe waiting, failed receipt or inaccessible destination | Time to actionable instruction and completed handoff; patient comprehension |
| Judge validation | Self-confirmation, context overload, omission mistaken for negative, strictness mistaken for benefit | Criterion-specific sensitivity, precision, agreement, abstentions and adjudicated disagreements |
| Ablation | A new agent/checklist adds burden without improving care | Paired comparison of base workflow, evidence layer, physiology policies and judges: safety, unnecessary escalation, questions, latency and cost |

The primary clinical endpoint should penalize a missed or delayed emergency
explicitly; correct formatting cannot offset that failure. Separately report
same-day routing, over-escalation, unnecessary testing, unsafe treatment,
patient burden and equitable performance. Compare against a blanket-escalation
baseline so that more referrals cannot masquerade as better discrimination.

Report denominators, uncertainty intervals, retries and abstentions. Predetermine
acceptable bounds with clinical governance rather than choosing thresholds after
seeing results. Use repeated trials and patient/episode-level splits. One
clinician can provide valuable take-home adjudication; it is not an independent
multi-clinician validation program, and model consensus cannot replace it.

The existing derived HealthBench result exposes a generalization problem. Passing
the regression suite below does not erase that finding. No clinical sensitivity,
harm reduction or autonomous-care readiness estimate is established by this patch.

## What this increment actually implements

- A versioned `safetyReview` on **every supervised Mastra intake result**: normal
  model completion, emergency/same-day bypass, self-care bypass and degraded model
  failure. It does not make a provider call and does not change routing.
- A deliberately narrow literal statement inventory, exact source-turn excerpts,
  stale-report markers and raw vital-sign mentions. `clinicalClearanceEstablished`
  is always false. A recorded denial does not clear its whole category.
- A clinician safety panel on the revealed comparison, kept behind the independent
  judgment lock to avoid contaminating the initial assessment. No extra required
  review fields. Older answers are preserved.
- New comparison exports can record the inventory version and content hash.
  Legacy exports remain readable and are not retroactively attributed new evidence.
- Agent instructions prohibiting invented safety clearance, plus a partial
  lexical guard that rejects several common blanket-reassurance phrases and uses
  the existing clinician-review fallback. This is **not** a semantic entailment
  checker: it can miss paraphrases and reject quoted or negated meta-statements.
- A one-way safety latch: a schema-valid agent emergency signal survives later
  rejection of its prose or citations. The invalid synthesis is discarded, but
  escalation remains immediate. This fixes a failure interaction; it does not
  establish that the agent detects emergencies reliably.
- Emergency agent routes now carry an immediate emergency action rather than a
  conditional instruction to wait for worsening. The generic degraded response
  requests review without asserting that a clinician has accepted the handoff.
- Regression tests for representative negation/temporal cases, all 50 source
  alignments, masked rendering, provenance round-trip, emergency bypass,
  unsupported-clearance fallback and persisted-trace payload exclusion.

The literal parser is not a clinical screen: its finite vocabulary misses
paraphrases and risks, can mishandle cross-sentence attribution, and does not
establish that all pertinent symptoms were assessed. Its coarse groups cannot
prove that a previously reported symptom and a later denial refer to the same
symptom. Its outputs must remain inspectable suggestions until replaced or
supplemented by independently evaluated symptom-level extraction. The next
clinical implementation priority is that extraction plus applicable physiology
policies, evaluated against a frozen clinician-reviewed challenge set—not making
this inventory's labels more confident.

## Reproduction and source accountability

```bash
npm run review:test
npm run typecheck
npm test
npm run lint
npm run review:build
node --experimental-strip-types scripts/check-clinical-sources.mjs --response-standard
```

The source registry is
[`research/response-standard-sources.json`](research/response-standard-sources.json).
The last command appends a timestamped, hashed report to
[`research/link-checks/`](research/link-checks/), including redirects and failures.
It sends only public URLs, never case text. HTTP 200 establishes reachability,
not clinical correctness, claim entailment or approval. Research on 2026-09-10
read AHRQ and Counsel directly; NICE's official text was available through its
search index while the web reader's direct request returned 403. The separately
logged HTTP check may differ by client and must be reported as observed.

The [2026-09-10 check](research/link-checks/2026-09-10T04-40-52.407Z-5722a0579418.json)
returned HTML 200 for NICE and Counsel, and HTTP 403 for AHRQ. The checker exited
with its expected findings status (2); it did not treat the blocked link as valid.

Validation for this increment: 160 tests passed (54 workbench, 65 core, 23 Mastra,
18 quality-audit), plus type checking, lint and the production workbench build.
These are software-contract tests with synthetic/scripted inputs, not clinical
performance measurements. No paid provider calls were made. No original messages,
stored clinician answers or prior evaluation result artifacts were rewritten.
