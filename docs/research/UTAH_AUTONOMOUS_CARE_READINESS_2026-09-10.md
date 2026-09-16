# Autonomous AI care in Utah: authority, safety and payment are separate gates

Research date: **September 10, 2026**. Intended launch model supplied by the owner: **autonomous AI care under Utah authorization**. This is an engineering assessment, not a legal opinion, payer determination, authorization application or claim submission. No authorization, BAA, payer contract or insurance endorsement for this project has been supplied. The repository remains a synthetic-data research prototype.

## Decision

Do not launch autonomous clinical care or submit insurance claims from this repository. Build the evidence package and narrowly scoped pilot application while the research system continues to improve. The first commercial decision is the **exact authorized service and payment contract**, not which CPT code an agent can produce.

Utah's current published code places regulatory mitigation and joint interpretation agreements in **§13-72-401**, eligibility in **§13-72-402**, and extensions in **§13-72-403** (renumbered/amended in 2026). Relief is temporary, participant-specific and bounded by the written agreement. Obligations not expressly modified remain applicable; participation is not state endorsement. Do not rely on older references to §13-72-302 as the current section. [Utah Code, Chapter 72, pp. 3–5](https://le.utah.gov/xcode/Title13/Chapter72/C13-72_2024050120240501.pdf).

## What Utah's existing pilot does—and does not—demonstrate

The published Doctronic program concerns selected **existing prescription renewals**, not a general permission for any AI to diagnose and treat any patient. Its public page describes identity/prescription verification, exclusions, licensed oversight and phased progression. The amended description requires review of 250 requests **per medication group**, not merely 250 total, before possible progression. OAIP approval is still required. Its undated progress text reports Phase 1; this is not independently verified real-time phase status. Its agreement cannot be borrowed by another company or product. [OAIP Doctronic pilot](https://commerce.utah.gov/ai/regulatory-relief-4/authorized-pilots/doctronic/).

The published agreement provides a useful *design example*: AI disclosure and acknowledgement, exclusions, review/escalation pathways, monthly activity and physician-comparison reports, redacted outcome examples, adverse-event/complaint reporting and phase benchmarks. Implement reporting from attributable events, not an assertion that “all outputs were safe.” Read the executed agreement and all amendments together before inferring operative requirements. [Published Doctronic agreement and amendments](https://commerce.utah.gov/wp-content/uploads/2026/01/Doctronic-Final-Agreement.pdf).

Our 50 cases include emergency symptoms, children, pregnancy and postpartum concerns. Treat these as a **safety-routing challenge set**, not an initial autonomous-treatment service catalog. A narrow renewal pilot is a possible application hypothesis, not a claim that C06/C18/C24/C46 already meet anyone's eligibility rules. OAIP's healthcare roadmap explicitly asks about vulnerable groups, feasibility evidence, liability resources, requested legal relief, phase benchmarks, monitored harms and rollback. [OAIP healthcare application roadmap](https://commerce.utah.gov/ai/regulatory-relief-4/roadmap-for-regulatory-relief-for-ai-in-healthcare-products/).

## Payment: a consequential negative finding

The **July 2026** Utah Medicaid General Information manual, §8-4.2.1, printed p. 80, excludes asynchronous communication—including email and text messaging—from its general telehealth coverage. Its synchronous-care discussion is on pp. 78–79; specialized services have their own provisions. This is not an appropriate basis for promising reimbursement for autonomous asynchronous chat. Confirm subsequent bulletins, exact service provisions and the member's managed-care contract before a service-date-specific decision. Do not turn the manual's use of “E-visits” in its synchronous paragraph into permission to bill asynchronous chat. [Utah Medicaid manual, July 2026, §8-4.2](https://medicaid-documents.dhhs.utah.gov/Documents/manuals/pdfs/Medicaid%20Provider%20Manuals/All%20Providers%20General%20Information%20Section%20I/AllProvidersGeneralInfo_Section_1.pdf).

Medicare's public e-visit coverage page lists eligible human practitioner types and patient-initiated portal communication; it does **not** establish autonomous AI as an independently billable practitioner. A model's runtime is not evidence of physician work. Do not attach a physician NPI to work the physician did not perform or assume a state agreement supplies federal reimbursement authority. [Medicare e-visit coverage](https://www.medicare.gov/coverage/e-visits).

**Commercial hypothesis, not verified coverage:** negotiate an explicit autonomous-service pilot contract with a payer/employer, or assess a lawful transparent self-pay model with counsel. Neither can bypass scope, safety, patient disclosures or applicable beneficiary-billing restrictions. First obtain written service definition, eligible population, accountable/billing entity, allowable autonomy, exclusions, documentation, payment method, denial/appeal rules and evaluation commitments. No such contract is currently in evidence.

## Launch evidence matrix

These are proposed engineering acceptance gates; they do not substitute for regulator, payer or attorney determinations.

| Gate | Evidence required before activation | Current state |
|---|---|---|
| Exact authority | Executed applicable agreement; operator, service, population, geography, dates, exclusions, phase and agency conditions verified | Not supplied |
| Federal/device analysis | Intended-use and software-function analysis; applicable FDA pathway/determination, not assumed CDS exemption | Not established |
| Accountable clinical operation | Medical/pharmacy owners, coverage hours, escalation acknowledgement, emergency handoff, continuity and complaints process | Prototype only |
| Clinical benefit and risk | Frozen evaluation protocol, independently reviewed references, external and prospective validation, harm adjudication and rollback criteria | Development evidence only |
| Privacy/security | Data-flow inventory, HIPAA role analysis, risk assessment, applicable BAAs, safeguards and demonstrated incident/recovery processes | No PHI readiness claim |
| Liability cover | Written policy/endorsement covering the actual AI activities, operator and clinicians; exclusions and limits reviewed | Not supplied |
| Reimbursement | Written payer/service eligibility, entity enrollment, documentation and service-date coding review | Not established; Medicaid async obstacle identified |
| Release control | Approved model/prompt/knowledge versions, change assessment, access approval, canary/rollback and regulator reporting where required | Research versioning is not authorization |

FDA's January 2026 CDS guidance discusses exclusions from the device definition, including independent professional review of the basis for recommendations. **Inference:** a patient-facing autonomous diagnosis/treatment function cannot simply inherit the argument made for a clinician's reference dashboard. Assess functions individually with regulatory counsel; citations alone do not establish exemption. [FDA CDS guidance landing page](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software).

OAIP says it expects medical malpractice cover for AI liabilities in its mitigation program. An ordinary technology E&O or existing physician policy must not be presumed to cover autonomous prescribing, vendor/model changes or all pilot populations. Obtain written confirmation from the carrier, not a UI checkbox. [OAIP FAQ](https://commerce.utah.gov/ai/ai-faq/).

## HIPAA implementation plan, not a compliance badge

First establish whether the operator is a covered entity or business associate and inventory every ePHI recipient: model provider, cloud/storage, vector index, traces, error reporting, support tooling and backup providers. HHS explains that a cloud provider maintaining ePHI can be a business associate even if it cannot decrypt the data; encryption does not eliminate the BAA and risk-analysis obligations. Review actual endpoint, retention/training, subprocessors and contract scope before using keys for PHI. [HHS cloud-computing guidance](https://www.hhs.gov/hipaa/for-professionals/special-topics/health-information-technology/cloud-computing/index.html).

Proposed engineering controls: authenticated patient/clinician access; least privilege and strong operator authentication; tenant isolation; encryption/key ownership; redacted traces by default; protected clinical-record audit logs; consent and disclosure versions; incident response; tested recovery; retention/deletion and patient-access workflows. Trace IDs are not automatically de-identified. Keep public literature retrieval separate from patient queries. Kubernetes changes deployment packaging, not the legal or clinical status of these controls. A documented risk analysis must identify threats and vulnerabilities across the actual deployment. [HHS risk-analysis guidance](https://www.hhs.gov/hipaa/for-professionals/security/guidance/guidance-risk-analysis/index.html).

The current browser review stores and exports **synthetic development cases**. Its local durability protections are not a production clinical record, HIPAA certification, institutional audit system or insurance billing ledger.

## What to engineer next, before an application or payer conversation

1. Define one service and exclusion contract. Separate emergency diversion from the autonomous treatment scope. No emergency safety instruction should wait on coverage verification, retrieval or a billing decision.
2. Specify an auditable state machine: identity/location → scope/consent → safety assessment → authorized action → actual delivery/acknowledgement → follow-up. Log abstention, failed delivery and failed handoff, not just model text.
3. Evaluate omissions and actions separately: emergency-now sensitivity, inappropriate same-day delay, contraindication misses, hallucinated facts, unsafe renewal, inappropriate refusal, source applicability, delivery failure and clinician workload. Predeclare denominators and confidence intervals; zero observed harms is not proof of zero risk.
4. Run deterministic fault tests without PHI or paid calls: expired/revoked authorization, wrong state, excluded medicine/population, missing verification, stale source, lost callbacks, duplicate requests, unavailable clinician/pharmacy, model change, provider outage and retries. A successful label classification must not bypass any downstream failure.
5. Prepare the OAIP application and payer evidence dossier using the same immutable experiment/incident manifests. Set phase progression and rollback with accountable clinicians and the reviewing authority; do not invent a universal “safe enough” percentage.

No application, clinical deployment, prescription or insurance claim was sent as part of this work.

## Source-access accounting

The linked primary sources were inspected through the research browser; direct retrieval from this machine has separate results. The reproducible check of all 11 governance/ABEM URLs returned five reachable HTML pages, five HTTP 403 blocks (OAIP pages/agreement and the Medicaid PDF), and one network error (the legislature PDF). These are not broken-link determinations and must not be represented as eleven validated links. [Immutable direct-access report](link-checks/2026-09-10T04-20-23.674Z-f51f720529e0.json). Reproduce with `node --experimental-strip-types scripts/check-clinical-sources.mjs --regulatory`. Browser retrieval succeeding while direct GET is blocked is an access-path difference, not evidence that either policy was waived.
