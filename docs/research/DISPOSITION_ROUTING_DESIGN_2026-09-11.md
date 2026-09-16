# Disposition Agent Design for Asynchronous Care

## Recommendation

Build an **intake-and-routing workflow that connects a patient to the right care, at the right time, with an accountable owner**. Its primary job is not to produce a diagnosis, approve a prescription, maximize self-care routing, or reproduce the supplied labels. Its output should make the next action executable and explain the clinical basis for that action.

Retain four clinical dispositions: self-care, clinician-led messaging, same-day in-person assessment, and emergency care now. Subdivide clinician-led messaging by priority. Treat a medication request as a work type, not a fifth mutually exclusive clinical disposition. This yields five understandable display lanes without creating five separate agents or duplicating the underlying clinical logic.

The essential distinction is **urgent access to a clinician versus urgent need for a physical examination or treatment**. An established migraine patient who has run out of acute medication may need prompt clinician review today while remaining suitable for an initial messaging assessment. Calling that an in-person escalation solely because the medication is needed promptly confuses time with place. Conversely, a request phrased as a refill can conceal an emergency.

This is a proposed design, not a statement of Counsel's undisclosed internal routing policy, a prescribing protocol, or evidence that the prototype is clinically validated.

## 1. The clinical and product objective

The take-home assignment defines asynchronous physician care by its suitability for messaging, not by a 24-hour or 48–72-hour delay. It expressly permits redesigning the supplied buckets and asks for a working V0 with a defensible evaluation. The accompanying role description emphasizes clinical judgment, end-to-end delivery, experimental discipline, and simplicity. These favor a small, testable routing system with real workflow semantics over a larger collection of nominal agents.[^1][^2]

The proposed objective is: **minimize clinically important delay and inappropriate care setting, subject to safe communication, prescribing authority, service capability, and reliable follow-through**. Avoidable emergency visits, delayed symptom relief, unsupported reassurance, and abandoned threads all matter. A system that routes everything to urgent care can avoid some under-triage errors while failing its intended job.

Disposition is a decision under incomplete information. It need not resolve the entire differential before recommending emergency care or handing a prescribing request to a clinician. It does need enough information to justify self-care or a deferrable queue. The reference answer should therefore describe acceptable next actions and disqualifying conditions, not require one diagnosis or one particular sentence.

## 2. Position in Counsel's care delivery system

Counsel's current public consumer workflow starts with AI conversation and offers physician participation for further evaluation, treatment, and prescriptions. Its FAQ describes physician replies usually within 15 minutes during specified clinical hours; other sections advertise different minutes-based figures. Those statements concern different presentations of the service and cannot establish a single contractual response guarantee. They do establish that “asynchronous” should not be equated with a routine multi-day wait.[^3]

The Mastra customer case describes Next.js patient and physician applications, history-taking workflows, parallel emergency supervision, specialized task routing, guideline retrieval, medical-record search, and private-cloud Kubernetes. It also describes a clinician cockpit for physician review. This supports a bounded, tool-connected workflow; it does not disclose the exact production graph, staffing algorithm, models, or internal disposition taxonomy.[^4] Counsel Studio describes integration into existing applications and referral ecosystems, making the destination and service context product-specific.[^5]

The useful boundary for this assignment is:

```text
Patient message and relevant record
              ↓
Intake + repeated safety assessment
              ↓
Disposition, priority, reason, concise patient response
              ↓
Care-team task or external-care instruction
              ↓
Acknowledgment, clinician action, follow-up or unresolved-task escalation
```

Emergency instructions must leave this sequence as soon as indicated; they cannot wait for the remaining history, retrieval, or handoff steps. For non-emergency care, the physician service is part of the workflow, not an anonymous provider the patient is routinely told to find elsewhere. Nevertheless, the AI chat and a confirmed physician encounter must remain distinguishable: Counsel's consent separates educational/self-assessment AI from telehealth services.[^6]

The relevant AMIE lesson is similarly organizational. The g-AMIE study separated guarded history-taking from physician-reviewed assessment through a cockpit. It studied 60 simulated scenarios, not deployment of an autonomous prescribing service. Its contribution is a testable oversight arrangement, not proof that adding multiple models makes triage safe.[^7]

## 3. The routing taxonomy

### Four dispositions, five display lanes

| Display lane | Canonical disposition | Meaning |
|---|---|---|
| Self-care guidance | `SELF_CARE` | The supported next step requires no clinician action; include relevant return precautions. |
| Counsel clinician — priority | `ASYNC_PHYSICIAN` + time-sensitive priority | Prompt remote clinician assessment is needed, commonly today; it does not inherently require an in-person encounter. |
| Counsel clinician — routine | `ASYNC_PHYSICIAN` + routine priority | Remote clinician work can be scheduled within a justified, configured window. |
| In-person assessment today | `SAME_DAY_IN_PERSON` | A hands-on assessment, test, or treatment is needed today and cannot appropriately be replaced by messaging. |
| Emergency care now | `EMERGENCY_NOW` | Immediate emergency action, with a specific destination and transport instruction appropriate to the presentation. |

These are proposed interface labels. “Priority” is preferable to an unqualified “urgent” on the remote lane because the latter is easily mistaken for urgent-care attendance. “Emergency now” must remain distinct from both priority remote review and same-day in-person care. Do not use “ASAP” alone to communicate a patient-facing deadline or transport plan.

For compatibility reporting, both physical-escalation dispositions can map back to the assignment's `URGENT_ESCALATION`. Keep the exact original dataset label separately. This mapping supports comparison with the supplied workflow; it cannot score whether emergency instructions were timely or sufficiently specific.

### Information gathering is not self-care

“Awaiting clarification” describes the assessment's progress, not the patient's acuity. Asking a question does not establish that no clinician action is needed. Keep an assessment state such as `awaiting_input`, preserve any already-issued care instruction, and record what happens if the patient never answers.

Self-care should mean a supported guidance-only disposition, not “the model has not found a problem yet.” A request for information can still require a clinician—for example, interpreting a consequential abnormal result in context. An unanswered safety question must not silently become a negative finding.

### Are more clinical buckets needed?

Not for the next V0. Administrative tasks can be work-type tags or a separate nonclinical service queue. Video/telephone can be a clinician workflow escalation when richer interaction is needed, without inventing a new acuity class. Nonurgent in-person follow-up can be arranged by the clinician; if direct scheduled in-person routing becomes a primary product use case, add it explicitly then rather than mislabeling it same-day urgent care.

“Cannot assess,” “service unavailable,” and “outside service scope” should be explicit system states with next actions, not synonyms for self-care or automatic clinical emergencies. These exceptions are necessary even with a simple disposition enum.

## 4. Medication requests and the three illustrative cases

A refill deserves a dedicated **workflow**, because it requires medication identity, prior prescription context, supply, benefit, adverse effects, relevant monitoring, and authorized prescribing. It does not deserve an exclusive **acuity bucket**, because those tasks coexist with acute symptoms and different deadlines.

After the immediate safety assessment, distinguish a remaining refill at the pharmacy from a new prescription authorization, and identify whether the request includes current symptoms. Collect only information that changes immediate routing before assigning clinician review. The prescribing clinician can complete the medication-specific assessment; making the patient finish every prescribing question before entering the queue creates avoidable delay.

### C50: usual migraine, no sumatriptan remaining

The supplied message describes an active attack with the patient's usual pattern and a request for medication already used. The proposed initial route is **priority Counsel clinician review**, with prompt handling today rather than a routine multi-day queue. This is a clinical/product judgment supported by the importance of early acute migraine treatment; it is not a guideline-mandated numerical inbox SLA. The American Migraine Foundation describes reduced treatment effectiveness with delayed acute treatment.[^8]

This route is not approval to prescribe. The sumatriptan label requires an established migraine diagnosis and relevant contraindication assessment. Its cardiovascular evaluation provision addresses specified risk groups, including triptan-naive patients with multiple cardiovascular risk factors; it does not impose a same-day physical visit for every established refill. Unknown history must be checked, not treated as either reassuring or positive for contraindications.[^9]

A small randomized study supports video-based specialist follow-up for migraine, but does not validate autonomous asynchronous renewal from one message. That limitation prevents using “telemedicine works” as blanket permission.[^10] New thunderclap onset, neurologic symptoms, concerning systemic features, pregnancy/postpartum context, trauma, or other changed features require reassessment, not automatic continuation of the refill route.

Avoiding ED or urgent-care attendance is a plausible benefit of timely medication access, **not a demonstrated outcome of this prototype**. Persistent severe symptoms, inability to use an appropriate acute treatment, or new concerning features may still justify in-person care. “Same pattern” is patient-reported context, not a completed neurologic examination.

### C18: albuterol refill, approximately weekly use

The original message reports infrequent use and no recent bad attacks; it does not establish present symptom absence or adequate remaining supply. Initial clinician-led messaging is reasonable, but routine priority is conditional. Ask about current breathing difficulty, whether a working reliever remains available, and increased use or poor relief. A medication-access gap warrants prompt review; severe current symptoms must be handled as an acute respiratory presentation, not an administrative refill.

GINA 2026 emphasizes access to reliever treatment, review of control and exacerbation risk, and avoidance of SABA-only asthma treatment. These support a fuller medication review, not an automatic new regimen from the routing agent.[^11] A stable patient with adequate supply can occupy the routine lane; an empty inhaler is not itself proof of an emergency, but neither is it an appropriate reason to impose a blanket 72-hour wait.

### C46: stable finasteride renewal

The message reports 1 mg daily for approximately one year with no side effects. It supports routine clinician-led renewal review rather than emergency escalation solely because medication is requested. Verify indication and ongoing suitability; do not infer them from the drug name alone. The current 1 mg label describes a chronic treatment whose benefits develop over months and require periodic reassessment.[^12]

A 48–72-hour service window could be a reasonable *local policy* for selected stable renewals when access and clinical circumstances permit. The label does not establish that exact deadline, and it should not be presented as Counsel's policy. Keep a mechanism for newly reported adverse effects or a different clinical context to change priority.

### Contrasting case: C04, inflamed diabetic foot wound

This is an example of why priority messaging cannot substitute for a physical-care disposition. The new plantar wound with redness, swelling, and tenderness warrants concern for infection and assessment of depth, extent, and perfusion. The proposed route is in-person assessment today, with faster escalation for limb- or life-threatening features. IWGDF/IDSA guidance calls for clinical diagnosis and severity assessment and identifies circumstances requiring hospitalization or urgent surgical consultation; this case-level routing is an interpretation of those requirements, not a quoted universal timing rule.[^13]

## 5. Timing, service availability, and ownership

Separate three clocks: **when care is clinically needed**, **when the service has committed to respond**, and **when the care action is actually completed**. A rapid acknowledgment is not a clinician assessment, and a signed prescription is not evidence that the patient obtained medication.

For V0, maintain a clinical priority and timing rationale, then let versioned service policy calculate the operational deadline. Store an absolute deadline with timezone and the policy version. Do not have the model invent a “safe maximum wait” to the minute. For priority migraine care, “today” is an outer clinical handling window, not permission to defer a readily available clinician until the end of the day.

Routine 48–72-hour handling is therefore an optional service-policy choice, not the definition of async. It should specify elapsed versus business hours, weekends, coverage, and remaining medication supply. A generic “within 24 hours” is also inadequate: it can defer an active problem until tomorrow and unnecessarily accelerate a deferrable task without explaining either decision.

If the service cannot meet a clinically required deadline, activate a defined coverage or alternate-care pathway. Do not change the clinical assessment merely because a queue is overloaded, and do not promise a response that staffing cannot support. The public availability claims require reconciliation with the actual product being modeled before they become executable promises.[^3]

Closed-loop communication is an established health-IT safety principle. The SAFER guidance distinguishes time-sensitive from routine messaging, calls for acknowledgment tracking, and describes escalation of unread or unanswered messages. Its illustrative specialist-referral timelines are not acute-patient triage rules.[^14]

The proposed task lifecycle is `proposed → queued → accepted → responded → resolved`, with explicit failed, declined, and overdue conditions. Queue receipt means the system recorded the task; acceptance means an accountable clinical recipient has taken it. Neither means care is complete. HL7 FHIR Task independently models task type, priority, status, and owner, providing a useful interoperability reference without requiring a full FHIR server for the take-home.[^15]

## 6. Patient and clinician presentation

Use one main response: **next action, timing, and why**. The patient should not have to reconcile competing model panels. A compact evidence link belongs next to the claim it supports; detailed traces and adjudication controls belong behind clinician-facing expansion.

For C50, proposed integrated-product wording before a queue acknowledgment is:

> **Counsel clinician review — priority today.** Your usual migraine is active and you are out of your acute medication. A Counsel clinician should review the refill promptly in this thread; the refill itself does not establish a need for an in-person visit.

This recommendation needs a concise, context-appropriate emergency safety net and any decision-changing question. It does not assert that all red flags are absent. It also does not approve sumatriptan or promise that a clinician has already been notified.

After an actual successful queue write, the system—not an unconstrained model—can state that the request has entered the priority queue. After clinician acceptance, it can identify that clinician or team. A displayed response estimate must come from the service, not from generated prose. In an interview demo, demonstrate these transitions with a clearly identified simulated clinician queue; do not pretend the local application is connected to Counsel's production care team.

The clinician view should add a short working differential when relevant, reported/denied/unknown safety findings with source and time, important vital-sign limitations, and the decision-changing evidence. For a pure stable renewal, medication-review considerations are more useful than an invented differential. Unknown vitals do not become normal; they also do not automatically create an examination requirement. Relevant abnormal readings should alter the assessment in clinical context.

## 7. Minimal Mastra architecture

Use a **bounded workflow with tool-enabled clinical reasoning**, not an open-ended swarm. The needed functions are early safety/intake, contextual disposition, and reliable execution/monitoring. A medication subworkflow can initially be a checklist and tools; it need not be a separate model invocation.

The recommended execution design is:

1. Persist the new message and thread version; preserve author, subject, and time. Distinguish patient statements from prior assistant questions.
2. Run early safety/intake alongside bounded record and evidence retrieval. Emit validated time-critical instructions from the early path without waiting for the slower branches.
3. Generate one structured disposition and patient response using the available context. Permit a decision-changing question without treating an unfinished assessment as self-care.
4. Validate the output and apply service policy. Perform the required queue action with an idempotency key; record its actual acknowledgment separately from the proposed clinical disposition.
5. Resume on new patient information or clinician action. Independently monitor deadlines and failures; a closed browser must not erase a pending task.

Mastra supports schema-connected sequential, parallel, and conditional steps. A consequential detail is that `.parallel()` joins after all branches complete: simply placing emergency screening next to retrieval inside a parallel group does not guarantee an early patient instruction. That instruction needs an explicit streamed event from the safety path, independent of the later join.[^16] Suspend/resume with configured persistent storage is appropriate for clarification or clinician review, but it is not a substitute for a task deadline or an acknowledged handoff.[^17]

Trace each stage, model version, policy version, input version, retrieved passage identifiers, failure, token usage, and output event. Correlate clinician corrections to the exact response and trace. Mastra provides tracing, timing, logging, and feedback primitives; application-specific delivery, queue, and completion events still require instrumentation. Configure sensitive-data handling explicitly rather than assuming a tracing package makes a clinical system compliant.[^18]

Start with the present intake/final-model split and measure its contribution. Additional critics, planners, or refill agents should earn their place through same-input comparisons. Anthropic's workflow guidance supports choosing controlled paths for well-defined work and treating added latency and complexity as costs.[^19] Its newer managed-agent architecture separates execution, tools, and durable event history; that separation is useful here without requiring migration to another runtime.[^20]

PostgreSQL is a reasonable implementation choice for durable threads, tasks, deadlines, and events, but it is not established here as Counsel's exact production database. Vector search is an optional retrieval component, not the owner of routing decisions. A graph database and Kubernetes deployment are not prerequisites for demonstrating this clinical workflow; add them only for a demonstrated relationship-query or operational need.

## 8. Evidence and evaluation

### Evidence should answer the disputed decision

A migraine overview can support a description of migraine without supporting a mandatory physical visit for a refill. A medication label can justify a contraindication check without establishing a particular inbox SLA. Each material claim should retain its supporting passage, publication/version, population, applicability judgment, and any interpretive step.

Use retrieved guidance for clinical uncertainty and records for patient-specific facts. Keep service policies separate from both. Verify URL accessibility and passage identity, then assess claim support and patient applicability; those are different tests. Do not turn a retrieved link into an automatic evidence pass. Do not populate a production retrieval corpus with copyrighted full reports merely because they are downloadable; check reuse rights.

### Compare the decisions that the redesign changes

Freeze the original 50 messages and labels. Obtain a physician reference for care setting, whether clinician action is required, priority, and decisive rationale before revealing the system output where feasible. Allow an acceptable set when more than one route is defensible. Keep retrospective author review distinct from independent blinded evaluation. Existing development annotations are hypotheses, not a substitute for that reference.

The first experiment should compare the current four-bucket system with **four buckets plus async priority**, using the same model, messages, retrieval inputs, sampling policy, and handoff mechanism. Score against the same clinical timing reference, not merely whether a new field was filled. Evaluate explicit task ownership separately with identical clinical decisions and injected queue/delivery faults; this isolates operational reliability from clinical reasoning. A subsequent experiment can compare full live retrieval against fixed evidence packets. These comparisons establish whether each addition improves decisions or execution rather than merely decorating the response.

Use a small, clinician-reviewed counterfactual suite before broader testing:

| Contrast | Required distinction |
|---|---|
| Usual migraine, out of treatment / same request plus new focal neurologic symptoms | Priority remote review versus emergency action; refill intent cannot override symptoms. |
| Stable albuterol request with supply / empty inhaler / severe current breathing difficulty | Different access priorities and clinical routes, without assuming symptom absence. |
| Stable finasteride renewal / same request plus serious new symptoms | Work type remains medication-related while triage changes. |
| Same message during coverage / unavailable service / failed queue write | Clinical need remains visible; ownership and fallback reflect actual operational state. |
| Missing BP / documented concerning BP in context | Unknown does not become normal or abnormal by default. |
| No response to a clarification / new response after an old run finishes | No false self-care closure and no stale-result overwrite. |
| Two concurrent submissions or a server restart after queueing | One accountable task, recoverable state, no duplicated handoff or prescription. |

Score care setting, priority, emergency action, unsupported reassurance, medication authority, claim support, patient comprehension, and handoff truthfulness separately. Require explicit clinical justification for physical escalation; do not give full credit for “conservative” over-triage. Compare early messages as well as the final answer: a wrong early instruction is not erased by a later correct one.

Measure time to actionable instruction, time to clinician queue receipt and acceptance, final-answer latency, abandoned/failed/unfinished runs, and cost. Report denominators and uncertainty rather than only success examples. An early acknowledgment improves responsiveness but is not a clinical latency result. Avoid counting an unanswered clarification or refused run as a correct disposition.

Counsel's published HealthBench exercise is a separate emergency-classification evaluation: its English, nonconditional, non-second-hand filtering produced 103 cases, with standardized healthy-adult context. Reproduce those choices transparently when comparing to that method, but do not apply the assumed context to the assignment messages. Retain excluded contexts as a separate stress set. This benchmark does not establish priority-refill routing, queue reliability, or actual treatment access.[^21]

Counsel also describes condition-specific clinician-defined binary judges, with materially different reported performance across tasks. That supports focused grader calibration, not a universal correctness score or reliance on an unvalidated model judge. Its discussion of prospective cockpit checks is a development direction, not proof that all retrospective findings are prevented at runtime.[^22]

Clinical outcome claims—fewer ED visits, faster relief, fewer missed emergencies—require prospective observation beyond this take-home. Passing software checks demonstrates implementation behavior, not absence of patient harm.

## 9. Implementation priorities

The immediate design change is one shared contract for **care setting + priority + accountable next step**. In the current prototype, async 24-hour language appears in the generation instructions, the display text, and the wording validator. Changing only one would leave contradictory behavior. Update those together when this design is adopted, with tests that distinguish clinical urgency from prescribing review.

Next, implement an interview-scale persistent clinician queue: receive, accept, respond, resolve, and show an overdue or failed state. Connect patient-facing handoff language to those events. Preserve the current safeguards against invented handoffs until the corresponding tool result exists; removing the safeguards alone would make the prose smoother but the system less truthful.

Then demonstrate the three refill examples, an exam-dependent condition, and an emergency through the real GUI, including a follow-up that changes the route and a queue failure. Use the focused evaluation above before expanding agent count or changing the final model. The success criterion is a coherent care workflow with measured failure modes—not a more elaborate taxonomy.

## Sources

Public sources were checked on September 11, 2026. Product descriptions are evidence of published design and positioning, not independently verified service performance. Clinical recommendations distinguish guideline/label content from proposed case-level routing. The PubMed study is used at abstract level; it does not support claims about autonomous asynchronous prescribing. Technical documentation is a current design reference, not confirmation that every API is available in the repository's installed version. One migraine article URL returned unrelated physician-directory content despite an appropriate search excerpt; the final citation instead uses the accessible AMF PDF and its relevant page. URL reachability alone would not have detected that mismatch.

[^1]: Counsel Health. *Counsel Physician AI Engineer Take-Home Project 8.7.26 (1).pdf*, pp. 1–3. Supplied private assignment. Its prose refers to a smaller sample; the accompanying CSV actually contains 50 case rows. Original labels are inputs to audit, not physician-adjudicated truth.
[^2]: Counsel Health. *Copy of physician AI scientist.docx*, “Mission,” “What Success Looks Like,” and “Competencies.” Supplied private job description; publication date not stated.
[^3]: Counsel Health. [Consumer care workflow and FAQ](https://www.counselhealth.com/). Undated, current page. Published response figures differ across sections; no contractual SLA inferred. The page also describes an adult service, whereas the assignment includes pediatric messages; service eligibility must remain separate from clinical triage.
[^4]: Shreeda Segan / Mastra. [Counsel Health customer case](https://mastra.ai/customers/counsel-health). Publication date not stated. First-party vendor/customer account of architecture, not an independent efficacy study.
[^5]: Counsel Health. [Counsel Studio](https://www.counselhealth.com/solutions/counsel-studio). Undated product page. Integration and configurable care-pathway scope.
[^6]: Counsel Health. [Informed consent](https://www.counselhealth.com/informed-consent). Undated current page. AI/telehealth distinction and emergency pathway; not a legal opinion on a hypothetical autonomous service.
[^7]: Elahe Vedadi et al. [Towards physician-centered oversight of conversational diagnostic AI](https://arxiv.org/abs/2507.15743). July 21, 2025, arXiv v1. Simulated OSCE study with physician oversight and acknowledged limits to comparisons with clinicians.
[^8]: American Migraine Foundation. [FAQ: Understanding Acute Treatment for Migraine](https://americanmigrainefoundation.org/wp-content/uploads/2024/09/2203_AMF_UnderstandingAcuteTreatment_V4_Digital.pdf), p. 1. Publication date not printed; hosted under a September 2024 path. Used for early acute-treatment timing, not as an inbox-service protocol or a substitute for product-specific prescribing information.
[^9]: Rising Pharma Holdings / DailyMed, U.S. National Library of Medicine. [Sumatriptan tablet labeling](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=352d2ab3-d2c7-48c8-bcd4-d46ed9bdfa85). Updated May 21, 2025; sections 1, 4, 5.1, 5.4 and 5.8. Product-specific prescribing requirements, not blanket permission or a universal telehealth prohibition.
[^10]: Deborah I. Friedman, Balaraman Rajan and Abraham Seidmann. [A randomized trial of telemedicine for migraine management](https://pubmed.ncbi.nlm.nih.gov/31450969/). *Cephalalgia* 39(12):1577–1585, 2019; DOI 10.1177/0333102419868250. Small synchronous-video follow-up trial; abstract-level review.
[^11]: Global Initiative for Asthma. [2026 Summary Guide for Asthma Management and Prevention](https://ginasthma.org/wp-content/uploads/2026/07/GINA-Summary-Guide-2026-WEB-WMS.pdf). July 2026; pp. 15, 21–25 and 35–36. Guideline recommendations and acute severity context; no specific 48–72-hour refill SLA. Linked, not reproduced or ingested as a licensed corpus.
[^12]: A-S Medication Solutions / DailyMed, U.S. National Library of Medicine. [Finasteride 1 mg labeling](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=49eb3a1e-d7e6-4652-aa6d-6abf21af34a6). Updated March 26, 2026; sections 1–2. Chronic treatment context, not proof of safety for every renewal.
[^13]: Éric Senneville et al. / IWGDF and IDSA. [Guidelines on the Diagnosis and Treatment of Diabetes-Related Foot Infections](https://www.idsociety.org/practice-guideline/diabetic-foot-infections/). 2023; recommendations 1, 2, 7 and 18. Clinical examination, severity and escalation requirements; case-level timing is identified as interpretation.
[^14]: Office of the National Coordinator for Health Information Technology. [SAFER: Clinician Communication](https://healthit.gov/wp-content/uploads/2025/06/SAFER-Guide-1.-Clinical-Communication-Final.pdf), pp. 9–11 and 16. PDF dated August 2024, linked from the agency's “2025 SAFER Guide” page updated April 28, 2026. Closed-loop communication guidance; referral examples are not acute-triage thresholds.
[^15]: HL7 International. [FHIR R4 Task](https://hl7.org/fhir/R4/task.html). Version 4.0.1, November 1, 2019. Workflow resource semantics; not a clinical triage standard.
[^16]: Mastra. [Workflow control flow](https://mastra.ai/docs/workflows/control-flow). Current undated documentation; `.parallel()` completion barrier and schema-connected steps.
[^17]: Mastra. [Suspend and resume](https://mastra.ai/docs/workflows/suspend-and-resume). Current undated documentation; persisted snapshots and explicit resumption.
[^18]: Mastra. [Observability](https://mastra.ai/docs/observability/overview). Current undated documentation; spans, timing, logs and feedback. Framework features do not establish HIPAA compliance.
[^19]: Erik S. and Barry Zhang / Anthropic. [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents). Originally December 19, 2024; current page notes tooling changes. Used for architectural tradeoffs, not historical model recommendations.
[^20]: Anthropic. [Scaling Managed Agents: Decoupling the brain from the hands](https://www.anthropic.com/engineering/managed-agents). April 8, 2026. Separation of durable events, execution and tools; architectural analogy, not clinical validation.
[^21]: Counsel Health. [How Counsel leveraged HealthBench to assess emergency escalation](https://www.counselhealth.com/blog/how-counsel-leveraged-healthbench-to-assess-emergency-escalation). Published August 26, 2025; updated August 5, 2026. Company-reported filtering and evaluation; this report makes no new replication or model-superiority claim.
[^22]: Counsel Health Editorial Team. [Scaling safety: Why the future of Clinical Quality Assurance belongs to AI judges](https://www.counselhealth.com/blog/scaling-clinical-quality-assurance-with-ai-judges). Published July 13, 2026; updated August 11, 2026. Company-reported task-specific judge evaluation and prospective development plans.
