# Task-ownership study: unpublished-draft citation audit

## Design and status

**Completed: no exact-witness citation gain on the primary prerequisite set.** Both arms quoted 0/4 selected prerequisite witnesses and 0/5 constituent spans. This document's design and command were prepared while the fixed-packet task-ownership study was running; outcome counts were filled only after all 100 scheduled result/evaluation journals existed. Journal completeness is not clinical approval. Failed attempts would remain in the accounting.

Compare the study's two fresh full-output arms: `full` = baseline task ownership; `brief` = explicit task ownership. These are journal identifiers, not different output schemas. The original patient/context/source packets are identical; the ownership paragraph is the intervention. The diagnostic does not score routes or change retrieval, models, prompts, physician references or patient output.

All 16 existing author-labelled witnesses are compared. The primary selected-prerequisite opportunity is **four witnesses / five exact spans per arm**, fixed from the input packets before examining those paired quotation outcomes:

| Case | Witness | Exact spans |
| --- | --- | --- |
| C12 | COPD post-treatment discharge prerequisites | 1 |
| C13 | Diagnostic assessment task and early-assessment rationale | 2 |
| C32 | AOM diagnostic criteria | 1 |
| C34 | Medication-caution context | 1 |

Absent selected witnesses and the two `spans:null` roles remain visible but do not enter that denominator. These are retrospective development witnesses, not physician gold, held-out validation or a requirement that every answer cite every condition. In particular, ED discharge criteria do not themselves establish initial telehealth eligibility or today's urgency.

## What the measurement means

`draftQuotedWitness` means every authored span was present in exact bound quotations attached to this unpublished draft's citation claims. Partial C13 coverage stays partial. Associated claim, applicability and limitation text is retained for inspection. The matched quotation does **not** establish that the reasoning used the condition correctly, that the claim is supported, or that the patient meets it. Correct paraphrases may not match. Mere quotation gain is not measured clinical or routing lift.

Provider failure, evaluator/schema failure, null output and invalid artifact binding remain distinct. None earns quotation credit. A failed or malformed draft cannot erase the selected evidence opportunity. `patientAdvicePublished` and `clinicalApproval` stay false; claim support, patient eligibility and clinical correctness remain `not_assessed`. Replayed gate release is not publication.

## Read-only replay

Run from this checkout after study completion. This command prints JSON to stdout only: it does not write journals, call providers, import a study runner, retrieve sources or rebuild an index. It checks the exact plan bytes and execution fingerprint, all plan-frozen file hashes, original-history hashes, all 50 case identities, all 100 first-attempt artifact triples, and identical paired model/evidence packets. The raw provider `result.execution.output` is compared with `evaluation.output`; wire quote IDs must resolve to exact selected-source spans and the complete resolved draft must agree.

```bash
node --experimental-strip-types - <<'NODE'
import { readFileSync, readdirSync } from 'node:fs';
import { isDeepStrictEqual as equal } from 'node:util';
import { sha256 } from './src/evidence/rag/model.ts';
import { createExperimentalDraftAuditor } from './src/evidence/rag/experimental-draft-audit.ts';
import { TASK_SUPPORT_FIXTURES } from './src/evidence/rag/task-support-fixtures.ts';
const dir = 'outputs/task-ownership-ablation-2026-09-15', arms = ['full', 'brief'];
const need = (condition, code) => { if (!condition) throw new Error(code); };
const digest = value => sha256(JSON.stringify(value)), inputs = new Map();
const bytes = path => { const b = readFileSync(path); inputs.set(path, sha256(b)); return b; };
const read = path => JSON.parse(bytes(path).toString());
const checked = (path, hash) => { const b = bytes(path); need(sha256(b) === hash, `HASH_CHANGED:${path}`); return b; };
const plan = JSON.parse(checked(`${dir}/plan.json`, '4b48788f38324d7ef2e96f775d8c0d44efaa1a7d3f571cc7fa76fca2e2dde4aa').toString());
const claim = JSON.parse(checked(`${dir}/execution-claim.json`, 'b362aca5460ecad666d433818872ab7565e1d60ea812d1027fc6d63014d182c4').toString());
need(digest(plan) === '1d36bed4143ab184a1e09beceb7632bee4d29af92522112a34d93eed2f17995f' && claim.fingerprint === digest(plan), 'EXECUTION_PLAN_MISMATCH');
need(plan.protocol === 'fixed-packet-task-ownership/v1' && plan.experiment === 'ownership' &&
  equal(plan.armLabels, { full: 'baseline_task_ownership', brief: 'explicit_task_ownership' }) &&
  equal(plan.contracts, { full: 'full', brief: 'full' }) && equal(plan.schemas.full, plan.schemas.brief), 'STUDY_CONTRACT_CHANGED');
need(plan.cases.length === 50 && new Set(plan.cases.map(c => c.id)).size === 50, 'EXACT_UNIQUE_50_REQUIRED');
const slots = plan.cases.flatMap(c => arms.map(arm => `${c.id}-${arm}`));
need(plan.schedule.length === 100 && equal(plan.schedule.map(s => `${s.id}-${s.arm}`).sort(), [...slots].sort()), 'EXACT_100_SLOTS_REQUIRED');
const files = readdirSync(dir);
for (const suffix of ['started', 'result', 'evaluation']) need(
  equal(files.filter(f => f.endsWith(`-${suffix}.json`)).sort(), slots.map(s => `${s}-${suffix}.json`).sort()),
  `STUDY_INCOMPLETE_OR_EXTRA_ARTIFACTS:${suffix}`);
for (const [path, hash] of Object.entries(plan.files)) checked(path, hash);
const diagnosticHashes = {
  'src/evidence/rag/experimental-draft-audit.ts': 'f73c13e6c1af935ca286c03eb2c90671656a1a038f6751f87aadeff58ce2676e',
  'src/evidence/rag/experimental-draft-audit.test.ts': '471bcda45ee167caa6390b3454bbac6064e148dff5a0b37b1086536fbd507428',
  'src/evidence/rag/task-support-fixtures.ts': '2444d5530635fd4a7c1aecf51f71c82a589d96d8c41eb98c5c3420b9fdd89fac',
  'src/evidence/rag/task-support-audit.ts': '3298615c56ea8a6d0593bfd58dbe2b270a5916b3912ed12e370246609917f78b',
  'src/evidence/rag/disposition-support.ts': '4d86a5020425fc6cf12820930c49f5b00741f7fffd795c9651ef6c8c7b38c296',
  'src/evidence/rag/v26.ts': 'd4ac515bd3d63ed7d333b59b498425869064438e00cd161d74aaeed4d18c7529'
};
for (const [path, hash] of Object.entries(diagnosticHashes)) checked(path, hash);
const corpus = read('apps/evaluation/.local/clinical-rag-v8/corpus.json');
need(corpus.hash === 'af7e4a8c239c4b084525aba008d56ce833b3a08144cea6237319bf996aa30dbd', 'CORPUS_CHANGED');
const auditor = createExperimentalDraftAuditor(corpus), byCase = new Map(), executionRows = [];
for (const c of plan.cases) {
  const history = JSON.parse(checked(c.path, c.historyHash).toString());
  need(history.message === c.message && history.inputHash === sha256(c.message) &&
    history.graph.version === 'evidence-graph/v25' && history.graph.mode === 'gates-release' &&
    digest(c.hits) === history.graph.frozenPacketHash && equal(c.guidance, history.guidance), `HISTORY_BINDING:${c.id}`);
  need(equal(c.packets.full, c.packets.brief) && c.packets.full.patient === c.message &&
    c.commonInputHash === digest(c.packets.full) && arms.every(a => c.packetHashes[a] === digest(c.packets[a])), `PAIRED_PACKET_CHANGED:${c.id}`);
  // Preserve a missing context: do not manufacture expected queries from hits.
  // The helper rejects empty query accounting if such a case enters the witness audit.
  const evidence = { retrieval: history.graph.retrieval, expectedQueries: history.graph.context?.queries ?? [], selected: c.guidance, errors: [] };
  const pair = {};
  for (const arm of arms) {
    const start = read(`${dir}/${c.id}-${arm}-started.json`), result = read(`${dir}/${c.id}-${arm}-result.json`);
    const evaluation = read(`${dir}/${c.id}-${arm}-evaluation.json`), execution = result.execution;
    need(start.attempt === 'first_attempt' && start.noJudge === true && start.model === plan.model &&
      start.packetHash === c.packetHashes[arm] && start.commonInputHash === c.commonInputHash &&
      start.promptHash === plan.promptHashes[arm] && start.promptHash === sha256(plan.prompts[arm]) &&
      start.schemaHash === digest(plan.schemas[arm]), `START_IDENTITY:${c.id}:${arm}`);
    need(evaluation.id === c.id && evaluation.arm === arm && evaluation.firstAttempt === true &&
      evaluation.patientAdvicePublished === false && evaluation.clinicalApproval === false, `EVALUATION_IDENTITY:${c.id}:${arm}`);
    need(execution && (execution.failure === null || typeof execution.failure === 'string') &&
      (evaluation.failure === null || typeof evaluation.failure === 'string') &&
      'output' in execution && 'output' in evaluation, `OUTCOME_SHAPE:${c.id}:${arm}`);
    need(execution.failure === null || evaluation.failure !== null, `PROVIDER_FAILURE_ERASED:${c.id}:${arm}`);
    let rawResolvedBindingValid = null, artifactBindingError = null, boundCitationReferences = 0;
    if (execution.failure === null && evaluation.failure === null && execution.output !== null && evaluation.output !== null) {
      try {
        need(Array.isArray(execution.output.citations), 'RAW_CITATIONS_MISSING');
        const citations = execution.output.citations.map(citation => {
          const source = c.packets[arm].sources.find(s => s.id === citation.passageId);
          const span = source?.quoteSpans.find(q => q.id === citation.quoteId);
          const selected = c.hits.find(h => h.chunk.id === citation.passageId);
          need(span?.selectable === true && selected && span.text.length >= 10 &&
            selected.chunk.text.slice(span.start, span.end) === span.text && !('quote' in citation), 'RAW_QUOTE_ID_NOT_BOUND');
          const { quoteId, ...rest } = citation; return { ...rest, quote: span.text };
        });
        need(equal({ ...execution.output, citations }, evaluation.output), 'RAW_RESOLVED_OUTPUT_MISMATCH');
        rawResolvedBindingValid = true; boundCitationReferences = citations.length;
      } catch (error) { rawResolvedBindingValid = false; artifactBindingError = error.message; }
    }
    const executionClass = execution.failure !== null ? 'provider_failure' : evaluation.failure !== null ? 'evaluator_failure'
      : rawResolvedBindingValid === false ? 'invalid_artifact_binding'
      : execution.output === null || evaluation.output === null ? 'null_output' : 'resolved_draft';
    pair[arm] = { evidence, modelPacket: c.packets[arm], expectedPacketHash: c.packetHashes[arm],
      draft: { kind: 'unpublished_experimental_draft', raw: execution.output, resolved: evaluation.output,
        failure: execution.failure ?? evaluation.failure } };
    executionRows.push({ id: c.id, arm, executionClass, providerFailure: execution.failure, evaluationFailure: evaluation.failure,
      rawOutputPresent: execution.output !== null, resolvedOutputPresent: evaluation.output !== null,
      rawResolvedBindingValid, artifactBindingError, boundCitationReferences,
      patientAdvicePublished: false, clinicalApproval: false });
  }
  byCase.set(c.id, pair);
}
const rows = TASK_SUPPORT_FIXTURES.flatMap(f => f.witnesses.map(w => {
  const pair = byCase.get(f.caseId); need(pair, `MISSING_WITNESS_CASE:${f.caseId}`);
  return { caseId: f.caseId, ...auditor.compare(w, pair.full, pair.brief) };
}));
need(rows.length === 16 && new Set(rows.map(r => r.before.id)).size === 16, 'WITNESS_SET_CHANGED');
const primaryIds = ['copd-discharge-conditions', 'hand-diagnostic-task', 'ear-diagnostic-conditions', 'allergy-medication-safety'];
const primary = rows.filter(r => primaryIds.includes(r.before.id));
need(primary.length === 4 && primary.every(r => r.before.selectedOpportunity === true && r.after.selectedOpportunity === true) &&
  primary.reduce((n, r) => n + r.before.draftSpans.length, 0) === 5, 'PRIMARY_INPUT_OPPORTUNITIES_CHANGED');
const tally = values => Object.fromEntries([...new Set(values)].sort().map(v => [v, values.filter(x => x === v).length]));
const summarize = subset => ({ pairedWitnesses: subset.length, transitions: tally(subset.map(r => r.quotationTransition)),
  arms: Object.fromEntries([['baseline', 'before'], ['candidate', 'after']].map(([name, key]) => {
    const items = subset.map(r => r[key]), spans = items.flatMap(r => r.draftSpans ?? []).filter(s => s.selected);
    return [name, { plannedWitnesses: items.length, selectedWitnesses: items.filter(r => r.selectedOpportunity === true).length,
      draftStatuses: tally(items.map(r => r.draftStatus)), quotedWitnesses: items.filter(r => r.draftQuotedWitness === true).length,
      unquotedWitnesses: items.filter(r => r.draftQuotedWitness === false).length, unassessableWitnesses: items.filter(r => r.draftQuotedWitness === null).length,
      selectedSpans: spans.length, quotedSpans: spans.filter(s => s.quoted === true).length,
      unquotedSpans: spans.filter(s => s.quoted === false).length, unassessableSpans: spans.filter(s => s.quoted === null).length }];
  })) });
// Detect input mutation during the read-only snapshot rather than scoring a mix.
for (const [path, hash] of inputs) need(sha256(readFileSync(path)) === hash, `INPUT_CHANGED_DURING_AUDIT:${path}`);
console.log(JSON.stringify({ version: 'task-ownership-draft-citation-comparison/v1', planFingerprint: digest(plan),
  inputManifestHash: digest([...inputs].sort(([a], [b]) => a.localeCompare(b))), diagnosticHashes,
  scheduledCases: 50, scheduledExecutions: 100, completedArtifactPairs: executionRows.length,
  executionClasses: Object.fromEntries(arms.map(a => [plan.armLabels[a], tally(executionRows.filter(r => r.arm === a).map(r => r.executionClass))])),
  allAuthoredWitnesses: summarize(rows), primarySelectedPrerequisites: summarize(primary), rows, executionRows,
  patientAdvicePublished: false, clinicalApproval: false, generatedClaimSupport: 'not_assessed', patientEligibility: 'not_assessed', clinicalCorrectness: 'not_assessed',
  paidCalls: 0, runtimeChanged: false,
  interpretation: 'Exact authored-witness citation selection in unpublished experimental drafts. Retrospective development diagnostic; not semantic use, clinical support, patient eligibility or routing lift.'
}, null, 2));
NODE
```

## Final outcome accounting

| Measure | Baseline task ownership | Explicit task ownership |
| --- | --- | --- |
| Scheduled result/evaluation journals present | 50/50 | 50/50 |
| Resolved draft outputs | 50 | 50 |
| Provider/evaluator failure, null output, invalid binding | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| Primary prerequisite witnesses quoted | 0/4 | 0/4 |
| Primary prerequisite spans quoted | 0/5 | 0/5 |
| All selected authored witnesses quoted | 6/11 | 6/11 |
| All selected authored spans quoted | 6/12 | 6/12 |

Across all 16 paired witnesses: five were quoted by both drafts, four by neither, one quotation was gained and one lost. The gain was C22's descriptive sprain-symptom witness; the loss was C07's clinical-appearance description. Neither change concerns the primary prerequisite set or establishes a clinical benefit/harm. The five non-comparable roles are three absent selected witnesses (C07 discharge, C34 follow-through, C47 underlying-task) and two with no authored corpus witness (C22 fracture assessment, C38 ibuprofen product safety). They are not failed outputs or silently excluded clinical cases.

All 100 complete raw/resolved draft pairs and **190 citation references** passed the independent frozen quote-ID/text/offset/output binding check. The 32 case-arm witness rows were inspectable; none had an artifact error. All 64 plan-frozen file hashes, 50 original-history hashes, paired packets, scheduled artifact identities and the execution claim verified. This is integrity accounting, not source authority, claim support or clinical correctness.

Four non-witness histories (C21, C27, C40, C48) have null generated context. Their original packet context remains null and no expected queries were invented. Their result identities and raw/resolved citation bindings were still checked. Missing query accounting would prevent such a case from receiving witness-audit credit; these four cases are not in the authored witness set.

Reproduction identities:

- Plan fingerprint: `1d36bed4143ab184a1e09beceb7632bee4d29af92522112a34d93eed2f17995f`.
- Full input manifest hash: `88b0552b57f6d91472c0533a6abb9213037adb750e83e82bd57410b906d8f513`.
- Exact complete stdout SHA-256, including its final newline: `f0926ac630a80d876fabfde830bdd3dd8a4c550ad3c5d5184714a5b433404e01`.

The ownership paragraph did not increase quotation of these already-selected prerequisites. This does **not** establish that neither arm reasoned about them, since paraphrased or uncited use is outside this exact-span diagnostic. Do not present route improvement elsewhere as better citation use based on this result, or turn this quotation diagnostic into a clinical pass/fail metric. The historical V1 publication audit and live system remain unchanged. Replay cost: $0; no provider calls.
