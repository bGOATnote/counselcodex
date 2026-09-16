# Clinical reviewer pack

**Status: blank templates. No physician review, signatures, prospective data collection or institutional approval has been completed by creating these files.**

## Two distinct purposes

### 1. Development review of F01–F24

Use `development-reviewer-A.template.json` and `development-reviewer-B.template.json` for retrospective clinical review of the 24 AI-authored development cases. Each form includes the exact message and blank label/justification fields. It does not contain proposed labels, severity or model predictions.

Distribute only the assigned blank form and these neutral instructions. Do not distribute `proposed-reference.json`, generated outputs or another reviewer's form before both reviewers finish. Because the repository is public, ask each reviewer to disclose prior exposure; withholding files does not itself prove blinding. Record actual review conditions truthfully.

This review can improve the developmental reference and identify questionable cases. It cannot turn already generated cases into prospective, independently labeled validation. Preserve the original proposed labels and publish the clinical amendments separately.

### 2. A future prospective study using genuinely new cases

The following empty files are for a separate future study:

- `prospective-case-register.template.json`
- `prospective-reviewer-A.template.json`
- `prospective-reviewer-B.template.json`
- `adjudication.template.json`

Collect genuinely new cases independently of model development. Do not reuse C01–C50, F01–F24, simple rewrites or related episodes that leak development content. Define the intended patient population and sampling method. Keep a representative cohort separate from an enriched high-consequence safety cohort. Document permissions, privacy controls, eligibility and family/episode clustering before collection. Store sensitive source records and reviewer identity records in an appropriate private study system, not a public repository.

The proposed reference file in the parent directory must not be used to fill the prospective templates. Template schemas specify fields only; they contain no prospective cases or accepted labels.

## Review instructions

1. Judge the supplied facts. Mark absent information as unknown; do not assume a diagnosis, examination result or negative history.
2. Select the acceptable bucket or explicitly state uncertainty. Exact names: `SELF_CARE`, `ASYNC_PHYSICIAN`, `URGENT_ESCALATION`. Multiple accepted buckets require a clinical rationale; do not widen them merely to improve agreement.
3. Record what assessment or action is indicated and why. Separate absence of evidence from evidence supporting no clinician task.
4. Label potential harm from a missed action (`low`, `moderate`, `high`, `critical`) and necessary assessment timing (`no_clinician_task_now`, `routine_review`, `prompt_review`, `same_day_in_person`, `emergency_now`) using the study's approved definitions. These are reviewer judgments about potential consequences, not observed outcomes or a service promise. Leave unresolved judgments explicitly unresolved; the clinical lead must operationalize these definitions before a prospective study.
5. Record clinically material missing information and any limitations of the case. The independent reference process may decide a case is unscorable; retain it with an explicit status and report that denominator separately.
6. Reviewer A and B must complete their initial reviews independently. A third clinician resolves disagreements after both initial forms are frozen, without seeing model output. Preserve the original A/B judgments and adjudication rationale.
7. Complete actual name, credentials or institutional identifier, relevant expertise, completion time and a signed attestation of the recorded review conditions. Do not auto-fill these from an account profile or create an AI-generated signature. An institutional signed record may be referenced instead of publishing personal identifiers.

## Required prospective freeze sequence

1. Approve intended use, endpoints, acceptable risk bounds, subgroup coverage, workload limits and sample size before inspecting predictions.
2. Freeze the new message set and record its SHA-256 and collection provenance.
3. Freeze independent reviewer A and B forms; record their SHA-256 values and completion timestamps.
4. Resolve disagreements through the third reviewer; freeze the final clinical reference and its SHA-256. Record ambiguous cases and exclusions before inference.
5. Record the signed clinical protocol/acceptance criteria, reference freeze time and exact model/prompt/settings. All must precede the first model generation on these new cases.
6. Generate without references, reviewer annotations or labels in context. Record actual first generation time, per-request input/prompt hashes and all errors.
7. Freeze generated artifacts before scoring; report every departure from protocol. Later reference amendments remain separately labeled sensitivity analyses.

A timestamp alone does not prove independence. A study coordinator must verify roles, exposure, provenance and the freeze sequence. These blank files have no authority to authorize patient-data use or a clinical study.
