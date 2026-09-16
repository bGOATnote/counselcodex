# Coding belongs to the care episode, not the disposition gate

Research and repository inspection: September 11, 2026. Engineering recommendation, not legal advice, a payer coverage determination, or a claim that the prototype is authorized for clinical use. This document changes no runtime behavior, source cases, or physician reviews.

## Decision

Use a stable **care-episode identifier** to connect messages, findings, decisions, sources, model executions, amendments, delivered care, and eventual coding. ICD-10-CM is a useful downstream classification, not the identity of that episode or a prerequisite for deciding where and how soon someone needs care.

An identical symptom code can accompany very different urgency, physiology, chronology, and risk. Different codes can require the same emergency action. A suspected dangerous diagnosis can justify escalation without becoming an established diagnosis in a billing record. The clinical decision must retain those distinctions.

Recommended implementation order: episode/revision linkage and authenticated audit design first; optional, independently evaluated coding assistance next; payer-specific claims logic only for a defined service and payment arrangement. Do not add a coding agent to the latency-critical patient-response path merely to fill a field.

## What the current rules establish

### Diagnosis classification is not diagnostic certainty

For outpatient services, Section IV.H directs coding to the certainty documented for the encounter: symptoms, signs, abnormal results, or another encounter reason when a diagnosis is uncertain. A differential is not a list of established diseases. The guidelines also require record-based selection and attention to the Index and Tabular instructions. Their definition of a provider refers to a legally accountable qualified practitioner. [FY 2026 official guidelines, pp. 1 and 112–114](https://www.cms.gov/files/document/fy-2026-icd-10-cm-coding-guidelines.pdf).

For example, this project's possible-ACS presentation can warrant emergency-now action while its eventual outpatient coding remains based on the documented complaint unless the diagnosis is established. Do not invent infarction, laterality, encounter type, ulcer depth, organism, or a complication to obtain a more specific code. Coding uncertainty must not weaken an emergency recommendation.

The forthcoming FY 2027 guidelines retain the outpatient uncertain-diagnosis distinction in IV.H. This is a targeted comparison, not a complete review of every annual coding change. [FY 2027 guidelines, p. 114](https://www.cms.gov/files/document/fy-2027-icd-10-cm-coding-guidelines.pdf).

### “Newest available” is not “effective for this encounter”

CMS identifies the April 1, 2026 ICD-10-CM files for encounters through September 30, 2026. The published FY 2027 files apply beginning October 1, 2026. Preserve the effective interval and exact release; do not silently recode historical episodes when updating the catalog. A fictional message without a service date does not acquire one from the time the benchmark is run. [CMS release files and effective dates](https://www.cms.gov/medicare/coding-billing/icd-10-codes).

### A code does not establish a billable service

ICD-10-CM classifies diagnoses/reasons for care; CPT/HCPCS classify services and procedures. These are different parts of claims reporting. [CMS code-set overview](https://www.cms.gov/cms-guide-medical-technology-companies-and-other-interested-parties/coding/overview-coding-classification-systems).

Medicare's current e-visit page describes patient-requested portal communication with specified health professionals. It does not establish a model as an independently billable practitioner. Engineering implication: record actual professional work separately from inference latency; never turn model runtime into clinician minutes or a model signature into a clinician attestation. [Medicare e-visit coverage](https://www.medicare.gov/coverage/e-visits).

Do not assume one message equals one claim. Before implementing any service code, obtain its applicable current descriptor and payer policy, then validate episode aggregation, related services, eligible practitioner, documentation, consent where required, enrollment, coverage and exclusions. Old pandemic-era summaries are not an adequate 2026 claims specification. CPT content also has licensing constraints; do not casually vendor an unlicensed code database. [CMS description of code-set ownership](https://www.cms.gov/cms-guide-medical-technology-companies-and-other-interested-parties/coding/overview-coding-classification-systems).

### Utah authorization and payment remain separate

The official Doctronic pilot page describes conditional, participant-specific prescription-renewal activity with oversight—not general authorization for this repository to practice medicine or obtain reimbursement. Its progress narrative is not a live status feed. [Utah OAIP pilot](https://commerce.utah.gov/ai/regulatory-relief-4/authorized-pilots/doctronic/).

The July 2026 Utah Medicaid general manual, §8-4.2.1, p. 80, excludes asynchronous communication from its general telehealth coverage. Specialized provisions and managed-care contracts still need service-specific review. A supported ICD code does not resolve that obstacle. [Utah Medicaid manual](https://medicaid-documents.dhhs.utah.gov/Documents/manuals/pdfs/Medicaid%20Provider%20Manuals/All%20Providers%20General%20Information%20Section%20I/AllProvidersGeneralInfo_Section_1.pdf).

The existing [Utah readiness assessment](UTAH_AUTONOMOUS_CARE_READINESS_2026-09-10.md) remains the broader authority/payment analysis. No autonomous-care authorization, payer agreement, or claim eligibility for this project was established in this review.

## Minimal target architecture — proposed, not implemented

| Record | Purpose | Essential linkage |
|---|---|---|
| Care episode and message revisions | Preserve what was known, when, and from whom | Stable episode ID; message ID; parent revision; source and observation times |
| Clinical decision | Action, timing, uncertainty, reasoning and evidence | Input revision, model/prompt/evidence versions, run/trace IDs; superseded decision |
| Coding assessment | Classify supported documented findings without inventing certainty | Episode/decision revision, service date, catalog release/hash, candidate codes, supporting record references, reviewer/status |
| Service/payment assessment | Determine whether a specific delivered service meets a particular payment contract | Episode, actual work/delivery records, practitioner/entity, policy version and effective interval |
| Security audit | Reconstruct authorized and denied access or changes | Authenticated actor/service identity, action, resource/version, time, outcome and correlation IDs |

For this prototype, add no new mandatory physician form fields for these system-generated identifiers. Keep the patient-facing answer concise. Expose coding only in a clinician/operations view or export, with an explicit assessment status. A missing code is not automatically a failed clinical answer; a missing coding assessment is a separate workflow state.

Coding assistance should operate on a frozen clinical record after the response, using the official release-specific catalog. A model may propose candidates, but deterministic checks must resolve real code existence, display text, effective date and structural completeness. Record contextual Tabular/Index requirements that still need review rather than claiming a flat string lookup checked them. Syntax/catalog membership is not documentation support, and a reportable leaf code is not proof of coverage.

Keep a proposed code's documentation source, symptom-versus-established-diagnosis basis, assessment status and amendment history. Never infer an affirmed diagnosis from a quoted research passage or differential alone. Abstain when the record lacks needed specificity. Do not select a diagnosis by anticipated reimbursement or use a code match as proof of evidence relevance. Code-based retrieval expansion must compete with the existing symptom/context query in the same-input evidence evaluation.

No graph database is needed just for these links. A relational episode/message/decision model with foreign keys and explicit versions is a sufficient initial design; deployment choices should follow measured workload and operational requirements.

## Audit foundations should not wait for real patient data

HHS requires mechanisms to record and examine relevant system activity, plus authentication, appropriate access, integrity and transmission safeguards. It also requires regular review of system activity—not simply storing traces. Applicable BAAs must precede a business associate's handling of ePHI. [HHS current Security Rule summary](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html), [HHS audit protocol](https://www.hhs.gov/hipaa/for-professionals/compliance-enforcement/audit/protocol/index.html).

The six-year requirement concerns required Security Rule documentation; it is not a universal instruction to keep every raw prompt or clinical log for six years. Set record-class retention against applicable law, contracts, risk and operational needs. HHS currently distinguishes the rule in force from its cybersecurity amendment proposal; do not label proposed requirements as effective law. [HHS documentation requirements](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html), [HHS proposal status](https://www.hhs.gov/hipaa/for-professionals/security/hipaa-security-rule-nprm/index.html). NIST SP 800-66 Rev. 2 provides an implementation/control-mapping resource, not product certification. [NIST final publication](https://csrc.nist.gov/pubs/sp/800/66/r2/final).

Proposed engineering properties:

- Separate restricted clinical content from operational telemetry. Prefer references and allowlisted metadata in traces. Pseudonymous IDs remain sensitive when linkable; hashing patient text is not de-identification.
- Bind identity and authorization on the server, not from model output or client-asserted role fields. Record denied reads, exports, edits and administrative changes as well as successful access.
- Make corrections attributable and append-only, with supersession links. Protect audit storage against alteration by ordinary application credentials; hashes alone do not prevent a privileged attacker from rewriting history.
- Monitor missing events, write failures and review backlogs. Document degraded operation and recovery; audit failure must not silently appear as a fully recorded encounter. Preserve the emergency communication path while preventing unrecorded autonomous treatment/claim finalization.
- Test restoration, restricted access, retention, provider/telemetry data flows and incident response before PHI. These properties require deployed controls and operational evidence, not a `hipaaCompliant` flag.

## Repository inspection: what exists and what is missing

Inspected at commit `d7ee267`:

- [Disposition runtime](../../src/disposition/runtime.ts): per-run IDs, trace IDs, input/output/prompt/evidence hashes, response-event order/timing, exclusive local artifact creation, fsync and persistence-status flags. Ordinary span input/output and error detail are suppressed.
- The same runtime deliberately saves complete **fictional** messages and outputs in local research artifacts. These are not de-identified clinical records or independently protected audit storage.
- [HTTP boundary](../../apps/evaluation/lib/v0-handler.ts) and [local-request guard](../../apps/evaluation/lib/review-backup-store.ts): origin/header checks for a local prototype, not authenticated patient/clinician identity or tenant authorization.
- No stable structured care-episode contract across clarification runs; no clinical service-date contract, validated ICD catalog, payer rules engine, or independently authenticated clinical-access audit was found in this inspected path.

These are implementation gaps relative to the proposed product, not evidence that the fictional-data take-home must already contain a billing platform. The highest-value next change is episode/revision continuity that makes the existing conversation and its evaluation replayable. It serves the assignment immediately and provides the eventual coding/audit linkage without extra LLM calls.

## Acceptance tests before promoting these additions

These tests are **specified, not executed by this research change**:

1. Clarification, retries and resumed work remain in one episode with distinct immutable message/run IDs; unrelated patients never merge.
2. Replaying a frozen episode preserves the historical evidence, decision, catalog and policy versions.
3. Missing service date yields coding assessment pending, not an invented date; April and October release-boundary tests select the proper catalog.
4. Invalid, retired, incomplete and future-effective codes cannot become finalized coding records.
5. A dangerous differential cannot silently become an affirmed outpatient diagnosis; unsupported specificity triggers abstention/review.
6. Missing or contradictory coding documentation never suppresses emergency action or delays the first patient response.
7. Multiple messages do not automatically generate multiple service claims; retries cannot duplicate finalized service records.
8. Model duration, background processing and overlapping professional time cannot manufacture billable work.
9. The same supported diagnosis yields different payment-assessment states under different documented payer/service contracts, without changing clinical urgency.
10. Cross-tenant reads, exports and forged actor fields are denied and audited; clinical text and secrets do not enter operational traces.
11. Audit-store outage, full disk, interrupted writes, concurrent edits and recovery have visible, tested behavior.
12. Independent coding review measures unsupported disease assignment, under/over-specificity, abstention, reviewer corrections and review time—not just exact-string agreement. Routing/evidence performance and response latency must not worsen in paired tests.

## Source and change accounting

Linked CMS, Medicare, Utah, HHS and NIST pages above were retrieved through the research browser on September 11, 2026; relevant guideline sections and Medicaid coverage language were inspected. Retrieval confirms access on that path, not endorsement, legal applicability or continuous freshness. No comprehensive audit of every payer, statute, annual code change or HIPAA control was performed.

This change records an architectural decision and test plan only. It adds no coding outputs, clinical claims, paid calls, collection of patient identity, or assertion of HIPAA/billing readiness.
