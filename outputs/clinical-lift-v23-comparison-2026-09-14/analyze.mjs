/** Read-only analysis. No runtime imports, providers, writes, retries or regrading.
 * node outputs/clinical-lift-v23-comparison-2026-09-14/analyze.mjs --baseline-only
 * After BOTH cohorts finish: node .../analyze.mjs
 * Emits JSON to stdout; caller may retain a NEW report without replacing history.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BASELINE = join(ROOT, 'outputs/clinical-lift-v22-cohort-live-2026-09-14');
const CANDIDATE = join(ROOT, 'outputs/clinical-lift-v23-cohort-live-2026-09-14');
const REFERENCE = 'data/evaluation/physician-system-reference-v2.json';
const hash = value => createHash('sha256').update(value).digest('hex');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const equal = (a, b, code) => { if (!isDeepStrictEqual(a, b)) throw new Error(code); };
const sum = values => values.reduce((total, value) => total + value, 0);
const count = values => values.reduce((out, value) => { out[value] = (out[value] ?? 0) + 1; return out; }, {});
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export function statistics(values) {
  const known = values.filter(finite).sort((a, b) => a - b), n = known.length;
  return { n, missing: values.length - n, median: n ? n % 2 ? known[(n - 1) / 2] : (known[n / 2 - 1] + known[n / 2]) / 2 : null,
    p95NearestRank: n ? known[Math.ceil(.95 * n) - 1] : null, min: known[0] ?? null, max: known.at(-1) ?? null };
}
function signedStatistics(values) {
  const known = values.filter(Number.isFinite), offset = known.length ? Math.min(0, ...known) : 0;
  const result = statistics(values.map(value => Number.isFinite(value) ? value - offset : null));
  return { ...result, ...Object.fromEntries(['median', 'p95NearestRank', 'min', 'max'].map(key => [key, result[key] === null ? null : result[key] + offset])) };
}
export function route(answer) {
  if (answer?.disposition === 'ASYNC_PHYSICIAN') return answer.reviewPriority === 'priority' ? 'PRIORITY_ASYNC' : answer.reviewPriority === 'routine' ? 'STANDARD_ASYNC' : null;
  return ['SELF_CARE', 'SAME_DAY_IN_PERSON', 'EMERGENCY_NOW'].includes(answer?.disposition) ? answer.disposition : null;
}
export function coarseRoute(value) {
  if (value === 'SELF_CARE') return 'SELF_CARE';
  if (['PRIORITY_ASYNC', 'STANDARD_ASYNC'].includes(value)) return 'ASYNC_PHYSICIAN';
  if (['EMERGENCY_NOW', 'SAME_DAY_IN_PERSON'].includes(value)) return 'URGENT_ESCALATION';
  return null;
}
export function originalLabelDiagnostic(cases) {
  const rows = cases.map(c => {
    if (!['SELF_CARE', 'ASYNC_PHYSICIAN', 'URGENT_ESCALATION'].includes(c.originalSuppliedLabel)) throw new Error('INVALID_ORIGINAL_COARSE_LABEL');
    const accepted = c.referenceRoutes ? [...new Set(c.referenceRoutes.map(coarseRoute))] : null;
    if (accepted?.includes(null)) throw new Error('INVALID_REFERENCE_PROJECTION');
    const final = c.complete ? coarseRoute(c.finalRoute) : null;
    return { id: c.id, originalSuppliedLabel: c.originalSuppliedLabel, acceptedCoarseReference: accepted,
      originalLabelAgreement: accepted ? accepted.includes(c.originalSuppliedLabel) : null,
      candidateCoarseResult: final ?? 'not_completed', candidateCoarseAgreement: accepted ? Boolean(final && accepted.includes(final)) : null,
      outcome: c.outcome };
  });
  const scored = rows.filter(r => r.acceptedCoarseReference);
  return { scope: 'SUPPLEMENTAL / POST-HOC source-label audit against the physician-designated DEVELOPMENT reference. Not original-workflow patient outcomes or new clinical correctness.',
    projection: { SELF_CARE: ['SELF_CARE'], ASYNC_PHYSICIAN: ['PRIORITY_ASYNC', 'STANDARD_ASYNC'], URGENT_ESCALATION: ['SAME_DAY_IN_PERSON', 'EMERGENCY_NOW'] },
    sourceUrgencyLimitation: 'The source URGENT_ESCALATION label does not specify same-day versus emergency intent; none is inferred.',
    qualifiedExcludedIds: rows.filter(r => !r.acceptedCoarseReference).map(r => r.id), denominator: scored.length,
    originalLabelAgreement: scored.filter(r => r.originalLabelAgreement).length,
    originalLabelDifferences: scored.filter(r => !r.originalLabelAgreement).map(r => ({ id: r.id, originalSuppliedLabel: r.originalSuppliedLabel, acceptedCoarseReference: r.acceptedCoarseReference })),
    thisCohortCoarseAgreement: scored.filter(r => r.candidateCoarseAgreement).length,
    thisCohortIncomplete: scored.filter(r => r.candidateCoarseResult === 'not_completed').length,
    comparisonLimitation: 'Compare only three-bucket projections here; do not compare original coarse agreement with candidate five-route agreement. Withheld/unattempted responses remain not_completed.',
    rows };
}
export function receiptPhases(receipts) {
  const received = [], published = [], keys = new Set();
  for (const item of receipts) {
    const phase = item.phase ?? 'received';
    if (!['received', 'published'].includes(phase) || !item.event || !finite(item.receivedMs)) throw new Error('INVALID_RECEIPT');
    const key = `${phase}:${item.event.sequence}:${item.event.kind}`;
    if (keys.has(key)) throw new Error('DUPLICATE_RECEIPT_PHASE'); keys.add(key);
    if (phase === 'published') { if (!finite(item.publishedMs) || item.publishedMs < item.receivedMs) throw new Error('INVALID_PUBLICATION_TIMING'); published.push(item); }
    else received.push(item);
  }
  for (const item of published) {
    const original = received.find(r => r.event.sequence === item.event.sequence && r.event.kind === item.event.kind);
    if (!original || original.receivedMs !== item.receivedMs || !isDeepStrictEqual(original.event, item.event)) throw new Error('PUBLICATION_RECEIPT_BINDING');
  }
  return { received, published };
}
function tokenCost(run, plan) {
  if (!run) return null;
  let usd = 0;
  for (const agent of run.agents ?? []) {
    if (!agent.modelCalls) continue;
    const pricing = plan.pricing.models[agent.model];
    if (!pricing || !finite(agent.usage?.inputTokens) || !finite(agent.usage?.outputTokens)) return null;
    usd += (agent.usage.inputTokens * pricing.input + agent.usage.outputTokens * pricing.output) / 1e6;
  }
  return usd;
}
const approximately = (a, b, code) => { if (a === null || b === null ? a !== b : Math.abs(a - b) > 1e-7) throw new Error(code); };
export function loadCohort(directory, { allowTerminalStop = false } = {}) {
  const manifestPath = join(directory, 'manifest.json'), summaryPath = join(directory, 'summary.json');
  if (!existsSync(summaryPath)) throw new Error('COHORT_NOT_FINISHED_NO_SUMMARY');
  const plan = read(manifestPath), summary = read(summaryPath), { fingerprint, ...unsigned } = plan;
  equal(hash(JSON.stringify(unsigned)), fingerprint, 'MANIFEST_FINGERPRINT_MISMATCH');
  equal(summary.fingerprint, fingerprint, 'SUMMARY_MANIFEST_MISMATCH');
  if (plan.cases.length !== 50 || summary.planned !== 50 || new Set(plan.cases.map(c => c.id)).size !== 50) throw new Error('INVALID_PLANNED_DENOMINATOR');
  if (!allowTerminalStop && (summary.starts !== 50 || summary.results !== 50 || summary.unfinishedStarted || summary.unattempted.length || summary.stopReason)) throw new Error('COHORT_NOT_FULLY_COMPLETED');
  const referenceBytes = readFileSync(join(ROOT, REFERENCE));
  equal(hash(referenceBytes), plan.files[REFERENCE], 'PHYSICIAN_REFERENCE_DRIFT');
  const reference = JSON.parse(referenceBytes), files = readdirSync(directory);
  const resultFiles = files.filter(file => /^\d+-C\d+-result\.json$/.test(file)).sort();
  const starts = files.filter(file => /^\d+-C\d+-started\.json$/.test(file));
  equal(starts.length, summary.starts, 'START_COUNT_MISMATCH'); equal(resultFiles.length, summary.results, 'RESULT_COUNT_MISMATCH');
  equal(summary.unfinishedStarted, starts.length - resultFiles.length, 'UNFINISHED_COUNT_MISMATCH');
  const sourceHashes = { manifest: hash(readFileSync(manifestPath)), summary: hash(readFileSync(summaryPath)), reference: hash(referenceBytes), records: {} };
  const attempts = new Map();
  for (const file of resultFiles) {
    const artifactPath = join(directory, file), artifact = read(artifactPath), planned = plan.cases[artifact.index - 1];
    equal(planned?.id, artifact.id, 'ATTEMPT_ORDER_MISMATCH'); if (attempts.has(artifact.id)) throw new Error('DUPLICATE_ATTEMPT');
    sourceHashes.records[file] = hash(readFileSync(artifactPath));
    attempts.set(artifact.id, artifact);
  }
  const cases = plan.cases.map(planned => {
    equal(hash(planned.message), planned.inputHash, 'PLANNED_INPUT_HASH_MISMATCH');
    const ref = reference.cases.find(c => c.id === planned.id);
    if (!ref || ref.message !== planned.message || ref.inputHash !== planned.inputHash) throw new Error('REFERENCE_INPUT_MISMATCH');
    const artifact = attempts.get(planned.id), prefix = `${String(plan.cases.indexOf(planned) + 1).padStart(2, '0')}-${planned.id}`;
    const startPath = join(directory, `${prefix}-started.json`), started = existsSync(startPath);
    if (!artifact) return { id: planned.id, inputHash: planned.inputHash, originalSuppliedLabel: ref.originalSuppliedLabel, referenceRoutes: ref.reference.acceptedRoutes, outcome: started ? 'unfinished' : 'unattempted', eligible: false, complete: false };
    const start = read(startPath); equal(start.inputHash, planned.inputHash, 'START_INPUT_HASH_MISMATCH');
    const run = artifact.run, recordedPair = summary.pairs.find(p => p.id === planned.id), recordedScore = summary.cohort.cases.find(c => c.id === planned.id)?.firstAttempt;
    const identityFailures = [...artifact.identityFailures];
    if (run) {
      if (run.inputHash !== planned.inputHash || run.message !== planned.message || hash(run.message) !== run.inputHash) identityFailures.push('ANALYSIS_INPUT_IDENTITY');
      if (run.promptHash !== plan.promptHash || run.graph?.version !== plan.graphVersion) identityFailures.push('ANALYSIS_VERSION_IDENTITY');
      const rawPath = join(directory, `${prefix}-run.json`);
      if (!existsSync(rawPath)) throw new Error('MISSING_RAW_RUN');
      equal(read(rawPath), run, 'RAW_RUN_RESULT_MISMATCH'); sourceHashes.records[`${prefix}-run.json`] = hash(readFileSync(rawPath));
    }
    const eligible = Boolean(run && !artifact.failure && !identityFailures.length), complete = eligible && run.status === 'complete';
    const first = run?.agents?.find(a => a.role === 'disposition' && a.modelCalls > 0);
    const firstHash = first?.output ? hash(JSON.stringify(first.output)) : null;
    // Full schema admission is read from the immutable study diagnostic and
    // bound to the exact first output. We do not run a changed schema on v22.
    if (run) equal(firstHash, recordedPair.firstProviderDraftHash, 'FIRST_DRAFT_HASH_MISMATCH');
    const firstValid = Boolean(first && first.failure === null && recordedPair?.firstProviderDraftSchemaValid);
    if (run) equal(firstValid, recordedPair.firstProviderDraftValid, 'FIRST_DRAFT_ADMISSION_MISMATCH');
    const firstRoute = firstValid ? route(first.output) : null, finalRoute = complete ? route(run.answer) : null;
    if (firstValid && !firstRoute || complete && !finalRoute) throw new Error('INVALID_OPERATIONAL_ROUTE');
    if (run) equal(firstRoute, recordedPair.firstRoute, 'FIRST_ROUTE_MISMATCH');
    const routes = ref.reference.acceptedRoutes, firstAgreement = routes && firstRoute ? routes.includes(firstRoute) : null;
    const finalAgreement = routes ? Boolean(finalRoute && routes.includes(finalRoute)) : null;
    if (eligible) equal(finalAgreement, recordedPair.finalReferenceAgreement, 'FINAL_AGREEMENT_MISMATCH');
    if (recordedScore && eligible) equal(recordedScore.runId, run.runId, 'MODEL_REVIEW_RUN_MISMATCH');
    const phases = receiptPhases(artifact.receipts), events = run?.responseEvents ?? [], action = events.find(e => e.kind === 'action'), emergency = events.find(e => e.kind === 'action' && e.notice.disposition === 'EMERGENCY_NOW');
    const receipt = predicate => phases.received.find(r => predicate(r.event))?.receivedMs ?? null;
    const replyPublication = phases.published.find(r => r.event.kind === 'patient_reply');
    const cost = tokenCost(run, plan); approximately(cost, artifact.estimatedUSD, 'COST_ESTIMATE_MISMATCH');
    const accounted = cost === null ? plan.reservation.perRunUSD : cost * plan.reservation.cacheMultiplier + plan.reservation.embeddingReserveUSD;
    approximately(accounted, artifact.accountedUSD, 'ACCOUNTED_COST_MISMATCH');
    const rawFirstDraft = first?.output ?? null;
    return { id: planned.id, inputHash: planned.inputHash, runId: run?.runId ?? null, originalSuppliedLabel: ref.originalSuppliedLabel, referenceRoutes: routes, eligible, complete,
      outcome: artifact.failure ? 'transport_or_decoder_failure' : identityFailures.length ? 'identity_failure' : run?.status ?? 'no_run',
      failure: artifact.failure ?? run?.failure ?? null, identityFailures, firstProviderDraftHash: firstHash,
      firstProviderAttemptFailure: first?.failure ?? null, recordedFirstDraftSchemaValid: recordedPair?.firstProviderDraftSchemaValid ?? null,
      firstRoute, finalRoute, displayedRoute: route(run?.answer), preservedFloor: run?.safetyFloor?.disposition ?? null,
      firstAgreement, finalAgreement, firstReferenceDeviationCorrected: eligible && firstAgreement === false && finalAgreement === true,
      referenceDeviationIntroduced: eligible && firstAgreement === true && finalRoute !== null && finalAgreement === false,
      referenceMatchingDraftWithheld: eligible && firstAgreement === true && finalRoute === null,
      modelReview: eligible ? recordedScore?.modelRoutingReview ?? null : null,
      emergencyReference: routes?.length === 1 && routes[0] === 'EMERGENCY_NOW',
      action: action ? { route: action.notice.disposition, serverMs: action.elapsedMs ?? null } : null,
      earlyEmergencyServerMs: emergency?.elapsedMs ?? null, earlyEmergencyEmitted: Boolean(emergency),
      firstActionReceiptMs: receipt(e => e.kind === 'action'), firstEmergencyReceiptMs: receipt(e => e.kind === 'action' && e.notice.disposition === 'EMERGENCY_NOW'),
      firstReplyReceiptMs: receipt(e => e.kind === 'patient_reply'), firstQuestionReceiptMs: receipt(e => e.kind === 'intake_question'),
      replyPublicationMs: replyPublication?.publishedMs ?? null,
      replyValidationDelayMs: replyPublication ? replyPublication.publishedMs - replyPublication.receivedMs : null,
      httpTerminalMs: artifact.durationMs, serverTerminalMs: run?.durationMs ?? null, calls: run?.modelCalls ?? null,
      estimatedUSD: cost, accountedUSD: accounted, unknownUsage: cost === null,
      agentFailures: (run?.agents ?? []).filter(a => a.failure).map(a => ({ role: a.role, code: a.failure })),
      repair: run?.graph?.repair ?? null,
      fieldsChangedFirstToPublished: complete && rawFirstDraft ? ['disposition', 'reviewPriority', 'workType', 'patientMessage', 'reason', 'differential', 'redFlags', 'questions', 'evidenceLimitations'].filter(key => !isDeepStrictEqual(rawFirstDraft[key], run.answer[key])) : [],
      citationSetChangedFirstToPublished: complete && rawFirstDraft ? !isDeepStrictEqual(rawFirstDraft.citations, run.graph?.citations) : null,
      clinicalCorrectness: 'not_independently_adjudicated',
    };
  });
  const attempted = cases.filter(c => c.runId || !['unfinished', 'unattempted'].includes(c.outcome));
  const valid = attempted.filter(c => c.eligible), completed = cases.filter(c => c.complete), scoreable = cases.filter(c => c.referenceRoutes), emergencies = cases.filter(c => c.emergencyReference);
  equal(completed.length, summary.complete, 'SUMMARY_COMPLETION_MISMATCH');
  const knownCost = sum(attempted.map(c => c.estimatedUSD ?? 0)), accounted = sum(attempted.map(c => c.accountedUSD ?? 0)) + summary.unfinishedStarted * plan.reservation.perRunUSD;
  approximately(knownCost, summary.knownEstimatedUSD, 'SUMMARY_COST_MISMATCH'); approximately(accounted, summary.accountedUSD, 'SUMMARY_ACCOUNTED_MISMATCH');
  const aggregates = { planned: 50, started: summary.starts, terminalRecords: attempted.length, unfinished: summary.unfinishedStarted, unattempted: cases.filter(c => c.outcome === 'unattempted').length,
    outcomes: count(cases.map(c => c.outcome)), complete: completed.length, withheld: cases.filter(c => c.eligible && c.outcome !== 'complete').length,
    transportOrDecoderFailures: cases.filter(c => c.outcome === 'transport_or_decoder_failure').length, identityFailures: cases.filter(c => c.identityFailures?.length).length,
    exactDevelopmentAgreement: { numerator: scoreable.filter(c => c.finalAgreement).length, denominator: scoreable.length, qualifiedIds: cases.filter(c => !c.referenceRoutes).map(c => c.id) },
    firstDraftDevelopmentAgreement: { numerator: valid.filter(c => c.firstAgreement).length, denominator: scoreable.length },
    modelReviewStatuses: count(cases.map(c => c.modelReview?.status ?? 'not_assessed')),
    modelSupportedAlternatives: cases.filter(c => c.modelReview?.assessment === 'model_supported_alternative').map(c => c.id),
    routeProcess: { referenceDeviationCorrected: cases.filter(c => c.firstReferenceDeviationCorrected).map(c => c.id), introduced: cases.filter(c => c.referenceDeviationIntroduced).map(c => c.id), matchingDraftWithheld: cases.filter(c => c.referenceMatchingDraftWithheld).map(c => c.id) },
    emergencyCoverage: { denominator: emergencies.length, earlyEmitted: emergencies.filter(c => c.earlyEmergencyEmitted).length,
      noEarlyIds: emergencies.filter(c => !c.earlyEmergencyEmitted).map(c => c.id), completedEmergency: emergencies.filter(c => c.finalRoute === 'EMERGENCY_NOW').length,
      noEmergencyActionOrDisplayedEmergencyIds: emergencies.filter(c => !c.earlyEmergencyEmitted && c.displayedRoute !== 'EMERGENCY_NOW').map(c => c.id),
      earlyReceiptMs: statistics(emergencies.map(c => c.firstEmergencyReceiptMs)), earlyServerMs: statistics(emergencies.map(c => c.earlyEmergencyServerMs)) },
    timingMs: { httpAllTerminal: statistics(attempted.map(c => c.httpTerminalMs)), httpCompleteOnly: statistics(completed.map(c => c.httpTerminalMs)),
      actionReceipt: statistics(cases.map(c => c.firstActionReceiptMs)), replyReceipt: statistics(cases.map(c => c.firstReplyReceiptMs)),
      questionReceipt: statistics(cases.map(c => c.firstQuestionReceiptMs)), replyPublication: statistics(cases.map(c => c.replyPublicationMs)),
      replyValidationDelay: statistics(cases.map(c => c.replyValidationDelayMs)), serverAllTerminal: statistics(attempted.map(c => c.serverTerminalMs)) },
    calls: sum(attempted.map(c => c.calls ?? 0)), callsHistogram: count(attempted.map(c => c.calls ?? 'unknown')), unknownCallRuns: attempted.filter(c => c.calls === null).length,
    repairStatuses: count(cases.map(c => c.repair?.status ?? 'none')), agentFailureCodes: count(cases.flatMap(c => (c.agentFailures ?? []).map(a => a.code))),
    estimatedUSD: knownCost, accountedUSD: accounted, unknownUsageAttempts: attempted.filter(c => c.unknownUsage).length,
  };
  equal(aggregates.exactDevelopmentAgreement.numerator, summary.cohort.firstAttemptCompleteAgreements, 'SUMMARY_AGREEMENT_MISMATCH');
  return { directory, fingerprint, graphVersion: plan.graphVersion, promptHash: plan.promptHash, corpusHash: plan.corpusHash, providerSettings: plan.providerSettings,
    config: plan.config, sourceHashes, stopReason: summary.stopReason, all50AttemptedAndAccounted: summary.starts === 50 && summary.results === 50 && !summary.unfinishedStarted,
    supplementalPostHocOriginalLabelDiagnostic: originalLabelDiagnostic(cases),
    modelSupportScope: 'Recorded version-specific model review, not regraded or newly physician-adjudicated.', aggregates, cases };
}
export function compareCohorts(baseline, candidate) {
  equal(baseline.cases.length, candidate.cases.length, 'PAIR_COUNT_MISMATCH');
  const pairs = baseline.cases.map(before => {
    const after = candidate.cases.find(c => c.id === before.id);
    if (!after || after.inputHash !== before.inputHash) throw new Error('CROSS_COHORT_INPUT_MISMATCH');
    equal(before.referenceRoutes, after.referenceRoutes, 'REFERENCE_ROUTE_DRIFT');
    equal(before.originalSuppliedLabel, after.originalSuppliedLabel, 'ORIGINAL_LABEL_DRIFT');
    const delta = key => finite(before[key]) && finite(after[key]) ? after[key] - before[key] : null;
    return { id: before.id, inputHash: before.inputHash, baselineRunId: before.runId, candidateRunId: after.runId,
      transition: `${before.complete ? 'complete' : before.outcome}->${after.complete ? 'complete' : after.outcome}`,
      bothComplete: before.complete && after.complete, httpTerminalDeltaMs: delta('httpTerminalMs'), firstActionReceiptDeltaMs: delta('firstActionReceiptMs'),
      firstEmergencyReceiptDeltaMs: delta('firstEmergencyReceiptMs'), firstReplyReceiptDeltaMs: delta('firstReplyReceiptMs'),
      baselineFinalRoute: before.finalRoute, candidateFinalRoute: after.finalRoute, baselineReferenceAgreement: before.finalAgreement, candidateReferenceAgreement: after.finalAgreement,
      referenceMatchGained: before.finalAgreement === false && after.finalAgreement === true,
      referenceMatchLost: before.finalAgreement === true && after.finalAgreement === false,
      costDeltaUSD: delta('estimatedUSD'), clinicalCorrectness: 'not_independently_adjudicated' };
  });
  return { protocol: 'independent-whole-workflow-cohort-comparison/v1', baseline, candidate, pairs,
    paired: { transitions: count(pairs.map(p => p.transition)), httpAllRecordedTerminalDeltaMs: signedStatistics(pairs.map(p => p.httpTerminalDeltaMs)),
      httpBothCompleteDeltaMs: signedStatistics(pairs.filter(p => p.bothComplete).map(p => p.httpTerminalDeltaMs)),
      earlyActionReceiptBothPresentDeltaMs: signedStatistics(pairs.map(p => p.firstActionReceiptDeltaMs)),
      earlyEmergencyReceiptBothPresentDeltaMs: signedStatistics(pairs.map(p => p.firstEmergencyReceiptDeltaMs)),
      replyReceiptBothPresentDeltaMs: signedStatistics(pairs.map(p => p.firstReplyReceiptDeltaMs)),
      referenceMatchesGained: pairs.filter(p => p.referenceMatchGained).map(p => p.id), referenceMatchesLost: pairs.filter(p => p.referenceMatchLost).map(p => p.id) },
    caveats: [
      'Sequential whole-workflow development comparison; multiple source, policy, admission and client changes prevent isolated feature causality.',
      'The physician-reviewed incumbent reference is not physician validation of either new candidate. Forty-nine scored targets plus qualified C25 remain unchanged.',
      'Model-supported alternatives are separate from exact reference agreement and are not independently adjudicated defensible alternatives.',
      'First-to-final route changes and field edits do not measure material clinical defects corrected or introduced; exact-text adjudication remains necessary.',
      'Timing is server elapsed / HTTP decoder receipt, not browser paint or patient action. Missing timing is not zero.',
      'v23 publication follows final validation; v22 publication timing was not recorded. Compare receipt across versions and disclose this change.',
      'All planned cases remain in denominators. Complete-only and both-complete timings are conditional summaries, not the overall service outcome.',
      'Recorded model-support definitions became stricter in v23. Raw online acceptance alone does not establish release or clinical correctness.',
      'Estimates are not invoices; accounted cost includes cache contingency, embedding allowance and unknown-usage reservations.',
      'The separately labeled post-hoc original-label audit uses only three-bucket projections. A source URGENT_ESCALATION label has no inferred emergency-versus-same-day intent.',
    ] };
}
export function main(args) {
  if (args.some(a => !['--baseline-only', '--allow-terminal-stop'].includes(a))) throw new Error('UNKNOWN_ARGUMENT');
  const options = { allowTerminalStop: args.includes('--allow-terminal-stop') };
  const baseline = loadCohort(BASELINE, options);
  return args.includes('--baseline-only') ? { mode: 'baseline-only-no-candidate-score', baseline } : compareCohorts(baseline, loadCohort(CANDIDATE, options));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(main(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
