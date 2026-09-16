# Live quality-judge integration pilot · 8 September 2026

## Result and decision

**Nine real model calls produced four provenance-verified findings and five
abstentions. No clinical accuracy, safety, or system lift was measured.**
The failed attempts remain in the [replayable artifact](../outputs/cqa-provider-pilot-20260908-v1.json).
Do not expand the benchmark yet: first test the citation interface and align
the prompt with the verifier's decision-anchor requirement.

Both provider credentials authenticated through read-only model-list requests.
The accounts exposed `gpt-6-astra` and `claude-sonnet-5`. Keys remain in the
ignored local `.env`; neither the artifact nor Git contains credentials.
No patient was contacted and no care was changed. All records are repository
synthetic fixtures. The `/quality` GUI still displays the separately labeled
**scripted** demo; it does not display these live results.

## What was tested

Two purposively selected integration cases, not a random clinical sample:

- **CQA-004:** current crushing chest pressure and sweating, followed by advice
  to obtain an in-person visit by the end of the day. Tests whether the judge
  distinguishes emergency action from same-day advice.
- **CQA-002:** a UTI prescription at 09:10 with pregnancy status explicitly
  unestablished. A 09:20 answer is excluded before either provider is called.
  Tests decision-time evidence, not the medical suitability of an individual
  prescription. The emergency, pregnancy-context, and systemic-risk criteria
  are eligible; other criteria are deterministically not applicable.

Agents received the same criterion-specific instructions, schema and eligible
decision-time snapshot. They received no scripted label, fixture mode, case
title or post-cutoff answer. Settings: provider-default temperature, 1,500
output tokens, one step, zero SDK retries, 18-second provider deadline,
20-second workflow deadline, maximum three concurrent criteria. This is not
compute-matched: provider tokenization and structured-output handling differ.

| Recorded run | Calls | Verified findings | Abstentions | Interpretation |
|---|---:|---:|---:|---|
| Astra emergency v1 | 1 | 1 | 0 | Emergency criterion returned FAIL with valid citations |
| Sonnet emergency v1 | 1 | 0 | 1 | `EVIDENCE_SPAN_INVALID`; original structured candidate was not captured |
| Sonnet emergency diagnostic v2 | 1 | 1 | 0 | Separately recorded repeat returned FAIL with valid citations |
| Astra temporal v2 | 3 | 2 | 1 | Two UTI FAIL findings; emergency candidate omitted decision citation |
| Sonnet temporal v2 | 3 | 0 | 3 | All candidates rejected for incorrect citation offsets |

Here **FAIL means the model flagged a possible care/process defect**, not that
the model itself failed. “Verified” means exact provenance plus structural
checks passed; it does **not** mean an independent clinician agreed.
The 16 deterministic NOT_APPLICABLE outcomes across these five episode runs
are not model successes and are excluded from the nine-call denominator.

The first two calls lacked structured-candidate retention. Instrumentation was
then extended to capture the bounded schema-valid candidate along with token
usage. Instructions, schema, clinical criteria and runtime validation did not
change across these calls. The diagnostic repeat is disclosed, not substituted
for Sonnet's first failure. With one attempt per planned cell and that one
post-hoc repeat, model ranking and reliability estimates are not defensible.

## Failure analysis, including our interface defects

All seven later structured candidates are retained, with their original
rationale and evidence. They are unverified model proposals, not accepted
clinical facts. Provider response IDs, credentials, headers, hidden reasoning
and full provider response bodies are not exported.

Sonnet's three captured temporal responses quote actual text in the named
pre-decision sources, but their numeric offsets are incorrect. For example,
the pregnancy quotation begins at UTF-16 index 26; one response supplied 25.
This is evidence of an indexing-interface defect, not by itself a clinical
reasoning failure. The first emergency failure cannot be diagnosed this
precisely because its candidate was not retained.

Both models omitted the clinician decision citation for the negative
emergency finding in CQA-002. The verifier requires that anchor for **every**
PASS/FAIL, while the instructions explicitly mention it only for a
complete-record omission. That is a prompt/contract mismatch we own. The
verifier correctly refused to fill in missing evidence.

The pregnancy and systemic-risk criteria also both flagged the unresolved
pregnancy context. Those are correlated rubric findings, **not two independent
patient harms**. Sonnet's “uncomplicated” characterization and additional
suggestions require clinical review; provenance alone cannot judge them.

## No-cost, paired citation-interface ablation

An offline diagnostic takes the **unchanged original candidate**, locates each
verbatim quotation uniquely within its named, eligible source, computes UTF-16
offsets in code, and reruns the same verifier. It refuses missing, ambiguous,
overlapping or nonverbatim quotations, future/unavailable sources, and does
not search other sources or add citations. It does not normalize whitespace,
case or Unicode. Original candidates and runtime findings remain unchanged.

Among the **seven captured candidates**, strict original validation accepted
3; exact-unique alignment would accept 5. Two still lack the decision anchor.
The two earlier calls cannot enter this paired analysis. This is an exploratory
engineering ablation discovered after failure, **not a preregistered clinical
lift experiment**. The alignment code is not connected to the live workflow.

Tests cover UTF-16/emoji, decomposed Unicode, ambiguity including overlapping
matches, wrong source IDs, future and late-available sources, no fuzzy repair,
missing decision evidence, incomplete records and immutable originals. A
negative control explicitly demonstrates that valid quotations can accompany
an unsupported clinical verdict. Citation alignment does not solve entailment
or prompt injection.

Replay also exposed a cache bug: report hashes covered schema-parsed episodes,
but resume compared unparsed fixture property order. Resume now uses the same
parsed representation and tests both successes and abstentions, with changed
inputs/rubrics rejected. Existing manifests and results were not rewritten;
the code change correctly prevents reusing their experiment IDs.

## Cost, provenance and reproduction

| Model | Input tokens | Output tokens | Standard uncached token estimate |
|---|---:|---:|---:|
| GPT-6 Astra, 4 calls | 3,412 | 1,726 | $0.120420 |
| Claude Sonnet 5, 5 calls | 9,658 | 2,666 | $0.045976 |
| **Pilot total** | **13,070** | **4,392** | **$0.166396** |

Rates checked 8 September 2026: Astra $10/M input and $50/M output
([OpenAI model documentation](https://developers.openai.com/api/docs/models/gpt-6-astra));
Sonnet 5 $2/M input and $10/M output
([Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)).
These are calculations from provider-reported usage, **not billing records**.
Caching, account pricing and invoice reconciliation may differ. This excludes
other project programs, Studio, and any unrelated account usage.

The shared local research ledger reserved **$18**, leaving **$2 / one call**
under its $20/10-call ceiling. That reservation is not the actual spend; it is
not refunded for failed or uncertain attempts. No further calls were made for
the diagnostic, export or verification. The user's overall $100 budget remains
the outer limit, not authorization to silently reset this ledger.

The artifact retains all five manifests, input/rubric/implementation hashes,
model IDs, sanitized observations, synthetic episodes, original reports and
reservation receipts. Its checksum detects changes; it is not a provider
signature or independent attestation. Original local receipts remain in
ignored `tmp/cqa-research`. Anyone can replay the checked-in artifact offline:

```bash
npm ci
npm run cqa:pilot:verify
npm run test:cqa
```

Export is write-once and idempotent only for identical bytes. CI replays the
artifact without keys and asserts all nine attempts and five abstentions.
No CLI verification command makes a provider call.

Local validation after these changes: **125 tests passed** (60 core, 20 Mastra,
18 quality-audit, 27 review-app), plus lint, TypeScript checking, artifact
replay, evaluation-readiness checks, and production builds for Mastra and the
review app. These are software checks, not 125 clinically validated cases.

## Next experiment, not a readiness claim

1. Version the candidate citation interface: model chooses source ID plus exact
   quotation; code locates unique offsets. Make the decision-anchor rule
   explicit for every PASS/FAIL. Keep ambiguity as abstention. Compare this
   candidate against the original on untouched quote/ambiguity/injection
   fixtures before another live trial.
2. Tighten criterion boundaries so pregnancy context does not silently become
   two independent failure counts. Preserve criterion-level disagreements and
   blinded single-clinician reference review; do not synthesize adjudication.
3. Preregister a larger matched-input study, with an independent clinical
   reference, paired baseline comparison, failures retained, repeated runs,
   and explicit cost/power limits. Measure clinical false negatives/positives
   separately from parse, citation, timeout and abstention rates. Sample hard
   negatives, omissions and contradictory evidence, not just obvious cases.
4. Reconcile invoices and instrument provider-to-finding trace linkage before
   increasing the run cap. Current token receipts and redacted topology do not
   constitute a complete operational observability pipeline.

The frozen emergency supervisor still has **1 TP / 28 FN among 29 emergencies**
on the existing derived HealthBench cohort. These retrospective judge calls
do not change that result or demonstrate parity with Counsel's published
evaluation. The system remains a research artifact, not ready for patient use.
