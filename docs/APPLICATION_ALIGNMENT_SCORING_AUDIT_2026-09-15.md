# Application-alignment scoring audit

Read-only reconciliation of the completed fixed-packet comparison. No provider calls, frozen-file changes, historical edits, reference changes or promotion were performed for this audit.

## Integrity and denominator

The saved `outputs/application-alignment-2026-09-15/report.json` exactly equals a fresh replay of the frozen scorer. All **106 frozen files**, all **50 original V25 histories**, all **50 paired source packets**, the exclusive mission claim and every result-to-evaluation binding verify. The output directory has exactly 100 unique first-attempt starts, 100 results, 100 evaluations and 50 whole-pair reservations. Every start says `first_attempt`; no retry, missing result, missing evaluation or reserved-but-unstarted slot was found.

- Plan fingerprint: `152655044f973e6a805e6d239a0f0793e2714e80f600bcff3d436f7d9e5c37c0`.
- Plan file SHA-256: `1f2c3ddb09924af4c795203c12e80d3bc2a975b7c28f6f94f6399571040c4d0a`.
- Report file SHA-256: `15828f3e8be224c80cfd130a534f9e03e367d4fb4b805fc30f5a545a11bddd40`.
- SHA-256 of the case-ordered `[case ID, original-history SHA-256]` array: `aa8c737ef57afea8a9c5827ab4d2580010796368157f41f5ca3c76e0c32cd70a`.

This is a fresh comparison of two arms over the same development packets, not a pooling of historical model results. Patient, generated context and retrieved passages are identical between the two new arms. Candidate policy, source-condition sidecar, additional output bindings and the partial post-generation check change together. Both arms use the full clinical fields and Opus low/4,096; that output allowance differs from historical V25's 2,400. This is not a prompt-only or held-out experiment.

C25's `acceptedRoutes` remains null. Its two provider completions, parsed routes, compatibility failures and costs remain counted; its eligible agreement, raw agreement and under/over comparison remain null. The fixed reference denominator is therefore **49 per arm**, not 50. Both C25 drafts propose same-day in-person care and are mechanically withheld against the historical issued emergency notice. That is a compatibility diagnostic, not an adjudication of the disputed reference or a new emergency miss.

## Reconciled outcomes

| Measure | Baseline | Candidate |
|---|---:|---:|
| Planned / attempted / provider complete / parsed | 50 / 50 / 50 / 50 | 50 / 50 / 50 / 50 |
| Provider / parse / evaluator failures | 0 / 0 / 0 | 0 / 0 / 0 |
| Existing full gates admitted | 31 | 30 |
| Eligible experimental responses after all arm-specific checks | 31 | 27 |
| Reference agreement among eligible non-null-reference responses | 24/31 | 22/27 |
| Fixed reference-agreement coverage | **24/49** | **22/49** |
| Raw route agreement, including withheld drafts | 37/49 | 38/49 |
| Raw reference care-setting acuity below / above | 12 / 0 | 11 / 0 |
| Producer completion median | 14.8045 s | 15.2755 s |
| Producer completion p95 | 19.706 s | 17.160 s |

The higher candidate completion-conditioned fraction does **not** mean better coverage: its denominator shrank. Raw route agreement improves by one, while eligible reference coverage falls by two. A withheld draft is neither a completed response nor an automatic incorrect route; these measures intentionally separate those questions.

Eligible-response gains: C15, C36, C39. Losses: C03, C07, C08, C18, C23, C32, C47. Fixed agreement-coverage gains: C15, C36, C39. Losses: C03, C05, C08, C18, C23.

Only four raw routes change across all 50 pairs:

| Case | Baseline → candidate | Reference-agreement consequence |
|---|---|---|
| C05 | Emergency → in-person today | Match lost; both mechanically eligible |
| C19 | Self-care → Standard async | Raw match gained; both withheld |
| C32 | Self-care → Standard async | Raw match gained; candidate withheld by binding ID failure |
| C49 | Self-care → Standard async | Neither matches the reference; both withheld |

Under/over counts are **care-setting acuity differences**, not adjudicated harm. Standard and Priority async share an acuity rank in this diagnostic; a queue-priority mismatch can lower route agreement without appearing in either under/over count. Zero “over” therefore does not establish absence of over-triage or appropriate queue priority. C05 remains a substantive reference regression requiring review; mechanical admission does not resolve it.

C09 shows the opposite distinction: both drafts select `EMERGENCY_NOW` and begin “Go to the emergency department now”, but the baseline continues with a comma and the candidate with an em dash. Both fail `transport_intent` because the frozen directive recognizer accepts only `. ! ; :` or end-of-string immediately after “now/immediately”. This is a bounded serialization/recognition failure, not evidence that either draft omitted immediate emergency routing. No repair or rescoring was applied to these frozen attempts.

The paired median candidate-minus-baseline producer latency is **+0.397 s**; paired p95 delta is **+2.745 s** over 50 pairs. These are request completion times, not time to actionable instruction, fresh RAG latency, an end-to-end workflow or browser paint. Historical early notices enter only compatibility checks. A single pair per development case does not establish repeatability or a production tail-latency bound.

## Non-vacuous application coverage

Only **3/50 packets** contain an active authored contract: C26 and C32 contain compiled AOM contracts; C47 contains the retained MedlinePlus insomnia contract. Together these are three contract instances with five qualifying witness spans. C26's response does not cite its contracted AOM source in either arm. A retrieved topic alone does not earn application coverage.

| Coverage measure | Baseline | Candidate |
|---|---:|---:|
| Parsed responses actually citing a contracted source | 2: C32, C47 | 2: C32, C47 |
| Expected citation–contract application records | 3 | 2 |
| Structurally valid binding records | **0** | **0** |
| Responses with complete **nonempty** binding coverage | **0** | **0** |
| Empty-set `completeBindingCoverage=true` responses | 48 | 46 |

Empty-set coverage is not evidence application or semantic success. The baseline was never asked to emit the new binding field, so its missing-record errors cannot be compared with candidate binding errors as though they were the same clinical failure rate.

All four candidate application failures are `APPLICATION_CITATION_COVERAGE_INVALID`:

- **C03 and C18:** an application uses the protocol string `authored-source-application/v1` as a rule ID although no contracted citation is present. These are invented binding records, not detected clinical misapplications.
- **C32:** the application uses `aom-observation` rather than the exact `compiled-aom-observation` ID. Its original-patient quote resolves and it records diagnostic prerequisites as unknown, but the wrong identity prevents a valid binding. Its raw route matches the reference; the added check withholds it for structure, not clinical error.
- **C47:** `insomnia-daytime-impact` is used instead of `retained-insomnia-daytime-impact`. This is also an identity failure, not a semantic catch.

The authored prose checker flags one baseline C47 impairment denial. Candidate C47 still labels **“Functional decline” as denied**, citing **“I'm functioning but tired all day”**, while the baseline labels the same quote “Functional impairment.” The bounded concern-name check catches the baseline wording and misses the candidate synonym. Thus the finding count of one versus zero is **not** evidence that the denial was corrected. Exact report spans also do not verify subject, episode, negation, examination status or clinical predicate meaning.

For an available-free diagnostic, retain candidate parsing, source resolution, proposal checks, patient-basis checks and existing full gates, but omit only the final additional application block from the *analysis*. That gives **30 eligible, 24/30 conditional agreement and 24/49 fixed coverage**. C03, C32 and C47 are the three additional withheld cases; C18 was already withheld by the existing core checks. This is **not** a released variant or approval to bypass the check. Even before that extra block, fixed coverage only ties the fresh baseline and C05's route regression remains.

## Accounting and non-claims

Independent token arithmetic reconciles 1,936,432 input and 89,741 output tokens across all 100 attempts:

- Base estimate: `(input × $5 + output × $25) / 1,000,000` = **$11.925685**.
- Conservative mission charge: `(input × $10 + output × $25) / 1,000,000` = **$21.607845**.
- Unknown-usage or outstanding reservations: **0**.
- Remaining new-$95 allocation: **$73.392155**.

These are token-based estimates, not a billing invoice. The previous mission's $84.687986 is preserved as historical exposure and is not charged to this allocation again. Any later phase must use the same remaining mission balance.

Every evaluated row and the report explicitly retain `claim_support`, `unsupported_claims`, `unsafe_advice` and `clinical_correctness` as `not_assessed`; `patientAdvicePublished` and `clinicalApproval` are false. The study's structural identity checks and narrowly authored findings do not establish clinical safety, general claim entailment, verified patient eligibility, or a clinically valid negative finding. In particular, no binding succeeded here, and binding success alone would still not prove the model interpreted its patient quote correctly.

**Audit conclusion:** the study is complete and reproducible; promotion is not earned by these results. It reveals a structural burden and remaining semantic/application errors, not a demonstrated improvement of the released disposition system.

## Read-only replay

Run from the repository root; this writes no report or history and makes no provider calls:

```sh
MASTRA_TELEMETRY_DISABLED=true node --experimental-strip-types --input-type=module <<'JS'
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {scoreDispositionStudy} from './scripts/disposition-study.ts';
import {applicationContractsForHits} from './src/evidence/rag/source-application.ts';
import {sha256} from './src/evidence/rag/model.ts';
const d = 'outputs/application-alignment-2026-09-15';
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const p = read(join(d, 'plan.json')), r = scoreDispositionStudy(d);
assert.equal(p.fingerprint, '152655044f973e6a805e6d239a0f0793e2714e80f600bcff3d436f7d9e5c37c0');
assert.deepEqual(r, read(join(d, 'report.json')));
const files = readdirSync(d), gold = read('data/evaluation/physician-system-reference-v2.json');
for (const kind of ['started', 'result', 'evaluation'])
  assert.equal(files.filter(f => new RegExp('^C\\d{2}-(baseline|candidate)-' + kind + '\\.json$').test(f)).length, 100);
assert.equal(files.filter(f => /^C\d{2}-reservation\.json$/.test(f)).length, 50);
let base = 0, accounted = 0;
for (const {id, arm} of p.schedule) {
  const start = read(join(d, `${id}-${arm}-started.json`));
  assert.equal(start.attempt, 'first_attempt'); assert.equal(start.fingerprint, p.fingerprint);
  const result = read(join(d, `${id}-${arm}-result.json`)), u = result.execution.usage;
  assert.ok(Number.isSafeInteger(u.inputTokens) && Number.isSafeInteger(u.outputTokens));
  const b = (u.inputTokens * 5 + u.outputTokens * 25) / 1e6;
  const a = (u.inputTokens * 10 + u.outputTokens * 25) / 1e6;
  assert.equal(b, result.baseUSD); assert.equal(a, result.accountedUSD); base += b; accounted += a;
}
assert.equal(base, r.spend.knownBaseEstimateUSD);
assert.equal(accounted, r.spend.accountedAndOutstandingUSD);
for (const c of p.cases) {
  assert.equal(c.historyHash, sha256(readFileSync(c.path)));
  const {sourceApplicationRules, ...same} = c.packets.candidate;
  assert.deepEqual(same, c.packets.baseline);
}
for (const row of r.rows) {
  for (const k of ['claim_support', 'unsafe_advice', 'unsupported_claims', 'clinical_correctness'])
    assert.equal(row.evaluation[k], 'not_assessed');
  if (row.id === 'C25') for (const k of ['agreement', 'rawAgreement', 'rawDeviation']) assert.equal(row[k], null);
}
const coverage = Object.fromEntries(['baseline', 'candidate'].map(arm => {
  const rows = r.rows.filter(x => x.arm === arm), audits = rows.map(x => x.evaluation.applicationAudit.bindings);
  return [arm, {contractedPackets: p.cases.filter(c => applicationContractsForHits(c.hits).length).map(c => c.id),
    citingResponses: rows.filter(x => x.evaluation.applicationAudit.bindings.expectedApplications.length).map(x => x.id),
    expected: audits.reduce((n, a) => n + a.expectedApplications.length, 0),
    valid: audits.reduce((n, a) => n + a.applications.filter(x => x.binding.bindingValid).length, 0),
    nonemptyComplete: audits.filter(a => a.expectedApplications.length && a.completeBindingCoverage).length,
    emptyComplete: audits.filter(a => !a.expectedApplications.length && a.completeBindingCoverage).length}];
}));
const before = r.rows.filter(x => x.arm === 'candidate').filter(x => {
  const e = x.evaluation;
  return e.output && !e.failure && !e.localEvaluationFailure && e.proposal?.eligibleRoutingProposal && e.basisIdentity && e.fullGates?.admission.released;
});
const matches = before.filter(x => gold.cases.find(c => c.id === x.id).reference.acceptedRoutes?.includes(x.evaluation.parsedRoute));
console.log(JSON.stringify({arms: r.arms, spend: r.spend, coverage,
  candidateBeforeExtraBlock: {eligible: before.length, conditionalDenominator: before.filter(x => x.id !== 'C25').length,
    matches: matches.length, fixedDenominator: 49}, pairedLatencyDelta: r.pairedLatencyDelta}, null, 2));
JS
```
