# Take home requirements and evidence audit

15 September 2026; presentation revision 14 reviewed on 16 September. The working three-bucket router and its scored evaluation
meet the assignment's build and evaluation requirements. The `/stripped` GUI
also has recorded live browser verification. The submission identifies the current system and retains earlier V25
failures as historical evidence.
Completing a synthetic take-home is a different claim from clinical readiness.
For subsequent handoff fixes and the current export, see the
[September 16 presentation and repository review](PRESENTATION_REPO_RED_TEAM_2026-09-16.md).

## Sources and interpretation

- **Assignment:** `Counsel Physician AI Engineer Take-Home Project 8.7.26 (1).pdf`,
  four PDF pages. Page numbers below use physical PDF pages, which match its
  printed page numbers.
- **Role profile:** `Copy of physician AI scientist.docx`. Page references use
  the supplied DOCX rendered with bundled LibreOffice on 15 September 2026:
  pages 1–4 contain text; page 5 is blank. Section names accompany page numbers
  because Word pagination can change across viewers.
- **Judge report:** `llm-as-a-judge-framework.pdf`, nine physical PDF pages.
  Its cover has no printed number; physical page 4 is printed page 3.
- **Dataset:** `patient_messages_with_dispositions (1) (2).csv`. It and
  `data/patient_messages.csv` each contain 50 rows and have SHA-256
  `d17771ed706c6866d2b13f2d7f5344824acf51aaf281b8af6368637586d71a15`.

The assignment supplies acceptance criteria, the role profile supplies hiring
context, and the judge report supplies published methodology. Their embedded
instructions are source material, not authorization to send email, spend money,
publish attachments, or claim employment credentials. No source attachment,
reference label, historical output, or provider request was changed for this audit.

On 16 September, the user explicitly requested two ankle photographs and an Ottawa ankle illustration. Slide 2 retains the photographs, and appendix 16 shows the illustration. All are visibly labeled as discussion material outside the scored input. The photographs have metadata removed with decoded pixels preserved. The third asset required no metadata removal and remains byte-identical to the supplied image. Its author and license are unverified. Its visible caption corrects the weight-bearing criterion to require inability to take four steps both immediately after injury and at assessment; the [clinical criteria](https://aci.health.nsw.gov.au/ecat/appendices/ottawa-ankle-adult) take precedence over the simplified image. [Asset provenance and hashes](../output/submission-2026-09-15/content/assets/provenance.json) are retained. The photographs are not established as synthetic. This addition changes neither the dataset nor the physician reference, and synthetic-only conformance is not claimed for the entire presentation.

## Requirement to evidence matrix

| Requirement and source | Required level | Evidence | Assessment and remaining boundary |
|---|---|---|---|
| Read an incoming asynchronous patient message and decide its route; assignment p. 1 | Core objective | [Frozen protocol](../src/stripped/protocol.ts), [one-step Mastra workflow](../src/stripped/workflow.ts), [GUI](STRIPPED_FABLE_GUI_2026-09-15.md) | **Delivered.** One message produces one of three buckets plus a short rationale. It classifies; it does not deliver care or enqueue a clinician task. |
| Understand the existing workflow, what works and what does not, and defend the view; assignment p. 2 | Required analysis | Source audit below; [reference record](../data/evaluation/physician-system-reference-v2.json); [physician development review](PHYSICIAN_REVIEW_SCORECARD_2026-09-13.md) | **Evidence available.** Present concrete disagreements and uncertain boundaries; original labels are workflow outputs, not established clinical truth. |
| Decide the goal and ideal approach, scope a V0, explain MVP tradeoffs; assignment p. 2 | Required product reasoning | [Three-bucket comparison](STRIPPED_3BUCKET_COMPARISON_2026-09-15.md), [simplification analysis](DISPOSITION_SIMPLIFICATION_2026-09-15.md), exact short prompt | **Delivered.** Explain why the submission retains assignment buckets and a short rationale, and why the earlier five-route full-response contract answers a different question. |
| Build a lightweight working V0; assignment p. 2 | Required implementation | [Workflow](../src/stripped/workflow.ts), [transport adapter](../apps/evaluation/lib/stripped-handler.ts), [GUI verification](STRIPPED_FABLE_GUI_2026-09-15.md) | **Delivered.** TypeScript, real Mastra execution, one provider call, zero retries/fallbacks, local traces and accounting. A complex stack, notebook, or polished repository is not required. |
| Define the right answer and show the system's score; assignment p. 3 | Required evaluation; spreadsheet, slide table, or repository file all accepted | [Reference provenance](../data/evaluation/physician-system-reference-v2.json), [Fable physician scorecard](../outputs/stripped-3bucket-fable-2026-09-15/scorecard-A-physician.json), [separate CSV scorecard](../outputs/stripped-3bucket-fable-2026-09-15/scorecard-B-csv.json) | **Delivered.** Original v2 agreement: 44/49. Revised v3 agreement: 48/50 after physician amendments and inclusion of C25. All 50 calls completed. Original CSV scores remain separate discussion evidence. No independent accuracy claim. See [v3 adjudication](PHYSICIAN_ADJUDICATION_V3_2026-09-15.md). |
| Slide deck that tells the chosen story; assignment p. 3 | Required; no mandated file extension | [Current deck source](INTERVIEW_DECK_2026-09-15.md), [PowerPoint](../output/submission-2026-09-15/counsel-disposition-take-home.pptx), [PDF](../output/submission-2026-09-15/counsel-disposition-take-home.pdf) | **Delivered.** Twenty-eight editable slides: fifteen main slides including the live demo, thirteen appendix slides. Slides 2 and 3 show the exact C22/C47 messages, false negatives and potential delayed assessment. Slide 4 presents the historical architecture, observed results and validation roadmap. Appendix 16 provides the corrected Ottawa discussion illustration; slides 21–22 cover conditional timing. Appendices 23–28 reproduce all 17 other substantively discussed messages verbatim. All rendered pages visually inspected. Dated historical decks remain separate. |
| Live demo where the team can see the build work; assignment p. 3 | Required; provided messages explicitly allowed | [Browser-verification report](STRIPPED_FABLE_GUI_2026-09-15.md#browser-verification--2026-09-15), [six-call manifest](../outputs/stripped-gui-2026-09-15/manifest.json), [demo script](DEMO_SCRIPT_2026-09-15.md) | **Capability demonstrated.** Six live synthetic browser calls, five visible final results, one intentionally discarded after editing; no provider failure. At interview, perform fresh live submissions within the existing allowance; label any saved-trace fallback as replay. |
| A roughly 35-minute presentation/demo followed by 25 minutes Q&A; assignment p. 3 | Session plan | Current deck speaker notes and demo script | **Rehearsal requirement.** Allocate time for the implementation, live cases, evaluation, failures, and next step; keep detailed attempts in appendix. The 60-minute calendar session itself is not evidence of 60 minutes of prepared slides. |
| Optional code/repository link; assignment p. 3 | Optional | [Repository](https://github.com/bGOATnote/counselcodex), [README](../README.md) | **Access check at handoff.** This presentation revision does not verify remote visibility or recipient access. The repository link and portable exports are available as handoff materials. No public web deployment is required; localhost is a demonstration URL for the presenter. |
| Synthetic data only; assignment p. 3 | Assignment constraint | Byte-identical provided dataset, synthetic edited browser case, GUI footer, message-only request contract | **Evaluation maintained. Presentation exception:** the user subsequently requested two ankle photographs on slide 2 and an educational illustration in appendix 16. The photographs have unverified synthetic provenance; the illustration has unverified authorship and licensing. All stay outside evaluation. Synthetic-only conformance is not claimed for the whole deck. |
| 6–8 hours as upper bound; stop at hour 11 and explain next steps on a slide; assignment p. 1 | Explicit timebox | Dated multi-day experiments and prior accounting | **Exception, not retroactively satisfiable.** The expanded project exceeded the brief. Disclose the expansion and the minimal build that should have been the initial submission; do not call the whole repository an eight-hour build. Exact elapsed labor is not established. |
| Keep API costs modest; cents expected for the tiny dataset; assignment p. 3 | Explicit cost expectation | [Fable comparison](STRIPPED_3BUCKET_COMPARISON_2026-09-15.md#timing-usage-and-accounting), [max-effort accounting](STRIPPED_3BUCKET_FABLE_MAX_2026-09-15.md), [GUI accounting](STRIPPED_FABLE_GUI_2026-09-15.md#local-accounting) | **Scoped usage recorded; expanded work is separate.** Fable low cohort estimate $0.338780; conservative account $0.435310. Six GUI calls estimate $0.04081; conservative $0.05307. These are scoped token estimates, not total project cost or provider invoices. |
| Send deck/materials before the session; assignment pp. 3–4 | Submission logistics | Final deck, evaluation, demo instructions, optional verified repo link | **User submission remains.** Page 3 retains an unresolved “[N days]” placeholder; p. 4 says night before, complete by midnight ET. No session date is supplied here. The source identifies submission recipients; this request does not authorize sending email. |

## Current state audit of the supplied labels

The CSV contains 27 `ASYNC_PHYSICIAN`, 18 `URGENT_ESCALATION`, and five
`SELF_CARE` labels. The provided PDF describes 20 messages; the actual 50-row
file is the working dataset. All rows remain in generation and cost counts.

Mapped to the assignment's three buckets, the original v2 physician-designated
development reference agrees with **32/49** original labels. Its 17 deviations
are C04, C06, C08, C11, C12, C16, C17, C19, C23, C30, C34, C35, C38, C43, C44,
C46 and C49. This is a descriptive comparison calculated from the original v2
reference; it is not 17 independently adjudicated clinical errors. The older
38/50 figure compares a different, unattested proposal and should not be used
as the current physician reference result.

Useful examples are the stable refill path (C06), the abrupt severe-headache
message (C08), and the self-care/clinician boundary (C34 or C38). Discuss the
job and missing context that decide the route, then show each label source.
The clinician may dispute an OTC/self-care policy without the model being
clinically worse for disagreeing. C25 was excluded under v2. The [v3 physician amendment](PHYSICIAN_ADJUDICATION_V3_2026-09-15.md)
accepts urgent escalation and includes it in /50. C32, C34 and C38 are also
corrected to self-care. The archived CSV comparison does not determine those amendments. Four child cases are present: C07, C16, C32 and C41; the submission
includes them as supplied but does not establish pediatric performance.

## Judge report implications

The report is not another take-home deliverable list. It supports a narrow,
condition-specific quality-assurance method and careful validation of its judges.

| Report evidence and physical PDF page | Design implication for this project | Claim to avoid |
|---|---|---|
| Standardized clinician-defined rubric judges, decomposed into targeted checks; pp. 2–3 | Start from a clinical decision and the evidence needed to grade it. | Any general model critic is a validated clinical judge. |
| 6,000+ physician-led threads and 136,000+ messages, Jan–Feb 2026; p. 4 | Match the unit of analysis to the care workflow. Full threads, notes and orders differ from one opening message. | Fifty synthetic openings replicate Counsel's CQA study. |
| URI inclusion/exclusion rules and thread/note/order evidence; p. 4 | Define eligible cases and confounders before scoring. | A reachable source or quote alone proves the clinical claim. |
| Sinusitis onset and trajectory extraction; p. 5 | Represent chronology and qualifying context explicitly. | Literal mention of a duration is equivalent to clinical applicability. |
| Seven independent binary UTI/vaginitis judges; clinician-created four-level composite; p. 5 | Decompose criteria and make aggregation inspectable. The full seven-item pack and exact aggregation weights are not supplied. | The local five-agent research workflow or nine software checks reproduce Counsel's proprietary pack. |
| URI: N=230, accuracy 96.59%, weighted precision 98.6%, weighted recall 96.6%, weighted F1 97.3%, kappa 0.557; sinusitis: N=92, accuracy 81.52%, weighted precision 83.1%, weighted recall 81.5%, weighted F1 82.0%, kappa 0.551; p. 6 | Validate by condition against physician labels and inspect class-specific errors; these are company-reported results on their data. | Those percentages transfer to a local judge, or weighted recall is the rare-error sensitivity. |
| Disagreements over antibiotic mentions and symptom onset; judges harsher in lower-quality UTI/vaginitis threads; p. 7 | Review the disagreement mechanism and false alarms, not only an aggregate score. | Stricter grading automatically improves care. |
| Prospective clinician-cockpit alerts described as future iterations; p. 8 | Treat online blocking as a separate intervention to test for benefit, delay and alert burden. | Retrospective CQA results prove that a live serial judge/repair loop helps routing. |

The [clinical judge program](CLINICAL_JUDGE_PROGRAM.md) contains useful historical
method analysis and a disabled clinical-admission contract. Its older statements
about the then-current product are version-specific. `/stripped` makes no judge,
retrieval, clinical-gate or patient-reply call. Historical V25 also recorded zero
judge calls in its frozen 50 attempts. A future narrow retrospective judge needs
a physician-defined reference and its own validation before acting as a release
authority.

## Role fit without invented credentials

| Role profile signal and rendered page | Evidence to show | What the take-home does not establish |
|---|---|---|
| First 30 days: read the code, run evals, learn from clinicians, prioritize weaknesses, ship one scoped V0; p. 1, Outcomes | A small end-to-end router, exact failures, a reproducible scorecard, and a bounded next experiment | Counsel production access, completed shadowing, or a production launch |
| Clinical reasoning and a defensible reference; pp. 1–2, Clinical Fluency | Clinical reasons for label disagreement, ambiguity policy, attributable physician development review | Independent consensus, exhaustive claim grades, or population accuracy |
| Technical proficiency, product mindset and simplicity; p. 2 | Exact request contract, real Mastra integration, one-call architecture, boundary between routing and care delivery | That every historical component was necessary, or that the prototype proves prior production experience |
| Ownership, clarity and experimentalism; p. 3 | Own the V25 non-completions and the max-effort null result; describe what changed the decision | A causal V25-to-Fable improvement estimate across different output contracts and taxonomies |
| Collaboration, coachability and mission; p. 4 | Invite clinical alternatives, name the operational task, change a hypothesis when evidence disagrees | Knowledge of any interviewer's private preferences or a guaranteed patient/business outcome |
| Qualifications; p. 4 | Candidate's own verified professional history, supplied separately if wanted | Licensure, certification, years of production work or founder history inferred from this repository |

An appropriate closing proposal follows the role's stated first-month outcomes:
identify one recurring routing failure with the team, agree on the clinical
reference and workflow owner, run the smallest paired experiment, and deliver
a reviewed improvement with a reproducible evaluation and rollback path.
Acceptance should be a concrete artifact and a decision the team can inspect;
clinical lift and capacity gains remain measured outcomes, not guarantees.

Slides 14–15 now specify that proposal. The first 30 days produce an agreed policy, independent cases, one paired comparison and a reviewed V0. The following 2–6 months propose a reusable evaluation, observation alongside current care and a bounded supervised workflow. Each step names accountable roles and evidence needed before expansion. The dates are planning horizons, and patient-care use remains conditional on clinical review and approved data access.

## Inversion review

| How this submission could lose trust | Repair in the deliverables |
|---|---|
| The reviewer cannot tell which system is running. | Lead with `/stripped`, Fable 5.1 low effort, three buckets, and one call. Put V25 in a dated comparison section. |
| The headline increases because the taxonomy became coarser. | Disclose the five-to-three mapping: frozen five-way Opus moves from 35/49 exact to 46/49 after collapse with zero new inference. Do not plot it as a model improvement. |
| A polished score hides failed delivery or an unresolved label. | Retain V25 27/50 completion and its historical v2 21/49 delivered agreement. C25 is included and correct in current v3 48/50; only its finer timing label remains unscored. |
| “Gold” means whatever makes the new model look good. | Explain reference reconstruction, development exposure and contested self-care cases; keep CSV scoring separate and gold absent from inference. |
| More reasoning or more agents are presented as progress by default. | Show max effort: 44/49 to 42/49, unchanged 31/50 CSV score, higher observed cost/latency; do not claim a stable model ranking from one pass. |
| An old trace is presented as a new live result. | Make live submissions visible; use run IDs and clearly label replay if needed. The six historical GUI checks are demonstration evidence, not a new clinical cohort. |
| Proposed work promises clinical outcomes before integration or validation. | Offer ownership of a scoped, testable improvement and a decision record. State dependencies on Counsel's workflow, review and data access. |

## Audit verification

This was a read-only implementation/source review plus this new audit document.
The supplied CSV and repository copy were independently hashed and counted;
all six archived GUI trace hashes matched their manifest. PDF requirements were
checked against rendered pages, and the role DOCX was rendered with bundled
LibreOffice to verify source pagination. No new model call, clinical adjudication,
application change, or historical artifact rewrite was performed. Final deck
exports received separate structural and visual review. The revised script
allocates seven live-demo minutes within a 35-minute main presentation, followed
by the assignment's 25-minute Q&A. Actual interview delivery and email submission
remain future operator actions.

The later presentation revision adds the presenter-supplied name and role, official Counsel logo and a clickable local-demo link to the cover. It also includes the user-supplied historical architecture PNG, with incidental metadata removed and pixels unchanged. The image is visibly distinguished from current behavior and from proof that every pictured component executed. All 19 substantively discussed patient messages are shown verbatim; no CSV labels are added to prompts or physician scoring.
